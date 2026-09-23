/**
 * Draft Repository for Offline Assessment Autosave & Lifecycle Management
 */

import { db } from './dexieDb';
import type { AssessmentRecord } from '@/types/domain';

function notifyDraftChanged(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('child_nutrition:draft_updated'));
    } catch (_) {}
  }
}

export async function saveDraft(
  draft: Omit<AssessmentRecord, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: number;
    createdAt?: string;
    updatedAt?: string;
  }
): Promise<number> {
  const now = new Date().toISOString();
  const clientSubmissionId = draft.clientSubmissionId || draft.uuid;
  const version = draft.version || 1;

  let savedId: number;

  if (draft.id) {
    await db.drafts.update(draft.id, {
      ...draft,
      clientSubmissionId,
      version,
      updatedAt: now,
    });
    savedId = draft.id;
  } else {
    const existing = await db.drafts.where('uuid').equals(draft.uuid).first();
    if (existing && existing.id) {
      await db.drafts.update(existing.id, {
        ...draft,
        clientSubmissionId: existing.clientSubmissionId || clientSubmissionId,
        version: existing.version || version,
        updatedAt: now,
      });
      savedId = existing.id;
    } else {
      const newId = await db.drafts.add({
        ...draft,
        clientSubmissionId,
        version,
        createdAt: draft.createdAt || now,
        updatedAt: now,
        syncStatus: draft.syncStatus || 'draft',
      } as AssessmentRecord);
      savedId = newId;
    }
  }

  notifyDraftChanged();
  return savedId;
}

export async function getDraftById(id: number): Promise<AssessmentRecord | undefined> {
  return db.drafts.get(id);
}

export async function getDraftByUuid(uuid: string): Promise<AssessmentRecord | undefined> {
  return db.drafts.where('uuid').equals(uuid).first();
}

export async function getDraftByAnyId(idOrUuid: string | number): Promise<AssessmentRecord | undefined> {
  if (typeof idOrUuid === 'number' || /^\d+$/.test(String(idOrUuid))) {
    const byId = await db.drafts.get(Number(idOrUuid));
    if (byId) return byId;
  }
  const str = String(idOrUuid);
  const byUuid = await db.drafts.where('uuid').equals(str).first();
  if (byUuid) return byUuid;

  const byClient = await db.drafts.where('clientSubmissionId').equals(str).first();
  if (byClient) return byClient;

  return db.drafts.where('remoteSubmissionId').equals(str).first();
}

export async function getLatestDraft(): Promise<AssessmentRecord | undefined> {
  return db.drafts
    .where('syncStatus')
    .equals('draft')
    .reverse()
    .sortBy('updatedAt')
    .then((items) => items[0]);
}

export async function getDraftsCount(): Promise<number> {
  return db.drafts
    .where('syncStatus')
    .equals('draft')
    .count();
}

export async function getAllDrafts(): Promise<AssessmentRecord[]> {
  return db.drafts
    .where('syncStatus')
    .equals('draft')
    .reverse()
    .sortBy('updatedAt');
}

export async function deleteDraft(id: number): Promise<void> {
  await db.drafts.delete(id);
  notifyDraftChanged();
}

