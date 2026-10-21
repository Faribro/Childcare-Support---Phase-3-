import fs from 'fs';
import path from 'path';
import { InboundMediaUploadEvent, OutboundDocumentRequest, SubmissionEntity } from './types';
import { getAppEnvConfig } from '@/lib/server/envConfig';

export type InboundProcessingStatus = 'RECEIVED' | 'CLAIMED' | 'PROCESSED' | 'FAILED' | 'DUPLICATE';

export interface InboundEventRecord {
  eventId: string;
  fromPhoneHash: string;
  senderMasked: string;
  eventType: 'DOCUMENT_UPLOAD' | 'TEXT_MESSAGE' | 'STATUS_CALLBACK' | 'INTERACTIVE_RESPONSE';
  idempotencyKey: string;
  payloadRedacted: Record<string, any>;
  processingStatus: InboundProcessingStatus;
  errorMessage?: string | null;
  processedAt?: string | null;
  createdAt?: string;
  claimedAt?: string;
}

export type InboundClaimResult =
  | { status: 'CLAIMED'; event: InboundEventRecord }
  | { status: 'DUPLICATE_ALREADY_PROCESSED'; event?: InboundEventRecord }
  | { status: 'DUPLICATE_IN_PROGRESS'; event?: InboundEventRecord }
  | { status: 'CLAIM_RECOVERED'; event: InboundEventRecord };

export interface IInboundPersistence {
  hasEvent(eventId: string, idempotencyKey?: string): Promise<boolean>;
  recordInboundEvent(record: InboundEventRecord): Promise<{ success: boolean; isDuplicate: boolean }>;
  claimInboundEvent(record: InboundEventRecord, leaseTimeoutMs?: number): Promise<InboundClaimResult>;
  updateEventStatus(eventId: string, status: InboundEventRecord['processingStatus'], errorMessage?: string): Promise<void>;
  getEvent(eventId: string): Promise<InboundEventRecord | null>;
}

/**
 * Interface defining durable persistence for the WhatsApp Document Loop.
 * Mirrors the schema in supabase/migrations/20261015220000_whatsapp_document_loop.sql:
 * - whatsapp_inbound_events (deduplication on wamid & idempotency key)
 * - whatsapp_outbound_requests (outbound request state & idempotency)
 * - submissions (durable submission & document state)
 */
export interface IDurableDocumentLoopStore {
  hasEvent(eventId: string, idempotencyKey?: string): boolean;
  recordEvent(eventId: string, idempotencyKey?: string, metadata?: Record<string, any>): void;
  getSubmission(submissionId: string): SubmissionEntity | undefined;
  saveSubmission(submission: SubmissionEntity): void;
  saveOutboundRequest(request: OutboundDocumentRequest): void;
  getOutboundRequest(requestId: string): OutboundDocumentRequest | undefined;
}

/**
 * In-memory implementation of the durable store for transient testing.
 */
export class MemoryDocumentLoopStore implements IDurableDocumentLoopStore {
  private readonly events: Set<string> = new Set();
  private readonly idempotencyKeys: Set<string> = new Set();
  private readonly submissions: Map<string, SubmissionEntity> = new Map();
  private readonly outboundRequests: Map<string, OutboundDocumentRequest> = new Map();

  public hasEvent(eventId: string, idempotencyKey?: string): boolean {
    if (this.events.has(eventId)) return true;
    if (idempotencyKey && this.idempotencyKeys.has(idempotencyKey)) return true;
    return false;
  }

  public recordEvent(eventId: string, idempotencyKey?: string): void {
    this.events.add(eventId);
    if (idempotencyKey) {
      this.idempotencyKeys.add(idempotencyKey);
    }
  }

  public getSubmission(submissionId: string): SubmissionEntity | undefined {
    return this.submissions.get(submissionId);
  }

  public saveSubmission(submission: SubmissionEntity): void {
    this.submissions.set(submission.id, submission);
  }

  public saveOutboundRequest(request: OutboundDocumentRequest): void {
    this.outboundRequests.set(request.requestId, request);
  }

  public getOutboundRequest(requestId: string): OutboundDocumentRequest | undefined {
    return this.outboundRequests.get(requestId);
  }
}

/**
 * File-backed durable store to verify service restart/retry resilience across process teardowns.
 * Simulates disk/database persistence surviving server process crashes.
 */
export class FileBackedTestStore implements IDurableDocumentLoopStore {
  private readonly filePath: string;
  private state: {
    events: string[];
    idempotencyKeys: string[];
    submissions: Record<string, SubmissionEntity>;
    outboundRequests: Record<string, OutboundDocumentRequest>;
  };

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.loadState();
  }

  private loadState() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch {
      // Fallback to fresh state
    }
    return {
      events: [],
      idempotencyKeys: [],
      submissions: {},
      outboundRequests: {},
    };
  }

  private persistState(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      // In tests, handle write errors safely
    }
  }

  public hasEvent(eventId: string, idempotencyKey?: string): boolean {
    this.state = this.loadState();
    if (this.state.events.includes(eventId)) return true;
    if (idempotencyKey && this.state.idempotencyKeys.includes(idempotencyKey)) return true;
    return false;
  }

  public recordEvent(eventId: string, idempotencyKey?: string): void {
    this.state = this.loadState();
    if (!this.state.events.includes(eventId)) {
      this.state.events.push(eventId);
    }
    if (idempotencyKey && !this.state.idempotencyKeys.includes(idempotencyKey)) {
      this.state.idempotencyKeys.push(idempotencyKey);
    }
    this.persistState();
  }

  public getSubmission(submissionId: string): SubmissionEntity | undefined {
    this.state = this.loadState();
    return this.state.submissions[submissionId];
  }

  public saveSubmission(submission: SubmissionEntity): void {
    this.state = this.loadState();
    this.state.submissions[submission.id] = submission;
    this.persistState();
  }

  public saveOutboundRequest(request: OutboundDocumentRequest): void {
    this.state = this.loadState();
    this.state.outboundRequests[request.requestId] = request;
    this.persistState();
  }

  public getOutboundRequest(requestId: string): OutboundDocumentRequest | undefined {
    this.state = this.loadState();
    return this.state.outboundRequests[requestId];
  }

  public cleanup(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * In-memory implementation of IInboundPersistence for unit tests and local runs.
 */
export class MemoryInboundPersistence implements IInboundPersistence {
  private readonly events = new Map<string, InboundEventRecord>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey -> eventId

  public async hasEvent(eventId: string, idempotencyKey?: string): Promise<boolean> {
    if (this.events.has(eventId)) return true;
    if (idempotencyKey && this.idempotencyIndex.has(idempotencyKey)) return true;
    return false;
  }

  public async recordInboundEvent(record: InboundEventRecord): Promise<{ success: boolean; isDuplicate: boolean }> {
    if (this.events.has(record.eventId) || this.idempotencyIndex.has(record.idempotencyKey)) {
      return { success: true, isDuplicate: true };
    }
    this.events.set(record.eventId, { ...record });
    this.idempotencyIndex.set(record.idempotencyKey, record.eventId);
    return { success: true, isDuplicate: false };
  }

  public async claimInboundEvent(
    record: InboundEventRecord,
    leaseTimeoutMs: number = 60000
  ): Promise<InboundClaimResult> {
    const existing = this.events.get(record.eventId);
    const now = Date.now();

    if (existing) {
      if (existing.processingStatus === 'PROCESSED') {
        return { status: 'DUPLICATE_ALREADY_PROCESSED', event: existing };
      }

      const claimedTime = existing.claimedAt
        ? new Date(existing.claimedAt).getTime()
        : (existing.createdAt ? new Date(existing.createdAt).getTime() : now);
      const isExpired = now - claimedTime > leaseTimeoutMs;

      if (isExpired && existing.processingStatus === 'CLAIMED') {
        const recovered: InboundEventRecord = {
          ...existing,
          processingStatus: 'CLAIMED',
          claimedAt: new Date(now).toISOString(),
          errorMessage: 'Lease expired, recovered by worker',
        };
        this.events.set(record.eventId, recovered);
        return { status: 'CLAIM_RECOVERED', event: recovered };
      }

      return { status: 'DUPLICATE_IN_PROGRESS', event: existing };
    }

    const claimedEvent: InboundEventRecord = {
      ...record,
      processingStatus: 'CLAIMED',
      createdAt: record.createdAt || new Date(now).toISOString(),
      claimedAt: new Date(now).toISOString(),
    };
    this.events.set(record.eventId, claimedEvent);
    this.idempotencyIndex.set(record.idempotencyKey, record.eventId);
    return { status: 'CLAIMED', event: claimedEvent };
  }

  public async updateEventStatus(
    eventId: string,
    status: InboundEventRecord['processingStatus'],
    errorMessage?: string
  ): Promise<void> {
    const existing = this.events.get(eventId);
    if (existing) {
      this.events.set(eventId, {
        ...existing,
        processingStatus: status,
        errorMessage: errorMessage || null,
        processedAt: new Date().toISOString(),
      });
    }
  }

  public async getEvent(eventId: string): Promise<InboundEventRecord | null> {
    const rec = this.events.get(eventId);
    return rec ? { ...rec } : null;
  }

  public clear(): void {
    this.events.clear();
    this.idempotencyIndex.clear();
  }
}

/**
 * Supabase PostgREST Inbound Event Persistence
 * Connects directly to public.whatsapp_inbound_events.
 */
export class SupabaseInboundPersistence implements IInboundPersistence {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fallbackMemory: MemoryInboundPersistence;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    const env = getAppEnvConfig();
    this.baseUrl = (supabaseUrl || env.supabaseUrl || '').replace(/\/+$/, '');
    this.apiKey = serviceRoleKey || env.supabaseServiceRoleKey || '';
    this.fallbackMemory = new MemoryInboundPersistence();
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

  public async hasEvent(eventId: string, idempotencyKey?: string): Promise<boolean> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Inbound persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
        );
      }
      return this.fallbackMemory.hasEvent(eventId, idempotencyKey);
    }

    try {
      const filter = idempotencyKey
        ? `or=(event_id.eq.${encodeURIComponent(eventId)},idempotency_key.eq.${encodeURIComponent(idempotencyKey)})`
        : `event_id=eq.${encodeURIComponent(eventId)}`;

      const url = `${this.baseUrl}/rest/v1/whatsapp_inbound_events?${filter}&select=id,event_id,processing_status&limit=1`;
      const res = await fetch(url, { method: 'GET', headers: this.headers });

      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to query inbound event: HTTP ${res.status}`);
        }
        return this.fallbackMemory.hasEvent(eventId, idempotencyKey);
      }

      const rows = (await res.json()) as any[];
      return Array.isArray(rows) && rows.length > 0;
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.hasEvent(eventId, idempotencyKey);
    }
  }

  public async recordInboundEvent(
    record: InboundEventRecord
  ): Promise<{ success: boolean; isDuplicate: boolean }> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Inbound persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      return this.fallbackMemory.recordInboundEvent(record);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/whatsapp_inbound_events`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          event_id: record.eventId,
          from_phone_hash: record.fromPhoneHash,
          sender_masked: record.senderMasked,
          event_type: record.eventType,
          idempotency_key: record.idempotencyKey,
          payload_redacted: record.payloadRedacted || {},
          processing_status: record.processingStatus || 'RECEIVED',
          error_message: record.errorMessage || null,
        }),
      });

      if (res.status === 409) {
        return { success: true, isDuplicate: true };
      }

      if (!res.ok) {
        const text = await res.text();
        if (text.includes('uq_whatsapp_inbound') || text.includes('duplicate key')) {
          return { success: true, isDuplicate: true };
        }
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to record event in Supabase: HTTP ${res.status}`);
        }
        return this.fallbackMemory.recordInboundEvent(record);
      }

      return { success: true, isDuplicate: false };
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.recordInboundEvent(record);
    }
  }

  public async claimInboundEvent(
    record: InboundEventRecord,
    leaseTimeoutMs: number = 60000
  ): Promise<InboundClaimResult> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Inbound persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
        );
      }
      return this.fallbackMemory.claimInboundEvent(record, leaseTimeoutMs);
    }

    try {
      // 1. Stored Procedure Atomic Claim
      const rpcUrl = `${this.baseUrl}/rest/v1/rpc/claim_whatsapp_inbound_event_atomic`;
      const rpcRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          p_event_id: record.eventId,
          p_from_phone_hash: record.fromPhoneHash,
          p_sender_masked: record.senderMasked,
          p_event_type: record.eventType,
          p_idempotency_key: record.idempotencyKey,
          p_payload_redacted: record.payloadRedacted || {},
          p_lease_duration_seconds: Math.floor(leaseTimeoutMs / 1000),
        }),
      });

      if (rpcRes.ok) {
        const result = (await rpcRes.json()) as any;
        return {
          status: result.status,
          event: record,
        };
      }

      // 2. Direct Table POST Fallback
      const url = `${this.baseUrl}/rest/v1/whatsapp_inbound_events`;
      const insertRes = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          event_id: record.eventId,
          from_phone_hash: record.fromPhoneHash,
          sender_masked: record.senderMasked,
          event_type: record.eventType,
          idempotency_key: record.idempotencyKey,
          payload_redacted: record.payloadRedacted || {},
          processing_status: 'CLAIMED',
        }),
      });

      if (insertRes.status === 201) {
        return { status: 'CLAIMED', event: record };
      }

      if (insertRes.status === 409 || !insertRes.ok) {
        const queryUrl = `${this.baseUrl}/rest/v1/whatsapp_inbound_events?event_id=eq.${encodeURIComponent(record.eventId)}&limit=1`;
        const queryRes = await fetch(queryUrl, { method: 'GET', headers: this.headers });

        if (queryRes.ok) {
          const rows = (await queryRes.json()) as any[];
          if (rows.length > 0) {
            const existing = rows[0];
            if (existing.processing_status === 'PROCESSED') {
              return { status: 'DUPLICATE_ALREADY_PROCESSED', event: record };
            }
            const createdAtMs = new Date(existing.created_at).getTime();
            if (Date.now() - createdAtMs > leaseTimeoutMs) {
              const patchUrl = `${this.baseUrl}/rest/v1/whatsapp_inbound_events?event_id=eq.${encodeURIComponent(record.eventId)}`;
              await fetch(patchUrl, {
                method: 'PATCH',
                headers: this.headers,
                body: JSON.stringify({
                  processing_status: 'CLAIMED',
                  error_message: 'Lease recovered after worker crash',
                }),
              });
              return { status: 'CLAIM_RECOVERED', event: record };
            }
            return { status: 'DUPLICATE_IN_PROGRESS', event: record };
          }
        }
      }

      if (this.isProduction) {
        throw new Error(`DURABLE_STORAGE_ERROR: Failed to claim event in Supabase: HTTP ${insertRes.status}`);
      }
      return this.fallbackMemory.claimInboundEvent(record, leaseTimeoutMs);
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.claimInboundEvent(record, leaseTimeoutMs);
    }
  }

  public async updateEventStatus(
    eventId: string,
    status: InboundEventRecord['processingStatus'],
    errorMessage?: string
  ): Promise<void> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Inbound persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      await this.fallbackMemory.updateEventStatus(eventId, status, errorMessage);
      return;
    }

    try {
      const url = `${this.baseUrl}/rest/v1/whatsapp_inbound_events?event_id=eq.${encodeURIComponent(eventId)}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({
          processing_status: status,
          error_message: errorMessage || null,
          processed_at: new Date().toISOString(),
        }),
      });

      if (!res.ok && this.isProduction) {
        throw new Error(`DURABLE_STORAGE_ERROR: Failed to update event status: HTTP ${res.status}`);
      }
    } catch (err) {
      if (this.isProduction) throw err;
      await this.fallbackMemory.updateEventStatus(eventId, status, errorMessage);
    }
  }

  public async getEvent(eventId: string): Promise<InboundEventRecord | null> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Inbound persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      return this.fallbackMemory.getEvent(eventId);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/whatsapp_inbound_events?event_id=eq.${encodeURIComponent(eventId)}&limit=1`;
      const res = await fetch(url, { method: 'GET', headers: this.headers });

      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to fetch event: HTTP ${res.status}`);
        }
        return this.fallbackMemory.getEvent(eventId);
      }

      const rows = (await res.json()) as any[];
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const r = rows[0];
      return {
        eventId: r.event_id,
        fromPhoneHash: r.from_phone_hash,
        senderMasked: r.sender_masked,
        eventType: r.event_type,
        idempotencyKey: r.idempotency_key,
        payloadRedacted: r.payload_redacted || {},
        processingStatus: r.processing_status,
        errorMessage: r.error_message,
        processedAt: r.processed_at,
        createdAt: r.created_at,
      };
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.getEvent(eventId);
    }
  }
}
