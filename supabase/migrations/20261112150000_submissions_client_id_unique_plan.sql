-- =============================================================================
-- Migration Plan (PREPARED ONLY — DO NOT APPLY WITHOUT USER APPROVAL)
-- Name: 20261112150000_submissions_client_id_unique_plan.sql
-- Purpose: Guarantee a database-level UNIQUE constraint on
--          public.submissions(client_submission_id) even when public.submissions
--          pre-existed before 20261012170000_core_schema_foundation.sql.
-- =============================================================================

BEGIN;

-- 1. Ensure the client_submission_id column exists.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS client_submission_id TEXT;

-- 2. Backfill NULL or blank client_submission_id deterministically using
--    COALESCE(NULLIF(BTRIM(unique_id), ''), id::text) so existing legacy rows
--    have a deterministic non-empty key before adding uniqueness.
UPDATE public.submissions
SET client_submission_id = COALESCE(NULLIF(BTRIM(unique_id), ''), id::text)
WHERE client_submission_id IS NULL OR BTRIM(client_submission_id) = '';

-- 3. Preflight duplicate guard: fail loudly instead of silently deleting data
--    if duplicate client_submission_id values exist in the target table.
DO $$
DECLARE
  v_duplicate_groups INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_duplicate_groups
  FROM (
    SELECT client_submission_id
    FROM public.submissions
    GROUP BY client_submission_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF v_duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'Cannot add UNIQUE constraint uq_submissions_client_submission_id: % duplicate client_submission_id group(s) found. Resolve duplicates per docs/CLIENT_SUBMISSION_ID_UNIQUE_PLAN.md before re-running.',
      v_duplicate_groups;
  END IF;
END $$;

-- 4. Enforce non-null and idempotent UNIQUE constraint / index.
ALTER TABLE public.submissions
  ALTER COLUMN client_submission_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_submissions_client_submission_id'
      AND conrelid = 'public.submissions'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'submissions'
        AND indexname = 'uq_submissions_client_submission_id'
    ) THEN
      ALTER TABLE public.submissions
        ADD CONSTRAINT uq_submissions_client_submission_id
        UNIQUE USING INDEX uq_submissions_client_submission_id;
    ELSE
      ALTER TABLE public.submissions
        ADD CONSTRAINT uq_submissions_client_submission_id
        UNIQUE (client_submission_id);
    END IF;
  END IF;
END $$;

COMMIT;
