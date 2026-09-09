# Route & Journey Test Matrix
## Childcare Support — Phase 3 PWA

**Audit Baseline**: Commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Date**: September 9, 2026  

---

## 1. Page Route Matrix

| Route | Primary Workflow | Access Expectation | Offline Behaviour | Test Status | Known Regressions & Defects | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Landing page, field operations manual, and PWA download | Public | Cached by Serwist service worker shell | Static build pass; manual browser pass | 11 uncompressed PNGs (1.07 MB) burden 3G networks. | Medium |
| `/assessment/new` | New beneficiary intake (8-step form wizard) | Field Health Worker | Full offline support with 400ms debounced autosave | Unit & integration tests pass | Stale `useEffect` dependency warning in `new/page.tsx:203`. | High |
| `/assessment/drafts` | Linelist of saved local drafts | Field Health Worker | Full offline support (Dexie.js `draftRepository`) | Unit tests pass | None observed in local tests. | Medium |
| `/assessment/draft/[draftId]` | Resume incomplete draft by UUID | Field Health Worker | Full offline support (Dexie.js `draftRepository`) | Integration tests pass | Form step state rehydration depends on route query params. | High |
| `/assessment/draft/[draftId]/review` | Form verification & caregiver consent signature | Field Health Worker + Caregiver | Full offline support; signature stored in IDB | Integration tests pass | Signature canvas Base64 data URL inflates payload size. | High |
| `/assessment/record/[submissionId]` | Read-only receipt for submitted assessment | Field Worker / Supervisor | Available offline if previously viewed/cached | Integration tests pass | Deep link with invalid ID shows generic error without back button. | Medium |
| `/assessment/record/[submissionId]/edit` | Optimistic Concurrency Control (OCC) edit & file replacement | Field Worker / Supervisor | **FAILED ON SYNC** | **Critical Defect** | **BLOCKER**: Offline edits enqueued as `UPDATE` are sent to `POST /api/submissions`, which drops all edits. | **Blocker** |
| `/assessment/sync` | Synchronization queue manager and offline sync center | Field Health Worker | Full offline queue display (`syncQueueRepository`) | Integration tests pass | Calls `POST` for `UPDATE` operations; marks items synced even when server drops them. | **Blocker** |
| `/supervisor` | Malnutrition cohort analytics & linelist view | Supervisor / Programme Manager | Network-dependent; fallback message when offline | Unit & integration tests pass | Unprotected route; lacks authentication/role checks; heavy D3 bundle (165 kB). | High |
| `/_not-found` | 404 handler for invalid routes | Public | Cached shell | Build pass | Standard Next.js 404 page. | Low |

---

## 2. API Route Matrix

| Endpoint | Method | Expected Purpose | Auth / Guard Mechanism | Backend Destination | Current Audit Status | Security / Integrity Risks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | Service uptime and health monitoring probe | Public | Node.js Runtime | **Passed (200 OK)** | None. Safe lightweight probe. |
| `/api/reference-data` | `GET` | States, districts, and ART clinic dictionaries | Public | Hardcoded JSON | **Passed (200 OK)** | Static dictionary; no dynamic lookup. |
| `/api/submissions` | `GET` | Retrieve list of submitted assessments | Webhook Secret | `MockSheetStore` or GAS | **Passed** | Lacks pagination; returns all records. |
| `/api/submissions` | `POST` | Idempotent creation of new assessment | Webhook Secret | `MockSheetStore` or GAS | **Passed with Risk** | Webhook secret passed via URL query parameter. Consent marked optional in schema. |
| `/api/submissions/[submissionId]` | `GET` | Retrieve single assessment record by ID | Webhook Secret | `MockSheetStore` or GAS | **Passed** | Returns full record including Base64 signature. |
| `/api/submissions/[submissionId]` | `PUT` | OCC update / amendment of existing record | Webhook Secret | `MockSheetStore` or GAS | **Passed (Direct)** | Secret passed via query parameter. Sync center fails to call this route! |
| `/api/submissions/[submissionId]/history` | `GET` | Retrieve version history / revision audit log | Webhook Secret | `MockSheetStore` or GAS | **Passed** | Returns historical changes array. |
| `/api/sync` | `POST` | Batch synchronization endpoint for queue items | None | `MockSheetStore` ONLY | **Defect** | Completely disconnected from Google Apps Script. |

---

## 3. End-to-End User Journey Analysis

### Journey 1: Field Worker New Intake (Online & Offline)
1. **Landing & Launch**:
   - Field worker opens `/`. Hero displays "Download Field App". PWA manifest prompts installation.
   - Once installed, worker accesses `/assessment/new`.
2. **Data Entry & Autosave**:
   - Worker enters demographic, nutritional anthropometry (height, weight, MUAC, oedema), and DBT details.
   - Autosave saves to Dexie after 400ms debounce.
   - If app is closed, battery dies, or browser refreshes, draft is recovered at `/assessment/draft/[draftId]`.
3. **Caregiver Consent**:
   - Worker navigates to review screen (`/assessment/draft/[draftId]/review`).
   - Caregiver reads consent statement and signs on touch canvas (`CaregiverSignaturePad`).
4. **Queueing & Sync**:
   - Worker taps "Submit Assessment".
   - If online: sends `POST /api/submissions`. Receives `remoteSubmissionId` and moves to `/assessment/record/[id]`.
   - If offline: enqueues to `syncQueueRepository` with `syncStatus: 'pending'`.
   - Once network is restored, worker opens `/assessment/sync` and taps "Sync All". Item sends `POST` and marks synced.
- **Journey Status**: **PASS** (Core new intake functions reliably).

---

### Journey 2: Field Worker Offline Record Amendment & Document Replacement
1. **Open Record**:
   - Field worker opens `/assessment/record/[id]` and taps "Amend / Update Record", navigating to `/assessment/record/[id]/edit`.
2. **Field Modification**:
   - Worker replaces blurry bank passbook photo and updates child weight.
3. **Offline Enqueue**:
   - Worker is offline in the field. Taps "Save & Queue Update".
   - Item is correctly saved in Dexie queue with `operationType: 'UPDATE'`.
4. **Synchronization Flaw**:
   - Worker reconnects and opens `/assessment/sync`.
   - Worker taps "Sync All".
   - `handleSyncAll` sends `POST /api/submissions` instead of `PUT /api/submissions/[id]`.
   - Backend recognizes duplicate ID and returns `{ status: 'success', isDuplicate: true }` without updating any fields.
   - Client marks item `synced`.
- **Journey Status**: **FAILED (BLOCKER)** — All amended data is permanently lost.

---

### Journey 3: Supervisor Linelist & Malnutrition Triage
1. **Access Dashboard**:
   - Supervisor opens `/supervisor`.
2. **Analytics & D3 Visualizations**:
   - MAM/SAM malnutrition distribution, age breakdown, and DBT verification charts render.
3. **Record Inspection**:
   - Supervisor clicks a record in the linelist table.
   - `SubmissionViewModal` opens, displaying child details, document links, and caregiver signature.
- **Journey Status**: **PASS with Security Risk** (Route lacks authentication and authorization checks).
