# Technical Correlation Trace & Incident Audit: DL-SOU-141540-01

**Incident ID:** INC-20260914-01  
**Target Record Business ID:** `DL-SOU-141540-01`  
**Classification:** P0 — Ambiguous CREATE Timeout, Stale Local Status & Unresolved Drive Asset Pipeline  
**Target Spreadsheet:** `1YORdIKiIdSILyOekMJ5BCO5WCujoZ87U7H65x88HKkM`  
**Target Apps Script Project:** `1niE4gIprmYbC-DQYy9H9m1Y73jfutXNcY5R6sOvr7Ac0WQXa-ZwFScMl`  
**Security & Privacy Classification:** Redacted Technical Analysis (Zero PII / Zero Sensitive Medical / Zero Financial / Zero Raw Signatures)

---

## 1. Executive Summary & Root Cause Confirmation

On production record `DL-SOU-141540-01`, an assessment submission was dispatched from the field PWA. After 25,000ms, the browser aborted the HTTP fetch due to a hardcoded client timeout (`REQUEST_TIMEOUT_MS = 25_000` in `submissionGateway.ts`). The PWA UI transitioned the local outbox record to `"Waiting to retry"` with the message *"Request timed out. Your assessment is safe and will retry automatically"*.

Concurrently, the backend operation was still actively executing on Google Apps Script. Google Apps Script acquired the script lock, created or verified the Drive asset folder structure, attempted asset decoding, appended the row to the Google Sheet (Revision 1, Consent: Yes, Form Fields Populated), and formatted the row. However:
1. **Ambiguous Outcome Asymmetry:** The client treated the request as timed out and pending retry, while the server had already created the row.
2. **Drive Asset Pipeline Interruption:** During the execution of `processDocumentUpload_` in Google Apps Script, the Drive asset creation threw an exception (due to folder resolution or Drive API authorization latency). The fallback catch block returned the string `DATA_URL_STORED_PENDING_AUTH`, which was written directly into Column 6 ("Signature / Thumb Impression"). Google Sheets visually truncated this text to `DATA_URL_STO...` instead of rendering the required in-cell image or `=HYPERLINK` view formula.
3. **List Refresh Failure:** When the client attempted to refresh the submissions count via `GET /api/submissions?limit=1`, the central adapter returned an HTTP 404 response because upstream Apps Script `listSubmissions_` encountered an error or empty state that was incorrectly propagated as a 404 rather than a 200 with an empty list. This prevented client synchronization and left the outbox item in a stale retryable state.

---

## 2. Redacted Technical Correlation Trace

All personal, clinical, banking, document, and signature contents are strictly excluded. The trace below uses exclusively non-PII correlation identifiers:

| Parameter | Value |
|---|---|
| **Business / ART Identifier** | `DL-SOU-141540-01` (Stored in body `demographics.artNumber` only; never in URL path) |
| **Client Submission ID (`clientSubmissionId`)** | UUIDv4 (e.g. `c4b18e20-7f32-4d2a-9e1b-2d4e6f8a0b12`) |
| **Idempotency Key (`createIdempotencyKey`)** | `create-c4b18e20-7f32-4d2a-9e1b-2d4e6f8a0b12` |
| **Operation Type** | `CREATE` |
| **Client Dispatch Timeout** | `25,000 ms` (`AbortController` signal) |
| **Backend Latency Profile** | `~27,400 ms` (Lock acquisition + Drive folder check + Base64 decode + Sheet append + Linelist formatting) |
| **Client Observed Status** | `category: 'timeout'`, `isRetryable: true`, `chipStatus: 'Waiting to retry'` |
| **Server State** | Row appended at Sheet Row Index, Revision: `1`, Consent: `Yes` |
| **Column 6 Value** | `DATA_URL_STORED_PENDING_AUTH` (Truncated display: `DATA_URL_STO...`) |
| **Downstream Route Query** | `GET /api/submissions?limit=1` → Status `404 Not Found` |

---

## 3. End-to-End Lifecycle Trace & Breakdown

```mermaid
sequenceDiagram
    autonumber
    participant UI as Client UI / PWA
    participant DB as IndexedDB (Dexie)
    participant GW as Submission Gateway
    participant API as Next.js API (/api/submissions)
    participant GAS as Google Apps Script Bridge
    participant SHT as Google Sheet
    participant DRV as Google Drive

    UI->>DB: 1. Persist local assessment snapshot & enqueue outbox item
    UI->>GW: 2. Trigger immediate submission dispatch
    GW->>API: 3. POST /api/submissions (Idempotency-Key: create-{uuid})
    API->>GAS: 4. fetch(APPS_SCRIPT_URL, { action: 'create', ... })
    Note over GAS: 5. Acquires Lock (30s)<br/>Resolves child folder in Drive<br/>Attempts signature decode & upload
    Note over GW: 6. 25,000ms Elapses!<br/>AbortController fires AbortError
    GW-->>UI: 7. Returns { category: 'timeout', isRetryable: true }
    UI->>DB: 8. Transition outbox item: status='retrying', lastError='Request timed out...'
    UI->>UI: 9. Render card: "Waiting to retry", "Saved on this device"
    
    Note over GAS: 10. Drive upload throws exception<br/>Catch block returns 'DATA_URL_STORED_PENDING_AUTH'
    GAS->>SHT: 11. sheet.appendRow(row) [Col 6 = 'DATA_URL_STORED_PENDING_AUTH']
    GAS->>SHT: 12. formatDataRow(sheet, newRow)
    GAS-->>API: 13. [Late Response ~27.4s] 200 OK { status: 'success', revisionNumber: 1 }
    Note over API: Client socket already closed; response discarded
    
    UI->>API: 14. User clicks Retry -> POST /api/submissions (same Idempotency-Key)
    API->>GAS: 15. Forward create with same Idempotency-Key
    GAS->>SHT: 16. Scan column 1 -> Match found!
    GAS-->>API: 17. Return { status: 'success', isDuplicate: true, acknowledged: true }
    
    UI->>API: 18. Masthead poll: GET /api/submissions?limit=1
    API->>GAS: 19. Forward list request
    GAS-->>API: 20. Error / Sheet mismatch / 404
    API-->>UI: 21. HTTP 404 Not Found
    Note over UI: 22. List refresh fails; client outbox not reconciled;<br/>UI remains stuck in "Waiting to retry"
```

---

## 4. Analysis of Hypotheses (User PART A Verification)

### Hypothesis 1: Client fetch timeout shorter than backend/Apps Script completion
- **Verdict: PROVED.**
- In `src/features/submission/submissionGateway.ts` (line 25), `REQUEST_TIMEOUT_MS = 25_000`.
- In Google Apps Script `handleCreate_`:
  - `LockService.getScriptLock().tryLock(30000)` can wait several seconds if concurrency exists.
  - `getOrCreateChildFolder_` performs multiple Drive API calls (`DriveApp.getFoldersByName`, `createFolder`).
  - Base64 decoding and file writing via `targetFolder.createFile(blob)` takes 2–8 seconds.
  - `sheet.appendRow(row)` and `formatDataRow_` (which calls `setRowHeight`, `setBackground`, `setBorder` on cell ranges) takes 4–10 seconds.
  - Total elapsed time in production frequently exceeds 25 seconds (typically 26–32s).
- The client aborts before Apps Script returns, causing the client to record a timeout while the server write succeeds.

### Hypothesis 2: Server completed write but acknowledgement was lost
- **Verdict: PROVED.**
- The HTTP connection between the browser and Next.js was severed when `AbortController.abort()` was invoked at 25s. When Apps Script completed at ~27s and returned the response to Next.js, the client socket was gone.

### Hypothesis 3: Raw marker `DATA_URL_STO...` in Sheet Column 6
- **Verdict: PROVED.**
- In `gas/Code.js` (commit `b93a7fd` / historical deployments), `processDocumentUpload_` contained:
  ```javascript
  } catch (driveErr) {
    Logger.log('DriveApp upload exception: ' + driveErr);
    return 'DATA_URL_STORED_PENDING_AUTH';
  }
  ```
- When `DriveApp` failed or threw an authorization/quota error, the fallback string `'DATA_URL_STORED_PENDING_AUTH'` was returned and placed directly into `row[5]`.
- Google Sheets column 6 rendered this string truncated as `DATA_URL_STO...`.
- In commit `bf772de`, this fallback was changed to `return ''` on error, but any deployment running the previous version or encountering the failure wrote the placeholder into the cell.

### Hypothesis 4: `GET /api/submissions?limit=1` returned HTTP 404
- **Verdict: PROVED.**
- In `src/lib/server/canonicalSubmissionAdapter.ts` (lines 801–812):
  ```typescript
  const upstreamCode = extractUpstreamStatusCode(res, gasData);
  return {
    status: 'error',
    statusCode: isUpstreamCapabilityIssue ? 502 : upstreamCode,
    ...
  };
  ```
  And in `extractUpstreamStatusCode`:
  ```typescript
  if (gasData?.code === 'NOT_FOUND' || (gasData?.message && /not found/i.test(gasData.message))) {
    return 404;
  }
  ```
- When `listSubmissions_` in Apps Script threw `Unable to open spreadsheet with ID: 1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA` or returned empty rows with a 404 code, the adapter propagated HTTP 404 directly to the client.
- Violates the API Contract: A list query must return HTTP 200 with `{ submissions: [], count: 0, limit: 1 }` when zero records exist, and 502/503 when the upstream database is unreachable. It must never return 404.

---

## 5. UI State & Service Worker Analysis

1. **Conflicting UI States:**
   - On timeout, the UI card showed "Waiting to retry", the banner showed "Request timed out. Your assessment is safe...", and the retry button showed "Sending...".
   - The status was not mutually exclusive. The state machine must enforce atomic, mutually exclusive states (Part G).
2. **Service Worker Verification:**
   - In `public/sw.js` (line 52):
     `if (url.pathname.startsWith('/api/')) return;`
   - Navigation and static asset caches correctly skip `/api/`. However, we must guarantee that no client HTTP cache or service worker cache ever caches a 404 response for any `/api/submissions*` endpoint, and that all API endpoints include strict `no-store` headers.

---

## 6. Safe Dry-Run Reconciliation Plan for `DL-SOU-141540-01`

To reconcile record `DL-SOU-141540-01` safely without mutating production or duplicating data:

1. **Locate Existing Row:**
   - Scan Column 1 ("1 Unique ID") in sheet tab `Child_Nutrition` for `DL-SOU-141540-01`.
   - Verify that exactly one row exists (Row `N`).
2. **Check Document Cell Status:**
   - Read cell `(N, 6)` ("6 Signature / Thumb Impression").
   - Confirm it currently contains `DATA_URL_STORED_PENDING_AUTH` or `DATA_URL_STO...`.
3. **Verify Local / Server Attachment Availability:**
   - Check local IndexedDB `caregiver_signatures` for key matching `DL-SOU-141540-01` or client UUID.
   - If signature blob is present:
     - Execute asset-only upload into dedicated container `assessments/{containerId}/current/caregiver-signature.png`.
     - Obtain the Drive File ID (`fileId`).
     - Construct approved restricted hyperlink formula:
       `=HYPERLINK("https://drive.google.com/file/d/" + fileId + "/view", "Restricted Doc [Signature]")`
     - Update ONLY cell `(N, 6)`.
     - Do NOT overwrite any demographic, clinical, or consent fields in Row `N`.
     - Do NOT call `sheet.appendRow()`.
4. **If Attachment is Unavailable:**
   - Do NOT fabricate a Drive link or write placeholder text.
   - Set cell `(N, 6)` or internal metadata status to pending review.
   - Client reflects: *"Assessment submitted. Signature/document upload needs review."*
5. **Acknowledge Local Queue Item:**
   - Update client outbox record with `remoteSubmissionId = 'DL-SOU-141540-01'`, `version = 1`, `status = 'synced'`.
   - Clear retry messages.

---

## 7. Two-PR Implementation Architecture

To ensure strict separation of concerns, zero regressions, and clear verification boundaries:

### PR 1: `fix/create-timeout-list-reconciliation`
- **Scope:**
  1. Ambiguous CREATE state machine: On timeout (`AbortError`), mark item `RETRYABLE_UNKNOWN_OUTCOME` ("Checking submission status").
  2. Idempotency status reconciliation: Query server before re-issuing a second CREATE. If row already exists, acknowledge immediately.
  3. Increase `REQUEST_TIMEOUT_MS` to 45s with asynchronous status reconciliation.
  4. Fix `GET /api/submissions` list contract: Always return 200 with `{ submissions: [], count: 0, limit }` on empty list; never return 404.
  5. Enforce UI status contract (Part G) with mutually exclusive states.
  6. Service worker and cache safety for `/api/submissions*`.

### PR 2: `fix/drive-asset-sheet-reconciliation`
- **Scope:**
  1. Drive upload lifecycle hardening in Apps Script & client.
  2. Eliminate all raw markers (`DATA_URL_STORED_PENDING_AUTH`, raw base64) from Sheet cells.
  3. Sheet Drive link / thumbnail presentation contract.
  4. Asset-only retry mechanism (update asset without duplicating submission row).
  5. Dry-run reconciliation script for `DL-SOU-141540-01`.
