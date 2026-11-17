# Phase D Implementation Report: Fresh Start Seeding, Staging Reset & Safety Backup

**Date**: November 13, 2026  
**Branch**: `gcp-migration`  
**Target Project**: `cs-p3-production`  
**Staging Database**: `staging` | **Production Database**: `(default)`  
**Staging Bucket**: `cs-p3-childcare-staging`  
**Service Account**: `csc-runtime@cs-p3-production.iam.gserviceaccount.com`  
**Status**: Completed, Tested & Validated

---

## 1. What Changed (Phase D)

In accordance with the data decision to treat all historical data in Supabase, the legacy Sheet, and Tigris as dummy test data, the migration scripts (`migrate-supabase-to-firestore`, `migrate-sheets-to-firestore`, `migrate-tigris-to-gcs`, and `verify-migration`) were **dropped**.

Phase D implemented the complete fresh-start provisioning, safety backup, and environment management toolkit:

### D1. Read-Only Safety Backup (`scripts/export-sheets-backup.ts`)
- **Safety Guarantee**: Read-only extraction of existing Google Sheets data. Makes zero writes, edits, or deletes to any remote store.
- **Header Fidelity**: Preserves all 83 canonical columns.
- **Output**: Exports a local timestamped snapshot (`backups/sheets-backup-<timestamp>.csv` and `.json`).
- Added npm/bun script shortcut: `bun run backup:sheets`.

### D2. Evaluation Credentials Seed Utility (`scripts/seed-credentials.ts`)
- **Local Input & Random Generation**: Reads account definitions from a local JSON file (`--file=<path>`), default `credentials.seed.json`, or canonical state roster. Generates cryptographically secure one-time passwords (`crypto.randomBytes(12).toString('base64url')`).
- **Terminal-Only Visibility**: Displays credentials **ONCE directly to the local terminal session**. Passwords are never written to disk, git, or application log files.
- **Argon2id Hashing**: Hashes passwords with RFC 9106 Argon2id parameters before committing to Firestore collection `evaluation_credentials`.
- **Environment Guards**:
  - Safe by default: runs in `--dry-run` mode unless `--execute` is provided.
  - Staging by default: targets `APP_ENV=staging` and `FIRESTORE_DATABASE_ID=staging`.
  - Production refusal: strictly refuses to target `(default)` or production unless `--confirm-production` is explicitly passed.
- Added npm/bun script shortcut: `bun run seed:credentials`.

### D3. Leadership Identities Seed Utility (`scripts/seed-leader-identities.ts`)
- **Directory Seeding**: Populates collection `leader_identities` from local JSON (`--file=<path>`), `leaders.seed.json`, or `LEADERSHIP_ALLOWLIST_JSON`.
- **Environment Guards**:
  - Safe by default: `--dry-run` mode by default.
  - Staging by default: targets `staging` database.
  - Refuses production database `(default)` without `--confirm-production`.
- Added npm/bun script shortcut: `bun run seed:leaders`.

### D4. Staging Reset & Cleanup Engine (`scripts/reset-staging.ts`)
- **Targeted Staging Wipe**: Wipes only test documents in `staging` Firestore collections (`submissions`, `attachment_metadata`, `sheets_mirror_retry_queue`, `auth_attempts`, `auth_lockouts`, `leadership_sessions`, `leader_otp_challenges`, `state_team_registrations`, `state_team_invitations`, `state_team_challenges`, `field_user_profiles`, `export_delivery_jobs`, `export_preview_contracts`).
- **Bucket Wipe**: Deletes test files in staging bucket `cs-p3-childcare-staging`.
- **Hardcoded Production Refusal**: Hardcoded safety check immediately aborts execution if `APP_ENV=production`, `FIRESTORE_DATABASE_ID=(default)`, or the bucket name contains `production`.
- **Confirmation Prompt**: Requires explicit interactive confirmation by typing `RESET STAGING` (or `--force` for non-interactive test harnesses).
- Added npm/bun script shortcut: `bun run reset:staging`.

### D5. Documentation Hardening (`docs/gcp-migration/MIGRATION.md`)
- **Cookie Architecture**: Detailed 5-cookie inventory, Firebase Hosting `__session` stripping behavior, unified cookie envelope design, and the direct Cloud Run domain mapping alternative.
- **Build-Time Inlining Alert**: Documented why staging and production require separate container builds with build-arg checks in `next.config.mjs`.
- **Service Account**: Unified runtime identity `csc-runtime@cs-p3-production.iam.gserviceaccount.com` documented across all IAM roles and defaults.
- **Lockouts & TTL**: Documented `auth_attempts` and `auth_lockouts` collections and exact gcloud TTL commands for both `staging` and `(default)` databases.
- **Staging Smoke-Test Checklist**: 8-step verification checklist replacing the data verification script.
- **Post-Cutover Cleanup Runbook**: 5-step operational runbook for the project owner.

---

## 2. What Did NOT Change
- **Main Branch**: Local `main` remains untouched at `da8ac97`.
- **System Defaults**: System defaults remain `DATA_ENGINE=sheets` and `STORAGE_PROVIDER=tigris`.
- **Live Infrastructure**: Live Vercel production deployment (`520f1a4`), Supabase database (`rjrctsxdvkfkssqvmhbz`), Tigris S3 bucket, production Google Sheet, and Apps Script remain untouched and live.
- **No Cloud Mutations**: No `gcloud`, `firebase`, or `gsutil` commands were run.

---

## 3. Test & Build Results vs Baseline

| Metric | Baseline (Phase A) | Current Status (Phase D) | Change |
| :--- | :--- | :--- | :--- |
| **Test Files** | 112 | **116** | +4 test files |
| **Tests Passed** | 1,509 | **1,577** | **+68 tests passed** |
| **Tests Skipped** | 26 | **26** | 0 regressions |
| **Tests Failed** | 0 | **0** | Clean |
| **TypeScript Check** | 0 errors | **0 errors** (`bun x tsc --noEmit`) | Clean |
| **Next.js Standalone Build** | Pass | **Pass** (`bun run build`, Exit code 0) | All 20 static pages & APIs built |

---

## 4. Risks & Operational Mitigations
1. **Accidental Production Seeding**: Prevented by hardcoded `--confirm-production` requirement in both seed scripts. Any attempt to run without this flag fails immediately with a descriptive refusal message.
2. **Accidental Staging Reset on Production**: Prevented by hardcoded refusal in `reset-staging.ts` whenever target environment, database, or bucket matches production.
3. **Password Leakage**: Passwords generated by `seed-credentials.ts` are held exclusively in ephemeral memory and printed once to stdout. Neither disk files nor audit logs retain plaintext passwords.

---

## 5. Needs the Owner (Next Steps)
Phase D code and scripts are complete, tested, and validated.

When ready to deploy and verify staging:
1. Build and deploy staging image to Cloud Run using the documented commands in `TASK4_CLOUD_RUN.md`.
2. Seed staging credentials: `bun run seed:credentials --execute`.
3. Seed staging leadership identities: `bun run seed:leaders --execute`.
4. Perform the Staging Smoke-Test Checklist documented in `docs/gcp-migration/MIGRATION.md`.
