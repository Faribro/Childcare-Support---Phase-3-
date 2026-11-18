import crypto from 'crypto';
import { getFirestoreDb } from './credentialRegistry';
import { OtpRequestResult, OtpVerifyResult } from './otpgatewayAdapter';

export interface StoredOtpChallenge {
  mobileHash: string;
  maskedMobile: string;
  codeHash: string;
  purpose: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  lastRequestedAt: number;
  requestHistory: number[];
  consumed: boolean;
  consumedAt?: string;
  createdAt: number;
}

export class FirestoreOtpStore {
  private collectionName: string;
  private customDb?: any;

  constructor(options?: { collectionName?: string; customDb?: any }) {
    const appEnv = process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development';
    const dbId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    // In staging on default db, prefix with _staging to guarantee namespace isolation
    if (appEnv === 'staging' && dbId === '(default)') {
      this.collectionName = options?.collectionName || '_staging_otp_challenges';
    } else {
      this.collectionName = options?.collectionName || '_otp_challenges';
    }
    this.customDb = options?.customDb;
  }

  private getDocId(mobileE164: string, purpose: string): string {
    return crypto.createHash('sha256').update(`${mobileE164}::${purpose}`).digest('hex');
  }

  public async getDb() {
    return await getFirestoreDb(this.customDb);
  }

  /**
   * Creates or refreshes an OTP challenge atomically in Firestore.
   * Enforces 60-second shared cooldown and 5-per-hour rate limits across all instances.
   */
  public async saveChallenge(
    mobileE164: string,
    purpose: string,
    code: string,
    ttlMs: number = 5 * 60 * 1000 // 5 minutes TTL
  ): Promise<OtpRequestResult> {
    try {
      const db = await this.getDb();
      const docId = this.getDocId(mobileE164, purpose);
      const docRef = db.collection(this.collectionName).doc(docId);
      const now = Date.now();

      const last4 = mobileE164.slice(-4);
      const maskedMobile = `+91 ******${last4}`;
      const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');

      return await db.runTransaction(async (t: any) => {
        const snap = await t.get(docRef);
        let existingData: StoredOtpChallenge | null = null;
        if (snap && snap.exists && typeof snap.data === 'function') {
          existingData = snap.data() as StoredOtpChallenge;
        }

        // 1. Shared Rate limit across all instances: max 5 requests per 60 minutes
        const oneHourAgo = now - 60 * 60 * 1000;
        const recentRequests = (existingData?.requestHistory || []).filter((ts) => ts > oneHourAgo);
        if (recentRequests.length >= 5) {
          const oldest = recentRequests[0];
          const retryAfterSeconds = Math.max(1, Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000));
          return {
            success: false,
            message: `Hourly OTP request ceiling reached. Please wait ${retryAfterSeconds} seconds before trying again.`,
            error: 'RATE_LIMIT_EXCEEDED',
            retryAfterSeconds,
          };
        }

        // 2. Shared Cooldown across all instances: 60 seconds
        if (existingData && !existingData.consumed && now - existingData.lastRequestedAt < 60 * 1000) {
          const retryAfterSeconds = Math.max(1, Math.ceil((existingData.lastRequestedAt + 60 * 1000 - now) / 1000));
          return {
            success: false,
            message: `Please wait ${retryAfterSeconds} seconds before requesting a new OTP.`,
            error: 'COOLDOWN_ACTIVE',
            retryAfterSeconds,
          };
        }

        // 3. Atomically persist challenge with SHA-256 hash (never plaintext)
        const challengeDoc: StoredOtpChallenge = {
          mobileHash: crypto.createHash('sha256').update(mobileE164).digest('hex'),
          maskedMobile,
          codeHash,
          purpose,
          attempts: 0,
          maxAttempts: 3,
          expiresAt: new Date(now + ttlMs).toISOString(),
          lastRequestedAt: now,
          requestHistory: [...recentRequests, now],
          consumed: false,
          createdAt: now,
        };

        await t.set(docRef, challengeDoc);

        return {
          success: true,
          message: 'OTP challenge generated successfully and shared across all instances.',
          maskedMobile,
          debugCode: process.env.NODE_ENV === 'test' ? code : undefined,
        };
      });
    } catch (err: any) {
      // Safe failure: never leak secrets or phone in error
      return {
        success: false,
        message: 'Authentication challenge store is temporarily unavailable.',
        error: 'DATABASE_UNAVAILABLE',
      };
    }
  }

  /**
   * Verifies an OTP challenge atomically in Firestore.
   * Enforces atomic single-use, max 3 attempts, and TTL expiry across all instances.
   */
  public async verifyChallenge(
    mobileE164: string,
    otpCode: string,
    purpose: string = 'login'
  ): Promise<OtpVerifyResult> {
    try {
      const db = await this.getDb();
      const docId = this.getDocId(mobileE164, purpose);
      const docRef = db.collection(this.collectionName).doc(docId);
      const now = Date.now();

      return await db.runTransaction(async (t: any) => {
        const snap = await t.get(docRef);
        if (!snap || !snap.exists || typeof snap.data !== 'function') {
          return {
            success: false,
            code: 'INVALID_CODE',
            error: 'Invalid or expired OTP code. Please request a new code.',
            message: 'Invalid or expired OTP code. Please request a new code.',
          };
        }

        const data = snap.data() as StoredOtpChallenge;

        // 1. Single-Use Check
        if (data.consumed) {
          return {
            success: false,
            code: 'ALREADY_USED',
            error: 'This OTP has already been verified and consumed. Single use enforced.',
            message: 'This OTP has already been verified and consumed. Single use enforced.',
          };
        }

        // 2. TTL Expiry Check
        const expiresAtMs = Date.parse(data.expiresAt);
        if (now > expiresAtMs) {
          await t.delete(docRef);
          return {
            success: false,
            code: 'EXPIRED_CODE',
            error: 'This OTP has expired. Please request a new code.',
            message: 'This OTP has expired. Please request a new code.',
          };
        }

        // 3. Attempt Limit Check
        if (data.attempts >= data.maxAttempts) {
          await t.delete(docRef);
          return {
            success: false,
            code: 'MAX_ATTEMPTS_EXCEEDED',
            error: 'Maximum verification attempts exceeded. Please request a new OTP.',
            message: 'Maximum verification attempts exceeded. Please request a new OTP.',
          };
        }

        // 4. Timing-Safe Hash Verification
        const testHash = crypto.createHash('sha256').update(otpCode.trim()).digest('hex');
        const isMatch = crypto.timingSafeEqual(Buffer.from(data.codeHash, 'hex'), Buffer.from(testHash, 'hex'));

        if (!isMatch) {
          const newAttempts = data.attempts + 1;
          const remaining = data.maxAttempts - newAttempts;
          if (newAttempts >= data.maxAttempts) {
            await t.delete(docRef);
            return {
              success: false,
              code: 'MAX_ATTEMPTS_EXCEEDED',
              error: 'Maximum verification attempts exceeded. Please request a new OTP.',
              message: 'Maximum verification attempts exceeded. Please request a new OTP.',
              remainingAttempts: 0,
            };
          } else {
            await t.set(docRef, { ...data, attempts: newAttempts });
            return {
              success: false,
              code: 'INVALID_CODE',
              error: `Incorrect OTP code. ${remaining} attempt(s) remaining.`,
              message: `Incorrect OTP code. ${remaining} attempt(s) remaining.`,
              remainingAttempts: remaining,
            };
          }
        }

        // 5. Atomic Consumption: Single-Use Sealed
        await t.set(docRef, {
          ...data,
          consumed: true,
          consumedAt: new Date(now).toISOString(),
        });

        return {
          success: true,
          canonicalMobile: mobileE164,
        };
      });
    } catch (err: any) {
      return {
        success: false,
        code: 'DATABASE_UNAVAILABLE',
        error: 'Authentication challenge store is temporarily unreachable: ' + (err?.message || 'Database error'),
      };
    }
  }

  public async resetForTesting(): Promise<void> {
    try {
      const db = await this.getDb();
      if (typeof db._clear === 'function') {
        db._clear();
      }
    } catch {
      // ignore in test teardown
    }
  }
}
