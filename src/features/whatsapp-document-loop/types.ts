/**
 * WhatsApp Document Loop - Domain Types & State Machine
 *
 * DOMAIN ROLE: Backend Media & Document Storage Worker
 * Scope:
 * - Inbound event ingestion, signature verification & deduplication
 * - Submission & document state transitions (separating UPLOADED from VERIFIED)
 * - Missing-document detection & outbound request preparation
 * - Media validation (MIME, size bounds, magic bytes), Tigris upload & database linkage
 * - Confirmation receipt & privacy-preserving leadership status query
 */

export type DocType =
  | 'passbookPhoto'
  | 'aadhaarCardPhoto'
  | 'childPhoto'
  | 'feeReceiptPhoto'
  | 'marksheetPhoto'
  | 'caregiverSignature';

export type DocumentStatus =
  | 'MISSING'
  | 'REQUESTED'
  | 'UPLOADED'
  | 'VERIFIED'
  | 'REJECTED';

export interface CallerSecurityContext {
  readonly userId: string;
  readonly role: 'LEADERSHIP' | 'STATE_LEAD' | 'SUPERVISOR' | 'ADMIN';
  readonly permittedStates: readonly string[];
}

export type SubmissionState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_DOCUMENTS'
  | 'DOCUMENTS_RECEIVED'
  | 'DOCUMENTS_VERIFIED'
  | 'APPROVED'
  | 'FLAGGED';

export interface DocumentRecord {
  readonly docType: DocType;
  readonly status: DocumentStatus;
  readonly isVerified: boolean;
  readonly fileUri?: string;
  readonly byteSize?: number;
  readonly mimeType?: string;
  readonly sha256Checksum?: string;
  readonly uploadedAt?: string;
  readonly verifiedAt?: string;
  readonly verifiedBy?: string;
}

export interface SubmissionEntity {
  readonly id: string;
  readonly remoteSubmissionId: string;
  readonly state: string; // Geographic state e.g. 'Maharashtra'
  readonly district: string;
  readonly beneficiaryPhone: string;
  readonly beneficiaryPhoneHash: string;
  readonly caseworkerUserId: string;
  readonly submissionStatus: SubmissionState;
  readonly documents: Record<DocType, DocumentRecord>;
  readonly requiresFeeReceipt: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InboundMediaUploadEvent {
  readonly eventId: string;
  readonly fromPhone: string;
  readonly submissionId: string;
  readonly docType: DocType;
  readonly mediaId: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sha256Checksum: string;
  readonly rawBytes?: Buffer;
  readonly signatureHeader?: string;
  readonly timestamp: string;
}

export interface OutboundDocumentRequest {
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly submissionId: string;
  readonly recipientPhoneRef: string; // trusted private reference (e.g. SHA-256 hash or internal ID)
  readonly recipientPhoneMasked: string; // display-only masked string (e.g. "+91 ******3210")
  readonly missingDocTypes: readonly DocType[];
  readonly messageBody: string;
  readonly status: 'PREPARED' | 'SENT' | 'FAILED';
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface TigrisStorageResult {
  readonly success: boolean;
  readonly storageUri?: string;
  readonly bucket?: string;
  readonly key?: string;
  readonly byteSize?: number;
  readonly sha256Checksum?: string;
  readonly error?: string;
}

export interface ConfirmationReceipt {
  readonly success: boolean;
  readonly submissionId: string;
  readonly docType: DocType;
  readonly storageUri?: string;
  readonly submissionState: SubmissionState;
  readonly isUploaded: boolean;
  readonly allDocumentsUploaded: boolean;
  readonly allDocumentsVerified: boolean;
  readonly confirmationMessage: string;
  readonly status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'REJECTED' | 'STORAGE_FAILED' | 'LINKAGE_FAILED';
  readonly errorReason?: string;
}

export interface LeadershipStatusSummary {
  readonly submissionId: string;
  readonly remoteSubmissionId: string;
  readonly state: string;
  readonly district: string;
  readonly overallStatus: SubmissionState;
  readonly isComplete: boolean;
  readonly missingDocumentCount: number;
  readonly uploadedDocumentCount: number;
  readonly verifiedDocumentCount: number;
  readonly documents: Record<
    DocType,
    {
      readonly status: DocumentStatus;
      readonly isVerified: boolean;
      readonly checksumMasked?: string;
      readonly uploadedAt?: string;
      readonly verifiedAt?: string;
    }
  >;
  readonly lastUpdatedAt: string;
}
