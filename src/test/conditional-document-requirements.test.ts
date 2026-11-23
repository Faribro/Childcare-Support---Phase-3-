import { describe, it, expect } from 'vitest';
import { deriveSubmissionStages } from '@/lib/shared/submissionStages';
import { validateField, validateEntireForm } from '@/lib/validations/formRules';
import { validateServerSubmissionIntake } from '@/lib/server/intakeValidation';

describe('Phase C: Conditional Document Requirements Engine', () => {
  const baseValidChild = {
    artNumber: 'MH-PUN-2026-0001',
    koboId: 'MH-PUN-2026-0001',
    childName: 'Aarav Patil',
    dob: '2016-05-15',
    gender: 'Male',
    caregiverName: 'Sunita Patil',
    caregiverRelationship: 'Mother',
    contactNumber: '9876543210',
    state: 'Maharashtra',
    district: 'Pune',
    isApproved: false,
    status: 'synced',
    aadhaarCardPhotoUrl: 'data:image/png;base64,mockAadhaar',
    childPhotoUrl: 'data:image/png;base64,mockPhoto',
    signatureDataUrl: 'data:image/png;base64,mockSig',
    caregiverConsent: {
      consentProvided: true,
      signatureDataUrl: 'data:image/png;base64,mockSig',
    },
    finalReview: {
      allInfoCorrect: true,
      organizationName: 'India HIV/AIDS Alliance',
      organizationEmail: 'worker@allianceindia.org',
    },
  };

  describe('1. Nutrition-only assessments do NOT require Education documents', () => {
    it('sets feeReceiptReview and marksheetReview to not_applicable for Nutrition-only assessments', () => {
      const nutritionRecord = {
        ...baseValidChild,
        supportCategories: ['nutrition'],
        category: 'nutrition',
        schoolType: 'Government school',
        // No education docs attached
      };

      const stages = deriveSubmissionStages(nutritionRecord);

      expect(stages.documentReview.feeReceipt).toBe('not_applicable');
      expect(stages.documentReview.marksheet).toBe('not_applicable');
      expect(stages.missingIntakeFields).not.toContain('feeReceiptPhoto');
      expect(stages.missingIntakeFields).not.toContain('marksheetPhoto');
      expect(stages.intakeCompleteness).toBe('complete');
    });

    it('formRules skips fee receipt and marksheet validation when category is nutrition', () => {
      const data = {
        supportCategories: ['nutrition'],
        schoolFees: 1000,
        feeReceiptPhotoUrl: '',
        marksheetPhotoUrl: '',
        remarks: '',
      };

      const feeErr = validateField('educationExpenses.feeReceiptPhotoUrl', data, false, ['nutrition']);
      const markErr = validateField('educationExpenses.marksheetPhotoUrl', data, false, ['nutrition']);

      expect(feeErr).toBeNull();
      expect(markErr).toBeNull();
    });

    it('validateServerSubmissionIntake accepts Nutrition-only payload without school documents', () => {
      const payload = {
        ...baseValidChild,
        schemaVersion: 3,
        supportCategories: ['nutrition'],
      };

      const result = validateServerSubmissionIntake(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('2. "Not available" with mandatory reason for applicable documents', () => {
    it('fails validation when document is marked not available but reason is missing or empty', () => {
      const dataWithoutReason = {
        supportCategories: ['education'],
        educationExpenses: {
          notAvailable: true,
          notAvailableReason: '',
        },
        feeReceiptNotAvailable: true,
        feeReceiptNotAvailableReason: '',
        feeReceiptPhotoUrl: '',
        marksheetPhotoUrl: '',
        remarks: '',
      };

      const err = validateField('educationExpenses.feeReceiptPhotoUrl', dataWithoutReason, false, ['education']);
      expect(err).not.toBeNull();
      expect(err?.message).toMatch(/reason why the document is unavailable/i);
    });

    it('passes validation when document is marked not available with a valid recorded reason', () => {
      const dataWithReason = {
        supportCategories: ['education'],
        feeReceiptNotAvailable: true,
        feeReceiptNotAvailableReason: 'under_renewal',
        feeReceiptPhotoUrl: '',
        marksheetPhotoUrl: '',
        remarks: '',
      };

      const err = validateField('educationExpenses.feeReceiptPhotoUrl', dataWithReason, false, ['education']);
      expect(err).toBeNull();
    });

    it('passes validation for Aadhaar when marked not available with reason', () => {
      const dataAadhaarExempt = {
        aadhaarNotAvailable: true,
        aadhaarNotAvailableReason: 'lost_in_transit',
        aadhaarCardPhotoUrl: '',
      };

      const err = validateField('bankingAndKyc.aadhaarCardPhotoUrl', dataAadhaarExempt, false);
      expect(err).toBeNull();
    });

    it('fails validation for Aadhaar when marked not available without reason', () => {
      const dataAadhaarNoReason = {
        aadhaarNotAvailable: true,
        aadhaarNotAvailableReason: '',
        aadhaarCardPhotoUrl: '',
      };

      const err = validateField('bankingAndKyc.aadhaarCardPhotoUrl', dataAadhaarNoReason, false);
      expect(err).not.toBeNull();
      expect(err?.message).toMatch(/reason why the document is unavailable/i);
    });
  });

  describe('3. Stage Derivation with Option A Review Workflow', () => {
    it('1. Missing document without reason -> missing, incomplete, in red pendings, bank not_yet_due', () => {
      const record = {
        ...baseValidChild,
        supportCategories: ['education'],
        schoolType: 'Government school',
        feeReceiptNotAvailable: false,
        feeReceiptPhotoUrl: '',
        marksheetPhotoUrl: 'data:image/png;base64,marksheet',
      };

      const stages = deriveSubmissionStages(record);

      expect(stages.documentReview.feeReceipt).toBe('missing');
      expect(stages.missingIntakeFields).toContain('feeReceiptPhoto');
      expect(stages.intakeCompleteness).toBe('incomplete');
      expect(stages.bankWorkflow).toBe('not_yet_due');
    });

    it('2. Missing document with recorded reason -> not_available_reason_recorded, pending_review, not complete, bank not_yet_due', () => {
      const record = {
        ...baseValidChild,
        supportCategories: ['education'],
        schoolType: 'Government school',
        // Fee receipt missing, but marked unavailable with valid reason
        feeReceiptNotAvailable: true,
        feeReceiptNotAvailableReason: 'Lost / destroyed in household',
        marksheetPhotoUrl: 'data:image/png;base64,marksheet',
        approvedAllianceIndia: 'Approved', // Even if approved, pending doc review prevents bank workflow!
      };

      const stages = deriveSubmissionStages(record);

      expect(stages.documentReview.feeReceipt).toBe('not_available_reason_recorded');
      expect(stages.missingIntakeFields).not.toContain('feeReceiptPhoto');
      expect(stages.pendingReviewDocs).toContain('feeReceiptPhoto');
      expect(stages.intakeCompleteness).toBe('pending_review');
      // Must not appear in Bank Details while doc review is pending!
      expect(stages.bankWorkflow).toBe('not_yet_due');
    });

    it('3. Reviewed/approved exception -> verified, complete, unlocks bank workflow', () => {
      const record = {
        ...baseValidChild,
        isApproved: true,
        supportCategories: ['education'],
        schoolType: 'Government school',
        feeReceiptNotAvailable: true,
        feeReceiptNotAvailableReason: 'Lost / destroyed in household',
        marksheetPhotoUrl: 'data:image/png;base64,marksheet',
        feeReceiptExceptionApproved: true, // Leadership approved exception!
        approvedAllianceIndia: 'Approved',
      };

      const stages = deriveSubmissionStages(record);

      expect(stages.documentReview.feeReceipt).toBe('verified');
      expect(stages.missingIntakeFields).not.toContain('feeReceiptPhoto');
      expect(stages.intakeCompleteness).toBe('complete');
      // Unlocks bank details pending queue because intake is now complete!
      expect(stages.bankWorkflow).toBe('pending');
    });

    it('4. Rejected exception requiring replacement -> rejected, missing intake field, incomplete, bank not_yet_due', () => {
      const record = {
        ...baseValidChild,
        supportCategories: ['education'],
        schoolType: 'Government school',
        feeReceiptNotAvailable: true,
        feeReceiptNotAvailableReason: 'Insufficient reason',
        marksheetPhotoUrl: 'data:image/png;base64,marksheet',
        feeReceiptExceptionRejected: true, // Leadership rejected exception!
        approvedAllianceIndia: 'Approved',
      };

      const stages = deriveSubmissionStages(record);

      expect(stages.documentReview.feeReceipt).toBe('rejected');
      expect(stages.missingIntakeFields).toContain('feeReceiptPhoto');
      expect(stages.intakeCompleteness).toBe('incomplete');
      expect(stages.bankWorkflow).toBe('not_yet_due');
    });

    it('5. Nutrition-only category -> no false education document pending items', () => {
      const record = {
        ...baseValidChild,
        supportCategories: ['nutrition'],
        schoolType: 'Government school',
        // No education docs
      };

      const stages = deriveSubmissionStages(record);

      expect(stages.documentReview.feeReceipt).toBe('not_applicable');
      expect(stages.documentReview.marksheet).toBe('not_applicable');
      expect(stages.missingIntakeFields).not.toContain('feeReceiptPhoto');
      expect(stages.missingIntakeFields).not.toContain('marksheetPhoto');
      expect(stages.pendingReviewDocs).toEqual([]);
      expect(stages.intakeCompleteness).toBe('complete');
    });

    it('6. Education-only category -> enforces education document checks and routing', () => {
      const recordEnrolledMissing = {
        ...baseValidChild,
        supportCategories: ['education'],
        schoolType: 'Government school',
        feeReceiptPhotoUrl: '',
        marksheetPhotoUrl: '',
      };

      const stages = deriveSubmissionStages(recordEnrolledMissing);
      expect(stages.documentReview.feeReceipt).toBe('missing');
      expect(stages.documentReview.marksheet).toBe('missing');
      expect(stages.intakeCompleteness).toBe('incomplete');
    });
  });

  describe('4. Server Intake Validation with exemptions', () => {
    it('accepts Education assessment with fee receipt exemption reason', () => {
      const payload = {
        ...baseValidChild,
        schemaVersion: 3,
        supportCategories: ['education'],
        educationExpenses: {
          feeReceiptNotAvailable: true,
          feeReceiptNotAvailableReason: 'under_renewal',
          remarks: '',
        },
      };

      const result = validateServerSubmissionIntake(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
