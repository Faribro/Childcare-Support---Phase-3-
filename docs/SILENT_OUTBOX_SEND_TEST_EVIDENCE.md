# Silent Outbox Send — Test Evidence

**Branch:** `fix/silent-outbox-send-and-terminal-status-ui`
**Date:** 2026-09-10
**Test Runner:** Vitest v2.1.9

---

## Suite Summary

| Suite | Tests | Result |
|-------|-------|--------|
| `outbox-status-counting.test.ts` (15 specification tests) | 15 | ✅ pass |
| `sync-request-builders.test.ts` | 18 | ✅ pass |
| `apps-script-advanced-services.test.ts` | 30 | ✅ pass |
| `apps-script-behavioral-simulation.test.ts` | 14 | ✅ pass |
| `integration/immediate-autosync.test.ts` | 13 | ✅ pass |
| `integration/blocker-remediation.test.ts` | 11 | ✅ pass |
| `api-contract-envelope.test.ts` | 10 | ✅ pass |
| `concurrency-and-lifecycle.test.ts` | 7 | ✅ pass |
| `supervisor-read-model.test.ts` | 5 | ✅ pass |
| `api-submissions.test.ts` | 5 | ✅ pass |
| `integration/supervisor-read-models.test.ts` | 6 | ✅ pass |
| `api-submissions-list.test.ts` | 8 | ✅ pass |
| `submissionSchema.test.ts` | 11 | ✅ pass |
| `nutritionCalculations.test.ts` | 10 | ✅ pass |
| `baseline.test.ts` | 2 | ✅ pass |
| `health/route.test.ts` | 1 | ✅ pass |
| **TOTAL VITEST SUITE** | **166** | ✅ **ALL PASS** |

---

## 15 Explicit Specification Requirements (`outbox-status-counting.test.ts`)

1. ✅ **Terminal item is not counted as waiting**: Verified `failed_final` (422) is excluded from `actionableCount`.
2. ✅ **NEEDS_REVIEW item displays Review, not Send**: Card button is `Review record`.
3. ✅ **QUEUED item displays Send now**: Card button is `Send now`, chip is `Waiting to send`.
4. ✅ **FAILED_RETRYABLE displays Retry now**: Card button is `Retry now`, chip is `Waiting to retry`.
5. ✅ **Clicking Send now transitions to SYNCING immediately**: Item status set to `syncing` in Dexie during dispatch.
6. ✅ **Clicking terminal Review opens the correct record route**: Directs to `/assessment/record/{id}/edit`.
7. ✅ **No-request case displays a visible reason**: Displays "This record needs attention before it can be sent. Open Review to see what must be corrected."
8. ✅ **Exactly one request is made on one click**: `fetch` called exactly 1 time on `retryQueueItem`.
9. ✅ **Double-click does not create duplicate requests**: Mutex prevents concurrent execution.
10. ✅ **422 result stops retry and shows safe field error**: `nextRetryTimestamp` set to `null`, retries halted.
11. ✅ **409 result shows conflict state**: Item status updated to `conflict` with halted retries.
12. ✅ **Successful acknowledgement updates IndexedDB to SYNCED**: Outcome `synced`, `nextRetryTimestamp` null.
13. ✅ **Stable idempotency key survives retry**: Original `idempotencyKey` preserved across retry calls.
14. ✅ **UPDATE retains remoteSubmissionId and expectedVersion**: Target URL retains `remoteSubmissionId` and `If-Match` header preserves `expectedVersion`.
15. ✅ **No raw payload or secret appears in logs**: Observability logs verify sensitive fields are stripped.

---

## Playwright E2E Suite (`e2e/silent-outbox-sync-centre.spec.ts`)

1. ✅ **Synthetic queued item shows Send now**
2. ✅ **Terminal invalid item shows Review record and NOT Send now**
3. ✅ **Click Send once and observe Sending state**
4. ✅ **Simulate success and observe Submitted status**
5. ✅ **Simulate 422 and observe Needs attention with Review button**
6. ✅ **Simulate no eligible item and verify visible explanation**
7. ✅ **Mobile 390px status/action layout remains usable with zero horizontal overflow**
- ✅ Legacy `pendingCount` alias equals `actionableCount`, NOT `outboxItems.length`

### Section 3 — retryQueueItem guards (8 tests)
- ✅ Rejects `synced`
- ✅ Rejects `failed_final`
- ✅ Rejects `conflict`
- ✅ Rejects `needs_review`
- ✅ Allows `queued`
- ✅ Allows `failed` with retryable code (503)
- ✅ Rejects `failed` with terminal code (422) + null timestamp

### Section 4 — chipStatus assignment (5 tests)
- ✅ `failed` + 409 → `'Conflict'`
- ✅ `failed` + 422 → `'Needs attention'`
- ✅ `failed` + 400 → `'Needs attention'`
- ✅ `failed` + 503 → `'Retrying'` (was `'Local'` — the RC-5 fix)
- ✅ `failed` + unknown → `'Retrying'`

---

## TypeScript Typecheck

```
npm run typecheck → tsc --noEmit → exit 0 (no errors)
```

## ESLint

```
npm run lint → exit 0 (pre-existing warnings only, no new errors)
```

## Production Build

```
npm run build → Next.js 15 build → exit 0 (all pages compiled)
```

---

## Root Causes Fixed

| ID | Description | Fixed In |
|----|-------------|---------|
| RC-1 | `pendingCount` included terminal items | `page.tsx` — split into `actionableCount` + `attentionCount` |
| RC-2 | Banner/button text misleading for terminal items | `page.tsx` — semantic conditional banners |
| RC-3 | `handleSyncAll` silent no-op for terminal-only outbox | `page.tsx` — early return guard + dev console.info |
| RC-4 | No `retryQueueItem(id)` function | `syncOrchestrator.ts` — new method with full terminal guards |
| RC-5 | `failed_retryable` chip showed `'Local'` (ambiguous) | `page.tsx` — new `'Retrying'` chip variant |
| RC-6 | No per-card action for terminal states | `page.tsx` — "Retry now" / "Review record" / "Review conflict" buttons |
