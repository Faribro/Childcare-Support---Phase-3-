-- ============================================================================
-- Migration: 20261012170000_core_schema_foundation.sql
-- Purpose:   Canonical Supabase PostgreSQL schema for Child Nutrition &
--            Caregiver Support PWA (Phase 3) — Post-PR-#73 Security & Mapping
--            Audit Edition.
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT
--            EXPLICIT OWNER APPROVAL.
--
-- Core Architectural Guarantees:
--   1. Supabase (`public.submissions`, `public.submission_files`,
--      `public.audit_events`) is the single canonical structured-data source
--      of truth.
--   2. Google Sheets (`Child_Nutrition`, `_Asset_Containers`, `Audit_Log`) is
--      demoted to an asynchronous reporting mirror fed exclusively by the
--      transactional outbox (`public.sheets_mirror_jobs`).
--   3. Unauthenticated (`anon` or `isVerified = false`) live record, list,
--      summary, export, and asset reads are unconditionally denied at both
--      the PostgreSQL privilege layer and Row-Level Security (RLS) layer.
--   4. Scope enforcement is hierarchical:
--      - FIELD_USER: constrained to assigned `state`, `district`, and
--        `programme_id`. Cannot DELETE records.
--      - STATE_REVIEWER: constrained to assigned `state`(s). Cannot DELETE
--        records.
--      - LEADERSHIP / ADMIN: explicitly authorized and auditable cross-state
--        access (`allowedStates` containing `'*'` or specific states). Only
--        ADMIN / LEADERSHIP may execute hard deletes.
--   5. Private Tigris objects remain private: `public.submission_files` stores
--      only object storage keys and cryptographic checksums. Raw Tigris keys,
--      signed URLs, and sensitive file metadata are stripped before enqueueing
--      to `public.sheets_mirror_jobs`, preserving `_Asset_Containers`
--      compatibility and sanitized `"Restricted Doc [<docType>]"` labels.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 0. SECURITY HELPER FUNCTIONS FOR RLS SCOPE EVALUATION
-- ============================================================================
-- SECURITY NOTE:
-- The Next.js backend authenticates users via HMAC-signed session cookies
-- (`evaluation_session_token` in `src/lib/server/sessionService.ts`) or
-- verified JWT claims containing:
--   {
--     "sub": "<userId>",
--     "role": "FIELD_USER" | "STATE_REVIEWER" | "LEADERSHIP" | "ADMIN",
--     "isVerified": true,
--     "allowedStates": ["Maharashtra"] | ["*"],
--     "allowedDistricts": ["Pune"] | ["*"],
--     "allowedProgrammes": ["alliance-childcare-phase3"] | ["*"]
--   }
-- Even if an unverified token is presented, `public.jwt_is_verified()` returns
-- FALSE and blocks all RLS policies.

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
      -- Default to allowing the canonical Phase 3 programme when claim is omitted,
      -- or require explicit match when `allowedProgrammes` is populated.
      auth.jwt() -> 'allowedProgrammes' IS NULL
      OR COALESCE(auth.jwt() -> 'allowedProgrammes', '[]'::jsonb) ? '*'
      OR COALESCE(auth.jwt() -> 'allowedProgrammes', '[]'::jsonb) ? target_programme
    );
$$;

-- ============================================================================
-- 1. TABLE: public.submissions
-- Canonical structured-data source for all 8 PWA assessment sections and all
-- 73 Google Sheets linelist columns.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Canonical Identity & Idempotency (Cols 1, 71)
    -- `unique_id` maps to Col 1 (`1\nUnique ID`, e.g. `MH-PUN-081200-02`).
    -- `client_submission_id` is TEXT (not UUID-only) so both UUID v4 offline
    -- queue keys and reconciled canonical IDs are accepted idempotently.
    unique_id TEXT NOT NULL,
    client_submission_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,

    -- Workflow & Submission Metadata (Cols 2, 3, 4, 5, 6, 68, 69, 70, 72, 73)
    status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by_user_id TEXT NOT NULL,
    submitted_by_email TEXT,
    assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- DPDP Act Mandatory Consent Gate (Col 5: `5\nConsent Obtained`)
    -- Security Requirement: Records without affirmative caregiver consent must
    -- never be persisted in canonical storage.
    consent_provided BOOLEAN NOT NULL DEFAULT true,

    -- Sanitized Caregiver Signature Label (Col 6: `6\nCaregiver Signature`)
    -- Stores only `"Restricted Doc [caregiverSignature]"` or app-gated proxy path,
    -- NEVER a raw Tigris S3 key or presigned URL.
    caregiver_signature_ref TEXT NOT NULL DEFAULT 'Restricted Doc [caregiverSignature]',

    -- Scope & Geographic Hierarchy (Cols 7, 8, 9, 10 + Programme Scope)
    programme_id TEXT NOT NULL DEFAULT 'alliance-childcare-phase3',
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    block TEXT NOT NULL,
    village TEXT NOT NULL,

    -- Child Demographics (Cols 11, 12, 13, 14, 15, 16, 17, 42)
    child_name TEXT NOT NULL,
    dob DATE NOT NULL,
    age_years INTEGER NOT NULL,
    age_months INTEGER NOT NULL DEFAULT 0,
    gender TEXT NOT NULL,
    -- Security Requirement: Never store full 12-digit Aadhaar. Only optional 4 digits.
    aadhaar_last4 TEXT,
    orphan_status TEXT NOT NULL,
    -- Maps to `demographics.artNumber` and Col 42 (`42\nART ID Number`)
    art_number TEXT,

    -- Primary Caregiver & Socio-Economic Summary (Cols 21, 22, 23, 31)
    caregiver_name TEXT NOT NULL,
    caregiver_relationship TEXT NOT NULL,
    caregiver_phone TEXT NOT NULL,
    monthly_income NUMERIC(12, 2),

    -- Anthropometry, Clinical & Nutrition Summary (Cols 33-38, 40-41, 45-46, 48)
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
    -- Col 48 is strictly `48\nMeals per Day` (resolved from legacy editReason collision)
    meals_per_day INTEGER,

    -- Education Support & Grant Recommendation (Step 8 + Supervisor Review)
    total_required_support NUMERIC(10, 2) NOT NULL DEFAULT 0,
    grant_recommended BOOLEAN NOT NULL DEFAULT false,
    recommended_grant_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,

    -- Supervisor Review & Optimistic Concurrency Control (Cols 68, 70, 71 + Asset OCC)
    review_confirmed BOOLEAN NOT NULL DEFAULT false,
    reviewer_notes TEXT,
    -- Separate `edit_reason` column so supervisor OCC edits never overwrite Col 48 (`meals_per_day`)
    edit_reason TEXT,
    -- SHA-256 hex digest of attachment container state for atomic asset upload OCC
    cell_state_hash TEXT,

    -- Complete 8-Step Validated Payload (`SubmissionFormData`)
    -- Preserves all nested fields (Cols 18-20, 24-30, 32, 39, 43-44, 47, 49-67)
    -- for lossless reconstruction of the 73-column Google Sheets mirror row.
    form_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Asynchronous Sheets Mirror Sync Tracking
    sync_status TEXT NOT NULL DEFAULT 'PENDING_SYNC',
    last_synced_at TIMESTAMPTZ,
    last_updated_by TEXT,

    -- System Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Uniqueness & Idempotency Constraints
    CONSTRAINT uq_submissions_unique_id UNIQUE (unique_id),
    CONSTRAINT uq_submissions_client_submission_id UNIQUE (client_submission_id),

    -- Domain & Integrity Constraints
    CONSTRAINT chk_submissions_version_positive CHECK (version >= 1),
    CONSTRAINT chk_submissions_consent_mandatory CHECK (consent_provided = true),
    CONSTRAINT chk_submissions_status CHECK (
        status IN (
            'DRAFT',
            'SUBMITTED',
            'PENDING_REVIEW',
            'UNDER_REVIEW',
            'APPROVED',
            'REJECTED',
            'NEEDS_CORRECTION',
            'ARCHIVED'
        )
    ),
    CONSTRAINT chk_submissions_sync_status CHECK (
        sync_status IN (
            'PENDING_SYNC',
            'SYNCING',
            'SYNCED',
            'SYNC_FAILED',
            'DEAD_LETTER'
        )
    ),
    CONSTRAINT chk_submissions_gender CHECK (
        gender IN ('Male', 'Female', 'Other', 'Transgender')
    ),
    CONSTRAINT chk_submissions_orphan_status CHECK (
        orphan_status IN (
            'Both Parents Alive',
            'Single Parent (Mother Alive)',
            'Single Parent (Father Alive)',
            'Double Orphan',
            'Abandoned / Unknown'
        )
    ),
    CONSTRAINT chk_submissions_age_years CHECK (age_years >= 0 AND age_years <= 25),
    CONSTRAINT chk_submissions_age_months CHECK (age_months >= 0 AND age_months < 12),
    CONSTRAINT chk_submissions_aadhaar_last4 CHECK (
        aadhaar_last4 IS NULL OR aadhaar_last4 ~ '^\d{4}$'
    ),
    CONSTRAINT chk_submissions_caregiver_phone CHECK (
        caregiver_phone ~ '^\d{10}$'
    ),
    CONSTRAINT chk_submissions_monthly_income CHECK (
        monthly_income IS NULL OR monthly_income >= 0
    ),
    CONSTRAINT chk_submissions_anthropometry_positive CHECK (
        (weight_kg IS NULL OR weight_kg > 0)
        AND (height_cm IS NULL OR height_cm > 0)
        AND (muac_cm IS NULL OR muac_cm > 0)
        AND (bmi IS NULL OR bmi > 0)
    ),
    CONSTRAINT chk_submissions_meals_per_day CHECK (
        meals_per_day IS NULL OR (meals_per_day >= 0 AND meals_per_day <= 10)
    ),
    CONSTRAINT chk_submissions_support_non_negative CHECK (
        total_required_support >= 0 AND recommended_grant_amount >= 0
    ),
    CONSTRAINT chk_submissions_cell_state_hash CHECK (
        cell_state_hash IS NULL OR cell_state_hash ~ '^[a-fA-F0-9]{64}$'
    ),
    CONSTRAINT chk_submissions_signature_sanitized CHECK (
        -- Prevent raw S3/Tigris URLs or keys from being written into the signature label
        caregiver_signature_ref !~* '(https?://|s3://|tigris|X-Amz-Signature)'
    )
);

COMMENT ON TABLE public.submissions IS
    'Canonical structured-data store for Child Nutrition & Caregiver Support assessments. Replaces Google Sheets as primary source of truth.';
COMMENT ON COLUMN public.submissions.programme_id IS
    'Programme scope identifier used alongside state and district to constrain FIELD_USER access.';
COMMENT ON COLUMN public.submissions.edit_reason IS
    'Supervisor/caseworker OCC edit reason stored separately so Col 48 (meals_per_day) is never overwritten.';

-- Indexes for Scoped Queries, Supervisor Dashboard, and Sync Worker
CREATE INDEX IF NOT EXISTS idx_submissions_scope_lookup
    ON public.submissions (programme_id, state, district, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_state_status_submitted
    ON public.submissions (state, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_sync_status
    ON public.submissions (sync_status, updated_at ASC)
    WHERE sync_status IN ('PENDING_SYNC', 'SYNC_FAILED', 'DEAD_LETTER');
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by
    ON public.submissions (submitted_by_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_art_number
    ON public.submissions (art_number)
    WHERE art_number IS NOT NULL;

-- ============================================================================
-- 2. TABLE: public.submission_files
-- Metadata registry for private binary objects stored in Tigris S3 bucket.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.submission_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,

    -- Document classification matching `AssetUploadSchema` (`docType`) and `_Asset_Containers`
    doc_type TEXT NOT NULL,

    -- Private Tigris S3 bucket & object key (NEVER exposed to Google Sheets or anonymous clients)
    bucket_name TEXT NOT NULL DEFAULT 'childcare-support-phase3-private',
    storage_key TEXT NOT NULL,

    -- File integrity & OCC verification
    original_filename TEXT,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256_checksum TEXT NOT NULL,
    cell_state_hash TEXT NOT NULL,

    -- Enforces that all beneficiary attachments are treated as restricted documents
    is_restricted_doc BOOLEAN NOT NULL DEFAULT true,
    sanitized_sheet_label TEXT GENERATED ALWAYS AS ('Restricted Doc [' || doc_type || ']') STORED,

    uploaded_by_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_submission_files_storage_key UNIQUE (bucket_name, storage_key),
    CONSTRAINT uq_submission_files_submission_doc UNIQUE (submission_id, doc_type),
    CONSTRAINT chk_submission_files_doc_type CHECK (
        doc_type IN (
            'caregiverSignature',
            'aadhaarDoc',
            'artCardDoc',
            'orphanProofDoc',
            'caregiverAadhaarDoc',
            'disabilityCertDoc',
            'bankPassbookDoc',
            'rationCardDoc',
            'schoolBonafideDoc',
            'medicalReportDoc',
            'consentFormDoc',
            'otherSupportingDoc'
        )
    ),
    CONSTRAINT chk_submission_files_mime_type CHECK (
        mime_type IN (
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/pdf'
        )
    ),
    CONSTRAINT chk_submission_files_size_positive CHECK (
        -- Maximum 10 MB per compressed field attachment
        size_bytes > 0 AND size_bytes <= 10485760
    ),
    CONSTRAINT chk_submission_files_sha256_hex CHECK (
        sha256_checksum ~ '^[a-fA-F0-9]{64}$'
    ),
    CONSTRAINT chk_submission_files_cell_state_hash CHECK (
        cell_state_hash ~ '^[a-fA-F0-9]{64}$'
    ),
    CONSTRAINT chk_submission_files_restricted_only CHECK (
        is_restricted_doc = true
    ),
    CONSTRAINT chk_submission_files_no_signed_url_in_key CHECK (
        storage_key !~* '(https?://|X-Amz-Signature|AWSAccessKeyId)'
    )
);

COMMENT ON TABLE public.submission_files IS
    'Private Tigris object metadata registry. Stores private object keys and SHA-256 digests; never stores presigned URLs or public links.';

CREATE INDEX IF NOT EXISTS idx_submission_files_submission_id
    ON public.submission_files (submission_id);

-- ============================================================================
-- 3. TABLE: public.sheets_mirror_jobs
-- Transactional Outbox for Asynchronous Google Sheets Reporting Mirror
-- (`Child_Nutrition`, `_Asset_Containers`, `Audit_Log`).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sheets_mirror_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,

    -- Idempotency key: e.g. `UPSERT_ROW:<unique_id>:v<version>`
    idempotency_key TEXT NOT NULL,

    operation TEXT NOT NULL DEFAULT 'UPSERT_ROW',
    target_sheet_name TEXT NOT NULL DEFAULT 'Child_Nutrition',
    sheet_row INTEGER,

    -- Sanitized snapshot of the record at the exact version being mirrored.
    -- Security Requirement: Must NEVER contain raw Tigris keys or signed URLs.
    payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Queue lifecycle & worker lease fields
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
        operation IN ('UPSERT_ROW', 'UPDATE_STATUS', 'SYNC_ASSET_CONTAINER', 'DELETE_ROW')
    ),
    CONSTRAINT chk_sheets_mirror_target_sheet CHECK (
        target_sheet_name IN ('Child_Nutrition', '_Asset_Containers', 'Audit_Log')
    ),
    CONSTRAINT chk_sheets_mirror_status CHECK (
        status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')
    ),
    CONSTRAINT chk_sheets_mirror_attempts CHECK (
        attempt_count >= 0 AND max_attempts >= 1 AND max_attempts <= 20
    ),
    CONSTRAINT chk_sheets_mirror_payload_sanitized CHECK (
        -- Hard guard ensuring raw Tigris storage keys or presigned S3 URLs never enter the Sheets outbox
        payload_snapshot::text !~* '(X-Amz-Signature|childcare-support-phase3-private|s3\.amazonaws\.com|fly\.storage\.tigris\.dev)'
    )
);

COMMENT ON TABLE public.sheets_mirror_jobs IS
    'Transactional outbox queue for asynchronous, idempotent synchronization to the Google Sheets reporting mirror.';

CREATE INDEX IF NOT EXISTS idx_sheets_mirror_jobs_poll
    ON public.sheets_mirror_jobs (status, next_attempt_at ASC)
    WHERE status IN ('QUEUED', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_sheets_mirror_jobs_submission_id
    ON public.sheets_mirror_jobs (submission_id, created_at DESC);

-- ============================================================================
-- 4. TABLE: public.audit_events
-- Immutable security & operational audit trail aligned with
-- `SecurityAuditEvent` in `src/lib/server/authorisation.ts`.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES public.submissions(id) ON DELETE SET NULL,
    submission_unique_id TEXT,

    -- Actor context
    actor_user_id TEXT NOT NULL,
    actor_email TEXT,
    actor_role TEXT NOT NULL,

    -- Action classification aligned with `SecurityAuditEvent['eventType']` and DB operations
    event_type TEXT NOT NULL,
    route TEXT,
    outcome TEXT NOT NULL DEFAULT 'ALLOWED',
    reason TEXT,

    -- Version tracking & structured diff metadata
    previous_version INTEGER,
    new_version INTEGER,
    ip_hash TEXT,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_audit_event_type CHECK (
        event_type IN (
            -- Application-level security events (`src/lib/server/authorisation.ts`)
            'AUTH_SUCCESS',
            'AUTH_FAILURE',
            'ACCESS_DENIED',
            'SCOPE_VIOLATION',
            'RECORD_ACCESSED',
            'RECORD_CREATED',
            'RECORD_UPDATED',
            'RECORD_DELETED',
            'EXPORT_ATTEMPT',
            'RECORD_EXPORTED',
            -- Lifecycle & storage/sync operational events
            'SUBMISSION_CREATED',
            'SUBMISSION_UPDATED',
            'STATUS_CHANGED',
            'FILE_UPLOADED',
            'FILE_ACCESSED',
            'SHEETS_SYNC_SUCCEEDED',
            'SHEETS_SYNC_FAILED'
        )
    ),
    CONSTRAINT chk_audit_event_outcome CHECK (
        outcome IN ('ALLOW', 'DENY', 'ALLOWED', 'DENIED', 'ERROR')
    )
);

COMMENT ON TABLE public.audit_events IS
    'Append-only security and data-governance audit log. UPDATE and DELETE are revoked for all roles.';

CREATE INDEX IF NOT EXISTS idx_audit_events_submission_id
    ON public.audit_events (submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
    ON public.audit_events (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type_created
    ON public.audit_events (event_type, created_at DESC);

-- ============================================================================
-- 5. TRIGGERS: TIMESTAMPS, OCC VERSION ENFORCEMENT, AND TRANSACTIONAL OUTBOX
-- ============================================================================

-- 5a. Automatic `updated_at` timestamp maintenance
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_set_updated_at ON public.submissions;
CREATE TRIGGER trg_submissions_set_updated_at
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_submission_files_set_updated_at ON public.submission_files;
CREATE TRIGGER trg_submission_files_set_updated_at
    BEFORE UPDATE ON public.submission_files
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_sheets_mirror_jobs_set_updated_at ON public.sheets_mirror_jobs;
CREATE TRIGGER trg_sheets_mirror_jobs_set_updated_at
    BEFORE UPDATE ON public.sheets_mirror_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_updated_at();

-- 5b. Optimistic Concurrency Control (OCC) guard on `public.submissions`
-- Ensures updates referencing content changes monotonically increment `version`
-- (`NEW.version = OLD.version + 1`), preventing lost updates.
CREATE OR REPLACE FUNCTION public.tg_enforce_submissions_occ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Allow background sync worker status updates (`sync_status`, `last_synced_at`)
    -- without bumping the domain record `version`.
    IF NEW.version = OLD.version
       AND (
           NEW.status IS DISTINCT FROM OLD.status
           OR NEW.form_payload IS DISTINCT FROM OLD.form_payload
           OR NEW.child_name IS DISTINCT FROM OLD.child_name
           OR NEW.caregiver_name IS DISTINCT FROM OLD.caregiver_name
           OR NEW.caregiver_phone IS DISTINCT FROM OLD.caregiver_phone
           OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes
       )
    THEN
        RAISE EXCEPTION 'OCC_VERSION_CONFLICT: Domain updates to public.submissions must increment version from % to %',
            OLD.version, OLD.version + 1
            USING ERRCODE = '40001';
    END IF;

    IF NEW.version < OLD.version THEN
        RAISE EXCEPTION 'OCC_VERSION_REGRESSION: Cannot decrement submission version from % to %',
            OLD.version, NEW.version
            USING ERRCODE = '40001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_enforce_occ ON public.submissions;
CREATE TRIGGER trg_submissions_enforce_occ
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_enforce_submissions_occ();

-- 5c. Transactional Outbox Trigger: Atomically enqueue a sanitized Google Sheets
-- mirror job whenever a submission is inserted or its domain version advances.
CREATE OR REPLACE FUNCTION public.tg_enqueue_sheets_mirror_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sanitized_payload JSONB;
    v_operation TEXT;
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.version > OLD.version) THEN
        v_operation := CASE WHEN TG_OP = 'INSERT' THEN 'UPSERT_ROW' ELSE 'UPSERT_ROW' END;

        -- Construct a sanitized mirror snapshot that strips any accidental
        -- storage keys and enforces `"Restricted Doc [...]"` labels for Sheets.
        v_sanitized_payload := jsonb_build_object(
            'uniqueId', NEW.unique_id,
            'clientSubmissionId', NEW.client_submission_id,
            'version', NEW.version,
            'status', NEW.status,
            'programmeId', NEW.programme_id,
            'state', NEW.state,
            'district', NEW.district,
            'block', NEW.block,
            'village', NEW.village,
            'consentProvided', NEW.consent_provided,
            'caregiverSignature', 'Restricted Doc [caregiverSignature]',
            'editReason', NEW.edit_reason,
            'mealsPerDay', NEW.meals_per_day,
            'updatedAt', NEW.updated_at
        );

        INSERT INTO public.sheets_mirror_jobs (
            submission_id,
            idempotency_key,
            operation,
            target_sheet_name,
            payload_snapshot,
            status,
            next_attempt_at
        )
        VALUES (
            NEW.id,
            'UPSERT_ROW:' || NEW.unique_id || ':v' || NEW.version::text,
            v_operation,
            'Child_Nutrition',
            v_sanitized_payload,
            'QUEUED',
            NOW()
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_enqueue_sheets_mirror ON public.submissions;
CREATE TRIGGER trg_submissions_enqueue_sheets_mirror
    AFTER INSERT OR UPDATE ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_enqueue_sheets_mirror_job();

-- ============================================================================
-- 6. ROW-LEVEL SECURITY (RLS) & LEAST-PRIVILEGE GRANTS
-- ============================================================================

-- Enable and Force RLS on every table
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sheets_mirror_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets_mirror_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

-- Security Decision: Explicitly REVOKE ALL privileges from `anon` and `PUBLIC`
-- so unauthenticated callers can never read or mutate any table.
REVOKE ALL ON public.submissions FROM anon, PUBLIC;
REVOKE ALL ON public.submission_files FROM anon, PUBLIC;
REVOKE ALL ON public.sheets_mirror_jobs FROM anon, PUBLIC;
REVOKE ALL ON public.audit_events FROM anon, PUBLIC;

-- Security Decision: `authenticated` users never receive `DELETE` on
-- `submission_files` or `audit_events`, and never touch `sheets_mirror_jobs`
-- directly (handled by `service_role` / outbox trigger).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT SELECT, INSERT ON public.submission_files TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO authenticated;

GRANT ALL ON public.submissions TO service_role;
GRANT ALL ON public.submission_files TO service_role;
GRANT ALL ON public.sheets_mirror_jobs TO service_role;
GRANT ALL ON public.audit_events TO service_role;
REVOKE UPDATE, DELETE ON public.audit_events FROM service_role;

-- ----------------------------------------------------------------------------
-- 6a. RLS Policies for `public.submissions`
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS submissions_select_scoped ON public.submissions;
CREATE POLICY submissions_select_scoped
    ON public.submissions
    FOR SELECT
    TO authenticated
    USING (
        public.jwt_is_verified()
        AND (
            -- Leadership & Admin: cross-state or assigned-state read
            (
                public.jwt_role() IN ('ADMIN', 'LEADERSHIP')
                AND public.jwt_has_state(state)
            )
            -- State Reviewer: constrained to assigned state(s)
            OR (
                public.jwt_role() = 'STATE_REVIEWER'
                AND public.jwt_has_state(state)
            )
            -- Field User: strictly constrained to assigned state + district + programme
            OR (
                public.jwt_role() = 'FIELD_USER'
                AND public.jwt_has_state(state)
                AND public.jwt_has_district(district)
                AND public.jwt_has_programme(programme_id)
            )
        )
    );

DROP POLICY IF EXISTS submissions_insert_scoped ON public.submissions;
CREATE POLICY submissions_insert_scoped
    ON public.submissions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.jwt_is_verified()
        AND consent_provided = true
        AND (
            (
                public.jwt_role() IN ('ADMIN', 'LEADERSHIP')
                AND public.jwt_has_state(state)
            )
            OR (
                public.jwt_role() = 'STATE_REVIEWER'
                AND public.jwt_has_state(state)
            )
            OR (
                public.jwt_role() = 'FIELD_USER'
                AND submitted_by_user_id = (auth.jwt() ->> 'sub')
                AND public.jwt_has_state(state)
                AND public.jwt_has_district(district)
                AND public.jwt_has_programme(programme_id)
            )
        )
    );

DROP POLICY IF EXISTS submissions_update_scoped ON public.submissions;
CREATE POLICY submissions_update_scoped
    ON public.submissions
    FOR UPDATE
    TO authenticated
    USING (
        public.jwt_is_verified()
        AND (
            (
                public.jwt_role() IN ('ADMIN', 'LEADERSHIP')
                AND public.jwt_has_state(state)
            )
            OR (
                public.jwt_role() = 'STATE_REVIEWER'
                AND public.jwt_has_state(state)
            )
            OR (
                public.jwt_role() = 'FIELD_USER'
                AND public.jwt_has_state(state)
                AND public.jwt_has_district(district)
                AND public.jwt_has_programme(programme_id)
                AND status NOT IN ('APPROVED', 'ARCHIVED')
            )
        )
    )
    WITH CHECK (
        public.jwt_is_verified()
        AND consent_provided = true
        AND (
            (
                public.jwt_role() IN ('ADMIN', 'LEADERSHIP')
                AND public.jwt_has_state(state)
            )
            OR (
                public.jwt_role() = 'STATE_REVIEWER'
                AND public.jwt_has_state(state)
            )
            OR (
                public.jwt_role() = 'FIELD_USER'
                AND public.jwt_has_state(state)
                AND public.jwt_has_district(district)
                AND public.jwt_has_programme(programme_id)
            )
        )
    );

-- Security Decision: Only ADMIN and LEADERSHIP may hard-delete submissions.
-- FIELD_USER and STATE_REVIEWER are denied DELETE at the RLS layer.
DROP POLICY IF EXISTS submissions_delete_admin_only ON public.submissions;
CREATE POLICY submissions_delete_admin_only
    ON public.submissions
    FOR DELETE
    TO authenticated
    USING (
        public.jwt_is_verified()
        AND public.jwt_role() IN ('ADMIN', 'LEADERSHIP')
        AND public.jwt_has_state(state)
    );

-- ----------------------------------------------------------------------------
-- 6b. RLS Policies for `public.submission_files`
-- Inherits state/district/programme scope from the parent `public.submissions` row.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS submission_files_select_scoped ON public.submission_files;
CREATE POLICY submission_files_select_scoped
    ON public.submission_files
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.submissions s
            WHERE s.id = submission_files.submission_id
              AND public.jwt_is_verified()
              AND (
                  (
                      public.jwt_role() IN ('ADMIN', 'LEADERSHIP', 'STATE_REVIEWER')
                      AND public.jwt_has_state(s.state)
                  )
                  OR (
                      public.jwt_role() = 'FIELD_USER'
                      AND public.jwt_has_state(s.state)
                      AND public.jwt_has_district(s.district)
                      AND public.jwt_has_programme(s.programme_id)
                  )
              )
        )
    );

DROP POLICY IF EXISTS submission_files_insert_scoped ON public.submission_files;
CREATE POLICY submission_files_insert_scoped
    ON public.submission_files
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.jwt_is_verified()
        AND uploaded_by_user_id = (auth.jwt() ->> 'sub')
        AND is_restricted_doc = true
        AND EXISTS (
            SELECT 1
            FROM public.submissions s
            WHERE s.id = submission_files.submission_id
              AND (
                  (
                      public.jwt_role() IN ('ADMIN', 'LEADERSHIP', 'STATE_REVIEWER')
                      AND public.jwt_has_state(s.state)
                  )
                  OR (
                      public.jwt_role() = 'FIELD_USER'
                      AND public.jwt_has_state(s.state)
                      AND public.jwt_has_district(s.district)
                      AND public.jwt_has_programme(s.programme_id)
                  )
              )
        )
    );

-- ----------------------------------------------------------------------------
-- 6c. RLS Policies for `public.sheets_mirror_jobs`
-- Restricted to `service_role` background sync workers; `ADMIN` / `LEADERSHIP`
-- may inspect queue diagnostics read-only.
-- ----------------------------------------------------------------------------

GRANT SELECT ON public.sheets_mirror_jobs TO authenticated;

DROP POLICY IF EXISTS sheets_mirror_jobs_select_leadership ON public.sheets_mirror_jobs;
CREATE POLICY sheets_mirror_jobs_select_leadership
    ON public.sheets_mirror_jobs
    FOR SELECT
    TO authenticated
    USING (
        public.jwt_is_verified()
        AND public.jwt_role() IN ('ADMIN', 'LEADERSHIP')
    );

-- ----------------------------------------------------------------------------
-- 6d. RLS Policies for `public.audit_events`
-- Append-only: authenticated users may insert their own audit events; only
-- `ADMIN`, `LEADERSHIP`, and `STATE_REVIEWER` (within state scope) may read.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS audit_events_insert_self ON public.audit_events;
CREATE POLICY audit_events_insert_self
    ON public.audit_events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.jwt_is_verified()
        AND actor_user_id = (auth.jwt() ->> 'sub')
    );

DROP POLICY IF EXISTS audit_events_select_supervisors ON public.audit_events;
CREATE POLICY audit_events_select_supervisors
    ON public.audit_events
    FOR SELECT
    TO authenticated
    USING (
        public.jwt_is_verified()
        AND (
            public.jwt_role() IN ('ADMIN', 'LEADERSHIP')
            OR (
                public.jwt_role() = 'STATE_REVIEWER'
                AND EXISTS (
                    SELECT 1
                    FROM public.submissions s
                    WHERE s.id = audit_events.submission_id
                      AND public.jwt_has_state(s.state)
                )
            )
        )
    );

COMMIT;
