# Outbox Status Counting Contract

**Branch:** `fix/silent-outbox-send-and-terminal-status-ui`
**Date:** 2026-09-10

---

## 1. Seven Canonical Outbox Categories

Every queue item visible on the Sync Centre falls into exactly one of these:

| Category | `SyncQueueItem.status` values | isOutbox | Actionable? | UI label |
|----------|-------------------------------|---------|-------------|----------|
| QUEUED | `queued`, `QUEUED` | true | ✅ Send | "Waiting to send" |
| SYNCING | `syncing`, `SYNCING` (fresh) | true | — in flight | "Sending" |
| FAILED_RETRYABLE | `failed` with `nextRetryTimestamp !== null` | true | ✅ Retry | "Retrying" |
| FAILED_FINAL | `failed` with `nextRetryTimestamp === null` AND 4xx code | true | ❌ review | "Needs attention" |
| NEEDS_REVIEW | `needs_review`, `NEEDS_REVIEW` | true | ❌ review | "Needs attention" |
| CONFLICT | `conflict`, `NEEDS_REVIEW` (conflict metadata set) | true | ❌ review | "Conflict" |
| SYNCED | `synced`, `SYNCED` | false | — | "Submitted" |

---

## 2. Derived Counts

```
actionableCount = QUEUED items + FAILED_RETRYABLE items
attentionCount  = FAILED_FINAL items + NEEDS_REVIEW items + CONFLICT items
pendingCount    = actionableCount   // Used for "waiting to send" banner
outboxCount     = all isOutbox items (= actionableCount + attentionCount + SYNCING items)
```

**`pendingCount` MUST NOT include terminal items (FAILED_FINAL, NEEDS_REVIEW, CONFLICT).**

---

## 3. Banner Logic

```
if actionableCount > 0 AND attentionCount === 0:
  → amber banner: "N assessment(s) waiting to synchronize"
  → button: "Send N Waiting Record(s)"

if actionableCount > 0 AND attentionCount > 0:
  → amber banner: "N waiting + M needing attention"
  → button: "Send N Waiting Record(s)"

if actionableCount === 0 AND attentionCount > 0:
  → red/amber banner: "M record(s) need attention — manual review required"
  → button: HIDDEN (no send action available)

if actionableCount === 0 AND attentionCount === 0:
  → no banner
```

---

## 4. Button Semantics

| Outbox state | Button label | On click |
|--------------|-------------|----------|
| `QUEUED` | "Send now" | `flushQueue('manual')` |
| `FAILED_RETRYABLE` | "Retry now" | `retryQueueItem(queueItemId)` |
| `FAILED_FINAL` | "Needs attention" (disabled) | redirect to Edit |
| `NEEDS_REVIEW` | "Review record" (disabled) | redirect to Edit |
| `CONFLICT` | "Review conflict" | redirect to Edit |
| `SYNCING` | "Sending…" (disabled) | — |

---

## 5. Tab Labels

| Tab | Old label | New label | Count |
|-----|-----------|-----------|-------|
| All | All Records | All Records | `unifiedItems.length` |
| Outbox | Waiting to Send | On Device | `outboxItems.length` (all isOutbox) |
| Synced | Submitted Records | Submitted Records | `syncedItems.length` |

The "On Device" tab subtitle shows: `actionableCount waiting · attentionCount need attention`
