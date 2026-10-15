import crypto from 'crypto';

/**
 * Documented File Size Policies per Channel / Media Format:
 * - Images (JPEG, PNG): 10 MB ceiling (WhatsApp photo channel & mobile bandwidth policy)
 * - Documents (PDF): 15 MB ceiling (WhatsApp document channel, multi-page passbooks/receipts, Supabase DB limit)
 */
export const MAX_IMAGE_BYTE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_DOCUMENT_BYTE_SIZE = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export interface MediaValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly code?:
    | 'INVALID_MIME'
    | 'EXCEEDS_SIZE'
    | 'INVALID_CHECKSUM'
    | 'EMPTY_FILE'
    | 'MAGIC_BYTES_MISMATCH';
}

/**
 * Magic bytes file signatures:
 * - JPEG: 0xFF, 0xD8, 0xFF
 * - PNG: 0x89, 0x50, 0x4E, 0x47 (0x89, 'P', 'N', 'G')
 * - PDF: 0x25, 0x50, 0x44, 0x46 ('%PDF')
 */
export function checkMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;

  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 && // P
        buffer[2] === 0x4e && // N
        buffer[3] === 0x47 // G
      );
    case 'application/pdf':
      return (
        buffer[0] === 0x25 && // %
        buffer[1] === 0x50 && // P
        buffer[2] === 0x44 && // D
        buffer[3] === 0x46 // F
      );
    default:
      return false;
  }
}

export class MediaValidator {
  /**
   * Validates media MIME type, channel-specific byte size ceiling, SHA-256 cryptographic checksum,
   * and content signature (magic bytes).
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

    // 2. Channel & format specific size check
    if (byteSize <= 0) {
      return {
        valid: false,
        code: 'EMPTY_FILE',
        error: 'Uploaded media file is empty (0 bytes).',
      };
    }

    const maxSize =
      normalizedMime === 'application/pdf'
        ? MAX_DOCUMENT_BYTE_SIZE
        : MAX_IMAGE_BYTE_SIZE;

    if (byteSize > maxSize) {
      const maxMb = (maxSize / (1024 * 1024)).toFixed(0);
      return {
        valid: false,
        code: 'EXCEEDS_SIZE',
        error: `File size (${(byteSize / 1024 / 1024).toFixed(2)} MB) exceeds channel maximum ${maxMb} MB limit.`,
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

    // 4. Actual byte verification and magic bytes inspection if buffer provided
    if (rawBytes) {
      const calculated = crypto.createHash('sha256').update(rawBytes).digest('hex');
      if (calculated.toLowerCase() !== normalizedChecksum) {
        return {
          valid: false,
          code: 'INVALID_CHECKSUM',
          error: `Integrity check failed: Checksum mismatch between declared hash and received bytes.`,
        };
      }

      // 5. Magic bytes content verification
      if (!checkMagicBytes(rawBytes, normalizedMime)) {
        return {
          valid: false,
          code: 'MAGIC_BYTES_MISMATCH',
          error: `Content inspection failed: File bytes signature does not match declared MIME type "${normalizedMime}".`,
        };
      }
    }

    return { valid: true };
  }
}
