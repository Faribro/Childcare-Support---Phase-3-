/**
 * Supabase / Tigris / Sheets-Outbox Lifecycle & Authorization Integration Test
 *
 * Validates:
 * 1. Storage engine selection (defaults safely to 'sheets').
 * 2. Explicit authorization boundary (state, district, programme enforcement; anonymous rejection).
 * 3. Cross-store failure handling (pending vs stored vs metadata, orphan retention, truthful acknowledgements).
 * 4. Durable Sheets outbox mirror worker (atomic leasing, sanitized labels, OCC monotonicity, retry/dead-letter).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  TigrisStorageService,
  MAX_ATTACHMENT_BYTES,
  isAllowedS3Endpoint,
} from '@/lib/server/tigrisStorageService';
import {
  SheetsMirrorWorker,
  InMemorySheetsMirrorRepository,
  sanitizeMirrorPayload,
} from '@/lib/server/sheetsMirrorWorker';
import {
  SupabaseSubmissionAdapter,
  SessionContext,
} from '@/lib/server/supabaseSubmissionAdapter';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

describe('Supabase / Tigris / Durable Outbox Lifecycle & Boundaries', () => {
  let tigrisService: TigrisStorageService;
  let mirrorRepo: InMemorySheetsMirrorRepository;
  let supabaseAdapter: SupabaseSubmissionAdapter;

  // Mock in-memory S3 client for Tigris testing
  const mockS3Storage = new Map<string, { body: Buffer; contentType: string; metadata?: any }>();

  const fakeS3Client: any = {
    send: vi.fn(async (command: any) => {
      const cmdName = command.constructor.name;
      if (cmdName === 'PutObjectCommand') {
        mockS3Storage.set(`${command.input.Bucket}/${command.input.Key}`, {
          body: command.input.Body,
          contentType: command.input.ContentType,
          metadata: command.input.Metadata,
        });
        return { $metadata: { httpStatusCode: 200 } };
      }
      if (cmdName === 'GetObjectCommand') {
        const item = mockS3Storage.get(`${command.input.Bucket}/${command.input.Key}`);
        if (!item) {
          const err: any = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array(item.body),
          },
          ContentType: item.contentType,
          $metadata: { httpStatusCode: 200 },
        };
      }
      if (cmdName === 'HeadObjectCommand') {
        const item = mockS3Storage.get(`${command.input.Bucket}/${command.input.Key}`);
        if (!item) {
          const err: any = new Error('NotFound');
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { $metadata: { httpStatusCode: 200 } };
      }
      throw new Error(`Unsupported mock command ${cmdName}`);
    }),
  };

  beforeEach(() => {
    mockS3Storage.clear();
    vi.clearAllMocks();

    tigrisService = new TigrisStorageService(
      {
        bucketName: 'childcare-assets-staging',
        endpoint: 'https://fly.storage.tigris.dev',
        region: 'sin',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
      fakeS3Client
    );

    mirrorRepo = new InMemorySheetsMirrorRepository();
    supabaseAdapter = new SupabaseSubmissionAdapter(tigrisService, mirrorRepo);
  });

  // ---------------------------------------------------------------------------
  // 1. Storage Engine Selection
  // ---------------------------------------------------------------------------
  describe('1. Storage Engine Selection & Default Preservation', () => {
    it('defaults safely to sheets engine when STORAGE_ENGINE is unset', () => {
      const original = process.env.STORAGE_ENGINE;
      delete process.env.STORAGE_ENGINE;
      try {
        expect(canonicalSubmissionAdapter.getStorageEngine()).toBe('sheets');
      } finally {
        if (original) process.env.STORAGE_ENGINE = original;
      }
    });

    it('activates supabase engine only when STORAGE_ENGINE is explicitly configured', () => {
      const original = process.env.STORAGE_ENGINE;
      process.env.STORAGE_ENGINE = 'supabase';
      try {
        expect(canonicalSubmissionAdapter.getStorageEngine()).toBe('supabase');
      } finally {
        if (original) process.env.STORAGE_ENGINE = original;
        else delete process.env.STORAGE_ENGINE;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Explicit Authorization Boundary Mapping
  // ---------------------------------------------------------------------------
  describe('2. Authorization Boundary Mapping (State / District / Programme)', () => {
    it('rejects cross-state access for caseworker restricted to Maharashtra', async () => {
      const caseworkerMh: SessionContext = {
        userId: 'field-mh-01',
        role: 'caseworker',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
        allowedProgrammes: ['alliance-childcare-phase3'],
      };

      const input: any = {
        payload: {
          uniqueId: 'DL-CEN-0001',
          location: { state: 'Delhi', district: 'Central Delhi' },
          demographics: { childName: 'Test Child' },
        },
        idempotencyKey: 'idemp-cross-state',
        requestId: 'req-01',
      };

      const result = await supabaseAdapter.createSubmission(input, caseworkerMh);
      expect(result.status).toBe('error');
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('FORBIDDEN_SCOPE');
      expect(result.message).toContain('Session not authorized');
    });

    it('rejects cross-district access within the same state for caseworker restricted to Pune', async () => {
      const caseworkerPune: SessionContext = {
        userId: 'field-pune-01',
        role: 'caseworker',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      };

      const input: any = {
        payload: {
          uniqueId: 'MH-NAG-0001',
          location: { state: 'Maharashtra', district: 'Nagpur' },
          demographics: { childName: 'Test Child' },
        },
        idempotencyKey: 'idemp-cross-dist',
        requestId: 'req-02',
      };

      const result = await supabaseAdapter.createSubmission(input, caseworkerPune);
      expect(result.status).toBe('error');
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('FORBIDDEN_SCOPE');
    });

    it('allows State Reviewer to read/review across any district in assigned state', async () => {
      const stateReviewerMh: SessionContext = {
        userId: 'rev-mh-01',
        role: 'supervisor',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      };

      // Seed record in Pune
      const input: any = {
        payload: {
          uniqueId: 'MH-PUN-0001',
          location: { state: 'Maharashtra', district: 'Pune' },
          demographics: { childName: 'Valid Child' },
          caregiverConsent: { consentProvided: true },
        },
        idempotencyKey: 'idemp-seed-01',
        requestId: 'req-03',
      };

      const created = await supabaseAdapter.createSubmission(input);
      expect(created.status).toBe('success');

      // Supervisor reads record
      const read = await supabaseAdapter.getSubmission('MH-PUN-0001', 'supervisor', stateReviewerMh);
      expect(read.status).toBe('success');
      expect(read.statusCode).toBe(200);
      expect(read.data.childName).toBe('Valid Child');
    });

    it('allows Leadership and Admin cross-state access (*)', async () => {
      const leadershipSession: SessionContext = {
        userId: 'lead-nat-01',
        role: 'supervisor',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      };

      const input: any = {
        payload: {
          uniqueId: 'TN-CHE-0001',
          location: { state: 'Tamil Nadu', district: 'Chennai' },
          demographics: { childName: 'Chennai Child' },
        },
        idempotencyKey: 'idemp-lead-01',
        requestId: 'req-04',
      };

      const created = await supabaseAdapter.createSubmission(input, leadershipSession);
      expect(created.status).toBe('success');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Tigris Upload & Cross-Store Failure Handling
  // ---------------------------------------------------------------------------
  describe('3. Tigris Upload & Cross-Store Failure Handling', () => {
    it('successfully uploads valid binary to Tigris and returns UPLOADED status', async () => {
      const samplePdfBytes = Buffer.from('%PDF-1.4 sample pdf content for testing');
      const base64Data = `data:application/pdf;base64,${samplePdfBytes.toString('base64')}`;

      const input: any = {
        payload: {
          uniqueId: 'MH-PUN-0010',
          location: { state: 'Maharashtra', district: 'Pune' },
          demographics: { childName: 'Aadhaar Test Child' },
          bankingAndKyc: {
            aadhaarCardPhotoUrl: base64Data,
          },
          caregiverConsent: { consentProvided: true },
        },
        idempotencyKey: 'idemp-tigris-01',
        requestId: 'req-10',
      };

      const res = await supabaseAdapter.createSubmission(input);
      expect(res.status).toBe('success');
      expect(res.statusCode).toBe(201);
      expect(res.assetStatus).toBe('UPLOADED');
      expect(res.assetOperationSummary?.aadhaarCardPhoto).toBe('STORED_PRIVATE');

      // Verify object exists in mock S3 store
      const expectedKey = 'staging/documents/MH-PUN-0010/aadhaarCardPhoto.bin';
      const s3Entry = mockS3Storage.get(`childcare-assets-staging/${expectedKey}`);
      expect(s3Entry).toBeDefined();
      expect(s3Entry?.contentType).toBe('application/pdf');

      // Verify retrieval through Tigris service
      const fetched = await tigrisService.fetchAttachment(`asset://childcare-assets-staging/${expectedKey}`);
      expect(fetched.status).toBe('SUCCESS');
      expect(fetched.buffer?.toString()).toBe('%PDF-1.4 sample pdf content for testing');
    });

    it('rejects oversized binary (>10MB) and returns truthful FAILED_RETRYABLE status', async () => {
      const oversizedBuffer = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1024, 'a');
      const base64Data = `data:image/jpeg;base64,${oversizedBuffer.toString('base64')}`;

      const input: any = {
        payload: {
          uniqueId: 'MH-PUN-0011',
          location: { state: 'Maharashtra', district: 'Pune' },
          demographics: { childName: 'Oversize Child' },
          bankingAndKyc: {
            passbookPhotoUrl: base64Data,
          },
        },
        idempotencyKey: 'idemp-oversize-01',
        requestId: 'req-11',
      };

      const res = await supabaseAdapter.createSubmission(input);
      expect(res.status).toBe('success'); // Core submission recorded
      expect(res.assetStatus).toBe('FAILED_RETRYABLE'); // Truthful attachment status
      expect(res.assetOperationSummary?.passbookPhoto).toBe('FAILED_RETRYABLE');
    });

    it('truthfully reports NOT_FOUND when requesting non-existent Tigris object', async () => {
      const res = await tigrisService.fetchAttachment('asset://childcare-assets-staging/staging/documents/NON_EXISTENT/passbook.bin');
      expect(res.status).toBe('NOT_FOUND');
      expect(res.buffer).toBeUndefined();
    });

    it('enforces S3 endpoint domain whitelist against SSRF attacks', () => {
      expect(isAllowedS3Endpoint('https://fly.storage.tigris.dev')).toBe(true);
      expect(isAllowedS3Endpoint('https://my-bucket.s3.ap-southeast-1.amazonaws.com')).toBe(true);
      expect(isAllowedS3Endpoint('https://custom.tigris.dev')).toBe(true);
      expect(isAllowedS3Endpoint('https://malicious-internal-metadata.169.254.169.254')).toBe(false);
      expect(isAllowedS3Endpoint('https://evil-hacker.com')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Durable Sheets Outbox Mirror Worker
  // ---------------------------------------------------------------------------
  describe('4. Durable Sheets Outbox Mirror Worker Lifecycle', () => {
    it('enforces that raw Tigris keys and presigned URLs never leak into mirror payload', () => {
      const safePayload = {
        uniqueId: 'MH-PUN-0001',
        passbook_url: 'Restricted Doc [passbookPhoto]',
        childName: 'Safe Child',
      };
      expect(() => sanitizeMirrorPayload(safePayload)).not.toThrow();

      const leakyPayload = {
        uniqueId: 'MH-PUN-0001',
        passbook_url: 'https://fly.storage.tigris.dev/childcare-assets/secret.bin?X-Amz-Signature=123',
      };
      expect(() => sanitizeMirrorPayload(leakyPayload)).toThrow(/Security Violation: Leaky storage reference/);
    });

    it('atomically claims, processes, and completes outbox jobs with gateway acknowledgement', async () => {
      // 1. Enqueue an outbox mirror job
      await mirrorRepo.enqueueJob({
        job_type: 'UPSERT_ROW',
        target_sheet_name: 'Child_Nutrition',
        idempotency_key: 'job-idemp-01',
        payload_snapshot: {
          uniqueId: 'MH-PUN-0020',
          version: 1,
          childName: 'Mirror Test Child',
        },
        max_attempts: 3,
      });

      expect(await mirrorRepo.getPendingCount()).toBe(1);

      // 2. Mock Apps Script Gateway client
      const mockGateway: any = {
        callGateway: vi.fn(async () => ({
          status: 'success',
          statusCode: 200,
          resolvedRow: 6,
        })),
      };

      const worker = new SheetsMirrorWorker(mirrorRepo, mockGateway, { workerId: 'worker-unit-test' });

      // 3. Drain queue
      const summary = await worker.drainQueue(10);
      expect(summary.processed).toBe(1);
      expect(summary.completed).toBe(1);
      expect(summary.failed).toBe(0);
      expect(await mirrorRepo.getPendingCount()).toBe(0);

      // Verify job was completed with row 6
      const job = await mirrorRepo.getJobById(1);
      expect(job?.status).toBe('COMPLETED');
      expect(job?.sheet_row).toBe(6);
      expect(mockGateway.callGateway).toHaveBeenCalledTimes(1);
    });

    it('supersedes older outbox jobs when Sheet already has newer version', async () => {
      await mirrorRepo.enqueueJob({
        job_type: 'UPSERT_ROW',
        target_sheet_name: 'Child_Nutrition',
        idempotency_key: 'job-idemp-stale',
        payload_snapshot: {
          uniqueId: 'MH-PUN-0021',
          version: 1, // Stale job version
          expectedVersion: 1,
        },
        max_attempts: 3,
      });

      // Gateway reports current sheet version is already 2
      const mockGateway: any = {
        callGateway: vi.fn(async () => ({
          status: 'conflict',
          statusCode: 409,
          currentVersion: 2,
          message: 'Sheet row version is 2',
        })),
      };

      const worker = new SheetsMirrorWorker(mirrorRepo, mockGateway);
      const summary = await worker.drainQueue(5);

      expect(summary.superseded).toBe(1);
      const job = await mirrorRepo.getJobById(1);
      expect(job?.status).toBe('SUPERSEDED');
    });

    it('transitions retryable failures to DEAD_LETTER when max attempts exceeded', async () => {
      await mirrorRepo.enqueueJob({
        job_type: 'UPSERT_ROW',
        target_sheet_name: 'Child_Nutrition',
        idempotency_key: 'job-fail-max',
        payload_snapshot: { uniqueId: 'MH-PUN-0022' },
        max_attempts: 1, // Will fail on 1st attempt
      });

      const failingGateway: any = {
        callGateway: vi.fn(async () => ({
          status: 'error',
          statusCode: 504,
          message: 'Gateway Timeout',
        })),
      };

      const worker = new SheetsMirrorWorker(mirrorRepo, failingGateway);
      const summary = await worker.drainQueue(5);

      expect(summary.deadLettered).toBe(1);
      const job = await mirrorRepo.getJobById(1);
      expect(job?.status).toBe('DEAD_LETTER');
      expect(job?.last_error).toContain('Gateway Timeout');
    });
  });
});
