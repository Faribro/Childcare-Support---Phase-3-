import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import {
  WhatsAppDocumentLoopService,
  SubmissionEntity,
  InboundMediaUploadEvent,
  DocType,
} from '../index';
import { TigrisStorageAdapter } from '../tigris-storage-adapter';
import { InboundEventAdapter } from '../inbound-event-adapter';
import { MediaValidator, MAX_DOCUMENT_BYTE_SIZE } from '../media-validator';
import { MissingDocumentDetector } from '../missing-document-detector';
import { WhatsAppRequestBuilder } from '../whatsapp-request-builder';

describe('Thread A: WhatsApp Document Loop (Live-Ready Narrow Slice)', () => {
  const APP_SECRET = 'meta_test_webhook_secret_key_12345';

  function createTestSubmission(overrides?: Partial<SubmissionEntity>): SubmissionEntity {
    const id = 'sub_test_001';
    const now = new Date().toISOString();

    const emptyDocs: Record<DocType, { docType: DocType; status: import('../types').DocumentStatus }> = {
      passbookPhoto: { docType: 'passbookPhoto', status: 'MISSING' },
      aadhaarCardPhoto: { docType: 'aadhaarCardPhoto', status: 'MISSING' },
      childPhoto: { docType: 'childPhoto', status: 'MISSING' },
      caregiverSignature: { docType: 'caregiverSignature', status: 'MISSING' },
      feeReceiptPhoto: { docType: 'feeReceiptPhoto', status: 'MISSING' },
      marksheetPhoto: { docType: 'marksheetPhoto', status: 'MISSING' },
    };

    return {
      id,
      remoteSubmissionId: 'BEN-2026-MH-0042',
      state: 'Maharashtra',
      district: 'Pune',
      beneficiaryPhone: '+919876543210',
      beneficiaryPhoneHash: crypto.createHash('sha256').update('+919876543210').digest('hex'),
      caseworkerUserId: 'cw_pune_01',
      submissionStatus: 'SUBMITTED',
      documents: emptyDocs,
      requiresFeeReceipt: false,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function createSignature(payload: string, secret: string = APP_SECRET): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  // ==========================================================================
  // 1. NEW SUBMISSION & MISSING-DOCUMENT DETECTION
  // ==========================================================================
  describe('1. Missing-Document Detection & Outbound Request Preparation', () => {
    it('detects all 4 core mandatory documents when none are uploaded', () => {
      const service = new WhatsAppDocumentLoopService();
      const submission = createTestSubmission();

      const result = service.processNewSubmission(submission);

      expect(result.updatedSubmission.submissionStatus).toBe('PENDING_DOCUMENTS');
      expect(result.missingDocuments).toHaveLength(4);
      expect(result.missingDocuments).toEqual([
        'passbookPhoto',
        'aadhaarCardPhoto',
        'childPhoto',
        'caregiverSignature',
      ]);

      // Verifies outbound request is prepared with idempotency key, NOT sent live
      expect(result.outboundRequest).toBeDefined();
      expect(result.outboundRequest?.status).toBe('PREPARED');
      expect(result.outboundRequest?.idempotencyKey).toContain('req_doc_sub_test');
      expect(result.outboundRequest?.recipientPhoneMasked).toBe('+91 ******3210');
      expect(result.outboundRequest?.messageBody).toContain('Alliance Child Support: Document Verification');
      expect(result.outboundRequest?.messageBody).toContain('Bank Passbook Front Page');
    });

    it('requires feeReceiptPhoto when conditional education support is flagged', () => {
      const service = new WhatsAppDocumentLoopService();
      const submission = createTestSubmission({ requiresFeeReceipt: true });

      const result = service.processNewSubmission(submission);

      expect(result.missingDocuments).toHaveLength(5);
      expect(result.missingDocuments).toContain('feeReceiptPhoto');
      expect(result.outboundRequest?.messageBody).toContain('School Fee Receipt');
    });

    it('immediately marks submission DOCUMENTS_VERIFIED if all documents are already present', () => {
      const service = new WhatsAppDocumentLoopService();
      const verifiedDocs: Record<DocType, any> = {
        passbookPhoto: { docType: 'passbookPhoto', status: 'VERIFIED', fileUri: 'asset://b/1' },
        aadhaarCardPhoto: { docType: 'aadhaarCardPhoto', status: 'VERIFIED', fileUri: 'asset://b/2' },
        childPhoto: { docType: 'childPhoto', status: 'VERIFIED', fileUri: 'asset://b/3' },
        caregiverSignature: { docType: 'caregiverSignature', status: 'VERIFIED', fileUri: 'asset://b/4' },
        feeReceiptPhoto: { docType: 'feeReceiptPhoto', status: 'MISSING' },
        marksheetPhoto: { docType: 'marksheetPhoto', status: 'MISSING' },
      };

      const submission = createTestSubmission({
        documents: verifiedDocs,
        requiresFeeReceipt: false,
      });

      const result = service.processNewSubmission(submission);

      expect(result.updatedSubmission.submissionStatus).toBe('DOCUMENTS_VERIFIED');
      expect(result.missingDocuments).toHaveLength(0);
      expect(result.outboundRequest).toBeUndefined();
    });
  });

  // ==========================================================================
  // 2. INBOUND MEDIA VALIDATION
  // ==========================================================================
  describe('2. Inbound Media Validation (MIME, Size, Checksum)', () => {
    const validator = new MediaValidator();

    it('accepts valid PDF, JPEG, and PNG within size ceiling and matching checksum', () => {
      const dummyBytes = Buffer.from('PDF-1.4 sample content');
      const checksum = crypto.createHash('sha256').update(dummyBytes).digest('hex');

      const pdfResult = validator.validateMedia('application/pdf', dummyBytes.length, checksum, dummyBytes);
      expect(pdfResult.valid).toBe(true);

      const jpegResult = validator.validateMedia('image/jpeg', dummyBytes.length, checksum, dummyBytes);
      expect(jpegResult.valid).toBe(true);

      const pngResult = validator.validateMedia('image/png', dummyBytes.length, checksum, dummyBytes);
      expect(pngResult.valid).toBe(true);
    });

    it('rejects unsupported and executable MIME types', () => {
      const bytes = Buffer.from('MZ executable code');
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');

      const exeResult = validator.validateMedia('application/x-msdownload', bytes.length, checksum, bytes);
      expect(exeResult.valid).toBe(false);
      expect(exeResult.code).toBe('INVALID_MIME');

      const jsResult = validator.validateMedia('application/javascript', bytes.length, checksum, bytes);
      expect(jsResult.valid).toBe(false);
      expect(jsResult.code).toBe('INVALID_MIME');
    });

    it('rejects empty (0 byte) files', () => {
      const emptyChecksum = crypto.createHash('sha256').update('').digest('hex');
      const result = validator.validateMedia('application/pdf', 0, emptyChecksum);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EMPTY_FILE');
    });

    it('enforces 15 MB database size ceiling', () => {
      const dummyChecksum = 'a'.repeat(64);
      const oversized = MAX_DOCUMENT_BYTE_SIZE + 1;

      const result = validator.validateMedia('image/jpeg', oversized, dummyChecksum);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXCEEDS_SIZE');
    });

    it('rejects corrupt checksums and byte mismatches', () => {
      const bytes = Buffer.from('Original content');
      const wrongChecksum = crypto.createHash('sha256').update('Tampered content').digest('hex');

      const result = validator.validateMedia('image/jpeg', bytes.length, wrongChecksum, bytes);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_CHECKSUM');
    });
  });

  // ==========================================================================
  // 3. FULL DOCUMENT UPLOAD LOOP (Happy Path & Multi-Document State)
  // ==========================================================================
  describe('3. Inbound Document Upload, Tigris Storage & Linkage Lifecycle', () => {
    it('executes full happy path: upload passbook -> Tigris storage -> confirmation -> partial state', async () => {
      const storage = new TigrisStorageAdapter({ bucketName: 'alliance-test-bucket' });
      const service = new WhatsAppDocumentLoopService(undefined, undefined, undefined, storage);

      const submission = createTestSubmission();
      service.processNewSubmission(submission);

      const passbookBytes = Buffer.from('Sample bank passbook document content');
      const passbookChecksum = crypto.createHash('sha256').update(passbookBytes).digest('hex');

      const uploadEvent: InboundMediaUploadEvent = {
        eventId: 'evt_wa_msg_001',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'passbookPhoto',
        mediaId: 'media_wa_passbook_01',
        mimeType: 'image/jpeg',
        byteSize: passbookBytes.length,
        sha256Checksum: passbookChecksum,
        rawBytes: passbookBytes,
        timestamp: '1729000000',
      };

      const receipt = await service.handleInboundDocumentUpload(uploadEvent);

      expect(receipt.success).toBe(true);
      expect(receipt.status).toBe('PROCESSED');
      expect(receipt.storageUri).toBe(`asset://alliance-test-bucket/submissions/${submission.id}/passbookPhoto/${passbookChecksum}.jpg`);
      expect(receipt.submissionState).toBe('PENDING_DOCUMENTS'); // 3 documents still missing
      expect(receipt.allDocumentsVerified).toBe(false);
      expect(receipt.confirmationMessage).toContain('Bank Passbook Front Page');
      expect(receipt.confirmationMessage).toContain('Remaining documents required');

      // Verify Tigris storage contains the file
      expect(storage.hasDocument(receipt.storageUri!)).toBe(true);

      // Verify submission entity linkage
      const updated = service.getSubmission(submission.id)!;
      expect(updated.documents.passbookPhoto.status).toBe('VERIFIED');
      expect(updated.documents.passbookPhoto.fileUri).toBe(receipt.storageUri);
      expect(updated.documents.passbookPhoto.sha256Checksum).toBe(passbookChecksum);
    });

    it('transitions to DOCUMENTS_VERIFIED when the final missing document is fulfilled', async () => {
      const storage = new TigrisStorageAdapter({ bucketName: 'alliance-test-bucket' });
      const service = new WhatsAppDocumentLoopService(undefined, undefined, undefined, storage);

      // 3 of 4 documents already verified
      const partialDocs: Record<DocType, any> = {
        passbookPhoto: { docType: 'passbookPhoto', status: 'VERIFIED', fileUri: 'asset://b/1' },
        aadhaarCardPhoto: { docType: 'aadhaarCardPhoto', status: 'VERIFIED', fileUri: 'asset://b/2' },
        childPhoto: { docType: 'childPhoto', status: 'VERIFIED', fileUri: 'asset://b/3' },
        caregiverSignature: { docType: 'caregiverSignature', status: 'MISSING' }, // Only this is missing!
        feeReceiptPhoto: { docType: 'feeReceiptPhoto', status: 'MISSING' },
        marksheetPhoto: { docType: 'marksheetPhoto', status: 'MISSING' },
      };

      const submission = createTestSubmission({ documents: partialDocs });
      service.processNewSubmission(submission);

      const sigBytes = Buffer.from('Caregiver signature binary PNG stream');
      const sigChecksum = crypto.createHash('sha256').update(sigBytes).digest('hex');

      const uploadEvent: InboundMediaUploadEvent = {
        eventId: 'evt_wa_msg_final_02',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'caregiverSignature',
        mediaId: 'media_wa_sig_01',
        mimeType: 'image/png',
        byteSize: sigBytes.length,
        sha256Checksum: sigChecksum,
        rawBytes: sigBytes,
        timestamp: '1729000100',
      };

      const receipt = await service.handleInboundDocumentUpload(uploadEvent);

      expect(receipt.success).toBe(true);
      expect(receipt.submissionState).toBe('DOCUMENTS_VERIFIED');
      expect(receipt.allDocumentsVerified).toBe(true);
      expect(receipt.confirmationMessage).toContain('All Documents Verified');
      expect(receipt.confirmationMessage).toContain('ready for final supervisor approval');

      const updated = service.getSubmission(submission.id)!;
      expect(updated.submissionStatus).toBe('DOCUMENTS_VERIFIED');
      expect(updated.documents.caregiverSignature.status).toBe('VERIFIED');
    });
  });

  // ==========================================================================
  // 4. SECURITY, DEDUPLICATION & FAILURE MODES
  // ==========================================================================
  describe('4. Security, Deduplication & Storage Failure Modes', () => {
    it('safely deduplicates duplicate events without duplicate uploads', async () => {
      const storage = new TigrisStorageAdapter();
      const service = new WhatsAppDocumentLoopService(undefined, undefined, undefined, storage);
      const submission = createTestSubmission();
      service.processNewSubmission(submission);

      const bytes = Buffer.from('Document bytes');
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');

      const event: InboundMediaUploadEvent = {
        eventId: 'evt_duplicate_test_01',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'passbookPhoto',
        mediaId: 'media_dup_01',
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        sha256Checksum: checksum,
        rawBytes: bytes,
        timestamp: '1729000000',
      };

      // Turn 1: Initial delivery
      const firstReceipt = await service.handleInboundDocumentUpload(event);
      expect(firstReceipt.status).toBe('PROCESSED');

      // Turn 2: Exact duplicate replay
      const duplicateReceipt = await service.handleInboundDocumentUpload(event);
      expect(duplicateReceipt.status).toBe('DUPLICATE_IGNORED');
      expect(duplicateReceipt.confirmationMessage).toContain('Duplicate event received');
    });

    it('rejects uploads from unauthorized phone numbers (wrong-user upload attack)', async () => {
      const service = new WhatsAppDocumentLoopService();
      const submission = createTestSubmission({ beneficiaryPhone: '+919876543210' });
      service.processNewSubmission(submission);

      const bytes = Buffer.from('Attacker document bytes');
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');

      const attackEvent: InboundMediaUploadEvent = {
        eventId: 'evt_attack_01',
        fromPhone: '+919999999999', // Attacker / wrong phone!
        submissionId: submission.id,
        docType: 'passbookPhoto',
        mediaId: 'media_attack_01',
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        sha256Checksum: checksum,
        rawBytes: bytes,
        timestamp: '1729000000',
      };

      const receipt = await service.handleInboundDocumentUpload(attackEvent);

      expect(receipt.success).toBe(false);
      expect(receipt.status).toBe('REJECTED');
      expect(receipt.errorReason).toContain('is not authorized to upload documents');
    });

    it('handles Tigris storage failures fail-closed without corrupting document state', async () => {
      const failingStorage = new TigrisStorageAdapter({ simulateFailure: true });
      const service = new WhatsAppDocumentLoopService(undefined, undefined, undefined, failingStorage);
      const submission = createTestSubmission();
      service.processNewSubmission(submission);

      const bytes = Buffer.from('Valid document bytes');
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');

      const event: InboundMediaUploadEvent = {
        eventId: 'evt_storage_fail_01',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'passbookPhoto',
        mediaId: 'media_01',
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        sha256Checksum: checksum,
        rawBytes: bytes,
        timestamp: '1729000000',
      };

      const receipt = await service.handleInboundDocumentUpload(event);

      expect(receipt.success).toBe(false);
      expect(receipt.status).toBe('STORAGE_FAILED');
      expect(receipt.errorReason).toContain('simulated storage failure');

      // Crucial: Document must NOT be marked VERIFIED if storage failed
      const subAfterFailure = service.getSubmission(submission.id)!;
      expect(subAfterFailure.documents.passbookPhoto.status).not.toBe('VERIFIED');
      expect(subAfterFailure.submissionStatus).toBe('PENDING_DOCUMENTS');
    });

    it('verifies timing-safe HMAC-SHA256 signature and rejects tampered payloads', async () => {
      const inboundAdapter = new InboundEventAdapter(APP_SECRET);
      const service = new WhatsAppDocumentLoopService(undefined, undefined, undefined, undefined, inboundAdapter);
      const submission = createTestSubmission();
      service.processNewSubmission(submission);

      const rawPayload = JSON.stringify({ message: 'Valid signed payload' });
      const validSig = createSignature(rawPayload, APP_SECRET);
      const tamperedSig = createSignature(rawPayload, 'wrong_tampered_secret_key');

      const bytes = Buffer.from('Doc bytes');
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');

      const eventWithTamperedSig: InboundMediaUploadEvent = {
        eventId: 'evt_tampered_sig_01',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'passbookPhoto',
        mediaId: 'media_01',
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        sha256Checksum: checksum,
        rawBytes: bytes,
        signatureHeader: tamperedSig,
        timestamp: '1729000000',
      };

      const rejectedReceipt = await service.handleInboundDocumentUpload(eventWithTamperedSig, rawPayload);
      expect(rejectedReceipt.success).toBe(false);
      expect(rejectedReceipt.status).toBe('REJECTED');
      expect(rejectedReceipt.errorReason).toContain('Signature mismatch');

      // Valid signature succeeds
      const eventWithValidSig: InboundMediaUploadEvent = {
        ...eventWithTamperedSig,
        eventId: 'evt_valid_sig_02',
        signatureHeader: validSig,
      };

      const validReceipt = await service.handleInboundDocumentUpload(eventWithValidSig, rawPayload);
      expect(validReceipt.success).toBe(true);
      expect(validReceipt.status).toBe('PROCESSED');
    });
  });

  // ==========================================================================
  // 5. LEADERSHIP STATUS QUERY
  // ==========================================================================
  describe('5. Leadership Document Status Query (Privacy & Scoping)', () => {
    it('returns privacy-safe document status without exposing raw PII or clinical data', async () => {
      const service = new WhatsAppDocumentLoopService();
      const submission = createTestSubmission();
      service.processNewSubmission(submission);

      // Upload passbook
      const bytes = Buffer.from('Passbook data');
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
      await service.handleInboundDocumentUpload({
        eventId: 'evt_status_01',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'passbookPhoto',
        mediaId: 'media_01',
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        sha256Checksum: checksum,
        rawBytes: bytes,
        timestamp: '1729000000',
      });

      const leadershipCaller: import('../types').CallerSecurityContext = {
        userId: 'lead_director_01',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
      };

      const status = service.queryLeadershipStatus(submission.id, leadershipCaller);

      expect(status.submissionId).toBe(submission.id);
      expect(status.remoteSubmissionId).toBe('BEN-2026-MH-0042');
      expect(status.state).toBe('Maharashtra');
      expect(status.district).toBe('Pune');
      expect(status.overallStatus).toBe('PENDING_DOCUMENTS');
      expect(status.isComplete).toBe(false);
      expect(status.missingDocumentCount).toBe(3); // 3 still missing
      expect(status.verifiedDocumentCount).toBe(1); // 1 verified

      // Checksum is masked to prevent information disclosure
      expect(status.documents.passbookPhoto.isVerified).toBe(true);
      expect(status.documents.passbookPhoto.checksumMasked).toBe(`${checksum.slice(0, 8)}...${checksum.slice(-4)}`);

      // Strict privacy check: No raw phone number, name or clinical data in output
      expect((status as any).beneficiaryPhone).toBeUndefined();
      expect((status as any).childName).toBeUndefined();
      expect((status as any).artNumber).toBeUndefined();
    });

    it('denies state lead from querying submissions outside their authorized geographic scope', () => {
      const service = new WhatsAppDocumentLoopService();
      const submission = createTestSubmission({ state: 'Maharashtra' });
      service.processNewSubmission(submission);

      const karnatakaLead: import('../types').CallerSecurityContext = {
        userId: 'lead_ka_01',
        role: 'STATE_LEAD',
        permittedStates: ['Karnataka'], // Unauthorized for Maharashtra!
      };

      expect(() => service.queryLeadershipStatus(submission.id, karnatakaLead)).toThrow(
        /Access Denied: Caller with scope \[Karnataka\] is forbidden from inspecting records for state 'Maharashtra'/
      );
    });
  });
});
