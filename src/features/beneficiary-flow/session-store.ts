import { BeneficiarySession } from './types';
import { PrivacyFilter } from '../ai-multimodal/privacy-filter';

export interface IBeneficiarySessionStore {
  getSessionByPhone(phone: string): Promise<BeneficiarySession | null>;
  saveSession(session: BeneficiarySession): Promise<void>;
  deleteSession(phone: string): Promise<void>;
}

export class InMemoryBeneficiarySessionStore implements IBeneficiarySessionStore {
  private readonly sessions = new Map<string, BeneficiarySession>();

  public async getSessionByPhone(phone: string): Promise<BeneficiarySession | null> {
    const hash = PrivacyFilter.hashPhone(phone);
    const session = this.sessions.get(hash);
    return session ? JSON.parse(JSON.stringify(session)) : null;
  }

  public async saveSession(session: BeneficiarySession): Promise<void> {
    this.sessions.set(session.beneficiaryPhoneHash, JSON.parse(JSON.stringify(session)));
  }

  public async deleteSession(phone: string): Promise<void> {
    const hash = PrivacyFilter.hashPhone(phone);
    this.sessions.delete(hash);
  }

  public clear(): void {
    this.sessions.clear();
  }
}
