# Root-Cause Diagnostic: Submissions List 400 & Polling Storm

**Document Version:** 1.0.0-ROOT-CAUSE  
**Target Repository:** `Faribro/Childcare-Support---Phase-3-`  
**Target Branch:** `fix/submissions-list-400-and-polling-loop`  
**Date:** 2026-09-10  
**Classification:** Official Technical Diagnostic Report  

---

## 1. Executive Summary & Defect Statement

In production environments, user sessions on `/assessment/sync` and supervisor dashboards experience repeated failing requests:
```text
GET /api/submissions?limit=100 -> HTTP 400 Bad Request
```
This request is repeatedly dispatched via an unconstrained 5-second `setInterval` loop in `src/app/assessment/sync/page.tsx`. Consequently:
- Submitted assessments cannot load remotely.
- Beneficiary Linelist and Analytics fall back into an unhandled error or misleading empty state.
- Client consoles flood with HTTP 400 errors and unhandled promise rejections.
- Outbox assessments in IndexedDB hesitate to complete auto-sync due to UI thread disruption.

---

## 2. End-to-End Trace

```text
Supervisor / Sync Centre UI
  │
  ├─► Triggered via unthrottled `setInterval(loadData, 5000)` in `src/app/assessment/sync/page.tsx:367`
  │   and `useSupervisorData.ts:311`
  │
  ├─► Browser dispatches: `GET /api/submissions?limit=100`
  │
  ├─► Route Handler: `src/app/api/submissions/route.ts`
  │   - Parses query parameters: `limit = parseInt('100', 10)`
  │   - Passes parameters to `canonicalSubmissionAdapter.listSubmissions({ limit: 100 })`
  │
  ├─► Canonical Adapter: `src/lib/server/canonicalSubmissionAdapter.ts:569`
  │   - Dispatches POST to Google Apps Script Web App with `{ action: 'list', limit: 100 }`
  │
  ├─► Upstream Google Apps Script (`gas/Code.js` on live deployment):
  │   - Deployed Apps Script Web App rejects action with:
  │     `HTTP 200 OK {"status":"error","code":400,"message":"Unsupported action: list"}`
  │
  ├─► Status Code Extraction: `src/lib/server/canonicalSubmissionAdapter.ts:174`
  │   - `extractUpstreamStatusCode()` extracted upstream `code: 400`
  │   - Misclassified an upstream capability/gateway failure as an HTTP 400 client error!
  │
  ├─► Next.js API Response:
  │   - `src/app/api/submissions/route.ts:33` returns `HTTP 400 Bad Request` to the browser
  │
  └─► Client Failure & Polling Storm:
      - Browser receives 400 Bad Request
      - `setInterval` fires again 5,000ms later with no exponential backoff or circuit breaker
      - Console floods with repetitive 400 errors
```

---

## 3. Targeted Diagnostic Inquiries

| Diagnostic Question | Findings |
| :--- | :--- |
| **1. Which code validates `limit`?** | `src/app/api/submissions/route.ts` line 12 uses `parseInt(searchParams.get('limit')!, 10) : 50`. It previously lacked upper-bound clamping and validation for negative numbers or non-numeric strings. |
| **2. Is `limit=100` allowed?** | Yes. 100 is standard and intended for supervisor linelists. The API must clamp values safely between `1` and `100`. |
| **3. Which optional query parameters are required?** | None. `limit`, `cursor`, `status`, and `updatedAfter` are strictly optional. |
| **4. Does the API require auth/diagnostic headers?** | No. Ordinary list requests do not require `x-diagnostics-token`. Diagnostics tokens are restricted to `/api/ready` and supervisor diagnostic probes. |
| **5. Does the route return 400 before contacting Apps Script?** | No. The incoming request is valid. The 400 originates from Apps Script returning `{ code: 400, message: "Unsupported action: list" }` which leaked through `extractUpstreamStatusCode`. |
| **6. What upstream code is returned by Apps Script?** | Transport HTTP 200 with JSON payload `{"status":"error","code":400,"message":"Unsupported action: list"}`. Because Apps Script cannot handle `list`, this is an upstream service failure (`502 UPSTREAM_UNAVAILABLE`), not a client error (`400 VALIDATION_ERROR`). |
| **7. Does deployed Render commit match source?** | Render is currently executing commit `441f439` with `adapterMode: "configured"`. |
| **8. Do frontend and backend API contracts match?** | Yes, both target `v3.1.0-contract`. However, upstream Apps Script deployment lacks the `list` action. |
| **9. Is a stale service worker serving old bundles?** | No. Network logs show live dynamic requests reaching the serverless endpoint directly. |
| **10. Is the endpoint being called too frequently?** | Yes. `src/app/assessment/sync/page.tsx` line 367 executes `setInterval(loadData, 5000)` indefinitely without backoff, circuit breaking, or visibility checks. |

---

## 4. Remediation Directives

1. **HTTP Status Code Rectification**: If upstream Google Apps Script returns an unsupported action or error, map it to `HTTP 502 UPSTREAM_UNAVAILABLE`. Reserve `HTTP 400 VALIDATION_ERROR` strictly for malformed incoming request parameters.
2. **Safe Clamping & Validation**: In `route.ts`, clamp `limit` between 1 and 100 (default 50). Return `400 VALIDATION_ERROR` if `limit` is NaN or `< 1`.
3. **Eliminate Unconstrained Polling**: Remove the 5-second `setInterval` from `/assessment/sync`. Replace with the shared read model that pauses on error, backs off on 5xx, and stops polling on non-retryable 4xx errors.
4. **Auto-Sync Hardening**: Implement background event-driven synchronization matching `AutoSyncProvider` from the reference project so waiting outbox items sync automatically on mount and network restoration.
