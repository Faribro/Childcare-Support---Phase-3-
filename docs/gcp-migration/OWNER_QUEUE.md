# GCP Migration: Owner Action Queue ("Needs the Owner")

All items below require owner authorization, real credentials, or cloud console / CLI execution.  
Under our standing safety rules, the autonomous agent **never runs live cloud commands, never pushes to remote, and never deploys**. All commands below are fully documented, copy-paste ready in Windows PowerShell syntax.

---

## 1. Google Cloud Project Setup & IAM Permissions
- [ ] **GCP Project**: Confirm project `cs-p3-production` exists and billing is active.
- [ ] **Enable Services**:
  ```powershell
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
- [ ] **Create Service Account**:
  ```powershell
  gcloud iam service-accounts create csc-runtime `
    --display-name="Childcare Support Phase 3 Runtime SA" `
    --project=cs-p3-production
  ```
- [ ] **Grant IAM Roles to `csc-runtime`**:
  ```powershell
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

---

## 2. Cloud Storage Buckets & CORS Configuration
- [ ] **Create Staging & Production Buckets**:
  ```powershell
  # Staging bucket (regional asia-south1)
  gcloud storage buckets create gs://cs-p3-childcare-staging `
    --location=asia-south1 `
    --project=cs-p3-production `
    --uniform-bucket-level-access

  # Production bucket (regional asia-south1)
  gcloud storage buckets create gs://cs-p3-childcare-production `
    --location=asia-south1 `
    --project=cs-p3-production `
    --uniform-bucket-level-access
  ```
- [ ] **Apply CORS Rules**:
  ```powershell
  gcloud storage buckets update gs://cs-p3-childcare-staging --cors-file=cors.staging.json
  gcloud storage buckets update gs://cs-p3-childcare-production --cors-file=cors.production.json
  ```

---

## 3. Cloud Firestore Databases & TTL Policies
- [ ] **Create Firestore Staging Database**:
  ```powershell
  gcloud firestore databases create `
    --database=staging `
    --location=asia-south1 `
    --type=firestore-native `
    --project=cs-p3-production
  ```
- [ ] **Deploy Security Rules & Composite Indexes**:
  ```powershell
  firebase deploy --only firestore:rules --project=cs-p3-production
  firebase deploy --only firestore:indexes --project=cs-p3-production
  ```
- [ ] **Enable Firestore TTL on Expiring Collections**:
  ```powershell
  # Staging Database TTL
  gcloud firestore fields ttls update expiresAt `
    --collection-group=auth_attempts `
    --database=staging `
    --project=cs-p3-production `
    --enable-ttl

  gcloud firestore fields ttls update expiresAt `
    --collection-group=leader_otp_codes `
    --database=staging `
    --project=cs-p3-production `
    --enable-ttl

  gcloud firestore fields ttls update expiresAt `
    --collection-group=leader_sessions `
    --database=staging `
    --project=cs-p3-production `
    --enable-ttl

  gcloud firestore fields ttls update expiresAt `
    --collection-group=onboarding_invitations `
    --database=staging `
    --project=cs-p3-production `
    --enable-ttl
  ```

---

## 4. Secret Manager Population
- [ ] **Create Secrets in Secret Manager**:
  Refer to `docs/gcp-migration/TASK4_CLOUD_RUN.md` Section 3 for the complete PowerShell script to create and populate:
  - `ARGON2_PEPPER`
  - `SESSION_SIGNING_SECRET`
  - `LEADERSHIP_AUTH_SECRET`
  - `UNIFIED_COOKIE_SIGNING_KEY`
  - `CRON_SECRET`
  - `GCS_SIGNING_KEY` (optional if IAM serviceAccountTokenCreator is used)
  - `LEADERSHIP_ALLOWLIST_JSON`
  - `GOOGLE_SHEET_ID`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL` & `GOOGLE_PRIVATE_KEY`

---

## 5. Artifact Registry & Cloud Build
- [ ] **Create Docker Repository**:
  ```powershell
  gcloud artifacts repositories create csc-containers `
    --repository-format=docker `
    --location=asia-south1 `
    --description="Childcare Support Phase 3 Container Repository" `
    --project=cs-p3-production
  ```
- [ ] **Build Staging Image via Cloud Build**:
  ```powershell
  gcloud builds submit `
    --config=cloudbuild.staging.yaml `
    --substitutions=_GIT_COMMIT_SHA="$(git rev-parse --short HEAD)" `
    --project=cs-p3-production
  ```

---

## 6. Cloud Run Deployment & Cloud Scheduler
- [ ] **Deploy Staging Service**:
  ```powershell
  gcloud run deploy csc-staging `
    --image=asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-staging:latest `
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
    --set-env-vars="APP_ENV=staging,DATA_ENGINE=firestore,STORAGE_PROVIDER=gcs,FIRESTORE_DATABASE_ID=staging,GCS_BUCKET_NAME=cs-p3-childcare-staging,COOKIE_STRATEGY=unified" `
    --project=cs-p3-production
  ```
- [ ] **Create Cloud Scheduler Cron Job (every 15 min)**:
  ```powershell
  $STAGING_URL = (gcloud run services describe csc-staging --region=asia-south1 --format='value(status.url)' --project=cs-p3-production)
  gcloud scheduler jobs create http csc-staging-cron `
    --schedule="*/15 * * * *" `
    --time-zone="Asia/Kolkata" `
    --uri="$STAGING_URL/api/workers/cron" `
    --http-method=POST `
    --headers="x-cron-auth=$CRON_SECRET" `
    --location=asia-south1 `
    --project=cs-p3-production
  ```

---

## 7. Data Seeding & Staging Verification
- [ ] **Run Initial Seed in Staging**:
  ```powershell
  $env:APP_ENV="staging"
  $env:FIRESTORE_DATABASE_ID="staging"
  bun run scripts/seed-credentials.ts --input=test-credentials.json --execute
  bun run scripts/seed-leader-identities.ts --input=test-leaders.json --execute
  ```
- [ ] **Verify Staging Functionality**:
  Perform the staging smoke tests documented in `docs/gcp-migration/MIGRATION.md`.
