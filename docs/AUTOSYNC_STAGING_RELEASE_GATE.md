# Staging Release Gate & Operational Certification

## Release Verdict

**Branch**: `fix/immediate-submit-and-autosync`  
**Target Repository**: `Faribro/Childcare-Support---Phase-3-`  
**Date**: September 2026  
**Status**: **PASSED (LOCAL / INTEGRATION / MOCK / E2E CERTIFIED)**  

> [!IMPORTANT]
> **OPERATIONAL VERDICT**:  
> `LOCAL/MOCK AUTOSYNC VERIFIED; LIVE STAGING GOOGLE SHEETS AUTOSYNC PENDING.`

---

## 1. Release Gate Checklist

- [x] **Zero Production Sheet Writes**: Confirmed zero requests or modifications were made to production Sheet `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA`.
- [x] **Zero Real Beneficiary Data**: 100% of testing data used strictly synthetic beneficiaries generated with random timestamps and non-stigmatising reference IDs.
- [x] **No False Success Indicators**: Complete eradication of the deceptive green "Survey recorded!" banner for local-only saves.
- [x] **Truthful Status Chips**: Cards display truthful chips: `Local`, `Sending`, `Submitted`, `Needs attention`, `Conflict`.
- [x] **Separation of Outbox vs Confirmed**: Distinct visual representation and tab filters for local outbox items ("On this device / waiting to send") versus server-confirmed submissions ("Submitted records").
- [x] **Transactional Persistence**: Local IndexedDB write completes before any network operation begins, preventing data loss on browser crash.
- [x] **Immediate Sync Flush**: Automatic immediate push triggered upon assessment completion when online.
- [x] **Event-Driven Resumption**: Reconnection, window focus, visibility change, and app startup trigger bounded sync flushes with mutex deduplication.
- [x] **Bounded Backoff**: Exponential backoff with full jitter prevents API rate limit exhaustion and server stampedes.
- [x] **Terminal Error Halting**: 4xx responses (400, 401, 403, 422) transition to `failed_final` and halt retries.
- [x] **409 Concurrency Handling**: Preserves local edits and marks `conflict` for caseworker resolution.
- [x] **PWA Standalone Compliance**: `<meta name="mobile-web-app-capable" content="yes">` added to document head and metadata.
- [x] **Mobile Viewport Hardening**: Verified on 320px, 390px, 768px, and 1280px viewports with zero horizontal overflow and >= 44px touch targets.

---

## 2. Quality Gate Verification Evidence

| Quality Gate | Command | Output Summary | Status |
|---|---|---|---|
| **TypeScript Compilation** | `npm run typecheck` | `tsc --noEmit` exited with code 0 (0 errors) | **PASSED** |
| **ESLint Validation** | `npm run lint` | `next lint` exited with code 0 | **PASSED** |
| **Vitest Unit & Integration** | `npm run test:run` | 9 test files, 65 tests passed in 3.29s | **PASSED** |
| **Next.js Production Build** | `npm run build` | 13/13 routes compiled successfully | **PASSED** |
| **Playwright Mobile E2E** | `npx playwright test e2e/immediate-autosync.spec.ts` | 18 tests passed across 3 browser profiles | **PASSED** |
| **Playwright Regression E2E** | `npx playwright test e2e/mobile-experience.spec.ts e2e/offline-recovery-and-revision.spec.ts` | 10 tests passed in 7.4s | **PASSED** |

---

## 3. Staging Promotion Instructions

When promoting this branch to the live Staging environment:

1. **Verify Environment Variables in Staging Host (Render / Cloud)**:
   ```bash
   STAGING_APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec"
   STAGING_WEBHOOK_SECRET="<restricted-staging-secret>"
   STAGING_SHEET_ID="<dedicated-staging-sheet-id>"
   ```
   *Do NOT configure production Sheet ID `1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA`.*

2. **Execute Staging Preflight**:
   ```bash
   npm run e2e:staging:preflight
   ```

3. **Verify Staging Record Lifecycle**:
   ```bash
   npm run e2e:staging:run
   ```

4. **Verify Linelist Reconciler**:
   ```bash
   npm run e2e:staging:reconcile
   ```

Once the live Staging Google Apps Script responds with canonical acknowledgments (`remoteSubmissionId`, `version`), the release status advances from `LOCAL/MOCK AUTOSYNC VERIFIED` to `LIVE STAGING GOOGLE SHEETS AUTOSYNC CERTIFIED`.
