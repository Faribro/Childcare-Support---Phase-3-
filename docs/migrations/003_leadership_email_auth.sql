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
--      - `anon` and `authenticated` roles have ZERO privileges on tables and functions.
--      - Row Level Security (RLS) is ENABLED on all tables and fails closed.
--   2. Atomic Session & Challenge Consumption:
--      - Challenges are single-use 128-bit verification codes stored only as SHA-256 hashes.
--      - Explicit challenge identity (UUID) passed to consumption procedure.
--      - Procedures execute under locked transactions with per-leader serialization.
--   3. One Active Session per Leader Across Distributed Instances:
--      - Enforced via partial unique index `uq_active_leader_session` on `(leader_id)`
--        WHERE `is_revoked = FALSE`.
--      - Stored procedure atomically revokes prior active sessions before issuing new one.
--   4. Cryptographic Device Binding:
--      - Challenges and sessions store SHA-256 hash of a server-issued HttpOnly
--        browser device binding token (`leader_device_binding`).
--   5. Atomic Rate Limiting with Bounded Retention:
--      - Event-based rate limiting table with automatic pruning of expired windows.
--   6. Hardened SQL Privileges:
--      - Functions use fixed search_path (`SET search_path = public, pg_temp`).
--      - Privileges revoked from PUBLIC, anon, and authenticated.
--      - Granted exclusively to service_role.
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
    ON public.leader_auth_challenges (challenge_id)
    WHERE is_used = FALSE AND is_locked = FALSE;

CREATE INDEX IF NOT EXISTS idx_leader_challenges_email
    ON public.leader_auth_challenges (email)
    WHERE is_used = FALSE;

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
-- 4. TABLE: leader_rate_limit_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leader_rate_limit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.leader_rate_limit_events IS
'Append-only rate limit event log for atomic sliding-window rate checks with bounded cleanup.';

CREATE INDEX IF NOT EXISTS idx_leader_rate_limits_key_created
    ON public.leader_rate_limit_events (rate_key, created_at DESC);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES — FAIL CLOSED
-- ============================================================================

ALTER TABLE public.leader_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_rate_limit_events ENABLE ROW LEVEL SECURITY;

-- Revoke all direct privileges from public, anon, and authenticated
REVOKE ALL ON TABLE public.leader_identities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.leader_auth_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.leader_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.leader_rate_limit_events FROM PUBLIC, anon, authenticated;

-- Explicit grants only to service_role (Next.js server backend)
GRANT ALL ON TABLE public.leader_identities TO service_role;
GRANT ALL ON TABLE public.leader_auth_challenges TO service_role;
GRANT ALL ON TABLE public.leader_sessions TO service_role;
GRANT ALL ON TABLE public.leader_rate_limit_events TO service_role;

-- ============================================================================
-- 6. ATOMIC RATE LIMIT RPC: check_and_record_leader_rate_limit
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_and_record_leader_rate_limit(
    p_key TEXT,
    p_short_limit INT,
    p_short_window_seconds INT,
    p_long_limit INT,
    p_long_window_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_short_cutoff TIMESTAMPTZ := v_now - (p_short_window_seconds || ' seconds')::INTERVAL;
    v_long_cutoff TIMESTAMPTZ := v_now - (p_long_window_seconds || ' seconds')::INTERVAL;
    v_short_count INT;
    v_long_count INT;
    v_oldest_short TIMESTAMPTZ;
    v_oldest_long TIMESTAMPTZ;
    v_retry_after INT;
BEGIN
    -- Advisory transaction lock per rate limit key to serialize concurrent requests
    PERFORM pg_advisory_xact_lock(hashtext('rate_limit_' || p_key));

    -- Bounded cleanup of expired events older than the longest window
    DELETE FROM public.leader_rate_limit_events
    WHERE rate_key = p_key
      AND created_at < v_long_cutoff;

    -- Count events in short window
    SELECT COUNT(*), MIN(created_at)
    INTO v_short_count, v_oldest_short
    FROM public.leader_rate_limit_events
    WHERE rate_key = p_key
      AND created_at >= v_short_cutoff;

    IF v_short_count >= p_short_limit THEN
        v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_short + (p_short_window_seconds || ' seconds')::INTERVAL - v_now)))::INT);
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'Too many verification code requests in a short time. Please wait before requesting a new code.',
            'retryAfterSeconds', v_retry_after
        );
    END IF;

    -- Count events in long window
    SELECT COUNT(*), MIN(created_at)
    INTO v_long_count, v_oldest_long
    FROM public.leader_rate_limit_events
    WHERE rate_key = p_key
      AND created_at >= v_long_cutoff;

    IF v_long_count >= p_long_limit THEN
        v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_long + (p_long_window_seconds || ' seconds')::INTERVAL - v_now)))::INT);
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'Maximum daily verification code requests reached for this account. Please retry tomorrow or contact central administration.',
            'retryAfterSeconds', v_retry_after
        );
    END IF;

    -- Record event
    INSERT INTO public.leader_rate_limit_events (rate_key, created_at)
    VALUES (p_key, v_now);

    RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_record_leader_rate_limit(TEXT, INT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_leader_rate_limit(TEXT, INT, INT, INT, INT) TO service_role;

-- ============================================================================
-- 7. ATOMIC CHALLENGE ISSUANCE RPC: issue_leader_auth_challenge
-- ============================================================================

CREATE OR REPLACE FUNCTION public.issue_leader_auth_challenge(
    p_challenge_id UUID,
    p_leader_id UUID,
    p_email TEXT,
    p_code_hash TEXT,
    p_device_binding_hash TEXT,
    p_user_agent_hash TEXT,
    p_ip TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_expires_at TIMESTAMPTZ := v_now + INTERVAL '10 minutes';
BEGIN
    -- Advisory transaction lock per leader to serialize concurrent challenge requests
    PERFORM pg_advisory_xact_lock(hashtext('leader_challenge_' || p_leader_id::text));

    -- Atomically supersede any existing unused challenges for this leader or email
    UPDATE public.leader_auth_challenges
    SET is_used = TRUE
    WHERE (leader_id = p_leader_id OR email = LOWER(TRIM(p_email)))
      AND is_used = FALSE;

    -- Insert new challenge
    INSERT INTO public.leader_auth_challenges (
        challenge_id,
        leader_id,
        email,
        code_hash,
        device_binding_hash,
        user_agent_hash,
        ip,
        created_at,
        expires_at,
        failed_attempts,
        is_used,
        is_locked
    ) VALUES (
        p_challenge_id,
        p_leader_id,
        LOWER(TRIM(p_email)),
        p_code_hash,
        p_device_binding_hash,
        COALESCE(p_user_agent_hash, ''),
        COALESCE(p_ip, ''),
        v_now,
        v_expires_at,
        0,
        FALSE,
        FALSE
    );

    -- Bounded retention: cleanup challenges older than 7 days
    DELETE FROM public.leader_auth_challenges
    WHERE created_at < v_now - INTERVAL '7 days';

    RETURN jsonb_build_object('success', true, 'challengeId', p_challenge_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_leader_auth_challenge(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_leader_auth_challenge(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 8. ATOMIC VERIFICATION & SESSION RPC: consume_leader_challenge_and_create_session
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_leader_challenge_and_create_session(
    p_challenge_id UUID,
    p_code_hash TEXT,
    p_device_binding_hash TEXT,
    p_new_session_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_abs_expiry TIMESTAMPTZ := v_now + INTERVAL '8 hours';
    v_challenge RECORD;
    v_leader RECORD;
BEGIN
    -- 1. Find and lock the specific challenge by explicit UUID
    SELECT * INTO v_challenge
    FROM public.leader_auth_challenges
    WHERE challenge_id = p_challenge_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active verification code found for this request. Please request a new code.', 'code', 'CHALLENGE_NOT_FOUND', 'status', 401);
    END IF;

    IF v_challenge.is_used THEN
        RETURN jsonb_build_object('success', false, 'error', 'This verification code has already been consumed. Please request a new code.', 'code', 'CODE_ALREADY_USED', 'status', 401);
    END IF;

    IF v_challenge.is_locked OR v_challenge.failed_attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'This verification challenge has been locked due to excessive failed attempts. Please request a new code.', 'code', 'CHALLENGE_LOCKED', 'status', 429);
    END IF;

    -- 2. Check challenge expiry (10-minute database-enforced window)
    IF v_challenge.expires_at < v_now THEN
        UPDATE public.leader_auth_challenges
        SET is_used = TRUE
        WHERE challenge_id = v_challenge.challenge_id;

        RETURN jsonb_build_object('success', false, 'error', 'This verification code has expired (10-minute limit). Please request a new code.', 'code', 'EXPIRED_CODE', 'status', 401);
    END IF;

    -- 3. Check device binding hash
    IF v_challenge.device_binding_hash != p_device_binding_hash THEN
        UPDATE public.leader_auth_challenges
        SET failed_attempts = failed_attempts + 1,
            is_locked = (failed_attempts + 1 >= 5)
        WHERE challenge_id = v_challenge.challenge_id;

        RETURN jsonb_build_object('success', false, 'error', 'Device binding mismatch. Verification must be completed in the same browser session.', 'code', 'DEVICE_MISMATCH', 'status', 401);
    END IF;

    -- 4. Check code hash
    IF v_challenge.code_hash != p_code_hash THEN
        UPDATE public.leader_auth_challenges
        SET failed_attempts = failed_attempts + 1,
            is_locked = (failed_attempts + 1 >= 5)
        WHERE challenge_id = v_challenge.challenge_id;

        IF v_challenge.failed_attempts + 1 >= 5 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Too many incorrect attempts. This verification challenge has been locked. Please request a new code.', 'code', 'LOCKED_OUT', 'status', 429);
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Invalid verification code. Please check and try again.', 'code', 'INVALID_CODE', 'status', 401);
        END IF;
    END IF;

    -- 5. Lock and retrieve leader identity
    SELECT * INTO v_leader
    FROM public.leader_identities
    WHERE id = v_challenge.leader_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_leader.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Leadership account is deactivated or unauthorized.', 'code', 'ACCOUNT_INACTIVE', 'status', 403);
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
            'leaderId', v_leader.id::text,
            'email', v_leader.email,
            'name', v_leader.full_name,
            'title', v_leader.title,
            'role', 'LEADERSHIP',
            'allowedStates', v_leader.allowed_states,
            'allowedDistricts', v_leader.allowed_districts,
            'authVersion', v_leader.auth_version,
            'createdAt', EXTRACT(EPOCH FROM v_now) * 1000,
            'lastActivityAt', EXTRACT(EPOCH FROM v_now) * 1000,
            'absoluteExpiresAt', EXTRACT(EPOCH FROM v_abs_expiry) * 1000
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_leader_challenge_and_create_session(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_leader_challenge_and_create_session(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 9. IDEMPOTENT PROVISIONING RPC: provision_leader_identity
-- ============================================================================

CREATE OR REPLACE FUNCTION public.provision_leader_identity(
    p_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_title TEXT,
    p_allowed_states TEXT[],
    p_allowed_districts TEXT[],
    p_is_active BOOLEAN,
    p_auth_version INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_norm_email TEXT := LOWER(TRIM(p_email));
    v_result RECORD;
BEGIN
    INSERT INTO public.leader_identities (
        id,
        email,
        full_name,
        title,
        role,
        allowed_states,
        allowed_districts,
        is_active,
        auth_version,
        updated_at
    ) VALUES (
        p_id,
        v_norm_email,
        p_full_name,
        COALESCE(p_title, 'Leadership Reviewer'),
        'LEADERSHIP',
        COALESCE(p_allowed_states, ARRAY['*']::text[]),
        COALESCE(p_allowed_districts, ARRAY['*']::text[]),
        COALESCE(p_is_active, TRUE),
        COALESCE(p_auth_version, 1),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        title = EXCLUDED.title,
        allowed_states = EXCLUDED.allowed_states,
        allowed_districts = EXCLUDED.allowed_districts,
        is_active = EXCLUDED.is_active,
        auth_version = EXCLUDED.auth_version,
        updated_at = NOW()
    RETURNING * INTO v_result;

    RETURN jsonb_build_object(
        'success', true,
        'leaderId', v_result.id::text,
        'email', v_result.email,
        'fullName', v_result.full_name
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_leader_identity(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT[], BOOLEAN, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_leader_identity(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT[], BOOLEAN, INT) TO service_role;

COMMIT;
