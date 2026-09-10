# Canonical Immediate Submission Architecture

## 1. System Overview & Invariant Rules

The Childcare PWA submission pipeline establishes exactly one active submission owner: `submissionWorker`.
All form completions, reconnects, visibility resumptions, and app-init hydration events route through this single worker.

### Primary Invariants:
1. **Single Runtime Owner**: `submissionWorker` is the sole active manager of dispatching, concurrency mutex, backoff timers, and acknowledgement persistence. `syncOrchestrator` is retired from all runtime UI paths.
2. **Canonical Identity Contract**:
   - `clientSubmissionId`: Stable client UUID v4 generated once upon final form submission; never regenerated on retry.
   - `createIdempotencyKey`: Stable string (`create-${clientSubmissionId}`) preserved across retries.
   - `remoteSubmissionId`: Server-assigned UUID v4 received exclusively from server acknowledgement.
   - `expectedVersion`: Positive integer (`>= 1`) representing the confirmed remote version.
3. **No ART Reference in URLs**: Business reference identifiers (e.g. `ART-TEST-0001`, `DL-SOU-101550-01`) are strictly restricted to the payload body (`demographics.artNumber`). They are prohibited by runtime assertion guards from appearing in any URL path or query parameter.
4. **No Auto-Conversion of Invalid UPDATE to CREATE**: If an item is enqueued as an UPDATE or has update intent, but lacks a valid UUID `remoteSubmissionId` or `expectedVersion >= 1`, it is never auto-converted to a CREATE. It is quarantined to `failed_final` (`ACTION_REQUIRED`) with error category `invalid_update_identity`.

---

## 2. End-to-End Data Flow

```
[ Form Submit (new / draft / review) ]
                 |
                 v
   [ Dexie Atomic Transaction ]
     - Saves snapshot in db.drafts (syncStatus: 'queued')
     - Saves queue item in db.syncQueue (operationType: 'CREATE', status: 'queued')
                 |
                 v
   [ submissionWorker.processQueue('form_submit') ]
     - Evaluates navigator.onLine (defers to WAITING_FOR_CONNECTION if offline)
     - Acquires in-process global mutex (_isRunning lock)
     - Runs migrateLegacyItems()
     - Retrieves pending dispatch queue
                 |
                 v
   [ submissionGateway.gatewayCreate() ]
     - Body: canonical payload + createIdempotencyKey
     - Headers: Idempotency-Key, Content-Type, X-Correlation-Id
     - URL: POST /api/submissions (no ID in URL)
                 |
                 v
   [ Next.js API Route: /api/submissions ]
     - Authenticates caseworker/supervisor session
     - Validates submission schema
     - Calls canonicalSubmissionAdapter.createSubmission()
                 |
                 v
   [ canonicalSubmissionAdapter ]
     - Dispatches to Google Apps Script / MockSheetStore
     - Receives confirmed row append acknowledgement
                 |
                 v
   [ Server Acknowledgement: 201 Created ]
     { acknowledged: true, remoteSubmissionId, version: 1, requestId }
                 |
                 v
   [ submissionQueueRepository.markSubmitted() ]
     - Updates db.syncQueue status to 'synced'
     - Updates db.drafts with remoteSubmissionId & version: 1
     - Emits submissionEvents 'submission:success'
     - Releases mutex
                 |
                 v
   [ UI React State & Read Model Notifier ]
     - Status updates instantly to SUBMITTED
     - Read models & Submitted Surveys refresh automatically
```

---

## 3. Concurrency Mutex & Single Scheduler Policy

- **Global In-Process Mutex**: `acquireLock()` / `releaseLock()` ensures only one `processQueue()` loop executes at any time.
- **Single Scheduler**: Exactly one `_retryTimer` (`setTimeout`) exists per application runtime. Any prior timer is cleared before scheduling a new delay.
- **Unified Triggers**:
  - Form submit: `processQueue('form_submit')`
  - App hydration: `resumeOnHydration()`
  - Network online: `window.addEventListener('online', () => processQueue('online_event'))`
  - Tab visibility: `document.addEventListener('visibilitychange', () => processQueue('visibility_visible'))`
  - Retry timer: `scheduleRetry() -> processQueue('retry_timer')`

All triggers route to the exact same entry point and obey the same mutex.
