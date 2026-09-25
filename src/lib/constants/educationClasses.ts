/**
 * educationClasses.ts
 *
 * Single source of truth for India-aligned Current Class options, constants,
 * type guards, and display formatting helpers.
 *
 * Implements GitHub Issue #45.
 */

export const CURRENT_CLASS_OPTIONS = [
  'Pre-Nursery',
  'Nursery',
  'LKG / Jr. KG',
  'UKG / Sr. KG',
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
  'Class 12+ / Higher Education',
  'Not currently enrolled',
  'Other (specify)',
] as const;

export type CurrentClassOption = (typeof CURRENT_CLASS_OPTIONS)[number];

export const OTHER_SPECIFY_CLASS = 'Other (specify)';

/**
 * Type guard to check whether a given string is one of the canonical standard class options (excluding Other (specify)).
 */
export function isCanonicalCurrentClass(value: unknown): value is CurrentClassOption {
  if (typeof value !== 'string') return false;
  if (value === OTHER_SPECIFY_CLASS) return false;
  return (CURRENT_CLASS_OPTIONS as readonly string[]).includes(value);
}

/**
 * Formats Current Class and optional Other specification for display in
 * read-only views, cards, modals, and review pages.
 *
 * - Canonical option: "Class 10" -> "Class 10"
 * - Other with detail: "Other (specify)", "Diploma in Mechanical" -> "Other — Diploma in Mechanical"
 * - Legacy custom free-text: "Std 7" -> "Std 7"
 * - Blank/missing: undefined/"" -> ""
 */
export function formatCurrentClassDisplay(
  currentClass?: string | null,
  currentClassSpecify?: string | null
): string {
  if (!currentClass || currentClass.trim() === '') {
    return '';
  }
  const trimmedClass = currentClass.trim();
  if (trimmedClass === OTHER_SPECIFY_CLASS || trimmedClass.toLowerCase() === 'other') {
    if (currentClassSpecify && currentClassSpecify.trim() !== '') {
      return `Other — ${currentClassSpecify.trim()}`;
    }
    return trimmedClass;
  }
  return trimmedClass;
}
