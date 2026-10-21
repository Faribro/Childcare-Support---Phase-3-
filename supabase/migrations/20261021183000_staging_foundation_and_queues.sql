-- ============================================================================
-- CHILDCARE SUPPORT PHASE 3: CANONICAL FOUNDATION SCHEMA & QUEUES
-- Project: rjrctsxdvkfkssqvmhbz (Supabase Staging)
-- Execution: Supabase Dashboard -> SQL Editor (or psql / supabase db push)
-- Safety: Non-destructive, idempotent (IF NOT EXISTS), transactional (BEGIN/COMMIT)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. SECURITY SCOPE & JWT HELPER FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.jwt_is_verified()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'isVerified')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'user_role',
    auth.jwt() ->> 'role',
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.jwt_has_state(target_state TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.jwt_is_verified()
    AND (
      COALESCE(auth.jwt() -> 'allowedStates', '[]'::jsonb) ? '*'
      OR COALESCE(auth.jwt() -> 'allowedStates', '[]'::jsonb) ? target_state
    );
$$;

CREATE OR REPLACE FUNCTION public.jwt_has_district(target_district TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.jwt_is_verified()
    AND (
      COALESCE(auth.jwt() -> 'allowedDistricts', '[]'::jsonb) ? '*'
      OR COALESCE(auth.jwt() -> 'allowedDistricts', '[]'::jsonb) ? target_district
    );
$$;

CREATE OR REPLACE FUNCTION public.jwt_has_programme(target_programme TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.jwt_is_verified()
    AND (
      auth.jwt() -> 'allowedProgrammes' IS NULL
      OR COALESCE(auth.jwt() -> 'allowedProgrammes', '[]'::jsonb) ? '*'
      OR COALESCE(auth.jwt() -> 'allowedProgrammes', '[]'::jsonb) ? target_programme
    );
$$;

-- ============================================================================
-- 2. TABLE: public.submissions (Canonical Structured Data Store)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unique_id TEXT NOT NULL,
    client_submission_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by_user_id TEXT NOT NULL,
    submitted_by_email TEXT,
    assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    consent_provided BOOLEAN NOT NULL DEFAULT true,
    caregiver_signature_ref TEXT NOT NULL DEFAULT 'Restricted Doc [caregiverSignature]',
    programme_id TEXT NOT NULL DEFAULT 'alliance-childcare-phase3',
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    block TEXT NOT NULL,
    village TEXT NOT NULL,
    child_name TEXT NOT NULL,
    dob DATE NOT NULL,
    age_years INTEGER NOT NULL,
    age_months INTEGER NOT NULL DEFAULT 0,
    gender TEXT NOT NULL,
    aadhaar_last4 TEXT,
    orphan_status TEXT NOT NULL,
    art_number TEXT,
    caregiver_name TEXT NOT NULL,
    caregiver_relationship TEXT NOT NULL,
    caregiver_phone TEXT NOT NULL,
    monthly_income NUMERIC(12, 2),
    weight_kg NUMERIC(5, 2),
    height_cm NUMERIC(5, 2),
    muac_cm NUMERIC(5, 2),
    bmi NUMERIC(5, 2),
    z_score NUMERIC(5, 2),
    nutritional_status TEXT,
    haemoglobin_gdl NUMERIC(4, 1),
    hb_category TEXT,
    viral_load TEXT,
    vl_category TEXT,
    meals_per_day INTEGER,
    total_required_support NUMERIC(10, 2) NOT NULL DEFAULT 0,
    grant_recommended BOOLEAN NOT NULL DEFAULT false,
    recommended_grant_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    review_confirmed BOOLEAN NOT NULL DEFAULT false,
    reviewer_notes TEXT,
    edit_reason TEXT,
    cell_state_hash TEXT,
    form_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    sync_status TEXT NOT NULL DEFAULT 'PENDING_SYNC',
    last_synced_at TIMESTAMPTZ,
    last_updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_submissions_unique_id UNIQUE (unique_id),
    CONSTRAINT uq_submissions_client_submission_id UNIQUE (client_submission_id),
    CONSTRAINT chk_submissions_version_positive CHECK (version >= 1),
    CONSTRAINT chk_submissions_consent_mandatory CHECK (consent_provided = true)
);

CREATE INDEX IF NOT EXISTS idx_submissions_unique_id ON public.submissions (unique_id);
CREATE INDEX IF NOT EXISTS idx_submissions_scope_lookup ON public.submissions (programme_id, state, district, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_sync_status ON public.submissions (sync_status, updated_at ASC);

-- ============================================================================
-- 3. TABLE: public.submission_files (Tigris S3 Metadata Registry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.submission_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    bucket_name TEXT NOT NULL DEFAULT 'childcare-assets',
    storage_key TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256_checksum TEXT NOT NULL,
    cell_state_hash TEXT NOT NULL,
    is_restricted_doc BOOLEAN NOT NULL DEFAULT true,
    sanitized_sheet_label TEXT GENERATED ALWAYS AS ('Restricted Doc [' || doc_type || ']') STORED,
    uploaded_by_user_id TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_submission_files_storage_key UNIQUE (bucket_name, storage_key),
    CONSTRAINT uq_submission_files_submission_doc UNIQUE (submission_id, doc_type),
    CONSTRAINT chk_submission_files_size_positive CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    CONSTRAINT chk_submission_files_restricted_only CHECK (is_restricted_doc = true)
);

CREATE INDEX IF NOT EXISTS idx_submission_files_submission_id ON public.submission_files (submission_id);

-- ============================================================================
-- 4. TABLE: public.sheets_mirror_jobs (Durable Outbox Queue)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sheets_mirror_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    operation TEXT NOT NULL DEFAULT 'UPSERT_ROW',
    target_sheet_name TEXT NOT NULL DEFAULT 'Child_Nutrition',
    sheet_row INTEGER,
    payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sheets_mirror_jobs_idempotency UNIQUE (idempotency_key),
    CONSTRAINT chk_sheets_mirror_operation CHECK (
        operation IN ('UPSERT_ROW', 'UPDATE_STATUS', 'UPDATE_ASSET', 'SYNC_ASSET_CONTAINER', 'DELETE_ROW')
    ),
    CONSTRAINT chk_sheets_mirror_target_sheet CHECK (
        target_sheet_name IN ('Child_Nutrition', '_Asset_Containers', 'Audit_Log')
    ),
    CONSTRAINT chk_sheets_mirror_status CHECK (
        status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'SUPERSEDED')
    )
);

CREATE INDEX IF NOT EXISTS idx_sheets_mirror_jobs_poll ON public.sheets_mirror_jobs (status, next_attempt_at ASC)
    WHERE status IN ('QUEUED', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_sheets_mirror_jobs_submission_id ON public.sheets_mirror_jobs (submission_id, created_at DESC);

-- ============================================================================
-- 5. DURABLE INTEGRATION QUEUES & IDEMPOTENCY REGISTRY (Migration 004)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_job_status') THEN
        CREATE TYPE public.webhook_job_status AS ENUM (
            'PENDING', 'CLAIMED', 'PROCESSED', 'FAILED', 'DEAD_LETTER'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbound_delivery_status') THEN
        CREATE TYPE public.outbound_delivery_status AS ENUM (
            'PREPARED', 'ACCEPTED_BY_GATEWAY', 'FAILED', 'UNCERTAIN', 'DELIVERED', 'READ'
        );
    END IF;
END $$;

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

-- ============================================================================
-- 6. ROW-LEVEL SECURITY & PERMISSIONS
-- ============================================================================
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sheets_mirror_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets_mirror_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.reporting_email_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_ingress_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_outbound_messages ENABLE ROW LEVEL SECURITY;

-- Revoke all from anon/public fail-closed
REVOKE ALL ON public.submissions FROM anon, PUBLIC;
REVOKE ALL ON public.submission_files FROM anon, PUBLIC;
REVOKE ALL ON public.sheets_mirror_jobs FROM anon, PUBLIC;
REVOKE ALL ON public.reporting_email_idempotency FROM anon, PUBLIC;
REVOKE ALL ON public.webhook_ingress_jobs FROM anon, PUBLIC;
REVOKE ALL ON public.whatsapp_outbound_messages FROM anon, PUBLIC;

-- Grant backend service_role full access
GRANT ALL ON public.submissions TO service_role;
GRANT ALL ON public.submission_files TO service_role;
GRANT ALL ON public.sheets_mirror_jobs TO service_role;
GRANT ALL ON public.reporting_email_idempotency TO service_role;
GRANT ALL ON public.webhook_ingress_jobs TO service_role;
GRANT ALL ON public.whatsapp_outbound_messages TO service_role;

-- Authenticated Read Policies
GRANT SELECT ON public.submissions TO authenticated;
DROP POLICY IF EXISTS submissions_select_policy ON public.submissions;
CREATE POLICY submissions_select_policy ON public.submissions
    FOR SELECT TO authenticated
    USING (
        public.jwt_is_verified()
        AND (
            public.jwt_role() IN ('LEADERSHIP', 'ADMIN')
            OR (
                public.jwt_has_state(state)
                AND (public.jwt_role() = 'STATE_REVIEWER' OR public.jwt_has_district(district))
            )
        )
    );

COMMIT;
