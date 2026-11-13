# Task 4 / Phase C: Google Cloud Run Packaging & Deployment Guide (PowerShell Edition)

This document provides the complete, production-ready specification and step-by-step PowerShell commands to package, configure, and deploy Childcare Support Phase 3 (`csc-staging`) onto Google Cloud Run in `asia-south1` with Firebase Hosting rewrites.

> [!IMPORTANT]
> **Owner Execution Only**: All `gcloud` and `firebase` commands documented here are for reference and must be executed by the GCP project owner in Cloud Shell or an authenticated Windows PowerShell terminal. Under standing safety rules, the automated migration agent does not execute any GCP commands.

---

## 1. Cloud Architecture Overview

- **App Runtime**: Cloud Run service `csc-staging` in region `asia-south1` (Mumbai).
- **Container Strategy**: Multi-stage Docker image with Next.js 14 standalone build on `node:20-slim`.
- **Scaling**: Scale-to-zero (`min-instances: 0`, `max-instances: 3`), CPU allocated only during request processing (`--cpu-throttling`).
- **Public Domain Routing**: Firebase Hosting (`cs-p3-production.web.app`) rewriting traffic to Cloud Run service `csc-staging`.
- **Session Strategy**: Unified cryptographic envelope (`__session`) compatible with Firebase Hosting CDN rewrite layer.
- **Identity & Security**: Dedicated least-privilege service account `csc-runtime` with IAM signed URL delegation and Secret Manager integration.
- **Scheduled Background Operations**: Cloud Scheduler executing HTTP POST to `/api/workers/cron` every 15 minutes with `CRON_SECRET` authentication.

---

## 2. One-Time Project Setup (PowerShell)

Execute these commands in Windows PowerShell with `gcloud` CLI authenticated to project `cs-p3-production`:

### A. Enable Required GCP APIs
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

### B. Create Runtime Service Account
```powershell
gcloud iam service-accounts create csc-runtime `
  --display-name="Childcare Support Cloud Run Runtime SA" `
  --description="Execution identity for csc-staging and csc-production on Cloud Run" `
  --project=cs-p3-production
```

Full email: `csc-runtime@cs-p3-production.iam.gserviceaccount.com`

### C. Grant Least-Privilege IAM Roles

1. **Firestore Native Access (`roles/datastore.user`)**:
   ```powershell
   gcloud projects add-iam-policy-binding cs-p3-production `
     --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" `
     --role="roles/datastore.user"
   ```

2. **Cloud Storage Bucket-Level Object Access (`roles/storage.objectUser`)**:
   Grants read, write, and delete on staging objects:
   ```powershell
   gcloud storage buckets add-iam-policy-binding gs://cs-p3-childcare-staging `
     --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" `
     --role="roles/storage.objectUser"
   ```

3. **Service Account Token Creator (`roles/iam.serviceAccountTokenCreator` on itself)**:
   Enables Cloud Run to cryptographically sign Google Cloud Storage V4 upload/download URLs using Google IAM credentials without managing static JSON private keys:
   ```powershell
   gcloud iam service-accounts add-iam-policy-binding `
     csc-runtime@cs-p3-production.iam.gserviceaccount.com `
     --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" `
     --role="roles/iam.serviceAccountTokenCreator" `
     --project=cs-p3-production
   ```

4. **Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`)**:
   Enables Cloud Run to decrypt runtime secrets during service initialization:
   ```powershell
   gcloud projects add-iam-policy-binding cs-p3-production `
     --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" `
     --role="roles/secretmanager.secretAccessor"
   ```

---

## 3. Secret Manager Setup (PowerShell)

Create and populate the runtime secrets in Secret Manager. Never write raw secret values into version control.

```powershell
# Create Secret containers
$SECRETS = @(
  "SESSION_SECRET",
  "INTERNAL_AUTH_SECRET",
  "CRON_SECRET",
  "WEBHOOK_SECRET",
  "GOOGLE_CLIENT_SECRET"
)

foreach ($sec in $SECRETS) {
  gcloud secrets create $sec --replication-policy="automatic" --project=cs-p3-production
}

# Add secret versions
# 1. SESSION_SECRET (Min 32 random characters for HMAC signing)
$SessionSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
$SessionSecret | gcloud secrets versions add SESSION_SECRET --data-file=- --project=cs-p3-production

# 2. CRON_SECRET (High-entropy token for Cloud Scheduler calls)
$CronSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
$CronSecret | gcloud secrets versions add CRON_SECRET --data-file=- --project=cs-p3-production

# 3. GOOGLE_CLIENT_SECRET (From Google Cloud Credentials OAuth 2.0 Client)
# "$env:MY_OAUTH_CLIENT_SECRET" | gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=- --project=cs-p3-production
```

---

## 4. Container Build & Artifact Registry (PowerShell)

### A. Create Docker Repository in Artifact Registry
```powershell
gcloud artifacts repositories create csc-containers `
  --repository-format=docker `
  --location=asia-south1 `
  --description="Container repository for Childcare Support Phase 3" `
  --project=cs-p3-production
```

### B. Build and Push Container using Cloud Build
Run from the root of the repository. Next.js `NEXT_PUBLIC_*` variables are statically inlined at compile time; separate builds are used for staging and production:

```powershell
# Staging Build
gcloud builds submit `
  --config=cloudbuild.staging.yaml `
  --substitutions=_GIT_COMMIT_SHA="$(git rev-parse --short HEAD)" `
  --project=cs-p3-production
```

---

## 5. Cloud Run Service Deployment (`csc-staging`) (PowerShell)

Deploy the container service to Cloud Run:
```powershell
gcloud run deploy csc-staging `
  --image="asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-staging:latest" `
  --region=asia-south1 `
  --platform=managed `
  --allow-unauthenticated `
  --service-account="csc-runtime@cs-p3-production.iam.gserviceaccount.com" `
  --min-instances=0 `
  --max-instances=3 `
  --memory=1Gi `
  --cpu=1 `
  --concurrency=40 `
  --timeout=60 `
  --cpu-throttling `
  --set-env-vars="APP_ENV=staging,DATA_ENGINE=firestore,STORAGE_PROVIDER=gcs,FIRESTORE_DATABASE_ID=staging,GCS_BUCKET_NAME=cs-p3-childcare-staging,COOKIE_STRATEGY=unified,ALLOW_LIVE_EMAIL_DISPATCH=false,ALLOWED_HOSTS=cs-p3-production.web.app,cs-p3-production.firebaseapp.com" `
  --set-secrets="SESSION_SECRET=SESSION_SECRET:latest,CRON_SECRET=CRON_SECRET:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest" `
  --project=cs-p3-production
```

---

## 6. Firebase Hosting Rewrite Deployment (PowerShell)

Firebase Hosting serves as the public edge routing layer, terminating SSL, routing static assets, and rewriting dynamic traffic to Cloud Run.

With `firebase.json` already configured in the repository:
```powershell
firebase deploy --only hosting --project=cs-p3-production
```

Public Staging Access will be live at:
- `https://cs-p3-production.web.app`
- `https://cs-p3-production.firebaseapp.com`
- `https://csc-staging-<HASH>-el.a.run.app` (direct Cloud Run staging URL for diagnostics)

---

## 7. Cloud Scheduler Worker (PowerShell)

Schedule the sheets-mirror retry queue drain and export delivery worker every 15 minutes:
```powershell
$STAGING_URL = (gcloud run services describe csc-staging --region=asia-south1 --format='value(status.url)' --project=cs-p3-production)

gcloud scheduler jobs create http csc-staging-worker `
  --schedule="*/15 * * * *" `
  --uri="$STAGING_URL/api/workers/cron" `
  --http-method=POST `
  --headers="x-cron-auth=$CronSecret" `
  --time-zone="Asia/Kolkata" `
  --location=asia-south1 `
  --project=cs-p3-production
```

---

## 8. Verification & Diagnostics (PowerShell)

1. **Liveness Probe**:
   ```powershell
   Invoke-RestMethod -Uri "https://cs-p3-production.web.app/api/health" | ConvertTo-Json
   ```
   Expected response:
   - `status`: `"ok"`
   - `dataEngine`: `"firestore"`
   - `storageProvider`: `"gcs"`
   - `firestoreDatabaseId`: `"staging"`
   - `reachability.firestore`: `true`
   - `reachability.storageBucket`: `true`

2. **Readiness Probe**:
   ```powershell
   Invoke-RestMethod -Uri "https://cs-p3-production.web.app/api/ready" | ConvertTo-Json
   ```
   Expected response:
   - `status`: `"ok"`
   - `ready`: `true`
