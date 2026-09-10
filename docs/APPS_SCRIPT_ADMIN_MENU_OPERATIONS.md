# Google Apps Script Administrative Menu Operations & Runbook

## 1. Overview & Setup

The Google Apps Script project provides an in-sheet administrative menu accessible directly from the Google Sheets navigation bar: **Childcare Phase 3 Admin**.

When authorized users open the sheet, the `onOpen(e)` simple trigger automatically registers the menu. All diagnostic functions operate in a **strictly non-destructive manner**, presenting analytical modal alerts without modifying linelist records.

```text
Google Sheets Top Menu:
[File] [Edit] [View] [Insert] [Format] [Data] [Tools] [Extensions] [Childcare Phase 3 Admin] [Help]
                                                                          |
                                                                          +-- Validate Sheet Schema
                                                                          +-- Audit Drive Asset References
                                                                          +-- Generate Data Quality Report
                                                                          +-- Verify Protected Columns
                                                                          +-- Preview Folder Migration
                                                                          +-- Preview Public ACL Violations
                                                                          +-- Refresh Sheet Presentation
                                                                          +-- (Separator)
                                                                          +-- Format Header Styles & Linelist Design
```

---

## 2. Menu Command Reference

### 1. Validate Sheet Schema
- **Function**: `menuValidateSheetSchema()`
- **Action**: Validates header Row 3 against the canonical 73-column array. Checks for missing columns, unexpected order, or renamed headers.
- **Output Modal**: Displays matching count (e.g. `73/73 Columns Matched`), total columns, and details of any header discrepancies.

### 2. Audit Drive Asset References
- **Function**: `menuAuditDriveAssets()`
- **Action**: Scans document columns across all data rows, queries Drive metadata for each unique file ID, and checks for public link sharing or non-compliant filenames.
- **Output Modal**: Summarizes total files scanned, public sharing violations, slot naming violations, and an overall compliance verdict (`FULLY COMPLIANT` vs `ACTION REQUIRED`).

### 3. Generate Data Quality Report
- **Function**: `menuGenerateDataQualityReport()`
- **Action**: Scans data rows (rows 4+) for vital clinical and administrative data completeness:
  - Missing Unique ID
  - Missing Child Full Name
  - Missing Caregiver Full Name
  - Missing Consent Attestation
- **Output Modal**: Summarizes data quality percentage and flags records needing caseworker follow-up.

### 4. Verify Protected Columns
- **Function**: `menuVerifyProtectedColumns()`
- **Action**: Ensures sheet protections are actively applied to:
  - Header Rows 1 to 3
  - System Columns 1 & 2 (`Unique ID`, `Revision Number`)
  - Governance Columns 67, 68 & 73 (`Approved Alliance India`, `Review Confirmed`, `Last Updated`)
- **Output Modal**: Lists active protected ranges and applies missing protections with warning notices.

### 5. Preview Folder Migration
- **Function**: `menuPreviewFolderMigration()`
- **Action**: Inventories legacy child-name folders (`<ChildName> - <UniqueID>`) under `Alliance India Child PDFs`.
- **Output Modal**: Reports the total count and names of folders queued for opaque hierarchy relocation without moving any files.

### 6. Preview Public ACL Violations
- **Function**: `menuPreviewPublicAclViolations()`
- **Action**: Identifies any attachment files on Drive with public link sharing enabled (`type === 'anyone'`).
- **Output Modal**: Lists file IDs and names of violating assets, confirming whether domain-only isolation is intact.

### 7. Refresh Sheet Presentation
- **Function**: `menuRefreshSheetPresentation()`
- **Action**: Re-applies row heights (Row 1: 38px, Row 2: 12px, Row 3: 90px, Data rows: 60px), header colors, text wrapping, and zebra striping. Non-destructive to all underlying data cells.
