/**
 * submissionValidationGuard.ts
 *
 * Shared client-side helpers that turn completeSubmissionSchema Zod issues
 * into safe, user-facing messages and DOM focus actions.
 *
 * Rules:
 *  - No PII is ever surfaced in error messages.
 *  - Unknown paths fall back to a generic "review before submitting" prompt.
 *  - focusFieldForValidationPath() is a no-op when the target element is not
 *    present in the current DOM (e.g. review-only pages).
 */

import type { ZodIssue } from 'zod';

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
  'caregiverConsent':
    'Caregiver consent must be confirmed before this assessment can be submitted.',
  'demographics.artNumber':
    'A valid ART / reference number (at least 3 characters) is required.',
  'demographics.childName':
    'Child full name is required (at least 2 characters).',
  'demographics.dob':
    'A valid date of birth is required.',
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
  'finalReview':
    'Please complete the final review section before submitting.',
  uuid:
    'A valid client submission ID is required. Please restart the form.',
};

// ── Path → DOM element ID / selector map ────────────────────────────────────

const PATH_ELEMENT_IDS: Record<string, string[]> = {
  interviewerName: ['formSubmittedBy', 'q-rev-interviewer'],
  'finalReview.formSubmittedBy': ['formSubmittedBy', 'q-rev-interviewer'],
  formSubmittedBy: ['formSubmittedBy', 'q-rev-interviewer'],
  'caregiverConsent.consentProvided': ['caregiverConsent', 'q-consent'],
  'caregiverConsent': ['caregiverConsent', 'q-consent'],
  'demographics.artNumber': ['artNumber', 'q-demographics'],
  'demographics.childName': ['childName', 'q-demographics'],
  'demographics.dob': ['dob', 'q-demographics'],
  'demographics.district': ['district', 'q-demographics'],
  'demographics.caregiverName': ['caregiverName', 'q-demographics'],
  'health.weightKg': ['weightKg', 'q-health'],
  'health.heightCm': ['heightCm', 'q-health'],
  'finalReview.allInfoCorrect': ['allInfoCorrect', 'q-final-review'],
  'finalReview': ['q-final-review'],
};

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Convert the first Zod issue on a payload into a safe, user-facing message.
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

  return 'Please review the highlighted field before submitting.';
}

/**
 * Scroll to and focus the DOM element most appropriate for the given Zod path.
 * Safe to call in environments where the element may not exist.
 */
export function focusFieldForValidationPath(path: (string | number)[]): void {
  if (typeof document === 'undefined') return;

  const dotPath = path.join('.');

  // Try known element IDs first
  const candidates = PATH_ELEMENT_IDS[dotPath] || [];

  // Also try the leaf key
  const leaf = path[path.length - 1];
  if (leaf) candidates.push(...(PATH_ELEMENT_IDS[String(leaf)] || []));

  // Add the leaf itself as a last-resort ID
  if (leaf) candidates.push(String(leaf));

  for (const id of candidates) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).focus?.();
      return;
    }
  }

  // Final fallback: scroll to page top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Run completeSubmissionSchema.safeParse, and if validation fails:
 *  - resolve the first issue into a safe user message;
 *  - focus the corresponding field;
 *  - call setError with the message;
 *  - call setSubmitting(false).
 *
 * Returns true when validation PASSED (caller may proceed to enqueue).
 * Returns false when validation FAILED (caller must stop immediately).
 */
export function handleSchemaValidationFailure(params: {
  issues: ZodIssue[];
  setError: (msg: string) => void;
  setSubmitting: (val: false) => void;
}): void {
  const { issues, setError, setSubmitting } = params;
  const first = issues[0];
  const message = first
    ? toWorkerSafeValidationMessage(first)
    : 'Please review the highlighted field before submitting.';

  setSubmitting(false);
  setError(message);

  if (first) {
    focusFieldForValidationPath(first.path);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
