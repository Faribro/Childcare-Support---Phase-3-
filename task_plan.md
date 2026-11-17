# Task Plan: Fix 0.0.0.0:8080 Leak in Onboarding Flow & Validate Live Staging

## Goal
Eliminate the local development URL `https://0.0.0.0:8080` leak during field caseworker onboarding, ensure base URLs and redirects correctly resolve to the staging public URL (`https://cs-p3-production.web.app` or `https://childcare.allianceindia.org`), add regression tests, rebuild and redeploy staging revision on Cloud Run, and verify end-to-end.

## User Constraints & Rules
- Branch: strictly `gcp-migration`. Never touch `main`.
- Environment: Staging (`cs-p3-production`, `csc-staging`). Production mutations strictly forbidden.
- Zero secrets or PII in logs, commits, or responses.
- Follow `/planning-with-files` and `/goal` (thorough verification before completion).

## Current Phase: Complete

---

## Phases & Tasks

### Phase 1: Investigation & Root Cause Identification
- [x] Task 1.1: Locate all occurrences of `0.0.0.0`, `req.url`, `redirectUrl`, `buildGoogleAuthUrl`, `NEXT_PUBLIC_APP_URL`, `APP_BASE_URL` across client components and API routes.
- [x] Task 1.2: Check Cloud Run service `csc-staging` environment variables (`gcloud run services describe csc-staging`).
- [x] Task 1.3: Inspect `cloudbuild.staging.yaml` and `Dockerfile` to see how `NEXT_PUBLIC_APP_URL` is passed and baked.
- [x] Task 1.4: Document findings in `findings.md`.
- **Status:** complete

### Phase 2: Implementation & Fix
- [x] Task 2.1: Implement canonical base URL resolver function `getBaseAppUrl(req)` that prioritizes forwarded host (`x-forwarded-host`, `x-fh-requested-host`), then `NEXT_PUBLIC_APP_URL` / `APP_URL`, and strictly forbids `0.0.0.0`, `127.0.0.1`, or `localhost` in non-development environments.
- [x] Task 2.2: Fix `/api/auth/google/login/route.ts`, `/api/auth/google/callback/route.ts`, and `buildGoogleAuthUrl()` in `src/lib/server/googleAuth.ts`.
- [x] Task 2.3: In `Dockerfile`, pass `ARG NEXT_PUBLIC_APP_URL` and `ENV` into Stage 3 runner; set `_NEXT_PUBLIC_APP_URL: 'https://childcare.allianceindia.org'` in `cloudbuild.staging.yaml`.
- [x] Task 2.4: Write regression test suite `src/test/app-url-resolution.test.ts` (12 tests, 100% pass) asserting no redirect or generated URL contains `0.0.0.0` or `:8080`.
- **Status:** complete

### Phase 3: Verification & Build
- [x] Task 3.1: Run `npx vitest run` across test suite (12 tests in `app-url-resolution.test.ts` + 25 onboarding tests passed).
- [x] Task 3.2: Run `npx tsc --noEmit` type-check (0 errors).
- [x] Task 3.3: Run `npm run build` locally (compiled successfully with exit code 0).
- [x] Task 3.4: Commit code on `gcp-migration` (`f94a0cf`).
- [x] Task 3.5: Submit Cloud Build for new staging container image (`2188a67b-a91c-4bee-8915-4f455a72d9fe` -> SUCCESS, digest `sha256:d86b97621406eec4e477e69d7249339e0839e94daaf57022d4f82877a5e8ad02`).
- [x] Task 3.6: Deploy new revision `csc-staging-00018-2cw` to Cloud Run `csc-staging` with updated environment variables (`NEXT_PUBLIC_APP_URL`, `APP_URL`).
- **Status:** complete

### Phase 4: Live Staging Verification
- [x] Task 4.1: Verify live endpoints on `https://cs-p3-production.web.app` and `https://childcare.allianceindia.org/app`.
- [x] Task 4.2: Verify redirect Location header points to `https://...`, never `0.0.0.0:8080` (verified live HTTP 307 to `https://childcare.allianceindia.org/assessment/new?onboarding=direct&notice=google_auth_not_configured` and `https://cs-p3-production.web.app/...`).
- [x] Task 4.3: Verify direct field caseworker onboarding (`POST /api/auth/field-user/complete-onboarding` returned success with session token and assigned profile).
- [x] Task 4.4: Deliver final evidence table with commit SHA, revision ID, and proof.
- **Status:** complete

## Errors Encountered & Resolutions
| Error | Attempt | Resolution |
|---|---|---|
| `resolveSafeRedirectUrl` preserved port 8080 when host was changed | 1 | Explicitly set `parsed.hostname = publicBase.hostname; parsed.port = publicBase.port;` |
| `gcloud run deploy --set-env-vars` failed on comma in `ALLOWED_HOSTS` | 1 | Switched to `--update-env-vars="NEXT_PUBLIC_APP_URL=https://childcare.allianceindia.org,APP_URL=https://childcare.allianceindia.org"` |
| `gcloud run deploy` initially failed when image was still uploading | 1 | Waited for Cloud Build `2188a67b` image push step to report SUCCESS before deploying |
