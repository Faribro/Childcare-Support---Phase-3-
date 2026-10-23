-- ============================================================================
-- Migration: 20261023140000_caregiver_verification_and_subscriptions.sql
-- Purpose:   Durable persistence for Caregiver OTP Challenges, Verification
--            State, Explicit Messaging Consent, Category Preferences,
--            and Document Reminder History with Reviewed Row-Level Security (RLS).
-- Status:    PROPOSED / REVIEW ONLY — DO NOT APPLY TO PRODUCTION WITHOUT APPROVAL.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. CAREGIVER SUBSCRIPTIONS TABLE
-- Explicit state machine: UNVERIFIED -> OTP_PENDING -> VERIFIED -> SUBSCRIBED -> PAUSED / OPTED_OUT
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caregiver_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id TEXT NOT NULL UNIQUE,
    phone_hash TEXT NOT NULL UNIQUE,
    phone_masked TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'UNVERIFIED',
    consent_provided BOOLEAN NOT NULL DEFAULT FALSE,
    consent_recorded_at TIMESTAMPTZ NULL,
    consent_categories TEXT[] NOT NULL DEFAULT ARRAY['DOCUMENTS']::text[],
    preferred_language TEXT NOT NULL DEFAULT 'mr',
    linked_child_ids_masked TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    linked_submission_ids TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    opted_out_at TIMESTAMPTZ NULL,
    opt_out_reason TEXT NULL,
    paused_until TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_caregiver_subscription_state CHECK (
        state IN ('UNVERIFIED', 'OTP_PENDING', 'VERIFIED', 'SUBSCRIBED', 'PAUSED', 'OPTED_OUT')
    ),
    CONSTRAINT chk_caregiver_opt_out_reason CHECK (
        opt_out_reason IS NULL OR opt_out_reason IN ('STOP', 'WRONG_NUMBER', 'USER_REQUEST', 'POLICY_REFUSAL')
    ),
    CONSTRAINT chk_caregiver_language CHECK (
        preferred_language IN ('mr', 'hi', 'en', 'gu', 'bn')
    )
);

CREATE INDEX IF NOT EXISTS idx_caregiver_sub_phone_hash ON public.caregiver_subscriptions (phone_hash);
CREATE INDEX IF NOT EXISTS idx_caregiver_sub_state ON public.caregiver_subscriptions (state);
CREATE INDEX IF NOT EXISTS idx_caregiver_sub_updated_at ON public.caregiver_subscriptions (updated_at DESC);

--------------------------------------------------------------------------------
-- 2. CAREGIVER OTP CHALLENGES TABLE
-- Cryptographic salt + hash storage (Plaintext OTP is NEVER stored in database)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caregiver_otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id TEXT NOT NULL UNIQUE,
    phone_hash TEXT NOT NULL,
    verifier_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    last_requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    superseded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_caregiver_otp_attempts CHECK (attempts >= 0 AND attempts <= max_attempts)
);

CREATE INDEX IF NOT EXISTS idx_caregiver_otp_phone_hash ON public.caregiver_otp_challenges (phone_hash);
CREATE INDEX IF NOT EXISTS idx_caregiver_otp_expires_at ON public.caregiver_otp_challenges (expires_at DESC);

--------------------------------------------------------------------------------
-- 3. CAREGIVER REMINDER HISTORY TABLE
-- Durable execution tracking and deduplication for automated follow-up reminders
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caregiver_reminder_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reminder_id TEXT NOT NULL UNIQUE,
    submission_id TEXT NOT NULL,
    doc_type TEXT NULL,
    category TEXT NOT NULL DEFAULT 'DOCUMENTS',
    reminders_sent_count INTEGER NOT NULL DEFAULT 0,
    max_reminders_allowed INTEGER NOT NULL DEFAULT 2,
    last_sent_at TIMESTAMPTZ NULL,
    next_allowed_at TIMESTAMPTZ NULL,
    status TEXT NOT NULL DEFAULT 'SCHEDULED',
    cancelled_at TIMESTAMPTZ NULL,
    cancel_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_reminder_status CHECK (
        status IN (
            'SCHEDULED',
            'DISPATCHED',
            'CANCELLED_DOCUMENT_RECEIVED',
            'CANCELLED_OPT_OUT',
            'CANCELLED_PAUSED',
            'MAX_REACHED',
            'SUPPRESSED_QUIET_HOURS'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_caregiver_reminder_submission ON public.caregiver_reminder_history (submission_id);
CREATE INDEX IF NOT EXISTS idx_caregiver_reminder_status ON public.caregiver_reminder_history (status);

--------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) & GRANTS
-- Strict privacy: Zero public (anon) or field-user (authenticated) direct access.
-- All database reads and writes MUST execute server-side via service_role.
--------------------------------------------------------------------------------
ALTER TABLE public.caregiver_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_reminder_history ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from anon and authenticated roles
REVOKE ALL ON public.caregiver_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.caregiver_otp_challenges FROM anon, authenticated;
REVOKE ALL ON public.caregiver_reminder_history FROM anon, authenticated;

-- Grant full administrative permissions to service_role (server-side only)
GRANT ALL ON public.caregiver_subscriptions TO service_role;
GRANT ALL ON public.caregiver_otp_challenges TO service_role;
GRANT ALL ON public.caregiver_reminder_history TO service_role;

-- Policies enforcing service_role full CRUD access
DROP POLICY IF EXISTS "Service role full access on caregiver_subscriptions" ON public.caregiver_subscriptions;
CREATE POLICY "Service role full access on caregiver_subscriptions"
    ON public.caregiver_subscriptions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on caregiver_otp_challenges" ON public.caregiver_otp_challenges;
CREATE POLICY "Service role full access on caregiver_otp_challenges"
    ON public.caregiver_otp_challenges
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on caregiver_reminder_history" ON public.caregiver_reminder_history;
CREATE POLICY "Service role full access on caregiver_reminder_history"
    ON public.caregiver_reminder_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
