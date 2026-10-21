-- ============================================================================
-- Migration: 20261021170000_export_delivery_jobs.sql
-- Purpose:   Supabase tables for Atomic Export Confirmation Consumption,
--            Replay Attack Prevention, and Retry-Safe Delivery Jobs.
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT APPROVAL.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. EXPORT CONFIRMATION TOKENS TABLE
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
-- 2. EXPORT DELIVERY JOBS TABLE
-- Retry-safe delivery queue tracking status transitions (QUEUED -> PROCESSING -> SENT/FAILED).
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
    queued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    dispatched_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_export_delivery_jobs_job_id UNIQUE (job_id),
    CONSTRAINT chk_export_delivery_jobs_status CHECK (
        status IN ('QUEUED', 'PROCESSING', 'SENT', 'FAILED')
    )
);

CREATE INDEX IF NOT EXISTS idx_export_delivery_jobs_status 
    ON public.export_delivery_jobs (status);

--------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------
ALTER TABLE public.export_confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_delivery_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.export_confirmation_tokens FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.export_delivery_jobs FROM anon, authenticated, PUBLIC;

GRANT ALL ON public.export_confirmation_tokens TO service_role;
GRANT ALL ON public.export_delivery_jobs TO service_role;

--------------------------------------------------------------------------------
-- 4. ATOMIC TOKEN CONSUMPTION STORED PROCEDURE
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

    -- Insert queued delivery job
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
        v_now
    );

    RETURN jsonb_build_object('success', true, 'status', 'CONSUMED', 'jobId', p_job_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_export_confirmation_token_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_export_confirmation_token_atomic(TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
