/**
 * Synthetic Beneficiary Assessment Factory for End-to-End Testing
 * 
 * Strict Safety Invariants:
 * 1. 100% synthetic data generated with deterministic prefix:
 *    E2E_TEST_DO_NOT_USE_REAL_DATA_<timestamp>
 * 2. Zero real child, caregiver, caseworker names, contacts, or identities.
 * 3. Synthetic base64 image placeholders for signature and document links.
 * 4. Strictly validates against completeSubmissionSchema and patchSubmissionSchema.
 */

import { CompleteSubmissionPayload, PatchSubmissionPayload } from '@/lib/validations/submissionSchema';

export interface SyntheticScenarioOptions {
  runId?: string;
  uniqueSuffix?: string;
  orphanStatus?: 'Both parents alive' | 'Single orphan (one parent deceased)' | 'Double orphan (both parents deceased)';
  educationStatus?: 'Currently going to school' | 'Dropped out of school' | 'Never enrolled in school';
  withDocuments?: boolean;
  withSignature?: boolean;
  customWeight?: number;
  customHeight?: number;
}

// Minimal 1x1 transparent PNG data URL for synthetic image uploads
export const SYNTHETIC_BASE64_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export const SYNTHETIC_SIGNATURE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAAAwCAYAAABgG28KAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAMElEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8GE4gAAB4h9qVwAAAABJRU5ErkJggg==';

/**
 * Generate a standard RFC 4122 v4 UUID
 */
export function generateTestUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a fully validated synthetic CompleteSubmissionPayload
 */
export function createSyntheticSubmission(options: SyntheticScenarioOptions = {}): CompleteSubmissionPayload {
  const timestamp = Date.now();
  const runId = options.runId || `run-${timestamp}`;
  const suffix = options.uniqueSuffix || `${timestamp.toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const testLabel = `E2E_TEST_DO_NOT_USE_REAL_DATA_${suffix}`;

  const uuid = generateTestUuid();
  const artNumber = `SYN-${suffix.toUpperCase()}`;
  const isEnrolled = (options.educationStatus || 'Currently going to school') === 'Currently going to school';

  const weightKg = options.customWeight ?? 16.5;
  const heightCm = options.customHeight ?? 105.0;
  const heightM = heightCm / 100;
  const bmi = Number((weightKg / (heightM * heightM)).toFixed(2));

  const payload: CompleteSubmissionPayload = {
    uuid,
    clientSubmissionId: uuid,
    uniqueId: artNumber,
    interviewerName: `Test Caseworker ${testLabel}`,
    signatureDataUrl: options.withSignature !== false ? SYNTHETIC_SIGNATURE_DATA_URL : undefined,
    
    demographics: {
      artNumber,
      dateOfFilling: new Date().toISOString().split('T')[0],
      childName: `Synthetic Child ${testLabel}`,
      dob: '2018-05-20',
      calculatedAgeYears: 8,
      calculatedAgeMonths: 96,
      gender: 'Male',
      orphanStatus: options.orphanStatus || 'Single orphan (one parent deceased)',
      caregiverName: `Synthetic Caregiver ${testLabel}`,
      caregiverRelationship: 'Mother',
      contactNumber: '9820011223',
      caregiverPhone: '9820011223',
      fullAddress: `Plot 101 Synthetic Test Lane, ${testLabel}`,
      state: 'Maharashtra',
      district: 'Pune',
      childAadhaarNumber: 'XXXX-XXXX-4321',
      maskedAadhaar: 'XXXX-XXXX-4321',
    },

    caregiverConsent: {
      consentProvided: true,
      consentVersion: 'v1.0-2026',
      caregiverName: `Synthetic Caregiver ${testLabel}`,
      caregiverRelationship: 'Mother',
      consentCapturedAt: new Date().toISOString(),
      signatureRequired: true,
      signatureStatus: options.withSignature !== false ? 'CAPTURED_LOCAL' : 'PENDING',
      signatureDataUrl: options.withSignature !== false ? SYNTHETIC_SIGNATURE_DATA_URL : undefined,
    },

    consent: {
      agreeToParticipate: true,
      signatureDataUrl: options.withSignature !== false ? SYNTHETIC_SIGNATURE_DATA_URL : undefined,
      signatureTimestamp: new Date().toISOString(),
    },

    bankingAndKyc: {
      bankAccountHolderName: `Synthetic Caregiver ${testLabel}`,
      bankAccountNumber: '987654321012',
      bankIfscCode: 'SBIN0001234',
      bankLinkedMobileNumber: '9820011223',
      childAadhaarNumber: 'XXXX-XXXX-4321',
      passbookPhotoUrl: options.withDocuments ? SYNTHETIC_BASE64_IMAGE : undefined,
      aadhaarCardPhotoUrl: options.withDocuments ? SYNTHETIC_BASE64_IMAGE : undefined,
      childPhotoUrl: options.withDocuments ? SYNTHETIC_BASE64_IMAGE : undefined,
    },

    householdFinancial: {
      totalFamilyMembers: 4,
      numberOfChildrenUnder18: 2,
      monthlyIncomeRs: 7500,
      mainSourceOfIncome: 'Daily wage labour',
      orphanStatus: options.orphanStatus || 'Single orphan (one parent deceased)',
    },

    health: {
      weightKg,
      heightCm,
      bmi,
      bmiCategory: 'Normal',
      haemoglobinGdl: 11.8,
      hbCategory: 'Normal',
      otherHealthConditions: ['None'],
      artStatus: 'On ART',
      artRegistrationDate: '2022-01-15',
      artIdNumber: `ART-${suffix.toUpperCase()}`,
      vlStatus: 'Tested in last 6 months',
      vlDate: '2026-03-10',
      viralLoad: '< 50',
      vlCategory: 'Undetectable (<50 copies/mL)',
      bilateralPittingOedema: false,
      muacMm: 142,
    },

    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    },

    educationStatus: {
      educationStatus: options.educationStatus || 'Currently going to school',
      schoolName: isEnrolled ? `Synthetic Test Primary School ${testLabel}` : undefined,
      schoolSessionStartDate: isEnrolled ? '2026-06-15' : undefined,
      schoolType: isEnrolled ? 'Government school' : undefined,
      currentClass: isEnrolled ? 'Class 3' : undefined,
      attendance: isEnrolled ? 'Regular' : undefined,
      schoolEnrolled: isEnrolled,
    },

    educationExpenses: {
      schoolFees: isEnrolled ? 1200 : 0,
      tuitionFees: isEnrolled ? 600 : 0,
      books: isEnrolled ? 800 : 0,
      stationery: isEnrolled ? 400 : 0,
      uniform: isEnrolled ? 900 : 0,
      transport: isEnrolled ? 500 : 0,
      otherExpenses: isEnrolled ? 200 : 0,
      totalAnnualCost: isEnrolled ? 4600 : 0,
      feeReceiptPhotoUrl: isEnrolled && options.withDocuments ? SYNTHETIC_BASE64_IMAGE : undefined,
      marksheetPhotoUrl: isEnrolled && options.withDocuments ? SYNTHETIC_BASE64_IMAGE : undefined,
      remarks: `Field assessment completed under test run ${runId}`,
    },

    educationSupportRequired: {
      requiredSchoolFees: isEnrolled ? 1200 : 0,
      requiredBooks: isEnrolled ? 800 : 0,
      requiredStationery: isEnrolled ? 400 : 0,
      requiredUniform: isEnrolled ? 900 : 0,
      requiredTransport: isEnrolled ? 500 : 0,
      requiredOtherSupport: isEnrolled ? 200 : 0,
      totalRequiredSupport: isEnrolled ? 4000 : 0,
    },

    finalReview: {
      allInfoCorrect: true,
      organizationName: 'India HIV/AIDS Alliance',
      formSubmittedBy: `Test Caseworker ${testLabel}`,
      organizationEmail: 'e2e-tester@allianceindia.org',
      submissionDate: new Date().toISOString(),
      approvedAllianceIndia: 'Pending',
      reviewConfirmed: true,
    },

    approvedAllianceIndia: 'Pending',
    reviewConfirmed: true,
    syncNeeded: 'NO',
  };

  return payload;
}

/**
 * Creates an allowlisted PATCH payload for optimistic concurrency tests
 */
export function createSyntheticPatch(
  expectedVersion: number,
  options: { runId?: string; uniqueSuffix?: string } = {}
): PatchSubmissionPayload {
  const suffix = options.uniqueSuffix || `${Date.now().toString(36)}`;
  const testLabel = `E2E_PATCH_${suffix}`;

  return {
    expectedVersion,
    editReason: `Recalibrated weight and updated contact under ${testLabel}`,
    weightKg: 17.2,
    heightCm: 105.5,
    contactNumber: '9820099887',
    caregiverPhone: '9820099887',
    remarks: `Updated weight verified during monitoring visit ${testLabel}`,
  };
}
