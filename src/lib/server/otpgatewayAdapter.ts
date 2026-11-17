import crypto from 'crypto';
import { validateAndFormatIndianMobile } from './phoneValidation';

export interface OtpRequestResult {
  success: boolean;
  message: string;
  maskedMobile?: string;
  error?: string;
  retryAfterSeconds?: number;
  debugCode?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  canonicalMobile?: string;
  error?: string;
  message?: string;
  code?: 'INVALID_CODE' | 'EXPIRED_CODE' | 'MAX_ATTEMPTS_EXCEEDED' | 'RATE_LIMITED' | 'ALREADY_USED';
  remainingAttempts?: number;
}

export interface OtpProvider {
  sendOtp(mobileE164: string, purpose: string): Promise<OtpRequestResult>;
  verifyOtp(mobileE164: string, otpCode: string, purpose: string): Promise<OtpVerifyResult>;
  resetForTesting?(): void;
  getMockCodeForTesting?(mobileE164: string): string | null;
}

interface StoredChallenge {
  mobileE164: string;
  codeHash: string;
  purpose: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: number;
  consumed: boolean;
  createdAt: number;
}

/**
 * Mock OTP Provider for automated tests and isolated local development.
 * Strictly forbidden in staging and production (enforced at initialization).
 */
export class MockOtpProvider implements OtpProvider {
  private challenges = new Map<string, StoredChallenge>();
  private rateLimits = new Map<string, number[]>(); // mobile -> timestamps
  private testCodes = new Map<string, string>(); // mobile -> plaintext for test asserts only

  constructor() {
    const env = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
    if (env === 'production') {
      throw new Error('MockOtpProvider is strictly prohibited in production');
    }
  }

  private getChallengeKey(mobileE164: string, purpose: string): string {
    return `${mobileE164}::${purpose}`;
  }

  public resetForTesting(): void {
    this.challenges.clear();
    this.rateLimits.clear();
    this.testCodes.clear();
  }

  public getMockCodeForTesting(mobileE164: string): string | null {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Test inspection of mock OTP is strictly forbidden outside NODE_ENV=test');
    }
    return this.testCodes.get(mobileE164) || null;
  }

  public peekCode(mobileE164: string): string | null {
    return this.getMockCodeForTesting(mobileE164);
  }

  public async sendOtp(mobileE164: string, purpose: string): Promise<OtpRequestResult> {
    const now = Date.now();
    const key = this.getChallengeKey(mobileE164, purpose);

    // 1. Rate limiting: 5 requests per 10 minutes
    const attempts = (this.rateLimits.get(mobileE164) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (attempts.length >= 5) {
      const oldest = attempts[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + 10 * 60 * 1000 - now) / 1000));
      return {
        success: false,
        message: `Too many OTP requests. Please wait ${retryAfterSeconds} seconds.`,
        error: 'RATE_LIMITED',
        retryAfterSeconds,
      };
    }

    // 2. Resend cooldown: 60 seconds
    const existing = this.challenges.get(key);
    if (existing && !existing.consumed && now - existing.createdAt < 60 * 1000) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.createdAt + 60 * 1000 - now) / 1000));
      return {
        success: false,
        message: `Please wait ${retryAfterSeconds} seconds before requesting a new OTP.`,
        error: 'COOLDOWN_ACTIVE',
        retryAfterSeconds,
      };
    }

    // 3. Cryptographically strong 6-digit random code
    const randomInt = crypto.randomInt(100000, 999999);
    const code = randomInt.toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    this.challenges.set(key, {
      mobileE164,
      codeHash,
      purpose,
      attempts: 0,
      maxAttempts: 3,
      expiresAt: now + 5 * 60 * 1000, // 5 minutes validity
      consumed: false,
      createdAt: now,
    });

    attempts.push(now);
    this.rateLimits.set(mobileE164, attempts);

    if (process.env.NODE_ENV === 'test') {
      this.testCodes.set(mobileE164, code);
    }

    const last4 = mobileE164.slice(-4);
    const maskedMobile = `+91 ******${last4}`;

    return {
      success: true,
      message: 'OTP sent successfully to registered mobile number.',
      maskedMobile,
      debugCode: process.env.NODE_ENV === 'test' ? code : undefined,
    };
  }

  public async verifyOtp(mobileE164: string, otpCode: string, purpose: string = 'login'): Promise<OtpVerifyResult> {
    const now = Date.now();
    let key = this.getChallengeKey(mobileE164, purpose);
    let challenge = this.challenges.get(key);

    if (!challenge) {
      // Fallback: search for active challenge for this mobile
      for (const [k, c] of this.challenges.entries()) {
        if (c.mobileE164 === mobileE164 && !c.consumed && now <= c.expiresAt) {
          challenge = c;
          key = k;
          break;
        }
      }
    }

    if (!challenge) {
      return {
        success: false,
        code: 'INVALID_CODE',
        error: 'Invalid or expired OTP code. Please request a new code.',
      };
    }

    if (challenge.consumed) {
      return {
        success: false,
        code: 'ALREADY_USED',
        error: 'This OTP has already been verified and consumed. Single use enforced.',
      };
    }

    if (now > challenge.expiresAt) {
      this.challenges.delete(key);
      return {
        success: false,
        code: 'EXPIRED_CODE',
        error: 'This OTP has expired. Please request a new code.',
      };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      this.challenges.delete(key);
      return {
        success: false,
        code: 'MAX_ATTEMPTS_EXCEEDED',
        error: 'Maximum verification attempts exceeded. Please request a new OTP.',
      };
    }

    const testHash = crypto.createHash('sha256').update(otpCode.trim()).digest('hex');
    const isMatch = crypto.timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(testHash, 'hex'));

    if (!isMatch) {
      challenge.attempts += 1;
      const remaining = challenge.maxAttempts - challenge.attempts;
      return {
        success: false,
        code: 'INVALID_CODE',
        error: `Incorrect OTP code. ${remaining} attempt(s) remaining.`,
        message: `Incorrect OTP code. ${remaining} attempt(s) remaining.`,
        remainingAttempts: remaining,
      };
    }

    // Atomic consumption: single-use guarantee
    challenge.consumed = true;
    this.challenges.delete(key);

    return {
      success: true,
      canonicalMobile: mobileE164,
    };
  }
}

/**
 * Remote OtpGateway Provider for production/staging connecting to knadh/otpgateway service.
 */
export class RemoteOtpGatewayProvider implements OtpProvider {
  private gatewayUrl: string;
  private apiKey: string;
  private namespace: string;

  constructor() {
    this.gatewayUrl = process.env.OTPGATEWAY_BASE_URL || 'http://127.0.0.1:9000';
    this.apiKey = process.env.OTPGATEWAY_API_KEY || '';
    this.namespace = process.env.OTPGATEWAY_NAMESPACE || 'childcare-field-auth';
  }

  public async sendOtp(mobileE164: string, purpose: string): Promise<OtpRequestResult> {
    try {
      const res = await fetch(`${this.gatewayUrl}/api/otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          namespace: this.namespace,
          channel: 'sms',
          to: mobileE164,
          metadata: { purpose },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        return {
          success: false,
          message: data.message || 'Upstream OTP Gateway delivery failed.',
          error: data.code || 'UPSTREAM_FAILURE',
        };
      }

      const last4 = mobileE164.slice(-4);
      return {
        success: true,
        message: 'OTP sent successfully.',
        maskedMobile: `+91 ******${last4}`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Failed to communicate with OTP Gateway daemon: ' + (err?.message || 'Network error'),
        error: 'GATEWAY_UNAVAILABLE',
      };
    }
  }

  public async verifyOtp(mobileE164: string, otpCode: string, purpose: string): Promise<OtpVerifyResult> {
    try {
      const res = await fetch(`${this.gatewayUrl}/api/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          namespace: this.namespace,
          to: mobileE164,
          otp: otpCode.trim(),
          metadata: { purpose },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success' || !data.data?.verified) {
        return {
          success: false,
          code: data.code === 'EXPIRED' ? 'EXPIRED_CODE' : 'INVALID_CODE',
          error: data.message || 'Invalid or expired OTP code.',
          message: data.message || 'Invalid or expired OTP code.',
        };
      }

      return {
        success: true,
        canonicalMobile: mobileE164,
      };
    } catch (err: any) {
      return {
        success: false,
        error: 'Failed to verify OTP with gateway: ' + (err?.message || 'Network error'),
      };
    }
  }
}

// Global singleton instance with environment safety guards
let providerInstance: OtpProvider | null = null;

export function getOtpProvider(): OtpProvider {
  if (providerInstance) return providerInstance;

  // Staging and production MUST NOT use MockOtpProvider unless explicitly mock in unit tests
  const isTest = process.env.NODE_ENV === 'test';
  const isExplicitMock = process.env.USE_MOCK_OTP_PROVIDER === 'true';

  if (isTest || (isExplicitMock && process.env.NODE_ENV !== 'production')) {
    providerInstance = new MockOtpProvider();
    return providerInstance;
  }

  providerInstance = new RemoteOtpGatewayProvider();
  return providerInstance;
}

export function setTestOtpProvider(mock: OtpProvider): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setTestOtpProvider is strictly prohibited outside NODE_ENV=test');
  }
  providerInstance = mock;
}
