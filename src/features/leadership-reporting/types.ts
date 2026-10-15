/**
 * Leadership Reporting Assistant - Core Type Definitions
 * 
 * STRICT ISOLATION & SAFETY NOTICE:
 * - This assistant operates EXCLUSIVELY on synthetic data for national and state surveillance evaluation.
 * - Under NO circumstances does it access live clinical HIV databases, real beneficiary records, or PII.
 * - All statistical numbers, percentages, and counts are calculated deterministically by code.
 *   Language models are never permitted to guess or hallucinate metrics.
 */

export type NutritionGrade = 'SAM' | 'MAM' | 'NORMAL';
export type AttendanceStatus = 'REGULAR' | 'IRREGULAR' | 'DEFAULTED';
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'FLAGGED';

export interface SyntheticChildRecord {
  readonly childId: string;
  readonly state: string;
  readonly district: string;
  readonly ageMonths: number;
  readonly gender: 'M' | 'F';
  readonly nutritionBaseline: NutritionGrade;
  readonly nutritionCurrent: NutritionGrade;
  readonly attendance: AttendanceStatus;
  readonly verification: VerificationStatus;
  readonly daysInProgram: number;
  readonly recovered: boolean; // SAM/MAM at baseline -> NORMAL currently
  readonly lastVisitDaysAgo: number;
  readonly isSynthetic: true;
}

export interface KpiSummary {
  readonly totalEnrolled: number;
  readonly activeAttendanceCount: number;
  readonly activeAttendanceRate: number; // Percentage (0-100)
  readonly samCount: number;
  readonly mamCount: number;
  readonly normalCount: number;
  readonly samPercentage: number;
  readonly recoveredCount: number;
  readonly recoveryRate: number; // Percentage of SAM/MAM who achieved NORMAL (0-100)
  readonly pendingVerifications: number;
  readonly flaggedVerifications: number;
  readonly stateFilter: string | null;
  readonly isSynthetic: true;
}

export interface StateComparisonMetric {
  readonly state: string;
  readonly enrolled: number;
  readonly samCount: number;
  readonly mamCount: number;
  readonly normalCount: number;
  readonly recoveryRate: number; // Percentage
  readonly attendanceRate: number; // Percentage
  readonly pendingApprovals: number;
}

// -------------------------------------------------------------
// Scenario Domain: Orphan Status & Education Surveillance
// -------------------------------------------------------------

export type OrphanCategory = 'SINGLE_ORPHAN' | 'DOUBLE_ORPHAN' | 'NON_ORPHAN';
export type SchoolCategory = 'GOVERNMENT_SCHOOL' | 'PRIVATE_SCHOOL' | 'NON_FORMAL' | 'OUT_OF_SCHOOL';
export type RecordVerificationStatus = 'APPROVED' | 'PENDING' | 'FLAGGED' | 'REJECTED';
export type DateBasis = 'VISIT_DATE' | 'SUBMISSION_DATE';

export interface SyntheticAssessmentRecord {
  readonly assessmentId: string;
  readonly childId: string;
  readonly state: string;
  readonly district: string;
  readonly visitDate: string; // ISO YYYY-MM-DD
  readonly submissionDate: string; // ISO YYYY-MM-DD
  readonly orphanStatus: OrphanCategory | null; // null represents missing value
  readonly schoolType: SchoolCategory | null; // null represents missing value
  readonly verificationStatus: RecordVerificationStatus;
  readonly isSynthetic: true;
}

export interface DistrictBreakdownItem {
  readonly district: string;
  readonly uniqueBeneficiaries: number;
  readonly totalAssessments: number;
  readonly approvedAssessments: number;
  readonly pendingAssessments: number;
  readonly flaggedAssessments: number;
}

export interface JuneCohortSummaryResult {
  readonly year: number; // e.g. 2026
  readonly month: 'June';
  readonly dateBasis: DateBasis;
  readonly stateFilter: string | null;
  readonly orphanCategory: 'SINGLE_ORPHAN';
  readonly schoolCategory: 'GOVERNMENT_SCHOOL';
  
  // Beneficiary vs Assessment Counting
  readonly uniqueBeneficiariesCount: number;
  readonly totalAssessmentsCount: number;

  // Approval Status Breakdown
  readonly approvedAssessmentsCount: number;
  readonly pendingAssessmentsCount: number;
  readonly flaggedAssessmentsCount: number;
  readonly rejectedAssessmentsCount: number;

  // Missing Value Treatment
  readonly recordsExcludedMissingSchool: number;
  readonly recordsExcludedMissingOrphanStatus: number;

  // District Breakdown (when requested or grouped)
  readonly districtBreakdown: readonly DistrictBreakdownItem[];

  readonly isSynthetic: true;
}

// -------------------------------------------------------------
// Authorization & Security Model
// -------------------------------------------------------------

export interface CallerSecurityContext {
  readonly userId: string;
  readonly role: 'LEADERSHIP' | 'STATE_LEAD' | 'SUPERVISOR';
  /**
   * Permitted states: ['*'] for national scope (LEADERSHIP),
   * or explicit state list (e.g. ['Maharashtra'] for STATE_LEAD).
   */
  readonly permittedStates: readonly string[];
}

export type QueryIntent =
  | 'OVERVIEW_KPI'
  | 'STATE_COMPARISON'
  | 'MALNUTRITION_SAM_FOCUS'
  | 'VERIFICATION_QUEUE'
  | 'HIGH_RISK_DROPOUT'
  | 'JUNE_ORPHAN_SCHOOL_COHORT'
  | 'DISTRICT_BREAKDOWN'
  | 'RESET_FILTERS'
  | 'AUTHORIZATION_DENIED'
  | 'HELP_AND_CAPABILITIES'
  | 'MUTATION_REJECTED'
  | 'PII_REQUEST_REJECTED'
  | 'UNKNOWN_OR_OUT_OF_SCOPE';

export interface IntentClassification {
  readonly intent: QueryIntent;
  readonly stateFilter: string | null;
  readonly confidence: number;
  readonly rawQuery: string;
  readonly safetyRejectionReason?: string;
  readonly authorizationDenialReason?: string;
}

export interface IntentClassifierProvider {
  readonly providerType: 'DETERMINISTIC_RULES' | 'MOCK_PROVIDER' | 'LIVE_MODEL';
  classify(query: string, context?: Record<string, unknown>): IntentClassification;
}

export interface AssistantMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: string;
  readonly intent?: QueryIntent;
  readonly structuredData?: Record<string, unknown>;
  readonly isSynthetic: true;
}

export interface ReportingSession {
  readonly sessionId: string;
  readonly ownerUserId: string;
  readonly callerScope: CallerSecurityContext;
  readonly activeStateFilter: string | null;
  readonly activeDateBasis: DateBasis;
  readonly messages: AssistantMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
