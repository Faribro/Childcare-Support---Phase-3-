/**
 * Safe Request Builders for Sync Dispatch (Phase 1 & 2 Contract)
 * 
 * Invariants:
 * 1. CREATE: Dispatches POST /api/submissions with complete validated payload.
 * 2. UPDATE: Dispatches PATCH /api/submissions/{remoteSubmissionId} with { changes }.
 * 3. OCC: If-Match header is the canonical public contract for expectedVersion.
 * 4. Idempotency: Idempotency-Key header is mandatory for all mutations.
 * 5. Data Safety: Strips local metadata and protected fields; preserves false and 0.
 * 6. Privacy: Never logs or emits raw sensitive values; diagnostics contain only paths and codes.
 */

import { z } from 'zod';
import type { SyncQueueItem } from '@/types/domain';
import {
  CompleteSubmissionPayload,
  AllowlistedPatchChanges,
  completeSubmissionSchema,
  allowlistedPatchChangesSchema,
  flattenPatchBody,
} from '@/lib/validations/submissionSchema';

export interface SafeValidationIssue {
  path: string;
  code: string;
}

export class RequestBuilderError extends Error {
  public readonly code: string;
  public readonly isTerminal: boolean;
  public readonly issues: SafeValidationIssue[];

  constructor(message: string, code: string, isTerminal = true, issues: SafeValidationIssue[] = []) {
    super(message);
    this.name = 'RequestBuilderError';
    this.code = code;
    this.isTerminal = isTerminal;
    this.issues = issues;
  }
}

export interface CreateRequest {
  url: string;
  method: 'POST';
  headers: {
    'Content-Type': string;
    'Idempotency-Key': string;
    [key: string]: string;
  };
  body: CompleteSubmissionPayload;
}

export interface UpdateRequest {
  url: string;
  method: 'PATCH';
  headers: {
    'Content-Type': string;
    'Idempotency-Key': string;
    'If-Match': string;
    [key: string]: string;
  };
  body: {
    changes: AllowlistedPatchChanges;
  };
}

const PROTECTED_PATCH_KEYS = new Set([
  'uuid',
  'clientSubmissionId',
  'remoteSubmissionId',
  'createdAt',
  'created_at',
  'id',
  'stepIndex',
  'syncStatus',
  'syncNeeded',
  'syncedAt',
  'syncError',
  'idempotencyKey',
  'expectedVersion',
]);

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractSafeDiagnostics(issues: z.ZodIssue[]): SafeValidationIssue[] {
  return issues.map((i) => ({
    path: i.path.join('.'),
    code: i.code,
  }));
}

/**
 * Builds a validated, metadata-stripped CREATE request for POST /api/submissions
 */
export function buildCreateRequest(item: SyncQueueItem): CreateRequest {
  if (!item.payload || typeof item.payload !== 'object') {
    throw new RequestBuilderError('Queue item payload is missing or invalid', 'INVALID_PAYLOAD', true);
  }

  const payload: any = { ...item.payload };

  // Strip local storage metadata
  delete payload.id;
  delete payload.stepIndex;
  delete payload.syncStatus;
  delete payload.syncNeeded;
  delete payload.syncedAt;
  delete payload.syncError;
  delete payload.createdAt;
  delete payload.updatedAt;

  // Resolve and validate client UUID
  const clientUuid = payload.uuid || item.submissionUuid;
  if (!clientUuid || !UUID_V4_REGEX.test(clientUuid)) {
    throw new RequestBuilderError(
      'CREATE requires a valid RFC 4122 UUIDv4 client submission ID',
      'INVALID_UUID',
      true,
      [{ path: 'uuid', code: 'invalid_string' }]
    );
  }
  payload.uuid = clientUuid;
  if (!payload.clientSubmissionId) {
    payload.clientSubmissionId = clientUuid;
  }

  const validation = completeSubmissionSchema.safeParse(payload);
  if (!validation.success) {
    const issues = extractSafeDiagnostics(validation.error.issues);
    throw new RequestBuilderError(
      `CREATE validation failed on ${issues.length} field(s)`,
      'VALIDATION_ERROR',
      true,
      issues
    );
  }

  const idempotencyKey = item.idempotencyKey || `create-${clientUuid}`;

  return {
    url: '/api/submissions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: validation.data,
  };
}

/**
 * Builds a validated, metadata-stripped UPDATE request for PATCH /api/submissions/{remoteSubmissionId}
 *
 * INVARIANT: Only a server-confirmed UUID v4 remoteSubmissionId is permitted in the URL.
 * ART reference IDs, child IDs, beneficiary IDs, and local UUIDs are NOT valid here.
 * If the record lacks a confirmed remoteSubmissionId, it must use POST (CREATE) instead.
 */
export function buildUpdateRequest(item: SyncQueueItem): UpdateRequest {
  if (!item.payload || typeof item.payload !== 'object') {
    throw new RequestBuilderError('Queue item payload is missing or invalid', 'INVALID_PAYLOAD', true);
  }

  const payloadAny = item.payload as any;

  // STRICT: Only remoteSubmissionId is permitted in a PATCH URL.
  // ART numbers, uniqueId, artNumber, demographics.artNumber, and submissionUuid
  // are business fields or local identifiers — they must NEVER appear in PATCH URL paths.
  const targetId: string | undefined = payloadAny.remoteSubmissionId;

  // Guard: reject missing, blank, ART-format, or non-UUID-v4 identifiers
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ART_ID_PATTERN = /^[A-Z]{2,6}-[A-Z0-9]{2,8}-\d{4,8}(-\d{1,4})?$/i;

  if (!targetId || typeof targetId !== 'string' || targetId.trim() === '') {
    throw new RequestBuilderError(
      'UPDATE requires a server-confirmed remoteSubmissionId. ' +
      'This record has no confirmed server acknowledgement — use POST /api/submissions (CREATE) instead.',
      'MISSING_REMOTE_ID',
      true,
      [{ path: 'remoteSubmissionId', code: 'invalid_string' }]
    );
  }

  if (ART_ID_PATTERN.test(targetId)) {
    throw new RequestBuilderError(
      `UPDATE rejected: "${targetId}" appears to be an ART/reference business ID, not a server-assigned remote submission ID. ` +
      'ART reference IDs must only appear in the request body. Use POST /api/submissions (CREATE) for unacknowledged records.',
      'BUSINESS_ID_IN_URL',
      true,
      [{ path: 'remoteSubmissionId', code: 'invalid_string' }]
    );
  }

  if (!UUID_V4_REGEX.test(targetId)) {
    throw new RequestBuilderError(
      `UPDATE rejected: remoteSubmissionId "${targetId}" is not a valid UUID v4. ` +
      'Only server-assigned UUID v4 identifiers are permitted in PATCH URL paths.',
      'INVALID_REMOTE_ID_FORMAT',
      true,
      [{ path: 'remoteSubmissionId', code: 'invalid_string' }]
    );
  }

  // Resolve OCC expectedVersion canonically - do not default to 1
  const rawVersion =
    item.expectedVersion ??
    payloadAny.expectedVersion ??
    payloadAny.version;

  if (rawVersion === undefined || rawVersion === null || rawVersion === '') {
    throw new RequestBuilderError(
      'UPDATE requires expectedVersion to be specified',
      'MISSING_EXPECTED_VERSION',
      true,
      [{ path: 'expectedVersion', code: 'invalid_type' }]
    );
  }

  const expectedVersion = Number(rawVersion);

  if (isNaN(expectedVersion) || expectedVersion < 1) {
    throw new RequestBuilderError(
      'UPDATE requires expectedVersion to be a positive integer',
      'INVALID_EXPECTED_VERSION',
      true,
      [{ path: 'expectedVersion', code: 'invalid_type' }]
    );
  }

  // Extract changes: if already structured as { changes }, use it; otherwise flatten
  let rawChanges: Record<string, any>;
  if (payloadAny.changes && typeof payloadAny.changes === 'object') {
    rawChanges = { ...payloadAny.changes };
  } else {
    rawChanges = flattenPatchBody(payloadAny);
  }

  // Strictly filter out protected / internal keys
  const sanitizedChanges: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawChanges)) {
    if (PROTECTED_PATCH_KEYS.has(key)) {
      continue;
    }
    // Preserve meaningful false and 0; convert null/empty-string to undefined for optional fields
    if (value === null || value === '') {
      sanitizedChanges[key] = undefined;
    } else {
      sanitizedChanges[key] = value;
    }
  }

  const validation = allowlistedPatchChangesSchema.safeParse(sanitizedChanges);
  if (!validation.success) {
    const issues = extractSafeDiagnostics(validation.error.issues);
    throw new RequestBuilderError(
      `UPDATE validation failed on ${issues.length} field(s)`,
      'VALIDATION_ERROR',
      true,
      issues
    );
  }

  const idempotencyKey = item.idempotencyKey || `update-${targetId}-${expectedVersion}`;

  return {
    url: `/api/submissions/${encodeURIComponent(targetId)}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'If-Match': `"${expectedVersion}"`,
    },
    body: {
      changes: validation.data,
    },
  };
}
