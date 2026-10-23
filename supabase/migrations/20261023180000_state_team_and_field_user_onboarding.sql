-- ============================================================================
-- Migration: 20261023180000_state_team_and_field_user_onboarding.sql
-- Purpose:   State-Team Registration, Private Invitation Code Engine, and
--            Field-User Onboarding Profiles for Child Nutrition PWA (Phase 3).
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT
--            SEPARATE EXPLICIT OWNER APPROVAL.
--
-- Security Model & Architecture Guarantees:
--   1. Zero Plaintext Storage:
--      - State-team invitation codes are NEVER stored in plaintext.
--      - Only cryptographically salted SHA-256 verifiers are stored.
--   2. Single-Name Identity Support:
--      - First name is required; last name is optional and defaults to empty string.
--   3. Atomic Multi-User Redemption:
--      - Multi-caseworker redemption with concurrency control and expiration checks
--        via atomic stored procedure `public.redeem_state_team_invitation`.
--   4. Strict Role Isolation:
--      - Field caseworkers are recorded with FIELD_USER privileges only.
--      - Zero privilege escalation to STATE_REVIEWER, LEADERSHIP, or ADMIN.
--   5. Fail-Closed RLS:
--      - Tables are accessible exclusively by `service_role` (server-side Next.js API).
--      - `anon` and `authenticated` roles have zero access.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABLE: state_team_registrations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_team_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    work_email TEXT NOT NULL,
    requested_state TEXT NOT NULL,
    organization TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    email_verified_at TIMESTAMPTZ NULL,
    approved_at TIMESTAMPTZ NULL,
    approved_by TEXT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_state_team_reg_status CHECK (
        status IN ('PENDING', 'VERIFIED', 'APPROVED', 'REJECTED', 'SUSPENDED')
    ),
    CONSTRAINT ck_state_team_first_name_not_empty CHECK (
        length(trim(first_name)) > 0
    ),
    CONSTRAINT ck_state_team_work_email_not_empty CHECK (
        length(trim(work_email)) > 0
    )
);

-- Case-insensitive unique index on work_email
CREATE UNIQUE INDEX IF NOT EXISTS uq_state_team_registrations_email_lower
    ON public.state_team_registrations (lower(work_email));

CREATE INDEX IF NOT EXISTS idx_state_team_registrations_state
    ON public.state_team_registrations (requested_state);

CREATE INDEX IF NOT EXISTS idx_state_team_registrations_status
    ON public.state_team_registrations (status);

-- ============================================================================
-- 2. TABLE: state_team_invitations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state_team_id UUID NOT NULL REFERENCES public.state_team_registrations(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    salt TEXT NOT NULL,
    verifier TEXT NOT NULL,
    max_redemptions INTEGER NOT NULL DEFAULT 50,
    redemption_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_state_team_inv_status CHECK (
        status IN ('ACTIVE', 'EXPIRED', 'ROTATED', 'REVOKED')
    ),
    CONSTRAINT ck_state_team_inv_max_redemptions CHECK (
        max_redemptions > 0
    ),
    CONSTRAINT ck_state_team_inv_redemption_count CHECK (
        redemption_count >= 0 AND redemption_count <= max_redemptions
    )
);

CREATE INDEX IF NOT EXISTS idx_state_team_invitations_state_status
    ON public.state_team_invitations (state, status);

CREATE INDEX IF NOT EXISTS idx_state_team_invitations_team_id
    ON public.state_team_invitations (state_team_id);

-- ============================================================================
-- 3. TABLE: field_user_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.field_user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub TEXT NOT NULL,
    google_email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    assigned_state TEXT NOT NULL,
    assigned_district TEXT NOT NULL,
    invitation_id UUID NOT NULL REFERENCES public.state_team_invitations(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_field_user_google_sub UNIQUE (google_sub),
    CONSTRAINT ck_field_user_status CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    CONSTRAINT ck_field_user_first_name_not_empty CHECK (length(trim(first_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_field_user_google_email_lower
    ON public.field_user_profiles (lower(google_email));

CREATE INDEX IF NOT EXISTS idx_field_user_state_district
    ON public.field_user_profiles (assigned_state, assigned_district);

-- ============================================================================
-- 4. TABLE: auth_rate_limits (In-DB fallback for distributed edge workers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    key TEXT PRIMARY KEY,
    attempt_timestamps BIGINT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. FUNCTION: Atomic Invitation Redemption Counter
-- ============================================================================

CREATE OR REPLACE FUNCTION public.redeem_state_team_invitation(
    p_invitation_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    new_count INTEGER,
    max_limit INTEGER,
    reason TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_inv RECORD;
BEGIN
    -- Select for update to lock the row during redemption
    SELECT * INTO v_inv
    FROM public.state_team_invitations
    WHERE id = p_invitation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, 0, 'INVITATION_NOT_FOUND'::TEXT;
        RETURN;
    END IF;

    IF v_inv.status != 'ACTIVE' THEN
        RETURN QUERY SELECT FALSE, v_inv.redemption_count, v_inv.max_redemptions, ('INVITATION_' || v_inv.status)::TEXT;
        RETURN;
    END IF;

    IF v_inv.expires_at <= NOW() THEN
        UPDATE public.state_team_invitations
        SET status = 'EXPIRED', updated_at = NOW()
        WHERE id = p_invitation_id;
        RETURN QUERY SELECT FALSE, v_inv.redemption_count, v_inv.max_redemptions, 'INVITATION_EXPIRED'::TEXT;
        RETURN;
    END IF;

    IF v_inv.redemption_count >= v_inv.max_redemptions THEN
        RETURN QUERY SELECT FALSE, v_inv.redemption_count, v_inv.max_redemptions, 'REDEMPTION_LIMIT_REACHED'::TEXT;
        RETURN;
    END IF;

    -- Increment counter atomically
    UPDATE public.state_team_invitations
    SET redemption_count = redemption_count + 1,
        updated_at = NOW()
    WHERE id = p_invitation_id
    RETURNING redemption_count, max_redemptions INTO v_inv.redemption_count, v_inv.max_redemptions;

    RETURN QUERY SELECT TRUE, v_inv.redemption_count, v_inv.max_redemptions, 'SUCCESS'::TEXT;
END;
$$;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.state_team_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Revoke all default public/anon/authenticated access
REVOKE ALL ON public.state_team_registrations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.state_team_invitations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.field_user_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.auth_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_state_team_invitation(UUID) FROM PUBLIC, anon, authenticated;

-- Grant access strictly to service_role (server-side only)
GRANT ALL ON public.state_team_registrations TO service_role;
GRANT ALL ON public.state_team_invitations TO service_role;
GRANT ALL ON public.field_user_profiles TO service_role;
GRANT ALL ON public.auth_rate_limits TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_state_team_invitation(UUID) TO service_role;

-- Server-only bypass policies for service_role
CREATE POLICY service_role_all_state_team_reg ON public.state_team_registrations
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY service_role_all_state_team_inv ON public.state_team_invitations
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY service_role_all_field_profiles ON public.field_user_profiles
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY service_role_all_rate_limits ON public.auth_rate_limits
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;
