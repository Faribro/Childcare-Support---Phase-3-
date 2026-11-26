/**
 * Dynamic Staff Access Code Gate Service
 *
 * Responsibilities:
 * - Resolves 3-digit LGD State/UT PINs (001-038) strictly as UI routing hints
 *   to scope the Staff Access modal to a single State Team (never grants auth).
 * - Verifies confidential server-only ADMIN_PORTAL_ACCESS_CODE (fails closed if unset,
 *   rejected if it collides with any 3-digit LGD State code, rate-limited per IP).
 * - Issues short-lived HMAC-signed HttpOnly cookies (csc_admin_gate) unlocking
 *   server-side delivery of allowlisted Administrator contacts ({ id, name, email }
 *   only; zero titles, zero secrets) to /leadership/login?gate=1.
 */

import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { resolveStateByLgdNumericCode } from '@/lib/constants/stateCatalog';
import { getActiveLeaderIdentities, type LeaderIdentity } from './leaderIdentityStore';
import { getLeaderAuthStore } from './leaderAuthStore';
import { getOnboardingStore } from './onboardingStore';
import { getSessionSecret } from './sessionService';

export const STAFF_ACCESS_GATE_COOKIE = 'csc_admin_gate';
export const STAFF_ACCESS_GATE_HEADER = 'x-admin-gate';
export const ADMIN_GATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const GATE_PROBE_LIMIT_15M = 15;
const GATE_PROBE_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AdminGateContact {
  id: string;
  name: string;
  email: string;
}

export type StaffAccessGateVerificationResult =
  | {
      ok: true;
      mode: 'state_team';
      state: string;
      lgdNumericCode: string;
      isoCode: string;
    }
  | {
      ok: true;
      mode: 'administration';
      redirectUrl: string;
      gateToken: string;
      leaders: AdminGateContact[];
    }
  | {
      ok: false;
      statusCode: number;
      code: string;
      error: string;
      retryAfterSeconds?: number;
    };

function sha256TimingSafeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getGateSigningSecret(): string {
  try {
    return getSessionSecret();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    const devSecret = (
      process.env.SESSION_SECRET ||
      process.env.WEBHOOK_SECRET ||
      process.env.ADMIN_PORTAL_ACCESS_CODE ||
      'dev-test-staff-gate-signing-key-32bytes'
    ).trim();
    return devSecret;
  }
}

/**
 * Returns the configured confidential Administration access code, or null if
 * unset or colliding with a canonical 3-digit LGD State/UT code.
 */
export function getConfiguredAdminAccessCode(): string | null {
  const raw = (process.env.ADMIN_PORTAL_ACCESS_CODE || '').trim();
  if (!raw) return null;
  if (resolveStateByLgdNumericCode(raw) !== null) {
    console.error('[STAFF_ACCESS_GATE:CONFIG_ERROR] ADMIN_PORTAL_ACCESS_CODE collides with a canonical 3-digit State LGD code; ignoring.');
    return null;
  }
  return raw;
}

/**
 * Creates an HMAC-SHA256 signed short-lived token proving the caller passed the
 * Administration access gate before reaching /leadership/login.
 */
export function createLeaderGateCookieToken(now = Date.now()): string {
  const secret = getGateSigningSecret();
  const payload = {
    scope: 'admin_gate',
    iat: now,
    exp: now + ADMIN_GATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

/**
 * Verifies an HMAC-SHA256 signed Administration gate cookie token.
 */
export function verifyLeaderGateCookieToken(token?: string | null, now = Date.now()): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  let secret: string;
  try {
    secret = getGateSigningSecret();
  } catch {
    return false;
  }

  const [encoded, providedSig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const providedBuf = Buffer.from(providedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (parsed?.scope !== 'admin_gate') return false;
    if (typeof parsed?.exp !== 'number' || now > parsed.exp) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies an Administration gate request by checking BOTH the `csc_admin_gate`
 * cookie and the `X-Admin-Gate` request header (needed behind Firebase Hosting,
 * which strips non-`__session` cookies before forwarding to Cloud Run).
 */
export function verifyLeaderGateRequest(req: NextRequest, now = Date.now()): boolean {
  const cookieToken = req.cookies.get(STAFF_ACCESS_GATE_COOKIE)?.value?.trim();
  if (cookieToken && verifyLeaderGateCookieToken(cookieToken, now)) {
    return true;
  }
  const headerToken = req.headers.get(STAFF_ACCESS_GATE_HEADER)?.trim();
  if (headerToken && verifyLeaderGateCookieToken(headerToken, now)) {
    return true;
  }
  return false;
}

function isSecureCookieRequest(req?: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  if (!req) return true;
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl?.protocol || '';
  return proto.includes('https');
}

export function setAdminGateCookie(res: NextResponse, token: string, req?: NextRequest): void {
  res.cookies.set(STAFF_ACCESS_GATE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieRequest(req),
    path: '/',
    maxAge: Math.floor(ADMIN_GATE_TTL_MS / 1000),
  });
}

export function clearAdminGateCookie(res: NextResponse, req?: NextRequest): void {
  res.cookies.set(STAFF_ACCESS_GATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieRequest(req),
    path: '/',
    maxAge: 0,
  });
}

/**
 * Resolves active allowlisted Administrators returning strictly `{ id, name, email }`.
 * Deliberately excludes job titles and excludes synthetic @example.org placeholders
 * in production or whenever real administrator identities are loaded.
 */
export async function resolveActiveLeaderContacts(): Promise<AdminGateContact[]> {
  const byEmail = new Map<string, AdminGateContact>();

  const collect = (leaders: LeaderIdentity[]) => {
    for (const leader of leaders) {
      if (!leader?.isActive) continue;
      const email = (leader.email || '').trim().toLowerCase();
      if (!EMAIL_REGEX.test(email)) continue;
      if (!byEmail.has(email)) {
        byEmail.set(email, {
          id: leader.id,
          name: (leader.name || email).trim(),
          email,
        });
      }
    }
  };

  collect(getActiveLeaderIdentities());

  try {
    const authStore = getLeaderAuthStore();
    if (typeof authStore.listActiveLeaderIdentities === 'function') {
      const storeLeaders = await authStore.listActiveLeaderIdentities();
      collect(storeLeaders);
    }
  } catch {
    // Non-fatal: rely cleanly on already-loaded allowlist identities
  }

  const all = Array.from(byEmail.values());
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.APP_ENV === 'production';
  if (isProduction) {
    return all.filter((c) => !c.email.endsWith('@example.org'));
  }
  return all;
}

/**
 * Verifies a Staff Access gate entry:
 * - Exact 3-digit LGD State/UT code (001-038) -> unlocks state-scoped State Team UI
 * - Matching ADMIN_PORTAL_ACCESS_CODE -> issues signed gate token + allowlisted admin contacts
 * - Any other input -> rate-limited, generic 401 failure without leaking configuration status
 */
export async function verifyStaffAccessGateCode(params: {
  rawCode?: string | null;
  clientIp?: string;
}): Promise<StaffAccessGateVerificationResult> {
  const trimmed = typeof params.rawCode === 'string' ? params.rawCode.trim() : '';
  if (!trimmed) {
    return {
      ok: false,
      statusCode: 400,
      code: 'CODE_REQUIRED',
      error: 'Please enter a valid 3-digit State code or Administration access code.',
    };
  }

  const stateEntry = resolveStateByLgdNumericCode(trimmed);
  if (stateEntry) {
    return {
      ok: true,
      mode: 'state_team',
      state: stateEntry.canonicalName,
      lgdNumericCode: stateEntry.lgdNumericCode,
      isoCode: stateEntry.isoCode,
    };
  }

  const now = Date.now();
  const safeIp = (params.clientIp || 'unknown').replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 64) || 'unknown';
  const store = getOnboardingStore();
  const rl = await store.checkRateLimit(
    `staff-gate-probe:${safeIp}`,
    now,
    GATE_PROBE_LIMIT_15M,
    GATE_PROBE_WINDOW_MS
  );
  if (!rl.allowed) {
    return {
      ok: false,
      statusCode: 429,
      code: 'RATE_LIMITED',
      error: `Too many access code attempts. Please retry in ${rl.retryAfterSeconds || 60} seconds.`,
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  const configuredAdminCode = getConfiguredAdminAccessCode();
  if (configuredAdminCode && sha256TimingSafeEqual(trimmed, configuredAdminCode)) {
    const [leaders] = await Promise.all([resolveActiveLeaderContacts()]);
    const gateToken = createLeaderGateCookieToken(now);
    return {
      ok: true,
      mode: 'administration',
      redirectUrl: '/leadership/login?gate=1',
      gateToken,
      leaders,
    };
  }

  return {
    ok: false,
    statusCode: 401,
    code: 'INVALID_ACCESS_CODE',
    error: 'Invalid State PIN or Administration access code.',
  };
}
