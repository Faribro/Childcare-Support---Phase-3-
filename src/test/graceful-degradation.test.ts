import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FirestoreSubmissionAdapter,
  validateFirestoreDatabaseEnvironment,
} from '@/lib/server/firestoreSubmissionAdapter';
import {
  GcsStorageService,
  validateGcsBucketEnvironment,
} from '@/lib/server/gcsStorageService';

describe('Graceful Degradation & Upstream Outage Resilience (Phase E)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Cloud Firestore Database Environment Guards & Outage Handling', () => {
    it('should refuse to run staging against (default) Firestore database', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('staging', '(default)');
      }).toThrow(/Refusing to start staging environment.*against '\(default\)'/);
    });

    it('should refuse to run production against staging Firestore database', () => {
      expect(() => {
        validateFirestoreDatabaseEnvironment('production', 'staging');
      }).toThrow(/Refusing to start production environment.*against 'staging'/);
    });

    it('should permit valid configurations (staging->staging, production->(default))', () => {
      expect(() => validateFirestoreDatabaseEnvironment('staging', 'staging')).not.toThrow();
      expect(() => validateFirestoreDatabaseEnvironment('production', '(default)')).not.toThrow();
    });

    it('should handle simulated Firestore collection failure gracefully without crashing', async () => {
      // Mock db that rejects all operations
      const mockFailingDb = {
        collection: vi.fn().mockImplementation(() => {
          throw new Error('UNAVAILABLE: Cloud Firestore transient network disconnection');
        }),
      };

      const adapter = new FirestoreSubmissionAdapter({
        mockDb: mockFailingDb,
        appEnv: 'staging',
        databaseId: 'staging',
      });

      // Attempting to read a submission when Firestore collection throws
      await expect(adapter.getSubmission('CSC-TEST-001')).rejects.toThrow(
        /UNAVAILABLE: Cloud Firestore transient network disconnection/
      );
    });
  });

  describe('2. Google Cloud Storage Bucket Environment Guards & Signer Resilience', () => {
    it('should refuse to run staging against production GCS bucket', () => {
      expect(() => {
        validateGcsBucketEnvironment('staging', 'cs-p3-childcare-production');
      }).toThrow(/Refusing to start staging environment.*against production GCS bucket/);
    });

    it('should refuse to run production against staging GCS bucket', () => {
      expect(() => {
        validateGcsBucketEnvironment('production', 'cs-p3-childcare-staging');
      }).toThrow(/Refusing to start production environment.*against staging GCS bucket/);
    });

    it('should permit valid bucket configurations', () => {
      expect(() => validateGcsBucketEnvironment('staging', 'cs-p3-childcare-staging')).not.toThrow();
      expect(() => validateGcsBucketEnvironment('production', 'cs-p3-childcare-production')).not.toThrow();
    });

    it('should handle GCS signed upload URL failure with structured error status', async () => {
      const gcsService = new GcsStorageService(
        {
          bucketName: 'cs-p3-childcare-staging',
          appEnv: 'staging',
        },
        { isMock: true }
      );

      // Request signed URL with invalid MIME
      const result = await gcsService.getSignedUploadUrl({
        submissionId: 'CSC-TEST-999',
        docType: 'identity_proof',
        contentType: 'application/x-msdownload', // Disallowed executable MIME
      });

      expect(result.status).toBe('REJECTED_UNSUPPORTED_MIME');
      expect(result.url).toBeUndefined();
      expect(result.error).toMatch(/Unsupported MIME type/);
    });
  });

  describe('3. Apps Script Secondary Mirror Graceful Degradation', () => {
    it('should succeed Firestore write and queue mirror retry when Apps Script is completely down', async () => {
      let callCount = 0;
      const failingGatewayClient = {
        callGateway: vi.fn().mockImplementation(async () => {
          callCount++;
          throw new Error('503 Service Unavailable: Apps Script execution quota or timeout');
        }),
      };

      const adapter = new FirestoreSubmissionAdapter({
        gatewayClient: failingGatewayClient,
        appEnv: 'staging',
        databaseId: 'staging',
      });

      const submissionPayload = {
        uniqueId: 'CSC-OUTAGE-001',
        clientSubmissionId: 'CSC-OUTAGE-001',
        demographics: {
          state: 'Maharashtra',
          district: 'Pune',
          childName: 'Aarav Kumar',
        },
        submissionTime: new Date().toISOString(),
      };

      const result = await adapter.createSubmission({
        payload: submissionPayload as any,
        idempotencyKey: 'idemp-outage-001',
        requestId: 'req-outage-001',
      });

      // Field user submission succeeded locally in Firestore
      expect(result.status).toBe('success');
      expect(result.statusCode).toBe(200);
      expect(result.acknowledged).toBe(true);
      expect(result.syncStatus).toBe('PENDING_SHEET_SYNC');
      expect(result.sheetSyncCompleted).toBe(false);

      // Verify retry queue captured the failed record
      const retryRecord = await adapter.getRetryRecord('CSC-OUTAGE-001');
      expect(retryRecord).toBeDefined();
      expect(retryRecord?.status).toBe('PENDING');
      expect(retryRecord?.retryCount).toBe(0);
      expect(retryRecord?.lastError).toContain('503 Service Unavailable');
    });

    it('should successfully replay retry queue once Apps Script recovers', async () => {
      let recovered = false;
      const recoveringGatewayClient = {
        callGateway: vi.fn().mockImplementation(async () => {
          if (!recovered) {
            throw new Error('500 Internal Server Error in Apps Script');
          }
          return { status: 'success', statusCode: 200, resolvedRow: 42 };
        }),
      };

      const adapter = new FirestoreSubmissionAdapter({
        gatewayClient: recoveringGatewayClient,
        appEnv: 'staging',
        databaseId: 'staging',
      });

      // 1. Submit during outage
      await adapter.createSubmission({
        payload: {
          uniqueId: 'CSC-REPLAY-001',
          clientSubmissionId: 'CSC-REPLAY-001',
          demographics: { state: 'Delhi', district: 'Central', childName: 'Rohan' },
        } as any,
        idempotencyKey: 'idemp-replay-001',
        requestId: 'req-replay-001',
      });

      const initialRetry = await adapter.getRetryRecord('CSC-REPLAY-001');
      expect(initialRetry?.status).toBe('PENDING');

      // 2. Apps Script recovers
      recovered = true;

      // 3. Worker drains queue (passing future reference time so pending retry is due)
      const futureTime = new Date(Date.now() + 60000).toISOString();
      const drainSummary = await adapter.drainSheetsMirrorRetryQueue(10, futureTime);
      expect(drainSummary.succeeded).toBe(1);
      expect(drainSummary.failed).toBe(0);

      // 4. Record status updated to SYNCED
      const updatedRetry = await adapter.getRetryRecord('CSC-REPLAY-001');
      expect(updatedRetry?.status).toBe('SYNCED');
    });
  });
});
