# Childcare Support Phase 3: Google Cloud Platform Migration Guide

**Target Environment**: Google Cloud Platform (Region: `asia-south1`)  
**Project ID**: `cs-p3-production`  
**Databases**: `staging` (Staging) and `(default)` (Production)  
**Cloud Storage**: `cs-p3-childcare-staging` (Staging bucket)  
**Service Account**: `csc-runtime@cs-p3-production.iam.gserviceaccount.com`  

---

## 1. Initial Account Provisioning & Fresh Start Architecture

> [!IMPORTANT]
> **Data Decision: Fresh Start on Google Cloud**  
> All existing records in Supabase (`rjrctsxdvkfkssqvmhbz`), the historical Google Sheet, and Tigris are dummy/test records. The migration to Google Cloud starts fresh:
> - No data migration scripts are executed (`migrate-supabase-to-firestore`, `migrate-sheets-to-firestore`, `migrate-tigris-to-gcs` have been dropped).
> - `scripts/export-sheets-backup.ts` is retained as a read-only safety snapshot.
> - Provisioning is conducted exclusively through deterministic seed scripts (`seed-credentials`, `seed-leader-identities`).

### Critical Bootstrap Gate
In production and staging environments on Cloud Run, the application operates under `DATA_ENGINE=firestore` and strictly disables environment-variable account fallback (`ALLOW_ENV_CREDENTIAL_FALLBACK=false`).

**Without running the seed scripts below, the Firestore database will be empty, and nobody will be able to sign in.**

### Provisioning Workflow
1. **Seed Evaluation Credentials (`scripts/seed-credentials.ts`)**:
   - Reads accounts from a local JSON file (identifier, role, state, districts).
   - Generates cryptographically random one-time passwords for each account.
   - Hashes passwords with Argon2id and writes credential records to Firestore collection `evaluation_credentials`.
   - **Prints one-time credentials ONCE directly to the local terminal session**. Passwords are never written to disk, git, or log files.
   - Runs in `--dry-run` mode by default. Targets `staging` database by default. Refuses `(default)` production database unless `--confirm-production` is explicitly passed.

2. **Seed Leadership Allowlist (`scripts/seed-leader-identities.ts`)**:
   - Reads allowlisted leaders from a local JSON file or `LEADERSHIP_ALLOWLIST_JSON`.
   - Populates the `leader_identities` collection in Firestore.

3. **Reset Staging (`scripts/reset-staging.ts`)**:
   - Wipes all test documents from `staging` Firestore collections and test objects from `cs-p3-childcare-staging`.
   - Requires interactive confirmation.
   - Hardcoded refusal guard: strictly aborts if attempted against `(default)` database or production bucket.

---

## 2. Cookie Architecture: Firebase Hosting vs. Direct Cloud Run

### A. The Firebase Hosting Cookie Limitation
When traffic is routed through Firebase Hosting rewrites (`cs-p3-production.web.app` or custom domain rewrite) to Google Cloud Run, **Firebase Hosting strips all incoming `Cookie` and outgoing `Set-Cookie` headers EXCEPT a cookie named exactly `__session`**.

Furthermore, Firebase Hosting CDN caches static and dynamic responses unless instructed otherwise. If `Cache-Control` does not disallow caching, Firebase Hosting will strip outgoing `Set-Cookie: __session` headers at the edge!

### B. Complete Application Cookie Inventory

| Cookie Name | Purpose | Flags | Lifespan | Handled Behind Hosting |
| :--- | :--- | :--- | :--- | :--- |
| `evaluation_session_token` (alias: `session_token`) | Authenticated session token for State Reviewers, Admins, and Field Coordinators (HMAC-SHA256 JWT) | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` | 8 hours (28,800s) | Stripped by Hosting unless unified into `__session` |
| `leader_session_id` (alias: `leader_session_token`) | Opaque session ID for individual allowlisted leadership logins | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` | 8 hours (28,800s) | Stripped by Hosting unless unified into `__session` |
| `leader_device_binding` | 128-bit browser cryptographic secret bound to OTP challenge to prevent cross-device phishing and session hijacking | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` | 30 days (2,592,000s) | Stripped by Hosting unless unified into `__session` |
| `google_oauth_state` | Ephemeral CSRF state token for Google OAuth flow | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` | 15 minutes (900s) | Stripped by Hosting unless unified into `__session` |
| `field_onboarding_ticket` | Signed token carrying verified Google identity (`googleSub`, email, name) to profile registration form | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` | 30 minutes (1,800s) | Stripped by Hosting unless unified into `__session` |

### C. The Unified `__session` Cookie Solution
To ensure flawless operation behind Firebase Hosting with **zero security regressions**:
- We provide `src/lib/server/unifiedSessionCookie.ts`.
- When `COOKIE_STRATEGY=unified` or `USE_UNIFIED_SESSION_COOKIE=true` is set, all session tokens and the device binding secret are multiplexed into a single `__session` cookie.
- **Cryptographic Envelope**: The cookie contains a signed JSON envelope signed with `SESSION_SECRET` via HMAC-SHA256:
  ```json
  {
    "evalToken": "...",
    "leaderSessionId": "...",
    "leaderDeviceSecret": "...",
    "oauthState": "...",
    "onboardingTicket": "...",
    "iat": 1731500000000,
    "exp": 1731528800000
  }
  ```
- **Integrity Guarantee**: Tampered envelopes, modified signatures, or expired timestamps are rejected with constant-time verification (`crypto.timingSafeEqual`).
- **Device Binding Intact**: The `leaderDeviceSecret` is preserved across the `request-code` -> `verify-code` flow, maintaining full anti-phishing protection.
- **Anti-Caching Enforcement**: All cookie-mutating endpoints and all `/api/*` routes return:
  ```http
  Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate
  Pragma: no-cache
  ```
  This ensures Firebase Hosting passes `Set-Cookie: __session` through to the browser and never caches authenticated responses at the edge.

### D. Architectural Alternative: Direct Custom Domain on Cloud Run
If you prefer not to use Firebase Hosting's rewrite layer, Google Cloud Run supports direct custom domain mappings:

1. **Direct Domain Mapping**:
   ```bash
   gcloud beta run domain-mappings create \
     --service=csc-staging \
     --domain=childcare.allianceindia.org \
     --region=asia-south1 \
     --project=cs-p3-production
   ```
2. **Advantages of Direct Cloud Run Mapping**:
   - Bypasses Firebase Hosting completely.
   - All standard HTTP cookies (`evaluation_session_token`, `leader_session_id`, `leader_device_binding`) are preserved natively without name stripping.
   - `COOKIE_STRATEGY=default` operates out of the box with zero cookie multiplexing.

---

## 3. Separate Container Builds for Staging and Production

> [!IMPORTANT]
> **Build-Time Inlining of `NEXT_PUBLIC_*` Variables**  
> In Next.js, all environment variables prefixed with `NEXT_PUBLIC_*` are statically replaced and inlined into client JavaScript bundles at compile time (`npm run build`).
>
> Therefore, **a container image compiled for Staging CANNOT be promoted to Production**. Doing so would bake staging public configurations, API URLs, and storage bucket names into production client browsers.
>
> **Staging and Production require separate, dedicated container builds.**

### Build-Time Verification Guard
To prevent accidental misconfiguration, `next.config.mjs` enforces a strict compile-time check:
- If `APP_ENV=staging` is targeted, `NEXT_PUBLIC_APP_ENV` must also be `staging`.
- If `APP_ENV=production` is targeted, `NEXT_PUBLIC_APP_ENV` must also be `production`.
- Any mismatch immediately throws `[BUILD GUARD] Environment mismatch` and aborts compilation before the image can be built.

### Build Commands

```bash
# STAGING BUILD
gcloud builds submit \
  --project=cs-p3-production \
  --tag=asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-app:staging \
  --build-arg="NEXT_PUBLIC_APP_ENV=staging" \
  --build-arg="NEXT_PUBLIC_STORAGE_PROVIDER=gcs" \
  --build-arg="NEXT_PUBLIC_DATA_ENGINE=firestore" \
  --build-arg="NEXT_PUBLIC_GCS_BUCKET=cs-p3-childcare-staging" \
  --build-arg="GIT_COMMIT_SHA=$(git rev-parse HEAD)"

# PRODUCTION BUILD
gcloud builds submit \
  --project=cs-p3-production \
  --tag=asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-app:production \
  --build-arg="NEXT_PUBLIC_APP_ENV=production" \
  --build-arg="NEXT_PUBLIC_STORAGE_PROVIDER=gcs" \
  --build-arg="NEXT_PUBLIC_DATA_ENGINE=firestore" \
  --build-arg="NEXT_PUBLIC_GCS_BUCKET=cs-p3-childcare-production" \
  --build-arg="GIT_COMMIT_SHA=$(git rev-parse HEAD)"
```

---

## 4. Single Runtime Service Account: `csc-runtime`

To eliminate configuration drift and permission fragmentation, exactly **one runtime service account** is used across all environments and documentation:

* **Identity**: `csc-runtime@cs-p3-production.iam.gserviceaccount.com`
* **Roles Granted**:
  1. `roles/datastore.user` (Firestore native read/write)
  2. `roles/storage.objectAdmin` (Cloud Storage bucket read/write/delete)
  3. `roles/iam.serviceAccountTokenCreator` (Keyless V4 signed URL self-generation)
  4. `roles/secretmanager.secretAccessor` (Runtime secret decryption)

---

## 5. Firestore Collection Inventory & TTL Policies

### A. Brute-Force & Account Lockout Defense (`auth_attempts` / `auth_lockouts`)
In multi-instance Cloud Run containers with scale-to-zero, in-memory rate limiting counters reset when instances shut down. An attacker could distribute brute-force password guessing across container instances.

To solve this:
- **`auth_attempts` & `auth_lockouts`**: Stored in Firestore when `DATA_ENGINE=firestore`.
- **Atomic Windows**: Tracks sliding-window failed attempts per credential (`CREDENTIAL_KEY:IP`) and per IP globally (`IP`). Document IDs are sanitized to alphanumeric + hyphen characters.
- **Lockout Enforcement**:
  - 5 failed attempts on a credential: 15-minute credential lockout.
  - 20 failed attempts on an IP: 15-minute global IP lockout.
- **TTL Expiration**: Documents write an `expiresAt` timestamp field. Cloud Firestore native TTL automatically deletes expired attempt and lockout records without background cron overhead.

### B. Complete Collection Inventory

| Collection Name | Purpose | Security Policy | TTL Field | Automatic Expiration |
| :--- | :--- | :--- | :--- | :--- |
| `submissions` | Beneficiary assessments & demographic data | Admin SDK only (`allow: if false`) | None | Permanent durable record |
| `attachment_metadata` | GCS file references, MIME types, signed URL tokens | Admin SDK only (`allow: if false`) | None | Permanent durable record |
| `sheets_mirror_retry_queue` | Upstream Google Sheets synchronization retry queue | Admin SDK only (`allow: if false`) | None | Deleted upon successful drain |
| `evaluation_credentials` | Argon2id-hashed evaluation accounts | Admin SDK only (`allow: if false`) | None | Active until rotated |
| `auth_attempts` | Distributed failed login attempts sliding window | Admin SDK only (`allow: if false`) | `expiresAt` | Lockout window + 5 min (~20m) |
| `auth_lockouts` | Dedicated credential/IP temporary lockout registry | Admin SDK only (`allow: if false`) | `expiresAt` | Lockout duration (~15m-1h) |
| `leadership_sessions` | Active individual leadership session records | Admin SDK only (`allow: if false`) | `expiresAt` | Inactivity (30m) or Absolute (8h) |
| `leader_otp_challenges` | Single-use 128-bit OTP challenge records | Admin SDK only (`allow: if false`) | `expiresAt` | 10 minutes |
| `leader_identities` | Allowlisted leadership directory & roles | Admin SDK only (`allow: if false`) | None | Active until revoked |
| `state_team_registrations` | Pending/approved state coordinator profiles | Admin SDK only (`allow: if false`) | None | Active profile |
| `state_team_invitations` | Single-use field caseworker invitations | Admin SDK only (`allow: if false`) | `expiresAt` | 7 days |
| `state_team_challenges` | State coordinator OTP email challenges | Admin SDK only (`allow: if false`) | `expiresAt` | 15 minutes |
| `field_user_profiles` | Verified field caseworker profiles (Google Auth) | Admin SDK only (`allow: if false`) | None | Active profile |
| `export_preview_contracts` | Ephemeral signed export download contracts | Admin SDK only (`allow: if false`) | `expiresAt` | 15 minutes |
| `export_delivery_jobs` | Bulk export delivery job state and progress | Admin SDK only (`allow: if false`) | `expiresAt` | Configurable (default 90 days) |
| `export_audit_events` | Immutable security audit logs of exported PII | Admin SDK only (`allow: if false`) | None | Permanent compliance record |

### C. Exact gcloud TTL Commands (Documented Only)

Run these commands to enable native Firestore TTL policies on the expiring collections for both databases:

```bash
# ------------------------------------------------------------------------------
# STAGING DATABASE (staging)
# ------------------------------------------------------------------------------
gcloud firestore fields ttls update expiresAt \
  --collection-group=auth_attempts \
  --database=staging \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=auth_lockouts \
  --database=staging \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=leadership_sessions \
  --database=staging \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=leader_otp_challenges \
  --database=staging \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=state_team_challenges \
  --database=staging \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=state_team_invitations \
  --database=staging \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=export_delivery_jobs \
  --database=staging \
  --project=cs-p3-production \
  --enable-ttl

# ------------------------------------------------------------------------------
# PRODUCTION DATABASE ((default))
# ------------------------------------------------------------------------------
gcloud firestore fields ttls update expiresAt \
  --collection-group=auth_attempts \
  --database="(default)" \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=auth_lockouts \
  --database="(default)" \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=leadership_sessions \
  --database="(default)" \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=leader_otp_challenges \
  --database="(default)" \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=state_team_challenges \
  --database="(default)" \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=state_team_invitations \
  --database="(default)" \
  --project=cs-p3-production \
  --enable-ttl

gcloud firestore fields ttls update expiresAt \
  --collection-group=export_delivery_jobs \
  --database="(default)" \
  --project=cs-p3-production \
  --enable-ttl
```

---

## 6. Staging Smoke-Test Checklist

Perform these sequential verifications once `csc-staging` is deployed:

- [ ] **1. Health & Liveness Probes**:
  - Request `GET /api/health` -> verify HTTP 200, commit revision, and subsystem statuses (`firestore: ok`, `storageBucket: ok`, `appsScript: ok`).
  - Request `GET /api/ready` -> verify HTTP 200.
- [ ] **2. Evaluation Authentication**:
  - Sign in with seeded `STATE-MH` credential -> verify session established.
  - Attempt 5 invalid logins -> verify 429 Account Locked via distributed Firestore rate limiter.
- [ ] **3. Leadership Email OTP Login**:
  - Request OTP code for allowlisted leader -> verify mock/staging email dispatched.
  - Verify code on same device -> verify session cookie (`__session` or `leader_session_id`) set with `Cache-Control: private, no-store`.
- [ ] **4. Assessment Record Lifecycle**:
  - Create beneficiary submission in Maharashtra -> verify record saved to Firestore `submissions`.
  - Confirm duplicate prevention and idempotency key handling.
- [ ] **5. File Upload & GCS Enforcement**:
  - Upload child photo and consent document -> verify keyless V4 signed URL generated by `csc-runtime`.
  - Confirm `x-goog-content-length-range` enforces 3 MB ceiling on Google Cloud Storage.
- [ ] **6. Upstream Google Sheets Mirroring**:
  - Verify new record is asynchronously forwarded to Google Sheets via Apps Script web app.
  - Simulate Apps Script temporary outage -> verify record enqueued in Firestore `sheets_mirror_retry_queue`.
- [ ] **7. Cloud Scheduler Cron Execution**:
  - Invoke `POST /api/workers/cron` with `Authorization: Bearer <CRON_SECRET>` -> verify HTTP 200 and retry queue drained.
- [ ] **8. Export Security & Audit Logging**:
  - Initiate report export -> verify confirmation token created, job recorded, and audit log written to `export_audit_events`.

---

## 7. Post-Cutover Cleanup Runbook (For the Project Owner)

After final production verification of Google Cloud Platform:

1. **Safety Backup**: Run `bun scripts/export-sheets-backup.ts` to archive a final read-only snapshot of legacy Google Sheets data.
2. **Pause Supabase**: In Supabase Project Dashboard (`rjrctsxdvkfkssqvmhbz`), go to **Settings -> General** and select **Pause Project** to cease database usage.
3. **Reset Legacy Google Sheet**: Clear data rows from the historical Google Sheet, leaving all **85 canonical column headers intact**.
4. **Empty Legacy Tigris Bucket**: Empty and delete the Tigris S3 bucket, then revoke the corresponding AWS access keys.
5. **Deactivate Legacy Vercel Deployment**: In Vercel Project Dashboard, cancel active builds and archive the project.
6. **Rotate Secrets**: Rotate `SESSION_SECRET`, `WEBHOOK_SECRET`, `APPS_SCRIPT_DISPATCH_SECRET`, and `CRON_SECRET` in Google Cloud Secret Manager.
