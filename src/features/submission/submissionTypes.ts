/**
 * submissionTypes.ts — Canonical Identity Contract
 *
 * This is the single source of truth for submission identity fields across the
 * queue, worker, gateway, API, adapter, and tests.
 *
 * INVARIANT (must be enforced everywhere):
 *   const operation = (record.remoteSubmissionId && record.version)
 *     ? 'UPDATE'
 *     : 'CREATE';
 *
 * PROHIBITED URL builders:
 *   PATCH /api/submissions/${artReferenceId}         <- forbidden
 *   PATCH /api/submissions/${childId}                <- forbidden
 *   PATCH /api/submissions/${localDraftId}           <- forbidden
 *   PATCH /api/submissions/${clientSubmissionId}     <- forbidden
 */

import type { SyncQueueItem } from '@/types/domain';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';

// ---------------------------------------------------------------------------
// Identity Field Definitions
// ---------------------------------------------------------------------------

/**
 * Browser-local IndexedDB primary key. Never sent in URL paths.
 * May be included in a request body for safe correlation if needed.
 */
export type LocalDraftId = number;

/**
 * Stable client-generated UUIDv4. Generated ONCE when a draft becomes a
 * final submission. Never regenerated on retry, reload, reconnect, or
 * double-click. Used for idempotency and reconciliation lookup.
 */
export type ClientSubmissionId = string;

/**
 * Stable idempotency key for the CREATE lifecycle. Generated once.
 * Preserved on every retry. Format: "create-<clientSubmissionId>".
 */
export type CreateIdempotencyKey = string;

/**
 * The ONLY identifier permitted in:
 *   PATCH /api/submissions/${remoteSubmissionId}
 * Exists only after a successful server/adapter acknowledgement.
 * Persisted locally after acknowledgement.
 */
export type RemoteSubmissionId = string;

/**
 * Server-issued concurrency/version token.
 * Required for updates. Persisted after every successful create/update
 * acknowledgement.
 */
export type SubmissionVersion = number;

/**
 * ART reference ID — a BUSINESS FIELD only.
 * May be displayed in the UI and included in the request body.
 * MUST NEVER:
 *   - select CREATE vs UPDATE
 *   - appear in /api/submissions/:id URL path
 *   - be treated as proof that a remote record exists
 */
export type ArtReferenceId = string;

// ---------------------------------------------------------------------------
// Canonical Submission Identity Record
// ---------------------------------------------------------------------------

export interface SubmissionIdentity {
  /** IndexedDB primary key — browser-local only */
  localDraftId?: LocalDraftId;

  /** Stable client UUID — generated once, never regenerated */
  clientSubmissionId: ClientSubmissionId;

  /** Stable CREATE idempotency key — generated once, preserved on retry */
  createIdempotencyKey: CreateIdempotencyKey;

  /**
   * Server-confirmed remote ID — exists only after acknowledged CREATE.
   * This is the ONLY value allowed in PATCH URL paths.
   */
  remoteSubmissionId?: RemoteSubmissionId;

  /**
   * Server-issued version token — required for UPDATE operations.
   * Populated only after acknowledged CREATE or UPDATE.
   */
  version?: SubmissionVersion;

  /** Human-readable ART/reference ID — business field only, never in URLs */
  artReferenceId?: ArtReferenceId;
}

// ---------------------------------------------------------------------------
// Operation Determination — The Single Canonical Invariant
// ---------------------------------------------------------------------------

export type SubmissionOperation = 'CREATE' | 'UPDATE';

/**
 * Determines the required operation based solely on confirmed server identity.
 *
 * This is the ONLY correct way to decide CREATE vs UPDATE.
 * Do NOT use artReferenceId, childId, localDraftId, or clientSubmissionId
 * for this determination.
 */
export function getSubmissionOperation(identity: Pick<SubmissionIdentity, 'remoteSubmissionId' | 'version'>): SubmissionOperation {
  if (identity.remoteSubmissionId && identity.version && identity.version >= 1) {
    return 'UPDATE';
  }
  return 'CREATE';
}

// ---------------------------------------------------------------------------
// URL Guard — Prevents Business IDs in PATCH URL Paths
// ---------------------------------------------------------------------------

/**
 * Regex for ART/beneficiary reference numbers (e.g. "DL-SOU-101550-01",
 * "WB-KOL-081255-01", "ART-TEST-0001").
 * If a candidate remote ID matches this pattern, it is a business ID, not
 * a server-assigned remote submission ID.
 */
const ART_ID_PATTERN = /^[A-Z]{2,6}-[A-Z0-9]{2,8}-\d{4,8}(-\d{1,4})?$/i;

/**
 * UUID v4 pattern — the expected format for server-assigned remote submission IDs.
 */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Asserts that a candidate remote submission ID is valid for use in a PATCH URL.
 * Throws if the candidate is:
 *   - falsy
 *   - an ART/reference pattern
 *   - not a UUID v4
 */
export function assertValidRemoteSubmissionId(
  candidate: string | undefined | null,
  context = 'PATCH URL builder'
): asserts candidate is RemoteSubmissionId {
  if (!candidate || candidate.trim() === '') {
    throw new Error(
      `[${context}] remoteSubmissionId is required for UPDATE operations. ` +
      `Record has no confirmed server acknowledgement yet — use POST /api/submissions instead.`
    );
  }

  if (ART_ID_PATTERN.test(candidate)) {
    throw new Error(
      `[${context}] Attempted to use an ART/reference business ID "${candidate}" in a PATCH URL. ` +
      `ART reference IDs must only appear in the request body, never in URL paths. ` +
      `This record has not been acknowledged by the server yet — use POST /api/submissions.`
    );
  }

  if (!UUID_V4_PATTERN.test(candidate)) {
    throw new Error(
      `[${context}] remoteSubmissionId "${candidate}" is not a valid UUID v4. ` +
      `Only server-assigned UUID v4 identifiers are permitted in PATCH URL paths.`
    );
  }
}

// ---------------------------------------------------------------------------
// User-Facing Submission States (Phase 3)
// ---------------------------------------------------------------------------

export type UserFacingSubmissionState =
  | 'DRAFT'
  | 'SAVING'
  | 'SENDING'
  | 'SUBMITTED'
  | 'WAITING_FOR_CONNECTION'
  | 'RETRYING'
  | 'ACTION_REQUIRED';

/**
 * Human-readable field-worker messages for each state.
 * Must NOT contain technical terms like "Outbox", "422", "OCC", "terminal".
 */
export const USER_STATE_MESSAGES: Record<UserFacingSubmissionState, string> = {
  DRAFT: 'Draft saved on this device.',
  SAVING: 'Saving your assessment\u2026',
  SENDING: 'Sending your assessment\u2026',
  SUBMITTED: 'Submitted successfully.',
  WAITING_FOR_CONNECTION: 'Saved on this device. It will send automatically when you reconnect.',
  RETRYING: 'Your assessment is safe on this device. We will try again automatically.',
  ACTION_REQUIRED: 'One item needs correction before it can be submitted.',
};

// ---------------------------------------------------------------------------
// Server Acknowledgement
// ---------------------------------------------------------------------------

export interface ServerAcknowledgement {
  remoteSubmissionId: RemoteSubmissionId;
  clientSubmissionId: ClientSubmissionId;
  version: SubmissionVersion;
  requestId: string;
  submittedAt?: string;
  acceptedAt?: string;
  updatedAt?: string;
  isDuplicate?: boolean;
}

// ---------------------------------------------------------------------------
// Typed Error Categories
// ---------------------------------------------------------------------------

export type SubmissionErrorCategory =
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'validation'
  | 'unauthorized'
  | 'conflict'
  | 'not_found'
  | 'malformed_acknowledgement'
  | 'invalid_update_identity'
  | 'empty_update_changes'
  | 'signature_migration_failed'
  | 'unknown';

/**
 * Thrown when enqueueUpdate is called with an empty, null, or undefined changes object.
 * Prevents creation of UPDATE queue items that would result in an empty PATCH body.
 */
export class EmptyUpdateChangesError extends Error {
  constructor(message = 'Cannot enqueue UPDATE with empty changes. At least one changed field is required.') {
    super(message);
    this.name = 'EmptyUpdateChangesError';
  }
}

export interface SubmissionError {
  category: SubmissionErrorCategory;
  message: string;
  statusCode?: number;
  isRetryable: boolean;
  isTerminal: boolean;
  validationFields?: Array<{ field: string; issue: string; code?: string }>;
  validationIssuePaths?: string[];
  validationIssueCodes?: string[];
}

/**
 * Classify an HTTP status code into a typed error category.
 */
export function classifyHttpError(statusCode: number, message?: string): SubmissionError {
  if (statusCode === 429) {
    return { category: 'rate_limited', message: message || 'Rate limited', statusCode, isRetryable: true, isTerminal: false };
  }
  if (statusCode === 401 || statusCode === 403) {
    return {
      category: 'unauthorized',
      message: message || 'Your session expired. Please sign in again. Your saved assessment remains safe on this device.',
      statusCode,
      isRetryable: false,
      isTerminal: false,
    };
  }
  if (statusCode === 404) {
    return { category: 'not_found', message: message || 'Record not found on server', statusCode, isRetryable: false, isTerminal: false };
  }
  if (statusCode === 409) {
    return { category: 'conflict', message: message || 'Concurrency conflict', statusCode, isRetryable: false, isTerminal: false };
  }
  if (statusCode === 422 || statusCode === 400) {
    return { category: 'validation', message: message || 'Validation error', statusCode, isRetryable: false, isTerminal: true };
  }
  if (statusCode >= 500 && statusCode < 600) {
    return { category: 'upstream_unavailable', message: message || 'Server error', statusCode, isRetryable: true, isTerminal: false };
  }
  return { category: 'unknown', message: message || 'Unknown error', statusCode, isRetryable: false, isTerminal: true };
}

// ---------------------------------------------------------------------------
// Canonical UUID & Caregiver Consent Normalization
// ---------------------------------------------------------------------------

export function isValidUuid(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim());
}

export function isValidUuidV4(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim());
}

export function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function ensureValidUuidV4(candidate?: unknown): string {
  if (isValidUuidV4(candidate)) return (candidate as string).trim();
  return generateUuidV4();
}

export interface CanonicalCaregiverConsent {
  consentProvided: true;
  consentVersion: string;
  caregiverName: string;
  caregiverRelationship: string;
  consentCapturedAt: string;
  signatureRequired: boolean;
  signatureStatus: 'NOT_REQUIRED' | 'PENDING' | 'CAPTURED_LOCAL' | 'QUEUED_FOR_UPLOAD' | 'UPLOADED' | 'FAILED' | 'NEEDS_REVIEW';
  signatureAssetId?: string;
  signatureDataUrl?: string;
  signatureUrl?: string;
}

export function hasVerifiableConsent(record: any): boolean {
  if (!record || typeof record !== 'object') return false;

  const cc = record.caregiverConsent;
  if (cc && typeof cc === 'object') {
    if (cc.consentProvided === true || cc.consentProvided === 'true') return true;
    if (cc.agreeToParticipate === true || cc.agreeToParticipate === 'true') return true;
    if (cc.accepted === true || cc.accepted === 'true') return true;
  }

  const c = record.consent;
  if (c && typeof c === 'object') {
    if (c.agreeToParticipate === true || c.agreeToParticipate === 'true') return true;
    if (c.consentProvided === true || c.consentProvided === 'true') return true;
    if (c.caregiverConsentProvided === true || c.caregiverConsentProvided === 'true') return true;
  }

  const d = record.declaration;
  if (d && typeof d === 'object') {
    if (d.consentAcknowledged === true || d.consentAcknowledged === 'true') return true;
  }

  if (record.agreeToParticipate === true || record.agreeToParticipate === 'true') return true;
  if (record.consentProvided === true || record.consentProvided === 'true') return true;

  return false;
}

export function normalizeCaregiverConsent(record: any): CanonicalCaregiverConsent | null {
  if (!hasVerifiableConsent(record)) {
    return null;
  }

  const cc = (record.caregiverConsent && typeof record.caregiverConsent === 'object') ? record.caregiverConsent : {};
  const c = (record.consent && typeof record.consent === 'object') ? record.consent : {};
  const demographics = (record.demographics && typeof record.demographics === 'object') ? record.demographics : {};

  const caregiverName =
    cc.caregiverName ||
    demographics.caregiverName ||
    record.caregiverName ||
    'Caregiver';

  const caregiverRelationship =
    cc.caregiverRelationship ||
    demographics.caregiverRelationship ||
    record.caregiverRelationship ||
    'Mother';

  const consentCapturedAt =
    cc.consentCapturedAt ||
    c.signatureTimestamp ||
    record.createdAt ||
    new Date().toISOString();

  const signatureDataUrl =
    cc.signatureDataUrl ||
    c.signatureDataUrl ||
    record.signatureDataUrl ||
    undefined;

  const rawStatus = cc.signatureStatus || (signatureDataUrl ? 'CAPTURED_LOCAL' : 'PENDING');
  const validStatuses = new Set([
    'NOT_REQUIRED',
    'PENDING',
    'CAPTURED_LOCAL',
    'QUEUED_FOR_UPLOAD',
    'UPLOADED',
    'FAILED',
    'NEEDS_REVIEW',
  ]);
  const signatureStatus = (validStatuses.has(rawStatus) ? rawStatus : 'CAPTURED_LOCAL') as CanonicalCaregiverConsent['signatureStatus'];

  return {
    consentProvided: true,
    consentVersion: cc.consentVersion || 'v1.0-2026',
    caregiverName,
    caregiverRelationship,
    consentCapturedAt,
    signatureRequired: cc.signatureRequired ?? true,
    signatureStatus,
    signatureAssetId: cc.signatureAssetId,
    signatureDataUrl,
    signatureUrl: cc.signatureUrl,
  };
}

// ---------------------------------------------------------------------------
// Recoverable Legacy Identity & Consent Validation Evidence
// ---------------------------------------------------------------------------

export const ALLOWED_LEGACY_IDENTITY_CONSENT_PATHS: ReadonlySet<string> = new Set([
  'uuid',
  'clientSubmissionId',
  'caregiverConsent.consentProvided',
  'caregiverConsent',
]);

/**
 * Determines whether a failed queue item is exclusively caused by the known
 * legacy technical identity or consent mismatch and can be safely recovered
 * and requeued as a CREATE operation.
 *
 * It returns true ONLY when:
 * 1. The item has no confirmed remoteSubmissionId and no remote acknowledgement.
 * 2. The operation is CREATE (never UPDATE).
 * 3. The recorded prior failure is NOT an excluded terminal state (conflict,
 *    invalid update identity, signature migration failure, unauthorized).
 * 4. The recorded prior error is a 422 / validation failure:
 *    - If server validation evidence (validationIssuePaths) exists:
 *      Every path must strictly be one of:
 *        - 'uuid'
 *        - 'clientSubmissionId'
 *        - 'caregiverConsent.consentProvided'
 *        - 'caregiverConsent'
 *      If ANY other path is present (e.g. 'demographics.childName'), return false.
 *    - If no server validation evidence exists:
 *      Item must have been created by a known pre-canonical local version
 *      (schemaVersion < 3 or undefined/null).
 * 5. After canonical normalization, completeSubmissionSchema passes.
 */
export function isRecoverableLegacyIdentityConsentFailure(item: SyncQueueItem): boolean {
  // 1. Must have no remoteSubmissionId and no remote acknowledgement
  const payloadAny = item.payload as any;
  if (item.remoteSubmissionId || payloadAny?.remoteSubmissionId) {
    return false;
  }
  if (item.acknowledged || payloadAny?.acknowledged) {
    return false;
  }

  // 2. Operation must be CREATE (never UPDATE)
  if (item.operationType && item.operationType !== 'CREATE') {
    return false;
  }

  // 3. Never clear conflict status, invalid update identity, signature migration failure, or authorization state
  if (
    item.errorCategory === 'conflict' ||
    item.errorCategory === 'invalid_update_identity' ||
    item.errorCategory === 'signature_migration_failed' ||
    item.errorCategory === 'unauthorized' ||
    item.lastErrorCode === 401 ||
    item.lastErrorCode === 403 ||
    item.conflictMetadata
  ) {
    return false;
  }

  // 4. Must be a prior 422 / validation failure or a pre-canonical local item
  const isPriorValidationError =
    item.lastErrorCode === 422 ||
    item.lastErrorCode === '422' ||
    item.errorCategory === 'validation' ||
    item.status === 'failed_final' ||
    item.status === 'FAILED_FINAL' ||
    item.status === 'needs_review' ||
    item.status === 'NEEDS_REVIEW';

  const paths = item.validationIssuePaths ?? [];

  if (paths.length > 0) {
    // If validation paths are recorded, prior error must be validation/422
    if (!isPriorValidationError) {
      return false;
    }
    // Every recorded validation path must be strictly one of the allowed legacy paths
    const allPathsAllowed = paths.every((p: string) => ALLOWED_LEGACY_IDENTITY_CONSENT_PATHS.has(p));
    if (!allPathsAllowed) {
      return false;
    }
  } else {
    // No server validation paths recorded:
    // Permitted ONLY if created by a known pre-canonical local version (schemaVersion < 3)
    const isPreCanonicalVersion =
      item.schemaVersion === undefined ||
      item.schemaVersion === null ||
      item.schemaVersion < 3;

    if (!isPreCanonicalVersion) {
      return false;
    }
  }

  // 5. After canonical normalization, completeSubmissionSchema must pass
  const payload = item.payload ? JSON.parse(JSON.stringify(item.payload)) : {};

  // Extract or preserve business reference ID
  const oldRefId =
    payload.demographics?.artNumber ||
    payload.legacyBusinessReference ||
    payload.uniqueId ||
    (!isValidUuidV4(payload.uuid) ? payload.uuid : undefined) ||
    (!isValidUuidV4(item.submissionUuid) ? item.submissionUuid : undefined);

  if (!payload.demographics || typeof payload.demographics !== 'object') {
    payload.demographics = {};
  }
  if (oldRefId && !payload.demographics.artNumber) {
    payload.demographics.artNumber = oldRefId;
  }
  if (oldRefId && !payload.legacyBusinessReference) {
    payload.legacyBusinessReference = oldRefId;
  }

  // Canonical UUIDv4
  const canonicalUuid =
    (isValidUuidV4(payload.uuid) ? payload.uuid : null) ||
    (isValidUuidV4(payload.clientSubmissionId) ? payload.clientSubmissionId : null) ||
    (isValidUuidV4(item.submissionUuid) ? item.submissionUuid : null) ||
    '00000000-0000-4000-a000-000000000000'; // Synthetic valid UUID for schema check

  payload.uuid = canonicalUuid;
  payload.clientSubmissionId = canonicalUuid;

  // Caregiver consent normalization
  if (hasVerifiableConsent(payload)) {
    const normalizedConsent = normalizeCaregiverConsent(payload);
    if (normalizedConsent) {
      payload.caregiverConsent = normalizedConsent;
      payload.consent = {
        agreeToParticipate: true,
        signatureDataUrl: normalizedConsent.signatureDataUrl,
        signatureTimestamp: normalizedConsent.consentCapturedAt,
      };
    }
  } else {
    // Consent cannot be verified -> not recoverable without user action
    return false;
  }

  const parsed = completeSubmissionSchema.safeParse(payload);
  return parsed.success;
}

