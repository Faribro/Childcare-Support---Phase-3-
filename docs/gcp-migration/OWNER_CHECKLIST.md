# Childcare Support Phase 3: One-Page Owner Action Checklist

**Project**: `cs-p3-production` | **Region**: `asia-south1` | **Service Account**: `csc-runtime`  
**Syntax**: Windows PowerShell (`$env:`, backtick continuation `` ` ``)  

All commands below require Project Owner authorization and must be executed in your local Windows PowerShell terminal. Under standing safety rules, the automated assistant **never runs mutating cloud commands**.

---

## Pre-Flight Checklist
- [ ] Google Cloud SDK (`gcloud`) installed and logged in (`gcloud auth login`).
- [ ] Firebase CLI (`firebase`) installed and logged in (`firebase login`).
- [ ] Active billing account linked to project `cs-p3-production`.
- [ ] Terminal set to repository root: `cd "D:\OneDrive - INDIA HIV AIDS ALLIANCE\Desktop\Software Development\Childcare-Main-Verify"`

---

## Phase 1: One-Time Google Cloud Project Provisioning

### Step 1: Set Active Project & Enable Google Cloud APIs
```powershell
gcloud config set project cs-p3-production

gcloud services enable `
  run.googleapis.com `
  firestore.googleapis.com `
  storage.googleapis.com `
  secretmanager.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  cloudscheduler.googleapis.com `
  --project=cs-p3-production
```
- **Expected Output**: `Operation "..." finished successfully.`
- **If It Fails**: Run `gcloud services list --available` to check billing link. Send error message back to assistant.

### Step 2: Create Runtime Service Account & IAM Bindings
```powershell
# Create Service Account
gcloud iam service-accounts create csc-runtime `
  --display-name="Childcare Support Phase 3 Runtime SA" `
  --project=cs-p3-production

# Assign Minimum-Privilege IAM Roles
$ROLES = @(
  "roles/datastore.user",
  "roles/storage.objectUser",
  "roles/secretmanager.secretAccessor",
  "roles/iam.serviceAccountTokenCreator"
)
foreach ($role in $ROLES) {
  gcloud projects add-iam-policy-binding cs-p3-production `
    --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" `
    --role=$role
}
```
- **Expected Output**: Updated IAM policy JSON with `csc-runtime` bindings.
- **If It Fails**: Check if you have `roles/resourcemanager.projectIamAdmin`.

### Step 3: Create Cloud Storage Buckets & Apply CORS
```powershell
# Create regional buckets in asia-south1
gcloud storage buckets create gs://cs-p3-childcare-staging `
  --location=asia-south1 `
  --project=cs-p3-production `
  --uniform-bucket-level-access

gcloud storage buckets create gs://cs-p3-childcare-production `
  --location=asia-south1 `
  --project=cs-p3-production `
  --uniform-bucket-level-access

# Apply CORS headers
gcloud storage buckets update gs://cs-p3-childcare-staging --cors-file=cors.staging.json
gcloud storage buckets update gs://cs-p3-childcare-production --cors-file=cors.production.json
```
- **Expected Output**: `Updating gs://cs-p3-childcare-staging/... Completed.`
- **If It Fails**: Ensure `cors.staging.json` and `cors.production.json` exist in repository root.

### Step 4: Create Firestore Staging Database & Apply TTL Policies
```powershell
# Create named staging database
gcloud firestore databases create `
  --database=staging `
  --location=asia-south1 `
  --type=firestore-native `
  --project=cs-p3-production

# Deploy Security Rules & Composite Indexes (Targets both databases via firebase.json)
firebase deploy --only firestore:rules --project=cs-p3-production
firebase deploy --only firestore:indexes --project=cs-p3-production

# Enable TTL on Expiring Collections (Staging Database)
$COLLECTIONS = @("auth_attempts", "leader_otp_codes", "leader_sessions", "onboarding_invitations")
foreach ($col in $COLLECTIONS) {
  gcloud firestore fields ttls update expiresAt `
    --collection-group=$col `
    --database=staging `
    --project=cs-p3-production `
    --enable-ttl
}
```
- **Expected Output**: Firestore databases and indexes created; TTL status `state: ACTIVE`.
- **If It Fails**: If indexes take a few minutes to build, check Cloud Console Firestore Indexes tab.

### Step 5: Provision Secrets in Secret Manager
```powershell
# Helper function to create secret and add version
function Set-Secret ($Name, $Value) {
  gcloud secrets create $Name --replication-policy="automatic" --project=cs-p3-production 2>$null
  $Value | gcloud secrets versions add $Name --data-file=- --project=cs-p3-production
}

# Core Application Secrets
Set-Secret -Name "SESSION_SECRET" -Value "YOUR_32_CHAR_SESSION_SECRET"
Set-Secret -Name "WEBHOOK_SECRET" -Value "YOUR_APPS_SCRIPT_WEBHOOK_SECRET"
Set-Secret -Name "ARGON2_PEPPER" -Value "YOUR_RANDOM_ARGON2_PEPPER"
Set-Secret -Name "LEADERSHIP_AUTH_SECRET" -Value "YOUR_RANDOM_LEADERSHIP_SECRET"
Set-Secret -Name "UNIFIED_COOKIE_SIGNING_KEY" -Value "YOUR_RANDOM_COOKIE_SIGNING_KEY"
Set-Secret -Name "CRON_SECRET" -Value "YOUR_RANDOM_CRON_BEARER_SECRET"
Set-Secret -Name "DIAGNOSTICS_SECRET" -Value "YOUR_RANDOM_DIAGNOSTICS_SECRET"
```
- **Expected Output**: `Created version [1] of the secret.`

---

## Phase 2: Build & Staging Deployment

### Step 6: Create Artifact Registry Repository & Submit Cloud Build
```powershell
# Create Docker repository
gcloud artifacts repositories create csc-containers `
  --repository-format=docker `
  --location=asia-south1 `
  --description="Childcare Support Phase 3 Container Repository" `
  --project=cs-p3-production

# Submit Staging Image Build via Cloud Build
$GIT_SHA = (git rev-parse --short HEAD)
gcloud builds submit `
  --config=cloudbuild.staging.yaml `
  --substitutions=_GIT_COMMIT_SHA="$GIT_SHA" `
  --project=cs-p3-production
```
- **Expected Output**: `SUCCESS - asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-staging:$GIT_SHA`
- **If It Fails**: Run `gcloud builds log <BUILD_ID>` and send build output to assistant.

### Step 7: Deploy Cloud Run Staging Service (`csc-staging`)
```powershell
$IMAGE_URI = "asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-staging:latest"

gcloud run deploy csc-staging `
  --image=$IMAGE_URI `
  --region=asia-south1 `
  --platform=managed `
  --allow-unauthenticated `
  --service-account=csc-runtime@cs-p3-production.iam.gserviceaccount.com `
  --min-instances=0 `
  --max-instances=3 `
  --memory=1Gi `
  --cpu=1 `
  --cpu-throttling `
  --port=8080 `
  --set-env-vars="APP_ENV=staging,DATA_ENGINE=firestore,STORAGE_PROVIDER=gcs,FIRESTORE_DATABASE_ID=staging,GCS_BUCKET_NAME=cs-p3-childcare-staging,COOKIE_STRATEGY=unified,ALLOW_LIVE_EMAIL_DISPATCH=false" `
  --set-secrets="SESSION_SECRET=SESSION_SECRET:latest,WEBHOOK_SECRET=WEBHOOK_SECRET:latest,ARGON2_PEPPER=ARGON2_PEPPER:latest,LEADERSHIP_AUTH_SECRET=LEADERSHIP_AUTH_SECRET:latest,UNIFIED_COOKIE_SIGNING_KEY=UNIFIED_COOKIE_SIGNING_KEY:latest,CRON_SECRET=CRON_SECRET:latest,DIAGNOSTICS_SECRET=DIAGNOSTICS_SECRET:latest" `
  --project=cs-p3-production
```
- **Expected Output**: `Service [csc-staging] revision [...] has been deployed and is serving 100 percent of traffic. Service URL: https://csc-staging-...-el.a.run.app`

### Step 8: Configure Cloud Scheduler Cron Worker
```powershell
$STAGING_URL = (gcloud run services describe csc-staging --region=asia-south1 --format='value(status.url)' --project=cs-p3-production)

gcloud scheduler jobs create http csc-staging-cron `
  --schedule="*/15 * * * *" `
  --time-zone="Asia/Kolkata" `
  --uri="$STAGING_URL/api/workers/cron" `
  --http-method=POST `
  --headers="x-cron-auth=YOUR_RANDOM_CRON_BEARER_SECRET" `
  --location=asia-south1 `
  --project=cs-p3-production
```
- **Expected Output**: `Created job [csc-staging-cron].`

---

## Phase 3: Staging Verification & Seeding

### Step 9: Seed Staging Accounts
```powershell
$env:APP_ENV="staging"
$env:FIRESTORE_DATABASE_ID="staging"

# 1. Dry run check
bun run scripts/seed-credentials.ts --input=test-credentials.json --dry-run

# 2. Execute seed (writes credentials and displays generated one-time passwords once)
bun run scripts/seed-credentials.ts --input=test-credentials.json --execute

# 3. Seed leadership identities
bun run scripts/seed-leader-identities.ts --input=test-leaders.json --execute
```
- **Expected Output**: Credentials seeded, temporary passwords printed to console.
- **Copy**: Record the generated one-time passwords locally in your password manager for staging testing.

### Step 10: Run Smoke-Test Suite Against Staging URL
1. Open `$STAGING_URL/api/health` -> verify HTTP 200 and subsystem health (`firestore: ok`, `storageBucket: ok`).
2. Log in with seeded evaluation user -> test beneficiary creation form and offline queue retry.
3. Upload child photo / consent document -> verify signed URL generation and upload.
4. Verify document shows up in staging Google Sheet mirror via Apps Script.

---

## Phase 4: Production Cutover

### Step 11: Build & Deploy Production Container (`csc-production`)
```powershell
# 1. Cloud Build Production Image
gcloud builds submit `
  --config=cloudbuild.production.yaml `
  --substitutions=_GIT_COMMIT_SHA="$GIT_SHA" `
  --project=cs-p3-production

# 2. Deploy Cloud Run Production Service
$PROD_IMAGE = "asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-production:latest"

gcloud run deploy csc-production `
  --image=$PROD_IMAGE `
  --region=asia-south1 `
  --platform=managed `
  --allow-unauthenticated `
  --service-account=csc-runtime@cs-p3-production.iam.gserviceaccount.com `
  --min-instances=1 `
  --max-instances=5 `
  --memory=1Gi `
  --cpu=1 `
  --cpu-throttling `
  --port=8080 `
  --set-env-vars="APP_ENV=production,DATA_ENGINE=firestore,STORAGE_PROVIDER=gcs,FIRESTORE_DATABASE_ID=(default),GCS_BUCKET_NAME=cs-p3-childcare-production,COOKIE_STRATEGY=unified,ALLOW_LIVE_EMAIL_DISPATCH=true" `
  --set-secrets="SESSION_SECRET=SESSION_SECRET:latest,WEBHOOK_SECRET=WEBHOOK_SECRET:latest,ARGON2_PEPPER=ARGON2_PEPPER:latest,LEADERSHIP_AUTH_SECRET=LEADERSHIP_AUTH_SECRET:latest,UNIFIED_COOKIE_SIGNING_KEY=UNIFIED_COOKIE_SIGNING_KEY:latest,CRON_SECRET=CRON_SECRET:latest,DIAGNOSTICS_SECRET=DIAGNOSTICS_SECRET:latest" `
  --project=cs-p3-production

# 3. Deploy Firebase Hosting Ingress
firebase deploy --only hosting --project=cs-p3-production
```

### Step 12: Seed Production Accounts
```powershell
$env:APP_ENV="production"
$env:FIRESTORE_DATABASE_ID="(default)"

bun run scripts/seed-credentials.ts --input=production-credentials.json --confirm-production --execute
bun run scripts/seed-leader-identities.ts --input=production-leaders.json --confirm-production --execute
```

---

## Emergency Rollback Plan (If Critical Issues Arise)

If production validation fails, execute instant rollback within 5 minutes:

### Rollback Trigger Conditions
- HTTP 500 error rate exceeds 3% over 15 minutes.
- Beneficiary submissions fail to save in Firestore.
- Document upload signed URLs fail to accept files.

### Rollback Execution Steps
1. **Switch Firebase Hosting Ingress** (or DNS):
   - In Vercel Dashboard, ensure deployment `520f1a4` is active.
   - Re-point DNS or Firebase Hosting to legacy Vercel backend (`cname.vercel-dns.com`).
2. **Confirm Legacy Stack Operational**:
   - Supabase `rjrctsxdvkfkssqvmhbz` active.
   - Tigris S3 active.
   - Google Apps Script Version 35 active.
3. **Capture Diagnostics**:
   ```powershell
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=csc-production AND severity>=ERROR" `
     --limit=50 --project=cs-p3-production > prod-failure-logs.txt
   ```
4. **Send logs to assistant** for rapid root-cause diagnosis.
