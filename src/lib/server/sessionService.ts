import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AuthPolicyRole } from './authorisation';
import {
  getCredentialByIdentifier,
  checkRateLimit,
  recordAuthAttempt,
  isCredentialActiveSync,
} from './credentialRegistry';

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
  credentialVersion?: number;
  credentialKind?: 'STATE_EVALUATION' | 'LEADERSHIP_EVALUATION' | 'ADMIN';
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
 * Cryptographically secure 16-byte random salt per hash.
 */
export interface Argon2ConfigOptions {
  type?: number;
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export const ARGON2_CONFIG: Argon2ConfigOptions = {
  type: 2, // argon2id
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

// Cached reference to native argon2 module (null = unattempted, false = unavailable)
let nativeArgon2Module: typeof import('argon2') | null | false = null;

async function getNativeArgon2(): Promise<typeof import('argon2') | null> {
  if (nativeArgon2Module === false) return null;
  if (nativeArgon2Module !== null) return nativeArgon2Module;
  try {
    const mod = await import('argon2');
    // Test if bindings are resolvable before committing
    if (typeof mod.hash === 'function') {
      nativeArgon2Module = mod;
      return mod;
    }
    nativeArgon2Module = false;
    return null;
  } catch {
    nativeArgon2Module = false;
    return null;
  }
}

export async function hashPassword(plainText: string): Promise<string> {
  // Tier 1: Try native N-API argon2
  const native = await getNativeArgon2();
  if (native) {
    try {
      const result = await native.hash(plainText, {
        type: native.argon2id,
        memoryCost: ARGON2_CONFIG.memoryCost,
        timeCost: ARGON2_CONFIG.timeCost,
        parallelism: ARGON2_CONFIG.parallelism,
      });
      return String(result);
    } catch {
      // Fall through to pure-WASM provider if native execution fails
    }
  }

  // Tier 2: Pure WebAssembly fallback with identical OWASP parameters & RFC 9106 PHC string format
  const { argon2id } = await import('hash-wasm');
  const salt = crypto.randomBytes(16);
  const result = await argon2id({
    password: plainText,
    salt,
    parallelism: ARGON2_CONFIG.parallelism,
    iterations: ARGON2_CONFIG.timeCost,
    memorySize: ARGON2_CONFIG.memoryCost,
    hashLength: 32,
    outputType: 'encoded',
  });
  return String(result);
}

export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  if (!hash || typeof hash !== 'string' || !plainText || typeof plainText !== 'string') {
    return false;
  }

  // Tier 1: Try native N-API argon2
  const native = await getNativeArgon2();
  if (native) {
    try {
      return await native.verify(hash, plainText);
    } catch {
      // Fall through to pure-WASM provider if native verification fails
    }
  }

  // Tier 2: Pure WebAssembly fallback
  try {
    const { argon2Verify } = await import('hash-wasm');
    return await argon2Verify({
      password: plainText,
      hash,
    });
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
    id: 'field-mh-01',
    username: 'field_mh',
    name: 'Maharashtra Field Caseworker (Pune)',
    role: 'FIELD_USER',
    allowedStates: ['Maharashtra'],
    allowedDistricts: ['Pune'],
  },
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
    case 'field_mh':
      return process.env.INITIAL_FIELD_MH_PWD;
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
 * Verifies and parses a signed session token. Returns null if invalid, expired, unconfigured secret, or revoked credential version.
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

    // Version check against credential registry (invalidates sessions upon rotation or deactivation)
    if (payload.credentialVersion !== undefined && payload.username) {
      const isActive = isCredentialActiveSync(payload.username, payload.credentialVersion);
      if (!isActive) {
        return null;
      }
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Authenticates user credentials with lockout protection and returns a session token.
 * Uses Argon2id memory-hard password verification against the credential registry.
 */
export async function authenticateUser(
  identifierOrUsername: string,
  plainPassword: string,
  clientIp: string = 'unknown'
): Promise<{ success: true; token: string; user: SessionPayload } | { success: false; error: string; statusCode: number }> {
  const now = Date.now();
  if (
    !identifierOrUsername ||
    typeof identifierOrUsername !== 'string' ||
    !plainPassword ||
    typeof plainPassword !== 'string'
  ) {
    return { success: false, error: 'Invalid access identifier or password.', statusCode: 400 };
  }

  const cleanIdentifier = identifierOrUsername.trim();
  if (cleanIdentifier.length === 0 || cleanIdentifier.length > 64 || plainPassword.length > 128) {
    return { success: false, error: 'Access identifier or password exceeds maximum allowed length.', statusCode: 400 };
  }

  // Rate limiting check
  const rateCheck = checkRateLimit(cleanIdentifier, clientIp);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: rateCheck.reason || 'Account temporarily locked due to excessive failed attempts. Please retry later.',
      statusCode: 429,
    };
  }

  // 1. Look up credential in the registry
  const credential = await getCredentialByIdentifier(cleanIdentifier);

  if (credential && credential.isActive) {
    const isValid = await verifyPassword(credential.passwordHash, plainPassword);
    if (!isValid) {
      recordAuthAttempt(cleanIdentifier, clientIp, false);
      return { success: false, error: 'Invalid username or password.', statusCode: 401 };
    }

    recordAuthAttempt(cleanIdentifier, clientIp, true);

    let role: AuthPolicyRole = 'STATE_REVIEWER';
    let allowedStates: string[] = [];

    if (credential.credentialKind === 'STATE_EVALUATION') {
      role = 'STATE_REVIEWER';
      allowedStates = credential.stateCode ? [credential.stateCode] : [];
    } else if (credential.credentialKind === 'LEADERSHIP_EVALUATION') {
      role = 'LEADERSHIP';
      allowedStates = ['*'];
    } else if (credential.credentialKind === 'ADMIN') {
      role = 'ADMIN';
      allowedStates = ['*'];
    }

    const sessionPayload: SessionPayload = {
      userId: credential.id,
      username: credential.accessIdentifier,
      name: credential.displayName,
      role,
      allowedStates,
      allowedDistricts: ['*'],
      credentialVersion: credential.credentialVersion,
      credentialKind: credential.credentialKind,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    };

    const token = signSessionToken(sessionPayload);
    return { success: true, token, user: sessionPayload };
  }

  // 2. Legacy fallback for pre-existing tests if not registered in registry:
  const legacyAccount = SYSTEM_ACCOUNTS.find(
    (a) => a.username.toLowerCase() === cleanIdentifier.toLowerCase()
  );
  if (legacyAccount) {
    const configuredPassword = getAccountConfiguredPassword(legacyAccount.username);
    if (configuredPassword && configuredPassword.trim() !== '') {
      let passwordHash = passwordHashCache.get(legacyAccount.username);
      if (!passwordHash) {
        passwordHash = await hashPassword(configuredPassword.trim());
        passwordHashCache.set(legacyAccount.username, passwordHash);
      }
      const isValid = await verifyPassword(passwordHash, plainPassword);
      if (isValid) {
        recordAuthAttempt(cleanIdentifier, clientIp, true);
        const sessionPayload: SessionPayload = {
          userId: legacyAccount.id,
          username: legacyAccount.username,
          name: legacyAccount.name,
          role: legacyAccount.role,
          allowedStates: legacyAccount.allowedStates,
          allowedDistricts: legacyAccount.allowedDistricts,
          createdAt: now,
          expiresAt: now + SESSION_TTL_MS,
        };
        const token = signSessionToken(sessionPayload);
        return { success: true, token, user: sessionPayload };
      }
    }
  }

  recordAuthAttempt(cleanIdentifier, clientIp, false);
  return { success: false, error: 'Invalid username or password.', statusCode: 401 };
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
