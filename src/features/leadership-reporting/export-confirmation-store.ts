import crypto from 'crypto';
import {
  CallerSecurityContext,
  ExportDeliveryJob,
  ExportPreviewContract,
} from './types';
import { computeImmutableExportHash } from './export-contract-service';
import { getAppEnvConfig } from '@/lib/server/envConfig';

export type TokenConsumptionStatus =
  | 'CONSUMED'
  | 'ALREADY_CONSUMED'
  | 'EXPIRED'
  | 'NOT_FOUND'
  | 'MISMATCH'
  | 'AUTH_DENIED'
  | 'INVALID_CODE';

export interface TokenConsumptionResult {
  readonly success: boolean;
  readonly status: TokenConsumptionStatus;
  readonly job?: ExportDeliveryJob;
  readonly preview?: ExportPreviewContract;
  readonly errorReason?: string;
}

export interface IExportConfirmationStore {
  registerPreviewContract(contract: ExportPreviewContract): Promise<void>;
  consumeConfirmationTokenAtomic(params: {
    exportId: string;
    parametersHash: string;
    userId: string;
    userConfirmationText: string;
    caller: CallerSecurityContext;
  }): Promise<TokenConsumptionResult>;
  getJob(jobId: string): Promise<ExportDeliveryJob | null>;
  updateJobStatus(
    jobId: string,
    status: ExportDeliveryJob['status'],
    errorReason?: string
  ): Promise<void>;
  claimDeliveryJob?(
    workerId: string,
    leaseTimeoutMs?: number
  ): Promise<ExportDeliveryJob | null>;
  recoverStaleDeliveryJobs?(
    leaseTimeoutMs?: number
  ): Promise<ExportDeliveryJob[]>;
}

/**
 * In-memory implementation of IExportConfirmationStore with atomic concurrency protection.
 * Ensures single-use guarantee even under high concurrency.
 */
export class InMemoryExportConfirmationStore implements IExportConfirmationStore {
  private readonly previews = new Map<string, ExportPreviewContract>();
  private readonly consumedTokens = new Set<string>();
  private readonly inFlightLocks = new Set<string>();
  private readonly jobs = new Map<string, ExportDeliveryJob>();

  public async registerPreviewContract(contract: ExportPreviewContract): Promise<void> {
    this.previews.set(contract.exportId, JSON.parse(JSON.stringify(contract)));
  }

  public async consumeConfirmationTokenAtomic(params: {
    exportId: string;
    parametersHash: string;
    userId: string;
    userConfirmationText: string;
    caller: CallerSecurityContext;
  }): Promise<TokenConsumptionResult> {
    const { exportId, parametersHash, userId, userConfirmationText, caller } = params;

    // 1. Atomic in-flight lock and replay check
    if (this.consumedTokens.has(exportId) || this.inFlightLocks.has(exportId)) {
      return {
        success: false,
        status: 'ALREADY_CONSUMED',
        errorReason:
          'REPLAY_REJECTED: This export preview has already been confirmed and queued for delivery. Duplicate execution blocked.',
      };
    }

    // Acquire lock immediately (synchronous check-and-set in JavaScript event loop)
    this.inFlightLocks.add(exportId);

    try {
      const preview = this.previews.get(exportId);
      if (!preview) {
        return {
          success: false,
          status: 'NOT_FOUND',
          errorReason: `Export preview contract '${exportId}' not found. Please request a new export.`,
        };
      }

      if (preview.isConsumed) {
        this.consumedTokens.add(exportId);
        return {
          success: false,
          status: 'ALREADY_CONSUMED',
          errorReason:
            'REPLAY_REJECTED: This export preview has already been consumed. Duplicate execution blocked.',
        };
      }

      // 2. Caller ownership check
      if (caller.userId !== preview.recipientUserId || userId !== preview.recipientUserId) {
        return {
          success: false,
          status: 'MISMATCH',
          errorReason: `Cross-user export confirmation denied. Caller '${caller.userId}' cannot confirm preview owned by '${preview.recipientUserId}'.`,
        };
      }

      // 3. Execution-time identity active check
      if (caller.isActive === false) {
        return {
          success: false,
          status: 'AUTH_DENIED',
          errorReason: `ACCOUNT_DEACTIVATED: Caller '${caller.userId}' has been deactivated. Export execution blocked fail-closed.`,
        };
      }

      // 4. Execution-time geographic scope check
      if (preview.stateFilter && !caller.permittedStates.includes('*')) {
        const permittedLower = caller.permittedStates.map((s) => s.toLowerCase());
        if (!permittedLower.includes(preview.stateFilter.toLowerCase())) {
          return {
            success: false,
            status: 'AUTH_DENIED',
            errorReason: `EXECUTION_AUTH_DENIED: Caller '${caller.userId}' (${caller.role}) is unauthorized for '${preview.stateFilter}' at execution time. Permitted states: [${caller.permittedStates.join(', ')}].`,
          };
        }
      }

      // 5. Execution-time district scope check
      if (
        preview.districtFilter &&
        caller.permittedDistricts &&
        !caller.permittedDistricts.includes('*')
      ) {
        const permittedDistLower = caller.permittedDistricts.map((d) => d.toLowerCase());
        if (!permittedDistLower.includes(preview.districtFilter.toLowerCase())) {
          return {
            success: false,
            status: 'AUTH_DENIED',
            errorReason: `EXECUTION_AUTH_DENIED: Caller '${caller.userId}' (${caller.role}) is unauthorized for district '${preview.districtFilter}' at execution time.`,
          };
        }
      }

      // 6. Expiry check (5-minute TTL)
      if (new Date().toISOString() > preview.expiresAt) {
        return {
          success: false,
          status: 'EXPIRED',
          errorReason:
            'Export preview has expired (5-minute window exceeded). Please request a new export.',
        };
      }

      // 7. Parameters integrity check
      const currentHash = computeImmutableExportHash({
        exportId: preview.exportId,
        recipientUserId: preview.recipientUserId,
        recipientEmailExact: preview.recipientEmailExact,
        year: preview.year,
        monthOrRange: preview.monthRange || preview.month,
        dateBasis: preview.dateBasis,
        stateFilter: preview.stateFilter,
        columns: preview.columns,
      });

      if (currentHash !== parametersHash || currentHash !== preview.immutableParametersHash) {
        return {
          success: false,
          status: 'MISMATCH',
          errorReason: 'INTEGRITY_VIOLATION: Export parameters were modified after preview was generated.',
        };
      }

      // 8. Confirmation code check
      const normalizedCode = userConfirmationText.trim().toUpperCase();
      if (
        normalizedCode !== 'CONFIRM EXPORT' &&
        normalizedCode !== 'CONFIRM' &&
        normalizedCode !== 'YES'
      ) {
        return {
          success: false,
          status: 'INVALID_CODE',
          errorReason: "Invalid confirmation. Please reply with 'CONFIRM EXPORT' or 'CANCEL'.",
        };
      }

      // 9. Atomic consumption
      preview.isConsumed = true;
      preview.consumedAt = new Date().toISOString();
      this.consumedTokens.add(exportId);

      // 10. Create queued delivery job
      const job: ExportDeliveryJob = {
        jobId: `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        exportId: preview.exportId,
        reportType: preview.reportType,
        recipientUserId: preview.recipientUserId,
        recipientEmailMasked: preview.recipientEmailMasked,
        recipientEmailExact: preview.recipientEmailExact,
        immutableParametersHash: preview.immutableParametersHash,
        status: 'QUEUED',
        attempts: 0,
        maxAttempts: 3,
        queuedAt: new Date().toISOString(),
        deliveryTarget: 'APPS_SCRIPT_EMAIL_DISPATCHER',
      };

      this.jobs.set(job.jobId, job);

      return {
        success: true,
        status: 'CONSUMED',
        job,
        preview,
      };
    } finally {
      this.inFlightLocks.delete(exportId);
    }
  }

  public async getJob(jobId: string): Promise<ExportDeliveryJob | null> {
    const j = this.jobs.get(jobId);
    return j ? JSON.parse(JSON.stringify(j)) : null;
  }

  public async updateJobStatus(
    jobId: string,
    status: ExportDeliveryJob['status'],
    errorReason?: string
  ): Promise<void> {
    const j = this.jobs.get(jobId);
    if (j) {
      this.jobs.set(jobId, {
        ...j,
        status,
        errorReason,
        dispatchedAt: status === 'SENT' ? new Date().toISOString() : j.dispatchedAt,
      });
    }
  }

  public async claimDeliveryJob(
    workerId: string,
    leaseTimeoutMs: number = 300000
  ): Promise<ExportDeliveryJob | null> {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      const isExpired = job.leaseExpiresAt
        ? new Date(job.leaseExpiresAt).getTime() < now
        : false;
      const canClaim =
        job.status === 'QUEUED' || (job.status === 'PROCESSING' && isExpired);

      if (canClaim && (job.attempts || 0) < (job.maxAttempts || 3)) {
        const updated: ExportDeliveryJob = {
          ...job,
          status: 'PROCESSING',
          leaseWorkerId: workerId,
          leaseExpiresAt: new Date(now + leaseTimeoutMs).toISOString(),
          attempts: (job.attempts || 0) + 1,
        };
        this.jobs.set(jobId, updated);
        return updated;
      }
    }
    return null;
  }

  public async recoverStaleDeliveryJobs(
    leaseTimeoutMs: number = 300000
  ): Promise<ExportDeliveryJob[]> {
    const now = Date.now();
    const recovered: ExportDeliveryJob[] = [];
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'PROCESSING' && job.leaseExpiresAt) {
        if (new Date(job.leaseExpiresAt).getTime() < now) {
          const updated: ExportDeliveryJob = {
            ...job,
            status: 'UNCERTAIN',
            errorReason: 'Worker lease expired before completion confirmation',
          };
          this.jobs.set(jobId, updated);
          recovered.push(updated);
        }
      }
    }
    return recovered;
  }

  public clear(): void {
    this.previews.clear();
    this.consumedTokens.clear();
    this.inFlightLocks.clear();
    this.jobs.clear();
  }
}

/**
 * Supabase PostgREST Export Confirmation Store
 * Uses PostgreSQL row locks and atomic RPC functions against public.export_confirmation_tokens and public.export_delivery_jobs.
 */
export class SupabaseExportConfirmationStore implements IExportConfirmationStore {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fallbackMemory: InMemoryExportConfirmationStore;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    const env = getAppEnvConfig();
    this.baseUrl = (supabaseUrl || env.supabaseUrl || '').replace(/\/+$/, '');
    this.apiKey = serviceRoleKey || env.supabaseServiceRoleKey || '';
    this.fallbackMemory = new InMemoryExportConfirmationStore();
  }

  private get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private get isProduction(): boolean {
    return (
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL_ENV === 'production'
    );
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
  }

  public async registerPreviewContract(contract: ExportPreviewContract): Promise<void> {
    await this.fallbackMemory.registerPreviewContract(contract);

    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Export store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
        );
      }
      return;
    }

    try {
      const url = `${this.baseUrl}/rest/v1/export_confirmation_tokens`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          export_id: contract.exportId,
          recipient_user_id: contract.recipientUserId,
          parameters_hash: contract.immutableParametersHash,
          preview_contract: contract,
          is_consumed: false,
          expires_at: contract.expiresAt,
        }),
      });

      if (!res.ok && this.isProduction) {
        throw new Error(`DURABLE_STORAGE_ERROR: Failed to register export token: HTTP ${res.status}`);
      }
    } catch (err) {
      if (this.isProduction) throw err;
    }
  }

  public async consumeConfirmationTokenAtomic(params: {
    exportId: string;
    parametersHash: string;
    userId: string;
    userConfirmationText: string;
    caller: CallerSecurityContext;
  }): Promise<TokenConsumptionResult> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Export store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      return this.fallbackMemory.consumeConfirmationTokenAtomic(params);
    }

    const { exportId, parametersHash, userId, userConfirmationText, caller } = params;

    // Validate confirmation code client-side
    const normalizedCode = userConfirmationText.trim().toUpperCase();
    if (
      normalizedCode !== 'CONFIRM EXPORT' &&
      normalizedCode !== 'CONFIRM' &&
      normalizedCode !== 'YES'
    ) {
      return {
        success: false,
        status: 'INVALID_CODE',
        errorReason: "Invalid confirmation. Please reply with 'CONFIRM EXPORT' or 'CANCEL'.",
      };
    }

    // Revalidate active identity
    if (caller.isActive === false) {
      return {
        success: false,
        status: 'AUTH_DENIED',
        errorReason: `ACCOUNT_DEACTIVATED: Caller '${caller.userId}' has been deactivated. Export execution blocked fail-closed.`,
      };
    }

    try {
      const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const url = `${this.baseUrl}/rest/v1/rpc/consume_export_confirmation_token_atomic`;

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          p_export_id: exportId,
          p_parameters_hash: parametersHash,
          p_recipient_user_id: userId,
          p_job_id: jobId,
        }),
      });

      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`ATOMIC_CONSUMPTION_FAILED: Supabase RPC returned HTTP ${res.status}: ${res.statusText}`);
        }
        return this.fallbackMemory.consumeConfirmationTokenAtomic(params);
      }

      const data = (await res.json()) as any;
      if (!data?.success) {
        return {
          success: false,
          status: data?.status || 'ALREADY_CONSUMED',
          errorReason: data?.error || 'Export token consumption failed.',
        };
      }

      await this.fallbackMemory.consumeConfirmationTokenAtomic(params);

      const job: ExportDeliveryJob = {
        jobId: data.jobId || jobId,
        exportId,
        reportType: 'LINELIST_EXPORT',
        recipientUserId: userId,
        recipientEmailMasked: '****',
        recipientEmailExact: '',
        immutableParametersHash: parametersHash,
        status: 'QUEUED',
        attempts: 0,
        maxAttempts: 3,
        queuedAt: new Date().toISOString(),
        deliveryTarget: 'APPS_SCRIPT_EMAIL_DISPATCHER',
      };

      return {
        success: true,
        status: 'CONSUMED',
        job,
      };
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.consumeConfirmationTokenAtomic(params);
    }
  }

  public async getJob(jobId: string): Promise<ExportDeliveryJob | null> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error('DURABLE_STORAGE_UNAVAILABLE: Supabase not configured in production.');
      }
      return this.fallbackMemory.getJob(jobId);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/export_delivery_jobs?job_id=eq.${encodeURIComponent(jobId)}&limit=1`;
      const res = await fetch(url, { method: 'GET', headers: this.headers });

      if (!res.ok) {
        if (this.isProduction) throw new Error(`DURABLE_STORAGE_ERROR: Failed to get job: HTTP ${res.status}`);
        return this.fallbackMemory.getJob(jobId);
      }

      const rows = (await res.json()) as any[];
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const r = rows[0];
      return {
        jobId: r.job_id,
        exportId: r.export_id,
        reportType: r.report_type,
        recipientUserId: r.recipient_user_id,
        recipientEmailMasked: r.recipient_email_masked,
        recipientEmailExact: r.recipient_email_exact,
        immutableParametersHash: r.parameters_hash,
        status: r.status,
        deliveryTarget: 'APPS_SCRIPT_EMAIL_DISPATCHER',
        leaseWorkerId: r.lease_worker_id,
        leaseExpiresAt: r.lease_expires_at,
        attempts: r.attempts,
        maxAttempts: r.max_attempts,
        errorReason: r.error_reason,
        queuedAt: r.queued_at,
        dispatchedAt: r.dispatched_at,
      };
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.getJob(jobId);
    }
  }

  public async updateJobStatus(
    jobId: string,
    status: ExportDeliveryJob['status'],
    errorReason?: string
  ): Promise<void> {
    await this.fallbackMemory.updateJobStatus(jobId, status, errorReason);

    if (!this.isConfigured) {
      if (this.isProduction) throw new Error('DURABLE_STORAGE_UNAVAILABLE: Supabase not configured in production.');
      return;
    }

    try {
      const url = `${this.baseUrl}/rest/v1/export_delivery_jobs?job_id=eq.${encodeURIComponent(jobId)}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({
          status,
          error_reason: errorReason || null,
          dispatched_at: status === 'SENT' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!res.ok && this.isProduction) {
        throw new Error(`DURABLE_STORAGE_ERROR: Failed to update job status: HTTP ${res.status}`);
      }
    } catch (err) {
      if (this.isProduction) throw err;
    }
  }

  public async claimDeliveryJob(
    workerId: string,
    leaseTimeoutMs: number = 300000
  ): Promise<ExportDeliveryJob | null> {
    if (!this.isConfigured) {
      if (this.isProduction) throw new Error('DURABLE_STORAGE_UNAVAILABLE: Supabase not configured in production.');
      return this.fallbackMemory.claimDeliveryJob(workerId, leaseTimeoutMs);
    }

    try {
      const rpcUrl = `${this.baseUrl}/rest/v1/rpc/claim_export_delivery_job_atomic`;
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          p_worker_id: workerId,
          p_lease_duration_seconds: Math.floor(leaseTimeoutMs / 1000),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data?.success && data.status === 'CLAIMED') {
          return this.getJob(data.jobId);
        }
        return null;
      }

      if (this.isProduction) throw new Error(`DURABLE_STORAGE_ERROR: Failed to claim delivery job: HTTP ${res.status}`);
      return this.fallbackMemory.claimDeliveryJob(workerId, leaseTimeoutMs);
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.claimDeliveryJob(workerId, leaseTimeoutMs);
    }
  }

  public async recoverStaleDeliveryJobs(
    leaseTimeoutMs: number = 300000
  ): Promise<ExportDeliveryJob[]> {
    if (!this.isConfigured) {
      if (this.isProduction) throw new Error('DURABLE_STORAGE_UNAVAILABLE: Supabase not configured in production.');
      return this.fallbackMemory.recoverStaleDeliveryJobs(leaseTimeoutMs);
    }

    try {
      // Query jobs in PROCESSING status where lease has expired
      const nowIso = new Date().toISOString();
      const url = `${this.baseUrl}/rest/v1/export_delivery_jobs?status=eq.PROCESSING&lease_expires_at=lt.${encodeURIComponent(nowIso)}`;
      const res = await fetch(url, { method: 'GET', headers: this.headers });

      if (!res.ok) {
        if (this.isProduction) throw new Error(`DURABLE_STORAGE_ERROR: Failed to query stale jobs: HTTP ${res.status}`);
        return this.fallbackMemory.recoverStaleDeliveryJobs(leaseTimeoutMs);
      }

      const rows = (await res.json()) as any[];
      const recovered: ExportDeliveryJob[] = [];

      for (const row of rows) {
        const patchUrl = `${this.baseUrl}/rest/v1/export_delivery_jobs?job_id=eq.${encodeURIComponent(row.job_id)}`;
        await fetch(patchUrl, {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({
            status: 'UNCERTAIN',
            error_reason: 'Worker lease expired before completion confirmation',
            updated_at: new Date().toISOString(),
          }),
        });

        recovered.push({
          jobId: row.job_id,
          exportId: row.export_id,
          reportType: row.report_type,
          recipientUserId: row.recipient_user_id,
          recipientEmailMasked: row.recipient_email_masked,
          status: 'UNCERTAIN',
          deliveryTarget: 'APPS_SCRIPT_EMAIL_DISPATCHER',
          queuedAt: row.queued_at,
          errorReason: 'Worker lease expired before completion confirmation',
        });
      }

      return recovered;
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.recoverStaleDeliveryJobs(leaseTimeoutMs);
    }
  }
}
