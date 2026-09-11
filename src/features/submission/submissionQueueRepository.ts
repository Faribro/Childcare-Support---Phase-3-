/**
 * submissionQueueRepository.ts — The Only Owner of IndexedDB Queue Reads/Writes
 *
 * Responsibilities:
 *   - Atomic snapshot persistence with identity fields
 *   - Status persistence and transition recording
 *   - Retry metadata persistence
 *   - Legacy queue migration (schemaVersion < 2 -> v2)
 *
 * This module wraps the existing syncQueueRepository functions, adding
 * the canonical identity contract enforcement and the new UserFacingSubmissionState
 * persistence. The underlying Dexie store is unchanged.
 */

import { db } from '@/lib/db/dexieDb';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import {
  assertValidRemoteSubmissionId,
  EmptyUpdateChangesError,
  isValidUuidV4,
  generateUuidV4,
  hasVerifiableConsent,
  normalizeCaregiverConsent,
  type ServerAcknowledgement,
  type SubmissionErrorCategory,
} from './submissionTypes';
import { submissionEvents } from './submissionEvents';

// ---------------------------------------------------------------------------
// Enqueue a new CREATE operation (snapshot + identity)
// ---------------------------------------------------------------------------

export interface EnqueueCreateOptions {
  clientSubmissionId: string;
  createIdempotencyKey: string;
  snapshot: AssessmentRecord;
}

/**
 * Atomically persists a final assessment snapshot and enqueues a CREATE
 * operation in one Dexie transaction.
 * Returns the IndexedDB queue item ID.
 */
export async function enqueueCreate(options: EnqueueCreateOptions): Promise<number> {
  const { clientSubmissionId, createIdempotencyKey, snapshot } = options;
  const now = new Date().toISOString();

  // Enforce canonical UUIDv4 identity
  const validUuid = isValidUuidV4(snapshot.uuid)
    ? snapshot.uuid
    : isValidUuidV4(clientSubmissionId)
    ? clientSubmissionId
    : generateUuidV4();

  // If snapshot had an ART/reference ID as uuid, preserve it in demographics.artNumber
  if (snapshot.demographics) {
    if (!snapshot.demographics.artNumber && snapshot.uuid && !isValidUuidV4(snapshot.uuid)) {
      snapshot.demographics.artNumber = snapshot.uuid;
    }
  }

  snapshot.uuid = validUuid;
  snapshot.clientSubmissionId = validUuid;
  const stableIdempotencyKey = createIdempotencyKey && createIdempotencyKey.startsWith(`create-${validUuid}`)
    ? createIdempotencyKey
    : `create-${validUuid}`;

  // Apply canonical caregiver consent normalization
  if (hasVerifiableConsent(snapshot)) {
    const normalizedConsent = normalizeCaregiverConsent(snapshot);
    if (normalizedConsent) {
      snapshot.caregiverConsent = normalizedConsent;
      snapshot.consent = {
        agreeToParticipate: true,
        signatureDataUrl: normalizedConsent.signatureDataUrl,
        signatureTimestamp: normalizedConsent.consentCapturedAt,
      };
    }
  }

  return await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    // 1. Persist/update the draft snapshot
    if (snapshot.id) {
      await db.drafts.update(snapshot.id, {
        ...snapshot,
        clientSubmissionId: validUuid,
        uuid: validUuid,
        syncStatus: 'queued',
        updatedAt: now,
      });
    } else {
      await db.drafts.put({
        ...snapshot,
        clientSubmissionId: validUuid,
        uuid: validUuid,
        syncStatus: 'queued',
        updatedAt: now,
        createdAt: snapshot.createdAt || now,
      });
    }

    // 2. Check for existing queue item for this clientSubmissionId to prevent duplicates
    const existing = await db.syncQueue
      .filter((item) => {
        const p = item.payload as any;
        return (
          (p?.clientSubmissionId === validUuid || item.submissionUuid === validUuid) &&
          item.status !== 'synced' &&
          item.status !== 'SYNCED'
        );
      })
      .first();

    if (existing?.id) {
      // Already queued — idempotent, return existing ID
      return existing.id;
    }

    // 3. Enqueue CREATE
    return await db.syncQueue.add({
      schemaVersion: 2,
      submissionUuid: validUuid,
      idempotencyKey: stableIdempotencyKey,
      operationType: 'CREATE',
      payload: { ...snapshot, clientSubmissionId: validUuid, uuid: validUuid },
      status: 'queued',
      expectedVersion: 1,
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: Date.now(),
      errorMessage: null,
      conflictMetadata: null,
    });
  });
}

// ---------------------------------------------------------------------------
// Enqueue an UPDATE operation (canonical identity verified)
// ---------------------------------------------------------------------------

export interface EnqueueUpdateOptions {
  clientSubmissionId: string;
  submissionUuid: string;
  remoteSubmissionId: string;
  expectedVersion: number;
  changes: Record<string, any>;
  snapshot: AssessmentRecord;
}

/**
 * Atomically persists an assessment update and enqueues an UPDATE operation
 * in one Dexie transaction.
 *
 * Invariants:
 * - changes MUST be non-empty; throws EmptyUpdateChangesError otherwise.
 * - remoteSubmissionId MUST be a confirmed server-assigned UUID v4.
 * Never allows empty patches, ART IDs, local IDs, or unconfirmed client IDs in UPDATE items.
 */
export async function enqueueUpdate(options: EnqueueUpdateOptions): Promise<number> {
  const { clientSubmissionId, submissionUuid, remoteSubmissionId, expectedVersion, changes, snapshot } = options;

  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
    throw new EmptyUpdateChangesError();
  }

  assertValidRemoteSubmissionId(remoteSubmissionId, 'enqueueUpdate');
  const now = new Date().toISOString();
  const idempotencyKey = `update-${remoteSubmissionId}-v${expectedVersion}-${Date.now()}`;

  return await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    if (snapshot.id) {
      await db.drafts.update(snapshot.id, {
        ...snapshot,
        remoteSubmissionId,
        version: expectedVersion,
        syncStatus: 'queued',
        updatedAt: now,
      });
    }

    const payload = {
      ...snapshot,
      clientSubmissionId,
      remoteSubmissionId,
      version: expectedVersion,
      changes: changes || {},
    };

    return await db.syncQueue.add({
      schemaVersion: 2,
      submissionUuid,
      idempotencyKey,
      operationType: 'UPDATE',
      payload,
      status: 'queued',
      expectedVersion,
      retryCount: 0,
      lastAttempt: null,
      nextRetryTimestamp: Date.now(),
      errorMessage: null,
      conflictMetadata: null,
    });
  });
}

// ---------------------------------------------------------------------------
// Mark a queue item as SUBMITTED after server acknowledgement
// ---------------------------------------------------------------------------

/**
 * Atomically persists the server acknowledgement (remoteSubmissionId, version,
 * requestId) and transitions the queue item and draft to SYNCED/SUBMITTED.
 */
export async function markSubmitted(
  queueId: number,
  submissionUuid: string,
  ack: ServerAcknowledgement
): Promise<void> {
  const now = ack.updatedAt || ack.submittedAt || ack.acceptedAt || new Date().toISOString();

  await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    await db.syncQueue.update(queueId, {
      status: 'synced',
      errorMessage: null,
      nextRetryTimestamp: null,
      requestId: ack.requestId || null,
    });

    const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
    if (draft?.id) {
      await db.drafts.update(draft.id, {
        syncStatus: 'synced',
        remoteSubmissionId: ack.remoteSubmissionId,
        version: ack.version,
        syncedAt: now,
        updatedAt: now,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Mark a queue item as requiring user action (terminal)
// ---------------------------------------------------------------------------

export async function markActionRequired(
  queueId: number,
  submissionUuid: string,
  errorMessage: string,
  statusCode?: number,
  errorCategory?: SubmissionErrorCategory
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    await db.syncQueue.update(queueId, {
      status: 'failed_final',
      errorMessage,
      errorCategory: errorCategory || 'validation',
      lastErrorCode: statusCode ?? null,
      nextRetryTimestamp: null,
      lastAttempt: now,
    });

    const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
    if (draft?.id) {
      await db.drafts.update(draft.id, {
        syncStatus: 'failed_final',
        syncError: errorMessage,
        updatedAt: now,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Mark a queue item for automatic retry
// ---------------------------------------------------------------------------

const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 1_800_000; // 30 minutes cap

const NON_RETRYABLE_CATEGORIES: SubmissionErrorCategory[] = [
  'validation',
  'conflict',
  'malformed_acknowledgement',
  'invalid_update_identity',
  'empty_update_changes',
  'not_found',
];

/**
 * Records a transient failure and schedules automatic retry with bounded
 * exponential backoff and jitter.
 *
 * Rules:
 * - Transient errors (network, timeout, rate_limited, upstream_unavailable)
 *   remain safely retryable indefinitely. They are NOT promoted to action-required
 *   merely because retryCount is high.
 * - HTTP 401/403 (unauthorized) remains preserved locally in failed_retryable
 *   for authentication recovery, and is NEVER converted to form validation correction.
 * - Non-retryable errors (validation, conflict, invalid update identity) transition
 *   immediately to ACTION_REQUIRED.
 */
export async function markRetryable(
  queueId: number,
  submissionUuid: string,
  errorMessage: string,
  statusCode?: number,
  errorCategory?: SubmissionErrorCategory
): Promise<{ willRetry: boolean; nextRetryMs: number }> {
  const now = new Date().toISOString();

  // If unauthorized: preserve locally in failed_retryable without looping
  if (errorCategory === 'unauthorized' || statusCode === 401 || statusCode === 403) {
    const unauthMessage = errorMessage || 'Your session expired. Please sign in again. Your saved assessment remains safe on this device.';
    await db.syncQueue.update(queueId, {
      status: 'failed_retryable',
      errorMessage: unauthMessage,
      lastErrorCode: statusCode ?? 401,
      errorCategory: 'unauthorized',
      lastAttempt: now,
      nextRetryTimestamp: Date.now() + 300000, // pause automatic tight retries until user action
    });
    const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
    if (draft?.id) {
      await db.drafts.update(draft.id, {
        syncStatus: 'failed_retryable',
        syncError: unauthMessage,
        updatedAt: now,
      });
    }
    return { willRetry: false, nextRetryMs: 0 };
  }

  // If a non-retryable error reaches markRetryable, transition to ACTION_REQUIRED immediately
  if (errorCategory && NON_RETRYABLE_CATEGORIES.includes(errorCategory)) {
    await markActionRequired(queueId, submissionUuid, errorMessage, statusCode, errorCategory);
    return { willRetry: false, nextRetryMs: 0 };
  }

  const item = await db.syncQueue.get(queueId);
  if (!item) return { willRetry: false, nextRetryMs: 0 };

  const newRetryCount = (item.retryCount ?? 0) + 1;

  // Exponential backoff with full jitter, capped at 30 minutes
  const exponential = Math.min(BASE_BACKOFF_MS * Math.pow(2, Math.min(newRetryCount - 1, 10)), MAX_BACKOFF_MS);
  const jitter = Math.random() * exponential;
  const nextRetryMs = Math.max(1000, Math.round(jitter));

  await db.syncQueue.update(queueId, {
    status: 'failed_retryable',
    errorMessage,
    lastErrorCode: statusCode ?? null,
    lastAttempt: now,
    retryCount: newRetryCount,
    nextRetryTimestamp: Date.now() + nextRetryMs,
  });

  const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
  if (draft?.id) {
    await db.drafts.update(draft.id, {
      syncStatus: 'failed_retryable',
      syncError: errorMessage,
      updatedAt: now,
    });
  }

  return { willRetry: true, nextRetryMs };
}

// ---------------------------------------------------------------------------
// Repair identity after 404 reconciliation
// ---------------------------------------------------------------------------

export async function repairRemoteIdentity(
  queueId: number,
  submissionUuid: string,
  remoteSubmissionId: string,
  version: number
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', [db.drafts, db.syncQueue], async () => {
    // Update the queue item's payload to include the repaired remote identity
    const item = await db.syncQueue.get(queueId);
    if (item) {
      const updatedPayload: any = { ...(item.payload as any) };
      updatedPayload.remoteSubmissionId = remoteSubmissionId;
      updatedPayload.version = version;

      await db.syncQueue.update(queueId, {
        payload: updatedPayload,
        status: 'queued',
        operationType: 'UPDATE',
        expectedVersion: version,
        nextRetryTimestamp: Date.now(),
        errorMessage: null,
      });
    }

    const draft = await db.drafts.where('uuid').equals(submissionUuid).first();
    if (draft?.id) {
      await db.drafts.update(draft.id, {
        remoteSubmissionId,
        version,
        updatedAt: now,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Get pending queue items (non-terminal, ready for dispatch)
// ---------------------------------------------------------------------------

export async function getDispatchQueue(): Promise<SyncQueueItem[]> {
  const now = Date.now();
  return db.syncQueue
    .filter((item) => {
      if (item.status === 'synced' || item.status === 'SYNCED') {
        return false;
      }
      // Quarantined items (corrupt update identity or empty update changes) remain blocked
      if (
        item.status === 'failed_final' &&
        (item.errorCategory === 'invalid_update_identity' || item.errorCategory === 'empty_update_changes')
      ) {
        return false;
      }
      // True conflict items wait for review
      if (item.status === 'conflict') {
        return false;
      }
      // True field validation failures (422) wait for user correction
      if (item.status === 'failed_final' && item.errorCategory === 'validation') {
        return false;
      }
      if (item.status === 'failed_retryable' || item.status === 'FAILED_RETRYABLE') {
        return (item.nextRetryTimestamp ?? 0) <= now;
      }
      return item.status === 'queued' || item.status === 'syncing' || item.status === 'failed';
    })
    .toArray();
}

// ---------------------------------------------------------------------------
// Legacy migration & local queue recovery — schemaVersion 1 -> 2
// ---------------------------------------------------------------------------

/**
 * Migrates legacy queue items and normalizes local queue state.
 *
 * MIGRATION & RECLASSIFICATION RULES:
 * 1. Valid final local-only CREATE:
 *    A local record with a complete final local snapshot (uuid, demographics),
 *    no confirmed remoteSubmissionId, and no evidence of remote acknowledgement
 *    is reclassified as:
 *      operationType = 'CREATE'
 *      status = 'queued' (if it was failed_final/needs_review/failed from legacy behavior)
 *      nextRetryTimestamp = Date.now()
 *      stable idempotencyKey = 'create-' + clientSubmissionId
 *    This ensures valid local records auto-submit via POST /api/submissions.
 *
 * 2. Corrupt / ambiguous UPDATE:
 *    An item with evidence of remote acknowledgement or explicit non-UUID remote ID
 *    (e.g. ART ID in remoteSubmissionId) or empty update changes MUST NOT be auto-created.
 *    It is quarantined to ACTION_REQUIRED ('failed_final').
 *
 * Safe to call multiple times — idempotent.
 */
export async function migrateLegacyItems(): Promise<number> {
  const allItems = await db.syncQueue.toArray();

  let migrated = 0;
  for (const item of allItems) {
    if (!item.id) continue;
    if (item.status === 'synced' || item.status === 'SYNCED') continue;

    const payload: any = item.payload ?? {};

    // 1. Check remote identity
    const rawRemoteId = payload.remoteSubmissionId;
    let hasValidRemoteId = false;
    if (rawRemoteId) {
      try {
        assertValidRemoteSubmissionId(rawRemoteId, 'migrateLegacyItems');
        hasValidRemoteId = true;
      } catch {
        // Has a remote ID but it's an ART ID or non-UUID — corrupt/legacy identity!
        // Do NOT convert to CREATE — quarantine to ACTION_REQUIRED.
        await db.syncQueue.update(item.id, {
          schemaVersion: 2,
          operationType: 'UPDATE',
          status: 'failed_final',
          errorMessage: 'This saved record needs help before it can be updated.',
          errorCategory: 'invalid_update_identity',
          payload,
          idempotencyKey: item.idempotencyKey,
          nextRetryTimestamp: null,
        });
        submissionEvents.emit('submission:failed', {
          clientSubmissionId: payload.clientSubmissionId || payload.uuid || item.submissionUuid,
          errorCategory: 'invalid_update_identity',
          message: 'This saved record needs help before it can be updated.',
          timestamp: new Date().toISOString(),
          retryCount: item.retryCount,
        });
        migrated++;
        continue;
      }
    }

    // 2. Check if there is evidence of previous remote acknowledgement
    const hasRemoteAck = Boolean(item.acknowledged || payload.acknowledged);
    if (!hasValidRemoteId && hasRemoteAck) {
      // Evidence of remote acknowledgement attempt without valid canonical ID — quarantine
      await db.syncQueue.update(item.id, {
        schemaVersion: 2,
        operationType: 'UPDATE',
        status: 'failed_final',
        errorMessage: 'This saved record needs help before it can be updated.',
        errorCategory: 'invalid_update_identity',
        payload,
        idempotencyKey: item.idempotencyKey,
        nextRetryTimestamp: null,
      });
      submissionEvents.emit('submission:failed', {
        clientSubmissionId: payload.clientSubmissionId || payload.uuid || item.submissionUuid,
        errorCategory: 'invalid_update_identity',
        message: 'This saved record needs help before it can be updated.',
        timestamp: new Date().toISOString(),
        retryCount: item.retryCount,
      });
      migrated++;
      continue;
    }

    // 3. Explicit UPDATE operation without valid remote ID must NOT be auto-converted to CREATE
    if (item.operationType === 'UPDATE' && !hasValidRemoteId) {
      await db.syncQueue.update(item.id, {
        schemaVersion: 2,
        operationType: 'UPDATE',
        status: 'failed_final',
        errorMessage: 'This saved record needs help before it can be updated.',
        errorCategory: 'invalid_update_identity',
        payload,
        idempotencyKey: item.idempotencyKey,
        nextRetryTimestamp: null,
      });
      submissionEvents.emit('submission:failed', {
        clientSubmissionId: payload.clientSubmissionId || payload.uuid || item.submissionUuid,
        errorCategory: 'invalid_update_identity',
        message: 'This saved record needs help before it can be updated.',
        timestamp: new Date().toISOString(),
        retryCount: item.retryCount,
      });
      migrated++;
      continue;
    }

    // 4. Valid item with confirmed remoteSubmissionId (UPDATE)
    if (hasValidRemoteId) {
      await db.syncQueue.update(item.id, {
        schemaVersion: 2,
        operationType: 'UPDATE',
        payload,
        idempotencyKey: item.idempotencyKey,
        nextRetryTimestamp: item.nextRetryTimestamp ?? Date.now(),
        status: item.status === 'syncing' ? 'queued' : item.status,
      });
      migrated++;
      continue;
    }

    // 5. Local-only record (CREATE)
    // Perform canonical identity normalization and caregiver consent normalization

    // Check if the record has legacy identity or consent defects
    const hasLegacyIdentityDefect =
      !isValidUuidV4(payload.uuid) ||
      !isValidUuidV4(payload.clientSubmissionId) ||
      !isValidUuidV4(item.submissionUuid);

    const hasLegacyConsentDefect =
      !payload.caregiverConsent ||
      payload.caregiverConsent.consentProvided !== true;

    const isLegacyEligibleForRepair = hasLegacyIdentityDefect || hasLegacyConsentDefect;

    // Extract any existing business reference ID
    const oldRefId =
      payload.demographics?.artNumber ||
      payload.uniqueId ||
      (!isValidUuidV4(payload.uuid) ? payload.uuid : undefined) ||
      (!isValidUuidV4(item.submissionUuid) ? item.submissionUuid : undefined);

    if (!payload.demographics || typeof payload.demographics !== 'object') {
      payload.demographics = {};
    }
    if (oldRefId && !payload.demographics.artNumber) {
      payload.demographics.artNumber = oldRefId;
    }

    // Canonical UUIDv4: preserve existing valid UUIDv4 or generate once
    const canonicalUuid =
      (isValidUuidV4(payload.uuid) ? payload.uuid : null) ||
      (isValidUuidV4(payload.clientSubmissionId) ? payload.clientSubmissionId : null) ||
      (isValidUuidV4(item.submissionUuid) ? item.submissionUuid : null) ||
      generateUuidV4();

    payload.uuid = canonicalUuid;
    payload.clientSubmissionId = canonicalUuid;
    const newSubmissionUuid = canonicalUuid;
    const stableIdempotencyKey =
      item.idempotencyKey && item.idempotencyKey.startsWith(`create-${canonicalUuid}`)
        ? item.idempotencyKey
        : `create-${canonicalUuid}`;

    // Preserve binary caregiver signature in IndexedDB under canonical UUID
    if (oldRefId && oldRefId !== canonicalUuid) {
      try {
        if (db.signatureAttachments && typeof db.signatureAttachments.get === 'function') {
          const oldSig = await db.signatureAttachments.get(oldRefId);
          if (oldSig) {
            await db.signatureAttachments.put({
              ...oldSig,
              submissionUuid: canonicalUuid,
            });
          }
        }
      } catch (sigErr) {
        console.warn('[migrateLegacyItems] Could not migrate signature attachment:', sigErr);
      }
    }

    // Update matching draft in db.drafts if old ID was used
    try {
      let draftToUpdate = await db.drafts.where('uuid').equals(canonicalUuid).first();
      if (!draftToUpdate && oldRefId) {
        draftToUpdate = await db.drafts.where('uuid').equals(oldRefId).first();
      }
      if (draftToUpdate?.id) {
        await db.drafts.update(draftToUpdate.id, {
          uuid: canonicalUuid,
          clientSubmissionId: canonicalUuid,
        });
      }
    } catch (dErr) {
      console.warn('[migrateLegacyItems] Could not update matching draft uuid:', dErr);
    }

    // Normalize caregiver consent
    const verifiableConsent = hasVerifiableConsent(payload);
    if (verifiableConsent) {
      const normalizedConsent = normalizeCaregiverConsent(payload);
      if (normalizedConsent) {
        payload.caregiverConsent = normalizedConsent;
        payload.consent = {
          agreeToParticipate: true,
          signatureDataUrl: normalizedConsent.signatureDataUrl,
          signatureTimestamp: normalizedConsent.consentCapturedAt,
        };
      }
    }

    // Check payload against completeSubmissionSchema
    const parseResult = completeSubmissionSchema.safeParse(payload);
    let newStatus = item.status;
    let newErrorMessage = item.errorMessage;
    let newErrorCategory: SubmissionErrorCategory | undefined = item.errorCategory as SubmissionErrorCategory | undefined;
    let newErrorCode = item.lastErrorCode;
    let newNextRetry: number | null = item.nextRetryTimestamp;

    if (!verifiableConsent) {
      // Consent cannot be verified: require user action
      newStatus = 'failed_final';
      newErrorCategory = 'validation';
      newErrorMessage = 'Caregiver consent must be provided to record this assessment. Please open and record caregiver consent.';
      newErrorCode = 422;
      newNextRetry = null;
    } else if (item.status === 'failed_final' && !isLegacyEligibleForRepair) {
      // Record already had canonical identity and valid consent, but was marked failed_final (genuine server/field validation error)
      newStatus = 'failed_final';
      newNextRetry = null;
    } else if (parseResult.success) {
      // Record had a legacy defect and has now been repaired with canonical UUID and normalized consent!
      // Clear obsolete identity/consent 422 error and re-queue for automatic dispatch
      const isLegacyFailedState =
        item.status === 'failed_final' ||
        item.status === 'FAILED_FINAL' ||
        item.status === 'needs_review' ||
        item.status === 'NEEDS_REVIEW' ||
        item.status === 'failed';

      if (isLegacyFailedState || item.status === 'syncing' || !item.status) {
        newStatus = 'queued';
        newErrorMessage = null;
        newErrorCategory = undefined;
        newErrorCode = null;
        newNextRetry = Date.now();
      } else {
        newNextRetry = item.nextRetryTimestamp ?? Date.now();
      }
    } else {
      // Genuine field validation failure unrelated to UUID/consent
      newStatus = 'failed_final';
      newErrorCategory = 'validation';
      newErrorMessage = parseResult.error.issues[0]?.message || 'The record needs correction before it can be sent.';
      newErrorCode = 422;
      newNextRetry = null;
    }

    await db.syncQueue.update(item.id, {
      schemaVersion: 2,
      submissionUuid: newSubmissionUuid,
      operationType: 'CREATE',
      payload,
      idempotencyKey: stableIdempotencyKey,
      nextRetryTimestamp: newNextRetry,
      status: newStatus,
      errorMessage: newErrorMessage,
      errorCategory: newErrorCategory,
      lastErrorCode: newErrorCode,
    });

    // Keep draft syncStatus in sync
    try {
      const draft = await db.drafts.where('uuid').equals(canonicalUuid).first();
      if (draft?.id) {
        await db.drafts.update(draft.id, {
          syncStatus: newStatus === 'queued' ? 'queued' : draft.syncStatus,
          syncError: newErrorMessage,
        });
      }
    } catch {}

    migrated++;
  }

  return migrated;
}
