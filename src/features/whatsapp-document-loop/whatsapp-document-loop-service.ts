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
import { IDurableDocumentLoopStore, MemoryDocumentLoopStore } from './persistence';

/**
 * Service orchestrating the narrow live-ready WhatsApp document loop.
 *
 * DOMAIN ROLE: Backend Media & Document Storage Worker
 *
 * Guarantees:
 * 1. Storage != Verification: Storing valid image/PDF bytes sets status to UPLOADED, not VERIFIED.
 * 2. Only an authorized verifier can transition a document to VERIFIED.
 * 3. Atomic rollback: If Tigris storage succeeds but database linkage fails, storage is automatically cleaned up.
 * 4. Durable persistence: State survives process restarts via IDurableDocumentLoopStore.
 */
export class WhatsAppDocumentLoopService {
  private readonly store: IDurableDocumentLoopStore;
  private readonly detector: MissingDocumentDetector;
  private readonly requestBuilder: WhatsAppRequestBuilder;
  private readonly mediaValidator: MediaValidator;
  private readonly storageAdapter: TigrisStorageAdapter;
  private readonly inboundAdapter: InboundEventAdapter;

  constructor(
    store: IDurableDocumentLoopStore = new MemoryDocumentLoopStore(),
    detector: MissingDocumentDetector = new MissingDocumentDetector(),
    requestBuilder: WhatsAppRequestBuilder = new WhatsAppRequestBuilder(detector),
    mediaValidator: MediaValidator = new MediaValidator(),
    storageAdapter: TigrisStorageAdapter = new TigrisStorageAdapter(),
    inboundAdapter?: InboundEventAdapter
  ) {
    this.store = store;
    this.detector = detector;
    this.requestBuilder = requestBuilder;
    this.mediaValidator = mediaValidator;
    this.storageAdapter = storageAdapter;
    this.inboundAdapter = inboundAdapter || new InboundEventAdapter(undefined, store);
  }

  public registerSubmission(submission: SubmissionEntity): void {
    this.store.saveSubmission(submission);
  }

  public getSubmission(submissionId: string): SubmissionEntity | undefined {
    return this.store.getSubmission(submissionId);
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
      // Check if all are actually verified vs only uploaded
      let allVerified = true;
      for (const doc of Object.values(submission.documents)) {
        if (doc && !doc.isVerified && doc.status !== 'MISSING') {
          allVerified = false;
          break;
        }
      }

      const nextStatus: SubmissionState = allVerified ? 'DOCUMENTS_VERIFIED' : 'DOCUMENTS_RECEIVED';
      const updated: SubmissionEntity = {
        ...submission,
        submissionStatus: nextStatus,
        updatedAt: now,
      };
      this.store.saveSubmission(updated);
      return { updatedSubmission: updated, missingDocuments: [] };
    }

    // Missing documents detected -> transition to PENDING_DOCUMENTS
    const updatedDocs = { ...submission.documents };
    for (const docType of missing) {
      if (updatedDocs[docType]) {
        updatedDocs[docType] = {
          ...updatedDocs[docType],
          status: 'REQUESTED',
          isVerified: false,
        };
      }
    }

    const updated: SubmissionEntity = {
      ...submission,
      submissionStatus: 'PENDING_DOCUMENTS',
      documents: updatedDocs,
      updatedAt: now,
    };
    this.store.saveSubmission(updated);

    // Prepare outbound WhatsApp request with idempotency key (do not send live)
    const outboundRequest = this.requestBuilder.buildDocumentRequest(updated, missing);
    this.store.saveOutboundRequest(outboundRequest);

    return {
      updatedSubmission: updated,
      missingDocuments: missing,
      outboundRequest,
    };
  }

  /**
   * Step 3: Handle inbound document upload via WhatsApp.
   * Enforces signature verification, deduplication, authorization, media validation (including magic bytes),
   * Tigris storage, database linkage with cleanup on failure, and confirmation.
   *
   * Note: Successful storage places document in 'UPLOADED' status (pending supervisor verification).
   * It DOES NOT mark the document 'VERIFIED'.
   */
  public async handleInboundDocumentUpload(
    event: InboundMediaUploadEvent,
    rawPayloadForSignature?: string | Buffer,
    simulateDbFailure?: boolean
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
          isUploaded: false,
          allDocumentsUploaded: false,
          allDocumentsVerified: false,
          confirmationMessage: 'Security signature mismatch.',
          status: 'REJECTED',
          errorReason: sigResult.error,
        };
      }
    }

    // 2. Deduplication check backed by durable store
    const idempotencyKey = `evt_${event.eventId}_${event.submissionId}_${event.docType}`;
    if (this.inboundAdapter.isDuplicate(event.eventId, idempotencyKey)) {
      const existingSub = this.store.getSubmission(event.submissionId);
      const isAllUploaded = existingSub ? this.detector.detectMissingDocuments(existingSub).length === 0 : false;
      const isAllVerified = existingSub
        ? Object.values(existingSub.documents).every((d) => d && d.isVerified)
        : false;

      return {
        success: true,
        submissionId: event.submissionId,
        docType: event.docType,
        storageUri: existingSub?.documents[event.docType]?.fileUri,
        submissionState: existingSub?.submissionStatus || 'PENDING_DOCUMENTS',
        isUploaded: true,
        allDocumentsUploaded: isAllUploaded,
        allDocumentsVerified: isAllVerified,
        confirmationMessage: 'Duplicate event received: Document has already been securely processed.',
        status: 'DUPLICATE_IGNORED',
      };
    }

    // 3. Locate target submission
    const submission = this.store.getSubmission(event.submissionId);
    if (!submission) {
      return {
        success: false,
        submissionId: event.submissionId,
        docType: event.docType,
        submissionState: 'PENDING_DOCUMENTS',
        isUploaded: false,
        allDocumentsUploaded: false,
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
        isUploaded: false,
        allDocumentsUploaded: false,
        allDocumentsVerified: false,
        confirmationMessage: 'Unauthorized sender.',
        status: 'REJECTED',
        errorReason: authResult.reason,
      };
    }

    // 5. Media Validation (MIME, channel size limit, SHA-256 checksum, magic bytes content check)
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
        isUploaded: false,
        allDocumentsUploaded: false,
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
        isUploaded: false,
        allDocumentsUploaded: false,
        allDocumentsVerified: false,
        confirmationMessage: 'Durable storage failed.',
        status: 'STORAGE_FAILED',
        errorReason: storageResult.error || 'Failed to persist object to Tigris storage.',
      };
    }

    // 7. Database Linkage & State Transition (With cleanup compensation on failure)
    try {
      if (simulateDbFailure) {
        throw new Error('Simulated database connection/constraint failure during document linkage.');
      }

      // Mark document as UPLOADED (pending verification by supervisor)
      const updatedDocs = {
        ...submission.documents,
        [event.docType]: {
          docType: event.docType,
          status: 'UPLOADED' as const,
          isVerified: false, // Uploaded != Verified
          fileUri: storageResult.storageUri,
          byteSize: event.byteSize,
          mimeType: event.mimeType,
          sha256Checksum: event.sha256Checksum,
          uploadedAt: now,
        },
      };

      const remainingMissing = this.detector.detectMissingDocuments({
        ...submission,
        documents: updatedDocs,
      });

      const isAllUploaded = remainingMissing.length === 0;
      // When all documents uploaded, submission becomes DOCUMENTS_RECEIVED (not DOCUMENTS_VERIFIED)
      const nextSubmissionState: SubmissionState = isAllUploaded
        ? 'DOCUMENTS_RECEIVED'
        : 'PENDING_DOCUMENTS';

      const updatedSubmission: SubmissionEntity = {
        ...submission,
        submissionStatus: nextSubmissionState,
        documents: updatedDocs,
        updatedAt: now,
      };

      this.store.saveSubmission(updatedSubmission);

      // Mark event processed for deduplication
      this.inboundAdapter.markProcessed(event.eventId, idempotencyKey);

      // 8. Confirm Receipt to beneficiary
      const docLabel = this.detector.getDocumentLabel(event.docType);
      const confirmationMessage = isAllUploaded
        ? `✅ *All Documents Received*\n\nYour *${docLabel}* has been securely stored. All requested documents for \`${submission.remoteSubmissionId}\` have been received and are now awaiting supervisor review.`
        : `✅ *Document Received*\n\nYour *${docLabel}* has been received and securely stored.\n\n*Remaining documents required:* ${remainingMissing
            .map((d) => this.detector.getDocumentLabel(d))
            .join(', ')}.`;

      return {
        success: true,
        submissionId: event.submissionId,
        docType: event.docType,
        storageUri: storageResult.storageUri,
        submissionState: nextSubmissionState,
        isUploaded: true,
        allDocumentsUploaded: isAllUploaded,
        allDocumentsVerified: false, // Only verification step sets this true
        confirmationMessage,
        status: 'PROCESSED',
      };
    } catch (linkageErr: any) {
      // Storage Cleanup Compensation: If DB linkage fails, delete uploaded file from Tigris
      await this.storageAdapter.deleteDocument(storageResult.storageUri);

      return {
        success: false,
        submissionId: event.submissionId,
        docType: event.docType,
        submissionState: submission.submissionStatus,
        isUploaded: false,
        allDocumentsUploaded: false,
        allDocumentsVerified: false,
        confirmationMessage: 'Database linkage failed: storage rolled back.',
        status: 'LINKAGE_FAILED',
        errorReason: linkageErr.message || 'Database linkage failed.',
      };
    }
  }

  /**
   * Explicit Evaluator / Supervisor Verification Step.
   * Only an authorized supervisor or lead can transition a document from UPLOADED to VERIFIED.
   */
  public verifyDocument(
    submissionId: string,
    docType: DocType,
    verifier: CallerSecurityContext
  ): {
    submission: SubmissionEntity;
    documentVerified: boolean;
    allDocumentsVerified: boolean;
  } {
    const submission = this.store.getSubmission(submissionId);
    if (!submission) {
      throw new Error(`Submission "${submissionId}" not found.`);
    }

    // Role check: Only SUPERVISOR, STATE_LEAD, LEADERSHIP, or ADMIN can verify
    const allowedRoles = ['SUPERVISOR', 'STATE_LEAD', 'LEADERSHIP', 'ADMIN'];
    if (!allowedRoles.includes(verifier.role)) {
      throw new Error(`Forbidden: Role '${verifier.role}' is not authorized to verify documents.`);
    }

    // Geographic check
    const isNational = verifier.permittedStates.includes('*');
    if (!isNational && !verifier.permittedStates.includes(submission.state)) {
      throw new Error(
        `Forbidden: Verifier with scope [${verifier.permittedStates.join(
          ', '
        )}] cannot verify records for state '${submission.state}'.`
      );
    }

    const doc = submission.documents[docType];
    if (!doc || doc.status !== 'UPLOADED') {
      throw new Error(
        `Cannot verify document "${docType}": current status is '${doc?.status || 'MISSING'}', expected 'UPLOADED'.`
      );
    }

    const now = new Date().toISOString();
    const updatedDocs = {
      ...submission.documents,
      [docType]: {
        ...doc,
        status: 'VERIFIED' as const,
        isVerified: true,
        verifiedAt: now,
        verifiedBy: verifier.userId,
      },
    };

    // Check if all core mandatory documents are now explicitly VERIFIED
    const required: DocType[] = ['passbookPhoto', 'aadhaarCardPhoto', 'childPhoto', 'caregiverSignature'];
    if (submission.requiresFeeReceipt) required.push('feeReceiptPhoto');

    const allVerified = required.every(
      (dt) => updatedDocs[dt] && updatedDocs[dt].isVerified && updatedDocs[dt].status === 'VERIFIED'
    );

    const nextState: SubmissionState = allVerified ? 'DOCUMENTS_VERIFIED' : submission.submissionStatus;

    const updatedSubmission: SubmissionEntity = {
      ...submission,
      submissionStatus: nextState,
      documents: updatedDocs,
      updatedAt: now,
    };

    this.store.saveSubmission(updatedSubmission);

    return {
      submission: updatedSubmission,
      documentVerified: true,
      allDocumentsVerified: allVerified,
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
    const submission = this.store.getSubmission(submissionId);
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

    let uploadedCount = 0;
    let verifiedCount = 0;
    const documentStatusMap: Record<
      DocType,
      {
        status: import('./types').DocumentStatus;
        isVerified: boolean;
        checksumMasked?: string;
        uploadedAt?: string;
        verifiedAt?: string;
      }
    > = {} as any;

    for (const [docKey, docRecord] of Object.entries(submission.documents)) {
      const docType = docKey as DocType;
      const isVerified = Boolean(docRecord.isVerified || docRecord.status === 'VERIFIED');
      const isUploaded = docRecord.status === 'UPLOADED' || docRecord.status === 'VERIFIED';

      if (isUploaded) uploadedCount++;
      if (isVerified) verifiedCount++;

      const checksumMasked = docRecord.sha256Checksum
        ? `${docRecord.sha256Checksum.slice(0, 8)}...${docRecord.sha256Checksum.slice(-4)}`
        : undefined;

      documentStatusMap[docType] = {
        status: docRecord.status,
        isVerified,
        checksumMasked,
        uploadedAt: docRecord.uploadedAt,
        verifiedAt: docRecord.verifiedAt,
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
      uploadedDocumentCount: uploadedCount,
      verifiedDocumentCount: verifiedCount,
      documents: documentStatusMap,
      lastUpdatedAt: submission.updatedAt,
    };
  }
}
