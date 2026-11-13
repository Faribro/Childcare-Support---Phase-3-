# Childcare Support Phase 3: Google Cloud Platform Migration Guide

## 1. Initial Account Provisioning in Cloud Firestore

> **CRITICAL BOOTSTRAP GATE**: In production and staging environments on Cloud Run, the application operates under `DATA_ENGINE=firestore` and strictly disables environment-variable account fallback (`ALLOW_ENV_CREDENTIAL_FALLBACK=false`).
> 
> **Without running the credential migration script below, the `evaluation_credentials` collection in Firestore will be empty, and NOBODY (field workers, state evaluators, or administrators) will be able to log in.**

### Step 1: Preflight Audit & Dry Run
Before committing any credential records, verify connectivity to the staging Firestore database (`databaseId: staging`) and audit the credential roster without writing data:

```bash
# 1. Ensure GCP authentication and project are configured
gcloud config set project cs-p3-production

# 2. Run the dry-run audit targeting the staging database
bun scripts/migrate-credentials-to-firestore.ts --dry-run
```

*Expected output*:
- Verifies that environment guard passes: `APP_ENV=staging` is securely paired with `FIRESTORE_DATABASE_ID=staging`.
- Discovers 10 evaluation credentials (`STATE-MH`, `STATE-WB`, `STATE-DL`, `STATE-KA`, `STATE-TN`, `STATE-GJ`, `STATE-TG`, `STATE-UP`, `LEADERSHIP-ALL`, `ADMIN-SYSTEM`).
- Confirms zero records written to Firestore.

### Step 2: Live Provisioning Execution
Once the dry-run is verified, execute the write to populate the Firestore collection:

```bash
# Execute live migration into staging Firestore
bun scripts/migrate-credentials-to-firestore.ts --execute
```

*Expected output*:
- Writes 10 credential records into Firestore collection `evaluation_credentials` in database `staging`.
- Automatically hashes passwords with Argon2id and sets credential version to `1`.
- Enables login capability across all Cloud Run instances immediately.
