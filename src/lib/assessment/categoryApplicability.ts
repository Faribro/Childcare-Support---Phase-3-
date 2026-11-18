/**
 * categoryApplicability.ts
 *
 * Single Source of Truth for Needs-Based Assessment Category Applicability.
 * Used by: CategorySelectionStep, page.tsx (rendering), formRules.ts (validation),
 *          submissionSchema.ts (Zod), and the submission handler (server-side).
 *
 * Schema version 3 = category-aware submissions.
 * Schema version 2 = legacy (all sections shown, no category filter).
 */

export type SupportCategory = 'education' | 'nutrition' | 'hiv_support';

export const ALL_SUPPORT_CATEGORIES: SupportCategory[] = [
  'education',
  'nutrition',
  'hiv_support',
];

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  education: 'Education',
  nutrition: 'Nutrition',
  hiv_support: 'HIV-related support',
};

/**
 * Section keys used throughout the application (must match sectionFields in formRules.ts
 * and section ids in page.tsx).
 *
 * Applicability matrix (which sections appear for each category combination):
 *
 *   Section        | Always | Education | Nutrition | HIV-support
 *   -------------- | ------ | --------- | --------- | -----------
 *   consent        |  YES   |           |           |
 *   demographics   |  YES   |           |           |
 *   banking        |  YES   |           |           |   (optional at intake)
 *   household      |  YES   |           |           |
 *   health         |        |           |    YES*   |    YES
 *   nutrition      |        |           |    YES    |
 *   education      |        |   YES     |           |
 *   expenses       |        |   YES     |           |
 *   review         |  YES   |           |           |
 *
 * * When ONLY nutrition is selected (no hiv_support), the health section appears
 *   in a "nutrition-only mode": weight, height, Hb, appetite, meals — but ART/VL
 *   fields remain hidden via existing isFieldApplicable skip logic.
 *   This is handled by isSectionApplicable returning true for 'health' when
 *   nutrition OR hiv_support is selected.
 */
export const SECTION_APPLICABILITY: Record<string, SupportCategory[] | 'always'> = {
  consent: 'always',
  demographics: 'always',
  banking: 'always',          // optional at intake, shown for all
  household: 'always',
  health: ['nutrition', 'hiv_support'],
  nutrition: ['nutrition'],
  education: ['education'],
  expenses: ['education'],
  review: 'always',
};

/**
 * Returns true if the given section should be shown for the selected categories.
 * Pass an empty array for `categories` to show all sections (legacy / schema v2 mode).
 */
export function isSectionApplicable(
  sectionKey: string,
  categories: SupportCategory[]
): boolean {
  // Legacy mode: no categories selected means all sections visible
  if (categories.length === 0) return true;

  const rule = SECTION_APPLICABILITY[sectionKey];
  if (!rule) return true; // unknown sections default to visible

  if (rule === 'always') return true;

  // Section is applicable if ANY of its required categories are selected
  return rule.some((cat) => categories.includes(cat));
}

/**
 * Returns the ordered list of applicable section keys for the given categories.
 * Order is preserved from the canonical section order below.
 */
const CANONICAL_SECTION_ORDER = [
  'consent',
  'demographics',
  'banking',
  'household',
  'health',
  'nutrition',
  'education',
  'expenses',
  'review',
];

export function getApplicableSections(categories: SupportCategory[]): string[] {
  return CANONICAL_SECTION_ORDER.filter((sec) =>
    isSectionApplicable(sec, categories)
  );
}

/**
 * Maps individual field keys to their category requirements.
 * A field is applicable if:
 *   1. The field's category is selected, AND
 *   2. The existing isFieldApplicable skip logic also returns true.
 *
 * Fields not listed here are assumed to belong to 'always' (common) sections
 * and are always applicable (subject to existing skip logic).
 */
const FIELD_CATEGORY_MAP: Record<string, SupportCategory[] | 'always'> = {
  // Health / Clinical (HIV-specific — but anthropometrics shown for nutrition too)
  'health.artStatus': ['hiv_support'],
  'health.artRegistrationDate': ['hiv_support'],
  'health.artInitiationDate': ['hiv_support'],
  'health.artIdNumber': ['hiv_support'],
  'health.artMedicineType': ['hiv_support'],
  'health.currentlyOnArt': ['hiv_support'],
  'health.cd4Count': ['hiv_support'],
  'health.vlStatus': ['hiv_support'],
  'health.vlDate': ['hiv_support'],
  'health.viralLoad': ['hiv_support'],
  // General Health & Comorbidities
  'health.otherHealthConditions': ['nutrition', 'hiv_support'],
  'health.otherHealthConditionSpecify': ['nutrition', 'hiv_support'],
  // Anthropometrics: shown when nutrition OR hiv_support selected
  'health.weightKg': ['nutrition', 'hiv_support'],
  'health.heightCm': ['nutrition', 'hiv_support'],
  'health.haemoglobinGdl': ['nutrition', 'hiv_support'],
  // Child Disability: decoupled from HIV exclusivity — accessible across all support categories
  'health.hasDisability': ['education', 'nutrition', 'hiv_support'],
  'health.disabilityType': ['education', 'nutrition', 'hiv_support'],
  'health.disabilityCertificateStatus': ['education', 'nutrition', 'hiv_support'],
  // Nutrition section
  'nutrition.appetite': ['nutrition'],
  'nutrition.mealsPerDay': ['nutrition'],
  'nutrition.malnutritionSymptoms': ['nutrition'],
  // Education section
  'educationStatus.educationStatus': ['education'],
  'educationStatus.educationStatusSpecify': ['education'],
  'educationStatus.schoolName': ['education'],
  'educationStatus.schoolSessionStartDate': ['education'],
  'educationStatus.schoolType': ['education'],
  'educationStatus.currentClass': ['education'],
  'educationStatus.currentClassSpecify': ['education'],
  'educationStatus.attendance': ['education'],
  'educationStatus.receivingEducationSchemeBenefit': ['education'],
  'educationStatus.educationSchemeName': ['education'],
  'educationStatus.educationSchemeNameSpecify': ['education'],
  // Expenses section
  'educationExpenses.schoolFees': ['education'],
  'educationExpenses.tuitionFees': ['education'],
  'educationExpenses.books': ['education'],
  'educationExpenses.stationery': ['education'],
  'educationExpenses.uniform': ['education'],
  'educationExpenses.transport': ['education'],
  'educationExpenses.otherExpenses': ['education'],
  'educationExpenses.feeReceiptPhotoUrl': ['education'],
  'educationExpenses.marksheetPhotoUrl': ['education'],
  'educationExpenses.remarks': ['education'],
  // Support required (education)
  'educationSupportRequired.requiredSchoolFees': ['education'],
  'educationSupportRequired.requiredTuitionFees': ['education'],
  'educationSupportRequired.requiredBooks': ['education'],
  'educationSupportRequired.requiredStationery': ['education'],
  'educationSupportRequired.requiredUniform': ['education'],
  'educationSupportRequired.requiredTransport': ['education'],
  'educationSupportRequired.requiredOtherSupport': ['education'],
};

/**
 * Short-key aliases (without section prefix) for compatibility with flat formData.
 */
const FIELD_SHORT_KEY_MAP: Record<string, SupportCategory[] | 'always'> = {
  artStatus: ['hiv_support'],
  artRegistrationDate: ['hiv_support'],
  artInitiationDate: ['hiv_support'],
  artIdNumber: ['hiv_support'],
  artMedicineType: ['hiv_support'],
  currentlyOnArt: ['hiv_support'],
  cd4Count: ['hiv_support'],
  vlStatus: ['hiv_support'],
  vlDate: ['hiv_support'],
  viralLoad: ['hiv_support'],
  otherHealthConditions: ['nutrition', 'hiv_support'],
  otherHealthConditionSpecify: ['nutrition', 'hiv_support'],
  weightKg: ['nutrition', 'hiv_support'],
  heightCm: ['nutrition', 'hiv_support'],
  haemoglobinGdl: ['nutrition', 'hiv_support'],
  hasDisability: ['education', 'nutrition', 'hiv_support'],
  disabilityType: ['education', 'nutrition', 'hiv_support'],
  disabilityCertificateStatus: ['education', 'nutrition', 'hiv_support'],
  appetite: ['nutrition'],
  mealsPerDay: ['nutrition'],
  malnutritionSymptoms: ['nutrition'],
  educationStatus: ['education'],
  educationStatusSpecify: ['education'],
  schoolName: ['education'],
  schoolSessionStartDate: ['education'],
  schoolType: ['education'],
  currentClass: ['education'],
  currentClassSpecify: ['education'],
  attendance: ['education'],
  receivingEducationSchemeBenefit: ['education'],
  educationSchemeName: ['education'],
  educationSchemeNameSpecify: ['education'],
  schoolFees: ['education'],
  tuitionFees: ['education'],
  books: ['education'],
  stationery: ['education'],
  uniform: ['education'],
  transport: ['education'],
  otherExpenses: ['education'],
  feeReceiptPhotoUrl: ['education'],
  marksheetPhotoUrl: ['education'],
  remarks: ['education'],
};

/**
 * Returns true if a field is applicable given the selected categories.
 * Pass `categories = []` for legacy mode (all fields applicable).
 *
 * This is a CATEGORY-level check only. The existing isFieldApplicable()
 * in formRules.ts still governs skip logic (ART sub-fields, VL sub-fields, etc.).
 */
export function isFieldApplicableForCategories(
  fieldKey: string,
  categories: SupportCategory[]
): boolean {
  if (categories.length === 0) return true; // legacy mode

  const rule =
    FIELD_CATEGORY_MAP[fieldKey] ??
    FIELD_SHORT_KEY_MAP[fieldKey.split('.').pop() ?? fieldKey];

  if (!rule || rule === 'always') return true;

  return rule.some((cat) => categories.includes(cat));
}

/**
 * Validates and normalises a raw category array from form state or API input.
 * Returns null if invalid (empty, unknown values, etc.).
 * Does NOT store 'all' as a category value — 'all' is a UI-only control.
 */
export function validateCategories(raw: unknown): SupportCategory[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const valid: SupportCategory[] = [];
  for (const item of raw) {
    if (ALL_SUPPORT_CATEGORIES.includes(item as SupportCategory)) {
      valid.push(item as SupportCategory);
    } else {
      return null; // unknown value → reject entire array
    }
  }

  return valid.length > 0 ? valid : null;
}
