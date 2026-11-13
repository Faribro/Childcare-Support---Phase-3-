/**
 * Unified Session Cookie Engine (__session)
 *
 * FIREBASE HOSTING ARCHITECTURE DISCLOSURE:
 * When routing through Firebase Hosting rewrites to Cloud Run (or Cloud Functions),
 * Firebase Hosting strips all request and response cookies EXCEPT a cookie named exactly `__session`.
 *
 * Furthermore, Firebase Hosting will strip incoming Set-Cookie headers unless Cache-Control
 * is explicitly configured to prevent edge CDN caching (`Cache-Control: private, no-store`).
 *
 * This module provides a unified cryptographic envelope for `__session`:
 * - Multiplexes evaluation session JWT, leader session ID, leader device binding secret,
 *   OAuth state, and onboarding ticket into a single signed JSON envelope.
 * - Cryptographically signed using HMAC-SHA256 with constant-time verification.
 * - Zero security regression: device binding validation and session TTLs remain intact.
 * - Enabled via setting `COOKIE_STRATEGY=unified` or `USE_UNIFIED_SESSION_COOKIE=true`.
 * - Defaults to 'default' (separate individual cookies) for standard or direct Cloud Run deployments.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const UNIFIED_SESSION_COOKIE_NAME = '__session';

export const NO_STORE_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

export type CookieStrategy = 'default' | 'unified';

export interface UnifiedSessionPayload {
  evalToken?: string | null;
  leaderSessionId?: string | null;
  leaderDeviceSecret?: string | null;
  oauthState?: string | null;
  onboardingTicket?: string | null;
  iat: number;
  exp: number;
}

/**
 * Resolves current cookie strategy from environment configuration.
 * Defaults to 'default' (retaining standard individual cookie names).
 */
export function getCookieStrategy(): CookieStrategy {
  if (
    process.env.COOKIE_STRATEGY === 'unified' ||
    process.env.USE_UNIFIED_SESSION_COOKIE === 'true'
  ) {
    return 'unified';
  }
  return 'default';
}

function getCookieSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.INTERNAL_AUTH_SECRET || 'insecure-development-cookie-secret-min-32-chars';
  return secret;
}

/**
 * Signs unified session payload using HMAC-SHA256 with base64url encoding.
 */
export function signUnifiedSession(payload: UnifiedSessionPayload): string {
  const secret = getCookieSecret();
  const rawJson = JSON.stringify(payload);
  const rawB64 = Buffer.from(rawJson, 'utf-8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(rawB64).digest('base64url');
  return `${rawB64}.${signature}`;
}

/**
 * Verifies and parses a unified session cookie string.
 * Rejects tampered, malformed, or expired envelopes with constant-time comparison.
 */
export function verifyUnifiedSession(cookieValue?: string | null): UnifiedSessionPayload | null {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const trimmed = cookieValue.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('.');
  if (parts.length !== 2) {
    // If not in envelope format, check if it's a legacy or raw evaluation JWT token
    if (trimmed.startsWith('ey') || trimmed.split('.').length === 3) {
      return {
        evalToken: trimmed,
        iat: Date.now(),
        exp: Date.now() + 8 * 60 * 60 * 1000,
      };
    }
    return null;
  }

  const [rawB64, signature] = parts;
  try {
    const secret = getCookieSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(rawB64).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(rawB64, 'base64url').toString('utf-8');
    const parsed = JSON.parse(jsonStr) as UnifiedSessionPayload;

    if (!parsed || typeof parsed !== 'object') return null;

    // Reject expired envelope
    if (parsed.exp && Date.now() > parsed.exp) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extracts current unified session envelope from request or response cookies.
 */
export function extractUnifiedEnvelope(
  req?: NextRequest | null,
  res?: NextResponse | null
): UnifiedSessionPayload | null {
  // Check pending response cookies first
  if (res) {
    const resCookie = res.cookies.get(UNIFIED_SESSION_COOKIE_NAME)?.value;
    if (resCookie) {
      const verified = verifyUnifiedSession(resCookie);
      if (verified) return verified;
    }
  }

  // Check incoming request cookies
  if (req) {
    const reqCookie = req.cookies.get(UNIFIED_SESSION_COOKIE_NAME)?.value;
    if (reqCookie) {
      const verified = verifyUnifiedSession(reqCookie);
      if (verified) return verified;
    }
  }

  return null;
}

/**
 * Updates a field in the unified __session cookie on the response.
 * Enforces Cache-Control: private, no-store on all cookie-setting responses.
 */
export function setUnifiedCookieField(
  res: NextResponse,
  update: Partial<UnifiedSessionPayload>,
  req?: NextRequest | null
): void {
  // Enforce anti-caching headers so Firebase Hosting passes Set-Cookie through
  for (const [k, v] of Object.entries(NO_STORE_CACHE_HEADERS)) {
    res.headers.set(k, v);
  }

  const now = Date.now();
  const existing = extractUnifiedEnvelope(req, res);

  // Compute maximum lifetime from active components (default 8 hours; device binding allows up to 30 days)
  const defaultTtlMs = 8 * 60 * 60 * 1000;
  const deviceBindingTtlMs = 30 * 24 * 60 * 60 * 1000;

  let ttlMs = defaultTtlMs;
  if (update.leaderDeviceSecret || existing?.leaderDeviceSecret) {
    ttlMs = deviceBindingTtlMs;
  }

  const merged: UnifiedSessionPayload = {
    ...existing,
    ...update,
    iat: existing?.iat || now,
    exp: now + ttlMs,
  };

  const signed = signUnifiedSession(merged);
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookies.set(UNIFIED_SESSION_COOKIE_NAME, signed, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ttlMs / 1000),
  });
}

/**
 * Clears a specific field from the unified __session cookie.
 * If no session tokens remain, deletes the __session cookie entirely.
 */
export function clearUnifiedCookieField(
  res: NextResponse,
  field: keyof Omit<UnifiedSessionPayload, 'iat' | 'exp'>,
  req?: NextRequest | null
): void {
  for (const [k, v] of Object.entries(NO_STORE_CACHE_HEADERS)) {
    res.headers.set(k, v);
  }

  const existing = extractUnifiedEnvelope(req, res);
  if (!existing) {
    res.cookies.delete(UNIFIED_SESSION_COOKIE_NAME);
    return;
  }

  delete existing[field];

  const hasRemainingSession = Boolean(
    existing.evalToken ||
    existing.leaderSessionId ||
    existing.leaderDeviceSecret ||
    existing.oauthState ||
    existing.onboardingTicket
  );

  if (!hasRemainingSession) {
    res.cookies.delete(UNIFIED_SESSION_COOKIE_NAME);
  } else {
    const isProduction = process.env.NODE_ENV === 'production';
    const signed = signUnifiedSession(existing);
    const remainingSeconds = Math.max(1, Math.floor((existing.exp - Date.now()) / 1000));
    res.cookies.set(UNIFIED_SESSION_COOKIE_NAME, signed, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: remainingSeconds,
    });
  }
}
