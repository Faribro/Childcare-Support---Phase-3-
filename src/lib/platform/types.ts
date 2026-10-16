/**
 * Shared Platform Contracts & Interfaces (Phase 2)
 *
 * Defines the platform-agnostic boundary between Childcare UI/Sync domain logic
 * and underlying operating system primitives (Web IndexedDB vs Native Android SQLite/Filesystem).
 */

import type { AssessmentRecord, SyncQueueItem, OutboxOperationType } from '@/types/domain';

export type PlatformTarget = 'web' | 'android' | 'ios' | 'desktop';

export interface StorageTransaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface StorageAdapter {
  readonly platform: PlatformTarget;
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Transactional Draft Management
  saveDraft(
    draft: AssessmentRecord,
    options?: { userId?: string; immediateCommit?: boolean }
  ): Promise<number>;
  getDraftByUuid(uuid: string, userId?: string): Promise<AssessmentRecord | undefined>;
  getAllDrafts(userId?: string): Promise<AssessmentRecord[]>;
  deleteDraft(uuid: string, userId?: string): Promise<void>;

  // Transactional Outbox (Sync Queue)
  enqueueSubmission(
    record: AssessmentRecord,
    options?: {
      userId?: string;
      operationType?: OutboxOperationType;
      idempotencyKey?: string;
      expectedVersion?: number;
    }
  ): Promise<number>;
  getPendingQueue(userId?: string, forceAllPending?: boolean): Promise<SyncQueueItem[]>;
  getQueueItemById(id: number): Promise<SyncQueueItem | undefined>;
  getQueueItemByUuid(uuid: string, userId?: string): Promise<SyncQueueItem | undefined>;
  markSyncing(queueId: number): Promise<void>;
  markSynced(
    queueId: number,
    uuid: string,
    remoteSubmissionId?: string,
    version?: number,
    updatedAt?: string,
    requestId?: string
  ): Promise<void>;
  markFailedRetryable(
    queueId: number,
    error: string,
    statusCode?: number,
    nextRetryTimestamp?: number
  ): Promise<void>;
  markFailedFinal(
    queueId: number,
    error: string,
    statusCode?: number,
    issues?: string[]
  ): Promise<void>;
  markConflict(
    queueId: number,
    conflictMetadata?: SyncQueueItem['conflictMetadata']
  ): Promise<void>;

  // Transactional Outbox queries
  getAllQueueItems?(userId?: string): Promise<SyncQueueItem[]>;
  deleteQueueItem?(id: number): Promise<void>;
  resetToQueued?(id: number): Promise<void>;
  getQueueStats?(userId?: string): Promise<{
    total: number;
    queued: number;
    syncing: number;
    synced: number;
    failedRetryable: number;
    failedFinal: number;
    conflict: number;
  }>;
  getWaitingQueueCount?(userId?: string): Promise<number>;
  getLocalSyncedCount?(userId?: string): Promise<number>;

  // Atomic Transactions
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;

  // Schema & Migration
  getSchemaVersion(): Promise<number>;
  migrate(targetVersion: number): Promise<{ migratedCount: number }>;
}

export interface AttachmentMetadata {
  attachmentId: string;
  submissionUuid: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  encrypted: boolean;
  sha256Hash: string;
}

export interface AttachmentStorageAdapter {
  readonly platform: PlatformTarget;
  initialize(): Promise<void>;

  saveAttachment(
    submissionUuid: string,
    attachmentId: string,
    data: Uint8Array | Blob,
    mimeType: string,
    fileName?: string
  ): Promise<AttachmentMetadata>;

  getAttachment(
    submissionUuid: string,
    attachmentId: string
  ): Promise<{ data: Uint8Array; metadata: AttachmentMetadata } | undefined>;

  deleteAttachment(submissionUuid: string, attachmentId: string): Promise<void>;
  listAttachments(submissionUuid: string): Promise<AttachmentMetadata[]>;
  purgeAttachmentsForSubmission(submissionUuid: string): Promise<void>;
}

export interface SecureStorageAdapter {
  readonly platform: PlatformTarget;
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  removeSecret(key: string): Promise<void>;
  clearSecrets(preserveDbKey?: boolean): Promise<void>;
  clearSessionSecrets?(): Promise<void>;
}

export interface NetworkAdapter {
  readonly platform: PlatformTarget;
  isOnline(): Promise<boolean>;
  onNetworkChange(callback: (online: boolean) => void): () => void;
  simulateNetworkChange(online: boolean): void; // For testing and offline verification
}

export interface AppLifecycleAdapter {
  readonly platform: PlatformTarget;
  onStateChange(callback: (state: 'active' | 'background' | 'resumed') => void): () => void;
  simulateStateChange(state: 'active' | 'background' | 'resumed'): void;
}

export interface PlatformConfig {
  target: PlatformTarget;
  apiBaseUrl: string;
  currentUserId: string | null;
  databaseEncryptionKey?: string;
  isTestMode?: boolean;
}
