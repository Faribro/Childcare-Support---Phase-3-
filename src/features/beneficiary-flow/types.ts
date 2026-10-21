import { DocType } from '../whatsapp-document-loop/types';
import { SupportedLanguage } from '../ai-multimodal/types';

/**
 * Proposed Policy Parameters (Pending Formal Owner Approval)
 *
 * NOTE: As required by Project Governance, all limits, thresholds, and cooldowns
 * below are PROPOSED estimates and must NOT be cited as established organizational policy.
 */
export const PROPOSED_POLICY_SPEC = {
  pilotGeography: 'Maharashtra (Pune & Thane districts - PROPOSED PENDING OWNER APPROVAL)',
  pilotCohort: 'Phase 3 Enrolled Caregivers (PROPOSED PENDING OWNER APPROVAL)',
  supportedLanguages: ['mr', 'hi', 'en', 'gu', 'bn'] as const,
  defaultLanguage: 'mr' as const, // Marathi default for Maharashtra pilot
  maxPhotoRetries: 3, // PROPOSED PENDING OWNER APPROVAL
  qualityAcceptanceThreshold: 70, // Score 0-100 (PROPOSED PENDING OWNER APPROVAL)
  reminderCooldownHours: 24, // PROPOSED PENDING OWNER APPROVAL
  maxRemindersBeforeEscalation: 2, // PROPOSED PENDING OWNER APPROVAL
} as const;

export type BeneficiarySessionState =
  | 'CONSENT_PENDING'
  | 'SIBLING_SELECTION'
  | 'LANGUAGE_SELECTION'
  | 'AWAITING_DOCUMENT'
  | 'DOCUMENT_EVALUATING'
  | 'REPLACEMENT_REQUESTED'
  | 'OPTED_OUT'
  | 'ESCALATED_TO_CSC'
  | 'COMPLETED';

export interface ReceivedDocumentInfo {
  readonly status: 'MISSING' | 'REQUESTED' | 'UPLOADED' | 'VERIFIED' | 'REJECTED';
  readonly uploadedAt?: string;
  readonly fileUri?: string;
  readonly mimeType?: string;
  readonly sha256Checksum?: string;
  readonly rejectionReason?: string;
  readonly qualityAssessmentPending?: boolean;
}

export interface UnresolvedMessageItem {
  readonly messageId: string;
  readonly type: 'text' | 'image' | 'audio';
  readonly receivedAt: string;
  readonly textBody?: string;
  readonly mediaId?: string;
  readonly note?: string;
}

export interface ReminderStateRecord {
  remindersSentCount: number;
  readonly maxRemindersAllowed: number;
  lastReminderSentAt?: string;
  nextAllowedReminderAt?: string;
}

export interface HumanHandoffRecord {
  isEscalated: boolean;
  escalatedAt?: string;
  reason?: string;
  caseworkerTicketId?: string;
  durableTaskCreated?: boolean; // False until inserted into durable csc_caseworker_tasks table
}

export interface CscDurableTask {
  readonly taskId: string;
  readonly ticketId: string;
  readonly beneficiaryPhoneHash: string;
  readonly childIdMasked: string;
  readonly submissionId: string;
  readonly reason: string;
  readonly notes: string;
  readonly priority: 'NORMAL' | 'HIGH' | 'URGENT';
  readonly status: 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED';
  readonly createdAt: string;
  readonly assignedWorkerId?: string;
}

export interface BeneficiarySession {
  readonly sessionId: string;
  readonly beneficiaryPhoneHash: string; // SHA-256 for secure lookup
  readonly beneficiaryPhoneMasked: string; // Display only
  readonly submissionId: string;
  readonly childIdMasked: string; // e.g. "CH-***-001"
  
  // Consent & Opt-Out Controls
  consentProvided: boolean;
  consentRecordedAt?: string;
  contactPermission: boolean;
  optedOut: boolean;
  optedOutAt?: string;
  optOutReason?: 'STOP' | 'WRONG_NUMBER' | 'USER_REQUEST';

  // Sibling / Multi-Child Disambiguation
  selectedChildId?: string;
  readonly associatedChildIds: readonly string[];

  // Language Preferences
  preferredLanguage: SupportedLanguage;
  languageSelectionConfirmed?: boolean;

  // State & Document Progress
  state: BeneficiarySessionState;
  readonly targetDocType: DocType;
  readonly requestedDocuments?: readonly DocType[];
  receivedDocuments?: Partial<Record<DocType, ReceivedDocumentInfo>>;
  qualityAssessmentPending?: boolean;

  // Attempt Tracking & Safety Bounds
  retryCount: number;
  readonly maxRetries: number;
  attemptsPerDoc?: Partial<Record<DocType, number>>;
  totalAttempts?: number;

  // Interactions & History
  lastInteractionAt: string;
  lastReminderSentAt?: string;
  replacementGuidanceHistory: string[];
  unexpectedExplanations: string[];
  unresolvedMessages?: UnresolvedMessageItem[];

  // Reminder State & Limits
  reminderState?: ReminderStateRecord;

  // Human Handoff & Escalation
  isEscalated: boolean;
  escalationReason?: string;
  cscHandoffNotes?: string;
  humanHandoff?: HumanHandoffRecord;
  durableTaskCreationPending?: boolean;
}

export interface InboundBeneficiaryMessage {
  readonly fromPhone: string;
  readonly messageId: string;
  readonly timestamp: string;
  readonly type: 'text' | 'image' | 'audio';
  readonly textBody?: string;
  readonly mediaBuffer?: Buffer;
  readonly mimeType?: string;
}

export interface OutboundBeneficiaryResponse {
  readonly recipientPhoneMasked: string;
  readonly language: SupportedLanguage;
  readonly textMessage: string;
  readonly isVoiceNote?: boolean;
  readonly audioBuffer?: Buffer;
  readonly isDispatched: false; // Drafted message intent; live dispatch blocked by ALLOW_LIVE_WHATSAPP_SEND=false
  readonly nextExpectedAction:
    | 'AWAIT_CONSENT'
    | 'AWAIT_CHILD_SELECTION'
    | 'AWAIT_LANGUAGE'
    | 'AWAIT_PHOTO'
    | 'AWAIT_REPLACEMENT'
    | 'CSC_CONTACT'
    | 'FINISHED'
    | 'OPTED_OUT';
}
