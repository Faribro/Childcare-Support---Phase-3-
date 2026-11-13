# Phase A Report: Housekeeping, Verification & Preflight Audit

> **Branch**: `gcp-migration`  
> **Commit Range**: `242ddd9` .. `da2315b`  
> **Repository Worktree**: `D:\OneDrive - INDIA HIV AIDS ALLIANCE\Desktop\Software Development\Childcare-Main-Verify`  
> **Target Production**: Frozen at commit `520f1a4` / Apps Script Version 35 (Untouched)  
> **Local Main**: `da8ac97c8f9f0c2edb0dc20abdfb652691adb2df` (Untouched)

---

## 1. Needs the Owner

*All actions below are documented reference commands only. Do not execute them until deployment approval.*

1. **Bucket CORS Configuration**:
   When ready to allow direct browser client uploads to the staging Cloud Storage bucket, apply `cors.json` via:
   ```bash
   gcloud storage buckets update gs://cs-p3-childcare-staging --cors-file=cors.json
   ```
2. **Cloud Run Runtime Service Account IAM**:
   The runtime identity `csc-runtime@cs-p3-production.iam.gserviceaccount.com` requires `roles/iam.serviceAccountTokenCreator` on itself to perform keyless V4 signed URL generation via the IAM Credentials API.

---

## 2. What Changed

1. **Integrated `main` (`da8ac97`) into `gcp-migration`**:
   - Merged Apps Script idempotency-key cache pruning, preview staging overrides for Apps Script URL, and removal of the default "Mother" relationship.
   - Clean merge completed with zero merge conflicts (`242ddd9`).
2. **GCS Signed Upload Enforcement (`x-goog-content-length-range`)**:
   - `GcsStorageService.getSignedUploadUrl()` now signs the `x-goog-content-length-range` header (`1,3145728`) on V4 PUT URLs, capping client uploads to 3 MB (3,145,728 bytes).
   - Returns `requiredHeaders` (`Content-Type` and `x-goog-content-length-range`) and `contentLengthRange` to calling clients.
   - Implemented and exported `uploadToGcsSignedUrl()` to transmit the required headers during client uploads and reject payloads $> 3,145,728$ bytes with HTTP 413.
   - Documented the exact Google Cloud Storage bucket CORS JSON policy supporting `PUT`, `GET`, and `OPTIONS`.
3. **IPv4 and IPv6 Address Sanitization for Firestore Document IDs**:
   - Exported `sanitizeIpForDocId(ip)` in `credentialRegistry.ts` to convert arbitrary IP formats (IPv4 dots, IPv6 colons, brackets, interface identifiers) into Firestore-safe document identifiers (e.g., `2001:db8::1` $\to$ `2001_db8__1`).
   - Confirmed brute-force lockout thresholds match the pre-migration baseline (5 attempts per credential+IP, 20 attempts per IP in a 5-minute window; 15-minute temporary lockout).
4. **Environment Variable Inventory & Secret Manager Alignment**:
   - Audited all 112 unique `process.env` references across the codebase.
   - Established the definitive table of primary secret names, legacy aliases, and plain configuration variables.
   - Documented the strict exclusion of LLM prototype keys and initial seed passwords from Secret Manager.
   - Enforced `ALLOW_LIVE_EMAIL_DISPATCH=false` for staging.
5. **Dockerfile & Container Packaging Audit**:
   - Confirmed `Dockerfile` and `.dockerignore` are tracked in git on `gcp-migration`.
   - Updated `.dockerignore` to exclude `.env*`, `docs/`, test suites, and temporary assets.
   - Verified the runtime inclusion of `public/data/india-pincodes.json.gz`.

---

## 3. What Did NOT Change

1. **Production Systems Untouched**:
   - Vercel production deployment (`520f1a4` / `dpl_6Xv8Cq9MyUiQBcBH7Q8zLig8S9zU`) is frozen and completely untouched.
   - Production Google Sheet and Apps Script (Version 35) remain active and undisturbed.
   - Supabase and Fly.io Tigris S3 remain active and untouched.
   - Public DNS (`childcare.allianceindia.org`) was not modified.
2. **Local `main` Untouched**:
   - Local `main` remains at commit `da8ac97`. It was not modified, rebased, or pushed.
3. **Default Behavior Preserved**:
   - `DATA_ENGINE` defaults to `sheets`.
   - `STORAGE_PROVIDER` defaults to `tigris`.
   - The application functions identically to its pre-migration baseline unless explicit environment flags are enabled.
4. **Zero Live GCP Mutations**:
   - No `gcloud`, `firebase`, or `gsutil` commands were executed.

---

## 4. Test & Build Numbers vs Baseline

| Metric | Last Baseline | Phase A Result | Status |
| :--- | :--- | :--- | :--- |
| **Test Files** | 111 files | **112 files** | +1 test file passed |
| **Passed Tests** | 1,509 passed | **1,514 passed** | +5 new verification tests |
| **Skipped Tests** | 26 skipped | **26 skipped** | Unchanged |
| **Failed Tests** | 0 failed | **0 failed** | Zero failures |
| **TypeScript (`tsc`)**| Clean | **Clean** (`tsc --noEmit` exit 0) | Zero type errors |
| **Production Build** | Succeeded | **Succeeded** (`bun run build` exit 0) | Standalone output created |

### Breakdown of the 5 New Tests:
1. `src/test/credential-firestore-registry.test.ts`: IPv4 and IPv6 sanitization into valid Firestore document IDs and verification of pre-migration thresholds.
2. `src/test/gcs-storage-service.test.ts`: Inclusion of `x-goog-content-length-range` in V4 signed headers.
3. `src/test/gcs-storage-service.test.ts`: Return of `contentLengthRange` and `requiredHeaders` in `getSignedUploadUrl`.
4. `src/test/gcs-storage-service.test.ts`: Client upload transmission via `uploadToGcsSignedUrl` with required headers attached.
5. `src/test/gcs-storage-service.test.ts`: Immediate client-side rejection of oversized payloads ($> 3,145,728$ bytes) with HTTP 413 `Payload Too Large`.

---

## 5. Environment Variables & Secret Manager Inventory

### 5.1 Primary Secret Names vs Legacy Aliases
The table below specifies the **primary secret name** (the one the code evaluates first) to be provisioned in Google Cloud Secret Manager for Cloud Run:

| Primary Secret Name | Legacy Aliases Read Second | Consumer Module | Secret vs Plain Config |
| :--- | :--- | :--- | :--- |
| `SESSION_SECRET` | - | `src/lib/server/sessionService.ts` | **Secret** (Secret Manager) |
| `LEADERSHIP_SESSION_SECRET` | - | `src/lib/server/invitationCrypto.ts` | **Secret** (Secret Manager) |
| `APPS_SCRIPT_DISPATCH_SECRET` | `APPS_SCRIPT_SECRET`, `APPS_SCRIPT_API_KEY` | `src/lib/server/canonicalSubmissionAdapter.ts` | **Secret** (Secret Manager) |
| `WEBHOOK_SECRET` | `APPS_SCRIPT_WEBHOOK_SECRET`, `WEBHOOK_SHARED_SECRET` | `src/app/api/sync/route.ts` | **Secret** (Secret Manager) |
| `GOOGLE_CLIENT_SECRET` | - | `src/lib/server/googleAuth.ts` | **Secret** (Secret Manager) |
| `META_APP_SECRET` | `WHATSAPP_APP_SECRET` | `src/features/whatsapp-document-loop/` | **Secret** (Secret Manager) |
| `META_ACCESS_TOKEN` | `WHATSAPP_ACCESS_TOKEN` | `src/features/whatsapp-document-loop/` | **Secret** (Secret Manager) |
| `META_WEBHOOK_VERIFY_TOKEN` | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `src/features/whatsapp-document-loop/` | **Secret** (Secret Manager) |
| `CRON_SECRET` | - | `src/app/api/workers/` | **Secret** (Secret Manager) |
| `DIAGNOSTICS_SECRET` | `INTERNAL_AUTH_SECRET` | `src/app/api/supervisor/diagnostics/` | **Secret** (Secret Manager) |
| `RESEND_API_KEY` | - | `src/lib/server/email/` | **Secret** (Secret Manager) |
| `SMTP_PASS` | - | `src/lib/server/email/` | **Secret** (Secret Manager) |

### 5.2 Excluded from Secret Manager & Rationale
1. **`OPENROUTER_API_KEY` / `NVIDIA_API_KEY` / `PERPLEXITY_API_KEY`**:
   - **Rationale**: Prototype keys used solely in optional developer research scripts (`scripts/deep-research/`). They are **not** referenced by core application intake, evaluation, or supervisor workflows and must not be loaded into Cloud Run.
2. **`INITIAL_ADMIN_PASSWORD` / `INITIAL_LEADERSHIP_PWD` / `INITIAL_*_PWD`**:
   - **Rationale**: Temporary seed values used exclusively during offline bootstrap (`scripts/migrate-credentials-to-firestore.ts`). At runtime, credentials authenticate against Argon2id salted hashes in Firestore `evaluation_credentials`. In-memory environment variable fallback is disabled in production (`ALLOW_ENV_CREDENTIAL_FALLBACK=false`).

### 5.3 Plain Runtime Configuration (`--set-env-vars`)
| Variable Name | Staging Value | Purpose |
| :--- | :--- | :--- |
| `APP_ENV` | `staging` | Runtime environment identifier |
| `NEXT_PUBLIC_APP_ENV` | `staging` | Client-exposed environment indicator |
| `DATA_ENGINE` | `firestore` | Authoritative datastore engine |
| `FIRESTORE_DATABASE_ID` | `staging` | Dedicated staging Firestore instance |
| `STORAGE_PROVIDER` | `gcs` | Private binary document storage engine |
| `GCS_BUCKET_NAME` | `cs-p3-childcare-staging` | Target GCS bucket (*primary name read by code*) |
| `GCS_SIGNING_SERVICE_ACCOUNT` | `csc-runtime@cs-p3-production.iam.gserviceaccount.com` | Service account for keyless V4 signed URLs |
| `GOOGLE_CLOUD_PROJECT` | `cs-p3-production` | GCP Project ID |
| `ALLOW_LIVE_EMAIL_DISPATCH` | `false` | **Enforced false on staging** to prevent test email delivery |
| `WHATSAPP_WEBHOOK_ENABLED` | `false` | Disabled during initial migration gates |
| `APPS_SCRIPT_URL` | `<staging-apps-script-url>` | Secondary reporting mirror endpoint |

---

## 6. Bucket CORS Policies (`cors.staging.json` & `cors.production.json`)

Google Cloud Storage requires exact origins (no wildcards such as `*.a.run.app`). Staging permits local development origins; production is strictly restricted to production domains and Firebase Hosting.

### Staging Policy (`cors.staging.json`):
```json
[
  {
    "origin": [
      "https://childcare.allianceindia.org",
      "https://cs-p3-production.web.app",
      "https://cs-p3-production.firebaseapp.com",
      "https://<EXACT-CLOUD-RUN-STAGING-URL>.a.run.app",
      "http://localhost:3000"
    ],
    "method": ["PUT", "GET", "OPTIONS"],
    "responseHeader": [
      "Content-Type",
      "x-goog-content-length-range",
      "ETag"
    ],
    "maxAgeSeconds": 3600
  }
]
```

### Production Policy (`cors.production.json`):
```json
[
  {
    "origin": [
      "https://childcare.allianceindia.org",
      "https://cs-p3-production.web.app",
      "https://cs-p3-production.firebaseapp.com",
      "https://<EXACT-CLOUD-RUN-PROD-URL>.a.run.app"
    ],
    "method": ["PUT", "GET", "OPTIONS"],
    "responseHeader": [
      "Content-Type",
      "x-goog-content-length-range",
      "ETag"
    ],
    "maxAgeSeconds": 3600
  }
]
```

---

## 7. Task 4 Dockerfile Compliance Matrix

The `Dockerfile` tracked on `gcp-migration` was audited against Task 4 requirements:

| Task 4 Requirement | Implementation in Dockerfile | Compliance |
| :--- | :--- | :--- |
| Multi-stage architecture | 3 stages: `deps` (Node 20 slim), `builder`, `runner` | **Compliant** |
| Next.js standalone output | Copies `.next/standalone` and `.next/static` | **Compliant** |
| Dynamic Port Listening | `ENV PORT=8080`, `EXPOSE 8080` | **Compliant** |
| Non-loopback Host Binding | `ENV HOSTNAME="0.0.0.0"` | **Compliant** |
| Unprivileged Security User | Runs under UID 1001 `nextjs:nodejs` | **Compliant** |
| Lightweight Runner Footprint | Debian slim runner, excludes devDependencies & compilers | **Compliant** |
| Zero Baked-in Secrets | `.dockerignore` excludes `.env*`, `.git`, `docs/`, `tests` | **Compliant** |
| Runtime Assets Included | `COPY --from=builder /app/public ./public` includes `public/data/india-pincodes.json.gz` | **Compliant** |
| Native Module Compatibility | Debian slim glibc ensures `argon2` and `sharp` run natively | **Compliant** |

---

## 8. Risk Assessment

1. **CORS Misconfiguration on GCS Bucket**:
   - *Risk*: If `cors.json` is not applied prior to testing signed uploads, web browsers will block the direct PUT request during preflight (`OPTIONS`).
   - *Mitigation*: Detailed in owner checklist for Phase C. Direct server-side uploads (`uploadAttachment`) serve as a robust zero-downtime fallback.
2. **Cloud Run Concurrency & Apps Script Rate Limits**:
   - *Risk*: Apps Script has a soft limit of ~30 concurrent executions. Rapid bursts from Cloud Run could queue or drop mirror requests.
   - *Mitigation*: The `sheets_mirror_retry_queue` in Firestore buffers failed mirror requests with exponential backoff and dead-letter capping.

---

## 9. Next Steps (Pending Owner Approval)

Awaiting user code word: **`APPROVE PHASE A`** to proceed to:
- **Phase B1**: Leadership Auth (`leaderAuthStore.ts`) in Firestore (`leader_otp_challenges`, `leadership_sessions`).
- **Phase B2**: Onboarding Store (`onboardingStore.ts`) in Firestore.
- **Phase B3**: Export Audit (`export-confirmation-store.ts`) in Firestore.
- **Phase B4**: Leadership Reporting Sessions inspection.
- **Phase B5**: WhatsApp Inbound verification (remain disabled safely).
- **Phase B6/B7**: Integration tests, collection rules, TTL commands, and indexes.
