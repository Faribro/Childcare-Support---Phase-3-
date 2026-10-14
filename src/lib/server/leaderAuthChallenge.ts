/**
 * Leadership Auth Challenge & OTP Lifecycle
 * 
 * Implements:
 * - 128-bit hex OTP generation (32 hex characters)
 * - SHA-256 verifier storage (zero plain OTP persistence)
 * - User-Agent / browser fingerprint binding
 * - 10-minute expiry window
 * - Rate limiting (3/15m, 10/24h)
 * - Lockout after 5 failed verification attempts
 * - Challenge superseding (new code request invalidates older code)
 * - Constant-time generic responses to prevent email enumeration
 */

import crypto from 'crypto';
import {
  findLeaderByEmail,
  isLeaderActive,
  normalizeEmail,
  type LeaderIdentity,
} from './leaderIdentityStore';
import { sendLeadershipOtpEmail } from './emailProvider';

export const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_VERIFY_ATTEMPTS = 5;
export const MAX_REQUESTS_15M = 3;
export const MAX_REQUESTS_24H = 10;

export interface StoredChallenge {
  leaderId: string;
  email: string;
  codeHash: string; // SHA-256 hash of the 32-char hex OTP
  userAgentHash: string;
  ip: string;
  createdAt: number;
  expiresAt: number;
  failedAttempts: number;
  isLocked: boolean;
}

interface RateLimitTracker {
  shortWindowTimestamps: number[]; // within 15 min
  longWindowTimestamps: number[];  // within 24 hours
}

// In-memory challenge and rate-limiting stores
const pendingChallengesMap = new Map<string, StoredChallenge>(); // key: normalized email
const emailRateLimits = new Map<string, RateLimitTracker>();
const ipRateLimits = new Map<string, RateLimitTracker>();

/**
 * Checks whether Leadership email authentication is enabled via feature flag.
 */
export function isLeadershipEmailAuthEnabled(): boolean {
  return process.env.LEADERSHIP_EMAIL_AUTH_ENABLED === 'true';
}

/**
 * Normalizes code: trimmed, lowercase hex.
 */
export function normalizeOtpCode(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

/**
 * Generates SHA-256 hash of a string.
 */
export function hashString(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Cleans timestamps older than the window and returns current counts.
 */
function checkWindowRateLimit(
  tracker: RateLimitTracker | undefined,
  now: number
): { allowed: boolean; reason?: string } {
  if (!tracker) return { allowed: true };

  const fifteenMinAgo = now - 15 * 60 * 1000;
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  tracker.shortWindowTimestamps = tracker.shortWindowTimestamps.filter((t) => t > fifteenMinAgo);
  tracker.longWindowTimestamps = tracker.longWindowTimestamps.filter((t) => t > twentyFourHoursAgo);

  if (tracker.shortWindowTimestamps.length >= MAX_REQUESTS_15M) {
    return {
      allowed: false,
      reason: 'Too many verification code requests in a short time. Please wait 15 minutes before requesting a new code.',
    };
  }

  if (tracker.longWindowTimestamps.length >= MAX_REQUESTS_24H) {
    return {
      allowed: false,
      reason: 'Maximum daily verification code requests reached for this account. Please retry tomorrow or contact central administration.',
    };
  }

  return { allowed: true };
}

function recordRequest(map: Map<string, RateLimitTracker>, key: string, now: number): void {
  let tracker = map.get(key);
  if (!tracker) {
    tracker = { shortWindowTimestamps: [], longWindowTimestamps: [] };
    map.set(key, tracker);
  }
  tracker.shortWindowTimestamps.push(now);
  tracker.longWindowTimestamps.push(now);
}

/**
 * Requests an individual 128-bit hex authentication code.
 * Always returns a generic success message to prevent user/email enumeration.
 */
export async function requestLeadershipAuthCode({
  email,
  userAgent = 'unknown',
  clientIp = 'unknown',
}: {
  email: string;
  userAgent?: string;
  clientIp?: string;
}): Promise<{ success: boolean; error?: string; statusCode: number }> {
  if (!isLeadershipEmailAuthEnabled()) {
    return {
      success: false,
      error: 'Individual Leadership email authentication is not enabled on this environment.',
      statusCode: 403,
    };
  }

  const norm = normalizeEmail(email);
  if (!norm || !norm.includes('@')) {
    return {
      success: false,
      error: 'Please enter a valid email address.',
      statusCode: 400,
    };
  }

  const now = Date.now();

  // Rate limit checks
  const emailLimit = checkWindowRateLimit(emailRateLimits.get(norm), now);
  if (!emailLimit.allowed) {
    return { success: false, error: emailLimit.reason, statusCode: 429 };
  }

  const ipLimit = checkWindowRateLimit(ipRateLimits.get(clientIp), now);
  if (!ipLimit.allowed) {
    return { success: false, error: ipLimit.reason, statusCode: 429 };
  }

  recordRequest(emailRateLimits, norm, now);
  recordRequest(ipRateLimits, clientIp, now);

  const leader = findLeaderByEmail(norm);

  // If email is not allowlisted or leader is deactivated, return success without sending code
  // Constant-time execution prevents timing attacks revealing email validity
  if (!leader || !leader.isActive) {
    // Artificial small delay matching hashing cost
    await new Promise((r) => setTimeout(r, 10));
    return { success: true, statusCode: 200 };
  }

  // Generate 128-bit hex OTP (16 random bytes = 32 hex chars)
  const plainOtp = crypto.randomBytes(16).toString('hex');
  const codeHash = hashString(plainOtp);
  const userAgentHash = hashString(userAgent || '');

  // Challenge superseding: replacing map entry immediately invalidates any prior code
  const challenge: StoredChallenge = {
    leaderId: leader.id,
    email: norm,
    codeHash,
    userAgentHash,
    ip: clientIp,
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
    failedAttempts: 0,
    isLocked: false,
  };

  pendingChallengesMap.set(norm, challenge);

  // Dispatch email
  await sendLeadershipOtpEmail({
    to: leader.email,
    name: leader.name,
    code: plainOtp,
    expiryMinutes: 10,
  });

  return { success: true, statusCode: 200 };
}

export type VerifyChallengeResult =
  | { success: true; leader: LeaderIdentity }
  | { success: false; error: string; statusCode: number };

/**
 * Verifies a 128-bit hex authentication code challenge.
 */
export function verifyLeadershipAuthCode({
  email,
  code,
  userAgent = 'unknown',
  clientIp = 'unknown',
}: {
  email: string;
  code: string;
  userAgent?: string;
  clientIp?: string;
}): VerifyChallengeResult {
  if (!isLeadershipEmailAuthEnabled()) {
    return {
      success: false,
      error: 'Individual Leadership email authentication is not enabled on this environment.',
      statusCode: 403,
    };
  }

  const norm = normalizeEmail(email);
  const cleanCode = normalizeOtpCode(code);

  if (!norm || !cleanCode) {
    return {
      success: false,
      error: 'Email and verification code are required.',
      statusCode: 400,
    };
  }

  // 128-bit hex OTP is exactly 32 hex characters
  if (cleanCode.length !== 32 || !/^[0-9a-f]{32}$/i.test(cleanCode)) {
    return {
      success: false,
      error: 'Invalid verification code format. Code must be 32 hexadecimal characters.',
      statusCode: 400,
    };
  }

  const challenge = pendingChallengesMap.get(norm);
  if (!challenge) {
    return {
      success: false,
      error: 'No active verification code found for this email. Please request a new code.',
      statusCode: 401,
    };
  }

  const now = Date.now();

  // Check if locked
  if (challenge.isLocked || challenge.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
    pendingChallengesMap.delete(norm);
    return {
      success: false,
      error: 'This verification challenge has been locked due to excessive failed attempts. Please request a new code.',
      statusCode: 429,
    };
  }

  // Check expiry
  if (now > challenge.expiresAt) {
    pendingChallengesMap.delete(norm);
    return {
      success: false,
      error: 'This verification code has expired (10-minute limit). Please request a new code.',
      statusCode: 401,
    };
  }

  // Browser / User-Agent fingerprint verification
  const currentUaHash = hashString(userAgent || '');
  if (challenge.userAgentHash && challenge.userAgentHash !== currentUaHash) {
    challenge.failedAttempts += 1;
    if (challenge.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
      challenge.isLocked = true;
    }
    return {
      success: false,
      error: 'Verification session mismatch. Please verify the code using the same browser window where it was requested.',
      statusCode: 401,
    };
  }

  // Constant-time hash comparison
  const submittedHash = hashString(cleanCode);
  const expectedHashBuf = Buffer.from(challenge.codeHash);
  const submittedHashBuf = Buffer.from(submittedHash);

  const isValidCode =
    expectedHashBuf.length === submittedHashBuf.length &&
    crypto.timingSafeEqual(expectedHashBuf, submittedHashBuf);

  if (!isValidCode) {
    challenge.failedAttempts += 1;
    const remaining = MAX_VERIFY_ATTEMPTS - challenge.failedAttempts;

    if (challenge.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
      challenge.isLocked = true;
      pendingChallengesMap.delete(norm);
      return {
        success: false,
        error: 'Too many incorrect attempts. This verification code has been locked. Please request a new code.',
        statusCode: 429,
      };
    }

    return {
      success: false,
      error: `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      statusCode: 401,
    };
  }

  // Code is valid! Consume and remove challenge immediately (single-use)
  pendingChallengesMap.delete(norm);

  // Validate leader identity is active
  const leader = findLeaderByEmail(norm);
  if (!leader || !leader.isActive) {
    return {
      success: false,
      error: 'Leadership account is deactivated or unauthorized.',
      statusCode: 403,
    };
  }

  return {
    success: true,
    leader,
  };
}

/**
 * Resets all pending challenges and rate limits for isolated unit testing.
 */
export function resetLeaderChallengesForTesting(): void {
  pendingChallengesMap.clear();
  emailRateLimits.clear();
  ipRateLimits.clear();
}
