# Task 2: Cloud Firestore Data Layer Architecture & Operation

## 1. Overview & Configuration

Task 2 implements the Cloud Firestore data layer for the Childcare Support Phase 3 PWA, targeting Google Cloud Run in `asia-south1`. It establishes Cloud Firestore (Native mode, Standard edition) as the authoritative primary datastore while preserving Google Sheets (via Apps Script) as an asynchronous mirror and reporting copy.

### Environment Switches

| Environment Variable | Allowed Values | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `DATA_ENGINE` | `sheets` \| `supabase` \| `firestore` | `sheets` | Selects the active persistence engine. Default preserves legacy behavior. |
| `FIRESTORE_DATABASE_ID` | `(default)` \| `staging` \| `<custom>` | `(default)` | Specifies the Firestore database instance within project `cs-p3-production`. |
| `APP_ENV` / `NEXT_PUBLIC_APP_ENV` | `production` \| `staging` \| `development` \| `test` | `development` | Target environment mode for runtime safety verification. |

### Database Environment Isolation Guard

To prevent catastrophic cross-environment data contamination, `validateFirestoreDatabaseEnvironment()` enforces strict isolation at application boot:
- **Staging Guard**: If `APP_ENV=staging`, the application **refuses to start** against the `(default)` database. Staging is strictly confined to the named database `staging`.
- **Production Guard**: If `APP_ENV=production`, the application **refuses to start** against the `staging` database. Production is strictly confined to `(default)`.
- If a violation occurs, the adapter immediately throws `CONFIGURATION_ERROR` and halts execution.

---

## 2. Invariants & Data Scoping

Task 2 is explicitly scoped to **submissions**, **attachment metadata**, and the **`sheets_mirror_retry_queue`**.

### 2.1 Deduplication & Idempotent Retries
- Every document in the `submissions` collection uses `clientSubmissionId` as its Firestore document ID (`/submissions/{clientSubmissionId}`).
- When a field worker submits an intake record, retries caused by flaky cellular networks or offline queue synchronizations will update or overwrite the existing document instead of creating duplicate records.
- Idempotency checks return `isDuplicate: true` and `statusCode: 200` to acknowledge the write without side-effects.

### 2.2 Dual-Write to Sheets Mirror with Resilient Retry Queue
1. **Firestore First**: Every write is committed to Cloud Firestore first. Firestore is the authoritative source of truth.
2. **Apps Script Mirroring**: Upon successful Firestore commit, an asynchronous mirror payload is dispatched to the Google Apps Script Web App.
3. **Queue on Failure**: If Apps Script is unreachable, times out, or returns an error, the submission remains safe in Firestore. A mirror retry record is written to `/sheets_mirror_retry_queue/{clientSubmissionId}` with status `PENDING`.
4. **Exponential Backoff & Dead-Letter Capping**:
   - `replaySheetsMirrorRetryQueue(batchSize)` processes pending jobs.
   - Retry intervals back off exponentially: $30\text{s} \times 2^{\text{retryCount}}$.
   - After 5 consecutive failures, the job is permanently marked `DEAD_LETTER` to prevent infinite loops, and an alert is flagged for operator inspection.

### 2.3 Access Security Rules & Indexing
- **Client Access**: Direct client-side reads and writes are strictly prohibited. `firestore.rules` enforces `allow read, write: if false;` on all collections.
- **Admin SDK**: All mutations are executed by the server-side Next.js container using `@google-cloud/firestore` authenticated via Cloud Run Application Default Credentials (ADC).
- **Composite Indexes**: Defined in `firestore.indexes.json` for geographic (`state`, `district`, `taluk`, `village`), clinical (`artStatus`, `vlStatus`), and audit (`submissionTime`, `status`) compound queries.

---

## 3. Analysis of Non-Migrated Stores (Amendment 2)

Per user directive, credentials, onboarding, leadership auth, WhatsApp inbound, and export-audit stores are **not** migrated in Task 2. Below is an exhaustive audit of their current behavior when Supabase is unconfigured, and their exact failure modes on Cloud Run with multiple instances and scale-to-zero.

| Store & Source File | Current Behavior Without Supabase | Cloud Run Multi-Instance & Scale-to-Zero Breakage |
| :--- | :--- | :--- |
| **Evaluation Credentials**<br>`src/lib/server/credentialRegistry.ts` | Falls back to in-memory `Map` (`inMemoryRegistry`) and environment variables / synthetic fixtures. Rate limiting uses in-memory maps (`credentialAttempts`, `ipAttempts`). | • **Multi-Instance**: Credentials provisioned dynamically in memory on Instance A do not exist on Instance B.<br>• **Scale-to-Zero**: Terminating instances wipes credentials and resets brute-force lockout timers (`credentialAttempts`, `ipAttempts`), allowing attackers to bypass rate limits by spraying requests across new instances. |
| **Onboarding Store**<br>`src/lib/server/onboardingStore.ts` | In production/staging, returns `UnavailableOnboardingStore` (all methods throw 503 `ONBOARDING_STORE_UNAVAILABLE`). In dev/test, uses `MemoryOnboardingStore`. | • **Without Supabase**: All state team registrations, invitations, and OTP verifications return 503 Service Unavailable immediately.<br>• **If In-Memory Multi-Instance**: Email OTP challenges and invitation redemption counters are isolated to process RAM. An OTP requested from Instance A fails verification when routed to Instance B (50% failure rate with 2 instances).<br>• **Scale-to-Zero**: Erases in-flight registration tickets and invitation verifiers. |
| **Leadership Auth Store**<br>`src/lib/server/leaderAuthStore.ts` | In production/staging, returns `UnavailableLeaderAuthStore` (all methods throw 503 `LEADER_AUTH_STORE_UNAVAILABLE`). In dev/test, uses `MemoryLeaderAuthStore`. | • **Without Supabase**: All leadership email OTP sign-ins fail with 503 Service Unavailable.<br>• **If In-Memory Multi-Instance**: OTP challenges and active sessions are stored in local RAM. Verification requests hitting a different instance fail ("Invalid or expired OTP").<br>• **Scale-to-Zero**: Destroys active session tokens, abruptly signing out leaders whenever containers scale to zero or recycle. |
| **WhatsApp Inbound Persistence**<br>`src/features/whatsapp-document-loop/persistence.ts`<br>(via `whatsappPipelineFactory.ts`) | In production, throws fatal error `SERVER_MISCONFIGURED: Inbound persistence requires SUPABASE_URL in production.` In dev/test, uses `MemoryInboundPersistence`. | • **Without Supabase**: Webhook receiver crashes with 500 `SERVER_MISCONFIGURED`.<br>• **If In-Memory Multi-Instance**: Inbound deduplication (`processed_messages`) is local to a single container. Meta retries hitting different instances will re-process duplicate messages, resulting in duplicate case intakes.<br>• **Scale-to-Zero**: Purges the deduplication ledger completely. |
| **Export Confirmation Store**<br>`src/features/leadership-reporting/export-confirmation-store.ts`<br>(via `whatsappPipelineFactory.ts`) | In production, throws fatal error `SERVER_MISCONFIGURED: Export confirmation store requires SUPABASE_URL in production.` In dev/test, uses `InMemoryExportConfirmationStore`. | • **Without Supabase**: WhatsApp reporting export workflows crash with 500 `SERVER_MISCONFIGURED`.<br>• **If In-Memory Multi-Instance**: Two-phase export confirmations (where a preview token is issued and subsequently confirmed via short code) fail if the confirmation hits another instance ("Token not found").<br>• **Scale-to-Zero**: Destroys pending export delivery jobs and audit records. |

---

## 4. Rate Limiting on Cloud Run (Amendment 3)

The existing rate limiter (`src/lib/server/rateLimit.ts`) operates using in-memory sliding-window buckets (`Map<string, { count: number; resetTime: number }>`).

### Multi-Instance & Scale-to-Zero Behavior:
1. **Cluster Capacity Multiplier**: Each Cloud Run container maintains its own isolated memory bucket. If Cloud Run autoscales to $N$ active instances, the aggregate allowable requests across the cluster is $N \times \text{limit}$.
2. **Cold Start & Reset**: When Cloud Run scales down to zero instances, all in-memory rate-limit buckets are reset. A burst of requests triggering fresh container instances will start with clean rate counters.
3. **Acceptance Criteria**: For the anticipated traffic volumes on staging and production field-data entry, this per-instance isolation is fully acceptable. Future centralization via Cloud Memorystore (Redis) or Firestore counters can be evaluated post-migration if abusive distributed traffic emerges.

---

## 5. IAM Roles & Permissions (Amendment 4)

Cloud Run services authenticate using an Application Default Credentials (ADC) runtime service account. No service account JSON key files should ever be downloaded, copied, or stored in containers or source code.

### Required Roles:
1. **Cloud Firestore Access**:
   - Role: `roles/datastore.user` (provides read/write access to Firestore in Native mode).
2. **Cloud Storage Bucket Access**:
   - Role: `roles/storage.objectAdmin` on bucket `gs://cs-p3-childcare-staging`.
3. **Keyless IAM URL Signing via `signBlob`**:
   - Role: `roles/iam.serviceAccountTokenCreator` granted to the runtime service account **on its own service account resource**.
   - This allows the `@google-cloud/storage` SDK inside Cloud Run to sign V4 upload/download URLs using the Google IAM Credentials API without requiring private key files!
4. **Secret Manager Access**:
   - Role: `roles/secretmanager.secretAccessor` (allows reading configured secrets at container startup).

### Exact `gcloud` Commands (Reference Only — Do Not Execute):

```bash
# 1. Create the runtime service account
gcloud iam service-accounts create csc-runtime \
  --description="Runtime service account for Childcare Support Phase 3 Cloud Run" \
  --display-name="csc-runtime" \
  --project="cs-p3-production"

# 2. Grant Firestore Read/Write role
gcloud projects add-iam-policy-binding cs-p3-production \
  --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# 3. Grant GCS bucket admin role on the staging bucket
gcloud storage buckets add-iam-policy-binding gs://cs-p3-childcare-staging \
  --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# 4. Grant self-impersonation (token creator) for keyless IAM URL signing via signBlob
gcloud iam service-accounts add-iam-policy-binding csc-runtime@cs-p3-production.iam.gserviceaccount.com \
  --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="cs-p3-production"

# 5. Grant Secret Manager access
gcloud projects add-iam-policy-binding cs-p3-production \
  --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 6. Secret Manager Inventory & Usage (Amendment 5)

All sensitive secrets must be stored in Google Cloud Secret Manager and mounted into Cloud Run as environment variables at deployment time. Never commit secret values or embed them into Docker images.

### Secrets Inventory:

| Secret Name | Description | Minimum Format / Constraints |
| :--- | :--- | :--- |
| `SESSION_SECRET` | Session cookie encryption & HMAC signing | 32-byte high-entropy hex or base64 string |
| `WEBHOOK_SECRET` | Shared secret for incoming Apps Script / Meta webhook verification | 32-character random string |
| `APPS_SCRIPT_DISPATCH_SECRET` | Header secret passed to Apps Script for mirror synchronization | Must match Apps Script `WEBHOOK_SECRET` |
| `APPS_SCRIPT_URL` | Apps Script Web App endpoint URL | `https://script.google.com/macros/s/.../exec` |
| `NEXTAUTH_SECRET` | NextAuth cryptographic secret | 32-byte random string |

### Exact Secret Provisioning Commands (Reference Only):

```bash
# Create secret containers in Secret Manager
gcloud secrets create SESSION_SECRET --replication-policy="automatic" --project="cs-p3-production"
gcloud secrets create WEBHOOK_SECRET --replication-policy="automatic" --project="cs-p3-production"
gcloud secrets create APPS_SCRIPT_DISPATCH_SECRET --replication-policy="automatic" --project="cs-p3-production"
gcloud secrets create APPS_SCRIPT_URL --replication-policy="automatic" --project="cs-p3-production"
gcloud secrets create NEXTAUTH_SECRET --replication-policy="automatic" --project="cs-p3-production"

# Add secret versions interactively (prompts hidden input; never in command history)
gcloud secrets versions add SESSION_SECRET --data-file=- --project="cs-p3-production"
gcloud secrets versions add WEBHOOK_SECRET --data-file=- --project="cs-p3-production"
gcloud secrets versions add APPS_SCRIPT_DISPATCH_SECRET --data-file=- --project="cs-p3-production"
gcloud secrets versions add APPS_SCRIPT_URL --data-file=- --project="cs-p3-production"
gcloud secrets versions add NEXTAUTH_SECRET --data-file=- --project="cs-p3-production"
```

### Cloud Run Deployment Binding Syntax:
When deploying `csc-staging`, secrets are bound directly as environment variables:
```bash
gcloud run deploy csc-staging \
  --image="asia-south1-docker.pkg.dev/cs-p3-production/csc-images/app:latest" \
  --region="asia-south1" \
  --service-account="csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
  --set-env-vars="APP_ENV=staging,DATA_ENGINE=firestore,FIRESTORE_DATABASE_ID=staging,STORAGE_PROVIDER=gcs,GCS_BUCKET_NAME=cs-p3-childcare-staging" \
  --set-secrets="SESSION_SECRET=SESSION_SECRET:latest,WEBHOOK_SECRET=WEBHOOK_SECRET:latest,APPS_SCRIPT_DISPATCH_SECRET=APPS_SCRIPT_DISPATCH_SECRET:latest,APPS_SCRIPT_URL=APPS_SCRIPT_URL:latest,NEXTAUTH_SECRET=NEXTAUTH_SECRET:latest"
```

---

## 7. Verification Results

All tests executed with `bun x vitest` pass:
- Database environment isolation guards (`staging` vs `(default)` and `production` vs `staging` rejection): **PASSED**
- Client submission ID document key deduplication & idempotent overwriting: **PASSED**
- Offline draft retry overwrite: **PASSED**
- Resilient dual-write with Sheets mirror failure queueing & replay: **PASSED**
- Exponential backoff and dead-letter capping (5 retries max): **PASSED**
- Asset replacement & attachment metadata appending: **PASSED**
- Canonical adapter integration with `DATA_ENGINE=firestore`: **PASSED**
- TypeScript typecheck (`tsc --noEmit`): **PASSED** (zero errors)
