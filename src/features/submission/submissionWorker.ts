/**
 * submissionWorker.ts — The Single Active Owner of Submission Dispatch
 *
 * This is the ONLY module that:
 *   - dispatches create/update requests
 *   - holds the global in-process mutex
 *   - schedules retry backoff
 *   - handles online/visibility/startup resumption
 *   - uses idempotency keys
 *   - processes server acknowledgements
 *   - transitions queue state
 *   - invalidates read models after confirmation
 *
 * All paths (form submit, online event, visibility change, app hydration)
 * call submissionWorker.process() and obey the same global mutex.
 *
 * No page-level setInterval dispatches submission requests.
 * No concurrent dispatch of the same item.
 */

import {
  getDispatchQueue,
  markSubmitted,
  markRetryable,
  markActionRequired,
  repairRemoteIdentity,
  migrateLegacyItems,
} from './submissionQueueRepository';
import {
  gatewayCreate,
  gatewayUpdate,
  lookupByClientSubmissionId,
} from './submissionGateway';
import { mapToCreatePayload, mapAcknowledgementToLocal } from './submissionMapper';
import { submissionEvents } from './submissionEvents';
import {
  getSubmissionOperation,
  assertValidRemoteSubmissionId,
  classifyHttpError,
  type CreateIdempotencyKey,
} from './submissionTypes';
import { logDiagnostic, generateCorrelationId } from './submissionDiagnostics';
import type { SyncQueueItem } from '@/types/domain';

// ---------------------------------------------------------------------------
// Global Mutex
// ---------------------------------------------------------------------------

let _isRunning = false;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

function acquireLock(): boolean {
  if (_isRunning) return false;
  _isRunning = true;
  return true;
}

function releaseLock(): void {
  _isRunning = false;
}

export function isWorkerRunning(): boolean {
  return _isRunning;
}

// ---------------------------------------------------------------------------
// Main Process Entry Point
// ---------------------------------------------------------------------------

/**
 * Processes all pending queue items under the global mutex.
 * Safe to call from any trigger (form submit, online event, etc.).
 * Returns without dispatching if already running or offline.
 */
export async function processQueue(trigger = 'manual'): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return; // Offline — don't attempt
  }

  if (!acquireLock()) {
    return; // Already running — mutex held
  }

  const startedAt = Date.now();

  try {
    // Migrate legacy items before first dispatch
    await migrateLegacyItems();

    const items = await getDispatchQueue();
    if (items.length === 0) {
      return;
    }

    for (const item of items) {
      if (!item.id) continue;
      await processItem(item, trigger);
    }
  } catch (err) {
    console.error('[SubmissionWorker] Unexpected error in processQueue:', err);
  } finally {
    releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Process a Single Queue Item
// ---------------------------------------------------------------------------

async function processItem(item: SyncQueueItem, trigger: string): Promise<void> {
  const correlationId = generateCorrelationId();
  const payload = item.payload as any;
  const clientSubmissionId = payload?.clientSubmissionId || payload?.uuid || item.submissionUuid;
  const submissionUuid = item.submissionUuid;
  const startMs = Date.now();

  // Determine operation using the canonical invariant
  const operation = getSubmissionOperation({
    remoteSubmissionId: payload?.remoteSubmissionId,
    version: item.expectedVersion ?? payload?.version,
  });

  // Emit "sending" event
  submissionEvents.emit('submission:sending', {
    clientSubmissionId,
    correlationId,
    timestamp: new Date().toISOString(),
    retryCount: item.retryCount,
  });

  if (operation === 'CREATE') {
    await handleCreate(item, clientSubmissionId, submissionUuid, correlationId, startMs);
  } else {
    await handleUpdate(item, clientSubmissionId, submissionUuid, correlationId, startMs);
  }
}

// ---------------------------------------------------------------------------
// CREATE Handler
// ---------------------------------------------------------------------------

async function handleCreate(
  item: SyncQueueItem,
  clientSubmissionId: string,
  submissionUuid: string,
  correlationId: string,
  startMs: number
): Promise<void> {
  const payload = item.payload as any;
  const createIdempotencyKey: CreateIdempotencyKey =
    item.idempotencyKey || `create-${clientSubmissionId}`;

  const mappedPayload = mapToCreatePayload(payload, createIdempotencyKey);

  const result = await gatewayCreate({
    payload: mappedPayload,
    createIdempotencyKey,
    clientSubmissionId,
    correlationId,
  });

  const elapsed = Date.now() - startMs;

  if (result.ok) {
    const ack = result.data;

    await markSubmitted(item.id!, submissionUuid, ack);

    submissionEvents.emit('submission:success', {
      clientSubmissionId,
      remoteSubmissionId: ack.remoteSubmissionId,
      version: ack.version,
      requestId: ack.requestId,
      correlationId,
      timestamp: new Date().toISOString(),
    });

    logDiagnostic({
      timestamp: new Date().toISOString(),
      operation: 'CREATE',
      clientSubmissionId,
      correlationId,
      remoteSubmissionId: ack.remoteSubmissionId,
      stateBefore: String(item.status),
      stateAfter: 'synced',
      statusCode: 201,
      adapterAction: 'create',
      retryCount: item.retryCount,
      elapsedMs: elapsed,
    });

    return;
  }

  // Failure handling
  const error = result.error;

  logDiagnostic({
    timestamp: new Date().toISOString(),
    operation: 'CREATE',
    clientSubmissionId,
    correlationId,
    stateBefore: String(item.status),
    stateAfter: error.isTerminal ? 'failed_final' : 'failed_retryable',
    statusCode: error.statusCode,
    errorCategory: error.category,
    retryCount: item.retryCount,
    elapsedMs: elapsed,
  });

  if (error.isTerminal) {
    await markActionRequired(item.id!, submissionUuid, error.message, error.statusCode);
    submissionEvents.emit('submission:failed', {
      clientSubmissionId,
      correlationId,
      errorCategory: error.category,
      message: error.message,
      timestamp: new Date().toISOString(),
      retryCount: item.retryCount,
    });
  } else {
    const { willRetry, nextRetryMs } = await markRetryable(
      item.id!,
      submissionUuid,
      error.message,
      error.statusCode
    );

    submissionEvents.emit('submission:retrying', {
      clientSubmissionId,
      correlationId,
      errorCategory: error.category,
      message: error.message,
      timestamp: new Date().toISOString(),
      retryCount: item.retryCount,
    });

    if (willRetry) {
      scheduleRetry(nextRetryMs);
    }
  }
}

// ---------------------------------------------------------------------------
// UPDATE Handler
// ---------------------------------------------------------------------------

async function handleUpdate(
  item: SyncQueueItem,
  clientSubmissionId: string,
  submissionUuid: string,
  correlationId: string,
  startMs: number
): Promise<void> {
  const payload = item.payload as any;
  const remoteSubmissionId = payload?.remoteSubmissionId;
  const expectedVersion = item.expectedVersion ?? payload?.version ?? payload?.expectedVersion;

  // Guard: must have a valid remote ID — if not, fall back to CREATE
  try {
    assertValidRemoteSubmissionId(remoteSubmissionId, 'handleUpdate');
  } catch (err: any) {
    // Identity invariant violation — treat as CREATE
    console.warn('[SubmissionWorker] UPDATE has no valid remoteSubmissionId, reclassifying as CREATE:', err.message);
    // Update queue item to CREATE and retry
    const { db } = await import('@/lib/db/dexieDb');
    await db.syncQueue.update(item.id!, {
      operationType: 'CREATE',
      status: 'queued',
      nextRetryTimestamp: Date.now(),
      errorMessage: null,
    });
    const updatedItem = { ...item, operationType: 'CREATE' as const };
    return handleCreate(updatedItem, clientSubmissionId, submissionUuid, correlationId, startMs);
  }

  const changes = payload.changes ?? {};
  const result = await gatewayUpdate({
    remoteSubmissionId,
    expectedVersion: Number(expectedVersion),
    changes,
    clientSubmissionId,
    correlationId,
  });

  const elapsed = Date.now() - startMs;

  if (result.ok) {
    const ack = result.data;
    await markSubmitted(item.id!, submissionUuid, ack);

    submissionEvents.emit('submission:success', {
      clientSubmissionId,
      remoteSubmissionId: ack.remoteSubmissionId,
      version: ack.version,
      requestId: ack.requestId,
      correlationId,
      timestamp: new Date().toISOString(),
    });

    logDiagnostic({
      timestamp: new Date().toISOString(),
      operation: 'UPDATE',
      clientSubmissionId,
      correlationId,
      remoteSubmissionId: ack.remoteSubmissionId,
      stateBefore: String(item.status),
      stateAfter: 'synced',
      statusCode: 200,
      adapterAction: 'update',
      retryCount: item.retryCount,
      elapsedMs: elapsed,
    });

    return;
  }

  const error = result.error;

  // Special handling for 404 UPDATE — Phase 4 reconciliation
  if (error.category === 'not_found') {
    // Attempt one bounded reconciliation lookup
    const found = await lookupByClientSubmissionId(clientSubmissionId, correlationId);
    if (found) {
      // Repair identity and schedule one retry as UPDATE
      await repairRemoteIdentity(
        item.id!,
        submissionUuid,
        found.remoteSubmissionId,
        found.version
      );
      submissionEvents.emit('submission:retrying', {
        clientSubmissionId,
        correlationId,
        message: 'Record found via reconciliation. Retrying update.',
        timestamp: new Date().toISOString(),
        retryCount: item.retryCount,
      });
      scheduleRetry(500); // Retry quickly after repair
    } else {
      // Record not found remotely — move to ACTION_REQUIRED
      await markActionRequired(
        item.id!,
        submissionUuid,
        'This saved record is not linked to the central register. Please confirm whether it should be submitted as a new record.',
        404
      );
      submissionEvents.emit('submission:failed', {
        clientSubmissionId,
        correlationId,
        errorCategory: 'not_found',
        message: 'Record not found on central server.',
        timestamp: new Date().toISOString(),
        retryCount: item.retryCount,
      });
    }
    return;
  }

  // Conflict: move to ACTION_REQUIRED
  if (error.category === 'conflict') {
    await markActionRequired(item.id!, submissionUuid, error.message, 409);
    submissionEvents.emit('submission:conflict', {
      clientSubmissionId,
      remoteSubmissionId,
      correlationId,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  logDiagnostic({
    timestamp: new Date().toISOString(),
    operation: 'UPDATE',
    clientSubmissionId,
    correlationId,
    stateBefore: String(item.status),
    stateAfter: error.isTerminal ? 'failed_final' : 'failed_retryable',
    statusCode: error.statusCode,
    errorCategory: error.category,
    retryCount: item.retryCount,
    elapsedMs: elapsed,
  });

  if (error.isTerminal) {
    await markActionRequired(item.id!, submissionUuid, error.message, error.statusCode);
    submissionEvents.emit('submission:failed', {
      clientSubmissionId,
      correlationId,
      errorCategory: error.category,
      message: error.message,
      timestamp: new Date().toISOString(),
      retryCount: item.retryCount,
    });
  } else {
    const { willRetry, nextRetryMs } = await markRetryable(
      item.id!,
      submissionUuid,
      error.message,
      error.statusCode
    );
    if (willRetry) {
      scheduleRetry(nextRetryMs);
    }
  }
}

// ---------------------------------------------------------------------------
// Retry Scheduler — One Timer Only
// ---------------------------------------------------------------------------

/**
 * Schedules one bounded retry via setTimeout.
 * Any previous pending retry timer is cleared before setting a new one.
 * This ensures exactly one backoff timer per application runtime.
 */
function scheduleRetry(delayMs: number): void {
  if (_retryTimer !== null) {
    clearTimeout(_retryTimer);
  }
  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    await processQueue('retry_timer');
  }, delayMs);
}

// ---------------------------------------------------------------------------
// Browser Event Listeners — registered once
// ---------------------------------------------------------------------------

let _listenersRegistered = false;

/**
 * Registers online/visibility listeners. Must be called once in the app root.
 * All triggers route through processQueue() and obey the global mutex.
 */
export function registerSubmissionWorkerListeners(): () => void {
  if (_listenersRegistered) return () => {};
  _listenersRegistered = true;

  const handleOnline = () => {
    processQueue('online_event').catch(console.error);
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      processQueue('visibility_visible').catch(console.error);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  return () => {
    _listenersRegistered = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    if (_retryTimer !== null) {
      clearTimeout(_retryTimer);
      _retryTimer = null;
    }
  };
}

// ---------------------------------------------------------------------------
// App Hydration Trigger
// ---------------------------------------------------------------------------

/**
 * Called once on app hydration to resume any pending queue items.
 */
export async function resumeOnHydration(): Promise<void> {
  await processQueue('app_init');
}
