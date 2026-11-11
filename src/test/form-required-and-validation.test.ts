import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  isFieldApplicable,
  sanitizeSubmissionPayload,
  validateField,
  validateSection,
  validateEntireForm,
} from '@/lib/validations/formRules';
import { cleanLabel } from '@/lib/i18n/translations';

describe('Intake Form Required Fields & Clinical Skip Logic (Schema V2)', () => {
  // ── 1. Schema Versioning & Single Source of Truth ──────────────────────────
  describe('1. Schema Versioning & Single Source of Truth', () => {
    it('declares CURRENT_SCHEMA_VERSION as 2', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(2);
    });

    it('loads and processes legacy v1 or unversioned draft data without retroactive rejection', () => {
      const legacyDraft = {
        artNumber: 'MH-PUN-001',
        childName: 'Aarav Sharma',
        // version 1 or undefined
        schemaVersion: undefined,
      };

      // Validating a single untouched field does not throw
      const err = validateField('demographics.childName', legacyDraft);
      expect(err).toBeNull();
    });
  });

  // ── 2. Clean Labels & No Duplicate Asterisks ───────────────────────────────
  describe('2. Clean Labels (No Double Asterisks)', () => {
    it('strips trailing asterisks cleanly from translated strings', () => {
      expect(cleanLabel('GENDER *')).toBe('GENDER');
      expect(cleanLabel('ORPHAN STATUS * *')).toBe('ORPHAN STATUS');
      expect(cleanLabel('CAREGIVER RELATIONSHIP *')).toBe('CAREGIVER RELATIONSHIP');
      expect(cleanLabel('NORMAL LABEL')).toBe('NORMAL LABEL');
    });
  });

  // ── 3. Banking is Optional at Intake ───────────────────────────────────────
  describe('3. Banking Optional at Intake', () => {
    it('marks banking section as having 0 required fields at intake', () => {
      const dataWithEmptyBank = {
        bankAccountHolderName: '',
        bankAccountNumber: '',
        bankIfscCode: '',
      };
      const errors = validateSection('banking', dataWithEmptyBank);
      expect(errors).toHaveLength(0);
    });

    it('validates form successfully when banking fields are null/empty', () => {
      const validFormData: Record<string, any> = {
        // Consent
        agreeToParticipate: true,
        caregiverName: 'Sunita Sharma',
        caregiverRelationship: 'Mother',
        // Demographics
        artNumber: 'MH-PUN-1001',
        childName: 'Aarav Sharma',
        dob: '2015-05-10',
        gender: 'M',
        orphanStatus: 'Single orphan',
        contactNumber: '9876543210',
        fullAddress: '123 MG Road, Pune',
        state: 'Maharashtra',
        district: 'Pune',
        // Banking: ALL EMPTY/NULL (optional at intake)
        bankAccountHolderName: '',
        bankAccountNumber: '',
        bankIfscCode: '',
        bankLinkedMobileNumber: '',
        // Household
        totalFamilyMembers: 4,
        numberOfChildrenUnder18: 2,
        monthlyIncomeRs: 12000,
        mainSourceOfIncome: 'Daily wage labour',
        // Health
        weightKg: 28,
        heightCm: 130,
        haemoglobinGdl: 11.5,
        artStatus: 'Not on ART',
        hasDisability: 'No',
        // Nutrition
        appetite: 'Good',
        mealsPerDay: 3,
        // Education
        educationStatus: 'Currently going to school',
        schoolName: 'Zilla Parishad Primary School',
        schoolType: 'Government school',
        currentClass: 'Class 5',
        attendance: 'Regular (>80%)',
        // Review
        allInfoCorrect: true,
        formSubmittedBy: 'Kavita Caseworker',
      };

      const result = validateEntireForm(validFormData, true);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ── 4. Clinical Health Skip Logic ──────────────────────────────────────────
  describe('4. Clinical Health Skip Logic', () => {
    it('hides and skips ART initiation date and ART ID when artStatus is Not on ART', () => {
      const data = { artStatus: 'Not on ART' };
      expect(isFieldApplicable('health.artInitiationDate', data)).toBe(false);
      expect(isFieldApplicable('health.artIdNumber', data)).toBe(false);
      expect(isFieldApplicable('health.currentlyOnArt', data)).toBe(false);
      expect(isFieldApplicable('health.artMedicineType', data)).toBe(false);

      // validateField returns null for hidden fields
      expect(validateField('health.artInitiationDate', data)).toBeNull();
      expect(validateField('health.artIdNumber', data)).toBeNull();
    });

    it('requires ART initiation date and ART ID when artStatus is On ART', () => {
      const data = { artStatus: 'On ART', artInitiationDate: '', artIdNumber: '' };
      expect(isFieldApplicable('health.artInitiationDate', data)).toBe(true);
      expect(isFieldApplicable('health.artIdNumber', data)).toBe(true);

      const dateErr = validateField('health.artInitiationDate', data);
      expect(dateErr).not.toBeNull();
      expect(dateErr?.message).toContain('ART initiation date is required');

      const idErr = validateField('health.artIdNumber', data);
      expect(idErr).not.toBeNull();
      expect(idErr?.message).toContain('ART ID Number is required');
    });

    it('handles Transferred In skip logic properly', () => {
      const dataNotTaking = {
        artStatus: 'Transferred In',
        currentlyOnArt: 'No',
      };
      expect(isFieldApplicable('health.currentlyOnArt', dataNotTaking)).toBe(true);
      expect(isFieldApplicable('health.artMedicineType', dataNotTaking)).toBe(false);

      const dataTaking = {
        artStatus: 'Transferred In',
        currentlyOnArt: 'Yes',
      };
      expect(isFieldApplicable('health.artMedicineType', dataTaking)).toBe(true);
    });

    it('skips VL date and count when VL is Pending test results', () => {
      const data = { vlStatus: 'Pending test results' };
      expect(isFieldApplicable('health.vlDate', data)).toBe(false);
      expect(isFieldApplicable('health.viralLoad', data)).toBe(false);
      expect(validateField('health.vlDate', data)).toBeNull();
    });

    it('requires VL date and count when VL is Suppressed or Unsuppressed', () => {
      const data = { vlStatus: 'Suppressed (<1000 copies/mL)' };
      expect(isFieldApplicable('health.vlDate', data)).toBe(true);
      expect(isFieldApplicable('health.viralLoad', data)).toBe(true);

      const err = validateField('health.vlDate', data);
      expect(err).not.toBeNull();
    });

    it('skips disability details when hasDisability is No', () => {
      const data = { hasDisability: 'No' };
      expect(isFieldApplicable('health.disabilityType', data)).toBe(false);
      expect(isFieldApplicable('health.disabilityCertificateStatus', data)).toBe(false);
      expect(validateField('health.disabilityType', data)).toBeNull();
    });

    it('requires disability details when hasDisability is Yes', () => {
      const data = { hasDisability: 'Yes', disabilityType: '' };
      expect(isFieldApplicable('health.disabilityType', data)).toBe(true);
      const err = validateField('health.disabilityType', data);
      expect(err).not.toBeNull();
    });
  });

  // ── 5. Education Skip Logic ────────────────────────────────────────────────
  describe('5. Education Skip Logic', () => {
    it('skips all school fields when educationStatus is not going to school', () => {
      const data = { educationStatus: 'Never enrolled' };
      expect(isFieldApplicable('educationStatus.schoolName', data)).toBe(false);
      expect(isFieldApplicable('educationStatus.schoolType', data)).toBe(false);
      expect(isFieldApplicable('educationStatus.currentClass', data)).toBe(false);
      expect(isFieldApplicable('educationStatus.attendance', data)).toBe(false);

      expect(validateField('educationStatus.schoolName', data)).toBeNull();
    });

    it('requires currentClassSpecify ONLY when currentClass is Other (specify)', () => {
      const standardClassData = {
        educationStatus: 'Currently going to school',
        currentClass: 'Class 5',
      };
      expect(isFieldApplicable('educationStatus.currentClassSpecify', standardClassData)).toBe(false);

      const otherClassData = {
        educationStatus: 'Currently going to school',
        currentClass: 'Other (specify)',
      };
      expect(isFieldApplicable('educationStatus.currentClassSpecify', otherClassData)).toBe(true);
    });
  });

  // ── 6. Payload Sanitization Strips Stale Hidden Fields ──────────────────────
  describe('6. Payload Sanitization', () => {
    it('strips hidden clinical and education fields before submission', () => {
      const dirtyPayload: Record<string, any> = {
        artStatus: 'Not on ART',
        artInitiationDate: '2020-01-01', // Stale
        artIdNumber: 'ART-999',         // Stale
        currentlyOnArt: 'Yes',          // Stale
        vlStatus: 'Pending test results',
        vlDate: '2023-01-01',           // Stale
        viralLoad: 500,                 // Stale
        hasDisability: 'No',
        disabilityType: 'Locomotor',    // Stale
        educationStatus: 'Never enrolled',
        schoolName: 'Old School',       // Stale
        currentClass: 'Class 4',        // Stale
      };

      const clean = sanitizeSubmissionPayload(dirtyPayload);

      expect(clean.artInitiationDate).toBeUndefined();
      expect(clean.artIdNumber).toBeUndefined();
      expect(clean.currentlyOnArt).toBeUndefined();
      expect(clean.vlDate).toBeUndefined();
      expect(clean.viralLoad).toBeUndefined();
      expect(clean.disabilityType).toBeUndefined();
      expect(clean.schoolName).toBeUndefined();
      expect(clean.currentClass).toBeUndefined();
    });
  });
});
