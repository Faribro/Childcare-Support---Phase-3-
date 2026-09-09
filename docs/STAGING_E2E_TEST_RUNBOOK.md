# Staging E2E Test & Lifecycle Certification Runbook

**System:** Childcare Support — Phase 3 Progressive Web Application (PWA)  
**Classification:** Official / Internal Field QA Operations  
**Document Version:** 1.0.0-RUNBOOK  

---

## 1. Overview & Safety Architecture

This runbook details how to execute, verify, and audit the **Staging End-to-End Data Lifecycle Certification Suite**.

The test harness automates end-to-end verification of:
1. **Intake & Demographic Validation**: Multi-step wizard data entry at mobile viewport (390px).
2. **Consent & Signature Binding**: Strict validation that consent and touch signatures are verified server-side.
3. **Offline IndexedDB Drafts**: Autosaving, browser refresh survival, and zero premature sync acknowledgments.
4. **Queued Sync & Replay**: Reliable outbox replay with idempotency keys and zero duplicate records.
5. **73-Column Sheet Projection**: Complete 1-to-1 schema field mapping into Google Sheets without raw base64 cell storage.
6. **Optimistic Concurrency Control (OCC)**: Version increments ($1 \to 2$) and HTTP 409 conflict surfacing on stale concurrent edits.

### Safety Invariants
- **Zero Real Data**: All test runs generate synthetic records prefixed with `E2E_TEST_DO_NOT_USE_REAL_DATA_<timestamp>`.
- **Preflight Gate**: Prevents live network operations against the production/operational spreadsheet (`1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA`).
- **Fail-Closed Adapters**: Server endpoints return HTTP 503 if required upstream configuration is missing in production/staging environments.

---

## 2. Environment Configuration

### Required Environment Variables
For local synthetic verification:
```bash
NODE_ENV=development
NEXT_PUBLIC_APP_ENV=development
```

For live staging cloud integration (upon provisioning of an isolated staging sheet):
```bash
E2E_STAGING_ENABLED=true
NEXT_PUBLIC_APP_ENV=staging
APPS_SCRIPT_URL=https://script.google.com/macros/s/STAGING_DEPLOYMENT_ID/exec
WEBHOOK_SECRET=your_staging_shared_secret_32_chars
TARGET_SPREADSHEET_ID=your_staging_google_sheet_id
```

---

## 3. Automated Execution Commands

```bash
# 1. Verify environmental identity and security preconditions
npm run e2e:staging:preflight

# 2. Run automated 73-column field reconciliation engine
npm run e2e:staging:reconcile

# 3. Execute the full end-to-end lifecycle and offline recovery test suites
npm run e2e:staging:run

# 4. Verify canonical record integrity
npm run e2e:staging:verify <submissionId>
```

---

## 4. Test Suite Architecture

### A. Field-Mapping Reconciliation (`scripts/e2e/reconcile-field-mapping.ts`)
Inspects every field in `CompleteSubmissionPayload` and matches it against `patchSubmissionSchema`, `gas/Code.js`, and the 73 columns of the Google Sheet linelist.
- **Output:**
  - `docs/e2e-results/<run-id>/FIELD_MAPPING_RECONCILIATION.md`
  - `docs/e2e-results/<run-id>/field-mapping-reconciliation.json`

### B. Full Data Lifecycle (`e2e/full-data-lifecycle.spec.ts`)
Exercises the online intake, validation, consent capture, submission, idempotency deduplication, canonical GET retrieval, and allowlisted PATCH revisions.

### C. Offline Recovery & Concurrency (`e2e/offline-recovery-and-revision.spec.ts`)
Simulates offline mode during intake, draft autosave in Dexie.js, browser reloads, outbox queue creation, online reconnection, duplicate replay prevention, and HTTP 409 stale edit conflicts.

---

## 5. Opt-in Test Data Cleanup

To prevent test accumulation while preserving failure evidence, cleanup is strictly opt-in:
```bash
E2E_STAGING_ENABLED=true E2E_CLEANUP_CONFIRMED=true npx tsx scripts/e2e/cleanup-staging-test-data.ts <run-id>
```
If `E2E_CLEANUP_CONFIRMED` is not explicitly set, test data is intentionally preserved in the staging sheet for human audit and inspection.
