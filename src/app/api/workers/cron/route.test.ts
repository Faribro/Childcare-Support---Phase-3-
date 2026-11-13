import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

describe('Scheduled Worker Cron Route (POST /api/workers/cron)', () => {
  const originalEnv = { ...process.env };
  const TEST_CRON_SECRET = 'cron-secret-test-key-32chars-min-len';

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = TEST_CRON_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests with HTTP 401 UNAUTHORIZED', async () => {
    const req = new NextRequest('http://localhost:3000/api/workers/cron', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.status).toBe('error');
    expect(json.code).toBe('UNAUTHORIZED');
  });

  it('rejects requests with incorrect secret with HTTP 401 UNAUTHORIZED', async () => {
    const req = new NextRequest('http://localhost:3000/api/workers/cron', {
      method: 'POST',
      headers: {
        'x-cron-secret': 'wrong-secret-value-xyz',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('accepts requests with valid CRON_SECRET via x-cron-secret header', async () => {
    const req = new NextRequest('http://localhost:3000/api/workers/cron', {
      method: 'POST',
      headers: {
        'x-cron-secret': TEST_CRON_SECRET,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.executedAt).toBeDefined();
    expect(json.workers).toBeDefined();
  });

  it('accepts requests with valid CRON_SECRET via Authorization: Bearer header', async () => {
    const req = new NextRequest('http://localhost:3000/api/workers/cron', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_CRON_SECRET}`,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
  });

  it('is safe to call repeatedly without state corruption or throwing', async () => {
    for (let i = 0; i < 3; i++) {
      const req = new NextRequest('http://localhost:3000/api/workers/cron', {
        method: 'POST',
        headers: {
          'x-cron-secret': TEST_CRON_SECRET,
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }
  });

  it('also supports GET request for monitoring probe when authorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/workers/cron', {
      method: 'GET',
      headers: {
        'x-cron-secret': TEST_CRON_SECRET,
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
  });
});
