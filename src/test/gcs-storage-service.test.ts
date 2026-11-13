import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GcsStorageService,
  getStorageProvider,
  getStorageService,
  validateAttachmentMime,
  validateAttachmentExtension,
  uploadToGcsSignedUrl,
  MAX_ATTACHMENT_BYTES,
} from '@/lib/server/gcsStorageService';
import crypto from 'crypto';

describe('Google Cloud Storage Adapter (Task 3)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Storage Provider Switch & Factory', () => {
    it('should default to "tigris" when STORAGE_PROVIDER is unset', () => {
      delete process.env.STORAGE_PROVIDER;
      expect(getStorageProvider()).toBe('tigris');
    });

    it('should return "tigris" when STORAGE_PROVIDER=tigris', () => {
      process.env.STORAGE_PROVIDER = 'tigris';
      expect(getStorageProvider()).toBe('tigris');
    });

    it('should return "gcs" when STORAGE_PROVIDER=gcs', () => {
      process.env.STORAGE_PROVIDER = 'gcs';
      expect(getStorageProvider()).toBe('gcs');
    });

    it('should instantiate GcsStorageService when STORAGE_PROVIDER=gcs', async () => {
      process.env.STORAGE_PROVIDER = 'gcs';
      const service = await getStorageService();
      expect(service).toBeInstanceOf(GcsStorageService);
    });
  });

  describe('2. MIME & Extension Validation', () => {
    it('should allow whitelisted document MIME types', () => {
      expect(validateAttachmentMime('image/jpeg')).toBe(true);
      expect(validateAttachmentMime('image/png')).toBe(true);
      expect(validateAttachmentMime('image/webp')).toBe(true);
      expect(validateAttachmentMime('application/pdf')).toBe(true);
      expect(validateAttachmentMime('image/jpeg; charset=utf-8')).toBe(true);
    });

    it('should reject non-whitelisted MIME types', () => {
      expect(validateAttachmentMime('application/x-executable')).toBe(false);
      expect(validateAttachmentMime('text/html')).toBe(false);
      expect(validateAttachmentMime('application/javascript')).toBe(false);
      expect(validateAttachmentMime('video/mp4')).toBe(false);
      expect(validateAttachmentMime('')).toBe(false);
    });

    it('should allow valid file extensions', () => {
      expect(validateAttachmentExtension('passbook.jpg')).toBe(true);
      expect(validateAttachmentExtension('aadhaar.jpeg')).toBe(true);
      expect(validateAttachmentExtension('photo.png')).toBe(true);
      expect(validateAttachmentExtension('marksheet.pdf')).toBe(true);
      expect(validateAttachmentExtension('receipt.webp')).toBe(true);
    });

    it('should reject invalid or dangerous file extensions', () => {
      expect(validateAttachmentExtension('malware.exe')).toBe(false);
      expect(validateAttachmentExtension('script.sh')).toBe(false);
      expect(validateAttachmentExtension('exploit.html')).toBe(false);
      expect(validateAttachmentExtension('payload.bat')).toBe(false);
      expect(validateAttachmentExtension('')).toBe(false);
    });
  });

  describe('3. Deterministic Storage Key Scoping', () => {
    it('should build canonical storage key scoped to environment and submission ID', () => {
      const service = new GcsStorageService({
        appEnv: 'staging',
        bucketName: 'cs-p3-childcare-staging',
      });

      const key = service.buildStorageKey('CSC-2026-SUB-001', 'PassbookPhoto');
      expect(key).toBe('staging/documents/CSC-2026-SUB-001/PassbookPhoto.bin');
    });

    it('should sanitize unsafe characters in submissionId and docType', () => {
      const service = new GcsStorageService({
        appEnv: 'staging',
        bucketName: 'cs-p3-childcare-staging',
      });

      const key = service.buildStorageKey('SUB/2026..001*#', 'Doc/Type..jpg');
      expect(key).toBe('staging/documents/SUB_2026__001__/Doc_Type__jpg.bin');
    });
  });

  describe('4. Keyless Signed Upload URL Generation & Content-Length Range', () => {
    it('should generate valid v4 signed upload URL with 15-minute expiry and signed content-length-range header', async () => {
      const service = new GcsStorageService({
        bucketName: 'cs-p3-childcare-staging',
        clientEmail: 'csc-runtime@cs-p3-production.iam.gserviceaccount.com',
      });

      const res = await service.getSignedUploadUrl({
        submissionId: 'SUB-UPLOAD-01',
        docType: 'Passbook',
        contentType: 'image/jpeg',
        expiresInSeconds: 900,
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.bucketName).toBe('cs-p3-childcare-staging');
      expect(res.storageKey).toBe('staging/documents/SUB-UPLOAD-01/Passbook.bin');
      expect(res.url).toBeDefined();
      expect(res.url).toContain('https://storage.googleapis.com/cs-p3-childcare-staging');
      expect(res.url).toContain('X-Goog-Algorithm=GOOG4-RSA-SHA256');
      expect(res.url).toContain('X-Goog-Expires=900');
      // Must include x-goog-content-length-range in signed headers
      expect(res.url).toContain('x-goog-content-length-range');
      expect(res.contentLengthRange).toBe(`1,${MAX_ATTACHMENT_BYTES}`);
      expect(res.requiredHeaders).toEqual({
        'Content-Type': 'image/jpeg',
        'x-goog-content-length-range': `1,${MAX_ATTACHMENT_BYTES}`,
      });
    });

    it('should upload via uploadToGcsSignedUrl with required headers attached', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      });

      const res = await uploadToGcsSignedUrl({
        url: 'https://storage.googleapis.com/test-bucket/test.bin?X-Goog-Signature=mock',
        data: Buffer.from('test binary content'),
        contentType: 'image/jpeg',
        requiredHeaders: {
          'x-goog-content-length-range': `1,${MAX_ATTACHMENT_BYTES}`,
        },
        fetchFn: mockFetch as any,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('https://storage.googleapis.com/test-bucket/test.bin?X-Goog-Signature=mock');
      expect(calledOpts.method).toBe('PUT');
      expect(calledOpts.headers['Content-Type']).toBe('image/jpeg');
      expect(calledOpts.headers['x-goog-content-length-range']).toBe(`1,${MAX_ATTACHMENT_BYTES}`);
    });

    it('should reject oversized payload (> 3145728 bytes) in uploadToGcsSignedUrl with HTTP 413', async () => {
      const mockFetch = vi.fn();
      const largeData = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1024);

      const res = await uploadToGcsSignedUrl({
        url: 'https://storage.googleapis.com/test-bucket/test.bin?X-Goog-Signature=mock',
        data: largeData,
        contentType: 'image/jpeg',
        fetchFn: mockFetch as any,
      });

      expect(res.status).toBe(413);
      expect(res.statusText).toBe('Payload Too Large');
      const body = await res.json();
      expect(body.error).toBe('EntityTooLarge');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject signed upload URL request with unsupported MIME type', async () => {
      const service = new GcsStorageService({
        bucketName: 'cs-p3-childcare-staging',
      });

      const res = await service.getSignedUploadUrl({
        submissionId: 'SUB-BAD-01',
        docType: 'Script',
        contentType: 'application/x-executable',
      });

      expect(res.status).toBe('REJECTED_UNSUPPORTED_MIME');
      expect(res.url).toBeUndefined();
      expect(res.error).toContain('Unsupported MIME type');
    });

    it('should cap signed URL expiration to maximum 15 minutes (900 seconds)', async () => {
      const service = new GcsStorageService();

      const res = await service.getSignedUploadUrl({
        submissionId: 'SUB-EXPIRY-01',
        docType: 'Marksheet',
        contentType: 'application/pdf',
        expiresInSeconds: 3600, // Attempt 1 hour
      });

      expect(res.status).toBe('SUCCESS');
      // URL must enforce 900s ceiling
      expect(res.url).toContain('X-Goog-Expires=900');
    });
  });

  describe('5. Keyless Signed Download URL Generation', () => {
    it('should generate valid v4 signed download URL', async () => {
      const service = new GcsStorageService({
        bucketName: 'cs-p3-childcare-staging',
      });

      const targetRef = 'gcs://cs-p3-childcare-staging/staging/documents/SUB-DOWNLOAD-01/Passbook.bin';
      const downloadUrl = await service.getSignedDownloadUrl(targetRef, 900);

      expect(downloadUrl).toBeDefined();
      expect(downloadUrl).toContain('https://storage.googleapis.com/cs-p3-childcare-staging/staging/documents/SUB-DOWNLOAD-01/Passbook.bin');
      expect(downloadUrl).toContain('X-Goog-Algorithm=GOOG4-RSA-SHA256');
      expect(downloadUrl).toContain('X-Goog-Expires=900');
    });
  });

  describe('6. Direct Binary Upload & Fetch Lifecycle', () => {
    it('should store and retrieve binary attachments with SHA-256 integrity verification', async () => {
      const service = new GcsStorageService({
        bucketName: 'cs-p3-childcare-staging',
      });

      const buffer = Buffer.from('Mock JPEG binary image data for testing');
      const expectedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      // Upload
      const uploadRes = await service.uploadAttachment({
        submissionId: 'SUB-BIN-01',
        docType: 'Passbook',
        buffer,
        contentType: 'image/jpeg',
        expectedSha256,
      });

      expect(uploadRes.status).toBe('STORED_PRIVATE');
      expect(uploadRes.calculatedSha256).toBe(expectedSha256);
      expect(uploadRes.privateUri).toBe('gcs://cs-p3-childcare-staging/staging/documents/SUB-BIN-01/Passbook.bin');

      // Head
      const exists = await service.headAttachment(uploadRes.privateUri);
      expect(exists).toBe(true);

      // Fetch
      const fetchRes = await service.fetchAttachment(uploadRes.privateUri);
      expect(fetchRes.status).toBe('SUCCESS');
      expect(fetchRes.buffer?.toString()).toBe('Mock JPEG binary image data for testing');
      expect(fetchRes.sha256).toBe(expectedSha256);
      expect(fetchRes.contentType).toBe('image/jpeg');
    });

    it('should reject attachment exceeding maximum size limit', async () => {
      const service = new GcsStorageService();
      const largeBuffer = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1024);

      const res = await service.uploadAttachment({
        submissionId: 'SUB-OVERSIZE-01',
        docType: 'Marksheet',
        buffer: largeBuffer,
        contentType: 'application/pdf',
      });

      expect(res.status).toBe('REJECTED_OVERSIZE');
      expect(res.error).toContain('exceeds maximum limit');
    });

    it('should reject attachment with mismatched SHA-256 checksum', async () => {
      const service = new GcsStorageService();
      const buffer = Buffer.from('Legitimate data');

      const res = await service.uploadAttachment({
        submissionId: 'SUB-CORRUPT-01',
        docType: 'Photo',
        buffer,
        contentType: 'image/png',
        expectedSha256: 'deadbeef00000000000000000000000000000000000000000000000000000000',
      });

      expect(res.status).toBe('REJECTED_CHECKSUM_MISMATCH');
      expect(res.error).toContain('did not match expected SHA-256');
    });
  });
});
