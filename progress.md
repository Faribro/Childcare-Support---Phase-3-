# Progress Log: Elimination of 0.0.0.0:8080 Leak & Staging Verification

## 2026-11-17
- **05:55 UTC**: Investigated root cause of `https://0.0.0.0:8080` leak during onboarding redirect. Identified that Docker multi-stage build did not forward `ARG NEXT_PUBLIC_APP_URL` into the `runner` stage, and Node.js route handlers were using `new URL(path, req.url)` where `req.url` resolved to container local socket `http://0.0.0.0:8080`.
- **06:01 UTC**: Created `src/lib/server/appUrl.ts` with `isInternalHost(host)`, `getPublicAppBaseUrl(req)`, and `resolveSafeRedirectUrl(targetPath, req)`.
- **06:03 UTC**: Integrated `appUrl.ts` into `/api/auth/google/login`, `/api/auth/google/callback`, and `googleAuth.ts`.
- **06:04 UTC**: Updated `Dockerfile` Stage 3 (`runner`) to define `ENV NEXT_PUBLIC_APP_URL`, `ENV APP_URL`, and `ENV APP_BASE_URL`. Updated `cloudbuild.staging.yaml` with canonical URL.
- **06:05 UTC**: Wrote 12 unit and regression tests in `src/test/app-url-resolution.test.ts`. All 12 passed. Ran onboarding test suites (25 tests passed). Type-check passed with 0 errors.
- **06:07 UTC**: Local Next.js build completed with code 0.
- **06:08 UTC**: Committed changes to `gcp-migration` (`f94a0cf`).
- **06:13 UTC**: Cloud Build `2188a67b-a91c-4bee-8915-4f455a72d9fe` completed successfully with image digest `sha256:d86b97621406eec4e477e69d7249339e0839e94daaf57022d4f82877a5e8ad02`.
- **06:14 UTC**: Deployed new revision `csc-staging-00018-2cw` to Cloud Run `csc-staging`.
- **06:15 UTC**: Verified live `/api/health` returning commit `csc-staging-00018-2cw`.
- **06:15 UTC**: Tested live Google login redirect:
  - `https://childcare.allianceindia.org/api/auth/google/login` -> HTTP 307 `Location: https://childcare.allianceindia.org/assessment/new?onboarding=direct&notice=google_auth_not_configured` (0.0.0.0:8080 completely eliminated).
  - `https://cs-p3-production.web.app/api/auth/google/login` -> HTTP 307 `Location: https://cs-p3-production.web.app/assessment/new?onboarding=direct&notice=google_auth_not_configured`.
- **06:17 UTC**: Verified live field caseworker direct registration (`POST /api/auth/field-user/complete-onboarding` with state invitation code `ALN-MH-WR5A-4G9T`). Succeeded with HTTP 200, returning session token, assigned profile, and redirect URL `/assessment/new`.
