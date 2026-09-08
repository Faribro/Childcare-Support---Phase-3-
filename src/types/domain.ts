/**
 * Canonical Domain Types for Childcare Support — Phase 3
 * Adheres strictly to approved programme linelists and non-negotiable data-minimisation rules.
 */

export type Gender = 'Male' | 'Female' | 'Transgender' | 'Other';

export type OrphanStatus =
  | 'None'
  | 'Maternal Orphan'
  | 'Paternal Orphan'
  | 'Double Orphan (Both Parents Deceased)'
  | 'Single Parent with Vulnerability';

export type NutritionStatus =
  | 'Normal'
  | 'MAM (Moderate Acute Malnutrition)'
  | 'SAM (Severe Acute Malnutrition)'
  | 'Overweight / Obese';

export type SyncStatus =
  | 'draft'
  | 'queued'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'conflict';

export interface DemographicsData {
  artNumber: string;
  childName: string;
  dob: string;
  calculatedAgeYears: number;
  calculatedAgeMonths: number;
  gender: Gender;
  caregiverName: string;
  caregiverRelationship: string;
  caregiverPhone: string;
  maskedAadhaar?: string;
  district: string;
  artCenter: string;
}

export interface HouseholdData {
  orphanStatus: OrphanStatus;
  primaryCaregiverOccupation: string;
  monthlyHouseholdIncome: number;
  rationCardType: 'BPL' | 'AAY (Antyodaya)' | 'APL' | 'None';
  numberOfSiblings: number;
}

export interface ClinicalNutritionData {
  heightCm: number;
  weightKg: number;
  muacMm?: number;
  bilateralPittingOedema: boolean;
  bmi: number;
  bmiZScore: number;
  nutritionStatus: NutritionStatus;
  clinicalNotes?: string;
}

export interface EducationData {
  schoolEnrolled: boolean;
  schoolType?: 'Government' | 'Government-Aided' | 'Private' | 'Non-Formal';
  schoolGrade?: string;
  attendancePercentage?: number;
  grantRecommended: boolean;
  recommendedGrantAmount: number;
  supportMaterialsNeeded: string[];
}

export interface BankDetailsData {
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  branchName: string;
  passbookPhotoCaptured: boolean;
}

export interface DeclarationData {
  consentAcknowledged: boolean;
  caseworkerName: string;
  declarationDate: string;
  signatureTimestamp: string;
}

export interface AssessmentRecord {
  id?: number; // Auto-incremented IndexedDB key
  uuid: string; // Client-assigned RFC 4122 UUIDv4
  interviewerName: string;
  stepIndex: number;
  demographics: DemographicsData;
  household: HouseholdData;
  nutrition: ClinicalNutritionData;
  education: EducationData;
  bankDetails: BankDetailsData;
  declaration: DeclarationData;
  syncStatus: SyncStatus;
  syncError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueItem {
  id?: number;
  submissionUuid: string;
  payload: AssessmentRecord;
  status: SyncStatus;
  retryCount: number;
  lastAttempt: string | null;
  nextRetryTimestamp: number | null;
  errorMessage: string | null;
}

export interface AuditEvent {
  id?: number;
  timestamp: string;
  eventType: 'DRAFT_CREATED' | 'DRAFT_UPDATED' | 'ASSESSMENT_QUEUED' | 'SYNC_SUCCESS' | 'SYNC_FAILED' | 'VIEW_RECORD';
  targetUuid?: string;
  artNumber?: string;
  details?: Record<string, unknown>;
}
