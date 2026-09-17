# Incident Audit & Technical Root-Cause Analysis: DL-SOU-141540-01

## 1. Incident Overview
- **Incident Scope:** Creation timeout and ambiguous retry behavior during submission of production assessment record `DL-SOU-141540-01`.
- **Target Spreadsheet:** `1YORdIKiIdSILyOekMJ5BCO5WCujoZ87U7H65x88HKkM` (GID: `1462106769`, Tab: `Child_Nutrition`).
- **Target Apps Script Backend:** `1niE4gIprmYbC-DQYy9H9m1Y73jfutXNcY5R6sOvr7Ac0WQXa-ZwFScMl`.
- **Target Record Identity:** `DL-SOU-141540-01` (Redacted in audit logs as `DL-SOU-***-01`).

---

## 2. Row-Identity Safety Rectification
A critical invariant has been enforced across all scripts, backend handlers, and automated test suites:

> [!IMPORTANT]
> **Row numbers are dynamic spreadsheet layout positions and must NEVER be treated as production identities.**
> A spreadsheet row position changes whenever rows are inserted, deleted, filtered, or reordered.
> While an earlier working hypothesis assumed Row 18 based on preliminary logs, inspection of the operational Google Sheet visibly confirms that record `DL-SOU-141540-01` resides on **Row 5**, with the signature at **Column 6 (Column F)**.
> Therefore, hardcoded row numbers have been strictly purged from all execution paths.

### Row-Identity-Safe Architecture:
1. **Dynamic Runtime Unique-ID Resolution:**
   The reconciliation script and Apps Script backend (`handleUpdateAsset_`) scan Column 1 (`1\nUnique ID`) across all data rows (starting at Row 4) at runtime to locate the exact record matching the target Unique ID.
2. **Fail-Closed Match Verification:**
   - **Zero matches:** Refuses execution fail-closed (`RECORD_NOT_FOUND_EXECUTION_BLOCKED`).
   - **Multiple matches:** Refuses execution fail-closed (`AMBIGUOUS_DUPLICATE_EXECUTION_BLOCKED`).
   - **Arbitrary row arguments:** The CLI strictly rejects `--row` or `-r` arguments to prevent operator error.
3. **Optimistic Concurrency Control (OCC):**
   - Dry-run calculates a SHA-256 hash of the observed cell state.
   - Execution requires `--expected-hash <sha256>`.
   - If the cell content changes between dry-run and execution, execution is immediately aborted (`STALE_CELL_STATE_OCC_CONFLICT`).
4. **Human Operator Confirmation Token:**
   Execution requires explicit `--confirm-token CONFIRM_RECONCILE_DL-SOU-141540-01`.
5. **Server-Side Re-lookup:**
   Immediately prior to writing, the script executes a second lookup to guarantee atomic safety.
6. **Single-Cell Mutation Invariant:**
   Mutates ONLY the target document cell (Column 6 for Signature) and Column 73 (Last Updated timestamp). It strictly avoids invoking `sheet.appendRow` and guarantees zero mutations to clinical, demographic, banking, or consent data.

---

## 3. Privacy & Zero-PII Compliance
Under DPDP Act and healthcare data protection policies:
- Audit outputs redact business IDs (`DL-SOU-***-01`).
- Hashes are logged instead of raw values (`sha256:...`).
- Strictly zero signatures, zero raw data URLs, zero Drive file IDs, and zero clinical payloads are exposed in logs.

---

## 4. Current Operational State: RESOLVED
- **PR #17 & PR #18:** Merged into main. Fast-follow OCC enforcement integrated.
- **Apps Script Live Deployment:** Deployed Version @25 with `updateAsset` dynamic row lookup, fail-closed concurrency verification, and Drive permission handling.
- **Production Execution:** Successfully executed on 2026-09-17 with zero duplicate rows and single-cell targeted mutation.

---

## 5. Execution Outcome & Verification Proof
- **Reconciliation Timestamp:** 2026-09-17 14:33:36 IST (09:03:36 UTC)
- **Target Spreadsheet:** `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA` (Tab: `Child_Nutrition`, GID: `0`)
- **Execution Command:**
  ```bash
  npx tsx scripts/reconcile-dl-sou-record.ts --execute --id DL-SOU-141540-01 --expected-hash 7faebcc82912a2635f0b28ebb6b654f9bdd886e82d0923d0f809576eccb7e386 --confirm-token CONFIRM_RECONCILE_DL-SOU-141540-01
  ```
- **Execution Log Output:**
  ```text
  [EXECUTE SUCCESS] Record DL-SOU-***-01 successfully reconciled at Row 5.
  ```
- **Post-Reconciliation Live Audit:**
  - **Data Rows Total:** Exactly 5 data rows (Zero duplicate rows appended, zero row pollution).
  - **Row 5, Column 1 (`Unique ID`):** `DL-SOU-141540-01` (Unmodified).
  - **Row 5, Column 2 (`Revision Number`):** `1` (Preserved; no spurious revision bump).
  - **Row 5, Column 6 (`Signature / Thumb Impression`):** Populated with `=HYPERLINK("<drive_view_url>", "Restricted Doc [Signature]")`, displaying `Restricted Doc [Signature]`.
  - **Row 5, Column 73 (`Last Updated`):** Updated to `2026-09-17T09:03:36.282Z`.
  - **Demographic, Clinical, & Consent Fields:** 100% verified untouched.
  - **Google Drive Containment:** Signature image persisted strictly within systematic child Drive container under the root documents folder; zero uncontained files created.

