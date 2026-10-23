import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  sanitizePathSegment,
  parseHandoffToken,
  maskPhoneNumber,
  processIncomingWhatsAppDocument,
  MockMetaMediaTransport,
  MockAssetStorageProvider,
  MAX_MEDIA_BYTES,
  ALLOWED_MEDIA_MIMES,
} from '@/lib/server/whatsappMediaWorker';
import type { IncomingWhatsAppMediaItem } from '@/lib/server/whatsappMediaWorker';

describe('WhatsApp Document Media Worker Suite', () => {
  let mockTransport: MockMetaMediaTransport;
  let mockStorage: MockAssetStorageProvider;
  const testSecret = 'test_token_hmac_signing_secret_min_32_characters';

  beforeEach(() => {
    mockTransport = new MockMetaMediaTransport();
    mockStorage = new MockAssetStorageProvider();
  });

  describe('1. Handoff Token Parsing & Cryptographic Verification', () => {
    it('parses valid synthetic upload handoff token from voice call workflow', () => {
      const caption = 'Here is the nutrition card UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD';
      const result = parseHandoffToken(caption);

      expect(result.valid).toBe(true);
      expect(result.payload?.submissionId).toBe('BEN-SYN-001');
      expect(result.payload?.documentType).toBe('NUTRITION_CARD');
      expect(result.payload?.token).toBe('UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD');
    });

    it('parses and validates HMAC-signed timed handoff token', () => {
      const submissionId = 'MH-PUN-081200-01';
      const docType = 'AADHAAR_FRONT';
      const futureTime = Date.now() + 3600 * 1000; // 1 hour in future

      const dataToSign = `${submissionId}_${docType}_${futureTime}`;
      const sig = crypto
        .createHmac('sha256', testSecret)
        .update(dataToSign)
        .digest('hex')
        .substring(0, 16);

      const tokenString = `UPLOAD_${submissionId}_${docType}_${futureTime}_${sig}`;
      const result = parseHandoffToken(`Document: ${tokenString}`, testSecret);

      expect(result.valid).toBe(true);
      expect(result.payload?.submissionId).toBe(submissionId);
      expect(result.payload?.documentType).toBe('AADHAAR_FRONT');
    });

    it('rejects expired handoff token fail-closed', () => {
      const submissionId = 'MH-PUN-081200-01';
      const docType = 'BANK_PASSBOOK';
      const pastTime = Date.now() - 3600 * 1000; // 1 hour ago

      const dataToSign = `${submissionId}_${docType}_${pastTime}`;
      const sig = crypto
        .createHmac('sha256', testSecret)
        .update(dataToSign)
        .digest('hex')
        .substring(0, 16);

      const tokenString = `UPLOAD_${submissionId}_${docType}_${pastTime}_${sig}`;
      const result = parseHandoffToken(tokenString, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('rejects tampered token signature fail-closed', () => {
      const submissionId = 'MH-PUN-081200-01';
      const docType = 'INCOME_CERTIFICATE';
      const futureTime = Date.now() + 3600 * 1000;

      const tamperedSig = 'badf00dbadf00d00';
      const tokenString = `UPLOAD_${submissionId}_${docType}_${futureTime}_${tamperedSig}`;
      const result = parseHandoffToken(tokenString, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid handoff token signature');
    });

    it('rejects missing or non-matching token string', () => {
      expect(parseHandoffToken('').valid).toBe(false);
      expect(parseHandoffToken('Here is my photo please accept').valid).toBe(false);
    });
  });

  describe('2. Path Sanitization & Traversal Prevention', () => {
    it('sanitizes directory traversal characters from child names and submission IDs', () => {
      expect(sanitizePathSegment('../../../etc/passwd')).toBe('etcpasswd');
      expect(sanitizePathSegment('..\\..\\windows\\system32')).toBe('windowssystem32');
      expect(sanitizePathSegment('<script>alert("xss")</script>')).toBe('scriptalert(xss)script');
      expect(sanitizePathSegment('Baby  Ananya / Pune : MH')).toBe('Baby Ananya Pune MH');
      expect(sanitizePathSegment('')).toBe('UNKNOWN');
    });

    it('masks phone numbers safely for DPDP compliance', () => {
      expect(maskPhoneNumber('919876543210')).toBe('******3210');
      expect(maskPhoneNumber('+91 98765-43210')).toBe('******3210');
      expect(maskPhoneNumber('123')).toBe('******');
      expect(maskPhoneNumber('')).toBe('******');
    });
  });

  describe('3. Size Bounds & MIME Allowlist Enforcement', () => {
    it('accepts valid 1MB JPEG image within 10MB bounds', async () => {
      const mediaId = 'media-img-001';
      const imageBytes = Buffer.alloc(1024 * 1024, 0xff); // 1 MB
      mockTransport.registerMedia(mediaId, imageBytes, 'image/jpeg');

      const incomingItem: IncomingWhatsAppMediaItem = {
        mediaId,
        mimeType: 'image/jpeg',
        caption: 'Uploaded document UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD',
        senderPhone: '919876543210',
      };

      const result = await processIncomingWhatsAppDocument(incomingItem, {
        transport: mockTransport,
        storage: mockStorage,
        childName: 'Baby Ananya',
      });

      expect(result.status).toBe('STORED');
      expect(result.asset).toBeDefined();
      expect(result.asset?.byteSize).toBe(1024 * 1024);
      expect(result.asset?.mimeType).toBe('image/jpeg');
      expect(result.asset?.folderName).toBe('Baby Ananya - BEN-SYN-001');
      expect(result.senderPhoneMasked).toBe('******3210');
      expect(mockStorage.storedAssets.length).toBe(1);
    });

    it('accepts valid PDF document within 10MB bounds', async () => {
      const mediaId = 'media-pdf-002';
      const pdfBytes = Buffer.from('%PDF-1.4\n%synthetic-nutrition-card\n%%EOF');
      mockTransport.registerMedia(mediaId, pdfBytes, 'application/pdf');

      const incomingItem: IncomingWhatsAppMediaItem = {
        mediaId,
        mimeType: 'application/pdf',
        caption: 'Nutrition Card UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD',
        senderPhone: '919876543210',
      };

      const result = await processIncomingWhatsAppDocument(incomingItem, {
        transport: mockTransport,
        storage: mockStorage,
        childName: 'Baby Ananya',
      });

      expect(result.status).toBe('STORED');
      expect(result.asset?.mimeType).toBe('application/pdf');
      expect(result.asset?.filename).toMatch(/^NUTRITION_CARD_\d+\.pdf$/);
    });

    it('rejects payload exceeding 10MB ceiling fail-closed', async () => {
      const mediaId = 'media-oversized-003';
      const oversizedBytes = Buffer.alloc(MAX_MEDIA_BYTES + 1024, 0x00); // 10MB + 1KB
      mockTransport.registerMedia(mediaId, oversizedBytes, 'image/png');

      const incomingItem: IncomingWhatsAppMediaItem = {
        mediaId,
        mimeType: 'image/png',
        caption: 'Big file UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD',
        senderPhone: '919876543210',
      };

      const result = await processIncomingWhatsAppDocument(incomingItem, {
        transport: mockTransport,
        storage: mockStorage,
      });

      expect(result.status).toBe('REJECTED_PAYLOAD_TOO_LARGE');
      expect(result.errorDetails).toContain('exceeds maximum permitted ceiling');
      expect(mockStorage.storedAssets.length).toBe(0);
    });

    it('rejects unsupported executable or script MIME type fail-closed', async () => {
      const mediaId = 'media-bad-mime-004';
      const maliciousBytes = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      mockTransport.registerMedia(mediaId, maliciousBytes, 'application/x-msdownload');

      const incomingItem: IncomingWhatsAppMediaItem = {
        mediaId,
        mimeType: 'application/x-msdownload',
        caption: 'Upload UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD',
        senderPhone: '919876543210',
      };

      const result = await processIncomingWhatsAppDocument(incomingItem, {
        transport: mockTransport,
        storage: mockStorage,
      });

      expect(result.status).toBe('REJECTED_UNSUPPORTED_MIME');
      expect(result.errorDetails).toContain('Unsupported MIME type');
      expect(mockStorage.storedAssets.length).toBe(0);
    });
  });

  describe('4. SHA-256 Byte Integrity Verification', () => {
    it('approves document when provided SHA-256 matches downloaded bytes', async () => {
      const mediaId = 'media-hash-ok-005';
      const payload = Buffer.from('Verified Child Nutrition Card Data 2026');
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
      mockTransport.registerMedia(mediaId, payload, 'image/png');

      const incomingItem: IncomingWhatsAppMediaItem = {
        mediaId,
        mimeType: 'image/png',
        sha256,
        caption: 'Verified card UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD',
        senderPhone: '919876543210',
      };

      const result = await processIncomingWhatsAppDocument(incomingItem, {
        transport: mockTransport,
        storage: mockStorage,
      });

      expect(result.status).toBe('STORED');
      expect(result.asset?.sha256).toBe(sha256);
    });

    it('rejects document when SHA-256 does not match downloaded bytes', async () => {
      const mediaId = 'media-hash-bad-006';
      const payload = Buffer.from('Tampered content bytes');
      const badSha = '0000000000000000000000000000000000000000000000000000000000000000';
      mockTransport.registerMedia(mediaId, payload, 'image/png');

      const incomingItem: IncomingWhatsAppMediaItem = {
        mediaId,
        mimeType: 'image/png',
        sha256: badSha,
        caption: 'Card UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD',
        senderPhone: '919876543210',
      };

      const result = await processIncomingWhatsAppDocument(incomingItem, {
        transport: mockTransport,
        storage: mockStorage,
      });

      expect(result.status).toBe('REJECTED_CHECKSUM_MISMATCH');
      expect(result.errorDetails).toContain('Checksum mismatch');
      expect(mockStorage.storedAssets.length).toBe(0);
    });
  });

  describe('5. Error Handling & Provider Fault Tolerance', () => {
    it('returns UPSTREAM_DOWNLOAD_FAILED when mediaId is not found or upstream fails', async () => {
      const incomingItem: IncomingWhatsAppMediaItem = {
        mediaId: 'non-existent-media-id',
        mimeType: 'image/jpeg',
        caption: 'Upload UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD',
        senderPhone: '919876543210',
      };

      const result = await processIncomingWhatsAppDocument(incomingItem, {
        transport: mockTransport,
        storage: mockStorage,
      });

      expect(result.status).toBe('UPSTREAM_DOWNLOAD_FAILED');
      expect(result.errorDetails).toContain('not found in mock transport');
    });

    it('returns STORAGE_FAILED when storage provider errors', async () => {
      const mediaId = 'media-storage-fail-007';
      const payload = Buffer.from('Valid file');
      mockTransport.registerMedia(mediaId, payload, 'image/jpeg');

      // Faulty storage provider
      const failingStorage = {
        storeAsset: async () => ({ success: false, error: 'Google Drive quota exceeded' }),
      };

      const incomingItem: IncomingWhatsAppMediaItem = {
        mediaId,
        mimeType: 'image/jpeg',
        caption: 'Upload UPLOAD_SYNTH_BEN-SYN-001_NUTRITION-CARD',
        senderPhone: '919876543210',
      };

      const result = await processIncomingWhatsAppDocument(incomingItem, {
        transport: mockTransport,
        storage: failingStorage,
      });

      expect(result.status).toBe('STORAGE_FAILED');
      expect(result.errorDetails).toContain('Google Drive quota exceeded');
    });
  });
});
