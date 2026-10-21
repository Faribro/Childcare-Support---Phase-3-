import crypto from 'crypto';
import {
  CallerSecurityContext,
  ExportDeliveryJob,
  ExportPreviewContract,
} from './types';
import { computeImmutableExportHash } from './export-contract-service';

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

      // 3. Execution-time geographic scope check
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

      // 4. Expiry check (5-minute TTL)
      if (new Date().toISOString() > preview.expiresAt) {
        return {
          success: false,
          status: 'EXPIRED',
          errorReason:
            'Export preview has expired (5-minute window exceeded). Please request a new export.',
        };
      }

      // 5. Parameters integrity check
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

      // 6. Confirmation code check
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

      // 7. Atomic consumption
      preview.isConsumed = true;
      preview.consumedAt = new Date().toISOString();
      this.consumedTokens.add(exportId);

      // 8. Create queued delivery job
      const job: ExportDeliveryJob = {
        jobId: `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        exportId: preview.exportId,
        reportType: preview.reportType,
        recipientUserId: preview.recipientUserId,
        recipientEmailMasked: preview.recipientEmailMasked,
        recipientEmailExact: preview.recipientEmailExact,
        immutableParametersHash: preview.immutableParametersHash,
        status: 'QUEUED',
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
      });
    }
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
    this.baseUrl = (supabaseUrl || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.apiKey = serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.fallbackMemory = new InMemoryExportConfirmationStore();
  }

  private get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
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
    // Keep fallback in sync
    await this.fallbackMemory.registerPreviewContract(contract);

    if (!this.isConfigured) return;

    try {
      const url = `${this.baseUrl}/rest/v1/export_confirmation_tokens`;
      await fetch(url, {
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
    } catch {
      // Ignored: fallbackMemory has it
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
      return this.fallbackMemory.consumeConfirmationTokenAtomic(params);
    }

    const { exportId, parametersHash, userId, userConfirmationText, caller } = params;

    // First validate code client-side
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

      // Also mark in fallback memory
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
        queuedAt: new Date().toISOString(),
        deliveryTarget: 'APPS_SCRIPT_EMAIL_DISPATCHER',
      };

      return {
        success: true,
        status: 'CONSUMED',
        job,
      };
    } catch {
      return this.fallbackMemory.consumeConfirmationTokenAtomic(params);
    }
  }

  public async getJob(jobId: string): Promise<ExportDeliveryJob | null> {
    if (!this.isConfigured) {
      return this.fallbackMemory.getJob(jobId);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/export_delivery_jobs?job_id=eq.${encodeURIComponent(jobId)}&limit=1`;
      const res = await fetch(url, { method: 'GET', headers: this.headers });
      if (!res.ok) return this.fallbackMemory.getJob(jobId);
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
        deliveryTarget: r.delivery_target,
        queuedAt: r.queued_at,
        dispatchedAt: r.dispatched_at,
        errorReason: r.error_reason,
      };
    } catch {
      return this.fallbackMemory.getJob(jobId);
    }
  }

  public async updateJobStatus(
    jobId: string,
    status: ExportDeliveryJob['status'],
    errorReason?: string
  ): Promise<void> {
    await this.fallbackMemory.updateJobStatus(jobId, status, errorReason);
    if (!this.isConfigured) return;

    try {
      const url = `${this.baseUrl}/rest/v1/export_delivery_jobs?job_id=eq.${encodeURIComponent(jobId)}`;
      await fetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({
          status,
          error_reason: errorReason || null,
          dispatched_at: status === 'SENT' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }),
      });
    } catch {
      // Ignored
    }
  }
}
