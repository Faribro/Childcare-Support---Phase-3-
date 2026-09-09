# Final Production-Readiness Audit Report
## Sensitive Offline-First Public-Service PWA: Childcare Support — Phase 3

**Target Repository**: `Faribro/Childcare-Support---Phase-3-`  
**Audit Baseline Commit**: `3e50a52e0fafe8566ac933aa00f9520feffe5c5a`  
**Audit Date**: September 9, 2026  
**Auditor Roles**: Principal Software Engineer, Security Reviewer, Accessibility Specialist, Performance Engineer, Mobile UX Lead, Design-Quality Reviewer  

---

## 1. Executive Summary & Production Decision

### **RELEASE DECISION: NO-GO (BLOCKED)**
The application demonstrates robust core frontend scaffolding, strict TypeScript compliance (0 compiler errors), clean Vitest unit tests (36/36 passed), and well-conceived Dexie.js offline draft mechanics. However, **it CANNOT be released to production or deployed with real child/caregiver data** due to three showstopper flaws:

1. **CRITICAL DATA LOSS ON OFFLINE EDITS**: The offline sync queue unconditionally dispatches all sync items—including edits and document replacements (`operationType: 'UPDATE'`)—to `POST /api/submissions`. The backend treats existing IDs as duplicates and responds with `isDuplicate: true`, dropping all edited data while the client marks the item as synced. Field workers are falsely told records updated when central data was never touched.
2. **HIGH-SEVERITY PRIVACY VIOLATION (PUBLIC DRIVE ACLs)**: The Google Apps Script adapter (`gas/Code.js` lines 383 & 498) explicitly sets Google Drive document folders and beneficiary attachments to `DriveApp.Access.ANYONE_WITH_LINK`. Confidential child photos, bank passbooks, Aadhaar card scans, and caregiver signatures are publicly accessible to anyone on the internet with the generated URL.
3. **BROKEN BATCH SYNC ENDPOINT & EPHEMERAL STORAGE**: The batch `/api/sync` route only writes to ephemeral Node.js server memory (`mockSheetStore`) and completely lacks a code path to forward records to Google Apps Script. On container restarts in Render, unforwarded data is completely lost.

A release gate checklist is provided in Section 7. Full remediation must be validated before production deployment.

---

## 2. Verified Architecture & Route Map

```
                                  +-----------------------------+
                                  |    Public Landing Page      |
                                  |            (/)              |
                                  |  Download-First PWA Install |
                                  +--------------+--------------+
                                                 |
                       +-------------------------+-------------------------+
                       |                                                   |
                       v                                                   v
        +-----------------------------+                     +-----------------------------+
        |     Field App Workspace     |                     |    Supervisor Monitoring    |
        |      (Assessment Flow)      |                     |         (/supervisor)       |
        +--------------+--------------+                     |  Malnutrition & Linelist    |
                       |                                    +-----------------------------+
        +--------------+-------------------+
        |                                  |
        v                                  v
+---------------+                  +---------------+
| New Record    |                  | Saved Drafts  |
| (/assessment/ |                  | (/assessment/ |
|  new)         |                  |  drafts)      |
+-------+-------+                  +-------+-------+
        |                                  |
        +----------------+-----------------+
                         |
                         v
        +----------------------------------+
        | Complete / Resume Draft Form     |
        | (/assessment/draft/[draftId])    |
        +----------------+-----------------+
                         |
                         v
        +----------------------------------+
        | Review, Verify & Caregiver Sign  |
        | (/assessment/draft/[draftId]/    |
        |  review)                         |
        +----------------+-----------------+
                         |
                         v
        +----------------------------------+
        | Offline Sync Queue & Center      |
        | (/assessment/sync)               |
        +----------------+-----------------+
                         |
                         v
        +----------------------------------+
        | Submitted Record Receipt & Edit  |
        | (/assessment/record/[id])        |
        | (/assessment/record/[id]/edit)   |
        +----------------------------------+
```

### Complete Route Inventory

| Route | Classification | Component Nature | Offline Support | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Public Landing Page | `"use client"` React Component | Cached in Serwist SW | Inspected in local production server |
| `/assessment/new` | Field Assessment Intake | `"use client"` React Component | Full Dexie IDB Autosave | Form step state & draft hydration verified |
| `/assessment/drafts` | Draft Linelist | `"use client"` React Component | Full Dexie IDB | Verified via IndexedDB persistence |
| `/assessment/draft/[draftId]` | Resume Draft | `"use client"` React Component | Full Dexie IDB | Hydration verified via UUID lookup |
| `/assessment/draft/[draftId]/review` | Review & Sign-off | `"use client"` React Component | Full Dexie IDB | Signature canvas & validation verified |
| `/assessment/record/[submissionId]` | Record Receipt | `"use client"` React Component | Partial (If previously viewed) | Read receipt verified |
| `/assessment/record/[submissionId]/edit` | Edit / File Replace | `"use client"` React Component | Broken on sync | **Defect verified: data loss on sync** |
| `/assessment/sync` | Sync Center | `"use client"` React Component | Full Dexie IDB | Sync queue state verified |
| `/supervisor` | Supervisor Analytics | `"use client"` React Component | Network Dependent | D3 charts & linelist verified |
| `/api/health` | Service Health Probe | Node.js Route Handler | N/A | Verified: Returns status 200 OK |
| `/api/reference-data` | Master Clinic Codes | Node.js Route Handler | Cached in SW | Static clinic dictionary verified |
| `/api/submissions` | Linelist CRUD | Node.js Route Handler | N/A | Idempotent POST verified; query secret leak verified |
| `/api/submissions/[submissionId]`| Linelist OCC Edit | Node.js Route Handler | N/A | OCC PUT verified; query secret leak verified |
| `/api/sync` | Batch Sync | Node.js Route Handler | N/A | **Defect verified: only writes to MockStore** |

---

## 3. Detailed Audit Findings by Severity

### A. BLOCKER Findings (Must Fix to Prevent System/Data Failure)

#### [FINDING-BLK-01] Silent Discarding of Offline Edits During Sync
- **Domain**: Data Integrity / Offline Lifecycle
- **Evidence**:
  - `src/app/assessment/record/[submissionId]/edit/page.tsx:791` enqueues items with `operationType: 'UPDATE'`.
  - `src/app/assessment/sync/page.tsx:117` loops through all queue items and unconditionally sends `POST /api/submissions`.
  - `src/app/api/submissions/route.ts:50` and `gas/Code.js:712` check for duplicate IDs and return `{ status: 'success', isDuplicate: true }` without mutating rows.
  - The client treats `res.ok` as success and calls `syncQueueRepository.markSynced()`.
- **User / Data Impact**: A health worker editing an incorrect beneficiary date of birth, nutritional classification, or replacing an illegible Aadhaar document offline is informed that sync succeeded. In reality, **all edits are silently dropped on the server**.
- **Reproduction**:
  1. Open a submitted record in `/assessment/record/[submissionId]/edit`.
  2. Disconnect network or select offline simulation.
  3. Change child weight or replace document, then tap "Save & Queue Update".
  4. Navigate to `/assessment/sync` and reconnect.
  5. Tap "Sync All". Notice sync marks green.
  6. Inspect Google Sheet or database: the record has the original values and revision number is unchanged.
- **Affected Files**: `src/app/assessment/sync/page.tsx`, `src/app/assessment/record/[submissionId]/edit/page.tsx`, `src/app/api/sync/route.ts`.
- **Remediation**:
  1. In `handleSyncAll`, inspect `item.operationType`.
  2. If `operationType === 'UPDATE'`, send `PUT /api/submissions/${item.uniqueId}` with OCC headers (`If-Match` or `expectedVersion`).
  3. Ensure failure on version mismatch surfaces a conflict modal rather than marking synced.
- **Complexity**: Medium | **Required Tests**: Vitest integration test simulating `operationType === 'UPDATE'` sync dispatch; Playwright offline edit journey.

#### [FINDING-BLK-02] Public World-Readable ACLs on Sensitive Beneficiary Files & Signatures
- **Domain**: Security, Privacy & Compliance (DPDP / HIPAA / Public Health Ethics)
- **Evidence**:
  - `gas/Code.js:383`: `root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);`
  - `gas/Code.js:498`: `newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);`
- **User / Data Impact**: Child beneficiary photos, bank passbook scans, Aadhaar identification cards, and caregiver consent signatures are made accessible to anyone with the generated link on the public internet without authentication.
- **Reproduction**:
  1. Submit a record with an uploaded document or caregiver signature through `gas/Code.js`.
  2. Take the resulting Drive file URL and open it in an incognito browser without logging into Google.
  3. The sensitive identity and medical intake document is visible and downloadable.
- **Affected Files**: `gas/Code.js`.
- **Remediation**:
  1. Remove `setSharing(DriveApp.Access.ANYONE_WITH_LINK, ...)` entirely.
  2. Restrict document folders to domain-authenticated service accounts or designated institutional supervisor accounts.
  3. Serve document previews through an authenticated proxy endpoint with short-lived signed URLs.
- **Complexity**: Low-Medium | **Required Tests**: Unit test on Apps Script ACL assignment; integration test verifying unauthenticated link returns 403 Forbidden.

#### [FINDING-BLK-03] Batch `/api/sync` Route Orphaned and Bypasses Google Sheets Backend
- **Domain**: Architecture / Backend Integration
- **Evidence**:
  - `src/app/api/sync/route.ts:62` and `87` directly write to in-memory `mockSheetStore`.
  - There is zero logic to evaluate `process.env.APPS_SCRIPT_URL` or forward batch operations to Google Sheets.
- **User / Data Impact**: If client code is updated to use the batch sync endpoint, submissions bypass Google Sheets entirely and exist only in ephemeral server memory.
- **Affected Files**: `src/app/api/sync/route.ts`.
- **Remediation**: Implement Apps Script forwarding for batch sync or remove the endpoint and standardize all sync calls on `/api/submissions`.
- **Complexity**: Low | **Required Tests**: API integration test validating batch proxy to Apps Script.

---

### B. HIGH Findings (Major Operational / Security / Architectural Risks)

#### [FINDING-HGH-01] Shared Webhook Secret Exposed in URL Query Parameters
- **Domain**: Security / Credentials Handling
- **Evidence**:
  - `src/app/api/submissions/route.ts:26`: `gasUrl.searchParams.set('secret', webhookSecret);`
  - `src/app/api/submissions/[submissionId]/route.ts:28`: `gasUrl.searchParams.set('secret', webhookSecret);`
- **Impact**: Webhook secret credentials appear in plain text in upstream proxy logs, server access logs, and browser network traces.
- **Remediation**: Move the secret into HTTP headers (`Authorization: Bearer <secret>` or `X-Webhook-Secret`) and update `gas/Code.js` `doPost` to read headers from request metadata, or pass within the encrypted POST body.

#### [FINDING-HGH-02] Apps Script Webhook Secret Verification Bypass and Unprotected `doGet`
- **Domain**: Security / Access Control
- **Evidence**:
  - `gas/Code.js:226-232`: If `WEBHOOK_SECRET` is unset in Script Properties, `if (configuredSecret && payload.secret !== configuredSecret)` evaluates to `false`, granting unauthenticated write access.
  - `gas/Code.js:191-218`: `doGet` (read records) contains zero authentication or secret verification.
- **Impact**: Any external user discovering the Google Apps Script deployment URL can read the entire linelist or execute unauthorized submissions if script properties are uninitialized.
- **Remediation**: Fail closed if `configuredSecret` is missing (`if (!configuredSecret || ...)`). Require secret verification on `doGet`.

#### [FINDING-HGH-03] Caregiver Consent & Signature Marked Optional in Backend Schema
- **Domain**: Compliance / Consent Gating
- **Evidence**:
  - `src/lib/validations/submissionSchema.ts:332`: `caregiverConsent: z.object({...}).optional()`
- **Impact**: Direct API clients or tampered form requests can submit pediatric clinical and demographic records without caregiver consent or legal signature.
- **Remediation**: Remove `.optional()` from `caregiverConsent` in `submissionSchema.ts`. Require `consentGiven: true`, `caregiverName: min(2)`, and non-empty `signatureDataUrl`.

#### [FINDING-HGH-04] Base64 Signature & Document Payload Bloat
- **Domain**: Performance & Reliability
- **Evidence**:
  - `CaregiverSignaturePad.tsx` generates raw base64 data URLs (~40KB-80KB per signature).
  - Documents uploaded via `PhotoUpload.tsx` are handled as Base64 strings.
- **Impact**: Submitting or listing batches of 50+ records creates multi-megabyte JSON payloads that freeze mobile browser main threads and trigger request body timeouts.
- **Remediation**: Upload documents and signatures as binary multipart streams directly to cloud storage; store only content hashes or secure storage identifiers in the primary linelist.

---

### C. MEDIUM Findings (Quality, Usability, and Maintainability Defects)

#### [FINDING-MED-01] Missing Test Scripts & Broken Coverage Runtime
- **Domain**: Developer Experience & CI/CD
- **Evidence**: `npm run test:run` and `npm run test:e2e` fail with missing script errors. `npm run test:coverage` crashes due to missing `@vitest/coverage-v8`.
- **Impact**: Automated pipelines cannot execute coverage or end-to-end tests cleanly without manual script overrides.
- **Remediation**: Add `"test:run": "vitest run"` and install `@vitest/coverage-v8` in `devDependencies`.

#### [FINDING-MED-02] React Hook Stale Closure Warnings in Core Form Wizards
- **Domain**: Code Quality / State Synchronization
- **Evidence**: ESLint flags missing dependencies `loadBeneficiaryDraft` in `new/page.tsx:203` and `loadSubmissionRecord` in `edit/page.tsx:526`.
- **Impact**: Under specific race conditions or draft switches, stale closures may load previous draft state or cause re-render loops.
- **Remediation**: Wrap loader callbacks in `useCallback` with stable dependencies.

#### [FINDING-MED-03] Unoptimized Next.js Images in Modal & Upload Components
- **Domain**: Performance / LCP
- **Evidence**: 6 instances of raw `<img>` tags in `SubmissionViewModal.tsx` and `PhotoUpload.tsx`.
- **Impact**: Slower LCP and uncompressed data rendering when viewing uploaded passbooks or signatures.
- **Remediation**: Replace raw `<img>` with Next.js `<Image />` component with fixed aspect ratio dimensions.

#### [FINDING-MED-04] Legacy `artCenter` Field Left in Dexie Database Schema
- **Domain**: Maintainability & Clean Architecture
- **Evidence**: `src/lib/db/dexieDb.ts:44` still lists `artCenter` in the Dexie schema indexing definition for `submissions`.
- **Impact**: Unused index overhead in local storage; potential developer confusion during future schema migrations.
- **Remediation**: Clean schema string in Dexie version definition.

---

### D. LOW & OPPORTUNITY Findings

#### [FINDING-LOW-01] Uncompressed 1.1 MB PNG Assets on Landing Page
- **Domain**: Mobile Performance
- **Evidence**: 11 uncompressed PNG screenshots in `public/images/guide/` total 1,072 kB.
- **Remediation**: Convert to WebP format, reducing asset weight to <250 kB.

#### [FINDING-OPP-01] Server Component Opportunity for Landing Page
- **Domain**: Web Architecture
- **Evidence**: `src/app/page.tsx` is marked `"use client"` despite being 90% static content.
- **Remediation**: Extract interactive PWA install modal into a compact client component, leaving the landing shell as a zero-JS Server Component.

---

## 4. Verified Facts, Assumptions & Unable to Verify

### Verified Facts (Confirmed by Code, Tests & Local Server Execution)
1. **TypeScript Safety**: Codebase compiles with 0 type errors across strict configuration (`tsc --noEmit` exit code 0).
2. **Unit Test Suite**: 6 Vitest suites execute 36/36 tests with 100% pass rate.
3. **Local Dexie Autosave**: Draft autosave fires reliably after 400ms debounce to local IndexedDB.
4. **Static Route Export**: Next.js 14 builds all 13 routes as static HTML shells in 15.6s.
5. **Offline Edit Bug**: Code inspection confirms `UPDATE` operations are routed to `POST /api/submissions` which returns `isDuplicate: true` and discards amendments.
6. **Public Drive ACLs**: Code inspection in `gas/Code.js` lines 383 & 498 explicitly verifies `ANYONE_WITH_LINK` permissions.

### Inferred Technical Assumptions
1. **Render Environment**: Production service runs as a standard Node.js container with single-process memory. If `APPS_SCRIPT_URL` is omitted, data stored in `MockSheetStore` is volatile and will be lost on container restart.
2. **Network Topology**: Field staff operate on low-tier Android smartphones (Android Go / 2GB-3GB RAM) over intermittent 2G/3G/4G cellular connections.

### Unable to Verify (Without Modifying Systems or Using Real Secrets)
1. **Live Google Drive Uploads**: Live execution of `gas/Code.js` against the production Google Drive root folder could not be verified without deploying code to Google Cloud and uploading files.
2. **Real DBT Payment Gateway Integration**: Whether bank passbook document uploads integrate with an external DBT grant disbursement system is not documented in code.

---

## 5. Awwwards-Inspired Design Principles Comparison

*Evaluation conducted against modern civic, editorial, and public-service web standards (e.g., Gov.uk, NHS Digital, Nobel Prize, Linear).*

| Design Principle | Current App Implementation | Audit Finding & Recommendation | User & Accessibility Benefit |
| :--- | :--- | :--- | :--- |
| **Typography Rhythm & Hierarchy** | Landing page uses Inter/Geist with consistent header scales. Forms maintain 16px input fonts. | **Pass with Polish**: Hero typography is clear, but guide section headers have minor contrast drop on light gray badges. Increase badge contrast to 4.5:1. | Improved legibility in high-glare sunlight. |
| **Download-First Clarity** | Hero CTA provides prominent "Download Field App" button with step-by-step install guide. | **Excellent**: Clear download-first posture prevents accidental web intake without offline capability. | Prevents field workers from initiating intake in web browser without offline caching. |
| **Content Density & Spacing** | Guide contains 10 distinct visual cards with screenshots and step summaries. | **Opportunity**: Step cards are vertically tall on mobile, requiring excessive scrolling. Add an interactive tabbed category selector (Intake, Medical, Edits, Sync). | Faster navigation for field workers referencing specific instructions. |
| **Restrained Micro-interactions** | Subtle CSS transitions on card hover and accordion expansion; no disruptive parallax. | **Pass**: Restrained animations respect `prefers-reduced-motion` media queries. | Zero motion sickness; stable UI on budget mobile GPUs. |
| **Truth in UI Signals** | System uses honest terminology ("Pending Sync", "Synced", "Local Draft"). | **Blocker in Edit Workflow**: Sync center claims "All Records Synced" even when offline edits were dropped by the backend. Fix backend sync handler immediately. | Preserves trust and operational data integrity. |

---

## 6. Comprehensive Findings Summary Table

| Finding ID | Severity | Domain | Route / Component | Remediation Summary |
| :--- | :--- | :--- | :--- | :--- |
| **FINDING-BLK-01** | **BLOCKER** | Data Integrity | `/assessment/sync` | Fix offline edit sync dispatch to call `PUT` instead of `POST`. |
| **FINDING-BLK-02** | **BLOCKER** | Privacy & Security | `gas/Code.js:383, 498` | Remove public `ANYONE_WITH_LINK` Drive ACLs; restrict to domain accounts. |
| **FINDING-BLK-03** | **CRITICAL** | Architecture | `/api/sync/route.ts` | Connect batch sync to Apps Script or deprecate in favor of `/api/submissions`. |
| **FINDING-HGH-01** | **HIGH** | Security | `/api/submissions/*` | Move webhook secret from URL query parameter to headers. |
| **FINDING-HGH-02** | **HIGH** | Security | `gas/Code.js:226` | Enforce closed authentication; require secret on `doGet`. |
| **FINDING-HGH-03** | **HIGH** | Compliance | `submissionSchema.ts` | Make caregiver consent and signature mandatory fields. |
| **FINDING-HGH-04** | **HIGH** | Performance | `CaregiverSignaturePad.tsx` | Streamline base64 payloads; optimize document image handling. |
| **FINDING-MED-01** | **MEDIUM** | CI / Quality Gates | `package.json` | Add `test:run` script and install `@vitest/coverage-v8`. |
| **FINDING-MED-02** | **MEDIUM** | Code Quality | `new/page.tsx`, `edit/page.tsx`| Resolve missing hook dependency warnings in `useEffect`. |
| **FINDING-MED-03** | **MEDIUM** | Performance | `PhotoUpload.tsx` | Replace raw `<img>` tags with Next.js `<Image />`. |
| **FINDING-MED-04** | **MEDIUM** | Database Schema | `dexieDb.ts:44` | Remove legacy `artCenter` string from IndexedDB schema definition. |
| **FINDING-LOW-01** | **LOW** | Performance | `public/images/guide/` | Convert 1.1 MB PNG guide screenshots to compressed WebP. |
| **FINDING-OPP-01** | **OPPORTUNITY** | Architecture | `src/app/page.tsx` | Convert static sections of landing page to React Server Components. |

---

## 7. Production-Blocker Checklist for Real Beneficiary Data

Before any real child, caregiver, or clinical information is entered into this application, the following items must be verified:

- [ ] **Data Loss Prevention**: Offline edit sync (`UPDATE` operation) verified to execute HTTP `PUT` with Optimistic Concurrency Control, auto-incrementing the revision number and updating the row.
- [ ] **Privacy Hardening**: Google Drive folder and file ACLs verified private to authorized institutional service accounts; zero `ANYONE_WITH_LINK` permissions.
- [ ] **Authentication Gate**: Google Apps Script `doGet` and `doPost` reject all unauthenticated requests with HTTP 401.
- [ ] **Secret Hygiene**: Webhook secrets removed from query strings and `.env.example`.
- [ ] **Mandatory Consent**: Backend schema enforces `caregiverConsent.consentGiven === true` and valid signature prior to persisting records.
- [ ] **Automated E2E Testing**: Playwright test suite configured and passing in CI for end-to-end intake, offline queuing, sync, and edit journeys.
- [ ] **Document Retention**: Document updates generate auditable revision logs and trash obsolete files without silent data destruction.
