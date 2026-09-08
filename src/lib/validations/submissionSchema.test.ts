import { describe, it, expect } from 'vitest';
import {
  demographicsSchema,
  nutritionSchema,
  bankDetailsSchema,
  declarationSchema,
  completeSubmissionSchema,
} from './submissionSchema';

describe('Validation Schemas & Domain Contracts (TCK-005)', () => {
  describe('demographicsSchema', () => {
    it('should validate valid demographics data', () => {
      const valid = {
        artNumber: 'MH-PUN-1049',
        childName: 'Aarav Patil',
        dob: '2018-05-12',
        gender: 'Male',
        caregiverName: 'Sunita Patil',
        caregiverRelationship: 'Mother',
        caregiverPhone: '9876543210',
        maskedAadhaar: 'XXXX-XXXX-4512',
        district: 'Pune',
        artCenter: 'Sassoon Hospital',
      };
      const parsed = demographicsSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('should reject future date of birth', () => {
      const invalid = {
        artNumber: 'MH-PUN-1049',
        childName: 'Aarav Patil',
        dob: '2099-01-01',
        gender: 'Male',
        caregiverName: 'Sunita Patil',
        caregiverRelationship: 'Mother',
        caregiverPhone: '9876543210',
        district: 'Pune',
        artCenter: 'Sassoon Hospital',
      };
      const parsed = demographicsSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('future');
      }
    });

    it('should reject invalid Indian phone number', () => {
      const invalidPhone = {
        artNumber: 'MH-PUN-1049',
        childName: 'Aarav Patil',
        dob: '2018-05-12',
        gender: 'Male',
        caregiverName: 'Sunita Patil',
        caregiverRelationship: 'Mother',
        caregiverPhone: '1234567890', // Must start with 6-9
        district: 'Pune',
        artCenter: 'Sassoon Hospital',
      };
      const parsed = demographicsSchema.safeParse(invalidPhone);
      expect(parsed.success).toBe(false);
    });
  });

  describe('bankDetailsSchema', () => {
    it('should validate valid IFSC code and bank account', () => {
      const valid = {
        accountHolderName: 'Sunita Patil',
        accountNumber: '123456789012',
        ifscCode: 'SBIN0001234',
        bankName: 'State Bank of India',
        branchName: 'Pune Main',
        passbookPhotoCaptured: true,
      };
      const parsed = bankDetailsSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('should reject invalid IFSC pattern', () => {
      const invalid = {
        accountHolderName: 'Sunita Patil',
        accountNumber: '123456789012',
        ifscCode: 'INVALID123',
        bankName: 'State Bank of India',
        branchName: 'Pune Main',
        passbookPhotoCaptured: false,
      };
      const parsed = bankDetailsSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe('declarationSchema', () => {
    it('should require consent to be explicitly acknowledged', () => {
      const invalid = {
        consentAcknowledged: false,
        caseworkerName: 'Meena K.',
        declarationDate: '2026-09-08',
      };
      const parsed = declarationSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });
});
