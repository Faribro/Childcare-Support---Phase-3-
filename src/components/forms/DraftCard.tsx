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
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold select-none border bg-[hsl(215,20%,94%)] text-[hsl(220,15%,30%)] border-[hsl(215,18%,82%)]">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>Saved on this device</span>
          </span>
          <span className="text-[11px] text-[hsl(215,12%,50%)]">
            Last edited {new Date(draft.updatedAt).toLocaleDateString()} at{' '}
            {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div>
          <h4 className="text-sm font-bold text-[hsl(220,15%,15%)]">
            {draft.demographics?.childName || 'Draft Intake'} • <span className="font-mono text-teal-800">{draft.demographics?.artNumber || 'ID Pending'}</span>
          </h4>
          <p className="text-xs text-[hsl(215,12%,45%)] mt-0.5">
            Caregiver: {draft.demographics?.caregiverName || 'Not recorded'} • Step {draft.stepIndex || 1} of 6
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[hsl(215,20%,94%)]">
        {isConfirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[hsl(0,72%,48%)] font-semibold">Delete draft?</span>
            <button
              type="button"
              onClick={() => draft.id && onDelete(draft.id)}
              className="text-xs h-7 px-2.5 bg-[hsl(0,72%,48%)] hover:bg-[hsl(0,72%,42%)] text-white font-semibold rounded-md transition-colors cursor-pointer"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="text-xs h-7 px-2 text-slate-600 hover:bg-slate-100 font-semibold rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirmingDelete(true)}
            className="text-xs h-8 px-2.5 text-[hsl(0,72%,48%)] hover:bg-[hsl(0,75%,96%)] font-semibold rounded-md transition-colors cursor-pointer"
          >
            Delete
          </button>
        )}

        <button
          type="button"
          onClick={() => onResume(draft.id || draft.uuid)}
          className="text-xs h-8 px-4 font-semibold shadow-xs bg-[hsl(210,80%,45%)] hover:bg-[hsl(210,80%,40%)] text-white rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
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
