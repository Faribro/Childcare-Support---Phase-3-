import {
  CallerSecurityContext,
  ConfirmationReceipt,
  DocType,
  InboundMediaUploadEvent,
  LeadershipStatusSummary,
  OutboundDocumentRequest,
  SubmissionEntity,
  SubmissionState,
} from './types';
import { MissingDocumentDetector } from './missing-document-detector';
import { WhatsAppRequestBuilder } from './whatsapp-request-builder';
import { MediaValidator } from './media-validator';
import { TigrisStorageAdapter } from './tigris-storage-adapter';
import { InboundEventAdapter } from './inbound-event-adapter';

export class WhatsAppDocumentLoopService {
  private readonly submissions: Map<string, SubmissionEntity>;
  private readonly detector: MissingDocumentDetector;
  private readonly requestBuilder: WhatsAppRequestBuilder;
  private readonly mediaValidator: MediaValidator;
  private readonly storageAdapter: TigrisStorageAdapter;
  private readonly inboundAdapter: InboundEventAdapter;

  constructor(
    detector: MissingDocumentDetector = new MissingDocumentDetector(),
    requestBuilder: WhatsAppRequestBuilder = new WhatsAppRequestBuilder(detector),
    mediaValidator: MediaValidator = new MediaValidator(),
    storageAdapter: TigrisStorageAdapter = new TigrisStorageAdapter(),
    inboundAdapter: InboundEventAdapter = new InboundEventAdapter()
  ) {
    this.submissions = new Map();
    this.detector = detector;
    this.requestBuilder = requestBuilder;
    this.mediaValidator = mediaValidator;
    this.storageAdapter = storageAdapter;
    this.inboundAdapter = inboundAdapter;
  }

  public registerSubmission(submission: SubmissionEntity): void {
    this.submissions.set(submission.id, submission);
  }

  public getSubmission(submissionId: string): SubmissionEntity | undefined {
    return this.submissions.get(submissionId);
  }

  /**
   * Step 1 & 2: Process new submission, detect missing documents,
   * transition state, and prepare outbound WhatsApp request (do not send live).
   */
  public processNewSubmission(submission: SubmissionEntity): {
    updatedSubmission: SubmissionEntity;
    missingDocuments: DocType[];
    outboundRequest?: OutboundDocumentRequest;
  } {
    const missing = this.detector.detectMissingDocuments(submission);
    const now = new Date().toISOString();

    if (missing.length === 0) {
      const updated: SubmissionEntity = {
        ...submission,
        submissionStatus: 'DOCUMENTS_VERIFIED',
        updatedAt: now,
      };
      this.submissions.set(submission.id, updated);
      return { updatedSubmission: updated, missingDocuments: [] };
    }

    // Missing documents detected -> transition to PENDING_DOCUMENTS
    const updatedDocs = { ...submission.documents };
    for (const docType of missing) {
      if (updatedDocs[docType]) {
        updatedDocs[docType] = {
          ...updatedDocs[docType],
          status: 'REQUESTED',
        };
      }
    }

    const updated: SubmissionEntity = {
      ...submission,
      submissionStatus: 'PENDING_DOCUMENTS',
      documents: updatedDocs,
      updatedAt: now,
    };
    this.submissions.set(submission.id, updated);

    // Prepare outbound WhatsApp request with idempotency key (do not send live)
    const outboundRequest = this.requestBuilder.buildDocumentRequest(updated, missing);

    return {
      updatedSubmission: updated,
      missingDocuments: missing,
      outboundRequest,
    };
  }

  /**
   * Step 3: Handle inbound document upload via WhatsApp.
   * Enforces signature verification, deduplication, authorization, media validation,
   * Tigris storage, database linkage, and confirmation.
   */
  public async handleInboundDocumentUpload(
    event: InboundMediaUploadEvent,
    rawPayloadForSignature?: string | Buffer
  ): Promise<ConfirmationReceipt> {
    const now = new Date().toISOString();

    // 1. Signature Verification (if raw payload provided)
    if (rawPayloadForSignature && event.signatureHeader) {
      const sigResult = this.inboundAdapter.verifySignature(rawPayloadForSignature, event.signatureHeader);
      if (!sigResult.valid) {
        return {
          success: false,
          submissionId: event.submissionId,
          docType: event.docType,
          submissionState: 'PENDING_DOCUMENTS',
          allDocumentsVerified: false,
          confirmationMessage: 'Security signature mismatch.',
          status: 'REJECTED',
          errorReason: sigResult.error,
        };
      }
    }

    // 2. Deduplication check
    const idempotencyKey = `evt_${event.eventId}_${event.submissionId}_${event.docType}`;
    if (this.inboundAdapter.isDuplicate(event.eventId, idempotencyKey)) {
      const existingSub = this.submissions.get(event.submissionId);
      const isAllVerified = existingSub ? this.detector.detectMissingDocuments(existingSub).length === 0 : false;
      return {
        success: true,
        submissionId: event.submissionId,
        docType: event.docType,
        storageUri: existingSub?.documents[event.docType]?.fileUri,
        submissionState: existingSub?.submissionStatus || 'PENDING_DOCUMENTS',
        allDocumentsVerified: isAllVerified,
        confirmationMessage: 'Duplicate event received: Document has already been securely processed.',
        status: 'DUPLICATE_IGNORED',
      };
    }

    // 3. Locate target submission
    const submission = this.submissions.get(event.submissionId);
    if (!submission) {
      return {
        success: false,
        submissionId: event.submissionId,
        docType: event.docType,
        submissionState: 'PENDING_DOCUMENTS',
        allDocumentsVerified: false,
        confirmationMessage: 'Submission record not found.',
        status: 'REJECTED',
        errorReason: `Target submission ID "${event.submissionId}" does not exist.`,
      };
    }

    // 4. Sender Authorization Check
    const authResult = this.inboundAdapter.verifySenderAuthorization(event, submission);
    if (!authResult.authorized) {
      return {
        success: false,
        submissionId: event.submissionId,
        docType: event.docType,
        submissionState: submission.submissionStatus,
        allDocumentsVerified: false,
        confirmationMessage: 'Unauthorized sender.',
        status: 'REJECTED',
        errorReason: authResult.reason,
      };
    }

    // 5. Media Validation (MIME, size <= 15MB, SHA-256 checksum)
    const mediaResult = this.mediaValidator.validateMedia(
      event.mimeType,
      event.byteSize,
      event.sha256Checksum,
      event.rawBytes
    );
    if (!mediaResult.valid) {
      return {
        success: false,
        submissionId: event.submissionId,
        docType: event.docType,
        submissionState: submission.submissionStatus,
        allDocumentsVerified: false,
        confirmationMessage: 'Media validation failed.',
        status: 'REJECTED',
        errorReason: mediaResult.error,
      };
    }

    // 6. Private Tigris / S3 Storage Upload
    const storageResult = await this.storageAdapter.uploadDocument(
      submission.id,
      event.docType,
      event.mimeType,
      event.byteSize,
      event.sha256Checksum,
      event.rawBytes
    );

    if (!storageResult.success || !storageResult.storageUri) {
      return {
        success: false,
        submissionId: event.submissionId,
        docType: event.docType,
        submissionState: submission.submissionStatus,
        allDocumentsVerified: false,
        confirmationMessage: 'Durable storage failed.',
        status: 'STORAGE_FAILED',
        errorReason: storageResult.error || 'Failed to persist object to Tigris storage.',
      };
    }

    // 7. Database Linkage & State Transition (ONLY after durable storage succeeds)
    const updatedDocs = {
      ...submission.documents,
      [event.docType]: {
        docType: event.docType,
        status: 'VERIFIED' as const,
        fileUri: storageResult.storageUri,
        byteSize: event.byteSize,
        mimeType: event.mimeType,
        sha256Checksum: event.sha256Checksum,
        uploadedAt: now,
        verifiedAt: now,
      },
    };

    const remainingMissing = this.detector.detectMissingDocuments({
      ...submission,
      documents: updatedDocs,
    });

    const isAllComplete = remainingMissing.length === 0;
    const nextSubmissionState: SubmissionState = isAllComplete ? 'DOCUMENTS_VERIFIED' : 'PENDING_DOCUMENTS';

    const updatedSubmission: SubmissionEntity = {
      ...submission,
      submissionStatus: nextSubmissionState,
      documents: updatedDocs,
      updatedAt: now,
    };

    this.submissions.set(submission.id, updatedSubmission);

    // Mark event processed for deduplication
    this.inboundAdapter.markProcessed(event.eventId, idempotencyKey);

    // 8. Confirm Receipt
    const docLabel = this.detector.getDocumentLabel(event.docType);
    const confirmationMessage = isAllComplete
      ? `✅ *All Documents Verified*\n\nYour *${docLabel}* has been securely persisted. All required documentation for \`${submission.remoteSubmissionId}\` is now complete and ready for final supervisor approval.`
      : `✅ *Document Received*\n\nYour *${docLabel}* has been verified and securely persisted.\n\n*Remaining documents required:* ${remainingMissing
          .map((d) => this.detector.getDocumentLabel(d))
          .join(', ')}.`;

    return {
      success: true,
      submissionId: event.submissionId,
      docType: event.docType,
      storageUri: storageResult.storageUri,
      submissionState: nextSubmissionState,
      allDocumentsVerified: isAllComplete,
      confirmationMessage,
      status: 'PROCESSED',
    };
  }

  /**
   * Step 4: Leadership Document Status Query.
   * Returns privacy-safe surveillance document status without exposing raw PII or clinical details.
   */
  public queryLeadershipStatus(
    submissionId: string,
    caller: CallerSecurityContext
  ): LeadershipStatusSummary {
    const submission = this.submissions.get(submissionId);
    if (!submission) {
      throw new Error(`Submission "${submissionId}" not found.`);
    }

    // Authorization check
    const isNational = caller.permittedStates.includes('*');
    if (!isNational && !caller.permittedStates.includes(submission.state)) {
      throw new Error(
        `Access Denied: Caller with scope [${caller.permittedStates.join(
          ', '
        )}] is forbidden from inspecting records for state '${submission.state}'.`
      );
    }

    const missing = this.detector.detectMissingDocuments(submission);
    const isComplete = missing.length === 0;

    let verifiedCount = 0;
    const documentStatusMap: Record<
      DocType,
      {
        status: import('./types').DocumentStatus;
        isVerified: boolean;
        checksumMasked?: string;
        uploadedAt?: string;
      }
    > = {} as any;

    for (const [docKey, docRecord] of Object.entries(submission.documents)) {
      const docType = docKey as DocType;
      const isVerified = docRecord.status === 'VERIFIED';
      if (isVerified) verifiedCount++;

      const checksumMasked = docRecord.sha256Checksum
        ? `${docRecord.sha256Checksum.slice(0, 8)}...${docRecord.sha256Checksum.slice(-4)}`
        : undefined;

      documentStatusMap[docType] = {
        status: docRecord.status,
        isVerified,
        checksumMasked,
        uploadedAt: docRecord.uploadedAt,
      };
    }

    return {
      submissionId: submission.id,
      remoteSubmissionId: submission.remoteSubmissionId,
      state: submission.state,
      district: submission.district,
      overallStatus: submission.submissionStatus,
      isComplete,
      missingDocumentCount: missing.length,
      verifiedDocumentCount: verifiedCount,
      documents: documentStatusMap,
      lastUpdatedAt: submission.updatedAt,
    };
  }
}
