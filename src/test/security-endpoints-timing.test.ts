import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as cronPost } from '@/app/api/workers/cron/route';
import { GET as diagnosticsGet } from '@/app/api/supervisor/diagnostics/route';
import { GcsStorageService } from '@/lib/server/gcsStorageService';

describe('Security Review Verification: Timing-Safe Secret Rejection & Storage Traversal', () => {
  const originalEnv = { ...process.env };
  const TEST_SECRET = 'super-secret-key-entropy-64-bytes-length-string-val-12345';

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = TEST_SECRET;
    process.env.DIAGNOSTICS_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. /api/workers/cron Timing-Safe Rejection', () => {
    it('returns identical HTTP 401 error payload for missing secret, incorrect length, and incorrect content', async () => {
      // 1. Missing header
      const reqMissing = new NextRequest('http://localhost:3000/api/workers/cron', {
        method: 'POST',
      });
      const resMissing = await cronPost(reqMissing);
      expect(resMissing.status).toBe(401);
      const jsonMissing = await resMissing.json();

      // 2. Incorrect length (short)
      const reqShort = new NextRequest('http://localhost:3000/api/workers/cron', {
        method: 'POST',
        headers: { 'x-cron-secret': 'short' },
      });
      const resShort = await cronPost(reqShort);
      expect(resShort.status).toBe(401);
      const jsonShort = await resShort.json();

      // 3. Incorrect length (long)
      const reqLong = new NextRequest('http://localhost:3000/api/workers/cron', {
        method: 'POST',
        headers: { 'x-cron-secret': TEST_SECRET + '-extra-padding-characters-added-here' },
      });
      const resLong = await cronPost(reqLong);
      expect(resLong.status).toBe(401);
      const jsonLong = await resLong.json();

      // 4. Same length, 1 character different (side-channel target)
      const tampered = TEST_SECRET.slice(0, -1) + (TEST_SECRET.endsWith('a') ? 'b' : 'a');
      const reqTampered = new NextRequest('http://localhost:3000/api/workers/cron', {
        method: 'POST',
        headers: { 'x-cron-secret': tampered },
      });
      const resTampered = await cronPost(reqTampered);
      expect(resTampered.status).toBe(401);
      const jsonTampered = await resTampered.json();

      // Assert error responses are identical across all rejection scenarios
      expect(jsonMissing.status).toBe('error');
      expect(jsonMissing.code).toBe('UNAUTHORIZED');
      expect(jsonShort.code).toBe('UNAUTHORIZED');
      expect(jsonLong.code).toBe('UNAUTHORIZED');
      expect(jsonTampered.code).toBe('UNAUTHORIZED');

      expect(jsonShort.message).toBe(jsonMissing.message);
      expect(jsonLong.message).toBe(jsonMissing.message);
      expect(jsonTampered.message).toBe(jsonMissing.message);
    });

    it('accepts valid secret via x-cron-secret and Bearer authorization', async () => {
      const reqHeader = new NextRequest('http://localhost:3000/api/workers/cron', {
        method: 'POST',
        headers: { 'x-cron-secret': TEST_SECRET },
      });
      const resHeader = await cronPost(reqHeader);
      expect(resHeader.status).toBe(200);

      const reqBearer = new NextRequest('http://localhost:3000/api/workers/cron', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_SECRET}` },
      });
      const resBearer = await cronPost(reqBearer);
      expect(resBearer.status).toBe(200);
    });
  });

  describe('2. /api/supervisor/diagnostics Timing-Safe Rejection', () => {
    it('returns identical HTTP 401 error payload when invalid secret header is provided', async () => {
      // 1. Wrong length
      const reqWrongLen = new NextRequest('http://localhost:3000/api/supervisor/diagnostics', {
        headers: { 'x-diagnostics-secret': 'wrong' },
      });
      const resWrongLen = await diagnosticsGet(reqWrongLen);
      expect(resWrongLen.status).toBe(401);
      const jsonWrongLen = await resWrongLen.json();

      // 2. Same length tampered
      const tampered = TEST_SECRET.slice(0, -1) + 'X';
      const reqTampered = new NextRequest('http://localhost:3000/api/supervisor/diagnostics', {
        headers: { 'x-diagnostics-secret': tampered },
      });
      const resTampered = await diagnosticsGet(reqTampered);
      expect(resTampered.status).toBe(401);
      const jsonTampered = await resTampered.json();

      expect(jsonWrongLen.status).toBe('error');
      expect(jsonWrongLen.code).toBe('UNAUTHORIZED');
      expect(jsonTampered.code).toBe('UNAUTHORIZED');
      expect(jsonWrongLen.message).toBe(jsonTampered.message);
    });

    it('accepts valid secret via x-diagnostics-secret and Bearer authorization', async () => {
      const reqHeader = new NextRequest('http://localhost:3000/api/supervisor/diagnostics', {
        headers: { 'x-diagnostics-secret': TEST_SECRET },
      });
      const resHeader = await diagnosticsGet(reqHeader);
      expect(resHeader.status).toBe(200);

      const reqBearer = new NextRequest('http://localhost:3000/api/supervisor/diagnostics', {
        headers: { authorization: `Bearer ${TEST_SECRET}` },
      });
      const resBearer = await diagnosticsGet(reqBearer);
      expect(resBearer.status).toBe(200);
    });

    it('rejects unauthenticated requests in production mode', async () => {
      delete process.env.E2E_ALLOW_LOCAL_MOCK;
      process.env.APP_ENV = 'production';
      process.env.NEXT_PUBLIC_APP_ENV = 'production';

      const unauthReq = new NextRequest('http://localhost:3000/api/supervisor/diagnostics', {
        headers: { 'x-test-unauthenticated': 'true' },
      });
      const res = await diagnosticsGet(unauthReq);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.code).toBe('UNAUTHORIZED');
    });
  });

  describe('3. GCS Storage Key Sanitization & Path Traversal Neutralization', () => {
    it('neutralizes path traversal dots in parseStorageRef', () => {
      const service = new GcsStorageService({ bucketName: 'cs-p3-childcare-staging' });

      const parsed1 = service.parseStorageRef('../../../etc/passwd');
      expect(parsed1.key).not.toContain('..');
      expect(parsed1.key).toBe('etc/passwd');

      const parsed2 = service.parseStorageRef('gcs://cs-p3-childcare-staging/staging/documents/../../tamper.bin');
      expect(parsed2.key).not.toContain('..');
      expect(parsed2.key).toBe('staging/documents/tamper.bin');
    });

    it('sanitizes submissionId and docType in buildStorageKey', () => {
      const service = new GcsStorageService({ bucketName: 'cs-p3-childcare-staging', appEnv: 'staging' });

      const storageKey = service.buildStorageKey('../../sub-123/evil', '../doc..type');
      expect(storageKey).not.toContain('..');
      expect(storageKey).toBe('staging/documents/______sub-123_evil/___doc__type.bin');
    });
  });
});
