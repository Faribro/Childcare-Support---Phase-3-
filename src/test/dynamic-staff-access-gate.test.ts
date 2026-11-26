/**
 * Dynamic Staff Access Gate — Unit & Integration Tests
 *
 * Tests:
 *  1. resolveStateByLgdNumericCode: valid, invalid, boundary
 *  2. getConfiguredAdminAccessCode: unset, collision, valid
 *  3. verifyLeaderGateCookieToken: round-trip, expired, tampered, missing
 *  4. verifyStaffAccessGateCode: state_team path, administration path, invalid, rate-limit
 *  5. POST /api/auth/staff-access/gate: HTTP surface
 *  6. GET /api/auth/leader/gate: requires cookie, returns contacts
 *  7. POST /api/admin/leader-access/sheet-bridge: list action, unconfigured admin code 503
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. resolveStateByLgdNumericCode
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveStateByLgdNumericCode', () => {
  it('returns entry for a valid 3-digit LGD code (027 = Maharashtra)', async () => {
    const { resolveStateByLgdNumericCode } = await import('@/lib/constants/stateCatalog');
    const entry = resolveStateByLgdNumericCode('027');
    expect(entry).not.toBeNull();
    expect(entry!.canonicalName).toMatch(/maharashtra/i);
    expect(entry!.lgdNumericCode).toBe('027');
  });

  it('returns entry for first valid code (001)', async () => {
    const { resolveStateByLgdNumericCode } = await import('@/lib/constants/stateCatalog');
    const entry = resolveStateByLgdNumericCode('001');
    expect(entry).not.toBeNull();
    expect(entry!.lgdNumericCode).toBe('001');
  });

  it('returns null for out-of-range code (999)', async () => {
    const { resolveStateByLgdNumericCode } = await import('@/lib/constants/stateCatalog');
    expect(resolveStateByLgdNumericCode('999')).toBeNull();
  });

  it('returns null for empty string', async () => {
    const { resolveStateByLgdNumericCode } = await import('@/lib/constants/stateCatalog');
    expect(resolveStateByLgdNumericCode('')).toBeNull();
  });

  it('returns null for null', async () => {
    const { resolveStateByLgdNumericCode } = await import('@/lib/constants/stateCatalog');
    expect(resolveStateByLgdNumericCode(null)).toBeNull();
  });

  it('returns null for a non-numeric string', async () => {
    const { resolveStateByLgdNumericCode } = await import('@/lib/constants/stateCatalog');
    expect(resolveStateByLgdNumericCode('ABC')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. getConfiguredAdminAccessCode
// ─────────────────────────────────────────────────────────────────────────────
describe('getConfiguredAdminAccessCode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null when ADMIN_PORTAL_ACCESS_CODE is unset', async () => {
    delete process.env.ADMIN_PORTAL_ACCESS_CODE;
    const { getConfiguredAdminAccessCode } = await import('@/lib/server/staffAccessGateService');
    expect(getConfiguredAdminAccessCode()).toBeNull();
  });

  it('returns null when ADMIN_PORTAL_ACCESS_CODE collides with LGD code (027)', async () => {
    process.env.ADMIN_PORTAL_ACCESS_CODE = '027';
    const { getConfiguredAdminAccessCode } = await import('@/lib/server/staffAccessGateService');
    expect(getConfiguredAdminAccessCode()).toBeNull();
  });

  it('returns null when ADMIN_PORTAL_ACCESS_CODE collides with LGD code (001)', async () => {
    process.env.ADMIN_PORTAL_ACCESS_CODE = '001';
    const { getConfiguredAdminAccessCode } = await import('@/lib/server/staffAccessGateService');
    expect(getConfiguredAdminAccessCode()).toBeNull();
  });

  it('returns the code when it is a valid non-colliding value', async () => {
    process.env.ADMIN_PORTAL_ACCESS_CODE = 'ADMIN-SECURE-9x';
    const { getConfiguredAdminAccessCode } = await import('@/lib/server/staffAccessGateService');
    expect(getConfiguredAdminAccessCode()).toBe('ADMIN-SECURE-9x');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. verifyLeaderGateCookieToken round-trip
// ─────────────────────────────────────────────────────────────────────────────
describe('verifyLeaderGateCookieToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, SESSION_SECRET: 'test-signing-secret-min-32-chars-long' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('round-trips: creates and immediately verifies a fresh token', async () => {
    const { createLeaderGateCookieToken, verifyLeaderGateCookieToken } =
      await import('@/lib/server/staffAccessGateService');
    const token = createLeaderGateCookieToken();
    expect(verifyLeaderGateCookieToken(token)).toBe(true);
  });

  it('rejects an expired token', async () => {
    const { createLeaderGateCookieToken, verifyLeaderGateCookieToken, ADMIN_GATE_TTL_MS } =
      await import('@/lib/server/staffAccessGateService');
    const pastNow = Date.now() - ADMIN_GATE_TTL_MS - 1000;
    const token = createLeaderGateCookieToken(pastNow);
    // verify at real now — token should have expired
    expect(verifyLeaderGateCookieToken(token, Date.now())).toBe(false);
  });

  it('rejects a tampered token (modified payload)', async () => {
    const { createLeaderGateCookieToken, verifyLeaderGateCookieToken } =
      await import('@/lib/server/staffAccessGateService');
    const token = createLeaderGateCookieToken();
    // Corrupt the first character of the payload portion
    const tampered = 'X' + token.slice(1);
    expect(verifyLeaderGateCookieToken(tampered)).toBe(false);
  });

  it('rejects undefined/null', async () => {
    const { verifyLeaderGateCookieToken } = await import('@/lib/server/staffAccessGateService');
    expect(verifyLeaderGateCookieToken(undefined)).toBe(false);
    expect(verifyLeaderGateCookieToken(null)).toBe(false);
    expect(verifyLeaderGateCookieToken('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. verifyStaffAccessGateCode
// ─────────────────────────────────────────────────────────────────────────────
describe('verifyStaffAccessGateCode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      SESSION_SECRET: 'test-signing-secret-min-32-chars-long',
      ADMIN_PORTAL_ACCESS_CODE: 'ADMIN-TEST-CODE-999',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('returns state_team for a valid LGD 3-digit code (027 = Maharashtra)', async () => {
    const { verifyStaffAccessGateCode } = await import('@/lib/server/staffAccessGateService');
    const result = await verifyStaffAccessGateCode({ rawCode: '027', clientIp: '127.0.0.1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe('state_team');
    }
    if (result.ok && result.mode === 'state_team') {
      expect(result.state).toMatch(/maharashtra/i);
      expect(result.lgdNumericCode).toBe('027');
    }
  });

  it('returns state_team for LGD code 001', async () => {
    const { verifyStaffAccessGateCode } = await import('@/lib/server/staffAccessGateService');
    const result = await verifyStaffAccessGateCode({ rawCode: '001', clientIp: '127.0.0.2' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe('state_team');
  });

  it('returns administration with gateToken and leaders for the matching admin code', async () => {
    const { verifyStaffAccessGateCode } = await import('@/lib/server/staffAccessGateService');
    const result = await verifyStaffAccessGateCode({ rawCode: 'ADMIN-TEST-CODE-999', clientIp: '127.0.0.3' });
    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'administration') {
      expect(result.mode).toBe('administration');
      expect(result.redirectUrl).toBe('/leadership/login?gate=1');
      expect(typeof result.gateToken).toBe('string');
      expect(result.gateToken.length).toBeGreaterThan(10);
      // leaders array may be empty in test env but should not contain 'title'
      expect(Array.isArray(result.leaders)).toBe(true);
      for (const leader of result.leaders) {
        expect(leader).toHaveProperty('id');
        expect(leader).toHaveProperty('name');
        expect(leader).toHaveProperty('email');
        expect(leader).not.toHaveProperty('title');
      }
    }
  });

  it('returns INVALID_ACCESS_CODE 401 for an unrecognized code', async () => {
    const { verifyStaffAccessGateCode } = await import('@/lib/server/staffAccessGateService');
    const result = await verifyStaffAccessGateCode({ rawCode: 'WRONG-CODE', clientIp: '127.0.0.4' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(401);
      expect(result.code).toBe('INVALID_ACCESS_CODE');
    }
  });

  it('returns CODE_REQUIRED 400 for empty input', async () => {
    const { verifyStaffAccessGateCode } = await import('@/lib/server/staffAccessGateService');
    const result = await verifyStaffAccessGateCode({ rawCode: '', clientIp: '127.0.0.5' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('CODE_REQUIRED');
    }
  });

  it('returns CODE_REQUIRED 400 for null input', async () => {
    const { verifyStaffAccessGateCode } = await import('@/lib/server/staffAccessGateService');
    const result = await verifyStaffAccessGateCode({ rawCode: null, clientIp: '127.0.0.6' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CODE_REQUIRED');
  });

  it('fails closed (INVALID_ACCESS_CODE) when ADMIN_PORTAL_ACCESS_CODE is unset and code is not an LGD code', async () => {
    process.env.ADMIN_PORTAL_ACCESS_CODE = '';
    const { verifyStaffAccessGateCode } = await import('@/lib/server/staffAccessGateService');
    const result = await verifyStaffAccessGateCode({ rawCode: 'SOME-CODE', clientIp: '127.0.0.7' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(401);
  });

  it('fails closed when ADMIN_PORTAL_ACCESS_CODE collides with an LGD code (027) and input is that code', async () => {
    process.env.ADMIN_PORTAL_ACCESS_CODE = '027'; // collision — getConfiguredAdminAccessCode returns null
    const { verifyStaffAccessGateCode } = await import('@/lib/server/staffAccessGateService');
    // '027' IS a valid LGD code, so it returns state_team (not administration)
    const result = await verifyStaffAccessGateCode({ rawCode: '027', clientIp: '127.0.0.8' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe('state_team');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /api/auth/staff-access/gate HTTP surface
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/staff-access/gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      SESSION_SECRET: 'test-signing-secret-min-32-chars-long',
      ADMIN_PORTAL_ACCESS_CODE: 'HTTP-ADMIN-CODE-X9',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  function makeGateRequest(body: unknown, origin = 'https://test.local'): Request {
    return new Request('https://test.local/api/auth/staff-access/gate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin,
      },
      body: JSON.stringify(body),
    });
  }

  it('returns { mode: "state_team" } for a valid LGD PIN', async () => {
    const { POST } = await import('@/app/api/auth/staff-access/gate/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(makeGateRequest({ code: '027' }));
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe('success');
    expect(json.mode).toBe('state_team');
    expect(json.data.state).toMatch(/maharashtra/i);
  });

  it('returns { mode: "administration" }, includes signed gateToken in JSON, and sets csc_admin_gate cookie for admin code', async () => {
    const { POST } = await import('@/app/api/auth/staff-access/gate/route');
    const { verifyLeaderGateCookieToken } = await import('@/lib/server/staffAccessGateService');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(makeGateRequest({ code: 'HTTP-ADMIN-CODE-X9' }));
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.mode).toBe('administration');
    expect(typeof json.gateToken).toBe('string');
    expect(json.data.gateToken).toBe(json.gateToken);
    expect(verifyLeaderGateCookieToken(json.gateToken)).toBe(true);
    expect(Array.isArray(json.data.leaders)).toBe(true);
    // Cookie should be set
    const cookieHeader = res.headers.get('set-cookie') || '';
    expect(cookieHeader).toContain('csc_admin_gate');
    expect(cookieHeader).toContain('HttpOnly');
    // Leaders must not contain title
    for (const l of json.data.leaders ?? []) {
      expect(l).not.toHaveProperty('title');
    }
  });

  it('returns 401 for an invalid code', async () => {
    const { POST } = await import('@/app/api/auth/staff-access/gate/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(makeGateRequest({ code: 'DEFINITELY-WRONG' }));
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe('INVALID_ACCESS_CODE');
  });

  it('returns 400 for missing code', async () => {
    const { POST } = await import('@/app/api/auth/staff-access/gate/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(makeGateRequest({ code: '' }));
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('CODE_REQUIRED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /api/auth/leader/gate
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/auth/leader/gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      SESSION_SECRET: 'test-signing-secret-min-32-chars-long',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('returns 401 without a gate cookie', async () => {
    const { GET } = await import('@/app/api/auth/leader/gate/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(new Request('https://test.local/api/auth/leader/gate'));
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe('AUTH_REQUIRED');
  });

  it('returns { leaders: [...] } array with { id, name, email } when valid gate cookie is present', async () => {
    const { createLeaderGateCookieToken, STAFF_ACCESS_GATE_COOKIE } =
      await import('@/lib/server/staffAccessGateService');
    const { GET } = await import('@/app/api/auth/leader/gate/route');
    const { NextRequest } = await import('next/server');

    const token = createLeaderGateCookieToken();
    const req = new NextRequest(new Request('https://test.local/api/auth/leader/gate', {
      headers: { Cookie: `${STAFF_ACCESS_GATE_COOKIE}=${token}` },
    }));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(Array.isArray(json.data.leaders)).toBe(true);
    // Contacts must not expose job title
    for (const leader of json.data.leaders) {
      expect(leader).toHaveProperty('id');
      expect(leader).toHaveProperty('name');
      expect(leader).toHaveProperty('email');
      expect(leader).not.toHaveProperty('title');
    }
  });

  it('returns 401 when gate cookie is expired', async () => {
    const { createLeaderGateCookieToken, STAFF_ACCESS_GATE_COOKIE, ADMIN_GATE_TTL_MS } =
      await import('@/lib/server/staffAccessGateService');
    const { GET } = await import('@/app/api/auth/leader/gate/route');
    const { NextRequest } = await import('next/server');

    // Create token signed at a past timestamp so it's already expired
    const expiredAt = Date.now() - ADMIN_GATE_TTL_MS - 5000;
    const token = createLeaderGateCookieToken(expiredAt);

    const req = new NextRequest(new Request('https://test.local/api/auth/leader/gate', {
      headers: { Cookie: `${STAFF_ACCESS_GATE_COOKIE}=${token}` },
    }));
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('succeeds via X-Admin-Gate header when NO cookies are sent (Firebase Hosting cookie-stripping fallback)', async () => {
    const { createLeaderGateCookieToken } =
      await import('@/lib/server/staffAccessGateService');
    const { GET } = await import('@/app/api/auth/leader/gate/route');
    const { NextRequest } = await import('next/server');

    const token = createLeaderGateCookieToken();
    const req = new NextRequest(new Request('https://test.local/api/auth/leader/gate', {
      headers: { 'X-Admin-Gate': token },
    }));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(Array.isArray(json.data.leaders)).toBe(true);
    for (const leader of json.data.leaders) {
      expect(leader).toHaveProperty('id');
      expect(leader).toHaveProperty('name');
      expect(leader).toHaveProperty('email');
      expect(leader).not.toHaveProperty('title');
    }
  });

  it('succeeds via valid X-Admin-Gate header even when an expired csc_admin_gate cookie is present', async () => {
    const { createLeaderGateCookieToken, STAFF_ACCESS_GATE_COOKIE, ADMIN_GATE_TTL_MS } =
      await import('@/lib/server/staffAccessGateService');
    const { GET } = await import('@/app/api/auth/leader/gate/route');
    const { NextRequest } = await import('next/server');

    const expiredToken = createLeaderGateCookieToken(Date.now() - ADMIN_GATE_TTL_MS - 5000);
    const validToken = createLeaderGateCookieToken();
    const req = new NextRequest(new Request('https://test.local/api/auth/leader/gate', {
      headers: {
        Cookie: `${STAFF_ACCESS_GATE_COOKIE}=${expiredToken}`,
        'X-Admin-Gate': validToken,
      },
    }));
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('rejects tampered or expired X-Admin-Gate header tokens with 401 when no cookies are sent', async () => {
    const { createLeaderGateCookieToken, ADMIN_GATE_TTL_MS } =
      await import('@/lib/server/staffAccessGateService');
    const { GET } = await import('@/app/api/auth/leader/gate/route');
    const { NextRequest } = await import('next/server');

    const freshToken = createLeaderGateCookieToken();
    const tamperedToken = 'X' + freshToken.slice(1);
    const tamperedReq = new NextRequest(new Request('https://test.local/api/auth/leader/gate', {
      headers: { 'X-Admin-Gate': tamperedToken },
    }));
    expect((await GET(tamperedReq)).status).toBe(401);

    const expiredToken = createLeaderGateCookieToken(Date.now() - ADMIN_GATE_TTL_MS - 5000);
    const expiredReq = new NextRequest(new Request('https://test.local/api/auth/leader/gate', {
      headers: { 'X-Admin-Gate': expiredToken },
    }));
    expect((await GET(expiredReq)).status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /api/admin/leader-access/sheet-bridge & Email PIN Content
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/admin/leader-access/sheet-bridge', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-signing-secret-min-32-chars-long',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('returns 503 BRIDGE_NOT_CONFIGURED when SHEET_INVITATION_BRIDGE_SECRET is unset', async () => {
    delete process.env.SHEET_INVITATION_BRIDGE_SECRET;
    const { POST } = await import('@/app/api/admin/leader-access/sheet-bridge/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(new Request('https://test.local/api/admin/leader-access/sheet-bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://test.local' },
      body: JSON.stringify({ action: 'list' }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('BRIDGE_NOT_CONFIGURED');
  });

  it('action=list returns allowlisted administrator contacts { id, name, email } without titles', async () => {
    process.env.SHEET_INVITATION_BRIDGE_SECRET = 'test-bridge-secret-value-min-32ch';
    const { resetLeaderIdentitiesForTesting } = await import('@/lib/server/leaderIdentityStore');
    const { setLeaderAuthStoreForTesting, MemoryLeaderAuthStore } = await import('@/lib/server/leaderAuthStore');
    const { setOnboardingStoreForTesting, MemoryOnboardingStore } = await import('@/lib/server/onboardingStore');
    setLeaderAuthStoreForTesting(new MemoryLeaderAuthStore());
    setOnboardingStoreForTesting(new MemoryOnboardingStore());
    resetLeaderIdentitiesForTesting();

    const { POST } = await import('@/app/api/admin/leader-access/sheet-bridge/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(new Request('https://test.local/api/admin/leader-access/sheet-bridge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://test.local',
        'x-invitation-bridge-secret': 'test-bridge-secret-value-min-32ch',
      },
      body: JSON.stringify({ actorEmail: 'rajiv.menon@example.org', action: 'list' }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.administrators.length).toBeGreaterThanOrEqual(2);
    for (const contact of json.administrators) {
      expect(contact).toHaveProperty('id');
      expect(contact).toHaveProperty('name');
      expect(contact).toHaveProperty('email');
      expect(contact).not.toHaveProperty('title');
    }
  });

  it('returns 503 ADMIN_GATE_NOT_CONFIGURED when ADMIN_PORTAL_ACCESS_CODE is unset and action=send is attempted', async () => {
    process.env.SHEET_INVITATION_BRIDGE_SECRET = 'test-bridge-secret-value-min-32ch';
    process.env.ADMIN_PORTAL_ACCESS_CODE = '';
    const { resetLeaderIdentitiesForTesting } = await import('@/lib/server/leaderIdentityStore');
    const { setLeaderAuthStoreForTesting, MemoryLeaderAuthStore } = await import('@/lib/server/leaderAuthStore');
    const { setOnboardingStoreForTesting, MemoryOnboardingStore } = await import('@/lib/server/onboardingStore');
    setLeaderAuthStoreForTesting(new MemoryLeaderAuthStore());
    setOnboardingStoreForTesting(new MemoryOnboardingStore());
    resetLeaderIdentitiesForTesting();

    const { POST } = await import('@/app/api/admin/leader-access/sheet-bridge/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(new Request('https://test.local/api/admin/leader-access/sheet-bridge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://test.local',
        'x-invitation-bridge-secret': 'test-bridge-secret-value-min-32ch',
      },
      body: JSON.stringify({
        actorEmail: 'rajiv.menon@example.org',
        action: 'send',
        targetEmail: 'ananya.roy@example.org',
        targetId: 'lead-ananya-roy',
      }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('ADMIN_GATE_NOT_CONFIGURED');
  });

  it('action=send dispatches ADMIN_PORTAL_ACCESS_CODE email strictly to target administrator and never leaks code in JSON', async () => {
    process.env.SHEET_INVITATION_BRIDGE_SECRET = 'test-bridge-secret-value-min-32ch';
    process.env.ADMIN_PORTAL_ACCESS_CODE = 'ADMIN-SECRET-GATE-2026';
    const { resetLeaderIdentitiesForTesting } = await import('@/lib/server/leaderIdentityStore');
    const { setLeaderAuthStoreForTesting, MemoryLeaderAuthStore } = await import('@/lib/server/leaderAuthStore');
    const { setOnboardingStoreForTesting, MemoryOnboardingStore } = await import('@/lib/server/onboardingStore');
    const { MockEmailStore } = await import('@/lib/server/emailProvider');
    MockEmailStore.clear();
    setLeaderAuthStoreForTesting(new MemoryLeaderAuthStore());
    setOnboardingStoreForTesting(new MemoryOnboardingStore());
    resetLeaderIdentitiesForTesting();

    const { POST } = await import('@/app/api/admin/leader-access/sheet-bridge/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(new Request('https://test.local/api/admin/leader-access/sheet-bridge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://test.local',
        'x-invitation-bridge-secret': 'test-bridge-secret-value-min-32ch',
      },
      body: JSON.stringify({
        actorEmail: 'rajiv.menon@example.org',
        action: 'send',
        targetEmail: 'ananya.roy@example.org',
        targetId: 'lead-ananya-roy',
      }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.deliveredTo).toBe('ananya.roy@example.org');
    expect(JSON.stringify(json)).not.toContain('ADMIN-SECRET-GATE-2026');

    const sentMail = MockEmailStore.getLastFor('ananya.roy@example.org');
    expect(sentMail).toBeDefined();
    expect(sentMail!.html).toContain('ADMIN-SECRET-GATE-2026');
    expect(sentMail!.text).toContain('ADMIN-SECRET-GATE-2026');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. State Gate PIN in Welcome/Approval & Invitation Emails
// ─────────────────────────────────────────────────────────────────────────────
describe('State Gate PIN in Approval & Invitation Emails', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-signing-secret-min-32-chars-long',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('sendCoordinatorApprovalNotificationEmail includes the all-time 3-digit State PIN (027 for Maharashtra)', async () => {
    const { sendCoordinatorApprovalNotificationEmail, MockEmailStore } = await import('@/lib/server/emailProvider');
    MockEmailStore.clear();

    const res = await sendCoordinatorApprovalNotificationEmail({
      coordinatorEmail: 'coord.mh@example.org',
      coordinatorName: 'Meera Joshi',
      state: 'Maharashtra',
      portalUrl: 'https://staging.example.org/app',
    });

    expect(res.success).toBe(true);
    const sent = MockEmailStore.getLastFor('coord.mh@example.org');
    expect(sent).toBeDefined();
    expect(sent!.html).toContain('027');
    expect(sent!.text).toContain('027');
    expect(sent!.html).toContain('Maharashtra');
  });

  it('sendStateTeamAccessInvitationEmail includes both 3-digit State PIN and single-use invitation code', async () => {
    const { sendStateTeamAccessInvitationEmail, MockEmailStore } = await import('@/lib/server/emailProvider');
    MockEmailStore.clear();

    const res = await sendStateTeamAccessInvitationEmail({
      to: 'new.coord@example.org',
      recipientName: 'Kiran Patel',
      assignedState: 'Gujarat',
      plainCode: 'ALN-GJ-9A8B-7C6D',
      issuedBy: 'rajiv.menon@example.org',
      expiresAtIso: '2026-12-03T12:00:00.000Z',
      portalUrl: 'https://staging.example.org/app',
    });

    expect(res.success).toBe(true);
    const sent = MockEmailStore.getLastFor('new.coord@example.org');
    expect(sent).toBeDefined();
    expect(sent!.html).toContain('024');
    expect(sent!.text).toContain('024');
    expect(sent!.html).toContain('ALN-GJ-9A8B-7C6D');
    expect(sent!.text).toContain('ALN-GJ-9A8B-7C6D');
  });

  it('verifyStateTeamOtp dispatches welcome approval email containing 3-digit State PIN after invite redemption', async () => {
    const { MemoryOnboardingStore, setOnboardingStoreForTesting } = await import('@/lib/server/onboardingStore');
    const { requestStateTeamOtp, verifyStateTeamOtp } = await import('@/lib/server/stateTeamAuthChallenge');
    const { generatePlaintextInvitationCode, createInvitationVerifierPair } = await import('@/lib/server/invitationCrypto');
    const { MockEmailStore } = await import('@/lib/server/emailProvider');

    MockEmailStore.clear();
    const memStore = new MemoryOnboardingStore();
    setOnboardingStoreForTesting(memStore);

    const inviteCode = generatePlaintextInvitationCode('Maharashtra');
    const { salt, verifier } = createInvitationVerifierPair(inviteCode);
    await memStore.createStateTeamAccessInvitation({
      invitedEmail: 'invite.redeem@example.org',
      assignedState: 'Maharashtra',
      codeSalt: salt,
      codeVerifier: verifier,
      issuedBy: 'rajiv.menon@example.org',
      expiresAt: Date.now() + 86400000,
    });

    await requestStateTeamOtp({
      firstName: 'Anita',
      lastName: 'Rao',
      workEmail: 'invite.redeem@example.org',
      requestedState: 'Maharashtra',
      organization: 'Alliance Partner',
      invitationCode: inviteCode,
    });

    const otpMail = MockEmailStore.getLastFor('invite.redeem@example.org')!;
    MockEmailStore.clear();

    const verifyRes = await verifyStateTeamOtp({
      workEmail: 'invite.redeem@example.org',
      code: otpMail.otp!,
    });

    expect(verifyRes.success).toBe(true);
    expect(verifyRes.status).toBe('APPROVED');

    const welcomeMail = MockEmailStore.getLastFor('invite.redeem@example.org');
    expect(welcomeMail).toBeDefined();
    expect(welcomeMail!.subject).toContain('Approved');
    expect(welcomeMail!.html).toContain('027');
    expect(welcomeMail!.text).toContain('027');
  });
});
