# Gate 1 Readiness Report: Non-Production Supabase Migration (`GATE1_READINESS_REPORT.md`)
### Operational Readiness Document — Staging / Isolated Environment

> [!CAUTION]
> **NOT EXECUTED — PENDING EXPLICIT OWNER SIGN-OFF**
> This readiness report is prepared for a designated **non-production/isolated Supabase environment only**.
> - **No remote database migration has been applied.**
> - **No remote Supabase project has been linked, connected, queried, or modified.**
> - **No real beneficiary data has been imported, moved, queried, or altered.**
> - **Gate 3 (Production Supabase Migration & Cutover) remains strictly CLOSED.**

---

## 1. Migration Artifact & Schema Baseline

- **Exact Migration File**: [`supabase/migrations/20261012170000_core_schema_foundation.sql`](./supabase/migrations/20261012170000_core_schema_foundation.sql)
- **Exact Schema Source Commit**: `1a6553ccab166670f4846c1e3a44493ed3ae66c2` (merged PR #75, integrated into `main` at `8c26f9d6cc9a257683e3a06e76ce4728340a98e5`)
- **Architectural Scope**:
  - `public.submissions`: 8-step validated assessment storage, hybrid relational + `form_payload JSONB`, 73-column linelist mapping, mandatory DPDP consent gate (`consent_provided = true`), separate `meals_per_day` (Col 48) and `edit_reason` columns, and OCC versioning (`version = OLD.version + 1`).
  - `public.submission_files`: Private Tigris metadata registry (storage keys, MIME types, sizes, SHA-256 digests, `cell_state_hash`, `is_restricted_doc = true`).
  - `public.sheets_mirror_jobs`: Transactional outbox queue for Google Apps Script sync with worker lease fields (`locked_at`, `locked_by`, `sheet_row`).
  - `public.audit_events`: Append-only security and operational audit trail aligned with `SecurityAuditEvent` in `src/lib/server/authorisation.ts`.
  - **Security & RLS**: `FORCE ROW LEVEL SECURITY`, `REVOKE ALL FROM anon, PUBLIC`, and strict hierarchical scoping:
    - `FIELD_USER`: State + District + Programme scope (`jwt_has_state` + `jwt_has_district` + `jwt_has_programme`). Cannot delete.
    - `STATE_REVIEWER`: State scope. Cannot delete.
    - `ADMIN` & `LEADERSHIP`: Cross-state scope. Hard `DELETE` restricted to these roles only.

---

## 2. Target Non-Production Environment Configuration

| Parameter | Specification | Current Status / Operator Entry |
| :--- | :--- | :--- |
| **Target Project Reference** | Distinct Staging project ref (e.g. `childcare3-staging`) | **Awaiting Owner Provision** |
| **Environment Isolation** | Completely segregated from production project | `[ ] Pending Owner Confirmation` |
| **Data Cleanliness** | Zero production or beneficiary data in project | `[ ] Pending Owner Confirmation` |
| **Approved Execution Window** | Agreed date and time range (UTC / IST) | **Awaiting Owner Scheduling** |
| **Designated Operator** | Authorized engineer executing runbook | **Awaiting Owner Assignment** |
| **Rollback Owner** | Lead Architect responsible for rollback execution | **Awaiting Owner Assignment** |
| **Pre-Migration Snapshot** | Staging database backup taken prior to migration | `[ ] Required Before Run` |

---

## 3. Pre-Migration Checklist Status

- [X] Hardened migration SQL verified at commit `1a6553ccab166670f4846c1e3a44493ed3ae66c2`.
- [X] Static typecheck (`npm run typecheck`), lint (`npm run lint`), and full Vitest suite (`630/630` passed).
- [X] Migration readiness and 73-column mapping tests pass (`supabase-schema-migration-review.test.ts`).
- [X] Zero secrets, tokens, connection strings, or credentials committed or printed.
- [X] Verified that CI, Vercel, and Render build scripts execute NO automatic migrations.
- [ ] Target non-production project reference supplied and verified by Owner.
- [ ] Staging database snapshot / backup confirmed.
- [ ] Gate 1 Owner Approval statement recorded in `OWNER_APPROVAL_GATE.md`.

---

## 4. Synthetic Seed-Data Plan

Under the project privacy charter and DPDP Act compliance rules, **real beneficiary data is strictly prohibited in non-production environments**.

The synthetic seed dataset consists of 4 isolated records:
1. `SYNTH-MH-PUN-0001`: Active assessment in Maharashtra / Pune / Haveli / Wagholi (`programme_id: 'alliance-childcare-phase3'`).
2. `SYNTH-MH-NGP-0002`: Completed assessment in Maharashtra / Nagpur / Hingna / Nildoh.
3. `SYNTH-KA-BLR-0003`: Assessment in Karnataka / Bengaluru Urban / Bangalore South / Anekal.
4. `SYNTH-WB-KOL-0004`: Out-of-scope assessment in West Bengal / Kolkata.

**Verification Utility of Synthetic Fixtures**:
- Proves `FIELD_USER` assigned to Pune can read only `SYNTH-MH-PUN-0001` and receives `403 FORBIDDEN_SCOPE` on `SYNTH-MH-NGP-0002` and `SYNTH-KA-BLR-0003`.
- Proves `STATE_REVIEWER` assigned to Maharashtra can read `SYNTH-MH-PUN-0001` and `SYNTH-MH-NGP-0002`, but is denied `SYNTH-KA-BLR-0003`.
- Proves `ADMIN` can view cross-state synthetic records with full audit trail in `public.audit_events`.
- Proves zero real beneficiary data is touched.

---

## 5. Execution Commands (NOT EXECUTED)

The following commands are documented for execution only after Gate 1 approval is granted:

```bash
# ==============================================================================
# COMMANDS BELOW ARE NOT EXECUTED — PENDING GATE 1 OWNER APPROVAL
# ==============================================================================

# Step 1: Verify Supabase CLI
supabase --version

# Step 2: Set Staging Project Reference
export STAGING_PROJECT_REF="<owner-supplied-staging-ref>"

# Step 3: Link Staging Project Only
supabase link --project-ref "$STAGING_PROJECT_REF"

# Step 4: Verify Linked Project is NOT Production
supabase status

# Step 5: Dry-Run Migration Diff
supabase db diff --linked

# Step 6: Apply Migration to Staging
supabase db push --include-all

# Step 7: Verify Applied Migrations
supabase migration list --linked

# Step 8: Run Synthetic Contract Tests against Staging
npm run test src/test/integration/supabase-schema-migration-review.test.ts
```

---

## 6. Post-Migration Verification Checklist

To be verified against the staging project immediately following execution:

- [ ] All 4 tables exist (`submissions`, `submission_files`, `sheets_mirror_jobs`, `audit_events`).
- [ ] All 73 Google Sheets linelist columns and constraints exist in `submissions`.
- [ ] RLS is enabled and forced on all four tables (`FORCE ROW LEVEL SECURITY`).
- [ ] All permissions revoked from `anon` and `PUBLIC`.
- [ ] Unauthenticated callers (`isVerified = false` or `anon`) cannot read or insert.
- [ ] `FIELD_USER` can query only records matching assigned `state` + `district` + `programme_id`.
- [ ] `FIELD_USER` cannot query other districts or states (`403` / RLS denial).
- [ ] `FIELD_USER` and `STATE_REVIEWER` are denied `DELETE` on `submissions`.
- [ ] `ADMIN` and `LEADERSHIP` delete behavior matches approved policy (`submissions_delete_admin_only`).
- [ ] Column 48 `meals_per_day` and supervisor `edit_reason` are stored in separate columns.
- [ ] Submission insert atomically enqueues an outbox row in `sheets_mirror_jobs`.
- [ ] `sheets_mirror_jobs.payload_snapshot` contains only `"Restricted Doc [<docType>]"` and rejects raw Tigris keys.
- [ ] `submission_files` stores only safe metadata and SHA-256 digests.
- [ ] `audit_events` is strictly append-only.
- [ ] OCC version increment enforces `version = OLD.version + 1`.
- [ ] Synthetic end-to-end submission, edit, attachment metadata, and audit flows pass.

---

## 7. Rollback Procedure

If any staging verification check fails:
1. Halt all test traffic immediately.
2. Execute down-migration script in staging database:
   ```sql
   BEGIN;
   DROP TRIGGER IF EXISTS trg_submissions_enqueue_sheets_mirror ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submissions_enforce_occ ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submissions_set_updated_at ON public.submissions;
   DROP TRIGGER IF EXISTS trg_submission_files_set_updated_at ON public.submission_files;
   DROP TRIGGER IF EXISTS trg_sheets_mirror_jobs_set_updated_at ON public.sheets_mirror_jobs;

   DROP FUNCTION IF EXISTS public.tg_enqueue_sheets_mirror_job();
   DROP FUNCTION IF EXISTS public.tg_enforce_submissions_occ();
   DROP FUNCTION IF EXISTS public.tg_set_updated_at();

   DROP TABLE IF EXISTS public.audit_events;
   DROP TABLE IF EXISTS public.sheets_mirror_jobs;
   DROP TABLE IF EXISTS public.submission_files;
   DROP TABLE IF EXISTS public.submissions;

   DROP FUNCTION IF EXISTS public.jwt_has_programme(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_has_district(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_has_state(TEXT);
   DROP FUNCTION IF EXISTS public.jwt_role();
   DROP FUNCTION IF EXISTS public.jwt_is_verified();
   COMMIT;
   ```
3. Restore from pre-migration staging snapshot if necessary.
4. Document the defect and revise migration SQL in a new branch.

---

## 8. Incident-Response Protocol

- **Midway Failure**: Roll back staging; preserve terminal logs with redacted secrets; report to Lead Architect.
- **RLS Scope Leak**: Immediately revoke grants on staging; quarantine test run; inspect policy definition.
- **Accidental Production Link**: If CLI is linked to production, **ABORT IMMEDIATELY**, terminate CLI session, unlink, and notify Project Owner.

---

## 9. Gate 3 Status: STRICTLY CLOSED

> **Gate 3 (Production Supabase Migration & Cutover) remains strictly CLOSED.**
> No remote production database migration, data cutover, or production real-data operations may be initiated until Gate 1 is completely executed, verified, and followed by separate, explicit written owner approval.
