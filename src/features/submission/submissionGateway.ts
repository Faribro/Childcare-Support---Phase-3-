/**
 * submissionGateway.ts — The Only Owner of HTTP Calls to /api/submissions
 *
 * Enforces:
 *   CREATE -> POST /api/submissions
 *   UPDATE -> PATCH /api/submissions/${remoteSubmissionId}
 *
 * The URL builder REJECTS undefined, blank, ART-format, child, beneficiary,
 * local, or clientSubmissionId values for PATCH — only a server-assigned
 * UUID v4 remoteSubmissionId is accepted.
 *
 * Normalizes all API errors into typed SubmissionError categories.
 */

import {
  assertValidRemoteSubmissionId,
  classifyHttpError,
  type ServerAcknowledgement,
  type SubmissionError,
  type CreateIdempotencyKey,
  type RemoteSubmissionId,
} from './submissionTypes';
import { parseServerAcknowledgement } from './submissionMapper';

const REQUEST_TIMEOUT_MS = 25_000;

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

export interface GatewayCreateRequest {
  payload: Record<string, unknown>;
  createIdempotencyKey: CreateIdempotencyKey;
  clientSubmissionId: string;
  correlationId?: string;
}

export type GatewayResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SubmissionError };

/**
 * Sends a canonical CREATE request: POST /api/submissions
 * Returns a typed ServerAcknowledgement on success.
 */
export async function gatewayCreate(
  request: GatewayCreateRequest
): Promise<GatewayResult<ServerAcknowledgement>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Idempotency-Key': request.createIdempotencyKey,
  };
  if (request.correlationId) {
    headers['X-Correlation-Id'] = request.correlationId;
  }

  let res: Response;
  try {
    res = await fetch('/api/submissions', {
      method: 'POST',
      headers,
      body: JSON.stringify(request.payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        error: {
          category: 'timeout',
          message: 'Request timed out. Your assessment is safe and will retry automatically.',
          isRetryable: true,
          isTerminal: false,
        },
      };
    }
    return {
      ok: false,
      error: {
        category: 'network',
        message: 'Network error. Your assessment is safe and will retry automatically.',
        isRetryable: true,
        isTerminal: false,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }

  let body: Record<string, unknown>;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: {
        category: 'malformed_acknowledgement',
        message: 'Unexpected response from server.',
        statusCode: res.status,
        isRetryable: false,
        isTerminal: true,
      },
    };
  }

  // HTTP 4xx/5xx
  if (!res.ok || body.status === 'error') {
    const classified = classifyHttpError(
      res.status,
      String(body.message ?? body.error ?? '')
    );
    // Extract validation fields if present
    if (classified.category === 'validation' && body.details) {
      const details = body.details as any;
      classified.validationFields = (details.fields || []).map((f: any) => ({
        field: f.field ?? f.path,
        issue: f.issue ?? f.message,
      }));
    }
    return { ok: false, error: classified };
  }

  // HTTP 200/201 with success body
  // Defend against HTTP 200 with error payload (upstream quirk)
  if (body.status === 'error' || (!body.acknowledged && !body.remoteSubmissionId)) {
    return {
      ok: false,
      error: {
        category: 'malformed_acknowledgement',
        message: 'Server did not confirm the submission.',
        statusCode: res.status,
        isRetryable: true,
        isTerminal: false,
      },
    };
  }

  try {
    const ack = parseServerAcknowledgement(body, request.clientSubmissionId);
    return { ok: true, data: ack };
  } catch (err: any) {
    return {
      ok: false,
      error: {
        category: 'malformed_acknowledgement',
        message: err?.message ?? 'Malformed acknowledgement from server.',
        statusCode: res.status,
        isRetryable: true,
        isTerminal: false,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export interface GatewayUpdateRequest {
  /** Must be a server-assigned UUID v4 — asserted at runtime */
  remoteSubmissionId: RemoteSubmissionId;
  /** Server-issued concurrency token */
  expectedVersion: number;
  /** Allowlisted changes */
  changes: Record<string, unknown>;
  clientSubmissionId: string;
  correlationId?: string;
}

/**
 * Sends a canonical UPDATE request: PATCH /api/submissions/${remoteSubmissionId}
 *
 * GUARDS: assertValidRemoteSubmissionId() will throw if remoteSubmissionId
 * is missing, an ART reference format, or not a UUID v4. This prevents
 * the PATCH 404 regression where an ART ID was used in the URL.
 */
export async function gatewayUpdate(
  request: GatewayUpdateRequest
): Promise<GatewayResult<ServerAcknowledgement>> {
  // Runtime guard — throws if ART ID or invalid format is passed
  assertValidRemoteSubmissionId(request.remoteSubmissionId, 'gatewayUpdate');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Idempotency-Key': `update-${request.remoteSubmissionId}-${request.expectedVersion}`,
    'If-Match': `"${request.expectedVersion}"`,
  };
  if (request.correlationId) {
    headers['X-Correlation-Id'] = request.correlationId;
  }

  const url = `/api/submissions/${encodeURIComponent(request.remoteSubmissionId)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        changes: request.changes,
        expectedVersion: request.expectedVersion,
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        error: {
          category: 'timeout',
          message: 'Request timed out. Your changes are safe and will retry automatically.',
          isRetryable: true,
          isTerminal: false,
        },
      };
    }
    return {
      ok: false,
      error: {
        category: 'network',
        message: 'Network error. Your changes are safe and will retry automatically.',
        isRetryable: true,
        isTerminal: false,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }

  let body: Record<string, unknown>;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: {
        category: 'malformed_acknowledgement',
        message: 'Unexpected response from server.',
        statusCode: res.status,
        isRetryable: false,
        isTerminal: true,
      },
    };
  }

  if (!res.ok || body.status === 'error') {
    const classified = classifyHttpError(res.status, String(body.message ?? ''));
    return { ok: false, error: classified };
  }

  try {
    const ack = parseServerAcknowledgement(body, request.clientSubmissionId);
    return { ok: true, data: ack };
  } catch (err: any) {
    return {
      ok: false,
      error: {
        category: 'malformed_acknowledgement',
        message: err?.message ?? 'Malformed update acknowledgement from server.',
        statusCode: res.status,
        isRetryable: true,
        isTerminal: false,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Reconciliation Lookup (for 404 UPDATE recovery — Phase 4)
// ---------------------------------------------------------------------------

/**
 * Performs one bounded reconciliation lookup by clientSubmissionId.
 * Used when a canonical PATCH receives a 404: checks if the record
 * exists remotely under a different remoteSubmissionId.
 *
 * Returns the remoteSubmissionId and version if found, null if absent.
 */
export async function lookupByClientSubmissionId(
  clientSubmissionId: string,
  correlationId?: string
): Promise<{ remoteSubmissionId: RemoteSubmissionId; version: number } | null> {
  const params = new URLSearchParams({ clientSubmissionId });
  if (correlationId) params.set('correlationId', correlationId);

  const headers: Record<string, string> = {};
  if (correlationId) headers['X-Correlation-Id'] = correlationId;

  let res: Response;
  try {
    res = await fetch(`/api/submissions?${params.toString()}`, {
      method: 'GET',
      headers,
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let body: any;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  // Server may return { data: { remoteSubmissionId, version } }
  const data = body.data ?? body;
  const remoteSubmissionId = String(data?.remoteSubmissionId ?? '');
  const version = Number(data?.version ?? data?.revisionNumber ?? 0);

  if (!remoteSubmissionId || version < 1) return null;

  // Validate the returned ID is actually a UUID v4, not an ART number
  try {
    assertValidRemoteSubmissionId(remoteSubmissionId, 'lookupByClientSubmissionId');
    return { remoteSubmissionId, version };
  } catch {
    return null;
  }
}
