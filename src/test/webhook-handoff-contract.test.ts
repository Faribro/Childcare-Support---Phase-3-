import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  PersistentWebhookHandoffQueue,
  translateHandoffEventToJob,
  type UploadTokenResolver,
  type MediaIngressHandoffEvent,
} from '@/lib/server/webhookHandoffContract';
import {
  processBeneficiaryMedia,
  MockMediaByteDownloader,
  MockDocumentStorageSink,
} from '@/lib/server/mediaProcessingService';

describe('Webhook-to-Worker Durable Handoff Suite', () => {
  const testQueueFile = path.join(process.cwd(), '.cache', 'test_webhook_handoff_queue.json');
  let queue: PersistentWebhookHandoffQueue;

  const mockTokenResolver: UploadTokenResolver = {
    async resolveToken(token: string) {
      if (token === 'UPLOAD_synth_valid_token_001') {
        return {
          valid: true,
          targetSubmissionId: 'BEN-SYN-201',
          targetChildName: 'Baby Ananya',
          documentType: 'nutritionCard',
        };
      }
      return { valid: false, error: 'Unknown or expired token' };
    },
  };

  beforeEach(async () => {
    try {
      if (fs.existsSync(testQueueFile)) {
        fs.unlinkSync(testQueueFile);
      }
    } catch {}
    queue = new PersistentWebhookHandoffQueue({ filePath: testQueueFile });
  });

  describe('1. Durable Ingress Queue Lifecycle', () => {
    it('enqueues verified media reference and maintains pending queue depth', async () => {
      const res = await queue.enqueue({
        correlationId: 'corr-001',
        mediaId: 'meta-media-1001',
        mimeType: 'image/jpeg',
        sha256: 'abc123sha256',
        uploadToken: 'UPLOAD_synth_valid_token_001',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });

      expect(res.enqueued).toBe(true);
      expect(res.isDuplicate).toBe(false);
      expect(res.queueDepth).toBe(1);
      expect(await queue.getPendingCount()).toBe(1);

      const polled = await queue.pollNext(5);
      expect(polled.length).toBe(1);
      expect(polled[0].mediaId).toBe('meta-media-1001');
      expect(polled[0].uploadToken).toBe('UPLOAD_synth_valid_token_001');
    });

    it('suppresses duplicate event when identical mediaId is enqueued', async () => {
      await queue.enqueue({
        correlationId: 'corr-002',
        mediaId: 'meta-media-1002',
        mimeType: 'image/jpeg',
        uploadToken: 'UPLOAD_synth_valid_token_001',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });

      // Attempt duplicate enqueue
      const dupRes = await queue.enqueue({
        correlationId: 'corr-003',
        mediaId: 'meta-media-1002',
        mimeType: 'image/jpeg',
        uploadToken: 'UPLOAD_synth_valid_token_001',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });

      expect(dupRes.enqueued).toBe(false);
      expect(dupRes.isDuplicate).toBe(true);
      expect(await queue.getPendingCount()).toBe(1);
    });

    it('acknowledges event and removes it from pending queue', async () => {
      const { eventId } = await queue.enqueue({
        correlationId: 'corr-004',
        mediaId: 'meta-media-1004',
        mimeType: 'image/png',
        uploadToken: 'UPLOAD_synth_valid_token_001',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });

      expect(await queue.getPendingCount()).toBe(1);
      const acked = await queue.acknowledge(eventId);
      expect(acked).toBe(true);
      expect(await queue.getPendingCount()).toBe(0);

      // Subsequent duplicate enqueue after ack is still suppressed
      const reEnqueue = await queue.enqueue({
        correlationId: 'corr-005',
        mediaId: 'meta-media-1004',
        mimeType: 'image/png',
        uploadToken: 'UPLOAD_synth_valid_token_001',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });
      expect(reEnqueue.isDuplicate).toBe(true);
    });

    it('reloads pending queue state across simulated process restarts', async () => {
      await queue.enqueue({
        correlationId: 'corr-006',
        mediaId: 'meta-media-1006',
        mimeType: 'image/jpeg',
        uploadToken: 'UPLOAD_synth_valid_token_001',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });

      // Reload by creating new instance with same file
      const reloadedQueue = new PersistentWebhookHandoffQueue({ filePath: testQueueFile });
      expect(await reloadedQueue.getPendingCount()).toBe(1);
      const [item] = await reloadedQueue.pollNext(1);
      expect(item.mediaId).toBe('meta-media-1006');
    });
  });

  describe('2. End-to-End Pipeline Bridge', () => {
    it('translates handoff event into processing job and stores in Drive via mediaProcessingService', async () => {
      const mockDownloader = new MockMediaByteDownloader();
      const mockStorage = new MockDocumentStorageSink();

      const mediaContent = Buffer.from('synthetic-ananya-growth-card-bytes', 'utf-8');
      const mediaId = 'wa-media-card-77';
      const genuineSha256 = mockDownloader.registerMedia(mediaId, mediaContent, 'image/jpeg');

      // 1. Ingress Webhook Enqueues Event
      const enqueueRes = await queue.enqueue({
        correlationId: 'corr-e2e-001',
        mediaId,
        mimeType: 'image/jpeg',
        sha256: genuineSha256,
        uploadToken: 'UPLOAD_synth_valid_token_001',
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      });
      expect(enqueueRes.enqueued).toBe(true);

      // 2. Worker Polls Event
      const [event] = await queue.pollNext(1);
      expect(event).toBeDefined();

      // 3. Worker Translates Event via Token Resolver
      const translation = await translateHandoffEventToJob(event, mockTokenResolver);
      expect(translation.success).toBe(true);
      expect(translation.job).toBeDefined();

      // 4. Worker Dispatches Job to Media Processing Service
      const processResult = await processBeneficiaryMedia(translation.job!, mockDownloader, mockStorage, 'staging');
      expect(processResult.status).toBe('STORED_AND_LINKED');
      expect(processResult.storagePath).toContain('Baby Ananya - BEN-SYN-201/nutritionCard_');
      expect(processResult.proxyUrl).toBe('/api/submissions/BEN-SYN-201/asset?docType=nutritionCard');

      // 5. Worker Acknowledges Event
      const acked = await queue.acknowledge(event.eventId);
      expect(acked).toBe(true);
      expect(await queue.getPendingCount()).toBe(0);
    });

    it('rejects job translation fail-closed when uploadToken is missing or expired', async () => {
      const event: MediaIngressHandoffEvent = {
        eventId: 'ev-test-no-token',
        correlationId: 'corr-none',
        mediaId: 'wa-media-no-token',
        mimeType: 'image/jpeg',
        receivedAt: new Date().toISOString(),
        sourceOrigin: 'CATALYST_WHATSAPP_INGRESS',
        isSynthetic: true,
      };

      const res = await translateHandoffEventToJob(event, mockTokenResolver);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Missing uploadToken');
    });
  });
});
