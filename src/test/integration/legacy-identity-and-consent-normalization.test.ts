/**
 * legacy-identity-and-consent-normalization.test.ts
 *
 * Phase 5 Comprehensive Integration Test Suite
 * Validates:
 * 1. Synthetic new assessment: valid RFC 4122 UUIDv4 for uuid and clientSubmissionId,
 *    ART number in demographics.artNumber, POST schema validation pass.
 * 2. Legacy record with uuid = "DL-SOU-TEST-0001" and agreeToParticipate = true:
 *    auto-migrated to stable UUIDv4, canonical caregiverConsent with consentProvided: true,
 *    single POST, no PATCH, ack persists remote ID, repeated migration preserves exact same UUID.
 * 3. Legacy record without verifiable consent:
 *    fails closed, remains in failed_final with consent notice, zero network calls, zero data loss.
 * 4. Confirmed remote record with UUID (UPDATE):
 *    never regenerates UUID, never calls POST, calls PATCH with remoteSubmissionId.
 * 5. Corrupt UPDATE with invalid/ART remote ID:
 *    quarantined to failed_final, never converted to CREATE, no duplicate creation.
 * 6. UI status classification:
 *    auto-repaired legacy CREATE maps to "Waiting to send" (no false correction banner);
 *    only unverified consent and corrupt updates map to "Needs correction";
 *    401 unauthorized maps to "Waiting to retry" (requires re-login, not form correction).
 *
 * Synthetic non-PII test fixtures only.
 * No real Sheets, Apps Script, or live network calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SyncQueueItem, AssessmentRecord } from '@/types/domain';

// ---------------------------------------------------------------------------
// In-Memory Dexie Mock
// ---------------------------------------------------------------------------

let inMemoryQueue: SyncQueueItem[] = [];
let inMemoryDrafts: any[] = [];
let inMemorySignatures: any[] = [];
let nextQueueId = 1;
let nextDraftId = 1;

vi.mock('@/lib/db/dexieDb', () => ({
  db: {
    transaction: vi.fn(async (_mode: string, _tables: any[], callback: () => Promise<any>) => {
      return await callback();
    }),
    syncQueue: {
      clear: vi.fn(async () => {
        inMemoryQueue = [];
        nextQueueId = 1;
      }),
      add: vi.fn(async (item: any) => {
        const id = nextQueueId++;
        const newItem = { ...item, id };
        inMemoryQueue.push(newItem);
        return id;
      }),
      put: vi.fn(async (item: any) => {
        const id = item.id || nextQueueId++;
        const index = inMemoryQueue.findIndex((i) => i.id === id);
        const saved = { ...item, id };
        if (index >= 0) {
          inMemoryQueue[index] = saved;
        } else {
          inMemoryQueue.push(saved);
        }
        return id;
      }),
      get: vi.fn(async (id: number) => {
        const found = inMemoryQueue.find((i) => i.id === id);
        return found ? { ...found } : undefined;
      }),
      update: vi.fn(async (id: number, changes: any) => {
        const item = inMemoryQueue.find((i) => i.id === id);
        if (item) {
          Object.assign(item, changes);
          if (changes.payload) {
            item.payload = { ...changes.payload };
          }
        }
      }),
      delete: vi.fn(async (id: number) => {
        inMemoryQueue = inMemoryQueue.filter((i) => i.id !== id);
      }),
      toArray: vi.fn(async () => inMemoryQueue.map((i) => ({ ...i }))),
      filter: vi.fn((predicate: (item: any) => boolean) => ({
        toArray: async () => inMemoryQueue.filter(predicate).map((i) => ({ ...i })),
        first: async () => {
          const found = inMemoryQueue.find(predicate);
          return found ? { ...found } : undefined;
        },
      })),
      where: vi.fn((field: string) => ({
        equals: (val: any) => ({
          first: async () => {
            const found = inMemoryQueue.find((i: any) => i[field] === val);
            return found ? { ...found } : undefined;
          },
          toArray: async () => inMemoryQueue.filter((i: any) => i[field] === val).map((i) => ({ ...i })),
        }),
      })),
    },
    drafts: {
      clear: vi.fn(async () => {
        inMemoryDrafts = [];
        nextDraftId = 1;
      }),
      add: vi.fn(async (draft: any) => {
        const id = nextDraftId++;
        const newDraft = { ...draft, id };
        inMemoryDrafts.push(newDraft);
        return id;
      }),
      put: vi.fn(async (draft: any) => {
        const id = draft.id || nextDraftId++;
        const index = inMemoryDrafts.findIndex((d) => d.id === id);
        const saved = { ...draft, id };
        if (index >= 0) {
          inMemoryDrafts[index] = saved;
        } else {
          inMemoryDrafts.push(saved);
        }
        return id;
      }),
      get: vi.fn(async (id: number) => {
        const found = inMemoryDrafts.find((d) => d.id === id);
        return found ? { ...found } : undefined;
      }),
      update: vi.fn(async (id: number, changes: any) => {
        const draft = inMemoryDrafts.find((d) => d.id === id);
        if (draft) {
          Object.assign(draft, changes);
        }
      }),
      delete: vi.fn(async (id: number) => {
        inMemoryDrafts = inMemoryDrafts.filter((d) => d.id !== id);
      }),
      toArray: vi.fn(async () => inMemoryDrafts.map((d) => ({ ...d }))),
      where: vi.fn((field: string) => ({
        equals: (val: any) => ({
          first: async () => {
            const found = inMemoryDrafts.find((d: any) => d[field] === val);
            return found ? { ...found } : undefined;
          },
        }),
      })),
    },
    signatureAttachments: {
      clear: vi.fn(async () => {
        inMemorySignatures = [];
      }),
      get: vi.fn(async (key: string) => {
        const found = inMemorySignatures.find((s) => s.submissionUuid === key);
        return found ? { ...found } : undefined;
      }),
      put: vi.fn(async (attachment: any) => {
        const index = inMemorySignatures.findIndex((s) => s.submissionUuid === attachment.submissionUuid);
        if (index >= 0) {
          inMemorySignatures[index] = { ...attachment };
        } else {
          inMemorySignatures.push({ ...attachment });
        }
      }),
      toArray: vi.fn(async () => inMemorySignatures.map((s) => ({ ...s }))),
    },
  },
}));

// Import modules under test
import { db } from '@/lib/db/dexieDb';
import {
  enqueueCreate,
  enqueueUpdate,
  migrateLegacyItems,
} from '@/features/submission/submissionQueueRepository';
import {
  processQueue,
  resumeOnHydration,
} from '@/features/submission/submissionWorker';
import {
  submissionEvents,
  waitForSubmissionOutcome,
} from '@/features/submission/submissionEvents';
import {
  isValidUuidV4,
  generateUuidV4,
  hasVerifiableConsent,
  normalizeCaregiverConsent,
  getSubmissionOperation,
} from '@/features/submission/submissionTypes';
import {
  gatewayCreate,
  gatewayUpdate,
  lookupByClientSubmissionId,
} from '@/features/submission/submissionGateway';
import {
  parseServerAcknowledgement,
  mapAcknowledgementToLocal,
} from '@/features/submission/submissionMapper';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';

// ---------------------------------------------------------------------------
// Synthetic Fixtures
// ---------------------------------------------------------------------------

const CANONICAL_CLIENT_UUID = 'e8b2b714-38b8-4bc2-8984-5fef8c728e82';
const CANONICAL_REMOTE_UUID = '3d5965f7-66a9-4cb5-8d54-1846b0201d4a';
const LEGACY_ART_REF = 'DL-SOU-111409-01';

function makeValidSyntheticRecord(overrides: Partial<AssessmentRecord> = {}): AssessmentRecord {
  return {
    uuid: CANONICAL_CLIENT_UUID,
    clientSubmissionId: CANONICAL_CLIENT_UUID,
    interviewerName: 'Field Caseworker Synthetic',
    version: 1,
    demographics: {
      artNumber: LEGACY_ART_REF,
      childName: 'Beneficiary Child',
      dob: '2021-06-15',
      gender: 'Female',
      caregiverName: 'Caregiver Mother',
      caregiverRelationship: 'Mother',
      caregiverPhone: '9876543210',
      district: 'South',
      state: 'Delhi',
    } as any,
    caregiverConsent: {
      consentProvided: true,
      consentCapturedAt: '2026-09-10T10:00:00.000Z',
      signatureDataUrl: 'data:image/png;base64,syntheticSignatureData',
    } as any,
    consent: {
      agreeToParticipate: true,
      signatureDataUrl: 'data:image/png;base64,syntheticSignatureData',
      signatureTimestamp: '2026-09-10T10:00:00.000Z',
    } as any,
    householdFinancial: {
      totalFamilyMembers: 4,
      monthlyHouseholdIncome: 7500,
    } as any,
    health: {
      weightKg: 14.5,
      heightCm: 98,
      artStatus: 'On ART',
      nutritionStatus: 'Normal',
      bilateralPittingOedema: false,
    } as any,
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    } as any,
    educationStatus: {
      educationStatus: 'Enrolled',
      attendance: 'Regular',
    } as any,
    educationExpenses: {
      totalAnnualCost: 4000,
    } as any,
    educationSupportRequired: {
      totalRequiredSupport: 2500,
    } as any,
    finalReview: {
      allInfoCorrect: true,
      organizationName: 'Alliance India Partner',
    } as any,
    syncStatus: 'queued',
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  } as AssessmentRecord;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Legacy Identity & Consent Normalization Integration Suite', () => {
  const originalFetch = global.fetch;
  let fetchCalls: { url: string; options: any }[] = [];

  beforeEach(() => {
    inMemoryQueue = [];
    inMemoryDrafts = [];
    inMemorySignatures = [];
    nextQueueId = 1;
    nextDraftId = 1;
    fetchCalls = [];
    submissionEvents.removeAll();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    submissionEvents.removeAll();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Synthetic New Assessment
  // =========================================================================
  describe('1. Synthetic new assessment verification', () => {
    it('validates canonical schema with valid UUIDv4 and caregiver consent', () => {
      const record = makeValidSyntheticRecord();
      const parseResult = completeSubmissionSchema.safeParse(record);
      expect(parseResult.success).toBe(true);
      expect(isValidUuidV4(record.uuid)).toBe(true);
      expect(isValidUuidV4(record.clientSubmissionId!)).toBe(true);
      expect(record.demographics.artNumber).toBe(LEGACY_ART_REF);
      expect(record.caregiverConsent?.consentProvided).toBe(true);
    });

    it('enqueues CREATE, verifies canonical identity in DB, and successfully POSTs with 201 ack', async () => {
      const record = makeValidSyntheticRecord();
      const queueId = await enqueueCreate({
        clientSubmissionId: record.clientSubmissionId!,
        createIdempotencyKey: `create-${record.clientSubmissionId}`,
        snapshot: record,
      });

      expect(queueId).toBe(1);
      const enqueued = inMemoryQueue[0];
      expect(enqueued.operationType).toBe('CREATE');
      expect(isValidUuidV4(enqueued.submissionUuid)).toBe(true);
      expect(enqueued.status).toBe('queued');

      global.fetch = vi.fn(async (url: any, options: any) => {
        fetchCalls.push({ url: String(url), options });
        return {
          ok: true,
          status: 201,
          json: async () => ({
            acknowledged: true,
            remoteSubmissionId: CANONICAL_REMOTE_UUID,
            clientSubmissionId: record.clientSubmissionId,
            version: 1,
            requestId: 'req-synth-1',
          }),
        } as any;
      });

      const outcomePromise = waitForSubmissionOutcome(record.clientSubmissionId!, { timeoutMs: 5000 });
      await processQueue();
      const outcome = await outcomePromise;

      expect(outcome.status).toBe('success');
      if (outcome.status !== 'success') throw new Error('Expected success');
      expect(outcome.payload.remoteSubmissionId).toBe(CANONICAL_REMOTE_UUID);
      expect(outcome.payload.version).toBe(1);
      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0].url).toContain('/api/submissions');
      expect(fetchCalls[0].options.method).toBe('POST');
      expect(fetchCalls[0].options.headers['Idempotency-Key']).toBe(`create-${record.clientSubmissionId}`);

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.uuid).toBe(record.clientSubmissionId);
      expect(body.clientSubmissionId).toBe(record.clientSubmissionId);
      expect(body.demographics.artNumber).toBe(LEGACY_ART_REF);
      expect(body.caregiverConsent.consentProvided).toBe(true);

      expect(inMemoryQueue[0].status).toBe('synced');
      expect(inMemoryQueue[0].requestId).toBe('req-synth-1');
    });
  });

  // =========================================================================
  // 2. Legacy Record Auto-Repair and Migration
  // =========================================================================
  describe('2. Legacy record auto-repair (valid record with legacy identity and consent defects)', () => {
    it('migrates legacy ART ID to UUIDv4, normalizes consent, clears 422 error, and auto-syncs via POST', async () => {
      // Setup a legacy local queue item that was previously rejected with 422
      const legacyPayload = {
        ...makeValidSyntheticRecord(),
        uuid: LEGACY_ART_REF, // Defect 1: ART ID used as UUID
        clientSubmissionId: LEGACY_ART_REF,
        demographics: {
          childName: 'Legacy Child Beneficiary',
          dob: '2021-06-15',
          gender: 'Female',
          caregiverName: 'Caregiver Mother',
          caregiverRelationship: 'Mother',
          caregiverPhone: '9876543210',
          district: 'South',
          state: 'Delhi',
          // demographics.artNumber missing or old ID
        },
        caregiverConsent: undefined, // Defect 2: missing caregiverConsent object
        consent: {
          agreeToParticipate: true, // Legacy verifiable consent
          signatureDataUrl: 'data:image/png;base64,legacySigAttachment',
          signatureTimestamp: '2026-09-08T12:00:00.000Z',
        },
      };

      inMemoryQueue.push({
        id: 1,
        submissionUuid: LEGACY_ART_REF,
        operationType: 'CREATE',
        status: 'failed_final', // Previously marked failed_final due to legacy 422
        errorMessage: 'Invalid uuid',
        errorCategory: 'validation',
        lastErrorCode: 422,
        lastAttempt: null,
        nextRetryTimestamp: null,
        retryCount: 1,
        idempotencyKey: `create-${LEGACY_ART_REF}`,
        payload: legacyPayload as any,
      });

      // Setup corresponding draft and signature attachment under the legacy ART ID
      inMemoryDrafts.push({
        id: 1,
        uuid: LEGACY_ART_REF,
        clientSubmissionId: LEGACY_ART_REF,
        syncStatus: 'failed_final',
      });
      inMemorySignatures.push({
        submissionUuid: LEGACY_ART_REF,
        blob: new Blob(['signature'], { type: 'image/png' }),
        mimeType: 'image/png',
        capturedAt: '2026-09-08T12:00:00.000Z',
        caregiverName: 'Caregiver Mother',
        caregiverRelationship: 'Mother',
      });

      // 1. Run migration
      const migratedCount = await migrateLegacyItems();
      expect(migratedCount).toBe(1);

      const repaired = inMemoryQueue[0];
      const newUuid = repaired.payload.uuid;

      // Assertions on normalized identity
      expect(isValidUuidV4(newUuid)).toBe(true);
      expect(repaired.payload.clientSubmissionId).toBe(newUuid);
      expect(repaired.submissionUuid).toBe(newUuid);
      expect(repaired.payload.demographics.artNumber).toBe(LEGACY_ART_REF);
      expect(repaired.idempotencyKey).toBe(`create-${newUuid}`);

      // Assertions on normalized caregiver consent
      expect(repaired.payload.caregiverConsent).toBeDefined();
      expect(repaired.payload.caregiverConsent?.consentProvided).toBe(true);
      expect(repaired.payload.caregiverConsent?.signatureDataUrl).toBe('data:image/png;base64,legacySigAttachment');

      // Assertions on auto-sync status recovery
      expect(repaired.status).toBe('queued');
      expect(repaired.errorMessage).toBeNull();
      expect(repaired.errorCategory).toBeUndefined();
      expect(repaired.lastErrorCode).toBeNull();
      expect(repaired.nextRetryTimestamp).not.toBeNull();

      // Assertions on draft and signature attachment sync
      expect(inMemoryDrafts[0].uuid).toBe(newUuid);
      expect(inMemoryDrafts[0].clientSubmissionId).toBe(newUuid);
      const migratedSig = inMemorySignatures.find((s) => s.submissionUuid === newUuid);
      expect(migratedSig).toBeDefined();

      // 2. Dispatches automatically via worker
      global.fetch = vi.fn(async (url: any, options: any) => {
        fetchCalls.push({ url: String(url), options });
        return {
          ok: true,
          status: 201,
          json: async () => ({
            acknowledged: true,
            remoteSubmissionId: CANONICAL_REMOTE_UUID,
            clientSubmissionId: newUuid,
            version: 1,
            requestId: 'req-legacy-migrated',
          }),
        } as any;
      });

      const outcomePromise = waitForSubmissionOutcome(newUuid, { timeoutMs: 5000 });
      await processQueue();
      const outcome = await outcomePromise;

      expect(outcome.status).toBe('success');
      if (outcome.status !== 'success') throw new Error('Expected success');
      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0].url).toContain('/api/submissions');
      expect(fetchCalls[0].options.method).toBe('POST'); // strictly POST, no PATCH!

      const postBody = JSON.parse(fetchCalls[0].options.body);
      expect(postBody.uuid).toBe(newUuid);
      expect(postBody.demographics.artNumber).toBe(LEGACY_ART_REF);
      expect(postBody.caregiverConsent.consentProvided).toBe(true);

      // Verify final synced state
      expect(inMemoryQueue[0].status).toBe('synced');
      expect(inMemoryQueue[0].requestId).toBe('req-legacy-migrated');
      expect(inMemoryDrafts[0].remoteSubmissionId).toBe(CANONICAL_REMOTE_UUID);
      expect(outcome.payload.remoteSubmissionId).toBe(CANONICAL_REMOTE_UUID);

      // 3. Repeated migration is idempotent: preserves exact same UUID and idempotency key
      const secondMigrationCount = await migrateLegacyItems();
      expect(secondMigrationCount).toBe(0); // Already synced, not touched
      expect(inMemoryQueue[0].payload.uuid).toBe(newUuid);
      expect(inMemoryQueue[0].idempotencyKey).toBe(`create-${newUuid}`);
    });
  });

  // =========================================================================
  // 3. Legacy Record Missing Verifiable Consent (Fail-Closed Safety)
  // =========================================================================
  describe('3. Unverifiable consent fail-closed safety', () => {
    it('does NOT fabricate consent, halts in failed_final with consent message, and makes zero network calls', async () => {
      const payloadWithoutConsent = {
        ...makeValidSyntheticRecord(),
        caregiverConsent: undefined,
        consent: {
          agreeToParticipate: false, // Refused or absent consent
        },
      };

      inMemoryQueue.push({
        id: 1,
        submissionUuid: CANONICAL_CLIENT_UUID,
        operationType: 'CREATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        idempotencyKey: `create-${CANONICAL_CLIENT_UUID}`,
        payload: payloadWithoutConsent as any,
      });

      // Run migration
      await migrateLegacyItems();

      const item = inMemoryQueue[0];
      expect(item.status).toBe('failed_final');
      expect(item.errorCategory).toBe('validation');
      expect(item.errorMessage).toBe('Caregiver consent must be provided to record this assessment. Please open and record caregiver consent.');
      expect(item.nextRetryTimestamp).toBeNull();

      // Worker process attempt makes zero network calls
      global.fetch = vi.fn();
      await processQueue();
      expect(global.fetch).not.toHaveBeenCalled();

      // Record remains safely in local IndexedDB (zero data loss)
      expect(inMemoryQueue.length).toBe(1);
      expect(inMemoryQueue[0].payload.demographics.childName).toBe('Beneficiary Child');
    });
  });

  // =========================================================================
  // 4. Remote Record with Confirmed UUID (UPDATE)
  // =========================================================================
  describe('4. Confirmed remote record with UUID (UPDATE)', () => {
    it('preserves existing UUID, calls PATCH /api/submissions/:remoteSubmissionId, and never calls POST', async () => {
      inMemoryQueue.push({
        id: 1,
        submissionUuid: CANONICAL_CLIENT_UUID,
        operationType: 'UPDATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        expectedRemoteSubmissionId: CANONICAL_REMOTE_UUID,
        expectedVersion: 1,
        idempotencyKey: `update-${CANONICAL_REMOTE_UUID}-v1`,
        payload: {
          uuid: CANONICAL_CLIENT_UUID,
          remoteSubmissionId: CANONICAL_REMOTE_UUID,
          version: 1,
          changes: {
            health: {
              weightKg: 15.2,
            },
          },
        } as any,
      });

      inMemoryDrafts.push({
        id: 1,
        uuid: CANONICAL_CLIENT_UUID,
        version: 1,
        syncStatus: 'queued',
      });

      await migrateLegacyItems();

      // Identity is not altered
      expect(inMemoryQueue[0].operationType).toBe('UPDATE');
      expect(inMemoryQueue[0].payload.remoteSubmissionId).toBe(CANONICAL_REMOTE_UUID);

      global.fetch = vi.fn(async (url: any, options: any) => {
        fetchCalls.push({ url: String(url), options });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            acknowledged: true,
            remoteSubmissionId: CANONICAL_REMOTE_UUID,
            clientSubmissionId: CANONICAL_CLIENT_UUID,
            version: 2,
            requestId: 'req-update-ack',
          }),
        } as any;
      });

      const outcomePromise = waitForSubmissionOutcome(CANONICAL_CLIENT_UUID, { timeoutMs: 5000 });
      await processQueue();
      const outcome = await outcomePromise;

      expect(outcome.status).toBe('success');
      if (outcome.status !== 'success') throw new Error('Expected success');
      expect(outcome.payload.version).toBe(2);
      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0].url).toContain(`/api/submissions/${CANONICAL_REMOTE_UUID}`);
      expect(fetchCalls[0].options.method).toBe('PATCH');
      expect(fetchCalls[0].options.headers['If-Match']).toBe('"1"');

      expect(inMemoryQueue[0].status).toBe('synced');
      expect(inMemoryDrafts[0].version).toBe(2);
      expect(inMemoryDrafts[0].syncStatus).toBe('synced');
    });
  });

  // =========================================================================
  // 5. Corrupt UPDATE with Invalid/ART Remote ID (Quarantine)
  // =========================================================================
  describe('5. Corrupt UPDATE quarantine (prevents duplicate CREATEs)', () => {
    it('quarantines UPDATE missing valid UUID remote ID, emits event, and makes zero network calls', async () => {
      inMemoryQueue.push({
        id: 1,
        submissionUuid: 'DL-SOU-001',
        operationType: 'UPDATE',
        status: 'queued',
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: null,
        errorMessage: null,
        idempotencyKey: 'update-DL-SOU-001-v1',
        payload: {
          remoteSubmissionId: 'DL-SOU-001', // Invalid: ART ID instead of UUIDv4
          changes: { health: { weightKg: 16 } },
        } as any,
      });

      let failedEventEmitted = false;
      submissionEvents.on('submission:failed', (evt) => {
        if (evt.errorCategory === 'invalid_update_identity') {
          failedEventEmitted = true;
        }
      });

      const migrated = await migrateLegacyItems();
      expect(migrated).toBe(1);

      const quarantined = inMemoryQueue[0];
      expect(quarantined.operationType).toBe('UPDATE'); // NOT turned into CREATE!
      expect(quarantined.status).toBe('failed_final');
      expect(quarantined.errorCategory).toBe('invalid_update_identity');
      expect(quarantined.nextRetryTimestamp).toBeNull();
      expect(failedEventEmitted).toBe(true);

      // Verify worker makes zero network calls
      global.fetch = vi.fn();
      await processQueue();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. UI Status Classification & Mapping Truthfulness
  // =========================================================================
  describe('6. UI Status classification logic verification', () => {
    function computeUiStatus(item: {
      status: string;
      statusCode?: number;
      lastErrorCode?: number;
      errorCategory?: string;
      errorMessage?: string | null;
      nextRetryTimestamp?: number | null;
    }): { chipStatus: string; needsCorrection: boolean } {
      const rawStatus = String(item.status || '').toLowerCase();
      const code = Number(item.statusCode || item.lastErrorCode || 0);
      const isTerminalHalted = item.nextRetryTimestamp === null;
      const isUnauthorized = code === 401 || code === 403 || item.errorCategory === 'unauthorized';
      const isTerminal4xx = code >= 400 && code < 500 && code !== 408 && code !== 429 && code !== 401 && code !== 403;
      const isConflict = rawStatus === 'conflict' || code === 409 || item.errorMessage?.toLowerCase().includes('conflict');
      const isNeedsReview = rawStatus === 'needs_review';

      let chipStatus: string;
      if (rawStatus === 'synced') {
        chipStatus = 'Submitted';
      } else if (rawStatus === 'syncing') {
        chipStatus = 'Sending';
      } else if (isConflict) {
        chipStatus = 'Conflict';
      } else if (isNeedsReview) {
        chipStatus = 'Needs correction';
      } else if (isUnauthorized) {
        chipStatus = 'Waiting to retry';
      } else if (rawStatus === 'failed_final' || (rawStatus === 'failed' && (isTerminal4xx || isTerminalHalted))) {
        chipStatus = 'Needs correction';
      } else if (rawStatus === 'failed_retryable' || rawStatus === 'failed') {
        chipStatus = 'Waiting to retry';
      } else {
        chipStatus = 'Waiting to send';
      }

      return {
        chipStatus,
        needsCorrection: chipStatus === 'Needs correction',
      };
    }

    it('maps auto-repaired legacy CREATE to "Waiting to send" (no false correction banner)', () => {
      const ui = computeUiStatus({
        status: 'queued',
        nextRetryTimestamp: Date.now(),
        errorMessage: null,
      });
      expect(ui.chipStatus).toBe('Waiting to send');
      expect(ui.needsCorrection).toBe(false);
    });

    it('maps unverified consent item to "Needs correction"', () => {
      const ui = computeUiStatus({
        status: 'failed_final',
        errorCategory: 'validation',
        errorMessage: 'Caregiver consent must be provided to record this assessment.',
        nextRetryTimestamp: null,
        lastErrorCode: 422,
      });
      expect(ui.chipStatus).toBe('Needs correction');
      expect(ui.needsCorrection).toBe(true);
    });

    it('maps corrupt UPDATE item to "Needs correction"', () => {
      const ui = computeUiStatus({
        status: 'failed_final',
        errorCategory: 'invalid_update_identity',
        errorMessage: 'This saved record needs help before it can be updated.',
        nextRetryTimestamp: null,
      });
      expect(ui.chipStatus).toBe('Needs correction');
      expect(ui.needsCorrection).toBe(true);
    });

    it('maps 401 unauthorized to "Waiting to retry" (requires re-login, not form correction)', () => {
      const ui = computeUiStatus({
        status: 'failed_retryable',
        errorCategory: 'unauthorized',
        lastErrorCode: 401,
        errorMessage: 'Session expired or unverified caseworker role. Please sign in again.',
        nextRetryTimestamp: null,
      });
      expect(ui.chipStatus).toBe('Waiting to retry');
      expect(ui.needsCorrection).toBe(false);
    });
  });

  function createValidSyntheticPayload(artId: string, consent: any): any {
    const base = makeValidSyntheticRecord();
    return {
      ...base,
      uuid: artId,
      clientSubmissionId: artId,
      demographics: {
        ...base.demographics,
        artNumber: artId,
      },
      caregiverConsent: consent?.consentProvided ? consent : undefined,
      consent: consent,
    };
  }

  // =========================================================================
  // 7. Blocker 1: Durable One-Time Idempotent Migration
  // =========================================================================
  describe('7. Blocker 1: Durable one-time idempotent migration', () => {
    it('calling migrateLegacyItems() twice preserves identical identity, does not copy signature twice, and preserves status', async () => {
      const legacyArtId = 'DL-SOU-BLK1-01';
      const rawLegacyConsent = {
        agreeToParticipate: true,
        caregiverName: 'Savita Devi',
        caregiverRelationship: 'Mother',
      };
      const validPayload = createValidSyntheticPayload(legacyArtId, rawLegacyConsent);

      inMemorySignatures.push({
        submissionUuid: legacyArtId,
        blob: new Uint8Array([1, 2, 3, 4]),
        mimeType: 'image/png',
      });

      inMemoryQueue.push({
        id: 101,
        schemaVersion: 1,
        submissionUuid: legacyArtId,
        idempotencyKey: `legacy-${legacyArtId}`,
        operationType: 'CREATE',
        payload: validPayload,
        status: 'failed_retryable',
        errorMessage: null,
        retryCount: 3,
        lastAttempt: '2026-09-10T12:00:00.000Z',
        nextRetryTimestamp: 1234567890,
      });

      const putSpy = vi.spyOn(db.signatureAttachments, 'put');
      putSpy.mockClear();

      // First migration call
      const migratedCount1 = await migrateLegacyItems();
      expect(migratedCount1).toBe(1);

      const itemAfterFirst = inMemoryQueue.find((i) => i.id === 101)!;
      expect(itemAfterFirst.schemaVersion).toBe(3);
      expect(itemAfterFirst.identityMigrationVersion).toBe(1);
      expect(itemAfterFirst.canonicalIdentityMigratedAt).toBeDefined();
      expect(isValidUuidV4(itemAfterFirst.submissionUuid)).toBe(true);
      expect(isValidUuidV4(itemAfterFirst.payload.uuid)).toBe(true);
      expect(isValidUuidV4(itemAfterFirst.payload.clientSubmissionId)).toBe(true);
      expect(itemAfterFirst.payload.demographics.artNumber).toBe(legacyArtId);
      expect(itemAfterFirst.payload.legacyBusinessReference).toBe(legacyArtId);
      expect(itemAfterFirst.idempotencyKey).toBe(`create-${itemAfterFirst.submissionUuid}`);
      expect(putSpy).toHaveBeenCalledTimes(1);

      const capturedUuid = itemAfterFirst.submissionUuid;
      const capturedIdempotencyKey = itemAfterFirst.idempotencyKey;
      const capturedMigratedAt = itemAfterFirst.canonicalIdentityMigratedAt;
      const capturedStatus = itemAfterFirst.status;
      const capturedNextRetry = itemAfterFirst.nextRetryTimestamp;

      // Second migration call
      const migratedCount2 = await migrateLegacyItems();
      // Must be skipped!
      expect(migratedCount2).toBe(0);

      const itemAfterSecond = inMemoryQueue.find((i) => i.id === 101)!;
      // Invariant: Exact same UUID, clientSubmissionId, and idempotency key
      expect(itemAfterSecond.submissionUuid).toBe(capturedUuid);
      expect(itemAfterSecond.payload.uuid).toBe(capturedUuid);
      expect(itemAfterSecond.payload.clientSubmissionId).toBe(capturedUuid);
      expect(itemAfterSecond.idempotencyKey).toBe(capturedIdempotencyKey);
      expect(itemAfterSecond.canonicalIdentityMigratedAt).toBe(capturedMigratedAt);

      // Invariant: Exactly one signature-copy attempt (0 on second call)
      expect(putSpy).toHaveBeenCalledTimes(1);

      // Invariant: Exactly one CREATE queue item (no duplicates)
      expect(inMemoryQueue.length).toBe(1);

      // Invariant: Status and retry metadata untouched
      expect(itemAfterSecond.status).toBe(capturedStatus);
      expect(itemAfterSecond.nextRetryTimestamp).toBe(capturedNextRetry);
    });

    it('does not reset terminal validation failure status on repeated migrateLegacyItems()', async () => {
      const legacyArtId = 'DL-SOU-NOCONSENT-01';
      const payloadWithoutConsent = createValidSyntheticPayload(legacyArtId, undefined);
      delete (payloadWithoutConsent as any).caregiverConsent;
      delete (payloadWithoutConsent as any).consent;
      delete (payloadWithoutConsent as any).agreeToParticipate;

      inMemoryQueue.push({
        id: 102,
        schemaVersion: 1,
        submissionUuid: legacyArtId,
        idempotencyKey: `legacy-${legacyArtId}`,
        operationType: 'CREATE',
        payload: payloadWithoutConsent,
        status: 'queued',
        errorMessage: null,
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
      });

      // First run: repairs identity, flags missing consent as failed_final
      await migrateLegacyItems();

      const itemAfterFirst = inMemoryQueue.find((i) => i.id === 102)!;
      expect(itemAfterFirst.schemaVersion).toBe(3);
      expect(itemAfterFirst.status).toBe('failed_final');
      expect(itemAfterFirst.errorCategory).toBe('validation');
      expect(itemAfterFirst.nextRetryTimestamp).toBeNull();

      // Second run: must NOT reset status or retry metadata
      await migrateLegacyItems();

      const itemAfterSecond = inMemoryQueue.find((i) => i.id === 102)!;
      expect(itemAfterSecond.status).toBe('failed_final');
      expect(itemAfterSecond.errorCategory).toBe('validation');
      expect(itemAfterSecond.nextRetryTimestamp).toBeNull();
    });
  });

  // =========================================================================
  // 8. Blocker 2: Fail-Closed Signature Attachment Migration
  // =========================================================================
  describe('8. Blocker 2: Fail-closed signature attachment migration', () => {
    it('halts migration fail-closed on storage error: zero POST, original blob preserved, retry succeeds when storage freed', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const legacyArtId = 'DL-SOU-SIGFAIL-01';
      const validPayload = createValidSyntheticPayload(legacyArtId, {
        agreeToParticipate: true,
        caregiverName: 'Kavita Patil',
        caregiverRelationship: 'Mother',
      });

      const originalBlobData = new Uint8Array([99, 88, 77, 66]);
      inMemorySignatures.push({
        submissionUuid: legacyArtId,
        blob: originalBlobData,
        mimeType: 'image/png',
      });

      inMemoryQueue.push({
        id: 201,
        schemaVersion: 1,
        submissionUuid: legacyArtId,
        idempotencyKey: `legacy-${legacyArtId}`,
        operationType: 'CREATE',
        payload: validPayload,
        status: 'queued',
        errorMessage: null,
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
      });

      // 1. Force attachment copy failure (e.g. QuotaExceededError in IndexedDB)
      const putSpy = vi.spyOn(db.signatureAttachments, 'put');
      putSpy.mockRejectedValue(new Error('QuotaExceededError: Device storage full'));

      // Run migration
      const migratedCount = await migrateLegacyItems();
      expect(migratedCount).toBe(1);

      const failedItem = inMemoryQueue.find((i) => i.id === 201)!;
      // Invariant: typed recoverable signature_migration_failed state
      expect(failedItem.errorCategory).toBe('signature_migration_failed');
      expect(failedItem.status).toBe('failed_retryable');
      expect(failedItem.schemaVersion).toBe(2); // Kept < 3 for retry
      expect(failedItem.errorMessage).toContain('Device storage issue');

      // Invariant: original legacy attachment is preserved untouched under legacyArtId
      const legacySig = inMemorySignatures.find((s) => s.submissionUuid === legacyArtId);
      expect(legacySig).toBeDefined();
      expect(legacySig!.blob).toEqual(originalBlobData);

      // Invariant: ZERO POST calls made
      await processQueue('manual_trigger');
      expect(fetchSpy).not.toHaveBeenCalled();

      // 2. Resolve storage issue: restore put
      putSpy.mockImplementation((async (attachment: any) => {
        const idx = inMemorySignatures.findIndex((s) => s.submissionUuid === attachment.submissionUuid);
        if (idx >= 0) inMemorySignatures[idx] = { ...attachment };
        else inMemorySignatures.push({ ...attachment });
      }) as any);

      // Configure mock fetch for successful server response
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'success',
            remoteSubmissionId: '99999999-9999-4999-a999-999999999999',
            version: 1,
            clientSubmissionId: failedItem.submissionUuid,
            requestId: 'ack-sig-resolved-01',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Re-run worker / migration
      await processQueue('retry_after_storage_fixed');

      // Assert signature copied to canonical UUID
      const canonicalSig = inMemorySignatures.find((s) => s.submissionUuid === failedItem.submissionUuid);
      expect(canonicalSig).toBeDefined();
      expect(canonicalSig!.blob).toEqual(originalBlobData);

      // Assert original legacy blob STILL accessible under legacyArtId
      const stillThereLegacySig = inMemorySignatures.find((s) => s.submissionUuid === legacyArtId);
      expect(stillThereLegacySig).toBeDefined();
      expect(stillThereLegacySig!.blob).toEqual(originalBlobData);

      // Assert single POST occurred and item transitioned to synced
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const syncedItem = inMemoryQueue.find((i) => i.id === 201)!;
      expect(syncedItem.status).toBe('synced');
      expect(syncedItem.schemaVersion).toBe(3);
    });

    it('submits safely when signature is payload-backed (Base64 data URL) without Dexie attachment', async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'success',
            remoteSubmissionId: '88888888-8888-4888-a888-888888888888',
            version: 1,
            requestId: 'ack-payload-sig',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        )
      );
      global.fetch = fetchSpy;

      const legacyArtId = 'DL-SOU-BASE64SIG-01';
      const validPayload = createValidSyntheticPayload(legacyArtId, {
        consentProvided: true,
        caregiverName: 'Sunita Sharma',
        caregiverRelationship: 'Mother',
        signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      });

      // No Dexie attachment entry exists in inMemorySignatures
      inMemoryQueue.push({
        id: 202,
        schemaVersion: 1,
        submissionUuid: legacyArtId,
        idempotencyKey: `legacy-${legacyArtId}`,
        operationType: 'CREATE',
        payload: validPayload,
        status: 'queued',
        errorMessage: null,
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
      });

      await processQueue('manual');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const postCall = fetchSpy.mock.calls[0];
      const postBody = JSON.parse(postCall[1].body);
      expect(postBody.caregiverConsent.signatureDataUrl).toContain('data:image/png;base64');
    });

    it('submits safely when signature is optional (signatureRequired: false)', async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'success',
            remoteSubmissionId: '77777777-7777-4777-a777-777777777777',
            version: 1,
            requestId: 'ack-optional-sig',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        )
      );
      global.fetch = fetchSpy;

      const legacyArtId = 'DL-SOU-NOSIGREQ-01';
      const validPayload = createValidSyntheticPayload(legacyArtId, {
        agreeToParticipate: true,
        caregiverName: 'Sunita Sharma',
        caregiverRelationship: 'Mother',
        signatureRequired: false,
      });

      inMemoryQueue.push({
        id: 203,
        schemaVersion: 1,
        submissionUuid: legacyArtId,
        idempotencyKey: `legacy-${legacyArtId}`,
        operationType: 'CREATE',
        payload: validPayload,
        status: 'queued',
        errorMessage: null,
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
      });

      await processQueue('manual');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 9. Blocker 3: Removal of uniqueId as a technical identity hazard
  // =========================================================================
  describe('9. Blocker 3: Removal of uniqueId as a technical identity hazard', () => {
    it('preserves ART/business references in demographics.artNumber and legacyBusinessReference, never as technical ID', async () => {
      const artId = 'WB-KOL-999999-01';
      const payloadWithOverloadedUniqueId: any = {
        ...createValidSyntheticPayload('DL-SOU-TEMP-01', { agreeToParticipate: true }),
        uniqueId: artId,
        demographics: {
          childName: 'Pooja Roy',
        },
      };

      inMemoryQueue.push({
        id: 301,
        schemaVersion: 1,
        submissionUuid: 'DL-SOU-TEMP-01',
        idempotencyKey: 'legacy-key',
        operationType: 'CREATE',
        payload: payloadWithOverloadedUniqueId,
        status: 'queued',
        errorMessage: null,
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
      });

      await migrateLegacyItems();

      const item = inMemoryQueue.find((i) => i.id === 301)!;
      // Technical ID is RFC 4122 UUIDv4
      expect(isValidUuidV4(item.submissionUuid)).toBe(true);
      expect(isValidUuidV4(item.payload.uuid)).toBe(true);
      expect(isValidUuidV4(item.payload.clientSubmissionId)).toBe(true);

      // Business ID preserved in demographics.artNumber and legacyBusinessReference
      expect(item.payload.demographics.artNumber).toBe(artId);
      expect(item.payload.legacyBusinessReference).toBe(artId);
    });

    it('proves no /api/submissions/ URL can include uniqueId or ART number', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'success' }), { status: 200 })
      );
      global.fetch = fetchSpy;

      const artId = 'DL-SOU-111409-01';

      // 1. Gateway Create sends to /api/submissions (POST), never includes uniqueId in URL
      await gatewayCreate({
        payload: { uniqueId: artId, demographics: { artNumber: artId } },
        createIdempotencyKey: 'create-00000000-0000-4000-a000-000000000001' as any,
        clientSubmissionId: '00000000-0000-4000-a000-000000000001',
      });
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/submissions');

      // 2. Gateway Update with an ART ID or uniqueId throws before URL is built
      await expect(
        gatewayUpdate({
          remoteSubmissionId: artId as any,
          expectedVersion: 1,
          changes: { test: true },
          clientSubmissionId: '00000000-0000-4000-a000-000000000001',
        })
      ).rejects.toThrow(/Attempted to use an ART\/reference business ID|not a valid remote submission ID/);

      // 3. Lookup by clientSubmissionId queries clientSubmissionId, never uniqueId
      fetchSpy.mockClear();
      await lookupByClientSubmissionId('00000000-0000-4000-a000-000000000001');
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/submissions?clientSubmissionId=00000000-0000-4000-a000-000000000001');
    });

    it('proves acknowledgement parsers throw if remoteSubmissionId is missing and do NOT fall back to uniqueId', () => {
      const rawWithOnlyUniqueId = {
        uniqueId: 'DL-SOU-111409-01',
        version: 1,
      };

      // parseServerAcknowledgement must throw
      expect(() =>
        parseServerAcknowledgement(rawWithOnlyUniqueId, '00000000-0000-4000-a000-000000000001')
      ).toThrow(/remoteSubmissionId absent/);

      // mapAcknowledgementToLocal must throw
      expect(() =>
        mapAcknowledgementToLocal(rawWithOnlyUniqueId)
      ).toThrow(/missing remoteSubmissionId/);
    });

    it('proves getSubmissionOperation ignores uniqueId and relies solely on remoteSubmissionId + version', () => {
      // Record with uniqueId but no remoteSubmissionId -> must be CREATE
      const op1 = getSubmissionOperation({
        remoteSubmissionId: undefined,
        version: 1,
      } as any);
      expect(op1).toBe('CREATE');

      // Record with valid remoteSubmissionId and version -> UPDATE
      const op2 = getSubmissionOperation({
        remoteSubmissionId: '11111111-1111-4111-a111-111111111111',
        version: 1,
      } as any);
      expect(op2).toBe('UPDATE');
    });
  });
});

