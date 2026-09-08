import { describe, it, expect } from 'vitest';
import {
  demographicsSchema,
  caregiverConsentSchema,
  healthSchema,
  nutritionHabitsSchema,
  educationStatusSchema,
  educationExpensesSchema,
  educationSupportRequiredSchema,
  finalReviewSchema,
  patchSubmissionSchema,
} from './submissionSchema';

describe('CHILD_HIV_SUPPORT_FORM Validation Schemas & Caregiver Consent Override', () => {
  describe('demographicsSchema', () => {
    it('should validate valid demographics data matching KoboToolbox form without artCenter', () => {
      const valid = {
        artNumber: 'MH-PUN-081255-01',
        dateOfFilling: '2026-09-08',
        childName: 'Aarav Sachin Patil',
        dob: '2019-05-12',
        gender: 'Male',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Kavita Sachin Patil',
        caregiverRelationship: 'Mother',
        contactNumber: '9876543210',
        fullAddress: 'Flat 4B, Guru Nanak Nagar, Pune',
        state: 'Maharashtra',
        district: 'Pune',
      };
      const parsed = demographicsSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('should reject future date of birth', () => {
      const invalid = {
        artNumber: 'MH-PUN-081255-01',
        childName: 'Aarav Patil',
        dob: '2099-01-01',
        gender: 'Male',
        caregiverName: 'Kavita Patil',
        caregiverRelationship: 'Mother',
        contactNumber: '9876543210',
        district: 'Pune',
      };
      const parsed = demographicsSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('future');
      }
    });

    it('should reject invalid Indian mobile number format', () => {
      const invalid = {
        artNumber: 'MH-PUN-081255-01',
        childName: 'Aarav Patil',
        dob: '2019-05-12',
        gender: 'Male',
        caregiverName: 'Kavita Patil',
        caregiverRelationship: 'Mother',
        contactNumber: '1234567890', // Must start with 6-9
        district: 'Pune',
      };
      const parsed = demographicsSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe('caregiverConsentSchema (CARETAKER SIGNATURE POLICY OVERRIDE)', () => {
    it('should validate valid caregiver consent with captured signature', () => {
      const valid = {
        consentProvided: true,
        consentVersion: 'v1.0-2026',
        caregiverName: 'Kavita Sachin Patil',
        caregiverRelationship: 'Mother',
        consentCapturedAt: '2026-09-08T10:00:00.000Z',
        signatureRequired: true,
        signatureStatus: 'CAPTURED_LOCAL',
      };
      const parsed = caregiverConsentSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('should reject submission if consentProvided is false (blocking rule)', () => {
      const refused = {
        consentProvided: false,
        caregiverName: 'Kavita Sachin Patil',
        caregiverRelationship: 'Mother',
        consentCapturedAt: '2026-09-08T10:00:00.000Z',
      };
      const parsed = caregiverConsentSchema.safeParse(refused);
      expect(parsed.success).toBe(false);
    });

    it('should reject consent if caregiver name is missing', () => {
      const missingName = {
        consentProvided: true,
        caregiverName: '',
        caregiverRelationship: 'Mother',
        consentCapturedAt: '2026-09-08T10:00:00.000Z',
      };
      const parsed = caregiverConsentSchema.safeParse(missingName);
      expect(parsed.success).toBe(false);
    });
  });

  describe('healthSchema & nutritionHabitsSchema', () => {
    it('should validate anthropometric and eating habits data', () => {
      const validHealth = {
        weightKg: 14.2,
        heightCm: 102.5,
        bmi: 13.5,
        haemoglobinGdl: 11.8,
        otherHealthConditions: ['TB (Tuberculosis)'],
      };
      const parsedHealth = healthSchema.safeParse(validHealth);
      expect(parsedHealth.success).toBe(true);

      const validNutrition = {
        appetite: 'Good',
        mealsPerDay: 3,
      };
      const parsedNutrition = nutritionHabitsSchema.safeParse(validNutrition);
      expect(parsedNutrition.success).toBe(true);
    });
  });

  describe('educationStatusSchema & expenses', () => {
    it('should validate education schooling, expenses, and required support', () => {
      const validEdu = {
        educationStatus: 'Currently going to school',
        schoolName: 'Zilla Parishad School',
        schoolType: 'Government school',
        currentClass: 'Class 2',
        attendance: 'Regular',
      };
      expect(educationStatusSchema.safeParse(validEdu).success).toBe(true);

      const validExpenses = {
        schoolFees: 1200,
        books: 600,
        uniform: 800,
        transport: 500,
        totalAnnualCost: 3100,
      };
      expect(educationExpensesSchema.safeParse(validExpenses).success).toBe(true);

      const validSupport = {
        requiredSchoolFees: 1200,
        requiredBooks: 600,
        requiredUniform: 800,
        totalRequiredSupport: 2600,
      };
      expect(educationSupportRequiredSchema.safeParse(validSupport).success).toBe(true);
    });
  });

  describe('finalReviewSchema & patchSubmissionSchema', () => {
    it('should enforce allInfoCorrect = true on final review', () => {
      const validReview = {
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        formSubmittedBy: 'Sunita Sharma',
        organizationEmail: 'sunita@allianceindia.org',
      };
      expect(finalReviewSchema.safeParse(validReview).success).toBe(true);

      const invalidReview = {
        allInfoCorrect: false,
        formSubmittedBy: 'Sunita Sharma',
      };
      expect(finalReviewSchema.safeParse(invalidReview).success).toBe(false);
    });

    it('should validate allowlisted patch with expectedVersion', () => {
      const patch = {
        expectedVersion: 1,
        caregiverPhone: '9822999888',
        weightKg: 15.2,
        attendance: 'Regular',
      };
      const parsed = patchSubmissionSchema.safeParse(patch);
      expect(parsed.success).toBe(true);
    });

    it('should reject patch missing expectedVersion', () => {
      const patch = {
        caregiverPhone: '9822999888',
      };
      const parsed = patchSubmissionSchema.safeParse(patch);
      expect(parsed.success).toBe(false);
    });
  });
});
