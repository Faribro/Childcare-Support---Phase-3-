# Silent Outbox Send — Root Cause Analysis

**Branch:** `fix/silent-outbox-send-and-terminal-status-ui`
**Date:** 2026-09-10

---

## 1. Defect Summary

The Sync Centre shows "1 assessment on this device waiting to synchronize" and
a purple "Send 1 Waiting Record" button. Clicking produces no visible transition,
no network request, and no console output. The record stays in the local outbox.

---

## 2. Synthetic Trace — One Item Through the Full Path

The item has `chipStatus = 'Needs attention'`, mapping to `status = 'failed_final'`
in the UI layer. The actual DB row is:

```
SyncQueueItem {
  status: 'failed',
  lastErrorCode: <4xx>,
  nextRetryTimestamp: null,   // terminal — retries halted
  errorMessage: 'Terminal Failure (422): …'
}
```

| Step | Location | What happens | Bug? |
|------|----------|-------------|------|
| 1 | `syncQueueRepository.ts getPendingQueue()` | Correctly excludes `failed` with `nextRetryTimestamp===null`, `failed_final`, `conflict`, `needs_review` | ✅ correct |
| 2 | `page.tsx unifiedItems useMemo` L534–551 | For `status==='failed'` + 4xx sets `status='failed_final'`, `chipStatus='Needs attention'`. **`isOutbox` stays `true`** | ✅ `isOutbox=true` is correct — item IS on device |
| 3 | `page.tsx outboxItems` L605–607 | `filter(i => i.isOutbox)` — includes terminal items | ❌ **BUG-1**: terminal items counted as "waiting to send" |
| 4 | `page.tsx pendingCount` L613 | `pendingCount = outboxItems.length` — inflated | ❌ **BUG-2**: count is wrong |
| 5 | `page.tsx banner` L859–891 | Shows "N assessments waiting to synchronize" whenever `pendingCount > 0` | ❌ **BUG-3**: misleading text |
| 6 | `page.tsx handleSyncAll` L401–413 | Calls `flushQueue('manual')` with no terminal-item guard | ❌ **BUG-4**: button calls wrong action |
| 7 | `syncOrchestrator.ts flushQueue()` L83–578 | Calls `getPendingQueue(isForced=true)` → returns `[]` → returns `{status:'idle'}` silently | ✅ orchestrator is correct |
| 8 | `page.tsx handleSyncAll` finally | Sets `isSyncing=false`, refreshes data — no user feedback for idle | ❌ **BUG-5**: no feedback path for idle result |
| 9 | Card action buttons L733–758 | Only "View", "Edit", "History" — no per-card send/retry/review | ❌ **BUG-6**: no per-item action for terminal states |
| 10 | `failed_retryable` chip L547–549 | Set to `'Local'` — identical to an unsent draft | ❌ **BUG-7**: ambiguous chip |

---

## 3. Root Causes

### RC-1 — `pendingCount` includes terminal items
`outboxItems` uses `i.isOutbox` which is `true` for ALL non-synced queue items.
Terminal items (`failed_final`, `conflict`, `needs_review`) are legitimately
"on this device" but are NOT "waiting to synchronize" — they need human action.

### RC-2 — Banner and button text are misleading
"N assessments waiting to synchronize" + "Send N Waiting Record(s)" imply
automatic retry is available. For terminal items it is not.

### RC-3 — `handleSyncAll` is a no-op for terminal-only outbox
`flushQueue('manual')` returns `{status:'idle'}` when all outbox items are
terminal. The UI never surfaces this — the button silently does nothing.

### RC-4 — No `retryQueueItem(id)` function exists
There is no per-item retry path for `failed_retryable` items. The only retry
mechanism is bulk `flushQueue()` which processes all retryable items at their
backoff window.

### RC-5 — `failed_retryable` chip shows `'Local'`
A supervisor cannot distinguish "waiting to send for the first time" from
"previously attempted, currently in exponential backoff".

### RC-6 — No per-card action button for terminal states
Cards only have "View", "Edit", "History". A `failed_final` record needs an
attention affordance; a `conflict` needs "Review"; `failed_retryable` needs
"Retry now".

---

## 4. Safe Diagnostic Metadata (No PII / No Secrets)

- Queue item `status`: `'failed'`
- Queue item `lastErrorCode`: a 4xx numeric HTTP status
- Queue item `nextRetryTimestamp`: `null` (terminal marker)
- UI `chipStatus`: `'Needs attention'`
- UI `isOutbox`: `true`
- `getPendingQueue()` return: `[]`
- `flushQueue()` return: `{ status: 'idle', processedCount: 0 }`
