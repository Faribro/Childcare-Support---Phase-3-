# Thread Integration Handoff: Identity, Access & Service Readiness
**Document Location**: `docs/THREAD_AUTH_HANDOFF_TO_THREAD_02.md`  
**Target Recipient**: Thread 02 (Sole Release Integrator)  
**Authoring Worktree**: `Childcare-Support-Phase-3(1)`  
**Branch**: `feat/identity-access-readiness`  
**Date**: October 22, 2026  
**Status**: Local Verification Complete — Ready for Thread 02 Consolidation  

---

## 1. Commit Baseline & Git Topology

| Attribute | Commit SHA / Reference | Status & Details |
| :--- | :--- | :--- |
| **Base Commit SHA** | `908abdf8cdb21512625322ba8ba0566f760b1253` | Remote `github/main` (includes PR #82, PR #90, PR #92). |
| **Current Worktree HEAD** | `0966a9957cf7712c7306682cb72e572e8fbe1495` | Local branch `feat/identity-access-readiness` in `Childcare-Support-Phase-3(1)`. |
| **Thread 02 Release Candidate** | `924eb418beee11d5bbf2666fe0cc69cf91ee7c8c` | `feat/cross-system-consistency` in `Childcare-Main-Verify`. |
| **PR #89 / Migration 003 Head** | `a4271f526282626ffe120806b3f7f015540128d1` | `feat/leadership-email-auth-migration-003` (Draft DDL PR for `leader_identities`). |
| **PR #91 Voice Prototype Head** | `c251f77fc03d6bfb6f6021f2ba60959b70daadbf` | `prototype/calling-agent-voice-harness` (Clean, paused, prototype evaluation). |
| **PR #94 Durable Reporting Head** | `f9c5f5511a2147a46997837a8e4744a71a6d37d4` | `feat/whatsapp-durable-reporting-pipeline` (Pending Thread 02 consolidation). |
| **PR #95 AI Gateway Head** | `abc35e5f7ce31c09b731adc4a2c171d0e2e9a720` | `feat/ai-multimodal-beneficiary-gateway` (Path A deterministic default, provisional labeling). |

*Governance Safety Notice*: Zero commits pushed to remote `github`; zero branches merged into `main`; zero modifications made to Thread 02's worktrees (`Childcare-Main-Verify`, `Childcare-Supabase-Tigris`, `Childcare-Combined`).

---

## 2. Scope Ownership & Modified File Register

| File Path | Action | Scope Ownership & Architectural Justification |
| :--- | :--- | :--- |
| `src/lib/server/authorisation.ts` | **Modified** | Hardened `isSyntheticDemoModeAllowed` fail-closed production guard; added `allowedProgrammes` scope interface; added `isProgrammeAuthorized`; updated `filterRecordsByScope` for programme isolation; enforced CSRF `validateCsrfOrigin`. |
| `src/lib/server/sessionService.ts` | **Modified** | Added `allowedProgrammes` to `SessionPayload`; bound programme scope from credential registry (`credential.programmeScope`) or fallback to session token claims. |
| `src/app/api/submissions/route.ts` | **Modified** | Enforced programme authorization check (`isProgrammeAuthorized`, HTTP 403 `FORBIDDEN_SCOPE`) and query filtering; enforced `approvedAllianceIndia: 'Pending'` on intake to prevent client status escalation. |
| `src/test/integration/mock-bypass-production-guard.test.ts` | **New** | Automated verification verifying that `NODE_ENV=production` strictly rejects anonymous calls, `x-test-actor: true`, and unverified mock JSON session cookies even when `E2E_ALLOW_LOCAL_MOCK=true`. |
| `src/test/integration/request-boundary-authorization.test.ts` | **New** | Comprehensive boundary security suite verifying 8 dimensions: malformed tokens, forged HMAC signatures, expired sessions, unprivileged roles, cross-state/district violations, cross-programme violations, OCC approval flow, and CSRF Origin protection. |

---

## 3. Verification Evidence & Test Results

All tests executed locally in worktree `Childcare-Support-Phase-3(1)` on Windows environment:

### Core Auth & Request Boundary Test Battery:
```bash
npx vitest run src/test/authorisation-scope.test.ts \
               src/test/state-evaluation-access.test.ts \
               src/test/leadership-email-auth.test.ts \
               src/test/components/LeadershipOtpFlow.test.tsx \
               src/test/integration/mock-bypass-production-guard.test.ts \
               src/test/integration/request-boundary-authorization.test.ts
```
**Outcome**: **6/6 test files passed**, **142 tests passed (100%)**, 0 failed in 32.84s.

### Full Repository Verification Suite:
```bash
npx vitest run
```
**Outcome**: **72/72 test files passed**, **1,061 tests passed**, 19 skipped, **0 failed** in 94.03s.

### TypeScript Compilation & Type Safety:
```bash
npm run typecheck # tsc --noEmit
```
**Outcome**: **Exit code 0**, 0 errors.

---

## 4. Required Configuration Variable Names (Zero Secrets / Names Only)

The following configuration variables are required for complete identity, access, and service operation across production and staging environments:

### Core Authentication & Session Security:
- `SESSION_SECRET` (Mandatory: Minimum 32 characters; fails closed if absent or shorter).
- `INTERNAL_AUTH_SECRET` (Server-to-server trusted service authentication).
- `WEBHOOK_SECRET` (Google Apps Script webhook HMAC verification).
- `DIAGNOSTICS_SECRET` (Diagnostic and metrics endpoint authorization).

### State & Bootstrap Evaluation Credentials:
- `INITIAL_FIELD_MH_PWD` (Maharashtra field caseworker initial password).
- `INITIAL_REV_MH_PWD` (Maharashtra state reviewer initial password).
- `INITIAL_LEADERSHIP_PWD` (Legacy national leadership shared password).
- `INITIAL_ADMIN_PWD` (System administrator initial password).
- `INITIAL_STATE_PWD` (State evaluator default password alias).

### Leadership Authentication & Policy Gating:
- `LEADERSHIP_EMAIL_AUTH_MODE` (`hybrid` | `email_only` | `password_only`; default `hybrid`).
- `LEADERSHIP_EMAIL_AUTH_ENABLED` (Must be `true` to enable email-OTP; default `false`).
- `LEADERSHIP_ALLOWLIST_JSON` (Fallback directory of allowlisted leadership profiles).
- `LEADERSHIP_SESSION_IDLE_TIMEOUT_MINUTES` (Inactivity timeout; default `30`).
- `LEADERSHIP_SESSION_ABSOLUTE_TIMEOUT_HOURS` (Absolute session maximum; default `12`).

### Transactional Email Dispatch (for Leadership OTP & Linelist Reports):
- `EMAIL_PROVIDER` (`apps_script` | `smtp` | `resend` | `mock_logger`).
- `APPS_SCRIPT_WEBAPP_URL` (Required when `EMAIL_PROVIDER=apps_script`).
- `APPS_SCRIPT_DISPATCH_SECRET` (Required when `EMAIL_PROVIDER=apps_script`).
- `EMAIL_FROM` (Outbound email sender identity).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (When `EMAIL_PROVIDER=smtp`).
- `RESEND_API_KEY` (When `EMAIL_PROVIDER=resend`).
- `ALLOW_LIVE_EMAIL_DISPATCH` (Must remain `false` until approved).

### Meta WhatsApp Ingress & Outbound Pipeline:
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (GET subscription challenge verification).
- `META_APP_SECRET` (POST HMAC-SHA256 payload verification).
- `WHATSAPP_ACCESS_TOKEN` (Graph API outbound bearer token).
- `WHATSAPP_PHONE_NUMBER_ID` (Outbound sender phone number ID).
- `ALLOW_LIVE_WHATSAPP_SEND` (Must remain `false` until approved).

### Voice Prototype (PR #91 — Paused):
- `VOICE_WORKER_OFFLINE_MODE` (Set to `true` for synthetic offline worker test).
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (Live telephony credentials; unprovisioned).
- `SARVAM_API_KEY`, `OPENAI_API_KEY` (Speech model API keys; unprovisioned).

---

## 5. Security Findings & Defenses

### 1. Fail-Closed Mock Bypass Rejection (Production Guard)
- **Vulnerability Identified in `main`**: `isSyntheticDemoModeAllowed()` checked `E2E_ALLOW_LOCAL_MOCK === 'true'`, but did not check `NODE_ENV === 'production'`. In misconfigured staging/production setups, anonymous callers could obtain synthetic linelist data without authentication.
- **Enforced Defense**: Added strict multi-variable production guard: returns `false` if `NODE_ENV === 'production'`, `VERCEL_ENV === 'production'`, `APP_ENV === 'production'`, `NEXT_PUBLIC_APP_ENV === 'production'`, `E2E_STAGING_ENABLED === 'true'`, or `SUPABASE_LIVE_TEST === 'true'`.
- **Observed Behavior**: `GET /api/submissions` and `GET /api/submissions/[id]` return HTTP 401 `UNAUTHORIZED` when unauthenticated under production.

### 2. Cross-Site Request Forgery (CSRF) & Sec-Fetch-Site Validation
- **Defense Mechanism**: `validateCsrfOrigin(req)` evaluates all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) on ambient-cookie routes and `/api/auth/*` routes.
- **Origin Matching**: Requires `Origin` header matching `Host`, `X-Forwarded-Host`, or `nextUrl.origin`. Missing or mismatched Origin is rejected with HTTP 403 `CSRF_VIOLATION`.
- **Pre-Flight Site Defense**: Rejects requests where `Sec-Fetch-Site === 'cross-site'`.
- **API Exemption**: Pure token-based Bearer requests and internal key calls without ambient cookies are safely exempted.

### 3. Multi-Tenant Role, State, and Programme Scope Isolation
- **Role Hierarchy**:
  - `FIELD_USER`: Unauthenticated or field worker; cannot read linelist records or execute edits/deletes.
  - `STATE_REVIEWER`: Strictly bound to assigned state(s); read-only evaluation access; cannot edit (PATCH returns 403 `FORBIDDEN`), upload assets, or delete records.
  - `LEADERSHIP`: National or multi-state scope; authorized to review and update evaluation records with OCC version checks; cannot hard-delete records.
  - `ADMIN`: System administrative scope (`['*']`); sole role permitted to execute hard deletion (`DELETE`).
- **Geographic & Programme Isolation**: Cross-state queries return HTTP 403 `FORBIDDEN_SCOPE`. Unassigned programmes return HTTP 403 `FORBIDDEN_SCOPE`. `filterRecordsByScope` strips unassigned records from returned datasets.

### 4. Cryptographic Session Token Security
- **HMAC Verification**: Signed tokens (`base64url(payload).base64url(sig)`) verified using `crypto.timingSafeEqual` to prevent timing side-channel attacks (CWE-208).
- **Fail-Closed Secret**: Throws fatal startup error if `SESSION_SECRET` is missing or under 32 characters.
- **Dynamic Invalidation**: Changing `credentialVersion` in registry immediately invalidates all active session tokens for that account.

### 5. Linelist Export Formula Injection Sanitization (CWE-1236)
- **Vulnerability Defense**: Exported spreadsheets prefix single-quote (`'`) to any cell string starting with `=`, `+`, `-`, `@`, `\t`, or `\r`, neutralizing DDE and macro execution in Excel.

---

## 6. Service Readiness & Unverified Operational Gaps

| Component | Code Status | Runtime Infrastructure | Operational Reality & Unverified Gaps |
| :--- | :--- | :--- | :--- |
| **State Reviewer Login** | **Complete** (Verified) | In-process Argon2id / DB | Operational. Requires `SESSION_SECRET` (>= 32 chars) and `INITIAL_REV_MH_PWD` or Supabase credential table. |
| **Leadership Email-OTP** | **Complete** (Code Verified) | Supabase DDL + Email Gateway | **Gated / Disabled by Default**: `LEADERSHIP_EMAIL_AUTH_ENABLED` is `false`. Requires Migration 003 (`public.leader_identities`) applied to Supabase, and real email gateway (`APPS_SCRIPT_WEBAPP_URL` + secret or SMTP/Resend). **Do NOT report as complete email auth until email provider is live.** |
| **Leadership Shared Password** | **Complete** (Verified) | In-process Argon2id | Operational in `hybrid` and `password_only` modes. Disallowed in `email_only` mode. |
| **Beneficiary WhatsApp Flow** | **Draft** (PR #95) | In-memory State Machine | Operates in-memory (`InMemoryBeneficiarySessionStore.survivesProcessRestart() === false`). Requires database migration for durable persistence across restarts. |
| **Beneficiary Opt-Out** | **Complete** (PR #95) | In-memory Filter | Deterministic regex catches `STOP`, `WRONG NUMBER`, Marathi/Hindi equivalents; transitions session to `isOptedOut: true`. |
| **CSC Caseworker Escalation** | **Complete** (PR #95) | In-memory Marker | Emits `reviewEscalationPath: 'CSC_CASEWORKER_REVIEW'`. It is an in-memory marker, **not** an automatically created task in Supabase. |
| **AI Multimodal Gateway** | **Complete** (PR #95) | Local Deterministic Rules | Default is `DETERMINISTIC_FALLBACK` (Path A). All classifications marked `isProvisional: true`. Zero cloud inference. 0/3 failed upstream test evidence preserved. |
| **Linelist Email Delivery** | **Complete** (PR #92/#94) | Apps Script MailApp | Tested with mock transport. Live sending gated behind `ALLOW_LIVE_EMAIL_DISPATCH=true` and deployed Apps Script `sendLinelistEmail` handler. Subject to Google daily email quotas. |
| **WhatsApp Inbound Webhook** | **Complete** (PR #90/#94) | Next.js API / Catalyst | Timing-safe HMAC verification and PII redaction verified. Requires Meta App Dashboard webhook URL registration and secret provisioning. |
| **Voice Calling Agent** | **Prototype** (PR #91) | Offline Synthetic Worker | **PAUSED**: Telephony disabled. Requires LiveKit Cloud/Server deployment, SIP carrier interconnect, and approved Indian-language speech models (Sarvam/OpenAI). |

---

## 7. Recommended Thread 02 Integration Action

1. **Incorporate Auth & Production Guard**: Incorporate `src/lib/server/authorisation.ts`, `src/lib/server/sessionService.ts`, and `src/app/api/submissions/route.ts` into release candidate branch `feat/cross-system-consistency`.
2. **Incorporate Boundary & Guard Tests**: Include `src/test/integration/mock-bypass-production-guard.test.ts` and `src/test/integration/request-boundary-authorization.test.ts` in CI verification matrix.
3. **Preserve PR #91 and PR #95 Boundaries**: Keep PR #91 (Voice) paused and PR #95 (AI Gateway) in isolated draft status for this release milestone.
4. **Schedule Staging Environment Configuration**: Prior to staging deployment, ensure `SESSION_SECRET`, `APPS_SCRIPT_WEBAPP_URL`, and `APPS_SCRIPT_DISPATCH_SECRET` are provisioned without committing credentials.
