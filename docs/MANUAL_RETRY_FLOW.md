# Manual Retry Flow Contract

**Branch:** `fix/silent-outbox-send-and-terminal-status-ui`
**Date:** 2026-09-10

---

## 1. `retryQueueItem(queueItemId: number)` Contract

Located in: `src/lib/sync/syncOrchestrator.ts`

### Invariants

1. **Only `failed_retryable` items may be retried.** Terminal items (`failed_final`,
   `conflict`, `needs_review`) MUST NOT be retried via this path.
2. **`clientSubmissionId` is never regenerated.** The stable UUID is preserved.
3. **`remoteSubmissionId` is preserved** for UPDATE operations.
4. **Exactly one request is dispatched** — no looping, no fallback to `flushQueue()`.
5. **Status transitions** before and after dispatch:
   - Before: any retryable status
   - During: `syncing`
   - After success: `synced`
   - After failure: `failed_retryable` (retryable error) or `failed_final` (terminal error)
6. **Does not call `flushQueue()`** — standalone single-item dispatch only.

### Signature

```typescript
public async retryQueueItem(queueItemId: number): Promise<SyncResultItem>
```

### Return

Returns a `SyncResultItem` with the outcome. The caller (UI) uses this to show
the correct feedback — no swallowed errors.

---

## 2. Prerequisite Guards

Before dispatching, `retryQueueItem` must:

1. Fetch item from IndexedDB via `db.syncQueue.get(queueItemId)`
2. Verify item exists — if not, return `{ status: 'failed_final', message: 'Queue item not found' }`
3. Verify `status` is NOT in `['synced', 'failed_final', 'conflict', 'needs_review']` —
   if so, return `{ status: 'failed_final', message: 'Item is terminal and cannot be retried' }`
4. Verify `nextRetryTimestamp !== null || status === 'failed_retryable'` — prevents
   accidental retry of a record with `nextRetryTimestamp: null`

---

## 3. State Machine

```
[failed_retryable]
     │
     │  retryQueueItem(id) called
     ▼
[syncing]  ──── request dispatched ────►  [synced]          ✅ success
                                      │
                                      ├─► [failed_retryable] (5xx, timeout, network)
                                      │
                                      └─► [failed_final]    (400, 401, 403, 409, 422)
```

---

## 4. Caller (UI) Contract

The card-level "Retry now" button in `page.tsx`:

1. Shows `Sending…` spinner immediately (optimistic UI)
2. Calls `retryQueueItem(item.queueId)`
3. On resolved: calls `loadLocalData()` to refresh card state
4. Emits `console.info` diagnostic (dev/staging only — see Phase 4 contract)
5. Never exposes raw payload, secret, Sheet ID, or personal data in console/UI

---

## 5. `flushQueue()` vs `retryQueueItem()`

| | `flushQueue()` | `retryQueueItem(id)` |
|-|----------------|----------------------|
| Scope | All pending items | Single specific item |
| Trigger | Banner "Send all" button | Per-card "Retry now" button |
| Lock | Acquires global mutex | Acquires global mutex |
| Terminal items | Skipped via `getPendingQueue()` | Rejected by guard |
| Use for terminal items | ❌ Never | ❌ Never |
