-- ============================================================================
-- Migration: 20261013170000_evaluation_credential_registry.sql
-- Purpose:   Server-only Supabase PostgreSQL Evaluation Credential Registry for
--            Child Nutrition & Caregiver Support PWA (Phase 3).
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT
--            SEPARATE EXPLICIT OWNER APPROVAL.
--
-- Security Model & Architecture Guarantees:
--   1. Zero Client Access:
--      - Table access is strictly restricted to `service_role` (server-side Next.js API).
--      - `anon` and `authenticated` roles have ZERO SELECT, INSERT, UPDATE, or
--        DELETE privileges.
--      - Row Level Security (RLS) is ENABLED and fails closed.
--   2. Strict Salted Slow Hash Storage:
--      - Only RFC 9106 PHC-encoded Argon2id salted password hashes ($argon2id$...)
--        are stored.
--      - Zero plaintext passwords or reversible ciphers are ever stored.
--   3. Independent State & Leadership Scopes:
--      - Each state evaluation profile has its own independent credential record.
--      - A state evaluation credential (`credential_kind = 'STATE_EVALUATION'`)
--        strictly requires a valid `state_code` (e.g. 'Maharashtra', 'West Bengal').
--      - Leadership evaluation (`credential_kind = 'LEADERSHIP_EVALUATION'`) has
--        `state_code IS NULL` and grants all-state read evaluation without
--        administrative, delete, or record-edit permissions.
--   4. Session Revocation on Rotation / Deactivation:
--      - Every credential has an integer `credential_version` (default 1).
--      - Rotating a password increments `credential_version` and updates `rotated_at`.
--      - Deactivating a credential sets `is_active = FALSE`.
--      - Previously issued session tokens bearing an older version or inactive
--        state are immediately rejected by the server token validator.
--   5. Future Migration to Individual Email-Based Accounts:
--      - Structured with unique UUID primary keys and role capabilities that
--        seamlessly map to individual Supabase `auth.users(id)` records when the
--        project transitions from shared credentials to individual identities.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABLE DEFINITION: evaluation_credential_registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.evaluation_credential_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_identifier TEXT NOT NULL,
    display_name TEXT NOT NULL,
    credential_kind TEXT NOT NULL,
    state_code TEXT NULL,
    programme_scope TEXT[] NOT NULL DEFAULT ARRAY['alliance-childcare-phase3']::text[],
    password_hash TEXT NOT NULL,
    credential_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Constraints
    CONSTRAINT uq_evaluation_credential_access_id UNIQUE (access_identifier),
    CONSTRAINT ck_evaluation_credential_kind CHECK (credential_kind IN ('STATE_EVALUATION', 'LEADERSHIP_EVALUATION', 'ADMIN')),
    CONSTRAINT ck_state_evaluation_requires_state CHECK (
        credential_kind != 'STATE_EVALUATION' OR (state_code IS NOT NULL AND length(trim(state_code)) > 0)
    ),
    CONSTRAINT ck_leadership_has_no_state CHECK (
        credential_kind != 'LEADERSHIP_EVALUATION' OR state_code IS NULL
    ),
    CONSTRAINT ck_evaluation_credential_version CHECK (credential_version >= 1),
    CONSTRAINT ck_evaluation_password_hash_format CHECK (password_hash LIKE '$argon2id$%')
);

COMMENT ON TABLE public.evaluation_credential_registry IS
'Restricted server-only registry of evaluation access credentials for State Reviewers, National Leadership, and Administrators. Zero client grants.';

COMMENT ON COLUMN public.evaluation_credential_registry.access_identifier IS
'Public non-secret access identifier (e.g., STATE-MH, STATE-WB, LEADERSHIP-ALL). Three-digit and uppercase codes permitted.';

COMMENT ON COLUMN public.evaluation_credential_registry.state_code IS
'Assigned Indian State name for STATE_EVALUATION kind. Must match domain state canonical names (e.g. Maharashtra, West Bengal). NULL for LEADERSHIP/ADMIN.';

COMMENT ON COLUMN public.evaluation_credential_registry.password_hash IS
'OWASP-compliant Argon2id salted password hash (RFC 9106 PHC encoded string). Plaintext passwords must NEVER be inserted.';

COMMENT ON COLUMN public.evaluation_credential_registry.credential_version IS
'Incremented on every credential rotation. Session tokens bearing mismatched versions are invalidated immediately.';

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_evaluation_credential_lookup
    ON public.evaluation_credential_registry (access_identifier)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_evaluation_credential_state
    ON public.evaluation_credential_registry (state_code)
    WHERE credential_kind = 'STATE_EVALUATION' AND is_active = TRUE;

-- ============================================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_evaluation_credential_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluation_credential_updated_at ON public.evaluation_credential_registry;
CREATE TRIGGER trg_evaluation_credential_updated_at
    BEFORE UPDATE ON public.evaluation_credential_registry
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_evaluation_credential_updated_at();

-- ============================================================================
-- 4. ROW-LEVEL SECURITY & PERMISSION HARDENING
-- ============================================================================

ALTER TABLE public.evaluation_credential_registry ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from anon, authenticated, and public roles
REVOKE ALL ON TABLE public.evaluation_credential_registry FROM anon, authenticated, public;

-- Grant access strictly to service_role (used exclusively by Next.js server runtime)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.evaluation_credential_registry TO service_role;

-- Default fail-closed policies (no direct client access under any circumstances)
DROP POLICY IF EXISTS p_evaluation_credential_deny_anon ON public.evaluation_credential_registry;
CREATE POLICY p_evaluation_credential_deny_anon
    ON public.evaluation_credential_registry
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS p_evaluation_credential_deny_authenticated ON public.evaluation_credential_registry;
CREATE POLICY p_evaluation_credential_deny_authenticated
    ON public.evaluation_credential_registry
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS p_evaluation_credential_service_role ON public.evaluation_credential_registry;
CREATE POLICY p_evaluation_credential_service_role
    ON public.evaluation_credential_registry
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 5. ADMINISTRATIVE RPC FUNCTIONS (SERVICE_ROLE ONLY)
-- ============================================================================

-- Function to safely rotate a credential, increment version, and record timestamp
CREATE OR REPLACE FUNCTION public.rotate_evaluation_credential(
    p_access_identifier TEXT,
    p_new_password_hash TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    access_id TEXT,
    new_version INTEGER,
    rotated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_record public.evaluation_credential_registry%ROWTYPE;
BEGIN
    IF p_new_password_hash NOT LIKE '$argon2id$%' THEN
        RAISE EXCEPTION 'Password hash must be a valid RFC 9106 Argon2id PHC encoded string ($argon2id$...)';
    END IF;

    UPDATE public.evaluation_credential_registry
    SET
        password_hash = p_new_password_hash,
        credential_version = credential_version + 1,
        rotated_at = NOW(),
        updated_at = NOW(),
        metadata = CASE WHEN p_metadata IS NOT NULL THEN metadata || p_metadata ELSE metadata END
    WHERE access_identifier = p_access_identifier
      AND is_active = TRUE
    RETURNING * INTO v_updated_record;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active credential for identifier % not found', p_access_identifier;
    END IF;

    RETURN QUERY SELECT
        v_updated_record.access_identifier,
        v_updated_record.credential_version,
        v_updated_record.rotated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_evaluation_credential(TEXT, TEXT, JSONB) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.rotate_evaluation_credential(TEXT, TEXT, JSONB) TO service_role;

-- Function to deactivate a credential
CREATE OR REPLACE FUNCTION public.deactivate_evaluation_credential(
    p_access_identifier TEXT,
    p_reason TEXT DEFAULT 'Deactivated by administrator'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.evaluation_credential_registry
    SET
        is_active = FALSE,
        updated_at = NOW(),
        metadata = metadata || jsonb_build_object('deactivated_reason', p_reason, 'deactivated_at', NOW())
    WHERE access_identifier = p_access_identifier;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_evaluation_credential(TEXT, TEXT) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.deactivate_evaluation_credential(TEXT, TEXT) TO service_role;

COMMIT;

-- ============================================================================
-- ARCHITECTURAL ROADMAP: FUTURE MIGRATION TO INDIVIDUAL EMAIL ACCOUNTS
-- ============================================================================
-- When the project transitions from shared credentials to individual identities:
-- 1. Create individual user identities in Supabase auth (`auth.users`).
-- 2. Add an optional column: `auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`.
-- 3. Create a relation table `public.user_state_assignments`:
--      user_id UUID REFERENCES auth.users(id),
--      state_code TEXT NOT NULL,
--      role TEXT NOT NULL,
--      created_at TIMESTAMPTZ DEFAULT NOW()
-- 4. The server session service and JWT claims mapper can read either individual
--    assignments or legacy shared credentials, enabling zero-downtime gradual migration.
-- ============================================================================
