/**
 * Caregiver Subscription & OTP Store
 *
 * Implements persistent and in-memory storage for caregiver subscriptions,
 * consent records, and OTP challenges.
 */

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
