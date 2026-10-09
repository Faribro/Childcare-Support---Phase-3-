import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSummary } from '@/app/api/submissions/summary/route';
import { GET as getSubmissions } from '@/app/api/submissions/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { createSessionToken } from '@/lib/server/sessionService';

describe('Issue #50: Unified Submissions Summary Endpoint & Count Reconciliation', () => {
  beforeEach(() => {
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
  });

  it('GET /api/submissions/summary returns authoritative server count matching seeded store total', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions/summary', {
      method: 'GET',
    });

    const res = await getSummary(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data).toBeDefined();
    expect(body.data.serverConfirmed).toBe(5);
    expect(body.data.total).toBe(5);
    expect(body.data.source).toBe('server');
    expect(body.pagination.totalCount).toBe(5);
  });

  it('filters summary count accurately by state', async () => {
    const mhReq = new NextRequest('http://localhost:3000/api/submissions/summary?state=Maharashtra', {
      method: 'GET',
    });

    const mhRes = await getSummary(mhReq);
    expect(mhRes.status).toBe(200);
    const mhBody = await mhRes.json();
    expect(mhBody.data.serverConfirmed).toBe(1);

    const wbReq = new NextRequest('http://localhost:3000/api/submissions/summary?state=West%20Bengal', {
      method: 'GET',
    });

    const wbRes = await getSummary(wbReq);
    expect(wbRes.status).toBe(200);
    const wbBody = await wbRes.json();
    expect(wbBody.data.serverConfirmed).toBe(1);
  });

  it('strictly rejects unauthorized state queries when session has restricted scope', async () => {
    const restrictedToken = createSessionToken({
      userId: 'rev-mh-01',
      name: 'MH Reviewer',
      role: 'STATE_REVIEWER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
    });

    const unauthorizedReq = new NextRequest('http://localhost:3000/api/submissions/summary?state=Delhi', {
      method: 'GET',
      headers: {
        Cookie: `session_token=${restrictedToken}`,
      },
    });

    const res = await getSummary(unauthorizedReq);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN_SCOPE');
  });

  it('unifies counts between summary endpoint and /api/submissions list endpoint for matching filters', async () => {
    // 1. Unfiltered count agreement
    const summaryReq = new NextRequest('http://localhost:3000/api/submissions/summary', { method: 'GET' });
    const listReq = new NextRequest('http://localhost:3000/api/submissions?limit=1', { method: 'GET' });

    const summaryRes = await getSummary(summaryReq);
    const listRes = await getSubmissions(listReq);

    const summaryJson = await summaryRes.json();
    const listJson = await listRes.json();

    const summaryTotal = summaryJson.data.serverConfirmed;
    const listTotal = listJson.data.total;

    expect(summaryTotal).toBe(5);
    expect(listTotal).toBe(5);
    expect(summaryTotal).toBe(listTotal);

    // 2. State-filtered count agreement (Maharashtra)
    const mhSummaryReq = new NextRequest('http://localhost:3000/api/submissions/summary?state=Maharashtra', { method: 'GET' });
    const mhListReq = new NextRequest('http://localhost:3000/api/submissions?state=Maharashtra&limit=1', { method: 'GET' });

    const mhSummaryRes = await getSummary(mhSummaryReq);
    const mhListRes = await getSubmissions(mhListReq);

    const mhSummaryJson = await mhSummaryRes.json();
    const mhListJson = await mhListRes.json();

    expect(mhSummaryJson.data.serverConfirmed).toBe(1);
    expect(mhListJson.data.total).toBe(1);
    expect(mhSummaryJson.data.serverConfirmed).toBe(mhListJson.data.total);
  });
});
