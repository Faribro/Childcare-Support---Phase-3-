/**
 * Sync Queue Repository for Transactional Offline Outbox
 * Implements client mutex lock, bounded exponential backoff with jitter, and OCC conflict handling.
 */

import { db } from './dexieDb';
import type { AssessmentRecord, SyncQueueItem, OutboxOperationType } from '@/types/domain';
import { flattenPatchBody, allowlistedPatchChangesSchema } from '@/lib/validations/submissionSchema';

// Client-side mutex lock to prevent overlapping sync executions
let isSyncInProgress = false;

export function acquireSyncLock(): boolean {
  if (isSyncInProgress) return false;
  isSyncInProgress = true;
  return true;
}

export function releaseSyncLock(): void {
  isSyncInProgress = false;
}

export function isSyncLocked(): boolean {
  return isSyncInProgress;
}

export interface EnqueueOptions {
  operationType?: OutboxOperationType;
  idempotencyKey?: string;
  expectedVersion?: number;
}

export async function enqueueSubmission(
  record: AssessmentRecord,
  options: EnqueueOptions = {}
): Promise<number> {
  const now = new Date().toISOString();
  const operationType: OutboxOperationType = options.operationType || 'CREATE';
  const idempotencyKey =
    options.idempotencyKey ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${record.uuid}-${Date.now()}`);

  // Ensure record in drafts table reflects status
  if (record.id) {
    await db.drafts.update(record.id, {
      ...record,
      syncStatus: 'queued',
      updatedAt: now,
    });
  }

  // Enqueue in outbox with schemaVersion 2
  const queueId = await db.syncQueue.add({
    schemaVersion: 2,
    submissionUuid: record.uuid,
    idempotencyKey,
    operationType,
    payload: record,
    status: 'queued',
    expectedVersion: options.expectedVersion ?? record.version ?? 1,
    retryCount: 0,
    lastAttempt: null,
    nextRetryTimestamp: Date.now(),
    errorMessage: null,
    conflictMetadata: null,
  });

  return queueId;
}

/**
 * Migrates legacy queue items to schemaVersion 2.
 * Converts legacy UPDATE payloads into allowlisted changes envelope.
 * Quarantines unmigratable records as 'needs_review' without automatic retry.
 */
export async function migrateLegacyQueueItems(): Promise<{ migratedCount: number; needsReviewCount: number }> {
  const allItems = await db.syncQueue.toArray();
  let migratedCount = 0;
  let needsReviewCount = 0;

  for (const item of allItems) {
    if (!item.id) continue;
    let modified = false;
    const updates: Partial<SyncQueueItem> = {};

    if (!item.schemaVersion || item.schemaVersion < 2) {
      updates.schemaVersion = 2;
      modified = true;
    }

    if (!item.operationType) {
      if (item.expectedVersion && item.expectedVersion > 1) {
        updates.operationType = 'UPDATE';
      } else if (item.payload && (((item.payload as any).version > 1) || (item.payload as any).editReason)) {
        updates.operationType = 'UPDATE';
      } else {
        updates.operationType = 'CREATE';
      }
      modified = true;
    }

    const currentOp = updates.operationType || item.operationType;
    if (currentOp === 'UPDATE') {
      const payloadAny = (item.payload as any) || {};
      if (!payloadAny.changes || typeof payloadAny.changes !== 'object') {
        const targetId =
          payloadAny.remoteSubmissionId ||
          payloadAny.uniqueId ||
          payloadAny.artNumber ||
          payloadAny.demographics?.artNumber ||
          item.submissionUuid;

        const expectedVersion = Number(
          item.expectedVersion ||
          payloadAny.expectedVersion ||
          payloadAny.version ||
          1
        );

        const flattened = flattenPatchBody(payloadAny);
        const filteredChanges: Record<string, any> = {};
        for (const [k, v] of Object.entries(flattened)) {
          if (!['uuid', 'clientSubmissionId', 'remoteSubmissionId', 'createdAt', 'id', 'stepIndex', 'syncStatus', 'syncNeeded', 'syncedAt', 'idempotencyKey', 'expectedVersion'].includes(k)) {
            filteredChanges[k] = (v === '' || v === null) ? undefined : v;
          }
        }

        const valid = allowlistedPatchChangesSchema.safeParse(filteredChanges);
        if (valid.success) {
          updates.payload = {
            ...payloadAny,
            changes: valid.data,
            remoteSubmissionId: targetId,
            expectedVersion,
          };
          updates.expectedVersion = expectedVersion;
          modified = true;
        } else {
          updates.status = 'needs_review';
          updates.nextRetryTimestamp = null;
          updates.errorMessage = 'Legacy update record needs review before it can be sent.';
          needsReviewCount++;
          modified = true;
        }
      }
    }

    if (currentOp === 'CREATE') {
      const pAny = (item.payload as any) || {};
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (pAny.uuid && !uuidRegex.test(pAny.uuid)) {
        const generatedUuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;
        if (generatedUuid) {
          updates.submissionUuid = generatedUuid;
          updates.payload = {
            ...pAny,
            uuid: generatedUuid,
            clientSubmissionId: generatedUuid,
            uniqueId: pAny.uniqueId || pAny.artNumber || pAny.demographics?.artNumber || item.submissionUuid,
            demographics: {
              ...(pAny.demographics || {}),
              artNumber: pAny.demographics?.artNumber || pAny.artNumber || item.submissionUuid,
            },
          };
          modified = true;
        }
      }
    }

    // Recover stale syncing locks: if an item was left in 'syncing' state
    // (e.g. from page navigation, network interruption, or browser reload),
    // reset it back to 'queued' so it can be retried safely.
    if (item.status === 'syncing' || (item.status as any) === 'SYNCING') {
      const isStale = !item.lastAttempt || (Date.now() - new Date(item.lastAttempt).getTime() > 5000);
      if (isStale) {
        updates.status = 'queued';
        updates.nextRetryTimestamp = Date.now();
        modified = true;
      }
    }

    // Terminal 422 records: ensure retry is halted permanently
    if (item.status === 'failed' && (item.lastErrorCode === 422 || item.lastErrorCode === '422')) {
      if (item.nextRetryTimestamp !== null) {
        updates.nextRetryTimestamp = null;
        modified = true;
      }
    }

    if (modified) {
      await db.syncQueue.update(item.id, updates);
      migratedCount++;
    }
  }

  return { migratedCount, needsReviewCount };
}

export async function getPendingQueue(forceAllPending: boolean = false): Promise<SyncQueueItem[]> {
  const now = Date.now();
  return db.syncQueue
    .filter((item) => {
      // Synced, conflict, and draft items are never candidates
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

      // Check for terminal failure (400, 401, 403, 422 or halted retries with null timestamp)
      const isTerminal =
        item.status === 'failed' &&
        (item.nextRetryTimestamp === null || [400, 401, 403, 422].includes(Number(item.lastErrorCode)));

      if (isTerminal) {
        return false;
      }

      // Stale syncing recovery: include syncing items if forceAllPending is requested (e.g. manual flush)
      // or if lastAttempt was > 10 seconds ago (interrupted sync)
      const isStaleSyncing =
        (item.status === 'syncing' || (item.status as any) === 'SYNCING') &&
        (forceAllPending || !item.lastAttempt || (now - new Date(item.lastAttempt).getTime() > 5000));

      const isCandidate =
        item.status === 'queued' ||
        item.status === 'QUEUED' ||
        item.status === 'failed_retryable' ||
        item.status === 'FAILED_RETRYABLE' ||
        isStaleSyncing ||
        (item.status === 'failed' && item.nextRetryTimestamp !== null && item.nextRetryTimestamp <= now);

      if (!isCandidate) return false;
      if (forceAllPending) return true;
      if (item.status === 'failed') {
        return item.nextRetryTimestamp !== null && item.nextRetryTimestamp <= now;
      }
      return item.nextRetryTimestamp === null || item.nextRetryTimestamp <= now;
    })
    .toArray();
}

export async function getQueueItemByUuid(uuid: string): Promise<SyncQueueItem | undefined> {
  return db.syncQueue.where('submissionUuid').equals(uuid).first();
}

export async function markSyncing(queueId: number): Promise<void> {
  await db.syncQueue.update(queueId, {
    status: 'syncing',
    lastAttempt: new Date().toISOString(),
  });
}

export async function markSynced(
  queueId: number,
  uuid: string,
  remoteSubmissionId?: string,
  version?: number,
  updatedAt?: string,
  requestId?: string
): Promise<void> {
  const now = updatedAt || new Date().toISOString();

  await db.syncQueue.update(queueId, {
    status: 'synced',
    errorMessage: null,
    nextRetryTimestamp: null,
    requestId: requestId || null,
  });

  const draft = await db.drafts.where('uuid').equals(uuid).first();
  if (draft && draft.id) {
    await db.drafts.update(draft.id, {
      syncStatus: 'synced',
      remoteSubmissionId: remoteSubmissionId || draft.remoteSubmissionId,
      version: version || draft.version || 1,
      syncedAt: now,
      updatedAt: now,
    });
  }
}

export async function markConflict(
  queueId: number,
  conflictMetadata: SyncQueueItem['conflictMetadata']
): Promise<void> {
  const item = await db.syncQueue.get(queueId);
  if (!item) return;

  await db.syncQueue.update(queueId, {
    status: 'conflict',
    errorMessage: 'Version mismatch: record was modified remotely by another user.',
    conflictMetadata,
    nextRetryTimestamp: null, // Halt automatic retries
  });

  const draft = await db.drafts.where('uuid').equals(item.submissionUuid).first();
  if (draft && draft.id) {
    await db.drafts.update(draft.id, {
      syncStatus: 'conflict',
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function markFailedFinal(
  queueId: number,
  errorMessage: string,
  statusCode?: number | string,
  validationIssues?: string[]
): Promise<void> {
  const item = await db.syncQueue.get(queueId);
  if (!item) return;

  const newRetryCount = (item.retryCount || 0) + 1;
  const numCode = typeof statusCode === 'number' ? statusCode : parseInt(String(statusCode), 10);

  await db.syncQueue.update(queueId, {
    status: 'failed',
    retryCount: newRetryCount,
    lastErrorCode: statusCode,
    nextRetryTimestamp: null, // Halt retries
    errorMessage: `Terminal Failure (${numCode || 'Error'}): ${errorMessage}`,
    validationIssues: validationIssues || undefined,
  });

  const draft = await db.drafts.where('uuid').equals(item.submissionUuid).first();
  if (draft && draft.id) {
    await db.drafts.update(draft.id, {
      syncStatus: 'failed',
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function markFailedRetryable(
  queueId: number,
  errorMessage: string,
  statusCode?: number | string
): Promise<void> {
  const item = await db.syncQueue.get(queueId);
  if (!item) return;

  const newRetryCount = (item.retryCount || 0) + 1;
  // Exponential backoff with jitter: min(300, 2^retryCount * 3) seconds + jitter
  const backoffSeconds = Math.min(300, Math.pow(2, newRetryCount) * 3);
  const jitter = Math.floor(Math.random() * 5);
  const nextRetryTimestamp = Date.now() + (backoffSeconds + jitter) * 1000;

  await db.syncQueue.update(queueId, {
    status: 'failed',
    retryCount: newRetryCount,
    lastErrorCode: statusCode,
    nextRetryTimestamp,
    errorMessage,
  });

  const draft = await db.drafts.where('uuid').equals(item.submissionUuid).first();
  if (draft && draft.id) {
    await db.drafts.update(draft.id, {
      syncStatus: 'failed',
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function markFailed(
  queueId: number,
  errorMessage: string,
  statusCode?: number | string
): Promise<void> {
  const numCode = typeof statusCode === 'number' ? statusCode : parseInt(String(statusCode), 10);
  // Non-retriable client errors (400 schema error, 401/403 auth error, 422 unprocessable)
  const isNonRetriable = [400, 401, 403, 422].includes(numCode);

  if (isNonRetriable) {
    await markFailedFinal(queueId, errorMessage, statusCode);
  } else {
    await markFailedRetryable(queueId, errorMessage, statusCode);
  }
}

export async function getAllQueueItems(): Promise<SyncQueueItem[]> {
  return db.syncQueue.reverse().sortBy('id');
}

export async function getQueueStats() {
  const all = await db.syncQueue.toArray();
  return {
    total: all.length,
    queued: all.filter((i) => i.status === 'queued' || i.status === 'QUEUED').length,
    syncing: all.filter((i) => i.status === 'syncing' || i.status === 'SYNCING').length,
    synced: all.filter((i) => i.status === 'synced' || i.status === 'SYNCED').length,
    failedRetryable: all.filter(
      (i) => (i.status === 'failed' || i.status === 'failed_retryable') && i.nextRetryTimestamp !== null
    ).length,
    failedFinal: all.filter(
      (i) => (i.status === 'failed' || i.status === 'failed_final') && i.nextRetryTimestamp === null
    ).length,
    conflict: all.filter((i) => i.status === 'conflict' || i.status === 'NEEDS_REVIEW').length,
  };
}
