# GCP Migration Audit: Supabase, Tigris/S3, and Vercel Touchpoints

This audit documents every location where Childcare Support Phase 3 currently touches **Supabase**, **Tigris (S3)**, and **Vercel**, along with their proposed Google Cloud replacements under the new target architecture:
- **App Runtime**: Google Cloud Run (asia-south1), Next.js standalone container.
- **Data Engine**: Google Cloud Firestore (Native mode, asia-south1), behind `DATA_ENGINE=sheets|firestore`.
- **Storage Provider**: Google Cloud Storage (asia-south1, signed URLs), behind `STORAGE_PROVIDER=tigris|gcs`.
- **Mirror / Reporting**: Google Sheets via Apps Script (`gas/Code.js`) remains active as durable secondary mirror.

---

## Comprehensive Touchpoint & Replacement Audit Table

| Category | File Path | Current Functionality | Google Cloud Replacement |
| :--- | :--- | :--- | :--- |
| **Data Layer** | `src/lib/server/canonicalSubmissionAdapter.ts` | Dispatches submission lifecycle operations (`CREATE`, `UPDATE`, `GET`, `LIST`) based on `STORAGE_ENGINE=sheets\|supabase`. | Add `DATA_ENGINE=sheets\|firestore` switch (defaulting to `sheets`). Route to new `FirestoreSubmissionAdapter` when set to `firestore`. |
| **Data Layer** | `src/lib/server/supabaseSubmissionAdapter.ts` | Direct PostgREST HTTP queries to Supabase `submissions`, `submission_attachments`, and `sheets_mirror_queue`. | Keep unchanged as legacy fallback during migration. Create `src/lib/server/firestoreSubmissionAdapter.ts` using `@google-cloud/firestore` Admin SDK. |
| **Data Layer** | `src/lib/server/sheetsMirrorWorker.ts` | Drains queued submissions from Supabase table `sheets_mirror_queue` and posts to Google Apps Script. | Adapt to support draining from Firestore collection `sheets_mirror_queue` (retries stored in Firestore with exponential backoff). |
| **Data Layer** | `src/app/api/submissions/[submissionId]/sync-retry/route.ts` | Retries individual failed sheets mirror entries in Supabase. | Update to query and update retry status in Firestore when `DATA_ENGINE=firestore`. |
| **Data Layer** | `src/app/api/workers/sheets-mirror/route.ts` | Webhook route triggering sheets mirror queue drain. | Compatible with Google Cloud Scheduler HTTP POST target with `Authorization: Bearer <WEBHOOK_SECRET>`. |
| **Auth / Store** | `src/lib/server/credentialRegistry.ts` | Evaluator credentials and argon2 password hashes in Supabase `evaluation_user_credentials`. | Provide Firestore collection `evaluation_credentials` store behind the registry interface. |
| **Auth / Store** | `src/lib/server/onboardingStore.ts` | State team onboarding applications in Supabase `state_team_registrations`. | Provide Firestore collection `state_team_registrations` store behind the onboarding interface. |
| **Auth / Store** | `src/lib/server/leaderAuthStore.ts` | Leadership session tokens and device bindings in Supabase `leadership_sessions`. | Provide Firestore collection `leadership_sessions` store behind the leader auth store interface. |
| **Auth / Store** | `src/features/beneficiary-flow/durable-session-store.ts` | WhatsApp beneficiary conversation states in Supabase `beneficiary_whatsapp_sessions`. | Provide Firestore collection `beneficiary_sessions` store. |
| **Auth / Store** | `src/features/leadership-reporting/session-repository.ts` | Leadership access sessions in Supabase `leader_identity_sessions`. | Provide Firestore collection `leader_sessions` store. |
| **Auth / Store** | `src/features/leadership-reporting/export-confirmation-store.ts` | Audit records for CSV/ZIP exports in Supabase `export_download_audit`. | Provide Firestore collection `export_audits` store. |
| **Auth / Store** | `src/features/whatsapp-document-loop/persistence.ts` | Inbound WhatsApp media and message metadata in Supabase `whatsapp_messages`. | Provide Firestore collection `whatsapp_messages` store. |
| **Reference Data** | `src/app/api/reference-data/state-srs/route.ts` | Queries state sub-recipients registry table in Supabase. | Add Firestore collection `state_sub_recipients` fallback/lookup when `DATA_ENGINE=firestore`. |
| **Storage** | `src/lib/server/tigrisStorageService.ts` | AWS S3 client (`@aws-sdk/client-s3`) targeting Tigris endpoint (`fly.storage.tigris.dev`), generates presigned upload/download URLs. | Add `STORAGE_PROVIDER=tigris\|gcs` switch (defaulting to `tigris`). Implement `GcsStorageService` using `@google-cloud/storage` generating v4 signed URLs. |
| **Storage** | `src/features/whatsapp-document-loop/tigris-storage-adapter.ts` | Persists WhatsApp document uploads to Tigris bucket. | Abstract behind `StorageAdapter` interface routing to GCS bucket when `STORAGE_PROVIDER=gcs`. |
| **Storage** | `src/app/api/submissions/[submissionId]/asset/route.ts` | Returns signed download URLs for passbooks, photos, marksheet attachments. | Direct to GCS signed download URL when `STORAGE_PROVIDER=gcs`. |
| **Config & Env** | `src/lib/server/envConfig.ts` | Validates `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_ENV`. | Add validation for `DATA_ENGINE`, `STORAGE_PROVIDER`, `GCS_BUCKET_NAME`, `GOOGLE_CLOUD_PROJECT`. |
| **Health / Diag** | `src/app/api/health/route.ts` | Reports `environment`, `storageEngine`, connectivity to Supabase, Apps Script, Tigris. | Update to report: `appVersion`, `dataEngine`, `storageProvider`, `nextPublicAppEnv`, and connectivity status of Firestore, GCS, and Apps Script. |
| **Health / Diag** | `src/app/api/ready/route.ts` | Reads `VERCEL_GIT_COMMIT_SHA`, `RENDER_GIT_COMMIT`. | Add support for `K_REVISION`, `GIT_COMMIT_SHA` from Cloud Run. |
| **Platform** | `src/lib/platform/platformRegistry.ts` | Inspects `process.env.VERCEL` to determine host platform. | Add detection for Google Cloud Run (`process.env.K_SERVICE`, `process.env.K_REVISION`). |
| **Platform** | `src/lib/server/authorisation.ts` | References `process.env.VERCEL_ENV` for environment checks. | Support `process.env.APP_ENV` and Cloud Run environments without Vercel dependency. |
| **Hosting Config** | `vercel.json` | Vercel build configuration (`framework: nextjs`, `installCommand`). | Keep for legacy Vercel fallback; add `Dockerfile`, `.dockerignore`, `firebase.json` for Cloud Run and Firebase Hosting. |
| **Cron Scheduling** | `.github/workflows/queue-workers-cron.yml` | GitHub Actions workflow calling Vercel endpoint every 15 minutes. | Keep as disabled fallback; configure Cloud Scheduler in `asia-south1` targeting Cloud Run endpoint via authenticated POST. |
| **Packages** | `package.json` | Missing Google Cloud Admin SDKs. | Add `@google-cloud/firestore` and `@google-cloud/storage` (using lazy/dynamic imports so they load only when configured). |
