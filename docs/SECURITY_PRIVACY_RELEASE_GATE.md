# Security & Privacy Release Gate
## Childcare Support — Phase 3 PWA

**Audit Baseline**: Commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Date**: September 9, 2026  
**Auditor Roles**: Security Reviewer & Privacy Lead  

---

## 1. Non-Negotiable Release Controls

To ensure that confidential medical records, child photographs, bank details, and caregiver consent signatures are protected in compliance with public-health data governance, the following gates are **mandatory preconditions** for production deployment.

```
+-----------------------------------------------------------------------------------+
|                        SECURITY & PRIVACY RELEASE GATES                           |
+-----------------------------------------------------------------------------------+
| Gate 1: Storage Privacy (Zero public Drive links; restricted ACLs)               |
| Gate 2: Auth Verification (Fail-closed secret validation on GET & POST)          |
| Gate 3: Credential Hygiene (Zero secrets in URLs or client bundles)               |
| Gate 4: Consent Gating (Mandatory caregiver signature & consent in API schema)    |
| Gate 5: Location Minimization (Coarse geocoding; no unconsented high-res tracking)|
| Gate 6: Document Audit Trail (Traceable trashing & revision logs on replacement)  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Required Secret & Configuration Verification

### Secret Storage Architecture
- **Server Environment Only**:
  - `APPS_SCRIPT_URL`: Stored exclusively in Render environment variables or encrypted server secrets. Never exposed via `NEXT_PUBLIC_*` or committed in source control.
  - `WEBHOOK_SECRET`: High-entropy shared secret configured in Render and in Google Apps Script Script Properties (`PropertiesService.getScriptProperties()`).
- **Remediation for Current Leak**:
  - `.env.example` currently contains real-looking script IDs and Apps Script URL patterns. Clean `.env.example` to use placeholder tokens only (`https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec`).
  - Update `src/app/api/submissions/route.ts` and `src/app/api/submissions/[submissionId]/route.ts` to pass the webhook secret via HTTP Authorization Header (`Authorization: Bearer <secret>`) or encrypted POST payload—**never in URL search parameters**.

---

## 3. Privacy Blockers & Beneficiary Protection

### Google Drive Access Control (BLOCKER)
- **Defect Identified**: `gas/Code.js` lines 383 and 498 explicitly grant `DriveApp.Access.ANYONE_WITH_LINK` with `DriveApp.Permission.VIEW`.
- **Mandatory Production Remedy**:
  1. Remove `setSharing(DriveApp.Access.ANYONE_WITH_LINK, ...)` from all folder and file creation functions in Apps Script.
  2. Maintain default private Drive inheritance (only accessible to the Google Workspace domain account owning the Sheet).
  3. Previews for supervisors must be served via authenticated backend proxy or Google Workspace single-sign-on (SSO).

### Aadhaar Masking & PII Redaction
- Verify Aadhaar numbers are strictly stored and displayed as `XXXX-XXXX-1234`.
- Beneficiary names must not appear in plaintext in browser URLs, route query strings, or unencrypted localStorage.
- Local drafts stored in Dexie.js (IndexedDB) reside in the origin's sandbox. The application must provide a "Clear Local Storage" option for shared field devices.

---

## 4. Asset & Screenshot Privacy Review

### Guide & Marketing Asset Audit
- Inspect all static screenshots in `public/images/guide/`:
  - `step-consent.png`: Verifies synthetic sample data ("Priya Sharma", "Asha Worker Demo"). Zero real caregiver names or signatures exist.
  - `step-clinical.png`: Verifies synthetic anthropometric values.
  - `step-documents.png`: Verifies placeholder document cards.
  - `step-submitted.png`: Verifies synthetic unique ID format (`KHM-2026-XXXX`).
- **Audit Verdict**: All static guide screenshots use synthetic fixture data. No real beneficiary PII is exposed.

---

## 5. Caregiver Consent & Signature Integrity

### Consent Gating Requirements
1. **API Schema Enforcement**: `caregiverConsent` must be made strictly required in `src/lib/validations/submissionSchema.ts`. Submissions with missing consent or missing signature data must return HTTP 422 Unprocessable Entity.
2. **Signature Storage**:
   - Signature data URLs (`data:image/png;base64,...`) must be processed into compressed binary files upon ingestion.
   - Central Sheet records must reference the secured document identifier, not inline base64 data in sheet cells.

---

## 6. Location Controls & Geocoding

- **Permissions**: Location is requested only upon explicit field worker tap on "Capture Location".
- **Precision**: Coarse geocoding (village / block / district level) is captured for field verification. The app must not track continuous background location.
- **Offline Fallback**: If GPS acquisition fails or worker is indoors, manual confirmation of block/district dropdown is permitted with an audit flag (`locationCaptured: false`).

---

## 7. Logging & Telemetry Controls

- Zero child PII, medical diagnosis, or signature payloads may be emitted to `console.log` or client-side telemetry.
- In `gas/Code.js`, ensure `Logger.log()` entries redact sensitive beneficiary data before writing to the Apps Script execution log.

---

## 8. Signed-Off Release Gate Checklist

Before releasing `Childcare Support — Phase 3` to production, each designated authority must review and execute sign-off.

| Control Area | Requirement | Verification Command / Evidence | Status | Lead Sign-off |
| :--- | :--- | :--- | :--- | :--- |
| **Drive ACLs** | No files or folders have `ANYONE_WITH_LINK` access | Code inspection of `gas/Code.js` & Drive audit | **BLOCKED** | Security Lead |
| **Webhook Auth** | Fail-closed secret verification on all POST/GET mutations | Negative curl test returning 401 without secret | **BLOCKED** | Backend Lead |
| **Offline Edit Sync**| `UPDATE` operations execute `PUT` and update Sheet row | Synthetic integration test verifying OCC revision | **BLOCKED** | Offline Architect |
| **Secret Exposure** | Webhook secret removed from URL query parameters | Network trace of `/api/submissions` | **PENDING** | Security Lead |
| **Consent Gating** | API schema enforces mandatory consent & signature | Unit test verifying validation error on empty consent | **PENDING** | QA Lead |
| **TypeScript & Lint**| Zero compiler errors; zero blocking lint warnings | `npm run typecheck && npm run lint` | **PASSED** | Tech Lead |
| **Unit Test Suite** | 100% pass on Vitest test suite | `npm test` (36/36 passed) | **PASSED** | Tech Lead |
| **Guide Assets** | Zero real beneficiary data in screenshots | Visual inspection of `public/images/guide/` | **PASSED** | Privacy Lead |

### Formal Decision
- **Current Gate State**: **GATE CLOSED (NO-GO)**
- **Required Re-audit**: Perform validation after remediation of `FINDING-BLK-01`, `FINDING-BLK-02`, and `FINDING-BLK-03`.
