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
 */
export function buildUpdateRequest(item: SyncQueueItem): UpdateRequest {
  if (!item.payload || typeof item.payload !== 'object') {
    throw new RequestBuilderError('Queue item payload is missing or invalid', 'INVALID_PAYLOAD', true);
  }

  const payloadAny = item.payload as any;

  // Resolve target identifier: remoteSubmissionId -> uniqueId -> artNumber -> submissionUuid
  const targetId =
    payloadAny.remoteSubmissionId ||
    payloadAny.uniqueId ||
    payloadAny.artNumber ||
    payloadAny.demographics?.artNumber ||
    item.submissionUuid;

  if (!targetId || typeof targetId !== 'string' || targetId.trim() === '') {
    throw new RequestBuilderError(
      'UPDATE requires a valid remoteSubmissionId or reference ID',
      'MISSING_TARGET_ID',
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
