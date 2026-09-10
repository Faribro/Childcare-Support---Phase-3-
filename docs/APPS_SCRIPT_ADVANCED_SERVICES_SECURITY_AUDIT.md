# Apps Script & Advanced Services Security and Architecture Audit

**Document Version:** 1.0.0-AUDIT  
**Target Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Target Branch:** `feature/fail-closed-appsscript-auth-and-advanced-services`  
**Date:** 2026-09-10  
**Classification:** Official Security & Architectural Audit  

---

## Executive Summary
This audit provides a comprehensive security, privacy, and architectural analysis of the Google Apps Script bridge, Google Sheets API v4 usage, Google Drive API v3 asset storage, and Render Next.js gateway integration for the Childcare Support PWA (Phase 3). Every finding is evaluated against enterprise safety requirements, zero-trust invariants, free-tier quota limits, and child privacy protections.

---

## Finding Classification Legend
- **BLOCKER**: Disallows production deployment; immediate exploitability or catastrophic data/privacy loss.
- **CRITICAL**: Significant security vulnerability, unauthorized access, or silent credential bypass.
- **HIGH**: Substantial risk of PII leakage, data corruption, or denial-of-service.
- **MEDIUM**: Architectural fragility, inconsistent contract mapping, or maintenance liability.
- **LOW**: Minor inconsistency, documentation gap, or non-exploitable edge case.
- **OPPORTUNITY**: Performance optimization, quota preservation, or clean architecture improvement.

---

## Section A: Authentication & Access Control Audit

### Finding A.1: In-Code Fallback Secret & Self-Configuring Properties Service [CRITICAL]
- **Location**: `gas/Code.js:178-183`, `gas/Code.js:242-247`, `src/lib/server/canonicalSubmissionAdapter.ts:210-212`
- **Mechanism**:
  ```javascript
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET') || 'childcare_phase3_secret_token_2026';
  if (!PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET')) {
    try {
      PropertiesService.getScriptProperties().setProperty('WEBHOOK_SECRET', expectedSecret);
    } catch (e) {}
  }
  ```
- **Risk**:
  1. Default secret is committed to public source control.
  2. If an administrator deletes or fails to configure `WEBHOOK_SECRET` in Script Properties, the system self-heals using a known, publicly exposed default rather than failing closed.
  3. `canonicalSubmissionAdapter.ts` falls back to the exact same string when `process.env.RENDER === 'true'`.
- **Remediation**:
  Replace with `requireWebhookSecret_(payload, action, requestId)` which strictly reads from `PropertiesService.getScriptProperties()`. If absent, immediately return `503 CONFIGURATION_ERROR`. If mismatched or missing from caller, return `401 UNAUTHORIZED`. Never default, generate, or commit secret values.

### Finding A.2: Unauthenticated `doGet` Schema Inspection [MEDIUM]
- **Location**: `gas/Code.js:167-175`
- **Mechanism**:
  `action === 'schema'` responds with full 73-column headers without requiring `WEBHOOK_SECRET`.
- **Risk**: Exposes internal database schema and field names to anonymous web crawlers. While not leaking beneficiary records directly, it increases reconnaissance surface.
- **Remediation**: Require `WEBHOOK_SECRET` for all actions including schema inspection, or restrict anonymous `doGet` strictly to a non-descriptive health ping (`{ status: "ok" }`).

### Finding A.3: Destructive Actions Exposed via POST Without Multi-Factor Guard [HIGH]
- **Location**: `gas/Code.js:275-280` (`action: 'clear'` / `'clearData'`)
- **Mechanism**: Any caller possessing `WEBHOOK_SECRET` can delete all sheet data rows via a single POST request.
- **Remediation**: Guard destructive actions with an explicit confirmation token/phrase (`confirmPurge: "CONFIRM_PURGE_ALL_DATA_ROWS"`), restrict destructive actions to internal admin menus only, and log all invocations to an internal audit trail.

### Finding A.4: Secret Query String Parameter Fallback in `doGet` [HIGH]
- **Location**: `gas/Code.js:184` (`e.parameter && e.parameter.secret`)
- **Risk**: Passing secrets via URL query parameters causes credentials to be logged in browser history, proxy server logs, and HTTP Referer headers.
- **Remediation**: Mandate credentials exclusively via HTTP headers (`X-Webhook-Secret`) and POST JSON body payloads.

---

## Section B: Google Sheets & Data Integrity Audit

### Finding B.1: Primary Tab and Header Identification Fragility [MEDIUM]
- **Location**: `gas/Code.js:578-640` (`getSheetAndColMap_`)
- **Mechanism**: Tab search relies on fuzzy name matching (`nutrition`, `linelist`, `child`, `hiv`), falling back to `Sheet1` or index 0. Header row detection scans rows 1 to 5 looking for substrings.
- **Risk**: If an administrative user renames tabs or adds descriptive notes in rows 1–3, the dynamic offset can drift, leading to misaligned column updates.
- **Remediation**:
  Use Advanced Sheets API v4 (`Sheets.Spreadsheets.get`) to fetch sheet metadata, freeze headers on row 3, and validate canonical column names by exact match with 6-hour caching.

### Finding B.2: Row Number As Public Record Identity Risk [HIGH]
- **Location**: `gas/Code.js:1632` (`sheet.deleteRow(foundRow)`) and UI receipt routes
- **Mechanism**: In some legacy code paths, row numbers were referenced as record indices.
- **Risk**: In a concurrent multi-caseworker environment, row numbers shift whenever rows are inserted, deleted, or sorted.
- **Remediation**: Invariant enforcement: Unique ID (UUID Column A) is the sole canonical identity. Row numbers must never be exposed as identifiers or used for addressing mutations.

### Finding B.3: Supervisor Read Model Over-Fetching & PII Exposure [HIGH]
- **Location**: `gas/Code.js:1150-1200` (`handleList_`)
- **Mechanism**: `handleList_` returns entire raw row objects including Bank Account Numbers, IFSC codes, raw Aadhaar numbers, and document URLs to supervisor linelist consumers.
- **Risk**: Violates data minimization principles under DPDP Act / HIPAA equivalents. Supervisors reviewing linelists do not need unmasked bank account numbers or raw caregiver signature data URLs.
- **Remediation**:
  Implement DTO redaction in `listSubmissions_`. Return masked IDs, child name, age, district, nutrition status, and document presence indicators. Mask bank numbers (`XXXX-XXXX-1234`) and Aadhaar (`XXXX-XXXX-5678`).

---

## Section C: Google Drive Asset Security & Privacy Audit

### Finding C.1: Child Name & Unique ID in Drive Folder Names [CRITICAL / PRIVACY BLOCKER]
- **Location**: `gas/Code.js:428` (`var expectedFolderName = safeName + ' - ' + safeId;`)
- **Mechanism**: Creates Drive folders using `<ChildName> - <UniqueID>`.
- **Risk**:
  1. Personal Identifiable Information (Child Full Name) is directly stored in cleartext folder names across Google Drive.
  2. Anyone with view access to the root folder can read all beneficiary names, violating privacy invariants.
  3. Sensitive health-adjacent child status is directly linkable.
- **Remediation**:
  Enforce opaque folder strategy:
  `Alliance India Child PDFs/assessments/{remoteSubmissionId}/current/`.
  Never use child names, caregiver names, ART numbers, or phone numbers in folder or file names.

### Finding C.2: Document Slot File Naming Inconsistency & Risk of Orphaned Files [MEDIUM]
- **Location**: `gas/Code.js:460-490`, `gas/Code.js:527`
- **Mechanism**: When files are uploaded, new files are created without consistent naming, and old files are deleted synchronously via `deleteObsoleteDocumentFiles_`.
- **Risk**:
  If the Sheets update fails after creating the Drive file, an orphaned file remains in Drive. If old files are prematurely deleted before Sheet confirmation, data is permanently lost.
- **Remediation**:
  Use standardized non-PII slot filenames (`caregiver-signature.png`, `passbook.jpg`, `school-fee-receipt.pdf`, `identity-document.jpg`).
  Implement two-phase asset replacement (upload new -> verify -> update Sheet pointer -> quarantine old).

### Finding C.3: Risk of Public Drive Permissions [CRITICAL]
- **Location**: `gas/Code.js:412-414`
- **Mechanism**: `DriveApp.createFolder` inherits parent permissions. If the root folder has public link sharing (`ANYONE_WITH_LINK`), all child files become publicly downloadable.
- **Remediation**:
  Audit and enforce restricted ACLs via Advanced Drive API v3 (`Drive.Permissions.list`). Automatically flag and alert on any public permission (`type: 'anyone'`).

---

## Section D: Advanced Services Capabilities & Allocation

| Operation | Built-In Service (`SpreadsheetApp` / `DriveApp`) | Advanced Service (`Sheets` v4 / `Drive` v3) | Selected Architecture & Rationale |
| :--- | :--- | :--- | :--- |
| **Header / Schema Validation** | Fragile row-by-row cell iteration | `Sheets.Spreadsheets.get` (Single API call with field masks) | **Advanced Sheets API v4**: Drastically reduces quota and execution time. |
| **Linelist Bounded Read** | `sheet.getRange(...).getValues()` | `Sheets.Spreadsheets.Values.get` | **Advanced Sheets API v4**: Direct, bounded range read with single payload transfer. |
| **Linelist Formatting** | Multiple iterative format calls | `Sheets.Spreadsheets.batchUpdate` | **Advanced Sheets API v4**: Atomic batch update of frozen rows, column widths, and banding. |
| **Row Append / Update** | `sheet.appendRow` / `range.setValues` | `Sheets.Spreadsheets.Values.append/update` | **SpreadsheetApp with LockService**: Retains existing transactional OCC lock semantics while using API v4 for batch operations. |
| **File Metadata & ACL Audit** | `file.getAccess()` (Incomplete) | `Drive.Files.get` & `Drive.Permissions.list` | **Advanced Drive API v3**: Required to reliably inspect permissions, detect public links, and inspect MD5 checksums. |
| **Folder Organization** | `rootFolder.createFolder()` | `Drive.Files.create` | **Advanced Drive API v3**: Allows explicit folder creation with metadata without relying on local DriveApp caching. |

---

## Section E: Audit Findings Summary Matrix

| ID | Domain | Finding Title | Severity | Status |
| :--- | :--- | :--- | :--- | :--- |
| **A.1** | Auth | In-Code Fallback Secret & Self-Configuring Properties | **CRITICAL** | Remediating in Phase 1 |
| **A.2** | Auth | Unauthenticated `doGet` Schema Inspection | **MEDIUM** | Remediating in Phase 1 |
| **A.3** | Auth | Destructive Action (`clear`) Without Multi-Factor Guard | **HIGH** | Remediating in Phase 1 & 4 |
| **A.4** | Auth | Secret Query String Parameter Fallback | **HIGH** | Remediating in Phase 1 |
| **B.1** | Sheets | Fragile Dynamic Tab & Header Scanning | **MEDIUM** | Remediating in Phase 2 |
| **B.2** | Sheets | Row Index As Public Identity Risk | **HIGH** | Remediating in Phase 2 |
| **B.3** | Sheets | Unredacted PII in Supervisor Read Model | **HIGH** | Remediating in Phase 2 |
| **C.1** | Drive | Child Name & PII in Folder Names | **CRITICAL** | Remediating in Phase 3 |
| **C.2** | Drive | Premature Asset Deletion / Orphaned Files | **MEDIUM** | Remediating in Phase 3 |
| **C.3** | Drive | Risk of Public Drive Permissions (`anyoneWithLink`) | **CRITICAL** | Remediating in Phase 3 |
| **D.1** | Services| Missing Advanced Services Declaration in `appsscript.json` | **BLOCKER** | Remediating in Phase 2 |
