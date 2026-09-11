# Legacy Sync Removal and Rollback Plan

## 1. Inventory of Deprecated / Retired Paths

| Component / File | Previous Behavior | Canonical Replacement |
|------------------|-------------------|-----------------------|
| `src/app/assessment/new/page.tsx` | `enqueueSubmission` + `syncOrchestrator.flushQueue` | `enqueueCreate` + `submissionWorker.processQueue` |
| `src/app/assessment/draft/[draftId]/page.tsx` | `enqueueSubmission` + `syncOrchestrator.flushQueue` | `enqueueCreate` + `submissionWorker.processQueue` |
| `src/app/assessment/draft/[draftId]/review/page.tsx` | `enqueueSubmission` + `syncOrchestrator.flushQueue` | `enqueueCreate` + `submissionWorker.processQueue` |
| `src/app/assessment/record/[submissionId]/edit/page.tsx` | Direct `fetch(PATCH)` with URL ID + `syncOrchestrator` | `enqueueUpdate` + `submissionWorker.processQueue` |
| `src/components/sync/SyncProvider.tsx` | 25s `setInterval` polling + independent online listener | Single `registerSubmissionWorkerListeners` + `resumeOnHydration` |
| `src/app/assessment/sync/page.tsx` | Manual "Send N Waiting Records" + manual queue flush | Status dashboard, "Saved on this device", single-item "Try again now" |

---

## 2. Legacy Queue Migration Safety

`submissionQueueRepository.migrateLegacyItems()` automatically runs during worker startup:
- Identifies items with `schemaVersion < 2`.
- If structurally valid without remote ID: upgraded to canonical `CREATE` with stable idempotency key.
- If invalid or containing corrupt remote identity (e.g. ART ID in remote ID): quarantined to `failed_final` (`ACTION_REQUIRED`).
- **Zero data loss**: No record is ever deleted during migration.

---

## 3. Rollback Strategy

In the unlikely event of an issue on staging:
1. Revert the commit on branch `fix/canonical-immediate-submission-pipeline`.
2. Existing IndexedDB schemas are backward-compatible (`schemaVersion: 2` items contain complete payloads and are readable by legacy code).
