import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

import {
  findLeaderByEmail,
  findLeaderById,
  isLeaderActive,
  loadInitialLeaders,
  resetLeaderIdentitiesForTesting,
  setLeaderActiveStatusForTesting,
  bumpLeaderAuthVersionForTesting,
} from '@/lib/server/leaderIdentityStore';
import {
  MockEmailStore,
  getEmailProvider,
  FailingEmailProvider,
  AppsScriptEmailProvider,
} from '@/lib/server/emailProvider';
import {
  requestLeadershipAuthCode,
  verifyLeadershipAuthCode,
  resetLeaderChallengesForTesting,
  generateDeviceBindingSecret,
  CHALLENGE_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
} from '@/lib/server/leaderAuthChallenge';
import {
  validateLeaderSession,
  revokeLeaderSession,
  resetLeaderSessionsForTesting,
  LEADER_COOKIE_NAME,
  LEADER_DEVICE_COOKIE_NAME,
  LEADER_IDLE_TIMEOUT_MS,
  LEADER_ABSOLUTE_LIFETIME_MS,
} from '@/lib/server/leaderSessionStore';
import {
  MemoryLeaderAuthStore,
  UnavailableLeaderAuthStore,
  getLeaderAuthStore,
  setLeaderAuthStoreForTesting,
} from '@/lib/server/leaderAuthStore';
import { createSessionToken } from '@/lib/server/sessionService';
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
import { GET as directoryRoute } from '@/app/api/auth/leader/directory/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as globalLogoutRoute } from '@/app/api/auth/logout/route';
import { GET as getSubmissionsRoute } from '@/app/api/submissions/route';
import { DELETE as deleteSubmissionRoute } from '@/app/api/submissions/[submissionId]/route';
import { POST as postAssetRoute } from '@/app/api/submissions/[submissionId]/asset/route';

describe('PR B: Individual Allowlisted Leadership Email Authentication', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'true';
    process.env.SESSION_SECRET = 'synthetic-session-secret-for-leadership-tests';
    setLeaderAuthStoreForTesting(new MemoryLeaderAuthStore());
    MockEmailStore.clear();
    resetLeaderIdentitiesForTesting();
    await resetLeaderChallengesForTesting();
    await resetLeaderSessionsForTesting();
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    setLeaderAuthStoreForTesting(null);
    MockEmailStore.clear();
    resetLeaderIdentitiesForTesting();
    await resetLeaderChallengesForTesting();
    await resetLeaderSessionsForTesting();
  });

  describe('1. Feature Flag Gating', () => {
    it('returns 403 FEATURE_DISABLED on request-code when flag is disabled', async () => {
      process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'false';

      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ananya.roy@example.org' }),
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
          email: 'ananya.roy@example.org',
          code: 'a'.repeat(32),
        }),
      });

      const res = await verifyCodeRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FEATURE_DISABLED');
    });

    it('returns 403 FEATURE_DISABLED on directory route when flag is disabled', async () => {
      process.env.LEADERSHIP_EMAIL_AUTH_ENABLED = 'false';

      const req = new NextRequest('http://localhost:3000/api/auth/leader/directory', {
        method: 'GET',
      });
      const res = await directoryRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FEATURE_DISABLED');
    });
  });

  describe('2. Request Code Endpoint, Anti-Enumeration & Directory Boundary', () => {
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

    it('returns 200, attaches device binding cookie, and dispatches 128-bit hex OTP email for allowlisted active leader', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-agent': 'TestBrowser/1.0',
        },
        body: JSON.stringify({ email: 'ANANYA.ROY@example.org' }), // Case-insensitive
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
      expect(body.message).toContain('verification code has been dispatched');

      // Device binding cookie is set
      const deviceCookie = res.cookies.get(LEADER_DEVICE_COOKIE_NAME);
      expect(deviceCookie).toBeDefined();
      expect(deviceCookie?.value.length).toBeGreaterThanOrEqual(32);
      expect(deviceCookie?.httpOnly).toBe(true);

      const emails = MockEmailStore.getAll();
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toBe('ananya.roy@example.org');
      expect(emails[0].subject).toBe('Your Leadership sign-in code'); // Zero OTP in subject

      // Verify code in email body is 32-character hexadecimal (128-bit)
      const codeMatch = emails[0].text.match(/[0-9a-f]{32}/i);
      expect(codeMatch).not.toBeNull();
      expect(codeMatch![0]).toHaveLength(32);
    });

    it('supports requesting code via leaderId without client sending email address', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderId: 'lead-rajiv-menon' }),
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(200);

      const emails = MockEmailStore.getAll();
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toBe('rajiv.menon@example.org'); // Sent strictly to stored email
    });

    it('rejects unauthenticated caller on directory route with 401 AUTH_REQUIRED (prevents public directory enumeration)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/directory', {
        method: 'GET',
        headers: {
          'x-test-unauthenticated': 'true',
        },
      });
      const res = await directoryRoute(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('AUTH_REQUIRED');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('exposes only id, name, and title in directory route to authenticated caller (zero emails exposed)', async () => {
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      const req = new NextRequest('http://localhost:3000/api/auth/leader/directory', {
        method: 'GET',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${sessionId}`,
        },
      });

      const res = await directoryRoute(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      const body = await res.json();
      expect(body.status).toBe('success');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      for (const entry of body.data) {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('title');
        expect(entry).not.toHaveProperty('email');
        expect(entry).not.toHaveProperty('role');
        expect(entry).not.toHaveProperty('allowedStates');
      }
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
        body: JSON.stringify({ email: 'fatima.sheikh@example.org' }), // Deactivated in store
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');

      // ZERO emails dispatched for deactivated leader
      expect(MockEmailStore.getAll()).toHaveLength(0);
    });

    it('enforces rate limits (3 requests per 15 minutes, 4th returns 429)', async () => {
      const email = 'rajiv.menon@example.org';

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
      const email = 'priya.sharma@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();

      // 1st request
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const firstEmail = MockEmailStore.getLastFor(email);
      const firstCode = firstEmail!.text.match(/[0-9a-f]{32}/i)![0];

      // 2nd request
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const secondEmail = MockEmailStore.getLastFor(email);
      const secondCode = secondEmail!.text.match(/[0-9a-f]{32}/i)![0];

      expect(firstCode).not.toBe(secondCode);

      // Attempting to verify 1st code MUST fail
      const firstVerify = await verifyLeadershipAuthCode({ email, code: firstCode, deviceBindingSecret });
      expect(firstVerify.success).toBe(false);

      // 2nd code MUST succeed
      const secondVerify = await verifyLeadershipAuthCode({ email, code: secondCode, deviceBindingSecret });
      expect(secondVerify.success).toBe(true);
    });
  });

  describe('3. Code Verification, Device Binding & Lockout Dynamics', () => {
    it('rejects verification if device binding token is missing or mismatched', async () => {
      const email = 'samuel.k@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret: deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      // Missing device binding
      const resNoDevice = await verifyLeadershipAuthCode({
        email,
        code,
      });
      expect(resNoDevice.success).toBe(false);
      if (!resNoDevice.success) {
        expect(resNoDevice.statusCode).toBe(401);
        expect(resNoDevice.error).toContain('Device binding');
      }

      // Mismatched device binding
      const resWrongDevice = await verifyLeadershipAuthCode({
        email,
        code,
        deviceBindingSecret: 'different-device-secret-12345678',
      });
      expect(resWrongDevice.success).toBe(false);
      if (!resWrongDevice.success) {
        expect(resWrongDevice.statusCode).toBe(401);
        expect(resWrongDevice.error).toContain('Device binding mismatch');
      }
    });

    it('rejects wrong verification code and tracks remaining attempts', async () => {
      const email = 'samuel.k@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret: deviceBindingSecret });

      const wrongCode = '0'.repeat(32);
      const verifyResult = await verifyLeadershipAuthCode({ email, code: wrongCode, deviceBindingSecret: deviceBindingSecret });
      expect(verifyResult.success).toBe(false);
      if (!verifyResult.success) {
        expect(verifyResult.statusCode).toBe(401);
        expect(verifyResult.error).toContain('4 attempts remaining');
      }
    });

    it('locks out verification challenge after 5 failed attempts', async () => {
      const email = 'samuel.k@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret: deviceBindingSecret });
      const rightCode = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      const wrongCode = 'f'.repeat(32);

      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        const res = await verifyLeadershipAuthCode({ email, code: wrongCode, deviceBindingSecret: deviceBindingSecret });
        expect(res.success).toBe(false);
      }

      // 5th wrong attempt locks it out
      const res5 = await verifyLeadershipAuthCode({ email, code: wrongCode, deviceBindingSecret: deviceBindingSecret });
      expect(res5.success).toBe(false);
      if (!res5.success) {
        expect(res5.statusCode).toBe(429);
        expect(res5.error).toContain('locked');
      }

      // Even the correct code is now rejected because challenge was locked
      const resCorrectAfterLockout = await verifyLeadershipAuthCode({ email, code: rightCode, deviceBindingSecret: deviceBindingSecret });
      expect(resCorrectAfterLockout.success).toBe(false);
    });

    it('rejects expired verification codes after 10 minutes', async () => {
      vi.useFakeTimers();
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();

      await requestLeadershipAuthCode({ email, deviceBindingSecret: deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      // Advance time by 10 minutes + 1 second
      vi.advanceTimersByTime(CHALLENGE_TTL_MS + 1000);

      const res = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret: deviceBindingSecret });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.statusCode).toBe(401);
        expect(res.error).toContain('expired');
      }
      vi.useRealTimers();
    });

    it('successfully verifies correct code, sets leader_session_id cookie, and consumes code', async () => {
      const email = 'ananya.roy@example.org';

      // 1. Request
      const reqPost = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const reqPostRes = await requestCodeRoute(reqPost);
      const deviceCookie = reqPostRes.cookies.get(LEADER_DEVICE_COOKIE_NAME)!.value;

      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      // 2. Verify
      const verifyReq = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${LEADER_DEVICE_COOKIE_NAME}=${deviceCookie}`,
        },
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
        headers: {
          'Content-Type': 'application/json',
          cookie: `${LEADER_DEVICE_COOKIE_NAME}=${deviceCookie}`,
        },
        body: JSON.stringify({ email, code }),
      });
      const reuseRes = await verifyCodeRoute(reuseReq);
      expect(reuseRes.status).toBe(401);
    });
  });

  describe('4. Distributed Store, Concurrency & Single Active Session Enforcement', () => {
    it('concurrent verification of the same code produces at most one session across separate instances', async () => {
      const sharedStore = new MemoryLeaderAuthStore();
      setLeaderAuthStoreForTesting(sharedStore);

      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret: deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      // Simulate 2 instances attempting to verify concurrently
      const [res1, res2] = await Promise.all([
        verifyLeadershipAuthCode({ email, code, deviceBindingSecret }),
        verifyLeadershipAuthCode({ email, code, deviceBindingSecret }),
      ]);

      const successes = [res1, res2].filter((r) => r.success);
      const failures = [res1, res2].filter((r) => !r.success);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
    });

    it('enforces one active session per leader: new login revokes previous session across instances', async () => {
      const sharedStore = new MemoryLeaderAuthStore();
      setLeaderAuthStoreForTesting(sharedStore);

      const email = 'rajiv.menon@example.org';
      const deviceBindingSecret1 = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret: deviceBindingSecret1 });
      const code1 = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      // Instance 1 login
      const login1 = await verifyLeadershipAuthCode({ email, code: code1, deviceBindingSecret: deviceBindingSecret1 });
      expect(login1.success).toBe(true);
      const session1Id = (login1 as any).session.sessionId;

      // Session 1 is initially valid
      expect(await validateLeaderSession(session1Id)).not.toBeNull();

      // Instance 2 login for same leader
      const deviceBindingSecret2 = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret: deviceBindingSecret2 });
      const code2 = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];

      const login2 = await verifyLeadershipAuthCode({ email, code: code2, deviceBindingSecret: deviceBindingSecret2 });
      expect(login2.success).toBe(true);
      const session2Id = (login2 as any).session.sessionId;

      // Session 2 is valid, Session 1 MUST be revoked!
      expect(await validateLeaderSession(session2Id)).not.toBeNull();
      expect(await validateLeaderSession(session1Id)).toBeNull();
    });
  });

  describe('5. Session Lifecycle: Sliding Window, X-Poll, Absolute Expiry & Revocation', () => {
    it('slides 30-minute idle window on active requests', async () => {
      vi.useFakeTimers();
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      // Advance time by 20 minutes (within 30m idle limit)
      vi.advanceTimersByTime(20 * 60 * 1000);

      // Active request -> slides window
      const valid1 = await validateLeaderSession(sessionId);
      expect(valid1).not.toBeNull();

      // Advance time another 20 minutes
      vi.advanceTimersByTime(20 * 60 * 1000);
      const valid2 = await validateLeaderSession(sessionId);
      expect(valid2).not.toBeNull();

      // Advance time 31 minutes without activity -> expires
      vi.advanceTimersByTime(31 * 60 * 1000);
      const valid3 = await validateLeaderSession(sessionId);
      expect(valid3).toBeNull();

      vi.useRealTimers();
    });

    it('does NOT slide idle window on X-Poll requests', async () => {
      vi.useFakeTimers();
      const email = 'rajiv.menon@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      // Make periodic poll requests every 10 minutes for 35 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(await validateLeaderSession(sessionId, { isPoll: true })).not.toBeNull();

      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(await validateLeaderSession(sessionId, { isPoll: true })).not.toBeNull();

      vi.advanceTimersByTime(15 * 60 * 1000); // 35 minutes total with ONLY poll requests
      // Should now be expired because poll requests did not reset lastActivityAt
      expect(await validateLeaderSession(sessionId, { isPoll: true })).toBeNull();

      vi.useRealTimers();
    });

    it('enforces absolute 8-hour session lifetime regardless of activity', async () => {
      vi.useFakeTimers();
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      // Ping actively every 25 minutes for 7.5 hours
      for (let i = 0; i < 18; i++) {
        vi.advanceTimersByTime(25 * 60 * 1000);
        expect(await validateLeaderSession(sessionId)).not.toBeNull();
      }

      // Advance past the 8-hour absolute ceiling
      vi.advanceTimersByTime(40 * 60 * 1000);
      expect(await validateLeaderSession(sessionId)).toBeNull();

      vi.useRealTimers();
    });

    it('terminates session immediately if leader account is deactivated (mid-session revocation)', async () => {
      const email = 'priya.sharma@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      expect(await validateLeaderSession(sessionId)).not.toBeNull();

      // Deactivate account
      setLeaderActiveStatusForTesting('lead-priya-sharma', false);

      // Subsequent session check MUST fail immediately
      expect(await validateLeaderSession(sessionId)).toBeNull();
    });

    it('terminates session immediately if leader authVersion is bumped (credential rotation)', async () => {
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      expect(await validateLeaderSession(sessionId)).not.toBeNull();

      // Bump auth version
      bumpLeaderAuthVersionForTesting('lead-ananya-roy');

      // Subsequent check MUST fail immediately
      expect(await validateLeaderSession(sessionId)).toBeNull();
    });

    it('clears session and device cookies on POST /api/auth/leader/logout', async () => {
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      const req = new NextRequest('http://localhost:3000/api/auth/leader/logout', {
        method: 'POST',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${sessionId}`,
        },
      });

      const res = await logoutRoute(req);
      expect(res.status).toBe(200);

      // Session in store is revoked
      expect(await validateLeaderSession(sessionId)).toBeNull();

      // Cookies are cleared
      const cookie = res.cookies.get(LEADER_COOKIE_NAME);
      expect(cookie?.maxAge).toBe(0);
      const devCookie = res.cookies.get(LEADER_DEVICE_COOKIE_NAME);
      expect(devCookie?.maxAge).toBe(0);
    });
  });

  describe('6. Production Fail-Closed Identity Loading & Email Cutover', () => {
    it('fails closed in production if LEADERSHIP_ALLOWLIST_JSON is missing or empty (zero synthetic fallback)', () => {
      const prevNodeEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        delete process.env.LEADERSHIP_ALLOWLIST_JSON;

        const leaders = loadInitialLeaders();
        expect(leaders).toEqual([]); // Zero leaders allowed in production without allowlist
      } finally {
        (process.env as any).NODE_ENV = prevNodeEnv;
      }
    });

    it('fails closed in production if LEADERSHIP_ALLOWLIST_JSON has duplicate emails', () => {
      const prevNodeEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        process.env.LEADERSHIP_ALLOWLIST_JSON = JSON.stringify([
          { id: 'lead-1', email: 'dup@example.org', name: 'Leader One' },
          { id: 'lead-2', email: 'dup@example.org', name: 'Leader Two' }, // Duplicate email!
        ]);

        const leaders = loadInitialLeaders();
        expect(leaders).toEqual([]); // Fail closed on duplicates!
      } finally {
        (process.env as any).NODE_ENV = prevNodeEnv;
      }
    });

    it('rejects FORCE_MOCK_EMAIL in production environment', () => {
      const prevNodeEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        process.env.FORCE_MOCK_EMAIL = 'true';

        const provider = getEmailProvider();
        expect(provider instanceof FailingEmailProvider).toBe(true);
      } finally {
        (process.env as any).NODE_ENV = prevNodeEnv;
      }
    });

    it('selects AppsScriptEmailProvider when EMAIL_PROVIDER is apps_script and env vars are configured', () => {
      const prevProvider = process.env.EMAIL_PROVIDER;
      const prevUrl = process.env.APPS_SCRIPT_WEBAPP_URL;
      const prevSecret = process.env.APPS_SCRIPT_DISPATCH_SECRET;
      try {
        process.env.EMAIL_PROVIDER = 'apps_script';
        process.env.APPS_SCRIPT_WEBAPP_URL = 'https://script.google.com/macros/s/test-deploy/exec';
        process.env.APPS_SCRIPT_DISPATCH_SECRET = 'a'.repeat(64);

        const provider = getEmailProvider();
        expect(provider instanceof AppsScriptEmailProvider).toBe(true);
      } finally {
        if (prevProvider) process.env.EMAIL_PROVIDER = prevProvider;
        else delete process.env.EMAIL_PROVIDER;
        if (prevUrl) process.env.APPS_SCRIPT_WEBAPP_URL = prevUrl;
        else delete process.env.APPS_SCRIPT_WEBAPP_URL;
        if (prevSecret) process.env.APPS_SCRIPT_DISPATCH_SECRET = prevSecret;
        else delete process.env.APPS_SCRIPT_DISPATCH_SECRET;
      }
    });

    it('fails closed when EMAIL_PROVIDER is apps_script but URL or dispatch secret is missing', () => {
      const prevProvider = process.env.EMAIL_PROVIDER;
      const prevUrl = process.env.APPS_SCRIPT_WEBAPP_URL;
      const prevSecret = process.env.APPS_SCRIPT_DISPATCH_SECRET;
      try {
        process.env.EMAIL_PROVIDER = 'apps_script';
        delete process.env.APPS_SCRIPT_WEBAPP_URL;
        delete process.env.APPS_SCRIPT_DISPATCH_SECRET;

        const provider = getEmailProvider();
        expect(provider instanceof FailingEmailProvider).toBe(true);
      } finally {
        if (prevProvider) process.env.EMAIL_PROVIDER = prevProvider;
        else delete process.env.EMAIL_PROVIDER;
        if (prevUrl) process.env.APPS_SCRIPT_WEBAPP_URL = prevUrl;
        else delete process.env.APPS_SCRIPT_WEBAPP_URL;
        if (prevSecret) process.env.APPS_SCRIPT_DISPATCH_SECRET = prevSecret;
        else delete process.env.APPS_SCRIPT_DISPATCH_SECRET;
      }
    });

    it('AppsScriptEmailProvider dispatches valid POST payload to Apps Script endpoint and handles response', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        expect(String(url)).toBe('https://script.google.com/macros/s/test-deploy/exec');
        const body = JSON.parse(init?.body as string);
        expect(body.action).toBe('send_leadership_otp');
        expect(body.secret).toBe('b'.repeat(64));
        expect(body.recipient).toBe('leader@example.org');
        expect(body.otp).toBe('0123456789abcdef0123456789abcdef');

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      try {
        const provider = new AppsScriptEmailProvider(
          'https://script.google.com/macros/s/test-deploy/exec',
          'b'.repeat(64)
        );

        const result = await provider.sendEmail({
          to: 'leader@example.org',
          subject: 'Sign-in code',
          html: '<p>Code: 0123456789abcdef0123456789abcdef</p>',
          text: 'Your code is: 0123456789abcdef0123456789abcdef',
          otp: '0123456789abcdef0123456789abcdef',
        });

        expect(result.success).toBe(true);
        expect(result.provider).toBe('apps_script');
        expect(result.messageId).toContain('gas-otp');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('AppsScriptEmailProvider fails closed and sanitizes errors when gateway rejects request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(JSON.stringify({ success: false, error: 'AUTH_RECIPIENT_REJECTED' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      try {
        const provider = new AppsScriptEmailProvider(
          'https://script.google.com/macros/s/test-deploy/exec',
          'b'.repeat(64)
        );

        const result = await provider.sendEmail({
          to: 'unauthorized@example.org',
          subject: 'Sign-in code',
          html: '<p>Code: 0123456789abcdef0123456789abcdef</p>',
          text: 'Your code is: 0123456789abcdef0123456789abcdef',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('AUTH_RECIPIENT_REJECTED');
        expect(result.provider).toBe('apps_script');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('enforces email_only cutover: rejects shared password leadership logins with 403 AUTH_METHOD_DISABLED', async () => {
      process.env.LEADERSHIP_EMAIL_AUTH_MODE = 'email_only';

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          accessIdentifier: 'LEADERSHIP-ALL',
          password: 'some-password',
        }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('AUTH_METHOD_DISABLED');
      expect(body.message).toContain('individual allowlisted email');
    });
  });

  describe('7. Authorisation Scope & Submissions API Integration', () => {
    it('resolves UserAccessScope with role LEADERSHIP and wildcard state scope from leader session', async () => {
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${sessionId}`,
        },
      });

      const scope = await resolveUserAccessScope(req);
      expect(scope.isVerified).toBe(true);
      expect(scope.role).toBe('LEADERSHIP');
      expect(scope.userId).toBe('lead-ananya-roy');
      expect(scope.allowedStates).toEqual(['*']);
      expect(isStateAuthorized(scope, 'Maharashtra')).toBe(true);
      expect(isStateAuthorized(scope, 'West Bengal')).toBe(true);
      expect(isStateAuthorized(scope, 'ALL')).toBe(true);
    });

    it('allows leadership session to query submissions linelist across states without 401/403', async () => {
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      const req = new NextRequest('http://localhost:3000/api/submissions?limit=50', {
        method: 'GET',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${sessionId}`,
        },
      });

      const res = await getSubmissionsRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
      expect(Array.isArray(body.data.records)).toBe(true);
    });

    it('rejects DELETE attempts by leadership session with HTTP 403 FORBIDDEN', async () => {
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'DELETE',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${sessionId}`,
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
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02/asset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${LEADER_COOKIE_NAME}=${sessionId}`,
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

  describe('8. CSRF Origin Protection on Mutations', () => {
    it('rejects cross-site origin on POST /api/auth/leader/request-code with 403 CSRF_REJECTED', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://attacker-origin.example.com',
        },
        body: JSON.stringify({ email: 'ananya.roy@example.org' }),
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('CSRF_REJECTED');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('rejects cross-site origin on POST /api/auth/leader/verify-code with 403 CSRF_REJECTED', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://attacker-origin.example.com',
        },
        body: JSON.stringify({ email: 'ananya.roy@example.org', code: '0'.repeat(32) }),
      });

      const res = await verifyCodeRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('CSRF_REJECTED');
    });

    it('rejects Sec-Fetch-Site: cross-site on POST /api/auth/leader/logout with 403 CSRF_REJECTED', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/logout', {
        method: 'POST',
        headers: {
          'sec-fetch-site': 'cross-site',
        },
      });

      const res = await logoutRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('CSRF_REJECTED');
    });

    it('permits same-origin mutation on POST /api/auth/leader/request-code', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'ananya.roy@example.org' }),
      });

      const res = await requestCodeRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
    });
  });

  describe('9. Anti-Caching Header Hardening Across Auth Endpoints', () => {
    it('ensures auth mutation and inquiry endpoints return private no-store headers and Pragma: no-cache', async () => {
      const reqReq = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'ananya.roy@example.org' }),
      });
      const resReq = await requestCodeRoute(reqReq);
      expect(resReq.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
      expect(resReq.headers.get('Pragma')).toBe('no-cache');

      const reqVerify = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'ananya.roy@example.org', code: '0'.repeat(32) }),
      });
      const resVerify = await verifyCodeRoute(reqVerify);
      expect(resVerify.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
      expect(resVerify.headers.get('Pragma')).toBe('no-cache');

      const reqSession = new NextRequest('http://localhost:3000/api/auth/leader/session', {
        method: 'GET',
      });
      const resSession = await sessionRoute(reqSession);
      expect(resSession.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
      expect(resSession.headers.get('Pragma')).toBe('no-cache');

      const reqLogout = new NextRequest('http://localhost:3000/api/auth/leader/logout', {
        method: 'POST',
      });
      const resLogout = await logoutRoute(reqLogout);
      expect(resLogout.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
      expect(resLogout.headers.get('Pragma')).toBe('no-cache');
    });
  });

  describe('10. Legacy Shared Session Cutover & Precedence Dynamics', () => {
    it('rejects legacy shared Leadership session token when LEADERSHIP_EMAIL_AUTH_MODE=email_only, while preserving STATE_REVIEWER and ADMIN', async () => {
      process.env.LEADERSHIP_EMAIL_AUTH_MODE = 'email_only';

      // 1. Legacy shared Leadership session token
      const leaderToken = createSessionToken({
        userId: 'lead-nat-01',
        name: 'National Leadership',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const leaderReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          cookie: `session_token=${leaderToken}`,
          'x-test-unauthenticated': 'true',
        },
      });

      const leaderScope = await resolveUserAccessScope(leaderReq);
      expect(leaderScope.isVerified).toBe(false);
      expect(leaderScope.role).toBe('FIELD_USER'); // Defaulted to unauthenticated field user

      // 2. Legacy State Reviewer session token remains valid
      const reviewerToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Maharashtra Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      const revReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          cookie: `session_token=${reviewerToken}`,
        },
      });

      const revScope = await resolveUserAccessScope(revReq);
      expect(revScope.isVerified).toBe(true);
      expect(revScope.role).toBe('STATE_REVIEWER');
      expect(revScope.allowedStates).toEqual(['Maharashtra']);

      // 3. Admin session token remains valid
      const adminToken = createSessionToken({
        userId: 'admin-01',
        name: 'System Administrator',
        role: 'ADMIN',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      });

      const adminReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          cookie: `session_token=${adminToken}`,
        },
      });

      const adminScope = await resolveUserAccessScope(adminReq);
      expect(adminScope.isVerified).toBe(true);
      expect(adminScope.role).toBe('ADMIN');
    });

    it('prioritizes individual leader session cookie over legacy session token when both are present', async () => {
      // Create valid individual leader session
      const email = 'ananya.roy@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const individualSessionId = (login as any).session.sessionId;

      // Create a conflicting legacy token for a state reviewer
      const legacyToken = createSessionToken({
        userId: 'rev-mh-01',
        name: 'Maharashtra Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
      });

      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'GET',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${individualSessionId}; session_token=${legacyToken}`,
        },
      });

      const scope = await resolveUserAccessScope(req);
      // Individual cookie MUST take precedence
      expect(scope.isVerified).toBe(true);
      expect(scope.role).toBe('LEADERSHIP');
      expect(scope.userId).toBe('lead-ananya-roy');
      expect(scope.name).toBe('Dr. Ananya Roy');
    });
  });

  describe('11. Server-Derived Background Read Activity Policy', () => {
    it('server-derived background route paths do NOT slide the idle timeout even if x-poll header is omitted', async () => {
      vi.useFakeTimers();
      const email = 'rajiv.menon@example.org';
      const deviceBindingSecret = generateDeviceBindingSecret();
      await requestLeadershipAuthCode({ email, deviceBindingSecret });
      const code = MockEmailStore.getLastFor(email)!.text.match(/[0-9a-f]{32}/i)![0];
      const login = await verifyLeadershipAuthCode({ email, code, deviceBindingSecret });
      const sessionId = (login as any).session.sessionId;

      // Simulated background route requests without explicit x-poll header
      const backgroundReq = new NextRequest('http://localhost:3000/api/auth/leader/session', {
        method: 'GET',
        headers: {
          cookie: `${LEADER_COOKIE_NAME}=${sessionId}`,
        },
      });

      // Poll every 10 minutes for 35 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(await validateLeaderSession(sessionId, { req: backgroundReq })).not.toBeNull();

      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(await validateLeaderSession(sessionId, { req: backgroundReq })).not.toBeNull();

      vi.advanceTimersByTime(15 * 60 * 1000);
      // 35 minutes total with ONLY background route requests: must expire because idle window did NOT slide
      expect(await validateLeaderSession(sessionId, { req: backgroundReq })).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('12. Distributed Store Failure & Production Guardrails', () => {
    it('fails closed with HTTP 503 SERVICE_UNAVAILABLE on request-code and verify-code when store is unavailable', async () => {
      setLeaderAuthStoreForTesting(new UnavailableLeaderAuthStore('Database cluster temporarily unreachable'));

      const reqCode = new NextRequest('http://localhost:3000/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ananya.roy@example.org' }),
      });
      const resCode = await requestCodeRoute(reqCode);
      expect(resCode.status).toBe(503);
      const bodyCode = await resCode.json();
      expect(bodyCode.code).toBe('SERVICE_UNAVAILABLE');

      const reqVerify = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${LEADER_DEVICE_COOKIE_NAME}=test-device-secret`,
        },
        body: JSON.stringify({ email: 'ananya.roy@example.org', code: '0'.repeat(32) }),
      });
      const resVerify = await verifyCodeRoute(reqVerify);
      expect(resVerify.status).toBe(503);
      const bodyVerify = await resVerify.json();
      expect(bodyVerify.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('throws fatal error if FORCE_MEMORY_STORE is passed in production/staging environment', () => {
      setLeaderAuthStoreForTesting(null); // Reset testing override
      const prevNodeEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        process.env.FORCE_MEMORY_STORE = 'true';

        expect(() => getLeaderAuthStore()).toThrow(
          /FORCE_MEMORY_STORE is strictly forbidden in production and staging/
        );
      } finally {
        (process.env as any).NODE_ENV = prevNodeEnv;
        delete process.env.FORCE_MEMORY_STORE;
      }
    });

    it('returns UnavailableLeaderAuthStore in production when Supabase credentials are missing (zero memory fallback)', () => {
      setLeaderAuthStoreForTesting(null); // Reset testing override
      const prevNodeEnv = process.env.NODE_ENV;
      const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        (process.env as any).NODE_ENV = 'production';
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        const store = getLeaderAuthStore();
        expect(store instanceof UnavailableLeaderAuthStore).toBe(true);
      } finally {
        (process.env as any).NODE_ENV = prevNodeEnv;
        if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
        if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      }
    });
  });
});
