# Phase B Report: Login, Onboarding & Reporting Stores on Firestore

**Date**: 2026-11-13  
**Branch**: `gcp-migration`  
**Latest Commits**:
- `07a6f80` - `feat(auth): implement FirestoreLeaderAuthStore with multi-instance locking and TTL (Phase B1)`
- `b0b5b9d` - `feat(onboarding): implement FirestoreOnboardingStore with atomic redemption counters (Phase B2)`
- `e1194a8` - `feat(reporting): implement Firestore export audit, reporting sessions, and state-SRs reference store (Phase B3-B4)`
- `d28258b` - `test(firestore): add Phase B multi-instance test suite, compound indexes, and security rules (Phase B6-B7)`

---

## 1. Needs the Owner
*The following commands are documented for the project owner to run when ready in the GCP Console or Cloud Shell. None were executed by the agent.*

### A. Firestore TTL Configuration Commands
Run these commands in Cloud Shell / gcloud CLI against project `cs-p3-production` to activate native automatic expiration on expiring collections.

#### 1. Staging Database (`database=staging`)
```bash
# Auth rate limits (15-min IP and credential windows)
gcloud firestore fields ttls update expiresAt --collection-group=auth_attempts --project=cs-p3-production --database=staging --enable-ttl

# Leadership OTP challenges (10-min window)
gcloud firestore fields ttls update expiresAt --collection-group=leader_otp_challenges --project=cs-p3-production --database=staging --enable-ttl

# Leadership sessions (8-hour maximum lifetime)
gcloud firestore fields ttls update expiresAt --collection-group=leadership_sessions --project=cs-p3-production --database=staging --enable-ttl

# State team coordinator onboarding OTP challenges (15-min window)
gcloud firestore fields ttls update expiresAt --collection-group=state_team_challenges --project=cs-p3-production --database=staging --enable-ttl

# State team invitations (30-day window)
gcloud firestore fields ttls update expiresAtDate --collection-group=state_team_invitations --project=cs-p3-production --database=staging --enable-ttl

# Export audit preview contracts (15-min confirmation window)
gcloud firestore fields ttls update expiresAt --collection-group=export_preview_contracts --project=cs-p3-production --database=staging --enable-ttl

# Export audit delivery jobs (7-day dispatch audit retention)
gcloud firestore fields ttls update expiresAt --collection-group=export_delivery_jobs --project=cs-p3-production --database=staging --enable-ttl

# Leadership conversational reporting sessions (7-day retention)
gcloud firestore fields ttls update expiresAt --collection-group=reporting_sessions --project=cs-p3-production --database=staging --enable-ttl
```

#### 2. Production Database (`database=(default)`)
```bash
gcloud firestore fields ttls update expiresAt --collection-group=auth_attempts --project=cs-p3-production --database="(default)" --enable-ttl
gcloud firestore fields ttls update expiresAt --collection-group=leader_otp_challenges --project=cs-p3-production --database="(default)" --enable-ttl
gcloud firestore fields ttls update expiresAt --collection-group=leadership_sessions --project=cs-p3-production --database="(default)" --enable-ttl
gcloud firestore fields ttls update expiresAt --collection-group=state_team_challenges --project=cs-p3-production --database="(default)" --enable-ttl
gcloud firestore fields ttls update expiresAtDate --collection-group=state_team_invitations --project=cs-p3-production --database="(default)" --enable-ttl
gcloud firestore fields ttls update expiresAt --collection-group=export_preview_contracts --project=cs-p3-production --database="(default)" --enable-ttl
gcloud firestore fields ttls update expiresAt --collection-group=export_delivery_jobs --project=cs-p3-production --database="(default)" --enable-ttl
gcloud firestore fields ttls update expiresAt --collection-group=reporting_sessions --project=cs-p3-production --database="(default)" --enable-ttl
```

### B. Firestore Indexes Deployment
Deploy the updated compound indexes from `firestore.indexes.json` using Firebase CLI:
```bash
firebase deploy --only firestore:indexes --project=cs-p3-production
```

---

## 2. Plain Language Summary of Changes

### What Changed (Behind `DATA_ENGINE=firestore`)
1. **Leadership Authentication (`leaderAuthStore.ts`)**:
   - Implemented `FirestoreLeaderAuthStore` implementing `LeaderAuthStore`.
   - Stores OTPs and session tokens strictly as cryptographic SHA-256 hashes with constant-time equality comparisons (`crypto.timingSafeEqual`) to prevent timing side-channels.
   - Enforces a single active session per leader: establishing a session on any instance atomically revokes any previous sessions across all Cloud Run instances.
   - Tracks brute-force verification failures atomically in Firestore: locks out after 5 failures and returns HTTP 429.
   - Tracks request rate limits in `auth_attempts` (`leader_rl_<sanitized_ip>`) shared across instances with 15-minute sliding windows.
   - Preserves all cookie names (`leader_session_id`, `leader_device_binding`), security flags (`HttpOnly`, `Secure`, `SameSite=Lax`), and lifetimes (30-min idle, 8-hr absolute).
   - In production/staging, fails closed with HTTP 503 / `UNAVAILABLE` when Firestore is unreachable; in-memory fallback is strictly blocked.

2. **Onboarding Store (`onboardingStore.ts`)**:
   - Implemented `FirestoreOnboardingStore` implementing `OnboardingStore`.
   - Manages state team registrations (`state_team_registrations`), coordinator invitations (`state_team_invitations`), onboarding challenges (`state_team_challenges`), and field user profiles (`field_user_profiles`).
   - Uses atomic transactions (`db.runTransaction`) to guarantee that multi-user invitation redemptions cannot exceed `maxRedemptions` under high concurrency across separate Cloud Run instances.
   - Same fail-closed and TTL rules applied.

3. **Export Confirmation Store (`export-confirmation-store.ts`)**:
   - Implemented `FirestoreExportConfirmationStore` implementing `IExportConfirmationStore`.
   - Provides atomic two-phase confirmation: validates preview contract, verifies parameters hash, and constant-time checks confirmation short codes or standard confirm commands.
   - Enforces single-use: replaying a consumed token returns `ALREADY_CONSUMED` and duplicate deliveries are blocked.
   - Manages delivery queue in `export_delivery_jobs` with worker leases and stale job recovery.

4. **Reporting Sessions (`session-repository.ts`) & State-SRs Reference Data (`state-srs/route.ts`)**:
   - Implemented `FirestoreReportingSessionRepository` in `session-repository.ts` using collection `reporting_sessions` (TTL `expiresAt: 7 days`).
   - Wired `FirestoreReportingSessionRepository` and `FirestoreExportConfirmationStore` into `src/lib/server/whatsappPipelineFactory.ts` when `DATA_ENGINE=firestore`.
   - Updated `src/app/api/reference-data/state-srs/route.ts`: queries Firestore collection `state_sub_recipients` when `DATA_ENGINE=firestore`. If unconfigured or empty, it returns `[]` with HTTP 200 without throwing.

5. **Security Rules (`firestore.rules`) & Compound Indexes (`firestore.indexes.json`)**:
   - Added comments and explicit coverage in `firestore.rules` for all 16 collections: all client web/SDK reads and writes are rejected (`allow read, write: if false;`). Access is exclusively server-side via Cloud Admin SDK / IAM.
   - Added composite indexes for compound queries used across all new collections (`leader_otp_challenges`, `leadership_sessions`, `state_team_invitations`, `state_team_registrations`, `export_delivery_jobs`, `state_sub_recipients`).

6. **Comprehensive Test Suite (`src/test/phase-b-firestore-stores.test.ts`)**:
   - 21 comprehensive tests verifying multi-instance synchronization, OTP lifecycle, single active session enforcement, brute-force lockouts, atomic onboarding redemption, export audit two-phase confirmation, environment isolation guards, production fail-closed behavior, and zero secret leakage.

### What Did NOT Change
- Defaults remain `DATA_ENGINE=sheets` and `STORAGE_PROVIDER=tigris`.
- Production frozen deployment (`520f1a4`) and Apps Script Version 35 are untouched.
- Local `main` branch (`da8ac97`) is untouched; all work is strictly on `gcp-migration`.
- WhatsApp inbound remains disabled (`WHATSAPP_WEBHOOK_ENABLED=false`).
- Zero plaintext passwords, OTPs, session tokens, or hashes are stored or logged.

---

## 3. Exhaustive Firestore Collection Inventory (B7 Deliverable)

| # | Collection Name | Document ID Rule | TTL Field | Purpose |
|---|-----------------|------------------|-----------|---------|
| 1 | `submissions` | `clientSubmissionId` (e.g. `CSC-MH-PUN-081200-01`) | None (Permanent) | Primary child survey and nutrition assessment records |
| 2 | `attachment_metadata` | `att_${submissionId}_${fieldKey}` | None (Permanent) | Photo/PDF upload metadata and signed GCS URL pointers |
| 3 | `sheets_mirror_retry_queue` | `jobId` (UUID) | None (Active until synced) | Google Sheets mirror retry queue and dead-letter jobs |
| 4 | `evaluation_credentials` | `accessIdentifier` (e.g. `STATE-MH`, `ADMIN-SYSTEM`) | None (Permanent) | Evaluation access credentials and Argon2id password hashes |
| 5 | `auth_attempts` | `cred_${sanitized_cred}_${sanitized_ip}` / `ip_${sanitized_ip}` / `leader_rl_${sanitized_ip}` | `expiresAt` (15 min) | Multi-instance brute-force rate limit counters |
| 6 | `leader_otp_challenges` | `challengeId` (UUID) | `expiresAt` (10 min) | Single-use email OTP challenges for Leadership sign-in |
| 7 | `leadership_sessions` | `sessionId` (64-char hex) | `expiresAt` (8 hrs) | Single active session state per leader |
| 8 | `leader_identities` | `leaderId` (e.g. `lead-test-01`) | None (Permanent) | Directory of allowlisted leaders and geographic scopes |
| 9 | `state_team_registrations` | `reg_${timestamp}_${hex}` | None (Audited) | State coordinator onboarding applications |
| 10 | `state_team_invitations` | `inv_${timestamp}_${hex}` | `expiresAtDate` (30 days) | Field coordinator invitations with atomic redemption counters |
| 11 | `state_team_challenges` | `workEmail` (lowercase normalized) | `expiresAt` (15 min) | State coordinator email verification OTP challenges |
| 12 | `field_user_profiles` | `googleSub` / `id` | None (Permanent) | Google-authenticated field surveyor profiles and scopes |
| 13 | `export_preview_contracts` | `exportId` (UUID/hex) | `expiresAt` (15 min) | Two-phase export confirmation preview contracts |
| 14 | `export_delivery_jobs` | `jobId` (UUID/hex) | `expiresAt` (7 days) | Asynchronous email export dispatch delivery queue |
| 15 | `reporting_sessions` | `userId` (Caller UUID) | `expiresAt` (7 days) | Conversational leadership reporting chat state |
| 16 | `state_sub_recipients` | `code` or `id` (e.g. `SR-MH-01`) | None (Master Data) | Reference data of active state sub-recipient organizations |

---

## 4. Test Suite & Build Verification Results

| Suite / Check | Baseline | Phase A Result | Phase B Result | Status |
|---------------|----------|----------------|----------------|--------|
| **Vitest Test Files** | 110 passed | 112 passed | **113 passed (113)** | **PASS** |
| **Vitest Tests** | 1,509 passed | 1,514 passed | **1,535 passed (1,535)** | **PASS** |
| **Vitest Skipped** | 26 skipped | 26 skipped | **26 skipped (26)** | **UNCHANGED** |
| **New Phase B Tests** | - | - | **21 passed** (`phase-b-firestore-stores.test.ts`) | **PASS** |
| **TypeScript Typecheck** (`tsc --noEmit`) | 0 errors | 0 errors | **0 errors** | **PASS** |
| **Next.js Production Build** (`next build`) | Succeeded | Succeeded | **Succeeded (22 static pages, all dynamic routes bundled)** | **PASS** |

---

## 5. Risk Assessment & Mitigations

1. **Firestore Compound Indexes Missing at Runtime**:
   - *Risk*: Firestore rejects compound queries with an index error if queries are not registered.
   - *Mitigation*: All compound queries used in Phase B (`email` + `isUsed`, `leaderId` + `isRevoked`, `state` + `status`, etc.) are pre-registered in `firestore.indexes.json`.
2. **Cold-Start Instance Concurrency**:
   - *Risk*: Multiple Cloud Run instances attempting simultaneous invitation redemption or password verification.
   - *Mitigation*: All mutating operations use `db.runTransaction` with optimistic read-write validation directly in Firestore, preventing race conditions.
3. **Environment Isolation Guard**:
   - *Risk*: Accidental writes from staging into the production `(default)` database.
   - *Mitigation*: Hard runtime guard in `validateFirestoreDatabaseEnvironment` halts execution immediately if `APP_ENV=staging` is run against `(default)` or `APP_ENV=production` is run against `staging`.
