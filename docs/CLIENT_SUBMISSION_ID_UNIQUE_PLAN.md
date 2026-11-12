# `public.submissions(client_submission_id)` Unique Constraint Plan

Status: **Prepared only (NOT applied to production or staging)**.

## Why this migration exists

`20261012170000_core_schema_foundation.sql` defined `CONSTRAINT uq_submissions_client_submission_id UNIQUE (client_submission_id)` inside `CREATE TABLE IF NOT EXISTS public.submissions`. If the database already had a pre-existing `public.submissions` table, `CREATE TABLE IF NOT EXISTS` was skipped and `20261023130000_durable_supabase_tigris_atomic_lifecycle.sql` only ran `ADD COLUMN IF NOT EXISTS client_submission_id TEXT` without creating a unique constraint or unique index.

Migration [20261112150000_submissions_client_id_unique_plan.sql](../supabase/migrations/20261112150000_submissions_client_id_unique_plan.sql) makes `client_submission_id` uniqueness explicit and idempotent.

## Pre-flight check (read-only)

Run these read-only queries against the confirmed Supabase project **before** applying `20261112150000`:

```sql
-- 1. Check existing constraints/indexes on client_submission_id
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.submissions'::regclass
  AND contype IN ('u', 'p');

-- 2. Count rows missing client_submission_id
SELECT COUNT(*) AS missing_client_submission_id
FROM public.submissions
WHERE client_submission_id IS NULL OR BTRIM(client_submission_id) = '';

-- 3. Detect duplicate keys after fallback normalization
SELECT
  COALESCE(NULLIF(BTRIM(client_submission_id), ''), NULLIF(BTRIM(unique_id), ''), id::text) AS effective_key,
  COUNT(*) AS row_count,
  array_agg(id ORDER BY created_at ASC) AS row_ids
FROM public.submissions
GROUP BY 1
HAVING COUNT(*) > 1;
```

## Duplicate resolution (only if query #3 returns rows)

If query #3 returns any duplicate groups, inspect both rows before choosing whether to archive/re-key stale retries. Never auto-delete clinical data blindly. If one row is an exact accidental duplicate without downstream review edits:

```sql
-- Inspect full rows for a duplicate effective_key
SELECT id, unique_id, client_submission_id, version, created_at, updated_at, approved_alliance_india
FROM public.submissions
WHERE id = ANY(ARRAY['<uuid-1>', '<uuid-2>']::uuid[]);
```

Only after duplicates = 0, run `supabase db push` or apply `20261112150000_submissions_client_id_unique_plan.sql` during a low-traffic window (`STORAGE_ENGINE` cutover prep).

## Rollback SQL

```sql
BEGIN;
ALTER TABLE public.submissions
  DROP CONSTRAINT IF EXISTS uq_submissions_client_submission_id;
DROP INDEX IF EXISTS public.uq_submissions_client_submission_id;
ALTER TABLE public.submissions
  ALTER COLUMN client_submission_id DROP NOT NULL;
COMMIT;
```
