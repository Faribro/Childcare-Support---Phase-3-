# Audit Evidence: Complete Route Inventory & Structural Analysis

**Audit Baseline**: Commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Date**: September 9, 2026  

---

## 1. Page Routes Inventory

| Route Path | Type | Client / Server Component | Auth / Protection | Offline Usability | Primary Purpose & Observed State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Page | Client (`"use client"`) | Public (Unauthenticated) | Cached in SW | **Public Landing Page & Field Manual**: Download-first design. Explains PWA install and 10 field steps. Includes "Download Field App" PWA prompt. |
| `/assessment/new` | Page | Client (`"use client"`) | Public (No session gate) | Full (Dexie.js IDB) | **New Beneficiary Intake**: 8-step wizard with autosave to IndexedDB (`draftRepository`). Validates child demographic, clinical, DBT, and caregiver consent. |
| `/assessment/drafts` | Page | Client (`"use client"`) | Public (No session gate) | Full (Dexie.js IDB) | **Local Drafts Manager**: Lists un-finalized and finalized drafts stored on the local device. Links to `/assessment/draft/[draftId]`. |
| `/assessment/draft/[draftId]` | Page | Client (`"use client"`) | Public (No session gate) | Full (Dexie.js IDB) | **Resume Incomplete Draft**: Re-hydrates draft from Dexie by UUID. Allows continuing multi-step intake. |
| `/assessment/draft/[draftId]/review` | Page | Client (`"use client"`) | Public (No session gate) | Full (Dexie.js IDB) | **Review & Sign-off**: Read-only summary before submission. Captures caregiver canvas signature and enqueues to `syncQueueRepository`. |
| `/assessment/record/[submissionId]` | Page | Client (`"use client"`) | Public (No session gate) | Partial (Only if cached) | **Submitted Assessment Receipt**: Shows submission metadata, timestamp, child name, revision number. Has "Amend / Update Record" CTA. |
| `/assessment/record/[submissionId]/edit` | Page | Client (`"use client"`) | Public (No session gate) | Partial (Fails on sync!) | **Record Amendment / File Replacement**: Optimistic Concurrency Control (OCC) edit form. Allows updating fields or re-uploading documents. |
| `/assessment/sync` | Page | Client (`"use client"`) | Public (No session gate) | Full (Local Queue) | **Sync Center**: Displays pending, failed, and synchronized queue items. Triggers batch or single synchronization. |
| `/supervisor` | Page | Client (`"use client"`) | Public (No session gate) | Network-dependent | **Supervisor Monitoring Dashboard**: Malnutrition analytics, MAM/SAM prevalence, cohort status, linelist view with modal inspection. |
| `/_not-found` | Page | Client (`"use client"`) | Public | Cached in SW | **404 Handling**: Standard fallback for unmatched routes. |

---

## 2. API Routes Inventory

| API Path | Methods | Target Backend | Auth / Guard | Body Payload / Parameters |
| :--- | :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | Node.js Runtime | None | Returns JSON `{ status: 'ok', service, version, uptimeSeconds }` |
| `/api/reference-data` | `GET` | Hardcoded JSON | None | Returns state/district and ART clinic dropdown reference dictionaries |
| `/api/submissions` | `GET`, `POST` | `MockSheetStore` or GAS | Secret Header / Query | `GET`: lists records. `POST`: creates new assessment with RFC 4122 UUID idempotency check. |
| `/api/submissions/[submissionId]` | `GET`, `PUT` | `MockSheetStore` or GAS | Secret Header / Query | `GET`: fetches single record. `PUT`: updates record with OCC `expectedVersion`. |
| `/api/submissions/[submissionId]/history` | `GET` | GAS or MockStore | Secret Header / Query | Fetches audit trail / historical revisions for the given submission ID. |
| `/api/sync` | `POST` | `MockSheetStore` ONLY | None | Accepts batch `{ items: [...] }`. **Defect**: Does not integrate with Apps Script backend. |

---

## 3. Route Mismatches & Link Path Analysis

1. **Dead Sync Route Call**:
   - The server implements a batch endpoint at `/api/sync/route.ts`.
   - However, the client (`src/app/assessment/sync/page.tsx:117`) never calls `/api/sync`. It loops over items and calls `POST /api/submissions` individually.
   - `/api/sync` is an orphaned endpoint that only writes to ephemeral memory.

2. **Landing Page Download vs Launch**:
   - In earlier iterations, a "Launch Web App" link existed on the landing page.
   - On commit `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`, the landing page strictly gates navigation via the PWA install workflow ("Download Field App" button opens PWA install prompt / modal instructions). Direct web app links are excluded from the main hero CTA, fulfilling the user's download-first requirement.
   - However, direct deep linking to `/assessment/new`, `/assessment/drafts`, `/assessment/sync`, or `/supervisor` is completely unrestricted by the server, allowing unauthenticated browser access.

3. **Inconsistent Query vs Header Secret Forwarding**:
   - In `src/app/api/submissions/route.ts` line 26:
     ```ts
     gasUrl.searchParams.set('secret', webhookSecret);
     ```
   - In `src/app/api/submissions/[submissionId]/route.ts` line 28:
     ```ts
     gasUrl.searchParams.set('secret', webhookSecret);
     ```
   - Query string passing of secrets leaks shared credentials into HTTP access logs, proxy servers, and browser referrer headers.
