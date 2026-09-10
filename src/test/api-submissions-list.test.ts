import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listSubmissions } from '@/app/api/submissions/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

describe('GET /api/submissions API Contract & Limit Hardening Suite', () => {
  beforeEach(() => {
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
    vi.restoreAllMocks();
  });

  it('handles GET /api/submissions without query params, applying default limit 50', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions', { method: 'GET' });
    const res = await listSubmissions(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data).toBeDefined();
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.offset).toBe(0);
    expect(Array.isArray(body.data.records)).toBe(true);
    expect(body.data.records.length).toBeGreaterThan(0);
  });

  it('respects limit=100 as the maximum standard batch size', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=100', { method: 'GET' });
    const res = await listSubmissions(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.pagination.limit).toBe(100);
  });

  it('safely clamps limit > 100 down to 100 without erroring', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=500', { method: 'GET' });
    const res = await listSubmissions(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.pagination.limit).toBe(100);
  });

  it('returns 400 VALIDATION_ERROR for non-numeric limit', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=notanumber', { method: 'GET' });
    const res = await listSubmissions(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toContain('limit');
  });

  it('returns 400 VALIDATION_ERROR for negative limit', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=-10', { method: 'GET' });
    const res = await listSubmissions(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toContain('limit');
  });

  it('returns 400 VALIDATION_ERROR for zero limit', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=0', { method: 'GET' });
    const res = await listSubmissions(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('maps upstream bridge failures to 502 UPSTREAM_UNAVAILABLE instead of 400', async () => {
    // Simulate upstream Google Apps Script returning unsupported action or bridge failure
    vi.spyOn(canonicalSubmissionAdapter, 'listSubmissions').mockResolvedValueOnce({
      status: 'error',
      statusCode: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Upstream spreadsheet bridge does not support list action: Unsupported action: list',
    });

    const req = new NextRequest('http://localhost:3000/api/submissions?limit=100', { method: 'GET' });
    const res = await listSubmissions(req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.message).toContain('Upstream');
    // Ensure it NEVER returns empty array on failure
    expect(body.data).toBeUndefined();
    expect(body.items).toBeUndefined();
  });

  it('verifies privacy invariants: response headers include no-store and no secrets leaked', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=10', { method: 'GET' });
    const res = await listSubmissions(req);
    expect(res.status).toBe(200);

    const cacheHeader = res.headers.get('Cache-Control');
    expect(cacheHeader).toContain('no-store');

    const rawText = await res.text();
    expect(rawText).not.toContain('diagnosticToken');
    expect(rawText).not.toContain('script.google.com');
  });
});
