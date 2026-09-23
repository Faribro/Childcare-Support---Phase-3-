'use client';

import * as React from 'react';
import type { AssessmentRecord } from '@/types/domain';

export interface DraftCardProps {
  draft: AssessmentRecord;
  onResume: (id: string | number) => void;
  onDelete: (id: number) => Promise<void>;
}

export function DraftCard({ draft, onResume, onDelete }: DraftCardProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const handleConfirmDelete = async () => {
    // draft.id is the Dexie autoincrement primary key (number | undefined).
    // All drafts loaded from getAllDrafts() have a numeric id assigned by Dexie.
    // Guard uses != null (safe against both null and undefined, but not 0 which is
    // never a valid Dexie ++id autoincrement value).
    if (draft.id == null) {
      setDeleteError('Cannot delete: draft has no local ID. Please reload the page.');
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(draft.id);
      // Parent removes from list — no state reset needed (component unmounts)
    } catch (err: any) {
      setIsDeleting(false);
      // Keep confirmation view active so the user sees the error and can retry or cancel
      setDeleteError(err?.message || 'Failed to delete draft. Please try again.');
    }
  };

  return (
    <div className="p-4 sm:p-5 flex flex-col justify-between gap-4 bg-white rounded-xl border border-[hsl(215,18%,85%)] hover:border-[hsl(215,18%,75%)] transition-colors shadow-2xs">
      <div className="space-y-2">
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold select-none border bg-[hsl(215,20%,94%)] text-[hsl(220,15%,30%)] border-[hsl(215,18%,82%)] shrink-0 w-fit">
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>Saved on this device</span>
          </span>
          <span className="text-[11px] text-[hsl(215,12%,50%)] whitespace-nowrap">
            Last edited {new Date(draft.updatedAt).toLocaleDateString()} at{' '}
            {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div>
          <h4 className="text-sm font-bold text-[hsl(220,15%,15%)] break-words">
            {draft.demographics?.childName || 'Draft Intake'} • <span className="font-mono text-teal-800 break-all">{draft.demographics?.artNumber || 'ID Pending'}</span>
          </h4>
          <p className="text-xs text-[hsl(215,12%,45%)] mt-0.5 break-words">
            Caregiver: {draft.demographics?.caregiverName || 'Not recorded'} • Step {draft.stepIndex || 1} of 6
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[hsl(215,20%,94%)] flex-wrap">
        {isConfirmingDelete ? (
          <div className="flex flex-col gap-1.5 w-full xs:w-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-rose-700 font-semibold">Delete draft?</span>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                aria-busy={isDeleting}
                className="text-xs min-h-[44px] px-3.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors cursor-pointer touch-target flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span>Deleting…</span>
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
              <button
                type="button"
                onClick={() => { setIsConfirmingDelete(false); setDeleteError(null); }}
                disabled={isDeleting}
                className="text-xs min-h-[44px] px-3 text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-xl transition-colors cursor-pointer touch-target flex items-center justify-center"
              >
                Cancel
              </button>
            </div>
            {deleteError && (
              <p className="text-[11px] text-rose-700 font-medium" role="alert">{deleteError}</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setIsConfirmingDelete(true); setDeleteError(null); }}
            className="text-xs min-h-[44px] px-3.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-semibold rounded-xl transition-colors cursor-pointer touch-target flex items-center justify-center"
          >
            Delete
          </button>
        )}

        <button
          type="button"
          onClick={() => onResume(draft.id || draft.uuid)}
          className="text-xs min-h-[44px] px-4 font-semibold shadow-xs bg-[hsl(210,80%,45%)] hover:bg-[hsl(210,80%,40%)] text-white rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer touch-target ml-auto"
        >
          <span>Resume Intake</span>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
