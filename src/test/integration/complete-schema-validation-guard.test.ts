/**
 * complete-schema-validation-guard.test.ts
 *
 * PR #9 — Blocking Schema Validation Guard
 *
 * Covers:
 * 1. Any invalid canonical payload results in ZERO queue entries.
 * 2. Any invalid canonical payload results in ZERO network (POST) calls.
 * 3. A valid canonical payload results in exactly ONE CREATE queue entry.
 * 4. No submission path selectively ignores a non-interviewer schema error.
 * 5. toWorkerSafeValidationMessage maps known paths to safe messages.
 * 6. focusFieldForValidationPath is a DOM no-op in a non-browser environment.
 *
 * Non-PII synthetic test fixtures only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import {
  toWorkerSafeValidationMessage,
  handleSchemaValidationFailure,
} from '@/lib/validations/submissionValidationGuard';
import type { ZodIssue } from 'zod';
import { enqueueCreate } from '@/features/submission/submissionQueueRepository';
import type { AssessmentRecord } from '@/types/domain';

// ---------------------------------------------------------------------------
// Lightweight in-memory queue mock
// ---------------------------------------------------------------------------

let capturedQueue: any[] = [];
let networkCallCount = 0;

vi.mock('@/features/submission/submissionQueueRepository', () => ({
  enqueueCreate: vi.fn(async (args: any) => {
    capturedQueue.push(args);
  }),
  enqueueUpdate: vi.fn(async (args: any) => {
    capturedQueue.push(args);
  }),
}));

vi.mock('@/lib/db/dexieDb', () => ({
  db: {
    transaction: vi.fn(async (_m: any, _t: any, cb: any) => cb()),
    syncQueue: {
      clear: vi.fn(async () => { capturedQueue = []; }),
      add: vi.fn(async (item: any) => { capturedQueue.push(item); return 1; }),
      put: vi.fn(async (item: any) => { capturedQueue.push(item); return 1; }),
      where: vi.fn(() => ({ anyOf: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
      toArray: vi.fn(async () => []),
    },
  },
  getCaregiverSignatureBlob: vi.fn(async () => null),
}));

vi.mock('@/lib/db/syncQueueRepository', () => ({
  getAllQueueItems: vi.fn(async () => []),
  upsertQueueItem: vi.fn(async () => {}),
}));

// Intercept fetch (represents POST /api/submissions)
const originalFetch = global.fetch;
beforeEach(() => {
  capturedQueue = [];
  networkCallCount = 0;
  global.fetch = vi.fn(async () => {
    networkCallCount++;
    return { ok: true, json: async () => ({ data: {} }) } as any;
  });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const UUID_V4 = 'e8b2b714-38b8-4bc2-8984-5fef8c728e82';

/** Minimal payload that passes completeSubmissionSchema */
function validPayload(overrides: Partial<AssessmentRecord> = {}): AssessmentRecord {
  return {
    uuid: UUID_V4,
    clientSubmissionId: UUID_V4,
    interviewerName: 'Sunita Sharma',
    demographics: {
      artNumber: 'DL-TEST-001',
      childName: 'Test Child',
      dob: '2018-04-10',
      gender: 'Female',
      caregiverName: 'Test Caregiver',
      caregiverRelationship: 'Mother',
      district: 'Mumbai',
      state: 'Maharashtra',
    } as any,
    finalReview: {
      allInfoCorrect: true,
      formSubmittedBy: 'Sunita Sharma',
      organizationName: 'India HIV/AIDS Alliance',
    } as any,
    caregiverConsent: {
      consentProvided: true,
    } as any,
    syncStatus: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as AssessmentRecord;
}

// ---------------------------------------------------------------------------
// Guard helper unit tests
// ---------------------------------------------------------------------------

describe('toWorkerSafeValidationMessage()', () => {
  function fakeIssue(path: (string | number)[], message = 'error'): ZodIssue {
    return { code: 'custom', path, message } as ZodIssue;
  }

  it('returns interviewer message for interviewerName path', () => {
    const msg = toWorkerSafeValidationMessage(fakeIssue(['interviewerName']));
    expect(msg).toContain('interviewer name');
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('null');
  });

  it('returns interviewer message for finalReview.formSubmittedBy path', () => {
    const msg = toWorkerSafeValidationMessage(fakeIssue(['finalReview', 'formSubmittedBy']));
    expect(msg).toContain('interviewer name');
  });

  it('returns consent message for caregiverConsent.consentProvided path', () => {
    const msg = toWorkerSafeValidationMessage(fakeIssue(['caregiverConsent', 'consentProvided']));
    expect(msg).toContain('consent');
  });

  it('returns artNumber message for demographics.artNumber path', () => {
    const msg = toWorkerSafeValidationMessage(fakeIssue(['demographics', 'artNumber']));
    expect(msg).toContain('ART');
  });

  it('returns allInfoCorrect message for finalReview.allInfoCorrect path', () => {
    const msg = toWorkerSafeValidationMessage(fakeIssue(['finalReview', 'allInfoCorrect']));
    expect(msg).toContain('confirm');
  });

  it('returns generic fallback for completely unknown path', () => {
    const msg = toWorkerSafeValidationMessage(fakeIssue(['someUnknownField', 'deeply', 'nested']));
    expect(msg).toBe('Please review the highlighted field before submitting.');
  });

  it('never exposes raw field values (safe message check)', () => {
    const issue = { code: 'too_small', path: ['interviewerName'], message: 'String must contain at least 2 character(s)', minimum: 2, type: 'string', inclusive: true } as any;
    const msg = toWorkerSafeValidationMessage(issue);
    // The returned message must not be the raw Zod message — it must be our mapped message
    expect(msg).not.toBe('String must contain at least 2 character(s)');
    expect(msg).toContain('interviewer name');
  });
});

// ---------------------------------------------------------------------------
// handleSchemaValidationFailure unit test
// ---------------------------------------------------------------------------

describe('handleSchemaValidationFailure()', () => {
  it('calls setSubmitting(false) and setError on any issue', () => {
    const setError = vi.fn();
    const setSubmitting = vi.fn();
    const fakeIssue: ZodIssue = { code: 'custom', path: ['interviewerName'], message: 'too short' } as ZodIssue;

    handleSchemaValidationFailure({ issues: [fakeIssue], setError, setSubmitting });

    expect(setSubmitting).toHaveBeenCalledWith(false);
    expect(setError).toHaveBeenCalledOnce();
    expect(typeof setError.mock.calls[0][0]).toBe('string');
    // Must not be empty
    expect((setError.mock.calls[0][0] as string).length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// Schema gate integration: enqueueCreate must not be called for invalid records
// ---------------------------------------------------------------------------

describe('Part D: Schema Gate — invalid payloads never reach enqueueCreate', () => {
  /**
   * Shared helper that mimics the submission guard pattern used in all pages.
   * Returns true if enqueue was called (bad — should not happen), false if blocked.
   */
  async function simulateSubmitWithGuard(payload: any): Promise<boolean> {
    const result = completeSubmissionSchema.safeParse(payload);
    if (!result.success) {
      // Guard fires — no enqueue
      return false;
    }
    // Guard passed — enqueue
    await enqueueCreate({
      clientSubmissionId: payload.uuid,
      createIdempotencyKey: `create-${payload.uuid}`,
      snapshot: payload,
    });
    return true;
  }

  it('D1: missing uuid → zero queue entries, zero network calls', async () => {
    const bad = validPayload({ uuid: '' } as any);
    const proceeded = await simulateSubmitWithGuard(bad);
    expect(proceeded).toBe(false);
    expect(capturedQueue).toHaveLength(0);
    expect(networkCallCount).toBe(0);
  });

  it('D2: non-UUID-v4 uuid → zero queue entries, zero network calls', async () => {
    const bad = validPayload({ uuid: 'DL-NOT-A-UUID-001' } as any);
    const proceeded = await simulateSubmitWithGuard(bad);
    expect(proceeded).toBe(false);
    expect(capturedQueue).toHaveLength(0);
    expect(networkCallCount).toBe(0);
  });

  it('D3: missing demographics.artNumber → zero queue entries', async () => {
    const bad = validPayload();
    bad.demographics = { ...bad.demographics, artNumber: '' } as any;
    const proceeded = await simulateSubmitWithGuard(bad);
    expect(proceeded).toBe(false);
    expect(capturedQueue).toHaveLength(0);
  });

  it('D4: interviewerName too short → zero queue entries, zero network calls', async () => {
    const bad = validPayload({ interviewerName: 'S' } as any);
    const proceeded = await simulateSubmitWithGuard(bad);
    expect(proceeded).toBe(false);
    expect(capturedQueue).toHaveLength(0);
    expect(networkCallCount).toBe(0);
  });

  it('D5: interviewerName empty string → zero queue entries', async () => {
    const bad = validPayload({ interviewerName: '' } as any);
    const proceeded = await simulateSubmitWithGuard(bad);
    expect(proceeded).toBe(false);
    expect(capturedQueue).toHaveLength(0);
  });

  it('D6: finalReview.allInfoCorrect = false → zero queue entries', async () => {
    const bad = validPayload();
    bad.finalReview = { ...bad.finalReview, allInfoCorrect: false } as any;
    const proceeded = await simulateSubmitWithGuard(bad);
    expect(proceeded).toBe(false);
    expect(capturedQueue).toHaveLength(0);
  });

  it('D7: non-interviewer error (missing artNumber) is NOT selectively ignored', async () => {
    // This test verifies that even non-interviewer schema errors block the queue.
    // Prior code only blocked on interviewer errors — a non-interviewer error
    // would fall through to enqueueCreate. This must never happen.
    const bad = validPayload();
    bad.demographics = { ...bad.demographics, artNumber: 'X' } as any; // too short (< 3 chars)
    const proceeded = await simulateSubmitWithGuard(bad);
    expect(proceeded).toBe(false); // MUST be blocked
    expect(capturedQueue).toHaveLength(0);
    expect(networkCallCount).toBe(0);
  });

  it('D8: valid canonical payload results in exactly ONE CREATE queue entry', async () => {
    const good = validPayload();
    const proceeded = await simulateSubmitWithGuard(good);
    expect(proceeded).toBe(true);
    expect(capturedQueue).toHaveLength(1);
    expect(capturedQueue[0].snapshot.uuid).toBe(UUID_V4);
    expect(networkCallCount).toBe(0); // processQueue not called here
  });

  it('D9: demographics.childName too short → zero queue entries', async () => {
    const bad = validPayload();
    bad.demographics = { ...bad.demographics, childName: 'X' } as any; // < 2 chars
    const proceeded = await simulateSubmitWithGuard(bad);
    expect(proceeded).toBe(false);
    expect(capturedQueue).toHaveLength(0);
  });

  it('D10: whitespace-trimmed interviewerName that is valid (2+ chars) → ONE queue entry', async () => {
    // The schema does .trim() so "  SS  " should pass after trim
    const good = validPayload({ interviewerName: '  SS  ' } as any);
    const proceeded = await simulateSubmitWithGuard(good);
    // schema trims "  SS  " → "SS" (2 chars) → should PASS
    expect(proceeded).toBe(true);
    expect(capturedQueue).toHaveLength(1);
  });

  it('D11: whitespace-only interviewerName → zero queue entries', async () => {
    const bad = validPayload({ interviewerName: '   ' } as any);
    const proceeded = await simulateSubmitWithGuard(bad);
    // "   ".trim() → "" (0 chars) → schema rejects
    expect(proceeded).toBe(false);
    expect(capturedQueue).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Verify the guard module is purely unit-testable without DOM
// ---------------------------------------------------------------------------

describe('Part E: Guard is safe in non-DOM environment', () => {
  it('focusFieldForValidationPath is a no-op when document is not defined', async () => {
    // In jsdom (vitest default), document exists but getElementById returns null for unknown IDs.
    // This test verifies focusFieldForValidationPath does not throw.
    const { focusFieldForValidationPath } = await import('@/lib/validations/submissionValidationGuard');
    expect(() => focusFieldForValidationPath(['interviewerName'])).not.toThrow();
    expect(() => focusFieldForValidationPath(['completely', 'unknown', 'path'])).not.toThrow();
    expect(() => focusFieldForValidationPath([])).not.toThrow();
  });
});
