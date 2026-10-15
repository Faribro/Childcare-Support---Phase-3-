/**
 * Webhook-to-Worker Durable Handoff Contract & Queue
 *
 * Bridges:
 * 1. Receive-Only Ingress Adapter (`Childcare-Catalyst-Adapter` / `feat/catalyst-whatsapp-adapter`)
 * 2. Downstream Media Processing Service (`Childcare-Support-Phase-3(1)` / `feat/staging-destination-hardening`)
 *
 * Safety & Privacy Invariants:
 * - NO raw beneficiary phone numbers or contact names are enqueued.
 * - Enqueues strictly verifiable media references (mediaId, mimeType, sha256, uploadToken).
 * - Enforces at-least-once durable delivery with explicit acknowledgment.
 * - Idempotent deduplication based on mediaId.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { MediaProcessingJob, BeneficiaryDocumentType } from './mediaProcessingService';

export interface MediaIngressHandoffEvent {
  readonly eventId: string;
  readonly correlationId: string;
  readonly mediaId: string;
  readonly mimeType: string;
  readonly sha256?: string;
  readonly uploadToken?: string;
  readonly receivedAt: string; // ISO 8601 UTC
  readonly sourceOrigin: 'CATALYST_WHATSAPP_INGRESS';
  readonly isSynthetic: boolean;
}

export type QueueJobStatus = 'PENDING' | 'CLAIMED' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';

export interface InternalQueueJob {
  readonly event: MediaIngressHandoffEvent;
  status: QueueJobStatus;
  workerId?: string;
  leaseExpiresAt?: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
}

export interface DatabaseWebhookQueueRepository {
  enqueueJob(params: {
    correlationId: string;
    mediaId: string;
    mimeType: string;
    sha256?: string;
    uploadToken?: string;
    sourceOrigin?: string;
  }): Promise<{ jobId: string; isDuplicate: boolean }>;
  claimNext(workerId: string, leaseDurationMs?: number): Promise<MediaIngressHandoffEvent | null>;
  extendLease(jobId: string, workerId: string, additionalMs: number): Promise<boolean>;
  acknowledgeJob(jobId: string, workerId: string): Promise<boolean>;
  failJob(jobId: string, workerId: string, error: string, retryable?: boolean): Promise<{ deadLetter: boolean; attempts: number }>;
  recoverStaleLeases(): Promise<number>;
}

export interface WebhookHandoffQueue {
  enqueue(
    event: Omit<MediaIngressHandoffEvent, 'eventId' | 'receivedAt'>,
    maxAttempts?: number
  ): Promise<{
    enqueued: boolean;
    eventId: string;
    queueDepth: number;
    isDuplicate: boolean;
  }>;
  pollNext(batchSize?: number): Promise<MediaIngressHandoffEvent[]>;
  claimNext(workerId: string, leaseDurationMs?: number): Promise<MediaIngressHandoffEvent | null>;
  extendLease(eventId: string, workerId: string, additionalMs: number): Promise<boolean>;
  acknowledge(eventId: string, workerId?: string): Promise<boolean>;
  failJob(
    eventId: string,
    workerId: string,
    error: string,
    retryable?: boolean
  ): Promise<{ deadLetter: boolean; attempts: number }>;
  recoverStaleLeases(): Promise<number>;
  getPendingCount(): Promise<number>;
  getDeadLetterCount(): Promise<number>;
  clear(): Promise<void>;
}

/**
 * File-backed Webhook Handoff Queue
 *
 * STORAGE AUDIT NOTE:
 * This queue persists to the local filesystem (.cache/).
 * It is strictly LOCAL_DEVELOPMENT_ONLY and does NOT guarantee durability across
 * serverless restarts, scale-outs, or multi-container deployments.
 * In production (NODE_ENV === 'production'), it fails closed unless explicitly overridden.
 */
export class PersistentWebhookHandoffQueue implements WebhookHandoffQueue {
  public readonly storageType = 'LOCAL_DEVELOPMENT_ONLY' as const;
  private queue: InternalQueueJob[] = [];
  private processedIds = new Set<string>();
  private readonly filePath: string;
  private lockChain: Promise<any> = Promise.resolve();

  constructor(options?: { filePath?: string; allowLocalFilesystemInProduction?: boolean }) {
    if (process.env.NODE_ENV === 'production' && !options?.allowLocalFilesystemInProduction) {
      throw new Error(
        'STORAGE_UNCONFIGURED: PersistentWebhookHandoffQueue uses local filesystem storage and is strictly LOCAL_DEVELOPMENT_ONLY. It cannot be used in production serverless environments. Configure a durable PostgreSQL / Supabase queue repository.'
      );
    }
    this.filePath = options?.filePath || path.join(process.cwd(), '.cache', 'webhook_handoff_queue.json');
    this.loadFromDisk();
  }

  private async runLocked<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.lockChain.then(async () => {
      return await fn();
    });
    this.lockChain = next.catch(() => {});
    return next;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.queue)) {
          this.queue = parsed.queue.map((item: any) => {
            if (item && item.event) {
              return item as InternalQueueJob;
            }
            // Backward compatibility for raw events
            return {
              event: item as MediaIngressHandoffEvent,
              status: 'PENDING' as QueueJobStatus,
              attempts: 0,
              maxAttempts: 3,
            };
          });
        }
        if (Array.isArray(parsed.processedIds)) {
          this.processedIds = new Set(parsed.processedIds);
        }
      }
    } catch {
      // Fallback to in-memory on read-only environments
    }
  }

  private flushToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        queue: this.queue,
        processedIds: Array.from(this.processedIds),
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Ignore disk write errors on read-only runtimes
    }
  }

  public async enqueue(
    event: Omit<MediaIngressHandoffEvent, 'eventId' | 'receivedAt'>,
    maxAttempts: number = 3
  ): Promise<{ enqueued: boolean; eventId: string; queueDepth: number; isDuplicate: boolean }> {
    return this.runLocked(async () => {
      // Deduplicate on mediaId
      if (this.processedIds.has(event.mediaId) || this.queue.some((j) => j.event.mediaId === event.mediaId)) {
        return {
          enqueued: false,
          eventId: `dup-${event.mediaId}`,
          queueDepth: this.queue.filter((j) => j.status === 'PENDING').length,
          isDuplicate: true,
        };
      }

      const eventId = `ev-handoff-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const fullEvent: MediaIngressHandoffEvent = {
        ...event,
        eventId,
        receivedAt: new Date().toISOString(),
      };

      const job: InternalQueueJob = {
        event: fullEvent,
        status: 'PENDING',
        attempts: 0,
        maxAttempts,
      };

      this.queue.push(job);
      this.flushToDisk();

      return {
        enqueued: true,
        eventId,
        queueDepth: this.queue.filter((j) => j.status === 'PENDING').length,
        isDuplicate: false,
      };
    });
  }

  public async pollNext(batchSize: number = 10): Promise<MediaIngressHandoffEvent[]> {
    return this.runLocked(async () => {
      const now = Date.now();
      const eligible = this.queue.filter(
        (j) =>
          j.status === 'PENDING' ||
          (j.status === 'CLAIMED' && j.leaseExpiresAt && new Date(j.leaseExpiresAt).getTime() < now)
      );
      return eligible.slice(0, batchSize).map((j) => j.event);
    });
  }

  public async claimNext(workerId: string, leaseDurationMs: number = 30000): Promise<MediaIngressHandoffEvent | null> {
    return this.runLocked(async () => {
      const now = Date.now();
      for (const job of this.queue) {
        const isExpiredClaim =
          job.status === 'CLAIMED' && job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < now;
        if (job.status === 'PENDING' || isExpiredClaim) {
          if (job.attempts >= job.maxAttempts) {
            job.status = 'DEAD_LETTER';
            continue;
          }

          job.attempts += 1;
          job.status = 'CLAIMED';
          job.workerId = workerId;
          job.leaseExpiresAt = new Date(now + leaseDurationMs).toISOString();
          this.flushToDisk();
          return job.event;
        }
      }
      return null;
    });
  }

  public async extendLease(eventId: string, workerId: string, additionalMs: number): Promise<boolean> {
    return this.runLocked(async () => {
      const now = Date.now();
      const job = this.queue.find((j) => j.event.eventId === eventId);
      if (!job || job.status !== 'CLAIMED' || job.workerId !== workerId) {
        return false;
      }
      if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < now) {
        return false; // Lease already expired
      }
      job.leaseExpiresAt = new Date(now + additionalMs).toISOString();
      this.flushToDisk();
      return true;
    });
  }

  public async acknowledge(eventId: string, workerId?: string): Promise<boolean> {
    return this.runLocked(async () => {
      const idx = this.queue.findIndex((j) => j.event.eventId === eventId);
      if (idx === -1) return false;

      const job = this.queue[idx];
      if (workerId && job.workerId && job.workerId !== workerId) {
        return false;
      }

      this.queue.splice(idx, 1);
      this.processedIds.add(job.event.mediaId);
      this.flushToDisk();
      return true;
    });
  }

  public async failJob(
    eventId: string,
    workerId: string,
    error: string,
    retryable: boolean = true
  ): Promise<{ deadLetter: boolean; attempts: number }> {
    return this.runLocked(async () => {
      const job = this.queue.find((j) => j.event.eventId === eventId);
      if (!job) {
        return { deadLetter: false, attempts: 0 };
      }
      job.lastError = error;

      if (!retryable || job.attempts >= job.maxAttempts) {
        job.status = 'DEAD_LETTER';
        job.workerId = undefined;
        job.leaseExpiresAt = undefined;
        this.flushToDisk();
        return { deadLetter: true, attempts: job.attempts };
      }

      job.status = 'PENDING';
      job.workerId = undefined;
      job.leaseExpiresAt = undefined;
      this.flushToDisk();
      return { deadLetter: false, attempts: job.attempts };
    });
  }

  public async recoverStaleLeases(): Promise<number> {
    return this.runLocked(async () => {
      const now = Date.now();
      let recovered = 0;
      for (const job of this.queue) {
        if (job.status === 'CLAIMED' && job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < now) {
          if (job.attempts >= job.maxAttempts) {
            job.status = 'DEAD_LETTER';
          } else {
            job.status = 'PENDING';
            job.workerId = undefined;
            job.leaseExpiresAt = undefined;
            recovered += 1;
          }
        }
      }
      if (recovered > 0) {
        this.flushToDisk();
      }
      return recovered;
    });
  }

  public async getPendingCount(): Promise<number> {
    return this.runLocked(async () => {
      const now = Date.now();
      return this.queue.filter(
        (j) =>
          j.status === 'PENDING' ||
          (j.status === 'CLAIMED' && j.leaseExpiresAt && new Date(j.leaseExpiresAt).getTime() < now)
      ).length;
    });
  }

  public async getDeadLetterCount(): Promise<number> {
    return this.runLocked(async () => {
      return this.queue.filter((j) => j.status === 'DEAD_LETTER').length;
    });
  }

  public async clear(): Promise<void> {
    return this.runLocked(async () => {
      this.queue = [];
      this.processedIds.clear();
      try {
        if (fs.existsSync(this.filePath)) {
          fs.unlinkSync(this.filePath);
        }
      } catch {}
    });
  }
}

/**
 * Token Resolver Interface:
 * Resolves an uploadToken dispatched during voice or WhatsApp outreach
 * to the target beneficiary submission and expected document type.
 */
export interface UploadTokenResolver {
  resolveToken(token: string): Promise<{
    valid: boolean;
    targetSubmissionId?: string;
    targetChildName?: string;
    documentType?: BeneficiaryDocumentType;
    error?: string;
  }>;
}

/**
 * Translates a dequeued MediaIngressHandoffEvent into an executable MediaProcessingJob.
 */
export async function translateHandoffEventToJob(
  event: MediaIngressHandoffEvent,
  tokenResolver: UploadTokenResolver
): Promise<{
  success: boolean;
  job?: MediaProcessingJob;
  error?: string;
}> {
  if (!event.uploadToken) {
    return {
      success: false,
      error: 'Cannot process media: Missing uploadToken in ingress handoff event.',
    };
  }

  const resolved = await tokenResolver.resolveToken(event.uploadToken);
  if (!resolved.valid || !resolved.targetSubmissionId || !resolved.targetChildName || !resolved.documentType) {
    return {
      success: false,
      error: `Token resolution failed: ${resolved.error || 'Invalid or expired uploadToken'}`,
    };
  }

  return {
    success: true,
    job: {
      jobId: `job-from-${event.eventId}`,
      mediaId: event.mediaId,
      mimeType: event.mimeType,
      expectedSha256: event.sha256,
      targetSubmissionId: resolved.targetSubmissionId,
      targetChildName: resolved.targetChildName,
      documentType: resolved.documentType,
      sourceOrigin: 'META_WHATSAPP_WEBHOOK',
    },
  };
}
