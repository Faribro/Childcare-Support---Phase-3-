/**
 * WhatsApp Outbound Sender Adapter
 *
 * Implements the outbound transport for missing-document outreach and caregiver notifications.
 *
 * Safety & Invariants:
 * 1. Trusted recipient resolution: strictly requires E.164 phone numbers. Masked strings (* or X) are rejected fail-closed.
 * 2. Injected HTTP transport: 100% mockable in unit and integration tests (zero real network calls).
 * 3. Configurable API version (META_GRAPH_API_VERSION, default v19.0) and secret references.
 * 4. Idempotency protection: deduplicates requests based on unique idempotency keys.
 * 5. Outcome classification:
 *    - PREPARED: Constructed and validated, ready to dispatch.
 *    - ACCEPTED_BY_GATEWAY: 200/202 with wamid returned by Meta Graph API.
 *    - FAILED: 4xx client errors or validation failures.
 *    - UNCERTAIN: 5xx server errors, timeouts, or connection aborts (at-least-once awareness; does NOT claim delivery).
 * 6. Delivery receipt correlation: matches webhook status updates (delivered/read/failed) by wamid.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type OutboundDeliveryStatus =
  | 'PREPARED'
  | 'ACCEPTED_BY_GATEWAY'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'DELIVERED'
  | 'READ';

export type OutboundMessageType = 'TEMPLATE' | 'TEXT' | 'DOCUMENT_REQUEST';

export interface CallerSecurityContext {
  readonly userId: string;
  readonly role: 'SUPERVISOR' | 'STATE_LEAD' | 'LEADERSHIP' | 'ADMIN' | 'SYSTEM';
  readonly permittedStates?: readonly string[];
}

export interface WhatsAppSenderConfig {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly graphApiVersion?: string; // defaults to 'v19.0'
  readonly graphBaseUrl?: string; // defaults to 'https://graph.facebook.com'
  readonly requestTimeoutMs?: number; // defaults to 10000ms
  readonly allowLocalFilesystemInProduction?: boolean;
}

export interface WhatsAppHttpResponse {
  readonly status: number;
  readonly data?: any;
  readonly error?: string;
  readonly isTimeout?: boolean;
  readonly isNetworkError?: boolean;
}

export interface WhatsAppHttpTransport {
  post(
    url: string,
    headers: Record<string, string>,
    body: any,
    timeoutMs?: number
  ): Promise<WhatsAppHttpResponse>;
}

export interface OutboundMessageRecord {
  readonly outboundId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly targetSubmissionId?: string;
  readonly recipientPhoneE164: string;
  readonly recipientPhoneMasked: string;
  readonly messageType: OutboundMessageType;
  readonly templateName?: string;
  readonly payloadSnapshot: any;
  status: OutboundDeliveryStatus;
  wamid?: string;
  gatewayStatusCode?: number;
  gatewayResponse?: any;
  errorDetails?: string;
  preparedAt: string;
  acceptedAt?: string;
  updatedAt: string;
}

export interface OutboundDispatchParams {
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly recipientPhoneE164: string;
  readonly targetSubmissionId?: string;
  readonly messageType: OutboundMessageType;
  readonly templateName?: string;
  readonly templateLanguage?: string;
  readonly templateComponents?: any[];
  readonly textBody?: string;
  readonly documentRequest?: {
    readonly docType: string;
    readonly uploadToken: string;
    readonly childName: string;
  };
}

export interface OutboundDispatchResult {
  readonly success: boolean;
  readonly status: OutboundDeliveryStatus;
  readonly outboundId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly wamid?: string;
  readonly gatewayStatusCode?: number;
  readonly recipientPhoneMasked: string;
  readonly isDuplicate?: boolean;
  readonly error?: string;
  readonly timestamp: string;
}

export interface WhatsAppDeliveryReceipt {
  readonly wamid: string;
  readonly recipientId: string;
  readonly status: 'sent' | 'delivered' | 'read' | 'failed';
  readonly timestamp: string;
  readonly error?: {
    readonly code: number;
    readonly title: string;
    readonly message: string;
  };
}

/**
 * Validates strict E.164 international phone number format.
 * Explicitly rejects masked numbers (* or X) and numbers without '+' prefix.
 */
export function validateE164Phone(phone: string): { valid: boolean; normalized?: string; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Recipient phone number is missing or not a string.' };
  }
  const trimmed = phone.trim();
  if (trimmed.includes('*') || trimmed.includes('X') || trimmed.includes('x')) {
    return {
      valid: false,
      error: `INVALID_E164_PHONE: Masked phone number "${trimmed}" cannot be used for outbound dispatch. Trusted resolution must supply an unmasked E.164 number.`,
    };
  }
  // Strict E.164 format: + followed by 8 to 15 digits, first non-zero
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  if (!e164Regex.test(trimmed)) {
    return {
      valid: false,
      error: `INVALID_E164_PHONE: "${trimmed}" does not match strict E.164 international format (+[country][number] without spaces, dashes, or brackets).`,
    };
  }
  return { valid: true, normalized: trimmed };
}

/**
 * DPDP-compliant recipient masking for safe logging.
 */
export function maskRecipientPhone(phone: string): string {
  if (!phone || phone.length < 4) return '******';
  const clean = phone.replace(/[^\d+]/g, '');
  const last4 = clean.slice(-4);
  return `******${last4}`;
}

export interface OutboundMessageRegistry {
  save(record: OutboundMessageRecord): Promise<void>;
  getByIdempotencyKey(key: string): Promise<OutboundMessageRecord | undefined>;
  getByWamid(wamid: string): Promise<OutboundMessageRecord | undefined>;
  updateStatus(outboundId: string, updates: Partial<OutboundMessageRecord>): Promise<boolean>;
  clear(): Promise<void>;
}

/**
 * File-backed Outbound Message Registry
 *
 * STORAGE AUDIT NOTE:
 * Strictly LOCAL_DEVELOPMENT_ONLY. Fails closed in production environments.
 */
export class PersistentFileOutboundRegistry implements OutboundMessageRegistry {
  public readonly storageType = 'LOCAL_DEVELOPMENT_ONLY' as const;
  private records = new Map<string, OutboundMessageRecord>();
  private readonly filePath: string;

  constructor(options?: { filePath?: string; allowLocalFilesystemInProduction?: boolean }) {
    if (process.env.NODE_ENV === 'production' && !options?.allowLocalFilesystemInProduction) {
      throw new Error(
        'STORAGE_UNCONFIGURED: PersistentFileOutboundRegistry uses local filesystem storage and is strictly LOCAL_DEVELOPMENT_ONLY. It cannot be used in production serverless environments. Configure a durable PostgreSQL / Supabase registry.'
      );
    }
    this.filePath = options?.filePath || path.join(process.cwd(), '.cache', 'outbound_messages_registry.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.idempotencyKey) {
              this.records.set(item.idempotencyKey, item);
            }
          }
        }
      }
    } catch {}
  }

  private flushToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(Array.from(this.records.values()), null, 2), 'utf-8');
    } catch {}
  }

  public async save(record: OutboundMessageRecord): Promise<void> {
    this.records.set(record.idempotencyKey, record);
    this.flushToDisk();
  }

  public async getByIdempotencyKey(key: string): Promise<OutboundMessageRecord | undefined> {
    return this.records.get(key);
  }

  public async getByWamid(wamid: string): Promise<OutboundMessageRecord | undefined> {
    for (const record of this.records.values()) {
      if (record.wamid === wamid) {
        return record;
      }
    }
    return undefined;
  }

  public async updateStatus(outboundId: string, updates: Partial<OutboundMessageRecord>): Promise<boolean> {
    for (const [key, record] of this.records.entries()) {
      if (record.outboundId === outboundId) {
        const updated: OutboundMessageRecord = {
          ...record,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        this.records.set(key, updated);
        this.flushToDisk();
        return true;
      }
    }
    return false;
  }

  public async clear(): Promise<void> {
    this.records.clear();
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {}
  }
}

/**
 * Mock HTTP Transport for Unit and Integration Testing.
 * Zero external network calls.
 */
export class MockWhatsAppHttpTransport implements WhatsAppHttpTransport {
  public recordedRequests: Array<{
    url: string;
    headers: Record<string, string>;
    body: any;
    timeoutMs?: number;
  }> = [];

  private responses = new Map<string, WhatsAppHttpResponse>();
  private defaultResponse: WhatsAppHttpResponse = {
    status: 200,
    data: {
      messaging_product: 'whatsapp',
      contacts: [{ input: '+919820010170', wa_id: '919820010170' }],
      messages: [{ id: `wamid.mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}` }],
    },
  };

  public setDefaultResponse(res: WhatsAppHttpResponse): void {
    this.defaultResponse = res;
  }

  public setResponseForRecipient(phone: string, res: WhatsAppHttpResponse): void {
    this.responses.set(phone, res);
  }

  public async post(
    url: string,
    headers: Record<string, string>,
    body: any,
    timeoutMs?: number
  ): Promise<WhatsAppHttpResponse> {
    this.recordedRequests.push({ url, headers, body, timeoutMs });

    const recipient = body?.to;
    if (recipient && this.responses.has(recipient)) {
      return this.responses.get(recipient)!;
    }
    return this.defaultResponse;
  }

  public clear(): void {
    this.recordedRequests = [];
    this.responses.clear();
  }
}

/**
 * Production HTTPS Fetch Transport for Meta WhatsApp Cloud API.
 * Makes real outbound calls to Graph API when ALLOW_LIVE_WHATSAPP_SEND=true.
 * When ALLOW_LIVE_WHATSAPP_SEND=false, simulates gateway acceptance safely without network egress.
 */
export class FetchWhatsAppHttpTransport implements WhatsAppHttpTransport {
  public async post(
    url: string,
    headers: Record<string, string>,
    body: any,
    timeoutMs: number = 10000
  ): Promise<WhatsAppHttpResponse> {
    const isLiveAllowed = process.env.ALLOW_LIVE_WHATSAPP_SEND === 'true';

    if (!isLiveAllowed) {
      return {
        status: 200,
        data: {
          messaging_product: 'whatsapp',
          contacts: [{ input: body?.to, wa_id: String(body?.to || '').replace('+', '') }],
          messages: [{ id: `wamid.simulated_${Date.now()}_${crypto.randomBytes(4).toString('hex')}` }],
        },
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => undefined);
      return {
        status: res.status,
        data,
        error: !res.ok ? (data?.error?.message || `HTTP ${res.status}`) : undefined,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          status: 0,
          isTimeout: true,
          error: `Request timed out after ${timeoutMs}ms`,
        };
      }
      return {
        status: 0,
        isNetworkError: true,
        error: err.message || 'Fetch failed',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * WhatsApp Outbound Sender
 */
export class WhatsAppOutboundSender {
  private readonly config: WhatsAppSenderConfig;
  private readonly transport: WhatsAppHttpTransport;
  private readonly registry: OutboundMessageRegistry;

  constructor(
    config: WhatsAppSenderConfig,
    transport: WhatsAppHttpTransport,
    registry?: OutboundMessageRegistry
  ) {
    if (!config.accessToken || !config.phoneNumberId) {
      throw new Error('CONFIG_ERROR: WhatsAppOutboundSender requires accessToken and phoneNumberId.');
    }
    this.config = config;
    this.transport = transport;
    this.registry = registry || new PersistentFileOutboundRegistry({
      allowLocalFilesystemInProduction: config.allowLocalFilesystemInProduction,
    });
  }

  /**
   * Dispatches an outbound WhatsApp message with idempotency, E.164 validation,
   * secret authentication, and outcome classification.
   */
  public async dispatch(
    params: OutboundDispatchParams,
    caller: CallerSecurityContext
  ): Promise<OutboundDispatchResult> {
    const timestamp = new Date().toISOString();

    // 1. Authorization check
    if (!['SUPERVISOR', 'STATE_LEAD', 'LEADERSHIP', 'ADMIN', 'SYSTEM'].includes(caller.role)) {
      return {
        success: false,
        status: 'FAILED',
        outboundId: `unauth-${Date.now()}`,
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        recipientPhoneMasked: maskRecipientPhone(params.recipientPhoneE164),
        error: `FORBIDDEN_CALLER: Role "${caller.role}" is not authorized to dispatch outbound WhatsApp messages.`,
        timestamp,
      };
    }

    // 2. Strict E.164 Recipient Validation
    const phoneCheck = validateE164Phone(params.recipientPhoneE164);
    if (!phoneCheck.valid || !phoneCheck.normalized) {
      return {
        success: false,
        status: 'FAILED',
        outboundId: `invalid-phone-${Date.now()}`,
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        recipientPhoneMasked: maskRecipientPhone(params.recipientPhoneE164),
        error: phoneCheck.error || 'Invalid recipient phone number.',
        timestamp,
      };
    }
    const cleanPhoneE164 = phoneCheck.normalized;
    const recipientPhoneMasked = maskRecipientPhone(cleanPhoneE164);

    // 3. Idempotency Check
    const existing = await this.registry.getByIdempotencyKey(params.idempotencyKey);
    if (existing) {
      return {
        success: existing.status === 'ACCEPTED_BY_GATEWAY' || existing.status === 'DELIVERED' || existing.status === 'READ',
        status: existing.status,
        outboundId: existing.outboundId,
        idempotencyKey: existing.idempotencyKey,
        correlationId: existing.correlationId,
        wamid: existing.wamid,
        gatewayStatusCode: existing.gatewayStatusCode,
        recipientPhoneMasked: existing.recipientPhoneMasked,
        isDuplicate: true,
        error: existing.errorDetails,
        timestamp: existing.updatedAt,
      };
    }

    // 4. Construct Meta Graph API Payload
    const outboundId = `out-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    let graphPayload: any;

    if (params.messageType === 'DOCUMENT_REQUEST' && params.documentRequest) {
      // Missing document outreach template
      graphPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhoneE164,
        type: 'template',
        template: {
          name: params.templateName || 'childcare_missing_document_request',
          language: { code: params.templateLanguage || 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: params.documentRequest.childName },
                { type: 'text', text: params.documentRequest.docType },
                { type: 'text', text: params.documentRequest.uploadToken },
              ],
            },
          ],
        },
      };
    } else if (params.messageType === 'TEMPLATE') {
      graphPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhoneE164,
        type: 'template',
        template: {
          name: params.templateName,
          language: { code: params.templateLanguage || 'en' },
          components: params.templateComponents || [],
        },
      };
    } else {
      graphPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhoneE164,
        type: 'text',
        text: { body: params.textBody || '' },
      };
    }

    // 5. Initial PREPARED Record
    const record: OutboundMessageRecord = {
      outboundId,
      idempotencyKey: params.idempotencyKey,
      correlationId: params.correlationId,
      targetSubmissionId: params.targetSubmissionId,
      recipientPhoneE164: cleanPhoneE164,
      recipientPhoneMasked,
      messageType: params.messageType,
      templateName: params.templateName,
      payloadSnapshot: graphPayload,
      status: 'PREPARED',
      preparedAt: timestamp,
      updatedAt: timestamp,
    };
    await this.registry.save(record);

    // 6. Invoke Injected Transport
    const apiVersion = this.config.graphApiVersion || 'v19.0';
    const baseUrl = this.config.graphBaseUrl || 'https://graph.facebook.com';
    const endpoint = `${baseUrl}/${apiVersion}/${this.config.phoneNumberId}/messages`;

    const headers = {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
      'X-Correlation-Id': params.correlationId,
    };

    let response: WhatsAppHttpResponse;
    try {
      response = await this.transport.post(
        endpoint,
        headers,
        graphPayload,
        this.config.requestTimeoutMs || 10000
      );
    } catch (err: any) {
      response = {
        status: 0,
        isNetworkError: true,
        error: err?.message || 'Network exception during gateway dispatch.',
      };
    }

    // 7. Outcome Classification
    if (response.status >= 200 && response.status < 300) {
      const wamid = response.data?.messages?.[0]?.id;
      record.status = 'ACCEPTED_BY_GATEWAY';
      record.wamid = wamid;
      record.gatewayStatusCode = response.status;
      record.gatewayResponse = response.data;
      record.acceptedAt = new Date().toISOString();
      record.updatedAt = record.acceptedAt;
      await this.registry.save(record);

      return {
        success: true,
        status: 'ACCEPTED_BY_GATEWAY',
        outboundId,
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        wamid,
        gatewayStatusCode: response.status,
        recipientPhoneMasked,
        timestamp: record.updatedAt,
      };
    }

    if (response.isTimeout || response.isNetworkError || (response.status >= 500 && response.status <= 599)) {
      // UNCERTAIN: Timeout, network drop, or server error.
      // Must not claim failed or delivered: outcome is ambiguous!
      record.status = 'UNCERTAIN';
      record.gatewayStatusCode = response.status;
      record.errorDetails = response.error || 'Ambiguous outcome: Gateway timeout or upstream server error.';
      record.updatedAt = new Date().toISOString();
      await this.registry.save(record);

      return {
        success: false,
        status: 'UNCERTAIN',
        outboundId,
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        gatewayStatusCode: response.status,
        recipientPhoneMasked,
        error: record.errorDetails,
        timestamp: record.updatedAt,
      };
    }

    // FAILED: 4xx Client error (e.g. invalid template, bad phone, revoked token)
    record.status = 'FAILED';
    record.gatewayStatusCode = response.status;
    record.errorDetails = response.error || response.data?.error?.message || 'Gateway rejected request (4xx).';
    record.updatedAt = new Date().toISOString();
    await this.registry.save(record);

    return {
      success: false,
      status: 'FAILED',
      outboundId,
      idempotencyKey: params.idempotencyKey,
      correlationId: params.correlationId,
      gatewayStatusCode: response.status,
      recipientPhoneMasked,
      error: record.errorDetails,
      timestamp: record.updatedAt,
    };
  }

  /**
   * Correlates an incoming Meta WhatsApp delivery receipt with the outbound message record.
   */
  public async correlateDeliveryReceipt(receipt: WhatsAppDeliveryReceipt): Promise<{
    correlated: boolean;
    outboundId?: string;
    previousStatus?: OutboundDeliveryStatus;
    currentStatus?: OutboundDeliveryStatus;
    error?: string;
  }> {
    if (!receipt.wamid) {
      return { correlated: false, error: 'Missing wamid in delivery receipt.' };
    }

    const record = await this.registry.getByWamid(receipt.wamid);
    if (!record) {
      return { correlated: false, error: `No outbound message record found for wamid "${receipt.wamid}".` };
    }

    const previousStatus = record.status;
    let nextStatus: OutboundDeliveryStatus = previousStatus;

    if (receipt.status === 'delivered') {
      nextStatus = 'DELIVERED';
    } else if (receipt.status === 'read') {
      nextStatus = 'READ';
    } else if (receipt.status === 'failed') {
      nextStatus = 'FAILED';
    }

    await this.registry.updateStatus(record.outboundId, {
      status: nextStatus,
      errorDetails: receipt.error?.message,
    });

    return {
      correlated: true,
      outboundId: record.outboundId,
      previousStatus,
      currentStatus: nextStatus,
    };
  }
}
