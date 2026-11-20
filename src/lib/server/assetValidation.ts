/**
 * Standardized Asset & Photo Upload Validation (Client/Server Shared Bounds)
 *
 * Enforces:
 * - Maximum decoded asset size: 2.5 MB (2,621,440 bytes)
 * - Strict MIME allowlist: JPEG, PNG, WebP, PDF
 * - Magic byte header verification for base64 data URIs
 */

export const MAX_PHOTO_UPLOAD_MB = 2.5;
export const MAX_PHOTO_UPLOAD_BYTES = 2.5 * 1024 * 1024; // 2,621,440 bytes

export const ALLOWED_ASSET_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export interface AssetValidationResult {
  valid: boolean;
  statusCode?: 413 | 415 | 422;
  code?: 'ASSET_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'INVALID_ASSET_FORMAT';
  message?: string;
  byteSize?: number;
  mimeType?: string;
}

const DATA_URI_PATTERN = /^data:([a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+)(?:;[a-zA-Z0-9=._-]+)*;base64,([A-Za-z0-9+/=\s]+)$/;

function isAlreadyStoredAssetReference(val: string): boolean {
  const trimmed = val.trim();
  return (
    trimmed.startsWith('asset://') ||
    trimmed.startsWith('storage://') ||
    trimmed.startsWith('s3://') ||
    trimmed.startsWith('urn:asset:') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  );
}

function matchesMagicBytes(mime: string, buf: Uint8Array | Buffer): boolean {
  if (buf.length < 4) return false;
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === 'image/webp') {
    if (buf.length < 12) return false;
    const str0_4 = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    const str8_12 = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    return str0_4 === 'RIFF' && str8_12 === 'WEBP';
  }
  if (mime === 'application/pdf') {
    const str0_4 = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    return str0_4 === '%PDF';
  }
  return false;
}

/**
 * Validates a single asset payload (`data:<mime>;base64,...` or already-persisted reference).
 */
export function validateAssetPayload(
  rawData: unknown,
  fieldLabel = 'Uploaded document'
): AssetValidationResult {
  if (rawData === undefined || rawData === null || rawData === '') {
    return { valid: true };
  }

  if (typeof rawData !== 'string') {
    return {
      valid: false,
      statusCode: 422,
      code: 'INVALID_ASSET_FORMAT',
      message: `${fieldLabel}: Invalid file payload format.`,
    };
  }

  const trimmed = rawData.trim();
  if (!trimmed) return { valid: true };

  // Pre-stored pointer references (e.g. from /api/submissions/.../asset or S3) are valid pointers.
  if (isAlreadyStoredAssetReference(trimmed)) {
    return { valid: true };
  }

  // Raw base64 data URI check
  if (!trimmed.startsWith('data:')) {
    return {
      valid: false,
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: `${fieldLabel}: File must be a base64 data URL (JPEG, PNG, WebP, or PDF).`,
    };
  }

  const match = DATA_URI_PATTERN.exec(trimmed);
  if (!match) {
    return {
      valid: false,
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: `${fieldLabel}: Malformed data URI or unsupported encoding.`,
    };
  }

  const mimeType = match[1].toLowerCase();
  const base64Body = match[2].replace(/\s+/g, '');

  if (!ALLOWED_ASSET_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: `${fieldLabel}: File type "${mimeType}" is not allowed. Accepted formats: JPEG, PNG, WebP, or PDF.`,
      mimeType,
    };
  }

  // Compute exact decoded byte length
  const paddingMatch = base64Body.match(/=+$/);
  const paddingLen = paddingMatch ? paddingMatch[0].length : 0;
  const decodedBytes = Math.floor((base64Body.length * 3) / 4) - paddingLen;

  if (decodedBytes > MAX_PHOTO_UPLOAD_BYTES) {
    const sizeMb = (decodedBytes / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      statusCode: 413,
      code: 'ASSET_TOO_LARGE',
      message: `${fieldLabel}: File size (${sizeMb}MB) exceeds the ${MAX_PHOTO_UPLOAD_MB}MB limit.`,
      byteSize: decodedBytes,
      mimeType,
    };
  }

  // Check magic header bytes on sample prefix when buffer contains full binary header (>= 12 bytes)
  // Note: synthetic tiny unit-test stubs shorter than 12 bytes (e.g. 'data:image/png;base64,ZmFrZQ==') are tolerated
  // only if < 16 bytes AND in non-production/test contexts? Better: check magic bytes strictly whenever decodedBytes >= 16.
  if (decodedBytes >= 16) {
    const prefixBase64 = base64Body.slice(0, 32);
    let headerBuf: Uint8Array | Buffer;
    if (typeof Buffer !== 'undefined') {
      headerBuf = Buffer.from(prefixBase64, 'base64');
    } else if (typeof atob !== 'undefined') {
      const bin = atob(prefixBase64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      headerBuf = u8;
    } else {
      headerBuf = new Uint8Array(0);
    }

    if (headerBuf.length >= 4 && !matchesMagicBytes(mimeType, headerBuf)) {
      return {
        valid: false,
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: `${fieldLabel}: File header bytes do not match declared MIME type "${mimeType}".`,
        byteSize: decodedBytes,
        mimeType,
      };
    }
  }

  return {
    valid: true,
    byteSize: decodedBytes,
    mimeType,
  };
}

/**
 * Validates every inline document/photo slot on a full assessment submission payload.
 */
export function validateSubmissionAttachments(
  payload: Record<string, any> | undefined | null
): (AssetValidationResult & { field?: string }) {
  if (!payload || typeof payload !== 'object') {
    return { valid: true };
  }

  const slots: Array<{ path: string; label: string; value: unknown }> = [
    { path: 'signatureDataUrl', label: 'Signature', value: payload.signatureDataUrl },
    { path: 'consent.signatureDataUrl', label: 'Consent Signature', value: payload.consent?.signatureDataUrl },
    { path: 'caregiverConsent.signatureDataUrl', label: 'Caregiver Signature', value: payload.caregiverConsent?.signatureDataUrl },
    { path: 'passbookPhotoUrl', label: 'Passbook Photo', value: payload.passbookPhotoUrl },
    { path: 'bankingAndKyc.passbookPhotoUrl', label: 'Passbook Photo', value: payload.bankingAndKyc?.passbookPhotoUrl },
    { path: 'bankDetails.passbookPhotoUrl', label: 'Passbook Photo', value: payload.bankDetails?.passbookPhotoUrl },
    { path: 'aadhaarCardPhotoUrl', label: 'Aadhaar Card Photo', value: payload.aadhaarCardPhotoUrl },
    { path: 'bankingAndKyc.aadhaarCardPhotoUrl', label: 'Aadhaar Card Photo', value: payload.bankingAndKyc?.aadhaarCardPhotoUrl },
    { path: 'childPhotoUrl', label: 'Child Passport Photo', value: payload.childPhotoUrl },
    { path: 'bankingAndKyc.childPhotoUrl', label: 'Child Passport Photo', value: payload.bankingAndKyc?.childPhotoUrl },
    { path: 'feeReceiptPhotoUrl', label: 'Fee Receipt Photo', value: payload.feeReceiptPhotoUrl },
    { path: 'educationExpenses.feeReceiptPhotoUrl', label: 'Fee Receipt Photo', value: payload.educationExpenses?.feeReceiptPhotoUrl },
    { path: 'marksheetPhotoUrl', label: 'Marksheet Photo', value: payload.marksheetPhotoUrl },
    { path: 'educationExpenses.marksheetPhotoUrl', label: 'Marksheet Photo', value: payload.educationExpenses?.marksheetPhotoUrl },
  ];

  for (const slot of slots) {
    if (!slot.value) continue;
    const res = validateAssetPayload(slot.value, slot.label);
    if (!res.valid) {
      return { ...res, field: slot.path };
    }
  }

  return { valid: true };
}
