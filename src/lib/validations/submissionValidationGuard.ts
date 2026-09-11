/**
 * submissionValidationGuard.ts
 *
 * Shared client-side helpers that turn completeSubmissionSchema Zod issues
 * into safe, user-facing messages and exact DOM focus actions.
 *
 * Rules:
 *  - No PII is ever surfaced in error messages.
 *  - Unknown paths produce a safe section-level fallback, never a generic top-only error.
 *  - Exact field navigation via formValidationRegistry (never window.scrollTo(0, 0)).
 *  - All errors are normalized into FormValidationError.
 */

import type { ZodIssue } from 'zod';
import {
  FormValidationError,
  getFieldMetadata,
  normalizeValidationErrors,
  navigateToValidationError,
  FIELD_REGISTRY,
  SECTION_DOM_IDS,
} from './formValidationRegistry';

export type { FormValidationError };
export {
  getFieldMetadata,
  normalizeValidationErrors,
  navigateToValidationError,
};

// ── Path → human message map ─────────────────────────────────────────────────

const PATH_MESSAGES: Record<string, string> = {
  interviewerName:
    'Please enter the interviewer name (at least 2 characters) before submitting.',
  'finalReview.formSubmittedBy':
    'Please enter the interviewer name (at least 2 characters) before submitting.',
  formSubmittedBy:
    'Please enter the interviewer name (at least 2 characters) before submitting.',
  'caregiverConsent.consentProvided':
    'Caregiver consent must be confirmed before this assessment can be submitted.',
  'caregiverConsent.signature':
    'Please save the caregiver signature before submitting.',
  caregiverConsent:
    'Caregiver consent must be confirmed before this assessment can be submitted.',
  'demographics.artNumber':
    'A valid ART / reference number (at least 3 characters) is required.',
  'demographics.childName':
    'Child full name is required (at least 2 characters).',
  'demographics.dob':
    'A valid date of birth is required and cannot be in the future.',
  'demographics.district':
    'District is required.',
  'demographics.state':
    'State / Union Territory is required.',
  'demographics.caregiverName':
    'Caregiver name is required.',
  'health.weightKg':
    'Weight must be between 0 and 150 kg.',
  'health.heightCm':
    'Height must be between 0 and 220 cm.',
  'finalReview.allInfoCorrect':
    'You must confirm that all information is correct before submitting.',
  finalReview:
    'Please complete the final review section before submitting.',
  uuid:
    'A valid client submission ID is required. Please restart the form.',
};

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Convert a Zod issue on a payload into a safe, user-facing message.
 * Never includes field values or PII.
 */
export function toWorkerSafeValidationMessage(issue: ZodIssue): string {
  const dotPath = issue.path.join('.');
  if (PATH_MESSAGES[dotPath]) return PATH_MESSAGES[dotPath];

  // Try prefix matches (e.g. "demographics.artNumber" → "demographics.artNumber")
  for (const key of Object.keys(PATH_MESSAGES)) {
    if (dotPath.startsWith(key)) return PATH_MESSAGES[key];
  }

  // Leaf key fallback
  const leaf = issue.path[issue.path.length - 1];
  if (leaf && PATH_MESSAGES[String(leaf)]) return PATH_MESSAGES[String(leaf)];

  // Registry metadata lookup
  const meta = getFieldMetadata(issue.path);
  if (issue.message && !issue.message.startsWith('Required') && !issue.message.startsWith('Invalid')) {
    return issue.message;
  }
  return meta.defaultMessage || 'Some information needs review in this section.';
}

/**
 * Scroll to and focus the DOM element most appropriate for the given Zod path.
 * Uses exact field navigation and section element fallback; never window.scrollTo(0, 0).
 */
export function focusFieldForValidationPath(path: (string | number)[]): void {
  if (typeof document === 'undefined') return;

  const meta = getFieldMetadata(path);
  const error: FormValidationError = {
    path: path.map(String),
    fieldKey: meta.elementId,
    sectionKey: meta.sectionKey,
    message: meta.defaultMessage || 'Please review this field.',
    label: meta.label,
    elementId: meta.elementId,
  };

  navigateToValidationError(error);
}

/**
 * Run completeSubmissionSchema.safeParse, and if validation fails:
 *  - normalizes issues into FormValidationError[];
 *  - generates the count message "Please correct N field(s) before submitting.";
 *  - navigates to the first error's exact field;
 *  - calls setError with the count message;
 *  - calls setSubmitting(false).
 *
 * Returns normalized errors list.
 */
export function handleSchemaValidationFailure(params: {
  issues: ZodIssue[];
  setError: (msg: string) => void;
  setSubmitting: (val: false) => void;
  customErrors?: FormValidationError[];
  onErrorsNormalized?: (errors: FormValidationError[]) => void;
}): FormValidationError[] {
  const { issues, setError, setSubmitting, customErrors, onErrorsNormalized } = params;

  const normalized = normalizeValidationErrors({
    zodIssues: issues,
    customErrors,
  });

  const count = normalized.length;
  const message = `Please correct ${count} ${count === 1 ? 'field' : 'fields'} before submitting.`;

  setSubmitting(false);
  setError(message);

  if (onErrorsNormalized) {
    onErrorsNormalized(normalized);
  }

  if (normalized.length > 0) {
    navigateToValidationError(normalized[0]);
  }

  return normalized;
}
