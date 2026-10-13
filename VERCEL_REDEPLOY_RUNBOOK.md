# Controlled Vercel Production Redeployment Runbook (`VERCEL_REDEPLOY_RUNBOOK.md`)

> [!CAUTION]
> **DO NOT TRIGGER ANY VERCEL PRODUCTION DEPLOYMENT UNTIL OWNER APPROVAL IS RECORDED IN `OWNER_APPROVAL_GATE.md` (GATE 2).**
> The production alias `https://childcare-support-phase-3.vercel.app` must remain untouched until all pre-deploy checks and approval signatures are complete.

---

## 1. Purpose

1. Prepare the operational procedure to redeploy the live production Vercel alias (`https://childcare-support-phase-3.vercel.app`) from canonical `main`.
2. **Current Defect Resolved**: Probing `https://childcare-support-phase-3.vercel.app` confirmed it is serving a stale pre-PR-#74 build (where unauthenticated requests to `/api/auth/session` receive `allowedStates: ["Maharashtra"]` and submissions endpoints invoke upstream Apps Script before checking authentication).
3. **Execution Gate**: This runbook provides exact, safe commands and post-deployment validation steps, but **no deployment command may be run until Gate 2 in `OWNER_APPROVAL_GATE.md` is signed off**.

---

## 2. Deployment Source

- **Source Branch**: `main`
- **Canonical Baseline Commit**: `df1b1460aa2833e7a47929de28792c7099b54317` (merged PR #74) / `1a6553ccab166670f4846c1e3a44493ed3ae66c2` (merged PR #75)
- **Target Production Alias**: `https://childcare-support-phase-3.vercel.app`
- **Included Enhancements & Fixes**:
  - **PR #72**: Argon2/serverless compatibility, pure-JS fallback for Vercel edge/serverless runtimes.
  - **PR #74**: Scoped authorization guards (`401 UNAUTHORIZED` before upstream calls), cache isolation (`Cache-Control: no-store, no-cache, must-revalidate`, `Vary: Cookie, Authorization`), controlled form select defaults, invalid caregiver field focus, zero-preserving edit snapshot hydration, and single-instance sync modals.
  - **PR #75**: Audit-hardened Supabase schema migration foundation, `MIGRATION_REVIEW.md`, and synthetic integration tests.
  - **No Database Migration**: Vercel deployment builds Next.js frontend and serverless API routes only. It **does NOT run any Supabase migration or database modification**.

---

## 3. Required Environment Configuration

All environment variables must be configured directly within Vercel's secure dashboard settings (**Project Settings > Environment Variables**).

> [!IMPORTANT]
> **Zero Secret Exposure Policy**
> Under no circumstances may secret values be printed in logs, committed to Git, pasted into chat, or written into markdown documents.

| Secret Category | Variable Name | Purpose | Target Environment |
| :--- | :--- | :--- | :--- |
| **Google Apps Script Secret** | `WEBHOOK_SECRET` | Shared HMAC secret for upstream Apps Script reporting mirror communication (use newly rotated secret) | Production, Preview |
| **Google Apps Script URL** | `APPS_SCRIPT_URL` | Endpoint URL for the Google Apps Script Web App | Production, Preview |
| **Session Authentication** | `SESSION_SECRET` | 32+ character HMAC secret for signing `evaluation_session_token` cookies | Production, Preview |
| **Internal Service Auth** | `INTERNAL_AUTH_SECRET` | Key for trusted internal service-to-service communication | Production, Preview |
| **Supervisor Diagnostics** | `DIAGNOSTICS_SECRET` | Secret for accessing `/api/supervisor/diagnostics` | Production |
| **Private Object Storage** | `AWS_ACCESS_KEY_ID` | Tigris S3 API Access Key | Production, Preview |
| **Private Object Storage** | `AWS_SECRET_ACCESS_KEY` | Tigris S3 API Secret Key | Production, Preview |
| **Private Object Storage** | `AWS_REGION` | Tigris region (`auto`) | Production, Preview |
| **Private Object Storage** | `AWS_ENDPOINT_URL_S3` | Tigris endpoint (`https://fly.storage.tigris.dev`) | Production, Preview |
| **Private Object Storage** | `S3_BUCKET_NAME` | Private bucket name (`childcare-support-phase3-private`) | Production, Preview |
| **Application Environment** | `NEXT_PUBLIC_APP_ENV` | Environment identifier (`production`) | Production |
| **Node Environment** | `NODE_ENV` | Runtime mode (`production`) | Production |

---

## 4. Pre-Deploy Checklist

The operator must verify each item before initiating the deployment:

- [ ] Repository `main` branch is checked out at commit `1a6553ccab166670f4846c1e3a44493ed3ae66c2` (which contains `df1b1460aa2833e7a47929de28792c7099b54317`).
- [ ] GitHub Actions CI on `main` is completely green (`Code Quality & Automated Tests` passed).
- [ ] Local working tree is completely clean (`git status -sb` shows no uncommitted files).
- [ ] Verified that neither `package.json` nor `vercel.json` contains any automatic migration build scripts.
- [ ] Rotated `WEBHOOK_SECRET` is updated in Vercel project environment variables (`envId: trhzCRYcI1ylVaZW`).
- [ ] Tigris and session secrets are confirmed configured in Vercel production settings.
- [ ] Verified that no secrets, tokens, or credentials appear in Git commits, PR comments, or local logs.
- [ ] Owner has signed off Gate 2 in `OWNER_APPROVAL_GATE.md`.

---

## 5. Deployment Procedure

> [!WARNING]
> **DO NOT RUN UNTIL OWNER APPROVAL IS RECORDED IN `OWNER_APPROVAL_GATE.md` (GATE 2).**

### Step 5.1: Verify Clean Checkout on `main`
```bash
# Switch to main and pull latest verified commits
git checkout main
git pull github main

# Verify HEAD commit is 1a6553ccab166670f4846c1e3a44493ed3ae66c2
git rev-parse HEAD

# Verify working tree is clean
git status --porcelain
```

### Step 5.2: Run Local Pre-Flight Build
```bash
# Verify production build succeeds locally before touching Vercel
npm run build
```

### Step 5.3: Deploy to Vercel Production
```bash
# Authenticate Vercel CLI (or use secure VERCEL_TOKEN in CI environment)
# DO NOT print token
npx vercel login

# Deploy directly from clean main to production alias
# --prod flag promotes the build directly to https://childcare-support-phase-3.vercel.app
npx vercel deploy --prod --yes
```

### Step 5.4: Capture Deployment Metadata
```bash
# Verify deployment URL and inspect build logs
npx vercel inspect --prod
```

---

## 6. Post-Deploy Verification Checklist

Execute these verification checks against `https://childcare-support-phase-3.vercel.app` using **synthetic test data only**:

- [ ] **Health Check**: `GET /api/health` responds with `200 OK` and healthy status.
- [ ] **Unauthenticated Session Envelope**: `GET /api/auth/session` returns `200 OK` with `userId: "anonymous-field"`, `allowedStates: []`, `allowedDistricts: []`, and `isVerified: false`.
- [ ] **Session Cache Headers**: `GET /api/auth/session` returns `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`.
- [ ] **Unauthenticated Submissions Linelist**: `GET /api/submissions?limit=5` returns `401 UNAUTHORIZED` with `"Authentication required to read beneficiary submissions."`.
- [ ] **Unauthenticated Summary**: `GET /api/submissions/summary` returns `401 UNAUTHORIZED` with `"Authentication required to read submission summary."`.
- [ ] **Unauthenticated Detail Read**: `GET /api/submissions/SYNTH-MH-PUN-0001` returns `401 UNAUTHORIZED`.
- [ ] **Unauthenticated Dossier Export**: `GET /api/submissions/SYNTH-MH-PUN-0001/export` returns `401 UNAUTHORIZED`.
- [ ] **Unauthenticated Asset Stream**: `GET /api/submissions/SYNTH-MH-PUN-0001/asset?docType=caregiverSignature` returns `401 UNAUTHORIZED`.
- [ ] **Pre-Upstream Fast Failure**: Verify in Vercel Function logs that unauthenticated requests terminate at the Next.js guard with zero calls to Google Apps Script.
- [ ] **Authenticated FIELD_USER Scoping**: Authenticated field user for Maharashtra/Pune accesses only Pune records.
- [ ] **Cross-District Scope Denial**: Field user querying Nagpur receives `403 FORBIDDEN_SCOPE`.
- [ ] **Cross-State Scope Denial**: Field user querying Karnataka receives `403 FORBIDDEN_SCOPE`.
- [ ] **State Reviewer State Lock**: State reviewer for Maharashtra cannot access other states via `?state=Karnataka` or `?state=ALL`.
- [ ] **PWA Form Select Defaults**: Form selects render empty placeholder `""` rather than default options.
- [ ] **Form Validation Focus**: Submitting invalid form focuses the exact first invalid field (e.g., `caregiverName`).
- [ ] **Offline Submission Queue & Retry**: Offline draft submission queues correctly in IndexedDB and retries upon reconnection.
- [ ] **Edit Snapshot Zero Values**: Editing an assessment preserves numeric zero values (`0` is not converted to `""`).
- [ ] **Session Logout**: Clicking logout clears session cookie and redirects to `/login`.
- [ ] **Zero Real Beneficiary Data Used**: All verification executed with synthetic records only.

---

## 7. Rollback Plan

### When Rollback is Appropriate
- Any post-deployment verification check fails.
- PWA client cannot authenticate or load assessment forms.
- Unauthenticated requests leak any data or return unexpected `200` responses.
- API error rate exceeds 1% in Vercel analytics.

### Vercel Instant Rollback Procedure
1. **Identify Previous Deployment**:
   ```bash
   # List recent production deployments
   npx vercel ls --prod
   ```
2. **Promote Previous Deployment**:
   ```bash
   # Roll back alias immediately to previous stable deployment URL
   npx vercel alias set <previous-deployment-url> childcare-support-phase-3.vercel.app
   ```
3. **Preserve Evidence**:
   - Download build and runtime logs for the failing deployment.
   - Do not alter environment variables during rollback.
4. **Data Safety Guarantee**:
   - Vercel alias rollback affects only serverless frontend and API hosting. It does not alter database tables, Google Sheets, or Tigris objects.
5. **Escalation**:
   - If rollback fails to resolve the issue, escalate to Project Owner and Lead Architect immediately.

---

## 8. Explicit Non-Execution Statement

> **This runbook was prepared for operational readiness but has NOT been executed.**
> - **No Vercel production deployment was triggered.**
> - **No production configuration, secret, or alias was altered.**
> - **No production database, Tigris bucket, or real beneficiary data was modified.**
> - **Execution is blocked pending recorded owner approval in `OWNER_APPROVAL_GATE.md`.**
