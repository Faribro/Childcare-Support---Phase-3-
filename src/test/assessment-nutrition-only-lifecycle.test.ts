import { describe, it, expect } from 'vitest';
import {
  validateEntireForm,
  sanitizeSubmissionPayload,
  CATEGORY_SCHEMA_VERSION,
} from '@/lib/validations/formRules';
import { validateServerSubmissionIntake } from '@/lib/server/intakeValidation';
import {
  isSectionApplicable,
  getApplicableSections,
  type SupportCategory,
} from '@/lib/assessment/categoryApplicability';

describe('Nutrition-Only Assessment Lifecycle & Validation Invariants', () => {
  const baseValidNutritionAssessment = {
    uuid: '11111111-2222-4333-8444-555555555555',
    schemaVersion: CATEGORY_SCHEMA_VERSION,
    supportCategories: ['nutrition'] as SupportCategory[],
    interviewerName: 'Staff Member',
    consent: {
      agreeToParticipate: true,
      signatureDataUrl: 'data:image/png;base64,validSignatureBlob',
    },
    demographics: {
      artNumber: 'DL-SOU-201300-01',
      childName: 'Amit Singh',
      dob: '2016-01-15',
      calculatedAgeYears: 10,
      gender: 'Male',
      orphanStatus: 'Not Orphan',
      caregiverName: 'Mukesh',
      caregiverRelationship: 'Father',
      contactNumber: '9876543210',
      caregiverContactNumber: '9876543210',
      state: 'Delhi',
      district: 'South Delhi',
      fullAddress: 'South Delhi, Delhi',
    },
    bankingAndKyc: {
      bankAccountHolderName: 'Mukesh',
      bankAccountNumber: '123456789012',
      bankIfscCode: 'SBIN0001234',
      bankLinkedMobileNumber: '9876543210',
      passbookPhotoUrl: 'https://storage/passbook.jpg',
      aadhaarCardPhotoUrl: 'https://storage/aadhaar.jpg',
      childPhotoUrl: 'https://storage/photo.jpg',
    },
    householdFinancial: {
      totalFamilyMembers: 4,
      numberOfChildrenUnder18: 2,
      monthlyIncomeRs: 12000,
      mainSourceOfIncome: 'Daily wage labour',
    },
    health: {
      weightKg: 22,
      heightCm: 125,
      haemoglobinGdl: 11.5,
      otherHealthConditions: ['None'],
    },
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    },
    // Default / empty education fields that may exist in form state
    educationStatus: {
      educationStatus: 'Dropped out of school',
    },
    educationExpenses: {
      schoolFees: 0,
      tuitionFees: 0,
      books: 0,
      stationery: 0,
      uniform: 0,
      transport: 0,
      otherExpenses: 0,
      totalAnnualCost: 0,
      feeReceiptPhotoUrl: '',
      marksheetPhotoUrl: '',
      remarks: '',
    },
    educationSupportRequired: {
      requiredSchoolFees: 0,
      requiredBooks: 0,
      requiredStationery: 0,
      requiredUniform: 0,
      requiredTransport: 0,
      requiredOtherSupport: 0,
      totalRequiredSupport: 0,
    },
    finalReview: {
      allInfoCorrect: true,
      organizationName: 'India HIV/AIDS Alliance',
      organizationEmail: 'staff@allianceindia.org',
      formSubmittedBy: 'Staff Member',
    },
  };

  it('validateEntireForm accepts Nutrition-only assessment with zero education proofs', () => {
    const result = validateEntireForm(
      baseValidNutritionAssessment,
      undefined,
      ['nutrition']
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);

    const hasEducationErrors = result.errors.some(
      (e) =>
        e.fieldKey.includes('feeReceipt') ||
        e.fieldKey.includes('marksheet') ||
        e.fieldKey.includes('education')
    );
    expect(hasEducationErrors).toBe(false);
  });

  it('validateServerSubmissionIntake accepts Nutrition-only payload without demanding school documents', () => {
    const result = validateServerSubmissionIntake(baseValidNutritionAssessment);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('sanitizeSubmissionPayload strips default education objects from Nutrition-only submission', () => {
    const sanitized = sanitizeSubmissionPayload(baseValidNutritionAssessment);

    expect(sanitized.supportCategories).toEqual(['nutrition']);
    expect(sanitized.nutrition?.appetite).toBe('Good');
    expect(sanitized.health?.weightKg).toBe(22);

    // Education sections must be completely stripped
    expect(sanitized.educationStatus).toBeUndefined();
    expect(sanitized.educationExpenses).toBeUndefined();
    expect(sanitized.educationSupportRequired).toBeUndefined();
    expect((sanitized as any).feeReceiptPhotoUrl).toBeUndefined();
    expect((sanitized as any).marksheetPhotoUrl).toBeUndefined();
  });

  it('isSectionApplicable correctly configures visible sections for Nutrition-only', () => {
    const cats: SupportCategory[] = ['nutrition'];

    // Applicable sections
    expect(isSectionApplicable('consent', cats)).toBe(true);
    expect(isSectionApplicable('demographics', cats)).toBe(true);
    expect(isSectionApplicable('banking', cats)).toBe(true);
    expect(isSectionApplicable('household', cats)).toBe(true);
    expect(isSectionApplicable('health', cats)).toBe(true);
    expect(isSectionApplicable('nutrition', cats)).toBe(true);
    expect(isSectionApplicable('review', cats)).toBe(true);

    // INAPPLICABLE sections for nutrition-only
    expect(isSectionApplicable('education', cats)).toBe(false);
    expect(isSectionApplicable('expenses', cats)).toBe(false);

    const applicableList = getApplicableSections(cats);
    expect(applicableList).not.toContain('education');
    expect(applicableList).not.toContain('expenses');
    expect(applicableList).toContain('nutrition');
  });

  it('simulates legacy draft category restoration for drafts like Amit Singh DL-SOU-201300-01', () => {
    // A legacy saved draft missing supportCategories but containing nutrition data
    const legacyDraft = {
      uuid: 'legacy-draft-1',
      demographics: {
        artNumber: 'DL-SOU-201300-01',
        childName: 'Amit Singh',
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
      },
      health: {
        weightKg: 22,
        heightCm: 125,
      },
      educationExpenses: {
        schoolFees: 0,
      },
    };

    // Reproduce hydration inference logic used in draft/[draftId]/page.tsx
    const d = legacyDraft as any;
    const existingCats = d.supportCategories || d.categories;
    let restored: SupportCategory[] = [];

    if (!existingCats || existingCats.length === 0) {
      const exp = d.educationExpenses || {};
      const req = d.educationSupportRequired || {};
      const edu = d.education || {};
      const stat = d.educationStatus || {};
      const n = d.nutrition || {};
      const h = d.health || {};

      const hasEducationData = Boolean(
        edu.schoolName ||
        (edu.schoolGrade && edu.schoolGrade !== 'Not in school') ||
        stat.schoolName ||
        (stat.currentClass && stat.currentClass !== 'Other') ||
        (exp.schoolFees && Number(exp.schoolFees) > 0) ||
        (req.totalRequiredSupport && Number(req.totalRequiredSupport) > 0)
      );

      const hasNutritionData = Boolean(
        n.appetite ||
        n.malnutritionSymptoms ||
        n.mealsPerDay ||
        d.appetite ||
        d.mealsPerDay
      );

      const hasHivData = Boolean(
        h.artIdNumber ||
        h.artNumber ||
        h.artStatus ||
        h.artRegistrationDate ||
        h.cd4Count ||
        h.viralLoad ||
        d.artStatus
      );

      if (!hasEducationData && hasNutritionData) {
        restored = hasHivData ? ['nutrition', 'hiv_support'] : ['nutrition'];
      }
    }

    expect(restored).toEqual(['nutrition']);
    expect(isSectionApplicable('education', restored)).toBe(false);
    expect(isSectionApplicable('expenses', restored)).toBe(false);
    expect(isSectionApplicable('nutrition', restored)).toBe(true);
  });

  it('preserves data and blocks submission for ambiguous legacy drafts until user explicitly confirms categories', () => {
    // An ambiguous draft with default zero values in both education and nutrition:
    const ambiguousZeroDraft = {
      uuid: 'legacy-ambiguous-001',
      demographics: {
        artNumber: 'DL-AMB-2026-01',
        childName: 'Pooja Kumari',
        dob: '2015-06-01',
        gender: 'Female',
        orphanStatus: 'Not Orphan',
        caregiverName: 'Sunita',
        caregiverRelationship: 'Mother',
        contactNumber: '9876543210',
        state: 'Delhi',
        district: 'South Delhi',
        fullAddress: 'South Delhi',
      },
      // Stale default zeros and empty structures
      educationStatus: {
        educationStatus: 'Dropped out of school',
      },
      educationExpenses: {
        schoolFees: 0,
        tuitionFees: 0,
        totalAnnualCost: 0,
      },
      nutrition: {
        mealsPerDay: 0,
      },
      health: {
        weightKg: 20,
        heightCm: 118,
      },
    };

    // Hydration check: Should NOT silently infer or decide categories from default zero values
    const d = ambiguousZeroDraft as any;
    const exp = d.educationExpenses || {};
    const req = d.educationSupportRequired || {};
    const edu = d.education || {};
    const stat = d.educationStatus || {};
    const n = d.nutrition || {};

    const hasEducationData = Boolean(
      (stat.educationStatus && stat.educationStatus !== 'Dropped out of school' && stat.educationStatus !== 'Never enrolled') ||
      stat.schoolName ||
      edu.schoolName ||
      (exp.schoolFees && Number(exp.schoolFees) > 0) ||
      (req.totalRequiredSupport && Number(req.totalRequiredSupport) > 0)
    );

    const hasNutritionData = Boolean(
      n.appetite ||
      n.malnutritionSymptoms ||
      (n.mealsPerDay && Number(n.mealsPerDay) > 0) ||
      (d.mealsPerDay && Number(d.mealsPerDay) > 0)
    );

    let restored: SupportCategory[] = [];
    if (!hasEducationData && hasNutritionData) {
      restored = ['nutrition'];
    } else if (hasEducationData && !hasNutritionData) {
      restored = ['education'];
    } else {
      // Ambiguous: leave empty to enforce explicit user confirmation
      restored = [];
    }

    // 1. Must NOT guess categories silently
    expect(restored).toEqual([]);

    // 2. Submission without confirming categories is rejected by server intake validation
    const unconfirmedSubmission = {
      ...ambiguousZeroDraft,
      schemaVersion: 3,
      interviewerName: 'Staff Caseworker',
      consent: { agreeToParticipate: true },
      finalReview: {
        allInfoCorrect: true,
        organizationName: 'Alliance India',
        organizationEmail: 'staff@allianceindia.org',
      },
      supportCategories: restored.length > 0 ? restored : undefined,
    };

    const serverCheck = validateServerSubmissionIntake(unconfirmedSubmission as any);
    expect(serverCheck.valid).toBe(false);
    expect(serverCheck.errors.some((e) => e.field === 'supportCategories')).toBe(true);

    // 3. When caseworker explicitly confirms 'nutrition', all answers are preserved and payload passes cleanly
    const confirmedNutritionSubmission = {
      ...unconfirmedSubmission,
      supportCategories: ['nutrition'] as SupportCategory[],
    };

    const confirmedCheck = validateServerSubmissionIntake(confirmedNutritionSubmission as any);
    expect(confirmedCheck.valid).toBe(true);
    expect(confirmedCheck.errors).toEqual([]);
    expect(confirmedNutritionSubmission.demographics.childName).toBe('Pooja Kumari');
    expect(confirmedNutritionSubmission.health.weightKg).toBe(20);
  });
});
