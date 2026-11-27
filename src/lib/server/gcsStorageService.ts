/**
 * Google Cloud Storage (GCS) Adapter
 *
 * Implements private binary document storage and signed URL generation targeting
 * Google Cloud Storage in region asia-south1 (staging bucket: cs-p3-childcare-staging).
 *
 * Safety & Architecture Invariants:
 * 1. Storage Provider Switch: STORAGE_PROVIDER=tigris (default) | gcs.
 * 2. Keyless Signed URLs: Utilizes Cloud Run service account ADC identity via IAM signBlob
 *    (roles/iam.serviceAccountTokenCreator), eliminating private key files.
 * 3. Short Expiry Windows: Signed upload & download URLs are strictly capped at <= 15 minutes (900 seconds).
 * 4. MIME & Extension Enforcement: Whitelists image/jpeg, image/png, image/webp, application/pdf.
 * 5. Deterministic Key Scoping: staging/documents/<submissionId>/<docType>.bin.
 * 6. Test & Offline Isolation: In-memory/mock signer when running unit tests or offline.
 */

import crypto from 'crypto';
import type {
  UploadAttachmentInput,
  UploadAttachmentResult,
  FetchAttachmentResult,
} from './tigrisStorageService';
import {
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_MIMES,
  AllowedAttachmentMime,
} from './tigrisStorageService';

export { MAX_ATTACHMENT_BYTES, ALLOWED_ATTACHMENT_MIMES };
export type { AllowedAttachmentMime, UploadAttachmentInput, UploadAttachmentResult, FetchAttachmentResult };

export interface GcsStorageConfig {
  bucketName: string;
  projectId?: string;
  clientEmail?: string;
  appEnv?: string;
}

export interface SignedUrlRequest {
  submissionId: string;
  docType: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface SignedUrlResult {
  status: 'SUCCESS' | 'REJECTED_UNSUPPORTED_MIME' | 'INVALID_INPUT' | 'FAILED';
  url?: string;
  storageKey: string;
  bucketName: string;
  contentType: string;
  expiresAt: string;
  contentLengthRange?: string;
  requiredHeaders?: Record<string, string>;
  error?: string;
}

export interface GcsUploadAttachmentInput extends UploadAttachmentInput {
  storageKey?: string;
  fileName?: string;
}

export interface DeleteAttachmentResult {
  status: 'DELETED' | 'NOT_FOUND' | 'FAILED';
  bucketName: string;
  storageKey: string;
  error?: string;
}

export function getStorageProvider(): 'tigris' | 'gcs' {
  const provider = (process.env.STORAGE_PROVIDER || 'tigris').toLowerCase().trim();
  if (provider === 'gcs') {
    return 'gcs';
  }
  return 'tigris';
}

export function normalizeAttachmentMime(contentType: string): string {
  if (!contentType || typeof contentType !== 'string') return '';
  const raw = contentType.toLowerCase().trim().split(';')[0].trim();
  if (raw === 'image/jpg') return 'image/jpeg';
  return raw;
}

export function extensionForAttachmentMime(contentType: string): string {
  const mime = normalizeAttachmentMime(contentType);
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  return 'bin';
}

export function sanitizeGcsFilename(
  fileName: string | undefined,
  contentType: string,
  fallbackBase: string = 'document'
): string {
  const cleanBase = (fallbackBase || 'document').replace(/[^a-zA-Z0-9_-]/g, '_') || 'document';
  const ext = extensionForAttachmentMime(contentType);
  const rawName = (fileName || '').trim().split(/[\\/]/).pop() || '';
  if (!rawName) {
    return `${cleanBase}.${ext}`;
  }
  const cleanName = rawName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^_+/, '');
  if (!cleanName || cleanName === '.' || cleanName === '_') {
    return `${cleanBase}.${ext}`;
  }
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(cleanName) && ext !== 'bin') {
    return `${cleanName}.${ext}`;
  }
  return cleanName;
}

export function validateAttachmentMime(contentType: string): boolean {
  const normalized = normalizeAttachmentMime(contentType);
  if (!normalized) return false;
  return ALLOWED_ATTACHMENT_MIMES.some((m) => normalized.startsWith(m));
}

export function validateAttachmentExtension(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  const lower = filename.toLowerCase().trim();
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.pdf')
  );
}

export function validateGcsBucketEnvironment(appEnv?: string, bucketName?: string): void {
  const cleanEnv = (appEnv || process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'staging')
    .toLowerCase()
    .trim();
  const cleanBucket = (bucketName || process.env.GCS_BUCKET_NAME || 'cs-p3-childcare-staging')
    .toLowerCase()
    .trim();

  if (cleanEnv === 'staging' && cleanBucket.includes('production')) {
    throw new Error(
      `CONFIGURATION_ERROR: Refusing to start staging environment (APP_ENV=staging) against production GCS bucket '${cleanBucket}'. Staging must use the staging bucket.`
    );
  }
  if (cleanEnv === 'production' && cleanBucket.includes('staging')) {
    throw new Error(
      `CONFIGURATION_ERROR: Refusing to start production environment (APP_ENV=production) against staging GCS bucket '${cleanBucket}'. Production must use the production bucket.`
    );
  }
}

export class GcsStorageService {
  private config: GcsStorageConfig;
  private storageClient: any = null;
  private readonly isMock: boolean;
  private readonly mockStore = new Map<string, { buffer: Buffer; contentType: string; sha256: string }>();

  constructor(customConfig?: Partial<GcsStorageConfig>, options: { isMock?: boolean } = {}) {
    const bucket =
      customConfig?.bucketName ||
      process.env.GCS_BUCKET_NAME ||
      'cs-p3-childcare-staging';

    const projectId =
      customConfig?.projectId ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      'cs-p3-production';

    const clientEmail =
      customConfig?.clientEmail ||
      process.env.GCS_SIGNING_SERVICE_ACCOUNT ||
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
      `csc-runtime@${projectId}.iam.gserviceaccount.com`;

    const appEnv = customConfig?.appEnv || process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'staging';
    validateGcsBucketEnvironment(appEnv, bucket);

    this.config = {
      bucketName: bucket,
      projectId,
      clientEmail,
      appEnv,
    };

    if (options.isMock !== undefined) {
      this.isMock = options.isMock;
    } else if (process.env.NODE_ENV === 'test' && !process.env.FORCE_LIVE_GCS) {
      this.isMock = true;
    } else {
      this.isMock = false;
    }
  }

  public getBucketName(): string {
    return this.config.bucketName;
  }

  public getProjectId(): string | undefined {
    return this.config.projectId;
  }

  private async getStorage() {
    if (this.isMock) return null;
    if (!this.storageClient) {
      const storageMod = await import('@google-cloud/storage');
      const StorageClass =
        (storageMod as any).Storage ||
        (storageMod as any).default ||
        storageMod;
      this.storageClient = new StorageClass({
        projectId: this.config.projectId,
      });
    }
    return this.storageClient;
  }

  /**
   * Deterministic storage key builder for submission attachments (presigned/legacy slot path).
   * Format: <env>/documents/<submissionId>/<docType>.bin
   */
  public buildStorageKey(submissionId: string, docType: string): string {
    const cleanSub = submissionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanDoc = docType.replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = (this.config.appEnv || 'staging').toLowerCase();
    return `${prefix}/documents/${cleanSub}/${cleanDoc}.bin`;
  }

  /**
   * Deterministic object key builder for direct server-side GCS uploads.
   * Format: submissions/<submissionId>/<docType>/<timestamp>-<sanitizedFilename>
   */
  public buildSubmissionObjectKey(
    submissionId: string,
    docType: string,
    options?: { fileName?: string; contentType?: string; timestamp?: number | string }
  ): string {
    const cleanSub = (submissionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
    const cleanDoc = (docType || 'document').replace(/[^a-zA-Z0-9_-]/g, '_') || 'document';
    const rawTs = options?.timestamp !== undefined ? String(options.timestamp).replace(/[^0-9]/g, '') : '';
    const ts = rawTs || String(Date.now());
    const cleanFile = sanitizeGcsFilename(options?.fileName, options?.contentType || 'application/octet-stream', cleanDoc);
    return `submissions/${cleanSub}/${cleanDoc}/${ts}-${cleanFile}`;
  }

  /**
   * Parses storage URI into clean bucket and relative key.
   * Strips URI schemes, leading slashes, and neutralizes directory traversal patterns.
   */
  public parseStorageRef(targetRef: string): { bucket: string; key: string } {
    let clean = (targetRef || '').replace(/^(gcs|asset|storage|urn:asset):\/*/, '');
    clean = clean.replace(/^\/+/, '');
    // Neutralize directory traversal attempts
    clean = clean.replace(/\.\./g, '');
    const configuredBucket = this.config.bucketName;
    if (clean.startsWith(`${configuredBucket}/`)) {
      clean = clean.substring(configuredBucket.length + 1);
    }
    // Strip leading slashes and collapse consecutive slashes
    clean = clean.replace(/^\/+/, '').replace(/\/+/g, '/');
    return {
      bucket: configuredBucket,
      key: clean,
    };
  }

  /**
   * Generates a keyless signed upload URL (HTTP PUT) for client direct upload.
   * Expiry is capped at 15 minutes (900 seconds).
   */
  public async getSignedUploadUrl(input: SignedUrlRequest): Promise<SignedUrlResult> {
    const storageKey = this.buildStorageKey(input.submissionId, input.docType);
    const bucket = this.config.bucketName;
    const contentType = input.contentType.toLowerCase().trim();

    // 1. Enforce MIME type allowlist
    if (!validateAttachmentMime(contentType)) {
      return {
        status: 'REJECTED_UNSUPPORTED_MIME',
        storageKey,
        bucketName: bucket,
        contentType,
        expiresAt: '',
        error: `Unsupported MIME type '${contentType}'. Allowed types: ${ALLOWED_ATTACHMENT_MIMES.join(', ')}`,
      };
    }

    // 2. Bound expiration to max 15 minutes (900s)
    const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds || 900, 60), 900);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const contentLengthRange = `1,${MAX_ATTACHMENT_BYTES}`;
    const requiredHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'x-goog-content-length-range': contentLengthRange,
    };

    if (this.isMock) {
      const mockSignature = crypto.randomBytes(32).toString('hex');
      const mockUrl = `https://storage.googleapis.com/${bucket}/${storageKey}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=${encodeURIComponent(
        this.config.clientEmail || 'csc-runtime'
      )}&X-Goog-Date=${encodeURIComponent(
        new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
      )}&X-Goog-Expires=${expiresInSeconds}&X-Goog-SignedHeaders=content-type%3Bhost%3Bx-goog-content-length-range&X-Goog-Signature=${mockSignature}`;

      return {
        status: 'SUCCESS',
        url: mockUrl,
        storageKey,
        bucketName: bucket,
        contentType,
        expiresAt,
        contentLengthRange,
        requiredHeaders,
      };
    }

    try {
      const storage = await this.getStorage();
      const file = storage.bucket(bucket).file(storageKey);

      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + expiresInSeconds * 1000,
        contentType,
        extensionHeaders: {
          'x-goog-content-length-range': contentLengthRange,
        },
      });

      return {
        status: 'SUCCESS',
        url: signedUrl,
        storageKey,
        bucketName: bucket,
        contentType,
        expiresAt,
        contentLengthRange,
        requiredHeaders,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        storageKey,
        bucketName: bucket,
        contentType,
        expiresAt: '',
        error: `Failed to generate GCS signed upload URL: ${err?.message || err}`,
      };
    }
  }

  /**
   * Generates a keyless signed download URL (HTTP GET) for secure attachment reading.
   * Expiry is capped at 15 minutes (900 seconds).
   */
  public async getSignedDownloadUrl(targetRef: string, expiresInSeconds: number = 900): Promise<string> {
    const { bucket, key } = this.parseStorageRef(targetRef);
    const durationSeconds = Math.min(Math.max(expiresInSeconds, 60), 900);

    if (this.isMock) {
      const mockSignature = crypto.randomBytes(32).toString('hex');
      return `https://storage.googleapis.com/${bucket}/${key}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=${encodeURIComponent(
        this.config.clientEmail || 'csc-runtime'
      )}&X-Goog-Expires=${durationSeconds}&X-Goog-Signature=${mockSignature}`;
    }

    const storage = await this.getStorage();
    const file = storage.bucket(bucket).file(key);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + durationSeconds * 1000,
    });

    return signedUrl;
  }

  /**
   * Direct server-side upload to private GCS bucket.
   */
  public async uploadAttachment(input: GcsUploadAttachmentInput): Promise<UploadAttachmentResult> {
    const storageKey = input.storageKey
      ? input.storageKey.replace(/^\/+/, '').replace(/\.\./g, '')
      : this.buildStorageKey(input.submissionId, input.docType);
    const bucket = this.config.bucketName;
    const byteSize = input.buffer.length;

    // 1. Size bounds check
    if (byteSize > MAX_ATTACHMENT_BYTES) {
      return {
        status: 'REJECTED_OVERSIZE',
        storageKey,
        bucketName: bucket,
        byteSize,
        calculatedSha256: '',
        privateUri: '',
        error: `Attachment size ${byteSize} bytes exceeds maximum limit of ${MAX_ATTACHMENT_BYTES} bytes.`,
      };
    }

    // 2. MIME allowlist check
    const rawMime = normalizeAttachmentMime(input.contentType);
    if (!validateAttachmentMime(rawMime)) {
      return {
        status: 'REJECTED_UNSUPPORTED_MIME',
        storageKey,
        bucketName: bucket,
        byteSize,
        calculatedSha256: '',
        privateUri: '',
        error: `Unsupported MIME type '${input.contentType}'. Allowed types: ${ALLOWED_ATTACHMENT_MIMES.join(', ')}`,
      };
    }

    // 3. SHA-256 verification
    const calculatedSha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
    if (input.expectedSha256 && input.expectedSha256.toLowerCase() !== calculatedSha256.toLowerCase()) {
      return {
        status: 'REJECTED_CHECKSUM_MISMATCH',
        storageKey,
        bucketName: bucket,
        byteSize,
        calculatedSha256,
        privateUri: '',
        error: `Calculated SHA-256 (${calculatedSha256}) did not match expected SHA-256 (${input.expectedSha256}).`,
      };
    }

    const privateUri = `gcs://${bucket}/${storageKey}`;

    if (this.isMock) {
      this.mockStore.set(`${bucket}/${storageKey}`, {
        buffer: input.buffer,
        contentType: rawMime,
        sha256: calculatedSha256,
      });

      return {
        status: 'STORED_PRIVATE',
        storageKey,
        bucketName: bucket,
        byteSize,
        calculatedSha256,
        privateUri,
      };
    }

    try {
      const storage = await this.getStorage();
      const file = storage.bucket(bucket).file(storageKey);

      await file.save(input.buffer, {
        contentType: rawMime,
        metadata: {
          metadata: {
            'submission-id': input.submissionId,
            'doc-type': input.docType,
            'file-name': input.fileName || storageKey.split('/').pop() || input.docType,
            'sha256': calculatedSha256,
          },
        },
        resumable: false,
      });

      return {
        status: 'STORED_PRIVATE',
        storageKey,
        bucketName: bucket,
        byteSize,
        calculatedSha256,
        privateUri,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        storageKey,
        bucketName: bucket,
        byteSize,
        calculatedSha256,
        privateUri,
        error: `GCS upload failed: ${err?.message || err}`,
      };
    }
  }

  /**
   * Fetches binary object bytes from private GCS storage.
   */
  public async fetchAttachment(targetRef: string): Promise<FetchAttachmentResult> {
    const { bucket, key } = this.parseStorageRef(targetRef);

    if (this.isMock) {
      const item = this.mockStore.get(`${bucket}/${key}`);
      if (!item) {
        return {
          status: 'NOT_FOUND',
          error: `Object not found at key '${key}' in bucket '${bucket}'.`,
        };
      }
      return {
        status: 'SUCCESS',
        buffer: item.buffer,
        contentType: item.contentType,
        byteSize: item.buffer.length,
        sha256: item.sha256,
      };
    }

    try {
      const storage = await this.getStorage();
      const file = storage.bucket(bucket).file(key);
      const [buffer] = await file.download();
      const [metadata] = await file.getMetadata();
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      return {
        status: 'SUCCESS',
        buffer,
        contentType: metadata.contentType || 'application/octet-stream',
        byteSize: buffer.length,
        sha256,
      };
    } catch (err: any) {
      if (err?.code === 404) {
        return {
          status: 'NOT_FOUND',
          error: `Object not found at key '${key}' in bucket '${bucket}'.`,
        };
      }
      return {
        status: 'UNAVAILABLE',
        error: `GCS download failed: ${err?.message || err}`,
      };
    }
  }

  /**
   * Checks existence of an object in GCS without downloading.
   */
  public async headAttachment(targetRef: string): Promise<boolean> {
    const { bucket, key } = this.parseStorageRef(targetRef);

    if (this.isMock) {
      return this.mockStore.has(`${bucket}/${key}`);
    }

    try {
      const storage = await this.getStorage();
      const [exists] = await storage.bucket(bucket).file(key).exists();
      return Boolean(exists);
    } catch {
      return false;
    }
  }

  /**
   * Deletes an attachment object from GCS (best-effort/idempotent on missing objects).
   */
  public async deleteAttachment(targetRef: string): Promise<DeleteAttachmentResult> {
    const trimmed = (targetRef || '').trim();
    const { bucket, key } = this.parseStorageRef(trimmed);
    if (!trimmed || !key) {
      return {
        status: 'NOT_FOUND',
        bucketName: bucket,
        storageKey: key,
      };
    }

    // Preserve explicit bucket encoded in gcs://<bucket>/<key> if different from default bucket
    let targetBucket = bucket;
    let targetKey = key;
    const gcsMatch = /^gcs:\/\/([^/]+)\/(.+)$/i.exec(trimmed);
    if (gcsMatch) {
      targetBucket = gcsMatch[1];
      targetKey = gcsMatch[2].replace(/^\/+/, '').replace(/\.\./g, '');
    }

    if (this.isMock) {
      const existed = this.mockStore.delete(`${targetBucket}/${targetKey}`);
      return {
        status: existed ? 'DELETED' : 'NOT_FOUND',
        bucketName: targetBucket,
        storageKey: targetKey,
      };
    }

    try {
      const storage = await this.getStorage();
      await storage.bucket(targetBucket).file(targetKey).delete({ ignoreNotFound: true });
      return {
        status: 'DELETED',
        bucketName: targetBucket,
        storageKey: targetKey,
      };
    } catch (err: any) {
      if (err?.code === 404) {
        return {
          status: 'NOT_FOUND',
          bucketName: targetBucket,
          storageKey: targetKey,
        };
      }
      return {
        status: 'FAILED',
        bucketName: targetBucket,
        storageKey: targetKey,
        error: `GCS delete failed: ${err?.message || err}`,
      };
    }
  }
}

/**
 * Storage Service Factory: Returns GcsStorageService or TigrisStorageService
 * based on the active STORAGE_PROVIDER environment switch.
 */
export async function getStorageService(provider?: 'tigris' | 'gcs'): Promise<any> {
  const activeProvider = provider || getStorageProvider();
  if (activeProvider === 'gcs') {
    return new GcsStorageService();
  }
  const { TigrisStorageService } = await import('./tigrisStorageService');
  return new TigrisStorageService();
}

export interface UploadToSignedUrlOptions {
  url: string;
  data: Buffer | Blob | Uint8Array | ArrayBuffer;
  contentType: string;
  requiredHeaders?: Record<string, string>;
  fetchFn?: typeof fetch;
}

/**
 * Uploads binary document data to a V4 signed upload URL.
 * Automatically attaches required headers including 'x-goog-content-length-range'
 * to satisfy signed URL policy invariants.
 */
export async function uploadToGcsSignedUrl(options: UploadToSignedUrlOptions): Promise<Response> {
  const byteLength =
    options.data instanceof Buffer || options.data instanceof Uint8Array
      ? options.data.byteLength
      : options.data instanceof ArrayBuffer
      ? options.data.byteLength
      : (options.data as any)?.size;

  if (typeof byteLength === 'number' && byteLength > MAX_ATTACHMENT_BYTES) {
    return new Response(
      JSON.stringify({
        error: 'EntityTooLarge',
        message: `Upload payload size (${byteLength} bytes) exceeds maximum limit of ${MAX_ATTACHMENT_BYTES} bytes.`,
      }),
      {
        status: 413,
        statusText: 'Payload Too Large',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const fetchImpl = options.fetchFn || globalThis.fetch;
  const headers: Record<string, string> = {
    'Content-Type': options.contentType,
    'x-goog-content-length-range': `1,${MAX_ATTACHMENT_BYTES}`,
    ...(options.requiredHeaders || {}),
  };
  return await fetchImpl(options.url, {
    method: 'PUT',
    headers,
    body: options.data as any,
  });
}

