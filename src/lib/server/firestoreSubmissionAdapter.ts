/**
 * Cloud Firestore Submission Adapter
 *
 * Implements the canonical submission persistence interface targeting Google Cloud Firestore (Native mode).
 *
 * Safety & Architecture Invariants:
 * 1. Server-side Admin SDK only: No direct client-side Firestore access; firestore.rules deny all.
 * 2. Deduplication & Idempotency: Uses clientSubmissionId as document ID so retries overwrite instead of duplicating.
 * 3. Database Environment Isolation: Refuses to start staging (APP_ENV=staging) against '(default)' database,
 *    and refuses to start production (APP_ENV=production) against 'staging' database.
 * 4. Durable Sheets Mirror: After successful Firestore write, dispatches row to Apps Script.
 *    If mirror fails, records job in 'sheets_mirror_retry_queue' for exponential-backoff replay.
 * 5. Multi-Database Support: Configurable via FIRESTORE_DATABASE_ID (default: '(default)').
 */

import type {
  CanonicalCreateInput,
  CanonicalUpdateInput,
  CanonicalReplaceAssetInput,
  CanonicalListParams,
  CanonicalSubmissionResult,
  SupervisorListDTO,
} from './canonicalSubmissionAdapter';
import type { CompleteSubmissionPayload, PatchSubmissionPayload } from '@/lib/validations/submissionSchema';
import { canonicalizeStateName, getStateQueryVariants } from '@/lib/constants/stateNormalization';
import { computeSubmissionRowHash, stampSubmissionRowIntegrity } from './submissionRowHash';
import {
  GcsStorageService,
  extensionForAttachmentMime,
  getStorageProvider,
  normalizeAttachmentMime,
  sanitizeGcsFilename,
} from './gcsStorageService';

export interface ReconcileSnapshotItem {
  id: string;
  uniqueId: string;
  submissionId: string;
  state: string;
  rowVersion: number;
  rowHash: string;
  version: number;
  updatedAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  deleteReason: string | null;
}

export interface ReconcileSnapshotPage {
  items: ReconcileSnapshotItem[];
  nextAfterId: string | null;
  hasMore: boolean;
  limit: number;
  sourceEngine: 'firestore';
  generatedAt: string;
}

export interface ReconcileFullRecord extends ReconcileSnapshotItem {
  submissionTime: string | null;
  revisionNumber: number;
  sheetRowNumber: number | null;
  mirrorStatus: string | null;
  payload: Record<string, any>;
  doc: Record<string, any>;
}

export interface FirestoreAdapterOptions {
  projectId?: string;
  databaseId?: string;
  appEnv?: string;
  storageProvider?: 'gcs' | 'tigris';
  storageService?: GcsStorageService;
  gatewayClient?: {
    callGateway: (payload: Record<string, any>) => Promise<any>;
  };
  mockDb?: any; // For isolated unit testing
}

export interface SheetsMirrorRetryRecord {
  id: string;
  submissionId: string;
  clientSubmissionId: string;
  idempotencyKey?: string;
  payload: Record<string, any>;
  status: 'PENDING' | 'SYNCED' | 'DEAD_LETTER';
  retryCount: number;
  nextRetryAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export function validateFirestoreDatabaseEnvironment(appEnv?: string, databaseId?: string): void {
  const cleanEnv = (appEnv || process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development')
    .toLowerCase()
    .trim();
  const cleanDb = (databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)').trim();

  if (cleanEnv === 'staging' && cleanDb === '(default)') {
    throw new Error(
      "CONFIGURATION_ERROR: Refusing to start staging environment (APP_ENV=staging) against '(default)' Firestore database. Staging must use the 'staging' named database."
    );
  }
  if (cleanEnv === 'production' && cleanDb === 'staging') {
    throw new Error(
      "CONFIGURATION_ERROR: Refusing to start production environment (APP_ENV=production) against 'staging' Firestore database. Production must use '(default)'."
    );
  }
}

interface AttachmentSlotDescriptor {
  docType: string;
  primaryFieldKey: string;
  topKeys: string[];
  nestedContainers: Array<{ containerKey: string; keys: string[] }>;
}

const ATTACHMENT_SLOT_DESCRIPTORS: AttachmentSlotDescriptor[] = [
  {
    docType: 'passbookPhoto',
    primaryFieldKey: 'passbookPhotoUrl',
    topKeys: ['passbookPhotoUrl', 'passbook_photo_url', 'passbookProof', 'passbookLink'],
    nestedContainers: [
      { containerKey: 'bankingAndKyc', keys: ['passbookPhotoUrl', 'passbook_photo_url', 'passbookProof', 'passbookLink'] },
      { containerKey: 'bankDetails', keys: ['passbookPhotoUrl', 'passbook_photo_url', 'passbookProof', 'passbookLink'] },
    ],
  },
  {
    docType: 'aadhaarCardPhoto',
    primaryFieldKey: 'aadhaarCardPhotoUrl',
    topKeys: ['aadhaarCardPhotoUrl', 'aadhaar_card_photo_url', 'aadhaarPhotoUrl', 'aadhaarLink'],
    nestedContainers: [
      { containerKey: 'bankingAndKyc', keys: ['aadhaarCardPhotoUrl', 'aadhaar_card_photo_url', 'aadhaarPhotoUrl', 'aadhaarLink'] },
      { containerKey: 'bankDetails', keys: ['aadhaarCardPhotoUrl', 'aadhaar_card_photo_url', 'aadhaarPhotoUrl', 'aadhaarLink'] },
    ],
  },
  {
    docType: 'childPhoto',
    primaryFieldKey: 'childPhotoUrl',
    topKeys: ['childPhotoUrl', 'child_photo_url', 'childPhotoLink'],
    nestedContainers: [
      { containerKey: 'bankingAndKyc', keys: ['childPhotoUrl', 'child_photo_url', 'childPhotoLink'] },
      { containerKey: 'bankDetails', keys: ['childPhotoUrl', 'child_photo_url', 'childPhotoLink'] },
    ],
  },
  {
    docType: 'feeReceiptPhoto',
    primaryFieldKey: 'feeReceiptPhotoUrl',
    topKeys: ['feeReceiptPhotoUrl', 'fee_receipt_photo_url', 'feeReceiptUrl', 'feeReceiptLink'],
    nestedContainers: [
      { containerKey: 'educationExpenses', keys: ['feeReceiptPhotoUrl', 'fee_receipt_photo_url', 'feeReceiptUrl', 'feeReceiptLink'] },
      { containerKey: 'education', keys: ['feeReceiptPhotoUrl', 'fee_receipt_photo_url', 'feeReceiptUrl', 'feeReceiptLink'] },
    ],
  },
  {
    docType: 'marksheetPhoto',
    primaryFieldKey: 'marksheetPhotoUrl',
    topKeys: ['marksheetPhotoUrl', 'marksheet_photo_url', 'marksheetPhotoLink'],
    nestedContainers: [
      { containerKey: 'educationExpenses', keys: ['marksheetPhotoUrl', 'marksheet_photo_url', 'marksheetPhotoLink'] },
      { containerKey: 'education', keys: ['marksheetPhotoUrl', 'marksheet_photo_url', 'marksheetPhotoLink'] },
    ],
  },
  {
    docType: 'caregiverSignature',
    primaryFieldKey: 'signatureDataUrl',
    topKeys: ['signatureDataUrl', 'signature_data_url', 'signatureUrl', 'signature_url', 'caregiverSignature'],
    nestedContainers: [
      { containerKey: 'caregiverConsent', keys: ['signatureDataUrl', 'signature_data_url', 'signatureUrl', 'signature_url', 'caregiverSignature'] },
      { containerKey: 'consent', keys: ['signatureDataUrl', 'signature_data_url', 'signatureUrl', 'signature_url', 'caregiverSignature'] },
    ],
  },
];

function normalizeDocTypeCanonical(docType: string): string {
  const norm = String(docType || '').trim().toLowerCase();
  if (!norm) return 'document';
  if (norm.includes('passbook')) return 'passbookPhoto';
  if (norm.includes('aadhaar')) return 'aadhaarCardPhoto';
  if (norm.includes('fee')) return 'feeReceiptPhoto';
  if (norm.includes('mark')) return 'marksheetPhoto';
  if (norm.includes('sig')) return 'caregiverSignature';
  if (norm.includes('child') || norm === 'photo' || norm === 'childphoto') return 'childPhoto';
  return String(docType).trim();
}

function getSlotDescriptorForDocType(docType: string): AttachmentSlotDescriptor | undefined {
  const canonical = normalizeDocTypeCanonical(docType);
  return ATTACHMENT_SLOT_DESCRIPTORS.find((d) => d.docType === canonical);
}

function clonePayloadValue(val: any): any {
  if (val === null || typeof val !== 'object') return val;
  if (Buffer.isBuffer(val)) return Buffer.from(val);
  if (val instanceof Date) return new Date(val.getTime());
  if (Array.isArray(val)) return val.map(clonePayloadValue);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    out[k] = clonePayloadValue(v);
  }
  return out;
}

function inferAllowedMimeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buf.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  return null;
}

function decodeBinaryAttachmentInput(
  rawValue: unknown,
  docType: string,
  explicitFileName?: string,
  explicitMimeType?: string
): { buffer: Buffer; mimeType: string; fileName: string } | null {
  if (rawValue === null || rawValue === undefined) return null;

  if (Buffer.isBuffer(rawValue)) {
    if (rawValue.length === 0) return null;
    const mime = normalizeAttachmentMime(explicitMimeType || '') || inferAllowedMimeFromMagicBytes(rawValue) || '';
    if (!mime) return null;
    return {
      buffer: rawValue,
      mimeType: mime,
      fileName: sanitizeGcsFilename(explicitFileName, mime, docType),
    };
  }

  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const dataUriMatch = /^data:([a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+)((?:;[a-zA-Z0-9=._-]+)*);base64,([\s\S]+)$/.exec(trimmed);
  if (dataUriMatch) {
    const mimeType = normalizeAttachmentMime(dataUriMatch[1]);
    const metaParams = dataUriMatch[2] || '';
    const nameMatch = /;name=([^;]+)/i.exec(metaParams);
    let rawMetaName: string | undefined;
    if (nameMatch?.[1]) {
      const stripped = nameMatch[1].replace(/^"|"$/g, '');
      try {
        rawMetaName = decodeURIComponent(stripped);
      } catch {
        rawMetaName = stripped;
      }
    }
    const base64Body = dataUriMatch[3].replace(/\s+/g, '');
    if (!base64Body) return null;
    const buffer = Buffer.from(base64Body, 'base64');
    if (buffer.length === 0) return null;
    return {
      buffer,
      mimeType,
      fileName: sanitizeGcsFilename(explicitFileName || rawMetaName, mimeType, docType),
    };
  }

  // Fallback for callers submitting raw unprefixed base64 binary payloads (without URI prefixes)
  const isStoredRef =
    /^(gcs|https?|asset|storage|s3|urn):/i.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('=') ||
    trimmed.startsWith('<svg');
  if (!isStoredRef && trimmed.length >= 16 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    const compact = trimmed.replace(/\s+/g, '');
    const buf = Buffer.from(compact, 'base64');
    const inferred = normalizeAttachmentMime(explicitMimeType || '') || inferAllowedMimeFromMagicBytes(buf);
    if (buf.length > 0 && inferred) {
      return {
        buffer: buf,
        mimeType: inferred,
        fileName: sanitizeGcsFilename(explicitFileName, inferred, docType),
      };
    }
  }

  return null;
}

function collectGcsUrisFromRecord(record: any): string[] {
  const uris = new Set<string>();
  const visited = new Set<any>();

  const scan = (node: any) => {
    if (!node) return;
    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (trimmed.startsWith('gcs://')) {
        uris.add(trimmed);
      }
      return;
    }
    if (typeof node !== 'object' || Buffer.isBuffer(node)) return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) scan(item);
      return;
    }
    for (const val of Object.values(node)) {
      scan(val);
    }
  };

  scan(record);
  return Array.from(uris);
}

export class FirestoreSubmissionAdapter {
  private db: any = null;
  private readonly projectId: string;
  private readonly databaseId: string;
  private readonly appEnv: string;
  private readonly configuredStorageProvider?: 'gcs' | 'tigris';
  private storageService: GcsStorageService | null = null;
  public readonly gatewayClient?: { callGateway: (payload: Record<string, any>) => Promise<any> };

  // In-memory fallback / mock store for offline unit tests
  private readonly isMock: boolean;
  private readonly mockSubmissions = new Map<string, any>();
  private readonly mockRetryQueue = new Map<string, SheetsMirrorRetryRecord>();
  private readonly mockIdempotency = new Map<string, CanonicalSubmissionResult>();

  constructor(options: FirestoreAdapterOptions = {}) {
    this.projectId = options.projectId || process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production';
    this.databaseId = options.databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)';
    this.gatewayClient = options.gatewayClient;
    this.configuredStorageProvider = options.storageProvider;
    this.storageService = options.storageService || null;

    const env = options.appEnv || process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development';
    this.appEnv = env;
    validateFirestoreDatabaseEnvironment(env, this.databaseId);

    if (options.mockDb) {
      this.db = options.mockDb;
      this.isMock = true;
    } else if (process.env.NODE_ENV === 'test' && !process.env.FORCE_LIVE_FIRESTORE) {
      this.isMock = true;
    } else {
      this.isMock = false;
    }
  }

  private getActiveGcsService(): GcsStorageService | null {
    if (this.storageService) return this.storageService;
    const provider = (this.configuredStorageProvider || getStorageProvider()).toLowerCase().trim();
    if (provider !== 'gcs') {
      return null;
    }
    try {
      const normalizedEnv = this.appEnv === 'development' ? 'staging' : this.appEnv;
      this.storageService = new GcsStorageService({
        projectId: this.projectId,
        appEnv: normalizedEnv,
      });
      return this.storageService;
    } catch (err: any) {
      if (this.appEnv.toLowerCase().trim() === 'production') {
        throw err;
      }
      console.warn(`[GCS_ADAPTER] GCS storage disabled (${err?.message || err}); falling back cleanly.`);
      return null;
    }
  }

  private async uploadAttachmentToGcsOrFail(
    gcsService: GcsStorageService,
    submissionId: string,
    docType: string,
    decoded: { buffer: Buffer; mimeType: string; fileName: string },
    uploadedAt: string,
    indexHint: number = 0
  ): Promise<
    | { ok: true; gcsUri: string; metadata: Record<string, any> }
    | { ok: false; statusCode: number; code: string; message: string }
  > {
    const timestamp = `${Date.now()}${indexHint > 0 ? String(indexHint) : ''}`;
    const storageKey = gcsService.buildSubmissionObjectKey(submissionId, docType, {
      fileName: decoded.fileName,
      contentType: decoded.mimeType,
      timestamp,
    });
    const uploadRes = await gcsService.uploadAttachment({
      submissionId,
      docType,
      buffer: decoded.buffer,
      contentType: decoded.mimeType,
      storageKey,
      fileName: decoded.fileName,
    });

    if (uploadRes.status === 'REJECTED_OVERSIZE') {
      return {
        ok: false,
        statusCode: 413,
        code: 'ASSET_TOO_LARGE',
        message: uploadRes.error || 'Uploaded attachment exceeds maximum allowed size.',
      };
    }
    if (uploadRes.status === 'REJECTED_UNSUPPORTED_MIME') {
      return {
        ok: false,
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: uploadRes.error || 'Unsupported attachment MIME type.',
      };
    }
    if (uploadRes.status !== 'STORED_PRIVATE' || !uploadRes.privateUri) {
      return {
        ok: false,
        statusCode: 502,
        code: 'GCS_UPLOAD_FAILED',
        message: uploadRes.error || 'Failed to upload attachment to Cloud Storage.',
      };
    }

    return {
      ok: true,
      gcsUri: uploadRes.privateUri,
      metadata: {
        docType,
        gcsUri: uploadRes.privateUri,
        url: uploadRes.privateUri,
        storageKey: uploadRes.storageKey,
        bucketName: uploadRes.bucketName,
        mimeType: decoded.mimeType,
        sizeBytes: uploadRes.byteSize,
        fileName: decoded.fileName,
        sha256: uploadRes.calculatedSha256,
        uploadedAt,
      },
    };
  }

  private async persistSubmissionAttachmentsToGcs(
    clientSubmissionId: string,
    firestorePayload: Record<string, any>,
    now: string,
    gcsService: GcsStorageService | null
  ): Promise<
    | {
        ok: true;
        promotedTopFields: Record<string, string>;
        attachments: any[];
      }
    | {
        ok: false;
        statusCode: number;
        code: string;
        message: string;
      }
  > {
    const promotedTopFields: Record<string, string> = {};
    const uploadedAttachments: any[] = [];
    const existingAttachments = Array.isArray(firestorePayload.attachments) ? firestorePayload.attachments : [];

    if (!gcsService) {
      return {
        ok: true,
        promotedTopFields,
        attachments: existingAttachments,
      };
    }

    const dedupeCache = new Map<string, { gcsUri: string; metadata: Record<string, any> }>();
    let seq = 0;

    const resolveOrUpload = async (
      docType: string,
      rawValue: unknown,
      explicitFileName?: string,
      explicitMimeType?: string
    ): Promise<
      | { ok: true; gcsUri: string; metadata: Record<string, any>; isNew: boolean }
      | { ok: false; statusCode: number; code: string; message: string }
      | null
    > => {
      const decoded = decodeBinaryAttachmentInput(rawValue, docType, explicitFileName, explicitMimeType);
      if (!decoded) return null;

      const hashKey = `${docType}::${decoded.buffer.length}::${decoded.buffer.subarray(0, 64).toString('base64')}`;
      const cached = dedupeCache.get(hashKey);
      if (cached) {
        return { ok: true, gcsUri: cached.gcsUri, metadata: cached.metadata, isNew: false };
      }

      seq += 1;
      const uploaded = await this.uploadAttachmentToGcsOrFail(
        gcsService,
        clientSubmissionId,
        docType,
        decoded,
        now,
        seq
      );
      if (!uploaded.ok) {
        return uploaded;
      }

      dedupeCache.set(hashKey, { gcsUri: uploaded.gcsUri, metadata: uploaded.metadata });
      return { ok: true, gcsUri: uploaded.gcsUri, metadata: uploaded.metadata, isNew: true };
    };

    const scopesToScrub: Record<string, any>[] = [firestorePayload];
    if (firestorePayload.raw_payload && typeof firestorePayload.raw_payload === 'object') {
      scopesToScrub.push(firestorePayload.raw_payload);
    }

    for (const slot of ATTACHMENT_SLOT_DESCRIPTORS) {
      for (const scope of scopesToScrub) {
        for (const key of slot.topKeys) {
          if (scope[key] !== undefined && scope[key] !== null) {
            const res = await resolveOrUpload(slot.docType, scope[key]);
            if (res) {
              if (!res.ok) return res;
              scope[key] = res.gcsUri;
              promotedTopFields[slot.primaryFieldKey] = res.gcsUri;
              if (res.isNew) uploadedAttachments.push(res.metadata);
            }
          }
        }
        for (const container of slot.nestedContainers) {
          const containerObj = scope[container.containerKey];
          if (containerObj && typeof containerObj === 'object') {
            for (const key of container.keys) {
              if (containerObj[key] !== undefined && containerObj[key] !== null) {
                const res = await resolveOrUpload(slot.docType, containerObj[key]);
                if (res) {
                  if (!res.ok) return res;
                  containerObj[key] = res.gcsUri;
                  promotedTopFields[slot.primaryFieldKey] = res.gcsUri;
                  if (res.isNew) uploadedAttachments.push(res.metadata);
                }
              }
            }
          }
        }
      }
    }

    // Handle pre-populated attachments array items containing inline data URI / buffer payloads
    const sanitizedExistingAttachments: any[] = [];
    for (const item of existingAttachments) {
      if (!item || typeof item !== 'object') {
        sanitizedExistingAttachments.push(item);
        continue;
      }
      const itemDocType = normalizeDocTypeCanonical(item.docType || item.type || 'document');
      const rawCandidate = item.buffer || item.fileData || item.dataUrl || item.url;
      const res = await resolveOrUpload(itemDocType, rawCandidate, item.fileName, item.mimeType);
      if (res) {
        if (!res.ok) return res;
        sanitizedExistingAttachments.push(res.metadata);
      } else {
        sanitizedExistingAttachments.push(item);
      }
    }

    const mergedAttachments = [...sanitizedExistingAttachments];
    for (const uploadedMeta of uploadedAttachments) {
      const alreadyPresent = mergedAttachments.some(
        (att) => att && typeof att === 'object' && att.gcsUri === uploadedMeta.gcsUri && att.docType === uploadedMeta.docType
      );
      if (!alreadyPresent) {
        mergedAttachments.push(uploadedMeta);
      }
    }
    firestorePayload.attachments = mergedAttachments;
    if (firestorePayload.raw_payload && typeof firestorePayload.raw_payload === 'object') {
      firestorePayload.raw_payload.attachments = mergedAttachments;
    }

    return {
      ok: true,
      promotedTopFields,
      attachments: mergedAttachments,
    };
  }

  public async getDb() {
    if (this.db) return this.db;
    if (this.isMock) return null;
    const firestoreMod = await import('@google-cloud/firestore');
    const FirestoreClass =
      (firestoreMod as any).Firestore ||
      (firestoreMod as any).default ||
      firestoreMod;
    this.db = new FirestoreClass({
      projectId: this.projectId,
      databaseId: this.databaseId === '(default)' ? undefined : this.databaseId,
      ignoreUndefinedProperties: true,
    });
    return this.db;
  }

  public getDatabaseId(): string {
    return this.databaseId;
  }

  public getProjectId(): string {
    return this.projectId;
  }

  /**
   * CREATE: Persists submission to Firestore and initiates immediate Apps Script mirror.
   * Document ID is strictly clientSubmissionId to ensure retried requests overwrite idempotently.
   */
  public async createSubmission(
    input: CanonicalCreateInput,
    session?: any
  ): Promise<CanonicalSubmissionResult> {
    const payload = input.payload as any;
    const clientSubmissionId =
      payload.clientSubmissionId ||
      payload.client_submission_id ||
      payload.uniqueId ||
      input.idempotencyKey ||
      `CSC-${Date.now()}`;

    // 1. Check idempotency in memory or cache
    if (input.idempotencyKey && this.mockIdempotency.has(input.idempotencyKey)) {
      const existing = this.mockIdempotency.get(input.idempotencyKey)!;
      return {
        ...existing,
        isDuplicate: true,
        statusCode: 200,
        requestId: input.requestId,
      };
    }

    const now = new Date().toISOString();
    const rawState = payload.demographics?.state || payload.state || '';
    const state = canonicalizeStateName(rawState) || rawState;

    const gcsService = this.getActiveGcsService();
    const sheetPayload = clonePayloadValue(payload);
    const firestorePayload = clonePayloadValue(payload);

    const gcsPrep = await this.persistSubmissionAttachmentsToGcs(
      clientSubmissionId,
      firestorePayload,
      now,
      gcsService
    );
    if (!gcsPrep.ok) {
      return {
        status: 'error',
        statusCode: gcsPrep.statusCode,
        code: gcsPrep.code,
        message: gcsPrep.message,
        requestId: input.requestId,
      };
    }

    const authorId = firestorePayload.authorId || firestorePayload.submittedByWorkerId || firestorePayload.authorIdentifier || '';
    const baseDocData: Record<string, any> = {
      id: clientSubmissionId,
      clientSubmissionId,
      uniqueId: firestorePayload.uniqueId || clientSubmissionId,
      version: 1,
      revisionNumber: 1,
      status: firestorePayload.status || 'SUBMITTED',
      state,
      district: firestorePayload.demographics?.district || firestorePayload.district || '',
      taluk: firestorePayload.demographics?.taluk || firestorePayload.taluk || '',
      village: firestorePayload.demographics?.village || firestorePayload.village || '',
      childName: firestorePayload.demographics?.childName || firestorePayload.childName || '',
      submittedBy: firestorePayload.interviewerName || firestorePayload.submittedBy || 'Field Worker',
      authorId,
      submittedByWorkerId: authorId,
      authorIdentifier: authorId,
      artStatus: firestorePayload.clinical?.artStatus || firestorePayload.artStatus || '',
      vlStatus: firestorePayload.clinical?.vlStatus || firestorePayload.vlStatus || '',
      attendanceStatus: firestorePayload.education?.attendance || firestorePayload.attendanceStatus || '',
      ...gcsPrep.promotedTopFields,
      payload: {
        ...firestorePayload,
        clientSubmissionId,
        authorId,
        submittedByWorkerId: authorId,
        authorIdentifier: authorId,
      },
      attachments: gcsPrep.attachments,
      idempotencyKey: input.idempotencyKey,
      submissionTime: firestorePayload.submissionTime || now,
      createdAt: now,
      updatedAt: now,
      mirrorStatus: 'PENDING_SHEET_SYNC',
    };
    const integrity = stampSubmissionRowIntegrity(null, baseDocData);
    const docData = integrity.nextState;

    // 2. Persist to Firestore (or Mock Store)
    const db = await this.getDb();
    if (db) {
      const docRef = db.collection('submissions').doc(clientSubmissionId);
      const snap = await docRef.get();
      if (snap.exists) {
        // Document already exists (idempotent overwrite / duplicate retry)
        const existingData = snap.data();
        const dupResult: CanonicalSubmissionResult = {
          status: 'success',
          statusCode: 200,
          acknowledged: true,
          uniqueId: existingData.uniqueId || clientSubmissionId,
          remoteSubmissionId: clientSubmissionId,
          version: existingData.version || 1,
          revisionNumber: existingData.revisionNumber || 1,
          submissionStatus: existingData.status || 'SUBMITTED',
          isDuplicate: true,
          requestId: input.requestId,
          syncStatus: existingData.mirrorStatus || 'SYNCED',
          sheetSyncCompleted: existingData.mirrorStatus === 'SYNCED',
        };
        return dupResult;
      }
      await docRef.set(docData);
    } else {
      if (this.mockSubmissions.has(clientSubmissionId)) {
        const existing = this.mockSubmissions.get(clientSubmissionId);
        return {
          status: 'success',
          statusCode: 200,
          acknowledged: true,
          uniqueId: existing.uniqueId,
          remoteSubmissionId: clientSubmissionId,
          version: existing.version,
          revisionNumber: existing.revisionNumber,
          submissionStatus: existing.status,
          isDuplicate: true,
          requestId: input.requestId,
          syncStatus: existing.mirrorStatus || 'SYNCED',
          sheetSyncCompleted: existing.mirrorStatus === 'SYNCED',
        };
      }
      this.mockSubmissions.set(clientSubmissionId, docData);
    }

    // 3. Mirror to Google Sheets via Apps Script (Non-blocking / Background execution)
    let sheetSyncCompleted = false;
    let syncStatus: 'SYNCED' | 'PENDING_SHEET_SYNC' = 'PENDING_SHEET_SYNC';

    if (this.gatewayClient) {
      const mirrorTask = async () => {
        try {
          const mirrorRes = await this.gatewayClient!.callGateway({
            action: 'create',
            data: sheetPayload,
            payload: { ...sheetPayload, clientSubmissionId },
            uniqueId: sheetPayload.uniqueId || sheetPayload.artNumber || sheetPayload.demographics?.artNumber || sheetPayload.uuid || clientSubmissionId,
            ...sheetPayload,
            idempotencyKey: input.idempotencyKey,
            clientSubmissionId,
          });

          if (mirrorRes && (mirrorRes.status === 'success' || mirrorRes.statusCode === 200)) {
            await this.markSubmissionSynced(clientSubmissionId, {
              sheetRowNumber: mirrorRes.resolvedRow,
            });
          } else {
            throw new Error(mirrorRes?.message || 'Apps Script returned non-success status');
          }
        } catch (mirrorErr: any) {
          // Enqueue to sheets_mirror_retry_queue for scheduled replay
          await this.enqueueMirrorRetry({
            id: clientSubmissionId,
            submissionId: clientSubmissionId,
            clientSubmissionId,
            idempotencyKey: input.idempotencyKey,
            payload: { ...payload, clientSubmissionId },
            status: 'PENDING',
            retryCount: 0,
            nextRetryAt: new Date(Date.now() + 30000).toISOString(),
            lastError: mirrorErr?.message || 'Apps Script sync failed',
            createdAt: now,
            updatedAt: now,
          });
        }
      };

      if (process.env.FORCE_SYNC_MIRROR === 'true') {
        await mirrorTask();
        const m = this.mockSubmissions.get(clientSubmissionId);
        if (m?.mirrorStatus === 'SYNCED') {
          sheetSyncCompleted = true;
          syncStatus = 'SYNCED';
        }
      } else {
        // Run unawaited background mirror so submission returns in milliseconds
        mirrorTask().catch((err) => console.error('[MIRROR:ASYNC:ERROR]', err?.message));
      }
    }

    const result: CanonicalSubmissionResult = {
      status: 'success',
      statusCode: 200,
      acknowledged: true,
      uniqueId: clientSubmissionId,
      remoteSubmissionId: clientSubmissionId,
      version: 1,
      revisionNumber: 1,
      rowVersion: integrity.rowVersion,
      rowHash: integrity.rowHash,
      submissionStatus: 'SUBMITTED',
      assetStatus: 'NOT_REQUIRED',
      requestId: input.requestId,
      syncStatus,
      sheetSyncCompleted,
    };

    if (input.idempotencyKey) {
      this.mockIdempotency.set(input.idempotencyKey, result);
    }

    return result;
  }

  /**
   * Enqueues a failed sheets mirror request into the retry collection.
   */
  public async enqueueMirrorRetry(record: SheetsMirrorRetryRecord): Promise<void> {
    const db = await this.getDb();
    if (db) {
      await db.collection('sheets_mirror_retry_queue').doc(record.id).set(record);
    } else {
      this.mockRetryQueue.set(record.id, record);
    }
  }

  public async getRetryRecord(id: string): Promise<SheetsMirrorRetryRecord | null> {
    const db = await this.getDb();
    if (db) {
      const snap = await db.collection('sheets_mirror_retry_queue').doc(id).get();
      if (!snap.exists) return null;
      return snap.data() as SheetsMirrorRetryRecord;
    }
    return this.mockRetryQueue.get(id) || null;
  }

  /**
   * Replays pending jobs in sheets_mirror_retry_queue with exponential backoff.
   */
  public async replaySheetsMirrorRetryQueue(
    batchSize: number = 25,
    referenceTimeIso?: string
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const nowIso = referenceTimeIso || new Date().toISOString();

    const db = await this.getDb();
    let pendingJobs: SheetsMirrorRetryRecord[] = [];

    if (db) {
      const snap = await db
        .collection('sheets_mirror_retry_queue')
        .where('status', '==', 'PENDING')
        .where('nextRetryAt', '<=', nowIso)
        .limit(batchSize)
        .get();

      pendingJobs = snap.docs.map((d: any) => d.data() as SheetsMirrorRetryRecord);

      // Also drain any submissions stuck in PENDING_SHEET_SYNC
      if (pendingJobs.length < batchSize) {
        const remainingQuota = batchSize - pendingJobs.length;
        const pendingSubSnap = await db
          .collection('submissions')
          .where('mirrorStatus', '==', 'PENDING_SHEET_SYNC')
          .limit(remainingQuota)
          .get();

        for (const doc of pendingSubSnap.docs) {
          const subData = doc.data();
          if (!pendingJobs.some((j) => j.clientSubmissionId === subData.id || j.submissionId === subData.id)) {
            pendingJobs.push({
              id: `retry_${subData.id}`,
              submissionId: subData.id,
              clientSubmissionId: subData.id,
              payload: subData.payload || subData,
              idempotencyKey: subData.idempotencyKey || `retry_${subData.id}`,
              retryCount: 0,
              status: 'PENDING',
              nextRetryAt: nowIso,
              createdAt: subData.createdAt || nowIso,
              updatedAt: nowIso,
            });
          }
        }
      }
    } else {
      pendingJobs = Array.from(this.mockRetryQueue.values())
        .filter((j) => j.status === 'PENDING' && j.nextRetryAt <= nowIso)
        .slice(0, batchSize);
    }

    for (const job of pendingJobs) {
      processed++;
      try {
        if (!this.gatewayClient) throw new Error('No gateway client configured for retry replay');

        const res = await this.gatewayClient.callGateway({
          action: 'create',
          data: job.payload,
          payload: job.payload,
          uniqueId: job.payload?.uniqueId || job.payload?.artNumber || job.payload?.demographics?.artNumber || job.payload?.uuid || job.submissionId,
          ...(job.payload || {}),
          idempotencyKey: job.idempotencyKey,
          clientSubmissionId: job.clientSubmissionId || job.submissionId,
        });

        if (res && (res.status === 'success' || res.statusCode === 200)) {
          succeeded++;
          if (db) {
            await db.collection('sheets_mirror_retry_queue').doc(job.id).update({
              status: 'SYNCED',
              updatedAt: new Date().toISOString(),
            });
          } else {
            job.status = 'SYNCED';
            job.updatedAt = new Date().toISOString();
          }
          await this.markSubmissionSynced(job.clientSubmissionId || job.submissionId, {
            sheetRowNumber: res.resolvedRow,
          });
        } else {
          throw new Error(res?.message || 'Gateway returned failure on retry');
        }
      } catch (err: any) {
        failed++;
        const nextCount = (job.retryCount || 0) + 1;
        const isDeadLetter = nextCount >= 5;
        // Exponential backoff: 30s * 2^retryCount
        const backoffSeconds = 30 * Math.pow(2, nextCount);
        const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        const updates = {
          retryCount: nextCount,
          status: (isDeadLetter ? 'DEAD_LETTER' : 'PENDING') as 'DEAD_LETTER' | 'PENDING',
          nextRetryAt,
          lastError: err?.message || 'Retry failed',
          updatedAt: new Date().toISOString(),
        };

        if (db) {
          await db.collection('sheets_mirror_retry_queue').doc(job.id).update(updates);
        } else {
          Object.assign(job, updates);
        }
      }
    }

    return { processed, succeeded, failed };
  }

  /**
   * Alias for replaySheetsMirrorRetryQueue matching worker terminology.
   */
  public async drainSheetsMirrorRetryQueue(
    batchSize: number = 25,
    referenceTimeIso?: string
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    return this.replaySheetsMirrorRetryQueue(batchSize, referenceTimeIso);
  }

  /**
   * Helper: Resolves Firestore document reference and data across document ID, uniqueId, and clientSubmissionId.
   */
  public async resolveSubmissionDoc(id: string, db: any): Promise<{ ref: any; data: any } | null> {
    if (!db) return null;
    try {
      // 1. Direct document ID lookup
      const directDoc = db.collection('submissions').doc(id);
      const directSnap = await directDoc.get();
      if (directSnap.exists) {
        return { ref: directDoc, data: { id: directSnap.id, ...directSnap.data() } };
      }
      // 2. Query by uniqueId
      let q = await db.collection('submissions').where('uniqueId', '==', id).limit(1).get();
      if (!q.empty) {
        const snap = q.docs[0];
        return { ref: snap.ref, data: { id: snap.id, ...snap.data() } };
      }
      // 3. Query by '1\nUnique Identifier'
      q = await db.collection('submissions').where('1\nUnique Identifier', '==', id).limit(1).get();
      if (!q.empty) {
        const snap = q.docs[0];
        return { ref: snap.ref, data: { id: snap.id, ...snap.data() } };
      }
      // 4. Query by clientSubmissionId
      q = await db.collection('submissions').where('clientSubmissionId', '==', id).limit(1).get();
      if (!q.empty) {
        const snap = q.docs[0];
        return { ref: snap.ref, data: { id: snap.id, ...snap.data() } };
      }
      return null;
    } catch (err) {
      console.error(`[FIRESTORE] Error resolving submission doc for ${id}:`, err);
      throw err;
    }
  }

  public resolveMockSubmission(id: string): any {
    if (this.mockSubmissions.has(id)) {
      return this.mockSubmissions.get(id);
    }
    for (const [, item] of this.mockSubmissions.entries()) {
      if (
        item.uniqueId === id ||
        item['1\nUnique Identifier'] === id ||
        item.clientSubmissionId === id ||
        item.id === id ||
        item.payload?.uniqueId === id ||
        item.payload?.clientSubmissionId === id
      ) {
        return item;
      }
    }
    return null;
  }

  /**
   * Updates mirrorStatus to SYNCED in Firestore and records sheetRowNumber if provided.
   * Advances rowVersion & recomputes rowHash through the central integrity helper.
   */
  public async markSubmissionSynced(id: string, details?: { sheetRowNumber?: number }): Promise<void> {
    const db = await this.getDb();
    const updatePayload: Record<string, any> = {
      mirrorStatus: 'SYNCED',
      mirroredAt: new Date().toISOString(),
    };
    if (details?.sheetRowNumber !== undefined) {
      updatePayload.sheetRowNumber = details.sheetRowNumber;
    }
    if (db) {
      const resolved = await this.resolveSubmissionDoc(id, db);
      if (resolved) {
        const integrity = stampSubmissionRowIntegrity(resolved.data, updatePayload);
        await resolved.ref.update(integrity.stampedUpdates);
      }
    } else {
      const existing = this.resolveMockSubmission(id);
      if (existing) {
        const integrity = stampSubmissionRowIntegrity(existing, updatePayload);
        Object.assign(existing, integrity.stampedUpdates);
      }
    }
  }

  /**
   * UPDATE: Updates submission in Firestore and mirrors patch to Sheets.
   */
  public async updateSubmission(
    input: CanonicalUpdateInput,
    session?: any
  ): Promise<CanonicalSubmissionResult> {
    const { submissionId, patch } = input;
    const now = new Date().toISOString();
    const db = await this.getDb();

    let existing: any = null;
    let actualDocRef: any = null;
    if (db) {
      const resolved = await this.resolveSubmissionDoc(submissionId, db);
      if (!resolved || resolved.data.deletedAt || resolved.data.isDeleted === true || resolved.data.status === 'DELETED') {
        return {
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${submissionId} not found in Firestore.`,
        };
      }
      existing = resolved.data;
      actualDocRef = resolved.ref;
    } else {
      existing = this.resolveMockSubmission(submissionId);
      if (!existing || existing.deletedAt || existing.isDeleted === true || existing.status === 'DELETED') {
        return {
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${submissionId} not found in Firestore.`,
        };
      }
    }

    const nextVersion = (existing.version || 1) + 1;
    const updatedPayload = { ...(existing.payload || existing), ...patch };
    const updates: Record<string, any> = {
      version: nextVersion,
      revisionNumber: nextVersion,
      payload: updatedPayload,
      updatedAt: now,
    };

    if (patch.status) updates.status = patch.status;
    if (patch.childName || (patch as any).demographics?.childName) {
      updates.childName = patch.childName || (patch as any).demographics?.childName;
    }
    if (patch.state || (patch as any).demographics?.state) {
      updates.state = patch.state || (patch as any).demographics?.state;
    }
    if (patch.district || (patch as any).demographics?.district) {
      updates.district = patch.district || (patch as any).demographics?.district;
    }

    const integrity = stampSubmissionRowIntegrity(existing, updates);

    if (db && actualDocRef) {
      await actualDocRef.update(integrity.stampedUpdates);
    } else if (existing) {
      Object.assign(existing, integrity.stampedUpdates);
    }

    const resolvedUniqueId = existing.uniqueId || existing['1\nUnique Identifier'] || submissionId;

    // Mirror update to Google Sheets
    if (this.gatewayClient) {
      try {
        await this.gatewayClient.callGateway({
          action: 'update',
          uniqueId: resolvedUniqueId,
          data: patch,
          payload: patch,
          patch,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (mirrorErr) {
        console.warn(`[FIRESTORE_MIRROR] Update mirror failed for ${resolvedUniqueId}:`, mirrorErr);
      }
    }

    return {
      status: 'success',
      statusCode: 200,
      acknowledged: true,
      uniqueId: resolvedUniqueId,
      remoteSubmissionId: existing.id || submissionId,
      version: nextVersion,
      revisionNumber: nextVersion,
      rowVersion: integrity.rowVersion,
      rowHash: integrity.rowHash,
      submissionStatus: updates.status || existing.status,
      requestId: input.requestId,
    };
  }

  /**
   * GET: Retrieves submission by ID from Firestore (supporting docId, uniqueId, or clientSubmissionId).
   * Excludes soft-deleted tombstones unless options.includeDeleted is true.
   */
  public async getSubmission(
    id: string,
    session?: any,
    options?: { includeDeleted?: boolean }
  ): Promise<any> {
    const isDeletedRecord = (rec: any) =>
      Boolean(rec && (rec.deletedAt || rec.isDeleted === true || rec.status === 'DELETED'));

    const db = await this.getDb();
    if (db) {
      const resolved = await this.resolveSubmissionDoc(id, db);
      if (!resolved) return null;
      if (!options?.includeDeleted && isDeletedRecord(resolved.data)) {
        return null;
      }
      return resolved.data;
    }
    const mockRec = this.resolveMockSubmission(id);
    if (!mockRec) return null;
    if (!options?.includeDeleted && isDeletedRecord(mockRec)) {
      return null;
    }
    return mockRec;
  }

  /**
   * LIST: Queries submissions with optional state/district filtering and cursor pagination.
   */
  public async listSubmissions(
    params: CanonicalListParams & { includeDeleted?: boolean } = {},
    session?: any
  ): Promise<any> {
    const limit = params.limit || 50;
    const includeDeleted = Boolean(params.includeDeleted);
    const isDeletedRecord = (rec: any) =>
      Boolean(rec && (rec.deletedAt || rec.isDeleted === true || rec.status === 'DELETED'));
    const db = await this.getDb();

    if (db) {
      let query = db.collection('submissions').orderBy('submissionTime', 'desc');
      if (params.state && params.state !== '*' && params.state.toUpperCase() !== 'ALL') {
        const variants = getStateQueryVariants(params.state);
        if (variants.length > 0) {
          query = query.where('state', 'in', variants);
        }
      }
      if (params.district && params.district !== '*' && params.district.toUpperCase() !== 'ALL') {
        query = query.where('district', '==', params.district);
      }
      if (params.status && params.status !== '*' && params.status.toUpperCase() !== 'ALL') {
        query = query.where('status', '==', params.status);
      }
      if (params.cursor) {
        query = query.startAfter(params.cursor);
      }

      const snap = await query.limit(limit).get();
      const rawItems = snap.docs.map((d: any) => d.data());
      const items = includeDeleted
        ? rawItems
        : rawItems.filter((item: any) => !isDeletedRecord(item));
      const hasMore = snap.docs.length === limit;
      const lastRaw = rawItems[rawItems.length - 1];
      const nextCursor = hasMore && lastRaw ? (lastRaw.submissionTime || lastRaw.id) : null;
      return {
        items,
        totalCount: items.length,
        hasMore,
        nextCursor,
      };
    }

    let items = Array.from(this.mockSubmissions.values());
    if (!includeDeleted) {
      items = items.filter((i) => !isDeletedRecord(i));
    }
    if (params.state && params.state !== '*' && params.state.toUpperCase() !== 'ALL') {
      const variants = getStateQueryVariants(params.state);
      items = items.filter((i) => variants.some((v) => v.toLowerCase() === (i.state || '').toLowerCase()));
    }
    if (params.district && params.district !== '*' && params.district.toUpperCase() !== 'ALL') {
      const targetDistrict = params.district.toLowerCase();
      items = items.filter((i) => (i.district || '').toLowerCase() === targetDistrict);
    }
    if (params.status && params.status !== '*' && params.status.toUpperCase() !== 'ALL') {
      const targetStatus = params.status.toLowerCase();
      items = items.filter((i) => (i.status || '').toLowerCase() === targetStatus);
    }
    items.sort((a, b) => (b.submissionTime || '').localeCompare(a.submissionTime || ''));

    const paginated = items.slice(0, limit);
    const hasMore = items.length > limit;
    const nextCursor = hasMore && paginated.length > 0 ? (paginated[paginated.length - 1].submissionTime || paginated[paginated.length - 1].id) : null;

    return {
      items: paginated,
      totalCount: items.length,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Supervisor List DTOs with status filtering.
   */
  public async listSupervisorSubmissions(
    params: CanonicalListParams = {},
    session?: any
  ): Promise<{ items: SupervisorListDTO[]; nextCursor: string | null; totalCount: number }> {
    const res = await this.listSubmissions(params, session);
    const dtos: SupervisorListDTO[] = res.items.map((i: any) => {
      const p = i.payload || {};
      return {
        uniqueId: i.uniqueId || i.id,
        remoteSubmissionId: i.id,
        revisionNumber: i.revisionNumber || 1,
        version: i.version || 1,
        submissionTime: i.submissionTime || '',
        submittedBy: i.submittedBy || '',
        consentObtained: p.consentObtained || 'Yes',
        hasSignature: Boolean(
          i.signatureDataUrl ||
          i.signatureUrl ||
          p.signatureDataUrl ||
          p.signatureUrl ||
          p.signatureLink ||
          p.signaturePhotoUrl ||
          p.caregiverConsent?.signatureDataUrl ||
          p.caregiverConsent?.signatureUrl ||
          p.consent?.signatureDataUrl ||
          p.consent?.caregiverSignature
        ),
        visitDate: p.visitDate || '',
        interviewerName: i.submittedBy || '',
        childName: i.childName || '',
        dob: p.dob || '',
        age: Number(p.age) || 0,
        gender: p.gender || '',
        orphanStatus: p.orphanStatus || '',
        caregiverName: p.caregiverName || '',
        caregiverRelation: p.caregiverRelation || '',
        caregiverContact: p.caregiverContact || '',
        address: p.address || '',
        state: i.state || '',
        district: i.district || '',
        accountHolderName: p.accountHolderName || '',
        bankAccountNumberMasked: p.bankAccountNumber ? '••••••••' : '',
        bankIfsc: p.bankIfsc || '',
        bankMobile: p.bankMobile || '',
        maskedAadhaar: p.aadhaarNumber ? '••••••••••••' : '',
        hasPassbook: Boolean(
          i.passbookPhotoUrl ||
          p.passbookPhotoUrl ||
          p.passbookLink ||
          p.bankingAndKyc?.passbookPhotoUrl
        ),
        hasAadhaar: Boolean(
          i.aadhaarCardPhotoUrl ||
          p.aadhaarCardPhotoUrl ||
          p.aadhaarPhotoUrl ||
          p.aadhaarLink ||
          p.bankingAndKyc?.aadhaarCardPhotoUrl
        ),
        hasChildPhoto: Boolean(
          i.childPhotoUrl ||
          p.childPhotoUrl ||
          p.childPhotoLink ||
          p.bankingAndKyc?.childPhotoUrl
        ),
        householdMembers: Number(p.householdMembers) || 0,
        noOfChildren: Number(p.noOfChildren) || 0,
        monthlyIncome: Number(p.monthlyIncome) || 0,
        incomeSource: p.incomeSource || '',
        weightKg: Number(p.weightKg) || 0,
        heightCm: Number(p.heightCm) || 0,
        bmi: Number(p.bmi) || 0,
        bmiCategory: p.bmiCategory || '',
        hb: Number(p.hb) || 0,
        hbCategory: p.hbCategory || '',
        comorbidities: p.comorbidities || '',
        artStatus: i.artStatus || '',
        artRegistrationDate: p.artRegistrationDate || '',
        artIdNumber: p.artIdNumber || '',
        vlStatus: i.vlStatus || '',
        vlDate: p.vlDate || '',
        vlCategory: p.vlCategory || '',
        educationStatus: p.educationStatus || '',
        schoolName: p.schoolName || '',
        currentClass: p.currentClass || '',
        attendanceStatus: i.attendanceStatus || '',
        totalAnnualEducationCost: Number(p.totalAnnualEducationCost) || 0,
        hasFeeReceipt: Boolean(
          i.feeReceiptPhotoUrl ||
          p.feeReceiptPhotoUrl ||
          p.feeReceiptUrl ||
          p.feeReceiptLink ||
          p.educationExpenses?.feeReceiptPhotoUrl
        ),
        hasMarksheet: Boolean(
          i.marksheetPhotoUrl ||
          p.marksheetPhotoUrl ||
          p.marksheetPhotoLink ||
          p.educationExpenses?.marksheetPhotoUrl
        ),
        remarks: p.remarks || '',
        approvedAllianceIndia: p.approvedAllianceIndia || '',
        reviewConfirmed: Boolean(p.reviewConfirmed),
        organizationName: p.organizationName || '',
        formSubmittedBy: i.submittedBy || '',
        organizationEmail: p.organizationEmail || '',
        syncNeeded: p.syncNeeded || '',
        lastUpdated: i.updatedAt || '',
        submissionStatus: i.status || 'SUBMITTED',
        srName: p.srName || '',
        ssrName: p.ssrName || '',
        guardianStatus: p.guardianStatus || '',
        artMedicineType: p.artMedicineType || '',
        cd4Count: p.cd4Count,
        hasDisability: p.hasDisability || '',
        disabilityType: p.disabilityType || '',
        disabilityCertificateStatus: p.disabilityCertificateStatus || '',
        receivingEducationSchemeBenefit: p.receivingEducationSchemeBenefit || '',
        malnutritionSymptoms: p.malnutritionSymptoms || '',
        educationSchemeNames: p.educationSchemeNames || [],
        educationSchemeNameSpecify: p.educationSchemeNameSpecify || '',
        sheetRowNumber: i.sheetRowNumber,
      };
    });

    return {
      items: dtos,
      totalCount: dtos.length,
      nextCursor: null,
    };
  }

  /**
   * SOFT DELETE: Tombstones document in Firestore (deletedAt/deletedBy/deleteReason)
   * instead of erasing, and mirrors trash request best-effort to Sheets/Drive.
   */
  public async deleteSubmission(
    id: string,
    context?: {
      actorId?: string;
      actorName?: string;
      actorRole?: string;
      reason?: string;
      deletedAt?: string;
      requestId?: string;
    }
  ): Promise<any> {
    const db = await this.getDb();
    const now = context?.deletedAt || new Date().toISOString();
    let existing: any = null;
    let resolvedRef: any = null;

    if (db) {
      const resolved = await this.resolveSubmissionDoc(id, db);
      if (!resolved) {
        return {
          success: false,
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${id} not found in Firestore.`,
        };
      }
      existing = resolved.data;
      resolvedRef = resolved.ref;
    } else {
      existing = this.resolveMockSubmission(id);
      if (!existing) {
        return {
          success: false,
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${id} not found.`,
        };
      }
    }

    const resolvedId = existing.id || id;
    const resolvedUniqueId = existing.uniqueId || existing['1\nUnique Identifier'] || resolvedId;

    if (existing.deletedAt || existing.isDeleted === true || existing.status === 'DELETED') {
      return {
        success: true,
        status: 'success',
        statusCode: 200,
        deleted: true,
        softDeleted: true,
        alreadyDeleted: true,
        id: resolvedId,
        uniqueId: resolvedUniqueId,
        deletedAt: existing.deletedAt,
        deletedBy: existing.deletedBy,
        reason: existing.deleteReason,
        message: `Record ${resolvedId} is already soft-deleted.`,
      };
    }

    const cleanReason = (context?.reason || '').trim() || 'Deleted by Administration';
    const tombstone: Record<string, any> = {
      deletedAt: now,
      deletedBy: context?.actorId || 'system',
      deletedByName: context?.actorName || context?.actorId || 'System',
      deletedByRole: context?.actorRole || 'LEADERSHIP',
      deleteReason: cleanReason,
      previousStatus: existing.previousStatus || (existing.status !== 'DELETED' ? existing.status : 'SUBMITTED') || 'SUBMITTED',
      status: 'DELETED',
      isDeleted: true,
      updatedAt: now,
    };
    const integrity = stampSubmissionRowIntegrity(existing, tombstone);

    if (db && resolvedRef) {
      await resolvedRef.update(integrity.stampedUpdates);
    } else if (existing) {
      Object.assign(existing, integrity.stampedUpdates);
    }

    // Clean up associated GCS attachment objects best-effort when STORAGE_PROVIDER=gcs
    const gcsService = this.getActiveGcsService();
    if (gcsService) {
      const gcsUris = collectGcsUrisFromRecord(existing);
      if (gcsUris.length > 0) {
        await Promise.allSettled(gcsUris.map((uri) => gcsService.deleteAttachment(uri)));
      }
    }

    if (this.gatewayClient) {
      try {
        await this.gatewayClient.callGateway({
          action: 'delete',
          softDelete: true,
          uniqueId: resolvedUniqueId,
          submissionId: resolvedId,
          remoteSubmissionId: resolvedId,
          deletedAt: now,
          deletedBy: tombstone.deletedBy,
          reason: cleanReason,
          state: existing.state || existing.payload?.state || '',
          requestId: context?.requestId,
        });
      } catch (mirrorErr: any) {
        console.warn(`[FIRESTORE_MIRROR] Soft delete mirror failed for ${resolvedUniqueId}:`, mirrorErr?.message);
      }
    }

    return {
      success: true,
      status: 'success',
      statusCode: 200,
      deleted: true,
      softDeleted: true,
      id: resolvedId,
      uniqueId: resolvedUniqueId,
      deletedAt: now,
      deletedBy: tombstone.deletedBy,
      reason: cleanReason,
      rowVersion: integrity.rowVersion,
      rowHash: integrity.rowHash,
      message: `Record ${resolvedId} soft-deleted successfully.`,
    };
  }

  /**
   * RESTORE: Restores a soft-deleted submission tombstone and marks it active.
   */
  public async restoreSubmission(
    id: string,
    context?: {
      actorId?: string;
      actorName?: string;
      actorRole?: string;
      reason?: string;
      requestId?: string;
    }
  ): Promise<any> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    let existing: any = null;
    let resolvedRef: any = null;

    if (db) {
      const resolved = await this.resolveSubmissionDoc(id, db);
      if (!resolved) {
        return {
          success: false,
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${id} not found in Firestore.`,
        };
      }
      existing = resolved.data;
      resolvedRef = resolved.ref;
    } else {
      existing = this.resolveMockSubmission(id);
      if (!existing) {
        return {
          success: false,
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${id} not found.`,
        };
      }
    }

    const resolvedId = existing.id || id;
    const resolvedUniqueId = existing.uniqueId || existing['1\nUnique Identifier'] || resolvedId;
    if (!existing.deletedAt && existing.isDeleted !== true && existing.status !== 'DELETED') {
      return {
        success: false,
        status: 'error',
        statusCode: 409,
        code: 'NOT_DELETED',
        message: `Record ${resolvedId} is not soft-deleted.`,
      };
    }

    const restoredStatus =
      existing.previousStatus && existing.previousStatus !== 'DELETED' ? existing.previousStatus : 'SUBMITTED';
    const restoreUpdates: Record<string, any> = {
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
      deletedByRole: null,
      deleteReason: null,
      isDeleted: false,
      status: restoredStatus,
      restoredAt: now,
      restoredBy: context?.actorId || 'system',
      restoreReason: (context?.reason || '').trim() || 'Restored by Administration',
      updatedAt: now,
    };
    const integrity = stampSubmissionRowIntegrity(existing, restoreUpdates);

    if (db && resolvedRef) {
      await resolvedRef.update(integrity.stampedUpdates);
    } else if (existing) {
      Object.assign(existing, integrity.stampedUpdates);
    }

    if (this.gatewayClient) {
      try {
        await this.gatewayClient.callGateway({
          action: 'restore',
          uniqueId: resolvedUniqueId,
          submissionId: resolvedId,
          remoteSubmissionId: resolvedId,
          data: existing.payload || existing,
          payload: existing.payload || existing,
          restoredAt: now,
          restoredBy: restoreUpdates.restoredBy,
          requestId: context?.requestId,
        });
      } catch (mirrorErr: any) {
        console.warn(`[FIRESTORE_MIRROR] Restore mirror failed for ${resolvedUniqueId}:`, mirrorErr?.message);
      }
    }

    return {
      success: true,
      status: 'success',
      statusCode: 200,
      restored: true,
      id: resolvedId,
      remoteSubmissionId: resolvedId,
      uniqueId: resolvedUniqueId,
      restoredAt: now,
      restoredBy: restoreUpdates.restoredBy,
      rowVersion: integrity.rowVersion,
      rowHash: integrity.rowHash,
      message: `Record ${resolvedId} restored successfully.`,
    };
  }

  /**
   * UPDATE ASSET: Updates document attachment metadata and mirrors replacement to Google Apps Script / Google Drive.
   */
  public async updateAsset(input: CanonicalReplaceAssetInput): Promise<CanonicalSubmissionResult> {
    const { submissionId, docType, fileData } = input;
    const db = await this.getDb();
    const now = new Date().toISOString();

    let existing: any = null;
    let resolvedRef: any = null;

    if (db) {
      const resolved = await this.resolveSubmissionDoc(submissionId, db);
      if (!resolved || resolved.data.deletedAt || resolved.data.isDeleted === true || resolved.data.status === 'DELETED') {
        return {
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${submissionId} not found.`,
        };
      }
      existing = resolved.data;
      resolvedRef = resolved.ref;
    } else {
      existing = this.resolveMockSubmission(submissionId);
      if (!existing || existing.deletedAt || existing.isDeleted === true || existing.status === 'DELETED') {
        return {
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${submissionId} not found.`,
        };
      }
    }

    const resolvedUniqueId = existing.uniqueId || existing['1\nUnique Identifier'] || submissionId;
    const normDocType = String(docType || '').toLowerCase();
    const fieldMap: Record<string, string> = {
      passbookphoto: 'passbookPhotoUrl',
      passbook: 'passbookPhotoUrl',
      aadhaarcardphoto: 'aadhaarCardPhotoUrl',
      aadhaar: 'aadhaarCardPhotoUrl',
      childphoto: 'childPhotoUrl',
      photo: 'childPhotoUrl',
      feereceiptphoto: 'feeReceiptPhotoUrl',
      feereceipt: 'feeReceiptPhotoUrl',
      fee_receipt: 'feeReceiptPhotoUrl',
      marksheetphoto: 'marksheetPhotoUrl',
      marksheet: 'marksheetPhotoUrl',
      signature: 'signatureDataUrl',
      signaturedataurl: 'signatureDataUrl',
    };
    const fieldKey = fieldMap[normDocType] ||
      (normDocType.includes('passbook') ? 'passbookPhotoUrl' :
       normDocType.includes('aadhaar') ? 'aadhaarCardPhotoUrl' :
       normDocType.includes('fee') ? 'feeReceiptPhotoUrl' :
       normDocType.includes('mark') ? 'marksheetPhotoUrl' :
       normDocType.includes('sig') ? 'signatureDataUrl' :
       normDocType.includes('photo') ? 'childPhotoUrl' : undefined);

    let cellFormula: string | undefined;
    let newFileId: string | undefined;
    let newRevision: number = (existing.version || existing.revisionNumber || 1) + 1;

    const canonicalDocType = normalizeDocTypeCanonical(docType);
    const gcsService = this.getActiveGcsService();
    const parsedAsset = gcsService
      ? decodeBinaryAttachmentInput(
          (input as any).buffer || fileData,
          canonicalDocType,
          (input as any).fileName,
          (input as any).mimeType
        )
      : null;

    if (gcsService && parsedAsset) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(parsedAsset.mimeType)) {
        return {
          status: 'error',
          statusCode: 415,
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: `Unsupported MIME type '${parsedAsset.mimeType}'.`,
          requestId: input.requestId,
        };
      }
      if (parsedAsset.buffer.length > 3 * 1024 * 1024) {
        return {
          status: 'error',
          statusCode: 413,
          code: 'ASSET_TOO_LARGE',
          message: `Attachment size ${parsedAsset.buffer.length} bytes exceeds maximum limit.`,
          requestId: input.requestId,
        };
      }
    }

    // Mirror replacement to Google Apps Script / Drive
    if (this.gatewayClient) {
      try {
        const gasRes = await this.gatewayClient.callGateway({
          action: 'replaceAsset',
          remoteSubmissionId: existing.id || submissionId,
          submissionId: resolvedUniqueId,
          uniqueId: resolvedUniqueId,
          slotPrefix: docType,
          docType,
          fileDataUrl: fileData,
          fileData,
          expectedRevision: input.expectedRevision !== undefined ? input.expectedRevision : input.expectedVersion,
          expectedVersion: input.expectedRevision !== undefined ? input.expectedRevision : input.expectedVersion,
          expectedCurrentCellStateHash: input.expectedCurrentCellStateHash,
          requestId: input.requestId,
        });

        if (gasRes && (gasRes.status === 'success' || gasRes.statusCode === 200)) {
          cellFormula = gasRes.cellFormula;
          newFileId = gasRes.newFileId;
          if (gasRes.newRevision) newRevision = gasRes.newRevision;
        } else if (gasRes && gasRes.code === 'OCC_CONFLICT') {
          return {
            status: 'conflict',
            statusCode: 409,
            code: 'OCC_CONFLICT',
            message: gasRes.message || 'OCC conflict during asset replacement.',
            requestId: input.requestId,
          };
        }
      } catch (err: any) {
        console.warn(`[FIRESTORE_MIRROR] replaceAsset mirror failed for ${resolvedUniqueId}:`, err?.message);
      }
    }

    const targetSubmissionIdForGcs = existing.id || existing.clientSubmissionId || submissionId;
    let gcsUri: string | undefined;
    let gcsMetadata: Record<string, any> | undefined;

    if (gcsService && parsedAsset) {
      const uploadRes = await this.uploadAttachmentToGcsOrFail(
        gcsService,
        targetSubmissionIdForGcs,
        canonicalDocType,
        parsedAsset,
        now
      );
      if (!uploadRes.ok) {
        return {
          status: 'error',
          statusCode: uploadRes.statusCode,
          code: uploadRes.code,
          message: uploadRes.message,
          requestId: input.requestId,
        };
      }
      gcsUri = uploadRes.gcsUri;
      gcsMetadata = uploadRes.metadata;
    }

    const existingAttachments = Array.isArray(existing.attachments) ? existing.attachments : [];
    const attachments = gcsUri
      ? existingAttachments.filter(
          (att: any) => normalizeDocTypeCanonical(att?.docType || att?.type || '') !== canonicalDocType
        )
      : [...existingAttachments];

    if (gcsUri && gcsMetadata) {
      attachments.push({
        ...gcsMetadata,
        docType,
        canonicalDocType,
        ...(newFileId ? { newFileId } : {}),
        ...(cellFormula ? { driveCellFormula: cellFormula } : {}),
        updatedAt: now,
      });
    } else {
      attachments.push({
        docType,
        fileDataPreview: typeof fileData === 'string' ? fileData.substring(0, 64) : '',
        newFileId,
        cellFormula,
        updatedAt: now,
      });
    }

    const updatePayload: Record<string, any> = {
      version: newRevision,
      revisionNumber: newRevision,
      attachments,
      updatedAt: now,
    };

    if (fieldKey) {
      const storedVal = gcsUri || cellFormula || fileData;
      updatePayload[fieldKey] = storedVal;
      const clonedPayload = existing.payload ? clonePayloadValue(existing.payload) : undefined;
      if (clonedPayload && typeof clonedPayload === 'object') {
        clonedPayload[fieldKey] = storedVal;
        const descriptor = getSlotDescriptorForDocType(canonicalDocType);
        if (descriptor) {
          for (const container of descriptor.nestedContainers) {
            if (clonedPayload[container.containerKey] && typeof clonedPayload[container.containerKey] === 'object') {
              clonedPayload[container.containerKey][descriptor.primaryFieldKey] = storedVal;
              for (const k of container.keys) {
                if (clonedPayload[container.containerKey][k] !== undefined) {
                  clonedPayload[container.containerKey][k] = storedVal;
                }
              }
            }
          }
          if (clonedPayload.raw_payload && typeof clonedPayload.raw_payload === 'object') {
            clonedPayload.raw_payload[fieldKey] = storedVal;
          }
        }
        clonedPayload.attachments = attachments;
        updatePayload.payload = clonedPayload;
      }
    }

    const integrity = stampSubmissionRowIntegrity(existing, updatePayload);

    if (db && resolvedRef) {
      await resolvedRef.update(integrity.stampedUpdates);
    } else if (existing) {
      Object.assign(existing, integrity.stampedUpdates);
    }

    return {
      status: 'success',
      statusCode: 200,
      acknowledged: true,
      remoteSubmissionId: existing.id || submissionId,
      uniqueId: resolvedUniqueId,
      docType,
      cellFormula,
      gcsUri,
      newFileId,
      newRevision,
      version: newRevision,
      revisionNumber: newRevision,
      rowVersion: integrity.rowVersion,
      rowHash: integrity.rowHash,
      updatedAt: now,
      requestId: input.requestId,
    };
  }

  private buildSnapshotItem(docId: string, data: Record<string, any>): ReconcileSnapshotItem {
    const isDeleted = Boolean(data.deletedAt || data.isDeleted === true || data.is_deleted === true || data.status === 'DELETED');
    const rowVersion =
      typeof data.rowVersion === 'number' && Number.isFinite(data.rowVersion) && data.rowVersion >= 1
        ? data.rowVersion
        : typeof data.row_version === 'number' && Number.isFinite(data.row_version) && data.row_version >= 1
          ? data.row_version
          : Number(data.version || data.revisionNumber || 1) || 1;
    const rowHash =
      typeof data.rowHash === 'string' && /^[a-f0-9]{64}$/i.test(data.rowHash)
        ? data.rowHash
        : computeSubmissionRowHash(data);

    const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
    const demo = payload.demographics && typeof payload.demographics === 'object' ? payload.demographics : data.demographics || {};
    const state = String(
      data.state ||
      demo.state ||
      payload.state ||
      data['18\nState'] ||
      ''
    ).trim();

    return {
      id: docId,
      uniqueId: String(data.uniqueId || data['1\nUnique Identifier'] || data.clientSubmissionId || data.id || docId).trim(),
      submissionId: String(data.clientSubmissionId || data.id || docId).trim(),
      state,
      rowVersion,
      rowHash,
      version: Number(data.version || data.revisionNumber || 1) || 1,
      updatedAt: data.updatedAt || data.submissionTime || data.createdAt || null,
      isDeleted,
      deletedAt: data.deletedAt || data.deleted_at || null,
      deletedBy: data.deletedBy || data.deleted_by || null,
      deleteReason: data.deleteReason || data.delete_reason || null,
    };
  }

  /**
   * Keyset-paginated, ID-ordered reconciliation snapshot over all Firestore submissions
   * (both active records and soft-deleted tombstones) without leaking child PII.
   */
  public async listReconcileSnapshot(
    params: { afterId?: string; limit?: number } = {}
  ): Promise<ReconcileSnapshotPage> {
    const limit = Math.min(Math.max(Math.trunc(Number(params.limit) || 200), 1), 500);
    const afterId = params.afterId ? String(params.afterId).trim() : '';

    const db = await this.getDb();
    let rawDocs: Array<{ docId: string; data: Record<string, any> }> = [];

    if (db) {
      const col = db.collection('submissions');
      if (typeof col.orderBy === 'function') {
        const firestoreMod = await import('@google-cloud/firestore').catch(() => null as any);
        const docIdField = firestoreMod?.FieldPath?.documentId?.() ?? '__name__';
        let query = col.orderBy(docIdField);
        if (afterId) {
          query = query.startAfter(afterId);
        }
        const snap = await query.limit(limit + 1).get();
        rawDocs = (snap.docs || []).map((d: any) => {
          const data = typeof d.data === 'function' ? d.data() : d;
          return {
            docId: String(d.id || data?.id || ''),
            data,
          };
        });
      } else {
        const snap = await col.get();
        rawDocs = (snap.docs || [])
          .map((d: any) => {
            const data = typeof d.data === 'function' ? d.data() : d;
            return {
              docId: String(d.id || data?.id || ''),
              data,
            };
          })
          .sort((a: { docId: string }, b: { docId: string }) =>
            a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0
          )
          .filter((entry: { docId: string }) => !afterId || entry.docId > afterId)
          .slice(0, limit + 1);
      }
    } else {
      rawDocs = Array.from(this.mockSubmissions.entries())
        .map(([docId, data]) => ({ docId: String(docId), data }))
        .sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0))
        .filter((entry) => !afterId || entry.docId > afterId)
        .slice(0, limit + 1);
    }

    const hasMore = rawDocs.length > limit;
    const pageRows = hasMore ? rawDocs.slice(0, limit) : rawDocs;
    const items = pageRows.map((entry) => this.buildSnapshotItem(entry.docId, entry.data));
    const nextAfterId = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].docId : null;

    return {
      items,
      nextAfterId,
      hasMore,
      limit,
      sourceEngine: 'firestore',
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetches full Firestore document payload for on-demand repair of a missing or
   * hash-mismatched Sheet row during reconciliation.
   */
  public async getReconcileSubmissionRecord(submissionId: string): Promise<ReconcileFullRecord | null> {
    const cleanId = String(submissionId || '').trim();
    if (!cleanId) return null;

    const db = await this.getDb();
    let docId = cleanId;
    let data: Record<string, any> | null = null;

    if (db) {
      const resolved = await this.resolveSubmissionDoc(cleanId, db);
      if (!resolved) return null;
      docId = String(resolved.ref?.id || resolved.data.id || cleanId);
      data = resolved.data;
    } else {
      const existing = this.resolveMockSubmission(cleanId);
      if (!existing) return null;
      docId = String(existing.id || cleanId);
      data = existing;
    }

    if (!data) return null;

    const baseItem = this.buildSnapshotItem(docId, data);
    return {
      ...baseItem,
      submissionTime: data.submissionTime || data.createdAt || null,
      revisionNumber: Number(data.revisionNumber || data.version || 1) || 1,
      sheetRowNumber: typeof data.sheetRowNumber === 'number' ? data.sheetRowNumber : null,
      mirrorStatus: data.mirrorStatus || null,
      payload: data.payload && typeof data.payload === 'object' ? { ...data.payload } : {},
      doc: { ...data },
    };
  }
}
