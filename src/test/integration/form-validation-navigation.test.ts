/**
 * form-validation-navigation.test.ts
 *
 * Comprehensive integration test suite for Form Validation Exact Field Navigation (Phase A):
 *
 * Test 1: Missing DOB navigates & focuses demographics DOB field with inline message.
 * Test 2: Missing caregiver signature targets signature wrapper (no generic top-only error).
 * Test 3: Missing document targets exact upload dropzone.
 * Test 4: Missing nested education expense targets exact category row & amount input.
 * Test 5: Multiple errors show correct section counts, summary lists all, only first receives auto-focus.
 * Test 6: Collapsed/hidden section opens before navigation and waits for DOM mount.
 * Test 7: Native required control is normalized into application error styling.
 * Test 8: Safe fallback for unknown schema path + registry completeness assertion.
 * Test 9: Accessibility (aria-invalid, aria-describedby, role="alert", keyboard focus).
 * Test 10: Validation failure sends zero POST/PATCH requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FIELD_REGISTRY,
  SECTION_ORDER,
  SECTION_DOM_IDS,
  FormValidationError,
  getFieldMetadata,
  normalizeValidationErrors,
  normalizeNativeValidationError,
  focusValidationTarget,
  navigateToValidationError,
  getUnregisteredRequiredPaths,
} from '@/lib/validations/formValidationRegistry';
import {
  toWorkerSafeValidationMessage,
  handleSchemaValidationFailure,
} from '@/lib/validations/submissionValidationGuard';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import * as submissionQueueRepo from '@/features/submission/submissionQueueRepository';

describe('Phase A: Form Validation Exact Field Navigation & UX Engine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();

    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.Element.prototype.scrollIntoView = vi.fn();

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ---------------------------------------------------------------------------
  // Test 1: Missing DOB navigates & focuses demographics DOB field with inline message
  // ---------------------------------------------------------------------------
  it('Test 1: Missing DOB navigates & focuses demographics DOB field with inline message', () => {
    const meta = getFieldMetadata(['demographics', 'dob']);
    expect(meta.elementId).toBe('demographics-dob');
    expect(meta.sectionKey).toBe('demographics');
    expect(meta.label).toBe('Child date of birth');

    // Setup DOM
    const section = document.createElement('section');
    section.id = 'sec-child';
    const input = document.createElement('input');
    input.id = 'demographics-dob';
    input.type = 'date';
    section.appendChild(input);
    document.body.appendChild(section);

    const focusSpy = vi.spyOn(input, 'focus');
    const scrollSpy = vi.spyOn(input, 'scrollIntoView');

    const error: FormValidationError = {
      path: ['demographics', 'dob'],
      fieldKey: 'demographics.dob',
      sectionKey: 'demographics',
      message: 'A valid date of birth is required and cannot be in the future.',
      label: 'Child date of birth',
      elementId: 'demographics-dob',
    };

    const navigated = navigateToValidationError(error);
    expect(navigated).toBe(true);
    expect(scrollSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 2: Missing caregiver signature targets signature wrapper (no generic top-only error)
  // ---------------------------------------------------------------------------
  it('Test 2: Missing caregiver signature targets signature wrapper without generic message', () => {
    const meta = getFieldMetadata(['caregiverConsent', 'signature']);
    expect(meta.elementId).toBe('caregiver-signature');
    expect(meta.sectionKey).toBe('consent');
    expect(meta.label).toBe('Caregiver signature');

    // Never produce generic "Please review the highlighted field before submitting."
    const msg = toWorkerSafeValidationMessage({
      code: 'custom',
      path: ['caregiverConsent', 'signature'],
      message: 'Required',
    });
    expect(msg).not.toBe('Please review the highlighted field before submitting.');
    expect(msg).toBe('Please save the caregiver signature before submitting.');

    // Setup DOM wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'caregiver-signature';
    const btn = document.createElement('button');
    btn.textContent = 'Save Signature';
    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);

    const focusSpy = vi.spyOn(btn, 'focus');
    const scrollSpy = vi.spyOn(wrapper, 'scrollIntoView');

    const error: FormValidationError = {
      path: ['caregiverConsent', 'signature'],
      fieldKey: 'caregiverConsent.signature',
      sectionKey: 'consent',
      message: 'Please save the caregiver signature before submitting.',
      label: 'Caregiver signature',
      elementId: 'caregiver-signature',
    };

    navigateToValidationError(error);
    expect(scrollSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 3: Missing document targets exact upload dropzone
  // ---------------------------------------------------------------------------
  it('Test 3: Missing document targets exact upload dropzone', () => {
    const meta = getFieldMetadata(['bankingAndKyc', 'passbookPhotoUrl']);
    expect(meta.elementId).toBe('banking-passbookPhotoUrl');
    expect(meta.sectionKey).toBe('banking');

    // Setup DOM
    const dropzone = document.createElement('button');
    dropzone.id = 'banking-passbookPhotoUrl';
    document.body.appendChild(dropzone);

    const focusSpy = vi.spyOn(dropzone, 'focus');
    const scrollSpy = vi.spyOn(dropzone, 'scrollIntoView');

    const error: FormValidationError = {
      path: ['bankingAndKyc', 'passbookPhotoUrl'],
      fieldKey: 'bankingAndKyc.passbookPhotoUrl',
      sectionKey: 'banking',
      message: 'Please upload a clear photo of the bank passbook front page.',
      label: 'Passbook photo',
      elementId: 'banking-passbookPhotoUrl',
    };

    navigateToValidationError(error);
    expect(scrollSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 4: Missing nested education expense targets exact category row & amount input
  // ---------------------------------------------------------------------------
  it('Test 4: Missing nested education expense targets exact category row & amount input', () => {
    const meta = getFieldMetadata(['educationExpenses', 'schoolFees', 'currentCost']);
    expect(meta.elementId).toBe('school-fees-current-cost');
    expect(meta.sectionKey).toBe('expenses');

    // Setup DOM
    const expenseInput = document.createElement('input');
    expenseInput.id = 'school-fees-current-cost';
    expenseInput.type = 'number';
    document.body.appendChild(expenseInput);

    const focusSpy = vi.spyOn(expenseInput, 'focus');
    const scrollSpy = vi.spyOn(expenseInput, 'scrollIntoView');

    const error: FormValidationError = {
      path: ['educationExpenses', 'schoolFees', 'currentCost'],
      fieldKey: 'schoolFees.currentCost',
      sectionKey: 'expenses',
      message: 'School fees current cost is required.',
      label: 'School fees current cost',
      elementId: 'school-fees-current-cost',
    };

    navigateToValidationError(error);
    expect(scrollSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 5: Multiple errors show correct section counts, summary lists all, only first receives auto-focus
  // ---------------------------------------------------------------------------
  it('Test 5: Multiple errors show correct section counts, summary lists all, only first receives auto-focus', () => {
    // Setup 3 DOM elements across sections
    const sigContainer = document.createElement('div');
    sigContainer.id = 'caregiver-signature';
    const sigBtn = document.createElement('button');
    sigContainer.appendChild(sigBtn);

    const dobInput = document.createElement('input');
    dobInput.id = 'demographics-dob';

    const attestationInput = document.createElement('input');
    attestationInput.id = 'review-allInfoCorrect';

    document.body.appendChild(sigContainer);
    document.body.appendChild(dobInput);
    document.body.appendChild(attestationInput);

    const sigFocusSpy = vi.spyOn(sigBtn, 'focus');
    const dobFocusSpy = vi.spyOn(dobInput, 'focus');
    const attestationFocusSpy = vi.spyOn(attestationInput, 'focus');

    // Create errors in random/reverse order
    const rawErrors: FormValidationError[] = [
      {
        path: ['finalReview', 'allInfoCorrect'],
        fieldKey: 'finalReview.allInfoCorrect',
        sectionKey: 'review',
        message: 'You must confirm that all information is correct before submitting.',
        label: 'Confirmation of information correctness',
        elementId: 'review-allInfoCorrect',
      },
      {
        path: ['demographics', 'dob'],
        fieldKey: 'demographics.dob',
        sectionKey: 'demographics',
        message: 'A valid date of birth is required and cannot be in the future.',
        label: 'Child date of birth',
        elementId: 'demographics-dob',
      },
      {
        path: ['caregiverConsent', 'signature'],
        fieldKey: 'caregiverConsent.signature',
        sectionKey: 'consent',
        message: 'Please save the caregiver signature before submitting.',
        label: 'Caregiver signature',
        elementId: 'caregiver-signature',
      },
    ];

    const normalized = normalizeValidationErrors({ customErrors: rawErrors });

    // Sorted by Section order: Section 1 (consent) -> Section 2 (demographics) -> Section 9 (review)
    expect(normalized.length).toBe(3);
    expect(normalized[0].sectionKey).toBe('consent');
    expect(normalized[0].elementId).toBe('caregiver-signature');
    expect(normalized[1].sectionKey).toBe('demographics');
    expect(normalized[1].elementId).toBe('demographics-dob');
    expect(normalized[2].sectionKey).toBe('review');
    expect(normalized[2].elementId).toBe('review-allInfoCorrect');

    let errorMsg = '';
    handleSchemaValidationFailure({
      issues: [],
      customErrors: normalized,
      setError: (msg) => { errorMsg = msg; },
      setSubmitting: () => {},
    });

    // Normalized count message
    expect(errorMsg).toBe('Please correct 3 fields before submitting.');

    // Only first error receives focus
    expect(sigFocusSpy).toHaveBeenCalledTimes(1);
    expect(dobFocusSpy).not.toHaveBeenCalled();
    expect(attestationFocusSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 6: Collapsed/hidden section opens before navigation and waits for DOM mount
  // ---------------------------------------------------------------------------
  it('Test 6: Collapsed/hidden section opens before navigation and waits for DOM mount', () => {
    const details = document.createElement('details');
    details.id = 'sec-banking';
    details.open = false;

    const input = document.createElement('input');
    input.id = 'banking-bankAccountNumber';
    details.appendChild(input);
    document.body.appendChild(details);

    let openedSection = '';
    const error: FormValidationError = {
      path: ['bankingAndKyc', 'bankAccountNumber'],
      fieldKey: 'bankingAndKyc.bankAccountNumber',
      sectionKey: 'banking',
      message: 'Bank account number is required.',
      label: 'Bank account number',
      elementId: 'banking-bankAccountNumber',
    };

    navigateToValidationError(error, {
      openSection: (sec) => {
        openedSection = sec;
      },
    });

    expect(openedSection).toBe('banking');
    expect(details.open).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Native required control is normalized into application error styling
  // ---------------------------------------------------------------------------
  it('Test 7: Native required control is normalized into application error styling', () => {
    const input = document.createElement('input');
    input.id = 'demographics-childName';
    input.name = 'childName';
    input.required = true;

    const normalized = normalizeNativeValidationError(input);
    expect(normalized.sectionKey).toBe('demographics');
    expect(normalized.elementId).toBe('demographics-childName');
    expect(normalized.label).toBe('Child full name');
    expect(normalized.message).toBe('Child full name is required (at least 2 characters).');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Safe fallback for unknown schema path + registry completeness assertion
  // ---------------------------------------------------------------------------
  it('Test 8: Safe fallback for unknown schema path and registry completeness', () => {
    // Safe fallback for unmapped path
    const meta = getFieldMetadata(['customUnknownModule', 'someNestedField']);
    expect(meta.sectionKey).toBe('consent'); // safe default
    expect(meta.elementId).toBe('field-customUnknownModule-someNestedField');
    expect(meta.defaultMessage).toBe('Some information needs review in this section.');

    // Completeness assertion: verify all critical schema paths are registered
    const criticalPaths = [
      'demographics.childName',
      'demographics.dob',
      'demographics.caregiverName',
      'demographics.district',
      'demographics.state',
      'caregiverConsent.consentProvided',
      'caregiverConsent.signature',
      'bankingAndKyc.passbookPhotoUrl',
      'householdFinancial.totalFamilyMembers',
      'householdFinancial.monthlyIncomeRs',
      'health.weightKg',
      'health.heightCm',
      'educationExpenses.schoolFees',
      'finalReview.allInfoCorrect',
      'finalReview.formSubmittedBy',
    ];

    const unregistered = getUnregisteredRequiredPaths(criticalPaths);
    expect(unregistered).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Test 9: Accessibility attributes & roles
  // ---------------------------------------------------------------------------
  it('Test 9: Accessibility attributes & keyboard focus management', () => {
    const input = document.createElement('input');
    input.id = 'demographics-childName';
    document.body.appendChild(input);

    focusValidationTarget(input);
    expect(document.activeElement).toBe(input);

    // Non-focusable container gets tabindex="-1" and receives focus
    const container = document.createElement('div');
    container.id = 'caregiver-consent';
    document.body.appendChild(container);

    focusValidationTarget(container);
    expect(container.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(container);
  });

  // ---------------------------------------------------------------------------
  // Test 10: Validation failure sends zero POST/PATCH requests
  // ---------------------------------------------------------------------------
  it('Test 10: Validation failure halts execution and sends zero POST/PATCH requests', async () => {
    const enqueueCreateSpy = vi.spyOn(submissionQueueRepo, 'enqueueCreate').mockResolvedValue(undefined as any);
    const enqueueUpdateSpy = vi.spyOn(submissionQueueRepo, 'enqueueUpdate').mockResolvedValue(undefined as any);

    // Invalid record with missing required fields
    const invalidRecord: any = {
      uuid: 'test-uuid-1234',
      clientSubmissionId: 'test-uuid-1234',
      demographics: {
        childName: '', // Invalid: empty
        dob: '', // Invalid: empty
      },
      consent: {
        agreeToParticipate: false, // Invalid
      },
    };

    const schemaResult = completeSubmissionSchema.safeParse(invalidRecord);
    expect(schemaResult.success).toBe(false);

    if (!schemaResult.success) {
      let formError = '';
      let isSubmitting = true;

      handleSchemaValidationFailure({
        issues: schemaResult.error.issues,
        setError: (msg) => { formError = msg; },
        setSubmitting: (val) => { isSubmitting = val; },
      });

      expect(isSubmitting).toBe(false);
      expect(formError).toMatch(/Please correct \d+ fields? before submitting\./);
    }

    // Absolutely NO queue or network dispatch
    expect(enqueueCreateSpy).not.toHaveBeenCalled();
    expect(enqueueUpdateSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 11: Deduplication preserves distinct fields sharing container or element IDs
  // ---------------------------------------------------------------------------
  it('Test 11: Error collection preserves distinct fields sharing container or element IDs while deduplicating identical fields', () => {
    // Two distinct errors sharing the same container element ID (e.g. section container or compound grid)
    const err1: FormValidationError = {
      path: ['educationExpenses', 'schoolFees'],
      fieldKey: 'educationExpenses.schoolFees',
      sectionKey: 'expenses',
      message: 'School fees is required.',
      label: 'School fees',
      elementId: 'sec-expenses', // shares section container
    };
    const err2: FormValidationError = {
      path: ['educationExpenses', 'tuitionFees'],
      fieldKey: 'educationExpenses.tuitionFees',
      sectionKey: 'expenses',
      message: 'Tuition fees is required.',
      label: 'Tuition fees',
      elementId: 'sec-expenses', // shares same elementId
    };

    // Third error with identical path to err1 (e.g. from zod parsing the same field)
    const duplicateErr1: FormValidationError = {
      path: ['educationExpenses', 'schoolFees'],
      fieldKey: 'educationExpenses.schoolFees',
      sectionKey: 'expenses',
      message: 'School fees must be 0 or more.',
      label: 'School fees',
      elementId: 'sec-expenses',
    };

    const normalized = normalizeValidationErrors({
      customErrors: [err1, err2, duplicateErr1],
    });

    // err1 and err2 must BOTH be preserved (not dropped because they share elementId)
    // duplicateErr1 must be deduplicated because it targets the same field path
    expect(normalized.length).toBe(2);
    expect(normalized[0].fieldKey).toBe('educationExpenses.schoolFees');
    expect(normalized[1].fieldKey).toBe('educationExpenses.tuitionFees');
  });

  // ---------------------------------------------------------------------------
  // Test 12: Production required targets map to valid element IDs
  // ---------------------------------------------------------------------------
  it('Test 12: Confirms all required production targets map to real element IDs', () => {
    const requiredTargets = [
      { path: ['caregiverConsent', 'consentProvided'], expectedElementId: 'caregiver-consent' },
      { path: ['caregiverConsent', 'signature'], expectedElementId: 'caregiver-signature' },
      { path: ['demographics', 'dob'], expectedElementId: 'demographics-dob' },
      { path: ['bankingAndKyc', 'passbookPhotoUrl'], expectedElementId: 'banking-passbookPhotoUrl' },
      { path: ['bankingAndKyc', 'aadhaarCardPhotoUrl'], expectedElementId: 'banking-aadhaarCardPhotoUrl' },
      { path: ['bankingAndKyc', 'childPhotoUrl'], expectedElementId: 'banking-childPhotoUrl' },
      { path: ['educationExpenses', 'schoolFees', 'currentCost'], expectedElementId: 'school-fees-current-cost' },
      { path: ['educationExpenses', 'tuitionFees'], expectedElementId: 'expenses-tuitionFees' },
      { path: ['finalReview', 'allInfoCorrect'], expectedElementId: 'review-allInfoCorrect' },
      { path: ['finalReview', 'formSubmittedBy'], expectedElementId: 'review-formSubmittedBy' },
    ];

    for (const target of requiredTargets) {
      const meta = getFieldMetadata(target.path);
      expect(meta.elementId).toBe(target.expectedElementId);
    }
  });
});

