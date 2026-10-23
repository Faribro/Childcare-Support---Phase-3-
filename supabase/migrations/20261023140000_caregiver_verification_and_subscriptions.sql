-- ============================================================================
-- Migration: 20261023140000_caregiver_verification_and_subscriptions.sql
-- Purpose:   Durable persistence for Caregiver OTP Challenges, Verification
--            State, Explicit Messaging Consent, and Category Preferences.
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

COMMIT;
