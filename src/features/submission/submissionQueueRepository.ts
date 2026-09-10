/**
 * submissionQueueRepository.ts — The Only Owner of IndexedDB Queue Reads/Writes
 *
 * Responsibilities:
 *   - Atomic snapshot persistence with identity fields
 *   - Status persistence and transition recording
 *   - Retry metadata persistence
 *   - Legacy queue migration (schemaVersion < 2 -> v2)
 *
 * This module wraps the existing syncQueueRepository functions, adding
 * the canonical identity contract enforcement and the new UserFacingSubmissionState
 * persistence. The underlying Dexie store is unchanged.
 */

import { db } from '@/lib/db/dexieDb';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';
import {
  assertValidRemoteSubmissionId,
  type ServerAcknowledgement,
  type SubmissionErrorCategory,
} from './submissionTypes';

// ---------------------------------------------------------------------------
// Enqueue a new CREATE operation (snapshot + identity)
// ---------------------------------------------------------------------------

export interface EnqueueCreateOptions {
  clientSubmissionId: string;
  createIdempotencyKey: string;
  snapshot: AssessmentRecord;
}

/**
 * Atomically persists a final assessment snapshot and enqueues a CREATE
 * operation in one Dexie transaction.
 * Returns the IndexedDB queue item ID.
 */
export async function enqueueCreate(options: EnqueueCreateOptions): Promise<number> {
  const { clientSubmissionId, createIdempotencyKey, snapshot } = options;
  const now = new Date().toISOString();

  return await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    // 1. Persist/update the draft snapshot
    if (snapshot.id) {
      await db.drafts.update(snapshot.id, {
        ...snapshot,
        clientSubmissionId,
        syncStatus: 'queued',
        updatedAt: now,
      });
    } else {
      await db.drafts.put({
        ...snapshot,
        clientSubmissionId,
        syncStatus: 'queued',
        updatedAt: now,
        createdAt: snapshot.createdAt || now,
      });
    }

    // 2. Check for existing queue item for this clientSubmissionId to prevent duplicates
    const existing = await db.syncQueue
      .filter((item) => {
        const p = item.payload as any;
        return (
          (p?.clientSubmissionId === clientSubmissionId || item.submissionUuid === snapshot.uuid) &&
          item.status !== 'synced' &&
          item.status !== 'SYNCED'
        );
      })
      .first();

    if (existing?.id) {
      // Already queued — idempotent, return existing ID
      return existing.id;
    }

    // 3. Enqueue CREATE
    return await db.syncQueue.add({
      schemaVersion: 2,
      submissionUuid: snapshot.uuid,
      idempotencyKey: createIdempotencyKey,
      operationType: 'CREATE',
      payload: { ...snapshot, clientSubmissionId },
      status: 'queued',
      expectedVersion: 1,
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: Date.now(),
      errorMessage: null,
      conflictMetadata: null,
    });
  });
}

// ---------------------------------------------------------------------------
// Enqueue an UPDATE operation (canonical identity verified)
// ---------------------------------------------------------------------------

export interface EnqueueUpdateOptions {
  clientSubmissionId: string;
  submissionUuid: string;
  remoteSubmissionId: string;
  expectedVersion: number;
  changes?: Record<string, any>;
  snapshot: AssessmentRecord;
}

/**
 * Atomically persists an assessment update and enqueues an UPDATE operation
 * in one Dexie transaction.
 *
 * Invariant: remoteSubmissionId MUST be a confirmed server-assigned UUID v4.
 * Never allows ART IDs, local IDs, or unconfirmed client IDs in UPDATE items.
 */
export async function enqueueUpdate(options: EnqueueUpdateOptions): Promise<number> {
  const { clientSubmissionId, submissionUuid, remoteSubmissionId, expectedVersion, changes, snapshot } = options;
  assertValidRemoteSubmissionId(remoteSubmissionId, 'enqueueUpdate');
  const now = new Date().toISOString();
  const idempotencyKey = `update-${remoteSubmissionId}-v${expectedVersion}-${Date.now()}`;

  return await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    if (snapshot.id) {
      await db.drafts.update(snapshot.id, {
        ...snapshot,
        remoteSubmissionId,
        version: expectedVersion,
        syncStatus: 'queued',
        updatedAt: now,
      });
    }

    const payload = {
      ...snapshot,
      clientSubmissionId,
      remoteSubmissionId,
      version: expectedVersion,
      changes: changes || {},
    };

    return await db.syncQueue.add({
      schemaVersion: 2,
      submissionUuid,
      idempotencyKey,
      operationType: 'UPDATE',
      payload,
      status: 'queued',
      expectedVersion,
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: Date.now(),
      errorMessage: null,
      conflictMetadata: null,
    });
  });
}

// ---------------------------------------------------------------------------
// Mark a queue item as SUBMITTED after server acknowledgement
// ---------------------------------------------------------------------------

/**
 * Atomically persists the server acknowledgement (remoteSubmissionId, version,
 * requestId) and transitions the queue item and draft to SYNCED/SUBMITTED.
 */
export async function markSubmitted(
  queueId: number,
  submissionUuid: string,
  ack: ServerAcknowledgement
): Promise<void> {
  const now = ack.updatedAt || ack.submittedAt || ack.acceptedAt || new Date().toISOString();

  await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    await db.syncQueue.update(queueId, {
      status: 'synced',
      errorMessage: null,
      nextRetryTimestamp: null,
      requestId: ack.requestId || null,
    });

    const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
    if (draft?.id) {
      await db.drafts.update(draft.id, {
        syncStatus: 'synced',
        remoteSubmissionId: ack.remoteSubmissionId,
        version: ack.version,
        syncedAt: now,
        updatedAt: now,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Mark a queue item as requiring user action (terminal)
// ---------------------------------------------------------------------------

export async function markActionRequired(
  queueId: number,
  submissionUuid: string,
  errorMessage: string,
  statusCode?: number,
  errorCategory?: SubmissionErrorCategory
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    await db.syncQueue.update(queueId, {
      status: 'failed_final',
      errorMessage,
      lastErrorCode: statusCode ?? null,
      nextRetryTimestamp: null,
      lastAttempt: now,
    });

    const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
    if (draft?.id) {
      await db.drafts.update(draft.id, {
        syncStatus: 'failed_final',
        syncError: errorMessage,
        updatedAt: now,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Mark a queue item for automatic retry
// ---------------------------------------------------------------------------

const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 1_800_000; // 30 minutes cap

const NON_RETRYABLE_CATEGORIES: SubmissionErrorCategory[] = [
  'validation',
  'unauthorized',
  'conflict',
  'malformed_acknowledgement',
  'invalid_update_identity',
  'not_found',
];

/**
 * Records a transient failure and schedules automatic retry with bounded
 * exponential backoff and jitter.
 *
 * Rules:
 * - Transient errors (network, timeout, rate_limited, upstream_unavailable)
 *   remain safely retryable indefinitely. They are NOT promoted to action-required
 *   merely because retryCount is high.
 * - Non-retryable errors (validation, auth, conflict) transition immediately
 *   to ACTION_REQUIRED.
 */
export async function markRetryable(
  queueId: number,
  submissionUuid: string,
  errorMessage: string,
  statusCode?: number,
  errorCategory?: SubmissionErrorCategory
): Promise<{ willRetry: boolean; nextRetryMs: number }> {
  const now = new Date().toISOString();

  // If a non-retryable error reaches markRetryable, transition to ACTION_REQUIRED immediately
  if (errorCategory && NON_RETRYABLE_CATEGORIES.includes(errorCategory)) {
    await markActionRequired(queueId, submissionUuid, errorMessage, statusCode, errorCategory);
    return { willRetry: false, nextRetryMs: 0 };
  }

  const item = await db.syncQueue.get(queueId);
  if (!item) return { willRetry: false, nextRetryMs: 0 };

  const newRetryCount = (item.retryCount ?? 0) + 1;

  // Exponential backoff with full jitter, capped at 30 minutes
  const exponential = Math.min(BASE_BACKOFF_MS * Math.pow(2, Math.min(newRetryCount - 1, 10)), MAX_BACKOFF_MS);
  const jitter = Math.random() * exponential;
  const nextRetryMs = Math.max(1000, Math.round(jitter));

  await db.syncQueue.update(queueId, {
    status: 'failed_retryable',
    errorMessage,
    lastErrorCode: statusCode ?? null,
    lastAttempt: now,
    retryCount: newRetryCount,
    nextRetryTimestamp: Date.now() + nextRetryMs,
  });

  const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
  if (draft?.id) {
    await db.drafts.update(draft.id, {
      syncStatus: 'failed_retryable',
      syncError: errorMessage,
      updatedAt: now,
    });
  }

  return { willRetry: true, nextRetryMs };
}

// ---------------------------------------------------------------------------
// Repair identity after 404 reconciliation
// ---------------------------------------------------------------------------

export async function repairRemoteIdentity(
  queueId: number,
  submissionUuid: string,
  remoteSubmissionId: string,
  version: number
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    // Update the queue item's payload to include the repaired remote identity
    const item = await db.syncQueue.get(queueId);
    if (item) {
      const updatedPayload: any = { ...(item.payload as any) };
      updatedPayload.remoteSubmissionId = remoteSubmissionId;
      updatedPayload.version = version;

      await db.syncQueue.update(queueId, {
        payload: updatedPayload,
        status: 'queued',
        operationType: 'UPDATE',
        expectedVersion: version,
        nextRetryTimestamp: Date.now(),
        errorMessage: null,
      });
    }

    const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
    if (draft?.id) {
      await db.drafts.update(draft.id, {
        remoteSubmissionId,
        version,
        updatedAt: now,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Get pending queue items (non-terminal, ready for dispatch)
// ---------------------------------------------------------------------------

export async function getDispatchQueue(): Promise<SyncQueueItem[]> {
  const now = Date.now();
  return db.syncQueue
    .filter((item) => {
      if (
        item.status === 'synced' ||
        item.status === 'SYNCED' ||
        item.status === 'conflict' ||
        item.status === 'needs_review' ||
        item.status === 'NEEDS_REVIEW' ||
        item.status === 'failed_final' ||
        item.status === 'FAILED_FINAL'
      ) {
        return false;
      }
      if (item.status === 'failed_retryable' || item.status === 'FAILED_RETRYABLE') {
        return (item.nextRetryTimestamp ?? 0) <= now;
      }
      return item.status === 'queued' || item.status === 'syncing';
    })
    .toArray();
}

// ---------------------------------------------------------------------------
// Legacy migration — schemaVersion 1 -> 2
// ---------------------------------------------------------------------------

/**
 * Migrates legacy queue items (schemaVersion < 2) to the canonical format.
 *
 * MIGRATION RULES:
 * 1. A valid legacy item may become CREATE only when it has no evidence of a
 *    previous remote acknowledgement and has no canonical remoteSubmissionId.
 * 2. An item with an invalid or non-canonical remote identity (e.g. ART ID in remoteSubmissionId)
 *    must NEVER be auto-converted to CREATE, as this could produce duplicate records.
 *    Instead, it is quarantined to ACTION_REQUIRED ('failed_final').
 * 3. Never infer remote identity from ART/reference ID, child ID, local ID, or client submission ID.
 *
 * Safe to call multiple times — idempotent.
 */
export async function migrateLegacyItems(): Promise<number> {
  const legacyItems = await db.syncQueue
    .filter((item) => !item.schemaVersion || item.schemaVersion < 2)
    .toArray();

  let migrated = 0;
  for (const item of legacyItems) {
    if (!item.id) continue;

    const payload: any = item.payload ?? {};

    // Ensure clientSubmissionId is set from uuid
    if (!payload.clientSubmissionId && payload.uuid) {
      payload.clientSubmissionId = payload.uuid;
    }

    // Ensure idempotencyKey is set
    const idempotencyKey = item.idempotencyKey || `create-${payload.uuid || item.submissionUuid}`;

    // Structurally invalid items go to ACTION_REQUIRED
    if (!payload.uuid || !payload.demographics) {
      await db.syncQueue.update(item.id, {
        schemaVersion: 2,
        status: 'failed_final',
        errorMessage: 'Legacy record missing required fields. Please open and re-submit.',
        payload,
        idempotencyKey,
      });
      migrated++;
      continue;
    }

    // Check remote identity
    const rawRemoteId = payload.remoteSubmissionId;
    let hasValidRemoteId = false;
    if (rawRemoteId) {
      try {
        assertValidRemoteSubmissionId(rawRemoteId, 'migrateLegacyItems');
        hasValidRemoteId = true;
      } catch {
        // Has a remote ID but it's an ART ID or non-UUID — corrupt/legacy identity!
        // Do NOT convert to CREATE — quarantine to ACTION_REQUIRED.
        await db.syncQueue.update(item.id, {
          schemaVersion: 2,
          status: 'failed_final',
          errorMessage: 'This saved record needs help before it can be updated.',
          payload,
          idempotencyKey,
        });
        migrated++;
        continue;
      }
    }

    // If item was previously marked UPDATE or version > 1, but has no valid remote ID:
    const isUpdateIntent = item.operationType === 'UPDATE' || (item.expectedVersion && item.expectedVersion > 1);
    if (isUpdateIntent && !hasValidRemoteId) {
      // Evidence of remote acknowledgement attempt without valid canonical ID — quarantine
      await db.syncQueue.update(item.id, {
        schemaVersion: 2,
        status: 'failed_final',
        errorMessage: 'This saved record needs help before it can be updated.',
        payload,
        idempotencyKey,
      });
      migrated++;
      continue;
    }

    // Valid items without remoteSubmissionId and without update intent: treat as CREATE
    const operationType = hasValidRemoteId ? 'UPDATE' : 'CREATE';

    await db.syncQueue.update(item.id, {
      schemaVersion: 2,
      operationType,
      payload,
      idempotencyKey,
      nextRetryTimestamp: item.nextRetryTimestamp ?? Date.now(),
      status: item.status === 'syncing' ? 'queued' : item.status,
    });
    migrated++;
  }

  return migrated;
}
