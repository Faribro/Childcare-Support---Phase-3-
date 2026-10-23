# Progress: State-Team and Field-User Onboarding (Thread 02)

## Status: COMPLETE & VERIFIED

### Verification Summary
- **Unit & Integration Tests**: 22 passed across 3 test files (100% pass)
  - `src/test/state-team-onboarding.test.ts` (10 tests passed)
  - `src/test/field-user-onboarding.test.ts` (7 tests passed)
  - `src/test/components/WelcomeKiteOnboardingModal.test.tsx` (5 tests passed)
- **Regression Tests**:
  - `src/test/components/EvaluationLoginModal.test.tsx` (4 tests passed)
  - `src/test/authorisation-scope.test.ts` (10 tests passed)
  - `src/test/argon2-runtime-compatibility.test.ts` (12 tests passed)
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`) exited with code 0 (zero errors).

### Artifacts & Deliverables
1. **Domain Types & Contracts**:
   - `src/lib/types/onboarding.ts`
   - `src/lib/constants/indianStates.ts`
2. **Crypto & Engine**:
   - `src/lib/server/invitationCrypto.ts` (high-entropy code generation, salted SHA-256 verifiers, constant-time timing-safe comparison, normalization)
   - `src/lib/server/onboardingStore.ts` (`MemoryOnboardingStore`, `SupabaseOnboardingStore`, `UnavailableOnboardingStore`)
   - `src/lib/server/stateTeamAuthChallenge.ts` (6-digit numeric OTP, allowlist checking, 5-attempt lockout, private email dispatch)
   - `src/lib/server/googleAuth.ts` (minimal openid/email/profile scopes, HMAC signed CSRF state, signed short-lived onboarding tickets)
3. **API Endpoints**:
   - `POST /api/auth/state-team/register`
   - `POST /api/auth/state-team/verify-otp`
   - `POST /api/auth/state-team/invitation/issue`
   - `GET /api/auth/google/login`
   - `GET /api/auth/google/callback`
   - `GET /api/auth/field-user/ticket`
   - `POST /api/auth/field-user/complete-onboarding`
4. **UI Components**:
   - `src/components/auth/WelcomeKiteOnboardingModal.tsx` (SVG kite emblem, pastoral palette, accessible focus management, single-name support)
   - `src/components/auth/StateTeamAuthFlow.tsx` (individual work email OTP registration & sign in, state team invitation management)
   - `src/components/auth/EvaluationLoginModal.tsx` (integrated submode toggle: Shared Password vs Work Email OTP)
   - `src/app/app/page.tsx` & `src/components/mobile/MobileKoboHomeScreen.tsx` (wired to "+ Start New Survey" behind `NEXT_PUBLIC_FIELD_ONBOARDING_ENABLED`)
5. **Database Migration & Rollback**:
   - `supabase/migrations/20261023180000_state_team_and_field_user_onboarding.sql`
   - `supabase/migrations/20261023180000_rollback.sql`
