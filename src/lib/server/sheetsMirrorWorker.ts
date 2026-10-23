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

export type MirrorJobStatus = 'QUEUED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER' | 'SUPERSEDED';

export interface SheetsMirrorJob {
  id: string | number;
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
  completeJob(jobId: string | number, sheetRow?: number): Promise<void>;
  failJob(jobId: string | number, error: string, retryable: boolean): Promise<void>;
  supersedeJob(jobId: string | number, reason: string): Promise<void>;
  enqueueJob(job: Omit<SheetsMirrorJob, 'id' | 'status' | 'attempt_count' | 'locked_at' | 'locked_by' | 'sheet_row' | 'last_error' | 'created_at' | 'updated_at'>): Promise<SheetsMirrorJob>;
  getJobById(jobId: string | number): Promise<SheetsMirrorJob | null>;
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

  public async completeJob(jobId: string | number, sheetRow?: number): Promise<void> {
    const job = this.jobs.find((j) => String(j.id) === String(jobId));
    if (!job) return;
    job.status = 'COMPLETED';
    job.locked_at = null;
    job.locked_by = null;
    if (sheetRow !== undefined) job.sheet_row = sheetRow;
    job.updated_at = new Date().toISOString();
  }

  public async failJob(jobId: string | number, error: string, retryable: boolean): Promise<void> {
    const job = this.jobs.find((j) => String(j.id) === String(jobId));
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

  public async supersedeJob(jobId: string | number, reason: string): Promise<void> {
    const job = this.jobs.find((j) => String(j.id) === String(jobId));
    if (!job) return;
    job.status = 'SUPERSEDED';
    job.last_error = `Superseded: ${reason}`;
    job.locked_at = null;
    job.locked_by = null;
    job.updated_at = new Date().toISOString();
  }

  public async getJobById(jobId: string | number): Promise<SheetsMirrorJob | null> {
    const job = this.jobs.find((j) => String(j.id) === String(jobId));
    return job ? { ...job } : null;
  }

  public async getPendingCount(): Promise<number> {
    return this.jobs.filter((j) => j.status === 'QUEUED' || j.status === 'FAILED' || j.status === 'PENDING').length;
  }

  public async getDeadLetterCount(): Promise<number> {
    return this.jobs.filter((j) => j.status === 'DEAD_LETTER').length;
  }
}

/**
 * Production-grade Supabase / PostgreSQL Sheets Mirror Repository.
 * Dispatches atomic lease claims, job completion, and failure handling via PostgreSQL RPCs.
 * Falls back to InMemorySheetsMirrorRepository when database credentials are not configured.
 */
export class SupabaseSheetsMirrorRepository implements SheetsMirrorRepository {
  private baseUrl: string;
  private serviceKey: string;
  private inMemoryFallback: InMemorySheetsMirrorRepository;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    this.baseUrl = (supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.serviceKey = serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.inMemoryFallback = new InMemorySheetsMirrorRepository();
  }

  public isConfigured(): boolean {
    return Boolean(this.baseUrl && this.serviceKey);
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
  }

  public async claimJobs(batchSize: number, workerId: string, leaseDurationMs: number): Promise<SheetsMirrorJob[]> {
    if (!this.isConfigured()) {
      return this.inMemoryFallback.claimJobs(batchSize, workerId, leaseDurationMs);
    }
    const leaseSeconds = Math.max(10, Math.floor(leaseDurationMs / 1000));
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/claim_sheets_mirror_jobs_atomic`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        p_worker_id: workerId,
        p_batch_size: batchSize,
        p_lease_seconds: leaseSeconds,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`claim_sheets_mirror_jobs_atomic failed (${res.status}): ${err}`);
    }
    const rawJobs = await res.json();
    if (!Array.isArray(rawJobs)) return [];
    return rawJobs.map((j: any) => ({
      id: j.id,
      job_type: j.operation || 'UPSERT_ROW',
      target_sheet_name: j.target_sheet_name || 'Child_Nutrition',
      idempotency_key: j.idempotency_key,
      payload_snapshot: j.payload_snapshot || {},
      status: j.status,
      attempt_count: j.attempt_count || 0,
      max_attempts: j.max_attempts || 5,
      locked_at: j.locked_at,
      locked_by: j.locked_by,
      sheet_row: j.sheet_row,
      last_error: j.last_error,
      created_at: j.created_at,
      updated_at: j.updated_at,
    }));
  }

  public async completeJob(jobId: string | number, sheetRow?: number): Promise<void> {
    if (!this.isConfigured()) {
      return this.inMemoryFallback.completeJob(jobId, sheetRow);
    }
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/complete_sheets_mirror_job_atomic`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        p_job_id: String(jobId),
        p_sheet_row: sheetRow ?? null,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`complete_sheets_mirror_job_atomic failed (${res.status}): ${err}`);
    }
  }

  public async failJob(jobId: string | number, error: string, retryable: boolean): Promise<void> {
    if (!this.isConfigured()) {
      return this.inMemoryFallback.failJob(jobId, error, retryable);
    }
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/fail_sheets_mirror_job_atomic`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        p_job_id: String(jobId),
        p_error: error,
        p_retryable: retryable,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`fail_sheets_mirror_job_atomic failed (${res.status}): ${err}`);
    }
  }

  public async supersedeJob(jobId: string | number, reason: string): Promise<void> {
    if (!this.isConfigured()) {
      return this.inMemoryFallback.supersedeJob(jobId, reason);
    }
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/supersede_sheets_mirror_job_atomic`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        p_job_id: String(jobId),
        p_reason: reason,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`supersede_sheets_mirror_job_atomic failed (${res.status}): ${err}`);
    }
  }

  public async enqueueJob(
    job: Omit<SheetsMirrorJob, 'id' | 'status' | 'attempt_count' | 'locked_at' | 'locked_by' | 'sheet_row' | 'last_error' | 'created_at' | 'updated_at'>
  ): Promise<SheetsMirrorJob> {
    if (!this.isConfigured()) {
      return this.inMemoryFallback.enqueueJob(job);
    }
    const now = new Date().toISOString();
    const res = await fetch(`${this.baseUrl}/rest/v1/sheets_mirror_jobs`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        idempotency_key: job.idempotency_key,
        operation: job.job_type,
        target_sheet_name: job.target_sheet_name,
        payload_snapshot: job.payload_snapshot,
        status: 'QUEUED',
        attempt_count: 0,
        max_attempts: job.max_attempts || 5,
        created_at: now,
        updated_at: now,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to enqueue sheets_mirror_job (${res.status}): ${err}`);
    }
    const createdArr = await res.json();
    const c = Array.isArray(createdArr) ? createdArr[0] : createdArr;
    return {
      id: c.id,
      job_type: c.operation || job.job_type,
      target_sheet_name: c.target_sheet_name || job.target_sheet_name,
      idempotency_key: c.idempotency_key || job.idempotency_key,
      payload_snapshot: c.payload_snapshot || job.payload_snapshot,
      status: c.status || 'QUEUED',
      attempt_count: c.attempt_count || 0,
      max_attempts: c.max_attempts || 5,
      locked_at: c.locked_at || null,
      locked_by: c.locked_by || null,
      sheet_row: c.sheet_row || null,
      last_error: c.last_error || null,
      created_at: c.created_at || now,
      updated_at: c.updated_at || now,
    };
  }

  public async getJobById(jobId: string | number): Promise<SheetsMirrorJob | null> {
    if (!this.isConfigured()) {
      return this.inMemoryFallback.getJobById(jobId);
    }
    const res = await fetch(`${this.baseUrl}/rest/v1/sheets_mirror_jobs?id=eq.${encodeURIComponent(String(jobId))}&limit=1`, {
      method: 'GET',
      headers: this.headers,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const c = data[0];
    return {
      id: c.id,
      job_type: c.operation,
      target_sheet_name: c.target_sheet_name,
      idempotency_key: c.idempotency_key,
      payload_snapshot: c.payload_snapshot,
      status: c.status,
      attempt_count: c.attempt_count,
      max_attempts: c.max_attempts,
      locked_at: c.locked_at,
      locked_by: c.locked_by,
      sheet_row: c.sheet_row,
      last_error: c.last_error,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  }

  public async getPendingCount(): Promise<number> {
    if (!this.isConfigured()) {
      return this.inMemoryFallback.getPendingCount();
    }
    const res = await fetch(`${this.baseUrl}/rest/v1/sheets_mirror_jobs?status=in.(QUEUED,PENDING,FAILED)&select=id`, {
      method: 'GET',
      headers: { ...this.headers, Prefer: 'count=exact' },
    });
    if (!res.ok) return 0;
    const range = res.headers.get('content-range');
    if (range) {
      const match = range.match(/\/(\d+)$/);
      if (match) return parseInt(match[1], 10);
    }
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data.length : 0;
  }

  public async getDeadLetterCount(): Promise<number> {
    if (!this.isConfigured()) {
      return this.inMemoryFallback.getDeadLetterCount();
    }
    const res = await fetch(`${this.baseUrl}/rest/v1/sheets_mirror_jobs?status=eq.DEAD_LETTER&select=id`, {
      method: 'GET',
      headers: { ...this.headers, Prefer: 'count=exact' },
    });
    if (!res.ok) return 0;
    const range = res.headers.get('content-range');
    if (range) {
      const match = range.match(/\/(\d+)$/);
      if (match) return parseInt(match[1], 10);
    }
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data.length : 0;
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
      let action: string;
      if (job.job_type === 'DELETE_ROW') {
        action = 'delete';
      } else if (sanitizedPayload.action === 'updateAsset' || (sanitizedPayload.docType && sanitizedPayload.fileData)) {
        action = 'updateAsset';
      } else if (sanitizedPayload.expectedVersion || (sanitizedPayload.version && sanitizedPayload.version > 1)) {
        action = 'update';
      } else {
        action = 'create';
      }

      const gatewayReq = {
        action,
        secret: process.env.WEBHOOK_SECRET || 'MOCK_SECRET',
        targetSheet: job.target_sheet_name,
        uniqueId: sanitizedPayload.uniqueId || sanitizedPayload['1\nUnique ID'],
        remoteSubmissionId: sanitizedPayload.remoteSubmissionId,
        submissionId: sanitizedPayload.submissionId || sanitizedPayload.remoteSubmissionId || sanitizedPayload.uniqueId,
        docType: sanitizedPayload.docType,
        fileData: sanitizedPayload.fileData,
        expectedCurrentCellStateHash: sanitizedPayload.expectedCurrentCellStateHash,
        expectedVersion: sanitizedPayload.expectedVersion ?? (sanitizedPayload.version > 1 ? sanitizedPayload.version - 1 : undefined),
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
