/**
 * app-url-resolution.test.ts
 *
 * Regression test suite ensuring no internal container listener (0.0.0.0, :8080, loopback)
 * ever leaks into public redirects, OAuth parameters, or API responses.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  isInternalHost,
  getPublicAppBaseUrl,
  resolveSafeRedirectUrl,
  DEFAULT_PUBLIC_APP_URL,
} from '@/lib/server/appUrl';
import { GET as googleLoginGet } from '@/app/api/auth/google/login/route';
import { GET as googleCallbackGet } from '@/app/api/auth/google/callback/route';
import { buildGoogleAuthUrl } from '@/lib/server/googleAuth';

describe('App URL Resolution & Container Leak Prevention Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.APP_BASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. isInternalHost Detection', () => {
    it('identifies 0.0.0.0 and port variants as internal', () => {
      expect(isInternalHost('0.0.0.0')).toBe(true);
      expect(isInternalHost('0.0.0.0:8080')).toBe(true);
      expect(isInternalHost('0.0.0.0:3000')).toBe(true);
      expect(isInternalHost('127.0.0.1')).toBe(true);
      expect(isInternalHost('127.0.0.1:8080')).toBe(true);
      expect(isInternalHost('localhost:8080')).toBe(true);
      expect(isInternalHost('')).toBe(true);
      expect(isInternalHost(null)).toBe(true);
      expect(isInternalHost(undefined)).toBe(true);
    });

    it('identifies production public domains as valid (non-internal)', () => {
      expect(isInternalHost('childcare.allianceindia.org')).toBe(false);
      expect(isInternalHost('cs-p3-production.web.app')).toBe(false);
      expect(isInternalHost('cs-p3-production.firebaseapp.com')).toBe(false);
      expect(isInternalHost('csc-staging-963330210821.asia-south1.run.app')).toBe(false);
    });

    it('rejects localhost when in production or staging mode', () => {
      process.env.APP_ENV = 'staging';
      expect(isInternalHost('localhost')).toBe(true);
      expect(isInternalHost('localhost:3000')).toBe(true);
    });
  });

  describe('2. getPublicAppBaseUrl Canonical Resolution', () => {
    it('prefers forwarded host from reverse proxy (Firebase Hosting / GCP LB)', () => {
      const req = new NextRequest('http://0.0.0.0:8080/api/auth/google/login', {
        headers: {
          'x-forwarded-host': 'childcare.allianceindia.org',
          'x-forwarded-proto': 'https',
        },
      });

      const url = getPublicAppBaseUrl(req);
      expect(url).toBe('https://childcare.allianceindia.org');
      expect(url).not.toContain('0.0.0.0');
      expect(url).not.toContain('8080');
    });

    it('prefers x-fh-requested-host from Firebase Hosting rewrites', () => {
      const req = new NextRequest('http://0.0.0.0:8080/api/auth/google/login', {
        headers: {
          'x-fh-requested-host': 'cs-p3-production.web.app',
          'x-forwarded-proto': 'https',
        },
      });

      const url = getPublicAppBaseUrl(req);
      expect(url).toBe('https://cs-p3-production.web.app');
    });

    it('falls back to configured env var when request host is internal 0.0.0.0:8080', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://childcare.allianceindia.org';
      const req = new NextRequest('http://0.0.0.0:8080/api/test', {
        headers: {
          host: '0.0.0.0:8080',
        },
      });

      const url = getPublicAppBaseUrl(req);
      expect(url).toBe('https://childcare.allianceindia.org');
      expect(url).not.toContain('0.0.0.0');
      expect(url).not.toContain('8080');
    });

    it('falls back to DEFAULT_PUBLIC_APP_URL if all headers and env vars are unset', () => {
      const req = new NextRequest('http://0.0.0.0:8080/api/test');
      const url = getPublicAppBaseUrl(req);
      expect(url).toBe(DEFAULT_PUBLIC_APP_URL);
    });
  });

  describe('3. resolveSafeRedirectUrl Sanitization', () => {
    it('sanitizes relative paths to public base URL', () => {
      const req = new NextRequest('http://0.0.0.0:8080/api/test', {
        headers: {
          'x-forwarded-host': 'childcare.allianceindia.org',
          'x-forwarded-proto': 'https',
        },
      });

      const redirect = resolveSafeRedirectUrl('/assessment/new?onboarding=direct', req);
      expect(redirect.toString()).toBe('https://childcare.allianceindia.org/assessment/new?onboarding=direct');
      expect(redirect.host).toBe('childcare.allianceindia.org');
    });

    it('intercepts and neutralizes incoming 0.0.0.0:8080 URLs', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://childcare.allianceindia.org';
      const redirect = resolveSafeRedirectUrl('http://0.0.0.0:8080/assessment/new?notice=error');
      expect(redirect.toString()).toBe('https://childcare.allianceindia.org/assessment/new?notice=error');
      expect(redirect.toString()).not.toContain('0.0.0.0');
      expect(redirect.toString()).not.toContain(':8080');
    });
  });

  describe('4. Google OAuth Flow Leak Prevention', () => {
    it('ensures GET /api/auth/google/login redirect header never contains 0.0.0.0 or :8080', async () => {
      delete process.env.GOOGLE_CLIENT_ID; // Force unconfigured fallback redirect

      const req = new NextRequest('http://0.0.0.0:8080/api/auth/google/login?returnTo=/assessment/new', {
        headers: {
          'x-forwarded-host': 'childcare.allianceindia.org',
          'x-forwarded-proto': 'https',
        },
      });

      const res = await googleLoginGet(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBeDefined();
      expect(location).toBe('https://childcare.allianceindia.org/assessment/new?onboarding=direct&notice=google_auth_not_configured');
      expect(location).not.toContain('0.0.0.0');
      expect(location).not.toContain(':8080');
    });

    it('ensures buildGoogleAuthUrl sets redirect_uri to public domain, never 0.0.0.0:8080', () => {
      process.env.GOOGLE_CLIENT_ID = 'valid-google-client-id-123';
      const req = new NextRequest('http://0.0.0.0:8080/api/auth/google/login', {
        headers: {
          'x-forwarded-host': 'childcare.allianceindia.org',
          'x-forwarded-proto': 'https',
        },
      });

      const { authUrl } = buildGoogleAuthUrl(req, '/assessment/new');
      const parsed = new URL(authUrl);
      const redirectUri = parsed.searchParams.get('redirect_uri');

      expect(redirectUri).toBe('https://childcare.allianceindia.org/api/auth/google/callback');
      expect(redirectUri).not.toContain('0.0.0.0');
      expect(redirectUri).not.toContain(':8080');
    });

    it('ensures GET /api/auth/google/callback cancellation redirects to public domain', async () => {
      const req = new NextRequest('http://0.0.0.0:8080/api/auth/google/callback?error=access_denied', {
        headers: {
          'x-forwarded-host': 'childcare.allianceindia.org',
          'x-forwarded-proto': 'https',
        },
      });

      const res = await googleCallbackGet(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('https://childcare.allianceindia.org/app?auth_cancelled=1');
      expect(location).not.toContain('0.0.0.0');
      expect(location).not.toContain(':8080');
    });
  });
});
