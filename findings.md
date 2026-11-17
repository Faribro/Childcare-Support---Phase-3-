# Findings & Discoveries: Fix 0.0.0.0:8080 Leak in Onboarding Flow

## 1. Root Cause Analysis
The leak of `https://0.0.0.0:8080` occurs because of three interconnected factors:
1. **Container Binding Host Leak**: Cloud Run runs the Node container listening on `0.0.0.0:8080`. When route handlers (`/api/auth/google/login`, `/api/auth/google/callback`) call `new URL(path, req.url)` or `req.nextUrl.host`, the host header internal to the container is `0.0.0.0:8080` instead of the public host header (`x-forwarded-host` or `x-fh-requested-host`).
2. **Missing Runtime Environment Variables**: `NEXT_PUBLIC_APP_URL` was defined as an ARG in `Dockerfile` Stage 2 (`builder`), but was completely missing from Stage 3 (`runner`). Furthermore, `csc-staging` Cloud Run service did not have `NEXT_PUBLIC_APP_URL` or `APP_URL` defined in its container environment variables. At runtime on the server, `process.env.NEXT_PUBLIC_APP_URL` evaluated to `undefined`, so fallbacks to `req.url` were invoked.
3. **Google OAuth 400 Root Cause**: `buildGoogleAuthUrl()` in `src/lib/server/googleAuth.ts` used `const url = new URL(req.url); const origin = ${url.protocol}//${url.host}; const redirectUri = ...;` which generated `redirect_uri=http://0.0.0.0:8080/api/auth/google/callback`. Google OAuth rejects `0.0.0.0` as a malformed redirect URI (HTTP 400).
4. **Google OAuth Callback Leak**: In `src/app/api/auth/google/callback/route.ts`, line 21 had `const appBaseUrl = ${url.protocol}//${url.host}/app;`, meaning any auth cancellation, error, or completion would redirect to `http://0.0.0.0:8080/app`.

## 2. Solution Architecture
1. **Centralized Base URL Resolver**: Create a robust `getPublicAppBaseUrl(req?: NextRequest)` in `src/lib/server/appUrl.ts` (or `googleAuth.ts`) that:
   - Reads `x-forwarded-host` or `x-fh-requested-host` (from Firebase Hosting / Cloud Load Balancing).
   - Validates that the host is NOT an internal container listener (`0.0.0.0`, `127.0.0.1`, `localhost` in non-dev).
   - If internal host or missing, falls back to `process.env.APP_URL` || `process.env.NEXT_PUBLIC_APP_URL` || `'https://childcare.allianceindia.org'`.
   - Forces `https` protocol in deployed environments.
2. **Update Route Handlers**:
   - `src/app/api/auth/google/login/route.ts`: use `getPublicAppBaseUrl(req)`.
   - `src/app/api/auth/google/callback/route.ts`: use `getPublicAppBaseUrl(req)`.
   - `src/lib/server/googleAuth.ts` (`buildGoogleAuthUrl`): use `getPublicAppBaseUrl(req)` for `redirectUri`.
   - `src/app/api/auth/field-user/complete-onboarding/route.ts`: ensure `redirectUrl` is clean relative `/assessment/new` or uses `getPublicAppBaseUrl(req)`.
3. **Dockerfile & Cloud Build Configuration**:
   - In `Dockerfile`, pass `ARG NEXT_PUBLIC_APP_URL` into Stage 3 (`runner`) and set `ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL`, `ENV APP_URL=$NEXT_PUBLIC_APP_URL`.
   - In `cloudbuild.staging.yaml`, set `_NEXT_PUBLIC_APP_URL: 'https://childcare.allianceindia.org'`.
   - In `csc-staging` Cloud Run service, set `NEXT_PUBLIC_APP_URL=https://childcare.allianceindia.org`, `APP_URL=https://childcare.allianceindia.org`, and ensure `ALLOWED_HOSTS` includes `childcare.allianceindia.org`.
4. **Regression Testing**:
   - Write comprehensive tests asserting that `getPublicAppBaseUrl()` and all redirect endpoints NEVER emit `0.0.0.0` or `:8080` even when simulated behind Cloud Run with internal `req.url`.
