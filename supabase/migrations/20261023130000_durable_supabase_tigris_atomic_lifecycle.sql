-- ==============================================================================
-- CHILDCARE SUPPORT PHASE 3: DURABLE SUPABASE & TIGRIS ATOMIC LIFECYCLE
-- Migration: 20261023130000_durable_supabase_tigris_atomic_lifecycle.sql
-- Target Project: rjrctsxdvkfkssqvmhbz (Supabase Staging / Production)
-- Purpose:
--   1. Ensures non-destructive, idempotent compatibility across public.submissions,
--      public.submission_files, and public.sheets_mirror_jobs.
--   2. Provides atomic, single-transaction RPC procedures for the complete lifecycle:
--      - create_submission_atomic: Atomic insert of submission + files + outbox mirror job.
--      - update_submission_atomic: Atomic OCC update with version check + outbox mirror job.
--      - update_submission_asset_atomic: Atomic OCC asset replacement + cell hash + outbox mirror job.
--      - delete_submission_atomic: Atomic soft-delete + outbox mirror job.
--      - claim_sheets_mirror_jobs_atomic: Atomic lease claiming (FOR UPDATE SKIP LOCKED) with crash recovery.
--      - complete_sheets_mirror_job_atomic: Atomic job completion & destination sync status update.
--      - fail_sheets_mirror_job_atomic: Exponential backoff and dead-letter handling.
--      - supersede_sheets_mirror_job_atomic: Mark obsolete jobs superseded by newer revisions.
-- Safety:
--   - Non-destructive (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION).
--   - Strict SECURITY DEFINER with search_path = public, pg_temp.
--   - REVOKE ALL from PUBLIC, anon, authenticated; GRANT to service_role ONLY.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. SCHEMA ALIGNMENT & DEFENSIVE COLUMN ADDITIONS
-- ==============================================================================

-- Align public.submissions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'submissions') THEN
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS unique_id TEXT;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS client_submission_id TEXT;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS programme_id TEXT NOT NULL DEFAULT 'alliance-childcare-phase3';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'SYNCED';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS cell_state_hash TEXT;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS form_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS block TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS village TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS child_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS dob TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS age_years INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS age_months INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS aadhaar_last4 TEXT;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS orphan_status TEXT NOT NULL DEFAULT 'None';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS caregiver_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS caregiver_relationship TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS caregiver_phone TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(12, 2) NOT NULL DEFAULT 0;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5, 2) NOT NULL DEFAULT 0;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS height_cm NUMERIC(5, 2) NOT NULL DEFAULT 0;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS muac_cm NUMERIC(5, 2) NOT NULL DEFAULT 0;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS bmi NUMERIC(5, 2) NOT NULL DEFAULT 0;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS nutritional_status TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
        ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS last_updated_by TEXT;

        -- Populate unique_id from submission_id if needed
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'submission_id') THEN
            UPDATE public.submissions SET unique_id = submission_id WHERE unique_id IS NULL;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'unique_id') THEN
            UPDATE public.submissions SET client_submission_id = unique_id WHERE client_submission_id IS NULL;
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_submissions_unique_id_canonical ON public.submissions (unique_id);
CREATE INDEX IF NOT EXISTS idx_submissions_sync_status ON public.submissions (sync_status, updated_at ASC);

-- Align public.submission_files
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'submission_files') THEN
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS cell_state_hash TEXT NOT NULL DEFAULT '';
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS is_restricted_doc BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS doc_type TEXT;
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS bucket_name TEXT NOT NULL DEFAULT 'childcare-assets';
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS sha256_checksum TEXT;
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS mime_type TEXT;
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS storage_key TEXT;
        ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS original_filename TEXT;

        -- Populate doc_type from field_name if present
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'submission_files' AND column_name = 'field_name') THEN
            UPDATE public.submission_files SET doc_type = field_name WHERE doc_type IS NULL;
        END IF;

        -- Populate sha256_checksum from sha256_hash if present
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'submission_files' AND column_name = 'sha256_hash') THEN
            UPDATE public.submission_files SET sha256_checksum = sha256_hash WHERE sha256_checksum IS NULL;
        END IF;

        -- Populate size_bytes from file_size_bytes if present
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'submission_files' AND column_name = 'file_size_bytes') THEN
            UPDATE public.submission_files SET size_bytes = file_size_bytes WHERE size_bytes IS NULL;
        END IF;
    END IF;
END $$;

-- Align public.sheets_mirror_jobs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sheets_mirror_jobs') THEN
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS target_sheet_name TEXT NOT NULL DEFAULT 'Child_Nutrition';
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS sheet_row INTEGER;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;
        ALTER TABLE public.sheets_mirror_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;

        -- Populate payload_snapshot from payload if present
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sheets_mirror_jobs' AND column_name = 'payload') THEN
            UPDATE public.sheets_mirror_jobs SET payload_snapshot = payload WHERE payload_snapshot = '{}'::jsonb;
        END IF;

        -- Populate attempt_count from attempts if present
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sheets_mirror_jobs' AND column_name = 'attempts') THEN
            UPDATE public.sheets_mirror_jobs SET attempt_count = attempts WHERE attempt_count = 0;
        END IF;

        -- Upgrade status check constraint to encompass all lifecycle states
        ALTER TABLE public.sheets_mirror_jobs DROP CONSTRAINT IF EXISTS chk_sheets_mirror_status;
        ALTER TABLE public.sheets_mirror_jobs ADD CONSTRAINT chk_sheets_mirror_status CHECK (
            status IN ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'SUPERSEDED')
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sheets_mirror_jobs_polling 
    ON public.sheets_mirror_jobs (status, next_attempt_at ASC)
    WHERE status IN ('PENDING', 'QUEUED', 'FAILED');

-- ==============================================================================
-- 2. ATOMIC RPC: CREATE SUBMISSION
-- Commits submission + file metadata + outbox mirror job in ONE transaction.
-- Resolves retries after uncertain timeouts idempotently.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_submission_atomic(
    p_submission JSONB,
    p_files JSONB,
    p_idempotency_key TEXT,
    p_mirror_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_unique_id TEXT := p_submission->>'unique_id';
    v_client_sub_id TEXT := COALESCE(p_submission->>'client_submission_id', v_unique_id);
    v_existing RECORD;
    v_sub_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_consent BOOLEAN;
    v_file JSONB;
BEGIN
    -- 1. Check idempotency: does this submission already exist?
    SELECT * INTO v_existing
    FROM public.submissions
    WHERE unique_id = v_unique_id
       OR client_submission_id = v_client_sub_id
       OR (
           EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'submission_id'
           )
           AND submission_id = v_unique_id
       )
    LIMIT 1;

    IF FOUND THEN
        -- Return existing outcome without creating duplicates
        RETURN jsonb_build_object(
            'success', true,
            'isDuplicate', true,
            'status', v_existing.status,
            'version', v_existing.version,
            'id', v_existing.id,
            'uniqueId', COALESCE(v_existing.unique_id, v_unique_id)
        );
    END IF;

    -- 2. Mandatory Consent Validation (DPDP Act)
    v_consent := COALESCE((p_submission->>'consent_provided')::boolean, false);
    IF NOT v_consent THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'CONSENT_REQUIRED',
            'message', 'Explicit affirmative consent is mandatory and must be true.'
        );
    END IF;

    -- 3. Insert Canonical Submission
    v_sub_id := gen_random_uuid();

    INSERT INTO public.submissions (
        id,
        unique_id,
        client_submission_id,
        version,
        status,
        sync_status,
        consent_provided,
        programme_id,
        state,
        district,
        block,
        village,
        child_name,
        dob,
        age_years,
        age_months,
        gender,
        aadhaar_last4,
        orphan_status,
        caregiver_name,
        caregiver_relationship,
        caregiver_phone,
        monthly_income,
        weight_kg,
        height_cm,
        muac_cm,
        bmi,
        nutritional_status,
        form_payload,
        created_at,
        updated_at
    ) VALUES (
        v_sub_id,
        v_unique_id,
        v_client_sub_id,
        1,
        COALESCE(p_submission->>'status', 'Submitted'),
        'PENDING_SYNC',
        true,
        COALESCE(p_submission->>'programme_id', 'alliance-childcare-phase3'),
        COALESCE(p_submission->>'state', 'Maharashtra'),
        COALESCE(p_submission->>'district', 'Pune'),
        COALESCE(p_submission->>'block', ''),
        COALESCE(p_submission->>'village', ''),
        COALESCE(p_submission->>'child_name', ''),
        COALESCE(p_submission->>'dob', ''),
        COALESCE((p_submission->>'age_years')::integer, 0),
        COALESCE((p_submission->>'age_months')::integer, 0),
        COALESCE(p_submission->>'gender', ''),
        p_submission->>'aadhaar_last4',
        COALESCE(p_submission->>'orphan_status', 'None'),
        COALESCE(p_submission->>'caregiver_name', ''),
        COALESCE(p_submission->>'caregiver_relationship', ''),
        COALESCE(p_submission->>'caregiver_phone', ''),
        COALESCE((p_submission->>'monthly_income')::numeric, 0),
        COALESCE((p_submission->>'weight_kg')::numeric, 0),
        COALESCE((p_submission->>'height_cm')::numeric, 0),
        COALESCE((p_submission->>'muac_cm')::numeric, 0),
        COALESCE((p_submission->>'bmi')::numeric, 0),
        COALESCE(p_submission->>'nutritional_status', ''),
        COALESCE(p_submission->'form_payload', '{}'::jsonb),
        v_now,
        v_now
    );

    -- 4. Insert Document Metadata
    IF p_files IS NOT NULL AND jsonb_typeof(p_files) = 'array' THEN
        FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
        LOOP
            INSERT INTO public.submission_files (
                id,
                submission_id,
                doc_type,
                bucket_name,
                storage_key,
                original_filename,
                mime_type,
                size_bytes,
                sha256_checksum,
                cell_state_hash,
                is_restricted_doc,
                created_at
            ) VALUES (
                gen_random_uuid(),
                v_sub_id,
                v_file->>'doc_type',
                COALESCE(v_file->>'bucket_name', 'childcare-assets'),
                v_file->>'storage_key',
                v_file->>'original_filename',
                COALESCE(v_file->>'mime_type', 'application/octet-stream'),
                COALESCE((v_file->>'size_bytes')::bigint, 0),
                COALESCE(v_file->>'sha256_checksum', ''),
                COALESCE(v_file->>'cell_state_hash', ''),
                true,
                v_now
            )
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- 5. Enqueue Outbox Mirror Job
    INSERT INTO public.sheets_mirror_jobs (
        id,
        submission_id,
        idempotency_key,
        operation,
        target_sheet_name,
        payload_snapshot,
        status,
        attempt_count,
        max_attempts,
        next_attempt_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_sub_id,
        p_idempotency_key,
        'UPSERT_ROW',
        'Child_Nutrition',
        COALESCE(p_mirror_payload, '{}'::jsonb),
        'QUEUED',
        0,
        5,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'isDuplicate', false,
        'status', 'Submitted',
        'version', 1,
        'id', v_sub_id,
        'uniqueId', v_unique_id
    );
END;
$$;

-- ==============================================================================
-- 3. ATOMIC RPC: UPDATE SUBMISSION (OCC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.update_submission_atomic(
    p_unique_id TEXT,
    p_expected_version INT,
    p_patch JSONB,
    p_idempotency_key TEXT,
    p_mirror_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing RECORD;
    v_next_version INT;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_next_status TEXT;
BEGIN
    SELECT * INTO v_existing
    FROM public.submissions
    WHERE unique_id = p_unique_id
       OR (
           EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'submission_id'
           )
           AND submission_id = p_unique_id
       )
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'NOT_FOUND');
    END IF;

    -- OCC Guard
    IF p_expected_version IS NOT NULL AND v_existing.version <> p_expected_version THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'OCC_CONFLICT',
            'currentVersion', v_existing.version,
            'expectedVersion', p_expected_version
        );
    END IF;

    v_next_version := v_existing.version + 1;
    v_next_status := COALESCE(
        p_patch->'approval'->>'decision',
        p_patch->>'status',
        v_existing.status
    );

    UPDATE public.submissions
    SET version = v_next_version,
        status = v_next_status,
        sync_status = 'PENDING_SYNC',
        form_payload = v_existing.form_payload || COALESCE(p_patch, '{}'::jsonb),
        updated_at = v_now
    WHERE id = v_existing.id;

    -- Enqueue Outbox Job
    INSERT INTO public.sheets_mirror_jobs (
        id,
        submission_id,
        idempotency_key,
        operation,
        target_sheet_name,
        payload_snapshot,
        status,
        attempt_count,
        max_attempts,
        next_attempt_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_existing.id,
        p_idempotency_key,
        'UPSERT_ROW',
        'Child_Nutrition',
        COALESCE(p_mirror_payload, '{}'::jsonb),
        'QUEUED',
        0,
        5,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'UPDATED',
        'version', v_next_version,
        'id', v_existing.id,
        'uniqueId', v_existing.unique_id
    );
END;
$$;

-- ==============================================================================
-- 4. ATOMIC RPC: UPDATE ASSET (OCC + CELL STATE HASH)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.update_submission_asset_atomic(
    p_unique_id TEXT,
    p_doc_type TEXT,
    p_file_record JSONB,
    p_expected_version INT,
    p_expected_cell_state_hash TEXT,
    p_idempotency_key TEXT,
    p_mirror_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing RECORD;
    v_existing_file RECORD;
    v_next_version INT;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_new_hash TEXT := p_file_record->>'cell_state_hash';
BEGIN
    SELECT * INTO v_existing
    FROM public.submissions
    WHERE unique_id = p_unique_id
       OR (
           EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'submission_id'
           )
           AND submission_id = p_unique_id
       )
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'NOT_FOUND');
    END IF;

    -- OCC Version Verification
    IF p_expected_version IS NOT NULL AND v_existing.version <> p_expected_version THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'OCC_CONFLICT',
            'currentVersion', v_existing.version,
            'expectedVersion', p_expected_version
        );
    END IF;

    -- OCC Cell State Hash Verification
    SELECT * INTO v_existing_file
    FROM public.submission_files
    WHERE submission_id = v_existing.id
      AND LOWER(doc_type) = LOWER(p_doc_type)
    LIMIT 1;

    IF p_expected_cell_state_hash IS NOT NULL AND v_existing_file.cell_state_hash IS NOT NULL THEN
        IF LOWER(v_existing_file.cell_state_hash) <> LOWER(p_expected_cell_state_hash) THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'OCC_CONFLICT',
                'message', 'Current cell state hash changed since dry-run verification.'
            );
        END IF;
    END IF;

    -- Upsert File Record
    IF v_existing_file.id IS NOT NULL THEN
        UPDATE public.submission_files
        SET bucket_name = COALESCE(p_file_record->>'bucket_name', bucket_name),
            storage_key = p_file_record->>'storage_key',
            mime_type = p_file_record->>'mime_type',
            size_bytes = (p_file_record->>'size_bytes')::bigint,
            sha256_checksum = p_file_record->>'sha256_checksum',
            cell_state_hash = v_new_hash,
            original_filename = COALESCE(p_file_record->>'original_filename', original_filename)
        WHERE id = v_existing_file.id;
    ELSE
        INSERT INTO public.submission_files (
            id,
            submission_id,
            doc_type,
            bucket_name,
            storage_key,
            mime_type,
            size_bytes,
            sha256_checksum,
            cell_state_hash,
            is_restricted_doc,
            original_filename,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_existing.id,
            p_doc_type,
            COALESCE(p_file_record->>'bucket_name', 'childcare-assets'),
            p_file_record->>'storage_key',
            p_file_record->>'mime_type',
            (p_file_record->>'size_bytes')::bigint,
            p_file_record->>'sha256_checksum',
            v_new_hash,
            true,
            p_file_record->>'original_filename',
            v_now
        );
    END IF;

    -- Increment Submission Version
    v_next_version := v_existing.version + 1;

    UPDATE public.submissions
    SET version = v_next_version,
        cell_state_hash = v_new_hash,
        sync_status = 'PENDING_SYNC',
        updated_at = v_now
    WHERE id = v_existing.id;

    -- Enqueue Outbox Mirror Job
    INSERT INTO public.sheets_mirror_jobs (
        id,
        submission_id,
        idempotency_key,
        operation,
        target_sheet_name,
        payload_snapshot,
        status,
        attempt_count,
        max_attempts,
        next_attempt_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_existing.id,
        p_idempotency_key,
        'UPDATE_ASSET',
        'Child_Nutrition',
        COALESCE(p_mirror_payload, '{}'::jsonb),
        'QUEUED',
        0,
        5,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'UPDATED',
        'version', v_next_version,
        'cellStateHash', v_new_hash,
        'id', v_existing.id,
        'uniqueId', v_existing.unique_id
    );
END;
$$;

-- ==============================================================================
-- 5. ATOMIC RPC: DELETE SUBMISSION (SOFT DELETE & MIRROR ENQUEUE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.delete_submission_atomic(
    p_unique_id TEXT,
    p_idempotency_key TEXT
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
    FROM public.submissions
    WHERE unique_id = p_unique_id
       OR (
           EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'submission_id'
           )
           AND submission_id = p_unique_id
       )
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'NOT_FOUND');
    END IF;

    UPDATE public.submissions
    SET status = 'DELETED',
        sync_status = 'PENDING_SYNC',
        updated_at = v_now
    WHERE id = v_existing.id;

    INSERT INTO public.sheets_mirror_jobs (
        id,
        submission_id,
        idempotency_key,
        operation,
        target_sheet_name,
        payload_snapshot,
        status,
        attempt_count,
        max_attempts,
        next_attempt_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_existing.id,
        p_idempotency_key,
        'DELETE_ROW',
        'Child_Nutrition',
        jsonb_build_object('uniqueId', v_existing.unique_id, 'remoteSubmissionId', v_existing.id),
        'QUEUED',
        0,
        5,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'status', 'DELETED', 'uniqueId', v_existing.unique_id);
END;
$$;

-- ==============================================================================
-- 6. ATOMIC RPC: LEASE CLAIMING FOR SHEETS MIRROR WORKER
-- FOR UPDATE SKIP LOCKED with crash recovery for expired leases.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.claim_sheets_mirror_jobs_atomic(
    p_worker_id TEXT,
    p_batch_size INT DEFAULT 10,
    p_lease_seconds INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_lease_expiry TIMESTAMPTZ := v_now + (p_lease_seconds || ' seconds')::interval;
    v_jobs JSONB;
BEGIN
    WITH candidate_jobs AS (
        SELECT id
        FROM public.sheets_mirror_jobs
        WHERE (
            status IN ('PENDING', 'QUEUED')
            OR (status = 'FAILED' AND next_attempt_at <= v_now)
            OR (status = 'PROCESSING' AND locked_at < (v_now - (p_lease_seconds || ' seconds')::interval))
        )
        AND attempt_count < max_attempts
        ORDER BY next_attempt_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_batch_size
    ),
    updated_jobs AS (
        UPDATE public.sheets_mirror_jobs j
        SET status = 'PROCESSING',
            locked_by = p_worker_id,
            locked_at = v_now,
            attempt_count = j.attempt_count + 1,
            last_attempted_at = v_now,
            updated_at = v_now
        FROM candidate_jobs c
        WHERE j.id = c.id
        RETURNING j.*
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
    INTO v_jobs
    FROM updated_jobs u;

    RETURN v_jobs;
END;
$$;

-- ==============================================================================
-- 7. ATOMIC RPC: COMPLETE SHEETS MIRROR JOB
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.complete_sheets_mirror_job_atomic(
    p_job_id UUID,
    p_sheet_row INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    SELECT * INTO v_job
    FROM public.sheets_mirror_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'NOT_FOUND');
    END IF;

    UPDATE public.sheets_mirror_jobs
    SET status = 'COMPLETED',
        sheet_row = COALESCE(p_sheet_row, sheet_row),
        completed_at = v_now,
        locked_by = NULL,
        locked_at = NULL,
        updated_at = v_now
    WHERE id = p_job_id;

    -- Update parent submission sync status
    UPDATE public.submissions
    SET sync_status = 'SYNCED',
        last_synced_at = v_now
    WHERE id = v_job.submission_id;

    RETURN jsonb_build_object('success', true, 'status', 'COMPLETED', 'jobId', p_job_id);
END;
$$;

-- ==============================================================================
-- 8. ATOMIC RPC: FAIL SHEETS MIRROR JOB
-- Handles exponential backoff and transition to DEAD_LETTER when retries exhausted.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fail_sheets_mirror_job_atomic(
    p_job_id UUID,
    p_error TEXT,
    p_retryable BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_new_status TEXT;
    v_backoff_seconds INT;
BEGIN
    SELECT * INTO v_job
    FROM public.sheets_mirror_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'NOT_FOUND');
    END IF;

    IF (NOT p_retryable) OR (v_job.attempt_count >= v_job.max_attempts) THEN
        v_new_status := 'DEAD_LETTER';
        UPDATE public.submissions
        SET sync_status = 'SYNC_FAILED'
        WHERE id = v_job.submission_id;
    ELSE
        v_new_status := 'FAILED';
    END IF;

    -- Exponential backoff: 10s, 20s, 40s, 80s, 160s, capped at 300s
    v_backoff_seconds := LEAST(300, (POWER(2, LEAST(v_job.attempt_count, 5)) * 10)::int);

    UPDATE public.sheets_mirror_jobs
    SET status = v_new_status,
        last_error = p_error,
        locked_by = NULL,
        locked_at = NULL,
        next_attempt_at = v_now + (v_backoff_seconds || ' seconds')::interval,
        updated_at = v_now
    WHERE id = p_job_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', v_new_status,
        'jobId', p_job_id,
        'attemptCount', v_job.attempt_count,
        'retryable', (v_new_status = 'FAILED')
    );
END;
$$;

-- ==============================================================================
-- 9. ATOMIC RPC: SUPERSEDE SHEETS MIRROR JOB
-- Prevents older outbox revisions from overwriting newer Google Sheets rows.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.supersede_sheets_mirror_job_atomic(
    p_job_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    UPDATE public.sheets_mirror_jobs
    SET status = 'SUPERSEDED',
        last_error = 'Superseded: ' || p_reason,
        locked_by = NULL,
        locked_at = NULL,
        updated_at = v_now
    WHERE id = p_job_id;

    RETURN jsonb_build_object('success', true, 'status', 'SUPERSEDED', 'jobId', p_job_id);
END;
$$;

-- ==============================================================================
-- 10. PRIVILEGES: SECURITY BOUNDARIES
-- Revoke all RPC execution from PUBLIC and anon; grant exclusively to service_role.
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public.create_submission_atomic(JSONB, JSONB, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_submission_atomic(JSONB, JSONB, TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_submission_atomic(TEXT, INT, JSONB, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_submission_atomic(TEXT, INT, JSONB, TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_submission_asset_atomic(TEXT, TEXT, JSONB, INT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_submission_asset_atomic(TEXT, TEXT, JSONB, INT, TEXT, TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_submission_atomic(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_submission_atomic(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_sheets_mirror_jobs_atomic(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sheets_mirror_jobs_atomic(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_sheets_mirror_job_atomic(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sheets_mirror_job_atomic(UUID, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fail_sheets_mirror_job_atomic(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_sheets_mirror_job_atomic(UUID, TEXT, BOOLEAN) TO service_role;

REVOKE EXECUTE ON FUNCTION public.supersede_sheets_mirror_job_atomic(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_sheets_mirror_job_atomic(UUID, TEXT) TO service_role;

COMMIT;
