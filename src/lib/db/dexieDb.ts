/**
 * Dexie.js v4 IndexedDB Schema for Childcare Support — Phase 3
 * Provides offline-first persistence for drafts, sync outbox, reference rosters, and audit logs.
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
  artCenter: string;
  lastAssessmentDate?: string;
  currentNutritionStatus?: string;
}

export class ChildcareDatabase extends Dexie {
  drafts!: Table<AssessmentRecord, number>;
  syncQueue!: Table<SyncQueueItem, number>;
  referenceBeneficiaries!: Table<ReferenceBeneficiary, string>;
  auditLogs!: Table<AuditEvent, number>;

  constructor() {
    super('AllianceChildcareDB');

    this.version(1).stores({
      drafts: '++id, uuid, stepIndex, updatedAt, [demographics.artNumber]',
      syncQueue: '++id, submissionUuid, status, retryCount, nextRetryTimestamp',
      referenceBeneficiaries: 'artNumber, childName, district, artCenter',
      auditLogs: '++id, timestamp, eventType',
    });
  }
}

export const db = new ChildcareDatabase();
