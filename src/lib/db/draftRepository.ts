/**
 * Draft Repository for Offline Assessment Autosave & Lifecycle Management
 */

import { db } from './dexieDb';
import type { AssessmentRecord } from '@/types/domain';

export async function saveDraft(
  draft: Omit<AssessmentRecord, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: number;
    createdAt?: string;
    updatedAt?: string;
  }
): Promise<number> {
  const now = new Date().toISOString();

  if (draft.id) {
    await db.drafts.update(draft.id, {
      ...draft,
      updatedAt: now,
    });
    return draft.id;
  }

  const existing = await db.drafts.where('uuid').equals(draft.uuid).first();
  if (existing && existing.id) {
    await db.drafts.update(existing.id, {
      ...draft,
      updatedAt: now,
    });
    return existing.id;
  }

  const newId = await db.drafts.add({
    ...draft,
    createdAt: draft.createdAt || now,
    updatedAt: now,
    syncStatus: draft.syncStatus || 'draft',
  } as AssessmentRecord);

  return newId;
}

export async function getDraftById(id: number): Promise<AssessmentRecord | undefined> {
  return db.drafts.get(id);
}

export async function getDraftByUuid(uuid: string): Promise<AssessmentRecord | undefined> {
  return db.drafts.where('uuid').equals(uuid).first();
}

export async function getLatestDraft(): Promise<AssessmentRecord | undefined> {
  return db.drafts
    .where('syncStatus')
    .equals('draft')
    .reverse()
    .sortBy('updatedAt')
    .then((items) => items[0]);
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
}
