-- =============================================================================
-- Migration Plan (PREPARED ONLY — DO NOT APPLY WITHOUT USER APPROVAL)
-- Name: 20261112160000_sheets_mirror_dead_letter_replay.sql
-- Purpose: Partial index + atomic replay RPC for DEAD_LETTER rows in
--          public.sheets_mirror_jobs, restricted strictly to service_role.
-- =============================================================================

BEGIN;

-- 1. Fast lookup index for active DEAD_LETTER alerts and replay inspection.
CREATE INDEX IF NOT EXISTS idx_sheets_mirror_jobs_dead_letter_created
  ON public.sheets_mirror_jobs (created_at ASC)
  WHERE status = 'DEAD_LETTER';

-- 2. Atomic RPC to move DEAD_LETTER jobs back to QUEUED with reset attempts.
CREATE OR REPLACE FUNCTION public.replay_sheets_mirror_dead_letters_atomic(
  p_job_ids TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_requeued_ids TEXT[] := ARRAY[]::TEXT[];
  v_requeued_count INTEGER := 0;
BEGIN
  WITH target_jobs AS (
    SELECT id
    FROM public.sheets_mirror_jobs
    WHERE status = 'DEAD_LETTER'
      AND (
        p_job_ids IS NULL
        OR array_length(p_job_ids, 1) IS NULL
        OR id::text = ANY(p_job_ids)
      )
    ORDER BY created_at ASC
    LIMIT v_safe_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.sheets_mirror_jobs j
    SET status = 'QUEUED',
        attempt_count = 0,
        locked_at = NULL,
        locked_by = NULL,
        last_error = CASE
          WHEN j.last_error IS NOT NULL AND j.last_error <> '' THEN '[REPLAYED] ' || j.last_error
          ELSE '[REPLAYED]'
        END,
        updated_at = NOW()
    FROM target_jobs t
    WHERE j.id = t.id
    RETURNING j.id::text AS job_id
  )
  SELECT COALESCE(array_agg(job_id), ARRAY[]::TEXT[]), COUNT(*)
  INTO v_requeued_ids, v_requeued_count
  FROM updated;

  RETURN jsonb_build_object(
    'requeuedCount', v_requeued_count,
    'requeuedJobIds', v_requeued_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replay_sheets_mirror_dead_letters_atomic(TEXT[], INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replay_sheets_mirror_dead_letters_atomic(TEXT[], INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.replay_sheets_mirror_dead_letters_atomic(TEXT[], INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replay_sheets_mirror_dead_letters_atomic(TEXT[], INTEGER) TO service_role;

COMMIT;
