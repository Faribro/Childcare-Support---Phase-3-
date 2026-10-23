# Findings & Architecture Invariants: State-Team and Field-User Onboarding

## 1. Prior Work Recovery Analysis
- **Git History Forensics:**
  - Audited commits from PR #79 (`af102be9b041c5da179eade34e62747344a7d92c`): introduced password-free forms for field caseworkers, state-scoped credentials for `STATE_REVIEWER`, and `EvaluationLoginModal`.
  - Audited `feat/identity-access-readiness` (`a44fac4`): hardened session service with HMAC signed tokens, multi-programme scope, and fail-closed production guards.
  - Audited `MiniatureGardenPlayground.tsx` (`cae35d0`): features kite flying animation in canvas.
  - Audited `docs/landing-page-reference-storyboard.md` (`b2f485f`): references editorial narrative invitations.
  - **Audit Verdict:** The owner's recollection of Welcome Kite onboarding was DESIGN ONLY / CONCEPTUAL INTENT. Zero code, components, or API routes for Welcome Kite or Google OAuth onboarding exist in any branch, stash, worktree, or transcript.
  - **Resolution:** Build the clean, hardened implementation natively upon the existing authentication and session infrastructure.

## 2. Security Boundaries & Authorization Rules
- **No Shared State Team Password:** Each state-team staff member must have an individual identity, verified work email, and individual session.
- **Email Verification != State Authority:** Verifying control of an email address does NOT grant state-wide access. An administrator approval step or pre-configured allowlist is required before state-level access is granted.
- **No Plaintext Invitation Storage:** Invitation codes must be hashed (SHA-256 with cryptographic salt) before storage. The plaintext code is delivered once via approved private email and never returned via API or logged.
- **Atomic Multi-User Redemption:** State team invitation codes support multi-user redemption (default max 50 redemptions, 30 days validity) with atomic incrementing to prevent race conditions.
- **Zero Role Escalation from Google Sign-In:** Google sign-in creates or accesses a `FIELD_USER` account only. It must NEVER grant `LEADERSHIP`, `STATE_REVIEWER`, or `ADMIN` roles.
- **Server-Derived Geographic Scope:** Field user state is bound strictly to the state team that issued the invitation code. Client-provided state or role overrides are rejected.
- **Preservation of Existing Data & Drafts:** The onboarding gate must not clear local storage or delete Dexie IndexedDB drafts. Offline workers must retain full access to their local data.

## 3. Configuration & Secrets Register
- `GOOGLE_CLIENT_ID`: OAuth 2.0 client ID for Google sign-in.
- `GOOGLE_CLIENT_SECRET`: OAuth 2.0 client secret.
- `GOOGLE_REDIRECT_URI`: Production and Preview callback URLs (e.g. `https://childcare-support-phase-3.vercel.app/api/auth/google/callback`).
- `SESSION_SECRET`: Minimum 32-character secret for HMAC session signing (already live in production).
- `APPS_SCRIPT_WEBAPP_URL` & `APPS_SCRIPT_DISPATCH_SECRET`: Operational email gateway for dispatching OTPs and invitation codes (already live in production).
