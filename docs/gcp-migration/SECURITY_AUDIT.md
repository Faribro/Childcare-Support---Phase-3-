# GCP Migration: Comprehensive Security Audit & API Surface Review

This document provides a complete security review of all **39 API routes**, cryptographic authentication boundaries, storage path controls, and logging sanitization in `Childcare-Main-Verify` on branch `gcp-migration`.

---

## 1. API Route Security Matrix (39 Routes)

| # | Route | HTTP Methods | Authentication | Authorized Roles | Rate Limiting / Guard | Security Risk & Controls |
|---|---|---|---|---|---|---|
| 1 | `/api/admin/registrations` | GET | Session Token | `ADMIN`, `LEADERSHIP` | Standard | Low. Strict RBAC enforcement. |
| 2 | `/api/admin/registrations/[id]/approve` | POST | Session Token | `ADMIN`, `LEADERSHIP` | CSRF Origin Check | Low. Mutation origin verified, audit logged. |
| 3 | `/api/admin/registrations/[id]/notify` | POST | Session or Dispatch Secret | `ADMIN`, `LEADERSHIP`, Service | CSRF / Secret | Low. Constant-time dispatch secret or session. |
| 4 | `/api/admin/registrations/[id]/reject` | POST | Session Token | `ADMIN`, `LEADERSHIP` | CSRF Origin Check | Low. Audit logged rejection. |
| 5 | `/api/auth/field-user/complete-onboarding` | POST | Onboarding Ticket | `FIELD_USER` | 20 / min per IP | Low. Single-use ticket redemption. |
| 6 | `/api/auth/field-user/ticket` | GET | Onboarding Ticket | Pre-Auth Onboarding | 20 / min per IP | Low. Read-only ticket validation. |
| 7 | `/api/auth/google/callback` | GET | Google OAuth Code/State | Anonymous -> Field User | 10 / min per IP | Low. Validates Google ID token via Google APIs. |
| 8 | `/api/auth/google/login` | GET | None (OAuth Redirect) | Public | 30 / min per IP | Low. Initiates PKCE OAuth challenge. |
| 9 | `/api/auth/leader/directory` | GET | Leader Session Token | `ADMIN`, `LEADERSHIP` | 60 / min per IP | Low. Read-only leader directory. |
| 10 | `/api/auth/leader/logout` | POST | Leader Session Token | Public / Active Leader | None | Low. Revokes session, invalidates cookie. |
| 11 | `/api/auth/leader/request-code` | POST | Email Allowlist | Public (Registered Leaders) | 5 / 15m email, 20 / 15m IP | Medium. Distributed Firestore rate limiter prevents spam. |
| 12 | `/api/auth/leader/session` | GET | Leader Session Token | `LEADERSHIP` | Polling-safe (`x-poll`) | Low. Returns role and assigned states. |
| 13 | `/api/auth/leader/status` | GET | None | Public | Standard | Low. Reports whether leadership email auth is enabled. |
| 14 | `/api/auth/leader/verify-code` | POST | OTP + Device Secret | Public | 5 attempts / 15m | Medium. Device-bound cookie prevents OTP interception. |
| 15 | `/api/auth/login` | POST | Evaluation Credentials | Public (State Teams) | 5 / 15m cred, 20 / 15m IP | High. Argon2id hashed (64MB, t=3, p=4), Firestore lockout. |
| 16 | `/api/auth/logout` | POST | None | Public | None | Low. Clears cookie envelope and session headers. |
| 17 | `/api/auth/session` | GET | Session Token | Authenticated Users | Standard | Low. Returns verified scope and profile. |
| 18 | `/api/auth/state-team/invitation/issue` | POST | Session Token | `ADMIN`, `LEADERSHIP` | 20 / hr | Medium. Generates cryptographically secure token. |
| 19 | `/api/auth/state-team/register` | POST | Invitation Token | Public | 10 / min per IP | Low. Single-use registration token validation. |
| 20 | `/api/auth/state-team/verify-otp` | POST | Registration OTP | Public | 5 attempts / 15m | Low. Atomic attempt counter in Firestore. |
| 21 | `/api/geocode/reverse` | GET, POST | None / Optional Session | Public / Field User | In-memory cache + 60/m | Low. Coordinates bounded to Indian subcontinent. |
| 22 | `/api/health` | GET | None | Public (Health Probe) | Unrestricted | Low. Liveness probe; no sensitive diagnostics exposed. |
| 23 | `/api/integrations/whatsapp/webhook` | GET, POST | Meta HMAC-SHA256 | Meta Webhooks | Webhook validator | Medium. Validates `x-hub-signature-256`. |
| 24 | `/api/ready` | GET | None | Public (Readiness Probe) | Unrestricted | Low. Checks database connectivity only. |
| 25 | `/api/reference-data` | GET | None | Public | In-memory cached | Low. Static geographic dropdown data. |
| 26 | `/api/reference-data/state-srs` | GET | None | Public | In-memory cached | Low. State sub-recipient reference data. |
| 27 | `/api/submissions` | GET, POST | Session Token | `FIELD_USER`, `SUPERVISOR`, `ADMIN` | 100/min user, 300/min IP | High. Geographic scoping server-side, DPDP Act PII redaction. |
| 28 | `/api/submissions/summary` | GET | Session Token | `SUPERVISOR`, `LEADERSHIP`, `ADMIN` | 60 / min | Medium. Aggregate counts geographically scoped. |
| 29 | `/api/submissions/[submissionId]` | GET, PATCH, DELETE | Session Token | `FIELD_USER`, `SUPERVISOR`, `ADMIN` | 150 / min | High. Strict geographic scoping (`isStateAuthorized`), CSRF. |
| 30 | `/api/submissions/[submissionId]/asset` | GET, POST, PUT | Session Token | `FIELD_USER`, `SUPERVISOR` | 50 / min | High. Signed V4 GCS URL, MIME check, size capped (3MB). |
| 31 | `/api/submissions/[submissionId]/export` | GET | Session Token | `SUPERVISOR`, `LEADERSHIP`, `ADMIN` | 10 / min | High. Scope verified, audit logged to `export_audit_events`. |
| 32 | `/api/submissions/[submissionId]/history` | GET | Session Token | `SUPERVISOR`, `ADMIN` | 60 / min | Medium. Audit history for record edits. |
| 33 | `/api/submissions/[submissionId]/replace-document` | POST | Session Token | `SUPERVISOR` | 20 / min | Medium. Document replacement with audit trail. |
| 34 | `/api/submissions/[submissionId]/sync-retry` | POST | Session Token | `SUPERVISOR`, `ADMIN` | 20 / min | Low. Triggers upstream sync retry. |
| 35 | `/api/supervisor/diagnostics` | GET | Session or Timing-Safe Secret | `SUPERVISOR`, `ADMIN`, `LEADERSHIP` | Timing-safe compare | Medium. Sealed in staging/prod behind secret/auth. |
| 36 | `/api/sync` | POST | Session Token | `FIELD_USER`, `SUPERVISOR` | 60 / min | High. Offline batch sync, deduplication by client ID. |
| 37 | `/api/workers/cron` | POST, GET | Constant-Time Secret | Cloud Scheduler | Constant-time compare | High. Protected by `CRON_SECRET` with SHA-256 constant-time compare. |
| 38 | `/api/workers/export-delivery` | POST | Constant-Time Secret | Internal Worker | Constant-time compare | Medium. Background export delivery processor. |
| 39 | `/api/workers/sheets-mirror` | POST | Constant-Time Secret | Internal Worker | Constant-time compare | Medium. Drains sheets mirror retry queue. |

---

## 2. Server-Side Geographic Scoping & ID Tampering Protection

All record operations (`GET`, `PATCH`, `DELETE`, `asset`, `export`) strictly enforce geographic authorization:
1. When a user requests `/api/submissions/[submissionId]`, the record is retrieved by ID.
2. The record's state and district are extracted from the underlying database document (`recordState`, `recordDistrict`).
3. The server validates that the caller's session explicitly permits access to that state and district (`isStateAuthorized(scope, recordState)` and `isDistrictAuthorized(scope, recordState, recordDistrict)`).
4. If a user tampers with the URL to access a submission belonging to another state:
   - Request is immediately aborted with HTTP 403 `FORBIDDEN_SCOPE`.
   - A structured security audit event is logged with `SCOPE_VIOLATION`.
   - Zero sensitive beneficiary data is returned.

---

## 3. Storage Security & Path Traversal Neutralization

In `src/lib/server/gcsStorageService.ts`:
- **Storage Bucket**: Strictly read from server environment configuration (`GCS_BUCKET_NAME`), never accepting user or query input.
- **Key Generation (`buildStorageKey`)**:
  - `cleanSub = submissionId.replace(/[^a-zA-Z0-9_-]/g, '_')`
  - `cleanDoc = docType.replace(/[^a-zA-Z0-9_-]/g, '_')`
  - All directory traversal characters (`.` and `/`) are replaced with underscores.
- **Reference Parsing (`parseStorageRef`)**:
  - Automatically neutralizes all directory traversal sequences (`\.\.`).
  - Collapses redundant slashes (`/+` -> `/`).
- **GCS Signed Upload Enforcement**:
  - Keyless V4 signed PUT URLs signed via Cloud Run service account ADC identity (`csc-runtime`).
  - `x-goog-content-length-range` signed into the URL (`1,3145728`) enforcing a strict 3 MB ceiling at the Cloud Storage edge before any byte is written.
  - Strict MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

---

## 4. Timing-Safe Secret Verification

In both `/api/workers/cron` and `/api/supervisor/diagnostics`:
- Secret comparison hashes both candidate and expected secrets with **SHA-256** before invoking `crypto.timingSafeEqual`:
  ```typescript
  const pHash = crypto.createHash('sha256').update(provided).digest();
  const eHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(pHash, eHash);
  ```
- This guarantees fixed 32-byte buffers regardless of input length, completely eliminating side-channel length-leakage attacks.
- Rejection responses are identical (HTTP 401 `UNAUTHORIZED`) across missing, short, long, and incorrect secrets.

---

## 5. Log Sanitization Verification

A repository-wide scan for `console.log`, `console.error`, and `console.warn` confirmed:
- Zero raw request bodies logged.
- Zero passwords, Argon2 hashes, OTP tokens, or session secrets logged.
- Beneficiary Aadhaar numbers, bank account numbers, IFSC codes, and mobile numbers are completely redacted via `src/lib/server/errorLogger.ts` regex pattern `/secret|token|key|password|authorization|cookie|aadhaar|bankaccount|ifsc|signaturedataurl|photourl|lat|lng/i`.
- Phone numbers in WhatsApp integration are masked (e.g. `919876****12`).
