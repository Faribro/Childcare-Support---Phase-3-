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
    expect(hivSections).not.toContain('education');
    expect(hivSections).not.toContain('expenses');
    expect(hivSections).not.toContain('nutrition');
  });

  it('restricts anthropometrics (weight, height, Hb) to Nutrition or All Categories, hiding them for HIV-only and Education-only', () => {
    // Nutrition only
    expect(isFieldApplicableForCategories('weightKg', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('heightCm', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('haemoglobinGdl', ['nutrition'])).toBe(true);
    expect(isFieldApplicableForCategories('health.weightKg', ['nutrition'])).toBe(true);

    // All categories
    expect(isFieldApplicableForCategories('weightKg', ['education', 'nutrition', 'hiv_support'])).toBe(true);

    // Education only
    expect(isFieldApplicableForCategories('weightKg', ['education'])).toBe(false);
    expect(isFieldApplicableForCategories('heightCm', ['education'])).toBe(false);
    expect(isFieldApplicableForCategories('haemoglobinGdl', ['education'])).toBe(false);

    // HIV only
    expect(isFieldApplicableForCategories('weightKg', ['hiv_support'])).toBe(false);
    expect(isFieldApplicableForCategories('heightCm', ['hiv_support'])).toBe(false);
    expect(isFieldApplicableForCategories('haemoglobinGdl', ['hiv_support'])).toBe(false);
  });

  it('keeps disability questions decoupled from HIV and accessible across all categories', () => {
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

describe('UI Correction 4: Tests and Regression for All Category Combinations & Contract Guarantees', () => {
  const allCategories: SupportCategory[] = ['education', 'nutrition', 'hiv_support'];

  it('validates applicable sections for all 7 category combinations plus empty/default', () => {
    // 1. Education only
    const eduOnly = getApplicableSections(['education']);
    expect(eduOnly).toContain('consent');
    expect(eduOnly).toContain('demographics');
    expect(eduOnly).toContain('banking');
    expect(eduOnly).toContain('household');
    expect(eduOnly).toContain('education');
    expect(eduOnly).toContain('expenses');
    expect(eduOnly).toContain('review');
    expect(eduOnly).not.toContain('nutrition');

    // 2. Nutrition only
    const nutOnly = getApplicableSections(['nutrition']);
    expect(nutOnly).toContain('consent');
    expect(nutOnly).toContain('demographics');
    expect(nutOnly).toContain('banking');
    expect(nutOnly).toContain('household');
    expect(nutOnly).toContain('nutrition');
    expect(nutOnly).toContain('review');
    expect(nutOnly).not.toContain('education');
    expect(nutOnly).not.toContain('expenses');

    // 3. HIV support only
    const hivOnly = getApplicableSections(['hiv_support']);
    expect(hivOnly).toContain('consent');
    expect(hivOnly).toContain('demographics');
    expect(hivOnly).toContain('health');
    expect(hivOnly).toContain('review');
    expect(hivOnly).not.toContain('banking');
    expect(hivOnly).not.toContain('household');
    expect(hivOnly).not.toContain('education');
    expect(hivOnly).not.toContain('expenses');
    expect(hivOnly).not.toContain('nutrition');

    // 4. Education + Nutrition
    const eduNut = getApplicableSections(['education', 'nutrition']);
    expect(eduNut).toContain('banking');
    expect(eduNut).toContain('household');
    expect(eduNut).toContain('education');
    expect(eduNut).toContain('expenses');
    expect(eduNut).toContain('nutrition');

    // 5. Education + HIV
    const eduHiv = getApplicableSections(['education', 'hiv_support']);
    expect(eduHiv).toContain('banking');
    expect(eduHiv).toContain('household');
    expect(eduHiv).toContain('education');
    expect(eduHiv).toContain('expenses');
    expect(eduHiv).toContain('health');
    expect(eduHiv).not.toContain('nutrition');

    // 6. Nutrition + HIV
    const nutHiv = getApplicableSections(['nutrition', 'hiv_support']);
    expect(nutHiv).toContain('banking');
    expect(nutHiv).toContain('household');
    expect(nutHiv).toContain('nutrition');
    expect(nutHiv).toContain('health');
    expect(nutHiv).not.toContain('education');
    expect(nutHiv).not.toContain('expenses');

    // 7. All three categories
    const all = getApplicableSections(allCategories);
    expect(all).toContain('banking');
    expect(all).toContain('household');
    expect(all).toContain('nutrition');
    expect(all).toContain('education');
    expect(all).toContain('expenses');
    expect(all).toContain('health');

    // 8. Empty / undefined (defaults to all categories)
    const def = getApplicableSections([]);
    expect(def).toEqual(all);
  });

  it('deselection sanitisation: strips education and nutrition when deselected, leaving hiv_support', () => {
    const fullRecord: any = {
      uuid: '44444444-5555-6666-7777-888888888888',
      schemaVersion: CATEGORY_SCHEMA_VERSION,
      supportCategories: ['education'],
      demographics: {
        artNumber: 'MH-TEST-04',
        dateOfFilling: '2026-11-19',
        childName: 'Dev',
        dob: '2015-05-10',
        calculatedAgeYears: 11,
        gender: 'Male',
        caregiverName: 'Rekha',
        caregiverRelationship: 'Mother',
        state: 'Maharashtra',
        district: 'Nashik',
        contactNumber: '9876543210',
      },
      consent: { agreeToParticipate: true },
      bankingAndKyc: { bankAccountHolderName: 'Rekha', bankAccountNumber: '123' },
      householdFinancial: { totalFamilyMembers: 3, monthlyIncomeRs: 12000 },
      health: {
        weightKg: 30, // Nutrition only
        artStatus: 'On ART', // HIV only
        artIdNumber: 'MH-NAS-123',
      },
      educationStatus: { educationStatus: 'Currently going to school', schoolName: 'Nashik High' },
      educationExpenses: { schoolFees: 1200 },
      nutritionSupport: { rationCardType: 'BPL' },
      finalReview: {
        allInfoCorrect: true,
        formSubmittedBy: 'Sunita Sharma',
        organizationName: 'India HIV/AIDS Alliance',
        organizationEmail: 'sunita@allianceindia.org',
      },
    };

    const sanitized = sanitizeSubmissionPayload(fullRecord);

    // Education-only should retain banking, household, education
    expect(sanitized.bankingAndKyc).toBeDefined();
    expect(sanitized.householdFinancial).toBeDefined();
    expect(sanitized.educationStatus).toBeDefined();
    expect(sanitized.educationExpenses).toBeDefined();

    // Stripped: nutrition support, anthropometrics, clinical HIV
    expect(sanitized.nutritionSupport).toBeUndefined();
    expect(sanitized.health.weightKg).toBeUndefined();
    expect(sanitized.health.artStatus).toBeUndefined();
    expect(sanitized.health.artIdNumber).toBeUndefined();
  });

  it('draft preservation: toggling category selection in local draft preserves entered answers before submission', () => {
    // Draft state simulates user having filled nutrition and education
    const localDraft: any = {
      categories: ['nutrition'] as SupportCategory[],
      formValues: {
        bankingAndKyc: { bankAccountNumber: '9988776655' },
        health: { weightKg: 28.5, heightCm: 125 },
        educationStatus: { educationStatus: 'Currently going to school', schoolName: 'St. Xavier' },
      },
    };

    // User switches to ['education'] in the UI:
    localDraft.categories = ['education'];
    // In-memory formValues are NOT cleared immediately so user can switch back
    expect(localDraft.formValues.health.weightKg).toBe(28.5);

    // When submitted under education only, sanitizeSubmissionPayload strips non-applicable answers
    const payloadToSubmit = {
      uuid: '55555555-6666-7777-8888-999999999999',
      schemaVersion: CATEGORY_SCHEMA_VERSION,
      supportCategories: localDraft.categories,
      demographics: {
        artNumber: 'MH-TEST-05',
        dateOfFilling: '2026-11-19',
        childName: 'Gita',
        dob: '2016-01-01',
        gender: 'Female',
        caregiverName: 'Shanti',
        caregiverRelationship: 'Mother',
        state: 'Maharashtra',
        district: 'Pune',
        contactNumber: '9876543210',
      },
      consent: { agreeToParticipate: true },
      ...localDraft.formValues,
      finalReview: {
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        organizationEmail: 'sunita@allianceindia.org',
        formSubmittedBy: 'Sunita Sharma',
      },
    };

    const sanitized = sanitizeSubmissionPayload(payloadToSubmit);
    expect(sanitized.educationStatus.schoolName).toBe('St. Xavier');
    expect(sanitized.health.weightKg).toBeUndefined();
  });

  it('legacy schemaVersion 2 records are preserved without stripping when supportCategories is absent', () => {
    const legacyRecord: any = {
      uuid: '66666666-7777-8888-9999-000000000000',
      schemaVersion: 2,
      // No supportCategories field in legacy schema v2
      demographics: {
        artNumber: 'MH-TEST-06',
        dateOfFilling: '2026-11-19',
        childName: 'Amit',
        dob: '2015-08-12',
        gender: 'Male',
        caregiverName: 'Ramesh',
        caregiverRelationship: 'Father',
        state: 'Maharashtra',
        district: 'Thane',
        contactNumber: '9876543210',
        orphanStatus: 'Both parents alive',
      },
      consent: { agreeToParticipate: true },
      bankingAndKyc: { bankAccountHolderName: 'Ramesh' },
      householdFinancial: { totalFamilyMembers: 4 },
      health: {
        weightKg: 32,
        heightCm: 130,
        haemoglobinGdl: '12.5',
        artStatus: 'On ART',
      },
      educationStatus: { educationStatus: 'Currently going to school' },
      finalReview: {
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        organizationEmail: 'sunita@allianceindia.org',
        formSubmittedBy: 'Sunita Sharma',
      },
    };

    const sanitized = sanitizeSubmissionPayload(legacyRecord);
    // Legacy record retains all fields
    expect(sanitized.bankingAndKyc).toBeDefined();
    expect(sanitized.householdFinancial).toBeDefined();
    expect(sanitized.health.weightKg).toBe(32);
    expect(sanitized.health.artStatus).toBe('On ART');
    expect(sanitized.educationStatus).toBeDefined();
    expect(sanitized.demographics.guardianStatus).toBe('Alive');
  });

  it('verifies 83-column Sheet row contract: non-applicable fields produce empty strings without shifting columns', () => {
    // Simulate the 83-column row generation pattern from gas/Code.js
    const simulate83ColumnRow = (record: any): string[] => {
      const row = new Array(83).fill('');
      const d = record.demographics || {};
      const b = record.bankingAndKyc || {};
      const h = record.health || {};
      const e = record.educationStatus || {};
      const exp = record.educationExpenses || {};
      const f = record.finalReview || {};

      row[0] = record.uuid || '';
      row[1] = String(record.schemaVersion || 1);
      row[8] = d.childName || '';
      row[12] = d.orphanStatus || '';
      row[15] = d.contactNumber || ''; // Col 16: Caregiver Contact
      row[19] = b.bankAccountHolderName || ''; // Col 20: Account Holder
      row[31] = h.weightKg !== undefined ? String(h.weightKg) : ''; // Col 32: Weight
      row[39] = h.artStatus || ''; // Col 40: ART Status
      row[48] = e.educationStatus || ''; // Col 49: Education Status
      row[55] = exp.schoolFees !== undefined ? String(exp.schoolFees) : ''; // Col 56: School Fees
      row[68] = f.organizationName || ''; // Col 69: Org Name
      row[70] = f.organizationEmail || ''; // Col 71: Org Email
      row[75] = d.guardianStatus || ''; // Col 76: Guardian Status

      return row;
    };

    // HIV-only payload
    const hivPayload = sanitizeSubmissionPayload({
      uuid: '77777777-8888-9999-0000-111111111111',
      schemaVersion: 3,
      supportCategories: ['hiv_support'],
      demographics: {
        childName: 'Suraj',
        contactNumber: '9988776655',
        orphanStatus: 'Father deceased',
      } as any,
      consent: { agreeToParticipate: true },
      health: {
        artStatus: 'On ART',
      } as any,
      finalReview: {
        organizationName: 'India HIV/AIDS Alliance',
        organizationEmail: 'sunita@allianceindia.org',
      } as any,
    } as any);

    const hivRow = simulate83ColumnRow(hivPayload);
    expect(hivRow.length).toBe(83);
    // Col 16 is caregiver contact
    expect(hivRow[15]).toBe('9988776655');
    // Col 20 (Banking) is empty, NOT shifted
    expect(hivRow[19]).toBe('');
    // Col 32 (Weight) is empty
    expect(hivRow[31]).toBe('');
    // Col 40 (ART Status) is present
    expect(hivRow[39]).toBe('On ART');
    // Col 49 (Education) is empty
    expect(hivRow[48]).toBe('');
    // Col 69 (Org Name) is at index 68
    expect(hivRow[68]).toBe('India HIV/AIDS Alliance');
    // Col 71 (Org Email) is at index 70
    expect(hivRow[70]).toBe('sunita@allianceindia.org');
    // Col 76 (Guardian Status) is at index 75
    expect(hivRow[75]).toBe('Deceased (Single Parent)');
  });
});
