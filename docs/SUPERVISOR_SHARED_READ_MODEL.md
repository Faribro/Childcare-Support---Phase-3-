# Supervisor Shared Read Model Architecture

## Architecture Summary
The Supervisor Shared Read Model (`src/lib/read-model/supervisorReadModel.ts`) is a centralized, in-memory singleton service that governs all supervisor-facing data queries across the Child Nutrition Support PWA.

It eliminates data discrepancies, race conditions, and uncoordinated fetch loops between:
- Executive Dashboard (`/supervisor`)
- Beneficiary Linelist (`/supervisor/assessments`)
- Population Clinical Surveillance (`/supervisor/analytics`)
- Sync Centre Outbox & Reconciliation (`/assessment/sync`)

```
               ┌──────────────────────────────────────────────┐
               │    SupervisorReadModelService (Singleton)    │
               │                                              │
               │  - In-Flight Request Deduplication Promise   │
               │  - Exponential Backoff & Jitter Scheduler    │
               │  - Terminal 4xx Polling Halt Guard           │
               │  - Tab Visibility & Online Event Listeners   │
               │  - Local Offline Snapshot Cache Manager      │
               └──────┬────────────────┬──────────────┬───────┘
                      │                │              │
           ┌──────────┴──────┐ ┌───────┴──────┐ ┌─────┴──────────┐
           │   /supervisor   │ │ /assessments │ │   /analytics   │
           └─────────────────┘ └──────────────┘ └────────────────┘
```

---

## Key Design Patterns & Invariants

### 1. In-Flight Request Deduplication
When multiple components mount or trigger fetches concurrently (e.g. tabs switching or dashboard overview loading), subsequent calls return the existing `inFlightPromise`. Only one HTTP request ever travels across the network at a time:
```ts
if (this.inFlightPromise) {
  return this.inFlightPromise;
}
```

### 2. Request Timeout & AbortController
Every outbound request is strictly bound to a 15-second AbortController timeout:
```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);
```
This guarantees UI operations never hang indefinitely on cold starts or stalled connections.

### 3. Visibility-Aware Polling
Polling automatically suspends when the browser tab is hidden (`document.visibilityState !== 'visible'`). Upon returning to the tab, if more than 30 seconds have elapsed or if the previous status was an error, an immediate refresh is dispatched.

### 4. Lifecycle Event Integration
The singleton automatically triggers immediate re-fetches when domain events occur:
- `online`: Triggers immediate fetch and resets failure counters.
- `child_nutrition:sync_completed`: Triggers immediate linelist re-validation after field records are uploaded.
- `child_nutrition:record_synced`: Incrementally syncs updated records.

### 5. Local Offline Cache Retention
When an upstream fetch fails:
- If cached records exist from a previous successful fetch, `status` is set to `offline_cache`.
- Existing linelist rows are preserved on screen, accompanied by an informative offline banner.
- Under NO circumstance are records purged or converted into empty arrays `[]` on an error.
