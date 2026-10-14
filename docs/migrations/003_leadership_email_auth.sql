-- ============================================================================
-- Migration: 003_leadership_email_auth.sql
-- Purpose:   Server-only Supabase PostgreSQL Schema for Individual Allowlisted
--            Leadership Email Authentication (Phase 3).
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT
--            SEPARATE EXPLICIT OWNER APPROVAL.
--
-- Security Model & Architecture Guarantees:
--   1. Zero Client Access:
--      - Table access is strictly restricted to `service_role` (server-side Next.js API).
--      - `anon` and `authenticated` roles have ZERO SELECT, INSERT, UPDATE, or
--        DELETE privileges.
--      - Row Level Security (RLS) is ENABLED on all tables and fails closed.
--   2. Atomic Session & Challenge Consumption:
--      - Challenges are single-use 128-bit verification codes stored only as SHA-256 hashes.
--      - Stored procedure `consume_leader_challenge_and_create_session` executes atomically:
--        consumes challenge, revokes prior active sessions for that leader, and issues a
--        new session record.
--   3. One Active Session per Leader Across Distributed Instances:
--      - Enforced via partial unique index `uq_active_leader_session` on `(leader_id)`
--        WHERE `is_revoked = FALSE`.
--      - Any new login atomically revokes existing active sessions.
--   4. Cryptographic Device Binding:
--      - Challenges and sessions store SHA-256 hash of a server-issued HttpOnly
--        browser device binding token (`leader_device_binding`), eliminating reliance
--        on spoofable User-Agent strings.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABLE: leader_identities
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leader_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Leadership Reviewer',
    role TEXT NOT NULL DEFAULT 'LEADERSHIP',
    allowed_states TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],
    allowed_districts TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auth_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_leader_identity_email UNIQUE (email),
    CONSTRAINT ck_leader_identity_role CHECK (role = 'LEADERSHIP'),
    CONSTRAINT ck_leader_auth_version CHECK (auth_version >= 1)
);

COMMENT ON TABLE public.leader_identities IS
'Authorized Leadership directory identities with national surveillance scope. Restricted to server service_role.';

CREATE INDEX IF NOT EXISTS idx_leader_identities_email_active
    ON public.leader_identities (email)
    WHERE is_active = TRUE;

-- ============================================================================
-- 2. TABLE: leader_auth_challenges
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leader_auth_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leader_id UUID NOT NULL REFERENCES public.leader_identities(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    device_binding_hash TEXT NOT NULL,
    user_agent_hash TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT ck_challenge_failed_attempts CHECK (failed_attempts >= 0)
);

COMMENT ON TABLE public.leader_auth_challenges IS
'Single-use 128-bit OTP challenges for Leadership login. Stores only SHA-256 verifier hashes.';

CREATE INDEX IF NOT EXISTS idx_leader_challenges_lookup
    ON public.leader_auth_challenges (email)
    WHERE is_used = FALSE AND is_locked = FALSE;

-- ============================================================================
-- 3. TABLE: leader_sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leader_sessions (
    session_id TEXT PRIMARY KEY,
    leader_id UUID NOT NULL REFERENCES public.leader_identities(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'LEADERSHIP',
    allowed_states TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],
    allowed_districts TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],
    auth_version INTEGER NOT NULL DEFAULT 1,
    device_binding_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ NULL,

    CONSTRAINT ck_leader_session_role CHECK (role = 'LEADERSHIP')
);

COMMENT ON TABLE public.leader_sessions IS
'Distributed Leadership active session store. Enforces single active session per leader.';

-- Single active session per leader constraint across all instances:
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_leader_session
    ON public.leader_sessions (leader_id)
    WHERE is_revoked = FALSE;

CREATE INDEX IF NOT EXISTS idx_leader_sessions_lookup
    ON public.leader_sessions (session_id)
    WHERE is_revoked = FALSE;

-- ============================================================================
-- 4. TABLE: leader_rate_limits
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leader_rate_limits (
    key TEXT PRIMARY KEY,
    short_window_timestamps BIGINT[] NOT NULL DEFAULT '{}',
    long_window_timestamps BIGINT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.leader_rate_limits IS
'Sliding-window distributed rate limiting records for OTP requests by email and IP.';

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES — FAIL CLOSED
-- ============================================================================

ALTER TABLE public.leader_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_rate_limits ENABLE ROW LEVEL SECURITY;

-- Revoke all direct privileges from public, anon, and authenticated
REVOKE ALL ON TABLE public.leader_identities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.leader_auth_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.leader_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.leader_rate_limits FROM PUBLIC, anon, authenticated;

-- Explicit grants only to service_role (Next.js server backend)
GRANT ALL ON TABLE public.leader_identities TO service_role;
GRANT ALL ON TABLE public.leader_auth_challenges TO service_role;
GRANT ALL ON TABLE public.leader_sessions TO service_role;
GRANT ALL ON TABLE public.leader_rate_limits TO service_role;

-- ============================================================================
-- 6. ATOMIC TRANSACTION PROCEDURE: consume_leader_challenge_and_create_session
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_leader_challenge_and_create_session(
    p_email TEXT,
    p_code_hash TEXT,
    p_device_binding_hash TEXT,
    p_new_session_id TEXT,
    p_now_ms BIGINT,
    p_absolute_lifetime_ms BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now TIMESTAMPTZ := to_timestamp(p_now_ms / 1000.0);
    v_abs_expiry TIMESTAMPTZ := to_timestamp((p_now_ms + p_absolute_lifetime_ms) / 1000.0);
    v_challenge RECORD;
    v_leader RECORD;
BEGIN
    -- 1. Find and lock active challenge for this email
    SELECT * INTO v_challenge
    FROM public.leader_auth_challenges
    WHERE email = LOWER(TRIM(p_email))
      AND is_used = FALSE
      AND is_locked = FALSE
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active challenge found', 'code', 'CHALLENGE_NOT_FOUND', 'status', 401);
    END IF;

    -- 2. Check challenge expiry
    IF v_challenge.expires_at < v_now THEN
        UPDATE public.leader_auth_challenges
        SET is_used = TRUE
        WHERE challenge_id = v_challenge.challenge_id;

        RETURN jsonb_build_object('success', false, 'error', 'Verification code has expired', 'code', 'EXPIRED_CODE', 'status', 401);
    END IF;

    -- 3. Check device binding hash
    IF v_challenge.device_binding_hash != p_device_binding_hash THEN
        UPDATE public.leader_auth_challenges
        SET failed_attempts = failed_attempts + 1,
            is_locked = (failed_attempts + 1 >= 5)
        WHERE challenge_id = v_challenge.challenge_id;

        RETURN jsonb_build_object('success', false, 'error', 'Device binding mismatch', 'code', 'DEVICE_MISMATCH', 'status', 401);
    END IF;

    -- 4. Check code hash
    IF v_challenge.code_hash != p_code_hash THEN
        UPDATE public.leader_auth_challenges
        SET failed_attempts = failed_attempts + 1,
            is_locked = (failed_attempts + 1 >= 5)
        WHERE challenge_id = v_challenge.challenge_id;

        IF v_challenge.failed_attempts + 1 >= 5 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Verification locked due to excessive failed attempts', 'code', 'LOCKED_OUT', 'status', 429);
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Invalid verification code', 'code', 'INVALID_CODE', 'status', 401);
        END IF;
    END IF;

    -- 5. Retrieve leader identity
    SELECT * INTO v_leader
    FROM public.leader_identities
    WHERE id = v_challenge.leader_id;

    IF NOT FOUND OR NOT v_leader.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Leadership account is deactivated or unauthorized', 'code', 'ACCOUNT_INACTIVE', 'status', 403);
    END IF;

    -- 6. Atomically mark challenge as used
    UPDATE public.leader_auth_challenges
    SET is_used = TRUE
    WHERE challenge_id = v_challenge.challenge_id;

    -- 7. Atomically revoke any existing active session for this leader
    UPDATE public.leader_sessions
    SET is_revoked = TRUE,
        revoked_at = v_now
    WHERE leader_id = v_leader.id
      AND is_revoked = FALSE;

    -- 8. Establish new active session
    INSERT INTO public.leader_sessions (
        session_id,
        leader_id,
        email,
        name,
        title,
        role,
        allowed_states,
        allowed_districts,
        auth_version,
        device_binding_hash,
        created_at,
        last_activity_at,
        absolute_expires_at,
        is_revoked
    ) VALUES (
        p_new_session_id,
        v_leader.id,
        v_leader.email,
        v_leader.full_name,
        v_leader.title,
        'LEADERSHIP',
        v_leader.allowed_states,
        v_leader.allowed_districts,
        v_leader.auth_version,
        p_device_binding_hash,
        v_now,
        v_now,
        v_abs_expiry,
        FALSE
    );

    RETURN jsonb_build_object(
        'success', true,
        'session', jsonb_build_object(
            'sessionId', p_new_session_id,
            'leaderId', v_leader.id,
            'email', v_leader.email,
            'name', v_leader.full_name,
            'title', v_leader.title,
            'role', 'LEADERSHIP',
            'allowedStates', v_leader.allowed_states,
            'allowedDistricts', v_leader.allowed_districts,
            'authVersion', v_leader.auth_version,
            'createdAt', p_now_ms,
            'lastActivityAt', p_now_ms,
            'absoluteExpiresAt', p_now_ms + p_absolute_lifetime_ms
        )
    );
END;
$$;

COMMIT;
