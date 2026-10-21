import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSubmissionsRoute } from '@/app/api/submissions/route';
import { GET as getSingleSubmissionRoute } from '@/app/api/submissions/[submissionId]/route';
import { isSyntheticDemoModeAllowed } from '@/lib/server/authorisation';

describe('Production Authentication Guard Verification', () => {
  it('strictly rejects anonymous access with 401 when NODE_ENV=production even if E2E_ALLOW_LOCAL_MOCK=true', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

    const req = new NextRequest('http://localhost:3000/api/submissions', {
      method: 'GET',
    });

    expect(isSyntheticDemoModeAllowed(req)).toBe(false);

    const res = await getSubmissionsRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('strictly rejects test-actor header bypass with 401 when NODE_ENV=production', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

    const req = new NextRequest('http://localhost:3000/api/submissions', {
      method: 'GET',
      headers: {
        'x-test-actor': 'true',
        'x-user-role': 'supervisor',
      },
    });

    const res = await getSubmissionsRoute(req);
    expect(res.status).toBe(401);
  });

  it('strictly rejects unverified mock JSON session cookie with 401 when NODE_ENV=production', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

    const mockCookie = JSON.stringify({ role: 'supervisor', isVerified: true });
    const req = new NextRequest('http://localhost:3000/api/submissions', {
      method: 'GET',
      headers: {
        Cookie: `evaluation_session_token=${mockCookie}`,
      },
    });

    const res = await getSubmissionsRoute(req);
    expect(res.status).toBe(401);
  });

  it('strictly rejects single submission GET with 401 when unauthenticated under production', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    process.env.E2E_ALLOW_LOCAL_MOCK = 'true';

    const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
      method: 'GET',
    });

    const res = await getSingleSubmissionRoute(req, { params: { submissionId: 'MH-PUN-081200-02' } });
    expect(res.status).toBe(401);
  });
});
