/**
 * Sync Queue Repository for Transactional Offline Outbox
 * Implements client mutex lock, bounded exponential backoff with jitter, and OCC conflict handling.
 */

import { db } from './dexieDb';
import type { AssessmentRecord, SyncQueueItem, OutboxOperationType } from '@/types/domain';

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

  // Enqueue in outbox
  const queueId = await db.syncQueue.add({
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

export async function getPendingQueue(forceAllPending: boolean = false): Promise<SyncQueueItem[]> {
  const now = Date.now();
  return db.syncQueue
    .filter((item) => {
      const isCandidate =
        item.status === 'queued' ||
        item.status === 'failed' ||
        item.status === 'failed_retryable' ||
        item.status === 'QUEUED' ||
        item.status === 'FAILED_RETRYABLE';

      if (!isCandidate) return false;
      if (forceAllPending) return true;
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
  statusCode?: number | string
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
