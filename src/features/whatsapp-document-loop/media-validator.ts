import crypto from 'crypto';

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export const MAX_DOCUMENT_BYTE_SIZE = 15 * 1024 * 1024; // 15 MB limit aligned with database constraint

export interface MediaValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly code?: 'INVALID_MIME' | 'EXCEEDS_SIZE' | 'INVALID_CHECKSUM' | 'EMPTY_FILE';
}

export class MediaValidator {
  /**
   * Validates media MIME type, byte size ceiling, and SHA-256 cryptographic checksum.
   */
  public validateMedia(
    mimeType: string,
    byteSize: number,
    sha256Checksum: string,
    rawBytes?: Buffer
  ): MediaValidationResult {
    // 1. MIME Type check
    const normalizedMime = mimeType.trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      return {
        valid: false,
        code: 'INVALID_MIME',
        error: `Unsupported file type "${mimeType}". Allowed: PDF, JPEG, PNG.`,
      };
    }

    // 2. Size check
    if (byteSize <= 0) {
      return {
        valid: false,
        code: 'EMPTY_FILE',
        error: 'Uploaded media file is empty (0 bytes).',
      };
    }

    if (byteSize > MAX_DOCUMENT_BYTE_SIZE) {
      return {
        valid: false,
        code: 'EXCEEDS_SIZE',
        error: `File size (${(byteSize / 1024 / 1024).toFixed(2)} MB) exceeds maximum 15 MB limit.`,
      };
    }

    // 3. SHA-256 Checksum structure check (64 hex characters)
    const normalizedChecksum = sha256Checksum.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedChecksum)) {
      return {
        valid: false,
        code: 'INVALID_CHECKSUM',
        error: 'Invalid SHA-256 checksum format. Must be 64 hexadecimal characters.',
      };
    }

    // 4. Actual byte verification if buffer provided
    if (rawBytes) {
      const calculated = crypto.createHash('sha256').update(rawBytes).digest('hex');
      if (calculated.toLowerCase() !== normalizedChecksum) {
        return {
          valid: false,
          code: 'INVALID_CHECKSUM',
          error: `Integrity check failed: Checksum mismatch between declared hash and received bytes.`,
        };
      }
    }

    return { valid: true };
  }
}
