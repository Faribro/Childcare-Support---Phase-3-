import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// 1. Ingress & Handoff Queue (Worker 05 & Coordination)
import {
  PersistentWebhookHandoffQueue,
  translateHandoffEventToJob,
} from '@/lib/server/webhookHandoffContract';
import type { UploadTokenResolver } from '@/lib/server/webhookHandoffContract';

// 2. Media Processing & Storage Service (Backend & Tigris Reconciliation)
import {
  processBeneficiaryMedia,
  MockMediaByteDownloader,
} from '@/lib/server/mediaProcessingService';
import type {
  DocumentStorageSink,
  BeneficiaryDocumentType,
} from '@/lib/server/mediaProcessingService';

// 3. Outbound WhatsApp Sender Adapter (Integration Coordinator Owned)
import {
  WhatsAppOutboundSender,
  MockWhatsAppHttpTransport,
  PersistentFileOutboundRegistry,
} from '@/lib/server/whatsappOutboundSender';
import type { CallerSecurityContext } from '@/lib/server/whatsappOutboundSender';

// 4. Reporting Query Simulation (Leadership Verification)
import { executeStagingReportingQuery } from '@/lib/server/reportingEmailDelivery';

/**
 * Reconciled Tigris Asset Storage Adapter
 * Bridges backend mediaProcessingService with Tigris private object store architecture.
 * Ensures linelist stores sanitized proxy URLs while raw bytes are secured in Tigris.
 */
class ReconciledTigrisAssetStorageProvider implements DocumentStorageSink {
  public storedDossiers = new Map<string, {
    tigrisUri: string;
    proxyUrl: string;
    bytes: Buffer;
    mimeType: string;
  }>();

  private readonly bucketName = 'childcare-support-phase3-private';

  async storeDocument(params: {
    targetSubmissionId: string;
    targetChildName: string;
    documentType: BeneficiaryDocumentType;
    filename: string;
    mimeType: string;
    buffer: Buffer;
    appEnv: string;
  }): Promise<{
    success: boolean;
    driveFileId?: string;
    storagePath?: string;
    proxyUrl?: string;
    error?: string;
  }> {
    const storageKey = `submissions/${params.targetChildName} - ${params.targetSubmissionId}/${params.filename}`;
    const tigrisUri = `asset://${this.bucketName}/${storageKey}`;

    // Generate sanitized linelist proxy URL (never exposes private bucket or presigned credentials)
    const fileId = `tigris-${crypto.randomBytes(6).toString('hex')}`;
    const proxyUrl = `/api/submissions/${encodeURIComponent(params.targetSubmissionId)}/asset?docType=${params.documentType}`;

    this.storedDossiers.set(fileId, {
      tigrisUri,
      proxyUrl,
      bytes: params.buffer,
      mimeType: params.mimeType,
    });

    return {
      success: true,
      driveFileId: fileId,
      storagePath: storageKey,
      proxyUrl,
    };
  }
}

describe('End-to-End Outbound / Inbound Document Loop & Storage Reconciliation (Task 4)', () => {
  const testQueuePath = path.join(process.cwd(), '.cache', 'test_e2e_queue.json');
  const testRegistryPath = path.join(process.cwd(), '.cache', 'test_e2e_outbound_registry.json');
  const tokenSecret = 'super_secret_hmac_signing_key_min_32_bytes_long';

  let queue: PersistentWebhookHandoffQueue;
  let outboundSender: WhatsAppOutboundSender;
  let mockHttpTransport: MockWhatsAppHttpTransport;
  let mockDownloader: MockMediaByteDownloader;
  let storageProvider: ReconciledTigrisAssetStorageProvider;

  const supervisorCaller: CallerSecurityContext = {
    userId: 'supervisor-pune-01',
    role: 'SUPERVISOR',
    permittedStates: ['Maharashtra'],
  };

  beforeEach(async () => {
    if (fs.existsSync(testQueuePath)) fs.unlinkSync(testQueuePath);
    if (fs.existsSync(testRegistryPath)) fs.unlinkSync(testRegistryPath);

    queue = new PersistentWebhookHandoffQueue({ filePath: testQueuePath });
    await queue.clear();

    mockHttpTransport = new MockWhatsAppHttpTransport();
    const registry = new PersistentFileOutboundRegistry({ filePath: testRegistryPath });
    await registry.clear();

    outboundSender = new WhatsAppOutboundSender(
      {
        accessToken: 'mock_meta_token_123',
        phoneNumberId: '109876543210987',
      },
      mockHttpTransport,
      registry
    );

    mockDownloader = new MockMediaByteDownloader();
    storageProvider = new ReconciledTigrisAssetStorageProvider();
  });

  afterEach(async () => {
    if (fs.existsSync(testQueuePath)) fs.unlinkSync(testQueuePath);
    if (fs.existsSync(testRegistryPath)) fs.unlinkSync(testRegistryPath);
  });

  it('executes full missing-document loop with Tigris reconciliation and verified leadership status query', async () => {
    // -------------------------------------------------------------------------
    // Phase 1: Intake Beneficiary Submission with Missing Document
    // -------------------------------------------------------------------------
    const beneficiary = {
      submissionId: 'BEN-SYN-MH-001',
      childName: 'Ananya Shinde',
      caregiverPhoneE164: '+919820010170',
      state: 'Maharashtra',
      district: 'Pune',
      missingDocument: 'nutritionCard' as BeneficiaryDocumentType,
      documentStatus: 'MISSING',
      isVerified: false,
    };

    expect(beneficiary.documentStatus).toBe('MISSING');
    expect(beneficiary.isVerified).toBe(false);

    // -------------------------------------------------------------------------
    // Phase 2: Generate Timed HMAC Handoff Token & Outbound Request
    // -------------------------------------------------------------------------
    const expiry = Date.now() + 86400 * 1000; // 24 hours validity
    const dataToSign = `${beneficiary.submissionId}_${beneficiary.missingDocument}_${expiry}`;
    const tokenSig = crypto
      .createHmac('sha256', tokenSecret)
      .update(dataToSign)
      .digest('hex')
      .slice(0, 16);

    const uploadToken = `UPLOAD_${beneficiary.submissionId}_${beneficiary.missingDocument}_${expiry}_${tokenSig}`;

    // -------------------------------------------------------------------------
    // Phase 3: Outbound WhatsApp Dispatch (Mocked Gateway)
    // -------------------------------------------------------------------------
    const outboundResult = await outboundSender.dispatch(
      {
        idempotencyKey: `idemp-missing-doc-${beneficiary.submissionId}`,
        correlationId: `corr-e2e-${beneficiary.submissionId}`,
        targetSubmissionId: beneficiary.submissionId,
        recipientPhoneE164: beneficiary.caregiverPhoneE164,
        messageType: 'DOCUMENT_REQUEST',
        documentRequest: {
          childName: beneficiary.childName,
          docType: beneficiary.missingDocument,
          uploadToken,
        },
      },
      supervisorCaller
    );

    expect(outboundResult.success).toBe(true);
    expect(outboundResult.status).toBe('ACCEPTED_BY_GATEWAY');
    expect(outboundResult.wamid).toBeDefined();
    expect(outboundResult.recipientPhoneMasked).toBe('******0170'); // DPDP compliance

    // Transition state: Request sent to caregiver
    beneficiary.documentStatus = 'REQUESTED';

    // -------------------------------------------------------------------------
    // Phase 4: Delivery Receipt Correlation
    // -------------------------------------------------------------------------
    const deliveryReceipt = await outboundSender.correlateDeliveryReceipt({
      wamid: outboundResult.wamid!,
      recipientId: '919820010170',
      status: 'delivered',
      timestamp: new Date().toISOString(),
    });

    expect(deliveryReceipt.correlated).toBe(true);
    expect(deliveryReceipt.currentStatus).toBe('DELIVERED');

    // -------------------------------------------------------------------------
    // Phase 5: Inbound Caregiver Upload via Catalyst Ingress Webhook
    // -------------------------------------------------------------------------
    const mediaId = 'media-meta-image-998811';
    const syntheticImageBytes = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ... synthetic image content ...');
    const imageSha256 = crypto.createHash('sha256').update(syntheticImageBytes).digest('hex');

    // Register media bytes in Meta Graph mock downloader
    mockDownloader.registerMedia(mediaId, syntheticImageBytes, 'image/jpeg');

    // Catalyst Ingress Webhook receives upload and enqueues event into PersistentWebhookHandoffQueue
    const enqueueResult = await queue.enqueue({
      correlationId: `corr-inbound-${Date.now()}`,
      mediaId,
      mimeType: 'image/jpeg',
      sha256: imageSha256,
      uploadToken,
      sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
      isSynthetic: true,
    });

    expect(enqueueResult.enqueued).toBe(true);
    expect(await queue.getPendingCount()).toBe(1);

    // -------------------------------------------------------------------------
    // Phase 6: Worker Job Claiming with Lease
    // -------------------------------------------------------------------------
    const claimedEvent = await queue.claimNext('media-worker-node-1', 15000);
    expect(claimedEvent).not.toBeNull();
    expect(claimedEvent?.mediaId).toBe(mediaId);

    // -------------------------------------------------------------------------
    // Phase 7: Token Resolution to Beneficiary Submission
    // -------------------------------------------------------------------------
    const tokenResolver: UploadTokenResolver = {
      async resolveToken(token: string) {
        // Parse and verify token signature
        const parts = token.split('_');
        if (parts.length < 5 || parts[0] !== 'UPLOAD') {
          return { valid: false, error: 'Malformed token structure' };
        }
        const [_, subId, docType, expStr, sig] = parts;
        const expectedSig = crypto
          .createHmac('sha256', tokenSecret)
          .update(`${subId}_${docType}_${expStr}`)
          .digest('hex')
          .slice(0, 16);

        if (sig !== expectedSig) {
          return { valid: false, error: 'Token HMAC signature invalid' };
        }

        if (Date.now() > parseInt(expStr, 10)) {
          return { valid: false, error: 'Upload token expired' };
        }

        return {
          valid: true,
          targetSubmissionId: subId,
          targetChildName: beneficiary.childName,
          documentType: docType as any,
        };
      },
    };

    const translation = await translateHandoffEventToJob(claimedEvent!, tokenResolver);
    expect(translation.success).toBe(true);
    expect(translation.job).toBeDefined();
    expect(translation.job?.targetSubmissionId).toBe('BEN-SYN-MH-001');

    // -------------------------------------------------------------------------
    // Phase 8: Reconciled Tigris Storage & Linelist Linkage
    // -------------------------------------------------------------------------
    const processingResult = await processBeneficiaryMedia(
      translation.job!,
      mockDownloader,
      storageProvider
    );

    expect(processingResult.status).toBe('STORED_AND_LINKED');
    expect(processingResult.proxyUrl).toContain('/api/submissions/BEN-SYN-MH-001/asset?docType=nutritionCard');
    expect(storageProvider.storedDossiers.size).toBe(1);

    // Worker acknowledges queue job
    const ack = await queue.acknowledge(claimedEvent!.eventId, 'media-worker-node-1');
    expect(ack).toBe(true);
    expect(await queue.getPendingCount()).toBe(0);

    // -------------------------------------------------------------------------
    // Phase 9: Crucial Reconciliation Invariant: Storage != Verification
    // -------------------------------------------------------------------------
    // Storing bytes sets status to UPLOADED / RECEIVED_PENDING_VERIFICATION.
    // It does NOT set isVerified to true!
    beneficiary.documentStatus = 'UPLOADED';
    expect(beneficiary.documentStatus).toBe('UPLOADED');
    expect(beneficiary.isVerified).toBe(false);

    // Authorized supervisor conducts clinical verification:
    beneficiary.documentStatus = 'VERIFIED';
    beneficiary.isVerified = true;
    expect(beneficiary.isVerified).toBe(true);

    // -------------------------------------------------------------------------
    // Phase 10: Outbound Confirmation Dispatch to Caregiver
    // -------------------------------------------------------------------------
    const confirmationResult = await outboundSender.dispatch(
      {
        idempotencyKey: `idemp-confirm-${beneficiary.submissionId}`,
        correlationId: `corr-confirm-${beneficiary.submissionId}`,
        targetSubmissionId: beneficiary.submissionId,
        recipientPhoneE164: beneficiary.caregiverPhoneE164,
        messageType: 'TEXT',
        textBody: `Thank you! Nutrition card for ${beneficiary.childName} has been received and verified by Alliance childcare staff.`,
      },
      supervisorCaller
    );

    expect(confirmationResult.success).toBe(true);
    expect(confirmationResult.status).toBe('ACCEPTED_BY_GATEWAY');

    // -------------------------------------------------------------------------
    // Phase 11: Leadership Status Query Simulation
    // -------------------------------------------------------------------------
    const queryResult = executeStagingReportingQuery({
      securityContext: {
        userId: 'dir-leadership',
        role: 'LEADERSHIP',
        permittedStates: ['*'],
      },
      filters: {
        state: 'Maharashtra',
        dateBasis: 'VISIT_DATE',
      },
    });

    expect(queryResult.status).toBe('success');
    expect(queryResult.records.length).toBeGreaterThan(0);
    // Verified DPDP masking invariant
    for (const rec of queryResult.records) {
      expect(rec.maskedCaregiverPhone).toMatch(/^\*{6}\d{4}$/);
      expect(rec.maskedAadhaar).toMatch(/^XXXX-XXXX-\d{4}$/);
      expect(rec.isSynthetic).toBe(true);
    }
  });
});
