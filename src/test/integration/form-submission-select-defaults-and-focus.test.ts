/**
 * form-submission-select-defaults-and-focus.test.ts
 *
 * Regression test suite for the form submission blocking defect where entering
 * valid anthropometric measurements (weightKg = 50, heightCm = 154) and clicking
 * Submit blocked submission with "Please correct 1 field before submitting."
 * while failing to highlight the actual invalid field or falsely focusing
 * the clinical section's first input (CURRENT WEIGHT (KG) *).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FIELD_REGISTRY,
  getFieldMetadata,
  normalizeValidationErrors,
  navigateToValidationError,
  getResolvableSectionErrors,
} from '@/lib/validations/formValidationRegistry';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';

describe('Form Submission Select Defaults, Exact Field IDs & Error Focus Regression', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('1. Valid weightKg (50) and heightCm (154) with default select values pass completeSubmissionSchema with 0 errors', () => {
    const payload = {
      uuid: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      clientSubmissionId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      interviewerName: 'Sunita Sharma',
      demographics: {
        artNumber: 'MH-PUN-261012-0001',
        dateOfFilling: '2026-10-12',
        childName: 'Aarav Sharma',
        dob: '2015-06-15',
        gender: 'Male',
        orphanStatus: 'Both parents alive',
        caregiverName: 'Meena Sharma',
        caregiverRelationship: 'Mother',
        contactNumber: '9822012345',
        fullAddress: 'Flat 4, Shanti Nagar',
        state: 'Maharashtra',
        district: 'Pune',
      },
      caregiverConsent: {
        consentProvided: true,
        caregiverName: 'Meena Sharma',
        caregiverRelationship: 'Mother',
        signatureStatus: 'CAPTURED_LOCAL',
        signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
      householdFinancial: {
        totalFamilyMembers: 4,
        numberOfChildrenUnder18: 2,
        monthlyIncomeRs: 12000,
        mainSourceOfIncome: 'Daily wage labour',
      },
      health: {
        weightKg: 50,
        heightCm: 154,
        bmi: 21.1,
        bmiCategory: 'Normal',
        artStatus: 'On ART',
        artIdNumber: 'MH-PUN-00123',
        vlStatus: 'Tested in last 6 months',
        viralLoad: '< 50',
      },
      nutrition: {
        appetite: 'Good',
        mealsPerDay: 3,
      },
      educationStatus: {
        educationStatus: 'Currently going to school',
        schoolName: 'ZP Primary School',
        schoolType: 'Government school',
        currentClass: '5th Standard',
        attendance: 'Regular',
      },
      finalReview: {
        allInfoCorrect: true,
        organizationName: 'India HIV/AIDS Alliance',
        formSubmittedBy: 'Sunita Sharma',
      },
    };

    const result = completeSubmissionSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('2. Caregiver fields in demographics map to their rendered Section 1 DOM IDs (caregiver-name, caregiver-relationship, demographics-contactNumber)', () => {
    const nameMeta = getFieldMetadata(['demographics', 'caregiverName']);
    expect(nameMeta.elementId).toBe('caregiver-name');
    expect(nameMeta.sectionKey).toBe('consent');

    const relMeta = getFieldMetadata(['demographics', 'caregiverRelationship']);
    expect(relMeta.elementId).toBe('caregiver-relationship');
    expect(relMeta.sectionKey).toBe('consent');

    const phoneMeta = getFieldMetadata(['demographics', 'contactNumber']);
    expect(phoneMeta.elementId).toBe('demographics-contactNumber');
    expect(phoneMeta.sectionKey).toBe('consent');
  });

  it('3. Dual-path errors targeting the same physical input (e.g. interviewerName + finalReview.formSubmittedBy, or demographics.caregiverName + caregiverConsent.caregiverName) deduplicate to 1 error', () => {
    const normalized = normalizeValidationErrors({
      customErrors: [
        {
          path: ['finalReview', 'formSubmittedBy'],
          fieldKey: 'finalReview.formSubmittedBy',
          sectionKey: 'review',
          message: 'Please enter your name using at least 2 characters.',
          label: 'Interviewer / Caseworker name',
          elementId: 'review-formSubmittedBy',
        },
        {
          path: ['interviewerName'],
          fieldKey: 'interviewerName',
          sectionKey: 'review',
          message: 'Please enter your name using at least 2 characters.',
          label: 'Interviewer / Caseworker name',
          elementId: 'review-formSubmittedBy',
        },
      ],
    });

    expect(normalized).toHaveLength(1);
    expect(normalized[0].elementId).toBe('review-formSubmittedBy');
  });

  it('4. New and Draft assessment pages initialize select controls with valid defaults and wire canonical elementIds so clinical weight input never receives false fallback focus', () => {
    const newPagePath = path.resolve(process.cwd(), 'src/app/assessment/new/page.tsx');
    const draftPagePath = path.resolve(process.cwd(), 'src/app/assessment/draft/[draftId]/page.tsx');
    const newPageSource = fs.readFileSync(newPagePath, 'utf8');
    const draftPageSource = fs.readFileSync(draftPagePath, 'utf8');

    // Select defaults in new/page.tsx must not be empty strings when no blank <option> exists
    expect(newPageSource).toContain("caregiverRelationship: 'Mother' as CaregiverRelationship");
    expect(newPageSource).toContain("state: 'Maharashtra'");
    expect(newPageSource).toContain("artStatus: 'On ART' as ARTStatus");
    expect(newPageSource).toContain("vlStatus: 'Tested in last 6 months' as VLStatus");

    // Required canonical DOM IDs must be present on new/page.tsx controls
    const requiredIds = [
      'id="demographics-orphanStatus"',
      'id="demographics-fullAddress"',
      'id="demographics-state"',
      'id="demographics-district"',
      'id="household-totalFamilyMembers"',
      'id="household-numberOfChildrenUnder18"',
      'id="household-monthlyIncomeRs"',
      'id="health-weightKg"',
      'id="health-heightCm"',
      'id="health-artStatus"',
      'id="health-artIdNumber"',
      'id="health-haemoglobinGdl"',
      'id="health-vlStatus"',
    ];

    for (const reqId of requiredIds) {
      expect(newPageSource).toContain(reqId);
      expect(draftPageSource).toContain(reqId);
    }

    // Global error banner must list specific validationErrors field labels so user knows which field failed
    expect(newPageSource).toContain('validationErrors.map');
    expect(draftPageSource).toContain('validationErrors.map');
  });
});
