import crypto from 'crypto';
import * as argon2 from 'argon2';
import { NextRequest, NextResponse } from 'next/server';
import { AuthPolicyRole } from './authorisation';

export interface StoredUserAccount {
  id: string;
  username: string;
  name: string;
  role: AuthPolicyRole;
  allowedStates: string[];
  allowedDistricts: string[];
}

export interface SessionPayload {
  userId: string;
  username: string;
  name: string;
  role: AuthPolicyRole;
  allowedStates: string[];
  allowedDistricts: string[];
  createdAt: number;
  expiresAt: number;
}

const SESSION_COOKIE_NAME = 'evaluation_session_token';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * ARCHITECTURAL DISCLOSURE & PRODUCTION RECOMMENDATIONS:
 *
 * The rate limiting and account lockout mechanism below is maintained in-process via an in-memory Map.
 *
 * Known Limitations:
 * 1. Multi-instance / Serverless Containers: In multi-replica or serverless container environments
 *    (e.g., Render, AWS ECS/Fargate, Vercel), in-memory state is not shared across instances.
 *    An attacker can distribute login attempts across instances without triggering lockout.
 * 2. Ephemeral Storage: Any service restart or rolling deployment wipes in-memory lockout records,
 *    resetting failed attempt counters to zero.
 *
 * Recommended Production Remediation:
 * For production deployments running multi-replica containers or serverless runtimes, replace
 * this in-memory Map with a distributed atomic store such as Redis (e.g., Upstash Redis, AWS ElastiCache)
 * or a database-backed rate-limiter with sliding-window counters (e.g. '@upstash/ratelimit').
 */
interface RateLimitRecord {
  attempts: number;
  lockoutUntil: number | null;
}
const loginAttemptsMap = new Map<string, RateLimitRecord>();

/**
 * Argon2id options adhering to OWASP recommendations:
 * - Type: argon2id (resistant against both GPU attacks and side-channel cache attacks)
 * - Memory Cost: 65,536 KiB (64 MiB)
 * - Time Cost: 3 iterations
 * - Parallelism: 4 threads
 *
 * Library-generated salts: argon2 automatically generates a cryptographically secure,
 * unique 16-byte random salt per hash. No static salts are used.
 */
export const ARGON2_CONFIG: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(plainText: string): Promise<string> {
  const result = await argon2.hash(plainText, ARGON2_CONFIG);
  return String(result);
}

export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}

/**
 * Built-in scoped evaluation accounts.
 * Passwords are supplied strictly via server-side environment variables.
 * Zero plaintext passwords, default fallback credentials, or fixed salts exist in source code.
 */
const SYSTEM_ACCOUNTS: StoredUserAccount[] = [
  {
    id: 'rev-mh-01',
    username: 'reviewer_mh',
    name: 'Maharashtra State Reviewer',
    role: 'STATE_REVIEWER',
    allowedStates: ['Maharashtra'],
    allowedDistricts: ['*'],
  },
  {
    id: 'lead-nat-01',
    username: 'leadership_india',
    name: 'National Programme Leadership',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
  },
  {
    id: 'admin-01',
    username: 'admin',
    name: 'System Administrator',
    role: 'ADMIN',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
  },
];

function getAccountConfiguredPassword(username: string): string | undefined {
  switch (username.toLowerCase()) {
    case 'reviewer_mh':
      return process.env.INITIAL_REV_MH_PWD;
    case 'leadership_india':
      return process.env.INITIAL_LEADERSHIP_PWD;
    case 'admin':
      return process.env.INITIAL_ADMIN_PWD;
    default:
      return undefined;
  }
}

// In-memory cache for Argon2 hashes derived from configured environment variables.
// Avoids re-hashing environment passwords on every authentication attempt.
const passwordHashCache = new Map<string, string>();

export function resetPasswordHashCache(): void {
  passwordHashCache.clear();
}

/**
 * Retrieves the cryptographically secure session signing secret.
 *
 * SECURITY REQUIREMENT: Fail-Closed Policy
 * If SESSION_SECRET is not configured or is fewer than 32 characters, this function
 * throws an error immediately. There is no fallback or hardcoded secret in source code.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      'FATAL: SESSION_SECRET is not configured or does not meet the minimum length requirement (32+ characters). System fails closed.'
    );
  }
  return secret.trim();
}

/**
 * Creates a cryptographically signed session token.
 */
export function signSessionToken(payload: SessionPayload): string {
  const secret = getSessionSecret();
  const json = JSON.stringify(payload);
  const encodedPayload = Buffer.from(json).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Creates a signed session token directly from payload fields.
 */
export function createSessionToken(
  params: Omit<SessionPayload, 'createdAt' | 'expiresAt' | 'username'> & { username?: string; ttlMs?: number }
): string {
  const now = Date.now();
  return signSessionToken({
    ...params,
    username: params.username || params.userId,
    createdAt: now,
    expiresAt: now + (params.ttlMs ?? SESSION_TTL_MS),
  });
}

/**
 * Verifies and parses a signed session token. Returns null if invalid, expired, or unconfigured secret.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }

  const [encodedPayload, providedSig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  const providedBuf = Buffer.from(providedSig);
  const expectedBuf = Buffer.from(expectedSig);

  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const json = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
    const payload: SessionPayload = JSON.parse(json);
    if (!payload.expiresAt || Date.now() > payload.expiresAt) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authenticates user credentials with lockout protection and returns a session token.
 * Uses Argon2id memory-hard password verification.
 */
export async function authenticateUser(
  username: string,
  plainPassword: string,
  clientIp: string = 'unknown'
): Promise<{ success: true; token: string; user: SessionPayload } | { success: false; error: string; statusCode: number }> {
  const now = Date.now();
  const rateKey = `${username.toLowerCase()}_${clientIp}`;
  const rateRecord = loginAttemptsMap.get(rateKey) || { attempts: 0, lockoutUntil: null };

  if (rateRecord.lockoutUntil && now < rateRecord.lockoutUntil) {
    const minutesLeft = Math.ceil((rateRecord.lockoutUntil - now) / 60000);
    return {
      success: false,
      error: `Account temporarily locked due to excessive failed attempts. Please retry in ${minutesLeft} minute(s).`,
      statusCode: 429,
    };
  }

  const account = SYSTEM_ACCOUNTS.find(
    (a) => a.username.toLowerCase() === username.trim().toLowerCase()
  );

  if (!account) {
    recordFailedAttempt(rateKey, rateRecord, now);
    return { success: false, error: 'Invalid username or password.', statusCode: 401 };
  }

  const configuredPassword = getAccountConfiguredPassword(account.username);
  if (!configuredPassword || configuredPassword.trim() === '') {
    console.warn(`[Security Alert] Authentication attempt for '${account.username}' rejected: password is not configured in server environment.`);
    recordFailedAttempt(rateKey, rateRecord, now);
    return { success: false, error: 'Account is not configured on this server.', statusCode: 401 };
  }

  let passwordHash = passwordHashCache.get(account.username);
  if (!passwordHash) {
    passwordHash = await hashPassword(configuredPassword.trim());
    passwordHashCache.set(account.username, passwordHash);
  }

  const isValid = await verifyPassword(passwordHash, plainPassword);

  if (!isValid) {
    recordFailedAttempt(rateKey, rateRecord, now);
    return { success: false, error: 'Invalid username or password.', statusCode: 401 };
  }

  // Clear rate limits on successful authentication
  loginAttemptsMap.delete(rateKey);

  const sessionPayload: SessionPayload = {
    userId: account.id,
    username: account.username,
    name: account.name,
    role: account.role,
    allowedStates: account.allowedStates,
    allowedDistricts: account.allowedDistricts,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };

  const token = signSessionToken(sessionPayload);
  return { success: true, token, user: sessionPayload };
}

function recordFailedAttempt(key: string, record: RateLimitRecord, now: number) {
  record.attempts += 1;
  if (record.attempts >= 5) {
    record.lockoutUntil = now + 15 * 60 * 1000; // 15-minute lockout
  }
  loginAttemptsMap.set(key, record);
}

/**
 * Attaches the secure HttpOnly session cookie to an outgoing response.
 */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });
}

/**
 * Clears the session cookie on logout.
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
}

/**
 * Extracts session token from request cookie or Authorization header.
 */
export function extractSessionToken(req: NextRequest): string | null {
  const cookieToken =
    req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    req.cookies.get('session_token')?.value ||
    req.cookies.get('__session')?.value;
  if (cookieToken) return cookieToken;

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}
