# Silent Outbox Send — Test Evidence

**Branch:** `fix/silent-outbox-send-and-terminal-status-ui`
**Date:** 2026-09-10
**Test Runner:** Vitest v2.1.9

---

## Suite Summary

| Suite | Tests | Result |
|-------|-------|--------|
| `outbox-status-counting.test.ts` (new) | 26 | ✅ pass |
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
| **TOTAL** | **177** | ✅ **ALL PASS** |

---

## New Test Coverage: `outbox-status-counting.test.ts`

### Section 1 — getPendingQueue terminal exclusions (6 tests)
- ✅ Excludes `synced`
- ✅ Excludes `conflict`
- ✅ Excludes `needs_review`
- ✅ Excludes `failed` with `nextRetryTimestamp=null` + 4xx code
- ✅ Includes `failed` with `nextRetryTimestamp` in past (retryable)
- ✅ Includes `queued` items unconditionally

### Section 2 — UI counting contract: actionableCount vs attentionCount (7 tests)
- ✅ `ready_to_sync` → actionable
- ✅ `failed_retryable` → actionable
- ✅ `failed_final` → attention (NOT counted as waiting to send)
- ✅ `conflict` → attention (NOT counted as waiting to send)
- ✅ `synced` → not in outbox
- ✅ Send banner shown only when `actionableCount > 0`
- ✅ Attention banner shown when `actionableCount === 0 && attentionCount > 0`
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
