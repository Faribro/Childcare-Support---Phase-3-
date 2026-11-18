import { describe, it, expect } from 'vitest';
import {
  isSectionApplicable,
  isFieldApplicableForCategories,
  getApplicableSections,
  validateCategories,
  ALL_SUPPORT_CATEGORIES,
  type SupportCategory,
} from '@/lib/assessment/categoryApplicability';
import {
  validateEntireForm,
  validateField,
  validateSection,
  sanitizeSubmissionPayload,
  CATEGORY_SCHEMA_VERSION,
} from '@/lib/validations/formRules';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';

describe('Assessment Category Applicability Matrix', () => {
  it('identifies applicable sections for all 7 non-empty combinations', () => {
    // 1. Education only
    const eduSections = getApplicableSections(['education']);
    expect(eduSections).toContain('consent');
    expect(eduSections).toContain('demographics');
    expect(eduSections).toContain('banking');
    expect(eduSections).toContain('household');
    expect(eduSections).toContain('education');
    expect(eduSections).toContain('expenses');
    expect(eduSections).toContain('review');
    expect(eduSections).not.toContain('health');
    expect(eduSections).not.toContain('nutrition');

    // 2. Nutrition only
    const nutSections = getApplicableSections(['nutrition']);
    expect(nutSections).toContain('health'); // weight, height, Hb
    expect(nutSections).toContain('nutrition');
    expect(nutSections).not.toContain('education');
    expect(nutSections).not.toContain('expenses');

    // 3. HIV support only
    const hivSections = getApplicableSections(['hiv_support']);
    expect(hivSections).toContain('health'); // ART, VL, etc.
    expect(hivSections).not.toContain('nutrition');
    expect(hivSections).not.toContain('education');
    expect(hivSections).not.toContain('expenses');

    // 4. Education + Nutrition
    const eduNutSections = getApplicableSections(['education', 'nutrition']);
    expect(eduNutSections).toContain('education');
    expect(eduNutSections).toContain('expenses');
    expect(eduNutSections).toContain('health');
    expect(eduNutSections).toContain('nutrition');

    // 5. Education + HIV support
    const eduHivSections = getApplicableSections(['education', 'hiv_support']);
    expect(eduHivSections).toContain('education');
    expect(eduHivSections).toContain('expenses');
    expect(eduHivSections).toContain('health');
    expect(eduHivSections).not.toContain('nutrition');

    // 6. Nutrition + HIV support
    const nutHivSections = getApplicableSections(['nutrition', 'hiv_support']);
    expect(nutHivSections).toContain('health');
    expect(nutHivSections).toContain('nutrition');
    expect(nutHivSections).not.toContain('education');
    expect(nutHivSections).not.toContain('expenses');

    // 7. All three
    const allSections = getApplicableSections(['education', 'nutrition', 'hiv_support']);
    expect(allSections).toHaveLength(9);
  });

  it('preserves legacy behavior when categories array is empty', () => {
    // When categories is empty (legacy schema v2), all sections are applicable
    expect(isSectionApplicable('health', [])).toBe(true);
    expect(isSectionApplicable('nutrition', [])).toBe(true);
    expect(isSectionApplicable('education', [])).toBe(true);
    expect(isSectionApplicable('expenses', [])).toBe(true);
    expect(getApplicableSections([])).toHaveLength(9);
  });
});

describe('Category Field Applicability and Skip Logic', () => {
  it('correctly maps HIV clinical fields as inapplicable when HIV support is not selected', () => {
    const categories: SupportCategory[] = ['nutrition'];
    // In nutrition-only assessment: ART status and VL must NOT be applicable
    expect(isFieldApplicableForCategories('artStatus', categories)).toBe(false);
    expect(isFieldApplicableForCategories('health.artStatus', categories)).toBe(false);
    expect(isFieldApplicableForCategories('vlStatus', categories)).toBe(false);

    // Anthropometrics ARE applicable for nutrition
    expect(isFieldApplicableForCategories('weightKg', categories)).toBe(true);
    expect(isFieldApplicableForCategories('heightCm', categories)).toBe(true);
  });

  it('correctly maps education fields as inapplicable when education is not selected', () => {
    const categories: SupportCategory[] = ['hiv_support'];
    expect(isFieldApplicableForCategories('educationStatus', categories)).toBe(false);
    expect(isFieldApplicableForCategories('schoolFees', categories)).toBe(false);
    expect(isFieldApplicableForCategories('feeReceiptPhotoUrl', categories)).toBe(false);
  });
});

describe('Server & Client Category Validation', () => {
  it('validates legitimate categories successfully', () => {
    expect(validateCategories(['education'])).toEqual(['education']);
    expect(validateCategories(['nutrition', 'hiv_support'])).toEqual(['nutrition', 'hiv_support']);
    expect(validateCategories(['education', 'nutrition', 'hiv_support'])).toEqual([
      'education',
      'nutrition',
      'hiv_support',
    ]);
  });

  it('rejects empty category arrays', () => {
    expect(validateCategories([])).toBeNull();
  });

  it('rejects unknown or forged category values', () => {
    expect(validateCategories(['education', 'invalid_hack' as any])).toBeNull();
  });

  it('Zod completeSubmissionSchema parses category-aware payload with schemaVersion: 3', () => {
    const parsed = completeSubmissionSchema.safeParse({
      uuid: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      schemaVersion: CATEGORY_SCHEMA_VERSION,
      supportCategories: ['nutrition'],
      demographics: {
        artNumber: 'MH-PUN-01',
        dateOfFilling: '2026-11-17',
        childName: 'Rahul',
        dob: '2015-05-10',
        calculatedAgeYears: 11,
        calculatedAgeMonths: 6,
        gender: 'Male',
        caregiverName: 'Asha',
        caregiverRelationship: 'Mother',
        state: 'Maharashtra',
        district: 'Pune',
      },
      consent: {
        agreeToParticipate: true,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('decouples child disability across all categories in both dot-path and short-key', () => {
    // Both long and short keys should be accessible in Education, Nutrition, and HIV
    expect(isFieldApplicableForCategories('hasDisability', ['education'])).toBe(true);
    expect(isFieldApplicableForCategories('health.hasDisability', ['education'])).toBe(true);
    expect(isFieldApplicableForCategories('hasDisability', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('health.hasDisability', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('hasDisability', ['hiv_support'])).toBe(true);
    expect(isFieldApplicableForCategories('health.hasDisability', ['hiv_support'])).toBe(true);

    // Comorbidities available in Nutrition and HIV
    expect(isFieldApplicableForCategories('otherHealthConditions', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('health.otherHealthConditions', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('otherHealthConditions', ['hiv_support'])).toBe(true);
    expect(isFieldApplicableForCategories('health.otherHealthConditions', ['hiv_support'])).toBe(true);
  });

  it('sanitizeSubmissionPayload strips non-applicable category answers for Education-only payload', () => {
    const payload = {
      uuid: 'sub-edu-01',
      schemaVersion: 3,
      supportCategories: ['education'] as SupportCategory[],
      schoolFees: 12000,
      educationExpenses: {
        schoolFees: 12000,
        feeReceiptPhotoUrl: 'https://storage/receipt.jpg',
      },
      // Stale inactive answers that caseworker entered before switching to Education-only
      appetite: 'Good',
      nutrition: { appetite: 'Good', mealsPerDay: 3 },
      weightKg: 25,
      heightCm: 120,
      artStatus: 'On ART',
      health: {
        weightKg: 25,
        heightCm: 120,
        artStatus: 'On ART',
        artIdNumber: 'ART-999',
      },
    };

    const sanitized = sanitizeSubmissionPayload(payload);

    // Education data preserved
    expect(sanitized.educationExpenses?.schoolFees).toBe(12000);
    expect(sanitized.educationExpenses?.feeReceiptPhotoUrl).toBe('https://storage/receipt.jpg');

    // Inactive Nutrition data omitted
    expect(sanitized.nutrition).toBeUndefined();
    expect(sanitized.appetite).toBeUndefined();

    // Inactive HIV data omitted
    expect(sanitized.artStatus).toBeUndefined();
    expect(sanitized.health?.artStatus).toBeUndefined();
    expect(sanitized.health?.artIdNumber).toBeUndefined();

    // Inactive clinical anthropometrics omitted
    expect(sanitized.weightKg).toBeUndefined();
    expect(sanitized.health?.weightKg).toBeUndefined();
  });

  it('sanitizeSubmissionPayload strips non-applicable category answers for Nutrition-only payload', () => {
    const payload = {
      uuid: 'sub-nut-01',
      schemaVersion: 3,
      supportCategories: ['nutrition'] as SupportCategory[],
      nutrition: { appetite: 'Fair', mealsPerDay: 2 },
      weightKg: 18,
      heightCm: 110,
      health: {
        weightKg: 18,
        heightCm: 110,
        artStatus: 'On ART',
        artIdNumber: 'ART-888',
      },
      educationExpenses: {
        schoolFees: 15000,
      },
    };

    const sanitized = sanitizeSubmissionPayload(payload);

    // Nutrition data preserved
    expect(sanitized.nutrition?.appetite).toBe('Fair');
    expect(sanitized.health?.weightKg).toBe(18);

    // Inactive Education data omitted
    expect(sanitized.educationExpenses).toBeUndefined();

    // Inactive HIV clinical data omitted
    expect(sanitized.health?.artStatus).toBeUndefined();
    expect(sanitized.health?.artIdNumber).toBeUndefined();
  });
});
