-- ============================================================================
-- Rollback Migration: 005_rollback.sql
-- Purpose: Safely rolls back tables created by 005_durable_beneficiary_sessions_and_csc_tasks.sql
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public.csc_caseworker_tasks CASCADE;
DROP TABLE IF EXISTS public.beneficiary_whatsapp_sessions CASCADE;
DROP TABLE IF EXISTS public.caregiver_opt_outs CASCADE;

COMMIT;
