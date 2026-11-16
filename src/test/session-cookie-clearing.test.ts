import { describe, it, expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  shouldClearLeaderSessionCookie,
  UserAccessScope,
} from '@/lib/server/authorisation';
import {
  attachLeaderSessionCookie,
  clearLeaderSessionCookie,
} from '@/lib/server/leaderSessionStore';
import {
  signUnifiedSession,
  verifyUnifiedSession,
  UNIFIED_SESSION_COOKIE_NAME,
} from '@/lib/server/unifiedSessionCookie';

describe('Session Cookie Clearing & Preservation Logic', () => {
  it('1. shouldClearLeaderSessionCookie returns false for verified active sessions', () => {
    const verifiedScope: UserAccessScope = {
      userId: 'leader-01',
      name: 'Dr. Farid Sayyed',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isVerified: true,
      reason: 'verified_leader_session',
    };

    const req = new NextRequest('https://cs-p3-production.web.app/api/auth/session', {
      headers: {
        cookie: '__session=valid-cookie-token',
      },
    });

    const shouldClear = shouldClearLeaderSessionCookie(verifiedScope, req);
    expect(shouldClear).toBe(false);
  });

  it('2. shouldClearLeaderSessionCookie returns false if caller had no session cookie to begin with', () => {
    const unauthenticatedScope: UserAccessScope = {
      userId: 'anonymous-field',
      name: 'Field Worker (Unauthenticated)',
      role: 'FIELD_USER',
      allowedStates: [],
      allowedDistricts: [],
      isVerified: false,
      reason: 'untrusted_fallback',
    };

    const req = new NextRequest('https://cs-p3-production.web.app/api/auth/session');
    // No cookie header

    const shouldClear = shouldClearLeaderSessionCookie(unauthenticatedScope, req);
    expect(shouldClear).toBe(false);
  });

  it('3. shouldClearLeaderSessionCookie returns true for definitive unauthenticated rejection with stale cookie', () => {
    const definitiveRejectionScope: UserAccessScope = {
      userId: 'anonymous-field',
      name: 'Field Worker (Unauthenticated)',
      role: 'FIELD_USER',
      allowedStates: [],
      allowedDistricts: [],
      isVerified: false,
      reason: 'untrusted_fallback',
    };

    const req = new NextRequest('https://cs-p3-production.web.app/api/auth/session', {
      headers: {
        cookie: '__session=stale-pre-cutover-token',
      },
    });

    const shouldClear = shouldClearLeaderSessionCookie(definitiveRejectionScope, req);
    expect(shouldClear).toBe(true);
  });

  it('4. shouldClearLeaderSessionCookie returns false on non-fallback transient reasons', () => {
    const transientScope: UserAccessScope = {
      userId: 'test-runner',
      name: 'Automated Test Runner',
      role: 'ADMIN',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isVerified: true,
      reason: 'test_environment',
    };

    const req = new NextRequest('https://cs-p3-production.web.app/api/auth/session', {
      headers: {
        cookie: '__session=some-token',
      },
    });

    expect(shouldClearLeaderSessionCookie(transientScope, req)).toBe(false);
  });

  it('5. attachLeaderSessionCookie with req preserves existing device binding in unified __session envelope', () => {
    const originalStrategy = process.env.COOKIE_STRATEGY;
    process.env.COOKIE_STRATEGY = 'unified';
    try {
      // Create an initial incoming envelope with device binding
      const initialEnvelope = signUnifiedSession({
        leaderDeviceSecret: 'device-binding-secret-12345',
        iat: Date.now(),
        exp: Date.now() + 86400000,
      });

      const req = new NextRequest('https://cs-p3-production.web.app/api/auth/leader/verify-code', {
        headers: {
          cookie: `__session=${initialEnvelope}`,
        },
      });

      const res = NextResponse.json({ status: 'success' });
      attachLeaderSessionCookie(res, 'new-leader-session-abc', req);

      // Verify Set-Cookie header contains __session
      const setCookieHeader = res.headers.get('set-cookie') || '';
      expect(setCookieHeader).toContain('__session=');

      // Extract cookie value from header
      const match = setCookieHeader.match(/__session=([^;]+)/);
      expect(match).not.toBeNull();
      const cookieVal = match![1];

      const decoded = verifyUnifiedSession(cookieVal);
      expect(decoded).not.toBeNull();
      expect(decoded?.leaderSessionId).toBe('new-leader-session-abc');
      expect(decoded?.leaderDeviceSecret).toBe('device-binding-secret-12345');
    } finally {
      process.env.COOKIE_STRATEGY = originalStrategy;
    }
  });
});
