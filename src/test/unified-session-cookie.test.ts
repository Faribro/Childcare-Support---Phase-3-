import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  getCookieStrategy,
  signUnifiedSession,
  verifyUnifiedSession,
  setUnifiedCookieField,
  clearUnifiedCookieField,
  extractUnifiedEnvelope,
  UNIFIED_SESSION_COOKIE_NAME,
  NO_STORE_CACHE_HEADERS,
} from '@/lib/server/unifiedSessionCookie';
import {
  setSessionCookie,
  clearSessionCookie,
  extractSessionToken,
} from '@/lib/server/sessionService';
import {
  attachLeaderSessionCookie,
  clearLeaderSessionCookie,
  attachDeviceBindingCookie,
  clearDeviceBindingCookie,
  extractLeaderSessionId,
  extractDeviceBindingSecret,
  LEADER_COOKIE_NAME,
  LEADER_DEVICE_COOKIE_NAME,
} from '@/lib/server/leaderSessionStore';
import {
  getExpectedHosts,
  validateMutationOrigin,
  validateCsrfOrigin,
} from '@/lib/server/authorisation';

describe('Unified Session Cookie Engine & Firebase Hosting Compatibility', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Strategy Selection & Defaults', () => {
    it('defaults to "default" strategy when no env flag is set', () => {
      delete process.env.COOKIE_STRATEGY;
      delete process.env.USE_UNIFIED_SESSION_COOKIE;
      expect(getCookieStrategy()).toBe('default');
    });

    it('activates "unified" strategy when COOKIE_STRATEGY=unified', () => {
      process.env.COOKIE_STRATEGY = 'unified';
      expect(getCookieStrategy()).toBe('unified');
    });

    it('activates "unified" strategy when USE_UNIFIED_SESSION_COOKIE=true', () => {
      delete process.env.COOKIE_STRATEGY;
      process.env.USE_UNIFIED_SESSION_COOKIE = 'true';
      expect(getCookieStrategy()).toBe('unified');
    });
  });

  describe('2. Cryptographic Envelope & Integrity Verification', () => {
    it('signs and verifies a valid unified session payload', () => {
      const now = Date.now();
      const payload = {
        evalToken: 'mock-eval-jwt-token-12345',
        leaderSessionId: 'sess-leader-uuid-0001',
        leaderDeviceSecret: 'device-binding-secret-128bit',
        iat: now,
        exp: now + 3600 * 1000,
      };

      const signed = signUnifiedSession(payload);
      expect(signed).toContain('.');

      const verified = verifyUnifiedSession(signed);
      expect(verified).not.toBeNull();
      expect(verified?.evalToken).toBe('mock-eval-jwt-token-12345');
      expect(verified?.leaderSessionId).toBe('sess-leader-uuid-0001');
      expect(verified?.leaderDeviceSecret).toBe('device-binding-secret-128bit');
    });

    it('rejects envelope if payload is tampered', () => {
      const now = Date.now();
      const signed = signUnifiedSession({
        evalToken: 'token-abc',
        iat: now,
        exp: now + 3600 * 1000,
      });

      const [payloadB64, sig] = signed.split('.');
      const tamperedPayloadB64 = Buffer.from(
        JSON.stringify({ evalToken: 'token-hacked', iat: now, exp: now + 3600 * 1000 })
      ).toString('base64url');

      const tamperedCookie = `${tamperedPayloadB64}.${sig}`;
      expect(verifyUnifiedSession(tamperedCookie)).toBeNull();
    });

    it('rejects envelope if signature is tampered', () => {
      const now = Date.now();
      const signed = signUnifiedSession({
        evalToken: 'token-abc',
        iat: now,
        exp: now + 3600 * 1000,
      });

      const [payloadB64, sig] = signed.split('.');
      const tamperedSig = sig.slice(0, -2) + 'XX';
      expect(verifyUnifiedSession(`${payloadB64}.${tamperedSig}`)).toBeNull();
    });

    it('rejects expired envelope', () => {
      const now = Date.now();
      const signed = signUnifiedSession({
        evalToken: 'token-abc',
        iat: now - 7200 * 1000,
        exp: now - 1000, // expired 1s ago
      });

      expect(verifyUnifiedSession(signed)).toBeNull();
    });

    it('gracefully unpacks legacy raw evaluation JWT if stored directly in __session', () => {
      const legacyRawJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.mockSig';
      const parsed = verifyUnifiedSession(legacyRawJwt);
      expect(parsed).not.toBeNull();
      expect(parsed?.evalToken).toBe(legacyRawJwt);
    });
  });

  describe('3. Default Strategy (Individual Cookies)', () => {
    beforeEach(() => {
      process.env.COOKIE_STRATEGY = 'default';
    });

    it('sets separate individual cookies and enforces Cache-Control: private, no-store', () => {
      const res = NextResponse.json({ ok: true });
      setSessionCookie(res, 'eval-jwt-123');

      expect(res.cookies.get('evaluation_session_token')?.value).toBe('eval-jwt-123');
      expect(res.cookies.get(UNIFIED_SESSION_COOKIE_NAME)).toBeUndefined();
      expect(res.headers.get('cache-control')).toContain('private');
      expect(res.headers.get('cache-control')).toContain('no-store');

      attachLeaderSessionCookie(res, 'leader-sess-456');
      expect(res.cookies.get(LEADER_COOKIE_NAME)?.value).toBe('leader-sess-456');

      attachDeviceBindingCookie(res, 'dev-secret-789');
      expect(res.cookies.get(LEADER_DEVICE_COOKIE_NAME)?.value).toBe('dev-secret-789');
    });

    it('clears individual cookies on logout', () => {
      const res = NextResponse.json({ ok: true });
      clearSessionCookie(res);
      expect(res.headers.get('cache-control')).toContain('private');

      clearLeaderSessionCookie(res);
      expect(res.cookies.get(LEADER_COOKIE_NAME)?.maxAge).toBe(0);

      clearDeviceBindingCookie(res);
      expect(res.cookies.get(LEADER_DEVICE_COOKIE_NAME)?.maxAge).toBe(0);
    });

    it('extracts tokens from individual cookies', () => {
      const req = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          cookie: `evaluation_session_token=eval-jwt-123; ${LEADER_COOKIE_NAME}=leader-sess-456; ${LEADER_DEVICE_COOKIE_NAME}=dev-secret-789`,
        },
      });

      expect(extractSessionToken(req)).toBe('eval-jwt-123');
      expect(extractLeaderSessionId(req)).toBe('leader-sess-456');
      expect(extractDeviceBindingSecret(req)).toBe('dev-secret-789');
    });
  });

  describe('4. Unified Strategy (Single __session Cookie Behind Firebase Hosting)', () => {
    beforeEach(() => {
      process.env.COOKIE_STRATEGY = 'unified';
    });

    it('multiplexes evaluation session into __session cookie with Cache-Control headers', () => {
      const res = NextResponse.json({ ok: true });
      setSessionCookie(res, 'eval-jwt-unified');

      const sessionCookie = res.cookies.get(UNIFIED_SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
      expect(res.cookies.get('evaluation_session_token')).toBeUndefined();

      expect(res.headers.get('cache-control')).toContain('private');
      expect(res.headers.get('cache-control')).toContain('no-store');

      const verified = verifyUnifiedSession(sessionCookie?.value);
      expect(verified?.evalToken).toBe('eval-jwt-unified');
    });

    it('preserves leader device binding secret and leader session ID inside same __session cookie', () => {
      const res = NextResponse.json({ ok: true });

      // 1. Leader requests OTP code (attaches device binding)
      attachDeviceBindingCookie(res, 'device-sec-xyz');
      const cookieAfterBinding = res.cookies.get(UNIFIED_SESSION_COOKIE_NAME)?.value;
      const verified1 = verifyUnifiedSession(cookieAfterBinding);
      expect(verified1?.leaderDeviceSecret).toBe('device-sec-xyz');

      // 2. Mock incoming request on verify-code presenting that __session cookie
      const verifyReq = new NextRequest('http://localhost:3000/api/auth/leader/verify-code', {
        headers: {
          cookie: `${UNIFIED_SESSION_COOKIE_NAME}=${cookieAfterBinding}`,
        },
      });
      expect(extractDeviceBindingSecret(verifyReq)).toBe('device-sec-xyz');

      // 3. Leader verifies code (attaches leader session ID without dropping device binding)
      const verifyRes = NextResponse.json({ ok: true });
      attachLeaderSessionCookie(verifyRes, 'leader-session-uuid-999', verifyReq);

      const cookieAfterVerify = verifyRes.cookies.get(UNIFIED_SESSION_COOKIE_NAME)?.value;
      const verified2 = verifyUnifiedSession(cookieAfterVerify);
      expect(verified2?.leaderSessionId).toBe('leader-session-uuid-999');
      expect(verified2?.leaderDeviceSecret).toBe('device-sec-xyz');
    });

    it('allows extractSessionToken and extractLeaderSessionId to transparently read from __session', () => {
      const now = Date.now();
      const signed = signUnifiedSession({
        evalToken: 'eval-token-from-unified',
        leaderSessionId: 'leader-from-unified',
        leaderDeviceSecret: 'device-from-unified',
        iat: now,
        exp: now + 3600 * 1000,
      });

      const req = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          cookie: `${UNIFIED_SESSION_COOKIE_NAME}=${signed}`,
        },
      });

      expect(extractSessionToken(req)).toBe('eval-token-from-unified');
      expect(extractLeaderSessionId(req)).toBe('leader-from-unified');
      expect(extractDeviceBindingSecret(req)).toBe('device-from-unified');
    });

    it('clearing leader session retains evaluation session token in __session', () => {
      const now = Date.now();
      const signed = signUnifiedSession({
        evalToken: 'eval-token-retained',
        leaderSessionId: 'leader-to-clear',
        leaderDeviceSecret: 'device-retained',
        iat: now,
        exp: now + 3600 * 1000,
      });

      const req = new NextRequest('http://localhost:3000/api/logout', {
        headers: {
          cookie: `${UNIFIED_SESSION_COOKIE_NAME}=${signed}`,
        },
      });

      const res = NextResponse.json({ ok: true });
      clearLeaderSessionCookie(res, req);

      const updatedCookie = res.cookies.get(UNIFIED_SESSION_COOKIE_NAME)?.value;
      expect(updatedCookie).toBeDefined();

      const verified = verifyUnifiedSession(updatedCookie);
      expect(verified?.leaderSessionId).toBeUndefined();
      expect(verified?.evalToken).toBe('eval-token-retained');
      expect(verified?.leaderDeviceSecret).toBe('device-retained');
    });

    it('clearing evaluation session retains leader session token and device secret in __session', () => {
      const now = Date.now();
      const signed = signUnifiedSession({
        evalToken: 'eval-token-to-clear',
        leaderSessionId: 'leader-session-retained',
        leaderDeviceSecret: 'device-secret-retained',
        iat: now,
        exp: now + 3600 * 1000,
      });

      const req = new NextRequest('http://localhost:3000/api/auth/logout', {
        headers: {
          cookie: `${UNIFIED_SESSION_COOKIE_NAME}=${signed}`,
        },
      });

      const res = NextResponse.json({ ok: true });
      clearSessionCookie(res, req);

      const updatedCookie = res.cookies.get(UNIFIED_SESSION_COOKIE_NAME)?.value;
      expect(updatedCookie).toBeDefined();

      const verified = verifyUnifiedSession(updatedCookie);
      expect(verified?.evalToken).toBeUndefined();
      expect(verified?.leaderSessionId).toBe('leader-session-retained');
      expect(verified?.leaderDeviceSecret).toBe('device-secret-retained');
    });

    it('ensures worst-case unified __session cookie size is well below 4096-byte browser limit', () => {
      // Simulate worst-case scenario: large evaluation JWT (with all states and districts),
      // full leader session UUID, 64-byte device secret, OAuth state, onboarding ticket
      const largeEvalJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        Buffer.from(JSON.stringify({
          userId: 'usr_state_evaluator_andhra_pradesh_super_admin_99999',
          username: 'evaluation_super_lead_andhra_pradesh_telangana_delhi',
          name: 'Principal State Monitoring and Quality Assurance Director',
          role: 'ADMIN',
          allowedStates: ['Andhra Pradesh', 'Telangana', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Delhi'],
          allowedDistricts: ['Visakhapatnam', 'Krishna', 'Guntur', 'Hyderabad', 'Rangareddy', 'Mumbai Suburban', 'Pune', 'Bangalore Urban'],
          allowedProgrammes: ['CSC_COMMUNITY', 'CSC_INSTITUTIONAL', 'CSC_OUTREACH', 'CSC_NUTRITION_MONITORING'],
          credentialVersion: 42,
          credentialKind: 'STATE_EVALUATION',
          createdAt: Date.now(),
          expiresAt: Date.now() + 28800000,
        })).toString('base64url') +
        '.dGVzdC1zaWduYXR1cmUtd2l0aC1oaWdoLWVudHJvcHktbW9jay1qd3Qtc2lnbmF0dXJl';

      const worstCasePayload = {
        evalToken: largeEvalJwt,
        leaderSessionId: 'sess-leader-e2e-4b9e-b83c-94819e9bf928-extended-session-id',
        leaderDeviceSecret: 'f8c7b6a5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7',
        oauthState: 'oauth_state_nonce_random_string_with_csrf_protection_token_value_xyz123',
        onboardingTicket: 'onboard_ticket_secure_token_hash_value_with_metadata_state_andhra_pradesh_role_supervisor',
        iat: Date.now(),
        exp: Date.now() + 28800000,
      };

      const signed = signUnifiedSession(worstCasePayload);
      const byteLength = Buffer.byteLength(signed, 'utf-8');

      // Assert size limit strictly meets HTTP cookie specifications (RFC 6265 max is 4096 bytes)
      expect(byteLength).toBeLessThan(4096);
      // Realistic upper bound should be around ~1.2KB - ~1.8KB, far below 4KB
      expect(byteLength).toBeLessThan(2048);

      // Verify complete integrity and loss-less round-trip
      const verified = verifyUnifiedSession(signed);
      expect(verified).not.toBeNull();
      expect(verified?.evalToken).toBe(largeEvalJwt);
      expect(verified?.leaderSessionId).toBe(worstCasePayload.leaderSessionId);
      expect(verified?.leaderDeviceSecret).toBe(worstCasePayload.leaderDeviceSecret);
      expect(verified?.oauthState).toBe(worstCasePayload.oauthState);
      expect(verified?.onboardingTicket).toBe(worstCasePayload.onboardingTicket);
    });

    it('deletes __session completely when the last active session field is cleared', () => {
      const now = Date.now();
      const signed = signUnifiedSession({
        evalToken: 'only-eval-token',
        iat: now,
        exp: now + 3600 * 1000,
      });

      const req = new NextRequest('http://localhost:3000/api/logout', {
        headers: {
          cookie: `${UNIFIED_SESSION_COOKIE_NAME}=${signed}`,
        },
      });

      const res = NextResponse.json({ ok: true });
      clearSessionCookie(res, req);

      // Verify deletion
      const deletedCookie = res.cookies.get(UNIFIED_SESSION_COOKIE_NAME);
      expect(deletedCookie?.value === '' || !deletedCookie).toBe(true);
    });
  });

  describe('5. Hostname Verification (Exact Matches, Zero Wildcards)', () => {
    it('resolves exact default hosts without *.a.run.app wildcard', () => {
      delete process.env.STAGING_SERVICE_URL;
      delete process.env.PRODUCTION_URL;
      delete process.env.ALLOWED_HOSTS;
      process.env.APP_ENV = 'production';

      const hosts = getExpectedHosts();
      expect(hosts).toContain('childcare.allianceindia.org');
      expect(hosts).toContain('cs-p3-production.web.app');
      expect(hosts).toContain('cs-p3-production.firebaseapp.com');

      // Zero wildcard presence
      expect(hosts.some((h) => h.includes('*'))).toBe(false);
    });

    it('extracts exact hostnames from STAGING_SERVICE_URL and PRODUCTION_URL', () => {
      process.env.STAGING_SERVICE_URL = 'https://csc-staging-780914444525.asia-south1.run.app';
      process.env.PRODUCTION_URL = 'https://csc-prod-780914444525.asia-south1.run.app';
      process.env.APP_ENV = 'production';

      const hosts = getExpectedHosts();
      expect(hosts).toContain('csc-staging-780914444525.asia-south1.run.app');
      expect(hosts).toContain('csc-prod-780914444525.asia-south1.run.app');
    });

    it('rejects arbitrary unallowlisted *.a.run.app origins', () => {
      process.env.STAGING_SERVICE_URL = 'https://csc-staging-780914444525.asia-south1.run.app';
      process.env.APP_ENV = 'production';

      const attackerReq = new NextRequest('https://csc-staging-780914444525.asia-south1.run.app/api/auth/login', {
        headers: {
          origin: 'https://attacker-service-123456.asia-south1.run.app',
        },
      });

      const check = validateMutationOrigin(attackerReq);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain('Origin mismatch');
    });

    it('accepts legitimate allowlisted service origin', () => {
      process.env.STAGING_SERVICE_URL = 'https://csc-staging-780914444525.asia-south1.run.app';
      process.env.APP_ENV = 'production';

      const legitReq = new NextRequest('https://csc-staging-780914444525.asia-south1.run.app/api/auth/login', {
        headers: {
          origin: 'https://csc-staging-780914444525.asia-south1.run.app',
        },
      });

      const check = validateMutationOrigin(legitReq);
      expect(check.valid).toBe(true);
    });

    it('accepts Firebase Hosting x-fh-requested-host and comma-separated x-forwarded-host in validateMutationOrigin and validateCsrfOrigin', () => {
      process.env.APP_ENV = 'production';
      process.env.ALLOWED_HOSTS = 'childcare.allianceindia.org,cs-p3-production.web.app,csc-production-963330210821.asia-south1.run.app';

      const fhReq = new NextRequest('https://csc-production-s6jv7tgjhq-el.a.run.app/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://childcare.allianceindia.org',
          'x-fh-requested-host': 'childcare.allianceindia.org',
          cookie: '__session=abc.def',
        },
      });
      expect(validateMutationOrigin(fhReq).valid).toBe(true);
      expect(validateCsrfOrigin(fhReq).isValid).toBe(true);

      const multiHopReq = new NextRequest('https://csc-production-s6jv7tgjhq-el.a.run.app/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://childcare.allianceindia.org',
          'x-forwarded-host': 'childcare.allianceindia.org, internal-proxy.local',
          cookie: '__session=abc.def',
        },
      });
      expect(validateMutationOrigin(multiHopReq).valid).toBe(true);
      expect(validateCsrfOrigin(multiHopReq).isValid).toBe(true);

      const badReq = new NextRequest('https://csc-production-s6jv7tgjhq-el.a.run.app/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://evil.attacker.example',
          'x-fh-requested-host': 'childcare.allianceindia.org',
          cookie: '__session=abc.def',
        },
      });
      expect(validateMutationOrigin(badReq).valid).toBe(false);
      expect(validateCsrfOrigin(badReq).isValid).toBe(false);
    });
  });
});
