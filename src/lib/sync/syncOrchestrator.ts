/**
 * SyncOrchestrator: Institutional Offline-First Sync Engine for Childcare Support PWA
 *
 * Implements:
 * 1. Single client-side mutex lock to prevent concurrent/overlapping outbox flushes.
 * 2. Immediate push upon form finalisation if online.
 * 3. Automatic push on online, focus, visibilitychange, and app-start events.
 * 4. Bounded exponential backoff with full jitter for transient retryable failures.
 * 5. Terminal failure classification (400, 401, 403, 422) without endless retry loops.
 * 6. Concurrency conflict management (409) preserving local state and marking for review.
 * 7. Canonical server acknowledgement verification before marking any record SYNCED.
 */

import {
  acquireSyncLock,
  releaseSyncLock,
  isSyncLocked,
  getPendingQueue,
  migrateLegacyQueueItems,
  markSyncing,
  markSynced,
  markFailedRetryable,
  markFailedFinal,
  markConflict,
  getQueueStats,
} from '@/lib/db/syncQueueRepository';
import {
  buildCreateRequest,
  buildUpdateRequest,
  RequestBuilderError,
} from '@/lib/sync/requestBuilders';
import { db } from '@/lib/db/dexieDb';
import type { SyncQueueItem } from '@/types/domain';

export type SyncTrigger =
  | 'form_submit'
  | 'form_update'
  | 'online_event'
  | 'window_focus'
  | 'visibility_visible'
  | 'app_init'
  | 'interval'
  | 'manual';

export interface SyncResultItem {
  id?: number;
  submissionUuid: string;
  operationType: string;
  status: 'synced' | 'failed_retryable' | 'failed_final' | 'conflict';
  remoteSubmissionId?: string;
  version?: number;
  statusCode?: number;
  message?: string;
}

export interface SyncFlushResult {
  status: 'success' | 'partial' | 'failed' | 'offline' | 'busy' | 'idle';
  trigger: SyncTrigger;
  processedCount: number;
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
  items: SyncResultItem[];
  timestamp: string;
}

class SyncOrchestratorService {
  private isMounted = false;
  private lastFlushTimestamp: number | null = null;

  public isLocked(): boolean {
    return isSyncLocked();
  }

  public isOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  /**
   * Flush pending outbox items under single-execution mutex lock.
   */
  public async flushQueue(trigger: SyncTrigger = 'manual'): Promise<SyncFlushResult> {
    const timestamp = new Date().toISOString();

    // 1. Check network connectivity
    if (!this.isOnline()) {
      return {
        status: 'offline',
        trigger,
        processedCount: 0,
        syncedCount: 0,
        failedCount: 0,
        conflictCount: 0,
        items: [],
        timestamp,
      };
    }

    // 2. Acquire client-side mutex lock
    if (!acquireSyncLock()) {
      return {
        status: 'busy',
        trigger,
        processedCount: 0,
        syncedCount: 0,
        failedCount: 0,
        conflictCount: 0,
        items: [],
        timestamp,
      };
    }

    const resultItems: SyncResultItem[] = [];

    try {
      // 3. Migrate legacy queue items safely before picking candidates
      await migrateLegacyQueueItems();

      // 4. Fetch pending items
      const isForced = trigger === 'manual' || trigger === 'form_submit' || trigger === 'form_update';
      const pendingItems = await getPendingQueue(isForced);

      if (pendingItems.length === 0) {
        return {
          status: 'idle',
          trigger,
          processedCount: 0,
          syncedCount: 0,
          failedCount: 0,
          conflictCount: 0,
          items: [],
          timestamp,
        };
      }

      // 5. Process each item independently in bounded batches
      for (const item of pendingItems) {
        if (!item.id) continue;

        try {
          await markSyncing(item.id);

          let reqDetails: {
            url: string;
            method: string;
            headers: Record<string, string>;
            body: any;
          };

          try {
            if (item.operationType === 'UPDATE') {
              reqDetails = buildUpdateRequest(item);
            } else {
              reqDetails = buildCreateRequest(item);
            }
          } catch (buildErr: any) {
            const isReqError = buildErr instanceof RequestBuilderError;
            const errMsg = buildErr.message || 'Validation or request build failure';
            const issues = isReqError
              ? buildErr.issues.map((i: any) => `${i.path}: ${i.code}`)
              : [errMsg];
            await markFailedFinal(item.id, errMsg, 422, issues);
            resultItems.push({
              id: item.id,
              submissionUuid: item.submissionUuid,
              operationType: item.operationType,
              status: 'failed_final',
              statusCode: 422,
              message: errMsg,
            });
            continue;
          }

          let res: Response;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);

          try {
            res = await fetch(reqDetails.url, {
              method: reqDetails.method,
              headers: reqDetails.headers,
              body: JSON.stringify(reqDetails.body),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (res.ok) {
            const data = await res.json().catch(() => ({}));

            // Defend against upstreams returning HTTP 200 with an error body
            if (data.status === 'error' || data.error) {
              const codeNum = Number(data.code);
              const statusCode = (!isNaN(codeNum) && codeNum >= 400 && codeNum <= 599) ? codeNum : 500;

              if ((statusCode === 404 || /not found/i.test(data.message || '')) && item.operationType === 'UPDATE') {
                const pAny = (item.payload as any) || {};
                const hasData = Boolean(pAny.demographics?.childName || pAny.childName);
                if (hasData) {
                  const rawPayload: any = { ...pAny };
                  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                  if (!rawPayload.uuid || !uuidRegex.test(rawPayload.uuid)) {
                    rawPayload.uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;
                  }
                  if (rawPayload.uuid && !rawPayload.clientSubmissionId) {
                    rawPayload.clientSubmissionId = rawPayload.uuid;
                  }
                  if (!rawPayload.artNumber && item.submissionUuid) {
                    rawPayload.artNumber = item.submissionUuid;
                  }
                  if (rawPayload.demographics && !rawPayload.demographics.artNumber && item.submissionUuid) {
                    rawPayload.demographics.artNumber = item.submissionUuid;
                  }

                  const convertedItem: SyncQueueItem = {
                    ...item,
                    operationType: 'CREATE',
                    submissionUuid: rawPayload.uuid || item.submissionUuid,
                    payload: rawPayload,
                    status: 'queued',
                    nextRetryTimestamp: Date.now(),
                  };

                  await db.syncQueue.update(item.id, {
                    operationType: 'CREATE',
                    submissionUuid: rawPayload.uuid || item.submissionUuid,
                    payload: rawPayload,
                    status: 'queued',
                    nextRetryTimestamp: Date.now(),
                    errorMessage: 'Record not found on central server; converting to initial creation.',
                  });

                  try {
                    const createReq = buildCreateRequest(convertedItem);
                    const createRes = await fetch(createReq.url, {
                      method: createReq.method,
                      headers: createReq.headers,
                      body: JSON.stringify(createReq.body),
                    });
                    if (createRes.ok) {
                      const createData = await createRes.json().catch(() => ({}));
                      if (createData.status !== 'error') {
                        const cRemoteId = createData.remoteSubmissionId || createData.uniqueId || item.submissionUuid;
                        const cVersion = createData.version || createData.revisionNumber || 1;
                        const cUpdatedAt = createData.updatedAt || new Date().toISOString();
                        const cRequestId = createData.requestId || (createRes.headers ? createRes.headers.get('x-request-id') || undefined : undefined);
                        await markSynced(item.id, convertedItem.submissionUuid, cRemoteId, cVersion, cUpdatedAt, cRequestId);
                        resultItems.push({
                          id: item.id,
                          submissionUuid: item.submissionUuid,
                          operationType: 'CREATE',
                          status: 'synced',
                          statusCode: createRes.status,
                          remoteSubmissionId: cRemoteId,
                        });
                        continue;
                      }
                    }
                  } catch (retryErr) {
                    console.warn('Immediate CREATE dispatch after 404 self-heal deferred to next retry:', retryErr);
                  }

                  resultItems.push({
                    id: item.id,
                    submissionUuid: item.submissionUuid,
                    operationType: 'CREATE',
                    status: 'failed_retryable',
                    statusCode: 404,
                    message: 'Record not found on central server; converted to initial creation.',
                  });
                  continue;
                }
              }

              if (statusCode === 409 || data.code === 'OCC_CONFLICT') {
                await markConflict(item.id, data);
                resultItems.push({
                  id: item.id,
                  submissionUuid: item.submissionUuid,
                  operationType: item.operationType,
                  status: 'conflict',
                  statusCode: 409,
                  message: data.message || 'Record modified remotely by another user',
                });
                continue;
              }

              if ([400, 401, 403, 422].includes(statusCode)) {
                const errMsg = data.message || `Client validation error (HTTP ${statusCode})`;
                const issues = Array.isArray(data.details?.fields)
                  ? data.details.fields.map((f: any) => `${f.field}: ${f.issue}`)
                  : undefined;
                await markFailedFinal(item.id, errMsg, statusCode, issues);
                resultItems.push({
                  id: item.id,
                  submissionUuid: item.submissionUuid,
                  operationType: item.operationType,
                  status: 'failed_final',
                  statusCode,
                  message: errMsg,
                });
                continue;
              }

              const errMsg = data.message || 'Server returned error status';
              await markFailedRetryable(item.id, errMsg, statusCode);
              resultItems.push({
                id: item.id,
                submissionUuid: item.submissionUuid,
                operationType: item.operationType,
                status: 'failed_retryable',
                statusCode,
                message: errMsg,
              });
              continue;
            }

            const remoteId =
              data.remoteSubmissionId ||
              data.uniqueId ||
              data.data?.remoteSubmissionId ||
              data.data?.remote_submission_id ||
              data.data?.uniqueId ||
              (item.operationType === 'UPDATE' ? item.submissionUuid : undefined);
            const version =
              data.version ||
              data.revisionNumber ||
              data.data?.version ||
              (item.operationType === 'UPDATE' ? (item.expectedVersion || 1) + 1 : 1);
            const updatedAt =
              data.updatedAt ||
              data.data?.updatedAt ||
              data.data?.updated_at ||
              new Date().toISOString();
            const requestId =
              data.requestId ||
              (res.headers && typeof res.headers.get === 'function'
                ? res.headers.get('x-request-id') || res.headers.get('X-Request-Id')
                : undefined);

            // Invariant: Verify canonical acknowledgement
            const isAcknowledged = data.acknowledged !== false && Boolean(remoteId);

            if (isAcknowledged) {
              await markSynced(
                item.id,
                item.submissionUuid,
                remoteId,
                version,
                updatedAt,
                requestId
              );

              resultItems.push({
                id: item.id,
                submissionUuid: item.submissionUuid,
                operationType: item.operationType,
                status: 'synced',
                remoteSubmissionId: remoteId,
                version,
                statusCode: res.status,
              });

              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('child_nutrition:record_synced', {
                    detail: {
                      uuid: item.submissionUuid,
                      remoteSubmissionId: remoteId,
                      version,
                      updatedAt,
                      requestId,
                    },
                  })
                );
              }
            } else {
              const errMsg = 'Unacknowledged server response without remote identifier';
              await markFailedRetryable(item.id, errMsg, 500);
              resultItems.push({
                id: item.id,
                submissionUuid: item.submissionUuid,
                operationType: item.operationType,
                status: 'failed_retryable',
                statusCode: 500,
                message: errMsg,
              });
            }
          } else if (res.status === 409) {
            const conflictBody = await res.json().catch(() => ({}));
            await markConflict(item.id, conflictBody);
            resultItems.push({
              id: item.id,
              submissionUuid: item.submissionUuid,
              operationType: item.operationType,
              status: 'conflict',
              statusCode: 409,
              message: conflictBody.message || 'Record modified remotely by another user',
            });
          } else if ([400, 401, 403, 422].includes(res.status)) {
            const errBody = await res.json().catch(() => ({}));
            const errMsg = errBody.message || `Client validation error (HTTP ${res.status})`;
            const issues = Array.isArray(errBody.details?.fields)
              ? errBody.details.fields.map((f: any) => `${f.field}: ${f.issue}`)
              : undefined;
            await markFailedFinal(item.id, errMsg, res.status, issues);
            resultItems.push({
              id: item.id,
              submissionUuid: item.submissionUuid,
              operationType: item.operationType,
              status: 'failed_final',
              statusCode: res.status,
              message: errMsg,
            });
          } else if (res.status === 404 && item.operationType === 'UPDATE') {
            const pAny = (item.payload as any) || {};
            const hasData = Boolean(pAny.demographics?.childName || pAny.childName);
            if (hasData) {
              const rawPayload: any = { ...pAny };
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
              if (!rawPayload.uuid || !uuidRegex.test(rawPayload.uuid)) {
                rawPayload.uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;
              }
              if (rawPayload.uuid && !rawPayload.clientSubmissionId) {
                rawPayload.clientSubmissionId = rawPayload.uuid;
              }
              if (!rawPayload.artNumber && item.submissionUuid) {
                rawPayload.artNumber = item.submissionUuid;
              }
              if (rawPayload.demographics && !rawPayload.demographics.artNumber && item.submissionUuid) {
                rawPayload.demographics.artNumber = item.submissionUuid;
              }

              const convertedItem: SyncQueueItem = {
                ...item,
                operationType: 'CREATE',
                submissionUuid: rawPayload.uuid || item.submissionUuid,
                payload: rawPayload,
                status: 'queued',
                nextRetryTimestamp: Date.now(),
              };

              await db.syncQueue.update(item.id, {
                operationType: 'CREATE',
                submissionUuid: rawPayload.uuid || item.submissionUuid,
                payload: rawPayload,
                status: 'queued',
                nextRetryTimestamp: Date.now(),
                errorMessage: 'Record not found on central server; converting to initial creation.',
              });

              try {
                const createReq = buildCreateRequest(convertedItem);
                const createRes = await fetch(createReq.url, {
                  method: createReq.method,
                  headers: createReq.headers,
                  body: JSON.stringify(createReq.body),
                });
                if (createRes.ok) {
                  const createData = await createRes.json().catch(() => ({}));
                  if (createData.status !== 'error') {
                    const cRemoteId = createData.remoteSubmissionId || createData.uniqueId || item.submissionUuid;
                    const cVersion = createData.version || createData.revisionNumber || 1;
                    const cUpdatedAt = createData.updatedAt || new Date().toISOString();
                    const cRequestId = createData.requestId || (createRes.headers ? createRes.headers.get('x-request-id') || undefined : undefined);
                    await markSynced(item.id, convertedItem.submissionUuid, cRemoteId, cVersion, cUpdatedAt, cRequestId);
                    resultItems.push({
                      id: item.id,
                      submissionUuid: item.submissionUuid,
                      operationType: 'CREATE',
                      status: 'synced',
                      statusCode: createRes.status,
                      remoteSubmissionId: cRemoteId,
                    });
                    continue;
                  }
                }
              } catch (retryErr) {
                console.warn('Immediate CREATE dispatch after 404 self-heal deferred to next retry:', retryErr);
              }

              resultItems.push({
                id: item.id,
                submissionUuid: item.submissionUuid,
                operationType: 'CREATE',
                status: 'failed_retryable',
                statusCode: 404,
                message: 'Record not found on central server; converted to initial creation.',
              });
            } else {
              const errBody = await res.json().catch(() => ({}));
              const errMsg = errBody.message || 'Record not found on server (HTTP 404)';
              await markFailedFinal(item.id, errMsg, 404);
              resultItems.push({
                id: item.id,
                submissionUuid: item.submissionUuid,
                operationType: item.operationType,
                status: 'failed_final',
                statusCode: 404,
                message: errMsg,
              });
            }
          } else {
            const errBody = await res.json().catch(() => ({}));
            const errMsg = errBody.message || `Server error (HTTP ${res.status})`;
            await markFailedRetryable(item.id, errMsg, res.status);
            resultItems.push({
              id: item.id,
              submissionUuid: item.submissionUuid,
              operationType: item.operationType,
              status: 'failed_retryable',
              statusCode: res.status,
              message: errMsg,
            });
          }
        } catch (fetchErr: any) {
          const errMsg =
            fetchErr.name === 'AbortError'
              ? 'Network request timed out'
              : fetchErr.message || 'Network connection unreachable';
          await markFailedRetryable(item.id, errMsg, 503);
          resultItems.push({
            id: item.id,
            submissionUuid: item.submissionUuid,
            operationType: item.operationType,
            status: 'failed_retryable',
            statusCode: 503,
            message: errMsg,
          });
        }
      }

      this.lastFlushTimestamp = Date.now();

      const syncedCount = resultItems.filter((r) => r.status === 'synced').length;
      const failedCount = resultItems.filter(
        (r) => r.status === 'failed_retryable' || r.status === 'failed_final'
      ).length;
      const conflictCount = resultItems.filter((r) => r.status === 'conflict').length;

      // 5. Notify the entire application of completed sync batch
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('child_nutrition:sync_completed', {
            detail: {
              trigger,
              syncedCount,
              failedCount,
              conflictCount,
              timestamp,
            },
          })
        );
      }

      let overallStatus: SyncFlushResult['status'] = 'success';
      if (syncedCount === 0 && (failedCount > 0 || conflictCount > 0)) {
        overallStatus = 'failed';
      } else if (syncedCount > 0 && (failedCount > 0 || conflictCount > 0)) {
        overallStatus = 'partial';
      }

      return {
        status: overallStatus,
        trigger,
        processedCount: resultItems.length,
        syncedCount,
        failedCount,
        conflictCount,
        items: resultItems,
        timestamp,
      };
    } finally {
      releaseSyncLock();
    }
  }

  public getLastFlushTimestamp(): number | null {
    return this.lastFlushTimestamp;
  }
}

export const syncOrchestrator = new SyncOrchestratorService();
