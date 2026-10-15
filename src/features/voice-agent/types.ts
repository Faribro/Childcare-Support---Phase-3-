/**
 * Calling-Agent Voice Prototype - Core Type Definitions
 * 
 * STRICT ISOLATION NOTICE:
 * - This prototype operates ONLY on synthetic test data.
 * - Under no circumstances does this module connect to real beneficiary records,
 *   clinical/HIV status databases, production Sheets/Supabase/Podio tables, or live telephony.
 * - Beneficiaries do not access this system. This is a staff-only evaluation harness.
 */

export type ConversationState =
  | 'IDLE'
  | 'CONNECTING'
  | 'IDENTITY_ANNOUNCED'
  | 'PRIVACY_CONSENT_PENDING'
  | 'TASK_EXPLANATION'
  | 'AWAITING_USER_INPUT'
  | 'CALLBACK_COLLECTION'
  | 'HUMAN_HANDOFF'
  | 'OPT_OUT_PROCESSED'
  | 'WRONG_NUMBER_TERMINATED'
  | 'CARE_UNAVAILABLE_TERMINATED'
  | 'COMPLETED'
  | 'TERMINATED_BOUNDED_DURATION'
  | 'TERMINATED_USAGE_LIMIT'
  | 'ERROR';

export type LanguageTarget = 'en' | 'hi' | 'hinglish';

export interface SyntheticFollowupTask {
  readonly taskId: string;
  readonly mockCaregiverName: string;
  readonly mockChildInitials: string;
  readonly programmeContext: string;
  readonly taskDescription: string;
  readonly generalInstructions: string[];
  readonly isSynthetic: true;
}

export interface ConversationTurn {
  readonly id: string;
  readonly speaker: 'assistant' | 'user' | 'system';
  readonly text: string;
  readonly timestamp: number;
  readonly language?: LanguageTarget;
  readonly latencyMs?: number;
  readonly interrupted?: boolean;
}

export interface SafetyViolation {
  readonly category: 'SENSITIVE_HEALTH_DATA' | 'FINANCIAL_CREDENTIALS' | 'GOV_ID' | 'PERSONATION' | 'UNAUTHORIZED_MUTATION';
  readonly triggeredPhrase: string;
  readonly reason: string;
}

export interface MockCallbackRecord {
  readonly id: string;
  readonly taskId: string;
  readonly requestedWindow: string;
  readonly notes?: string;
  readonly recordedAt: string;
  readonly isSynthetic: true;
}

export interface MockOptOutRecord {
  readonly id: string;
  readonly reason?: string;
  readonly optOutType: 'CALLS' | 'ALL_COMMUNICATIONS';
  readonly recordedAt: string;
  readonly isSynthetic: true;
}

export interface MockStaffHandoffRecord {
  readonly id: string;
  readonly taskId: string;
  readonly reason: string;
  readonly priority: 'NORMAL' | 'HIGH';
  readonly requestedAt: string;
  readonly isSynthetic: true;
}

export interface MockContactOutcomeRecord {
  readonly id: string;
  readonly taskId: string;
  readonly finalState: ConversationState;
  readonly durationSeconds: number;
  readonly turnsCount: number;
  readonly notes: string;
  readonly recordedAt: string;
  readonly isSynthetic: true;
}

export interface SessionMetrics {
  durationSeconds: number;
  totalTurns: number;
  interruptionsCount: number;
  silenceTimeoutsCount: number;
  unclearSpeechCount: number;
  detectedLanguages: LanguageTarget[];
  averageTurnLatencyMs: number;
  endReason: string;
}

export interface SessionConfig {
  maxDurationSeconds: number; // Hard ceiling e.g. 180s
  maxTurns: number;           // Hard turn ceiling e.g. 15 turns
  maxConsecutiveSilences: number; // e.g. 2 silences before graceful exit
  enableAudioRecording: false;    // Hardcoded false - recording forbidden by default
  defaultLanguage: LanguageTarget;
}
