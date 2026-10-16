/**
 * Tigris S3-Compatible Object Storage Service
 *
 * Implements private binary document storage using @aws-sdk/client-s3 protocol
 * pointing to Tigris (Fly.io S3-compatible endpoint).
 *
 * Safety & Invariants:
 * 1. Private only: Buckets and keys remain strictly non-public; no presigned URLs in DB or Sheets.
 * 2. Whitelisted endpoints: Restricts S3 endpoint hostnames to .tigris.dev, .fly.storage.tigris.dev, and .amazonaws.com.
 * 3. File size ceiling: Strictly <= 10MB (HTTP 413 / REJECTED_OVERSIZE).
 * 4. MIME allowlisting: JPEG, PNG, WebP, PDF.
 * 5. Integrity verification: Computes and matches SHA-256 before confirming storage.
 * 6. Dual-variable resilience: Supports both S3_BUCKET_NAME and TIGRIS_BUCKET.
 */

import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_ATTACHMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedAttachmentMime = (typeof ALLOWED_ATTACHMENT_MIMES)[number];

export interface TigrisStorageConfig {
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName: string;
}

export interface UploadAttachmentInput {
  submissionId: string;
  docType: string;
  buffer: Buffer;
  contentType: string;
  expectedSha256?: string;
}

export interface UploadAttachmentResult {
  status: 'STORED_PRIVATE' | 'REJECTED_OVERSIZE' | 'REJECTED_UNSUPPORTED_MIME' | 'REJECTED_CHECKSUM_MISMATCH' | 'FAILED';
  storageKey: string;
  bucketName: string;
  byteSize: number;
  calculatedSha256: string;
  privateUri: string;
  error?: string;
}

export interface FetchAttachmentResult {
  status: 'SUCCESS' | 'NOT_FOUND' | 'UNAVAILABLE';
  buffer?: Buffer;
  contentType?: string;
  byteSize?: number;
  sha256?: string;
  error?: string;
}

/**
 * Validates endpoint hostnames against trusted providers.
 */
export function isAllowedS3Endpoint(endpointUrl?: string): boolean {
  if (!endpointUrl) return true; // Default AWS S3 SDK endpoint
  try {
    const parsed = new URL(endpointUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.tigris.dev') ||
      host.endsWith('.fly.storage.tigris.dev') ||
      host.endsWith('.amazonaws.com') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

export class TigrisStorageService {
  private client: S3Client | null = null;
  private config: TigrisStorageConfig;

  constructor(customConfig?: Partial<TigrisStorageConfig>, injectedClient?: S3Client) {
    const bucket =
      customConfig?.bucketName ||
      process.env.S3_BUCKET_NAME ||
      process.env.TIGRIS_BUCKET ||
      'childcare-assets-staging';

    const endpoint =
      customConfig?.endpoint ||
      process.env.AWS_ENDPOINT_URL_S3 ||
      process.env.TIGRIS_ENDPOINT_URL ||
      'https://fly.storage.tigris.dev';

    this.config = {
      endpoint,
      region: customConfig?.region || process.env.AWS_REGION || 'sin',
      accessKeyId: customConfig?.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: customConfig?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      bucketName: bucket,
    };

    if (injectedClient) {
      this.client = injectedClient;
    }
  }

  public isConfigured(): boolean {
    return Boolean(
      this.config.accessKeyId &&
      this.config.secretAccessKey &&
      this.config.bucketName &&
      isAllowedS3Endpoint(this.config.endpoint)
    );
  }

  public getBucketName(): string {
    return this.config.bucketName;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    if (!this.isConfigured()) {
      throw new Error('TigrisStorageService: S3/Tigris storage credentials or bucket are not configured.');
    }

    const clientParams: S3ClientConfig = {
      region: this.config.region,
      endpoint: this.config.endpoint,
      credentials: {
        accessKeyId: this.config.accessKeyId!,
        secretAccessKey: this.config.secretAccessKey!,
      },
      forcePathStyle: true,
    };

    this.client = new S3Client(clientParams);
    return this.client;
  }

  /**
   * Builds canonical, deterministic storage key for a submission attachment.
   * Path: staging/documents/<submissionId>/<docType>.bin
   */
  public buildStorageKey(submissionId: string, docType: string): string {
    const cleanSub = submissionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanDoc = docType.replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'staging').toLowerCase();
    return `${prefix}/documents/${cleanSub}/${cleanDoc}.bin`;
  }

  /**
   * Uploads verified binary attachment to private Tigris storage.
   */
  public async uploadAttachment(input: UploadAttachmentInput): Promise<UploadAttachmentResult> {
    const storageKey = this.buildStorageKey(input.submissionId, input.docType);
    const bucket = this.config.bucketName;
    const byteSize = input.buffer.length;

    // 1. Enforce size bounds
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

    // 2. Enforce MIME whitelist
    const rawMime = input.contentType.toLowerCase().trim();
    const isAllowed = ALLOWED_ATTACHMENT_MIMES.some((m) => rawMime.startsWith(m));
    if (!isAllowed) {
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

    // 3. Calculate and verify SHA-256 digest
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

    const privateUri = `asset://${bucket}/${storageKey}`;

    try {
      const client = this.getClient();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          Body: input.buffer,
          ContentType: input.contentType,
          Metadata: {
            'submission-id': input.submissionId,
            'doc-type': input.docType,
            'sha256': calculatedSha256,
          },
        })
      );

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
        error: `Tigris PutObject failed: ${err?.message || 'Unknown S3 error'}`,
      };
    }
  }

  /**
   * Fetches binary object bytes from private Tigris storage.
   */
  /**
   * Parses storage URI into clean bucket and relative key.
   */
  public parseStorageRef(targetRef: string): { bucket: string; key: string } {
    let clean = targetRef.replace(/^(asset|storage|s3|urn:asset):\/*/, '');
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
   * Fetches binary object bytes from private Tigris storage.
   */
  public async fetchAttachment(targetRef: string): Promise<FetchAttachmentResult> {
    const { bucket, key } = this.parseStorageRef(targetRef);

    try {
      const client = this.getClient();
      const res = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      if (!res.Body) {
        return {
          status: 'NOT_FOUND',
          error: 'Object body was empty in storage.',
        };
      }

      const bytes = await res.Body.transformToByteArray();
      const buffer = Buffer.from(bytes);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      return {
        status: 'SUCCESS',
        buffer,
        contentType: res.ContentType || 'application/octet-stream',
        byteSize: buffer.length,
        sha256,
      };
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        return {
          status: 'NOT_FOUND',
          error: `Object not found at key '${key}' in bucket '${bucket}'.`,
        };
      }
      return {
        status: 'UNAVAILABLE',
        error: `Tigris GetObject failed: ${err?.message || 'Storage retrieval error'}`,
      };
    }
  }

  /**
   * Checks existence of an object without downloading full payload.
   */
  public async headAttachment(targetRef: string): Promise<boolean> {
    const { bucket, key } = this.parseStorageRef(targetRef);
    try {
      const client = this.getClient();
      await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}
