-- ============================================================================
-- Rollback Migration: 20261023180000_rollback.sql
-- Purpose: Safely teardown state team and field user onboarding tables.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS service_role_all_rate_limits ON public.auth_rate_limits;
DROP POLICY IF EXISTS service_role_all_field_profiles ON public.field_user_profiles;
DROP POLICY IF EXISTS service_role_all_state_team_inv ON public.state_team_invitations;
DROP POLICY IF EXISTS service_role_all_state_team_reg ON public.state_team_registrations;

DROP FUNCTION IF EXISTS public.redeem_state_team_invitation(UUID);

DROP TABLE IF EXISTS public.auth_rate_limits;
DROP TABLE IF EXISTS public.field_user_profiles;
DROP TABLE IF EXISTS public.state_team_invitations;
DROP TABLE IF EXISTS public.state_team_registrations;

COMMIT;
