'use client';

import * as React from 'react';
import type { AssessmentRecord } from '@/types/domain';

export interface DraftCardProps {
  draft: AssessmentRecord;
  onResume: (id: string | number) => void;
  onDelete: (id: number) => void;
}

export function DraftCard({ draft, onResume, onDelete }: DraftCardProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);

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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-rose-700 font-semibold">Delete draft?</span>
            <button
              type="button"
              onClick={() => draft.id && onDelete(draft.id)}
              className="text-xs min-h-[44px] px-3.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-colors cursor-pointer touch-target flex items-center justify-center shadow-xs"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="text-xs min-h-[44px] px-3 text-slate-600 border border-slate-200 hover:bg-slate-100 font-semibold rounded-xl transition-colors cursor-pointer touch-target flex items-center justify-center"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirmingDelete(true)}
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
