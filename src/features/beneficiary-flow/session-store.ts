import { BeneficiarySession, CscDurableTask } from './types';
import { PrivacyFilter } from '../ai-multimodal/privacy-filter';

/**
 * Beneficiary Session & Opt-Out Store
 *
 * ARCHITECTURAL PERSISTENCE BOUNDARY:
 * 1. Transient In-Memory Implementation:
 *    `InMemoryBeneficiarySessionStore` stores sessions and opt-out records in a
 *    JavaScript Map. SESSIONS AND OPT-OUTS IN THIS STORE DO NOT SURVIVE PROCESS RESTARTS.
 *    Any serverless container eviction or application restart wipes all in-memory states.
 * 2. Production Persistence Requirement:
 *    For production deployment, sessions and opt-outs MUST be persisted to a durable
 *    database table (e.g. `public.beneficiary_whatsapp_sessions` and `public.caregiver_opt_outs`).
 * 3. Handoff Boundary:
 *    Setting `session.humanHandoff` or `session.isEscalated` in this session is an
 *    in-memory marker. It does NOT constitute an assigned, durable CSC caseworker task
 *    until explicitly written to a durable task queue table (e.g. `public.csc_caseworker_tasks`).
 */

export interface IBeneficiarySessionStore {
  getSessionByPhone(phone: string): Promise<BeneficiarySession | null>;
  saveSession(session: BeneficiarySession): Promise<void>;
  deleteSession(phone: string): Promise<void>;
  survivesProcessRestart(): boolean;
}

export interface ICscDurableTaskQueue {
  enqueueTask(task: Omit<CscDurableTask, 'taskId' | 'createdAt'>): Promise<CscDurableTask>;
}

export class InMemoryBeneficiarySessionStore implements IBeneficiarySessionStore {
  private readonly sessions = new Map<string, BeneficiarySession>();

  public survivesProcessRestart(): boolean {
    return false; // Truthful: In-memory Map does not survive process restart (RESTRICTED TO TEST/LOCAL DEV ONLY)
  }

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
