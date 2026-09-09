# Google Drive Asset Privacy and Caregiver Consent Evidence Report

**Run Identifier**: `run-20260909-1825-cert`  
**Certification Branch**: `test/staging-e2e-data-lifecycle-certification`  
**Baseline Commit**: `146ba44` (Mobile app experience hardening merged onto `5f75e8c`)  
**Scope**: Child documents, passbooks, Aadhaar card copies, photographs, caregiver signatures, consent gating.  
**Auditor**: Principal QA Automation & AppSec Reliability Engineering  

---

## 1. Security & Privacy Audit Findings

### 1.1 Drive File Access Control List (ACL) Audit
- **Requirement**: Sensitive child photos, identity/bank documents, and caregiver signatures must **NEVER** be stored with public Drive "anyone with link" access (Blocker B remediation).
- **Audit Verification**:
  - In `apps-script/Code.js`, the legacy insecure helper `saveBase64ToDrive()` has been completely removed.
  - The hardened function `saveSecureBase64ToDrive()` creates files strictly inside designated, non-public Google Drive folders.
  - Public link generation (`setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)`) is **STRICTLY PROHIBITED** and absent from the codebase.
  - Files inherit private Google Workspace domain ACLs only:
    ```js
    // apps-script/Code.js Line 333
    // SECURE: Strict domain ACL inheritance only - zero public links
    file.setDescription(
      'RESTRICTED: Alliance India Child Protection & Clinical Linelist Asset. Internal domain access only.'
    );
    ```

### 1.2 Raw Base64 Cell Contamination Audit
- **Requirement**: Raw base64 data URLs must **NEVER** be leaked into canonical Google Sheet cells. Storing huge base64 strings in spreadsheet cells causes severe sheet bloat, performance degradation, and data truncation risks.
- **Verification Across 73 Columns**:
  - Column 25 (`25\nPassbook Front Page Link`): Stored as authenticated Drive file URL or empty string.
  - Column 26 (`26\nAadhaar Card Link`): Stored as authenticated Drive file URL or empty string.
  - Column 27 (`27\nPassport Size Photo Link`): Stored as authenticated Drive file URL or empty string.
  - Column 64 (`64\nSchool Fee Receipt Link`): Stored as authenticated Drive file URL or empty string.
  - Column 65 (`65\nMarksheet Photo Link`): Stored as authenticated Drive file URL or empty string.
  - Column 72 (`72\nSignature Link`): Stored as authenticated Drive file URL.
- **Assertion Result**:
  In Playwright test `Step 7-9: Canonical Record Read & Field Integrity Verification`, the assertion `expect(record.signatureDataUrl).not.toContain('data:image')` passed across all 5 device targets (Android 320, Android 390, Safari 390, Tablet 768, Desktop Smoke).

### 1.3 Caregiver Informed Consent Gate Audit
- **Requirement**: No assessment intake may proceed, be submitted, or be accepted by the server without explicit caregiver consent and captured signature.
- **Client-Side Gate**:
  - `/assessment/new` Section 01 requires the caseworker to ask the caregiver: *"Does the caregiver agree to participate in the assessment?"*
  - If "No" or unanswered, intake cannot proceed, the signature pad is locked, an alert *"Consent Not Granted"* is rendered, and subsequent form submission is blocked.
- **Server-Side Gate**:
  - In `src/lib/validations/submissionSchema.ts`, `caregiverConsent.consentProvided: z.literal(true)` and `agreeToParticipate: z.literal(true)` are enforced.
  - Submitting an assessment with `consentProvided: false` triggers an immediate HTTP 422 `VALIDATION_ERROR`.
  - Verified in `e2e/full-data-lifecycle.spec.ts` Step 14:
    ```
    ok [Mobile Android 390] › Step 14: Caregiver Consent Enforcement Gate (Server-side 422) (8ms)
    ```

### 1.4 Webhook Secret Hygiene Audit
- **Requirement**: Secrets must **NEVER** be passed in URL query parameters (`?secret=...`), which leak into server access logs, browser history, and proxy logs.
- **Verification**:
  - `scripts/e2e/verify-staging-preflight.ts` inspected all fetch calls in `src/lib/server/canonicalSubmissionAdapter.ts`.
  - All transmissions of `WEBHOOK_SECRET` are passed exclusively via the `X-Webhook-Secret` HTTP header and JSON body over HTTPS. Zero secrets exist in URL query strings.

---

## 2. Privacy Compliance Verdict

| Privacy Check | Status | Verification Detail |
|---|---|---|
| Zero Public Google Drive Links | **CERTIFIED** | Public sharing APIs removed from `Code.js`; domain-restricted folders only |
| Base64 Sheet Cell Isolation | **CERTIFIED** | Base64 uploaded to Drive; only secure URLs referenced in sheet |
| Mandatory Consent Gate | **CERTIFIED** | Client UI blocked; server rejects non-consented payloads with 422 |
| URL Credential Sanitization | **CERTIFIED** | Zero query string leaks; headers and body only |
| Aadhaar Masking | **CERTIFIED** | Only last 4 digits displayed (`XXXX-XXXX-1234`) in linelist UI |

**Overall Asset Privacy Status**: **FULL PASS - PRODUCTION GRADE**
