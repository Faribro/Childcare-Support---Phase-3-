# Task 3: Google Cloud Storage Adapter Architecture & Operation

## 1. Overview & Configuration

Task 3 implements the Google Cloud Storage (GCS) adapter for the Childcare Support Phase 3 PWA, replacing Fly.io Tigris private S3 storage while preserving Tigris as a zero-downtime rollback fallback.

### Environment Switches

| Environment Variable | Allowed Values | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `STORAGE_PROVIDER` | `tigris` \| `gcs` | `tigris` | Selects active object storage provider. Default preserves existing Tigris behavior. |
| `GCS_BUCKET_NAME` | string | `cs-p3-childcare-staging` | Target Google Cloud Storage bucket in region `asia-south1`. |
| `GCS_SIGNING_SERVICE_ACCOUNT` | email | `csc-runtime@cs-p3-production.iam.gserviceaccount.com` | Service account identity used for IAM keyless URL signing. |

---

## 2. Keyless Signed URL Architecture

To eliminate the risk of compromised or leaked service account JSON keys, all signed upload and download URLs are generated **keylessly** using Cloud Run's runtime service account identity via the Google Cloud IAM Credentials API (`signBlob`).

```
+-----------------------------------------------------------------------------------+
|                              SIGNED UPLOAD URL FLOW                                |
+-----------------------------------------------------------------------------------+

[Field Worker Client]
        |
        | 1. Request Signed Upload URL (submissionId, docType, MIME)
        v
[Next.js on Cloud Run]
        |
        | 2. Verify Session Scope & Role (Admin / Caseworker)
        | 3. Validate MIME Allowlist (JPEG, PNG, WebP, PDF)
        | 4. Call GCS SDK getSignedUrl() [v4, action: 'write', expires: <=15m]
        |    -> Delegates to IAM Credentials API signBlob (keyless)
        |
        v
[Field Worker Client] <--- Returns Signed URL (expires in 15 mins)
        |
        | 5. Direct HTTP PUT Binary Upload (enforces Content-Type)
        v
[GCS Bucket: cs-p3-childcare-staging]
```

### Expiry Limits
- **Upload URLs**: Strictly capped at $\le 15$ minutes (900 seconds). Client must stream the binary within this window.
- **Download URLs**: Strictly capped at $\le 15$ minutes (900 seconds) for visual inspection on dashboard/supervisor views.

---

## 3. MIME Allowlist, Extension & Path Invariants

1. **Allowed Content-Types**:
   - `image/jpeg`
   - `image/png`
   - `image/webp`
   - `application/pdf`
   - Any other MIME type (e.g. `text/html`, `application/x-executable`, `video/*`) is immediately rejected with `400 REJECTED_UNSUPPORTED_MIME`.
2. **Allowed Extensions**:
   - `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`
   - Dangerous extensions (`.exe`, `.sh`, `.bat`, `.html`, `.js`) are strictly blocked.
3. **Payload Size Ceilings**:
   - Maximum size: 3 MB payload limit (10 MB hard storage ceiling). Oversized files return `REJECTED_OVERSIZE`.
4. **Deterministic Storage Keys**:
   - Storage keys follow a deterministic hierarchy:
     `${appEnv}/documents/${cleanSubmissionId}/${cleanDocType}.bin`
   - Special characters are sanitized to underscores to prevent directory traversal or URI injection.

---

## 4. GCS Bucket Security & Lifecycle Configuration

The staging bucket `cs-p3-childcare-staging` is configured in `asia-south1` with maximum security constraints:

### Security Settings:
- **Location**: `asia-south1` (Mumbai).
- **Storage Class**: Standard.
- **Access Control**: Uniform Bucket-Level Access (UBLA) enforced. ACLs are disabled.
- **Public Access Prevention (PAP)**: Enforced. No object or URL can ever be made public.
- **Encryption**: Google-managed encryption keys (CMEK optional for production).

### Bucket Lifecycle Rule (`lifecycle.json`):
To prevent storage bloat from aborted client multipart uploads:
```json
{
  "rule": [
    {
      "action": { "type": "AbortIncompleteMultipartUpload" },
      "condition": { "age": 7 }
    },
    {
      "action": { "type": "Delete" },
      "condition": {
        "numNewerVersions": 3,
        "withState": "ARCHIVED"
      }
    }
  ]
}
```

---

## 5. IAM Roles & Permissions (Reference Commands — Do Not Run)

```bash
# 1. Grant Cloud Storage Object Admin on staging bucket to Cloud Run runtime account
gcloud storage buckets add-iam-policy-binding gs://cs-p3-childcare-staging \
  --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# 2. Grant Token Creator role on ITSELF to allow keyless signBlob signed URLs
gcloud iam service-accounts add-iam-policy-binding csc-runtime@cs-p3-production.iam.gserviceaccount.com \
  --member="serviceAccount:csc-runtime@cs-p3-production.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="cs-p3-production"

# 3. Apply lifecycle rule to staging bucket
gcloud storage buckets update gs://cs-p3-childcare-staging --lifecycle-file=lifecycle.json
```

---

## 6. Verification Results

All tests executed with `bun x vitest` pass:
- Storage provider toggle (`STORAGE_PROVIDER=tigris` vs `STORAGE_PROVIDER=gcs`): **PASSED**
- MIME allowlist and file extension validation: **PASSED**
- Keyless v4 signed upload URL generation (15-minute expiry ceiling): **PASSED**
- Keyless v4 signed download URL generation: **PASSED**
- Binary buffer upload with SHA-256 integrity verification: **PASSED**
- Binary buffer retrieval and object head check: **PASSED**
- Rejection of oversized payloads ($> 3$ MB): **PASSED**
- Rejection of mismatched checksums: **PASSED**
- Next.js asset endpoint integration (`/api/submissions/[submissionId]/asset`): **PASSED**
- Full baseline unit suite (111 test files, 1,492 tests): **PASSED**
- Build verification (`npm run build` and `bun run build`): **PASSED**
