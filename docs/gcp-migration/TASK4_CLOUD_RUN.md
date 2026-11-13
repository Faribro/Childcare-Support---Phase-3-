# Task 4 / Phase C: Google Cloud Run Packaging & Deployment Guide

This document provides the complete, production-ready specification and step-by-step commands to package, configure, and deploy Childcare Support Phase 3 (`csc-staging`) onto Google Cloud Run in `asia-south1` with Firebase Hosting rewrites.

> [!IMPORTANT]
> **Owner Execution Only**: All `gcloud` and `firebase` commands documented here are for reference and must be executed by the GCP project owner in Cloud Shell or an authenticated terminal. The automated migration agent does not execute any GCP commands.

---

## 1. Cloud Architecture Overview

- **App Runtime**: Cloud Run service `csc-staging` in region `asia-south1` (Mumbai).
- **Container Strategy**: Multi-stage Docker image with Next.js standalone build on `node:20-slim`.
- **Scaling**: Scale-to-zero (`min-instances: 0`, `max-instances: 3`), CPU allocated only during request processing (`--cpu-throttling`).
- **Public Domain Routing**: Firebase Hosting (`cs-p3-production.web.app`) rewriting traffic to Cloud Run service `csc-staging`.
- **Identity & Security**: Dedicated least-privilege service account `csc-runtime` with IAM signed URL delegation and Secret Manager integration.
- **Scheduled Background Operations**: Cloud Scheduler executing HTTP POST to `/api/workers/cron` every 15 minutes with `CRON_SECRET` authentication.

---

## 2. One-Time Project Setup

Run these commands once in Cloud Shell for project `cs-p3-production`:

### A. Enable Required GCP APIs
```bash
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  --project=cs-p3-production
```

### B. Create Runtime Service Account
```bash
gcloud iam service-accounts create csc-runtime \
  --display-name="Childcare Support Cloud Run Runtime SA" \
  --description="Execution identity for csc-staging and csc-production on Cloud Run" \
  --project=cs-p3-production
```

Full email: `csc-runtime@cs-p3-production.iam.gserviceaccount.com`

### C. Grant Least-Privilege IAM Roles

1. **Firestore Native Access (`roles/datastore.user`)**:
   ```bash
   gcloud projects add-iam-policy-binding cs-p3-production \
     --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
     --role="roles/datastore.user"
   ```

2. **Cloud Storage Bucket-Level Object Admin (`roles/storage.objectAdmin`)**:
   Enables reading, writing, and deleting objects in the staging bucket:
   ```bash
   gsutil iam ch \
     serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com:roles/storage.objectAdmin \
     gs://cs-p3-childcare-staging
   ```

3. **Service Account Token Creator (`roles/iam.serviceAccountTokenCreator` on itself)**:
   Enables Cloud Run to cryptographically sign Google Cloud Storage V4 upload/download URLs using Google IAM APIs without managing static JSON key files:
   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     csc-runtime@cs-p3-production.iam.gserviceaccount.com \
     --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountTokenCreator" \
     --project=cs-p3-production
   ```

4. **Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`)**:
   Enables Cloud Run to mount application secrets at boot time:
   ```bash
   gcloud projects add-iam-policy-binding cs-p3-production \
     --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

---

## 3. Secret Manager Setup

Create and populate the runtime secrets. Never write secrets into committed files.

```bash
# 1. SESSION_SECRET (Minimum 32 random characters for session cookie HMAC)
gcloud secrets create SESSION_SECRET --replication-policy="automatic" --project=cs-p3-production
echo -n "<GENERATE_RANDOM_32_CHAR_SECRET>" | gcloud secrets versions add SESSION_SECRET --data-file=- --project=cs-p3-production

# 2. WEBHOOK_SECRET (HMAC authentication for Apps Script upstream bridge)
gcloud secrets create WEBHOOK_SECRET --replication-policy="automatic" --project=cs-p3-production
echo -n "<GENERATE_RANDOM_32_CHAR_SECRET>" | gcloud secrets versions add WEBHOOK_SECRET --data-file=- --project=cs-p3-production

# 3. CRON_SECRET (Bearer token for Cloud Scheduler worker invocations)
gcloud secrets create CRON_SECRET --replication-policy="automatic" --project=cs-p3-production
echo -n "<GENERATE_RANDOM_32_CHAR_SECRET>" | gcloud secrets versions add CRON_SECRET --data-file=- --project=cs-p3-production

# 4. GOOGLE_CLIENT_SECRET (OAuth Client Secret for field user Google authentication)
gcloud secrets create GOOGLE_CLIENT_SECRET --replication-policy="automatic" --project=cs-p3-production
echo -n "<YOUR_GOOGLE_CLIENT_SECRET>" | gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=- --project=cs-p3-production
```

---

## 4. Container Build & Artifact Registry

### A. Create Docker Repository in Artifact Registry
```bash
gcloud artifacts repositories create csc-containers \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Container repository for Childcare Support Phase 3" \
  --project=cs-p3-production
```

### B. Build and Push Container using Cloud Build
Run from the root of the repository:
```bash
gcloud builds submit \
  --tag=asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-staging:latest \
  --project=cs-p3-production
```

---

## 5. Cloud Run Service Deployment (`csc-staging`)

Deploy the container service to Cloud Run:
```bash
gcloud run deploy csc-staging \
  --image=asia-south1-docker.pkg.dev/cs-p3-production/csc-containers/csc-staging:latest \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --service-account=csc-runtime@cs-p3-production.iam.gserviceaccount.com \
  --min-instances=0 \
  --max-instances=3 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=40 \
  --timeout=60 \
  --cpu-throttling \
  --set-env-vars="APP_ENV=staging,DATA_ENGINE=firestore,STORAGE_PROVIDER=gcs,FIRESTORE_DATABASE_ID=staging,GCS_BUCKET_NAME=cs-p3-childcare-staging,APPS_SCRIPT_URL=<YOUR_STAGING_APPS_SCRIPT_URL>,ALLOW_LIVE_EMAIL_DISPATCH=false,ALLOWED_HOSTS=cs-p3-production.web.app,cs-p3-production.firebaseapp.com" \
  --set-secrets="SESSION_SECRET=SESSION_SECRET:latest,WEBHOOK_SECRET=WEBHOOK_SECRET:latest,CRON_SECRET=CRON_SECRET:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest" \
  --project=cs-p3-production
```

---

## 6. Firebase Hosting Rewrite Deployment

With `firebase.json` already configured in the repository:
```json
{
  "hosting": {
    "public": "public",
    "rewrites": [
      {
        "source": "**",
        "run": {
          "serviceId": "csc-staging",
          "region": "asia-south1"
        }
      }
    ]
  }
}
```

Deploy the hosting rewrite via Firebase CLI:
```bash
firebase deploy --only hosting --project=cs-p3-production
```

Public Staging Access will be live at:
- `https://cs-p3-production.web.app`
- `https://cs-p3-production.firebaseapp.com`

---

## 7. Cloud Scheduler Worker (Queue Draining)

Schedule the sheets-mirror and export-delivery background worker every 15 minutes:
```bash
gcloud scheduler jobs create http csc-staging-worker \
  --schedule="*/15 * * * *" \
  --uri="https://<YOUR_STAGING_CLOUD_RUN_URL>/api/workers/cron" \
  --http-method=POST \
  --headers="x-cron-secret=<CRON_SECRET_VALUE>" \
  --time-zone="Asia/Kolkata" \
  --location=asia-south1 \
  --project=cs-p3-production
```

---

## 8. Verification & Diagnostics

1. **Liveness Probe**:
   ```bash
   curl -s https://cs-p3-production.web.app/api/health | jq .
   ```
   Expected response:
   - `status`: `"ok"`
   - `dataEngine`: `"firestore"`
   - `storageProvider`: `"gcs"`
   - `firestoreDatabaseId`: `"staging"`
   - `reachability.firestore`: `true`
   - `reachability.storageBucket`: `true`

2. **Readiness Probe**:
   ```bash
   curl -s https://cs-p3-production.web.app/api/ready | jq .
   ```
   Expected response:
   - `status`: `"ok"`
   - `ready`: `true`
