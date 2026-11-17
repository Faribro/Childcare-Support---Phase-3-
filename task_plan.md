# Task Plan: Fix 0.0.0.0:8080 Leak in Onboarding Flow & Validate Live Staging

## Goal
Eliminate the local development URL `https://0.0.0.0:8080` leak during field caseworker onboarding, ensure base URLs and redirects correctly resolve to the staging public URL (`https://cs-p3-production.web.app` or `https://childcare.allianceindia.org/app`), add regression tests, rebuild and redeploy staging revision on Cloud Run, and verify end-to-end.

## User Constraints & Rules
- Branch: strictly `gcp-migration`. Never touch `main`.
- Environment: Staging (`cs-p3-production`, `csc-staging`). Production mutations strictly forbidden.
- Zero secrets or PII in logs, commits, or responses.
- Follow `/planning-with-files` and `/goal` (thorough verification before completion).

## Current Phase: Phase 3: Verification & Build

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
- [ ] Task 3.1: Run `npx vitest run` across test suite.
- [x] Task 3.2: Run `npx tsc --noEmit` type-check.
- [ ] Task 3.3: Run `npm run build` locally.
- [ ] Task 3.4: Commit code on `gcp-migration`.
- [ ] Task 3.5: Submit Cloud Build for new staging container image.
- [ ] Task 3.6: Deploy new revision to Cloud Run `csc-staging` with updated environment variables (`NEXT_PUBLIC_APP_URL`, `APP_URL`, `ALLOWED_HOSTS`).
- **Status:** in_progress

### Phase 4: Live Staging Verification
- [ ] Task 4.1: Verify live endpoints on `https://cs-p3-production.web.app` and `https://childcare.allianceindia.org/app`.
- [ ] Task 4.2: Verify redirect Location header points to `https://...`, never `0.0.0.0:8080`.
- [ ] Task 4.3: Execute full 3-account verification (Leadership, State Team, Field Caseworker onboarding + survey submission).
- [ ] Task 4.4: Deliver final evidence table with commit SHA, revision ID, and proof.
- **Status:** pending

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| (None yet) | 1 | |
