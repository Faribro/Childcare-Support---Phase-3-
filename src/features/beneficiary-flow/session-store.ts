import { BeneficiarySession, CscDurableTask } from './types';
import { PrivacyFilter } from '../ai-multimodal/privacy-filter';
import { PostgresBeneficiaryStore, IDurableBeneficiaryStore } from './durable-session-store';

export { PostgresBeneficiaryStore };
export type { IDurableBeneficiaryStore };

/**
 * Beneficiary Session & Opt-Out Store
 *
 * ARCHITECTURAL PERSISTENCE BOUNDARY:
 * 1. Transient In-Memory Implementation:
 *    `InMemoryBeneficiarySessionStore` stores sessions and opt-out records in a
 *    JavaScript Map. SESSIONS AND OPT-OUTS IN THIS STORE DO NOT SURVIVE PROCESS RESTARTS.
 *    Any serverless container eviction or application restart wipes all in-memory states.
 * 2. Production Persistence:
 *    `PostgresBeneficiaryStore` persists sessions and opt-out records directly to
 *    `public.beneficiary_whatsapp_sessions` and `public.caregiver_opt_outs` in PostgreSQL/Supabase.
 *    Survives all process restarts and container recycles.
 * 3. Handoff Boundary:
 *    CSC escalations are converted into durable, trackable database tasks in
 *    `public.csc_caseworker_tasks` with full audit history and idempotent deduplication.
 */

export interface IBeneficiarySessionStore {
  getSessionByPhone(phone: string): Promise<BeneficiarySession | null>;
  saveSession(session: BeneficiarySession): Promise<void>;
  deleteSession(phone: string): Promise<void>;
  survivesProcessRestart(): boolean;
}

export interface ICscDurableTaskQueue {
  enqueueTask(task: Omit<CscDurableTask, 'taskId' | 'createdAt'> & { idempotencyKey?: string }): Promise<CscDurableTask>;
}

export class InMemoryBeneficiarySessionStore implements IBeneficiarySessionStore, ICscDurableTaskQueue {
  private readonly sessions = new Map<string, BeneficiarySession>();
  private readonly optOuts = new Set<string>();
  private readonly tasks = new Map<string, CscDurableTask>();

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
    if (session.optedOut) {
      this.optOuts.add(session.beneficiaryPhoneHash);
    }
  }

  public async deleteSession(phone: string): Promise<void> {
    const hash = PrivacyFilter.hashPhone(phone);
    this.sessions.delete(hash);
  }

  public async recordOptOut(phone: string): Promise<void> {
    const hash = PrivacyFilter.hashPhone(phone);
    this.optOuts.add(hash);
  }

  public async isOptedOut(phone: string): Promise<boolean> {
    const hash = PrivacyFilter.hashPhone(phone);
    return this.optOuts.has(hash);
  }

  public async enqueueTask(
    task: Omit<CscDurableTask, 'taskId' | 'createdAt'> & { idempotencyKey?: string }
  ): Promise<CscDurableTask> {
    const taskId = `MEM-TSK-${Date.now()}`;
    const fullTask: CscDurableTask = {
      ...task,
      taskId,
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, fullTask);
    return fullTask;
  }

  public clear(): void {
    this.sessions.clear();
    this.optOuts.clear();
    this.tasks.clear();
  }
}
