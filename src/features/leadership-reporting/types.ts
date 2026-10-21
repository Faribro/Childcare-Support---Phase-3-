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

export interface SourceFreshness {
  readonly lastSyncedAt: string; // ISO string from data adapter
  readonly sourceVersion: string; // e.g. "bridge-v1.3.0"
  readonly recordCount: number;
  readonly isSynthetic: boolean;
}

export interface CohortFilterQuery {
  readonly year?: number;
  readonly month?: string; // e.g. "June", "All", "April-June"
  readonly monthRange?: string; // e.g. "April-June", "Q1", "Q2"
  readonly dateBasis?: DateBasis;
  readonly orphanCategory?: OrphanCategory | 'ALL';
  readonly schoolCategory?: SchoolCategory | 'ALL';
  readonly stateFilter?: string | null;
  readonly districtFilter?: string | null;
  readonly includeDriveLinks?: boolean;
}

export interface CohortSummaryResult {
  readonly year: number; // e.g. 2026
  readonly month: string; // e.g. "June"
  readonly dateBasis: DateBasis;
  readonly stateFilter: string | null;
  readonly districtFilter?: string | null;
  readonly orphanCategory: OrphanCategory | 'ALL';
  readonly schoolCategory: SchoolCategory | 'ALL';

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

  // Source Freshness derived from data adapter
  readonly sourceFreshness: SourceFreshness;

  readonly isSynthetic: true;
}

export interface JuneCohortSummaryResult extends CohortSummaryResult {
  readonly month: 'June';
  readonly orphanCategory: 'SINGLE_ORPHAN';
  readonly schoolCategory: 'GOVERNMENT_SCHOOL';
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

export interface SenderIdentity {
  readonly authorized: boolean;
  readonly callerScope?: CallerSecurityContext;
  readonly senderPhoneMasked: string; // e.g. "+91 ******3210"
  readonly rawSenderPhoneHash: string; // SHA-256 for audit without storing raw phone
  readonly recipientEmailMasked?: string; // e.g. "d****@allianceindia.org"
  readonly denialReason?: string;
}

export interface ClarificationPrompt {
  readonly queryType: 'COHORT_SURVEILLANCE' | 'UNKNOWN';
  readonly missingYear: boolean;
  readonly missingDateBasis: boolean;
  readonly promptText: string;
  readonly pendingFilter?: CohortFilterQuery;
}

export interface ExportPreviewContract {
  readonly exportId: string;
  readonly reportType: 'COHORT_SUMMARY' | 'STATE_SURVEILLANCE' | 'LINELIST_EXPORT';
  readonly title: string;
  readonly stateFilter: string | null;
  readonly year: number;
  readonly month: string;
  readonly monthRange?: string;
  readonly dateBasis: DateBasis;
  readonly dateField: 'visit_date' | 'submission_date';
  readonly uniqueBeneficiaries: number;
  readonly totalAssessments: number;
  readonly columns: readonly string[];
  readonly recipientUserId: string;
  readonly recipientEmailMasked: string;
  readonly recipientEmailExact: string;
  readonly confirmationCode: string;
  readonly immutableParametersHash: string;
  readonly expiresAt: string;
  isConsumed?: boolean;
  consumedAt?: string;
  readonly format?: 'XLSX' | 'CSV' | 'PDF';
  readonly driveLinksCount?: number;
}

export interface ExportDeliveryJob {
  readonly jobId: string;
  readonly exportId: string;
  readonly reportType: string;
  readonly recipientUserId: string;
  readonly recipientEmailMasked: string;
  readonly recipientEmailExact?: string;
  readonly immutableParametersHash?: string;
  readonly status: 'QUEUED' | 'SENT' | 'FAILED';
  readonly queuedAt: string;
  readonly deliveryTarget: 'APPS_SCRIPT_EMAIL_DISPATCHER';
  readonly artifact?: any;
  readonly errorReason?: string;
  readonly dispatchedAt?: string;
}

export type QueryIntent =
  | 'OVERVIEW_KPI'
  | 'STATE_COMPARISON'
  | 'MALNUTRITION_SAM_FOCUS'
  | 'VERIFICATION_QUEUE'
  | 'HIGH_RISK_DROPOUT'
  | 'COHORT_SURVEILLANCE'
  | 'JUNE_ORPHAN_SCHOOL_COHORT'
  | 'DISTRICT_BREAKDOWN'
  | 'RESET_FILTERS'
  | 'CLARIFICATION_ANSWER'
  | 'LINELIST_EXPORT_REQUEST'
  | 'EXPORT_REQUEST'
  | 'EXPORT_CONFIRM'
  | 'EXPORT_CANCEL'
  | 'AUTHORIZATION_DENIED'
  | 'HELP_AND_CAPABILITIES'
  | 'MUTATION_REJECTED'
  | 'PII_REQUEST_REJECTED'
  | 'UNKNOWN_OR_OUT_OF_SCOPE';

export interface IntentClassification {
  readonly intent: QueryIntent;
  readonly stateFilter: string | null;
  readonly parsedFilter?: CohortFilterQuery;
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
  readonly confirmedYear?: number;
  readonly confirmedDateBasis?: DateBasis;
  readonly confirmedYearExplicitlyClarified?: boolean;
  readonly confirmedDateBasisExplicitlyClarified?: boolean;
  readonly isConfirmedPolicy?: boolean;
  readonly pendingClarification?: ClarificationPrompt | null;
  readonly pendingExport?: ExportPreviewContract | null;
  readonly lastCohortResult?: CohortSummaryResult | null;
  readonly messages: AssistantMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

