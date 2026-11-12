import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createSubmission } from '@/app/api/submissions/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { GET as healthGet } from '@/app/api/health/route';
import {
  GET as workerGet,
  POST as workerPost,
} from '@/app/api/workers/sheets-mirror/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { SupabaseSubmissionAdapter } from '@/lib/server/supabaseSubmissionAdapter';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { sanitizeLogContext, logServerError } from '@/lib/server/errorLogger';
import { checkUserAwareRateLimit, _resetRateLimitsForTest } from '@/lib/server/rateLimit';
import {
  InMemorySheetsMirrorRepository,
  SheetsMirrorWorker,
} from '@/lib/server/sheetsMirrorWorker';
import { notifyDeadLetterAlert } from '@/lib/server/deadLetterAlert';

function makeValidPayload(uuid: string) {
  return {
    uuid,
    clientSubmissionId: uuid,
    interviewerName: 'TRAINING Staff',
    demographics: {
      artNumber: 'TRN-001',
      childName: 'TRAINING Child Sample',
      dob: '2016-05-10',
      gender: 'Female',
      orphanStatus: 'Single orphan (one parent deceased)',
      caregiverName: 'TRAINING Caregiver',
      caregiverRelationship: 'Mother',
      contactNumber: '9876543210',
      residenceType: 'Rented',
      doorAndColony: 'House 12, Shanti Nagar',
      street: 'MG Road',
      villageCity: 'Pune',
      talukMandalBlock: 'Haveli',
      district: 'Pune',
      state: 'Maharashtra',
      pinCode: '411001',
    },
    educationExpenses: {
      remarks: 'Training sample receipt pending',
    },
    caregiverConsent: {
      consentProvided: true,
      dateOfConsent: '2026-11-12',
    },
    finalReview: {
      allInfoCorrect: true,
      formSubmittedBy: 'TRAINING Staff',
      organizationName: 'Alliance India',
    },
  };
}

describe('Phase 3 Hardening: Idempotency, Rate Limits, Health, Error Logging', () => {
  beforeEach(() => {
    MockSheetStore.reset();
  });

  it('POST /api/submissions deduplicates retries with the same Idempotency-Key without creating duplicates', async () => {
    const uuid = crypto.randomUUID();
    const idempKey = `idem-retry-${uuid}`;
    const payload = makeValidPayload(uuid);

    const makeReq = () =>
      new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempKey,
          'x-forwarded-for': '198.51.100.10',
        },
        body: JSON.stringify(payload),
      });

    const res1 = await createSubmission(makeReq());
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    expect(body1.status).toBe('success');
    expect(body1.remoteSubmissionId).toBeDefined();

    const res2 = await createSubmission(makeReq());
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.status).toBe('success');
    expect(body2.isDuplicate).toBe(true);
    expect(body2.remoteSubmissionId).toBe(body1.remoteSubmissionId);

    // Ensure MockSheetStore only holds 1 record for this submission
    const { records } = MockSheetStore.listRecords({ limit: 50 });
    const matches = records.filter(
      (r) => r.remote_submission_id === body1.remoteSubmissionId || r.client_submission_id === uuid
    );
    expect(matches.length).toBe(1);
  });

  it('SupabaseSubmissionAdapter in-memory mode deduplicates Phase 3 clientSubmissionId + idempotencyKey retries', async () => {
    const adapter = new SupabaseSubmissionAdapter(undefined, undefined, {
      supabaseUrl: '',
      serviceRoleKey: '',
    });
    const uuid = crypto.randomUUID();
    const idempKey = `supa-idem-${uuid}`;
    const payload = makeValidPayload(uuid) as any;

    const first = await adapter.createSubmission({
      payload,
      idempotencyKey: idempKey,
      requestId: 'req-1',
    });
    expect(first.status).toBe('success');
    expect(first.statusCode).toBe(201);
    expect(first.remoteSubmissionId).toBe(uuid);

    const retry = await adapter.createSubmission({
      payload,
      idempotencyKey: idempKey,
      requestId: 'req-2',
    });
    expect(retry.status).toBe('success');
    expect(retry.statusCode).toBe(200);
    expect(retry.isDuplicate).toBe(true);
    expect(retry.remoteSubmissionId).toBe(uuid);
  });

  it('GET /api/health returns subsystem boolean checks with zero secrets leaked', async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('childcare-support-phase-3');
    expect(typeof body.checks?.supabaseConfigured).toBe('boolean');
    expect(typeof body.checks?.appsScriptConfigured).toBe('boolean');
    expect(typeof body.checks?.webhookSecretConfigured).toBe('boolean');
    expect(typeof body.checks?.tigrisConfigured).toBe('boolean');

    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/SERVICE_ROLE_KEY|WEBHOOK_SECRET|script\.google\.com|supabase\.co/i);
  });

  it('sanitizeLogContext and logServerError redact secrets, credentials, and raw PII photos', () => {
    const clean = sanitizeLogContext({
      requestId: 'req-abc',
      webhookSecret: 'super-secret-value',
      password: 'my-password',
      aadhaar: '123456789012',
      feeReceiptPhotoUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      notes: 'Safe message',
    }) as Record<string, unknown>;

    expect(clean.requestId).toBe('req-abc');
    expect(clean.notes).toBe('Safe message');
    expect(clean.webhookSecret).toBe('[REDACTED]');
    expect(clean.password).toBe('[REDACTED]');
    expect(clean.aadhaar).toBe('[REDACTED]');
    expect(clean.feeReceiptPhotoUrl).toBe('[REDACTED]');

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logServerError('/api/test', new Error('boom'), { token: 'secret-tok', requestId: 'r1' });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0][0]);
    expect(logged).toContain('"/api/test"');
    expect(logged).not.toContain('secret-tok');
    spy.mockRestore();
  });

  it('POST /api/auth/login enforces raised shared-IP rate limiting (180/min) with HTTP 429', async () => {
    _resetRateLimitsForTest();
    const testIp = `203.0.113.${Math.floor(10 + Math.random() * 200)}`;
    let limitedRes: Response | null = null;

    for (let i = 0; i < 185; i++) {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': testIp,
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ accessIdentifier: '', password: '' }),
      });
      const res = await loginPost(req);
      if (res.status === 429) {
        limitedRes = res;
        break;
      }
    }

    expect(limitedRes).not.toBeNull();
    expect(limitedRes!.status).toBe(429);
    expect(limitedRes!.headers.get('Retry-After')).toBeTruthy();
  });

  it('POST /api/auth/login allows different accounts behind shared NAT IP while throttling brute-force per account', async () => {
    _resetRateLimitsForTest();
    const sharedIp = '198.51.100.88';

    let accountLimited: Response | null = null;
    for (let i = 0; i < 25; i++) {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': sharedIp,
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ accessIdentifier: 'staff-a@allianceindia.org', password: 'wrong' }),
      });
      const res = await loginPost(req);
      if (res.status === 429) {
        accountLimited = res;
        break;
      }
    }
    expect(accountLimited).not.toBeNull();
    expect(accountLimited!.status).toBe(429);

    // Another staff member on the exact same shared IP should NOT be blocked
    const otherUserReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': sharedIp,
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ accessIdentifier: 'staff-b@allianceindia.org', password: 'wrong' }),
    });
    const otherUserRes = await loginPost(otherUserReq);
    expect(otherUserRes.status).not.toBe(429);
  });

  it('checkUserAwareRateLimit isolates verified users sharing the same clinic NAT IP', () => {
    _resetRateLimitsForTest();
    const sharedReq = new NextRequest('http://localhost:3000/api/submissions', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.77' },
    });

    // User A consumes their per-user quota (limit = 3), while shared-IP ceiling = 10
    for (let i = 0; i < 3; i++) {
      const ok = checkUserAwareRateLimit({
        req: sharedReq,
        namespace: 'test_ns',
        perUserLimit: 3,
        sharedIpLimit: 10,
        windowMs: 60_000,
        userId: 'user-a',
        isVerifiedUser: true,
      });
      expect(ok.allowed).toBe(true);
      expect(ok.scopedBy).toBe('user');
    }

    const userABlocked = checkUserAwareRateLimit({
      req: sharedReq,
      namespace: 'test_ns',
      perUserLimit: 3,
      sharedIpLimit: 10,
      windowMs: 60_000,
      userId: 'user-a',
      isVerifiedUser: true,
    });
    expect(userABlocked.allowed).toBe(false);
    expect(userABlocked.scopedBy).toBe('user');

    // User B on the same IP still has full isolated quota
    const userBAllowed = checkUserAwareRateLimit({
      req: sharedReq,
      namespace: 'test_ns',
      perUserLimit: 3,
      sharedIpLimit: 10,
      windowMs: 60_000,
      userId: 'user-b',
      isVerifiedUser: true,
    });
    expect(userBAllowed.allowed).toBe(true);
    expect(userBAllowed.scopedBy).toBe('user');
  });

  it('SheetsMirrorWorker dead-lettered jobs can be listed, alerted without PII, replayed, and completed', async () => {
    const repo = new InMemorySheetsMirrorRepository();
    const job = await repo.enqueueJob({
      job_type: 'UPSERT_ROW',
      target_sheet_name: 'Children',
      idempotency_key: 'dlq-test-1',
      payload_snapshot: {
        UniqueID: 'MH-PUN-999-01',
        ChildName: 'Sensitive Name',
        Aadhaar: '123456789012',
      },
      max_attempts: 1,
    });

    const failingWorker = new SheetsMirrorWorker(
      repo,
      {
        callGateway: async () => ({
          status: 'error',
          statusCode: 500,
          message: 'Upstream 500 timeout',
        }),
      },
      { workerId: 'test-fail-worker' }
    );

    const drain1 = await failingWorker.drainQueue(5);
    expect(drain1.deadLettered).toBe(1);
    expect(await repo.getDeadLetterCount()).toBe(1);

    const deadJobs = await repo.listDeadLetterJobs(10);
    expect(deadJobs).toHaveLength(1);
    expect(deadJobs[0].id).toBe(job.id);

    const alertSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertResult = await notifyDeadLetterAlert({
      source: 'unit-test',
      requestId: 'req-dlq-1',
      deadLetteredInBatch: 1,
      totalDeadLetterCount: 1,
      sampleJobs: deadJobs.map((j) => ({
        id: j.id,
        jobType: j.job_type,
        targetSheetName: j.target_sheet_name,
        attemptCount: j.attempt_count,
        lastError: j.last_error,
      })),
    });
    expect(alertResult.triggered).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const loggedAlert = String(alertSpy.mock.calls[0][1]);
    expect(loggedAlert).not.toContain('Sensitive Name');
    expect(loggedAlert).not.toContain('123456789012');
    alertSpy.mockRestore();

    const replay = await repo.replayDeadLetterJobs({ jobIds: [job.id] });
    expect(replay.requeuedCount).toBe(1);
    expect(replay.requeuedJobIds).toEqual([job.id]);
    expect(await repo.getDeadLetterCount()).toBe(0);
    expect(await repo.getPendingCount()).toBe(1);

    const recoveringWorker = new SheetsMirrorWorker(
      repo,
      {
        callGateway: async () => ({
          status: 'success',
          statusCode: 200,
          resolvedRow: 42,
        }),
      },
      { workerId: 'test-recover-worker' }
    );
    const drain2 = await recoveringWorker.drainQueue(5);
    expect(drain2.completed).toBe(1);
    const finished = await repo.getJobById(job.id);
    expect(finished?.status).toBe('COMPLETED');
    expect(finished?.sheet_row).toBe(42);
  });

  it('GET and POST /api/workers/sheets-mirror enforce auth and support includeDeadLetters & replayDeadLetters', async () => {
    const unauthReq = new NextRequest('http://localhost:3000/api/workers/sheets-mirror?includeDeadLetters=true', {
      method: 'GET',
      headers: { 'x-test-unauthenticated': 'true' },
    });
    const unauthRes = await workerGet(unauthReq);
    expect(unauthRes.status).toBe(401);

    const authGet = new NextRequest('http://localhost:3000/api/workers/sheets-mirror?includeDeadLetters=true', {
      method: 'GET',
    });
    const getRes = await workerGet(authGet);
    expect(getRes.status).toBe(200);

    const replayPost = new NextRequest('http://localhost:3000/api/workers/sheets-mirror', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'replayDeadLetters', limit: 10, drainAfterReplay: false }),
    });
    const postRes = await workerPost(replayPost);
    expect(postRes.status).toBe(200);
    const body = await postRes.json();
    expect(body.status).toMatch(/ok|success/);
  });

  it('STORAGE_ENGINE=sheets forwards Idempotency-Key and clientSubmissionId to Apps Script and maps isDuplicate=true to HTTP 200', async () => {
    const prevEnv = {
      STORAGE_ENGINE: process.env.STORAGE_ENGINE,
      APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL,
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
      E2E_STAGING_ENABLED: process.env.E2E_STAGING_ENABLED,
      NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
      APP_ENV: process.env.APP_ENV,
    };

    const uuid = crypto.randomUUID();
    const idempKey = `sheets-idem-${uuid}`;
    const seenKeys = new Set<string>();
    const originalFetch = globalThis.fetch;

    try {
      process.env.STORAGE_ENGINE = 'sheets';
      process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_sheets_idem_test/exec';
      process.env.WEBHOOK_SECRET = 'test-webhook-secret-minimum-32-characters-long';
      process.env.E2E_STAGING_ENABLED = 'true';
      process.env.APP_ENV = 'staging';
      process.env.NEXT_PUBLIC_APP_ENV = 'staging';

      const fetchSpy = vi.fn(async (_url: any, init?: RequestInit) => {
        const parsed = JSON.parse(String(init?.body || '{}'));
        expect(parsed.action).toBe('create');
        expect(parsed.idempotencyKey).toBe(idempKey);
        expect(parsed.clientSubmissionId).toBe(uuid);
        expect((init?.headers as Record<string, string>)['X-Idempotency-Key']).toBe(idempKey);

        const isDuplicate = seenKeys.has(parsed.idempotencyKey) || seenKeys.has(parsed.clientSubmissionId);
        seenKeys.add(parsed.idempotencyKey);
        seenKeys.add(parsed.clientSubmissionId);

        return new Response(
          JSON.stringify({
            status: 'success',
            acknowledged: true,
            remoteSubmissionId: 'MH-PUN-123456-01',
            uniqueId: 'MH-PUN-123456-01',
            revisionNumber: 1,
            version: 1,
            isDuplicate,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      globalThis.fetch = fetchSpy as any;

      const payload = makeValidPayload(uuid) as any;
      const first = await canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey: idempKey,
        requestId: 'req-sheets-1',
      });
      expect(first.status).toBe('success');
      expect(first.statusCode).toBe(201);
      expect(first.isDuplicate).toBe(false);

      const retry = await canonicalSubmissionAdapter.createSubmission({
        payload,
        idempotencyKey: idempKey,
        requestId: 'req-sheets-2',
      });
      expect(retry.status).toBe('success');
      expect(retry.statusCode).toBe(200);
      expect(retry.isDuplicate).toBe(true);
      expect(retry.remoteSubmissionId).toBe('MH-PUN-123456-01');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete (process.env as any)[k];
        else (process.env as any)[k] = v;
      }
    }
  });
});
