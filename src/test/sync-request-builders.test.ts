import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildCreateRequest,
  buildUpdateRequest,
  RequestBuilderError,
} from '@/lib/sync/requestBuilders';
import {
  migrateLegacyQueueItems,
  getPendingQueue,
  markFailedFinal,
  markFailedRetryable,
} from '@/lib/db/syncQueueRepository';
import { syncOrchestrator } from '@/lib/sync/syncOrchestrator';
import { db } from '@/lib/db/dexieDb';
import type { SyncQueueItem } from '@/types/domain';

let inMemoryQueue: SyncQueueItem[] = [];
let nextId = 1;

vi.mock('@/lib/db/dexieDb', () => ({
  db: {
    syncQueue: {
      clear: vi.fn(async () => {
        inMemoryQueue = [];
        nextId = 1;
      }),
      add: vi.fn(async (item: any) => {
        const id = nextId++;
        const newItem = { ...item, id };
        inMemoryQueue.push(newItem);
        return id;
      }),
      get: vi.fn(async (id: number) => {
        return inMemoryQueue.find((i) => i.id === id);
      }),
      update: vi.fn(async (id: number, changes: any) => {
        const item = inMemoryQueue.find((i) => i.id === id);
        if (item) Object.assign(item, changes);
      }),
      toArray: vi.fn(async () => [...inMemoryQueue]),
      filter: vi.fn((predicate: (item: any) => boolean) => ({
        toArray: async () => inMemoryQueue.filter(predicate),
      })),
      where: vi.fn((field: string) => ({
        equals: (val: any) => ({
          first: async () => inMemoryQueue.find((i: any) => i[field] === val),
        }),
      })),
    },
    drafts: {
      clear: vi.fn(async () => {}),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: async () => undefined,
        })),
      })),
      update: vi.fn(async () => {}),
    },
  },
}));

describe('Safe Request Builders & Queue Migration (Phase 1, 2, 3, 4)', () => {
  const validUuid = 'c56a4180-65aa-42ec-a945-5fd21dec0538';

  const validRecordPayload: any = {
    uuid: validUuid,
    clientSubmissionId: validUuid,
    interviewerName: 'Staff Member',
    demographics: {
      artNumber: 'DL-SOU-101122-01',
      childName: 'Aarav Kumar',
      dob: '2020-01-01',
      gender: 'Male',
      caregiverName: 'Pooja Kumar',
      caregiverRelationship: 'Mother',
      caregiverPhone: '9876543210',
      district: 'South Delhi',
    },
    household: {
      orphanStatus: 'None',
      primaryCaregiverOccupation: 'Daily Wage',
      monthlyHouseholdIncome: 8000,
      rationCardType: 'BPL',
      numberOfSiblings: 2,
    },
    health: {
      heightCm: 95,
      weightKg: 13.5,
      muacMm: 130,
      bilateralPittingOedema: false,
      clinicalNotes: 'Screening passed',
    },
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    },
    education: {
      schoolEnrolled: true,
      schoolType: 'Government',
      schoolGrade: 'Class 1',
      attendancePercentage: 90,
      supportMaterialsNeeded: ['Uniform'],
    },
    bankDetails: {
      accountHolderName: 'Pooja Kumar',
      accountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
      passbookPhotoCaptured: true,
    },
    declaration: {
      consentAcknowledged: true,
      caseworkerName: 'Staff Member',
      declarationDate: '2026-09-08',
    },
  };

  describe('buildCreateRequest (POST /api/submissions)', () => {
    it('should build canonical CREATE request stripping local metadata', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: validUuid,
        idempotencyKey: `create-${validUuid}`,
        operationType: 'CREATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          ...validRecordPayload,
          id: 99,
          stepIndex: 5,
          syncStatus: 'draft',
          syncNeeded: true,
          syncedAt: '2026-09-01T00:00:00Z',
        },
      };

      const req = buildCreateRequest(queueItem);
      expect(req.url).toBe('/api/submissions');
      expect(req.method).toBe('POST');
      expect(req.headers['Content-Type']).toBe('application/json');
      expect(req.headers['Idempotency-Key']).toBe(`create-${validUuid}`);

      // Stripped fields
      expect((req.body as any).id).toBeUndefined();
      expect((req.body as any).stepIndex).toBeUndefined();
      expect((req.body as any).syncStatus).toBeUndefined();
      expect((req.body as any).syncNeeded).toBeUndefined();
      expect((req.body as any).syncedAt).toBeUndefined();

      // Preserved fields
      expect(req.body.uuid).toBe(validUuid);
      expect(req.body.interviewerName).toBe('Staff Member');
    });

    it('should reject non-UUIDv4 identifiers (e.g. ART ID) as terminal failure', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: 'DL-SOU-101122-01',
        idempotencyKey: 'create-legacy',
        operationType: 'CREATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          ...validRecordPayload,
          uuid: 'DL-SOU-101122-01',
        },
      };

      expect(() => buildCreateRequest(queueItem)).toThrowError(RequestBuilderError);
      try {
        buildCreateRequest(queueItem);
      } catch (err: any) {
        expect(err.code).toBe('INVALID_UUID');
        expect(err.isTerminal).toBe(true);
        expect(err.issues[0].path).toBe('uuid');
      }
    });

    it('should preserve boolean false and numeric 0 in payload', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: validUuid,
        idempotencyKey: `create-${validUuid}`,
        operationType: 'CREATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          ...validRecordPayload,
          household: {
            ...validRecordPayload.household,
            numberOfSiblings: 0,
            monthlyHouseholdIncome: 0,
          },
          health: {
            ...validRecordPayload.health,
            bilateralPittingOedema: false,
          },
        },
      };

      const req = buildCreateRequest(queueItem);
      expect(req.body.household.numberOfSiblings).toBe(0);
      expect(req.body.household.monthlyHouseholdIncome).toBe(0);
      expect(req.body.health?.bilateralPittingOedema).toBe(false);
    });
  });

  describe('buildUpdateRequest (PATCH /api/submissions/{targetId})', () => {
    it('should build canonical PATCH request with { changes } and OCC header', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: validUuid,
        idempotencyKey: `update-${validUuid}-1`,
        operationType: 'UPDATE',
        expectedVersion: 2,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          childName: 'Aarav Updated',
          primaryCaregiverOccupation: 'Self-employed',
        } as any,
      };

      const req = buildUpdateRequest(queueItem);
      expect(req.url).toBe('/api/submissions/DL-SOU-101122-01');
      expect(req.method).toBe('PATCH');
      expect(req.headers['If-Match']).toBe('"2"');
      expect(req.headers['Idempotency-Key']).toBe(`update-${validUuid}-1`);
      expect(req.body.changes.childName).toBe('Aarav Updated');
      expect(req.body.changes.primaryCaregiverOccupation).toBe('Self-employed');
    });

    it('should strip protected fields and OCC fields from changes envelope', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: validUuid,
        idempotencyKey: `update-${validUuid}-1`,
        operationType: 'UPDATE',
        expectedVersion: 1,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          uuid: validUuid,
          id: 42,
          expectedVersion: 1,
          syncStatus: 'queued',
          createdAt: '2026-09-01T00:00:00Z',
          childName: 'Safe Name',
        } as any,
      };

      const req = buildUpdateRequest(queueItem);
      expect((req.body.changes as any).uuid).toBeUndefined();
      expect((req.body.changes as any).id).toBeUndefined();
      expect((req.body.changes as any).expectedVersion).toBeUndefined();
      expect((req.body.changes as any).syncStatus).toBeUndefined();
      expect((req.body.changes as any).createdAt).toBeUndefined();
      expect(req.body.changes.childName).toBe('Safe Name');
    });

    it('should flatten nested section objects from Dexie drafts into scalar fields', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: validUuid,
        idempotencyKey: `update-${validUuid}-1`,
        operationType: 'UPDATE',
        expectedVersion: 1,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          educationStatus: {
            educationStatus: 'Enrolled',
            schoolName: 'Govt Boys Sr Sec School',
            currentClass: 'Class 2',
          },
          nutritionHabits: {
            mealsPerDay: 3,
            dietaryDiversityScore: 'Medium',
          },
        } as any,
      };

      const req = buildUpdateRequest(queueItem);
      expect(req.body.changes.educationStatus).toBe('Enrolled');
      expect(req.body.changes.schoolName).toBe('Govt Boys Sr Sec School');
      expect(req.body.changes.currentClass).toBe('Class 2');
      expect(req.body.changes.mealsPerDay).toBe(3);
    });

    it('sends exactly one version precondition via If-Match header and omits expectedVersion from body', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: validUuid,
        idempotencyKey: `update-single-precondition`,
        operationType: 'UPDATE',
        expectedVersion: 3,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          expectedVersion: 3,
          childName: 'Aarav Single Precondition',
        } as any,
      };

      const req = buildUpdateRequest(queueItem);
      expect(req.headers['If-Match']).toBe('"3"');
      expect((req.body as any).expectedVersion).toBeUndefined();
      expect(Object.keys(req.body)).toEqual(['changes']);
      expect(req.body.changes.childName).toBe('Aarav Single Precondition');
    });

    it('should reject missing expectedVersion as terminal error with MISSING_EXPECTED_VERSION', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: validUuid,
        idempotencyKey: 'update-missing-version',
        operationType: 'UPDATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          childName: 'Aarav',
        } as any,
      };

      expect(() => buildUpdateRequest(queueItem)).toThrowError(RequestBuilderError);
      try {
        buildUpdateRequest(queueItem);
      } catch (err: any) {
        expect(err.code).toBe('MISSING_EXPECTED_VERSION');
        expect(err.isTerminal).toBe(true);
      }
    });

    it('should reject invalid expectedVersion (< 1 or non-integer) as terminal error with INVALID_EXPECTED_VERSION', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: validUuid,
        idempotencyKey: `update-${validUuid}-0`,
        operationType: 'UPDATE',
        expectedVersion: 0,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          childName: 'Aarav',
        } as any,
      };

      expect(() => buildUpdateRequest(queueItem)).toThrowError(RequestBuilderError);
      try {
        buildUpdateRequest(queueItem);
      } catch (err: any) {
        expect(err.code).toBe('INVALID_EXPECTED_VERSION');
        expect(err.isTerminal).toBe(true);
      }
    });

    it('should reject missing remote target ID as terminal error with MISSING_TARGET_ID', () => {
      const queueItem: SyncQueueItem = {
        submissionUuid: '',
        idempotencyKey: 'update-missing',
        operationType: 'UPDATE',
        expectedVersion: 1,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          childName: 'Aarav',
        } as any,
      };

      expect(() => buildUpdateRequest(queueItem)).toThrowError(RequestBuilderError);
      try {
        buildUpdateRequest(queueItem);
      } catch (err: any) {
        expect(err.code).toBe('MISSING_TARGET_ID');
        expect(err.isTerminal).toBe(true);
      }
    });
  });

  describe('Database Outbox & 422 Retry Loop Prevention', () => {
    beforeEach(async () => {
      await db.syncQueue.clear();
      await db.drafts.clear();
    });

    it('should migrate legacy flat UPDATE item to canonical { changes } format and schemaVersion 2', async () => {
      const id = await db.syncQueue.add({
        submissionUuid: validUuid,
        idempotencyKey: 'legacy-key-1',
        operationType: 'UPDATE',
        expectedVersion: 1,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          childName: 'Legacy Child',
          monthlyHouseholdIncome: 9500,
        } as any,
      });

      const res = await migrateLegacyQueueItems();
      expect(res.migratedCount).toBe(1);

      const item = await db.syncQueue.get(id);
      expect(item?.schemaVersion).toBe(2);
      expect((item?.payload as any).changes).toBeDefined();
      expect((item?.payload as any).changes.childName).toBe('Legacy Child');
      expect((item?.payload as any).changes.monthlyHouseholdIncome).toBe(9500);
    });

    it('should exclude terminal failures (422 / halted retries) from getPendingQueue', async () => {
      // 1. Normal queued item
      await db.syncQueue.add({
        submissionUuid: validUuid,
        idempotencyKey: 'pending-1',
        operationType: 'CREATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: validRecordPayload,
      });

      // 2. Terminal 422 failure
      const terminalId = await db.syncQueue.add({
        submissionUuid: 'terminal-uuid-422',
        idempotencyKey: 'term-1',
        operationType: 'UPDATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: validRecordPayload,
      });
      await markFailedFinal(terminalId, 'Invalid client contract', 422, ['uuid: invalid']);

      // 3. Transient 503 retryable failure scheduled for future
      const transientId = await db.syncQueue.add({
        submissionUuid: 'transient-uuid-503',
        idempotencyKey: 'trans-1',
        operationType: 'CREATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: validRecordPayload,
      });
      await markFailedRetryable(transientId, 'Service Unavailable', 503);

      // Verify getPendingQueue
      const pending = await getPendingQueue(false);
      expect(pending.length).toBe(1);
      expect(pending[0].submissionUuid).toBe(validUuid);

      // Even with forceAllPending = true, terminal 422 items MUST NEVER be returned!
      const forcedPending = await getPendingQueue(true);
      const containsTerminal = forcedPending.some((i) => i.submissionUuid === 'terminal-uuid-422');
      expect(containsTerminal).toBe(false);
    });

    it('queue item with HTTP 422 is not selected after app restart, online event, or 25-second interval', async () => {
      const termId = await db.syncQueue.add({
        submissionUuid: 'stuck-422-item',
        idempotencyKey: 'idem-422',
        operationType: 'UPDATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: validRecordPayload,
      });
      await markFailedFinal(termId, 'Client contract 422', 422, ['expectedVersion: missing']);

      // 1. App restart / 25-second interval check (forceAllPending = false)
      const intervalCandidates = await getPendingQueue(false);
      expect(intervalCandidates.some((i) => i.submissionUuid === 'stuck-422-item')).toBe(false);

      // 2. Online event / reconnect check (forceAllPending = true)
      const onlineCandidates = await getPendingQueue(true);
      expect(onlineCandidates.some((i) => i.submissionUuid === 'stuck-422-item')).toBe(false);
    });

    it('PATCH 422 never triggers a POST request and halts automatic retries', async () => {
      const updateId = await db.syncQueue.add({
        schemaVersion: 2,
        submissionUuid: validUuid,
        idempotencyKey: 'update-patch-422-test',
        operationType: 'UPDATE',
        expectedVersion: 1,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now() - 1000,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          expectedVersion: 1,
          changes: {
            childName: 'Invalid Update',
          },
        } as any,
      });

      const calledMethods: string[] = [];
      const calledUrls: string[] = [];

      const originalFetch = global.fetch;
      global.fetch = vi.fn(async (url: any, init?: any) => {
        calledMethods.push(init?.method || 'GET');
        calledUrls.push(String(url));
        return {
          ok: false,
          status: 422,
          headers: new Headers(),
          json: async () => ({
            status: 'error',
            code: 'VALIDATION_ERROR',
            message: 'Client validation error',
            details: { fields: [{ field: 'childName', issue: 'Invalid format' }] },
          }),
        } as Response;
      });

      try {
        const result = await syncOrchestrator.flushQueue('interval');

        // Verify only PATCH was called, NEVER POST
        expect(calledMethods).toContain('PATCH');
        expect(calledMethods).not.toContain('POST');
        expect(calledUrls[0]).toContain('/api/submissions/DL-SOU-101122-01');

        // Verify item was marked failed_final
        expect(result.items[0].status).toBe('failed_final');
        expect(result.items[0].statusCode).toBe(422);

        // Verify DB item has nextRetryTimestamp: null
        const dbItem = await db.syncQueue.get(updateId);
        expect(dbItem?.status).toBe('failed');
        expect(dbItem?.lastErrorCode).toBe(422);
        expect(dbItem?.nextRetryTimestamp).toBeNull();

        // Verify it is not selected on subsequent flush
        const subsequentCandidates = await getPendingQueue(false);
        expect(subsequentCandidates.some((i) => i.id === updateId)).toBe(false);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('migrated queue item preserves false, 0, empty optional values, and valid null semantics', async () => {
      const legacyId = await db.syncQueue.add({
        submissionUuid: validUuid,
        idempotencyKey: 'legacy-data-types',
        operationType: 'UPDATE',
        expectedVersion: 1,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          childName: 'Aarav Child',
          agreeToParticipate: false,
          numberOfChildrenUnder18: 0,
          monthlyIncomeRs: 0,
          remarks: '',
          clinicalNotes: null,
        } as any,
      });

      const res = await migrateLegacyQueueItems();
      expect(res.migratedCount).toBe(1);

      const item = await db.syncQueue.get(legacyId);
      const changes = (item?.payload as any)?.changes;
      expect(changes).toBeDefined();
      expect(changes.agreeToParticipate).toBe(false);
      expect(changes.numberOfChildrenUnder18).toBe(0);
      expect(changes.monthlyIncomeRs).toBe(0);
      expect(changes.remarks).toBeUndefined();
      expect(changes.clinicalNotes).toBeUndefined();
    });

    it('failed migration becomes NEEDS_REVIEW rather than being deleted', async () => {
      const corruptedId = await db.syncQueue.add({
        submissionUuid: validUuid,
        idempotencyKey: 'corrupted-legacy-item',
        operationType: 'UPDATE',
        expectedVersion: 1,
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        payload: {
          remoteSubmissionId: 'DL-SOU-101122-01',
          childName: 12345, // Invalid type: must be string, fails allowlistedPatchChangesSchema
        } as any,
      });

      const res = await migrateLegacyQueueItems();
      expect(res.needsReviewCount).toBe(1);

      // Verify the item is NOT deleted
      const item = await db.syncQueue.get(corruptedId);
      expect(item).toBeDefined();
      expect(item?.status).toBe('needs_review');
      expect(item?.nextRetryTimestamp).toBeNull();
      expect(item?.errorMessage).toContain('needs review');

      // Verify it is NOT picked up for automatic sync
      const pending = await getPendingQueue(true);
      expect(pending.some((i) => i.id === corruptedId)).toBe(false);
    });
  });
});
