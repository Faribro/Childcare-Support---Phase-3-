/**
 * WebStorageAdapter: IndexedDB / Dexie.js Implementation of StorageAdapter
 *
 * Preserves 100% backward compatibility for existing Web and PWA users.
 * Delegates to Dexie db instance ('AllianceChildcareDB') with user isolation support.
 */

import { db } from '@/lib/db/dexieDb';
import type { StorageAdapter, PlatformTarget } from './types';
import type { AssessmentRecord, SyncQueueItem, OutboxOperationType } from '@/types/domain';

export class WebStorageAdapter implements StorageAdapter {
  public readonly platform: PlatformTarget = 'web';

  async initialize(): Promise<void> {
    if (!db.isOpen()) {
      await db.open();
    }
  }

  async close(): Promise<void> {
    db.close();
  }

  async saveDraft(
    draft: AssessmentRecord,
    options?: { userId?: string; immediateCommit?: boolean }
  ): Promise<number> {
    const now = new Date().toISOString();
    const clientSubmissionId = draft.clientSubmissionId || draft.uuid;
    const version = draft.version || 1;

    // Tag owner user ID if provided for account isolation
    const recordToSave: any = {
      ...draft,
      clientSubmissionId,
      version,
      updatedAt: now,
      createdAt: draft.createdAt || now,
      syncStatus: draft.syncStatus || 'draft',
    };

    if (options?.userId) {
      recordToSave.ownerUserId = options.userId;
    }

    let savedId: number;
    if (draft.id) {
      await db.drafts.update(draft.id, recordToSave);
      savedId = draft.id;
    } else {
      const existing = await db.drafts.where('uuid').equals(draft.uuid).first();
      if (existing && existing.id) {
        await db.drafts.update(existing.id, {
          ...recordToSave,
          clientSubmissionId: existing.clientSubmissionId || clientSubmissionId,
          version: existing.version || version,
        });
        savedId = existing.id;
      } else {
        savedId = await db.drafts.add(recordToSave as AssessmentRecord);
      }
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('child_nutrition:draft_updated'));
      } catch (_) {}
    }

    return savedId;
  }

  async getDraftByUuid(uuid: string, userId?: string): Promise<AssessmentRecord | undefined> {
    const draft = await db.drafts.where('uuid').equals(uuid).first();
    if (!draft) return undefined;
    if (userId && (draft as any).ownerUserId && (draft as any).ownerUserId !== userId) {
      return undefined; // Account isolation
    }
    return draft;
  }

  async getAllDrafts(userId?: string): Promise<AssessmentRecord[]> {
    const drafts = await db.drafts
      .where('syncStatus')
      .equals('draft')
      .reverse()
      .sortBy('updatedAt');

    if (!userId) return drafts;
    // Filter by authenticated user for multi-user device safety
    return drafts.filter((d: any) => !d.ownerUserId || d.ownerUserId === userId);
  }

  async deleteDraft(uuid: string, userId?: string): Promise<void> {
    const draft = await db.drafts.where('uuid').equals(uuid).first();
    if (!draft || !draft.id) return;
    if (userId && (draft as any).ownerUserId && (draft as any).ownerUserId !== userId) {
      return; // Not authorized to delete another user's draft
    }
    await db.drafts.delete(draft.id);
  }

  async enqueueSubmission(
    record: AssessmentRecord,
    options?: {
      userId?: string;
      operationType?: OutboxOperationType;
      idempotencyKey?: string;
      expectedVersion?: number;
    }
  ): Promise<number> {
    const now = new Date().toISOString();
    const operationType: OutboxOperationType = options?.operationType || 'CREATE';
    const idempotencyKey =
      options?.idempotencyKey ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${record.uuid}-${Date.now()}`);

    if (record.id) {
      await db.drafts.update(record.id, {
        ...record,
        syncStatus: 'queued',
        updatedAt: now,
      });
    }

    const queueItem: any = {
      schemaVersion: 2,
      submissionUuid: record.uuid,
      idempotencyKey,
      operationType,
      payload: record,
      status: 'queued',
      expectedVersion: options?.expectedVersion ?? record.version ?? 1,
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: Date.now(),
      errorMessage: null,
      conflictMetadata: null,
    };

    if (options?.userId) {
      queueItem.ownerUserId = options.userId;
    }

    return await db.syncQueue.add(queueItem as SyncQueueItem);
  }

  async getPendingQueue(userId?: string, forceAllPending: boolean = false): Promise<SyncQueueItem[]> {
    const now = Date.now();
    const items = await db.syncQueue
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

        const isTerminal =
          item.status === 'failed' &&
          (item.nextRetryTimestamp === null || [400, 401, 403, 422].includes(Number(item.lastErrorCode)));

        if (isTerminal) return false;

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

    if (!userId) return items;
    return items.filter((item: any) => !item.ownerUserId || item.ownerUserId === userId);
  }

  async getQueueItemById(id: number): Promise<SyncQueueItem | undefined> {
    const item = await db.syncQueue.get(id);
    return item;
  }

  async getQueueItemByUuid(uuid: string, userId?: string): Promise<SyncQueueItem | undefined> {
    const item = await db.syncQueue.where('submissionUuid').equals(uuid).first();
    if (!item) return undefined;
    if (userId && (item as any).ownerUserId && (item as any).ownerUserId !== userId) {
      return undefined;
    }
    return item;
  }

  async markSyncing(queueId: number): Promise<void> {
    await db.syncQueue.update(queueId, {
      status: 'syncing',
      lastAttempt: new Date().toISOString(),
    });
  }

  async markSynced(
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

  async markFailedRetryable(
    queueId: number,
    error: string,
    statusCode?: number,
    nextRetryTimestamp?: number
  ): Promise<void> {
    const item = await db.syncQueue.get(queueId);
    if (!item) return;
    const retryCount = (item.retryCount || 0) + 1;
    const nextRetry = nextRetryTimestamp ?? (Date.now() + Math.min(1000 * Math.pow(2, retryCount), 60000));

    await db.syncQueue.update(queueId, {
      status: 'failed_retryable',
      errorMessage: error,
      lastErrorCode: statusCode,
      retryCount,
      nextRetryTimestamp: nextRetry,
    });
  }

  async markFailedFinal(
    queueId: number,
    error: string,
    statusCode?: number,
    issues?: string[]
  ): Promise<void> {
    await db.syncQueue.update(queueId, {
      status: 'failed_final',
      errorMessage: error,
      lastErrorCode: statusCode,
      nextRetryTimestamp: null,
      validationIssues: issues,
    });
  }

  async markConflict(
    queueId: number,
    conflictMetadata?: SyncQueueItem['conflictMetadata']
  ): Promise<void> {
    await db.syncQueue.update(queueId, {
      status: 'conflict',
      errorMessage: 'Version conflict: record was modified on server.',
      nextRetryTimestamp: null,
      conflictMetadata: conflictMetadata || null,
    });
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
      return await fn();
    });
  }

  async getSchemaVersion(): Promise<number> {
    return db.verno;
  }

  async migrate(_targetVersion: number): Promise<{ migratedCount: number }> {
    return { migratedCount: 0 };
  }
}
