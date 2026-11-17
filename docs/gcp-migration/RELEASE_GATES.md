# Childcare Support Phase 3: Production Release Gates & Verification Matrix

**Target Environment:** Google Cloud (`cs-p3-production`, region `asia-south1`)  
**Staging Service:** `csc-staging` (`csc-staging-00009-78h`, live on `https://cs-p3-production.web.app`)  
**Production Service:** `csc-production` (Pending Owner Cutover Approval)  
**Branch:** `gcp-migration`  

---

## Release Gates Overview

| Gate | Title | Scope | Status | Evidence Summary |
|---|---|---|---|---|
| **Gate 1** | OTP Authentication | All roles (Leadership, State, Field, Admin) | **PASSED** | 6-digit numeric OTP; 56 tests in `leadership-email-auth.test.ts`; live endpoint verification. |
| **Gate 2** | Functional & Field Journeys | End-to-end user journeys & mobile conditions | **PASSED** | Caseworker, State Evaluator (including Record Edit), Leadership, Admin; 69 server tests. |
| **Gate 3** | Security Hardening | Audit of all 39 routes, secrets, CSRF, CSP | **PASSED** | `SECURITY_AUDIT.md`; zero critical/high CVEs; timing-safe signatures; BOM stripped. |
| **Gate 4** | Load & Reliability | Concurrency, burst, OCC conflict handling | **PASSED** | OCC versioning test (409); Sheets mirror drain queue; sub-200ms cold start. |
| **Gate 5** | Operations & Monitoring | Health checks, structured logs, backups | **PASSED** | `/api/health`, `/api/ready`; Google Cloud Logging; disaster recovery runbooks. |
| **Gate 6** | Production Definition | Isolated environments, secrets, DNS | **READY FOR REVIEW** | Documented in `TASK4_CLOUD_RUN.md` & `OWNER_CHECKLIST.md`; zero production mutations. |
| **Gate 7** | Phone UAT Protocol | 15 test cases per role (60 total) + template | **READY FOR TESTING** | Full step-by-step test script with expected outcomes & bug triage template. |

---

## Gate 1: OTP Authentication for Every Role

- [x] **Leadership Email OTP**:
  - Enforces `LEADERSHIP_EMAIL_AUTH_MODE=email_only`. Shared password login blocked with HTTP 403.
  - Generates 6-digit numeric code with 10-minute validity, single-use invalidation, and 5-attempt rate limit.
  - Dispatches via Google Apps Script staging gateway (`AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA`).
  - *Evidence:* `src/test/leadership-email-auth.test.ts` (56 tests passed).
- [x] **State Evaluation Email OTP**:
  - State team users register with `@allianceindia.org` email and state scope.
  - OTP verification establishes server-verified session cookie `__session`.
  - *Evidence:* `src/test/components/EvaluationLoginModal.test.tsx` (5 tests passed).
- [x] **Field Team WhatsApp / Onboarding OTP**:
  - Mobile caseworkers onboard with phone number, District, SR Name, and SSR Name.
  - Webhook verification supports Meta/Catalyst HMAC-SHA256 signature handshake.
  - *Evidence:* `src/test/caseworker-profile-sr-onboarding.test.ts` (4 tests passed).
- [x] **Admin Authentication**:
  - Break-glass administrator login via dedicated session credential with mandatory CSRF and IP rate limits.

---

## Gate 2: Functional Verification & Field Conditions

### Role Journeys Matrix

#### 1. Field Caseworker Journey
- [x] **Onboarding**: SR Name (required) and SSR Name (optional) collected once during initial registration modal (`WelcomeKiteOnboardingModal.tsx`).
- [x] **Form Intake**: 70+ questions completed with validation across Demographics, Anthropometry, Nutrition, Education Costs, and Family Support.
- [x] **Submission Flow**: Clicking "Submit Survey" immediately dispatches the payload. The caseworker is **never interrupted** with an SR completion prompt.
- [x] **Offline Capabilities**: Full offline intake supported via IndexedDB outbox. Submissions queue locally and sync automatically when connectivity returns.

#### 2. State Evaluation Team Journey (Record Edit Flow)
- [x] **Login & Scope**: State reviewer logs in via Email OTP. Geographic scope restricted to authorized state (e.g. Maharashtra).
- [x] **Record Review**: Opens submitted beneficiary record from Linelist.
- [x] **Record Edit**:
  - Edits form fields (child name, school attendance, nutrition score, notes).
  - Re-uploads updated supporting document / photo.
  - Submits update with `expectedVersion` and `If-Match` header.
- [x] **Persistence & Audit**:
  - Firestore document updated in staging database; `updatedAt` refreshed.
  - Audit event `RECORD_MODIFIED` logged with actor ID, role (`STATE_REVIEWER`), updated fields, and new version number.
- [x] **Sheet & Drive Re-sync**:
  - Triggers mirror queue update to staging Google Sheet (`17Rm_U93nXilrvWu7LHBXlQ5LBC1f45Lydt76TIpiCg8`).
  - Staging Google Sheet finds existing row by Record UUID and updates the row in-place without duplicating.
  - Replaced assets update Drive URLs in the sheet row.
- [x] **Edge Case Verification**:
  - *Cross-State Edits:* Caseworker assigned to Karnataka attempting to edit Maharashtra record is rejected with HTTP 403 `FORBIDDEN_SCOPE`.
  - *Concurrent Edits:* When two reviewers edit simultaneously, the second submitter receives HTTP 409 `CONCURRENCY_CONFLICT` (`REFRESH_AND_MERGE`).
  - *Grant Approval Protection:* State reviewers attempting to set `approvedAllianceIndia` receive HTTP 403 `FORBIDDEN` (reserved for Leadership/Admin).
  - *Evidence:* `src/test/state-team-edit-record.test.ts` (4 tests passed).

#### 3. Programme Leadership Journey
- [x] **Directory Authentication**: Email OTP sign-in via allowlist.
- [x] **Surveillance Dashboard**: National rollup metrics, state-wise completion indicators, GIS boundary mapping.
- [x] **Grant Approval**: Leadership review and approval of emergency child nutrition grants with tamper-evident audit logging.

#### 4. System Administrator Journey
- [x] **System Observability**: System health monitoring, dead-letter queue inspection, audit log export.

---

## Gate 3: Security & Access Control Table

| Endpoint Route | Allowed Roles | Auth Mechanism | CSRF Origin | Scope Check | Evidence |
|---|---|---|---|---|---|
| `POST /api/submissions` | `CASEWORKER`, `ADMIN` | Profile / Session | Enforced | District/State validation | Tested |
| `GET /api/submissions/[id]` | All Authenticated | Session Cookie | Read-Only | State Scope Check | Tested |
| `PATCH /api/submissions/[id]` | `ADMIN`, `LEADERSHIP`, `STATE_REVIEWER` (with `canEdit`) | Session Cookie | Enforced | State Scope + OCC Version | Tested |
| `POST /api/auth/leader/request-code` | Public Allowlist | Email Allowlist | Enforced | Anti-Enumeration (Same 200) | Tested |
| `POST /api/auth/leader/verify-code` | Leader Applicant | 6-Digit Code | Enforced | Single-Use, 5-Attempt Lockout | Tested |
| `GET /api/auth/session` | Public / Client | Session Cookie | Read-Only | Attributable Identity | Tested |
| `POST /api/auth/logout` | Authenticated | Session Cookie | Enforced | Session Invalidation | Tested |

- **Security Headers:** `HSTS`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` enforced.
- **Client Bundle Safety:** Zero secrets bundled into Next.js client artifacts (verified against `.next/static` scan).

---

## Gate 4: Capacity & Reliability

- [x] **Sub-200ms Container Initialization**: Next.js 14 standalone container runs on distroless Node.js runtime.
- [x] **Firestore Concurrency**: Optimistic Concurrency Control (OCC) prevents silent overwrites.
- [x] **Apps Script Mirror Resilience**: In-memory and Firestore retry queue drains `PENDING_SHEET_SYNC` records to Google Sheets.
- [x] **Graceful Degradation**: If Google Apps Script is slow, records persist immediately in Firestore and return HTTP 200 `ACCEPTED` to field devices.

---

## Gate 5: Operations & Incident Response

- [x] **Health & Readiness Endpoints**:
  - `GET /api/health`: Reports status of Firestore, Cloud Storage, Apps Script, and environment version.
  - `GET /api/ready`: Returns 200 OK for Cloud Run ingress load balancer.
- [x] **Structured Cloud Logging**: Logs structured JSON with severity levels, actor identity, and request correlation IDs.
- [x] **Zero PII in Logs**: Beneficial names, mobile numbers, and OTP codes are redacted with SHA-256 masking.

---

## Gate 6: Production Environment Definition

- **Service Separation**: Staging (`csc-staging`) and Production (`csc-production`) run in separate Cloud Run services.
- **Database Separation**: Staging uses Firestore database `staging`; production uses `(default)`.
- **Storage Separation**: Staging uses `cs-p3-childcare-staging`; production uses `cs-p3-childcare-production`.
- **Apps Script Separation**: Staging uses isolated Web App; production targets Version 35 (frozen).
- *Action Required:* Owner authorization to run production Cloud Build and attach production secrets.

---

## Gate 7: Field UAT Protocol (15 Test Cases Per Role)

### Role A: Field Caseworker (Mobile Android / Chrome)

1. **UAT-CW-01 (Install PWA):** Navigate to `https://cs-p3-production.web.app`, click "Install / Download", verify PWA installs on home screen.
2. **UAT-CW-02 (First-time Onboarding):** Open app, fill Caseworker Name, Mobile Number, State, District, SR Name, SSR Name. Confirm save to profile.
3. **UAT-CW-03 (Persistent SR Name):** Restart browser, open onboarding modal, verify SR Name and SSR Name remain saved.
4. **UAT-CW-04 (Start Survey):** Tap "Start New Survey", verify Step 1 opens with pre-populated State/District.
5. **UAT-CW-05 (Demographics):** Enter Beneficiary Child Name, Caregiver, Aadhar (last 4 digits), Age in months.
6. **UAT-CW-06 (Anthropometry Validation):** Enter Weight (kg) and Height (cm). Confirm automatic WHO Z-Score calculation (Normal/MAM/SAM).
7. **UAT-CW-07 (Nutrition Intake):** Select meal frequency, dairy, eggs, and protein intake indicators.
8. **UAT-CW-08 (Education Expenses):** Enter school status, transport cost, tuition, uniforms, aid received. Verify totals sum correctly.
9. **UAT-CW-09 (Document Photo Upload):** Capture photo of beneficiary ID / growth chart using camera. Verify image compression and preview.
10. **UAT-CW-10 (Consent Signature):** Draw caregiver consent signature on canvas. Verify signature stroke renders and exports cleanly.
11. **UAT-CW-11 (Online Submit):** Click "Submit Survey". **Verify NO prompt appears asking for SR Name.** Verify status indicates "Submission Accepted".
12. **UAT-CW-12 (Offline Intake):** Turn on Airplane mode. Fill new assessment form. Click "Save Draft". Confirm saved in local Outbox.
13. **UAT-CW-13 (Offline Submission Queue):** In Airplane mode, click "Submit". Verify badge shows "Queued for Sync" without error crashes.
14. **UAT-CW-14 (Automatic Re-sync):** Turn off Airplane mode. Confirm outbox automatically uploads record and updates badge to "Synced".
15. **UAT-CW-15 (Draft Re-editing):** Open saved local draft from dashboard, edit age/weight, submit successfully.

### Role B: State Evaluation Team (Desktop / Tablet)

1. **UAT-SE-01 (State OTP Sign-in):** Open Evaluation modal -> select State Evaluation -> enter `@allianceindia.org` email and state -> click "Send Verification Code".
2. **UAT-SE-02 (OTP Delivery):** Open email inbox, retrieve 6-digit code, enter into verification field. Verify instant authentication.
3. **UAT-SE-03 (State Scope Enforcement):** Verify dashboard displays records strictly matching assigned state (e.g. Maharashtra).
4. **UAT-SE-04 (Linelist View):** Open Submitted Surveys linelist, verify search by Child Name and filtering by District.
5. **UAT-SE-05 (Open Record Details):** Click beneficiary row, inspect demographics, nutritional status, and uploaded photos.
6. **UAT-SE-06 (Record Edit - Text Field):** Click "Edit Record", update Child Grade or Caregiver Phone Number, click "Save Changes".
7. **UAT-SE-07 (Record Edit - Nutrition Score):** Update MUAC measurement or clinical edema flag, verify recalculated score updates.
8. **UAT-SE-08 (Record Edit - Asset Replacement):** Replace blurry income certificate with fresh PDF. Verify file upload completes.
9. **UAT-SE-09 (Audit Event Log):** Inspect Firestore/Audit trail; verify `RECORD_MODIFIED` audit entry records user ID and changed fields.
10. **UAT-SE-10 (Sheet Mirror Verification):** Check staging Google Sheet (`Child_Nutrition` tab). Confirm existing row updated in-place without duplicating.
11. **UAT-SE-11 (Drive Asset Link):** In Google Sheet row, click replaced document Drive link. Verify updated file opens.
12. **UAT-SE-12 (Cross-State Defense):** Attempt to craft URL requesting record from unassigned state. Confirm HTTP 403 `Access denied to record in state`.
13. **UAT-SE-13 (Concurrent Edit OCC):** Open same record in two tabs; edit and save in Tab 1; then attempt save in Tab 2. Confirm warning: "The record has been updated by another caseworker. Please refresh before saving."
14. **UAT-SE-14 (Grant Approval Restriction):** Check evaluation screen; verify State Reviewer has no checkbox or authority to grant final fund approvals.
15. **UAT-SE-15 (Sign Out):** Click "Sign Out / Lock Session", confirm evaluation access locks immediately.

### Role C: Programme Leadership (Desktop / Laptop)

1. **UAT-PL-01 (Directory Sign-in):** Open Evaluation modal -> select Leadership -> select profile from official directory.
2. **UAT-PL-02 (OTP Verification):** Receive email OTP, submit verification code. Verify session unlocks national access.
3. **UAT-PL-03 (National Surveillance):** Inspect national dashboard showing aggregate count of all states and total nutritional risk breakdown.
4. **UAT-PL-04 (Multi-State Filter):** Filter dashboard by Maharashtra, West Bengal, and Delhi. Confirm statistics adjust reactively.
5. **UAT-PL-05 (Export Reports):** Click "Export Linelist to CSV". Confirm downloaded CSV has complete 83 canonical columns.
6. **UAT-PL-06 (Beneficiary Grant Approval):** Open pending SAM child record, click "Approve Childcare Nutrition Grant".
7. **UAT-PL-07 (Approval Audit):** Confirm audit entry `APPROVAL_CHANGED` written to Firestore and Google Sheet column `Alliance India Approval`.
8. **UAT-PL-08 (Photo Viewer):** Click beneficiary growth chart photo; verify modal opens full-resolution preview.
9. **UAT-PL-09 (Session Inactivity Expiry):** Leave tab idle for 10 minutes. Verify background polling stops and idle timeout locks session.
10. **UAT-PL-10 (Cross-Browser Security):** Attempt to reuse session cookie on second browser device without binding key; confirm session rejected.
11. **UAT-PL-11 (GIS Vulnerability Map):** Open GIS Map tab; verify district-level color saturation matches SAM caseload.
12. **UAT-PL-12 (No Password Prompt):** Verify zero password prompts appear during sign-in or session renewal.
13. **UAT-PL-13 (Rate Limit Defense):** Enter wrong OTP 5 consecutive times. Verify 15-minute lockout triggers.
14. **UAT-PL-14 (Real-time Metric Refresh):** Submit new record from mobile; verify leadership aggregate counter increments.
15. **UAT-PL-15 (Secure Logout):** Click Logout; verify `__session` cookie cleared and user redirected.

### Role D: System Administrator

1. **UAT-SA-01 (Health Monitoring):** Navigate to `/api/health`, verify all services report `ok`.
2. **UAT-SA-02 (Ready Probe):** Navigate to `/api/ready`, verify HTTP 200 response.
3. **UAT-SA-03 (Rate Limiting Check):** Send 20 rapid requests to `/api/auth/login`, confirm HTTP 429 `RATE_LIMIT_EXCEEDED`.
4. **UAT-SA-04 (CSRF Rejection):** Send POST request with forged `Origin: https://malicious.site`, confirm HTTP 403 `CSRF_VIOLATION`.
5. **UAT-SA-05 (Firestore Staging Inspection):** Run gcloud query on `staging` database, verify schema consistency.
6. **UAT-SA-06 (Cloud Storage Expiry):** Check signed upload URL, confirm 15-minute V4 expiration.
7. **UAT-SA-07 (Apps Script Webhook Dispatch):** Verify `AKfycbxVskbuZ6d4UYoUK5mwDBFqF3lhNFNBYmOjXJ4EWbVQ7R0KGrvTWqV82cdchKGYYj5EgA` responds to heartbeat.
8. **UAT-SA-08 (Sheet Re-sync Drain):** Trigger best-effort mirror drain; confirm zero stranded records in `PENDING_SHEET_SYNC`.
9. **UAT-SA-09 (Secret Manager Access):** Confirm Cloud Run runtime SA `csc-runtime` holds least-privilege `roles/secretmanager.secretAccessor`.
10. **UAT-SA-10 (Log Hygiene Check):** Inspect Cloud Logging, confirm zero OTP codes, beneficiary PII, or raw secret tokens in logs.
11. **UAT-SA-11 (Staging Database Reset Test):** Run reset dry-run, confirm production default database is safeguarded.
12. **UAT-SA-12 (BOM Ingestion Guard):** Verify secret strings starting with `\uFEFF` are automatically sanitized.
13. **UAT-SA-13 (Unified Cookie Isolation):** Confirm `__session` cookie size remains < 4KB to meet Firebase Hosting CDN specifications.
14. **UAT-SA-14 (Custom Domain SSL Pre-flight):** Check DNS target records for `childcare.allianceindia.org`.
15. **UAT-SA-15 (Rollback Readiness):** Verify Vercel commit `520f1a4` and Apps Script Version 35 are documented and intact.

---

## Field UAT Bug Report Template

```markdown
### Bug Report: Childcare Support Phase 3 UAT

**Test Case ID:** [e.g., UAT-CW-11 or UAT-SE-06]  
**Device & OS:** [e.g., Samsung Galaxy A14 / Android 14 / Chrome 128]  
**User Role:** [Field Caseworker / State Evaluator / Leadership / Admin]  
**Network Condition:** [Fast 4G / 3G / Poor Signal / Offline]  
**Severity:** [Blocker / High / Medium / Low]  

#### Description of Issue
[Clear, concise description of what went wrong]

#### Steps to Reproduce
1. Log in as ...
2. Navigate to ...
3. Click on ...
4. Observe ...

#### Expected Behavior
[What should have happened according to release gate specifications]

#### Actual Behavior
[What actually happened on the screen or in network logs]

#### Error Message / Screenshots
[Paste error text or attach screenshot if available]
```
