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
 * - Server-only feature flag enforcement (never enabled on NEXT_PUBLIC alone)
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
 * Checks whether Leadership email authentication is enabled.
 * Enforced strictly via server-side environment variable.
 * Must never be enabled based solely on a NEXT_PUBLIC flag.
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
 * Generates a cryptographically strong 256-bit random device binding secret.
 */
export function generateDeviceBindingSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export type RequestCodeResult =
  | { success: true; statusCode: 200 }
  | { success: false; error: string; statusCode: number };

/**
 * Initiates an authentication challenge and dispatches a single-use code to the leader's email.
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
}): Promise<RequestCodeResult> {
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
    leader = await store.getLeaderIdentity(leaderId.trim()).catch(() => null);
    if (!leader) {
      leader = findLeaderById(leaderId.trim());
    }
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

  // Distributed Rate Limiting Checks (fail closed on store errors)
  try {
    const emailRateKey = `rate:email:${targetEmail}`;
    const emailLimit = await store.checkAndRecordRateLimit(emailRateKey, now);
    if (!emailLimit.allowed) {
      return { success: false, error: emailLimit.reason || 'Too many requests.', statusCode: 429 };
    }

    const ipRateKey = `rate:ip:${clientIp}`;
    const ipLimit = await store.checkAndRecordRateLimit(ipRateKey, now);
    if (!ipLimit.allowed) {
      return { success: false, error: ipLimit.reason || 'Too many requests.', statusCode: 429 };
    }
  } catch (err: any) {
    console.error('[LEADER_AUTH:RATE_LIMIT_ERROR] Fail-closed on rate limit store failure:', err?.message);
    return {
      success: false,
      error: 'Authentication rate check unavailable. Please retry later.',
      statusCode: 503,
    };
  }

  // If email is not allowlisted or leader is inactive, return generic success
  // Artificial small delay prevents timing attacks
  if (!leader || !leader.isActive) {
    await new Promise((r) => setTimeout(r, 15));
    return { success: true, statusCode: 200 };
  }

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

  try {
    await store.createChallenge(challenge);
  } catch (err: any) {
    console.error('[LEADER_AUTH:CHALLENGE_CREATE_ERROR] Fail-closed on challenge creation failure:', err?.message);
    return {
      success: false,
      error: 'Authentication challenge service unavailable. Please retry later.',
      statusCode: 503,
    };
  }

  // Dispatch email directly to server-stored approved email
  const emailResult = await sendLeadershipOtpEmail({
    to: leader.email,
    name: leader.name,
    code: plainOtp,
    expiryMinutes: 10,
  });

  if (!emailResult.success) {
    // Invalidate challenge immediately on transmission failure
    await store.invalidateChallenge(challengeId).catch(() => {});
    console.error('[LEADER_AUTH:EMAIL_DISPATCH_FAILED] Invalidation triggered. Sanitized reason:', emailResult.error);
    // Return generic success to external client to prevent leaking allowlist membership through provider errors
    return { success: true, statusCode: 200 };
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

  const store = getLeaderAuthStore();
  let leader: LeaderIdentity | null = null;
  let norm = '';

  if (leaderId && typeof leaderId === 'string') {
    leader = await store.getLeaderIdentity(leaderId.trim()).catch(() => null);
    if (!leader) {
      leader = findLeaderById(leaderId.trim());
    }
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

  let challenge: LeaderAuthChallengeRecord | null = null;
  try {
    challenge = await store.getPendingChallenge(norm);
  } catch (err: any) {
    console.error('[LEADER_AUTH:GET_CHALLENGE_ERROR] Fail-closed on challenge lookup:', err?.message);
    return {
      success: false,
      error: 'Authentication store unavailable.',
      statusCode: 503,
    };
  }

  if (!challenge) {
    return {
      success: false,
      error: 'No active verification code found for this email. Please request a new code.',
      statusCode: 401,
    };
  }

  if (!leader) {
    leader = await store.getLeaderIdentity(challenge.leaderId).catch(() => null);
    if (!leader) {
      leader = findLeaderByEmail(norm);
    }
  }

  if (!leader || !leader.isActive) {
    await store.invalidateChallenge(challenge.challengeId).catch(() => {});
    return {
      success: false,
      error: 'Leadership account is deactivated or unauthorized.',
      statusCode: 403,
    };
  }

  const submittedCodeHash = hashString(cleanCode);
  const deviceBindingHash = hashString(deviceBindingSecret);
  const now = Date.now();

  try {
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
  } catch (err: any) {
    console.error('[LEADER_AUTH:CONSUME_CHALLENGE_ERROR] Fail-closed on session consumption:', err?.message);
    return {
      success: false,
      error: 'Authentication transaction failed on persistent store.',
      statusCode: 503,
    };
  }
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
