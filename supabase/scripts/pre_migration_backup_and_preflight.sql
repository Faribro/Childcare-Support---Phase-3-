-- ============================================================================
-- PRE-MIGRATION BACKUP & PREFLIGHT INSPECTION SCRIPT (STEP 1)
-- Target Project: rjrctsxdvkfkssqvmhbz (Supabase Staging)
-- Pinned Migration Commit: 6fbf093730cbaf8c9fd238df59e0f509b6263e56
-- Safety: READ-ONLY query. Creates only a temporary table in the current session.
-- Output: A single JSONB object with schema, policies, grants, data dump, and preflight checks.
-- ============================================================================

CREATE TEMP TABLE IF NOT EXISTS _pre_migration_backup_output (result JSONB);
TRUNCATE _pre_migration_backup_output;

DO $$
DECLARE
    v_tbl TEXT;
    v_tables TEXT[] := ARRAY[
        'leader_credentials',
        'leader_sessions',
        'leader_audit_log',
        'evaluation_credentials',
        'submissions',
        'submission_files',
        'sheets_mirror_jobs',
        'leader_rate_limit_events'
    ];
    v_data_dump JSONB := '{}'::jsonb;
    v_table_counts JSONB := '{}'::jsonb;
    v_existing_tables JSONB := '[]'::jsonb;
    v_schema_meta JSONB := '{}'::jsonb;
    v_preflight JSONB := '{}'::jsonb;
    v_count BIGINT;
    v_rows JSONB;
    v_final JSONB;
BEGIN
    -- 1. Inventory of all base tables in public schema
    SELECT COALESCE(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb)
    INTO v_existing_tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

    -- 2. Dump data and count rows for each relevant table if it exists
    FOREACH v_tbl IN ARRAY v_tables LOOP
        IF to_regclass('public.' || quote_ident(v_tbl)) IS NOT NULL THEN
            EXECUTE format('SELECT count(*) FROM public.%I', v_tbl) INTO v_count;
            EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM public.%I t', v_tbl) INTO v_rows;
            v_data_dump := v_data_dump || jsonb_build_object(v_tbl, v_rows);
            v_table_counts := v_table_counts || jsonb_build_object(v_tbl, v_count);
        ELSE
            v_table_counts := v_table_counts || jsonb_build_object(v_tbl, 'DOES_NOT_EXIST');
        END IF;
    END LOOP;

    -- 3. Extract schema metadata, constraints, policies, and role grants
    v_schema_meta := jsonb_build_object(
        'columns', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'table_name', table_name,
                'column_name', column_name,
                'data_type', data_type,
                'is_nullable', is_nullable,
                'column_default', column_default
            ) ORDER BY table_name, ordinal_position), '[]'::jsonb)
            FROM information_schema.columns
            WHERE table_schema = 'public'
        ),
        'constraints', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'table_name', tc.table_name,
                'constraint_name', tc.constraint_name,
                'constraint_type', tc.constraint_type,
                'check_clause', cc.check_clause
            ) ORDER BY tc.table_name, tc.constraint_name), '[]'::jsonb)
            FROM information_schema.table_constraints tc
            LEFT JOIN information_schema.check_constraints cc
                ON tc.constraint_name = cc.constraint_name
                AND tc.constraint_schema = cc.constraint_schema
            WHERE tc.table_schema = 'public'
        ),
        'policies', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'schemaname', schemaname,
                'tablename', tablename,
                'policyname', policyname,
                'permissive', permissive,
                'roles', roles,
                'cmd', cmd,
                'qual', qual,
                'with_check', with_check
            ) ORDER BY tablename, policyname), '[]'::jsonb)
            FROM pg_policies
            WHERE schemaname = 'public'
        ),
        'grants', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'table_name', table_name,
                'grantee', grantee,
                'privilege_type', privilege_type,
                'is_grantable', is_grantable
            ) ORDER BY table_name, grantee, privilege_type), '[]'::jsonb)
            FROM information_schema.role_table_grants
            WHERE table_schema = 'public'
        ),
        'functions', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'proname', p.proname,
                'arguments', pg_get_function_identity_arguments(p.oid),
                'prosecdef', p.prosecdef,
                'proconfig', p.proconfig
            ) ORDER BY p.proname), '[]'::jsonb)
            FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
        )
    );

    -- 4. Preflight verification checks
    v_preflight := jsonb_build_object(
        'submissions_table_exists', (to_regclass('public.submissions') IS NOT NULL),
        'submissions_consent_default', (
            SELECT column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'consent_provided'
        ),
        'submissions_check_constraints', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'constraint_name', tc.constraint_name,
                'check_clause', cc.check_clause
            )), '[]'::jsonb)
            FROM information_schema.table_constraints tc
            JOIN information_schema.check_constraints cc
                ON tc.constraint_name = cc.constraint_name
                AND tc.constraint_schema = cc.constraint_schema
            WHERE tc.table_schema = 'public' AND tc.table_name = 'submissions'
        ),
        'submissions_policies', (
            SELECT COALESCE(jsonb_agg(policyname ORDER BY policyname), '[]'::jsonb)
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'submissions'
        ),
        'anon_public_submissions_grants', (
            SELECT COALESCE(jsonb_agg(privilege_type), '[]'::jsonb)
            FROM information_schema.role_table_grants
            WHERE table_schema = 'public' AND table_name = 'submissions' AND grantee IN ('anon', 'PUBLIC')
        ),
        'programme_claim_evaluation_when_absent', (
            SELECT (
                '{"isVerified": true, "role": "LEADERSHIP"}'::jsonb -> 'allowedProgrammes' IS NULL
                OR COALESCE('{"isVerified": true, "role": "LEADERSHIP"}'::jsonb -> 'allowedProgrammes', '[]'::jsonb) ? '*'
                OR COALESCE('{"isVerified": true, "role": "LEADERSHIP"}'::jsonb -> 'allowedProgrammes', '[]'::jsonb) ? 'alliance-childcare-phase3'
            )
        ),
        'programme_claim_evaluation_when_restricted', (
            SELECT (
                '{"isVerified": true, "role": "LEADERSHIP", "allowedProgrammes": ["other-prog"]}'::jsonb -> 'allowedProgrammes' IS NULL
                OR COALESCE('{"isVerified": true, "role": "LEADERSHIP", "allowedProgrammes": ["other-prog"]}'::jsonb -> 'allowedProgrammes', '[]'::jsonb) ? '*'
                OR COALESCE('{"isVerified": true, "role": "LEADERSHIP", "allowedProgrammes": ["other-prog"]}'::jsonb -> 'allowedProgrammes', '[]'::jsonb) ? 'alliance-childcare-phase3'
            )
        )
    );

    -- 5. Package output
    v_final := jsonb_build_object(
        'metadata', jsonb_build_object(
            'project', 'rjrctsxdvkfkssqvmhbz',
            'exported_at', timezone('utc'::text, now()),
            'pinned_migration_sha', '6fbf093730cbaf8c9fd238df59e0f509b6263e56',
            'phase', 'STEP_1_PRE_MIGRATION_BACKUP'
        ),
        'summary', jsonb_build_object(
            'existing_tables', v_existing_tables,
            'table_record_counts', v_table_counts,
            'total_existing_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public')
        ),
        'preflight', v_preflight,
        'schema', v_schema_meta,
        'data_backup', v_data_dump
    );

    INSERT INTO _pre_migration_backup_output (result) VALUES (v_final);
END;
$$;

SELECT result FROM _pre_migration_backup_output;
