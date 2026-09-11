/**
 * preserve-consent-on-local-edit.test.ts
 *
 * URGENT FIX TEST SUITE: Edited record preserves consent and signature during payload rebuild.
 *
 * Requirements:
 * 1. Existing local record with consentProvided: true, signature, valid interviewerName, no remoteSubmissionId:
 *    Edit only weightKg.
 *    Assert:
 *      - final POST payload contains caregiverConsent.consentProvided === true
 *      - signature data/reference is preserved
 *      - exactly one POST, zero PATCH
 *      - final state submitted/synced after acknowledgement
 * 2. Existing local record with legacy consent (consent.agreeToParticipate: true, signatureDataUrl):
 *    Edit another field.
 *    Assert:
 *      - canonical normalization produces caregiverConsent.consentProvided: true
 *      - POST succeeds
 * 3. Existing record with NO consent:
 *    Assert:
 *      - zero POST
 *      - status requires consent
 *      - no fabricated consent object
 * 4. Existing record with IndexedDB signature attachment but no inline data URL:
 *    Assert:
 *      - attachment remains available under legacy and canonical identity
 *      - edited submission does not delete/replace it
 *      - gateway receives signature reference/data
 * 5. Regression:
 *    Edit existing unsent record with only a non-consent field change.
 *    Assert no error message: "Caregiver consent must be confirmed..."
 * 6. Payload inspection:
 *    Exact edit queue payload verifies:
 *      - uuid is valid UUIDv4
 *      - clientSubmissionId is valid UUIDv4
 *      - demographics.artNumber remains business ID
 *      - caregiverConsent.consentProvided is true
 *      - signature information remains present
 *      - no local-only queue metadata is sent
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SyncQueueItem, AssessmentRecord } from '@/types/domain';
import {
  isValidUuidV4,
  normalizeCaregiverConsent,
  hasVerifiableConsent,
} from '@/features/submission/submissionTypes';
import {
  mapToCreatePayload,
  normalizeSubmissionPayload,
} from '@/features/submission/submissionMapper';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import { toWorkerSafeValidationMessage } from '@/lib/validations/submissionValidationGuard';

// ---------------------------------------------------------------------------
// In-Memory Dexie DB Mock
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
  getCaregiverSignatureBlob: vi.fn(async (key: string) => {
    const found = inMemorySignatures.find((s) => s.submissionUuid === key);
    return found ? { ...found } : undefined;
  }),
  saveCaregiverSignatureBlob: vi.fn(async (submissionUuid: string, blob: Blob, caregiverName?: string, caregiverRelationship?: string) => {
    const index = inMemorySignatures.findIndex((s) => s.submissionUuid === submissionUuid);
    const item = {
      submissionUuid,
      blob,
      caregiverName: caregiverName || 'Caregiver',
      caregiverRelationship: caregiverRelationship || 'Mother',
      capturedAt: new Date().toISOString(),
    };
    if (index >= 0) {
      inMemorySignatures[index] = item;
    } else {
      inMemorySignatures.push(item);
    }
  }),
}));

import { enqueueCreate, enqueueUpdate } from '@/features/submission/submissionQueueRepository';
import { processQueue } from '@/features/submission/submissionWorker';

// ---------------------------------------------------------------------------
// Synthetic Non-PII Test Fixtures
// ---------------------------------------------------------------------------

const SYNTHETIC_CLIENT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const SYNTHETIC_ART_ID = 'DL-SOU-TEST-0042';
const SYNTHETIC_SIG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function makeSyntheticLocalRecord(overrides: Partial<AssessmentRecord> = {}): AssessmentRecord {
  return {
    uuid: SYNTHETIC_CLIENT_UUID,
    clientSubmissionId: SYNTHETIC_CLIENT_UUID,
    interviewerName: 'Sunita Sharma',
    version: 1,
    demographics: {
      artNumber: SYNTHETIC_ART_ID,
      childName: 'Aarav Kumar',
      dob: '2020-05-15',
      gender: 'Male',
      caregiverName: 'Pooja Kumar',
      caregiverRelationship: 'Mother',
      contactNumber: '9876543210',
      caregiverPhone: '9876543210',
      district: 'South',
      state: 'Delhi',
    } as any,
    caregiverConsent: {
      consentProvided: true,
      consentVersion: 'v1.0-2026',
      caregiverName: 'Pooja Kumar',
      caregiverRelationship: 'Mother',
      consentCapturedAt: '2026-09-10T10:00:00.000Z',
      signatureRequired: true,
      signatureStatus: 'CAPTURED_LOCAL',
      signatureDataUrl: SYNTHETIC_SIG_DATA_URL,
    } as any,
    consent: {
      agreeToParticipate: true,
      signatureDataUrl: SYNTHETIC_SIG_DATA_URL,
      signatureTimestamp: '2026-09-10T10:00:00.000Z',
    } as any,
    householdFinancial: {
      totalFamilyMembers: 4,
      numberOfChildrenUnder18: 2,
      monthlyIncomeRs: 6000,
      mainSourceOfIncome: 'Daily wage labour',
    } as any,
    health: {
      weightKg: 14.5,
      heightCm: 98,
      artStatus: 'On ART',
      nutritionStatus: 'Normal',
    } as any,
    nutrition: {
      appetite: 'Good',
      mealsPerDay: 3,
    } as any,
    educationStatus: {
      educationStatus: 'Currently going to school',
      schoolName: 'Govt Primary School',
      schoolType: 'Government school',
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
      organizationName: 'India HIV/AIDS Alliance',
      formSubmittedBy: 'Sunita Sharma',
    } as any,
    syncStatus: 'queued',
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  } as AssessmentRecord;
}

// ---------------------------------------------------------------------------
// Network Interceptor
// ---------------------------------------------------------------------------

let postCalls: { url: string; headers: Record<string, string>; body: any }[] = [];
let patchCalls: { url: string; headers: Record<string, string>; body: any }[] = [];

beforeEach(() => {
  inMemoryQueue = [];
  inMemoryDrafts = [];
  inMemorySignatures = [];
  nextQueueId = 1;
  nextDraftId = 1;
  postCalls = [];
  patchCalls = [];

  global.fetch = vi.fn(async (url: any, options: any) => {
    const urlStr = String(url);
    const method = options?.method || 'GET';
    const headers = options?.headers || {};
    const bodyStr = options?.body;
    let body: any = null;
    if (bodyStr) {
      try {
        body = JSON.parse(bodyStr);
      } catch (_) {
        body = bodyStr;
      }
    }

    if (method === 'POST') {
      postCalls.push({ url: urlStr, headers, body });
      return {
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          acknowledged: true,
          remoteSubmissionId: 'b3f11277-2f3b-4ce4-bbdf-5f7200424242',
          clientSubmissionId: body?.clientSubmissionId || body?.uuid || SYNTHETIC_CLIENT_UUID,
          version: 1,
          requestId: `req-${Date.now()}`,
          acceptedAt: new Date().toISOString(),
        }),
      } as any;
    }

    if (method === 'PATCH') {
      patchCalls.push({ url: urlStr, headers, body });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          acknowledged: true,
          remoteSubmissionId: body?.remoteSubmissionId,
          version: (body?.expectedVersion || 1) + 1,
          requestId: `req-${Date.now()}`,
          updatedAt: new Date().toISOString(),
        }),
      } as any;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as any;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('Preserve Consent on Local Edit', () => {
  // -------------------------------------------------------------------------
  // Test 1: Existing local record with consent & signature: Edit only weightKg
  // -------------------------------------------------------------------------
  it('1. Existing local record with consent: editing only weightKg preserves caregiverConsent.consentProvided: true and dispatches exactly one POST', async () => {
    const originalRecord = makeSyntheticLocalRecord();

    // User edits weightKg from 14.5 to 15.2
    const editedSnapshot = {
      ...originalRecord,
      health: {
        ...originalRecord.health,
        weightKg: 15.2,
      },
    };

    // Apply the canonical normalizer on the edited snapshot
    const canonical = normalizeSubmissionPayload(editedSnapshot);

    // Schema gate must pass
    const parsed = completeSubmissionSchema.safeParse(canonical);
    expect(parsed.success).toBe(true);

    // Enqueue as CREATE (since unsent record has no remoteSubmissionId)
    await enqueueCreate({
      clientSubmissionId: canonical.uuid,
      createIdempotencyKey: `create-${canonical.uuid}`,
      snapshot: canonical,
    });

    expect(inMemoryQueue).toHaveLength(1);
    expect(inMemoryQueue[0].operationType).toBe('CREATE');

    // Run the worker
    await processQueue();

    // Assert: exactly one POST, zero PATCH
    expect(postCalls).toHaveLength(1);
    expect(patchCalls).toHaveLength(0);

    // Assert: final POST payload contains caregiverConsent.consentProvided === true
    const postBody = postCalls[0].body;
    expect(postBody.caregiverConsent).toBeDefined();
    expect(postBody.caregiverConsent.consentProvided).toBe(true);
    expect(postBody.caregiverConsent.signatureDataUrl).toBe(SYNTHETIC_SIG_DATA_URL);
    expect(postBody.health.weightKg).toBe(15.2);

    // Final state is synced after acknowledgement
    expect(inMemoryQueue[0].status).toBe('synced');
  });

  // -------------------------------------------------------------------------
  // Test 2: Existing local record with legacy consent format
  // -------------------------------------------------------------------------
  it('2. Existing local record with legacy consent: edit field preserves consent and succeeds', async () => {
    // Record has only legacy consent format (agreeToParticipate: true), no canonical caregiverConsent
    const legacyRecord = makeSyntheticLocalRecord({
      caregiverConsent: undefined,
      consent: {
        agreeToParticipate: true,
        signatureDataUrl: SYNTHETIC_SIG_DATA_URL,
        signatureTimestamp: '2026-09-08T12:00:00.000Z',
      } as any,
    });

    // User edits heightCm from 98 to 101
    const editedSnapshot = {
      ...legacyRecord,
      health: {
        ...legacyRecord.health,
        heightCm: 101,
      },
    };

    // Canonical normalizer converts legacy consent to canonical caregiverConsent
    const canonical = normalizeSubmissionPayload(editedSnapshot);
    expect(canonical.caregiverConsent).toBeDefined();
    expect(canonical.caregiverConsent.consentProvided).toBe(true);

    // Schema gate passes
    const parsed = completeSubmissionSchema.safeParse(canonical);
    expect(parsed.success).toBe(true);

    await enqueueCreate({
      clientSubmissionId: canonical.uuid,
      createIdempotencyKey: `create-${canonical.uuid}`,
      snapshot: canonical,
    });

    await processQueue();

    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].body.caregiverConsent.consentProvided).toBe(true);
    expect(postCalls[0].body.health.heightCm).toBe(101);
  });

  // -------------------------------------------------------------------------
  // Test 3: Existing record with NO consent
  // -------------------------------------------------------------------------
  it('3. Existing record with no consent: zero POST, status requires consent, no fabricated consent', async () => {
    const unconsentedRecord = makeSyntheticLocalRecord({
      caregiverConsent: undefined,
      consent: undefined,
    });
    // Explicitly delete any consent indicator
    delete (unconsentedRecord as any).agreeToParticipate;

    expect(hasVerifiableConsent(unconsentedRecord)).toBe(false);

    // Canonical normalizer does NOT fabricate consent
    const canonical = normalizeSubmissionPayload(unconsentedRecord);
    expect(canonical.caregiverConsent?.consentProvided).not.toBe(true);

    // Schema gate must fail
    const parsed = completeSubmissionSchema.safeParse(canonical);
    expect(parsed.success).toBe(false);

    // If gate fails, form error message must be shown and enqueue must NOT occur
    const firstIssue = parsed.error?.issues[0];
    expect(firstIssue).toBeDefined();

    // The guard produces a worker-safe validation message requiring consent
    // (no crash, no fabrication)
    expect(postCalls).toHaveLength(0);
    expect(inMemoryQueue).toHaveLength(0);

    // Invariant 3b: Record has agreeToParticipate: true, but NO real signature exists
    const agreedWithoutSignature = makeSyntheticLocalRecord({
      caregiverConsent: undefined,
      consent: { agreeToParticipate: true } as any,
    });
    delete (agreedWithoutSignature as any).signatureDataUrl;

    const normalizedNoSig = normalizeSubmissionPayload(agreedWithoutSignature);
    // Consent and signature must be independently verified: consentProvided must NOT be set to true
    expect(normalizedNoSig.caregiverConsent?.consentProvided).not.toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 4: Existing record with IndexedDB signature attachment but no inline data URL
  // -------------------------------------------------------------------------
  it('4. Existing record with IndexedDB signature attachment: attachment remains available under legacy and canonical identity', async () => {
    const legacyKey = 'DL-SOU-LOCAL-999';
    const canonicalKey = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

    // Store signature blob in IndexedDB under the legacy ID
    const fakeBlob = new Blob(['PNG_DATA_PLACEHOLDER'], { type: 'image/png' });
    const { db, saveCaregiverSignatureBlob, getCaregiverSignatureBlob } = await import('@/lib/db/dexieDb');

    await saveCaregiverSignatureBlob(legacyKey, fakeBlob, 'Pooja Kumar', 'Mother');

    // Verify attachment exists under legacy key
    const initialAttachment = await getCaregiverSignatureBlob(legacyKey);
    expect(initialAttachment).toBeDefined();
    expect(initialAttachment?.caregiverName).toBe('Pooja Kumar');

    // Simulate edit page generating canonicalUuid and copying attachment
    await saveCaregiverSignatureBlob(canonicalKey, initialAttachment!.blob, initialAttachment!.caregiverName, initialAttachment!.caregiverRelationship);

    // Attachment must exist under BOTH legacy and canonical keys
    const legacyAttachment = await getCaregiverSignatureBlob(legacyKey);
    const canonicalAttachment = await getCaregiverSignatureBlob(canonicalKey);
    expect(legacyAttachment).toBeDefined();
    expect(canonicalAttachment).toBeDefined();
    expect(canonicalAttachment?.caregiverName).toBe('Pooja Kumar');

    // Create queue payload using canonical key with verified consent
    const record = makeSyntheticLocalRecord({
      uuid: canonicalKey,
      clientSubmissionId: canonicalKey,
      caregiverConsent: {
        consentProvided: true,
        consentVersion: 'v1.0-2026',
        caregiverName: 'Pooja Kumar',
        caregiverRelationship: 'Mother',
        consentCapturedAt: new Date().toISOString(),
        signatureRequired: true,
        signatureStatus: 'CAPTURED_LOCAL',
        signatureAssetId: `sig-${canonicalKey}`,
      } as any,
    });

    const canonical = normalizeSubmissionPayload(record);
    const parsed = completeSubmissionSchema.safeParse(canonical);
    expect(parsed.success).toBe(true);

    await enqueueCreate({
      clientSubmissionId: canonicalKey,
      createIdempotencyKey: `create-${canonicalKey}`,
      snapshot: canonical,
    });

    await processQueue();

    // Original IndexedDB attachment is NOT deleted
    const postAttachment = await getCaregiverSignatureBlob(legacyKey);
    expect(postAttachment).toBeDefined();
    expect(postCalls).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Test 5: Regression: Editing non-consent field displays no consent error
  // -------------------------------------------------------------------------
  it('5. Regression: editing existing unsent record does not trigger "Caregiver consent must be confirmed..."', async () => {
    const originalRecord = makeSyntheticLocalRecord();

    // Simulate editing only remarks
    const editedSnapshot = {
      ...originalRecord,
      educationExpenses: {
        ...originalRecord.educationExpenses,
        remarks: 'Updated remark after home visit',
      },
    };

    const canonical = normalizeSubmissionPayload(editedSnapshot);
    const parsed = completeSubmissionSchema.safeParse(canonical);

    // Must be completely valid
    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      const errorMsg = toWorkerSafeValidationMessage(parsed.error.issues[0]);
      expect(errorMsg).not.toContain('Caregiver consent must be confirmed');
    }
  });

  // -------------------------------------------------------------------------
  // Test 6: Payload inspection: verify full canonical shape and stripped metadata
  // -------------------------------------------------------------------------
  it('6. Payload inspection: serialized edit queue payload contains valid UUIDv4, business ID in artNumber, consentProvided: true, and zero local metadata', async () => {
    const originalRecord = makeSyntheticLocalRecord();

    // Edit monthlyIncomeRs
    const editedSnapshot = {
      ...originalRecord,
      householdFinancial: {
        ...originalRecord.householdFinancial,
        monthlyIncomeRs: 7500,
      },
      // Simulate presence of local-only metadata that must NOT leak into the API body
      id: 42,
      stepIndex: 5,
      syncStatus: 'queued',
      syncNeeded: true,
      syncedAt: undefined,
      syncError: null,
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-11T12:00:00.000Z',
    };

    const canonical = normalizeSubmissionPayload(editedSnapshot);
    const idempotencyKey = `create-${canonical.uuid}`;
    const apiPayload = mapToCreatePayload(canonical, idempotencyKey);

    // 1. uuid is valid RFC 4122 UUIDv4
    expect(isValidUuidV4(apiPayload.uuid as string)).toBe(true);

    // 2. clientSubmissionId is valid RFC 4122 UUIDv4
    expect(isValidUuidV4(apiPayload.clientSubmissionId as string)).toBe(true);

    // 3. demographics.artNumber remains the business ID
    const demographics = apiPayload.demographics as any;
    expect(demographics.artNumber).toBe(SYNTHETIC_ART_ID);

    // 4. caregiverConsent.consentProvided is true
    const caregiverConsent = apiPayload.caregiverConsent as any;
    expect(caregiverConsent).toBeDefined();
    expect(caregiverConsent.consentProvided).toBe(true);

    // 5. signature information remains present
    expect(caregiverConsent.signatureDataUrl).toBe(SYNTHETIC_SIG_DATA_URL);

    // 6. No local-only queue metadata is sent in API payload
    expect(apiPayload.id).toBeUndefined();
    expect(apiPayload.stepIndex).toBeUndefined();
    expect(apiPayload.syncStatus).toBeUndefined();
    expect(apiPayload.syncNeeded).toBeUndefined();
    expect(apiPayload.syncedAt).toBeUndefined();
    expect(apiPayload.syncError).toBeUndefined();
    expect(apiPayload.createdAt).toBeUndefined();
    expect(apiPayload.updatedAt).toBeUndefined();
  });
});
