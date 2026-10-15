import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import {
  WhatsAppDocumentLoopService,
  SubmissionEntity,
  InboundMediaUploadEvent,
  DocType,
  FileBackedTestStore,
  MemoryDocumentLoopStore,
  CallerSecurityContext,
} from '../index';
import { TigrisStorageAdapter } from '../tigris-storage-adapter';
import { InboundEventAdapter } from '../inbound-event-adapter';
import {
  MediaValidator,
  MAX_IMAGE_BYTE_SIZE,
  MAX_DOCUMENT_BYTE_SIZE,
} from '../media-validator';

describe('WhatsApp Document Loop (Reconciled Backend Storage Worker)', () => {
  const APP_SECRET = 'meta_test_webhook_secret_key_12345';

  function createValidJpeg(content: string = 'sample-jpeg'): Buffer {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from(content)]);
  }

  function createValidPng(content: string = 'sample-png'): Buffer {
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(content)]);
  }

  function createValidPdf(content: string = 'sample-pdf'): Buffer {
    return Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.from(content)]);
  }

  function createTestSubmission(overrides?: Partial<SubmissionEntity>): SubmissionEntity {
    const id = 'sub_test_001';
    const now = new Date().toISOString();

    const emptyDocs: Record<DocType, { docType: DocType; status: import('../types').DocumentStatus; isVerified: boolean }> = {
      passbookPhoto: { docType: 'passbookPhoto', status: 'MISSING', isVerified: false },
      aadhaarCardPhoto: { docType: 'aadhaarCardPhoto', status: 'MISSING', isVerified: false },
      childPhoto: { docType: 'childPhoto', status: 'MISSING', isVerified: false },
      caregiverSignature: { docType: 'caregiverSignature', status: 'MISSING', isVerified: false },
      feeReceiptPhoto: { docType: 'feeReceiptPhoto', status: 'MISSING', isVerified: false },
      marksheetPhoto: { docType: 'marksheetPhoto', status: 'MISSING', isVerified: false },
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
  // 1. MISSING-DOCUMENT DETECTION & REQUEST PREPARATION
  // ==========================================================================
  describe('1. Missing-Document Detection & Outbound Request Preparation', () => {
    it('detects missing documents and prepares request with private recipient reference and masked phone', () => {
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

      expect(result.outboundRequest).toBeDefined();
      expect(result.outboundRequest?.status).toBe('PREPARED');
      expect(result.outboundRequest?.idempotencyKey).toContain('req_doc_sub_test');
      expect(result.outboundRequest?.recipientPhoneMasked).toBe('+91 ******3210');
      // Trusted private reference is populated (SHA-256 hash), not raw phone
      expect(result.outboundRequest?.recipientPhoneRef).toBe(submission.beneficiaryPhoneHash);
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
  });

  // ==========================================================================
  // 2. MEDIA VALIDATION: MAGIC BYTES & CHANNEL SIZE POLICIES
  // ==========================================================================
  describe('2. Media Validation: Magic Bytes & Channel-Specific Size Policies', () => {
    const validator = new MediaValidator();

    it('verifies valid magic bytes for PDF, JPEG, and PNG', () => {
      const pdfBytes = createValidPdf();
      const pdfHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
      expect(validator.validateMedia('application/pdf', pdfBytes.length, pdfHash, pdfBytes).valid).toBe(true);

      const jpegBytes = createValidJpeg();
      const jpegHash = crypto.createHash('sha256').update(jpegBytes).digest('hex');
      expect(validator.validateMedia('image/jpeg', jpegBytes.length, jpegHash, jpegBytes).valid).toBe(true);

      const pngBytes = createValidPng();
      const pngHash = crypto.createHash('sha256').update(pngBytes).digest('hex');
      expect(validator.validateMedia('image/png', pngBytes.length, pngHash, pngBytes).valid).toBe(true);
    });

    it('rejects files where byte content does not match declared MIME type (magic bytes mismatch)', () => {
      const textBytes = Buffer.from('Plain text claiming to be a JPEG image');
      const textHash = crypto.createHash('sha256').update(textBytes).digest('hex');

      const result = validator.validateMedia('image/jpeg', textBytes.length, textHash, textBytes);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MAGIC_BYTES_MISMATCH');
      expect(result.error).toContain('Content inspection failed');
    });

    it('enforces channel limits: 10MB for JPEG/PNG images vs 15MB for PDF documents', () => {
      const dummyHash = 'a'.repeat(64);

      // 12 MB file (between 10MB and 15MB)
      const twelveMb = 12 * 1024 * 1024;

      // JPEG fails at 12MB (limit 10MB)
      const jpegResult = validator.validateMedia('image/jpeg', twelveMb, dummyHash);
      expect(jpegResult.valid).toBe(false);
      expect(jpegResult.code).toBe('EXCEEDS_SIZE');
      expect(jpegResult.error).toContain('10 MB limit');

      // PDF passes at 12MB (limit 15MB)
      const pdfResult = validator.validateMedia('application/pdf', twelveMb, dummyHash);
      expect(pdfResult.valid).toBe(true);

      // PDF fails beyond 15MB
      const sixteenMb = 16 * 1024 * 1024;
      const pdfOversized = validator.validateMedia('application/pdf', sixteenMb, dummyHash);
      expect(pdfOversized.valid).toBe(false);
      expect(pdfOversized.code).toBe('EXCEEDS_SIZE');
      expect(pdfOversized.error).toContain('15 MB limit');
    });
  });

  // ==========================================================================
  // 3. STORAGE != VERIFICATION (PRIORITY CORRECTION 1)
  // ==========================================================================
  describe('3. Receipt/Storage Separation from Document Verification & Approval', () => {
    it('storing arbitrary valid image bytes marks document UPLOADED, NEVER automatically VERIFIED', async () => {
      const storage = new TigrisStorageAdapter({ bucketName: 'test-bucket' });
      const service = new WhatsAppDocumentLoopService(undefined, undefined, undefined, undefined, storage);

      const submission = createTestSubmission();
      service.processNewSubmission(submission);

      const passbookBytes = createValidJpeg('passbook-data');
      const passbookChecksum = crypto.createHash('sha256').update(passbookBytes).digest('hex');

      const receipt = await service.handleInboundDocumentUpload({
        eventId: 'evt_upload_001',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'passbookPhoto',
        mediaId: 'media_01',
        mimeType: 'image/jpeg',
        byteSize: passbookBytes.length,
        sha256Checksum: passbookChecksum,
        rawBytes: passbookBytes,
        timestamp: '1729000000',
      });

      expect(receipt.success).toBe(true);
      expect(receipt.status).toBe('PROCESSED');
      expect(receipt.isUploaded).toBe(true);
      // Storage does NOT equal verified!
      expect(receipt.allDocumentsVerified).toBe(false);

      const subRecord = service.getSubmission(submission.id)!;
      expect(subRecord.documents.passbookPhoto.status).toBe('UPLOADED');
      expect(subRecord.documents.passbookPhoto.isVerified).toBe(false);
      expect(subRecord.submissionStatus).toBe('PENDING_DOCUMENTS');
    });

    it('uploading all required documents transitions to DOCUMENTS_RECEIVED, not DOCUMENTS_VERIFIED', async () => {
      const service = new WhatsAppDocumentLoopService();
      // 3 of 4 documents already UPLOADED (not verified)
      const partialDocs: Record<DocType, any> = {
        passbookPhoto: { docType: 'passbookPhoto', status: 'UPLOADED', isVerified: false, fileUri: 'asset://b/1' },
        aadhaarCardPhoto: { docType: 'aadhaarCardPhoto', status: 'UPLOADED', isVerified: false, fileUri: 'asset://b/2' },
        childPhoto: { docType: 'childPhoto', status: 'UPLOADED', isVerified: false, fileUri: 'asset://b/3' },
        caregiverSignature: { docType: 'caregiverSignature', status: 'MISSING', isVerified: false },
        feeReceiptPhoto: { docType: 'feeReceiptPhoto', status: 'MISSING', isVerified: false },
        marksheetPhoto: { docType: 'marksheetPhoto', status: 'MISSING', isVerified: false },
      };

      const submission = createTestSubmission({ documents: partialDocs });
      service.processNewSubmission(submission);

      const sigBytes = createValidPng('signature-png');
      const sigChecksum = crypto.createHash('sha256').update(sigBytes).digest('hex');

      const receipt = await service.handleInboundDocumentUpload({
        eventId: 'evt_final_sig',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'caregiverSignature',
        mediaId: 'media_sig',
        mimeType: 'image/png',
        byteSize: sigBytes.length,
        sha256Checksum: sigChecksum,
        rawBytes: sigBytes,
        timestamp: '1729000000',
      });

      expect(receipt.success).toBe(true);
      // All documents are uploaded, but NOT yet verified by supervisor
      expect(receipt.allDocumentsUploaded).toBe(true);
      expect(receipt.allDocumentsVerified).toBe(false);
      expect(receipt.submissionState).toBe('DOCUMENTS_RECEIVED');

      const updated = service.getSubmission(submission.id)!;
      expect(updated.submissionStatus).toBe('DOCUMENTS_RECEIVED');
      expect(updated.documents.caregiverSignature.isVerified).toBe(false);
    });

    it('only explicit evaluator verification transitions documents to VERIFIED and submission to DOCUMENTS_VERIFIED', async () => {
      const service = new WhatsAppDocumentLoopService();

      const uploadedDocs: Record<DocType, any> = {
        passbookPhoto: { docType: 'passbookPhoto', status: 'UPLOADED', isVerified: false, fileUri: 'asset://b/1' },
        aadhaarCardPhoto: { docType: 'aadhaarCardPhoto', status: 'UPLOADED', isVerified: false, fileUri: 'asset://b/2' },
        childPhoto: { docType: 'childPhoto', status: 'UPLOADED', isVerified: false, fileUri: 'asset://b/3' },
        caregiverSignature: { docType: 'caregiverSignature', status: 'UPLOADED', isVerified: false, fileUri: 'asset://b/4' },
        feeReceiptPhoto: { docType: 'feeReceiptPhoto', status: 'MISSING', isVerified: false },
        marksheetPhoto: { docType: 'marksheetPhoto', status: 'MISSING', isVerified: false },
      };

      const submission = createTestSubmission({
        submissionStatus: 'DOCUMENTS_RECEIVED',
        documents: uploadedDocs,
      });
      service.registerSubmission(submission);

      const supervisor: CallerSecurityContext = {
        userId: 'sup_pune_01',
        role: 'SUPERVISOR',
        permittedStates: ['Maharashtra'],
      };

      // Step 1: Supervisor verifies passbookPhoto
      const v1 = service.verifyDocument(submission.id, 'passbookPhoto', supervisor);
      expect(v1.documentVerified).toBe(true);
      expect(v1.allDocumentsVerified).toBe(false);
      expect(v1.submission.documents.passbookPhoto.isVerified).toBe(true);
      expect(v1.submission.submissionStatus).toBe('DOCUMENTS_RECEIVED');

      // Step 2: Supervisor verifies remaining 3 documents
      service.verifyDocument(submission.id, 'aadhaarCardPhoto', supervisor);
      service.verifyDocument(submission.id, 'childPhoto', supervisor);
      const vFinal = service.verifyDocument(submission.id, 'caregiverSignature', supervisor);

      // Now all 4 documents are VERIFIED -> submission becomes DOCUMENTS_VERIFIED
      expect(vFinal.allDocumentsVerified).toBe(true);
      expect(vFinal.submission.submissionStatus).toBe('DOCUMENTS_VERIFIED');
    });
  });

  // ==========================================================================
  // 4. STORAGE CLEANUP ROLLBACK & DATABASE FAILURE
  // ==========================================================================
  describe('4. Storage Cleanup Compensation on Database Linkage Failure', () => {
    it('deletes stored Tigris object if database linkage fails after upload', async () => {
      const storage = new TigrisStorageAdapter({ bucketName: 'rollback-test-bucket' });
      const service = new WhatsAppDocumentLoopService(undefined, undefined, undefined, undefined, storage);

      const submission = createTestSubmission();
      service.processNewSubmission(submission);

      const bytes = createValidJpeg('jpeg-bytes');
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');

      const expectedStorageUri = `asset://rollback-test-bucket/submissions/${submission.id}/passbookPhoto/${checksum}.jpg`;

      // Trigger upload with simulateDbFailure = true
      const receipt = await service.handleInboundDocumentUpload(
        {
          eventId: 'evt_fail_db_01',
          fromPhone: '+919876543210',
          submissionId: submission.id,
          docType: 'passbookPhoto',
          mediaId: 'media_fail',
          mimeType: 'image/jpeg',
          byteSize: bytes.length,
          sha256Checksum: checksum,
          rawBytes: bytes,
          timestamp: '1729000000',
        },
        undefined,
        true // simulateDbFailure
      );

      expect(receipt.success).toBe(false);
      expect(receipt.status).toBe('LINKAGE_FAILED');
      expect(receipt.errorReason).toContain('Simulated database connection/constraint failure');

      // Crucial: The Tigris object must have been cleaned up (deleted) from storage!
      expect(storage.hasDocument(expectedStorageUri)).toBe(false);

      // Submission record documents must remain MISSING
      const sub = service.getSubmission(submission.id)!;
      expect(sub.documents.passbookPhoto.status).not.toBe('UPLOADED');
    });
  });

  // ==========================================================================
  // 5. RUNTIME PERSISTENCE & RESTART/RETRY RESILIENCE (PRIORITY CORRECTION 2)
  // ==========================================================================
  describe('5. Durable Persistence & Restart/Retry Resilience', () => {
    it('preserves processed events and document state across service restarts', async () => {
      const tempStateFile = path.join(os.tmpdir(), `test_doc_loop_state_${Date.now()}.json`);
      const durableStore = new FileBackedTestStore(tempStateFile);

      try {
        // --- SERVICE INSTANCE 1 ---
        const serviceInstance1 = new WhatsAppDocumentLoopService(durableStore);
        const submission = createTestSubmission();
        serviceInstance1.processNewSubmission(submission);

        const passbookBytes = createValidJpeg('passbook-data-restart');
        const checksum = crypto.createHash('sha256').update(passbookBytes).digest('hex');

        const uploadEvent: InboundMediaUploadEvent = {
          eventId: 'evt_restart_001',
          fromPhone: '+919876543210',
          submissionId: submission.id,
          docType: 'passbookPhoto',
          mediaId: 'media_restart_01',
          mimeType: 'image/jpeg',
          byteSize: passbookBytes.length,
          sha256Checksum: checksum,
          rawBytes: passbookBytes,
          timestamp: '1729000000',
        };

        const r1 = await serviceInstance1.handleInboundDocumentUpload(uploadEvent);
        expect(r1.status).toBe('PROCESSED');

        // --- SIMULATE PROCESS RESTART / CRASH ---
        // Destroy instance 1 completely. Start instance 2 with the same backing store.
        const restartedStore = new FileBackedTestStore(tempStateFile);
        const serviceInstance2 = new WhatsAppDocumentLoopService(restartedStore);

        // 1. Verify previous submission state was recovered from disk
        const recoveredSub = serviceInstance2.getSubmission(submission.id);
        expect(recoveredSub).toBeDefined();
        expect(recoveredSub?.documents.passbookPhoto.status).toBe('UPLOADED');
        expect(recoveredSub?.documents.passbookPhoto.sha256Checksum).toBe(checksum);

        // 2. Verify duplicate webhook replay after restart is recognized and ignored
        const replayReceipt = await serviceInstance2.handleInboundDocumentUpload(uploadEvent);
        expect(replayReceipt.status).toBe('DUPLICATE_IGNORED');
        expect(replayReceipt.confirmationMessage).toContain('Duplicate event received');
      } finally {
        durableStore.cleanup();
      }
    });
  });

  // ==========================================================================
  // 6. LEADERSHIP STATUS QUERY & PRIVACY
  // ==========================================================================
  describe('6. Leadership Document Status Surveillance Query', () => {
    it('separates uploaded count from verified count and redacts all PII', async () => {
      const service = new WhatsAppDocumentLoopService();
      const submission = createTestSubmission();
      service.processNewSubmission(submission);

      const passbookBytes = createValidJpeg('passbook-data');
      const passbookChecksum = crypto.createHash('sha256').update(passbookBytes).digest('hex');

      await service.handleInboundDocumentUpload({
        eventId: 'evt_lead_01',
        fromPhone: '+919876543210',
        submissionId: submission.id,
        docType: 'passbookPhoto',
        mediaId: 'media_01',
        mimeType: 'image/jpeg',
        byteSize: passbookBytes.length,
        sha256Checksum: passbookChecksum,
        rawBytes: passbookBytes,
        timestamp: '1729000000',
      });

      const leader: CallerSecurityContext = {
        userId: 'director_01',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
      };

      const status = service.queryLeadershipStatus(submission.id, leader);

      expect(status.submissionId).toBe(submission.id);
      expect(status.state).toBe('Maharashtra');
      expect(status.district).toBe('Pune');
      // 1 document is uploaded, but 0 are verified yet
      expect(status.uploadedDocumentCount).toBe(1);
      expect(status.verifiedDocumentCount).toBe(0);
      expect(status.documents.passbookPhoto.status).toBe('UPLOADED');
      expect(status.documents.passbookPhoto.isVerified).toBe(false);
      expect(status.documents.passbookPhoto.checksumMasked).toBe(
        `${passbookChecksum.slice(0, 8)}...${passbookChecksum.slice(-4)}`
      );

      // Verify strict privacy guarantees
      expect((status as any).beneficiaryPhone).toBeUndefined();
      expect((status as any).childName).toBeUndefined();
    });

    it('denies state lead querying submissions outside permitted states', () => {
      const service = new WhatsAppDocumentLoopService();
      const submission = createTestSubmission({ state: 'Maharashtra' });
      service.processNewSubmission(submission);

      const upLead: CallerSecurityContext = {
        userId: 'lead_up_01',
        role: 'STATE_LEAD',
        permittedStates: ['Uttar Pradesh'],
      };

      expect(() => service.queryLeadershipStatus(submission.id, upLead)).toThrow(/Access Denied/);
    });
  });
});
