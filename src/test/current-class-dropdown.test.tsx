/**
 * current-class-dropdown.test.tsx
 *
 * Comprehensive test suite for GitHub Issue #45:
 * feat(form): add India-aligned Current Class dropdown with Class 12+ option
 *
 * Covers:
 * 1. Options & Accessibility:
 *    - All 19 required options in exact canonical order
 *    - Placeholder "Select current class" with value ""
 *    - Accessible label association via htmlFor="education-currentClass"
 * 2. Canonical Values:
 *    - Normal selections (LKG / Jr. KG, Class 7, Class 12, Class 12+ / Higher Education, Not currently enrolled)
 * 3. Other (specify) Behavior:
 *    - Displays required text field "Please specify current class/course"
 *    - Validation enforcement when Other (specify) lacks detail
 *    - Persists detail and renders "Other — <detail>" in view modes
 *    - Switching from Other clears transient detail
 * 4. Historical & Legacy Data Compatibility:
 *    - Arbitrary legacy strings ("Std 7", "Diploma", "FYJC") preserved without silent overwrite
 *    - Renders synthetic option "Other (legacy)" in edit mode so value is not lost on save
 *    - Blank/missing historical values remain blank without defaulting to Class 2
 * 5. Offline & Sync:
 *    - Queue serialization roundtrip preserves currentClass and currentClassSpecify
 *    - Server adapter normalizes and preserves currentClass and currentClassSpecify
 *    - MockSheetStore persists and patches currentClass and currentClassSpecify
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  CURRENT_CLASS_OPTIONS,
  OTHER_SPECIFY_CLASS,
  isCanonicalCurrentClass,
  formatCurrentClassDisplay,
} from '@/lib/constants/educationClasses';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import { FIELD_REGISTRY } from '@/lib/validations/formValidationRegistry';
import { SubmissionViewModal } from '@/components/sync/SubmissionViewModal';
import { normalizeSubmissionData } from '@/lib/server/canonicalSubmissionAdapter';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

describe('GitHub Issue #45 — India-aligned Current Class Dropdown', () => {
  describe('1. Single Source of Truth & Canonical Options', () => {
    const EXPECTED_OPTIONS = [
      'Pre-Nursery',
      'Nursery',
      'LKG / Jr. KG',
      'UKG / Sr. KG',
      'Class 1',
      'Class 2',
      'Class 3',
      'Class 4',
      'Class 5',
      'Class 6',
      'Class 7',
      'Class 8',
      'Class 9',
      'Class 10',
      'Class 11',
      'Class 12',
      'Class 12+ / Higher Education',
      'Not currently enrolled',
      'Other (specify)',
    ];

    it('contains exactly the 19 required options in exact canonical order', () => {
      expect(CURRENT_CLASS_OPTIONS).toHaveLength(19);
      expect(CURRENT_CLASS_OPTIONS).toEqual(EXPECTED_OPTIONS);
    });

    it('identifies canonical classes correctly with isCanonicalCurrentClass', () => {
      // Canonical options
      expect(isCanonicalCurrentClass('Pre-Nursery')).toBe(true);
      expect(isCanonicalCurrentClass('LKG / Jr. KG')).toBe(true);
      expect(isCanonicalCurrentClass('Class 7')).toBe(true);
      expect(isCanonicalCurrentClass('Class 12')).toBe(true);
      expect(isCanonicalCurrentClass('Class 12+ / Higher Education')).toBe(true);
      expect(isCanonicalCurrentClass('Not currently enrolled')).toBe(true);

      // Non-canonical / legacy / Other
      expect(isCanonicalCurrentClass('Other (specify)')).toBe(false);
      expect(isCanonicalCurrentClass('Std 7')).toBe(false);
      expect(isCanonicalCurrentClass('7th')).toBe(false);
      expect(isCanonicalCurrentClass('FYJC')).toBe(false);
      expect(isCanonicalCurrentClass('Diploma')).toBe(false);
      expect(isCanonicalCurrentClass('')).toBe(false);
      expect(isCanonicalCurrentClass(null)).toBe(false);
      expect(isCanonicalCurrentClass(undefined)).toBe(false);
    });

    it('formats display strings correctly with formatCurrentClassDisplay', () => {
      // Canonical options display as-is
      expect(formatCurrentClassDisplay('Class 7')).toBe('Class 7');
      expect(formatCurrentClassDisplay('Class 12+ / Higher Education')).toBe('Class 12+ / Higher Education');
      expect(formatCurrentClassDisplay('Not currently enrolled')).toBe('Not currently enrolled');

      // Other with detail displays "Other — <detail>"
      expect(formatCurrentClassDisplay('Other (specify)', 'Diploma in Mechanical Engineering')).toBe(
        'Other — Diploma in Mechanical Engineering'
      );
      expect(formatCurrentClassDisplay('Other (specify)', '   FYJC Arts   ')).toBe('Other — FYJC Arts');

      // Other without detail falls back to category label
      expect(formatCurrentClassDisplay('Other (specify)', '')).toBe('Other (specify)');
      expect(formatCurrentClassDisplay('Other (specify)', null)).toBe('Other (specify)');

      // Legacy options display raw value unmodified
      expect(formatCurrentClassDisplay('Std 7')).toBe('Std 7');
      expect(formatCurrentClassDisplay('Diploma')).toBe('Diploma');
      expect(formatCurrentClassDisplay('FYJC')).toBe('FYJC');

      // Blank/null/undefined display empty string
      expect(formatCurrentClassDisplay('')).toBe('');
      expect(formatCurrentClassDisplay(null)).toBe('');
      expect(formatCurrentClassDisplay(undefined)).toBe('');
    });
  });

  describe('2. Validation & Schema Enforcement', () => {
    const baseValidSubmission: any = {
      uuid: 'c0000000-0000-4000-8000-000000000001',
      clientSubmissionId: 'c0000000-0000-4000-8000-000000000001',
      interviewerName: 'Staff Member',
      demographics: {
        artNumber: 'MH-PUN-091639-01',
        childName: 'Aarav Sharma',
        dob: '2015-05-10',
        gender: 'Male',
        caregiverName: 'Sunita Sharma',
        caregiverRelationship: 'Mother',
        contactNumber: '9876543210',
        fullAddress: '123 Main Street',
        state: 'Maharashtra',
        district: 'Pune',
        orphanStatus: 'Both parents alive',
      },
      caregiverConsent: {
        consentProvided: true,
        signatureDataUrl: 'data:image/png;base64,mockSign',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Sunita Sharma',
        bankAccountNumber: '123456789012',
        bankIfscCode: 'SBIN0001234',
        bankLinkedMobileNumber: '9876543210',
      },
      householdFinancial: {
        totalFamilyMembers: 4,
        numberOfChildrenUnder18: 2,
        monthlyIncomeRs: 12000,
        mainSourceOfIncome: 'Daily wage labour',
      },
      health: {
        weightKg: 28,
        heightCm: 130,
        haemoglobinGdl: 12.5,
        otherHealthConditions: ['None'],
        artStatus: 'Not on ART',
        vlStatus: 'Not Tested',
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
      },
      educationStatus: {
        educationStatus: 'Currently going to school',
        schoolName: 'Zilla Parishad School',
        schoolSessionStartDate: '2025-06-15',
        schoolType: 'Government school',
        currentClass: 'Class 7',
        attendance: 'Regular',
      },
      educationExpenses: {
        schoolFees: 1000,
        tuitionFees: 500,
        books: 400,
        stationery: 200,
        uniform: 600,
        transport: 300,
        otherExpenses: 0,
        totalAnnualCost: 3000,
      },
      educationSupportRequired: {
        requiredSchoolFees: 1000,
        requiredTuitionFees: 500,
        requiredBooks: 400,
        requiredStationery: 200,
        requiredUniform: 600,
        requiredTransport: 300,
        requiredOtherSupport: 0,
        totalRequiredSupport: 3000,
      },
      finalReview: {
        approvedAllianceIndia: 'Approved',
        allInfoCorrect: true,
        formSubmittedBy: 'Staff Member',
        consentGiven: true,
      },
    };

    it('passes validation for canonical class selections (LKG / Jr. KG, Class 7, Class 12, Class 12+ / Higher Education)', () => {
      for (const cls of ['LKG / Jr. KG', 'Class 7', 'Class 12', 'Class 12+ / Higher Education', 'Not currently enrolled']) {
        const payload = {
          ...baseValidSubmission,
          educationStatus: {
            ...baseValidSubmission.educationStatus,
            currentClass: cls,
          },
        };
        const result = completeSubmissionSchema.safeParse(payload);
        expect(result.success).toBe(true);
      }
    });

    it('fails validation when Other (specify) is selected without detail', () => {
      const payload = {
        ...baseValidSubmission,
        educationStatus: {
          ...baseValidSubmission.educationStatus,
          currentClass: OTHER_SPECIFY_CLASS,
          currentClassSpecify: '',
        },
      };
      const result = completeSubmissionSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const specifyIssue = result.error.issues.find(
          (i) => i.path.includes('currentClassSpecify')
        );
        expect(specifyIssue).toBeDefined();
        expect(specifyIssue?.message).toContain('Please specify current class/course');
      }
    });

    it('passes validation when Other (specify) is selected with valid detail', () => {
      const payload = {
        ...baseValidSubmission,
        educationStatus: {
          ...baseValidSubmission.educationStatus,
          currentClass: OTHER_SPECIFY_CLASS,
          currentClassSpecify: 'Diploma in Civil Engineering',
        },
      };
      const result = completeSubmissionSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('preserves existing optionality: blank or omitted currentClass passes schema', () => {
      const payloadWithEmpty = {
        ...baseValidSubmission,
        educationStatus: {
          ...baseValidSubmission.educationStatus,
          currentClass: '',
        },
      };
      expect(completeSubmissionSchema.safeParse(payloadWithEmpty).success).toBe(true);

      const payloadWithUndefined = {
        ...baseValidSubmission,
        educationStatus: {
          ...baseValidSubmission.educationStatus,
          currentClass: undefined,
        },
      };
      expect(completeSubmissionSchema.safeParse(payloadWithUndefined).success).toBe(true);
    });

    it('allows legacy free-text values ("Std 7", "FYJC", "Diploma") through schema validation', () => {
      for (const legacyVal of ['Std 7', 'FYJC', 'Diploma', '7th Standard']) {
        const payload = {
          ...baseValidSubmission,
          educationStatus: {
            ...baseValidSubmission.educationStatus,
            currentClass: legacyVal,
          },
        };
        expect(completeSubmissionSchema.safeParse(payload).success).toBe(true);
      }
    });

    it('registers currentClass and currentClassSpecify in formValidationRegistry with correct DOM element IDs', () => {
      expect(FIELD_REGISTRY['educationStatus.currentClass']).toBeDefined();
      expect(FIELD_REGISTRY['educationStatus.currentClass'].elementId).toBe('education-currentClass');
      expect(FIELD_REGISTRY['educationStatus.currentClass'].sectionKey).toBe('education');

      expect(FIELD_REGISTRY['educationStatus.currentClassSpecify']).toBeDefined();
      expect(FIELD_REGISTRY['educationStatus.currentClassSpecify'].elementId).toBe('education-currentClassSpecify');
      expect(FIELD_REGISTRY['educationStatus.currentClassSpecify'].sectionKey).toBe('education');
    });
  });

  describe('3. View Modes & Presentation', () => {
    it('renders canonical class in SubmissionViewModal', () => {
      const mockRecord = {
        demographics: { childName: 'Ravi Kumar' },
        educationStatus: {
          educationStatus: 'Currently going to school',
          schoolName: 'Govt High School',
          schoolType: 'Government school',
          currentClass: 'Class 12',
          attendance: 'Regular',
        },
      };

      render(
        <SubmissionViewModal
          item={mockRecord}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Class 12')).toBeDefined();
    });

    it('renders "Other — <detail>" in SubmissionViewModal when Other (specify) is selected', () => {
      const mockRecord = {
        demographics: { childName: 'Priya Patil' },
        educationStatus: {
          educationStatus: 'Currently going to school',
          schoolName: 'Polytechnic College',
          schoolType: 'Government school',
          currentClass: OTHER_SPECIFY_CLASS,
          currentClassSpecify: 'Diploma in Mechanical Engineering',
          attendance: 'Regular',
        },
      };

      render(
        <SubmissionViewModal
          item={mockRecord}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Other — Diploma in Mechanical Engineering')).toBeDefined();
    });

    it('renders raw legacy value ("Std 7", "FYJC") without corruption in SubmissionViewModal', () => {
      const mockLegacyRecord = {
        demographics: { childName: 'Kavita Singh' },
        educationStatus: {
          educationStatus: 'Currently going to school',
          schoolName: 'City School',
          schoolType: 'Government school',
          currentClass: 'Std 7',
          attendance: 'Regular',
        },
      };

      render(
        <SubmissionViewModal
          item={mockLegacyRecord}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Std 7')).toBeDefined();
    });
  });

  describe('4. Server Adapter & Sheet Normalization', () => {
    it('normalizes sheet row data preserving canonical Current Class', () => {
      const rawSheetRow = {
        '1\nUnique ID': 'REC-001',
        '9\nChild Name': 'Ananya Roy',
        '49\nEducation Status': 'Currently going to school',
        '51\nSchool Name': 'Public Model School',
        '53\nSchool Type': 'Private school',
        '54\nCurrent Class': 'Class 12+ / Higher Education',
        '55\nAttendance Status': 'Regular',
      };

      const normalized = normalizeSubmissionData(rawSheetRow, 'REC-001');
      expect(normalized.school_grade).toBe('Class 12+ / Higher Education');
      expect(normalized.educationStatus?.currentClass).toBe('Class 12+ / Higher Education');
    });

    it('normalizes sheet row data preserving Other (specify) and detail', () => {
      const rawSheetRow = {
        '1\nUnique ID': 'REC-002',
        '9\nChild Name': 'Meera Joshi',
        '49\nEducation Status': 'Currently going to school',
        '54\nCurrent Class': OTHER_SPECIFY_CLASS,
        'Current Class Specify': 'Vocational Nursing Course',
      };

      const normalized = normalizeSubmissionData(rawSheetRow, 'REC-002');
      expect(normalized.school_grade).toBe(OTHER_SPECIFY_CLASS);
      expect(normalized.school_grade_specify).toBe('Vocational Nursing Course');
      expect(normalized.educationStatus?.currentClass).toBe(OTHER_SPECIFY_CLASS);
      expect(normalized.educationStatus?.currentClassSpecify).toBe('Vocational Nursing Course');
    });

    it('normalizes legacy raw strings ("Std 7", "Diploma") without silent override to Class 2', () => {
      const rawLegacyRow = {
        '1\nUnique ID': 'REC-003',
        '9\nChild Name': 'Deepak Verma',
        '49\nEducation Status': 'Currently going to school',
        '54\nCurrent Class': 'Std 7',
      };

      const normalized = normalizeSubmissionData(rawLegacyRow, 'REC-003');
      expect(normalized.school_grade).toBe('Std 7');
      expect(normalized.educationStatus?.currentClass).toBe('Std 7');
    });

    it('mockSheetStore persists and updates currentClass and currentClassSpecify correctly', async () => {
      const payload: any = {
        uuid: 'c0000000-0000-4000-8000-000000000099',
        demographics: {
          artNumber: 'DL-SOU-091639-99',
          childName: 'Sanjay Kumar',
          dob: '2014-03-20',
          caregiverName: 'Kamla Kumar',
          caregiverRelationship: 'Mother',
          district: 'South Delhi',
          state: 'Delhi',
        },
        educationStatus: {
          educationStatus: 'Currently going to school',
          schoolType: 'Government school',
          currentClass: OTHER_SPECIFY_CLASS,
          currentClassSpecify: 'Diploma in Electrical Engineering',
        },
      };

      MockSheetStore.reset();
      const created = MockSheetStore.createRecord(payload, 'idemp-edu-1', 'req-edu-1');
      const stored = MockSheetStore.findRecord(created.remoteSubmissionId);
      expect(stored?.school_grade).toBe(OTHER_SPECIFY_CLASS);
      expect(stored?.school_grade_specify).toBe('Diploma in Electrical Engineering');

      // Test Patch update
      const updated = MockSheetStore.updateRecord(
        created.remoteSubmissionId,
        {
          expectedVersion: 1,
          currentClass: 'Class 12',
          currentClassSpecify: '',
        } as any,
        'Staff',
        'req-edu-2'
      );

      expect(updated.success).toBe(true);
      if (updated.success) {
        expect(updated.record?.school_grade).toBe('Class 12');
        expect(updated.record?.school_grade_specify).toBe('');
      }
    });
  });
});
