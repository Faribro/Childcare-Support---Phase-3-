# Supervisor Polling and Semantic UI Error States

## Elimination of Blind setInterval Polling
Previously, supervisor pages (e.g. `src/app/assessment/sync/page.tsx` and legacy linelist views) registered unconditional polling intervals:
```ts
// PREVIOUS FLAWED IMPLEMENTATION:
const interval = setInterval(loadData, 5000);
return () => clearInterval(interval);
```
When upstream returned HTTP 400 or HTTP 502, the browser endlessly bombarded the server every 5 seconds, filling logs, wasting bandwidth, and leaving the UI stuck in perpetual failure.

### The New Resilient Polling Architecture
1. **Blind Polling Removed**: All direct `setInterval` loops across supervisor and sync pages have been eliminated.
2. **Exponential Backoff on 5xx / Network Failures**:
   ```
   Retry 1: 10s + jitter
   Retry 2: 15s + jitter
   Retry 3: 22.5s + jitter
   Retry 4: 33.75s + jitter
   Retry 5: 50.6s + jitter
   Capped at 60s (MAX_BACKOFF_MS)
   Maximum 5 retries before pausing and requiring manual reconnection
   ```
3. **Immediate Halt on Terminal 4xx (Client Errors)**:
   If the gateway responds with HTTP 400, 401, 403, or non-retryable validation errors, polling is immediately cancelled and halted. No further requests are dispatched until manual user interaction (such as tapping "Retry" or modifying search terms).

---

## The 5 Distinct UI Semantic States

| State | Condition | Visual Rendering |
|---|---|---|
| **1. Loading** | Initial load or forced reload with empty dataset | Subtle spinner with "Loading linelist surveys...", KPI cards display "Loading..." |
| **2. Confirmed Empty** | HTTP 200 returned with 0 total records | "No Survey Records Found: Submitted surveys from field caseworkers will appear here in real-time." |
| **3. Filtered Empty** | Search term, district, or orphan status filters match 0 rows out of non-empty dataset | "No Matching Records: No records match the selected filters." with prominent "Reset Filters" action |
| **4. Error with Retry** | Upstream returned 5xx, 4xx, or network failure | Rose error banner with error code, explanation, "Retry Connection", and "Refresh" actions. Visualizations show dedicated error fallback, and KPI numbers show "—" instead of misleading clinical zeroes. |
| **5. Offline with Cache** | Upstream unavailable, but cached records exist locally | Amber banner: "Showing Offline Cached Snapshot: Network connection to central bridge is offline or unavailable. Cached linelist records are preserved." with "Reconnect" button. |
