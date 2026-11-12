-- ====================================================================
-- Migration: 20261112140000_state_sub_recipients_registry.sql
-- Description: State Sub-Recipients (SR) Registry with service-role-only RLS,
--              updated_at trigger, idempotent policies, and user profile linkage.
-- Target: LOCAL / STAGING first. (Not applied to production without approval).
-- ====================================================================

-- 1. Create state_sub_recipients table
CREATE TABLE IF NOT EXISTS public.state_sub_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for state lookups and active status
CREATE INDEX IF NOT EXISTS idx_state_sub_recipients_state ON public.state_sub_recipients(state);
CREATE INDEX IF NOT EXISTS idx_state_sub_recipients_status ON public.state_sub_recipients(status);

-- 2. updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_state_sub_recipients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_state_sub_recipients_updated_at ON public.state_sub_recipients;
CREATE TRIGGER trigger_state_sub_recipients_updated_at
  BEFORE UPDATE ON public.state_sub_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_state_sub_recipients_updated_at();

-- 3. Service-role-only RLS (Strictly no authenticated client SELECT)
ALTER TABLE public.state_sub_recipients ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation: Drop existing policies first
DROP POLICY IF EXISTS "service_role_all_state_sub_recipients" ON public.state_sub_recipients;
DROP POLICY IF EXISTS "authenticated_read_state_sub_recipients" ON public.state_sub_recipients;
DROP POLICY IF EXISTS "public_read_state_sub_recipients" ON public.state_sub_recipients;

-- Only service-role has direct table access; served to frontend via GET /api/reference-data/state-srs
CREATE POLICY "service_role_all_state_sub_recipients"
  ON public.state_sub_recipients
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. User profile linkage for SR & SSR
-- Reuses existing organization_name column as the SSR (Sub-Sub-Recipient)
-- Adds sr_id and sr_name to field_user_profiles / user_profiles
DO $$
BEGIN
  -- Link to field_user_profiles if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'field_user_profiles') THEN
    ALTER TABLE public.field_user_profiles ADD COLUMN IF NOT EXISTS sr_id UUID REFERENCES public.state_sub_recipients(id);
    ALTER TABLE public.field_user_profiles ADD COLUMN IF NOT EXISTS sr_name VARCHAR(255);
  END IF;

  -- Link to submissions table for permanent immutable snapshot
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'submissions') THEN
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS sr_id UUID REFERENCES public.state_sub_recipients(id);
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS sr_name VARCHAR(255);
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS ssr_name VARCHAR(255);
  END IF;
END $$;

-- 5. Seed Mechanism (Idempotent seed template — will be populated when user provides the SR list)
-- Example seed function to be called with official list:
CREATE OR REPLACE FUNCTION public.seed_state_sub_recipients(p_records JSONB)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec JSONB;
BEGIN
  FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    INSERT INTO public.state_sub_recipients (code, name, state, status)
    VALUES (
      v_rec->>'code',
      v_rec->>'name',
      v_rec->>'state',
      COALESCE(v_rec->>'status', 'ACTIVE')
    )
    ON CONFLICT (code) DO UPDATE
    SET
      name = EXCLUDED.name,
      state = EXCLUDED.state,
      status = EXCLUDED.status,
      updated_at = NOW();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
