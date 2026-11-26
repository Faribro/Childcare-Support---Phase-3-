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
import { stampSubmissionRowIntegrity } from './submissionRowHash';

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

    const authorId = payload.authorId || payload.submittedByWorkerId || payload.authorIdentifier || '';
    const baseDocData = {
      id: clientSubmissionId,
      clientSubmissionId,
      uniqueId: payload.uniqueId || clientSubmissionId,
      version: 1,
      revisionNumber: 1,
      status: payload.status || 'SUBMITTED',
      state,
      district: payload.demographics?.district || payload.district || '',
      taluk: payload.demographics?.taluk || payload.taluk || '',
      village: payload.demographics?.village || payload.village || '',
      childName: payload.demographics?.childName || payload.childName || '',
      submittedBy: payload.interviewerName || payload.submittedBy || 'Field Worker',
      authorId,
      submittedByWorkerId: authorId,
      authorIdentifier: authorId,
      artStatus: payload.clinical?.artStatus || payload.artStatus || '',
      vlStatus: payload.clinical?.vlStatus || payload.vlStatus || '',
      attendanceStatus: payload.education?.attendance || payload.attendanceStatus || '',
      payload: { ...payload, clientSubmissionId, authorId, submittedByWorkerId: authorId, authorIdentifier: authorId },
      attachments: payload.attachments || [],
      idempotencyKey: input.idempotencyKey,
      submissionTime: payload.submissionTime || now,
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
            data: payload,
            payload: { ...payload, clientSubmissionId },
            uniqueId: payload.uniqueId || payload.artNumber || payload.demographics?.artNumber || payload.uuid || clientSubmissionId,
            ...payload,
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
      let items = snap.docs.map((d: any) => d.data());
      if (!includeDeleted) {
        items = items.filter((item: any) => !isDeletedRecord(item));
      }
      const hasMore = snap.docs.length === limit;
      const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1].submissionTime || items[items.length - 1].id) : null;
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

    const attachments = existing.attachments || [];
    attachments.push({
      docType,
      fileDataPreview: fileData.substring(0, 64),
      newFileId,
      cellFormula,
      updatedAt: now,
    });

    const updatePayload: Record<string, any> = {
      version: newRevision,
      revisionNumber: newRevision,
      attachments,
      updatedAt: now,
    };

    if (fieldKey) {
      const storedVal = cellFormula || fileData;
      updatePayload[fieldKey] = storedVal;
      if (existing.payload) {
        updatePayload.payload = {
          ...existing.payload,
          [fieldKey]: storedVal,
        };
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
}
