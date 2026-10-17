import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
import {
  GET as getSingleSubmissionRoute,
  DELETE as deleteSubmissionRoute,
} from '@/app/api/submissions/[submissionId]/route';
import { GET as getExportRoute } from '@/app/api/submissions/[submissionId]/export/route';
import { POST as postAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';
import { GET as getSessionRoute } from '@/app/api/auth/session/route';
import { createSessionToken } from '@/lib/server/sessionService';
import { resolveUserAccessScope } from '@/lib/server/authorisation';
import { supervisorReadModel } from '@/lib/read-model/supervisorReadModel';

describe('PR #74 Security Review & Correction Gate — Scope, Auth, Cache Isolation, and Upstream Secret Verification', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = `syn-session-secret-${crypto.randomBytes(16).toString('hex')}`;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Unauthenticated List, Summary, Detail, and Session Envelope Policy', () => {
    it('returns non-sensitive unauthenticated envelope with allowedStates: [] on /api/auth/session', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const req = new NextRequest('http://localhost:3000/api/auth/session', {
        method: 'GET',
      });
      const res = await getSessionRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
      expect(body.data.isVerified).toBe(false);
      expect(body.data.userId).toBe('anonymous-field');
      expect(body.data.allowedStates).toEqual([]);
      expect(body.data.allowedDistricts).toEqual([]);
    });

    it('rejects unauthenticated list, summary, and detail requests in live/production mode with 401 UNAUTHORIZED and never returns live rows', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.E2E_ALLOW_LOCAL_MOCK;

      const listSpy = vi.spyOn(canonicalSubmissionAdapter, 'listSubmissions');
      const getSpy = vi.spyOn(canonicalSubmissionAdapter, 'getSubmission');

      // 1. Unauthenticated GET /api/submissions
      const listReq = new NextRequest('http://localhost:3000/api/submissions?limit=100', {
        method: 'GET',
      });
      const listRes = await getSubmissionsRoute(listReq);
      expect(listRes.status).toBe(401);
      expect(listRes.headers.get('Cache-Control')).toContain('no-store');
      expect(listRes.headers.get('Vary')).toContain('Cookie');
      const listBody = await listRes.json();
      expect(listBody.code).toBe('UNAUTHORIZED');
      expect(listBody.data).toBeUndefined();

      // 2. Unauthenticated GET /api/submissions?clientSubmissionId=...
      const reconReq = new NextRequest('http://localhost:3000/api/submissions?clientSubmissionId=MH-PUN-081200-02', {
        method: 'GET',
      });
      const reconRes = await getSubmissionsRoute(reconReq);
      expect(reconRes.status).toBe(401);

      // 3. Unauthenticated GET /api/submissions/summary
      const sumReq = new NextRequest('http://localhost:3000/api/submissions/summary', {
        method: 'GET',
      });
      const sumRes = await getSummaryRoute(sumReq);
      expect(sumRes.status).toBe(401);
      expect(sumRes.headers.get('Cache-Control')).toContain('no-store');
      const sumBody = await sumRes.json();
      expect(sumBody.code).toBe('UNAUTHORIZED');
      expect(sumBody.data).toBeUndefined();

      // 4. Unauthenticated GET /api/submissions/[submissionId]
      const detailReq = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'GET',
      });
      const detailRes = await getSingleSubmissionRoute(detailReq, {
        params: { submissionId: 'MH-PUN-081200-02' },
      });
      expect(detailRes.status).toBe(401);
      expect(detailRes.headers.get('Cache-Control')).toContain('no-store');

      // Canonical adapter must never be invoked for unauthenticated live requests
      expect(listSpy).not.toHaveBeenCalled();
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('strictly ignores client-supplied x-test-*, x-user-role, and unsigned JSON cookies in production', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.E2E_ALLOW_LOCAL_MOCK;

      const req = new NextRequest('http://localhost:3000/api/submissions?state=Delhi', {
        method: 'GET',
        headers: {
          'x-test-actor': 'true',
          'x-test-scope-state': 'Delhi',
          'x-user-role': 'supervisor',
          Cookie: 'session_token={"role":"supervisor"}',
        },
      });

      const scope = await resolveUserAccessScope(req);
      expect(scope.isVerified).toBe(false);
      expect(scope.allowedStates).toEqual([]);

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(401);
    });
  });

  describe('2. Authenticated FIELD_USER State & District Scope Enforcement', () => {
    it('restricts authenticated FIELD_USER (Maharashtra/Pune) to Pune records only, enforces scope in upstream Apps Script query, and blocks other states/districts with 403', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

      const fieldToken = createSessionToken({
        userId: 'field-mh-01',
        name: 'Maharashtra Field Caseworker (Pune)',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      });

      const listSpy = vi.spyOn(canonicalSubmissionAdapter, 'listSubmissions');

      // 1. Authorized query within assigned state & district succeeds and passes state+district to adapter
      const validListReq = new NextRequest('http://localhost:3000/api/submissions?limit=50', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${fieldToken}` },
      });
      const validListRes = await getSubmissionsRoute(validListReq);
      expect(validListRes.status).toBe(200);
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'Maharashtra',
          district: 'Pune',
        })
      );
      const validListBody = await validListRes.json();
      expect(validListBody.data.records.length).toBeGreaterThan(0);
      for (const rec of validListBody.data.records) {
        expect(rec.state).toBe('Maharashtra');
        expect(rec.district).toBe('Pune');
      }

      // 2. FIELD_USER attempting to read another state (Delhi) is rejected with 403 FORBIDDEN_SCOPE
      const delhiListReq = new NextRequest('http://localhost:3000/api/submissions?state=Delhi', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${fieldToken}` },
      });
      const delhiListRes = await getSubmissionsRoute(delhiListReq);
      expect(delhiListRes.status).toBe(403);
      const delhiBody = await delhiListRes.json();
      expect(delhiBody.code).toBe('FORBIDDEN_SCOPE');

      // 3. FIELD_USER attempting to read another district (Mumbai) in the same state is rejected with 403 FORBIDDEN_SCOPE
      const mumbaiListReq = new NextRequest('http://localhost:3000/api/submissions?state=Maharashtra&district=Mumbai', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${fieldToken}` },
      });
      const mumbaiListRes = await getSubmissionsRoute(mumbaiListReq);
      expect(mumbaiListRes.status).toBe(403);

      // 4. FIELD_USER attempting to read detail record from another state/district (DL-CEN-081200-03) is rejected with 403 FORBIDDEN_SCOPE
      const outOfScopeDetailReq = new NextRequest('http://localhost:3000/api/submissions/DL-CEN-081200-03', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${fieldToken}` },
      });
      const outOfScopeDetailRes = await getSingleSubmissionRoute(outOfScopeDetailReq, {
        params: { submissionId: 'DL-CEN-081200-03' },
      });
      expect(outOfScopeDetailRes.status).toBe(403);
    });
  });

  describe('3. Authenticated STATE_REVIEWER State Tampering Prevention & LEADERSHIP Cross-State Access', () => {
    it('prevents authenticated STATE_REVIEWER from tampering with state filter (?state=Delhi or ?state=ALL)', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

      const mhToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Maharashtra State Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      // 1. Tampering with ?state=Delhi on /api/submissions -> 403 FORBIDDEN_SCOPE
      const delhiListReq = new NextRequest('http://localhost:3000/api/submissions?state=Delhi', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${mhToken}` },
      });
      expect((await getSubmissionsRoute(delhiListReq)).status).toBe(403);

      // 2. Tampering with ?state=ALL on /api/submissions -> 403 FORBIDDEN_SCOPE
      const allStatesReq = new NextRequest('http://localhost:3000/api/submissions?state=ALL', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${mhToken}` },
      });
      expect((await getSubmissionsRoute(allStatesReq)).status).toBe(403);

      // 3. Tampering with ?state=Delhi on /api/submissions/summary -> 403 FORBIDDEN_SCOPE
      const delhiSumReq = new NextRequest('http://localhost:3000/api/submissions/summary?state=Delhi', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${mhToken}` },
      });
      expect((await getSummaryRoute(delhiSumReq)).status).toBe(403);

      // 4. Valid Maharashtra query succeeds and returns only the Maharashtra record (1)
      const mhSumReq = new NextRequest('http://localhost:3000/api/submissions/summary?state=Maharashtra', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${mhToken}` },
      });
      const mhSumRes = await getSummaryRoute(mhSumReq);
      expect(mhSumRes.status).toBe(200);
      const mhSumBody = await mhSumRes.json();
      expect(mhSumBody.data.serverConfirmed).toBe(1);
    });

    it('grants cross-state aggregate and list access to verified LEADERSHIP session token only', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

      const leadershipToken = createSessionToken({
        userId: 'lead-01',
        name: 'Alliance National Leadership',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const listReq = new NextRequest('http://localhost:3000/api/submissions?state=ALL&limit=100', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${leadershipToken}` },
      });
      const listRes = await getSubmissionsRoute(listReq);
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data.records.length).toBe(5);
      expect(listBody.data.total).toBe(5);

      const sumReq = new NextRequest('http://localhost:3000/api/submissions/summary?state=ALL', {
        method: 'GET',
        headers: { Cookie: `evaluation_session_token=${leadershipToken}` },
      });
      const sumRes = await getSummaryRoute(sumReq);
      expect(sumRes.status).toBe(200);
      const sumBody = await sumRes.json();
      expect(sumBody.data.serverConfirmed).toBe(5);
    });
  });

  describe('4. Anonymous Denial on Delete, PDF Export, and Asset Endpoints (Including Demo Mode)', () => {
    it('denies DELETE, PDF export, and asset upload for anonymous callers even when E2E_ALLOW_LOCAL_MOCK is enabled', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

      // 1. DELETE /api/submissions/[id] -> 403 FORBIDDEN
      const deleteReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:3000' },
      });
      const deleteRes = await deleteSubmissionRoute(deleteReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });
      expect(deleteRes.status).toBe(403);

      // 2. GET /api/submissions/[id]/export -> 401 UNAUTHORIZED
      const exportReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01/export', {
        method: 'GET',
      });
      const exportRes = await getExportRoute(exportReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });
      expect(exportRes.status).toBe(401);

      // 3. POST /api/submissions/[id]/asset -> 401 UNAUTHORIZED
      const assetReq = new NextRequest('http://localhost:3000/api/submissions/WB-KOL-081200-01/asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: 'rationCard',
          fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          expectedVersion: 1,
          expectedCurrentCellStateHash: 'a'.repeat(64),
        }),
      });
      const assetRes = await postAssetRoute(assetReq, {
        params: { submissionId: 'WB-KOL-081200-01' },
      });
      expect(assetRes.status).toBe(401);
    });
  });

  describe('5. Cross-Scope Cache Isolation on Refresh', () => {
    it('purges supervisorReadModel in-memory and localStorage cache when refresh receives 401 or 403 so records never leak across users/scopes', async () => {
      supervisorReadModel.resetForTesting();

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // First fetch: authorized scope returns 1 Maharashtra record
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'success',
            data: {
              records: [
                {
                  id: 'MH-PUN-081200-02',
                  uniqueId: 'MH-PUN-081200-02',
                  childName: 'Rohan Patil',
                  state: 'Maharashtra',
                  district: 'Pune',
                },
              ],
              total: 1,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      await supervisorReadModel.fetchSubmissions({ force: true });
      expect(supervisorReadModel.getState().records.length).toBe(1);
      expect(supervisorReadModel.getState().records[0].id).toBe('MH-PUN-081200-02');

      // Second fetch: session expires or scope changes -> server returns 401 UNAUTHORIZED
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'error',
            code: 'UNAUTHORIZED',
            message: 'Authentication required to read beneficiary submissions.',
            retryable: false,
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      );

      await supervisorReadModel.fetchSubmissions({ force: true });
      const afterLogoutState = supervisorReadModel.getState();
      expect(['error', 'unauthorized']).toContain(afterLogoutState.status);
      expect(afterLogoutState.records).toEqual([]);
      expect(afterLogoutState.total).toBe(0);
    });
  });

  describe('6. Upstream Apps Script Secret Rejection, Stale-Cache Recovery, and Route Cache Directives', () => {
    it('exports force-dynamic, force-no-store, and revalidate = 0 on /api/submissions and /api/submissions/summary', () => {
      expect(submissionsDynamic).toBe('force-dynamic');
      expect(submissionsFetchCache).toBe('force-no-store');
      expect(submissionsRevalidate).toBe(0);

      expect(summaryDynamic).toBe('force-dynamic');
      expect(summaryFetchCache).toBe('force-no-store');
      expect(summaryRevalidate).toBe(0);
    });

    it('propagates 401 UNAUTHORIZED when Apps Script rejects an invalid webhook secret and recovers with fresh data on subsequent no-store request using synthetic fixtures', async () => {
      process.env.E2E_STAGING_ENABLED = 'true';
      process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/synthetic-test-deployment/exec';
      process.env.WEBHOOK_SECRET = `syn-webhook-${crypto.randomBytes(16).toString('hex')}`;

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // 1. Simulate Apps Script rejecting an invalid/rotated webhook secret with 401 UNAUTHORIZED
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'error',
            code: 'UNAUTHORIZED',
            statusCode: 401,
            message: 'Unauthorized: Invalid webhook secret or missing credentials.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const rejected = await canonicalSubmissionAdapter.listSubmissions({ limit: 50, state: 'Delhi' });
      expect(rejected.status).toBe('error');
      expect(rejected.statusCode).toBe(401);
      expect(rejected.code).toBe('UNAUTHORIZED');
      expect(fetchSpy.mock.calls[0][1]?.cache).toBe('no-store');

      // 2. Simulate recovery after valid secret is supplied: fresh synthetic Delhi record returned without stale cache
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'success',
            data: [
              {
                '1\nUnique ID': 'DL-SOU-099999-01',
                '2\nRevision Number': 1,
                '9\nChild Name': 'Synthetic Beneficiary',
                '18\nState': 'Delhi',
                '19\nDistrict': 'South Delhi',
              },
            ],
            total: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const recovered = await canonicalSubmissionAdapter.listSubmissions({ limit: 50, state: 'Delhi' });
      expect(recovered.status).toBe('success');
      expect(recovered.data?.records.length).toBe(1);
      expect(recovered.data?.records[0].uniqueId).toBe('DL-SOU-099999-01');
      expect(fetchSpy.mock.calls[1][1]?.cache).toBe('no-store');
    });

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
