# Google Apps Script Administrative Menu Operations & Runbook

## 1. Overview & Setup

The Google Apps Script project provides an in-sheet administrative menu accessible directly from the Google Sheets navigation bar: **Childcare Phase 3 Admin**.

When authorized users open the sheet, the `onOpen(e)` simple trigger automatically registers the menu. All diagnostic functions operate in a **strictly non-destructive manner**, presenting analytical modal alerts without modifying linelist records.

```text
Google Sheets Top Menu:
[File] [Edit] [View] [Insert] [Format] [Data] [Tools] [Extensions] [Childcare Phase 3 Admin] [Help]
                                                                          |
                                                                          +-- Audit: Validate Sheet Schema
                                                                          +-- Audit: Drive Asset Security & ACLs
                                                                          +-- Audit: Data Quality Completeness
                                                                          +-- (Separator)
                                                                          +-- Preview: Protected Ranges State
                                                                          +-- Preview: Legacy Folder Migration
                                                                          +-- Preview: Public ACL Exposure
                                                                          +-- (Separator)
                                                                          +-- Apply: Protect Header & Governance Ranges
                                                                          +-- Apply: Refresh Linelist Formatting
```

---

## 2. Menu Command Reference

### 1. Audit: Validate Sheet Schema
- **Function**: `menuValidateSheetSchema()`
- **Action**: Validates header Row 3 against the canonical 73-column array. Checks for missing columns, unexpected order, or renamed headers.
- **Output Modal**: Displays matching count (e.g. `73/73 Columns Matched`), total columns, and details of any header discrepancies without mutating sheet structure.

### 2. Audit: Drive Asset Security & ACLs
- **Function**: `menuAuditDriveAssets()`
- **Action**: Scans document columns across all data rows, queries Drive metadata for each unique file ID, and checks for public link sharing or non-compliant filenames.
- **Output Modal**: Summarizes total files scanned, public sharing violations, slot naming violations, and an overall compliance verdict (`FULLY COMPLIANT` vs `ACTION REQUIRED`). All file IDs are redacted (`file-***`) to prevent PII leakage in alerts.

### 3. Audit: Data Quality Completeness
- **Function**: `menuGenerateDataQualityReport()`
- **Action**: Scans data rows (rows 4+) for vital clinical and administrative data completeness:
  - Missing Unique ID
  - Missing Child Full Name
  - Missing Caregiver Full Name
  - Missing Consent Attestation
- **Output Modal**: Summarizes data quality percentage and flags records needing caseworker follow-up. Zero individual PII is exposed in modal alerts.

### 4. Preview: Protected Ranges State
- **Function**: `menuPreviewProtectedRanges()`
- **Action**: **Strictly non-destructive preview** of sheet protections covering:
  - Header Rows 1 to 3
  - System Columns 1 & 2 (`Unique ID`, `Revision Number`)
  - Governance Columns 67 & 68 (`Approved Alliance India`, `Review Confirmed`)
  - System Timestamp Column 73 (`Last Updated`)
- **Output Modal**: Reports active protection coverage, whether protections are strictly enforced (`warningOnly: false`) or warning-only, and total active range counts. Does NOT apply or modify protections.

### 5. Preview: Legacy Folder Migration
- **Function**: `menuPreviewFolderMigration()`
- **Action**: Inventories legacy child-name folders (`<ChildName> - <UniqueID>`) under `Alliance India Child PDFs`.
- **Output Modal**: Reports the total count and aggregate summary of folders eligible for opaque UUID migration (`assessments/{assetContainerId}/current/`) without moving or touching files.

### 6. Preview: Public ACL Exposure
- **Function**: `menuPreviewPublicAclViolations()`
- **Action**: Identifies any attachment files on Drive with public link sharing enabled (`type === 'anyone'`).
- **Output Modal**: Summarizes total violations and advises remediation via `enforceRestrictedAcl` action. Does NOT leak raw file URLs or beneficiary details.

### 7. Apply: Protect Header & Governance Ranges
- **Function**: `menuApplyProtectedRanges()`
- **Action**: **Administrator-confirmed mutation** requiring explicit confirmation prompt (`ui.ButtonSet.YES_NO`).
- **Enforcement**: Applies `warningOnly: false` (hard lock) on:
  - Header Rows 1–3
  - Columns 1–2 (`Unique ID`, `Revision Number`)
  - Columns 67–68 (`Approved Alliance India`, `Review Confirmed`)
  - Column 73 (`Last Updated`)
- **Editors**: Restricts editing rights strictly to the script owner / effective service user, revoking unauthorized domain editor permissions.

### 8. Apply: Refresh Linelist Formatting
- **Function**: `menuRefreshSheetPresentation()`
- **Action**: Re-applies row heights (Row 1: 38px, Row 2: 12px, Row 3: 90px, Data rows: 60px), header colors, text wrapping, and zebra striping. Non-destructive to all underlying data cells.
