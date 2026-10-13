# State-Scoped Evaluation Access & Password-Free Form Workflows

## 1. Executive Summary

This document specifies the access control architecture for the **Child Nutrition & Caregiver Support PWA (Phase 3)** under the project owner’s corrected access model:

1. **Field Caseworkers** use Forms, save device-local drafts, and submit assessments **without a password**.
2. **State Evaluation Users** authenticate using a **state-specific shared credential** strictly bound to their assigned state (e.g., Maharashtra credentials grant access *only* to Maharashtra records).
3. **Managers and Directors** authenticate using a **shared leadership credential** providing **all-state evaluation read access**, without unrestricted admin, delete, record-edit, or asset-upload rights.
4. **Individual email-based authentication** is deferred for future rollout, but the schema and session architecture are intentionally designed to support seamless migration.

---

## 2. Role & Capability Access Matrix

| Role / Capability | Authentication Requirement | Geographic Scope | Read Records & Summaries | Create Submissions & Drafts | Edit Records (PATCH) | Upload Assets | Hard Delete Records | Credential Admin |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Field Caseworker** (`FIELD_USER`) | **None** (Password-Free) | Unassigned / Local Device | ❌ (401 Unauthorized) | ✅ (Local Drafts + POST) | ❌ (401 Unauthorized) | ❌ (401 Unauthorized) | ❌ (403 Forbidden) | ❌ |
| **State Evaluator** (`STATE_REVIEWER`) | **State Shared Password** | Assigned State Only (`['Maharashtra']`, etc.) | ✅ (State-Scoped Read-Only) | ❌ | ❌ (403 Forbidden) | ❌ (403 Forbidden) | ❌ (403 Forbidden) | ❌ |
| **Programme Leadership** (`LEADERSHIP`) | **Leadership Shared Password** | All States (`['*']`) | ✅ (All States Read-Only) | ❌ | ❌ (403 Forbidden) | ❌ (403 Forbidden) | ❌ (403 Forbidden) | ❌ |
| **System Administrator** (`ADMIN`) | **Admin Password / Service Role** | All States (`['*']`) | ✅ (All States) | ✅ | ✅ | ✅ | ✅ (Verified ADMIN Only) | ✅ |

---

## 3. Password-Free Field Workflows

### 3.1 Boundaries & Data Protection
- **Form Completion**: Field caseworkers can open the PWA, complete surveys, capture anthropometric metrics, and store drafts in device-local IndexedDB without any authentication prompt.
- **Submission Ingestion**: When online or background-syncing, `POST /api/submissions` and `POST /api/sync` validate submissions strictly against the Zod schema (`completeSubmissionSchema`) with mandatory `Idempotency-Key` headers.
- **Strict Read Protection**: Unauthenticated requests to read existing records (`GET /api/submissions`), aggregate clinical metrics (`GET /api/submissions/summary`), beneficiary dossiers (`GET /api/submissions/[id]`), PDF exports (`GET /api/submissions/[id]/export`), or assets (`POST /api/submissions/[id]/asset`) return **HTTP 401 Unauthorized**.
- **No Anonymous Data Leakage**: An unauthenticated user cannot enumerate, inspect, or query existing beneficiaries on the server.
- **Local vs. Server Counts**: Masthead counts and sync badges explicitly distinguish local device items from authoritative server totals:
  - Unauthenticated clients display `Local device submissions` with distinct `aria-label` and tooltip attribution.
  - Server-confirmed numbers are only queried after session authorization.

---

## 4. State Evaluation Access

### 4.1 State Scope Enforcement
- Each Indian state has an **independent credential** in the credential registry (e.g., `STATE-MH` for Maharashtra, `STATE-WB` for West Bengal, `STATE-DL` for Delhi).
- The permitted state is derived **strictly from the server-side credential record**, never from client-supplied request bodies, dropdown selections, or query parameters.
- A user authenticated with Maharashtra credentials receives `allowedStates: ['Maharashtra']`. Any attempt to query Delhi (`/api/submissions?state=Delhi`) or read a West Bengal record returns **HTTP 403 FORBIDDEN_SCOPE**.
- Hard-delete privileges are **strictly disabled** for State Evaluators (HTTP 403 FORBIDDEN).

### 4.2 Model A Read-Only Enforcement
Under **Model A** adopted for initial production:
- State Evaluators have **strictly read-only** evaluation access within their authorized state.
- Submissions cannot be edited via `PATCH /api/submissions/[submissionId]` (HTTP 403 FORBIDDEN).
- Assets cannot be uploaded or replaced via `POST /api/submissions/[submissionId]/asset` (HTTP 403 FORBIDDEN).
- Records cannot be deleted via `DELETE /api/submissions/[submissionId]` (HTTP 403 FORBIDDEN).
- Client UI controls (Edit Survey links, Edit Record buttons, Approval status toggles, and asset upload modal actions) are suppressed for State Evaluation and Leadership sessions.
- Attempting to access the edit route directly (`/assessment/record/[submissionId]/edit`) displays a prominent read-only notice banner and suppresses edit form controls and save actions.

---

## 5. Programme Leadership (Managers & Directors)

### 5.1 Shared Leadership Credential
- Managers and Directors authenticate with a shared leadership credential (`LEADERSHIP-ALL`).
- Grants cross-state read access across all configured states (`allowedStates: ['*']`).
- **Read-Only Enforced**:
  - Cannot hard-delete records (`DELETE` returns HTTP 403 FORBIDDEN).
  - Cannot edit beneficiary records (`PATCH` returns HTTP 403 FORBIDDEN).
  - Cannot upload or modify assets (`POST .../asset` returns HTTP 403 FORBIDDEN).
  - Cannot administer credentials.

### 5.2 Attribution & Audit Logging
- Shared credentials do **not** identify an individual human operator.
- Audit logs record the caller as `actor: 'LEADERSHIP-ALL'` or `actorRole: 'LEADERSHIP'`, avoiding fabricated personal attribution while preserving truthful operational trails.

---

## 6. Server-Only Supabase Credential Store

### 6.1 Schema (`public.evaluation_credential_registry`)
- Table stores:
  - `access_identifier` (e.g. `STATE-MH`, `LEADERSHIP-ALL`)
  - `display_name` (e.g. `Maharashtra State Evaluation`)
  - `credential_kind` (`STATE_EVALUATION`, `LEADERSHIP_EVALUATION`, `ADMIN`)
  - `state_code` (`Maharashtra`, NULL for leadership)
  - `password_hash` (Argon2id RFC 9106 PHC encoded `$argon2id$...`)
  - `credential_version` (integer starting at 1)
  - `is_active` (boolean)
  - Timestamps (`created_at`, `updated_at`, `rotated_at`)
- **Zero Client Access**: `REVOKE ALL FROM anon, authenticated, public; GRANT ALL TO service_role`.
- **Zero Plaintext Passwords**: Only salted slow hashes are stored.

### 6.2 Session Revocation on Rotation & Deactivation
- When a credential is rotated or deactivated, `credential_version` is incremented or `is_active` is set to `FALSE`.
- Previously issued session cookies containing mismatched versions or inactive status are invalidated immediately upon next request.

---

## 7. Google Sheets "passwords" Tab (Metadata Mirror)

- **Exact Tab Name**: `passwords`.
- **Status**: Asynchronous reporting metadata mirror **only**.
- **Security Mandate**:
  - The tab is **NOT** a password vault.
  - It is **NEVER** used to authenticate users.
  - **Zero secrets**: Plaintext passwords, password hashes, salts, and session tokens are strictly prohibited.
- **Columns (13)**:
  1. `Access ID`
  2. `Display Name`
  3. `Access Type`
  4. `State`
  5. `Programme Scope`
  6. `Evaluation Permission`
  7. `Active`
  8. `Credential Version`
  9. `Created At`
  10. `Last Rotated At`
  11. `Provisioning Status`
  12. `Credential Delivery Reference`
  13. `Notes`

---

## 8. Future Migration to Individual Email-Based Accounts

When the organization transitions to individual email logins:
1. Individual accounts will be created in Supabase `auth.users`.
2. A relation table `public.user_state_assignments` will map `user_id` to `state_code` and `role`.
3. The server session service can resolve either individual email JWTs or legacy shared credentials during a transition period.

---

## 9. Required Owner Approval Gates

The following operational actions require separate, explicit owner approval:
1. Applying Supabase database migration `20261013170000_evaluation_credential_registry.sql`.
2. Running live credential generation and provisioning to production database.
3. Creating the `passwords` tab on the live Google Spreadsheet.
4. Deploying the feature branch to the production Vercel alias.
