# Google Drive Opaque Folder & Document Slot Migration Plan

## 1. Executive Summary & Regulatory Context

Under the Digital Personal Data Protection (DPDP) Act, UN Convention on the Rights of the Child (UNCRC), and national child protection protocols, personally identifiable information (PII) including child names, caregiver identities, and medical registration identifiers must not be exposed in file directory metadata or shared folder indexes.

### Legacy State vs Target State

| Dimension | Legacy Implementation | Rectified Target Architecture |
| :--- | :--- | :--- |
| **Folder Path** | `Alliance India Child PDFs/<ChildName> - <UniqueID>/` | `Alliance India Child PDFs/assessments/{assetContainerId}/current/` |
| **Container Identifier** | Vulnerable children's full names or beneficiary IDs | Random UUID with `ast-` prefix (`ast-***`, e.g. `ast-e2e-001`), zero PII |
| **Mapping Registry** | Direct naming in Drive | Internal `_Asset_Containers` registry sheet mapping `remoteSubmissionId` to `assetContainerId` |
| **Folder Lifecycle** | Single unstructured folder | 4 dedicated subfolders: `current/`, `revisions/`, `quarantine/`, `metadata/` |
| **File Naming** | `Signature_20260625_143022.png`, `Passbook_....jpg` | Standardized slot filenames: `caregiver-signature.png`, `passbook.jpg`, etc. |
| **File Permissions** | Variable inherited permissions | Private institutional access only (zero public link sharing) |

---

## 2. Phased Migration Strategy

### Phase 1: Dual-Read Compatibility (ACTIVE)
- All new assessment creations (`action: "create"`) and updates (`action: "update"`) acquire or generate an opaque random UUID `assetContainerId` (`ast-***`) via the internal `_Asset_Containers` registry sheet.
- The asset container folder is located under `Alliance India Child PDFs/assessments/{assetContainerId}/` containing 4 subfolders:
  - `current/`: Holds active, verified documents mapped to sheet formulas.
  - `revisions/`: Holds superseded historical document revisions (never deleted inline).
  - `quarantine/`: Holds unverified, zero-byte, or rollback artifacts.
  - `metadata/`: Holds container configuration and non-PII lifecycle audit files.
- File slots use non-PII standard filenames (`caregiver-signature.png`, `passbook.jpg`, `identity-document.jpg`, `child-photo.jpg`, `school-fee-receipt.pdf`, `marksheet.pdf`).
- Existing sheet rows referencing legacy URLs continue to function seamlessly because Google Drive file links (`https://drive.google.com/file/d/{fileId}/view`) resolve by immutable file ID, not folder path.

### Phase 2: Administrative Preview (ACTIVE)
- Administrators open the sheet and select **Childcare Phase 3 Admin → Preview: Legacy Folder Migration**.
- The script inventories all folders under `Alliance India Child PDFs` that match the pattern `<ChildName> - <UniqueID>` and reports the count and folder IDs without moving or modifying files.

### Phase 3: Staged Copy & Relocation
For each identified legacy folder:
1. Parse `{remoteSubmissionId}` from folder name suffix or sheet row lookup.
2. Query or create opaque UUID `assetContainerId` in `_Asset_Containers` registry sheet.
3. Locate or create destination folder: `assessments/{assetContainerId}/current/`.
4. For each file in the legacy folder:
   - Identify slot type from file prefix or MIME type.
   - Verify destination does not already contain a newer file for that slot.
   - Move or copy file into `current/` and rename to standard slot filename.
   - Inspect newly positioned file (`sizeBytes > 0`).

### Phase 4: Sheet Formula Reconciliation
- If file IDs change (in case of copy rather than move), the migration script updates the corresponding document cells (columns 6, 25, 26, 27, 64, 65) with `=HYPERLINK("new_url", "Restricted Doc")`.
- If files were moved within Drive, existing file IDs remain identical and sheet formulas require zero modification.

### Phase 5: Verification & Decommissioning
- Run **Childcare Phase 3 Admin → Audit: Drive Asset Security & ACLs** to ensure 100% compliance.
- Confirm zero broken links across all active data rows.
- Move empty legacy folders to Trash.

---

## 3. Rollback & Failsafe Plan

1. **Non-Destructive Execution**: No legacy folder or file is deleted or trashed during Phase 3. Files are moved or copied with audit logging.
2. **Spreadsheet Version History**: A named version of the Google Sheet (`Pre-Opaque-Migration-YYYYMMDD`) is created in Google Sheets Version History prior to running any batch formula rewrites.
3. **Audit Trail**: Every file relocation is recorded in `Audit_Log` sheet with timestamp, old folder name, new path, file ID, and operator ID.
