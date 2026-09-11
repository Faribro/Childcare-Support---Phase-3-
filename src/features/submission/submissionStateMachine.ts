/**
 * submissionStateMachine.ts — Canonical State Machine for Submission Lifecycle
 *
 * This is the single authority for valid state transitions.
 * UI components, route handlers, and hooks must NOT write status values directly —
 * they must call transition functions from this module.
 *
 * Prohibited field-worker UI labels:
 *   Outbox, Flush queue, Manual sync required, Needs attention,
 *   Review record, failed_final, failed_retryable, terminal,
 *   HTTP 4xx/5xx, 422, OCC, idempotency, schema validation
 */

import type {
  UserFacingSubmissionState,
  SubmissionErrorCategory,
  USER_STATE_MESSAGES,
} from './submissionTypes';

export { USER_STATE_MESSAGES } from './submissionTypes';
export type { UserFacingSubmissionState };

// ---------------------------------------------------------------------------
// Valid State Transitions
// ---------------------------------------------------------------------------

type StateTransitionMap = Partial<Record<UserFacingSubmissionState, UserFacingSubmissionState[]>>;

const VALID_TRANSITIONS: StateTransitionMap = {
  DRAFT: ['SAVING', 'ACTION_REQUIRED'],
  SAVING: ['SENDING', 'WAITING_FOR_CONNECTION', 'ACTION_REQUIRED'],
  SENDING: ['SUBMITTED', 'RETRYING', 'ACTION_REQUIRED'],
  SUBMITTED: [],                          // terminal success
  WAITING_FOR_CONNECTION: ['SENDING'],    // on reconnect
  RETRYING: ['SENDING', 'ACTION_REQUIRED'],
  ACTION_REQUIRED: ['SAVING'],            // after user corrects and re-submits
};

/**
 * Validates that a state transition is legal.
 * Throws in development; logs a warning in production.
 */
export function assertTransition(
  from: UserFacingSubmissionState,
  to: UserFacingSubmissionState
): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    const msg = `[SubmissionStateMachine] Invalid transition: ${from} -> ${to}. Allowed: [${allowed.join(', ')}]`;
    if (process.env.NODE_ENV === 'development') {
      throw new Error(msg);
    } else {
      console.warn(msg);
    }
  }
}

// ---------------------------------------------------------------------------
// Mapping from Legacy SyncStatus to UserFacingSubmissionState
// ---------------------------------------------------------------------------

/**
 * Maps internal SyncStatus values (used in the existing queue/DB layer)
 * to the user-facing state model shown in the UI.
 *
 * This is the ONLY place where internal states are translated.
 */
export function toUserFacingState(
  internalStatus: string | undefined,
  hasRemoteSubmissionId?: boolean,
  hasVersion?: boolean
): UserFacingSubmissionState {
  switch (internalStatus) {
    case 'draft':
    case 'DRAFT':
    case 'finalized_local':
      return 'DRAFT';

    case 'queued':
      // If the record has never been remotely acknowledged, it is waiting to CREATE
      return 'SAVING';

    case 'syncing':
    case 'SYNCING':
      return 'SENDING';

    case 'synced':
    case 'SYNCED':
    case 'submitted':
    case 'SUBMITTED':
      return 'SUBMITTED';

    case 'failed_retryable':
    case 'FAILED_RETRYABLE':
      // If offline, show waiting; otherwise retrying
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return 'WAITING_FOR_CONNECTION';
      }
      return 'RETRYING';

    case 'failed_final':
    case 'FAILED_FINAL':
    case 'conflict':
    case 'needs_review':
    case 'NEEDS_REVIEW':
    case 'failed':
      return 'ACTION_REQUIRED';

    default:
      // If record has no remote ID, it has not been submitted yet
      if (!hasRemoteSubmissionId) {
        return 'DRAFT';
      }
      return 'ACTION_REQUIRED';
  }
}

// ---------------------------------------------------------------------------
// ACTION_REQUIRED Context — What Field-Worker Sees
// ---------------------------------------------------------------------------

export interface ActionRequiredContext {
  /** Human-readable action label */
  message: string;
  /** Primary action label (e.g. "Open and correct") */
  actionLabel: string;
  /** Whether a secondary "Try again now" is available */
  canRetryNow: boolean;
}

/**
 * Derives the ACTION_REQUIRED context for the UI given an error category.
 */
export function getActionRequiredContext(
  errorCategory: SubmissionErrorCategory | undefined,
  validationFields?: Array<{ field: string; issue: string }>
): ActionRequiredContext {
  switch (errorCategory) {
    case 'validation':
      return {
        message: validationFields?.length
          ? `Please correct: ${validationFields.map((f) => f.field).join(', ')}`
          : 'One item needs correction before it can be submitted.',
        actionLabel: 'Open and correct',
        canRetryNow: false,
      };

    case 'conflict':
      return {
        message: 'This record was updated elsewhere. One item needs correction before it can be submitted.',
        actionLabel: 'Open and correct',
        canRetryNow: false,
      };

    case 'invalid_update_identity':
    case 'empty_update_changes':
    case 'not_found':
      return {
        message: 'This saved record needs help before it can be updated.',
        actionLabel: 'Open and correct',
        canRetryNow: false,
      };

    case 'unauthorized':
      return {
        message: 'You are not authorised to submit this record. Please sign in and try again.',
        actionLabel: 'Sign in',
        canRetryNow: false,
      };

    default:
      return {
        message: 'One item needs correction before it can be submitted.',
        actionLabel: 'Open and correct',
        canRetryNow: true,
      };
  }
}
