import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createSubmission } from '@/app/api/submissions/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { GET as healthGet } from '@/app/api/health/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { SupabaseSubmissionAdapter } from '@/lib/server/supabaseSubmissionAdapter';
import { sanitizeLogContext, logServerError } from '@/lib/server/errorLogger';

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

  it('POST /api/auth/login enforces per-IP rate limiting with HTTP 429', async () => {
    const testIp = `203.0.113.${Math.floor(10 + Math.random() * 200)}`;
    let limitedRes: Response | null = null;

    for (let i = 0; i < 65; i++) {
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
});
