/**
 * submissionEditHydration.ts — Canonical Hydration Contract for Submission Editing
 *
 * Implements strict projection separation:
 * - ListRecordProjection: Lightweight summary used on list cards & sync tables.
 * - FullSubmissionSnapshot: Complete 73-column / 9-section intake record.
 *
 * Safety Mandate:
 * Never allow saving/updating while a record is partially hydrated.
 * Missing hydrated values must never be converted to empty strings and saved.
 * All unchanged fields must retain byte/semantic equivalence.
 */

import type {
  Gender,
  OrphanStatus,
  CaregiverRelationship,
  MainSourceOfIncome,
  AppetiteLevel,
  EducationStatus,
  SchoolType,
  AttendanceType,
  ARTStatus,
  VLStatus,
  ApprovedAllianceStatus,
} from '@/types/domain';
import {
  hasVerifiableConsent,
  normalizeCaregiverConsent,
  type CanonicalCaregiverConsent as CaregiverConsent,
} from './submissionTypes';

// ---------------------------------------------------------------------------
// Projections Definition
// ---------------------------------------------------------------------------

/**
 * Lightweight summary projection for dashboard lists, cards, and sync tables.
 * MUST NEVER be used as the edit form source.
 */
export interface ListRecordProjection {
  uniqueId: string;
  childName: string;
  caregiverName: string;
  caregiverPhone?: string;
  district: string;
  state?: string;
  status: string;
  savedTime?: string;
  submittedTime?: string;
  revisionNumber?: number;
}

/**
 * Complete persisted snapshot covering all 9 assessment sections, consent,
 * signatures, documents, version, and technical IDs.
 */
export interface FullSubmissionSnapshot {
  uuid?: string;
  clientSubmissionId?: string;
  remoteSubmissionId?: string;
  uniqueId?: string;
  version?: number;
  revision?: number;
  revisionNumber?: number;
  interviewerName?: string;
  createdAt?: string;
  updatedAt?: string;
  editReason?: string;

  demographics?: Record<string, any>;
  caregiverConsent?: Record<string, any>;
  consent?: Record<string, any>;
  bankingAndKyc?: Record<string, any>;
  householdFinancial?: Record<string, any>;
  health?: Record<string, any>;
  nutrition?: Record<string, any>;
  educationStatus?: Record<string, any>;
  educationExpenses?: Record<string, any>;
  educationSupportRequired?: Record<string, any>;
  finalReview?: Record<string, any>;

  [key: string]: any;
}

/**
 * Strongly typed form state for the 9-section assessment editor.
 */
export interface EditFormState {
  // Section 1: Child & Caregiver Details
  artNumber: string;
  koboId: string;
  dateOfFilling: string;
  childName: string;
  dob: string;
  gender: Gender;
  orphanStatus: OrphanStatus;
  caregiverName: string;
  caregiverRelationship: CaregiverRelationship;
  contactNumber: string;
  fullAddress: string;
  state: string;
  district: string;
  childAadhaarNumber: string;

  // Section 2: Informed Consent
  agreeToParticipate: boolean;

  // Section 3: Banking & KYC Documents
  bankAccountHolderName: string;
  bankAccountNumber: string;
  bankIfscCode: string;
  bankLinkedMobileNumber: string;
  passbookPhotoUrl: string;
  aadhaarCardPhotoUrl: string;
  childPhotoUrl: string;

  // Section 4: Household & Financial
  totalFamilyMembers: number;
  numberOfChildrenUnder18: number;
  monthlyIncomeRs: number;
  mainSourceOfIncome: MainSourceOfIncome;

  // Section 5: Health & Clinical
  weightKg: number;
  heightCm: number;
  haemoglobinGdl: string;
  otherHealthConditions: string[];
  otherHealthConditionSpecify: string;
  artStatus: ARTStatus;
  artRegistrationDate: string;
  artIdNumber: string;
  vlStatus: VLStatus;
  vlDate: string;
  viralLoad: string;

  // Section 6: Nutrition
  appetite: AppetiteLevel;
  mealsPerDay: number;

  // Section 7: Education Status
  educationStatus: EducationStatus;
  educationStatusSpecify: string;
  schoolName: string;
  schoolSessionStartDate: string;
  schoolType: SchoolType;
  currentClass: string;
  attendance: AttendanceType;

  // Section 8: Education Expenses & Documents
  schoolFees: number;
  tuitionFees: number;
  books: number;
  stationery: number;
  uniform: number;
  transport: number;
  otherExpenses: number;
  feeReceiptPhotoUrl: string;
  marksheetPhotoUrl: string;
  remarks: string;

  // Section 8: Support Required
  requiredSchoolFees: number;
  requiredTuitionFees: number;
  requiredBooks: number;
  requiredStationery: number;
  requiredUniform: number;
  requiredTransport: number;
  requiredOtherSupport: number;

  // Section 9: Programme Approval & Final Review
  approvedAllianceIndia: ApprovedAllianceStatus;
  allInfoCorrect: boolean;
  organizationName: string;
  formSubmittedBy: string;
  organizationEmail: string;
}

export interface HydratedEditResult {
  formState: EditFormState;
  originalSnapshot: Record<string, any>;
  hasSavedSignature: boolean;
  existingSignatureUrl: string;
  savedDocuments: {
    passbook: boolean;
    aadhaar: boolean;
    childPhoto: boolean;
    feeReceipt: boolean;
    marksheet: boolean;
  };
  consentSnapshot: {
    hasVerifiableConsent: boolean;
    caregiverConsent: CaregiverConsent | null;
    consent: {
      agreeToParticipate?: boolean;
      signatureDataUrl?: string;
      signatureTimestamp?: string;
    };
    signatureDataUrl?: string;
  };
  currentVersion: number;
  remoteSubmissionId?: string;
}

export interface SnapshotCompletenessResult {
  isComplete: boolean;
  missingGroups: string[];
  details: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Normalization Utilities
// ---------------------------------------------------------------------------

/**
 * Normalizes any stored date (ISO timestamp, DD-MM-YYYY, DD/MM/YYYY, etc.)
 * into canonical HTML5 date input format: YYYY-MM-DD.
 * Returns empty string only if truly unparseable or absent.
 */
export function normalizeDateToInput(val: any): string {
  if (!val) return '';
  const str = String(val).trim();
  if (!str) return '';

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // ISO string: 2026-09-11T...
  if (str.includes('T')) {
    const part = str.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // General date parse fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return '';
}

/**
 * Normalizes numeric fields while preserving zero (0) as zero (never empty or undefined).
 */
export function normalizeNumericField(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

/**
 * Strips legacy formula strings or error placeholders defensively.
 */
function cleanStringValue(val: any): string {
  if (typeof val !== 'string') {
    return val !== undefined && val !== null ? String(val) : '';
  }
  if (val.includes('DATA_URL_STORED_PENDING_AUTH')) return '';
  if (val.startsWith('=')) {
    const match = val.match(/=HYPERLINK\("[^"]*",\s*"([^"]*)"\)/);
    return match ? match[1] : '';
  }
  return val.trim();
}

// ---------------------------------------------------------------------------
// Completeness Assertion
// ---------------------------------------------------------------------------

/**
 * Strictly verifies whether a loaded record possesses all required sentinel
 * field groups to qualify as a FullSubmissionSnapshot.
 *
 * If this check fails:
 * - Edit controls must remain disabled.
 * - Form must NOT allow save.
 * - Original record must remain completely untouched.
 */
export function assertEditSnapshotComplete(snapshot: any): SnapshotCompletenessResult {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      isComplete: false,
      missingGroups: ['root'],
      details: { root: false },
    };
  }

  const d = snapshot.demographics || snapshot;
  const c = snapshot.caregiverConsent || snapshot.consent || snapshot;
  const exp = snapshot.educationExpenses || snapshot;
  const fr = snapshot.finalReview || snapshot;

  // 1. Identity Sentinel: Must have a primary identifier
  const hasIdentity = Boolean(
    snapshot.uniqueId ||
    snapshot.artNumber ||
    d.artNumber ||
    snapshot['1\nUnique ID'] ||
    snapshot['42\nART ID Number'] ||
    snapshot.submissionUuid ||
    snapshot.uuid ||
    snapshot.clientSubmissionId ||
    snapshot.remoteSubmissionId
  );

  // 2. Demographics Sentinel: Child name must exist (cannot be an empty list row)
  const hasDemographics = Boolean(
    d.childName ||
    snapshot['9\nChild Name'] ||
    snapshot.child_name ||
    snapshot.childName
  );

  // 3. Caregiver Sentinel: Caregiver name must exist
  const hasCaregiver = Boolean(
    d.caregiverName ||
    snapshot['14\nCaregiver Full Name'] ||
    snapshot.caregiver_name ||
    snapshot.caregiverName ||
    snapshot.caregiverFullName
  );

  // 4. Consent Sentinel: Either consentProvided is set, consent decision is recorded, or verifiable consent exists
  const hasConsent = Boolean(
    c.consentProvided !== undefined ||
    c.consent_provided !== undefined ||
    c.agreeToParticipate !== undefined ||
    c.agree_to_participate !== undefined ||
    snapshot.agreeToParticipate !== undefined ||
    snapshot.agree_to_participate !== undefined ||
    snapshot['5\nConsent Obtained'] ||
    snapshot['5\\nConsent Obtained'] ||
    snapshot.consentObtained ||
    snapshot.consent_obtained ||
    hasVerifiableConsent(snapshot)
  );

  // 5. Attestation Sentinel: Form submitted by or interviewer name is present
  const hasAttestation = Boolean(
    fr.formSubmittedBy ||
    snapshot.interviewerName ||
    snapshot.formSubmittedBy ||
    snapshot['4\nSubmitted By'] ||
    snapshot['8\nInterviewer Name'] ||
    snapshot['70\nForm Submitted By'] ||
    snapshot.interviewer_name
  );

  // 6. Education Expenses Sentinel: Must not be a shallow list projection where only totalAnnualEducationCost is present
  // A full snapshot has at least some breakdown keys (even if 0), or the educationExpenses group.
  const hasExpensesGroup = Boolean(
    snapshot.educationExpenses ||
    snapshot['56\nSchool Fees'] !== undefined ||
    snapshot.school_fees !== undefined ||
    snapshot.schoolFees !== undefined ||
    exp.schoolFees !== undefined
  );

  const details = {
    identity: hasIdentity,
    demographics: hasDemographics,
    caregiver: hasCaregiver,
    consent: hasConsent,
    attestation: hasAttestation,
    educationExpenses: hasExpensesGroup,
  };

  const missingGroups = Object.entries(details)
    .filter(([_, present]) => !present)
    .map(([group]) => group);

  return {
    isComplete: missingGroups.length === 0,
    missingGroups,
    details,
  };
}

// ---------------------------------------------------------------------------
// Canonical Hydration Function
// ---------------------------------------------------------------------------

/**
 * Central canonical function to hydrate a FullSubmissionSnapshot into EditFormState.
 *
 * It explicitly maps every persisted canonical field to the form state,
 * including all 73 Google Sheet column headers, nested schema objects, and legacy aliases.
 */
export function hydrateSubmissionForEdit(record: any): HydratedEditResult {
  if (!record || typeof record !== 'object') {
    throw new Error('hydrateSubmissionForEdit called with null or invalid record');
  }

  // Extract nested section objects with fallbacks to root
  const d = record.demographics || record;
  const c = record.consent || record.caregiverConsent || record;
  const cc = record.caregiverConsent || {};
  const b = record.bankingAndKyc || record.bankDetails || record;
  const hf = record.householdFinancial || record.household || record;
  const h = record.health || record.clinical || record;
  const n = record.nutrition || record;
  const ed = record.educationStatus || record.education || record;
  const exp = record.educationExpenses || record;
  const req = record.educationSupportRequired || record;
  const fr = record.finalReview || record;

  // Version resolution
  const currentVersion = Number(
    record.version ||
    record.revision ||
    record.revisionNumber ||
    record['2\\nRevision Number'] ||
    record['2\nRevision Number'] ||
    1
  );

  const remoteSubmissionId =
    record.remoteSubmissionId ||
    record.remote_submission_id ||
    (record['1\nUnique ID'] && record.remoteSubmissionId) ||
    undefined;

  // Document photo extraction across all potential storage keys
  const passbookPhotoUrl = cleanStringValue(
    b.passbookPhotoUrl ||
    b.passbook_photo_url ||
    record.passbookPhotoUrl ||
    record.passbook_photo_url ||
    record['25\nPassbook Front Page Link'] ||
    record['25\\nPassbook Front Page Link'] ||
    ''
  );

  const aadhaarCardPhotoUrl = cleanStringValue(
    b.aadhaarCardPhotoUrl ||
    b.aadhaar_card_photo_url ||
    record.aadhaarCardPhotoUrl ||
    record.aadhaar_card_photo_url ||
    record['26\nAadhaar Card Link'] ||
    record['26\\nAadhaar Card Link'] ||
    record['26\nAadhaar Card Photo Link'] ||
    record['26\\nAadhaar Card Photo Link'] ||
    ''
  );

  const childPhotoUrl = cleanStringValue(
    b.childPhotoUrl ||
    b.child_photo_url ||
    record.childPhotoUrl ||
    record.child_photo_url ||
    record['27\nPassport Size Photo Link'] ||
    record['27\\nPassport Size Photo Link'] ||
    record['27\nChild Photo Link'] ||
    record['27\\nChild Photo Link'] ||
    ''
  );

  const feeReceiptPhotoUrl = cleanStringValue(
    exp.feeReceiptPhotoUrl ||
    exp.fee_receipt_photo_url ||
    record.feeReceiptPhotoUrl ||
    record.fee_receipt_photo_url ||
    record['63\nFee Receipt Link'] ||
    record['63\\nFee Receipt Link'] ||
    record['64\nSchool Fee Receipt Link'] ||
    record['64\\nSchool Fee Receipt Link'] ||
    ''
  );

  const marksheetPhotoUrl = cleanStringValue(
    exp.marksheetPhotoUrl ||
    exp.marksheet_photo_url ||
    record.marksheetPhotoUrl ||
    record.marksheet_photo_url ||
    record['64\nPrevious Year Marksheet Link'] ||
    record['64\\nPrevious Year Marksheet Link'] ||
    record['65\nMarksheet Photo Link'] ||
    record['65\\nMarksheet Photo Link'] ||
    ''
  );

  const signatureDataUrl = cleanStringValue(
    c.signatureDataUrl ||
    c.signatureUrl ||
    c.signature_data_url ||
    record.signatureDataUrl ||
    record.signature_data_url ||
    record['72\nSignature Link'] ||
    record['72\\nSignature Link'] ||
    ''
  );

  const hasSavedSignature = Boolean(
    (signatureDataUrl && !signatureDataUrl.includes('DATA_URL_STORED_PENDING_AUTH')) ||
    record.hasSignature === true ||
    cc.signatureAssetId ||
    c.signatureAssetId
  );

  // Consent reconstruction
  const hasConsent =
    hasVerifiableConsent(record) ||
    cc.consentProvided === true ||
    cc.agreeToParticipate === true ||
    c.agreeToParticipate === true ||
    record['5\nConsent Obtained'] === 'Yes' ||
    record.consentObtained === 'Yes' ||
    Boolean(signatureDataUrl);

  const normalizedConsent = hasConsent ? normalizeCaregiverConsent(record) : null;

  const consentSnapshot = {
    hasVerifiableConsent: hasConsent,
    caregiverConsent: normalizedConsent
      ? {
          consentProvided: normalizedConsent.consentProvided,
          consentVersion: normalizedConsent.consentVersion,
          caregiverName: normalizedConsent.caregiverName,
          caregiverRelationship: normalizedConsent.caregiverRelationship,
          consentCapturedAt: normalizedConsent.consentCapturedAt,
          signatureRequired: normalizedConsent.signatureRequired,
          signatureStatus: normalizedConsent.signatureStatus,
          signatureAssetId: normalizedConsent.signatureAssetId,
          signatureDataUrl: normalizedConsent.signatureDataUrl || signatureDataUrl,
          signatureUrl: normalizedConsent.signatureUrl,
        }
      : (record.caregiverConsent ? { ...record.caregiverConsent } : null),
    consent: {
      agreeToParticipate: c.agreeToParticipate ?? (hasConsent ? true : undefined),
      signatureDataUrl: c.signatureDataUrl || signatureDataUrl,
      signatureTimestamp: c.signatureTimestamp || normalizedConsent?.consentCapturedAt,
    },
    signatureDataUrl: signatureDataUrl || normalizedConsent?.signatureDataUrl,
  };

  // Section 1 & 2: Child & Caregiver Details
  const artNumber = cleanStringValue(
    d.artNumber ||
    record.artNumber ||
    record['42\nART ID Number'] ||
    record['42\\nART ID Number'] ||
    record.art_number ||
    record.artIdNumber ||
    record['1\nUnique ID'] ||
    record['1\\nUnique ID'] ||
    record.uniqueId ||
    ''
  );

  const koboId = cleanStringValue(record.koboId || d.koboId || artNumber);

  const dateOfFilling = normalizeDateToInput(
    d.dateOfFilling ||
    record['7\nVisit Date'] ||
    record.visitDate ||
    record.submissionTime ||
    record['3\nSubmission Time'] ||
    new Date()
  );

  const childName = cleanStringValue(
    d.childName ||
    record['9\nChild Name'] ||
    record.child_name ||
    record.childName ||
    ''
  );

  const dob = normalizeDateToInput(
    d.dob ||
    record['10\nDate of Birth'] ||
    record.dob ||
    ''
  );

  const rawGender = d.gender || record['12\nGender'] || record.gender;
  const gender: Gender = rawGender === 'Female' ? 'Female' : rawGender === 'Other' ? 'Other' : 'Male';

  const rawOrphan = d.orphanStatus || record['13\nOrphan Status'] || record.orphanStatus;
  const orphanStatus: OrphanStatus =
    rawOrphan === 'Single orphan (one parent deceased)' || rawOrphan === 'Single orphan (father deceased)' || rawOrphan === 'Single orphan (mother deceased)'
      ? 'Single orphan (one parent deceased)'
      : rawOrphan === 'Double orphan (both parents deceased)' || rawOrphan === 'Double Orphan (Both Parents Deceased)'
      ? 'Double orphan (both parents deceased)'
      : 'Both parents alive';

  const caregiverName = cleanStringValue(
    d.caregiverName ||
    record['14\nCaregiver Full Name'] ||
    record.caregiver_name ||
    record.caregiverName ||
    record.caregiverFullName ||
    ''
  );

  const rawRelation = d.caregiverRelationship || record['15\nCaregiver Relation'] || record.caregiver_relationship || record.caregiverRelationship;
  const caregiverRelationship: CaregiverRelationship =
    rawRelation === 'Father' || rawRelation === 'Grandparent' || rawRelation === 'Legal Guardian' || rawRelation === 'Other'
      ? rawRelation
      : 'Mother';

  const contactNumber = cleanStringValue(
    d.contactNumber ||
    d.caregiverPhone ||
    d.caregiverContact ||
    d.contact_number ||
    record['16\nCaregiver Contact'] ||
    record['16\\nCaregiver Contact'] ||
    record['16\nContact Number'] ||
    record['16\\nContact Number'] ||
    record['17\nCaregiver Contact Number'] ||
    record['17\\nCaregiver Contact Number'] ||
    record.caregiver_contact ||
    record.caregiver_phone ||
    record.caregiverPhone ||
    record.caregiverContact ||
    record.contactNumber ||
    record.contact_number ||
    record.phone ||
    ''
  );

  const fullAddress = cleanStringValue(
    d.fullAddress ||
    record['17\nAddress'] ||
    record['17\\nAddress'] ||
    record['18\nFull Residential Address'] ||
    record['18\\nFull Residential Address'] ||
    record.residential_address ||
    record.full_address ||
    record.address ||
    record.fullAddress ||
    ''
  );

  const state = cleanStringValue(d.state || record['18\nState'] || record['18\\nState'] || record['6\nState'] || record.state || 'Maharashtra');
  const district = cleanStringValue(d.district || record['19\nDistrict'] || record['19\\nDistrict'] || record['7\nDistrict'] || record.district || 'Pune');

  const childAadhaarNumber = cleanStringValue(
    d.childAadhaarNumber ||
    b.childAadhaarNumber ||
    record['19\nAadhaar Number'] ||
    record['19\\nAadhaar Number'] ||
    record['24\nChild Aadhaar Number'] ||
    record['24\\nChild Aadhaar Number'] ||
    record.childAadhaarNumber ||
    record.child_aadhaar_number ||
    record.masked_aadhaar ||
    record.aadhaar ||
    ''
  );

  // Section 3: Banking Details
  const bankAccountHolderName = cleanStringValue(
    b.bankAccountHolderName ||
    b.accountHolderName ||
    record['20\nBank Account Holder Name'] ||
    record['20\\nBank Account Holder Name'] ||
    record['20\nAccount Holder'] ||
    record['20\\nAccount Holder'] ||
    record.account_holder_name ||
    record.accountHolderName ||
    record.bank_account_holder_name ||
    ''
  );

  const bankAccountNumber = cleanStringValue(
    b.bankAccountNumber ||
    b.accountNumber ||
    record['21\nBank Account Number'] ||
    record['21\\nBank Account Number'] ||
    record.bank_account_number ||
    record.bankAccountNumber ||
    ''
  );

  const bankIfscCode = cleanStringValue(
    b.bankIfscCode ||
    b.ifscCode ||
    record['22\nBank IFSC Code'] ||
    record['22\\nBank IFSC Code'] ||
    record['22\nBank IFSC'] ||
    record['22\\nBank IFSC'] ||
    record.ifsc_code ||
    record.ifscCode ||
    ''
  );

  const bankLinkedMobileNumber = cleanStringValue(
    b.bankLinkedMobileNumber ||
    record['23\nBank Linked Mobile Number'] ||
    record['23\\nBank Linked Mobile Number'] ||
    record['24\nBank Linked Mobile'] ||
    record['24\\nBank Linked Mobile'] ||
    record.bankLinkedMobileNumber ||
    record.bank_linked_mobile ||
    contactNumber ||
    ''
  );

  // Section 4: Household & Financial
  const totalFamilyMembers = normalizeNumericField(
    hf.totalFamilyMembers ??
    record['28\nHousehold Members'] ??
    record['28\\nHousehold Members'] ??
    record['28\nTotal Family Members'] ??
    record['28\\nTotal Family Members'] ??
    record.householdMembers ??
    record.totalFamilyMembers ??
    record.total_family_members,
    4
  );
  const numberOfChildrenUnder18 = normalizeNumericField(
    hf.numberOfChildrenUnder18 ??
    record['29\nNo of Children'] ??
    record['29\\nNo of Children'] ??
    record['29\nNumber of Children <=18'] ??
    record['29\\nNumber of Children <=18'] ??
    record.noOfChildren ??
    record.numberOfChildrenUnder18 ??
    record.number_of_children_under_18,
    2
  );
  const monthlyIncomeRs = normalizeNumericField(
    hf.monthlyIncomeRs ??
    record['30\nMonthly Income'] ??
    record['30\\nMonthly Income'] ??
    record['30\nMonthly Household Income'] ??
    record['30\\nMonthly Household Income'] ??
    record.monthly_household_income ??
    record.monthlyIncome ??
    record.monthlyIncomeRs,
    5000
  );

  const rawIncomeSource = hf.mainSourceOfIncome || record['31\nIncome Source'] || record.primary_caregiver_occupation || record.incomeSource;
  const mainSourceOfIncome: MainSourceOfIncome =
    rawIncomeSource === 'Salaried employment' || rawIncomeSource === 'Self-employed' || rawIncomeSource === 'Pension / Government support' || rawIncomeSource === 'No regular income'
      ? rawIncomeSource
      : 'Daily wage labour';

  // Section 5: Health & Clinical
  const weightKg = normalizeNumericField(
    h.weightKg ??
    n.weightKg ??
    record['32\nCurrent Weight (kg)'] ??
    record['32\\nCurrent Weight (kg)'] ??
    record['32\nWeight (kg)'] ??
    record['32\\nWeight (kg)'] ??
    record.weight_kg ??
    record.weightKg ??
    record.weight,
    14.5
  );
  const heightCm = normalizeNumericField(
    h.heightCm ??
    n.heightCm ??
    record['33\nCurrent Height (cm)'] ??
    record['33\\nCurrent Height (cm)'] ??
    record['33\nHeight (cm)'] ??
    record['33\\nHeight (cm)'] ??
    record.height_cm ??
    record.heightCm ??
    record.height,
    100
  );
  const haemoglobinGdl = cleanStringValue(
    h.haemoglobinGdl ||
    record['36\nHemoglobin (g/dL)'] ||
    record['36\\nHemoglobin (g/dL)'] ||
    record['37\nHaemoglobin (g/dL)'] ||
    record['37\\nHaemoglobin (g/dL)'] ||
    record.haemoglobinGdl ||
    record.haemoglobin_gdl ||
    record.hb_level ||
    record.hbLevel ||
    '12.0'
  );

  const rawHealthConditions = h.otherHealthConditions || record['38\nComorbidities'] || record.comorbidities;
  const otherHealthConditions: string[] = Array.isArray(rawHealthConditions)
    ? rawHealthConditions
    : typeof rawHealthConditions === 'string' && rawHealthConditions
    ? rawHealthConditions.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const otherHealthConditionSpecify = cleanStringValue(h.otherHealthConditionSpecify || record['39\nComorbidities Other'] || record.comorbiditiesOther || '');

  const rawArtStatus = h.artStatus || record['40\nART Status'] || record.artStatus || record.art_status;
  const artStatus: ARTStatus =
    rawArtStatus === 'Not on ART' || rawArtStatus === 'Defaulted / Interrupted' || rawArtStatus === 'Transferred In'
      ? rawArtStatus
      : 'On ART';

  const artRegistrationDate = normalizeDateToInput(h.artRegistrationDate || record['41\nART Registration Date'] || record['43\nART Registration Date'] || record.artRegistrationDate || '');
  const artIdNumber = cleanStringValue(h.artIdNumber || record['42\nART ID Number'] || record.art_id_number || record.artIdNumber || '');

  const rawVlStatus = h.vlStatus || record['43\nVL Status'] || record['44\nViral Load Status'] || record.vlStatus || record.vl_status;
  const vlStatus: VLStatus =
    rawVlStatus === 'Tested > 6 months ago' || rawVlStatus === 'Awaiting results' || rawVlStatus === 'Not tested'
      ? rawVlStatus
      : 'Tested in last 6 months';

  const vlDate = normalizeDateToInput(h.vlDate || record['44\nVL Date'] || record['45\nViral Load Date'] || record.vlDate || '');
  const viralLoad = cleanStringValue(h.viralLoad || record['45\nViral Load'] || record['46\nViral Load Result'] || record.viralLoad || '< 50');

  // Section 6: Nutrition Habits
  const rawAppetite = n.appetite || record['47\nAppetite'] || record['47\nAppetite Level'] || record.appetite;
  const appetite: AppetiteLevel = rawAppetite === 'Reduced' || rawAppetite === 'Poor / Very low' ? rawAppetite : 'Good';
  const mealsPerDay = normalizeNumericField(n.mealsPerDay || record['48\nMeals per Day'] || record['48\nMeals Per Day'] || record.mealsPerDay, 3);

  // Section 7: Education Status
  const rawEdStatus = ed.educationStatus || record['49\nEducation Status'] || record.educationStatus;
  const educationStatus: EducationStatus =
    rawEdStatus === 'Dropped out of school' || rawEdStatus === 'Never enrolled in school' || rawEdStatus === 'Completed schooling' || rawEdStatus === 'Other'
      ? rawEdStatus
      : 'Currently going to school';

  const educationStatusSpecify = cleanStringValue(
    ed.educationStatusSpecify ||
    record['50\nEducation Status Other'] ||
    record['50\\nEducation Status Other'] ||
    ''
  );

  const schoolName = cleanStringValue(
    ed.schoolName ||
    record['50\nSchool Name'] ||
    record['50\\nSchool Name'] ||
    record['51\nSchool Name'] ||
    record['51\\nSchool Name'] ||
    record.schoolName ||
    record.school_name ||
    ''
  );
  const schoolSessionStartDate = normalizeDateToInput(ed.schoolSessionStartDate || record['52\nSchool Session Start Date'] || record['51\nSchool Session Start'] || record.schoolSessionStartDate || '');

  const rawSchoolType = ed.schoolType || record['53\nSchool Type'] || record['52\nSchool Type'] || record.schoolType || record.school_type;
  const schoolType: SchoolType = rawSchoolType === 'Private school' || rawSchoolType === 'Aided school' ? rawSchoolType : 'Government school';

  const currentClass = cleanStringValue(ed.currentClass || ed.schoolGrade || record['54\nCurrent Class'] || record['53\nCurrent Grade/Class'] || record.school_grade || record.schoolGrade || 'Class 2');
  const rawAttendance = ed.attendance || record['55\nAttendance Status'] || record['54\nAttendance Regularity'] || record.attendance;
  const attendance: AttendanceType = rawAttendance === 'Irregular' || rawAttendance === 'Dropped out' ? rawAttendance : 'Regular';

  // Section 8: Education Expenses
  const schoolFees = normalizeNumericField(exp.schoolFees ?? record['56\nSchool Fees'] ?? record.school_fees ?? record.schoolFees, 0);
  const tuitionFees = normalizeNumericField(
    exp.tuitionFees ??
    record['57\nPrivate Tuition Fee'] ??
    record['57\\nPrivate Tuition Fee'] ??
    record['57\nTuition Fees'] ??
    record['57\\nTuition Fees'] ??
    record.tuition_fees ??
    record.tuitionFees,
    0
  );
  const books = normalizeNumericField(
    exp.books ??
    record['58\nSchool Books'] ??
    record['58\\nSchool Books'] ??
    record['58\nBooks and Stationery'] ??
    record['58\\nBooks and Stationery'] ??
    record.books,
    0
  );
  const stationery = normalizeNumericField(exp.stationery ?? record['59\nSchool Stationery'] ?? record.stationery, 0);
  const uniform = normalizeNumericField(
    exp.uniform ??
    record['60\nSchool Uniform'] ??
    record['60\\nSchool Uniform'] ??
    record['59\nSchool Uniform'] ??
    record['59\\nSchool Uniform'] ??
    record.uniform,
    0
  );
  const transport = normalizeNumericField(
    exp.transport ??
    record['61\nSchool Transport'] ??
    record['61\\nSchool Transport'] ??
    record['60\nTransport Cost'] ??
    record['60\\nTransport Cost'] ??
    record.transport,
    0
  );
  const otherExpenses = normalizeNumericField(
    exp.otherExpenses ??
    record['62\nSchool Other Expenses'] ??
    record['62\\nSchool Other Expenses'] ??
    record['61\nOther Education Expenses'] ??
    record['61\\nOther Education Expenses'] ??
    record.other_expenses ??
    record.otherExpenses,
    0
  );
  const remarks = cleanStringValue(exp.remarks || record['66\nRemarks (If Any)'] || record['65\nRemarks on Education'] || record.remarks || record.clinical_notes || '');

  // Support Required
  const requiredSchoolFees = normalizeNumericField(req.requiredSchoolFees ?? record['66\nRequired Support - School Fees'], 0);
  const requiredTuitionFees = normalizeNumericField(req.requiredTuitionFees, 0);
  const requiredBooks = normalizeNumericField(req.requiredBooks ?? record['67\nRequired Support - Books'], 0);
  const requiredStationery = normalizeNumericField(req.requiredStationery, 0);
  const requiredUniform = normalizeNumericField(req.requiredUniform ?? record['68\nRequired Support - Uniform'], 0);
  const requiredTransport = normalizeNumericField(req.requiredTransport, 0);
  const requiredOtherSupport = normalizeNumericField(req.requiredOtherSupport, 0);

  // Section 9: Verification & Attestation
  const rawApproved =
    record.approvedAllianceIndia ||
    fr.approvedAllianceIndia ||
    record['67\nApproved Alliance India'] ||
    record['67\\nApproved Alliance India'] ||
    record['69\nAlliance India Approval'] ||
    record['69\\nAlliance India Approval'];
  const approvedAllianceIndia: ApprovedAllianceStatus =
    rawApproved === 'Pending' || rawApproved === 'Conditionally Approved' || rawApproved === 'Rejected'
      ? rawApproved
      : 'Approved';

  const organizationName = cleanStringValue(
    fr.organizationName ||
    record['69\nOrganization Name'] ||
    record.organizationName ||
    'India HIV/AIDS Alliance'
  );

  const formSubmittedBy = cleanStringValue(
    fr.formSubmittedBy ||
    record.interviewerName ||
    record.interviewer_name ||
    record['70\nForm Submitted By'] ||
    record['4\nSubmitted By'] ||
    record['8\nInterviewer Name'] ||
    'Caseworker'
  );

  const organizationEmail = cleanStringValue(
    fr.organizationEmail ||
    record['71\nOrganization Email'] ||
    record.organizationEmail ||
    'fieldworker@allianceindia.org'
  );

  const formState: EditFormState = {
    artNumber,
    koboId,
    dateOfFilling,
    childName,
    dob,
    gender,
    orphanStatus,
    caregiverName,
    caregiverRelationship,
    contactNumber,
    fullAddress,
    state,
    district,
    childAadhaarNumber,

    agreeToParticipate: hasConsent
      ? true
      : (c.agreeToParticipate ?? (cc.consentProvided ?? false)),

    bankAccountHolderName,
    bankAccountNumber,
    bankIfscCode,
    bankLinkedMobileNumber,
    passbookPhotoUrl,
    aadhaarCardPhotoUrl,
    childPhotoUrl,

    totalFamilyMembers,
    numberOfChildrenUnder18,
    monthlyIncomeRs,
    mainSourceOfIncome,

    weightKg,
    heightCm,
    haemoglobinGdl,
    otherHealthConditions,
    otherHealthConditionSpecify,
    artStatus,
    artRegistrationDate,
    artIdNumber,
    vlStatus,
    vlDate,
    viralLoad,

    appetite,
    mealsPerDay,

    educationStatus,
    educationStatusSpecify,
    schoolName,
    schoolSessionStartDate,
    schoolType,
    currentClass,
    attendance,

    schoolFees,
    tuitionFees,
    books,
    stationery,
    uniform,
    transport,
    otherExpenses,
    feeReceiptPhotoUrl,
    marksheetPhotoUrl,
    remarks,

    requiredSchoolFees,
    requiredTuitionFees,
    requiredBooks,
    requiredStationery,
    requiredUniform,
    requiredTransport,
    requiredOtherSupport,

    approvedAllianceIndia,
    allInfoCorrect: true,
    organizationName,
    formSubmittedBy,
    organizationEmail,
  };

  // Original snapshot for change detection diffing
  const originalSnapshot: Record<string, any> = {
    weightKg,
    heightCm,
    haemoglobinGdl,
    monthlyIncomeRs,
    totalFamilyMembers,
    numberOfChildrenUnder18,
    mainSourceOfIncome,
    appetite,
    mealsPerDay,
    educationStatus,
    schoolName,
    schoolType,
    currentClass,
    attendance,
    schoolFees,
    tuitionFees,
    books,
    stationery,
    uniform,
    transport,
    otherExpenses,
    requiredSchoolFees,
    requiredTuitionFees,
    requiredBooks,
    requiredStationery,
    requiredUniform,
    requiredTransport,
    requiredOtherSupport,
    approvedAllianceIndia,
    remarks,
  };

  const savedDocuments = {
    passbook: Boolean(passbookPhotoUrl || record.hasPassbook || b.hasPassbook),
    aadhaar: Boolean(aadhaarCardPhotoUrl || record.hasAadhaar || b.hasAadhaar),
    childPhoto: Boolean(childPhotoUrl || record.hasChildPhoto || b.hasChildPhoto),
    feeReceipt: Boolean(feeReceiptPhotoUrl || record.hasFeeReceipt || exp.hasFeeReceipt),
    marksheet: Boolean(marksheetPhotoUrl || record.hasMarksheet || exp.hasMarksheet),
  };

  return {
    formState,
    originalSnapshot,
    hasSavedSignature,
    existingSignatureUrl: signatureDataUrl,
    savedDocuments,
    consentSnapshot,
    currentVersion,
    remoteSubmissionId,
  };
}

// ---------------------------------------------------------------------------
// Non-PII Diagnostic Logging
// ---------------------------------------------------------------------------

/**
 * Calculates a fast non-PII numeric hash string for safe diagnostic tracing.
 */
export function toDiagnosticHash(id?: string): string {
  if (!id) return 'none';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `rec-${Math.abs(hash).toString(16).substring(0, 8)}`;
}

export interface HydrationDiagnosticContext {
  technicalId?: string;
  hydrationVersion: number;
  loadedGroups: string[];
  missingGroups: string[];
  source: 'local' | 'server';
  editEnabled: boolean;
}

/**
 * Emits development and audit diagnostics strictly without PII.
 * Never logs names, phone numbers, addresses, signatures, base64 data, or Drive URLs.
 */
export function logHydrationDiagnostics(ctx: HydrationDiagnosticContext): void {
  if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_APP_ENV === 'test') {
    console.info('[HydrationDiagnostics]', {
      recordHash: toDiagnosticHash(ctx.technicalId),
      hydrationVersion: ctx.hydrationVersion,
      loadedGroups: ctx.loadedGroups,
      missingGroups: ctx.missingGroups,
      source: ctx.source,
      editEnabled: ctx.editEnabled,
      timestamp: new Date().toISOString(),
    });
  }
}
