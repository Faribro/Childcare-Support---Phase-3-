import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

import {
  findLeaderByEmail,
  findLeaderById,
  isLeaderActive,
  resetLeaderIdentitiesForTesting,
  setLeaderActiveStatusForTesting,
  bumpLeaderAuthVersionForTesting,
} from '@/lib/server/leaderIdentityStore';
import {
  MockEmailStore,
} from '@/lib/server/emailProvider';
import {
  requestLeadershipAuthCode,
  verifyLeadershipAuthCode,
  resetLeaderChallengesForTesting,
  CHALLENGE_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
} from '@/lib/server/leaderAuthChallenge';
import {
  createLeaderSession,
  validateLeaderSession,
  revokeLeaderSession,
  resetLeaderSessionsForTesting,
  LEADER_COOKIE_NAME,
  LEADER_IDLE_TIMEOUT_MS,
  LEADER_ABSOLUTE_LIFETIME_MS,
} from '@/lib/server/leaderSessionStore';
import {
  resolveUserAccessScope,
  resolveServerVerifiedRole,
  isStateAuthorized,
} from '@/lib/server/authorisation';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

import { POST as requestCodeRoute } from '@/app/api/auth/leader/request-code/route';
import { POST as verifyCodeRoute } from '@/app/api/auth/leader/verify-code/route';
import { GET as sessionRoute } from '@/app/api/auth/leader/session/route';
import { POST as logoutRoute } from '@/app/api/auth/leader/logout/route';
import { GET as getSubmissionsRoute } from '@/app/api/submissions/route';
import { DELETE as deleteSubmissionRoute } from '@/app/api/submissions/[submissionId]/route';
import { POST as postAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';

describe('PR B: Individual Allowlisted Leadership Email Authentication', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'true';
    process.env.SESSION_SECRET = 'synthetic-session-secret-for-leadership-tests';
    MockEmailStore.clear();
    resetLeaderIdentitiesForTesting();
    resetLeaderChallengesForTesting();
    resetLeaderSessionsForTesting();
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    MockEmailStore.clear();
    resetLeaderIdentitiesForTesting();
    resetLeaderChallengesForTesting();
    resetLeaderSessionsForTesting();
  });

  describe('1. Feature Flag Gating', () => {
    it('returns 403 FEATURE_DISABLED on request-code when flag is disabled', async () => {
      process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'false';

      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ananya.roy@allianceindia.org' }),
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FEATURE_DISABLED');
      expect(MockEmailStore.getAll()).toHaveLength(0);
    });

    it('returns 403 FEATURE_DISABLED on verify-code when flag is disabled', async () => {
      process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'false';

      const req = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ananya.roy@allianceindia.org',
          code: 'a'.repeat(32),
        }),
      });

      const res = await verifyCodeRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FEATURE_DISABLED');
    });
  });

  describe('2. Request Code Endpoint & Anti-Enumeration', () => {
    it('rejects invalid or missing email with 400 INVALID_INPUT', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('REQUEST_FAILED');
    });

    it('returns 200 and dispatches 128-bit hex OTP email for allowlisted active leader', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-agent': 'TestBrowser/1.0',
        },
        body: JSON.stringify({ email: 'ANANYA.ROY@allianceindia.org' }), // Case-insensitive
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
      expect(body.message).toContain('verification code has been dispatched');

      const emails = MockEmailStore.getAll();
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toBe('ananya.roy@allianceindia.org');
      expect(emails[0].subject).toContain('Leadership Sign-In Code');

      // Verify code in email is 32-character hexadecimal (128-bit)
      const codeMatch = emails[0].text.match(/[0-9a-f]{32}/i);
      expect(codeMatch).not.toBeNull();
      expect(codeMatch![0]).toHaveLength(32);
    });

    it('returns identical 200 generic message without dispatching email for unknown email (anti-enumeration)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'unknown.outsider@external.com' }),
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
      expect(body.message).toContain('verification code has been dispatched');

      // ZERO emails dispatched for non-allowlisted email
      expect(MockEmailStore.getAll()).toHaveLength(0);
    });

    it('returns identical 200 generic message without dispatching email for deactivated leader', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fatima.sheikh@allianceindia.org' }), // Deactivated in store
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');

      // ZERO emails dispatched for deactivated leader
      expect(MockEmailStore.getAll()).toHaveLength(0);
    });

    it('enforces rate limits (3 requests per 15 minutes, 4th returns 429)', async () => {
      const email = 'rajiv.menon@allianceindia.org';

      for (let i = 0; i < 3; i++) {
        const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const res = await requestCodeRoute(req);
        expect(res.status).toBe(200);
      }

      // 4th request within 15 minutes must be rate-limited
      const req4 = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const res4 = await requestCodeRoute(req4);
      expect(res4.status).toBe(429);
      const body4 = await res4.json();
      expect(body4.code).toBe('RATE_LIMITED');
      expect(body4.message).toContain('15 minutes');
    });

    it('supersedes previous challenge when a new code is requested', async () => {
      const email = 'priya.sharma@allianceindia.org';
      const ua = 'TestBrowser/1.0';

      // 1st request
      await requestLeadershipAuthCode({ email, userAgent: ua });
      const firstEmail = MockEmailStore.getLastFor(email);
      const firstCode = firstEmail!.text.match(/[0-9a-f]{32}/i)![0];

      // 2nd request
      await requestLeadershipAuthCode({ email, userAgent: ua });
      const secondEmail = MockEmailStore.getLastFor(email);
      const secondCode = secondEmail!.text.match(/[0-9a-f]{32}/i)![0];

      expect(firstCode).not.toBe(secondCode);

      // Attempting to verify 1st code MUST fail
      const firstVerify = verifyLeadershipAuthCode({ email, code: firstCode, userAgent: ua });
      expect(firstVerify.success).toBe(false);

      // 2nd code MUST succeed
      const secondVerify = verifyLeadershipAuthCode({ email, code: secondCode, userAgent: ua });
      expect(secondVerify.success).toBe(true);
    });
  });

  describe('3. Code Verification & Lockout Dynamics', () => {
    it('rejects invalid code format (non-32 or non-hex) with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ananya.roy@allianceindia.org',
          code: '123456', // Too short
        }),
      });

      const res = await verifyCodeRoute(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('INVALID_CODE');
    });

    it('rejects wrong verification code and tracks remaining attempts', async () => {
      const email = 'samuel.k@allianceindia.org';
      const ua = 'TestBrowser/1.0';
      await requestLeadershipAuthCode({ email, userAgent: ua });

      const wrongCode = '0'.repeat(32);
      const verifyResult = verifyLeadershipAuthCode({ email, code: wrongCode, userAgent: ua });
      expect(verifyResult.success).toBe(false);
      if (!verifyResult.success) {
        expect(verifyResult.statusCode).toBe(401);
        expect(verifyResult.error).toContain('4 attempts remaining');
      }
    });

    it('locks out verification challenge after 5 failed attempts', async () => {
      const email = 'samuel.k@allianceindia.org';
      const ua = 'TestBrowser/1.0';
      await requestLeadershipAuthCode({ email, userAgent: ua });
      const rightCode = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      const wrongCode = 'f'.repeat(32);

      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        const res = verifyLeadershipAuthCode({ email, code: wrongCode, userAgent: ua });
        expect(res.success).toBe(false);
      }

      // 5th wrong attempt locks it out
      const res5 = verifyLeadershipAuthCode({ email, code: wrongCode, userAgent: ua });
      expect(res5.success).toBe(false);
      if (!res5.success) {
        expect(res5.statusCode).toBe(429);
        expect(res5.error).toContain('locked');
      }

      // Even the correct code is now rejected because challenge was locked and deleted
      const resCorrectAfterLockout = verifyLeadershipAuthCode({ email, code: rightCode, userAgent: ua });
      expect(resCorrectAfterLockout.success).toBe(false);
    });

    it('rejects expired verification codes after 10 minutes', () => {
      vi.useFakeTimers();
      const email = 'ananya.roy@allianceindia.org';
      const ua = 'TestBrowser/1.0';

      requestLeadershipAuthCode({ email, userAgent: ua });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      // Advance time by 10 minutes + 1 second
      vi.advanceTimersByTime(CHALLENGE_TTL_MS + 1000);

      const res = verifyLeadershipAuthCode({ email, code, userAgent: ua });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.statusCode).toBe(401);
        expect(res.error).toContain('expired');
      }
      vi.useRealTimers();
    });

    it('rejects verification if User-Agent fingerprint does not match', async () => {
      const email = 'ananya.roy@allianceindia.org';
      await requestLeadershipAuthCode({ email, userAgent: 'Browser-A/1.0' });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      const res = verifyLeadershipAuthCode({
        email,
        code,
        userAgent: 'DifferentBrowser-B/2.0',
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.statusCode).toBe(401);
        expect(res.error).toContain('session mismatch');
      }
    });

    it('successfully verifies correct code, sets leader_session_id cookie, and consumes code', async () => {
      const email = 'ananya.roy@allianceindia.org';
      const ua = 'TestBrowser/1.0';

      // 1. Request
      const reqPost = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-agent': ua },
        body: JSON.stringify({ email }),
      });
      await requestCodeRoute(reqPost);

      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      // 2. Verify
      const verifyReq = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-agent': ua },
        body: JSON.stringify({ email, code }),
      });

      const verifyRes = await verifyCodeRoute(verifyReq);
      expect(verifyRes.status).toBe(200);

      const cookie = verifyRes.cookies.get(LEADER_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.value).toHaveLength(64); // 32 bytes hex
      expect(cookie?.httpOnly).toBe(true);
      expect(String(cookie?.sameSite).toLowerCase()).toBe('lax');

      const body = await verifyRes.json();
      expect(body.status).toBe('success');
      expect(body.data.user.role).toBe('LEADERSHIP');
      expect(body.data.user.email).toBe(email);
      expect(body.data.user.allowedStates).toEqual(['*']);

      // 3. Single-use consumption test: reusing the same code must fail immediately
      const reuseReq = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-agent': ua },
        body: JSON.stringify({ email, code }),
      });
      const reuseRes = await verifyCodeRoute(reuseReq);
      expect(reuseRes.status).toBe(401);
    });
  });

  describe('4. Session Lifecycle: Sliding Window, X-Poll, Absolute Expiry, and Revocation', () => {
    it('slides 30-minute idle window on active requests', () => {
      vi.useFakeTimers();
      const leader = findLeaderByEmail('ananya.roy@allianceindia.org')!;
      const session = createLeaderSession(leader);

      // Advance time by 20 minutes (within 30m idle limit)
      vi.advanceTimersByTime(20 * 60 * 1000);

      // Active request (not poll) -> slides window
      const valid1 = validateLeaderSession(session.sessionId);
      expect(valid1).not.toBeNull();

      // Advance time another 20 minutes (now 40 minutes since creation, but only 20 since last activity)
      vi.advanceTimersByTime(20 * 60 * 1000);
      const valid2 = validateLeaderSession(session.sessionId);
      expect(valid2).not.toBeNull();

      // Advance time 31 minutes without activity -> expires
      vi.advanceTimersByTime(31 * 60 * 1000);
      const valid3 = validateLeaderSession(session.sessionId);
      expect(valid3).toBeNull();

      vi.useRealTimers();
    });

    it('does NOT slide idle window on X-Poll requests', () => {
      vi.useFakeTimers();
      const leader = findLeaderByEmail('rajiv.menon@allianceindia.org')!;
      const session = createLeaderSession(leader);

      // Make periodic poll requests every 10 minutes for 35 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(validateLeaderSession(session.sessionId, { isPoll: true })).not.toBeNull();

      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(validateLeaderSession(session.sessionId, { isPoll: true })).not.toBeNull();

      vi.advanceTimersByTime(15 * 60 * 1000); // 35 minutes total since creation with ONLY poll requests
      // Should now be expired because poll requests did not reset lastActivityAt
      expect(validateLeaderSession(session.sessionId, { isPoll: true })).toBeNull();

      vi.useRealTimers();
    });

    it('enforces absolute 8-hour session lifetime regardless of activity', () => {
      vi.useFakeTimers();
      const leader = findLeaderByEmail('ananya.roy@allianceindia.org')!;
      const session = createLeaderSession(leader);

      // Ping actively every 25 minutes for 7.5 hours
      for (let i = 0; i < 18; i++) {
        vi.advanceTimersByTime(25 * 60 * 1000);
        expect(validateLeaderSession(session.sessionId)).not.toBeNull();
      }

      // Advance past the 8-hour absolute ceiling
      vi.advanceTimersByTime(40 * 60 * 1000);
      expect(validateLeaderSession(session.sessionId)).toBeNull();

      vi.useRealTimers();
    });

    it('terminates session immediately if leader account is deactivated (mid-session revocation)', () => {
      const leader = findLeaderByEmail('priya.sharma@allianceindia.org')!;
      const session = createLeaderSession(leader);

      expect(validateLeaderSession(session.sessionId)).not.toBeNull();

      // Deactivate account
      setLeaderActiveStatusForTesting('lead-priya-sharma', false);

      // Subsequent session check MUST fail immediately
      expect(validateLeaderSession(session.sessionId)).toBeNull();
    });

    it('terminates session immediately if leader authVersion is bumped (credential rotation)', () => {
      const leader = findLeaderByEmail('ananya.roy@allianceindia.org')!;
      const session = createLeaderSession(leader);

      expect(validateLeaderSession(session.sessionId)).not.toBeNull();

      // Bump auth version
      bumpLeaderAuthVersionForTesting('lead-ananya-roy');

      // Subsequent check MUST fail immediately
      expect(validateLeaderSession(session.sessionId)).toBeNull();
    });

    it('clears session cookie and invalidates session on POST /api/auth/leader/logout', async () => {
      const leader = findLeaderByEmail('ananya.roy@allianceindia.org')!;
      const session = createLeaderSession(leader);

      const req = new NextRequest('http://localhost:3000/api/auth/leader/logout', {
        method: 'POST',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${session.sessionId}`,
        },
      });

      const res = await logoutRoute(req);
      expect(res.status).toBe(200);

      // Session in store is gone
      expect(validateLeaderSession(session.sessionId)).toBeNull();

      // Cookie is cleared
      const cookie = res.cookies.get(LEADER_COOKIE_NAME);
      expect(cookie?.maxAge).toBe(0);
    });
  });

  describe('5. Authorisation Scope & Submissions API Integration', () => {
    it('resolves UserAccessScope with role LEADERSHIP and wildcard state scope from leader session', () => {
      const leader = findLeaderByEmail('ananya.roy@allianceindia.org')!;
      const session = createLeaderSession(leader);

      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${session.sessionId}`,
        },
      });

      const scope = resolveUserAccessScope(req);
      expect(scope.isVerified).toBe(true);
      expect(scope.role).toBe('LEADERSHIP');
      expect(scope.userId).toBe('lead-ananya-roy');
      expect(scope.allowedStates).toEqual(['*']);
      expect(isStateAuthorized(scope, 'Maharashtra')).toBe(true);
      expect(isStateAuthorized(scope, 'West Bengal')).toBe(true);
      expect(isStateAuthorized(scope, 'ALL')).toBe(true);
    });

    it('allows leadership session to query submissions linelist across states without 401/403', async () => {
      const leader = findLeaderByEmail('ananya.roy@allianceindia.org')!;
      const session = createLeaderSession(leader);

      const req = new NextRequest('http://localhost:3000/api/submissions?limit=50', {
        method: 'GET',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${session.sessionId}`,
        },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
      expect(Array.isArray(body.data.records)).toBe(true);
    });

    it('rejects DELETE attempts by leadership session with HTTP 403 FORBIDDEN', async () => {
      const leader = findLeaderByEmail('ananya.roy@allianceindia.org')!;
      const session = createLeaderSession(leader);

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'DELETE',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${session.sessionId}`,
        },
      });

      const res = await deleteSubmissionRoute(req, {
        params: { submissionId: 'MH-PUN-081200-02' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FORBIDDEN');
    });

    it('rejects POST asset uploads by leadership session with HTTP 403 FORBIDDEN', async () => {
      const leader = findLeaderByEmail('ananya.roy@allianceindia.org')!;
      const session = createLeaderSession(leader);

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/asset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${LEADER_COOKIE_NAME}=${session.sessionId}`,
        },
        body: JSON.stringify({
          documentType: 'Aadhaar_Card',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }),
      });

      const res = await postAssetRoute(req, {
        params: { submissionId: 'MH-PUN-081200-02' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  describe('6. Dynamic LEADERSHIP_ALLOWLIST_JSON Loading & Strict Role Enforcement', () => {
    it('dynamically loads allowlist from LEADERSHIP_ALLOWLIST_JSON and strictly enforces LEADERSHIP role', () => {
      process.env.LEADERSHIP_ALLOWLIST_JSON = JSON.stringify([
        {
          id: 'lead-custom-dev',
          email: 'custom.dev@example.org',
          name: 'Custom Developer',
          title: 'Technical Architect',
          role: 'ADMIN', // Tampering attempt: trying to claim ADMIN
          isActive: true,
          authVersion: 1,
        },
      ]);

      resetLeaderIdentitiesForTesting();

      const leader = findLeaderByEmail('custom.dev@example.org');
      expect(leader).not.toBeNull();
      expect(leader?.name).toBe('Custom Developer');
      expect(leader?.role).toBe('LEADERSHIP'); // Strictly enforced to LEADERSHIP!
      expect(leader?.allowedStates).toEqual(['*']);

      // Synthetic persona should NOT be present when custom allowlist is loaded
      expect(findLeaderByEmail('ananya.roy@allianceindia.org')).toBeNull();
    });

    it('falls back to synthetic identities if LEADERSHIP_ALLOWLIST_JSON is invalid JSON', () => {
      process.env.LEADERSHIP_ALLOWLIST_JSON = 'invalid-json';
      resetLeaderIdentitiesForTesting();

      const leader = findLeaderByEmail('ananya.roy@allianceindia.org');
      expect(leader).not.toBeNull();
      expect(leader?.name).toBe('Dr. Ananya Roy');
    });
  });
});
