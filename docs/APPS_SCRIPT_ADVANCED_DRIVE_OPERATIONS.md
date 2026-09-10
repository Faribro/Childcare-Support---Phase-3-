# Google Drive API v3 Advanced Operations & Document Governance

## 1. Overview & Architectural Motivation

Managing sensitive child healthcare records, legal KYC identification, and bank passbooks requires enterprise-grade document lifecycle safety. Standard `DriveApp` does not expose granular permission objects, ACL lists, or atomic replacement verification.

By integrating the **Google Drive API v3 Advanced Service** (`Drive`), the backend provides:
1. **Granular Permission Inspection**: Querying permission lists to detect any `anyone` or `anyoneWithLink` public exposures.
2. **Deterministic ACL Remediation**: Deleting unauthorized public permissions directly via `Drive.Permissions.delete()`.
3. **Structured Asset Metadata**: Inspecting file sizes, MIME types, creation timestamps, and ownership without file content transfer.
4. **Resilient Fallback**: Graceful fallback to `DriveApp` if Drive API v3 Advanced Service is temporarily unavailable.

---

## 2. Opaque Folder Structure & Zero-PII Policy

Legacy implementations stored attachments in folders titled `<ChildName> - <UniqueID>`, directly exposing vulnerable children's names and ART numbers in institutional Drive directory listings.

### Rectified Opaque Hierarchy

```text
Alliance India Child PDFs/
└── assessments/
    └── {remoteSubmissionId}/
        ├── current/
        │   ├── caregiver-signature.png
        │   ├── passbook.jpg
        │   ├── identity-document.jpg
        │   ├── child-photo.jpg
        │   ├── school-fee-receipt.pdf
        │   └── marksheet.pdf
        └── metadata/
```

### Strict Naming Rules
- **No PII in Folder Names**: The directory is named strictly after `{remoteSubmissionId}` (e.g. `DL-SOU-101437-01`). Never include child name, caregiver name, or ART center ID.
- **Standardized Document Slots**: Filenames represent the document category slot, not the beneficiary:
  - `caregiver-signature.png`
  - `passbook.jpg`
  - `identity-document.jpg` (Aadhaar / Government ID)
  - `child-photo.jpg`
  - `school-fee-receipt.pdf`
  - `marksheet.pdf`

---

## 3. Drive Inspection & Audit Engine

### Asset Inspection: `inspectDriveAsset_(fileId)`
Inspects a file and returns an audit object:
```javascript
{
  id: "1abc...",
  name: "passbook.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 245100,
  createdTime: "2026-06-25T10:00:00Z",
  modifiedTime: "2026-06-25T10:05:00Z",
  webViewLink: "https://drive.google.com/file/d/1abc.../view",
  isPublic: false,
  isSlotCompliant: true,
  permissions: [
    { role: "owner", type: "user", emailAddress: "admin@allianceindia.org" }
  ],
  advancedServiceUsed: true
}
```

### Full Security Audit: `auditDriveAssets_()`
Iterates through all 6 document columns (Columns 6, 25, 26, 27, 64, 65) across all active data rows, extracting Drive file IDs. Evaluates:
- **Public Sharing Violations**: Counts files where `isPublic === true` (MUST BE 0).
- **Slot Naming Violations**: Flags legacy filenames containing PII or timestamped hashes.
- **Overall Compliance**: Flagged as `true` only when zero public violations and zero naming violations exist.

### ACL Remediation: `enforceRestrictedAcl_(fileId)`
Removes public sharing permissions (`type === 'anyone'`) using `Drive.Permissions.delete()`. Sets sharing strictly to `DriveApp.Access.PRIVATE` with `DriveApp.Permission.NONE`.

---

## 4. Atomic Asset Replacement & Safe Trashing

To prevent data loss during updates or document re-scans, `replaceAssetSafely_(options)` enforces a **verify-before-trash** contract:

```text
[Step 1] Decode and write replacement blob to assessments/{remoteSubmissionId}/current/{slot}.jpg
         |
[Step 2] VERIFICATION CHECK:
         Is newFileId valid? AND is fileSize > 0 bytes?
         |
         +--> [FAIL] Stop immediately. Retain old asset. Return error response.
         |
         +--> [PASS] Proceed to Step 3.
         |
[Step 3] Move old file ID to Trash (DriveApp.getFileById(oldId).setTrashed(true)).
         |
[Step 4] Update Google Sheet cell with formula: =HYPERLINK("https://drive.google.com/file/d/.../view", "Restricted Doc")
```
