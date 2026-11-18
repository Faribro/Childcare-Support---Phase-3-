# Task Plan: Orientation Readiness — Complete Implementation, Staging Pre-Flight, & Production Release Plan

## Goal
Complete all remaining local implementation for stable field worker identity, mobile OTP lifecycle with shared challenge storage, 83-column linelist contract verification, and secure evaluator role-switching. Prepare an exact staging deployment request for owner approval, and formalize a production release plan with frozen baselines.

## Current Phase: Complete (Awaiting Staging Approval)

## Phases & Tasks

### Phase 1: Local OTP Gateway Integration & Durable Storage
- [x] Pin exact `otpgateway` Docker image and digest: `ghcr.io/knadh/otpgateway:v0.3.0@sha256:7b5d1e2e9c12b7a70821b22e1b1d034989063eb778ecff9d0124c96d9dc86976`.
- [x] Create `deploy/otpgateway/config.toml` with MSG91 India DLT-compliant webhook integration (`https://control.msg91.com/api/v5/otp`).
- [x] Create `deploy/otpgateway/Dockerfile`.
- [x] Implement `src/lib/server/firestoreOtpStore.ts` using Firestore `_otp_challenges` (prefixed with `_staging` if in staging on default db) with atomic `db.runTransaction()`, 60-second shared cooldown, 5/hr rate limits, 5-minute TTL, and single-use consumption.
- [x] Integrate `DistributedFirestoreOtpProvider` into `src/lib/server/otpgatewayAdapter.ts` with fail-closed security guards preventing `MockOtpProvider` in `staging` or `production`.
- [x] Create `src/test/multi-instance-otp-verification.test.ts` verifying atomic single-use (`ALREADY_USED`), cross-instance verification, shared cooldown, and attempt limits (5/5 passed).
- **Status:** COMPLETE

### Phase 2: Workflow & Contract Parity Verification
- [x] Verify canonical Linelist contract is exactly 83 columns in `gas/Code.js` and `apps-script-behavioral-simulation.test.ts` (26/26 passed). Phantom columns 84/85 rejected.
- [x] Verify stable server-stamped submission ownership: client cannot override `authorId`; display-name authorization eliminated (`stable-ownership-and-mobile-otp.test.ts`, 11/11 passed).
- [x] Restore agreed secure role-switching on Evaluation tab (`CompactMasthead.tsx`), prompting `EvaluationLoginModal` for authorized email OTP (`dashboard-auth-state-ux.test.tsx`, 11/11 passed).
- [x] Verify post-approval bank passbook upload preserves `APPROVED` status and increments OCC revision ($N \to N+1$) (`edit-record-capabilities.test.ts`, 13/13 passed).
- **Status:** COMPLETE

### Phase 3: Comprehensive Regression & Build Gates
- [x] Run full Vitest regression suite: 132 files passed, 1,702 tests passed, 26 skipped, 0 failed.
- [x] Run TypeScript check: `npm run typecheck` (`tsc --noEmit`) -> 0 errors.
- [x] Run Web production build: `npm run build` -> Next.js 14.2.35 standalone distribution created.
- [x] Run Native client build: `npm run build:native-client` -> Vite build succeeded in 13.80s.
- [x] Verify working tree clean on branch `gcp-migration`.
- **Status:** COMPLETE

### Phase 4: Staging Resource Plan & Production Freeze Plan
- [x] Document Cloud Run staging service name (`childcare-support-pwa-staging`), region (`asia-south1`), and namespace isolation on Firestore `(default)` database via `_staging_` prefixes.
- [x] Provide exact Cloud Run deploy and traffic rollback commands.
- [x] Formulate step-by-step Orientation Acceptance Test (Scenarios A through L).
- [x] Provide PowerShell Android build commands and truthfully mark native device acceptance as `NOT TESTED`.
- [x] Formalize Production Release Plan with frozen rollback baseline (Vercel commit `520f1a4`, deployment `dpl_6Xv8Cq9MyUiQBcBH7Q8zLig8S9zU`, Apps Script Version 35).
- **Status:** COMPLETE
