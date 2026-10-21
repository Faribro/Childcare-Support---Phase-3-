-- ============================================================================
-- CHILDCARE SUPPORT PHASE 3: UNIFIED CANONICAL FOUNDATION & REPORTING SCHEMA
-- Target Project: rjrctsxdvkfkssqvmhbz (Supabase Staging)
-- Reconciles: PR #93 (Foundation, Submissions, Queues) & PR #94 (Durable Export Loop, Atomic RPCs)
-- Execution: Supabase Dashboard -> SQL Editor
-- Safety: Non-destructive, fully idempotent (IF NOT EXISTS), transactional (BEGIN/COMMIT)
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

REVOKE EXECUTE ON FUNCTION public.jwt_is_verified() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jwt_is_verified() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.jwt_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jwt_role() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.jwt_has_state(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jwt_has_state(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.jwt_has_district(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jwt_has_district(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.jwt_has_programme(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jwt_has_programme(TEXT) TO authenticated, service_role;

-- ============================================================================
-- 2. CANONICAL SUBMISSIONS STORAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    programme TEXT NOT NULL DEFAULT 'alliance-childcare-phase3',
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    visit_date DATE NOT NULL,
    submission_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    submitted_by_uid TEXT NOT NULL,
    submitted_by_role TEXT NOT NULL DEFAULT 'SUPERVISOR',
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    verification_status TEXT NOT NULL DEFAULT 'PENDING',
    sync_status TEXT NOT NULL DEFAULT 'SYNCED',
    
    -- Mandatory affirmative consent: strictly NO default value
    consent_provided BOOLEAN NOT NULL,
    consent_timestamp TIMESTAMPTZ,
    
    -- Verification and assessment metadata
    rejection_reason TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    evaluation_status TEXT DEFAULT 'PENDING_EVALUATION',
    
    -- JSON payloads
    form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Audit Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Constraints
    CONSTRAINT uq_submissions_submission_id UNIQUE (submission_id),
    CONSTRAINT chk_submissions_status CHECK (
        status IN ('DRAFT', 'SUBMITTED', 'PENDING_SYNC', 'SYNCED', 'SYNC_FAILED', 'FLAGGED', 'REJECTED')
    ),
    CONSTRAINT chk_submissions_verification CHECK (
        verification_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'NEEDS_REVISION')
    ),
    CONSTRAINT chk_submissions_consent_mandatory CHECK (
        consent_provided = true
    )
);

-- Ensure existing table without constraint gets updated safely
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'consent_provided'
    ) THEN
        ALTER TABLE public.submissions ALTER COLUMN consent_provided DROP DEFAULT;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.constraint_column_usage 
            WHERE table_schema = 'public' AND table_name = 'submissions' AND constraint_name = 'chk_submissions_consent_mandatory'
        ) THEN
            ALTER TABLE public.submissions ADD CONSTRAINT chk_submissions_consent_mandatory CHECK (consent_provided = true);
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_submissions_child_id ON public.submissions (child_id);
CREATE INDEX IF NOT EXISTS idx_submissions_state_district ON public.submissions (state, district);
CREATE INDEX IF NOT EXISTS idx_submissions_submission_date ON public.submissions (submission_date DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON public.submissions (submitted_by_uid);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_verification ON public.submissions (verification_status);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Clean drop of all legacy or candidate policies
DROP POLICY IF EXISTS "submissions_select_policy" ON public.submissions;
DROP POLICY IF EXISTS "submissions_select_scoped" ON public.submissions;
DROP POLICY IF EXISTS "submissions_select" ON public.submissions;

-- Tightened Row Level Security Policy
CREATE POLICY "submissions_select_scoped"
ON public.submissions
FOR SELECT
TO authenticated
USING (
    public.jwt_is_verified()
    AND public.jwt_role() IN ('LEADERSHIP', 'SUPERVISOR', 'ADMIN', 'STATE_REVIEWER')
    AND public.jwt_has_programme(programme)
    AND public.jwt_has_state(state)
    AND (
        public.jwt_role() IN ('STATE_REVIEWER', 'LEADERSHIP')
        OR public.jwt_has_district(district)
    )
);

DROP POLICY IF EXISTS "service_role_all_submissions" ON public.submissions;
CREATE POLICY "service_role_all_submissions"
ON public.submissions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 3. SUBMISSION FILES STORAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.submission_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id TEXT NOT NULL REFERENCES public.submissions(submission_id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    storage_provider TEXT NOT NULL DEFAULT 'tigris',
    storage_key TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_submission_files_key UNIQUE (storage_key),
    CONSTRAINT chk_submission_files_provider CHECK (storage_provider IN ('tigris', 'supabase_storage', 's3'))
);

CREATE INDEX IF NOT EXISTS idx_submission_files_submission ON public.submission_files (submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_files_field ON public.submission_files (field_name);
CREATE INDEX IF NOT EXISTS idx_submission_files_sha256 ON public.submission_files (sha256_hash);

ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submission_files_select_scoped" ON public.submission_files;
CREATE POLICY "submission_files_select_scoped"
ON public.submission_files
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.submission_id = submission_files.submission_id
          AND public.jwt_is_verified()
          AND public.jwt_role() IN ('LEADERSHIP', 'SUPERVISOR', 'ADMIN', 'STATE_REVIEWER')
          AND public.jwt_has_programme(s.programme)
          AND public.jwt_has_state(s.state)
          AND (
              public.jwt_role() IN ('STATE_REVIEWER', 'LEADERSHIP')
              OR public.jwt_has_district(s.district)
          )
    )
);

DROP POLICY IF EXISTS "service_role_all_submission_files" ON public.submission_files;
CREATE POLICY "service_role_all_submission_files"
ON public.submission_files
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 4. GOOGLE SHEETS ASYNC MIRROR QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sheets_mirror_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id TEXT NOT NULL REFERENCES public.submissions(submission_id) ON DELETE CASCADE,
    operation TEXT NOT NULL DEFAULT 'INSERT',
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    payload JSONB NOT NULL,
    last_error TEXT,
    locked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_sheets_mirror_operation CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    CONSTRAINT chk_sheets_mirror_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'))
);

CREATE INDEX IF NOT EXISTS idx_sheets_mirror_pending ON public.sheets_mirror_jobs (status, created_at)
    WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX IF NOT EXISTS idx_sheets_mirror_submission ON public.sheets_mirror_jobs (submission_id);

ALTER TABLE public.sheets_mirror_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_sheets_mirror_jobs" ON public.sheets_mirror_jobs;
CREATE POLICY "service_role_all_sheets_mirror_jobs"
ON public.sheets_mirror_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 5. WHATSAPP DOCUMENT LOOP & INBOUND EVENT INGESTION
-- ============================================================================
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

    CONSTRAINT uq_whatsapp_inbound_event_id UNIQUE (event_id),
    CONSTRAINT uq_whatsapp_inbound_idempotency UNIQUE (idempotency_key),
    CONSTRAINT chk_whatsapp_inbound_status CHECK (
        processing_status IN ('RECEIVED', 'CLAIMED', 'PROCESSED', 'FAILED', 'DUPLICATE')
    ),
    CONSTRAINT chk_whatsapp_inbound_event_type CHECK (
        event_type IN ('DOCUMENT_UPLOAD', 'TEXT_MESSAGE', 'STATUS_CALLBACK', 'INTERACTIVE_RESPONSE')
    )
);

-- Upgrade existing status constraint if table existed previously with older check
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'whatsapp_inbound_events'
    ) THEN
        ALTER TABLE public.whatsapp_inbound_events 
            ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'RECEIVED';
        ALTER TABLE public.whatsapp_inbound_events 
            ADD COLUMN IF NOT EXISTS error_message TEXT;
        ALTER TABLE public.whatsapp_inbound_events 
            DROP CONSTRAINT IF EXISTS chk_whatsapp_inbound_status;
        ALTER TABLE public.whatsapp_inbound_events 
            ADD CONSTRAINT chk_whatsapp_inbound_status CHECK (
                processing_status IN ('RECEIVED', 'CLAIMED', 'PROCESSED', 'FAILED', 'DUPLICATE')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_idempotency ON public.whatsapp_inbound_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_phone_hash ON public.whatsapp_inbound_events (from_phone_hash);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_created_at ON public.whatsapp_inbound_events (created_at DESC);

ALTER TABLE public.whatsapp_inbound_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_whatsapp_inbound_events" ON public.whatsapp_inbound_events;
CREATE POLICY "service_role_all_whatsapp_inbound_events"
    ON public.whatsapp_inbound_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Outbound requests table
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    phone_hash TEXT NOT NULL,
    recipient_masked TEXT NOT NULL,
    document_type TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_whatsapp_outbound_request_id UNIQUE (request_id),
    CONSTRAINT uq_whatsapp_outbound_idempotency UNIQUE (idempotency_key),
    CONSTRAINT chk_whatsapp_outbound_status CHECK (
        status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'FULFILLED')
    )
);

ALTER TABLE public.whatsapp_outbound_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_whatsapp_outbound_requests" ON public.whatsapp_outbound_requests;
CREATE POLICY "service_role_all_whatsapp_outbound_requests"
    ON public.whatsapp_outbound_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reporting sessions table
CREATE TABLE IF NOT EXISTS public.reporting_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'WHATSAPP',
    state TEXT NOT NULL DEFAULT 'IDLE',
    current_year INT NULL,
    date_basis TEXT NULL,
    pending_export JSONB NULL,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_reporting_sessions_session_id UNIQUE (session_id),
    CONSTRAINT chk_reporting_sessions_date_basis CHECK (
        date_basis IS NULL OR date_basis IN ('VISIT_DATE', 'SUBMISSION_DATE')
    )
);

CREATE INDEX IF NOT EXISTS idx_reporting_sessions_owner ON public.reporting_sessions (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_reporting_sessions_updated ON public.reporting_sessions (updated_at DESC);

ALTER TABLE public.reporting_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_reporting_sessions" ON public.reporting_sessions;
CREATE POLICY "service_role_all_reporting_sessions"
    ON public.reporting_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. REPORTING EMAIL IDEMPOTENCY & INGRESS QUEUES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reporting_email_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    recipient_email_hash TEXT NOT NULL,
    report_type TEXT NOT NULL,
    dispatch_status TEXT NOT NULL DEFAULT 'DISPATCHED',
    message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.webhook_ingress_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    channel TEXT NOT NULL DEFAULT 'WHATSAPP',
    sender_hash TEXT NOT NULL,
    payload JSONB NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT NOT NULL UNIQUE,
    recipient_phone_hash TEXT NOT NULL,
    payload JSONB NOT NULL,
    send_status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.reporting_email_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_ingress_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_outbound_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_reporting_email_idempotency" ON public.reporting_email_idempotency;
CREATE POLICY "service_role_all_reporting_email_idempotency"
ON public.reporting_email_idempotency FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_webhook_ingress_jobs" ON public.webhook_ingress_jobs;
CREATE POLICY "service_role_all_webhook_ingress_jobs"
ON public.webhook_ingress_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_whatsapp_outbound_messages" ON public.whatsapp_outbound_messages;
CREATE POLICY "service_role_all_whatsapp_outbound_messages"
ON public.whatsapp_outbound_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. EXPORT CONFIRMATION TOKENS & DELIVERY QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.export_confirmation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id TEXT NOT NULL UNIQUE,
    export_id TEXT NOT NULL UNIQUE,
    parameters_hash TEXT NOT NULL,
    user_id TEXT NOT NULL,
    recipient_email_exact TEXT NOT NULL,
    recipient_email_masked TEXT NOT NULL,
    preview_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
    consumed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_export_confirmation_tokens_user ON public.export_confirmation_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_export_confirmation_tokens_export ON public.export_confirmation_tokens(export_id);

CREATE TABLE IF NOT EXISTS public.export_delivery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id TEXT NOT NULL UNIQUE,
    export_id TEXT NOT NULL,
    report_type TEXT NOT NULL DEFAULT 'LINELIST_EXPORT',
    recipient_user_id TEXT NOT NULL,
    recipient_email_exact TEXT NOT NULL,
    recipient_email_masked TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    delivery_target TEXT NOT NULL DEFAULT 'APPS_SCRIPT_EMAIL_DISPATCHER',
    dispatch_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    lease_worker_id TEXT,
    lease_expires_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    error_reason TEXT,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMPTZ,

    CONSTRAINT chk_export_delivery_status CHECK (
        status IN ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'UNCERTAIN')
    )
);

CREATE INDEX IF NOT EXISTS idx_export_delivery_jobs_status ON public.export_delivery_jobs(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_export_delivery_jobs_lease ON public.export_delivery_jobs(lease_expires_at) WHERE status = 'PROCESSING';
CREATE INDEX IF NOT EXISTS idx_export_delivery_jobs_export ON public.export_delivery_jobs(export_id);

ALTER TABLE public.export_confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_delivery_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_export_tokens" ON public.export_confirmation_tokens;
CREATE POLICY "service_role_all_export_tokens"
ON public.export_confirmation_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_export_jobs" ON public.export_delivery_jobs;
CREATE POLICY "service_role_all_export_jobs"
ON public.export_delivery_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 8. ATOMIC STORED PROCEDURES (SECURITY DEFINER)
-- ============================================================================

-- Procedure 1: Atomic Token Consumption and Job Creation
CREATE OR REPLACE FUNCTION public.consume_export_confirmation_token_atomic(
    p_export_id TEXT,
    p_parameters_hash TEXT,
    p_user_id TEXT,
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
    SELECT * INTO v_token
    FROM public.export_confirmation_tokens
    WHERE export_id = p_export_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'NOT_FOUND');
    END IF;

    IF v_token.is_consumed THEN
        RETURN jsonb_build_object('success', false, 'status', 'ALREADY_CONSUMED');
    END IF;

    IF v_token.expires_at < v_now THEN
        RETURN jsonb_build_object('success', false, 'status', 'EXPIRED');
    END IF;

    IF v_token.parameters_hash <> p_parameters_hash THEN
        RETURN jsonb_build_object('success', false, 'status', 'TAMPERED_PARAMETERS');
    END IF;

    UPDATE public.export_confirmation_tokens
    SET is_consumed = TRUE,
        consumed_at = v_now
    WHERE id = v_token.id;

    INSERT INTO public.export_delivery_jobs (
        job_id,
        export_id,
        report_type,
        recipient_user_id,
        recipient_email_exact,
        recipient_email_masked,
        status,
        queued_at,
        updated_at
    ) VALUES (
        p_job_id,
        v_token.export_id,
        COALESCE(v_token.preview_metadata->>'reportType', 'LINELIST_EXPORT'),
        v_token.user_id,
        v_token.recipient_email_exact,
        v_token.recipient_email_masked,
        'QUEUED',
        v_now,
        v_now
    );

    RETURN jsonb_build_object('success', true, 'status', 'CONSUMED', 'jobId', p_job_id);
END;
$$;

-- Procedure 2: Atomic Inbound Event Claim & Deduplication
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

        RETURN jsonb_build_object('success', true, 'status', 'DUPLICATE_IN_PROGRESS', 'eventId', v_existing.event_id);
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

-- Procedure 3: Atomic Delivery Job Claim & Crash Recovery
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

-- Revoke RPC execution from public/anon/authenticated and grant to service_role
REVOKE EXECUTE ON FUNCTION public.consume_export_confirmation_token_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_export_confirmation_token_atomic(TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_whatsapp_inbound_event_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_inbound_event_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_export_delivery_job_atomic(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_export_delivery_job_atomic(TEXT, INT) TO service_role;

COMMIT;
