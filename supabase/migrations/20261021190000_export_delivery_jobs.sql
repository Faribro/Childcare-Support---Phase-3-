-- ============================================================================
-- Migration: 20261021190000_export_delivery_jobs.sql
-- Purpose:   Supabase tables & atomic stored procedures for:
--            1. Atomic Inbound Webhook Claim & Crash Recovery
--            2. Export Confirmation Single-Use Token Consumption (FOR UPDATE lock)
--            3. Retry-Safe Delivery Jobs Queue & Lease-Based Lifecycle Management
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT APPROVAL.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. WHATSAPP INBOUND STATUS ENHANCEMENT
-- Ensures 'CLAIMED' status is supported for atomic worker claim.
--------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'whatsapp_inbound_events'
    ) THEN
        ALTER TABLE public.whatsapp_inbound_events 
        DROP CONSTRAINT IF EXISTS chk_whatsapp_inbound_status;

        ALTER TABLE public.whatsapp_inbound_events 
        ADD CONSTRAINT chk_whatsapp_inbound_status 
        CHECK (processing_status IN ('RECEIVED', 'CLAIMED', 'PROCESSED', 'FAILED', 'DUPLICATE'));
    END IF;
END $$;

--------------------------------------------------------------------------------
-- 2. EXPORT CONFIRMATION TOKENS TABLE
-- Single-use preview contract tokens preventing concurrent/duplicate deliveries.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_confirmation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_id TEXT NOT NULL,
    recipient_user_id TEXT NOT NULL,
    parameters_hash TEXT NOT NULL,
    preview_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
    consumed_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_export_confirmation_tokens_export_id UNIQUE (export_id)
);

CREATE INDEX IF NOT EXISTS idx_export_confirmation_lookup 
    ON public.export_confirmation_tokens (export_id, recipient_user_id);

--------------------------------------------------------------------------------
-- 3. EXPORT DELIVERY JOBS TABLE
-- Retry-safe delivery queue tracking status transitions:
-- QUEUED -> PROCESSING -> SENT / FAILED / UNCERTAIN
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_delivery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id TEXT NOT NULL,
    export_id TEXT NOT NULL,
    report_type TEXT NOT NULL,
    recipient_user_id TEXT NOT NULL,
    recipient_email_masked TEXT NOT NULL,
    recipient_email_exact TEXT NOT NULL,
    parameters_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    delivery_target TEXT NOT NULL,
    error_reason TEXT NULL,
    lease_worker_id TEXT NULL,
    lease_expires_at TIMESTAMPTZ NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    dispatched_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_export_delivery_jobs_job_id UNIQUE (job_id),
    CONSTRAINT chk_export_delivery_jobs_status CHECK (
        status IN ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'UNCERTAIN')
    )
);

CREATE INDEX IF NOT EXISTS idx_export_delivery_jobs_status 
    ON public.export_delivery_jobs (status, lease_expires_at);

--------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------
ALTER TABLE public.export_confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_delivery_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.export_confirmation_tokens FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.export_delivery_jobs FROM anon, authenticated, PUBLIC;

GRANT ALL ON public.export_confirmation_tokens TO service_role;
GRANT ALL ON public.export_delivery_jobs TO service_role;

--------------------------------------------------------------------------------
-- 5. ATOMIC TOKEN CONSUMPTION STORED PROCEDURE
-- Transactionally locks token, verifies ownership & parameters, marks consumed,
-- and inserts queued delivery job in a single atomic database transaction.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_export_confirmation_token_atomic(
    p_export_id TEXT,
    p_parameters_hash TEXT,
    p_recipient_user_id TEXT,
    p_job_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_token RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- Explicit row lock on token
    SELECT * INTO v_token
    FROM public.export_confirmation_tokens
    WHERE export_id = p_export_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'NOT_FOUND', 'error', 'Export preview token not found.');
    END IF;

    IF v_token.is_consumed THEN
        RETURN jsonb_build_object('success', false, 'status', 'ALREADY_CONSUMED', 'error', 'Export token has already been consumed.');
    END IF;

    IF v_token.recipient_user_id <> p_recipient_user_id THEN
        RETURN jsonb_build_object('success', false, 'status', 'MISMATCH', 'error', 'Token caller mismatch.');
    END IF;

    IF v_token.parameters_hash <> p_parameters_hash THEN
        RETURN jsonb_build_object('success', false, 'status', 'MISMATCH', 'error', 'Parameters hash mismatch.');
    END IF;

    IF v_token.expires_at < v_now THEN
        RETURN jsonb_build_object('success', false, 'status', 'EXPIRED', 'error', 'Export token has expired.');
    END IF;

    -- Atomically mark consumed
    UPDATE public.export_confirmation_tokens
    SET is_consumed = TRUE,
        consumed_at = v_now
    WHERE export_id = p_export_id;

    -- Insert queued delivery job in the same transaction
    INSERT INTO public.export_delivery_jobs (
        job_id,
        export_id,
        report_type,
        recipient_user_id,
        recipient_email_masked,
        recipient_email_exact,
        parameters_hash,
        status,
        delivery_target,
        attempts,
        max_attempts,
        queued_at
    ) VALUES (
        p_job_id,
        p_export_id,
        COALESCE(v_token.preview_contract->>'reportType', 'LINELIST_EXPORT'),
        p_recipient_user_id,
        COALESCE(v_token.preview_contract->>'recipientEmailMasked', '****'),
        COALESCE(v_token.preview_contract->>'recipientEmailExact', ''),
        p_parameters_hash,
        'QUEUED',
        'APPS_SCRIPT_EMAIL_DISPATCHER',
        0,
        3,
        v_now
    );

    RETURN jsonb_build_object('success', true, 'status', 'CONSUMED', 'jobId', p_job_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_export_confirmation_token_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_export_confirmation_token_atomic(TEXT, TEXT, TEXT, TEXT) TO service_role;

--------------------------------------------------------------------------------
-- 6. ATOMIC INBOUND EVENT CLAIM STORED PROCEDURE
-- Transactionally claims inbound event for worker execution, detects duplicate
-- requests, and safely recovers stale claims after worker crashes.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_whatsapp_inbound_event_atomic(
    p_event_id TEXT,
    p_from_phone_hash TEXT,
    p_sender_masked TEXT,
    p_event_type TEXT,
    p_idempotency_key TEXT,
    p_payload_redacted JSONB,
    p_lease_duration_seconds INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    SELECT * INTO v_existing
    FROM public.whatsapp_inbound_events
    WHERE event_id = p_event_id OR idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.processing_status = 'PROCESSED' THEN
            RETURN jsonb_build_object('success', true, 'status', 'DUPLICATE_ALREADY_PROCESSED', 'eventId', v_existing.event_id);
        END IF;

        IF v_existing.processing_status = 'CLAIMED' THEN
            IF v_existing.created_at < (v_now - (p_lease_duration_seconds || ' seconds')::interval) THEN
                UPDATE public.whatsapp_inbound_events
                SET processing_status = 'CLAIMED',
                    error_message = 'Lease recovered after worker crash timeout'
                WHERE id = v_existing.id;
                RETURN jsonb_build_object('success', true, 'status', 'CLAIM_RECOVERED', 'eventId', v_existing.event_id);
            ELSE
                RETURN jsonb_build_object('success', true, 'status', 'DUPLICATE_IN_PROGRESS', 'eventId', v_existing.event_id);
            END IF;
        END IF;
    END IF;

    INSERT INTO public.whatsapp_inbound_events (
        event_id,
        from_phone_hash,
        sender_masked,
        event_type,
        idempotency_key,
        payload_redacted,
        processing_status,
        created_at
    ) VALUES (
        p_event_id,
        p_from_phone_hash,
        p_sender_masked,
        p_event_type,
        p_idempotency_key,
        p_payload_redacted,
        'CLAIMED',
        v_now
    );

    RETURN jsonb_build_object('success', true, 'status', 'CLAIMED', 'eventId', p_event_id);
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', true, 'status', 'DUPLICATE_IN_PROGRESS', 'eventId', p_event_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_whatsapp_inbound_event_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_inbound_event_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT) TO service_role;

--------------------------------------------------------------------------------
-- 7. ATOMIC DELIVERY JOB CLAIM & CRASH RECOVERY STORED PROCEDURE
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_export_delivery_job_atomic(
    p_worker_id TEXT,
    p_lease_duration_seconds INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_expiry TIMESTAMPTZ := v_now + (p_lease_duration_seconds || ' seconds')::interval;
BEGIN
    SELECT * INTO v_job
    FROM public.export_delivery_jobs
    WHERE (status = 'QUEUED' OR (status = 'PROCESSING' AND lease_expires_at < v_now))
      AND attempts < max_attempts
    ORDER BY queued_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'NO_JOBS');
    END IF;

    UPDATE public.export_delivery_jobs
    SET status = 'PROCESSING',
        lease_worker_id = p_worker_id,
        lease_expires_at = v_expiry,
        attempts = attempts + 1,
        updated_at = v_now
    WHERE job_id = v_job.job_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'CLAIMED',
        'jobId', v_job.job_id,
        'exportId', v_job.export_id,
        'recipientEmailExact', v_job.recipient_email_exact,
        'reportType', v_job.report_type
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_export_delivery_job_atomic(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_export_delivery_job_atomic(TEXT, INT) TO service_role;

COMMIT;
