/**
 * Caregiver Single-Use OTP Service
 *
 * Security & Invariant Rules:
 * 1. Single-use: OTP can be verified at most once; subsequent attempts fail.
 * 2. Timing-safe verification: Uses crypto.timingSafeEqual on SHA-256 digests.
 * 3. Protected storage: Plaintext OTP is NEVER stored in database or state records.
 *    Only salt (16 bytes random hex) and verifierHash (SHA-256(otp + salt)) are stored.
 * 4. Zero Logging: Plaintext OTP is strictly excluded from console logs, error messages,
 *    and telemetry.
 * 5. Rate Limiting: 60-second cooldown between resend requests per phone hash.
 * 6. Attempt Bounding: Max 5 attempts per challenge. Exceeding locks the challenge.
 * 7. Expiry: 10 minutes absolute expiration.
 * 8. Concurrency-Safe: Serialized atomic locks prevent concurrent attempt exhaustion
 *    bypass or double-consumption races.
 */

import crypto from 'crypto';
import {
  CaregiverOtpChallenge,
  OTP_CONFIG,
  OtpVerificationResult,
} from './types';

export class CaregiverOtpService {
  private readonly activeLocks = new Map<string, Promise<void>>();

  /**
   * Concurrency mutex: serializes operations on a specific challenge ID using a promise chain.
   */
  public async withChallengeLock<T>(challengeId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.activeLocks.get(challengeId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prev.then(() => current, () => current);
    this.activeLocks.set(challengeId, chained);

    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.activeLocks.get(challengeId) === chained) {
        this.activeLocks.delete(challengeId);
      }
    }
  }

  /**
   * Generates a new OTP challenge and returns the challenge record and the raw code.
   * The caller is responsible for passing the raw code to the SMS/WhatsApp transport,
   * after which the raw code MUST NOT be retained or logged.
   */
  public createChallenge(
    phoneHash: string,
    priorChallenge?: CaregiverOtpChallenge | null,
    now: number = Date.now()
  ): { challenge: CaregiverOtpChallenge; rawOtp: string } | { error: 'COOLDOWN_ACTIVE'; cooldownRemainingSeconds: number } {
    // 1. Enforce cooldown if a recent challenge exists
    if (priorChallenge && !priorChallenge.superseded && !priorChallenge.verified) {
      const elapsedSeconds = Math.floor((now - priorChallenge.lastRequestedAt) / 1000);
      if (elapsedSeconds < OTP_CONFIG.COOLDOWN_SECONDS) {
        return {
          error: 'COOLDOWN_ACTIVE',
          cooldownRemainingSeconds: OTP_CONFIG.COOLDOWN_SECONDS - elapsedSeconds,
        };
      }
    }

    // 2. Generate 6-digit cryptographically secure numeric OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();

    // 3. Generate 16-byte random salt
    const salt = crypto.randomBytes(16).toString('hex');

    // 4. Compute SHA-256 verifier hash
    const verifierHash = this.computeHash(rawOtp, salt);

    // 5. Construct challenge record
    const challenge: CaregiverOtpChallenge = {
      challengeId: `otp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      phoneHash,
      verifierHash,
      salt,
      attempts: 0,
      maxAttempts: OTP_CONFIG.MAX_ATTEMPTS,
      expiresAt: now + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
      lastRequestedAt: now,
      verified: false,
      superseded: false,
    };

    return { challenge, rawOtp };
  }

  /**
   * Verifies an entered OTP code against a challenge record.
   * Implements constant-time hash comparison and updates attempt counters.
   */
  public verifyCode(
    challenge: CaregiverOtpChallenge,
    enteredCode: string,
    now: number = Date.now()
  ): { result: OtpVerificationResult; updatedChallenge: CaregiverOtpChallenge } {
    const updated = { ...challenge };

    // 1. Check if already verified
    if (updated.verified) {
      return {
        result: { success: false, reason: 'ALREADY_VERIFIED' },
        updatedChallenge: updated,
      };
    }

    // 2. Check if superseded by a newer challenge
    if (updated.superseded) {
      return {
        result: { success: false, reason: 'SUPERSEDED' },
        updatedChallenge: updated,
      };
    }

    // 3. Check attempt limit
    if (updated.attempts >= updated.maxAttempts) {
      return {
        result: { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED', remainingAttempts: 0 },
        updatedChallenge: updated,
      };
    }

    // 4. Check expiration
    if (now > updated.expiresAt) {
      return {
        result: { success: false, reason: 'EXPIRED' },
        updatedChallenge: updated,
      };
    }

    // 5. Increment attempt count
    updated.attempts += 1;

    // 6. Normalize input (strip spaces, dashes)
    const cleanedInput = (enteredCode || '').replace(/\D/g, '').trim();

    // 7. Compute candidate hash and compare in constant time
    const candidateHash = this.computeHash(cleanedInput, updated.salt);
    const candidateBuffer = Buffer.from(candidateHash, 'hex');
    const expectedBuffer = Buffer.from(updated.verifierHash, 'hex');

    const matches =
      candidateBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(candidateBuffer, expectedBuffer);

    if (!matches) {
      const remainingAttempts = Math.max(0, updated.maxAttempts - updated.attempts);
      return {
        result: {
          success: false,
          reason: remainingAttempts === 0 ? 'MAX_ATTEMPTS_EXCEEDED' : 'INVALID_CODE',
          remainingAttempts,
        },
        updatedChallenge: updated,
      };
    }

    // 8. Success: mark verified (single-use consumption)
    updated.verified = true;
    return {
      result: { success: true },
      updatedChallenge: updated,
    };
  }

  /**
   * Concurrency-safe atomic verification with store persistence callback.
   * Serializes verify attempts per challengeId so concurrent requests cannot race.
   * When provided a dynamic challenge resolver, fetches the freshest challenge record inside the lock.
   */
  public async verifyCodeAtomic(
    challengeOrId: CaregiverOtpChallenge | string,
    getChallengeOrCode: (() => Promise<CaregiverOtpChallenge | null>) | string,
    enteredCodeOrPersist?: string | ((c: CaregiverOtpChallenge) => Promise<void>),
    persistUpdate?: (c: CaregiverOtpChallenge) => Promise<void>,
    now: number = Date.now()
  ): Promise<{ result: OtpVerificationResult; updatedChallenge: CaregiverOtpChallenge | null }> {
    let challengeId: string;
    let resolver: () => Promise<CaregiverOtpChallenge | null>;
    let code: string;
    let persist: (c: CaregiverOtpChallenge) => Promise<void>;

    if (typeof challengeOrId === 'string' && typeof getChallengeOrCode === 'function') {
      challengeId = challengeOrId;
      resolver = getChallengeOrCode;
      code = enteredCodeOrPersist as string;
      persist = persistUpdate!;
    } else {
      const ch = challengeOrId as CaregiverOtpChallenge;
      challengeId = ch.challengeId;
      resolver = async () => ch;
      code = getChallengeOrCode as string;
      persist = enteredCodeOrPersist as (c: CaregiverOtpChallenge) => Promise<void>;
    }

    return this.withChallengeLock(challengeId, async () => {
      const challenge = await resolver();
      if (!challenge) {
        return {
          result: { success: false, reason: 'SUPERSEDED' },
          updatedChallenge: null,
        };
      }
      const verification = this.verifyCode(challenge, code, now);
      await persist(verification.updatedChallenge);
      return verification;
    });
  }

  /**
   * Helper to compute SHA-256 hash of (code + salt)
   */
  private computeHash(code: string, salt: string): string {
    return crypto
      .createHash('sha256')
      .update(`${code}:${salt}`)
      .digest('hex');
  }
}
