/**
 * Durable PostgreSQL / Supabase Beneficiary Session & CSC Task Store
 *
 * Implements durable persistence for:
 * 1. Beneficiary WhatsApp Sessions (surviving process restarts and container evictions)
 * 2. Caregiver Opt-Outs (enforced before any outbound dispatch)
 * 3. CSC Caseworker Tasks (durable, idempotent task queue with audit history)
 */

import crypto from 'crypto';
import type { Pool } from 'pg';
import { PrivacyFilter } from '../ai-multimodal/privacy-filter';
import type { BeneficiarySession, CscDurableTask } from './types';
import type { IBeneficiarySessionStore, ICscDurableTaskQueue } from './session-store';
import type { DocType } from '../whatsapp-document-loop/types';

export interface IDurableBeneficiaryStore extends IBeneficiarySessionStore, ICscDurableTaskQueue {
  isOptedOut(phone: string): Promise<boolean>;
  recordOptOut(phone: string, reason: string, correlationId?: string): Promise<void>;
  assignTask(taskId: string, workerId: string, assignedBy: string): Promise<CscDurableTask | null>;
  updateTaskStatus(
    taskId: string,
    status: 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED',
    notes: string,
    updatedBy: string
  ): Promise<CscDurableTask | null>;
  getTaskById(taskId: string): Promise<CscDurableTask | null>;
}

export class PostgresBeneficiaryStore implements IDurableBeneficiaryStore {
  private pool: Pool;

  constructor(pool: Pool) {
    if (!pool) {
      throw new Error('PostgresBeneficiaryStore requires an active PostgreSQL connection pool.');
    }
    this.pool = pool;
  }

  public survivesProcessRestart(): boolean {
    return true; // Durable PostgreSQL persistence survives process restarts
  }

  /**
   * Retrieves a beneficiary session by phone number using SHA-256 hash.
   */
  public async getSessionByPhone(phone: string): Promise<BeneficiarySession | null> {
    const phoneHash = PrivacyFilter.hashPhone(phone);
    const sql = `
      SELECT 
        session_id,
        beneficiary_phone_hash,
        beneficiary_phone_masked,
        submission_id,
        child_id_masked,
        session_state,
        consent_provided,
        consent_recorded_at,
        contact_permission,
        opted_out,
        opted_out_at,
        opt_out_reason,
        preferred_language,
        selected_child_id,
        associated_child_ids,
        human_handoff,
        received_documents,
        unresolved_messages,
        reminder_state,
        session_payload,
        updated_at
      FROM public.beneficiary_whatsapp_sessions
      WHERE beneficiary_phone_hash = $1
      LIMIT 1;
    `;

    try {
      const res = await this.pool.query(sql, [phoneHash]);
      if (res.rows.length === 0) return null;

      const r = res.rows[0];
      const payload = r.session_payload || {};
      const isEscalated = r.human_handoff?.isEscalated === true || r.session_state === 'ESCALATED_TO_CSC';

      return {
        sessionId: r.session_id,
        beneficiaryPhoneHash: r.beneficiary_phone_hash,
        beneficiaryPhoneMasked: r.beneficiary_phone_masked,
        submissionId: r.submission_id,
        childIdMasked: r.child_id_masked,
        state: r.session_state,
        targetDocType: (payload.targetDocType || 'passbookPhoto') as DocType,
        consentProvided: Boolean(r.consent_provided),
        consentRecordedAt: r.consent_recorded_at ? new Date(r.consent_recorded_at).toISOString() : undefined,
        contactPermission: Boolean(r.contact_permission),
        optedOut: Boolean(r.opted_out),
        optedOutAt: r.opted_out_at ? new Date(r.opted_out_at).toISOString() : undefined,
        optOutReason: r.opt_out_reason || undefined,
        preferredLanguage: r.preferred_language,
        selectedChildId: r.selected_child_id || undefined,
        associatedChildIds: r.associated_child_ids || [],
        retryCount: payload.retryCount || 0,
        maxRetries: payload.maxRetries || 3,
        lastInteractionAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        replacementGuidanceHistory: payload.replacementGuidanceHistory || [],
        unexpectedExplanations: payload.unexpectedExplanations || [],
        isEscalated,
        humanHandoff: r.human_handoff || { isEscalated },
        receivedDocuments: r.received_documents || {},
        unresolvedMessages: r.unresolved_messages || [],
        reminderState: r.reminder_state || { remindersSentCount: 0, maxRemindersAllowed: 2 },
      } as BeneficiarySession;
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:getSessionByPhone:ERROR]', err?.message || err);
      throw new Error(`Database error while fetching session: ${err?.message || 'DB_ERROR'}`);
    }
  }

  /**
   * Idempotently saves or updates a beneficiary session.
   */
  public async saveSession(session: BeneficiarySession): Promise<void> {
    const payload = {
      targetDocType: session.targetDocType,
      retryCount: session.retryCount,
      maxRetries: session.maxRetries,
      replacementGuidanceHistory: session.replacementGuidanceHistory || [],
      unexpectedExplanations: session.unexpectedExplanations || [],
    };

    const sql = `
      INSERT INTO public.beneficiary_whatsapp_sessions (
        session_id,
        beneficiary_phone_hash,
        beneficiary_phone_masked,
        submission_id,
        child_id_masked,
        session_state,
        consent_provided,
        consent_recorded_at,
        contact_permission,
        opted_out,
        opted_out_at,
        opt_out_reason,
        preferred_language,
        selected_child_id,
        associated_child_ids,
        human_handoff,
        received_documents,
        unresolved_messages,
        reminder_state,
        session_payload,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
      ON CONFLICT (beneficiary_phone_hash) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        session_state = EXCLUDED.session_state,
        consent_provided = EXCLUDED.consent_provided,
        consent_recorded_at = EXCLUDED.consent_recorded_at,
        contact_permission = EXCLUDED.contact_permission,
        opted_out = EXCLUDED.opted_out,
        opted_out_at = EXCLUDED.opted_out_at,
        opt_out_reason = EXCLUDED.opt_out_reason,
        preferred_language = EXCLUDED.preferred_language,
        selected_child_id = EXCLUDED.selected_child_id,
        associated_child_ids = EXCLUDED.associated_child_ids,
        human_handoff = EXCLUDED.human_handoff,
        received_documents = EXCLUDED.received_documents,
        unresolved_messages = EXCLUDED.unresolved_messages,
        reminder_state = EXCLUDED.reminder_state,
        session_payload = EXCLUDED.session_payload,
        updated_at = NOW();
    `;

    const params = [
      session.sessionId,
      session.beneficiaryPhoneHash,
      session.beneficiaryPhoneMasked,
      session.submissionId,
      session.childIdMasked,
      session.state,
      session.consentProvided,
      session.consentRecordedAt || null,
      session.contactPermission,
      session.optedOut,
      session.optedOutAt || null,
      session.optOutReason || null,
      session.preferredLanguage,
      session.selectedChildId || null,
      session.associatedChildIds || [],
      JSON.stringify(session.humanHandoff || { isEscalated: session.isEscalated }),
      JSON.stringify(session.receivedDocuments || {}),
      JSON.stringify(session.unresolvedMessages || []),
      JSON.stringify(session.reminderState || { remindersSentCount: 0, maxRemindersAllowed: 2 }),
      JSON.stringify(payload),
    ];

    try {
      await this.pool.query(sql, params);

      // If opted out, also idempotently sync with caregiver_opt_outs table
      if (session.optedOut) {
        await this.recordOptOut(session.beneficiaryPhoneHash, session.optOutReason || 'USER_REQUEST');
      }
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:saveSession:ERROR]', err?.message || err);
      throw new Error(`Database error while saving session: ${err?.message || 'DB_ERROR'}`);
    }
  }

  /**
   * Deletes a beneficiary session by phone number.
   */
  public async deleteSession(phone: string): Promise<void> {
    const phoneHash = PrivacyFilter.hashPhone(phone);
    try {
      await this.pool.query(
        'DELETE FROM public.beneficiary_whatsapp_sessions WHERE beneficiary_phone_hash = $1;',
        [phoneHash]
      );
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:deleteSession:ERROR]', err?.message || err);
      throw new Error(`Database error while deleting session: ${err?.message || 'DB_ERROR'}`);
    }
  }

  /**
   * Records an explicit caregiver opt-out.
   */
  public async recordOptOut(phoneOrHash: string, reason: string, correlationId?: string): Promise<void> {
    const isHash = phoneOrHash.length === 64 && /^[0-9a-f]+$/i.test(phoneOrHash);
    const phoneHash = isHash ? phoneOrHash : PrivacyFilter.hashPhone(phoneOrHash);
    const phoneMasked = isHash ? 'PHONE-HASHED' : PrivacyFilter.maskPhone(phoneOrHash);

    const sql = `
      INSERT INTO public.caregiver_opt_outs (
        phone_hash,
        phone_masked,
        opt_out_reason,
        correlation_id,
        opted_out_at
      ) VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (phone_hash) DO UPDATE SET
        opt_out_reason = EXCLUDED.opt_out_reason,
        correlation_id = COALESCE(EXCLUDED.correlation_id, public.caregiver_opt_outs.correlation_id);
    `;

    try {
      await this.pool.query(sql, [phoneHash, phoneMasked, reason, correlationId || null]);
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:recordOptOut:ERROR]', err?.message || err);
      throw new Error(`Database error while recording opt-out: ${err?.message || 'DB_ERROR'}`);
    }
  }

  /**
   * Enforces opt-out check before ANY outbound communication.
   * Returns true if beneficiary has opted out.
   */
  public async isOptedOut(phoneOrHash: string): Promise<boolean> {
    const isHash = phoneOrHash.length === 64 && /^[0-9a-f]+$/i.test(phoneOrHash);
    const phoneHash = isHash ? phoneOrHash : PrivacyFilter.hashPhone(phoneOrHash);

    try {
      const res = await this.pool.query(
        'SELECT 1 FROM public.caregiver_opt_outs WHERE phone_hash = $1 LIMIT 1;',
        [phoneHash]
      );
      return res.rows.length > 0;
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:isOptedOut:ERROR]', err?.message || err);
      // Fail closed on database error: treat as opted out to prevent unauthorized spam
      return true;
    }
  }

  /**
   * Enqueues an escalating CSC Caseworker Task.
   * Enforces idempotency via unique idempotency_key to prevent duplicate tasks on replay.
   */
  public async enqueueTask(
    taskInput: Omit<CscDurableTask, 'taskId' | 'createdAt'> & { idempotencyKey?: string }
  ): Promise<CscDurableTask> {
    const taskId = `CSC-TSK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const idempotencyKey =
      taskInput.idempotencyKey ||
      crypto
        .createHash('sha256')
        .update(`${taskInput.ticketId}:${taskInput.beneficiaryPhoneHash}:${taskInput.reason}`)
        .digest('hex');

    const initialAudit = [
      {
        timestamp: new Date().toISOString(),
        action: 'TASK_CREATED',
        actor: 'SYSTEM_ESCALATION',
        details: taskInput.notes || 'Automated escalation from WhatsApp intake flow',
      },
    ];

    const sql = `
      INSERT INTO public.csc_caseworker_tasks (
        task_id,
        ticket_id,
        idempotency_key,
        beneficiary_phone_hash,
        child_id_masked,
        submission_id,
        reason,
        notes,
        priority,
        status,
        audit_history,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (idempotency_key) DO UPDATE SET
        updated_at = NOW()
      RETURNING 
        task_id,
        ticket_id,
        beneficiary_phone_hash,
        child_id_masked,
        submission_id,
        reason,
        notes,
        priority,
        status,
        assigned_worker_id,
        created_at;
    `;

    try {
      const res = await this.pool.query(sql, [
        taskId,
        taskInput.ticketId,
        idempotencyKey,
        taskInput.beneficiaryPhoneHash,
        taskInput.childIdMasked,
        taskInput.submissionId,
        taskInput.reason,
        taskInput.notes || '',
        taskInput.priority || 'NORMAL',
        taskInput.status || 'PENDING_ASSIGNMENT',
        JSON.stringify(initialAudit),
      ]);

      const r = res.rows[0];
      return {
        taskId: r.task_id,
        ticketId: r.ticket_id,
        beneficiaryPhoneHash: r.beneficiary_phone_hash,
        childIdMasked: r.child_id_masked,
        submissionId: r.submission_id,
        reason: r.reason,
        notes: r.notes,
        priority: r.priority,
        status: r.status,
        assignedWorkerId: r.assigned_worker_id || undefined,
        createdAt: new Date(r.created_at).toISOString(),
      };
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:enqueueTask:ERROR]', err?.message || err);
      throw new Error(`Database error while enqueuing CSC task: ${err?.message || 'DB_ERROR'}`);
    }
  }

  /**
   * Assigns an existing CSC task to a designated caseworker.
   */
  public async assignTask(taskId: string, workerId: string, assignedBy: string): Promise<CscDurableTask | null> {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: 'TASK_ASSIGNED',
      actor: assignedBy,
      details: `Assigned to caseworker ${workerId}`,
    };

    const sql = `
      UPDATE public.csc_caseworker_tasks
      SET 
        status = 'ASSIGNED',
        assigned_worker_id = $2,
        audit_history = audit_history || $3::jsonb,
        updated_at = NOW()
      WHERE task_id = $1
      RETURNING 
        task_id,
        ticket_id,
        beneficiary_phone_hash,
        child_id_masked,
        submission_id,
        reason,
        notes,
        priority,
        status,
        assigned_worker_id,
        created_at;
    `;

    try {
      const res = await this.pool.query(sql, [taskId, workerId, JSON.stringify([auditEntry])]);
      if (res.rows.length === 0) return null;

      const r = res.rows[0];
      return {
        taskId: r.task_id,
        ticketId: r.ticket_id,
        beneficiaryPhoneHash: r.beneficiary_phone_hash,
        childIdMasked: r.child_id_masked,
        submissionId: r.submission_id,
        reason: r.reason,
        notes: r.notes,
        priority: r.priority,
        status: r.status,
        assignedWorkerId: r.assigned_worker_id,
        createdAt: new Date(r.created_at).toISOString(),
      };
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:assignTask:ERROR]', err?.message || err);
      throw new Error(`Database error while assigning CSC task: ${err?.message || 'DB_ERROR'}`);
    }
  }

  /**
   * Updates task status and appends audit note.
   */
  public async updateTaskStatus(
    taskId: string,
    status: 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED',
    notes: string,
    updatedBy: string
  ): Promise<CscDurableTask | null> {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: `STATUS_CHANGED_TO_${status}`,
      actor: updatedBy,
      details: notes,
    };

    const sql = `
      UPDATE public.csc_caseworker_tasks
      SET 
        status = $2,
        notes = CASE WHEN $3 <> '' THEN notes || E'\n' || $3 ELSE notes END,
        audit_history = audit_history || $4::jsonb,
        updated_at = NOW()
      WHERE task_id = $1
      RETURNING 
        task_id,
        ticket_id,
        beneficiary_phone_hash,
        child_id_masked,
        submission_id,
        reason,
        notes,
        priority,
        status,
        assigned_worker_id,
        created_at;
    `;

    try {
      const res = await this.pool.query(sql, [taskId, status, notes, JSON.stringify([auditEntry])]);
      if (res.rows.length === 0) return null;

      const r = res.rows[0];
      return {
        taskId: r.task_id,
        ticketId: r.ticket_id,
        beneficiaryPhoneHash: r.beneficiary_phone_hash,
        childIdMasked: r.child_id_masked,
        submissionId: r.submission_id,
        reason: r.reason,
        notes: r.notes,
        priority: r.priority,
        status: r.status,
        assignedWorkerId: r.assigned_worker_id,
        createdAt: new Date(r.created_at).toISOString(),
      };
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:updateTaskStatus:ERROR]', err?.message || err);
      throw new Error(`Database error while updating CSC task status: ${err?.message || 'DB_ERROR'}`);
    }
  }

  /**
   * Retrieves a task by its unique task_id.
   */
  public async getTaskById(taskId: string): Promise<CscDurableTask | null> {
    const sql = `
      SELECT 
        task_id,
        ticket_id,
        beneficiary_phone_hash,
        child_id_masked,
        submission_id,
        reason,
        notes,
        priority,
        status,
        assigned_worker_id,
        created_at
      FROM public.csc_caseworker_tasks
      WHERE task_id = $1
      LIMIT 1;
    `;

    try {
      const res = await this.pool.query(sql, [taskId]);
      if (res.rows.length === 0) return null;

      const r = res.rows[0];
      return {
        taskId: r.task_id,
        ticketId: r.ticket_id,
        beneficiaryPhoneHash: r.beneficiary_phone_hash,
        childIdMasked: r.child_id_masked,
        submissionId: r.submission_id,
        reason: r.reason,
        notes: r.notes,
        priority: r.priority,
        status: r.status,
        assignedWorkerId: r.assigned_worker_id || undefined,
        createdAt: new Date(r.created_at).toISOString(),
      };
    } catch (err: any) {
      console.error('[PostgresBeneficiaryStore:getTaskById:ERROR]', err?.message || err);
      throw new Error(`Database error while fetching CSC task: ${err?.message || 'DB_ERROR'}`);
    }
  }
}
