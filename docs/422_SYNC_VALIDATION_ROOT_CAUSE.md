# Phase 0: 422 Sync Validation Loop Root Cause Analysis

**Target Repository**: `Faribro/Childcare-Support---Phase-3-`  
**Branch**: `fix/422-sync-validation-contract`  
**Date**: 2026-09-10  
**Status**: Investigated & Diagnosed  

---

## 1. Executive Summary

Field deployments on Render (`https://childcare-support-phase-3.onrender.com/`) showed recurring browser console errors:
```
PATCH https://childcare-support-phase-3.onrender.com/api/submissions/DL-SOU-101122-01 422 (Unprocessable Content)
POST  https://childcare-support-phase-3.onrender.com/api/submissions 422 (Unprocessable Content)
```
These requests repeated indefinitely on background intervals (`setInterval`), window focus, and online events. The affected records remained in the local IndexedDB outbox in the "Needs attention" state.

This document records the exact root cause, validation paths, client-server contract mismatch, and the mechanism behind the infinite retry loop, adhering strictly to synthetic non-sensitive data invariants.

---

## 2. Evidence & Safe Server Validation Diagnostics

### 2.1 UPDATE Route (`PATCH /api/submissions/[submissionId]`)
- **Observed HTTP Status**: `422 Unprocessable Content`
- **Upstream Handler**: `src/app/api/submissions/[submissionId]/route.ts`
- **Validation Schema**: `patchSubmissionSchema` in `src/lib/validations/submissionSchema.ts`

#### Exact Validation Failures:
1. **Missing / Stripped `expectedVersion`**:
   - **Root Cause**: In `src/lib/sync/syncOrchestrator.ts` (commit `e46215c`), the dispatch logic constructed the request body as:
     ```ts
     body: JSON.stringify({
       expectedVersion,
       ...(typeof item.payload === 'object' ? item.payload : {}),
     })
     ```
   - When `item.payload` originated from `src/app/assessment/record/[submissionId]/edit/page.tsx` line 681 (`queuePayload`), `item.payload.expectedVersion` was `undefined`.
   - In JavaScript, spreading an object with an `undefined` property overrides preceding properties: `{ expectedVersion: 1, expectedVersion: undefined }`.
   - `JSON.stringify` drops properties with `undefined` values. The server received `{}` without an `expectedVersion` property.
   - `patchSubmissionSchema` declared `expectedVersion: z.number().int().positive()`.
   - **Diagnostic Failure**:
     - Path: `expectedVersion`
     - Code: `invalid_type`
     - Expected: `number`
     - Actual: `undefined`
     - Message: `Required`

2. **Nested Object Collisions (e.g. `educationStatus`)**:
   - In offline edit mode, `edit/page.tsx` queued a full nested representation:
     ```ts
     educationStatus: {
       educationStatus: 'Currently going to school',
       schoolName: '...',
       currentClass: '...',
     }
     ```
   - The server schema in `e46215c` expected `educationStatus: z.string().optional()`.
   - **Diagnostic Failure**:
     - Path: `educationStatus`
     - Code: `invalid_type`
     - Expected: `string`
     - Actual: `object`
     - Message: `Expected string, received object`

3. **Empty String Coercion on Optional Numbers**:
   - HTML form inputs for optional clinical/financial metrics (`monthlyIncomeRs`, `schoolFees`, `weightKg`) yield `""` when cleared.
   - Unpreprocessed `z.number().optional()` rejects `""` with `invalid_type` (`expected number, received string`).

---

### 2.2 CREATE Route (`POST /api/submissions`)
- **Observed HTTP Status**: `422 Unprocessable Content`
- **Upstream Handler**: `src/app/api/submissions/route.ts`
- **Validation Schema**: `completeSubmissionSchema` in `src/lib/validations/submissionSchema.ts`

#### Exact Validation Failures:
1. **Identifier Format Mismatch (`uuid` vs Reference ID)**:
   - When test/staging records or manual edits queued items with human-readable ART reference IDs (e.g. `DL-SOU-101122-01`) in the `uuid` or `clientSubmissionId` field:
   - `completeSubmissionSchema` strictly requires RFC 4122 UUIDv4: `uuid: z.string().uuid('Invalid client UUIDv4')`.
   - **Diagnostic Failure**:
     - Path: `uuid`
     - Code: `invalid_string` (validation: `uuid`)
     - Message: `Invalid client UUIDv4`
     - Path: `clientSubmissionId`
     - Code: `invalid_string` (validation: `uuid`)
     - Message: `Invalid uuid`

2. **Operation Classification Drift**:
   - If an item was queued without an explicit `operationType` (or legacy records queued before Phase 3 revision), `syncQueueRepository.ts` defaulted to `'CREATE'`.
   - An UPDATE record with an ART number identifier was dispatched to `POST /api/submissions`, failing the UUIDv4 validation with 422.

---

## 3. Why the 422 Rejection Looped Infinitely

In `src/lib/db/syncQueueRepository.ts`:
```ts
export async function getPendingQueue(forceAllPending: boolean = false): Promise<SyncQueueItem[]> {
  const now = Date.now();
  return db.syncQueue
    .filter((item) => {
      const isCandidate =
        item.status === 'queued' ||
        item.status === 'failed' ||
        item.status === 'failed_retryable' ||
        item.status === 'QUEUED' ||
        item.status === 'FAILED_RETRYABLE';

      if (!isCandidate) return false;
      if (forceAllPending) return true;
      return item.nextRetryTimestamp === null || item.nextRetryTimestamp <= now;
    })
    .toArray();
}
```

When the server rejected the payload with HTTP 422:
1. `syncOrchestrator.ts` classified 422 as terminal and invoked `markFailedFinal(item.id!, errMsg)`.
2. `markFailedFinal` updated the item in IndexedDB:
   - `status: 'failed'`
   - `nextRetryTimestamp: null` (intended to halt retries)
3. However, `getPendingQueue` evaluated:
   `item.nextRetryTimestamp === null || item.nextRetryTimestamp <= now`
   Because `nextRetryTimestamp === null` is `true`, `getPendingQueue` matched the item!
4. Consequently, every time `flushQueue` executed (every 30 seconds via interval, on window focus, or on network reconnection), the terminal 422 item was retrieved and re-dispatched to the server!
5. This produced an infinite 422 retry loop without any backoff termination.

---

## 4. Deployment Drift Analysis

- **Local Source**: Commit `e46215c` (`fix(sync): implement immediate push, event-driven autosync engine...`)
- **Render Staging Environment**:
  - `GET https://childcare-support-phase-3.onrender.com/api/health`
  - Output: `{"status":"ok","service":"childcare-support-phase-3","version":"3.0.0"}`
  - Uptime: ~600s
  - The deployed bundle matched commit `e46215c`. The issue was not stale bundle drift, but an active contract defect in commit `e46215c` regarding payload serialization order, nested payload handling, and `getPendingQueue` terminal filter logic.

---

## 5. Architectural Action Plan

1. **Phase 1: Strict Operation Dispatch**:
   - CREATE: `POST /api/submissions` with complete create payload.
   - UPDATE: `PATCH /api/submissions/{remoteSubmissionId}` with payload `{ changes: { ...allowlisted... } }`.
   - Pass `expectedVersion` canonically via `If-Match: "${expectedVersion}"`.
   - Never fall back from PATCH 422 to POST.

2. **Phase 2: Safe Typed Request Builders**:
   - `buildCreateRequest(queueItem)`: Validates UUIDv4, strips local metadata, builds complete payload.
   - `buildUpdateRequest(queueItem)`: Strips non-allowlisted fields, builds `{ changes }`, attaches `If-Match` header.

3. **Phase 3: Old Queue Migration**:
   - Schema versioning on IndexedDB `syncQueue`.
   - Migrate legacy flat/nested update records into canonical `{ remoteSubmissionId, expectedVersion, changes }`.
   - Quarantine unmigratable records to `NEEDS_REVIEW` without automatic retry.

4. **Phase 4: Error Classification & Loop Termination**:
   - Update `getPendingQueue` to EXCLUDE `status === 'failed' && nextRetryTimestamp === null`.
   - 422 marks the item as terminal `FAILED_FINAL` / `NEEDS_REVIEW`. No timer is set, no automatic retry occurs.
   - UI provides "Review record" action to inspect safe validation paths.

5. **Phase 5: Server Response Envelope**:
   - Standardize `{ status: "success", data: { ... }, requestId }` and `{ status: "error", code: "VALIDATION_ERROR", details: { fields: [...] }, requestId }`.
