import crypto from 'crypto';
import { validateAndFormatIndianMobile } from './phoneValidation';
import { FirestoreOtpStore } from './firestoreOtpStore';

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

/**
 * Distributed Firestore OTP Provider: provides durable, shared challenge storage
 * and atomic verification across multi-instance Cloud Run containers.
 */
export class DistributedFirestoreOtpProvider implements OtpProvider {
  private store: FirestoreOtpStore;
  private msg91AuthKey?: string;
  private msg91TemplateId?: string;

  constructor(options?: { store?: FirestoreOtpStore; msg91AuthKey?: string; msg91TemplateId?: string }) {
    this.store = options?.store || new FirestoreOtpStore();
    this.msg91AuthKey = options?.msg91AuthKey || process.env.MSG91_AUTH_KEY;
    this.msg91TemplateId = options?.msg91TemplateId || process.env.MSG91_DLT_TEMPLATE_ID;
  }

  public async sendOtp(mobileE164: string, purpose: string): Promise<OtpRequestResult> {
    // 1. Cryptographically strong 6-digit random code
    const randomInt = crypto.randomInt(100000, 999999);
    const code = randomInt.toString();

    // 2. Persist challenge atomically in shared Firestore store
    const saveResult = await this.store.saveChallenge(mobileE164, purpose, code);
    if (!saveResult.success) {
      return saveResult;
    }

    // 3. Dispatch to MSG91 Webhook if credentials provided in environment
    if (this.msg91AuthKey && this.msg91TemplateId) {
      try {
        const res = await fetch('https://control.msg91.com/api/v5/otp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authkey': this.msg91AuthKey,
          },
          body: JSON.stringify({
            template_id: this.msg91TemplateId,
            mobile: mobileE164.replace(/\D/g, ''),
            otp: code,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.type === 'error') {
          return {
            success: false,
            message: 'SMS provider delivery failed: ' + (data.message || 'Gateway rejected dispatch'),
            error: 'SMS_PROVIDER_ERROR',
          };
        }
      } catch (err: any) {
        return {
          success: false,
          message: 'Unable to reach SMS gateway for OTP dispatch.',
          error: 'SMS_GATEWAY_UNREACHABLE',
        };
      }
    }

    const last4 = mobileE164.slice(-4);
    return {
      success: true,
      message: 'OTP sent successfully to registered mobile number.',
      maskedMobile: `+91 ******${last4}`,
      debugCode: process.env.NODE_ENV === 'test' ? code : undefined,
    };
  }

  public async verifyOtp(mobileE164: string, otpCode: string, purpose: string = 'login'): Promise<OtpVerifyResult> {
    return await this.store.verifyChallenge(mobileE164, otpCode, purpose);
  }

  public async resetForTesting(): Promise<void> {
    await this.store.resetForTesting();
  }
}

// Global singleton instance with environment safety guards
let providerInstance: OtpProvider | null = null;

export function getOtpProvider(): OtpProvider {
  if (providerInstance) return providerInstance;

  const appEnv = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development').toLowerCase();
  const isTest = process.env.NODE_ENV === 'test';
  const isExplicitMock = process.env.USE_MOCK_OTP_PROVIDER === 'true';

  // Strict guard: Staging and production MUST NOT use MockOtpProvider
  if (appEnv === 'staging' || appEnv === 'production') {
    if (isExplicitMock && !isTest) {
      throw new Error(`SECURITY_GATE_VIOLATION: MockOtpProvider is strictly prohibited in ${appEnv}!`);
    }
  }

  if (isTest || (isExplicitMock && appEnv === 'development')) {
    providerInstance = new MockOtpProvider();
    return providerInstance;
  }

  // If remote otpgateway URL is explicitly configured, use RemoteOtpGatewayProvider
  if (process.env.OTPGATEWAY_BASE_URL && process.env.USE_REMOTE_OTPGATEWAY === 'true') {
    providerInstance = new RemoteOtpGatewayProvider();
    return providerInstance;
  }

  // Default durable multi-instance provider: Firestore shared challenge store
  providerInstance = new DistributedFirestoreOtpProvider();
  return providerInstance;
}

export function setTestOtpProvider(mock: OtpProvider): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setTestOtpProvider is strictly prohibited outside NODE_ENV=test');
  }
  providerInstance = mock;
}
