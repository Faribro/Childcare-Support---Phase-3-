# Offline-First Synchronisation State Machine Specification

## 1. Overview & Principles
The Childcare Support PWA operates strictly **offline-first**. All casework actions (creating assessments, recording caregiver consent signatures, attaching identity documents, and modifying revisions) must guarantee:
1. **Local Durability First**: No network transmission is attempted until the assessment is committed to local persistent storage (Dexie IndexedDB).
2. **Deterministic State Transitions**: Every state transition is recorded durably with a timestamp and audit trail.
3. **No False Positives**: An assessment is NEVER presented to the caseworker as "Submitted" or "Synced" until canonical Google Sheets / Apps Script acknowledgement is verified with a `remoteSubmissionId`, `version`, `updatedAt`, and `requestId`.
4. **Resilient Retry Lifecycle**: Transient failures (offline, timeouts, 5xx) retain the payload and retry automatically on network events, window focus, visibility change, and app startup using bounded exponential backoff with full jitter.
5. **Actionable Non-Retriable Handling**: 4xx schema/auth failures transition to `FAILED_FINAL` and 409 concurrency conflicts transition to `NEEDS_REVIEW` without auto-retry loops.

---

## 2. Standard State Diagram

```
 [Caseworker Form Fill]
          │
          ▼
       [DRAFT] ◄────────────── (Editing form fields, auto-saving to local drafts)
          │
          ▼ (Caseworker taps "Submit Survey")
 [FINALIZED_LOCAL] ─────────── (Snapshot validated & frozen in Dexie db.drafts)
          │
          ▼
      [QUEUED] ─────────────── (Enqueued into db.syncQueue with idempotencyKey)
          │
          ├── [Offline] ────► Retained in outbox; will trigger on online/focus/visibility
          │
          ▼ [Online & Mutex Acquired]
      [SYNCING] ────────────── (POST /api/submissions or PATCH /api/submissions/[id])
          │
   ┌──────┴──────────────────────────┬─────────────────────────┬──────────────────────┐
   │ 200/201 Canonical Ack           │ Network / 5xx / Timeout │ 400 / 401 / 403 / 422│ 409 Conflict
   ▼                                 ▼                         ▼                      ▼
[SYNCED]                     [FAILED_RETRYABLE]          [FAILED_FINAL]         [NEEDS_REVIEW]
• remoteSubmissionId stored  • Exponential backoff      • Halt auto-retry      • Retain local edit
• version/revision stored    • Retained in outbox        • Actionable error UI  • Show version diff
• Supervisor cache refreshed • Auto-retries on online/   • Caseworker edit/fix  • Caseworker resolve
                             visibility/focus
```

---

## 3. State Definitions & Transition Criteria

| State | Storage Location | Invariant Criteria | UI Representation |
|---|---|---|---|
| **`DRAFT`** | `db.drafts` | Incomplete or unfinalised form. May have missing required fields. Can be edited at any time. | Status: "Draft" |
| **`FINALIZED_LOCAL`** | `db.drafts` | Complete assessment frozen locally. All mandatory client fields present. Verified saved to disk. | Status: "Saved to this device" |
| **`QUEUED`** | `db.syncQueue` | Outbox item created with stable UUID and `idempotencyKey`. Next retry timestamp assigned. | Status: "Waiting to send" |
| **`SYNCING`** | `db.syncQueue` | Client mutex acquired. Active HTTP dispatch in-flight. | Status: "Sending now…" |
| **`SYNCED`** | `db.syncQueue` & `db.drafts` | Server response 200 with `status: 'success'`, `remoteSubmissionId`, `version`, `updatedAt`, and `requestId`. | Status: "Submitted" (with reference & timestamp) |
| **`FAILED_RETRYABLE`**| `db.syncQueue` | Fetch threw `TypeError`, timeout (504), server error (500/502/503), or offline. Increments `retryCount`. Schedules `nextRetryTimestamp` via `min(300, 2^retryCount * 3)s + jitter`. | Status: "Waiting to retry" |
| **`FAILED_FINAL`** | `db.syncQueue` | Client schema error (422), bad request (400), or authentication rejection (401/403). Automatic retries halted. | Status: "Needs attention" |
| **`NEEDS_REVIEW`** | `db.syncQueue` | Concurrency conflict (409). Remote version advanced by another caseworker. Automatic retries halted to prevent overwrite. | Status: "Conflict / Review needed" |

---

## 4. Mutex & Concurrency Rules

1. **Single Execution Mutex**: Only one outbox flush may run at any time (`acquireSyncLock()` / `releaseSyncLock()`). Parallel calls from `online` events, polling intervals, and user clicks return early if a sync is already in progress.
2. **Safe Idempotency**: Each queue item carries an `idempotencyKey`. If a connection drops after the server processes the write but before the client receives the ack, subsequent retries send the identical idempotency key, allowing the server/bridge to return the canonical record without creating duplicate Sheet rows.
3. **Queue Independence**: Each queue item is processed independently. A failure on item #1 does not corrupt or block the processing of item #2.
4. **Never Invalidate Local on Error**: No queue item or draft is ever purged upon receiving an error or timeout.
