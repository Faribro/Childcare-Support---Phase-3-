# Controlled Supabase Migration Runbook (`SUPABASE_MIGRATION_RUNBOOK.md`)
### Non-Production / Isolated Environment Execution Guide

> [!CAUTION]
> **DO NOT RUN ANY REMOTE COMMAND UNTIL OWNER APPROVAL IS RECORDED IN `OWNER_APPROVAL_GATE.md` (GATE 1).**
> This runbook is strictly for a designated non-production/isolated Supabase environment. Production Supabase is strictly out of scope until Gate 3 is opened by explicit owner decision.

---

## 1. Purpose

1. Provide an exact, controlled, and reproducible operational procedure to apply the audit-hardened schema from merged PR #75 to a **non-production / isolated Supabase project** (e.g., Staging or Dev).
2. Validate schema structure, constraints, RLS policies, transactional outbox triggers, and Tigris/Sheets sanitization using **synthetic test data only**.
3. **Explicit Boundary**: Production Supabase is strictly out of scope. Under no circumstances may this runbook be applied against the production database without separate Gate 3 owner approval.

---

## 2. Approved Architecture

The Child Nutrition & Caregiver Support PWA (Phase 3) architecture enforces the following owner-approved separation of concerns:

- **Canonical Structured-Data Source of Truth**:
  - **Supabase PostgreSQL** (`public.submissions`, `public.submission_files`, `public.audit_events`) is the single authoritative system of record.
  - All field assessments, supervisor revisions, document attachments metadata, and audit logs are persisted synchronously in PostgreSQL with ACID guarantees.
- **Asynchronous Reporting Mirror Only**:
  - **Google Sheets** (`Child_Nutrition` linelist, `_Asset_Containers` hash registry, `Audit_Log`) is strictly an asynchronous reporting mirror.
  - Google Sheets is never queried as an authorization authority or primary read source.
  - Sheets updates are driven exclusively by the transactional outbox (`public.sheets_mirror_jobs`).
- **Private Binary Object Storage**:
  - **Tigris S3 Object Storage** (`childcare-support-phase3-private`) holds all raw binaries (signatures, Aadhaar scans, ART cards, medical docs).
  - Tigris buckets are completely private; no public links or presigned URLs are exposed to the browser or Google Sheets.
  - Access is mediated exclusively through the server-side streaming proxy with session-scope re-authorization.
- **Role and Scope Security Model**:
  - **`FIELD_USER`**: Constrained strictly to assigned `state`, `district`, and `programme_id` (`alliance-childcare-phase3`). Prohibited from deleting records (`DELETE` denied at RLS layer).
  - **`STATE_REVIEWER`**: Constrained strictly to assigned `state`(s). Prohibited from tampering with query scope and prohibited from deleting records.
  - **`LEADERSHIP` and `ADMIN`**: Explicitly authorized cross-state access (`allowedStates: ['*']` or assigned state list). Only `ADMIN` and `LEADERSHIP` may execute hard deletes.
  - **Unauthenticated Users (`anon` / `isVerified = false`)**: Unconditionally denied all live record, linelist, summary, export, and asset access (`401 UNAUTHORIZED` / `REVOKE ALL FROM anon, PUBLIC`).

---

## 3. Migration Artifact

- **Exact Migration File**: `supabase/migrations/20261012170000_core_schema_foundation.sql`
- **Exact Merged PR #75 Commit**: `1a6553ccab166670f4846c1e3a44493ed3ae66c2`
- **What This Migration Creates**:
  1. **Core Tables**:
     - `public.submissions`: 8-step validated assessment data, promoted relational columns, 73-column mapping support, `consent_provided` gate, and `form_payload JSONB`.
     - `public.submission_files`: Private Tigris metadata registry (keys, MIME types, sizes, SHA-256 digests, `cell_state_hash`, `is_restricted_doc = true`).
     - `public.sheets_mirror_jobs`: Transactional outbox queue for Google Apps Script sync with worker lease fields (`locked_at`, `locked_by`, `sheet_row`).
     - `public.audit_events`: Append-only security and operational audit trail aligned with `SecurityAuditEvent` in `src/lib/server/authorisation.ts`.
  2. **Domain Constraints & Indexes**:
     - Unique constraints on `unique_id`, `client_submission_id`, `(bucket_name, storage_key)`, `(submission_id, doc_type)`, and `idempotency_key`.
     - Check constraints enforcing `consent_provided = true`, Aadhaar last 4 (`^\d{4}$`), caregiver phone (`^\d{10}$`), positive anthropometry, non-negative income/support, valid roles, and valid statuses.
     - Indexes for scoped queries (`programme_id, state, district, submitted_at DESC`), supervisor review, and outbox polling.
  3. **Row-Level Security (RLS)**:
     - `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on all four tables.
     - `REVOKE ALL ON ... FROM anon, PUBLIC` across all tables.
     - Strict scoped policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
  4. **Security Helper Functions**:
     - `public.jwt_is_verified()`: Rejects unverified sessions.
     - `public.jwt_role()`: Extracts canonical role claims.
     - `public.jwt_has_state(target_state)`: Checks state against `allowedStates`.
     - `public.jwt_has_district(target_district)`: Checks district against `allowedDistricts`.
     - `public.jwt_has_programme(target_programme)`: Checks programme against `allowedProgrammes`.
  5. **Automated Triggers**:
     - `tg_set_updated_at`: Maintains server-side `updated_at` timestamps.
     - `tg_enforce_submissions_occ`: Enforces monotonic `version = OLD.version + 1` on domain updates (`SQLSTATE '40001'`).
     - `tg_enqueue_sheets_mirror_job`: Atomically inserts an idempotent `UPSERT_ROW:<unique_id>:v<version>` job in `public.sheets_mirror_jobs` inside the same database transaction, sanitizing all attachment fields to `"Restricted Doc [<docType>]"`.
- **Data Safety Mandate**: This migration creates empty schema structures and triggers only. It **does NOT import, move, copy, or query any real beneficiary data**.

---

## 4. Target Environment Requirements

- **Environment Classification**: Non-Production / Isolated Staging or Dev only.
- **Dedicated Project Reference**: Must use a distinct Supabase project reference (e.g., `ref-staging-childcare3`), completely separate from production.
- **Zero Production Data**: The target project database must be clean or contain only synthetic test rows.
- **Isolated Credentials**: Staging project credentials must be kept in dedicated staging secret stores. Never store or supply production database connection strings or service-role keys.
- **Synthetic Test Seed Only**: Any testing must use clearly marked synthetic records (e.g. `SYNTH-MH-PUN-0001`).

---

## 5. Pre-Migration Checklist

Before executing any commands, the operator must verify every item:

- [ ] Target Supabase project is confirmed non-production / isolated (e.g. Staging).
- [ ] Target project URL and service keys are stored in a secure secret store, not local shell history.
- [ ] No production connection string (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) is present locally or in CI.
- [ ] Migration file `supabase/migrations/20261012170000_core_schema_foundation.sql` is verified at commit `1a6553ccab166670f4846c1e3a44493ed3ae66c2`.
- [ ] Migration SQL has been reviewed against `MIGRATION_REVIEW.md`.
- [ ] Local static and synthetic validation suite passes (`npm run test`).
- [ ] Synthetic seed dataset is prepared with prefix `SYNTH-` and zero PII.
- [ ] Backup / database snapshot of the target non-production project is taken.
- [ ] Rollback plan in Section 8 is reviewed and understood.
- [ ] Owner has signed off Gate 1 in `OWNER_APPROVAL_GATE.md`.

---

## 6. Execution Procedure

> [!WARNING]
> **DO NOT RUN UNTIL OWNER APPROVAL IS RECORDED IN `OWNER_APPROVAL_GATE.md` (GATE 1).**

### Step 6.1: Verify Supabase CLI
```bash
# Verify installed CLI version (requires Supabase CLI >= 1.140.0)
supabase --version
```

### Step 6.2: Link to Non-Production Project Only
```bash
# Set non-production project reference in environment
export NON_PROD_PROJECT_REF="<your-staging-project-ref>"

# Authenticate Supabase CLI using staging access token (never production token)
# DO NOT print or log token
supabase login

# Link strictly to the non-production project
supabase link --project-ref "$NON_PROD_PROJECT_REF"
```

### Step 6.3: Confirm Linked Project is Non-Production
```bash
# Inspect status and verify the project reference matches the staging ref
supabase status

# Confirm the linked project is NOT production:
# If the project ref matches production, STOP IMMEDIATELY and unlink.
```

### Step 6.4: Execute Dry-Run / Diff
```bash
# Dry run migration against non-production project
supabase db diff --linked
```

### Step 6.5: Apply Migration to Non-Production Project
```bash
# Apply the foundation migration
supabase db push --include-all

# Or via explicit migration file application:
# supabase migration up --linked
```

### Step 6.6: Capture Redacted Migration Logs
```bash
# Verify migration history table in database
supabase migration list --linked
```

### Step 6.7: Run Synthetic Smoke Verification
```bash
# Execute local synthetic test suite targeting the staging schema contract
npm run test src/test/integration/supabase-schema-migration-review.test.ts
```

---

## 7. Post-Migration Verification Checklist

Verify each requirement against the newly migrated non-production Supabase project:

- [ ] All four tables exist: `public.submissions`, `public.submission_files`, `public.sheets_mirror_jobs`, `public.audit_events`.
- [ ] All 73-column mapping columns and check constraints exist.
- [ ] RLS is enabled and forced on all four tables (`FORCE ROW LEVEL SECURITY`).
- [ ] Privileges are revoked from `anon` and `PUBLIC` (`REVOKE ALL ON ... FROM anon, PUBLIC`).
- [ ] Unauthenticated callers (`isVerified = false` or `anon`) receive zero rows and cannot insert.
- [ ] `FIELD_USER` can query only records matching their assigned `state`, `district`, and `programme_id`.
- [ ] `FIELD_USER` cannot query records from another district or state.
- [ ] `FIELD_USER` is denied `DELETE` on `public.submissions` (`403` / RLS error).
- [ ] `STATE_REVIEWER` can query records only in their assigned state.
- [ ] `STATE_REVIEWER` is denied `DELETE` on `public.submissions`.
- [ ] `ADMIN` and `LEADERSHIP` delete behavior matches approved policy (`submissions_delete_admin_only`).
- [ ] Column 48 `meals_per_day` and supervisor `edit_reason` are stored in separate columns.
- [ ] `public.submissions` insert atomically enqueues an outbox row in `public.sheets_mirror_jobs` inside the same transaction.
- [ ] `public.sheets_mirror_jobs.payload_snapshot` contains only `"Restricted Doc [<docType>]"` and rejects raw Tigris keys.
- [ ] `public.submission_files` stores only safe metadata (storage keys, MIME types, sizes, SHA-256 digests, `cell_state_hash`).
- [ ] `public.audit_events` is strictly append-only (no updates or deletes allowed for any role).
- [ ] Optimistic Concurrency Control (OCC) enforces `version = OLD.version + 1` on domain updates.
- [ ] Synthetic end-to-end submission, edit, attachment metadata, and audit flows pass.

---

## 8. Rollback Plan

### When Rollback is Appropriate
- Any migration step fails with SQL errors.
- RLS policy testing reveals a scope leak or unauthenticated read path.
- Triggers fail to enqueue outbox jobs or block valid submissions.
- Schema defects require migration file revision.

### Non-Production Rollback Procedure
1. **Halt Activity**: Stop all synthetic test runners immediately.
2. **Execute Down Migration (Safe Drop Order)**:
   ```sql
   BEGIN;
   -- 1. Drop Triggers
   DROP TRIGGER IF EXISTS trg_submissions_enqueue_sheets_mirror ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submissions_enforce_occ ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submissions_set_updated_at ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submission_files_set_updated_at ON public.submission_files;
   DROP TRIGGER IF EXISTS trg_sheets_mirror_jobs_set_updated_at ON public.sheets_mirror_jobs;

   -- 2. Drop Trigger Functions
   DROP FUNCTION IF EXISTS public.tg_enqueue_sheets_mirror_job();
   DROP FUNCTION IF EXISTS public.tg_enforce_submissions_occ();
   DROP FUNCTION IF EXISTS public.tg_set_updated_at();

   -- 3. Drop Tables (in reverse foreign key dependency order)
   DROP TABLE IF EXISTS public.audit_events;
   DROP TABLE IF EXISTS public.sheets_mirror_jobs;
   DROP TABLE IF EXISTS public.submission_files;
   DROP TABLE IF EXISTS public.submissions;

   -- 4. Drop Security Scope Helper Functions
   DROP FUNCTION IF EXISTS public.jwt_has_programme(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_has_district(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_has_state(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_role();
   DROP FUNCTION IF EXISTS public.jwt_is_verified();
   COMMIT;
   ```
3. **Verify Rollback**: Query `information_schema.tables` in `public` schema to verify zero residual tables.
4. **Production Isolation Guard**: Under no circumstances execute this rollback script on production without a separate, owner-signed incident plan.

---

## 9. Incident Response

| Incident Scenario | Immediate Action | Escalation & Preservation |
| :--- | :--- | :--- |
| **Migration Fails Midway** | Do not rerun blindly. Execute rollback script on staging. | Preserve terminal error logs (redact credentials). Escalate to Lead Architect. |
| **RLS Verification Fails** | Immediately revoke all grants on target tables (`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated, anon`). | Capture failed test trace. Do not proceed to application integration. |
| **Synthetic Scope Leak** | Lock staging environment. Inspect `public.submissions` RLS policies. | Document test failure in issue tracker. Update migration SQL in new branch. |
| **Credential Accidental Exposure** | Immediately revoke and rotate the exposed credential in Supabase dashboard. | Notify Security Lead. Verify absence from git history, shell history, and logs. |
| **Production Credentials Suspected in Staging Run** | **ABORT IMMEDIATELY**. Terminate CLI process. Check production audit logs. | Escalate immediately to Project Owner. Audit production database for any modifications. |

---

## 10. Explicit Non-Execution Statement

> **This runbook was prepared for operational readiness but has NOT been executed.**
> - **No remote Supabase migration was applied.**
> - **No production or non-production remote Supabase project was linked, queried, altered, or accessed.**
> - **No real beneficiary data was accessed, imported, moved, or deleted.**
> - **Execution is blocked pending recorded owner approval in `OWNER_APPROVAL_GATE.md`.**
