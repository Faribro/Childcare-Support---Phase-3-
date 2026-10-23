# Task Plan: State-Team and Field-User Onboarding (Thread 02)

## Goal
Implement a complete, secure, reuse-first state-team registration and field-user onboarding workflow:
1. State team registers -> email OTP verified -> administrator approval -> private invitation code issued and emailed to state team staff.
2. Field user clicks "+ Start New Survey" -> Welcome Kite onboarding opens -> Google sign-in -> confirm name, state, district -> enter invitation code -> server validates identity and invitation -> persistent field-user membership created -> opens survey.
3. Returning user with valid session and completed profile goes directly to the survey without repeating registration.

## Current Phase
Phase 8: Approval Package & Release Documentation (Complete)

---

## Phases & Tasks

### Phase 1: Recovery Audit & Architecture Baseline
- [x] Task 1.1: Audit git commits, branches, stashes, and brain artifacts for earlier Welcome Kite / onboarding work.
  - **Verdict:** DESIGN ONLY / CONCEPTUAL INTENT. No existing committed code for Welcome Kite or Google onboarding found.
- [x] Task 1.2: Verify current repository branch and baseline: checked out `feat/field-user-onboarding-and-state-team` from `main` (`5e3a87d7670b3084c82cf1d3056dfe3a2d02b7f3`).
- [x] Task 1.3: Document architectural baseline and reuse points (`LeaderAuthStore` pattern, `AppsScriptEmailProvider`, `sessionService.ts` HMAC tokens, `authorisation.ts` roles).
- **Status:** complete

### Phase 2: Database Store & Schema Abstraction
- [x] Task 2.1: Define TypeScript interfaces for State Team Registrations, Invitations, and Field User Profiles in `src/lib/types/onboarding.ts`.
- [x] Task 2.2: Implement `OnboardingStore` interface with methods for state teams, invitations, and field users in `src/lib/server/onboardingStore.ts`.
- [x] Task 2.3: Implement `MemoryOnboardingStore` for testing and zero-dependency local environments.
- [x] Task 2.4: Implement `SupabaseOnboardingStore` and draft SQL migration `supabase/migrations/20261023180000_state_team_and_field_user_onboarding.sql`.
- **Status:** complete

### Phase 3: State-Team Registration & Private Invitation Code Engine
- [x] Task 3.1: Implement State Team Registration endpoint `POST /api/auth/state-team/register` (single-name support, work email, requested state, organization).
- [x] Task 3.2: Implement State Team OTP verification `POST /api/auth/state-team/verify-otp` with rate-limiting and approval checking.
- [x] Task 3.3: Implement cryptographically secure invitation code generator and verifier hashing (SHA-256 + salt).
- [x] Task 3.4: Implement State Team Invitation issuance & rotation endpoint `POST /api/auth/state-team/invitation/issue` (private email dispatch only, verifier storage).
- **Status:** complete

### Phase 4: Google OAuth & Session Management for Field Caseworkers
- [x] Task 4.1: Implement Google OAuth login initiation endpoint `GET /api/auth/google/login` with PKCE/state protection.
- [x] Task 4.2: Implement Google OAuth callback endpoint `GET /api/auth/google/callback` with token exchange, identity verification, and signed onboarding ticket.
- [x] Task 4.3: Implement mock/synthetic test mode for Google OAuth in local/test environments with fail-closed production guard.
- **Status:** complete

### Phase 5: First-Time Field-User "Welcome Kite" Onboarding Experience
- [x] Task 5.1: Create `src/components/auth/WelcomeKiteOnboardingModal.tsx` with pastoral kite emblem, accessible keyboard navigation, reduced-motion, and mobile sheet styling.
- [x] Task 5.2: Implement field profile completion and invitation redemption endpoint `POST /api/auth/field-user/complete-onboarding`.
- [x] Task 5.3: Integrate onboarding trigger into "+ Start New Survey" action in `src/app/app/page.tsx` and `src/components/mobile/MobileKoboHomeScreen.tsx`.
- **Status:** complete

### Phase 6: Returning User Bypass & Draft Isolation Safeguards
- [x] Task 6.1: Verify returning user with valid session and completed profile proceeds directly to `/assessment/new` without onboarding prompt.
- [x] Task 6.2: Ensure offline caseworker workflow preserves Dexie IndexedDB drafts and does not strand unauthenticated users.
- [x] Task 6.3: Enforce strict role isolation: field users receive `FIELD_USER` role; cannot access leadership or state reviewer records; no cross-state elevation.
- **Status:** complete

### Phase 7: Verification & Test Battery
- [x] Task 7.1: Write unit and integration tests in `src/test/state-team-onboarding.test.ts` (10 tests, 100% pass).
- [x] Task 7.2: Write unit and integration tests in `src/test/field-user-onboarding.test.ts` (7 tests, 100% pass).
- [x] Task 7.3: Write component tests for `WelcomeKiteOnboardingModal.test.tsx` (5 tests, 100% pass).
- [x] Task 7.4: Execute `npm run typecheck` (`tsc --noEmit`, 100% pass) and full Vitest suite.
- **Status:** complete

### Phase 8: Approval Package & Release Documentation
- [x] Task 8.1: Update `RELEASE_REGISTER.md` with commit SHAs and feature breakdown.
- [x] Task 8.2: Provide exact production migration SQL and configuration guide.
- [x] Task 8.3: Deliver final evidence report.
- **Status:** complete
