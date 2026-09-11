/**
 * submissionMapper.ts — Pure Payload Mapper
 *
 * This is the ONLY owner of:
 *   - transforming local final assessment snapshots into canonical API payloads
 *   - mapping API/adapter acknowledgements back into local canonical metadata
 *
 * Rules:
 *   - Must NOT build HTTP URLs
 *   - Must NOT mutate IndexedDB directly
 *   - Must be a pure transformation (no side effects)
 *   - Must strip all local-only metadata (id, stepIndex, syncStatus, etc.)
 *   - artReferenceId appears in the body ONLY — never in any URL key
 */

import type { AssessmentRecord } from '@/types/domain';
import {
  normalizeCaregiverConsent,
  type ServerAcknowledgement,
  type ClientSubmissionId,
  type CreateIdempotencyKey,
} from './submissionTypes';

// Local-only keys stripped from every API payload
const LOCAL_ONLY_KEYS = new Set([
  'id',
  'stepIndex',
  'syncStatus',
  'syncNeeded',
  'syncedAt',
  'syncError',
  'createdAt',
  'updatedAt',
]);

export interface CreatePayload {
  /** Stable client UUID — used for idempotency reconciliation */
  clientSubmissionId: ClientSubmissionId;
  /** Stable CREATE idempotency key — must be sent as Idempotency-Key header */
  createIdempotencyKey: CreateIdempotencyKey;
  /** Full assessment data minus local-only keys */
  [key: string]: unknown;
}

/**
 * Maps a local AssessmentRecord to a canonical CREATE request payload.
 * The artReferenceId (stored as demographics.artNumber) appears in the body
 * and is forwarded to the server — it must NEVER be used in a URL path.
 */
export function mapToCreatePayload(
  record: AssessmentRecord,
  createIdempotencyKey: CreateIdempotencyKey
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (LOCAL_ONLY_KEYS.has(key)) continue;
    payload[key] = value;
  }

  // Ensure clientSubmissionId is always set (required by API)
  payload.clientSubmissionId = record.clientSubmissionId || record.uuid;
  payload.uuid = record.uuid;

  // Apply canonical caregiver consent normalization
  if (record.caregiverConsent || record.consent || (record as any).agreeToParticipate) {
    const normalizedConsent = normalizeCaregiverConsent(record);
    if (normalizedConsent) {
      payload.caregiverConsent = normalizedConsent;
      payload.consent = {
        agreeToParticipate: true,
        signatureDataUrl: normalizedConsent.signatureDataUrl,
        signatureTimestamp: normalizedConsent.consentCapturedAt,
      };
    }
  }

  // createIdempotencyKey is included in the body for correlation,
  // but MUST also be sent as the Idempotency-Key request header.
  payload.createIdempotencyKey = createIdempotencyKey;

  return payload;
}

/**
 * Maps a server acknowledgement from the Next.js API / adapter
 * back into local canonical identity metadata.
 * Returns only the fields that should be persisted locally.
 */
export function mapAcknowledgementToLocal(
  rawAck: Record<string, unknown>
): Partial<AssessmentRecord> & { remoteSubmissionId: string; version: number } {
  const remoteSubmissionId = String(rawAck.remoteSubmissionId ?? '');
  if (!remoteSubmissionId) {
    throw new Error('[submissionMapper] Server acknowledgement missing remoteSubmissionId');
  }

  const version = Number(rawAck.version ?? rawAck.revisionNumber ?? 1);
  if (!version || version < 1) {
    throw new Error('[submissionMapper] Server acknowledgement missing valid version');
  }

  return {
    remoteSubmissionId,
    version,
    syncStatus: 'synced',
    syncedAt: String(rawAck.updatedAt ?? rawAck.acceptedAt ?? rawAck.submittedAt ?? new Date().toISOString()),
  };
}

/**
 * Maps a full raw API response to a canonical ServerAcknowledgement.
 * Validates required fields and throws if the acknowledgement is malformed.
 */
export function parseServerAcknowledgement(
  raw: Record<string, unknown>,
  sentClientSubmissionId: string
): ServerAcknowledgement {
  const remoteSubmissionId = String(raw.remoteSubmissionId ?? '');
  if (!remoteSubmissionId) {
    throw new Error('[submissionMapper] Malformed acknowledgement: remoteSubmissionId absent');
  }

  const version = Number(raw.version ?? raw.revisionNumber ?? 0);
  if (!version || version < 1) {
    throw new Error('[submissionMapper] Malformed acknowledgement: version absent or < 1');
  }

  const clientSubmissionId = String(
    raw.clientSubmissionId ?? sentClientSubmissionId
  );
  const requestId = String(raw.requestId ?? `ack-${Date.now().toString(36)}`);

  return {
    remoteSubmissionId,
    clientSubmissionId,
    version,
    requestId,
    updatedAt: raw.updatedAt as string | undefined,
    acceptedAt: raw.acceptedAt as string | undefined,
    submittedAt: raw.submittedAt as string | undefined,
    isDuplicate: Boolean(raw.isDuplicate),
  };
}
