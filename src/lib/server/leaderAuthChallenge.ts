/**
 * Leadership Auth Challenge & OTP Lifecycle
 * 
 * Implements:
 * - 128-bit hex OTP generation (32 hex characters)
 * - SHA-256 verifier storage (zero plain OTP persistence)
 * - Server-issued HttpOnly device binding token verification
 * - 10-minute expiry window
 * - Rate limiting (3/15m, 10/24h)
 * - Atomic lockout after 5 failed verification attempts
 * - Challenge superseding (new code request invalidates older code)
 * - Invalidation on email dispatch failure
 * - Constant-time generic responses to prevent email enumeration
 */

import crypto from 'crypto';
import {
  findLeaderByEmail,
  findLeaderById,
  normalizeEmail,
  type LeaderIdentity,
} from './leaderIdentityStore';
import { sendLeadershipOtpEmail } from './emailProvider';
import {
  getLeaderAuthStore,
  CHALLENGE_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
  LEADER_ABSOLUTE_LIFETIME_MS,
  type LeaderAuthChallengeRecord,
  type LeaderSessionRecord,
} from './leaderAuthStore';
export {
  CHALLENGE_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
  LEADER_ABSOLUTE_LIFETIME_MS,
};


/**
 * Checks whether Leadership email authentication is enabled via feature flag.
 */
export function isLeadershipEmailAuthEnabled(): boolean {
  return (
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_LEADERSHIP_EMAIL_AUTH_ENABLED === 'true'
  );
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
 * Generates a new 256-bit cryptographically secure device secret for browser binding.
 */
export function generateDeviceBindingSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Requests an individual 128-bit hex authentication code.
 * Supports requesting via email or authorized leaderId.
 * Always dispatches strictly to the server-verified stored email.
 * Always returns a generic success message to prevent user/email enumeration.
 */
export async function requestLeadershipAuthCode({
  email,
  leaderId,
  deviceBindingSecret,
  userAgent = 'unknown',
  clientIp = 'unknown',
}: {
  email?: string;
  leaderId?: string;
  deviceBindingSecret: string;
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

  const store = getLeaderAuthStore();
  const now = Date.now();

  let leader: LeaderIdentity | null = null;
  let targetEmail = '';

  if (leaderId && typeof leaderId === 'string') {
    leader = findLeaderById(leaderId.trim());
    if (leader) {
      targetEmail = normalizeEmail(leader.email);
    }
  } else if (email && typeof email === 'string') {
    targetEmail = normalizeEmail(email);
    leader = findLeaderByEmail(targetEmail);
  }

  if (!targetEmail || !targetEmail.includes('@')) {
    return {
      success: false,
      error: 'Please provide a valid email or select a valid leadership profile.',
      statusCode: 400,
    };
  }

  // Distributed Rate Limiting Checks
  const emailRateKey = `rate:email:${targetEmail}`;
  const emailLimit = await store.checkAndRecordRateLimit(emailRateKey, now);
  if (!emailLimit.allowed) {
    return { success: false, error: emailLimit.reason, statusCode: 429 };
  }

  const ipRateKey = `rate:ip:${clientIp}`;
  const ipLimit = await store.checkAndRecordRateLimit(ipRateKey, now);
  if (!ipLimit.allowed) {
    return { success: false, error: ipLimit.reason, statusCode: 429 };
  }

  // If email is not allowlisted or leader is inactive, return generic success
  // Artificial small delay prevents timing attacks
  if (!leader || !leader.isActive) {
    await new Promise((r) => setTimeout(r, 15));
    return { success: true, statusCode: 200 };
  }

  // Supersede prior unused challenges for this leader
  await store.supersedePriorChallenges(targetEmail, leader.id);

  // Generate 128-bit hex OTP (16 random bytes = 32 hex chars)
  const plainOtp = crypto.randomBytes(16).toString('hex');
  const codeHash = hashString(plainOtp);
  const deviceBindingHash = hashString(deviceBindingSecret);
  const userAgentHash = hashString(userAgent || '');
  const challengeId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

  const challenge: LeaderAuthChallengeRecord = {
    challengeId,
    leaderId: leader.id,
    email: targetEmail,
    codeHash,
    deviceBindingHash,
    userAgentHash,
    ip: clientIp,
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
    failedAttempts: 0,
    isUsed: false,
    isLocked: false,
  };

  await store.createChallenge(challenge);

  // Dispatch email directly to server-stored approved email
  const emailResult = await sendLeadershipOtpEmail({
    to: leader.email,
    name: leader.name,
    code: plainOtp,
    expiryMinutes: 10,
  });

  if (!emailResult.success) {
    // Invalidate challenge immediately on transmission failure
    await store.invalidateChallenge(challengeId);
    return {
      success: false,
      error: 'Unable to deliver verification code. Please check configuration or try again later.',
      statusCode: 502,
    };
  }

  return { success: true, statusCode: 200 };
}

export type VerifyChallengeResult =
  | { success: true; session: LeaderSessionRecord; leader: LeaderIdentity }
  | { success: false; error: string; statusCode: number };

/**
 * Atomically verifies a 128-bit hex authentication code and creates a session.
 */
export async function verifyLeadershipAuthCode({
  email,
  leaderId,
  code,
  deviceBindingSecret,
  userAgent = 'unknown',
  clientIp = 'unknown',
}: {
  email?: string;
  leaderId?: string;
  code: string;
  deviceBindingSecret?: string;
  userAgent?: string;
  clientIp?: string;
}): Promise<VerifyChallengeResult> {
  if (!isLeadershipEmailAuthEnabled()) {
    return {
      success: false,
      error: 'Individual Leadership email authentication is not enabled on this environment.',
      statusCode: 403,
    };
  }

  let leader: LeaderIdentity | null = null;
  let norm = '';

  if (leaderId && typeof leaderId === 'string') {
    leader = findLeaderById(leaderId.trim());
    if (leader) {
      norm = normalizeEmail(leader.email);
    }
  } else if (email && typeof email === 'string') {
    norm = normalizeEmail(email);
    leader = findLeaderByEmail(norm);
  }

  const cleanCode = normalizeOtpCode(code);

  if (!norm || !cleanCode) {
    return {
      success: false,
      error: 'Valid identifier and verification code are required.',
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

  if (!deviceBindingSecret) {
    return {
      success: false,
      error: 'Device binding token missing. Please ensure cookies are enabled.',
      statusCode: 401,
    };
  }

  const store = getLeaderAuthStore();
  const challenge = await store.getPendingChallenge(norm);

  if (!challenge) {
    return {
      success: false,
      error: 'No active verification code found for this email. Please request a new code.',
      statusCode: 401,
    };
  }

  if (!leader) {
    leader = findLeaderByEmail(norm);
  }
  if (!leader || !leader.isActive) {
    await store.invalidateChallenge(challenge.challengeId);
    return {
      success: false,
      error: 'Leadership account is deactivated or unauthorized.',
      statusCode: 403,
    };
  }

  const submittedCodeHash = hashString(cleanCode);
  const deviceBindingHash = hashString(deviceBindingSecret);
  const now = Date.now();

  const outcome = await store.consumeChallengeAndCreateSession({
    challengeId: challenge.challengeId,
    submittedCodeHash,
    deviceBindingHash,
    leader,
    now,
    absoluteLifetimeMs: LEADER_ABSOLUTE_LIFETIME_MS,
  });

  if (!outcome.success || !outcome.session) {
    return {
      success: false,
      error: outcome.error || 'Verification failed.',
      statusCode: outcome.statusCode || 401,
    };
  }

  return {
    success: true,
    session: outcome.session,
    leader,
  };
}

/**
 * Resets challenges and rate limits for testing.
 */
export async function resetLeaderChallengesForTesting(): Promise<void> {
  const store = getLeaderAuthStore();
  if (store.clearAllForTesting) {
    await store.clearAllForTesting();
  }
}
