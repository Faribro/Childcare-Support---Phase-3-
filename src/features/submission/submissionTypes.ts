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
  validationFields?: Array<{ field: string; issue: string }>;
}

/**
 * Classify an HTTP status code into a typed error category.
 */
export function classifyHttpError(statusCode: number, message?: string): SubmissionError {
  if (statusCode === 429) {
    return { category: 'rate_limited', message: message || 'Rate limited', statusCode, isRetryable: true, isTerminal: false };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { category: 'unauthorized', message: message || 'Unauthorized', statusCode, isRetryable: false, isTerminal: true };
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
