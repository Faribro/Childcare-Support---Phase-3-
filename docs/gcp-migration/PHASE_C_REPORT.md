# Phase C Implementation Report: Cloud Run Packaging & Service Configuration

**Date**: November 13, 2026  
**Branch**: `gcp-migration`  
**Target Project**: `cs-p3-production`  
**Staging Service**: `csc-staging` (Region: `asia-south1`)  
**Status**: Completed, Built & Tested (Ready for Phase C Review)

---

## 1. What Changed (Phase C: Task 4)

### C1. Container Packaging & Build Optimization (`Dockerfile` & `.dockerignore`)
- **Multi-Stage Build Pipeline**:
  - `deps` stage: runs `npm ci` with frozen lockfile.
  - `builder` stage: accepts build arguments (`NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STORAGE_PROVIDER`, `NEXT_PUBLIC_DATA_ENGINE`, `NEXT_PUBLIC_GCS_BUCKET`, `GIT_COMMIT_SHA`) and runs `npm run build` producing a standalone Next.js server bundle.
  - `runner` stage: runs slim Node.js 20 under an unprivileged user (`nextjs:nodejs`, UID 1001), exposes port `8080` (Cloud Run convention), sets `HOSTNAME=0.0.0.0`, copies static assets (`public/`, including `india-pincodes.json.gz`), and handles HTTP healthcheck probes.
- **Dockerignore Hardening**: Updated `.dockerignore` to exclude `docs/`, `gas/`, `functions/`, `scripts/`, `src/test/`, `coverage/`, `.env*`, `.firebase/`, and `bun.lock`, keeping image context minimal and deterministic.

### C2. Health, Liveness & Readiness Probes (`/api/health` & `/api/ready`)
- **`/api/health`**:
  - Reports application version (`3.0.0`), commit revision (`K_REVISION` precedence over `GIT_COMMIT_SHA`), runtime environment (`appEnv`), data engine (`dataEngine`), storage provider (`storageProvider`), and Firestore database ID (`firestoreDatabaseId`).
  - Probes live subsystem connectivity (`firestore`, `storageBucket`, `appsScript`) with a 4-second timeout.
  - Zero sensitive secrets, tokens, or internal URLs leaked in output.
- **`/api/ready`**:
  - Lightweight readiness check returning HTTP 200 once Next.js standalone process is accepting traffic.
  - Formatted commit detection with Cloud Run `K_REVISION` fallback.
- Added comprehensive unit tests in `src/app/api/health/route.test.ts`.

### C3. Vercel Decoupling & Hostname Validation
- **Vercel Decoupling (`src/lib/platform/platformRegistry.ts`)**:
  - Checks for Cloud Run runtime (`process.env.K_SERVICE`).
  - Suppresses Vercel preview bypass headers (`x-vercel-protection-bypass`) when running in Cloud Run.
  - Resolves base URLs prioritizing `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_API_BASE_URL` without hardcoding Vercel domain fallbacks.
  - Preserved `vercel.json` in repository as an emergency rollback fallback.
- **Origin & Hostname Allowlist (`src/lib/server/authorisation.ts`)**:
  - Added `getExpectedHosts()` function resolving canonical domains:
    - Custom domain: `childcare.allianceindia.org`
    - Firebase Hosting domains: `cs-p3-production.web.app`, `cs-p3-production.firebaseapp.com`
    - Cloud Run service direct URLs: `*.a.run.app`
    - Local development hosts: `localhost`, `127.0.0.1` (when not in production)
    - Custom overrides via `ALLOWED_HOSTS` env variable.
  - Hardened `validateMutationOrigin` to verify `x-forwarded-host` from Firebase Hosting rewrites against the allowlist.
  - Enforced that synthetic demo mode / test mock bypass is strictly disabled when running on Cloud Run (`K_SERVICE !== undefined`).

### C4. Cloud Scheduler Unified Cron Worker (`/api/workers/cron`)
- Created `src/app/api/workers/cron/route.ts` as a single dispatch endpoint for Cloud Scheduler jobs.
- **Constant-Time HMAC/Secret Comparison**: Uses `crypto.timingSafeEqual` with byte length verification to validate `CRON_SECRET` from either `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`, preventing timing oracle vulnerabilities.
- **Idempotent Queue Draining**: Coordinates background execution of:
  - Google Sheets mirror retry queue (`drainSheetsMirrorRetryQueue`).
  - Export delivery stale lease reclamation (`recoverStaleLeases`).
- Hardened `/api/workers/sheets-mirror/route.ts` to also accept `CRON_SECRET` with constant-time verification.
- Added unit tests in `src/app/api/workers/cron/route.test.ts` (6 passing tests).
- Confirmed GitHub Actions cron workflow (`.github/workflows/queue-workers-cron.yml`) is disabled (`if: false`).

### C5. Deployment Guide & Runbook (`docs/gcp-migration/TASK4_CLOUD_RUN.md`)
- Detailed step-by-step runbook with exact `gcloud` and `firebase` commands (documented only; not executed):
  1. Service account creation (`csc-cloud-run@cs-p3-production.iam.gserviceaccount.com`).
  2. IAM least-privilege role bindings:
     - `roles/datastore.user` (Firestore access)
     - `roles/storage.objectAdmin` (scoped specifically to bucket `cs-p3-childcare-staging`)
     - `roles/iam.serviceAccountTokenCreator` (self-signing V4 GCS upload/download URLs without service account keys)
     - `roles/secretmanager.secretAccessor` (accessing runtime secrets)
  3. Secret Manager secret creation and access grants.
  4. Artifact Registry Docker repository setup (`asia-south1`).
  5. Cloud Build container compilation and packaging.
  6. Cloud Run service deployment (`csc-staging`, min instances 0, max 3, 1 vCPU, 512MiB).
  7. Firebase Hosting rewrite configuration to `csc-staging`.
  8. Cloud Scheduler job creation (`*/5 * * * *` calling `/api/workers/cron`).

### C6. Environment Variable Specification (`.env.example`)
- Completely restructured `.env.example` into 5 clear sections:
  1. **Required**: `APP_ENV`, `NODE_ENV`, `GOOGLE_CLOUD_PROJECT`, `DATA_ENGINE`, `STORAGE_PROVIDER`, `FIRESTORE_DATABASE_ID`, `GCS_BUCKET_NAME`, `SESSION_SECRET`, `WEBHOOK_SECRET`, `APPS_SCRIPT_URL`.
  2. **Optional**: Server bindings, public URLs, allowed hosts, cron secrets, leadership flags, Google OAuth credentials, email dispatch options.
  3. **Staging-Only**: `ALLOW_LIVE_EMAIL_DISPATCH=false` (strictly blocks accidental email delivery to real beneficiaries).
  4. **Production-Only**: `ALLOW_LIVE_EMAIL_DISPATCH=true`.
  5. **Rollback-Only**: Preserved Supabase, Tigris, and Vercel keys for emergency fallback.

---

## 2. What Did NOT Change
- **Main Branch**: `main` remains untouched at commit `da8ac97`.
- **System Defaults**: Default configurations remain `DATA_ENGINE=sheets` and `STORAGE_PROVIDER=tigris`.
- **Legacy Infrastructure**: Live Vercel production deployment, Supabase database, Tigris S3 bucket, production Google Sheet, and Apps Script remain untouched and live.
- **No Remote Git Changes**: No remote branches or commits pushed.
- **No Cloud Mutations**: No `gcloud`, `firebase`, `gsutil`, or deployment commands were run.

---

## 3. Verification & Test Results
- **TypeScript Static Check**: Passed with 0 errors (`bun x tsc --noEmit`).
- **Next.js Production Build**: Succeeded (`bun run build`):
  - 22 static client pages rendered.
  - All dynamic API routes compiled cleanly including `/api/health`, `/api/ready`, `/api/workers/cron`, `/api/workers/sheets-mirror`.
- **Vitest Full Test Suite**:
  - **114 test files passed (100%)**.
  - **1,549 tests passed | 26 skipped | 0 failed** (duration ~260s).
  - Baseline comparison: +40 new unit and integration tests added across Phases B & C without regressions.

---

## 4. Risks & Operational Notes
1. **In-Memory Rate Limiting**: General API endpoint rate limiting remains in-memory per container instance. Under scale-to-zero or multi-instance concurrency, memory state does not persist across cold boots. Critical security lockouts (evaluation credential passwords and IP-based failed attempts) are persisted centrally in Firestore collections (`auth_lockouts`, `auth_attempts`) to prevent brute-force attacks across instances.
2. **Cold Start Latency**: With `min-instances=0`, cold container starts may add 2–4 seconds of latency on the first incoming request. Next.js standalone optimization and stripped image footprint minimize this overhead.
3. **Firebase Hosting Header Forwarding**: Requests routed through Firebase Hosting include `x-forwarded-host: cs-p3-production.web.app`. The application verifies this header against `getExpectedHosts()` in `validateMutationOrigin`.

---

## 5. Needs the Owner (Next Steps & Approvals)
To proceed to **Phase D (Data Seeding & Verification)**, please reply with:
`APPROVE PHASE C`

*(No manual GCP commands need to be run at this time. When you are ready to deploy staging, all exact commands are documented in `docs/gcp-migration/TASK4_CLOUD_RUN.md`.)*
