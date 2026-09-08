# Security & Access Document (SAD)
## Childcare Support — Phase 3: Children Nutrition and Education Support Form PWA

**Document Version:** 1.0.0-SECURITY-BASELINE  
**Classification:** Official / Restricted — Sensitive Health Information  
**Target Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Target Deployment Target:** Render Web Service (Node.js LTS Runtime / Next.js)  
**Security Lead / Author:** Senior Application Security & Privacy Architect (Antigravity)  
**Status:** Under Programme Governance Review & Pre-Production Hardening  

---

## 1. Data Classification Matrix

The platform processes sensitive paediatric health, clinical, and financial support information. All system attributes are mapped to four formal classification tiers:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DATA CLASSIFICATION TIERS                                    │
├──────────────┬─────────────────────────────────┬──────────────────┬─────────────────────────────┤
│ Tier         │ Definition & Examples           │ Storage Context  │ Protection Requirements     │
├──────────────┼─────────────────────────────────┼──────────────────┼─────────────────────────────┤
│ RESTRICTED   │ Direct paediatric HIV clinical  │ Render Memory,   │ Strict RBAC, TLS 1.3 only,  │
│              │ indicators (Viral Load count,   │ Target Sheet,    │ no persistent unencrypted   │
│              │ ART ID, Reg Date, Comorbidities,│ Google Drive     │ device caching post-sync,   │
│              │ Aadhaar number, Bank account).  │ (Private Folder) │ no plain logs.              │
├──────────────┼─────────────────────────────────┼──────────────────┼─────────────────────────────┤
│ CONFIDENTIAL │ Beneficiary identifiers and     │ IndexedDB Drafts,│ Session token required,     │
│              │ demographics (Child name, DOB,  │ Server Session,  │ auto-purge after 7 days,    │
│              │ Caregiver contact, Address,     │ Line-list Views  │ masked presentation         │
│              │ School fees, Tuition receipts). │                  │ (e.g. XXXX-XXXX-1234).      │
├──────────────┼─────────────────────────────────┼──────────────────┼─────────────────────────────┤
│ INTERNAL     │ Aggregate operational metrics   │ Cached Client DB,│ Authenticated users only,   │
│              │ (Total beneficiaries per CSC,   │ Local Cache,     │ safe for aggregate display  │
│              │ District totals, Sync metrics,  │ Render Logs      │ without individual PII.     │
│              │ Form versioning, Audit IDs).    │                  │                             │
├──────────────┼─────────────────────────────────┼──────────────────┼─────────────────────────────┤
│ PUBLIC       │ Static app shell (HTML/JS/CSS), │ Service Worker   │ Publicly cacheable, SRI     │
│              │ WOFF2 fonts, SVG UI icons,      │ Pre-cache, CDN,  │ integrity hashes, zero      │
│              │ State/District dropdown lists.  │ Public Repo      │ sensitive information.      │
└──────────────┴─────────────────────────────────┴──────────────────┴─────────────────────────────┘
```

---

## 2. Privacy-by-Design & Data Protection Principles

1. **Purpose Limitation**: Beneficiary data collected through this application must be processed solely for managing paediatric nutritional recovery and educational grant disbursements under authorized Alliance India programmes. Secondary automated processing or third-party marketing analytics is strictly prohibited.
2. **Data Minimisation (Client Level)**:
   - Full 12-digit Aadhaar numbers are never stored in plain text in local IndexedDB. The client captures the number, displays a masked string (`XXXX-XXXX-9876`), and passes it securely over HTTPS directly to the server boundary.
   - HIV status is recorded via clinical proxies (`ART Status`, `ART ID Number`, `Viral Load suppression category`). Diagnostic narrative labels such as "HIV Positive" or "AIDS Patient" must **never** appear in PWA push alerts, browser window titles, or URL parameters.
3. **Role-Based Information Visibility**:
   - Field caseworkers can view and edit only their own active drafts and the specific beneficiaries assigned to their Community Support Centre (CSC).
   - Clinical supervisors have state-wide read-and-approve access.
   - System administrators inspect system audit logs, queue performance, and error envelopes with all child names cryptographically masked.
4. **Retention & Deletion Lifecycle**:
   - *Proposal pending programme confirmation*: Completed and verified submissions stored in client-side IndexedDB are automatically marked for local eviction 7 days after central synchronization is confirmed.
   - If an intake draft is abandoned and untouched for $> 30$ days, the PWA flags it for local review before prompting secure disposal.
5. **No Local Screenshots / Print Policy**: The PWA manifests disable standard mobile print stylesheets and set `User-Select: none` on sensitive clinical summary cards to prevent accidental screen captures on shared field devices.
6. **Synthetic Test Data Mandate**: Developer test fixtures, unit tests, and CI/CD pipelines must strictly utilize synthetically generated beneficiary personas. **Zero** real child records from Phase 1, Phase 2, or pilot sheets may be committed to source repositories or test files.

---

## 3. Threat Model (STRIDE Methodology)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      STRIDE THREAT ANALYSIS                                     │
├────────────────────┬───────────────────────────────────┬────────────────────────────────────────┤
│ Threat Class       │ Specific System Vulnerability     │ Concrete Mitigation Control            │
├────────────────────┼───────────────────────────────────┼────────────────────────────────────────┤
│ **Spoofing**       │ Unauthorized user submits forms   │ Secure HttpOnly signed session cookies;│
│                    │ claiming to be an active outreach │ server validates session user ID       │
│                    │ caseworker.                       │ against registered active CSC roster.  │
├────────────────────┼───────────────────────────────────┼────────────────────────────────────────┤
│ **Tampering**      │ Form payload or grant amounts     │ Strict server-side Zod validation;     │
│                    │ modified in transit between client│ client-side TLS 1.3; client assigns    │
│                    │ and Google Sheets.                │ cryptographically random UUIDv4;       │
│                    │                                   │ Apps Script verifies HMAC signature.   │
├────────────────────┼───────────────────────────────────┼────────────────────────────────────────┤
│ **Repudiation**    │ User denies submitting or         │ Immutable AuditEvent logs capturing    │
│                    │ approving an erroneous education  │ user ID, timestamp, IP, correlation ID,│
│                    │ grant allocation.                 │ and action in separate append-only tab.│
├────────────────────┼───────────────────────────────────┼────────────────────────────────────────┤
│ **Information**    │ Stolen field phone reveals        │ 15-minute inactivity app lock;         │
│ **Disclosure**     │ confidential line-lists of minors │ masked Aadhaar; automatic local purge  │
│                    │ living with HIV.                  │ of synced records; no PII in console.  │
├────────────────────┼───────────────────────────────────┼────────────────────────────────────────┤
│ **Denial of**      │ Rapid retries or rogue loop       │ Rate limiting (60 req/min per IP);     │
│ **Service**        │ exhausts Google Apps Script daily │ exponential backoff with full jitter;  │
│                    │ execution quotas.                 │ Apps Script 30s mutex lock.            │
├────────────────────┼───────────────────────────────────┼────────────────────────────────────────┤
│ **Elevation of**   │ Outreach caseworker calls         │ Strict role-permission middleware in   │
│ **Privilege**      │ supervisor approval endpoints or  │ Next.js API boundary; role claims      │
│                    │ exports national dataset.         │ cryptographically embedded in session. │
└────────────────────┴───────────────────────────────────┴────────────────────────────────────────┘
```

---

## 4. Attack-Path & Vulnerability Analysis Table

| Threat / Attack Path | Preconditions | Potential Impact | Mitigation Control | Detection Mechanism | Residual Risk | Owner |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AP-01: Stolen / Lost Field Device** | Caseworker loses Android phone with active session. | Unauthorised viewer inspects local drafts & child clinical data. | 15-min PIN/biometric screen lock; auto-purge synced items after 7 days; remote session revocation. | User reports loss; Admin revokes session token in database. | Low (Drafts in transit vulnerable until lock expires). | Field Operations Lead |
| **AP-02: Rogue Webhook Injection** | Attacker discovers Apps Script deployment URL. | Attacker injects fraudulent beneficiary rows directly to Sheets. | Mandatory `X-Webhook-Secret` header verified against `PropertiesService`; IP allowlisting where possible. | Apps Script logs rejected requests with HTTP 403; alerts fired. | Low (Secret held only on Render backend). | Lead Architect |
| **AP-03: Replay / Double Submission** | Network times out; user clicks submit repeatedly. | Duplicate rows in Google Sheets; dual grant disbursement. | Client assigns RFC 4122 UUID; server enforces unique `Idempotency-Key`; Apps Script searches UUID before append. | Server logs duplicate `Idempotency-Key` collisions; returns 200 with original row. | Negligible (Mathematically eliminated). | Lead Developer |
| **AP-04: XSS via Beneficiary Name** | Malicious script entered into Child Name field. | Session hijacking or data exfiltration from supervisor browser. | React auto-escaping; strict Content Security Policy (CSP); Zod regex validation rejecting HTML/script tags. | Automated CSP violation reporting endpoint; server Zod reject. | Low (Defence-in-depth). | Frontend Architect |
| **AP-05: Malicious File Upload** | Attacker uploads executable (.exe, .sh) disguised as receipt. | Malware distribution to supervisor downloading documents. | Strict MIME-type allowlist (PDF, JPEG, PNG only); magic-byte verification; maximum 5MB size limit. | Server-side file inspection rejects non-image/non-PDF binaries. | Very Low. | Backend Developer |

---

## 5. Authentication Architecture Decision

*Proposal pending formal programme identity ratification.*

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                AUTHENTICATION PATTERN COMPARISON                                │
├───────────────────────┬─────────────────────────────────────┬───────────────────────────────────┤
│ Evaluation Criterion  │ Option A: Microsoft Entra ID (OIDC) │ Option B: Internal Managed Roster │
├───────────────────────┼─────────────────────────────────────┼───────────────────────────────────┤
│ Institutional Match   │ Matches reference repo & enterprise │ Matches historical Phase 1 & 2    │
│                       │ Alliance India IT infrastructure.   │ Google Sheets profile management. │
│ Offline Resilience    │ High: Refresh tokens & cached claims│ High: Signed session cookies with │
│                       │ stored securely in IndexedDB.       │ 8-hour / 30-day offline validity. │
│ MFA / SSO Support     │ Built-in institutional MFA and      │ Requires custom OTP or PIN        │
│                       │ conditional access policies.        │ implementation.                   │
│ Administrative Burden │ Centralised in Azure Portal; zero   │ Manual roster updates in Google   │
│                       │ user table maintenance in software. │ Sheets or database tables.        │
│ Recommendation        │ **RECOMMENDED FOR PRODUCTION**      │ **VIABLE FOR STAGING / PROTOTYPE**│
└───────────────────────┴─────────────────────────────────────┴───────────────────────────────────┘
```

### 5.1 Session Lifecycle Specification
1. **Login & Token Issuance**:
   - User submits credentials over TLS 1.3.
   - Upon successful verification, the server issues a cryptographically signed HMAC-SHA256 session token stored in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
   - Default session duration: **8 hours** (standard field shift). "Remember Me" option (approved devices only): **30 days**.
2. **Session Invalidation**:
   - Explicit sign-out clears the browser cookie and invalidates the session ID in server cache.
   - Calling `/api/auth/logout` wipes the local IndexedDB reference cache of sensitive child records.

---

## 6. Authorisation & Least-Privilege Permissions Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ROLE PERMISSIONS MATRIX                                       │
├─────────────────────────────────────┬────────────┬────────────┬───────────────┬─────────────────┤
│ Action / Resource                   │ Enumerator │ Supervisor │ Administrator │ Analyst (Viewer)│
├─────────────────────────────────────┼────────────┼────────────┼───────────────┼─────────────────┤
│ Create & Edit Local Drafts          │ ALLOW      │ ALLOW      │ DENY          │ DENY            │
│ Submit Finalised Intake to Queue    │ ALLOW      │ ALLOW      │ DENY          │ DENY            │
│ View Own Centre's Line-List         │ ALLOW      │ ALLOW      │ ALLOW         │ ALLOW (Masked)  │
│ View State-Wide Line-Lists          │ DENY       │ ALLOW      │ ALLOW         │ ALLOW (Masked)  │
│ Approve Beneficiary Support Grants  │ DENY       │ ALLOW      │ ALLOW         │ DENY            │
│ Trigger Google Apps Script Sync     │ ALLOW (Own)│ ALLOW (All)│ ALLOW (All)   │ DENY            │
│ Reconcile Duplicate Candidates      │ DENY       │ ALLOW      │ ALLOW         │ DENY            │
│ View D3 Aggregate Visualisations    │ ALLOW      │ ALLOW      │ ALLOW         │ ALLOW           │
│ Rotate Webhook Secrets & API Keys   │ DENY       │ DENY       │ ALLOW         │ DENY            │
│ Access Raw System Audit Logs        │ DENY       │ DENY       │ ALLOW         │ DENY            │
└─────────────────────────────────────┴────────────┴────────────┴───────────────┴─────────────────┘
```
*Note: Role policies marked as "Proposal pending programme confirmation."*

---

## 7. Offline Access & Device-Local Security Policy

1. **Permitted Cached Data**:
   - Active user's own unfinished drafts in `drafts` table.
   - Master reference lookups (States, Districts, CSC facilities, standard School lists).
   - Summary cards of previously synced children belonging strictly to the caseworker's assigned CSC (capped at 500 records).
2. **Prohibited from Local Cache**:
   - Unredacted Aadhaar numbers.
   - Passwords, plaintext credentials, or Webhook secrets.
   - Full national or inter-state line-lists.
3. **Local Inactivity Lock**: If the device remains untouched for 15 minutes while offline, the PWA renders a modal authentication barrier requiring the user's PIN or account password to unlock the DOM.
4. **Emergency Local Wipe Procedure**: The Settings interface provides an explicit "Purge Local Storage" action that drops the entire IndexedDB database, unregisters the service worker, and redirects to the login screen.

---

## 8. Server API Boundary Security Controls

```
                                  INCOMING HTTPS REQUEST
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ 1. TLS 1.3 Termination    │
                               │    (Strict Transport Sec) │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ 2. Security Headers (CSP, │
                               │    X-Content-Type, CORS)  │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ 3. Rate Limiting Engine   │
                               │    (60 req/min per IP)    │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ 4. Session Authenticator  │
                               │    (HttpOnly JWT / HMAC)  │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ 5. Authorisation Guard    │
                               │    (RBAC Role Checking)   │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ 6. Zod Schema Validation  │
                               │    (Input Sanitisation)   │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ 7. Idempotency Check      │
                               │    (UUID Deduplication)   │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                                  EXECUTE ROUTE HANDLER
```

### 8.1 Content Security Policy (CSP)
The application enforces a rigid HTTP CSP header:
```
default-src 'self'; 
script-src 'self' 'wasm-unsafe-eval'; 
style-src 'self' 'unsafe-inline'; 
font-src 'self' data:; 
img-src 'self' data: https://drive.google.com https://lh3.googleusercontent.com; 
connect-src 'self' https://script.google.com; 
frame-ancestors 'none'; 
base-uri 'self'; 
form-action 'self';
```

---

## 9. Google Apps Script & Google Sheets Security Standard

1. **Shared Secret Validation**: Every call from the Render server to the Apps Script webhook MUST include a high-entropy secret passed in header `X-Webhook-Secret` or verified parameter. Apps Script rejects non-matching calls with HTTP 403:
   ```javascript
   var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
   if (!secret || incomingSecret !== secret) {
     return ContentService.createTextOutput(JSON.stringify({ error: "Forbidden" }))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```
2. **Protected Spreadsheet Ranges**:
   - Header rows (Rows 1 to 3) are locked and protected; field accounts cannot edit them.
   - Audit and profile tabs are hidden from general viewers.
3. **No Public Endpoint Exposure**: The Apps Script Web App is deployed under the execution context of the project owner, but accessible via webhook authorization token only. The deployment URL is never embedded in client bundles.

---

## 10. Secrets Management & Configuration Taxonomy

1. **Zero Secrets in Source Control**: `.gitignore` strictly bans `.env`, `.env.local`, `.clasp.json` containing credentials, and private keys.
2. **Automated Secret Scanning**: GitHub secret scanning and pre-commit hooks (`gitleaks` / `trufflehog`) run on every PR.
3. **Secret Inventory & Categories**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       SECRET TAXONOMY MATRIX                                    │
├───────────────────────────┬──────────────┬──────────────────┬───────────────────────────────────┤
│ Secret Identifier         │ Category     │ Injected At      │ Rotation Interval                 │
├───────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────┤
│ `SESSION_SECRET`          │ Server Auth  │ Render Dashboard │ 180 days (or immediate on breach) │
│ `WEBHOOK_SHARED_SECRET`   │ API Bridge   │ Render + GAS Prop│ 90 days                           │
│ `APPS_SCRIPT_WEBHOOK_URL` │ Endpoint URL │ Render Dashboard │ Upon re-deployment of web app     │
│ `KOBO_API_TOKEN`          │ Legacy Sync  │ GAS Properties   │ 90 days (if Kobo sync active)     │
└───────────────────────────┴──────────────┴──────────────────┴───────────────────────────────────┘
```

---

## 11. Security Incident Response Runbooks

### Runbook IR-01: Lost or Stolen Field Caseworker Device
1. **Notification**: Caseworker notifies CSC supervisor and IT Administrator within 2 hours of loss.
2. **Session Revocation**: Administrator immediately invalidates the user's active session token in the database/session cache.
3. **Credential Reset**: Caseworker's account password/PIN is reset.
4. **Audit Inspection**: Administrator inspects server audit logs to verify whether any data export or query occurred between device loss and revocation.

### Runbook IR-02: Webhook Secret Compromise or Unauthorized Write Spike
1. **Immediate Isolation**: Administrator updates `WEBHOOK_SECRET` in Google Apps Script `PropertiesService` to a new random 64-character string.
2. **Render Configuration Update**: Update matching `WEBHOOK_SHARED_SECRET` in Render Environment variables. Service automatically restarts in $< 30$ seconds.
3. **Integrity Audit**: Query Google Sheet `Submission_Index` for rows created during the incident window; compare UUIDs against Render database audit logs to isolate rogue entries.

---

## 12. Security Test Plan & Verification Gates

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     SECURITY AUDIT CHECKLIST                                    │
├──────────────────────┬───────────────────────────────┬──────────────────────────────────────────┤
│ Test Category        │ Methodology / Tool            │ Pass Criteria                            │
├──────────────────────┼───────────────────────────────┼──────────────────────────────────────────┤
│ Static Analysis SAST │ Semgrep / CodeQL              │ Zero high/critical security findings     │
│ Dependency Auditing  │ `npm audit` / Dependabot      │ Zero CVE vulnerabilities in dependencies │
│ Secret Scanning      │ GitLeaks in GitHub Actions    │ Zero committed secrets or credentials    │
│ Broken Access Auth   │ Supertest integration tests   │ Enumerator cannot call supervisor routes │
│ Input Injection      │ Automated Fuzzing Suite       │ Payloads with SQL/XSS rejected by Zod    │
│ Rate Limit Assault   │ HTTP burst load test          │ Requests $>60$/min receive HTTP 429      │
│ CSRF / CORS Check    │ Headless browser tests        │ Cross-origin POST without secret blocked │
└──────────────────────┴───────────────────────────────┴──────────────────────────────────────────┘
```

---

## 13. Audit Logging Specification

All mutating operations generate an immutable `AuditEvent` object:
```json
{
  "eventId": "evt_7a8b9c0d1e2f",
  "timestamp": "2026-09-08T12:00:00.000Z",
  "actorId": "user_pooja_csc01",
  "actorRole": "Enumerator",
  "action": "SUBMISSION_FINALISED",
  "resourceType": "BENEFICIARY_INTAKE",
  "resourceId": "a8c0f5b1-2c12-4f33-b321-9988aabbccdd",
  "correlationId": "req_1122334455",
  "ipAddressHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "status": "SUCCESS",
  "metadata": {
    "state": "Maharashtra",
    "csc": "Pune Central",
    "hasClinicalAlert": true
  }
}
```
*Note: Personal Identifiable Information (Child Name, Contact, Exact IP) is strictly excluded or cryptographically hashed in audit records.*

---

## 14. Decisions Required Before Production

| Priority | Security Decision Item | Impact If Unresolved | Responsible Authority |
| :---: | :--- | :--- | :---: |
| **P0 (CRITICAL)** | Confirm exact authentication provider: Microsoft Entra ID vs Internal Managed Roster. | Cannot deploy production authentication middleware. | Alliance IT / Leadership |
| **P0 (CRITICAL)** | Formally verify `WEBHOOK_SECRET` implementation in Google Apps Script `1yXEgElXFb0Fb...`. | Risk of unauthorized injection to target sheet. | Lead Architect |
| **P1 (HIGH)** | Ratify local cache retention period (Proposal: 7-day post-sync eviction). | Compliance risk regarding local device data exposure. | Clinical Privacy Lead |
| **P2 (MEDIUM)** | Determine offline biometric/PIN lock timeout (Proposal: 15 minutes). | Usability vs security balance on field Android devices. | Field Operations Lead |

---

## 15. Production-Security Sign-Off Checklist

- [ ] **No Hardcoded Credentials:** Verified zero plain secrets, passwords, or production URLs in repository.
- [ ] **Security Headers Configured:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options active.
- [ ] **Rate Limiting Operational:** Verified 429 response on abusive traffic bursts.
- [ ] **Apps Script Lock & Secret Active:** `X-Webhook-Secret` and `LockService` deployed and verified.
- [ ] **Data Minimisation Enforced:** Masked Aadhaar presentation verified in UI line-lists.
- [ ] **Incident Response Lead Assigned:** Dedicated contact designated for lost field devices.

---
*End of Document 03 — Security & Access Document.*
