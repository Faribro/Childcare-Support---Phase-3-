import crypto from 'crypto';
import { NextRequest } from 'next/server';

/**
 * Hard limit on raw request body size: 256 KB.
 * Official Meta WhatsApp webhook batches are typically < 10 KB.
 * Streaming requests exceeding this limit are terminated early to prevent DoS.
 */
export const MAX_RAW_BODY_SIZE = 256 * 1024; // 256 KB

export interface MetaWhatsAppMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
  document?: { id?: string; filename?: string; mime_type?: string; sha256?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  button?: { payload?: string; text?: string };
  interactive?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MetaWhatsAppStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  conversation?: { id?: string; origin?: { type?: string } };
  pricing?: { billable?: boolean; pricing_model?: string; category?: string };
  errors?: Array<{ code?: number; title?: string; message?: string }>;
  [key: string]: unknown;
}

export interface MetaWhatsAppChangeValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: MetaWhatsAppMessage[];
  statuses?: MetaWhatsAppStatus[];
  errors?: Array<{ code?: number; title?: string; message?: string }>;
  [key: string]: unknown;
}

export interface MetaWhatsAppChange {
  value?: MetaWhatsAppChangeValue;
  field?: string;
  [key: string]: unknown;
}

export interface MetaWhatsAppEntry {
  id?: string;
  changes?: MetaWhatsAppChange[];
  [key: string]: unknown;
}

export interface MetaWhatsAppWebhookPayload {
  object?: string;
  entry?: MetaWhatsAppEntry[];
  [key: string]: unknown;
}

export type WhatsAppEventClass = 'message' | 'status' | 'general' | 'unknown';

/**
 * Minimal, privacy-safe diagnostic record.
 *
 * Strict Privacy Guarantees:
 * - NO phone numbers or phone fragments (even masked).
 * - NO user, sender, or recipient identifiers.
 * - NO profile names or contact identifiers.
 * - NO raw message identifiers (wamid...).
 * - NO raw message text, captions, buttons, or media URLs.
 * - NO raw error messages that may echo user input payloads.
 * - Retains ONLY non-sensitive aggregate counts, event class, numeric error codes,
 *   and an ephemeral random correlation UUID.
 */
export interface DiagnosticEventRecord {
  correlationId: string;
  receivedAt: string;
  eventClass: WhatsAppEventClass;
  entryCount: number;
  messageCount: number;
  statusCount: number;
  hasErrors: boolean;
  errorCodes: number[];
}

/**
 * Derives a minimal privacy-safe diagnostic record from an incoming payload.
 * Completely strips all PII and sensitive fields.
 */
export function extractMinimalDiagnostics(
  payload: MetaWhatsAppWebhookPayload,
  correlationId: string = crypto.randomUUID()
): DiagnosticEventRecord {
  const now = new Date().toISOString();

  if (!payload || !Array.isArray(payload.entry)) {
    return {
      correlationId,
      receivedAt: now,
      eventClass: 'unknown',
      entryCount: 0,
      messageCount: 0,
      statusCount: 0,
      hasErrors: false,
      errorCodes: [],
    };
  }

  let totalMessages = 0;
  let totalStatuses = 0;
  const errorCodes: number[] = [];

  for (const entry of payload.entry) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const val = change?.value;
      if (Array.isArray(val?.messages)) {
        totalMessages += val.messages.length;
      }
      if (Array.isArray(val?.statuses)) {
        totalStatuses += val.statuses.length;
        for (const st of val.statuses) {
          if (Array.isArray(st.errors)) {
            for (const err of st.errors) {
              if (typeof err.code === 'number') {
                errorCodes.push(err.code);
              }
            }
          }
        }
      }
      if (Array.isArray(val?.errors)) {
        for (const err of val.errors) {
          if (typeof err.code === 'number') {
            errorCodes.push(err.code);
          }
        }
      }
    }
  }

  let eventClass: WhatsAppEventClass = 'general';
  if (totalMessages > 0 && totalStatuses === 0) {
    eventClass = 'message';
  } else if (totalStatuses > 0 && totalMessages === 0) {
    eventClass = 'status';
  } else if (totalMessages > 0 && totalStatuses > 0) {
    eventClass = 'general';
  }

  return {
    correlationId,
    receivedAt: now,
    eventClass,
    entryCount: payload.entry.length,
    messageCount: totalMessages,
    statusCount: totalStatuses,
    hasErrors: errorCodes.length > 0,
    errorCodes,
  };
}

/**
 * Reads request body stream with a hard byte-count ceiling.
 * If the byte limit is exceeded at any point during streaming, the stream
 * reader is immediately cancelled to prevent unbounded memory allocation.
 */
export async function readBoundedRawBody(
  req: NextRequest | Request,
  maxBytes: number = MAX_RAW_BODY_SIZE
): Promise<
  | { success: true; buffer: Buffer }
  | { success: false; statusCode: number; code: string; message: string }
> {
  // 1. Fast pre-check: Content-Length header
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(contentLength) && contentLength > maxBytes) {
      return {
        success: false,
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size.',
      };
    }
  }

  // 2. Stream consumption with byte ceiling & early cancellation
  if (!req.body) {
    try {
      const arrayBuf = await req.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.length > maxBytes) {
        return {
          success: false,
          statusCode: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds maximum allowed size.',
        };
      }
      return { success: true, buffer: buf };
    } catch {
      return { success: true, buffer: Buffer.alloc(0) };
    }
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > maxBytes) {
          // Immediately terminate the underlying stream
          await reader.cancel('Payload exceeded maximum byte limit');
          return {
            success: false,
            statusCode: 413,
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request payload exceeds maximum allowed size.',
          };
        }
        chunks.push(value);
      }
    }
  } catch {
    return {
      success: false,
      statusCode: 400,
      code: 'BODY_READ_ERROR',
      message: 'Failed to read request body stream.',
    };
  }

  return {
    success: true,
    buffer: Buffer.concat(chunks),
  };
}
