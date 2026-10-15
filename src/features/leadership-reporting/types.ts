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

export type QueryIntent =
  | 'OVERVIEW_KPI'
  | 'STATE_COMPARISON'
  | 'MALNUTRITION_SAM_FOCUS'
  | 'VERIFICATION_QUEUE'
  | 'HIGH_RISK_DROPOUT'
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
  readonly userRole: 'LEADERSHIP' | 'ADMIN' | 'STATE_EVALUATOR';
  readonly activeStateFilter: string | null;
  readonly messages: AssistantMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
