-- ============================================================================
-- Migration: 20261015220000_whatsapp_document_loop.sql
-- Purpose:   Supabase tables for WhatsApp Inbound Event Ingestion, Deduplication,
--            Document Request/Fulfillment State, and Reporting Sessions.
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT APPROVAL.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. WHATSAPP INBOUND EVENTS TABLE
-- Durable, idempotent ingestion sink with zero raw PII.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    from_phone_hash TEXT NOT NULL,
    sender_masked TEXT NOT NULL,
    event_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing_status TEXT NOT NULL DEFAULT 'RECEIVED',
    error_message TEXT NULL,
    processed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Constraints
    CONSTRAINT uq_whatsapp_inbound_event_id UNIQUE (event_id),
    CONSTRAINT uq_whatsapp_inbound_idempotency UNIQUE (idempotency_key),
    CONSTRAINT chk_whatsapp_inbound_status CHECK (
        processing_status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE')
    ),
    CONSTRAINT chk_whatsapp_inbound_event_type CHECK (
        event_type IN ('DOCUMENT_UPLOAD', 'TEXT_MESSAGE', 'STATUS_CALLBACK', 'INTERACTIVE_RESPONSE')
    )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_idempotency ON public.whatsapp_inbound_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_phone_hash ON public.whatsapp_inbound_events (from_phone_hash);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_created_at ON public.whatsapp_inbound_events (created_at DESC);

--------------------------------------------------------------------------------
-- 2. WHATSAPP OUTBOUND REQUESTS TABLE
-- Durable queue and state tracking for document fulfillment requests.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    recipient_phone_hash TEXT NOT NULL,
    recipient_phone_masked TEXT NOT NULL,
    missing_doc_types TEXT[] NOT NULL,
    request_status TEXT NOT NULL DEFAULT 'PREPARED',
    message_template TEXT NOT NULL,
    dispatched_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Constraints
    CONSTRAINT uq_whatsapp_outbound_request_id UNIQUE (request_id),
    CONSTRAINT uq_whatsapp_outbound_idempotency UNIQUE (idempotency_key),
    CONSTRAINT chk_whatsapp_outbound_status CHECK (
        request_status IN ('PREPARED', 'APPROVED', 'DISPATCHED', 'CONFIRMED', 'CANCELLED', 'EXPIRED')
    )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_sub_id ON public.whatsapp_outbound_requests (submission_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_status ON public.whatsapp_outbound_requests (request_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_idempotency ON public.whatsapp_outbound_requests (idempotency_key);

--------------------------------------------------------------------------------
-- 3. REPORTING SESSIONS TABLE
-- Persistent state tracking for conversational surveillance sessions.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reporting_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    caller_role TEXT NOT NULL,
    permitted_states TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],
    active_state_filter TEXT NULL,
    confirmed_year INTEGER NULL,
    confirmed_date_basis TEXT NULL,
    is_confirmed_policy BOOLEAN NOT NULL DEFAULT FALSE,
    session_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Constraints
    CONSTRAINT uq_reporting_sessions_session_id UNIQUE (session_id),
    CONSTRAINT chk_reporting_sessions_date_basis CHECK (
        confirmed_date_basis IS NULL OR confirmed_date_basis IN ('VISIT_DATE', 'SUBMISSION_DATE')
    )
);

CREATE INDEX IF NOT EXISTS idx_reporting_sessions_owner ON public.reporting_sessions (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_reporting_sessions_updated ON public.reporting_sessions (updated_at DESC);

--------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------
ALTER TABLE public.whatsapp_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_outbound_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_sessions ENABLE ROW LEVEL SECURITY;

-- Service role has unrestricted access for webhook workers and async queue processors
CREATE POLICY "service_role_all_whatsapp_inbound"
    ON public.whatsapp_inbound_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_whatsapp_outbound"
    ON public.whatsapp_outbound_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_reporting_sessions"
    ON public.reporting_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated leadership / admin read access
CREATE POLICY "authenticated_select_reporting_sessions"
    ON public.reporting_sessions FOR SELECT TO authenticated
    USING (
        (auth.jwt() ->> 'role') IN ('ADMIN', 'LEADERSHIP')
        OR owner_user_id = (auth.jwt() ->> 'sub')
    );

--------------------------------------------------------------------------------
-- 5. GRANTS
--------------------------------------------------------------------------------
REVOKE ALL ON public.whatsapp_inbound_events FROM anon;
REVOKE ALL ON public.whatsapp_outbound_requests FROM anon;
REVOKE ALL ON public.reporting_sessions FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.whatsapp_inbound_events TO service_role;
GRANT ALL ON public.whatsapp_outbound_requests TO service_role;
GRANT ALL ON public.reporting_sessions TO service_role;
GRANT SELECT ON public.reporting_sessions TO authenticated;

COMMIT;
