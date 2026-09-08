/**
 * Sync Queue Repository for Transactional Offline Outbox
 */

import { db } from './dexieDb';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';

export async function enqueueSubmission(record: AssessmentRecord): Promise<number> {
  const now = new Date().toISOString();

  // Ensure record is saved as queued
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
    payload: record,
    status: 'queued',
    retryCount: 0,
    lastAttempt: null,
    nextRetryTimestamp: Date.now(),
    errorMessage: null,
  });

  return queueId;
}

export async function getPendingQueue(): Promise<SyncQueueItem[]> {
  const now = Date.now();
  return db.syncQueue
    .filter(
      (item) =>
        (item.status === 'queued' || item.status === 'failed') &&
        (item.nextRetryTimestamp === null || item.nextRetryTimestamp <= now)
    )
    .toArray();
}

export async function markSyncing(queueId: number): Promise<void> {
  await db.syncQueue.update(queueId, {
    status: 'syncing',
    lastAttempt: new Date().toISOString(),
  });
}

export async function markSynced(queueId: number, uuid: string): Promise<void> {
  await db.syncQueue.update(queueId, {
    status: 'synced',
    errorMessage: null,
  });

  const draft = await db.drafts.where('uuid').equals(uuid).first();
  if (draft && draft.id) {
    await db.drafts.update(draft.id, {
      syncStatus: 'synced',
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function markFailed(queueId: number, errorMessage: string): Promise<void> {
  const item = await db.syncQueue.get(queueId);
  if (!item) return;

  const newRetryCount = item.retryCount + 1;
  // Exponential backoff: min(300, 2^count * 3) seconds + jitter
  const backoffSeconds = Math.min(300, Math.pow(2, newRetryCount) * 3);
  const jitter = Math.floor(Math.random() * 5);
  const nextRetryTimestamp = Date.now() + (backoffSeconds + jitter) * 1000;

  await db.syncQueue.update(queueId, {
    status: 'failed',
    retryCount: newRetryCount,
    nextRetryTimestamp,
    errorMessage,
  });
}

export async function getAllQueueItems(): Promise<SyncQueueItem[]> {
  return db.syncQueue.reverse().sortBy('id');
}
