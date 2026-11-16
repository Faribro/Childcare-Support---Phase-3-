import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FirestoreSubmissionAdapter,
  validateFirestoreDatabaseEnvironment,
  SheetsMirrorRetryRecord,
} from '@/lib/server/firestoreSubmissionAdapter';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import type { CompleteSubmissionPayload } from '@/lib/validations/submissionSchema';

describe('Firestore Submission Adapter & Data Engine (Task 2)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Database Environment Isolation Guard', () => {
    it('should refuse to start staging environment against (default) database', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('staging', '(default)');
      }).toThrow(/CONFIGURATION_ERROR.*staging.*\(default\)/i);
    });

    it('should refuse to start production environment against staging database', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('production', 'staging');
      }).toThrow(/CONFIGURATION_ERROR.*production.*staging/i);
    });

    it('should permit staging against named database "staging"', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('staging', 'staging');
      }).not.toThrow();
    });

    it('should permit production against "(default)" database', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('production', '(default)');
      }).not.toThrow();
    });

    it('should permit development against (default) or named database', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('development', '(default)');
        validateFirestoreDatabaseEnvironment('development', 'staging');
      }).not.toThrow();
    });
  });

  describe('2. Deduplication & Idempotency', () => {
    it('should use clientSubmissionId as document ID and cleanly overwrite duplicates', async () => {
      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
      });

      const clientSubmissionId = 'CSC-SUB-TEST-001';
      const mockPayload: CompleteSubmissionPayload = {
        uniqueId: clientSubmissionId,
        clientSubmissionId,
        demographics: {
          childName: 'Aarav Kumar',
          gender: 'Male',
          dob: '2015-06-15',
          state: 'Maharashtra',
          district: 'Mumbai Suburban',
        },
        interviewerName: 'Kavita Shinde',
        status: 'SUBMITTED',
      } as any;

      // 1. First submission
      const firstResult = await adapter.createSubmission({
        payload: mockPayload,
        idempotencyKey: 'idemp-key-001',
        requestId: 'req-001',
      });

      expect(firstResult.status).toBe('success');
      expect(firstResult.uniqueId).toBe(clientSubmissionId);
      expect(firstResult.isDuplicate).toBeFalsy();

      // 2. Duplicate submission with identical clientSubmissionId
      const secondResult = await adapter.createSubmission({
        payload: mockPayload,
        idempotencyKey: 'idemp-key-002',
        requestId: 'req-002',
      });

      expect(secondResult.status).toBe('success');
      expect(secondResult.uniqueId).toBe(clientSubmissionId);
      expect(secondResult.isDuplicate).toBe(true);

      // Verify only 1 record exists in store
      const list = await adapter.listSubmissions();
      expect(list.totalCount).toBe(1);
      expect(list.items[0].id).toBe(clientSubmissionId);
    });
  });

  describe('3. Offline Retry Overwrite', () => {
    it('should overwrite draft record when final submission arrives with same clientSubmissionId', async () => {
      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
      });

      const clientSubmissionId = 'OFFLINE-RECORD-999';

      // Worker saves draft offline
      await adapter.createSubmission({
        payload: {
          uniqueId: clientSubmissionId,
          clientSubmissionId,
          demographics: {
            childName: 'Pooja',
            state: 'Delhi',
            district: 'Central',
          },
          status: 'DRAFT',
        } as any,
        idempotencyKey: 'offline-draft-key',
        requestId: 'req-offline-1',
      });

      const draft = await adapter.getSubmission(clientSubmissionId);
      expect(draft).not.toBeNull();
      expect(draft.id).toBe(clientSubmissionId);

      // Update / overwrite with final submission
      const updateResult = await adapter.updateSubmission({
        submissionId: clientSubmissionId,
        patch: {
          status: 'SUBMITTED',
          demographics: {
            childName: 'Pooja Verma',
            state: 'Delhi',
            district: 'Central',
          },
        } as any,
        requestId: 'req-offline-2',
      });

      expect(updateResult.status).toBe('success');
      expect(updateResult.version).toBe(2);

      const finalRecord = await adapter.getSubmission(clientSubmissionId);
      expect(finalRecord.version).toBe(2);
      expect(finalRecord.payload.demographics.childName).toBe('Pooja Verma');
    });
  });

  describe('4. Dual-Write to Sheets with Failure Queueing', () => {
    it('should succeed write to Firestore and enqueue retry when Apps Script mirror fails', async () => {
      const failingGateway = {
        callGateway: vi.fn().mockRejectedValue(new Error('Apps Script 504 Gateway Timeout')),
      };

      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
        gatewayClient: failingGateway,
      });

      const clientSubmissionId = 'MIRROR-FAIL-001';
      const mockPayload: any = {
        uniqueId: clientSubmissionId,
        clientSubmissionId,
        demographics: { childName: 'Rohit', state: 'Delhi', district: 'East' },
      };

      const result = await adapter.createSubmission({
        payload: mockPayload,
        idempotencyKey: 'idemp-fail-001',
        requestId: 'req-fail-001',
      });

      // Firestore persistence succeeded!
      expect(result.status).toBe('success');
      expect(result.syncStatus).toBe('PENDING_SHEET_SYNC');
      expect(result.sheetSyncCompleted).toBe(false);

      // Verified record is in Firestore
      const doc = await adapter.getSubmission(clientSubmissionId);
      expect(doc).not.toBeNull();
      expect(doc.id).toBe(clientSubmissionId);

      // Verify retry job was enqueued in retry queue
      const retryJob = await adapter.getRetryRecord(clientSubmissionId);
      expect(retryJob).not.toBeNull();
      expect(retryJob?.status).toBe('PENDING');

      // Attempt replay with reference time covering the backoff window
      const futureRefTime = new Date(Date.now() + 60000).toISOString();
      const retryStats = await adapter.replaySheetsMirrorRetryQueue(10, futureRefTime);
      // Since gateway still fails in this mock, it attempts replay and records 1 failed attempt
      expect(retryStats.processed).toBe(1);
      expect(retryStats.failed).toBe(1);
      expect(retryStats.succeeded).toBe(0);
    });

    it('should successfully replay retry queue when Apps Script is restored', async () => {
      let shouldFail = true;
      const recoveringGateway = {
        callGateway: vi.fn().mockImplementation(async () => {
          if (shouldFail) throw new Error('Temporary 503 Unavailable');
          return { status: 'success', statusCode: 200, resolvedRow: 42 };
        }),
      };

      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
        gatewayClient: recoveringGateway,
      });

      const clientSubmissionId = 'RECOVERY-001';
      await adapter.createSubmission({
        payload: { clientSubmissionId, demographics: { childName: 'Sneha' } } as any,
        idempotencyKey: 'recovery-key',
        requestId: 'req-recovery-1',
      });

      // Gateway recovers
      shouldFail = false;

      // Force retry time so job is ready for immediate processing
      const futureRefTime = new Date(Date.now() + 60000).toISOString();
      const replayResult = await adapter.replaySheetsMirrorRetryQueue(10, futureRefTime);
      expect(replayResult.processed).toBe(1);
      expect(replayResult.succeeded).toBe(1);
      expect(replayResult.failed).toBe(0);

      // Verify document status was updated to SYNCED
      const updatedDoc = await adapter.getSubmission(clientSubmissionId);
      expect(updatedDoc.mirrorStatus).toBe('SYNCED');
      expect(updatedDoc.sheetRowNumber).toBe(42);
    });

    it('should send unpacked uniqueId, data, and top-level fields to gatewayClient on create', async () => {
      let capturedPayload: any = null;
      const capturingGateway = {
        callGateway: vi.fn().mockImplementation(async (payload: any) => {
          capturedPayload = payload;
          return { status: 'success', statusCode: 200, resolvedRow: 19 };
        }),
      };

      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
        gatewayClient: capturingGateway,
      });

      const clientSubmissionId = 'GATEWAY-UNPACK-001';
      await adapter.createSubmission({
        payload: {
          clientSubmissionId,
          uniqueId: 'SYN-TEST-UNPACK',
          demographics: { childName: 'Test Unpack Child', state: 'Maharashtra' },
        } as any,
        idempotencyKey: 'unpack-key-1',
        requestId: 'req-unpack-1',
      });

      expect(capturingGateway.callGateway).toHaveBeenCalledTimes(1);
      expect(capturedPayload.action).toBe('create');
      expect(capturedPayload.uniqueId).toBe('SYN-TEST-UNPACK');
      expect(capturedPayload.data).toBeDefined();
      expect(capturedPayload.demographics.childName).toBe('Test Unpack Child');
    });

    it('should mark retry as DEAD_LETTER after 5 failed attempts with exponential backoff', async () => {
      const failingGateway = {
        callGateway: vi.fn().mockRejectedValue(new Error('Persistent Upstream Outage')),
      };

      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
        gatewayClient: failingGateway,
      });

      const clientSubmissionId = 'DEAD-LETTER-001';
      const record: SheetsMirrorRetryRecord = {
        id: clientSubmissionId,
        submissionId: clientSubmissionId,
        clientSubmissionId,
        payload: { clientSubmissionId },
        status: 'PENDING',
        retryCount: 4, // 5th attempt will fail and trigger dead-lettering
        nextRetryAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await adapter.enqueueMirrorRetry(record);

      const replayResult = await adapter.replaySheetsMirrorRetryQueue(10);
      expect(replayResult.processed).toBe(1);
      expect(replayResult.failed).toBe(1);

      // Next attempt: queue should have 0 pending ready jobs (marked DEAD_LETTER)
      const nextReplay = await adapter.replaySheetsMirrorRetryQueue(10);
      expect(nextReplay.processed).toBe(0);
    });
  });

  describe('5. Asset Updates and Document Deletion', () => {
    it('should append attachment metadata and delete documents', async () => {
      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
      });

      const clientSubmissionId = 'ASSET-TEST-001';
      await adapter.createSubmission({
        payload: { clientSubmissionId } as any,
        idempotencyKey: 'asset-key-1',
        requestId: 'req-asset-1',
      });

      // Update asset metadata
      const assetRes = await adapter.updateAsset({
        submissionId: clientSubmissionId,
        docType: 'Passbook',
        fileData: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        requestId: 'req-asset-2',
      });

      expect(assetRes.status).toBe('success');
      expect(assetRes.docType).toBe('Passbook');

      const docWithAsset = await adapter.getSubmission(clientSubmissionId);
      expect(docWithAsset.attachments).toHaveLength(1);
      expect(docWithAsset.attachments[0].docType).toBe('Passbook');

      // Delete document
      const delRes = await adapter.deleteSubmission(clientSubmissionId);
      expect(delRes.status).toBe('success');

      const docAfterDelete = await adapter.getSubmission(clientSubmissionId);
      expect(docAfterDelete).toBeNull();
    });
  });

  describe('6. Canonical Submission Adapter Integration (DATA_ENGINE switch)', () => {
    it('should default to "sheets" when DATA_ENGINE and STORAGE_ENGINE are unset', () => {
      delete process.env.DATA_ENGINE;
      delete process.env.STORAGE_ENGINE;
      expect(canonicalSubmissionAdapter.getDataEngine()).toBe('sheets');
    });

    it('should select "firestore" when DATA_ENGINE="firestore"', async () => {
      process.env.DATA_ENGINE = 'firestore';
      expect(canonicalSubmissionAdapter.getDataEngine()).toBe('firestore');

      const mockFirestoreAdapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
      });
      canonicalSubmissionAdapter.setFirestoreAdapter(mockFirestoreAdapter);

      const clientSubmissionId = 'CANONICAL-FS-001';
      const result = await canonicalSubmissionAdapter.createSubmission({
        payload: {
          clientSubmissionId,
          uniqueId: clientSubmissionId,
          demographics: { childName: 'Aanya', state: 'Delhi', district: 'South' },
        } as any,
        idempotencyKey: 'canon-key-01',
        requestId: 'req-canon-01',
      });

      expect(result.status).toBe('success');
      expect(result.uniqueId).toBe(clientSubmissionId);

      // Verify read via canonical adapter
      const readRes = await canonicalSubmissionAdapter.getSubmission(clientSubmissionId);
      expect(readRes.status).toBe('success');
      expect(readRes.uniqueId).toBe(clientSubmissionId);
    });
  });

  describe('7. Mirror Handling & Undefined sheetRowNumber Resilience', () => {
    it('should cleanly transition to SYNCED without error when gateway returns success without resolvedRow', async () => {
      const mockGateway = {
        callGateway: vi.fn().mockResolvedValue({
          status: 'success',
          statusCode: 200,
          // Note: resolvedRow is intentionally undefined to test resilience
        }),
      };

      const adapter = new FirestoreSubmissionAdapter({
        appEnv: 'development',
        databaseId: '(default)',
        gatewayClient: mockGateway,
      });

      const clientSubmissionId = 'CANONICAL-MIRROR-UNDEF-001';
      const result = await adapter.createSubmission({
        payload: {
          clientSubmissionId,
          uniqueId: clientSubmissionId,
          demographics: { childName: 'Aanya', state: 'Delhi', district: 'South' },
        } as any,
        idempotencyKey: 'canon-key-undef-01',
        requestId: 'req-canon-undef-01',
      });

      expect(result.status).toBe('success');
      expect(mockGateway.callGateway).toHaveBeenCalledTimes(1);

      // Verify the record was saved with SYNCED mirrorStatus and no undefined error
      const readRes = await adapter.getSubmission(clientSubmissionId);
      expect(readRes).toBeDefined();
      expect(readRes.mirrorStatus).toBe('SYNCED');
      expect(readRes.sheetRowNumber).toBeUndefined();
    });
  });
});
