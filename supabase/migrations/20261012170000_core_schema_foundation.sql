-- Migration: 20261012170000_core_schema_foundation.sql
-- Description: Core schema foundation for Alliance Child Nutrition & Education Support PWA (Phase 3)
-- Target: Supabase PostgreSQL (ujmrijpiijcbysqkmpuh)
-- Scope: Canonical submissions, private Tigris file metadata, durable Sheets mirror queue, and security audit log.
-- Safety: Fully idempotent (IF NOT EXISTS), RLS enabled on all tables, strict constraints, least-privilege grants.

-- Enable pgcrypto extension for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. SUBMISSIONS TABLE
-- Primary canonical store for child nutrition and education assessments.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unique_id TEXT NOT NULL,
    client_submission_id UUID NOT NULL,
    idempotency_key TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    sync_state TEXT NOT NULL DEFAULT 'SYNCED',
    actor_id TEXT NOT NULL DEFAULT 'anonymous-field',
    submitted_by TEXT NOT NULL DEFAULT 'Caseworker',
    
    -- Geographic Access & Scope Filtering (DPDP Act & Regional Scopes)
    state TEXT NOT NULL DEFAULT 'Maharashtra',
    district TEXT NOT NULL,
    
    -- Clinical & Demographic Linelist Query Columns
    child_name TEXT NOT NULL,
    dob DATE NOT NULL,
    calculated_age NUMERIC(4, 1),
    gender TEXT NOT NULL,
    orphan_status TEXT NOT NULL,
    caregiver_name TEXT NOT NULL,
    caregiver_relationship TEXT NOT NULL,
    caregiver_phone TEXT,
    
    -- Health & HIV/ART Clinical Data
    art_number TEXT,
    art_status TEXT,
    vl_status TEXT,
    bmi NUMERIC(5, 2),
    bmi_category TEXT,
    nutrition_status TEXT,
    
    -- Education Tracking
    education_status TEXT,
    school_name TEXT,
    current_class TEXT,
    total_annual_education_cost NUMERIC(10, 2) DEFAULT 0,
    
    -- Governance & Verification
    approved_alliance_india TEXT,
    review_confirmed TEXT,
    
    -- Complete Canonical Domain Payload (JSONB)
    payload JSONB NOT NULL,
    
    -- Audit Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Invariants & Constraints
    CONSTRAINT uq_submissions_unique_id UNIQUE (unique_id),
    CONSTRAINT uq_submissions_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT chk_submissions_version CHECK (version >= 1),
    CONSTRAINT chk_submissions_status CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SYNCED')),
    CONSTRAINT chk_submissions_sync_state CHECK (sync_state IN ('PENDING', 'SYNCED', 'FAILED')),
    CONSTRAINT chk_submissions_gender CHECK (gender IN ('Male', 'Female', 'Other', 'Transgender'))
);

-- Indices for rapid querying, linelist pagination, and geographic scope enforcement
CREATE INDEX IF NOT EXISTS idx_submissions_state_district ON public.submissions (state, district);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON public.submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_updated_at ON public.submissions (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_unique_id ON public.submissions (unique_id);
CREATE INDEX IF NOT EXISTS idx_submissions_client_sub_id ON public.submissions (client_submission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions (status);

--------------------------------------------------------------------------------
-- 2. SUBMISSION FILES TABLE
-- Tracks private attachment objects stored in Tigris S3 object storage.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    storage_provider TEXT NOT NULL DEFAULT 'tigris',
    storage_bucket TEXT NOT NULL DEFAULT 'childcare-assets',
    storage_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256_checksum TEXT NOT NULL,
    upload_status TEXT NOT NULL DEFAULT 'PENDING',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Constraints
    CONSTRAINT uq_submission_files_storage_key UNIQUE (storage_key),
    CONSTRAINT chk_submission_files_doc_type CHECK (
        doc_type IN ('caregiverSignature', 'childPhoto', 'passbook', 'aadhaar', 'feeReceipt', 'marksheet')
    ),
    CONSTRAINT chk_submission_files_storage_provider CHECK (storage_provider IN ('tigris', 'drive', 'local')),
    CONSTRAINT chk_submission_files_mime_type CHECK (
        mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf')
    ),
    CONSTRAINT chk_submission_files_byte_size CHECK (byte_size > 0 AND byte_size <= 15728640), -- Max 15MB
    CONSTRAINT chk_submission_files_checksum CHECK (length(sha256_checksum) = 64),
    CONSTRAINT chk_submission_files_upload_status CHECK (
        upload_status IN ('PENDING', 'VERIFIED', 'FAILED', 'DELETED')
    )
);

CREATE INDEX IF NOT EXISTS idx_submission_files_sub_id ON public.submission_files (submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_files_doc_type ON public.submission_files (doc_type);

--------------------------------------------------------------------------------
-- 3. SHEETS MIRROR JOBS TABLE
-- Durable, idempotent queue for asynchronous Google Sheets reporting sync.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sheets_mirror_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    target_sheet_name TEXT NOT NULL DEFAULT 'Assessment_Linelist',
    status TEXT NOT NULL DEFAULT 'QUEUED',
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    idempotency_hash TEXT NOT NULL,
    payload_snapshot JSONB NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Constraints
    CONSTRAINT uq_sheets_mirror_idempotency UNIQUE (idempotency_hash),
    CONSTRAINT chk_sheets_mirror_operation CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    CONSTRAINT chk_sheets_mirror_status CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'))
);

CREATE INDEX IF NOT EXISTS idx_sheets_mirror_status_sched ON public.sheets_mirror_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sheets_mirror_sub_id ON public.sheets_mirror_jobs (submission_id);

--------------------------------------------------------------------------------
-- 4. AUDIT EVENTS TABLE
-- Comprehensive operational and compliance log strictly excluding raw PII.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    event_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    target_resource TEXT NOT NULL,
    scope TEXT,
    details TEXT,
    request_id TEXT,
    ip_address_hash TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Constraints
    CONSTRAINT chk_audit_event_type CHECK (
        event_type IN (
            'RECORD_CREATED', 'RECORD_UPDATED', 'RECORD_DELETED',
            'RECORD_VIEWED', 'SCOPE_VIOLATION', 'ACCESS_DENIED',
            'FILE_UPLOADED', 'FILE_ACCESSED'
        )
    ),
    CONSTRAINT chk_audit_outcome CHECK (outcome IN ('ALLOW', 'DENY', 'ERROR'))
);

CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON public.audit_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON public.audit_events (actor);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON public.audit_events (target_resource);

--------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets_mirror_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Submissions policies
-- Service role has unrestricted access for background syncing
CREATE POLICY "service_role_unrestricted_submissions"
    ON public.submissions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users select based on state assignment or leadership role
CREATE POLICY "authenticated_select_submissions"
    ON public.submissions
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') IN ('ADMIN', 'LEADERSHIP', 'AUDITOR')
        OR (auth.jwt() -> 'allowedStates') ? state
        OR (auth.jwt() -> 'allowedStates') ? '*'
    );

-- Authenticated users insert if their assigned state matches
CREATE POLICY "authenticated_insert_submissions"
    ON public.submissions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.jwt() ->> 'role') IN ('ADMIN', 'caseworker', 'FIELD_USER')
        AND (
            (auth.jwt() -> 'allowedStates') ? state
            OR (auth.jwt() -> 'allowedStates') ? '*'
        )
    );

-- Authenticated users update with state match
CREATE POLICY "authenticated_update_submissions"
    ON public.submissions
    FOR UPDATE
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') IN ('ADMIN', 'STATE_REVIEWER', 'caseworker')
        AND (
            (auth.jwt() -> 'allowedStates') ? state
            OR (auth.jwt() -> 'allowedStates') ? '*'
        )
    )
    WITH CHECK (
        (auth.jwt() ->> 'role') IN ('ADMIN', 'STATE_REVIEWER', 'caseworker')
        AND (
            (auth.jwt() -> 'allowedStates') ? state
            OR (auth.jwt() -> 'allowedStates') ? '*'
        )
    );

-- Deletion restricted to ADMIN or STATE_REVIEWER in their state
CREATE POLICY "authenticated_delete_submissions"
    ON public.submissions
    FOR DELETE
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') = 'ADMIN'
        OR (
            (auth.jwt() ->> 'role') = 'STATE_REVIEWER'
            AND (
                (auth.jwt() -> 'allowedStates') ? state
                OR (auth.jwt() -> 'allowedStates') ? '*'
            )
        )
    );

-- Submission files policies
CREATE POLICY "service_role_unrestricted_files"
    ON public.submission_files
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_select_files"
    ON public.submission_files
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = submission_files.submission_id
            AND (
                (auth.jwt() ->> 'role') IN ('ADMIN', 'LEADERSHIP', 'AUDITOR')
                OR (auth.jwt() -> 'allowedStates') ? s.state
                OR (auth.jwt() -> 'allowedStates') ? '*'
            )
        )
    );

-- sheets_mirror_jobs and audit_events are strictly internal service tables
CREATE POLICY "service_role_only_mirror_jobs"
    ON public.sheets_mirror_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_role_only_audit_events"
    ON public.audit_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

--------------------------------------------------------------------------------
-- 6. LEAST-PRIVILEGE GRANTS
--------------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_files TO authenticated, service_role;
GRANT ALL ON public.sheets_mirror_jobs TO service_role;
GRANT ALL ON public.audit_events TO service_role;

--------------------------------------------------------------------------------
-- 7. FORWARD REPAIR & ROLLBACK NOTES
-- Rollback:
-- DROP TABLE IF EXISTS public.audit_events CASCADE;
-- DROP TABLE IF EXISTS public.sheets_mirror_jobs CASCADE;
-- DROP TABLE IF EXISTS public.submission_files CASCADE;
-- DROP TABLE IF EXISTS public.submissions CASCADE;
--------------------------------------------------------------------------------
