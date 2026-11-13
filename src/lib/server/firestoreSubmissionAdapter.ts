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

export interface FirestoreAdapterOptions {
  projectId?: string;
  databaseId?: string;
  appEnv?: string;
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

export class FirestoreSubmissionAdapter {
  private db: any = null;
  private readonly projectId: string;
  private readonly databaseId: string;
  private readonly gatewayClient?: { callGateway: (payload: Record<string, any>) => Promise<any> };

  // In-memory fallback / mock store for offline unit tests
  private readonly isMock: boolean;
  private readonly mockSubmissions = new Map<string, any>();
  private readonly mockRetryQueue = new Map<string, SheetsMirrorRetryRecord>();
  private readonly mockIdempotency = new Map<string, CanonicalSubmissionResult>();

  constructor(options: FirestoreAdapterOptions = {}) {
    this.projectId = options.projectId || process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production';
    this.databaseId = options.databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)';
    this.gatewayClient = options.gatewayClient;

    const env = options.appEnv || process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development';
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

  private async getDb() {
    if (this.isMock) return null;
    if (!this.db) {
      const { Firestore } = await import('@google-cloud/firestore');
      this.db = new Firestore({
        projectId: this.projectId,
        databaseId: this.databaseId === '(default)' ? undefined : this.databaseId,
      });
    }
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
    const docData = {
      id: clientSubmissionId,
      clientSubmissionId,
      uniqueId: payload.uniqueId || clientSubmissionId,
      version: 1,
      revisionNumber: 1,
      status: payload.status || 'SUBMITTED',
      state: payload.demographics?.state || payload.state || '',
      district: payload.demographics?.district || payload.district || '',
      taluk: payload.demographics?.taluk || payload.taluk || '',
      village: payload.demographics?.village || payload.village || '',
      childName: payload.demographics?.childName || payload.childName || '',
      submittedBy: payload.interviewerName || payload.submittedBy || 'Field Worker',
      artStatus: payload.clinical?.artStatus || payload.artStatus || '',
      vlStatus: payload.clinical?.vlStatus || payload.vlStatus || '',
      attendanceStatus: payload.education?.attendance || payload.attendanceStatus || '',
      payload: { ...payload, clientSubmissionId },
      attachments: payload.attachments || [],
      idempotencyKey: input.idempotencyKey,
      submissionTime: payload.submissionTime || now,
      createdAt: now,
      updatedAt: now,
      mirrorStatus: 'PENDING_SHEET_SYNC',
    };

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

    // 3. Mirror to Google Sheets via Apps Script
    let sheetSyncCompleted = false;
    let syncStatus: 'SYNCED' | 'PENDING_SHEET_SYNC' = 'PENDING_SHEET_SYNC';

    if (this.gatewayClient) {
      try {
        const mirrorRes = await this.gatewayClient.callGateway({
          action: 'create',
          payload: { ...payload, clientSubmissionId },
          idempotencyKey: input.idempotencyKey,
          clientSubmissionId,
        });

        if (mirrorRes && (mirrorRes.status === 'success' || mirrorRes.statusCode === 200)) {
          sheetSyncCompleted = true;
          syncStatus = 'SYNCED';
          // Update mirror status in Firestore
          if (db) {
            await db.collection('submissions').doc(clientSubmissionId).update({
              mirrorStatus: 'SYNCED',
              sheetRowNumber: mirrorRes.resolvedRow,
              mirroredAt: new Date().toISOString(),
            });
          } else {
            const m = this.mockSubmissions.get(clientSubmissionId);
            if (m) {
              m.mirrorStatus = 'SYNCED';
              m.sheetRowNumber = mirrorRes.resolvedRow;
            }
          }
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
    }

    const result: CanonicalSubmissionResult = {
      status: 'success',
      statusCode: 200,
      acknowledged: true,
      uniqueId: clientSubmissionId,
      remoteSubmissionId: clientSubmissionId,
      version: 1,
      revisionNumber: 1,
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
          payload: job.payload,
          idempotencyKey: job.idempotencyKey,
          clientSubmissionId: job.clientSubmissionId,
        });

        if (res && (res.status === 'success' || res.statusCode === 200)) {
          succeeded++;
          if (db) {
            await db.collection('sheets_mirror_retry_queue').doc(job.id).update({
              status: 'SYNCED',
              updatedAt: new Date().toISOString(),
            });
            await db.collection('submissions').doc(job.clientSubmissionId).update({
              mirrorStatus: 'SYNCED',
              sheetRowNumber: res.resolvedRow,
              mirroredAt: new Date().toISOString(),
            });
          } else {
            job.status = 'SYNCED';
            job.updatedAt = new Date().toISOString();
            const sub = this.mockSubmissions.get(job.clientSubmissionId);
            if (sub) {
              sub.mirrorStatus = 'SYNCED';
              sub.sheetRowNumber = res.resolvedRow;
              sub.mirroredAt = new Date().toISOString();
            }
          }
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
    if (db) {
      const snap = await db.collection('submissions').doc(submissionId).get();
      if (!snap.exists) {
        return {
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${submissionId} not found in Firestore.`,
        };
      }
      existing = snap.data();
    } else {
      existing = this.mockSubmissions.get(submissionId);
      if (!existing) {
        return {
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${submissionId} not found in Firestore.`,
        };
      }
    }

    const nextVersion = (existing.version || 1) + 1;
    const updatedPayload = { ...existing.payload, ...patch };
    const updates = {
      version: nextVersion,
      revisionNumber: nextVersion,
      payload: updatedPayload,
      updatedAt: now,
    };

    if (db) {
      await db.collection('submissions').doc(submissionId).update(updates);
    } else {
      Object.assign(existing, updates);
    }

    // Mirror update to Google Sheets
    if (this.gatewayClient) {
      try {
        await this.gatewayClient.callGateway({
          action: 'update',
          uniqueId: submissionId,
          payload: patch,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (mirrorErr) {
        console.warn(`[FIRESTORE_MIRROR] Update mirror failed for ${submissionId}:`, mirrorErr);
      }
    }

    return {
      status: 'success',
      statusCode: 200,
      acknowledged: true,
      uniqueId: submissionId,
      remoteSubmissionId: submissionId,
      version: nextVersion,
      revisionNumber: nextVersion,
      submissionStatus: existing.status,
      requestId: input.requestId,
    };
  }

  /**
   * GET: Retrieves submission by ID from Firestore.
   */
  public async getSubmission(id: string, session?: any): Promise<any> {
    const db = await this.getDb();
    if (db) {
      const snap = await db.collection('submissions').doc(id).get();
      if (!snap.exists) return null;
      return snap.data();
    }
    return this.mockSubmissions.get(id) || null;
  }

  /**
   * LIST: Queries submissions with optional state/district filtering and cursor pagination.
   */
  public async listSubmissions(params: CanonicalListParams = {}, session?: any): Promise<any> {
    const limit = params.limit || 50;
    const db = await this.getDb();

    if (db) {
      let query = db.collection('submissions').orderBy('submissionTime', 'desc');
      if (params.state) query = query.where('state', '==', params.state);
      if (params.district) query = query.where('district', '==', params.district);

      const snap = await query.limit(limit).get();
      const items = snap.docs.map((d: any) => d.data());
      return {
        items,
        totalCount: items.length,
        hasMore: false,
        nextCursor: null,
      };
    }

    let items = Array.from(this.mockSubmissions.values());
    if (params.state) items = items.filter((i) => i.state === params.state);
    if (params.district) items = items.filter((i) => i.district === params.district);
    items.sort((a, b) => b.submissionTime.localeCompare(a.submissionTime));

    return {
      items: items.slice(0, limit),
      totalCount: items.length,
      hasMore: items.length > limit,
      nextCursor: null,
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
        hasSignature: Boolean(p.signatureLink || p.signaturePhotoUrl),
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
        hasPassbook: Boolean(p.passbookPhotoUrl || p.passbookLink),
        hasAadhaar: Boolean(p.aadhaarPhotoUrl || p.aadhaarLink),
        hasChildPhoto: Boolean(p.childPhotoUrl || p.childPhotoLink),
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
        hasFeeReceipt: Boolean(p.feeReceiptUrl || p.feeReceiptLink),
        hasMarksheet: Boolean(p.marksheetPhotoUrl || p.marksheetPhotoLink),
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
   * DELETE: Marks document as deleted in Firestore.
   */
  public async deleteSubmission(id: string, session?: any): Promise<any> {
    const db = await this.getDb();
    if (db) {
      await db.collection('submissions').doc(id).delete();
    } else {
      this.mockSubmissions.delete(id);
    }
    return { status: 'success', deleted: true, id };
  }

  /**
   * UPDATE ASSET: Updates document attachment metadata.
   */
  public async updateAsset(input: CanonicalReplaceAssetInput): Promise<CanonicalSubmissionResult> {
    const { submissionId, docType, fileData } = input;
    const db = await this.getDb();

    if (db) {
      const docRef = db.collection('submissions').doc(submissionId);
      const snap = await docRef.get();
      if (!snap.exists) {
        return {
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${submissionId} not found.`,
        };
      }
      const data = snap.data();
      const attachments = data.attachments || [];
      attachments.push({
        docType,
        fileDataPreview: fileData.substring(0, 32),
        updatedAt: new Date().toISOString(),
      });
      await docRef.update({ attachments, updatedAt: new Date().toISOString() });
    } else {
      const existing = this.mockSubmissions.get(submissionId);
      if (!existing) {
        return {
          status: 'error',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Submission ${submissionId} not found.`,
        };
      }
      existing.attachments = existing.attachments || [];
      existing.attachments.push({
        docType,
        fileDataPreview: fileData.substring(0, 32),
        updatedAt: new Date().toISOString(),
      });
    }

    return {
      status: 'success',
      statusCode: 200,
      acknowledged: true,
      uniqueId: submissionId,
      docType,
      requestId: input.requestId,
    };
  }
}
