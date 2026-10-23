-- ============================================================================
-- Migration: 005_durable_beneficiary_sessions_and_csc_tasks.sql
-- Purpose:   Durable persistence for Beneficiary WhatsApp Sessions, Caregiver
--            Opt-Out Registry, and Trackable CSC Caseworker Tasks.
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT APPROVAL.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. CAREGIVER OPT-OUTS TABLE
-- Durable opt-out enforcement sink. Checked before ANY outbound dispatch.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caregiver_opt_outs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_hash TEXT NOT NULL UNIQUE,
    phone_masked TEXT NOT NULL,
    opt_out_reason TEXT NOT NULL DEFAULT 'USER_REQUEST',
    correlation_id TEXT NULL,
    opted_out_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_opt_out_reason CHECK (
        opt_out_reason IN ('STOP', 'WRONG_NUMBER', 'USER_REQUEST', 'POLICY_REFUSAL')
    )
);

CREATE INDEX IF NOT EXISTS idx_caregiver_opt_outs_phone_hash ON public.caregiver_opt_outs (phone_hash);
CREATE INDEX IF NOT EXISTS idx_caregiver_opt_outs_opted_at ON public.caregiver_opt_outs (opted_out_at DESC);

--------------------------------------------------------------------------------
-- 2. BENEFICIARY WHATSAPP SESSIONS TABLE
-- Full session state machine persistence surviving restarts.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beneficiary_whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    beneficiary_phone_hash TEXT NOT NULL UNIQUE,
    beneficiary_phone_masked TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    child_id_masked TEXT NOT NULL,
    session_state TEXT NOT NULL DEFAULT 'CONSENT_PENDING',
    consent_provided BOOLEAN NOT NULL DEFAULT FALSE,
    consent_recorded_at TIMESTAMPTZ NULL,
    contact_permission BOOLEAN NOT NULL DEFAULT FALSE,
    opted_out BOOLEAN NOT NULL DEFAULT FALSE,
    opted_out_at TIMESTAMPTZ NULL,
    opt_out_reason TEXT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'mr',
    selected_child_id TEXT NULL,
    associated_child_ids TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    human_handoff JSONB NOT NULL DEFAULT '{"isEscalated":false}'::jsonb,
    received_documents JSONB NOT NULL DEFAULT '{}'::jsonb,
    unresolved_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    reminder_state JSONB NOT NULL DEFAULT '{"remindersSentCount":0,"maxRemindersAllowed":2}'::jsonb,
    consecutive_rejections INTEGER NOT NULL DEFAULT 0,
    session_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_beneficiary_session_state CHECK (
        session_state IN (
            'CONSENT_PENDING',
            'SIBLING_SELECTION',
            'LANGUAGE_SELECTION',
            'AWAITING_DOCUMENT',
            'DOCUMENT_EVALUATING',
            'REPLACEMENT_REQUESTED',
            'OPTED_OUT',
            'ESCALATED_TO_CSC',
            'COMPLETED'
        )
    ),
    CONSTRAINT chk_beneficiary_session_opt_out CHECK (
        opt_out_reason IS NULL OR opt_out_reason IN ('STOP', 'WRONG_NUMBER', 'USER_REQUEST', 'POLICY_REFUSAL')
    )
);

CREATE INDEX IF NOT EXISTS idx_beneficiary_sessions_phone_hash ON public.beneficiary_whatsapp_sessions (beneficiary_phone_hash);
CREATE INDEX IF NOT EXISTS idx_beneficiary_sessions_submission_id ON public.beneficiary_whatsapp_sessions (submission_id);
CREATE INDEX IF NOT EXISTS idx_beneficiary_sessions_state ON public.beneficiary_whatsapp_sessions (session_state);
CREATE INDEX IF NOT EXISTS idx_beneficiary_sessions_updated_at ON public.beneficiary_whatsapp_sessions (updated_at DESC);

--------------------------------------------------------------------------------
-- 3. CSC CASEWORKER TASKS TABLE
-- Trackable, durable task queue for escalations and in-person assistance.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.csc_caseworker_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT NOT NULL UNIQUE,
    ticket_id TEXT NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    beneficiary_phone_hash TEXT NOT NULL,
    child_id_masked TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'NORMAL',
    status TEXT NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    assigned_worker_id TEXT NULL,
    correlation_id TEXT NULL,
    audit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_csc_task_priority CHECK (
        priority IN ('NORMAL', 'HIGH', 'URGENT')
    ),
    CONSTRAINT chk_csc_task_status CHECK (
        status IN ('PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED')
    )
);

CREATE INDEX IF NOT EXISTS idx_csc_tasks_status ON public.csc_caseworker_tasks (status);
CREATE INDEX IF NOT EXISTS idx_csc_tasks_worker ON public.csc_caseworker_tasks (assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_csc_tasks_phone_hash ON public.csc_caseworker_tasks (beneficiary_phone_hash);
CREATE INDEX IF NOT EXISTS idx_csc_tasks_idempotency ON public.csc_caseworker_tasks (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_csc_tasks_created_at ON public.csc_caseworker_tasks (created_at DESC);

--------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------
ALTER TABLE public.caregiver_opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiary_whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csc_caseworker_tasks ENABLE ROW LEVEL SECURITY;

-- Fail-closed default: anon denied
CREATE POLICY "service_role_all_caregiver_opt_outs"
    ON public.caregiver_opt_outs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_beneficiary_sessions"
    ON public.beneficiary_whatsapp_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_csc_tasks"
    ON public.csc_caseworker_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated staff read-only access for CSC tasks
CREATE POLICY "authenticated_select_csc_tasks"
    ON public.csc_caseworker_tasks FOR SELECT TO authenticated
    USING (
        (auth.jwt() ->> 'role') IN ('ADMIN', 'LEADERSHIP', 'SUPERVISOR')
        OR assigned_worker_id = (auth.jwt() ->> 'sub')
    );

--------------------------------------------------------------------------------
-- 5. GRANTS
--------------------------------------------------------------------------------
REVOKE ALL ON public.caregiver_opt_outs FROM anon;
REVOKE ALL ON public.beneficiary_whatsapp_sessions FROM anon;
REVOKE ALL ON public.csc_caseworker_tasks FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.caregiver_opt_outs TO service_role;
GRANT ALL ON public.beneficiary_whatsapp_sessions TO service_role;
GRANT ALL ON public.csc_caseworker_tasks TO service_role;
GRANT SELECT ON public.csc_caseworker_tasks TO authenticated;

COMMIT;
