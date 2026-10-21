import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  processBeneficiaryMedia,
  MockMediaByteDownloader,
  MockDocumentStorageSink,
  MAX_MEDIA_BYTES,
  ALLOWED_MEDIA_MIMES,
  type MediaProcessingJob,
} from '@/lib/server/mediaProcessingService';

describe('Media Processing & Storage Linkage Suite', () => {
  let mockDownloader: MockMediaByteDownloader;
  let mockStorage: MockDocumentStorageSink;

  beforeEach(() => {
    mockDownloader = new MockMediaByteDownloader();
    mockStorage = new MockDocumentStorageSink();
  });

  describe('1. Valid Ingestion & Drive Storage Linkage', () => {
    it('downloads valid JPEG photo, verifies SHA256, and links to child Drive folder', async () => {
      const syntheticPhotoContent = Buffer.from('synthetic-jpeg-binary-stream-12345', 'utf-8');
      const mediaId = 'media-synth-001';
      const expectedSha256 = mockDownloader.registerMedia(mediaId, syntheticPhotoContent, 'image/jpeg');

      const job: MediaProcessingJob = {
        jobId: 'job-001',
        mediaId,
        mimeType: 'image/jpeg',
        expectedSha256,
        targetSubmissionId: 'BEN-SYN-101',
        targetChildName: 'Baby Ananya',
        documentType: 'nutritionCard',
        sourceOrigin: 'META_WHATSAPP_WEBHOOK',
      };

      const result = await processBeneficiaryMedia(job, mockDownloader, mockStorage, 'staging');

      expect(result.status).toBe('STORED_AND_LINKED');
      expect(result.mediaId).toBe(mediaId);
      expect(result.targetSubmissionId).toBe('BEN-SYN-101');
      expect(result.documentType).toBe('nutritionCard');
      expect(result.calculatedSha256).toBe(expectedSha256);
      expect(result.storagePath).toContain('Baby Ananya - BEN-SYN-101/nutritionCard_');
      expect(result.proxyUrl).toBe('/api/submissions/BEN-SYN-101/asset?docType=nutritionCard');
      expect(mockStorage.storedDocuments.length).toBe(1);
    });

    it('downloads and stores PDF document verification dossier cleanly', async () => {
      const syntheticPdf = Buffer.from('%PDF-1.4\n%synthetic-passbook-stream\n%%EOF', 'utf-8');
      const mediaId = 'media-pdf-002';
      const expectedSha256 = mockDownloader.registerMedia(mediaId, syntheticPdf, 'application/pdf');

      const job: MediaProcessingJob = {
        jobId: 'job-002',
        mediaId,
        mimeType: 'application/pdf',
        expectedSha256,
        targetSubmissionId: 'BEN-SYN-102',
        targetChildName: 'Aarav Kumar',
        documentType: 'passbookPhoto',
        sourceOrigin: 'META_WHATSAPP_WEBHOOK',
      };

      const result = await processBeneficiaryMedia(job, mockDownloader, mockStorage, 'staging');

      expect(result.status).toBe('STORED_AND_LINKED');
      expect(result.storagePath).toContain('Aarav Kumar - BEN-SYN-102/passbookPhoto_');
      expect(result.proxyUrl).toBe('/api/submissions/BEN-SYN-102/asset?docType=passbookPhoto');
    });
  });

  describe('2. Integrity & Boundary Security Checks', () => {
    it('rejects media exceeding 10MB ceiling fail-closed with REJECTED_OVERSIZE', async () => {
      const oversizedBuffer = Buffer.alloc(MAX_MEDIA_BYTES + 1024, 0x41); // 10MB + 1KB
      const mediaId = 'media-oversized';
      mockDownloader.registerMedia(mediaId, oversizedBuffer, 'image/png');

      const job: MediaProcessingJob = {
        jobId: 'job-oversize',
        mediaId,
        mimeType: 'image/png',
        targetSubmissionId: 'BEN-SYN-103',
        targetChildName: 'Priya Sharma',
        documentType: 'aadhaarCardPhoto',
        sourceOrigin: 'META_WHATSAPP_WEBHOOK',
      };

      const result = await processBeneficiaryMedia(job, mockDownloader, mockStorage, 'staging');

      expect(result.status).toBe('REJECTED_OVERSIZE');
      expect(result.errorDetails).toContain('exceeds maximum allowed limit of 10485760 bytes');
      expect(mockStorage.storedDocuments.length).toBe(0); // Zero writes
    });

    it('rejects media when SHA-256 checksum fails verification', async () => {
      const genuineContent = Buffer.from('original-file-bytes', 'utf-8');
      const mediaId = 'media-tampered';
      mockDownloader.registerMedia(mediaId, genuineContent, 'image/jpeg');

      const job: MediaProcessingJob = {
        jobId: 'job-tamper',
        mediaId,
        mimeType: 'image/jpeg',
        expectedSha256: '0000000000000000000000000000000000000000000000000000000000000000', // Tampered hash
        targetSubmissionId: 'BEN-SYN-104',
        targetChildName: 'Rahul Verma',
        documentType: 'feeReceiptPhoto',
        sourceOrigin: 'META_WHATSAPP_WEBHOOK',
      };

      const result = await processBeneficiaryMedia(job, mockDownloader, mockStorage, 'staging');

      expect(result.status).toBe('REJECTED_CHECKSUM_MISMATCH');
      expect(result.errorDetails).toContain('SHA-256 checksum mismatch');
      expect(mockStorage.storedDocuments.length).toBe(0);
    });

    it('rejects unsupported media MIME types', async () => {
      const maliciousHtml = Buffer.from('<script>alert("xss")</script>', 'utf-8');
      const mediaId = 'media-html';
      mockDownloader.registerMedia(mediaId, maliciousHtml, 'text/html');

      const job: MediaProcessingJob = {
        jobId: 'job-bad-mime',
        mediaId,
        mimeType: 'text/html',
        targetSubmissionId: 'BEN-SYN-105',
        targetChildName: 'Sunita Patel',
        documentType: 'nutritionCard',
        sourceOrigin: 'META_WHATSAPP_WEBHOOK',
      };

      const result = await processBeneficiaryMedia(job, mockDownloader, mockStorage, 'staging');

      expect(result.status).toBe('REJECTED_UNSUPPORTED_MIME');
      expect(result.errorDetails).toContain('Unsupported media MIME type "text/html"');
      expect(mockStorage.storedDocuments.length).toBe(0);
    });

    it('enforces staging isolation guard rejecting operational production targets', async () => {
      const validPhoto = Buffer.from('photo-bytes', 'utf-8');
      const mediaId = 'media-prod-target';
      mockDownloader.registerMedia(mediaId, validPhoto, 'image/jpeg');

      const job: MediaProcessingJob = {
        jobId: 'job-staging-violation',
        mediaId,
        mimeType: 'image/jpeg',
        targetSubmissionId: 'PROD-LIVE-RECORD-999', // Operational identifier
        targetChildName: 'Real Patient',
        documentType: 'nutritionCard',
        sourceOrigin: 'META_WHATSAPP_WEBHOOK',
      };

      const result = await processBeneficiaryMedia(job, mockDownloader, mockStorage, 'staging');

      expect(result.status).toBe('REJECTED_DESTINATION_VIOLATION');
      expect(result.errorDetails).toContain('Destination guard rejection');
      expect(mockStorage.storedDocuments.length).toBe(0);
    });

    it('handles downloader failure cleanly without throwing unhandled exceptions', async () => {
      const job: MediaProcessingJob = {
        jobId: 'job-missing-media',
        mediaId: 'non-existent-media-id',
        mimeType: 'image/jpeg',
        targetSubmissionId: 'BEN-SYN-106',
        targetChildName: 'Baby Maya',
        documentType: 'nutritionCard',
        sourceOrigin: 'META_WHATSAPP_WEBHOOK',
      };

      const result = await processBeneficiaryMedia(job, mockDownloader, mockStorage, 'staging');

      expect(result.status).toBe('FAILED');
      expect(result.errorDetails).toContain('Media download failed: Media not found');
      expect(mockStorage.storedDocuments.length).toBe(0);
    });
  });
});
