/**
 * Media Processing & Storage Linkage Service
 *
 * Owned by: Apps Script / Backend Lead (feat/staging-destination-hardening)
 * Consumes: Verified media references from WhatsApp Webhook Ingress or Staff Upload
 * Produces: Stored document in Google Drive folder ("<ChildName> - <UniqueID>")
 *           and updated canonical linelist cell reference.
 *
 * Safety & Security Guarantees:
 * 1. Fail-closed destination validation (staging environment cannot target operational folders).
 * 2. File size ceiling strictly <= 10MB (HTTP 413 / REJECTED_OVERSIZE).
 * 3. MIME allowlisting (JPEG, PNG, WebP, PDF).
 * 4. SHA-256 integrity verification before storage.
 * 5. DPDP-compliant diagnostic logging (no raw biometric/identity data in stdout).
 */

import crypto from 'crypto';

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 Megabytes

export const ALLOWED_MEDIA_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMediaMime = (typeof ALLOWED_MEDIA_MIMES)[number];

export type BeneficiaryDocumentType =
  | 'passbookPhoto'
  | 'aadhaarCardPhoto'
  | 'childPhoto'
  | 'feeReceiptPhoto'
  | 'marksheetPhoto'
  | 'caregiverSignature'
  | 'nutritionCard';

export interface MediaProcessingJob {
  readonly jobId: string;
  readonly mediaId: string;
  readonly mimeType: string;
  readonly expectedSha256?: string;
  readonly targetSubmissionId: string;
  readonly targetChildName: string;
  readonly documentType: BeneficiaryDocumentType;
  readonly sourceOrigin: 'META_WHATSAPP_WEBHOOK' | 'STAFF_DIRECT_UPLOAD' | 'SYNTHETIC_TEST';
}

export type MediaProcessingStatus =
  | 'STORED_AND_LINKED'
  | 'REJECTED_CHECKSUM_MISMATCH'
  | 'REJECTED_OVERSIZE'
  | 'REJECTED_UNSUPPORTED_MIME'
  | 'REJECTED_DESTINATION_VIOLATION'
  | 'FAILED';

export interface MediaProcessingResult {
  readonly status: MediaProcessingStatus;
  readonly jobId: string;
  readonly mediaId: string;
  readonly targetSubmissionId: string;
  readonly documentType: BeneficiaryDocumentType;
  readonly storagePath?: string;
  readonly driveFileId?: string;
  readonly proxyUrl?: string;
  readonly byteSize?: number;
  readonly calculatedSha256?: string;
  readonly processedAt: string;
  readonly errorDetails?: string;
}

/**
 * Interface for downloading media bytes from external or mock providers.
 */
export interface MediaByteDownloader {
  downloadMedia(mediaId: string): Promise<{
    buffer: Buffer;
    byteSize: number;
    mimeType: string;
    sha256: string;
  }>;
}

/**
 * Interface for target Drive/Linelist storage adapter.
 */
export interface DocumentStorageSink {
  storeDocument(params: {
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
    isDestinationViolation?: boolean;
  }>;
}

/**
 * In-memory Mock Downloader for unit and staging simulation tests.
 */
export class MockMediaByteDownloader implements MediaByteDownloader {
  private mediaStore = new Map<string, { buffer: Buffer; mimeType: string }>();

  public registerMedia(mediaId: string, content: Buffer | string, mimeType: string = 'image/jpeg'): string {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    this.mediaStore.set(mediaId, { buffer, mimeType });
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  public async downloadMedia(mediaId: string): Promise<{
    buffer: Buffer;
    byteSize: number;
    mimeType: string;
    sha256: string;
  }> {
    const item = this.mediaStore.get(mediaId);
    if (!item) {
      throw new Error(`Media not found for mediaId: "${mediaId}".`);
    }
    const sha256 = crypto.createHash('sha256').update(item.buffer).digest('hex');
    return {
      buffer: item.buffer,
      byteSize: item.buffer.length,
      mimeType: item.mimeType,
      sha256,
    };
  }

  public clear(): void {
    this.mediaStore.clear();
  }
}

/**
 * Mock / Staging Storage Sink with destination guard enforcement.
 */
export class MockDocumentStorageSink implements DocumentStorageSink {
  public storedDocuments: Array<{
    targetSubmissionId: string;
    targetChildName: string;
    documentType: BeneficiaryDocumentType;
    filename: string;
    storagePath: string;
    byteSize: number;
  }> = [];

  public async storeDocument(params: {
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
    isDestinationViolation?: boolean;
  }> {
    // Staging isolation guard: Reject attempts to write to operational destinations
    if (params.appEnv === 'staging' && params.targetSubmissionId.startsWith('PROD-LIVE-')) {
      return {
        success: false,
        isDestinationViolation: true,
        error: 'Destination guard rejection: Staging environment attempted to target operational production record.',
      };
    }

    const sanitizedChildName = params.targetChildName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'Beneficiary';
    const folderPath = `${sanitizedChildName} - ${params.targetSubmissionId}`;
    const storagePath = `${folderPath}/${params.filename}`;
    const driveFileId = `drive-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const proxyUrl = `/api/submissions/${encodeURIComponent(params.targetSubmissionId)}/asset?docType=${params.documentType}`;

    this.storedDocuments.push({
      targetSubmissionId: params.targetSubmissionId,
      targetChildName: params.targetChildName,
      documentType: params.documentType,
      filename: params.filename,
      storagePath,
      byteSize: params.buffer.length,
    });

    return {
      success: true,
      driveFileId,
      storagePath,
      proxyUrl,
    };
  }

  public clear(): void {
    this.storedDocuments = [];
  }
}

/**
 * Core Media Processing Pipeline:
 * 1. Downloads media bytes via downloader interface.
 * 2. Enforces maximum size bounds (<= 10MB).
 * 3. Enforces MIME allowlist.
 * 4. Verifies SHA-256 integrity against expected hash if provided.
 * 5. Calls storage sink to upload bytes to child folder and register proxy URL.
 */
export async function processBeneficiaryMedia(
  job: MediaProcessingJob,
  downloader: MediaByteDownloader,
  storage: DocumentStorageSink,
  appEnv: string = process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'staging'
): Promise<MediaProcessingResult> {
  const processedAt = new Date().toISOString();

  // 1. Download media bytes
  let downloaded: { buffer: Buffer; byteSize: number; mimeType: string; sha256: string };
  try {
    downloaded = await downloader.downloadMedia(job.mediaId);
  } catch (err: any) {
    return {
      status: 'FAILED',
      jobId: job.jobId,
      mediaId: job.mediaId,
      targetSubmissionId: job.targetSubmissionId,
      documentType: job.documentType,
      processedAt,
      errorDetails: `Media download failed: ${err.message}`,
    };
  }

  // 2. Enforce byte size ceiling (<= 10MB)
  if (downloaded.byteSize > MAX_MEDIA_BYTES) {
    return {
      status: 'REJECTED_OVERSIZE',
      jobId: job.jobId,
      mediaId: job.mediaId,
      targetSubmissionId: job.targetSubmissionId,
      documentType: job.documentType,
      byteSize: downloaded.byteSize,
      processedAt,
      errorDetails: `Media size ${downloaded.byteSize} bytes exceeds maximum allowed limit of ${MAX_MEDIA_BYTES} bytes (10MB).`,
    };
  }

  // 3. Enforce MIME allowlist
  const normalizedMime = (downloaded.mimeType || job.mimeType || '').toLowerCase().trim();
  const isAllowedMime = ALLOWED_MEDIA_MIMES.some((m) => m === normalizedMime);
  if (!isAllowedMime) {
    return {
      status: 'REJECTED_UNSUPPORTED_MIME',
      jobId: job.jobId,
      mediaId: job.mediaId,
      targetSubmissionId: job.targetSubmissionId,
      documentType: job.documentType,
      processedAt,
      errorDetails: `Unsupported media MIME type "${normalizedMime}". Permitted: ${ALLOWED_MEDIA_MIMES.join(', ')}.`,
    };
  }

  // 4. Verify SHA-256 integrity
  const calculatedSha256 = crypto.createHash('sha256').update(downloaded.buffer).digest('hex');
  if (job.expectedSha256 && job.expectedSha256.toLowerCase() !== calculatedSha256.toLowerCase()) {
    return {
      status: 'REJECTED_CHECKSUM_MISMATCH',
      jobId: job.jobId,
      mediaId: job.mediaId,
      targetSubmissionId: job.targetSubmissionId,
      documentType: job.documentType,
      calculatedSha256,
      processedAt,
      errorDetails: `SHA-256 checksum mismatch. Expected: ${job.expectedSha256}, Calculated: ${calculatedSha256}.`,
    };
  }

  // Determine safe extension
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  const ext = extMap[normalizedMime] || 'bin';
  const filename = `${job.documentType}_${Date.now()}.${ext}`;

  // 5. Store document in Drive folder and update linelist link
  const storeResult = await storage.storeDocument({
    targetSubmissionId: job.targetSubmissionId,
    targetChildName: job.targetChildName,
    documentType: job.documentType,
    filename,
    mimeType: normalizedMime,
    buffer: downloaded.buffer,
    appEnv,
  });

  if (!storeResult.success) {
    if (storeResult.isDestinationViolation) {
      return {
        status: 'REJECTED_DESTINATION_VIOLATION',
        jobId: job.jobId,
        mediaId: job.mediaId,
        targetSubmissionId: job.targetSubmissionId,
        documentType: job.documentType,
        calculatedSha256,
        byteSize: downloaded.byteSize,
        processedAt,
        errorDetails: storeResult.error || 'Destination guard violation.',
      };
    }

    return {
      status: 'FAILED',
      jobId: job.jobId,
      mediaId: job.mediaId,
      targetSubmissionId: job.targetSubmissionId,
      documentType: job.documentType,
      calculatedSha256,
      byteSize: downloaded.byteSize,
      processedAt,
      errorDetails: storeResult.error || 'Document storage failed.',
    };
  }

  return {
    status: 'STORED_AND_LINKED',
    jobId: job.jobId,
    mediaId: job.mediaId,
    targetSubmissionId: job.targetSubmissionId,
    documentType: job.documentType,
    storagePath: storeResult.storagePath,
    driveFileId: storeResult.driveFileId,
    proxyUrl: storeResult.proxyUrl,
    byteSize: downloaded.byteSize,
    calculatedSha256,
    processedAt,
  };
}
