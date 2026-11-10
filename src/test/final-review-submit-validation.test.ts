import { describe, it, expect } from 'vitest';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import {
  normalizeValidationErrors,
  getFieldMetadata,
} from '@/lib/validations/formValidationRegistry';

describe('Final Review Submit Validation & Error Mapping', () => {
  const baseValidRecord = {
    uuid: '11111111-1111-4111-8111-111111111111',
    clientSubmissionId: '11111111-1111-4111-8111-111111111111',
    interviewerName: 'Jane Caseworker',
    demographics: {
      artNumber: 'MH-PUN-00123',
      childName: 'Sunita Sharma',
      dob: '2015-05-15',
      gender: 'Female' as const,
      orphanStatus: 'Both parents alive' as const,
      caregiverName: 'Anita Sharma',
      caregiverRelationship: 'Mother' as const,
      contactNumber: '9876543210',
      state: 'Maharashtra',
      district: 'Pune',
    },
    caregiverConsent: {
      consentProvided: true as const,
      caregiverName: 'Anita Sharma',
      caregiverRelationship: 'Mother',
    },
    finalReview: {
      allInfoCorrect: true as const,
      organizationName: 'India HIV/AIDS Alliance',
      formSubmittedBy: 'Jane Caseworker',
      organizationEmail: 'fieldworker@allianceindia.org',
    },
  };

  it('accepts valid record with canonical organization email', () => {
    const result = completeSubmissionSchema.safeParse(baseValidRecord);
    expect(result.success).toBe(true);
  });

  it('accepts valid record with empty organization email', () => {
    const record = {
      ...baseValidRecord,
      finalReview: {
        ...baseValidRecord.finalReview,
        organizationEmail: '',
      },
    };
    const result = completeSubmissionSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it('accepts valid record with whitespace organization email and trims it', () => {
    const record = {
      ...baseValidRecord,
      finalReview: {
        ...baseValidRecord.finalReview,
        organizationEmail: '   ',
      },
    };
    const result = completeSubmissionSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it('accepts valid record with trailing spaces around email and trims it', () => {
    const record = {
      ...baseValidRecord,
      finalReview: {
        ...baseValidRecord.finalReview,
        organizationEmail: '  fieldworker@allianceindia.org  ',
      },
    };
    const result = completeSubmissionSchema.safeParse(record);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.finalReview?.organizationEmail).toBe('fieldworker@allianceindia.org');
    }
  });

  it('rejects invalid email string like "jane do" and maps to review-organizationEmail element', () => {
    const record = {
      ...baseValidRecord,
      finalReview: {
        ...baseValidRecord.finalReview,
        organizationEmail: 'jane do',
      },
    };
    const result = completeSubmissionSchema.safeParse(record);
    expect(result.success).toBe(false);
    if (!result.success) {
      const normalized = normalizeValidationErrors({
        zodIssues: result.error.issues,
      });

      expect(normalized.length).toBe(1);
      expect(normalized[0].elementId).toBe('review-organizationEmail');
      expect(normalized[0].sectionKey).toBe('review');
      expect(normalized[0].label).toBe('Organization email');
      expect(normalized[0].message).toContain('valid');
    }
  });

  it('resolves field metadata correctly for organizationEmail in review section', () => {
    const meta = getFieldMetadata(['finalReview', 'organizationEmail']);
    expect(meta.elementId).toBe('review-organizationEmail');
    expect(meta.sectionKey).toBe('review');
    expect(meta.label).toBe('Organization email');
    expect(meta.defaultMessage).toBeDefined();
  });
});
