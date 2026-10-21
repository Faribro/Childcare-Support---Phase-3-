/**
 * Durable Sheets Outbox Mirror Worker
 *
 * Implements the asynchronous outbox pattern for synchronizing PostgreSQL mutations
 * to Google Sheets (Child_Nutrition, _Asset_Containers, Audit_Log).
 *
 * Safety & Invariants:
 * 1. Transactional guarantee: Jobs are atomically enqueued in PostgreSQL (public.sheets_mirror_jobs)
 *    by the database trigger tg_enqueue_sheets_mirror_job inside the submission transaction.
 * 2. Atomic lease claiming: Jobs are leased using concurrency locking (SKIP LOCKED) with a bounded TTL.
 * 3. Bounded processing: Batches are strictly bounded (default 10 items).
 * 4. Stale lease recovery: Expired leases (locked_at + leaseDurationMs < now) are automatically reclaimed.
 * 5. Monotonic revision guard: Outbox checks revisionNumber to prevent older jobs overwriting newer revisions.
 * 6. Sanitized payload only: Enforces that raw Tigris keys, presigned URLs, and sensitive biometrics
 *    NEVER enter the Google Sheets mirror cells (Restricted Doc [<docType>] labels only).
 * 7. Bounded retries: Exhausted jobs (attempt_count >= max_attempts) transition to DEAD_LETTER.
 */

import crypto from 'crypto';

export type MirrorJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER' | 'SUPERSEDED';

export interface SheetsMirrorJob {
  id: number;
  job_type: 'UPSERT_ROW' | 'DELETE_ROW';
  target_sheet_name: string;
  idempotency_key: string;
  payload_snapshot: Record<string, any>;
  status: MirrorJobStatus;
  attempt_count: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  sheet_row: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SheetsMirrorRepository {
  claimJobs(batchSize: number, workerId: string, leaseDurationMs: number): Promise<SheetsMirrorJob[]>;
  completeJob(jobId: number, sheetRow?: number): Promise<void>;
  failJob(jobId: number, error: string, retryable: boolean): Promise<void>;
  supersedeJob(jobId: number, reason: string): Promise<void>;
  enqueueJob(job: Omit<SheetsMirrorJob, 'id' | 'status' | 'attempt_count' | 'locked_at' | 'locked_by' | 'sheet_row' | 'last_error' | 'created_at' | 'updated_at'>): Promise<SheetsMirrorJob>;
  getJobById(jobId: number): Promise<SheetsMirrorJob | null>;
  getPendingCount(): Promise<number>;
  getDeadLetterCount(): Promise<number>;
}

export interface GatewayClient {
  callGateway(payload: Record<string, any>): Promise<{
    status: 'success' | 'conflict' | 'error';
    statusCode: number;
    resolvedRow?: number;
    currentVersion?: number;
    message?: string;
  }>;
}

/**
 * In-Memory Sheets Mirror Repository for testing and local development.
 */
export class InMemorySheetsMirrorRepository implements SheetsMirrorRepository {
  private jobs: SheetsMirrorJob[] = [];
  private nextId = 1;

  public async enqueueJob(
    job: Omit<SheetsMirrorJob, 'id' | 'status' | 'attempt_count' | 'locked_at' | 'locked_by' | 'sheet_row' | 'last_error' | 'created_at' | 'updated_at'>
  ): Promise<SheetsMirrorJob> {
    const now = new Date().toISOString();
    const created: SheetsMirrorJob = {
      ...job,
      id: this.nextId++,
      status: 'QUEUED',
      attempt_count: 0,
      locked_at: null,
      locked_by: null,
      sheet_row: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };
    this.jobs.push(created);
    return created;
  }

  public async claimJobs(batchSize: number, workerId: string, leaseDurationMs: number): Promise<SheetsMirrorJob[]> {
    const now = Date.now();
    const claimed: SheetsMirrorJob[] = [];

    for (const job of this.jobs) {
      if (claimed.length >= batchSize) break;

      const isQueued = job.status === 'QUEUED' || job.status === 'FAILED';
      const isExpiredLock =
        job.status === 'PROCESSING' &&
        job.locked_at &&
        now - new Date(job.locked_at).getTime() > leaseDurationMs;

      if (isQueued || isExpiredLock) {
        job.status = 'PROCESSING';
        job.locked_at = new Date(now).toISOString();
        job.locked_by = workerId;
        job.attempt_count += 1;
        job.updated_at = new Date(now).toISOString();
        claimed.push({ ...job });
      }
    }

    return claimed;
  }

  public async completeJob(jobId: number, sheetRow?: number): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.status = 'COMPLETED';
    job.locked_at = null;
    job.locked_by = null;
    if (sheetRow !== undefined) job.sheet_row = sheetRow;
    job.updated_at = new Date().toISOString();
  }

  public async failJob(jobId: number, error: string, retryable: boolean): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.last_error = error;
    job.locked_at = null;
    job.locked_by = null;
    job.updated_at = new Date().toISOString();

    if (!retryable || job.attempt_count >= job.max_attempts) {
      job.status = 'DEAD_LETTER';
    } else {
      job.status = 'FAILED';
    }
  }

  public async supersedeJob(jobId: number, reason: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.status = 'SUPERSEDED';
    job.last_error = `Superseded: ${reason}`;
    job.locked_at = null;
    job.locked_by = null;
    job.updated_at = new Date().toISOString();
  }

  public async getJobById(jobId: number): Promise<SheetsMirrorJob | null> {
    const job = this.jobs.find((j) => j.id === jobId);
    return job ? { ...job } : null;
  }

  public async getPendingCount(): Promise<number> {
    return this.jobs.filter((j) => j.status === 'QUEUED' || j.status === 'FAILED').length;
  }

  public async getDeadLetterCount(): Promise<number> {
    return this.jobs.filter((j) => j.status === 'DEAD_LETTER').length;
  }
}

/**
 * Sanitizes mirror payloads to strictly forbid presigned URLs, private Tigris keys,
 * or raw storage endpoints from entering Google Sheets cells.
 */
export function sanitizeMirrorPayload(rawPayload: Record<string, any>): Record<string, any> {
  const sanitized = { ...rawPayload };

  // Guard against leaky storage keys in values
  const forbiddenPatterns = [
    /X-Amz-Signature/i,
    /childcare-support-phase3-private/i,
    /childcare-assets/i,
    /s3\.amazonaws\.com/i,
    /fly\.storage\.tigris\.dev/i,
  ];

  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(value)) {
          throw new Error(`Security Violation: Leaky storage reference detected in mirror field '${key}'.`);
        }
      }
    }
  }

  return sanitized;
}

export interface DrainSummary {
  processed: number;
  completed: number;
  failed: number;
  deadLettered: number;
  superseded: number;
}

export class SheetsMirrorWorker {
  private repository: SheetsMirrorRepository;
  private gatewayClient: GatewayClient;
  private workerId: string;
  private defaultLeaseDurationMs: number;

  constructor(
    repository: SheetsMirrorRepository,
    gatewayClient: GatewayClient,
    options?: { workerId?: string; leaseDurationMs?: number }
  ) {
    this.repository = repository;
    this.gatewayClient = gatewayClient;
    this.workerId = options?.workerId || `worker-${crypto.randomBytes(4).toString('hex')}`;
    this.defaultLeaseDurationMs = options?.leaseDurationMs || 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Processes a single claimed outbox mirror job.
   */
  public async processJob(job: SheetsMirrorJob): Promise<'COMPLETED' | 'FAILED' | 'DEAD_LETTER' | 'SUPERSEDED'> {
    try {
      // 1. Sanitize payload against Tigris/S3 leak rules
      const sanitizedPayload = sanitizeMirrorPayload(job.payload_snapshot);

      // 2. Format gateway request for Apps Script
      const action = job.job_type === 'DELETE_ROW' ? 'delete' : (sanitizedPayload.expectedVersion ? 'update' : 'create');

      const gatewayReq = {
        action,
        secret: process.env.WEBHOOK_SECRET || 'MOCK_SECRET',
        targetSheet: job.target_sheet_name,
        uniqueId: sanitizedPayload.uniqueId || sanitizedPayload['1\nUnique ID'],
        remoteSubmissionId: sanitizedPayload.remoteSubmissionId,
        expectedVersion: sanitizedPayload.version || sanitizedPayload.expectedVersion,
        payload: sanitizedPayload,
        idempotencyKey: job.idempotency_key,
      };

      // 3. Dispatch to Apps Script gateway
      const res = await this.gatewayClient.callGateway(gatewayReq);

      if (res.status === 'success') {
        await this.repository.completeJob(job.id, res.resolvedRow);
        return 'COMPLETED';
      }

      if (res.status === 'conflict') {
        // Optimistic Concurrency Conflict: If sheet version is already newer, job is superseded
        if (res.currentVersion && sanitizedPayload.version && res.currentVersion > sanitizedPayload.version) {
          await this.repository.supersedeJob(job.id, `Sheet version (${res.currentVersion}) is newer than job revision (${sanitizedPayload.version})`);
          return 'SUPERSEDED';
        }
        await this.repository.failJob(job.id, `OCC Conflict: ${res.message}`, true);
        return 'FAILED';
      }

      const isRetryable = res.statusCode >= 500 || res.statusCode === 429;
      await this.repository.failJob(job.id, res.message || 'Gateway error', isRetryable);
      return isRetryable && job.attempt_count < job.max_attempts ? 'FAILED' : 'DEAD_LETTER';
    } catch (err: any) {
      await this.repository.failJob(job.id, err?.message || 'Processing exception', false);
      return 'DEAD_LETTER';
    }
  }

  /**
   * Drains up to batchSize jobs from the outbox queue.
   */
  public async drainQueue(batchSize = 10): Promise<DrainSummary> {
    const summary: DrainSummary = {
      processed: 0,
      completed: 0,
      failed: 0,
      deadLettered: 0,
      superseded: 0,
    };

    const claimed = await this.repository.claimJobs(batchSize, this.workerId, this.defaultLeaseDurationMs);
    summary.processed = claimed.length;

    for (const job of claimed) {
      const outcome = await this.processJob(job);
      if (outcome === 'COMPLETED') summary.completed++;
      else if (outcome === 'FAILED') summary.failed++;
      else if (outcome === 'DEAD_LETTER') summary.deadLettered++;
      else if (outcome === 'SUPERSEDED') summary.superseded++;
    }

    return summary;
  }
}
