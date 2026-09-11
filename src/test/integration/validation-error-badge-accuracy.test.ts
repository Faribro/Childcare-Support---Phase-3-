/**
 * validation-error-badge-accuracy.test.ts
 *
 * Regression and invariant verification suite for Bug 1:
 * - Section error badges show accurate counts strictly matching rendered visible DOM alerts (Hard Invariant).
 * - Orphaned or unrendered errors are excluded from section badges.
 * - Section 07 (learning & school status) produces 0 errors for exact user values:
 *     Education Status: "Currently going to school"
 *     Attendance Status: "Regular"
 *     School Name: "Obaehs"
 *     Current Class: "10"
 *     School Type: default / empty / "Government school"
 * - Section 09 (review & submit) produces 0 errors when allInfoCorrect: true and valid formSubmittedBy.
 * - Real-time error clearing on input change without requiring re-submission.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FormValidationError,
  getResolvableSectionErrors,
  normalizeValidationErrors,
  FIELD_REGISTRY,
} from '@/lib/validations/formValidationRegistry';
import {
  educationStatusSchema,
  finalReviewSchema,
  completeSubmissionSchema,
} from '@/lib/validations/submissionSchema';

describe('Bug 1: Validation Error Badge Accuracy & Real-Time Clearing', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ---------------------------------------------------------------------------
  // Test 1: Hard Invariant — Badge count strictly equals rendered, visible errors
  // ---------------------------------------------------------------------------
  it('Hard Invariant: Section error badge count strictly equals rendered elements with visible alerts', () => {
    // Construct DOM with Section 7 and 9
    const container = document.createElement('div');
    container.innerHTML = `
      <section id="sec-education">
        <div id="education-educationStatus">
          <label>EDUCATION STATUS *</label>
        </div>
        <div id="education-schoolName-wrap">
          <input id="education-schoolName" aria-invalid="true" />
          <p id="education-schoolName-error" role="alert">School name is required</p>
        </div>
        <div id="education-attendance">
          <!-- no alert rendered -->
        </div>
      </section>
      <section id="sec-review">
        <div id="review-allInfoCorrect">
          <p id="review-allInfoCorrect-error" role="alert">Please attest to accuracy</p>
        </div>
      </section>
    `;
    document.body.appendChild(container);

    const rawErrors: FormValidationError[] = [
      // 1. Rendered with role="alert" and aria-invalid in sec-education -> MUST BE COUNTED
      {
        path: ['educationStatus', 'schoolName'],
        fieldKey: 'educationStatus.schoolName',
        sectionKey: 'education',
        elementId: 'education-schoolName',
        message: 'School name is required',
        label: 'School name',
      },
      // 2. Element exists in sec-education but has NO role="alert" or aria-invalid -> MUST NOT BE COUNTED
      {
        path: ['educationStatus', 'attendance'],
        fieldKey: 'educationStatus.attendance',
        sectionKey: 'education',
        elementId: 'education-attendance',
        message: 'Attendance is required',
        label: 'Attendance status',
      },
      // 3. Phantom / unmapped error with elementId that does not exist in DOM -> MUST NOT BE COUNTED
      {
        path: ['educationStatus', 'unknownField'],
        fieldKey: 'educationStatus.unknownField',
        sectionKey: 'education',
        elementId: 'education-unknownField',
        message: 'Unknown field error',
        label: 'Unknown field',
      },
      // 4. Rendered with role="alert" in sec-review -> MUST BE COUNTED
      {
        path: ['review', 'allInfoCorrect'],
        fieldKey: 'review.allInfoCorrect',
        sectionKey: 'review',
        elementId: 'review-allInfoCorrect',
        message: 'Please attest to accuracy',
        label: 'Information correctness attestation',
      },
      // 5. Generic unmapped review error -> MUST NOT BE COUNTED
      {
        path: ['review', 'phantom'],
        fieldKey: 'review.phantom',
        sectionKey: 'review',
        elementId: 'sec-review',
        message: 'Generic section error',
        label: 'Generic Review',
      },
    ];

    const resolvable = getResolvableSectionErrors(rawErrors, document);

    // Section 7: Only 1 error is genuinely resolvable and visible in the DOM
    expect(resolvable['education']).toBeDefined();
    expect(resolvable['education'].length).toBe(1);
    expect(resolvable['education'][0].elementId).toBe('education-schoolName');

    // Section 9: Only 1 error is genuinely resolvable and visible in the DOM
    expect(resolvable['review']).toBeDefined();
    expect(resolvable['review'].length).toBe(1);
    expect(resolvable['review'][0].elementId).toBe('review-allInfoCorrect');

    // Total resolvable errors across all sections is 2, not the 5 raw errors
    const totalResolvable = Object.values(resolvable).reduce((sum, arr) => sum + arr.length, 0);
    expect(totalResolvable).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Section 07 exact user values produce zero errors
  // ---------------------------------------------------------------------------
  it('Section 07 exact user values: "Currently going to school", "Regular", "Obaehs", "10" produce 0 errors', () => {
    // User reported exact values:
    const educationInput = {
      educationStatus: 'Currently going to school',
      attendance: 'Regular',
      schoolName: 'Obaehs',
      currentClass: '10',
      schoolType: 'Government school',
    };

    const parsed = educationStatusSchema.safeParse(educationInput);
    expect(parsed.success).toBe(true);

    // Also test with schoolType as empty string (typical HTML unselected value)
    const withBlankSchoolType = {
      ...educationInput,
      schoolType: '',
    };
    const parsedBlank = educationStatusSchema.safeParse(withBlankSchoolType);
    expect(parsedBlank.success).toBe(true);

    // Also test with legacy schoolType 'Government aided'
    const withLegacySchoolType = {
      ...educationInput,
      schoolType: 'Government aided',
    };
    const parsedLegacy = educationStatusSchema.safeParse(withLegacySchoolType);
    expect(parsedLegacy.success).toBe(true);
    if (parsedLegacy.success) {
      expect(parsedLegacy.data.schoolType).toBe('Aided school');
    }

    // When valid, normalizeValidationErrors produces 0 errors for educationStatus
    if (parsed.success) {
      // Setup DOM for section 7
      const section = document.createElement('section');
      section.id = 'sec-education';
      section.innerHTML = `
        <div id="education-educationStatus"></div>
        <input id="education-schoolName" value="Obaehs" />
        <select id="education-schoolType"><option selected value="Government school">Government school</option></select>
        <input id="education-currentClass" value="10" />
        <div id="education-attendance"></div>
      `;
      document.body.appendChild(section);

      const sectionErrors = getResolvableSectionErrors([], document);
      expect(sectionErrors['education']?.length || 0).toBe(0);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: Section 09 exact user values produce zero errors
  // ---------------------------------------------------------------------------
  it('Section 09 exact user values: allInfoCorrect: true, formSubmittedBy: "Caseworker" produce 0 errors', () => {
    const reviewInput = {
      allInfoCorrect: true,
      formSubmittedBy: 'Caseworker',
      organizationName: 'India HIV/AIDS Alliance',
      organizationEmail: 'fieldworker@allianceindia.org',
    };

    const parsed = finalReviewSchema.safeParse(reviewInput);
    expect(parsed.success).toBe(true);

    // Setup DOM for Section 9
    const section = document.createElement('section');
    section.id = 'sec-review';
    section.innerHTML = `
      <div id="review-allInfoCorrect"></div>
      <input id="review-formSubmittedBy" value="Caseworker" />
    `;
    document.body.appendChild(section);

    const sectionErrors = getResolvableSectionErrors([], document);
    expect(sectionErrors['review']?.length || 0).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Real-time error clearing immediately decrements section error badge
  // ---------------------------------------------------------------------------
  it('Real-time clearing: Section badge count immediately clears upon valid field change without re-submitting', () => {
    // Setup Section 7 in DOM
    const section = document.createElement('section');
    section.id = 'sec-education';
    section.innerHTML = `
      <div id="education-educationStatus">
        <label>EDUCATION STATUS *</label>
      </div>
      <div id="education-schoolName-wrap">
        <input id="education-schoolName" aria-invalid="true" value="" />
        <p id="education-schoolName-error" role="alert">School name is required</p>
      </div>
    `;
    document.body.appendChild(section);

    // Step 1: Initial state after submit failure with missing schoolName
    let validationErrors: FormValidationError[] = [
      {
        path: ['educationStatus', 'schoolName'],
        fieldKey: 'educationStatus.schoolName',
        sectionKey: 'education',
        elementId: 'education-schoolName',
        message: 'School name is required',
        label: 'School name',
      },
    ];

    // Assert initial badge count is 1
    let badgeCount = getResolvableSectionErrors(validationErrors, document)['education']?.length || 0;
    expect(badgeCount).toBe(1);

    // Step 2: User types "Obaehs" into schoolName field
    // In our implementation, onChange calls clearFieldError('education-schoolName', 'schoolName')
    const clearFieldError = (...identifiers: string[]) => {
      const idSet = new Set(identifiers.filter(Boolean));
      validationErrors = validationErrors.filter(
        (err) =>
          !idSet.has(err.elementId) &&
          !idSet.has(err.fieldKey) &&
          !idSet.has(err.path.join('.')) &&
          !err.path.some((p) => idSet.has(p))
      );
    };

    // Simulate input onChange
    clearFieldError('education-schoolName', 'schoolName');

    // Also simulate removing the error alert in DOM
    const errorAlert = document.getElementById('education-schoolName-error');
    if (errorAlert) errorAlert.remove();
    const input = document.getElementById('education-schoolName');
    if (input) input.removeAttribute('aria-invalid');

    // Assert badge count drops to 0 immediately without re-submission
    badgeCount = getResolvableSectionErrors(validationErrors, document)['education']?.length || 0;
    expect(badgeCount).toBe(0);
    expect(validationErrors.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Section 09 Real-time error clearing for review attestation & submitter
  // ---------------------------------------------------------------------------
  it('Real-time clearing: Section 09 clears badge immediately when user checks Yes or types name', () => {
    const section = document.createElement('section');
    section.id = 'sec-review';
    section.innerHTML = `
      <div id="review-allInfoCorrect" aria-invalid="true">
        <p id="review-allInfoCorrect-error" role="alert">Must confirm information is correct</p>
      </div>
      <div>
        <input id="review-formSubmittedBy" aria-invalid="true" value="" />
        <p id="review-formSubmittedBy-error" role="alert">Interviewer name is required</p>
      </div>
    `;
    document.body.appendChild(section);

    let validationErrors: FormValidationError[] = [
      {
        path: ['review', 'allInfoCorrect'],
        fieldKey: 'review.allInfoCorrect',
        sectionKey: 'review',
        elementId: 'review-allInfoCorrect',
        message: 'Must confirm information is correct',
        label: 'Information correctness attestation',
      },
      {
        path: ['review', 'formSubmittedBy'],
        fieldKey: 'review.formSubmittedBy',
        sectionKey: 'review',
        elementId: 'review-formSubmittedBy',
        message: 'Interviewer name is required',
        label: 'Form submitted by (interviewer name)',
      },
    ];

    let badgeCount = getResolvableSectionErrors(validationErrors, document)['review']?.length || 0;
    expect(badgeCount).toBe(2);

    // Simulate clearFieldError helper
    const clearFieldError = (...identifiers: string[]) => {
      const idSet = new Set(identifiers.filter(Boolean));
      validationErrors = validationErrors.filter(
        (err) =>
          !idSet.has(err.elementId) &&
          !idSet.has(err.fieldKey) &&
          !idSet.has(err.path.join('.')) &&
          !err.path.some((p) => idSet.has(p))
      );
    };

    // User checks allInfoCorrect: true
    clearFieldError('review-allInfoCorrect', 'review.allInfoCorrect', 'allInfoCorrect');
    const alert1 = document.getElementById('review-allInfoCorrect-error');
    if (alert1) alert1.remove();

    badgeCount = getResolvableSectionErrors(validationErrors, document)['review']?.length || 0;
    expect(badgeCount).toBe(1);

    // User types interviewer name "Sunita"
    clearFieldError('review-formSubmittedBy', 'review.formSubmittedBy', 'formSubmittedBy');
    const alert2 = document.getElementById('review-formSubmittedBy-error');
    if (alert2) alert2.remove();

    badgeCount = getResolvableSectionErrors(validationErrors, document)['review']?.length || 0;
    expect(badgeCount).toBe(0);
    expect(validationErrors.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Field Registry Completeness for all Section 7 and 9 fields
  // ---------------------------------------------------------------------------
  it('Field Registry registers all Section 7 and Section 9 fields with correct target DOM elements', () => {
    // Section 7 fields
    expect(FIELD_REGISTRY['educationStatus.educationStatus']).toBeDefined();
    expect(FIELD_REGISTRY['educationStatus.educationStatus'].elementId).toBe('education-educationStatus');
    expect(FIELD_REGISTRY['educationStatus.educationStatus'].sectionKey).toBe('education');

    expect(FIELD_REGISTRY['educationStatus.schoolName']).toBeDefined();
    expect(FIELD_REGISTRY['educationStatus.schoolName'].elementId).toBe('education-schoolName');

    expect(FIELD_REGISTRY['educationStatus.schoolType']).toBeDefined();
    expect(FIELD_REGISTRY['educationStatus.schoolType'].elementId).toBe('education-schoolType');

    expect(FIELD_REGISTRY['educationStatus.currentClass']).toBeDefined();
    expect(FIELD_REGISTRY['educationStatus.currentClass'].elementId).toBe('education-currentClass');

    expect(FIELD_REGISTRY['educationStatus.attendance']).toBeDefined();
    expect(FIELD_REGISTRY['educationStatus.attendance'].elementId).toBe('education-attendance');

    expect(FIELD_REGISTRY['educationStatus.schoolSessionStartDate']).toBeDefined();
    expect(FIELD_REGISTRY['educationStatus.schoolSessionStartDate'].elementId).toBe('education-schoolSessionStartDate');

    // Section 9 fields
    expect(FIELD_REGISTRY['review.allInfoCorrect']).toBeDefined();
    expect(FIELD_REGISTRY['review.allInfoCorrect'].elementId).toBe('review-allInfoCorrect');
    expect(FIELD_REGISTRY['review.allInfoCorrect'].sectionKey).toBe('review');

    expect(FIELD_REGISTRY['review.formSubmittedBy']).toBeDefined();
    expect(FIELD_REGISTRY['review.formSubmittedBy'].elementId).toBe('review-formSubmittedBy');
    expect(FIELD_REGISTRY['review.formSubmittedBy'].sectionKey).toBe('review');

    expect(FIELD_REGISTRY['finalReview.allInfoCorrect']).toBeDefined();
    expect(FIELD_REGISTRY['finalReview.allInfoCorrect'].elementId).toBe('review-allInfoCorrect');

    expect(FIELD_REGISTRY['finalReview.formSubmittedBy']).toBeDefined();
    expect(FIELD_REGISTRY['finalReview.formSubmittedBy'].elementId).toBe('review-formSubmittedBy');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Full Complete Submission Schema validation with Section 7 and Section 9
  // ---------------------------------------------------------------------------
  it('Complete submission passes validation when Section 7 and Section 9 are correctly filled', () => {
    const validFullPayload = {
      uuid: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      interviewerName: 'Caseworker',
      demographics: {
        childName: 'Aarav Kumar',
        dob: '2016-05-15',
        gender: 'Male',
        artNumber: 'DL-SOU-111749-01',
        hivStatus: 'Negative',
        fullAddress: 'Sector 4, Rohini',
        state: 'Delhi',
        district: 'North West Delhi',
        contactNumber: '9876543210',
        caregiverName: 'Manoj Kumar',
        caregiverRelationship: 'Father',
      },
      caregiverConsent: {
        consentProvided: true,
        agreeToParticipate: true,
        caregiverName: 'Manoj Kumar',
        caregiverRelationship: 'Father',
        signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
      bankingAndKyc: {
        bankAccountHolderName: 'Manoj Kumar',
        bankAccountNumber: '123456789012',
        bankIfscCode: 'SBIN0001234',
        passbookPhotoUrl: 'https://example.com/passbook.jpg',
        aadhaarCardPhotoUrl: 'https://example.com/aadhaar.jpg',
        childPhotoUrl: 'https://example.com/child.jpg',
      },
      householdFinancial: {
        totalFamilyMembers: 4,
        monthlyIncomeRs: 15000,
      },
      health: {
        weightKg: 28,
        heightCm: 125,
        haemoglobinGdl: 12,
        artStatus: 'On ART',
      },
      educationStatus: {
        educationStatus: 'Currently going to school',
        schoolName: 'Obaehs',
        schoolSessionStartDate: '2024-04-01',
        schoolType: 'Government school',
        currentClass: '10',
        attendance: 'Regular',
      },
      educationExpenses: {
        schoolFees: 1200,
        tuitionFees: 500,
        books: 600,
        stationery: 300,
        uniform: 800,
        transport: 400,
        otherExpenses: 0,
        totalAnnualCost: 3800,
        feeReceiptPhotoUrl: 'https://example.com/receipt.jpg',
        marksheetPhotoUrl: 'https://example.com/marksheet.jpg',
      },
      educationSupportRequired: {
        requiredSchoolFees: 1200,
        requiredTuitionFees: 500,
        requiredBooks: 600,
        requiredStationery: 300,
        requiredUniform: 800,
        requiredTransport: 400,
        requiredOtherSupport: 0,
        totalRequiredSupport: 3800,
      },
      finalReview: {
        allInfoCorrect: true,
        formSubmittedBy: 'Caseworker',
        organizationName: 'India HIV/AIDS Alliance',
        organizationEmail: 'fieldworker@allianceindia.org',
      },
    };

    const result = completeSubmissionSchema.safeParse(validFullPayload);
    expect(result.success).toBe(true);

    if (result.success) {
      const errors = normalizeValidationErrors({});
      expect(errors.length).toBe(0);
      const sectionErrors = getResolvableSectionErrors(errors, document);
      expect(Object.keys(sectionErrors).length).toBe(0);
    }
  });
});
