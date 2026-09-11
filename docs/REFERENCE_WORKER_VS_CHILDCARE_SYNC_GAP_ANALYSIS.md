# Reference Worker vs Childcare Sync — Gap Analysis

> Generated: Phase 0 forensic audit — no personal data, real IDs, or secrets.

---

## 1. Reference Architecture Overview

**Reference repo** separates concerns across four layers:

| Layer | File | Responsibility |
|-------|------|---------------|
| Worker Entry | `apps/worker/src/index.ts` | Polls export-jobs outbox, owns retry loop |
| Pure Mapper | `apps/worker/src/mapper.ts` | `mapToFlatRow`, `mapToLongRows` — zero side effects |
| Sheets Adapter | `apps/worker/src/sheets-adapter.ts` | Single POST to Apps Script with X-Webhook-Secret |
| Apps Script | `apps/sheets-sync-appscript/src/Code.js` | Row-level mutex, idempotency by submissionId |

**Key pattern**: The worker fetches a job from an outbox API, calls a pure mapper, calls the adapter with the mapped row. The `submissionId` (server-generated UUID) is the ONLY identifier used in URLs.

---

## 2. Childcare Sync — As-Built Inventory

### 2.1 Every Code Path That Can Create a Submission

| File | Symbol | Notes |
|------|--------|-------|
| `src/app/assessment/new/page.tsx` | `handleSubmitFinal` | enqueueSubmission CREATE then flushQueue |
| `src/app/assessment/draft/[draftId]/page.tsx` | `handleSubmitFinal` | Same pattern |
| `src/lib/db/syncQueueRepository.ts` | `enqueueSubmission()` | Writes to db.syncQueue and db.drafts |
| `src/lib/sync/syncOrchestrator.ts` | `flushQueue()` | buildCreateRequest -> POST /api/submissions |
| `src/lib/sync/requestBuilders.ts` | `buildCreateRequest()` | POST /api/submissions with Zod validation |
| `src/app/api/submissions/route.ts` | POST handler | Validates, calls canonicalSubmissionAdapter.createSubmission() |
| `src/lib/server/canonicalSubmissionAdapter.ts` | `createSubmission()` | POST to Apps Script or MockSheetStore |
| `gas/Code.js` | `handleCreate_()` | Appends row, idempotency by Column 1 Unique ID |

### 2.2 Every Code Path That Can Update a Submission

| File | Symbol | Notes |
|------|--------|-------|
| `src/app/assessment/record/[submissionId]/edit/page.tsx` | submit ~line 790 | **ROOT CAUSE**: enqueues UPDATE even when serverSaved===false |
| `src/lib/sync/syncOrchestrator.ts` | `flushQueue()` | buildUpdateRequest -> PATCH /api/submissions/${targetId} |
| `src/lib/sync/requestBuilders.ts` | `buildUpdateRequest()` | **BUG**: falls to artNumber when remoteSubmissionId is absent |
| `src/app/api/submissions/[submissionId]/route.ts` | PATCH handler | Validates version, calls canonicalSubmissionAdapter.updateSubmission() |
| `gas/Code.js` | `handleUpdate_()` | Searches Column 1; 404 if record not found |

### 2.3 Every Identifier Used to Construct Submission URLs

| File | Identifier | Problem? |
|------|------------|---------|
| `requestBuilders.ts` buildUpdateRequest | `remoteSubmissionId || uniqueId || artNumber || demographics.artNumber || submissionUuid` | YES — falls to ART number |
| `requestBuilders.ts` buildCreateRequest | None — POST /api/submissions | Correct |

---

## 3. Root Cause Analysis

### PATCH 404 — Exact Cause Chain

```
1. User edits a record with no prior server acknowledgement
   -> AssessmentRecord.remoteSubmissionId = undefined
   -> AssessmentRecord.version = 1

2. edit/page.tsx ~line 790:
   if (!serverSaved) {
     await enqueueSubmission(queuePayload, { operationType: 'UPDATE' }); // WRONG
   }
   BUG: serverSaved is false for all un-uploaded records,
   so UPDATE is always enqueued for local-only edited records.

3. buildUpdateRequest resolves targetId:
   payloadAny.remoteSubmissionId  -> undefined
   payloadAny.uniqueId            -> undefined
   payloadAny.artNumber           -> "DL-SOU-101550-01"  <- ART reference!
   -> url = /api/submissions/DL-SOU-101550-01

4. PATCH /api/submissions/DL-SOU-101550-01
   -> handleUpdate_() searches Column 1 for "DL-SOU-101550-01"
   -> Not found (record was never written to Sheet)
   -> 404 returned -> Sheet row NEVER written
```

### No-Op Manual Send Cause

`getPendingQueue()` excludes `failed_final` and `needs_review` items.
The Sync Centre UI counted those terminal items as "1 assessment waiting".
When "Send Waiting Records" was clicked:
-> flushQueue('manual') -> getPendingQueue() -> empty -> status: 'idle' -> no request dispatched.

---

## 4. Reference vs Target Comparison

| Concern | Reference | Childcare | Gap |
|---------|-----------|-----------|-----|
| Worker entry | Node.js daemon | Browser syncOrchestrator | Architecture difference (acceptable for PWA) |
| Mapping layer | Pure SubmissionReportingMapper | Inline in buildCreateRequest | No standalone mapper module |
| Sheets adapter | Standalone GoogleSheetsAdapter | canonicalSubmissionAdapter class | Architecturally equivalent |
| Retry ownership | Worker daemon | syncOrchestrator mutex | Equivalent in browser context |
| API contract | Server UUID in PATCH URL | ART number in PATCH URL | CRITICAL BUG |
| Idempotency | Per-job idempotencyKey | idempotencyKey in queue item | Present |
| CREATE identity | Server UUID | ART number fallback | CRITICAL BUG |

---

## 5. Duplicate and Dead Path Inventory

| Path | Action Required |
|------|----------------|
| syncOrchestrator UPDATE->CREATE auto-convert on 404 | REMOVE — replaced by identity invariant |
| edit/page.tsx: enqueue UPDATE when !serverSaved | FIX — never enqueue UPDATE without remoteSubmissionId |
| requestBuilders: artNumber fallback in buildUpdateRequest | REMOVE — hard reject |
| Sync Centre "Send N Waiting Records" button | REMOVE from normal user flow |
| Old test: PATCH /api/submissions/ART-TEST-0001 | INVERT — assert ART ID never in PATCH URL |

---

## 6. Intended Data Path (Post-Fix)

```
Assessment Form Submit
  -> Persist local snapshot (Dexie, atomic)
  -> submissionWorker.process(localDraftId)
  -> POST /api/submissions (with createIdempotencyKey)
  -> Zod validation
  -> canonicalSubmissionAdapter.createSubmission()
  -> Apps Script handleCreate_()
  -> Sheet row appended
  -> { remoteSubmissionId, version } returned
  -> Local record: status=SUBMITTED, remoteSubmissionId persisted
  -> UI shows "Submitted successfully."
```
