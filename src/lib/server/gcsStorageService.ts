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

export function getStorageProvider(): 'tigris' | 'gcs' {
  const provider = (process.env.STORAGE_PROVIDER || 'tigris').toLowerCase().trim();
  if (provider === 'gcs') {
    return 'gcs';
  }
  return 'tigris';
}

export function validateAttachmentMime(contentType: string): boolean {
  if (!contentType || typeof contentType !== 'string') return false;
  const raw = contentType.toLowerCase().trim();
  return ALLOWED_ATTACHMENT_MIMES.some((m) => raw.startsWith(m));
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

    this.config = {
      bucketName: bucket,
      projectId,
      clientEmail,
      appEnv: customConfig?.appEnv || process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'staging',
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
      const { Storage } = await import('@google-cloud/storage');
      this.storageClient = new Storage({
        projectId: this.config.projectId,
      });
    }
    return this.storageClient;
  }

  /**
   * Deterministic storage key builder for submission attachments.
   * Format: <env>/documents/<submissionId>/<docType>.bin
   */
  public buildStorageKey(submissionId: string, docType: string): string {
    const cleanSub = submissionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanDoc = docType.replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = (this.config.appEnv || 'staging').toLowerCase();
    return `${prefix}/documents/${cleanSub}/${cleanDoc}.bin`;
  }

  /**
   * Parses storage URI into clean bucket and relative key.
   */
  public parseStorageRef(targetRef: string): { bucket: string; key: string } {
    let clean = targetRef.replace(/^(gcs|asset|storage|urn:asset):\/*/, '');
    clean = clean.replace(/^\/+/, '');
    const configuredBucket = this.config.bucketName;
    if (clean.startsWith(`${configuredBucket}/`)) {
      clean = clean.substring(configuredBucket.length + 1);
    }
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
  public async uploadAttachment(input: UploadAttachmentInput): Promise<UploadAttachmentResult> {
    const storageKey = this.buildStorageKey(input.submissionId, input.docType);
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
    const rawMime = input.contentType.toLowerCase().trim();
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
        contentType: input.contentType,
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
        contentType: input.contentType,
        metadata: {
          metadata: {
            'submission-id': input.submissionId,
            'doc-type': input.docType,
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

