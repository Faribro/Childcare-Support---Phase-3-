import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import {
   GET as getSubmissionsRoute,
  dynamic as submissionsDynamic,
  fetchCache as submissionsFetchCache,
  revalidate as submissionsRevalidate,
} from '@/app/api/submissions/route';
import {
  GET as getSummaryRoute,
  dynamic as summaryDynamic,
  fetchCache as summaryFetchCache,
  revalidate as summaryRevalidate,
} from '@/app/api/submissions/summary/route';
import { DELETE as deleteSubmissionRoute } from '@/app/api/submissions/[submissionId]/route';
import { GET as getExportRoute } from '@/app/api/submissions/[submissionId]/export/route';
import { createSessionToken } from '@/lib/server/sessionService';

describe('Submissions Cache Bypass, Multi-State Field Read Scope, and Post-Sync Refresh', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Upstream Apps Script fetch() cache: no-store enforcement', () => {
    it('passes cache: "no-store" on listSubmissions, getSubmission, and deleteSubmission upstream fetch calls', async () => {
      process.env.E2E_STAGING_ENABLED = 'true';
      process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/test-deployment/exec';
      process.env.WEBHOOK_SECRET = 'test-secret-2026';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            status: 'success',
            data: [],
            total: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      await canonicalSubmissionAdapter.listSubmissions({ limit: 100 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][1]?.cache).toBe('no-store');

      await canonicalSubmissionAdapter.getSubmission('DL-SOU-071709-01', 'supervisor');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[1][1]?.cache).toBe('no-store');

      await canonicalSubmissionAdapter.deleteSubmission('DL-SOU-071709-01');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(fetchSpy.mock.calls[2][1]?.cache).toBe('no-store');
    });
  });

  describe('2. Route Segment Cache Directives and Error Cache-Control Headers', () => {
    it('exports force-dynamic, force-no-store, and revalidate = 0 on /api/submissions and /api/submissions/summary', () => {
      expect(submissionsDynamic).toBe('force-dynamic');
      expect(submissionsFetchCache).toBe('force-no-store');
      expect(submissionsRevalidate).toBe(0);

      expect(summaryDynamic).toBe('force-dynamic');
      expect(summaryFetchCache).toBe('force-no-store');
      expect(summaryRevalidate).toBe(0);
    });

    it('includes strict no-store Cache-Control header on /api/submissions/summary error responses', async () => {
      vi.spyOn(canonicalSubmissionAdapter, 'listSubmissions').mockResolvedValueOnce({
        status: 'error',
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized: Invalid webhook secret or missing credentials.',
      });

      const req = new NextRequest('http://localhost:3000/api/submissions/summary', {
        method: 'GET',
      });
      const res = await getSummaryRoute(req);
      expect(res.status).toBe(401);
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });
  });

  describe('3. Production Field Worker Multi-State Read Scope vs Strict Mutation/Export Guards', () => {
    it('returns Delhi and non-Maharashtra records for unauthenticated field workers in production while blocking DELETE and PDF export', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

      // 1. Unfiltered list in production returns all 5 seeded records (including Delhi, West Bengal, etc.)
      const listReq = new NextRequest('http://localhost:3000/api/submissions?limit=100', {
        method: 'GET',
      });
      const listRes = await getSubmissionsRoute(listReq);
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data.records.length).toBe(5);
      expect(listBody.data.total).toBe(5);

      // 2. Unfiltered summary in production returns serverConfirmed = 5
      const sumReq = new NextRequest('http://localhost:3000/api/submissions/summary', {
        method: 'GET',
      });
      const sumRes = await getSummaryRoute(sumReq);
      expect(sumRes.status).toBe(200);
      const sumBody = await sumRes.json();
      expect(sumBody.data.serverConfirmed).toBe(5);

      // 3. DELETE by unauthenticated field worker is still strictly rejected with 403 FORBIDDEN
      const deleteReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:3000' },
      });
      const deleteRes = await deleteSubmissionRoute(deleteReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });
      expect(deleteRes.status).toBe(403);

      // 4. PDF export by unauthenticated field worker in production is still strictly rejected with 401 UNAUTHORIZED
      const exportReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01/export', {
        method: 'GET',
      });
      const exportRes = await getExportRoute(exportReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });
      expect(exportRes.status).toBe(401);

      // 5. Scoped STATE_REVIEWER (Maharashtra) is still strictly blocked from querying Delhi
      const mhToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Maharashtra State Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });
      const scopedDelhiReq = new NextRequest('http://localhost:3000/api/submissions/summary?state=Delhi', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${mhToken}` },
      });
      const scopedDelhiRes = await getSummaryRoute(scopedDelhiReq);
      expect(scopedDelhiRes.status).toBe(403);
    });
  });

  describe('4. Client Fetch Cache Bypass and Sync Centre Server Refresh Wiring', () => {
    it('passes cache: "no-store" in FieldWorkspacePage (/app) and refreshes server records in SyncCentrePage (/assessment/sync)', () => {
      const appPagePath = path.resolve(process.cwd(), 'src/app/app/page.tsx');
      const appPageSource = fs.readFileSync(appPagePath, 'utf-8');
      expect(appPageSource).toContain("fetch('/api/submissions/summary'");
      expect(appPageSource).toMatch(/fetch\(['"]\/api\/submissions\/summary['"],\s*\{[\s\S]*?cache:\s*['"]no-store['"]/);
      expect(appPageSource).toMatch(/fetch\(['"]\/api\/submissions\?limit=1['"],\s*\{[\s\S]*?cache:\s*['"]no-store['"]/);

      const syncPagePath = path.resolve(process.cwd(), 'src/app/assessment/sync/page.tsx');
      const syncPageSource = fs.readFileSync(syncPagePath, 'utf-8');
      expect(syncPageSource).toContain('refreshServer()');
    });
  });
});
