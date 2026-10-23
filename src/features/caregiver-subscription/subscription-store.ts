/**
 * Caregiver Subscription & OTP Store
 *
 * Implements persistent and in-memory storage for caregiver subscriptions,
 * consent records, and OTP challenges.
 *
 * Guarantees:
 * 1. Strict Fail-Closed in Production: Fails closed with SERVER_MISCONFIGURED
 *    if Supabase credentials are missing in production.
 * 2. Protected Hash Storage: Only salted hashes and masked identifiers are stored.
 * 3. Database-Atomic Verification: Uses PostgreSQL SELECT ... FOR UPDATE RPC
 *    to guarantee ACID attempt bounding and single-use consumption across all instances.
 */

import crypto from 'crypto';
import { getAppEnvConfig } from '@/lib/server/envConfig';
import {
  CaregiverOtpChallenge,
  CaregiverSubscriptionRecord,
  OtpVerificationResult,
} from './types';

export interface ICaregiverSubscriptionStore {
  getSubscription(phoneHash: string): Promise<CaregiverSubscriptionRecord | null>;
  saveSubscription(record: CaregiverSubscriptionRecord): Promise<void>;
  saveOtpChallenge(challenge: CaregiverOtpChallenge): Promise<void>;
  getLatestOtpChallenge(phoneHash: string): Promise<CaregiverOtpChallenge | null>;
  isOptedOut(phoneHash: string): Promise<boolean>;
  recordOptOut(phoneHash: string, reason: string): Promise<void>;
  clearOptOut(phoneHash: string): Promise<void>;

  issueOtpChallengeAtomic(
    phoneHash: string,
    challenge: CaregiverOtpChallenge,
    cooldownSeconds: number,
    now?: number
  ): Promise<{ success: boolean; error?: 'COOLDOWN_ACTIVE'; cooldownRemainingSeconds?: number }>;

  verifyOtpCodeAtomic(
    phoneHash: string,
    enteredCode: string,
    now?: number
  ): Promise<{ result: OtpVerificationResult; updatedChallenge?: CaregiverOtpChallenge | null }>;
}

export class MemoryCaregiverSubscriptionStore implements ICaregiverSubscriptionStore {
  private readonly subscriptions = new Map<string, CaregiverSubscriptionRecord>();
  private readonly challenges = new Map<string, CaregiverOtpChallenge[]>();
  private readonly optOuts = new Set<string>();
  private readonly phoneLocks = new Map<string, Promise<void>>();

  private async withPhoneLock<T>(phoneHash: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.phoneLocks.get(phoneHash) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prev.then(() => current, () => current);
    this.phoneLocks.set(phoneHash, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.phoneLocks.get(phoneHash) === chained) {
        this.phoneLocks.delete(phoneHash);
      }
    }
  }

  public async getSubscription(phoneHash: string): Promise<CaregiverSubscriptionRecord | null> {
    const found = this.subscriptions.get(phoneHash);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async saveSubscription(record: CaregiverSubscriptionRecord): Promise<void> {
    this.subscriptions.set(record.phoneHash, JSON.parse(JSON.stringify(record)));
    if (record.state === 'OPTED_OUT') {
      this.optOuts.add(record.phoneHash);
    } else {
      this.optOuts.delete(record.phoneHash);
    }
  }

  public async saveOtpChallenge(challenge: CaregiverOtpChallenge): Promise<void> {
    const list = this.challenges.get(challenge.phoneHash) || [];
    for (const c of list) {
      if (!c.verified) {
        c.superseded = true;
      }
    }
    list.push(JSON.parse(JSON.stringify(challenge)));
    this.challenges.set(challenge.phoneHash, list);
  }

  public async getLatestOtpChallenge(phoneHash: string): Promise<CaregiverOtpChallenge | null> {
    const list = this.challenges.get(phoneHash);
    if (!list || list.length === 0) return null;
    return JSON.parse(JSON.stringify(list[list.length - 1]));
  }

  public async issueOtpChallengeAtomic(
    phoneHash: string,
    challenge: CaregiverOtpChallenge,
    cooldownSeconds: number,
    now: number = Date.now()
  ): Promise<{ success: boolean; error?: 'COOLDOWN_ACTIVE'; cooldownRemainingSeconds?: number }> {
    return this.withPhoneLock(phoneHash, async () => {
      const list = this.challenges.get(phoneHash) || [];
      const active = list.filter((c) => !c.verified && !c.superseded);
      const latest = active[active.length - 1];

      if (latest) {
        const elapsed = Math.floor((now - latest.lastRequestedAt) / 1000);
        if (elapsed < cooldownSeconds) {
          return {
            success: false,
            error: 'COOLDOWN_ACTIVE',
            cooldownRemainingSeconds: cooldownSeconds - elapsed,
          };
        }
      }

      for (const c of list) {
        if (!c.verified) {
          c.superseded = true;
        }
      }
      list.push(JSON.parse(JSON.stringify(challenge)));
      this.challenges.set(phoneHash, list);
      return { success: true };
    });
  }

  public async verifyOtpCodeAtomic(
    phoneHash: string,
    enteredCode: string,
    now: number = Date.now()
  ): Promise<{ result: OtpVerificationResult; updatedChallenge?: CaregiverOtpChallenge | null }> {
    return this.withPhoneLock(phoneHash, async () => {
      const list = this.challenges.get(phoneHash) || [];
      const activeList = list.filter((c) => !c.superseded);
      const challenge = activeList[activeList.length - 1];

      if (!challenge) {
        return { result: { success: false, reason: 'NO_ACTIVE_CHALLENGE' }, updatedChallenge: null };
      }
      if (challenge.verified) {
        return { result: { success: false, reason: 'ALREADY_VERIFIED' }, updatedChallenge: challenge };
      }
      if (challenge.attempts >= challenge.maxAttempts) {
        return { result: { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED', remainingAttempts: 0 }, updatedChallenge: challenge };
      }
      if (now > challenge.expiresAt) {
        return { result: { success: false, reason: 'EXPIRED' }, updatedChallenge: challenge };
      }

      challenge.attempts += 1;
      const cleaned = (enteredCode || '').replace(/\D/g, '').trim();
      const candidateHash = crypto.createHash('sha256').update(`${cleaned}:${challenge.salt}`).digest('hex');
      const candBuf = Buffer.from(candidateHash, 'hex');
      const expBuf = Buffer.from(challenge.verifierHash, 'hex');

      const matches =
        candBuf.length === expBuf.length &&
        crypto.timingSafeEqual(candBuf, expBuf);

      if (!matches) {
        const remainingAttempts = Math.max(0, challenge.maxAttempts - challenge.attempts);
        return {
          result: {
            success: false,
            reason: remainingAttempts === 0 ? 'MAX_ATTEMPTS_EXCEEDED' : 'INVALID_CODE',
            remainingAttempts,
          },
          updatedChallenge: challenge,
        };
      }

      challenge.verified = true;
      return {
        result: { success: true },
        updatedChallenge: challenge,
      };
    });
  }

  public async isOptedOut(phoneHash: string): Promise<boolean> {
    return this.optOuts.has(phoneHash);
  }

  public async recordOptOut(phoneHash: string, _reason: string): Promise<void> {
    this.optOuts.add(phoneHash);
  }

  public async clearOptOut(phoneHash: string): Promise<void> {
    this.optOuts.delete(phoneHash);
  }

  public clear(): void {
    this.subscriptions.clear();
    this.challenges.clear();
    this.optOuts.clear();
    this.phoneLocks.clear();
  }
}

/**
 * Supabase PostgREST implementation of ICaregiverSubscriptionStore.
 * Connects directly to public.caregiver_subscriptions and public.caregiver_otp_challenges.
 * Implements cross-instance atomic RPC calls: caregiver_issue_otp_challenge and caregiver_verify_otp_atomic.
 */
export class SupabaseCaregiverSubscriptionStore implements ICaregiverSubscriptionStore {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fallbackMemory: MemoryCaregiverSubscriptionStore;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    const env = getAppEnvConfig();
    this.baseUrl = (supabaseUrl || env.supabaseUrl || '').replace(/\/+$/, '');
    this.apiKey = serviceRoleKey || env.supabaseServiceRoleKey || '';
    this.fallbackMemory = new MemoryCaregiverSubscriptionStore();
  }

  private get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private get isProduction(): boolean {
    return (
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL_ENV === 'production'
    );
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
  }

  public async getSubscription(phoneHash: string): Promise<CaregiverSubscriptionRecord | null> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Caregiver subscription store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
        );
      }
      return this.fallbackMemory.getSubscription(phoneHash);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/caregiver_subscriptions?phone_hash=eq.${encodeURIComponent(phoneHash)}&limit=1`;
      const res = await fetch(url, { method: 'GET', headers: this.headers });
      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to query caregiver subscription: HTTP ${res.status}`);
        }
        return this.fallbackMemory.getSubscription(phoneHash);
      }
      const rows = (await res.json()) as any[];
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const r = rows[0];
      return {
        subscriptionId: r.subscription_id,
        phoneHash: r.phone_hash,
        phoneMasked: r.phone_masked,
        state: r.state,
        consentProvided: Boolean(r.consent_provided),
        consentRecordedAt: r.consent_recorded_at || undefined,
        consentCategories: Array.isArray(r.consent_categories) ? r.consent_categories : ['DOCUMENTS'],
        preferredLanguage: r.preferred_language || 'mr',
        linkedChildIdsMasked: Array.isArray(r.linked_child_ids_masked) ? r.linked_child_ids_masked : [],
        linkedSubmissionIds: Array.isArray(r.linked_submission_ids) ? r.linked_submission_ids : [],
        optedOutAt: r.opted_out_at || undefined,
        optOutReason: r.opt_out_reason || undefined,
        pausedUntil: r.paused_until || undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.getSubscription(phoneHash);
    }
  }

  public async saveSubscription(record: CaregiverSubscriptionRecord): Promise<void> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Caregiver subscription store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      return this.fallbackMemory.saveSubscription(record);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/caregiver_subscriptions?on_conflict=phone_hash`;
      const headers = {
        ...this.headers,
        Prefer: 'resolution=merge-duplicates,return=representation',
      };
      const body = {
        subscription_id: record.subscriptionId,
        phone_hash: record.phoneHash,
        phone_masked: record.phoneMasked,
        state: record.state,
        consent_provided: record.consentProvided,
        consent_recorded_at: record.consentRecordedAt || null,
        consent_categories: record.consentCategories,
        preferred_language: record.preferredLanguage,
        linked_child_ids_masked: record.linkedChildIdsMasked,
        linked_submission_ids: record.linkedSubmissionIds,
        opted_out_at: record.optedOutAt || null,
        opt_out_reason: record.optOutReason || null,
        paused_until: record.pausedUntil || null,
        updated_at: new Date().toISOString(),
      };

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to save caregiver subscription: HTTP ${res.status}`);
        }
        return this.fallbackMemory.saveSubscription(record);
      }
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.saveSubscription(record);
    }
  }

  public async saveOtpChallenge(challenge: CaregiverOtpChallenge): Promise<void> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: OTP challenge store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      return this.fallbackMemory.saveOtpChallenge(challenge);
    }

    try {
      const supersedeUrl = `${this.baseUrl}/rest/v1/caregiver_otp_challenges?phone_hash=eq.${encodeURIComponent(challenge.phoneHash)}&verified=eq.false`;
      await fetch(supersedeUrl, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({ superseded: true }),
      });

      const url = `${this.baseUrl}/rest/v1/caregiver_otp_challenges`;
      const body = {
        challenge_id: challenge.challengeId,
        phone_hash: challenge.phoneHash,
        verifier_hash: challenge.verifierHash,
        salt: challenge.salt,
        attempts: challenge.attempts,
        max_attempts: challenge.maxAttempts,
        expires_at: new Date(challenge.expiresAt).toISOString(),
        last_requested_at: new Date(challenge.lastRequestedAt).toISOString(),
        verified: challenge.verified,
        superseded: challenge.superseded,
      };

      const res = await fetch(url, { method: 'POST', headers: this.headers, body: JSON.stringify(body) });
      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to insert OTP challenge: HTTP ${res.status}`);
        }
        return this.fallbackMemory.saveOtpChallenge(challenge);
      }
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.saveOtpChallenge(challenge);
    }
  }

  public async getLatestOtpChallenge(phoneHash: string): Promise<CaregiverOtpChallenge | null> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: OTP challenge store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      return this.fallbackMemory.getLatestOtpChallenge(phoneHash);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/caregiver_otp_challenges?phone_hash=eq.${encodeURIComponent(phoneHash)}&order=created_at.desc&limit=1`;
      const res = await fetch(url, { method: 'GET', headers: this.headers });
      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to query latest OTP challenge: HTTP ${res.status}`);
        }
        return this.fallbackMemory.getLatestOtpChallenge(phoneHash);
      }
      const rows = (await res.json()) as any[];
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const r = rows[0];
      return {
        challengeId: r.challenge_id,
        phoneHash: r.phone_hash,
        verifierHash: r.verifier_hash,
        salt: r.salt,
        attempts: Number(r.attempts) || 0,
        maxAttempts: Number(r.max_attempts) || 5,
        expiresAt: new Date(r.expires_at).getTime(),
        lastRequestedAt: new Date(r.last_requested_at || r.created_at).getTime(),
        verified: Boolean(r.verified),
        superseded: Boolean(r.superseded),
      };
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.getLatestOtpChallenge(phoneHash);
    }
  }

  public async issueOtpChallengeAtomic(
    phoneHash: string,
    challenge: CaregiverOtpChallenge,
    cooldownSeconds: number,
    now: number = Date.now()
  ): Promise<{ success: boolean; error?: 'COOLDOWN_ACTIVE'; cooldownRemainingSeconds?: number }> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Caregiver store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      return this.fallbackMemory.issueOtpChallengeAtomic(phoneHash, challenge, cooldownSeconds, now);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/rpc/caregiver_issue_otp_challenge`;
      const body = {
        p_phone_hash: phoneHash,
        p_challenge_id: challenge.challengeId,
        p_verifier_hash: challenge.verifierHash,
        p_salt: challenge.salt,
        p_max_attempts: challenge.maxAttempts,
        p_expires_at: new Date(challenge.expiresAt).toISOString(),
        p_now: new Date(now).toISOString(),
        p_cooldown_seconds: cooldownSeconds,
      };

      const res = await fetch(url, { method: 'POST', headers: this.headers, body: JSON.stringify(body) });
      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_RPC_ERROR: caregiver_issue_otp_challenge failed: HTTP ${res.status}`);
        }
        return this.fallbackMemory.issueOtpChallengeAtomic(phoneHash, challenge, cooldownSeconds, now);
      }

      const r = await res.json();
      if (r?.error === 'COOLDOWN_ACTIVE') {
        return {
          success: false,
          error: 'COOLDOWN_ACTIVE',
          cooldownRemainingSeconds: Number(r.cooldownRemainingSeconds) || cooldownSeconds,
        };
      }
      return { success: Boolean(r?.success ?? true) };
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.issueOtpChallengeAtomic(phoneHash, challenge, cooldownSeconds, now);
    }
  }

  public async verifyOtpCodeAtomic(
    phoneHash: string,
    enteredCode: string,
    now: number = Date.now()
  ): Promise<{ result: OtpVerificationResult; updatedChallenge?: CaregiverOtpChallenge | null }> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Caregiver store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      return this.fallbackMemory.verifyOtpCodeAtomic(phoneHash, enteredCode, now);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/rpc/caregiver_verify_otp_atomic`;
      const cleaned = (enteredCode || '').replace(/\D/g, '').trim();
      const body = {
        p_phone_hash: phoneHash,
        p_candidate_code: cleaned,
        p_candidate_hash: null,
        p_now: new Date(now).toISOString(),
      };

      const res = await fetch(url, { method: 'POST', headers: this.headers, body: JSON.stringify(body) });
      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_RPC_ERROR: caregiver_verify_otp_atomic failed: HTTP ${res.status}`);
        }
        return this.fallbackMemory.verifyOtpCodeAtomic(phoneHash, enteredCode, now);
      }

      const r = await res.json();
      if (r?.success) {
        return {
          result: { success: true },
          updatedChallenge: {
            challengeId: r.challengeId || 'verified_ch',
            phoneHash,
            verifierHash: '',
            salt: '',
            attempts: Number(r.attempts) || 1,
            maxAttempts: 5,
            expiresAt: now + 600000,
            lastRequestedAt: now,
            verified: true,
            superseded: false,
          },
        };
      }

      return {
        result: {
          success: false,
          reason: r?.reason || 'INVALID_CODE',
          remainingAttempts: typeof r?.remainingAttempts === 'number' ? r.remainingAttempts : undefined,
        },
        updatedChallenge: null,
      };
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.verifyOtpCodeAtomic(phoneHash, enteredCode, now);
    }
  }

  public async isOptedOut(phoneHash: string): Promise<boolean> {
    const sub = await this.getSubscription(phoneHash);
    return sub?.state === 'OPTED_OUT';
  }

  public async recordOptOut(phoneHash: string, reason: string): Promise<void> {
    const existing = await this.getSubscription(phoneHash);
    const now = new Date().toISOString();
    if (existing) {
      const validReasons = ['STOP', 'WRONG_NUMBER', 'USER_REQUEST', 'POLICY_REFUSAL'] as const;
      const validatedReason = validReasons.includes(reason as any)
        ? (reason as (typeof validReasons)[number])
        : 'STOP';
      existing.state = 'OPTED_OUT';
      existing.optOutReason = validatedReason;
      existing.optedOutAt = now;
      existing.consentProvided = false;
      existing.updatedAt = now;
      await this.saveSubscription(existing);
    }
  }

  public async clearOptOut(phoneHash: string): Promise<void> {
    const existing = await this.getSubscription(phoneHash);
    if (existing && existing.state === 'OPTED_OUT') {
      existing.state = 'UNVERIFIED';
      existing.optOutReason = undefined;
      existing.optedOutAt = undefined;
      existing.updatedAt = new Date().toISOString();
      await this.saveSubscription(existing);
    }
  }
}
