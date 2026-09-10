/**
 * Canonical Domain Types for Childcare Support — Phase 3
 * Exactly aligned with the official KoboToolbox CHILD_HIV_SUPPORT_FORM
 * Adheres strictly to approved programme linelists and non-negotiable data-minimisation rules.
 */

export type Gender = 'Male' | 'Female' | 'Other';

export type OrphanStatus =
  | 'Both parents alive'
  | 'Single orphan (one parent deceased)'
  | 'Double orphan (both parents deceased)'
  // Legacy aliases for backward compatibility
  | 'None'
  | 'Maternal Orphan'
  | 'Paternal Orphan'
  | 'Double Orphan (Both Parents Deceased)'
  | 'Single Parent with Vulnerability';

export type CaregiverRelationship =
  | 'Mother'
  | 'Father'
  | 'Grandparent'
  | 'Legal Guardian'
  | 'Other';

export type MainSourceOfIncome =
  | 'Daily wage labour'
  | 'Salaried employment'
  | 'Self-employed'
  | 'Pension / Government support'
  | 'No regular income';

export type AppetiteLevel = 'Good' | 'Reduced' | 'Poor / Very low';

export type EducationStatus =
  | 'Currently going to school'
  | 'Dropped out of school'
  | 'Never enrolled in school'
  | 'Completed schooling'
  | 'Other';

export type SchoolType = 'Government school' | 'Private school' | 'Aided school';

export type AttendanceType = 'Regular' | 'Irregular' | 'Dropped out';

export type NutritionStatus =
  | 'Normal'
  | 'MAM (Moderate Acute Malnutrition)'
  | 'SAM (Severe Acute Malnutrition)'
  | 'Overweight / Obese';

export type BMICategory =
  | 'Normal'
  | 'Underweight'
  | 'Moderate Underweight'
  | 'Severe Underweight'
  | 'Overweight / Obese';

export type HbCategory =
  | 'Normal'
  | 'Mild Anemia'
  | 'Moderate Anemia'
  | 'Severe Anemia';

export type ARTStatus =
  | 'On ART'
  | 'Not on ART'
  | 'Defaulted / Interrupted'
  | 'Transferred In';

export type VLStatus =
  | 'Tested in last 6 months'
  | 'Tested > 6 months ago'
  | 'Awaiting results'
  | 'Not tested';

export type VLCategory =
  | 'Suppressed (<1000 copies/mL)'
  | 'Unsuppressed (≥1000 copies/mL)'
  | 'Undetectable (<50 copies/mL)'
  | 'Unknown / Pending';

export type ApprovedAllianceStatus =
  | 'Pending'
  | 'Approved'
  | 'Conditionally Approved'
  | 'Rejected';

export type SyncStatus =
  | 'draft'
  | 'finalized_local'
  | 'queued'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'failed_retryable'
  | 'failed_final'
  | 'conflict'
  | 'needs_review'
  | 'DRAFT'
  | 'FINALIZED_LOCAL'
  | 'QUEUED'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_FINAL'
  | 'NEEDS_REVIEW';

export type OutboxOperationType = 'CREATE' | 'UPDATE';

export const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type SignatureStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'CAPTURED_LOCAL'
  | 'QUEUED_FOR_UPLOAD'
  | 'UPLOADED'
  | 'FAILED'
  | 'NEEDS_REVIEW';

export interface CaregiverConsent {
  consentProvided: boolean;
  consentVersion: string;
  caregiverName: string;
  caregiverRelationship: string;
  consentCapturedAt: string;
  signatureRequired: boolean;
  signatureStatus: SignatureStatus;
  signatureAssetId?: string;
  signatureDataUrl?: string;
}

export interface ConsentData {
  agreeToParticipate: boolean;
  signatureDataUrl?: string;
  signatureTimestamp?: string;
}

export interface DemographicsData {
  artNumber: string; // Auto-generated Reference ID (STATE-DIST-DDHHMM-SEQ)
  dateOfFilling?: string;
  childName: string;
  dob: string;
  calculatedAgeYears: number;
  calculatedAgeMonths?: number;
  gender: Gender;
  orphanStatus: OrphanStatus;
  caregiverName: string;
  caregiverRelationship: CaregiverRelationship | string;
  contactNumber: string;
  fullAddress: string;
  state: string;
  district: string;
  childAadhaarNumber?: string;
  // Backward compatibility
  caregiverPhone?: string;
  maskedAadhaar?: string;
}

export interface HouseholdFinancialData {
  totalFamilyMembers: number;
  numberOfChildrenUnder18: number;
  monthlyIncomeRs: number;
  mainSourceOfIncome: MainSourceOfIncome;
  // Backward compatibility
  orphanStatus?: OrphanStatus;
  primaryCaregiverOccupation?: string;
  monthlyHouseholdIncome?: number;
  rationCardType?: 'BPL' | 'AAY (Antyodaya)' | 'APL' | 'None';
  numberOfSiblings?: number;
}

export interface HealthData {
  weightKg: number;
  heightCm: number;
  bmi: number;
  bmiCategory?: BMICategory;
  haemoglobinGdl?: number;
  hbCategory?: HbCategory;
  otherHealthConditions: string[];
  otherHealthConditionSpecify?: string;
  // ART & Viral Load clinical tracking
  artStatus?: ARTStatus;
  artRegistrationDate?: string;
  artIdNumber?: string;
  vlStatus?: VLStatus;
  vlDate?: string;
  viralLoad?: string | number;
  vlCategory?: VLCategory;
  // Clinical triage
  bmiZScore?: number;
  nutritionStatus?: NutritionStatus;
  bilateralPittingOedema?: boolean;
  muacMm?: number;
  clinicalNotes?: string;
}

export interface NutritionData {
  appetite: AppetiteLevel;
  mealsPerDay: number;
  // Clinical anthropometry backward-compatibility aliases
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
  muacMm?: number;
  bilateralPittingOedema?: boolean;
  nutritionStatus?: NutritionStatus;
}

export interface EducationStatusData {
  educationStatus: EducationStatus;
  educationStatusSpecify?: string;
  schoolName?: string;
  schoolSessionStartDate?: string;
  schoolType?: SchoolType;
  currentClass?: string;
  attendance?: AttendanceType;
  // Backward compatibility
  schoolEnrolled?: boolean;
  attendancePercentage?: number;
  grantRecommended?: boolean;
  recommendedGrantAmount?: number;
  schoolGrade?: string;
  supportMaterialsNeeded?: string[];
}

export interface EducationCurrentExpensesData {
  schoolFees: number;
  tuitionFees: number;
  books: number;
  stationery: number;
  uniform: number;
  transport: number;
  otherExpenses: number;
  totalAnnualCost: number;
  feeReceiptPhotoUrl?: string;
  marksheetPhotoUrl?: string;
  remarks?: string;
}

export interface EducationSupportRequiredData {
  requiredSchoolFees: number;
  requiredTuitionFees?: number;
  requiredBooks: number;
  requiredStationery: number;
  requiredUniform: number;
  requiredTransport: number;
  requiredOtherSupport: number;
  totalRequiredSupport: number;
}

export interface FinalReviewData {
  allInfoCorrect: boolean;
  organizationName?: string;
  formSubmittedBy: string;
  organizationEmail?: string;
  submissionDate?: string;
  approvedAllianceIndia?: ApprovedAllianceStatus | string;
  reviewConfirmed?: boolean;
}

export interface BankingAndKycData {
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  bankLinkedMobileNumber?: string;
  childAadhaarNumber?: string;
  passbookPhotoUrl?: string;
  aadhaarCardPhotoUrl?: string;
  childPhotoUrl?: string;
}

// Backward-compat BankDetails (optional in new form)
export interface BankDetailsData {
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  branchName?: string;
  passbookPhotoCaptured?: boolean;
}

export interface AssessmentRecord {
  id?: number; // Auto-incremented IndexedDB key
  uuid: string; // Client-assigned RFC 4122 UUIDv4
  clientSubmissionId: string; // Stable UUID for idempotency
  remoteSubmissionId?: string; // Canonical server-confirmed UUID
  version: number; // Optimistic Concurrency Control version (starts at 1)
  interviewerName: string;
  uniqueId?: string; // Generated Reference / Beneficiary ID (e.g. WB-KOL-081255-01)
  stepIndex: number;
  
  // Official CHILD_HIV_SUPPORT_FORM Sections
  consent: ConsentData;
  caregiverConsent?: CaregiverConsent;
  demographics: DemographicsData;
  householdFinancial: HouseholdFinancialData;
  health: HealthData;
  clinical?: HealthData;
  nutrition: NutritionData;
  educationStatus: EducationStatusData;
  educationExpenses: EducationCurrentExpensesData;
  educationSupportRequired: EducationSupportRequiredData;
  finalReview: FinalReviewData;
  bankingAndKyc?: BankingAndKycData;
  koboId?: string;
  approvedAllianceIndia?: string;
  reviewConfirmed?: boolean;
  syncNeeded?: 'YES' | 'NO';
  signatureDataUrl?: string;

  // Backward compatibility convenience properties
  household?: HouseholdFinancialData;
  bankDetails?: BankDetailsData;
  declaration?: {
    consentAcknowledged: boolean;
    caseworkerName: string;
    declarationDate: string;
    signatureTimestamp?: string;
  };
  grantCalculation?: {
    recommendedGrantAmount?: number;
    totalGrantAmount?: number;
  };
  education?: any;

  syncStatus: SyncStatus;
  syncError?: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string | null;
}

export interface SyncQueueItem {
  id?: number;
  submissionUuid: string;
  idempotencyKey: string;
  operationType: OutboxOperationType;
  payload: AssessmentRecord;
  status: SyncStatus;
  expectedVersion?: number;
  retryCount: number;
  lastAttempt: string | null;
  nextRetryTimestamp: number | null;
  lastErrorCode?: string | number | null;
  statusCode?: number | null;
  requestId?: string | null;
  errorMessage: string | null;
  conflictMetadata?: {
    serverVersion?: number;
    conflictFields?: string[];
    resolutionRequired?: boolean;
  } | null;
}

export interface AuditEvent {
  id?: number;
  timestamp: string;
  eventType:
    | 'DRAFT_CREATED'
    | 'DRAFT_UPDATED'
    | 'ASSESSMENT_QUEUED'
    | 'SYNC_SUCCESS'
    | 'SYNC_FAILED'
    | 'VIEW_RECORD'
    | 'RECORD_PATCHED'
    | 'CONCURRENCY_CONFLICT';
  targetUuid?: string;
  artNumber?: string;
  actor?: string;
  actorId?: string;
  actorRole?: string;
  action?: string;
  operation?: string;
  version?: number;
  previousVersion?: number;
  newVersion?: number;
  changedFields?: string[];
  changes?: Record<string, unknown>;
  requestId?: string;
  details?: Record<string, unknown>;
}

export interface AllowlistedEditableFields {
  contactNumber?: string;
  caregiverPhone?: string;
  caregiverName?: string;
  caregiverRelationship?: string;
  fullAddress?: string;
  weightKg?: number;
  heightCm?: number;
  haemoglobinGdl?: number;
  appetite?: AppetiteLevel;
  mealsPerDay?: number;
  educationStatus?: EducationStatus;
  schoolName?: string;
  currentClass?: string;
  attendance?: AttendanceType;
  totalAnnualCost?: number;
  totalRequiredSupport?: number;
  remarks?: string;
}
