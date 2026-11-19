import { describe, it, expect } from 'vitest';
import {
  isSectionApplicable,
  isFieldApplicableForCategories,
  getApplicableSections,
  deriveGuardianStatus,
  type SupportCategory,
} from '@/lib/assessment/categoryApplicability';
import {
  validateEntireForm,
  sanitizeSubmissionPayload,
  CURRENT_SCHEMA_VERSION,
  CATEGORY_SCHEMA_VERSION,
} from '@/lib/validations/formRules';
import { FIELD_REGISTRY } from '@/lib/validations/formValidationRegistry';
import { validateServerSubmissionIntake } from '@/lib/server/intakeValidation';
import { type AssessmentRecord } from '@/types/domain';

describe('UI Correction 1: Removal of Duplicate Fields', () => {
  it('retains single authoritative caregiver contact in demographics, mapped to Sheet Column 16', () => {
    // Verify field validation registry points contactNumber to demographics, not consent
    const phoneMeta = FIELD_REGISTRY['demographics.contactNumber'];
    expect(phoneMeta).toBeDefined();
    expect(phoneMeta.sectionKey).toBe('demographics');

    const shortPhoneMeta = FIELD_REGISTRY['contactNumber'];
    expect(shortPhoneMeta).toBeDefined();
    expect(shortPhoneMeta.sectionKey).toBe('demographics');

    // Ensure no registration exists under consent
    const consentPhone = FIELD_REGISTRY['consent.contactNumber'];
    expect(consentPhone).toBeUndefined();
  });

  it('authoritatively derives guardianStatus from orphanStatus via deriveGuardianStatus for Sheet Column 76', () => {
    // Both parents alive -> Alive
    expect(deriveGuardianStatus('Both parents alive')).toBe('Alive');
    expect(deriveGuardianStatus('Father deceased')).toBe('Deceased (Single Parent)');
    expect(deriveGuardianStatus('Mother deceased')).toBe('Deceased (Single Parent)');
    expect(deriveGuardianStatus('Both parents deceased')).toBe('Deceased');
    expect(deriveGuardianStatus(undefined, 'Ill')).toBe('Ill');
    expect(deriveGuardianStatus(undefined, undefined)).toBe('');
  });

  it('sanitizeSubmissionPayload automatically injects derived guardianStatus into payload', () => {
    const record: Partial<AssessmentRecord> = {
      uuid: '11111111-2222-3333-4444-555555555555',
      schemaVersion: 2,
      demographics: {
        artNumber: 'MH-TEST-01',
        dateOfFilling: '2026-11-19',
        childName: 'Aarav',
        dob: '2015-01-01',
        calculatedAgeYears: 11,
        calculatedAgeMonths: 10,
        gender: 'Male',
        caregiverName: 'Suman',
        caregiverRelationship: 'Mother',
        state: 'Maharashtra',
        district: 'Pune',
        orphanStatus: 'Both parents deceased',
        contactNumber: '9876543210',
      } as any,
      consent: { agreeToParticipate: true },
      finalReview: {
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        formSubmittedBy: 'Sunita Sharma',
        organizationEmail: 'sunita@allianceindia.org',
      } as any,
    };

    const sanitized = sanitizeSubmissionPayload(record as AssessmentRecord);
    expect(sanitized.demographics.guardianStatus).toBe('Deceased');
    expect((sanitized as any).guardianStatus).toBe('Deceased');
  });
});

describe('UI Correction 2: Category Applicability Logic', () => {
  it('shows Secure Banking & Payment Details for Education, Nutrition, and All Categories, but hides for HIV-only', () => {
    expect(isSectionApplicable('banking', ['education'])).toBe(true);
    expect(isSectionApplicable('banking', ['nutrition'])).toBe(true);
    expect(isSectionApplicable('banking', ['education', 'nutrition'])).toBe(true);
    expect(isSectionApplicable('banking', ['education', 'nutrition', 'hiv_support'])).toBe(true);
    expect(isSectionApplicable('banking', ['hiv_support'])).toBe(false);
  });

  it('shows Family Background & Income for Education, Nutrition, and All Categories, but hides for HIV-only', () => {
    expect(isSectionApplicable('household', ['education'])).toBe(true);
    expect(isSectionApplicable('household', ['nutrition'])).toBe(true);
    expect(isSectionApplicable('household', ['education', 'nutrition'])).toBe(true);
    expect(isSectionApplicable('household', ['education', 'nutrition', 'hiv_support'])).toBe(true);
    expect(isSectionApplicable('household', ['hiv_support'])).toBe(false);
  });

  it('shows consent, demographics, clinical HIV, and review for HIV-only, while hiding banking, household, education, and nutrition', () => {
    const hivSections = getApplicableSections(['hiv_support']);
    expect(hivSections).toContain('consent');
    expect(hivSections).toContain('demographics');
    expect(hivSections).toContain('health');
    expect(hivSections).toContain('review');

    expect(hivSections).not.toContain('banking');
    expect(hivSections).not.toContain('household');
    expect(hivSections).not.toContain('nutrition');
    expect(hivSections).not.toContain('education');
    expect(hivSections).not.toContain('expenses');
  });

  it('restricts anthropometrics (weight, height, Hb) strictly to Nutrition or All Categories', () => {
    // Nutrition selected -> applicable
    expect(isFieldApplicableForCategories('weightKg', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('heightCm', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('haemoglobinGdl', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('health.weightKg', ['nutrition'])).toBe(true);

    // All categories -> applicable
    expect(isFieldApplicableForCategories('weightKg', ['education', 'nutrition', 'hiv_support'])).toBe(true);

    // Education-only -> NOT applicable
    expect(isFieldApplicableForCategories('weightKg', ['education'])).toBe(false);
    expect(isFieldApplicableForCategories('heightCm', ['education'])).toBe(false);
    expect(isFieldApplicableForCategories('haemoglobinGdl', ['education'])).toBe(false);

    // HIV-only -> NOT applicable
    expect(isFieldApplicableForCategories('weightKg', ['hiv_support'])).toBe(false);
    expect(isFieldApplicableForCategories('heightCm', ['hiv_support'])).toBe(false);
    expect(isFieldApplicableForCategories('haemoglobinGdl', ['hiv_support'])).toBe(false);
  });

  it('keeps disability questions decoupled and available across all categories', () => {
    expect(isFieldApplicableForCategories('hasDisability', ['education'])).toBe(true);
    expect(isFieldApplicableForCategories('hasDisability', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('hasDisability', ['hiv_support'])).toBe(true);
    expect(isFieldApplicableForCategories('health.hasDisability', ['hiv_support'])).toBe(true);
  });

  it('sanitizeSubmissionPayload strips non-applicable fields when HIV-only is selected', () => {
    const recordWithEverything: any = {
      uuid: '22222222-3333-4444-5555-666666666666',
      schemaVersion: CATEGORY_SCHEMA_VERSION,
      supportCategories: ['hiv_support'],
      demographics: {
        artNumber: 'MH-TEST-02',
        dateOfFilling: '2026-11-19',
        childName: 'Pooja',
        dob: '2016-03-15',
        calculatedAgeYears: 10,
        calculatedAgeMonths: 8,
        gender: 'Female',
        caregiverName: 'Kavita',
        caregiverRelationship: 'Mother',
        state: 'Maharashtra',
        district: 'Mumbai',
        orphanStatus: 'Both parents alive',
      } as any,
      consent: { agreeToParticipate: true },
      bankingAndKyc: {
        bankAccountHolderName: 'Kavita Test',
        bankAccountNumber: '1234567890',
      } as any,
      householdFinancial: {
        totalFamilyMembers: 4,
        monthlyIncomeRs: 15000,
      } as any,
      health: {
        weightKg: 25.5,
        heightCm: 120,
        haemoglobinGdl: '12.0',
        artStatus: 'On ART',
        artIdNumber: 'MH-MUM-999',
        vlStatus: 'Tested in last 6 months',
        viralLoad: 'Target Not Detected',
      } as any,
      educationStatus: {
        educationStatus: 'Currently going to school',
        schoolName: 'Govt School',
      } as any,
      educationExpenses: {
        schoolFees: 500,
      } as any,
      finalReview: {
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        formSubmittedBy: 'Sunita Sharma',
        organizationEmail: 'sunita@allianceindia.org',
      } as any,
    };

    const sanitized = sanitizeSubmissionPayload(recordWithEverything);

    // Banking & household must be stripped for HIV-only
    expect(sanitized.bankingAndKyc).toBeUndefined();
    expect(sanitized.householdFinancial).toBeUndefined();
    expect(sanitized.educationStatus).toBeUndefined();
    expect(sanitized.educationExpenses).toBeUndefined();

    // Anthropometrics must be stripped for HIV-only
    expect(sanitized.health.weightKg).toBeUndefined();
    expect(sanitized.health.heightCm).toBeUndefined();
    expect(sanitized.health.haemoglobinGdl).toBeUndefined();

    // Clinical HIV fields must remain intact
    expect(sanitized.health.artStatus).toBe('On ART');
    expect(sanitized.health.artIdNumber).toBe('MH-MUM-999');
    expect(sanitized.health.viralLoad).toBe('Target Not Detected');
  });
});

describe('UI Correction 3: Caseworker Organisation Credentials Enforcement', () => {
  const baseValidPayload = {
    uuid: '33333333-4444-5555-6666-777777777777',
    schemaVersion: 3,
    supportCategories: ['hiv_support'],
    demographics: {
      artNumber: 'MH-TEST-03',
      dateOfFilling: '2026-11-19',
      childName: 'Rohan',
      dob: '2014-06-20',
      calculatedAgeYears: 12,
      calculatedAgeMonths: 5,
      gender: 'Male',
      caregiverName: 'Anita',
      caregiverRelationship: 'Mother',
      state: 'Maharashtra',
      district: 'Thane',
      contactNumber: '9876543210',
    },
    consent: { agreeToParticipate: true },
    finalReview: {
      allInfoCorrect: true,
      formSubmittedBy: 'Sunita Sharma',
      organizationName: 'India HIV/AIDS Alliance',
      organizationEmail: 'sunita@allianceindia.org',
    },
  };

  it('accepts valid submission with authenticated caseworker organisation credentials', () => {
    const result = validateServerSubmissionIntake(baseValidPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects submission if organizationName is missing, empty, or whitespace', () => {
    const invalidPayload = {
      ...baseValidPayload,
      finalReview: {
        ...baseValidPayload.finalReview,
        organizationName: '   ',
      },
    };
    const result = validateServerSubmissionIntake(invalidPayload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'finalReview.organizationName')).toBe(true);
  });

  it('rejects submission if organizationEmail is missing or invalid', () => {
    const invalidPayload = {
      ...baseValidPayload,
      finalReview: {
        ...baseValidPayload.finalReview,
        organizationEmail: 'not-an-email',
      },
    };
    const result = validateServerSubmissionIntake(invalidPayload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'finalReview.organizationEmail')).toBe(true);
  });
});
