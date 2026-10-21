-- ==============================================================================
-- Migration 004: Durable Integration Queues, Leases, and Idempotency Registry
-- Target Architecture: PostgreSQL 15 / Supabase / PostgREST
-- Production Deployment Gate: Requires explicit maintainer approval before apply.
-- ==============================================================================

-- 1. Enum types for worker job status and delivery status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_job_status') THEN
        CREATE TYPE public.webhook_job_status AS ENUM (
            'PENDING',
            'CLAIMED',
            'PROCESSED',
            'FAILED',
            'DEAD_LETTER'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbound_delivery_status') THEN
        CREATE TYPE public.outbound_delivery_status AS ENUM (
            'PREPARED',
            'ACCEPTED_BY_GATEWAY',
            'FAILED',
            'UNCERTAIN',
            'DELIVERED',
            'READ'
        );
    END IF;
END $$;

-- 2. Durable Reporting Email Idempotency Registry
-- Replaces local-only filesystem cache in multi-instance serverless deployments
CREATE TABLE IF NOT EXISTS public.reporting_email_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    report_type TEXT NOT NULL,
    accepted_status TEXT NOT NULL,
    is_dry_run BOOLEAN NOT NULL DEFAULT true,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_reporting_email_idempotency_expiry
    ON public.reporting_email_idempotency(expires_at);

-- 3. Durable Webhook Ingress Jobs Queue
-- Supports transactional lease claiming with FOR UPDATE SKIP LOCKED
CREATE TABLE IF NOT EXISTS public.webhook_ingress_jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id TEXT NOT NULL,
    media_id TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    sha256 TEXT,
    upload_token TEXT,
    source_origin TEXT NOT NULL DEFAULT 'CATALYST_WHATSAPP_INGRESS',
    status public.webhook_job_status NOT NULL DEFAULT 'PENDING',
    worker_id TEXT,
    lease_expires_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    error_details TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_webhook_ingress_jobs_status_lease
    ON public.webhook_ingress_jobs(status, lease_expires_at)
    WHERE status IN ('PENDING', 'CLAIMED');

CREATE INDEX IF NOT EXISTS idx_webhook_ingress_jobs_correlation
    ON public.webhook_ingress_jobs(correlation_id);

-- 4. Durable Outbound WhatsApp Message Registry
-- Tracks outbound outreach requests, gateway acceptance, wamid correlation, and delivery receipts
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_messages (
    outbound_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    correlation_id TEXT NOT NULL,
    target_submission_id TEXT,
    recipient_phone_e164 TEXT NOT NULL,
    message_type TEXT NOT NULL,
    template_name TEXT,
    payload_snapshot JSONB NOT NULL,
    status public.outbound_delivery_status NOT NULL DEFAULT 'PREPARED',
    wamid TEXT,
    gateway_status_code INT,
    gateway_response JSONB,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    lease_worker_id TEXT,
    lease_expires_at TIMESTAMPTZ,
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    accepted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_wamid
    ON public.whatsapp_outbound_messages(wamid)
    WHERE wamid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_status_lease
    ON public.whatsapp_outbound_messages(status, lease_expires_at)
    WHERE status IN ('PREPARED', 'UNCERTAIN');

-- 5. Row-Level Security Policies
ALTER TABLE public.reporting_email_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_ingress_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_outbound_messages ENABLE ROW LEVEL SECURITY;

-- Deny all public / anonymous access fail-closed
DROP POLICY IF EXISTS deny_anon_reporting_email ON public.reporting_email_idempotency;
CREATE POLICY deny_anon_reporting_email ON public.reporting_email_idempotency
    FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS deny_anon_webhook_jobs ON public.webhook_ingress_jobs;
CREATE POLICY deny_anon_webhook_jobs ON public.webhook_ingress_jobs
    FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS deny_anon_outbound_whatsapp ON public.whatsapp_outbound_messages;
CREATE POLICY deny_anon_outbound_whatsapp ON public.whatsapp_outbound_messages
    FOR ALL TO anon USING (false);

-- Service role bypass for backend services
DROP POLICY IF EXISTS service_role_reporting_email ON public.reporting_email_idempotency;
CREATE POLICY service_role_reporting_email ON public.reporting_email_idempotency
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_webhook_jobs ON public.webhook_ingress_jobs;
CREATE POLICY service_role_webhook_jobs ON public.webhook_ingress_jobs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_outbound_whatsapp ON public.whatsapp_outbound_messages;
CREATE POLICY service_role_outbound_whatsapp ON public.whatsapp_outbound_messages
    FOR ALL TO service_role USING (true) WITH CHECK (true);
