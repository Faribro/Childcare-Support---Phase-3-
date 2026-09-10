# Google Apps Script Free-Tier Quota & Resilience Guide

## 1. Google Free-Tier Constraints & Quota Limits

The architecture operates strictly within Google Workspace and standard free-tier infrastructure, avoiding paid GCP billing commitments. Engineers and administrators must operate within these platform limits:

| Resource / API | Standard Free Tier Quota | Impact on Platform |
| :--- | :--- | :--- |
| **Google Sheets API v4 (Read)** | 300 requests / min / project | High-volume polling can exhaust quota if uncached. |
| **Google Sheets API v4 (Write)** | 300 requests / min / project | Batch sync queues must debounce row writes. |
| **Google Drive API v3** | 20,000 queries / 100 sec / project | Asset inspection during full audits must pace requests. |
| **Apps Script Execution Timeout** | 6 minutes / single execution | Batch migrations or mass audits must use pagination. |
| **Apps Script ScriptLock Timeout** | 30 seconds max acquisition wait | Mutations must release locks promptly in `finally` blocks. |
| **PropertiesService Storage** | 9 KB per property, 500 KB total | Used only for authentication secrets and environment tokens. |
| **CacheService Storage** | 100 KB max value size, 6 hours TTL | Used for short-term schema and metadata caching. |

---

## 2. Exponential Backoff & Retry Architecture

Network blips or brief quota bursts trigger HTTP 429 or Google Script runtime exceptions. Google Apps Script implements the `withRetry_` helper to handle transient failures transparently:

```javascript
function withRetry_(fn, maxRetries, baseDelayMs) {
  var retries = maxRetries || 3;
  var delay = baseDelayMs || 500;
  var lastError;
  for (var attempt = 0; attempt < retries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastError = err;
      var str = String(err).toLowerCase();
      if (
        str.indexOf('rate') !== -1 ||
        str.indexOf('quota') !== -1 ||
        str.indexOf('limit') !== -1 ||
        str.indexOf('too many') !== -1 ||
        str.indexOf('busy') !== -1
      ) {
        // Truncated binary exponential backoff with random jitter
        var sleepMs = delay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        Utilities.sleep(sleepMs);
      } else {
        throw err; // Non-transient errors bubble up immediately
      }
    }
  }
  throw lastError;
}
```

---

## 3. Client & Server Mitigation Strategies

### A. Next.js PWA Read Model Caching
- **Supervisor Read Model**: Cached in Dexie IndexedDB with a configurable TTL (e.g. 5 minutes).
- **Background Polling Throttling**: Supervisor list polling runs every 15–30 seconds when tab is active; pauses when tab is hidden or offline.
- **Cache Eviction on Mutation**: Creating or updating an assessment immediately marks local cache stale and triggers an optimistic UI update.

### B. Mutex Concurrency via LockService
Every `doPost` mutation acquires a dedicated Script Lock with a 30-second timeout:
```javascript
var lock = LockService.getScriptLock();
var hasLock = lock.tryLock(30000);
if (!hasLock) {
  return errorResponse_('Server concurrency lock busy. Please retry.', 'UPSTREAM_UNAVAILABLE', 503, requestId);
}
try {
  // Execute atomic OCC create or update
} finally {
  lock.releaseLock();
}
```

### C. Rate Limit Error Envelopes
If a quota limit is reached upstream, Apps Script emits `RATE_LIMIT_EXCEEDED` (HTTP 429), and the Next.js canonical adapter returns:
```json
{
  "status": "error",
  "code": "RATE_LIMIT_EXCEEDED",
  "statusCode": 429,
  "message": "Upstream rate limit exceeded. Backing off before retry.",
  "requestId": "req-xxx",
  "timestamp": "2026-09-10T14:50:00Z"
}
```
The PWA sync worker detects 429 and enters an exponential backoff state (30s, 60s, 120s) without failing the offline queue.
