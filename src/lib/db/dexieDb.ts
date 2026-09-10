/**
 * Dexie.js v4 IndexedDB Schema for Childcare Support — Phase 3
 * Provides offline-first persistence for drafts, sync outbox, reference rosters, and audit logs.
 * Migrated to Version 3 for binary caregiver signature Blob isolation.
 */

import Dexie, { type Table } from 'dexie';
import type { AssessmentRecord, SyncQueueItem, AuditEvent } from '@/types/domain';

export interface ReferenceBeneficiary {
  artNumber: string;
  childName: string;
  dob: string;
  gender: string;
  caregiverName: string;
  caregiverPhone: string;
  district: string;
  lastAssessmentDate?: string;
  currentNutritionStatus?: string;
}

export interface SignatureAttachment {
  submissionUuid: string; // Foreign key to clientSubmissionId / uuid
  blob: Blob; // Binary PNG Blob
  mimeType: string; // 'image/png'
  capturedAt: string;
  caregiverName: string;
  caregiverRelationship: string;
}

export class ChildcareDatabase extends Dexie {
  drafts!: Table<AssessmentRecord, number>;
  syncQueue!: Table<SyncQueueItem, number>;
  referenceBeneficiaries!: Table<ReferenceBeneficiary, string>;
  auditLogs!: Table<AuditEvent, number>;
  signatureAttachments!: Table<SignatureAttachment, string>;

  constructor() {
    super('AllianceChildcareDB');

    this.version(1).stores({
      drafts: '++id, uuid, stepIndex, updatedAt, [demographics.artNumber]',
      syncQueue: '++id, submissionUuid, status, retryCount, nextRetryTimestamp',
      referenceBeneficiaries: 'artNumber, childName, district, artCenter',
      auditLogs: '++id, timestamp, eventType',
    });

    this.version(2).stores({
      drafts: '++id, uuid, clientSubmissionId, remoteSubmissionId, version, stepIndex, updatedAt, syncStatus, [demographics.artNumber]',
      syncQueue: '++id, submissionUuid, idempotencyKey, operationType, status, expectedVersion, retryCount, nextRetryTimestamp, [status+nextRetryTimestamp]',
      referenceBeneficiaries: 'artNumber, childName, district',
      auditLogs: '++id, timestamp, eventType, targetUuid',
    });

    this.version(3).stores({
      drafts: '++id, uuid, clientSubmissionId, remoteSubmissionId, version, stepIndex, updatedAt, syncStatus, [demographics.artNumber]',
      syncQueue: '++id, submissionUuid, idempotencyKey, operationType, status, expectedVersion, retryCount, nextRetryTimestamp, [status+nextRetryTimestamp]',
      referenceBeneficiaries: 'artNumber, childName, district',
      auditLogs: '++id, timestamp, eventType, targetUuid',
      signatureAttachments: 'submissionUuid, capturedAt',
    });
  }
}

export const db = new ChildcareDatabase();

/**
 * Saves a caregiver signature as a raw binary Blob in IndexedDB
 */
export async function saveCaregiverSignatureBlob(
  submissionUuid: string,
  blob: Blob,
  caregiverName: string,
  caregiverRelationship: string
): Promise<void> {
  await db.signatureAttachments.put({
    submissionUuid,
    blob,
    mimeType: blob.type || 'image/png',
    capturedAt: new Date().toISOString(),
    caregiverName,
    caregiverRelationship,
  });
}

/**
 * Retrieves a caregiver signature Blob by submission UUID
 */
export async function getCaregiverSignatureBlob(
  submissionUuid: string
): Promise<SignatureAttachment | undefined> {
  return await db.signatureAttachments.get(submissionUuid);
}

/**
 * Purges a caregiver signature Blob (e.g. if consent changed to "No")
 */
export async function deleteCaregiverSignatureBlob(
  submissionUuid: string
): Promise<void> {
  await db.signatureAttachments.delete(submissionUuid);
}

/**
 * Clears all local test/dummy drafts, syncQueue items, audit logs, and supervisor cache.
 */
export async function clearAllLocalData(): Promise<void> {
  await db.drafts.clear();
  await db.syncQueue.clear();
  await db.auditLogs.clear();
  await db.signatureAttachments.clear();
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.removeItem('childcare_supervisor_cache_v1');
  }
}

