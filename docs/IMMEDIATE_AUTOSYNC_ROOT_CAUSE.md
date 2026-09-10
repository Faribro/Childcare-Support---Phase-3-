# Immediate Submit & Autosync Root Cause Analysis

## Executive Summary
Caseworkers completing field assessments observed that after clicking **Submit**, the *Submitted Surveys* screen displays a green success banner:
> **"Survey recorded! Reference: DL-SOU-101122-01"** • *Saved to device*

However, the survey was not appearing in Google Sheets, nor in the Supervisor Linelist or Clinical Analytics. Furthermore, attempting to edit or view the submission triggered `GET /api/submissions/DL-SOU-101122-01` with HTTP **404 Not Found**, and manual sync attempts triggered `POST /api/submissions` with HTTP **422 Unprocessable Entity**.

---

## 1. Full Lifecycle Trace for a Synthetic Finalised Assessment

```
[Field Caseworker Form Submit (/assessment/new)]
       │
       ▼
1. handleSubmit() creates finalRecord snapshot
       │
       ▼
2. await enqueueSubmission(finalRecord, { operationType: 'CREATE' })
       │  - Writes record to Dexie db.drafts (syncStatus: 'queued')
       │  - Writes item to Dexie db.syncQueue (status: 'queued')
       │
       ▼
3. NO online/offline check performed
   NO immediate network dispatch attempted
       │
       ▼
4. router.push('/assessment/sync?submitted=true&ref=...')
       │
       ▼
5. User lands on /assessment/sync:
   - Displays misleading emerald banner: "Survey recorded! Reference: ... Saved to device"
   - No global background sync worker is running
   - Record sits idle in IndexedDB outbox indefinitely unless manual button is clicked
       │
       ▼ (When manual "Send Pending Survey" is clicked)
6. Outbox loop sends POST /api/submissions:
   - If payload contains empty-string clinical enums (e.g. appetite: '', educationStatus: '')
     or weightKg=0 / heightCm=0:
     Zod completeSubmissionSchema rejects with HTTP 422 Unprocessable Entity!
   - markFailed() marks item status: 'failed', halts retries (isNonRetriable)
       │
       ▼
7. Google Sheet is NEVER updated.
   Supervisor read models (/supervisor/assessments, /supervisor, /supervisor/analytics)
   read from canonical store/Sheets and therefore show ZERO for this submission.
       │
       ▼
8. Caseworker clicks "Edit" on the card:
   - App navigates to /assessment/record/DL-SOU-101122-01/edit
   - Page executes GET /api/submissions/DL-SOU-101122-01
   - Server returns HTTP 404 NOT FOUND because record only existed in local client IndexedDB!
```

---

## 2. Component & File Responsibilities

| Step | Responsible File / Function | Observed Current Behavior | Required Behavior |
|------|-----------------------------|---------------------------|-------------------|
| **Form Submit** | `src/app/assessment/new/page.tsx` (`handleSubmit`) | Calls `enqueueSubmission`, then immediately redirects without initiating sync. | Save local snapshot, then if `navigator.onLine`, immediately initiate sync before or alongside redirect. |
| **Draft / Edit Submit** | `src/app/assessment/draft/[draftId]/page.tsx`, `review/page.tsx`, `edit/page.tsx` | Identical passive enqueue + redirect. | Save local snapshot, immediately trigger sync orchestrator. |
| **Outbox Queue** | `src/lib/db/syncQueueRepository.ts` | Correctly enqueues into `db.syncQueue`, but has no auto-trigger mechanism. | Enqueue, then notify `SyncOrchestrator` to immediately flush if online. |
| **Global Sync Engine** | *Missing* (none existed in `AppShell` or `RootLayout`) | Sync was only instantiated inside `/assessment/sync` on manual button click or 5-second polling of `loadData` (which only *loaded* data, never synced). | Implement `SyncOrchestrator` mounted in global `AppShell` or providers, responding to online, focus, visibility, and startup. |
| **Event Wiring** | `src/components/layout/CompactMasthead.tsx` | Listens to `online`/`offline` only to change the wifi icon colour. | Listen to `online`, `focus`, and `visibilitychange` to trigger queue retries safely under mutex. |
| **Schema Ingestion** | `src/app/api/submissions/route.ts` & `submissionSchema.ts` | Rejected payloads with HTTP 422 when optional clinical fields defaulted to invalid empty strings or 0. | Normalize payload in form / adapter so valid minimal submissions without clinical measurements pass schema cleanly. |
| **UI Copy & Status** | `src/app/assessment/sync/page.tsx` & `CompactMasthead.tsx` | Green banner claimed "Survey recorded!" for local-only queue items. Un-synced items had no "Waiting to send" chip on cards. Top navigation counted local-only items under "Submitted Surveys". | Distinguish "On this device / waiting to send" from "Submitted records". Show truthful status chips: `Local`, `Sending`, `Submitted`, `Needs attention`. Never show false green "Survey recorded". |
| **Edit/View Resolution** | `src/app/assessment/record/[submissionId]/edit/page.tsx` | Only fetched from server `GET /api/submissions/[id]`, crashing with 404 if item is still pending in local outbox. | Fallback to local Dexie draft/queue if server returns 404 and record exists in local outbox. |

---

## 3. Immediate Autosync Defect Matrix

1. **`navigator.onLine` check**: Absent at submission time. Form unconditionally presumed asynchronous manual sync.
2. **Immediate flush**: Absent. No function call was made to initiate network transfer upon clicking Submit.
3. **Global sync engine**: Absent. The application had no background sync engine mounted across routes.
4. **Lifecycle events**: `window.addEventListener('online')`, `window.addEventListener('focus')`, and `document.addEventListener('visibilitychange')` were not connected to the sync outbox.
5. **UI Truthfulness**: Emerald banner and "Submitted Surveys" navigation counter conflated local IndexedDB persistence with remote Google Sheets submission.
6. **HTTP 422 Validation Error**: Payloads with unentered health/education fields sent empty strings (`''`) or zeroes (`0`) for strict Zod enums/numbers, triggering unretriable 422 rejections.
7. **HTTP 404 Not Found on Edit**: Navigation to edit an unsynced record queried `/api/submissions/[id]` directly without querying local IndexedDB drafts.
