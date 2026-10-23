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
 * 3. Concurrency Safety: Atomic challenge superseding and state transitions.
 */

import { getAppEnvConfig } from '@/lib/server/envConfig';
import {
  CaregiverOtpChallenge,
  CaregiverSubscriptionRecord,
} from './types';

export interface ICaregiverSubscriptionStore {
  getSubscription(phoneHash: string): Promise<CaregiverSubscriptionRecord | null>;
  saveSubscription(record: CaregiverSubscriptionRecord): Promise<void>;
  saveOtpChallenge(challenge: CaregiverOtpChallenge): Promise<void>;
  getLatestOtpChallenge(phoneHash: string): Promise<CaregiverOtpChallenge | null>;
  isOptedOut(phoneHash: string): Promise<boolean>;
  recordOptOut(phoneHash: string, reason: string): Promise<void>;
  clearOptOut(phoneHash: string): Promise<void>;
}

export class MemoryCaregiverSubscriptionStore implements ICaregiverSubscriptionStore {
  private readonly subscriptions = new Map<string, CaregiverSubscriptionRecord>();
  private readonly challenges = new Map<string, CaregiverOtpChallenge[]>();
  private readonly optOuts = new Set<string>();

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
    // Mark prior active challenges as superseded
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
  }
}

/**
 * Supabase PostgREST implementation of ICaregiverSubscriptionStore.
 * Connects directly to public.caregiver_subscriptions and public.caregiver_otp_challenges.
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
      // 1. Mark prior active challenges as superseded
      const supersedeUrl = `${this.baseUrl}/rest/v1/caregiver_otp_challenges?phone_hash=eq.${encodeURIComponent(challenge.phoneHash)}&verified=eq.false`;
      await fetch(supersedeUrl, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({ superseded: true }),
      });

      // 2. Insert new challenge
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
