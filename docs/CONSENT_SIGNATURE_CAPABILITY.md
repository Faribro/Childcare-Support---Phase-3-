# Consent and Caregiver Signature Capability Specification

**Programme**: India HIV/AIDS Alliance — Paediatric Childcare Support (Phase 3)  
**Governance Status**: Confirmed Decision with Caretaker Signature Policy Override  
**Date Ratified**: 2026-09-08  
**Target Forms**: Next.js PWA Intake Wizard & KoboToolbox `CHILD_HIV_SUPPORT_FORM`

---

## 1. Executive Summary & Policy Statement

In accordance with the India HIV/AIDS Alliance Child Safeguarding Policy and National Paediatric Care Guidelines, the **sole authorised signatory** for beneficiary intake, anthropometric screening, and Direct Benefit Transfer (DBT) support under Phase 3 is the **CAREGIVER**.

No field worker, volunteer, healthcare facility staff, or unaccompanied minor may sign the consent instrument. Arbitrary signatory role selectors are strictly prohibited in the production user interface.

---

## 2. Locked Caregiver Signature Rules

1. **Explicit Signatory Identity**:
   ```typescript
   export type SignatureStatus =
     | 'NOT_REQUIRED'
     | 'PENDING'
     | 'CAPTURED_LOCAL'
     | 'QUEUED_FOR_UPLOAD'
     | 'UPLOADED'
     | 'FAILED'
     | 'NEEDS_REVIEW';

   export interface CaregiverConsent {
     consentProvided: boolean;
     consentVersion: string; // e.g. "v1.0-2026"
     caregiverName: string;
     caregiverRelationship: string;
     consentCapturedAt: string;
     signatureRequired: boolean;
     signatureStatus: SignatureStatus;
     signatureAssetId?: string; // Restricted media asset reference / UUID
   }
   ```

2. **Fixed Label & Mandatory Instruction**:
   - Heading: `Caregiver signature`
   - Subtitle / Instruction: `"Please ask the caregiver to sign in the box below to confirm consent."`
   - Signatory Name: Populated from the approved caregiver field (read-only in signature box unless edited in demographics).
   - Signatory Relationship: Parent, grandparent, legal guardian, or other approved relation.

3. **Gating & Conditional Enforcement**:
   - **Consent = "Yes"**:
     - Caregiver name and relationship must be non-empty.
     - Signature canvas is displayed and required.
     - The user **cannot** proceed to subsequent steps (Nutrition, Education, Financials) until a non-empty signature is drawn and saved.
     - Saved signature is persisted locally as a binary PNG Blob in IndexedDB (`signatureAttachments` store).
   - **Consent = "No"**:
     - Signature canvas is hidden and any previously captured signature is purged immediately.
     - Banner displayed: `"⚠ CONSENT NOT GIVEN — THIS FORM CANNOT BE SUBMITTED."`
     - Form blocks progression to clinical or financial sections.
     - Only minimal refusal audit metadata may be logged; no child clinical data is recorded.

4. **Media Separation & Anti-Bloat Architecture (Crucial Privacy Rule)**:
   - Drawn signature images are **NEVER** stored as Base64 strings inside the main assessment JSON payload, Google Sheets cells, HTTP GET query strings, server access logs, or analytics trackers.
   - Signatures are stored locally as `Blob` objects in IndexedDB.
   - Upon synchronisation, the binary Blob is uploaded via a dedicated media endpoint (`/api/signatures/upload` or multipart handler) which yields a cryptographically generated `signatureAssetId`.
   - Google Sheets and downstream linelists store **ONLY** controlled metadata:
     - `consent_version`
     - `consent_captured_at`
     - `signature_status`
     - `signature_asset_id`
   - Storage destination and long-term retention policy for binary signature assets remain subject to programme IT security approval.

5. **Receipt Data Minimisation**:
   - Public/Field receipts must **never** render the raw signature image.
   - Receipts display only: `"Caregiver consent evidence captured"` with local or server confirmation status and timestamp.

---

## 3. Workflow Step Placement

To prevent collection of sensitive clinical, nutritional, or financial data before consent is formally secured, the wizard follows this sequential gating order:

| Step | Title | Contents & Gating Rules |
|:---|:---|:---|
| **Step 1** | Child & Caregiver Identification | Beneficiary demographics, caregiver name, relationship, contact number, district, state, auto-generated Reference ID. |
| **Step 2** | Consent & Caregiver Signature | Approved consent statement (v1.0-2026), Yes/No decision, Caregiver signature canvas, IndexedDB Blob persistence. **Mandatory Gate**: Progression blocked if consent = No or signature missing. |
| **Step 3** | Nutrition Assessment | Standing height, body weight, calculated BMI, MUAC, bilateral pitting oedema check, WHO growth classification. |
| **Step 4** | Nutrition Support | Daily eating habits, appetite assessment, meals per day. |
| **Step 5** | Education Profile & Support | School enrollment, grade, attendance, current annual costs, required educational support. |
| **Step 6** | Review & Submit | Comprehensive verification, declaration checkbox, submitter identity, outbox queueing. |

---

## 4. Concurrency, Offline Persistence & Resilience

- **Local Autosave**: If the device loses power or the browser refreshes, the signature Blob in IndexedDB is linked via `clientSubmissionId` and reloaded into the canvas/preview state.
- **Offline Outbox**: When an assessment is queued offline, `signatureStatus` is set to `CAPTURED_LOCAL`. During synchronization, the signature is uploaded and transitioned to `UPLOADED`.
- **Deduplication**: Repeated synchronization attempts will not duplicate signature assets because operations are keyed by idempotent `clientSubmissionId`.
- **Optimistic Concurrency Control (OCC)**: Any remote record edits via `PATCH` preserve the original `signatureAssetId` unless a re-consent event is explicitly audited.

---

## 5. Audit & Compliance Checklist

- [x] Signatory identity locked to caregiver.
- [x] No role switcher UI exposed.
- [x] Binary Blob stored in separate IndexedDB table; zero Base64 in core JSON/Sheet cells.
- [x] Receipts exclude signature image.
- [x] Refusal ("No") terminates intake immediately.
