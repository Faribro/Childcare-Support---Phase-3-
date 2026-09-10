# Local Sync Queue Schema Migration & Outbox Quarantine Specification

**Target**: Dexie IndexedDB `syncQueue` Table  
**Migration Function**: `migrateLegacyQueueItems()` in `src/lib/db/syncQueueRepository.ts`  
**Current Version**: `schemaVersion: 2`  

---

## 1. Problem Statement

Prior to Phase 3.1, offline records enqueued during form updates stored flat payload structures directly within `SyncQueueItem.payload`. When dispatched against the updated PATCH contract, these payloads caused HTTP 422 errors due to:
1. Missing or overwritten `expectedVersion` when payloads had undefined version keys.
2. Unflattened section objects (`educationStatus: { educationStatus: "Enrolled" }`) causing Zod type mismatch (`Expected string, received object`).
3. Outbox items missing explicit `operationType: 'UPDATE'`, defaulting to `'CREATE'` and failing client UUIDv4 validation against `POST /api/submissions`.
4. Failed items remaining in the outbox with `nextRetryTimestamp: null`, which were erroneously re-queued on every flush trigger.

---

## 2. In-Flight Migration Strategy

To guarantee that no caseworker's offline assessment data is ever lost or corrupted, the PWA implements an automatic, idempotent migration routine: `migrateLegacyQueueItems()`.

### Execution Timing
- Invoked automatically at the start of every `syncOrchestrator.flushQueue()` batch.
- Invoked upon application startup and database initialization.

### Migration Invariants
1. **Never Drop Data**: Under no circumstances does the migration delete a record from `syncQueue`.
2. **Schema Versioning**: All queue items are stamped with `schemaVersion: 2`.
3. **Operation Disambiguation**:
   - If `operationType` is missing:
     - Checked if `expectedVersion > 1`, `payload.version > 1`, or `payload.editReason` is present.
     - If yes, inferred as `UPDATE`.
     - Otherwise, inferred as `CREATE`.
4. **Canonical Envelope Transformation**:
   - For `UPDATE` items without `{ changes }`:
     - Flattened using `flattenPatchBody()`.
     - Stripped of protected system fields (`uuid`, `id`, `stepIndex`, `syncStatus`, `expectedVersion`).
     - Wrapped into `{ expectedVersion, changes: sanitizedChanges }`.
5. **Fail-Safe Quarantine (`needs_review`)**:
   - If an item cannot be reconciled (e.g. invalid target identifier and corrupt payload data), it is transitioned to `status: 'needs_review'`.
   - Its `nextRetryTimestamp` is set to `null` to prevent automatic network dispatch.
   - It is displayed prominently in the PWA's Outbox Review UI for the caseworker to inspect, edit, and re-submit.

---

## 3. Migration Algorithm Implementation

```typescript
export async function migrateLegacyQueueItems(): Promise<{ migratedCount: number; needsReviewCount: number }> {
  const allItems = await db.syncQueue.toArray();
  let migratedCount = 0;
  let needsReviewCount = 0;

  for (const item of allItems) {
    if (!item.id) continue;
    let modified = false;
    const updates: Partial<SyncQueueItem> = {};

    // 1. Stamp schemaVersion 2
    if (!item.schemaVersion || item.schemaVersion < 2) {
      updates.schemaVersion = 2;
      modified = true;
    }

    // 2. Infer missing operationType
    if (!item.operationType) {
      if (item.expectedVersion && item.expectedVersion > 1) {
        updates.operationType = 'UPDATE';
      } else if (item.payload && (((item.payload as any).version > 1) || (item.payload as any).editReason)) {
        updates.operationType = 'UPDATE';
      } else {
        updates.operationType = 'CREATE';
      }
      modified = true;
    }

    const currentOp = updates.operationType || item.operationType;

    // 3. Migrate UPDATE items to canonical { changes } envelope
    if (currentOp === 'UPDATE') {
      const payloadAny = item.payload as any;
      if (!payloadAny?.changes) {
        try {
          const flattened = flattenPatchBody(payloadAny || {});
          const expectedVersion =
            item.expectedVersion ||
            payloadAny?.expectedVersion ||
            payloadAny?.version ||
            1;

          updates.expectedVersion = expectedVersion;
          updates.payload = {
            expectedVersion,
            changes: flattened,
          } as any;
          modified = true;
        } catch {
          // Quarantine corrupt payloads safely
          updates.status = 'needs_review';
          updates.nextRetryTimestamp = null;
          updates.errorMessage = 'Legacy update item requires manual verification before sync';
          needsReviewCount++;
          modified = true;
        }
      }
    }

    // 4. Halt perpetual 422 retry loops on legacy failed items
    if (item.status === 'failed' && (item.lastErrorCode === 422 || item.lastErrorCode === '422')) {
      if (item.nextRetryTimestamp !== null) {
        updates.nextRetryTimestamp = null;
        modified = true;
      }
    }

    if (modified) {
      await db.syncQueue.update(item.id, updates);
      if (updates.status !== 'needs_review') {
        migratedCount++;
      }
    }
  }

  return { migratedCount, needsReviewCount };
}
```

---

## 4. Verification Evidence

The migration routine is covered by automated unit tests in `src/test/sync-request-builders.test.ts`:
- Migrates legacy flat UPDATE items to `{ changes }` format.
- Stamped with `schemaVersion: 2`.
- Halts automatic polling on quarantined items while preserving draft data in IndexedDB.
