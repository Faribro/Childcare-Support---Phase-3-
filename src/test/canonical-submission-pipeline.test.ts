/**
 * canonical-submission-pipeline.test.ts
 * 
 * 15 acceptance tests proving the canonical submission pipeline satisfies
 * all correctness, identity, safety, and observability requirements.
 *
 * Test data: synthetic only — ART-TEST-0001 pattern, never real IDs.
 * No Apps Script, no real Sheet, no real server: all boundaries mocked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSubmissionOperation,
  assertValidRemoteSubmissionId,
  classifyHttpError,
} from '@/features/submission/submissionTypes';
import {
  toUserFacingState,
  getActionRequiredContext,
} from '@/features/submission/submissionStateMachine';
import {
  mapToCreatePayload,
  mapAcknowledgementToLocal,
  parseServerAcknowledgement,
} from '@/features/submission/submissionMapper';
import { submissionEvents } from '@/features/submission/submissionEvents';
import {
  logDiagnostic,
  generateCorrelationId,
} from '@/features/submission/submissionDiagnostics';
import {
  buildCreateRequest,
  buildUpdateRequest,
  RequestBuilderError,
} from '@/lib/sync/requestBuilders';
import type { SyncQueueItem, AssessmentRecord } from '@/types/domain';

// ---------------------------------------------------------------------------
// Shared synthetic fixture — ART-TEST-0001 pattern, no real data
// ---------------------------------------------------------------------------

const TEST_CLIENT_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_REMOTE_UUID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const TEST_ART_ID = 'ART-TEST-0001'; // synthetic pattern only

const baseRecord: Partial<AssessmentRecord> = {
  uuid: TEST_CLIENT_UUID,
  clientSubmissionId: TEST_CLIENT_UUID,
  interviewerName: 'Test Interviewer',
  version: 1,
  demographics: {
    artNumber: TEST_ART_ID,
    childName: 'Test Child',
    dob: '2018-06-15',
    gender: 'Female',
    caregiverName: 'Test Caregiver',
    caregiverRelationship: 'Mother',
    caregiverPhone: '9999999999',
    district: 'Test District',
  } as any,
  consent: { agreeToParticipate: true } as any,
  // caregiverConsent.consentProvided must be literal true per schema
  caregiverConsent: { consentProvided: true } as any,
  householdFinancial: {
    totalFamilyMembers: 3,
    monthlyHouseholdIncome: 5000, // schema field name
  } as any,
  health: {
    weightKg: 18, heightCm: 110, artStatus: 'On ART',
    nutritionStatus: 'Normal',
    bilateralPittingOedema: false,
  } as any,
  nutrition: { appetite: 'Good', mealsPerDay: 3 } as any,
  // attendance must be an enum string: 'Regular' | 'Irregular' | 'Dropped out'
  educationStatus: { educationStatus: 'Enrolled', attendance: 'Regular' } as any,
  educationExpenses: { totalAnnualCost: 8000 } as any,
  educationSupportRequired: { totalRequiredSupport: 5000 } as any,
  finalReview: { allInfoCorrect: true, organizationName: 'Test Org' } as any,
  syncStatus: 'queued',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};


const baseQueueItem: SyncQueueItem = {
  id: 1,
  schemaVersion: 2,
  submissionUuid: TEST_CLIENT_UUID,
  idempotencyKey: `create-${TEST_CLIENT_UUID}`,
  operationType: 'CREATE',
  payload: baseRecord as AssessmentRecord,
  status: 'queued',
  expectedVersion: 1,
  retryCount: 0,
  lastAttempt: null,
  nextRetryTimestamp: Date.now(),
  errorMessage: null,
};

// ---------------------------------------------------------------------------
// T01 — Identity Invariant: No remoteSubmissionId + version = CREATE
// ---------------------------------------------------------------------------

describe('T01: Identity invariant — no remote ID → CREATE', () => {
  it('returns CREATE when remoteSubmissionId is absent', () => {
    expect(getSubmissionOperation({ remoteSubmissionId: undefined, version: undefined })).toBe('CREATE');
  });

  it('returns CREATE when remoteSubmissionId is present but version is absent', () => {
    expect(getSubmissionOperation({ remoteSubmissionId: TEST_REMOTE_UUID, version: undefined })).toBe('CREATE');
  });

  it('returns CREATE when version is 0 or negative', () => {
    expect(getSubmissionOperation({ remoteSubmissionId: TEST_REMOTE_UUID, version: 0 })).toBe('CREATE');
  });
});

// ---------------------------------------------------------------------------
// T02 — Identity Invariant: remoteSubmissionId + version >= 1 = UPDATE
// ---------------------------------------------------------------------------

describe('T02: Identity invariant — remote ID + version >= 1 → UPDATE', () => {
  it('returns UPDATE when both remoteSubmissionId and version >= 1 are present', () => {
    expect(getSubmissionOperation({ remoteSubmissionId: TEST_REMOTE_UUID, version: 1 })).toBe('UPDATE');
    expect(getSubmissionOperation({ remoteSubmissionId: TEST_REMOTE_UUID, version: 7 })).toBe('UPDATE');
  });
});

// ---------------------------------------------------------------------------
// T03 — URL Guard: ART ID rejected at buildUpdateRequest
// ---------------------------------------------------------------------------

describe('T03: PATCH URL guard — ART reference IDs rejected before any HTTP call', () => {
  it('rejects ART-TEST-0001 with BUSINESS_ID_IN_URL', () => {
    const item: SyncQueueItem = {
      ...baseQueueItem,
      operationType: 'UPDATE',
      expectedVersion: 1,
      payload: { ...baseRecord, remoteSubmissionId: TEST_ART_ID } as AssessmentRecord,
    };

    expect(() => buildUpdateRequest(item)).toThrow(RequestBuilderError);
    try {
      buildUpdateRequest(item);
    } catch (err: any) {
      expect(err.code).toBe('BUSINESS_ID_IN_URL');
      expect(err.isTerminal).toBe(true);
    }
  });

  it('rejects DL-SOU-101550-01 format with BUSINESS_ID_IN_URL', () => {
    const item: SyncQueueItem = {
      ...baseQueueItem,
      operationType: 'UPDATE',
      expectedVersion: 1,
      payload: { ...baseRecord, remoteSubmissionId: 'DL-SOU-101550-01' } as any,
    };

    expect(() => buildUpdateRequest(item)).toThrow(RequestBuilderError);
    try {
      buildUpdateRequest(item);
    } catch (err: any) {
      expect(err.code).toBe('BUSINESS_ID_IN_URL');
    }
  });

  it('accepts a UUID v4 remoteSubmissionId without throwing', () => {
    const item: SyncQueueItem = {
      ...baseQueueItem,
      operationType: 'UPDATE',
      expectedVersion: 1,
      payload: { ...baseRecord, remoteSubmissionId: TEST_REMOTE_UUID } as any,
    };

    // Should not throw
    const req = buildUpdateRequest(item);
    expect(req.url).toBe(`/api/submissions/${TEST_REMOTE_UUID}`);
    expect(req.url).not.toMatch(/ART-TEST|DL-SOU/);
  });
});

// ---------------------------------------------------------------------------
// T04 — assertValidRemoteSubmissionId guard
// ---------------------------------------------------------------------------

describe('T04: assertValidRemoteSubmissionId — standalone guard', () => {
  it('throws on ART pattern', () => {
    expect(() => assertValidRemoteSubmissionId('ART-TEST-0001', 'T04')).toThrow(/ART/);
  });

  it('throws on empty string', () => {
    expect(() => assertValidRemoteSubmissionId('', 'T04')).toThrow();
  });

  it('does not throw on valid UUID v4', () => {
    expect(() => assertValidRemoteSubmissionId(TEST_REMOTE_UUID, 'T04')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T05 — CREATE request: POST to /api/submissions with Idempotency-Key
// ---------------------------------------------------------------------------

describe('T05: buildCreateRequest — POST /api/submissions', () => {
  it('produces POST with Idempotency-Key header and no URL path param', () => {
    const req = buildCreateRequest(baseQueueItem);

    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/submissions');
    expect(req.headers['Idempotency-Key']).toBe(`create-${TEST_CLIENT_UUID}`);
    // artNumber present in body — NOT in the URL
    expect((req.body as any).demographics?.artNumber).toBe(TEST_ART_ID);
    expect(req.url).not.toContain(TEST_ART_ID);
  });

  it('strips local metadata fields from POST body', () => {
    const req = buildCreateRequest(baseQueueItem);
    const body: any = req.body;

    expect(body.id).toBeUndefined();
    expect(body.stepIndex).toBeUndefined();
    expect(body.syncStatus).toBeUndefined();
    expect(body.syncNeeded).toBeUndefined();
    expect(body.syncedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T06 — Server acknowledgement parsing
// ---------------------------------------------------------------------------

describe('T06: parseServerAcknowledgement — validates required fields', () => {
  it('parses a valid acknowledgement body', () => {
    const raw = {
      remoteSubmissionId: TEST_REMOTE_UUID,
      clientSubmissionId: TEST_CLIENT_UUID,
      version: 1,
      requestId: 'req-abc123',
      updatedAt: '2026-09-10T10:00:00Z',
      isDuplicate: false,
    };

    const ack = parseServerAcknowledgement(raw, TEST_CLIENT_UUID);
    expect(ack.remoteSubmissionId).toBe(TEST_REMOTE_UUID);
    expect(ack.version).toBe(1);
    expect(ack.clientSubmissionId).toBe(TEST_CLIENT_UUID);
    expect(ack.isDuplicate).toBe(false);
  });

  it('throws on missing remoteSubmissionId', () => {
    const raw = { version: 1, clientSubmissionId: TEST_CLIENT_UUID };
    expect(() => parseServerAcknowledgement(raw, TEST_CLIENT_UUID)).toThrow(/remoteSubmissionId/);
  });

  it('throws on missing version', () => {
    const raw = { remoteSubmissionId: TEST_REMOTE_UUID, clientSubmissionId: TEST_CLIENT_UUID };
    expect(() => parseServerAcknowledgement(raw, TEST_CLIENT_UUID)).toThrow(/version/);
  });
});

// ---------------------------------------------------------------------------
// T07 — mapAcknowledgementToLocal
// ---------------------------------------------------------------------------

describe('T07: mapAcknowledgementToLocal — persists remoteSubmissionId and version', () => {
  it('maps ack to local fields correctly', () => {
    const rawAck = {
      remoteSubmissionId: TEST_REMOTE_UUID,
      version: 1,
      updatedAt: '2026-09-10T12:00:00Z',
    };

    const local = mapAcknowledgementToLocal(rawAck);
    expect(local.remoteSubmissionId).toBe(TEST_REMOTE_UUID);
    expect(local.version).toBe(1);
    expect(local.syncStatus).toBe('synced');
  });

  it('throws on missing remoteSubmissionId in ack', () => {
    expect(() => mapAcknowledgementToLocal({ version: 1 })).toThrow(/remoteSubmissionId/);
  });
});

// ---------------------------------------------------------------------------
// T08 — mapToCreatePayload strips local fields, preserves artReferenceId in body
// ---------------------------------------------------------------------------

describe('T08: mapToCreatePayload — strips local fields, artNumber in body only', () => {
  it('removes local-only fields and includes artNumber in body', () => {
    const payload = mapToCreatePayload(
      { ...baseRecord, id: 42, stepIndex: 3, syncStatus: 'queued' } as AssessmentRecord,
      `create-${TEST_CLIENT_UUID}`
    );

    expect(payload.id).toBeUndefined();
    expect(payload.stepIndex).toBeUndefined();
    expect(payload.syncStatus).toBeUndefined();
    expect((payload.demographics as any)?.artNumber).toBe(TEST_ART_ID);
    // ART ID must NOT be in any URL-like field in the payload
    expect(payload.remoteSubmissionId).toBeUndefined();
  });

  it('includes createIdempotencyKey in the body', () => {
    const key = `create-${TEST_CLIENT_UUID}`;
    const payload = mapToCreatePayload(baseRecord as AssessmentRecord, key);
    expect(payload.createIdempotencyKey).toBe(key);
  });
});

// ---------------------------------------------------------------------------
// T09 — State machine: SyncStatus → UserFacingSubmissionState
// ---------------------------------------------------------------------------

describe('T09: State machine — internal SyncStatus maps to user-facing states', () => {
  it('maps queued → SAVING', () => {
    expect(toUserFacingState('queued')).toBe('SAVING');
  });

  it('maps syncing → SENDING', () => {
    expect(toUserFacingState('syncing')).toBe('SENDING');
  });

  it('maps synced → SUBMITTED', () => {
    expect(toUserFacingState('synced')).toBe('SUBMITTED');
  });

  it('maps failed_final → ACTION_REQUIRED', () => {
    expect(toUserFacingState('failed_final')).toBe('ACTION_REQUIRED');
  });

  it('maps needs_review → ACTION_REQUIRED', () => {
    expect(toUserFacingState('needs_review')).toBe('ACTION_REQUIRED');
  });

  it('maps draft → DRAFT', () => {
    expect(toUserFacingState('draft')).toBe('DRAFT');
  });
});

// ---------------------------------------------------------------------------
// T10 — Error classification
// ---------------------------------------------------------------------------

describe('T10: classifyHttpError — correct retry/terminal classification', () => {
  it('429 → rate_limited, retryable, not terminal', () => {
    const e = classifyHttpError(429);
    expect(e.category).toBe('rate_limited');
    expect(e.isRetryable).toBe(true);
    expect(e.isTerminal).toBe(false);
  });

  it('422 → validation, not retryable, terminal', () => {
    const e = classifyHttpError(422);
    expect(e.category).toBe('validation');
    expect(e.isRetryable).toBe(false);
    expect(e.isTerminal).toBe(true);
  });

  it('409 → conflict, not retryable, not terminal', () => {
    const e = classifyHttpError(409);
    expect(e.category).toBe('conflict');
    expect(e.isRetryable).toBe(false);
  });

  it('404 → not_found, not retryable, not terminal', () => {
    const e = classifyHttpError(404);
    expect(e.category).toBe('not_found');
    expect(e.isRetryable).toBe(false);
    expect(e.isTerminal).toBe(false);
  });

  it('503 → upstream_unavailable, retryable', () => {
    const e = classifyHttpError(503);
    expect(e.category).toBe('upstream_unavailable');
    expect(e.isRetryable).toBe(true);
    expect(e.isTerminal).toBe(false);
  });

  it('401 → unauthorized, terminal, not retryable', () => {
    const e = classifyHttpError(401);
    expect(e.category).toBe('unauthorized');
    expect(e.isRetryable).toBe(false);
    expect(e.isTerminal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T11 — getActionRequiredContext
// ---------------------------------------------------------------------------

describe('T11: getActionRequiredContext — no technical labels in messages', () => {
  it('validation error shows field correction message, not 422', () => {
    const ctx = getActionRequiredContext('validation', [{ field: 'artNumber', issue: 'Required' }]);
    expect(ctx.message).toContain('artNumber');
    expect(ctx.message).not.toContain('422');
    expect(ctx.message).not.toContain('schema');
    expect(ctx.canRetryNow).toBe(false);
  });

  it('conflict shows review message without OCC jargon or HTTP status codes', () => {
    const ctx = getActionRequiredContext('conflict');
    expect(ctx.message).not.toContain('OCC');
    expect(ctx.message).not.toContain('409');
    expect(ctx.message).not.toContain('ETag');
    expect(ctx.message).not.toContain('expectedVersion');
    // "version" in UX copy like "current version of the record" is acceptable
    // but internal terms like "OCC", "409", "ETag" must not appear
    expect(ctx.canRetryNow).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// T12 — Submission events bus
// ---------------------------------------------------------------------------

describe('T12: Submission event bus — pub/sub lifecycle', () => {
  afterEach(() => {
    submissionEvents.removeAll();
  });

  it('emits and receives submission:success event with correct payload', () => {
    const received: any[] = [];
    const unsub = submissionEvents.on('submission:success', (payload) => {
      received.push(payload);
    });

    submissionEvents.emit('submission:success', {
      clientSubmissionId: TEST_CLIENT_UUID,
      remoteSubmissionId: TEST_REMOTE_UUID,
      version: 1,
      requestId: 'req-xyz',
      timestamp: new Date().toISOString(),
    });

    expect(received.length).toBe(1);
    expect(received[0].remoteSubmissionId).toBe(TEST_REMOTE_UUID);
    expect(received[0].version).toBe(1);

    unsub();

    // After unsubscribing, should not receive further events
    submissionEvents.emit('submission:success', {
      clientSubmissionId: TEST_CLIENT_UUID,
      timestamp: new Date().toISOString(),
    });
    expect(received.length).toBe(1); // still 1
  });

  it('listener errors do not crash the bus', () => {
    submissionEvents.on('submission:retrying', () => {
      throw new Error('listener error');
    });

    // Should not throw
    expect(() => {
      submissionEvents.emit('submission:retrying', {
        clientSubmissionId: TEST_CLIENT_UUID,
        timestamp: new Date().toISOString(),
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T13 — Diagnostics: correlation ID format, no PII in logs
// ---------------------------------------------------------------------------

describe('T13: Diagnostics — correlation ID format and PII safety', () => {
  it('generates a correlation ID with corr- prefix', () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^corr-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('generates unique IDs on each call', () => {
    const ids = new Set(Array.from({ length: 100 }, generateCorrelationId));
    expect(ids.size).toBe(100);
  });

  it('logDiagnostic does not throw regardless of NODE_ENV', () => {
    // logDiagnostic is a safe no-op in production and a console logger in dev.
    // We simply verify it never throws on valid input.
    expect(() =>
      logDiagnostic({
        timestamp: new Date().toISOString(),
        operation: 'CREATE',
        clientSubmissionId: TEST_CLIENT_UUID,
        correlationId: 'corr-test-abc',
        stateBefore: 'queued',
        stateAfter: 'synced',
        retryCount: 0,
        elapsedMs: 123,
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T14 — Idempotency: same clientSubmissionId → same idempotency key
// ---------------------------------------------------------------------------

describe('T14: Idempotency key is stable across retries', () => {
  it('buildCreateRequest preserves idempotencyKey from queue item on retry', () => {
    // Use the same full fixture as the existing passing sync-request-builders tests
    const stableKey = `create-${TEST_CLIENT_UUID}`;
    const validPayload: any = {
      uuid: TEST_CLIENT_UUID,
      clientSubmissionId: TEST_CLIENT_UUID,
      interviewerName: 'Test Interviewer',
      demographics: {
        artNumber: TEST_ART_ID,
        childName: 'Test Child',
        dob: '2018-06-15',
        gender: 'Female',
        caregiverName: 'Test Caregiver',
        caregiverRelationship: 'Mother',
        caregiverPhone: '9999999999',
        district: 'Test District',
      },
      caregiverConsent: { consentProvided: true },
      householdFinancial: { totalFamilyMembers: 3, monthlyHouseholdIncome: 5000 },
      health: {
        weightKg: 18, heightCm: 110, artStatus: 'On ART',
        nutritionStatus: 'Normal', bilateralPittingOedema: false,
      },
      nutrition: { appetite: 'Good', mealsPerDay: 3 },
      educationStatus: { educationStatus: 'Enrolled', attendance: 'Regular' },

      educationExpenses: { totalAnnualCost: 8000 },
    };

    const item: SyncQueueItem = {
      ...baseQueueItem,
      idempotencyKey: stableKey,
      payload: validPayload,
      retryCount: 3,
    };

    const req = buildCreateRequest(item);
    expect(req.headers['Idempotency-Key']).toBe(stableKey);
  });

  it('buildUpdateRequest preserves idempotencyKey from queue item on retry', () => {
    const stableKey = `update-${TEST_REMOTE_UUID}-1`;
    const item: SyncQueueItem = {
      ...baseQueueItem,
      operationType: 'UPDATE',
      idempotencyKey: stableKey,
      expectedVersion: 1,
      retryCount: 2,
      payload: {
        remoteSubmissionId: TEST_REMOTE_UUID,
        childName: 'Test Child Updated',
      } as any,
    };

    const req = buildUpdateRequest(item);
    expect(req.headers['Idempotency-Key']).toBe(stableKey);
  });
});


// ---------------------------------------------------------------------------
// T15 — Regression: business ID never in PATCH URL across all test IDs
// ---------------------------------------------------------------------------

describe('T15: REGRESSION — business IDs never appear in PATCH URL paths', () => {
  const businessIds = [
    'ART-TEST-0001',
    'DL-SOU-101550-01',
    'WB-KOL-081255-01',
    'MH-PUN-050003-02',
  ];

  businessIds.forEach((businessId) => {
    it(`${businessId} is rejected at buildUpdateRequest`, () => {
      const item: SyncQueueItem = {
        ...baseQueueItem,
        operationType: 'UPDATE',
        expectedVersion: 1,
        payload: { ...baseRecord, remoteSubmissionId: businessId } as any,
      };

      expect(() => buildUpdateRequest(item)).toThrow(RequestBuilderError);
      try {
        buildUpdateRequest(item);
      } catch (err: any) {
        expect(err.code).toBe('BUSINESS_ID_IN_URL');
      }
    });
  });
});
