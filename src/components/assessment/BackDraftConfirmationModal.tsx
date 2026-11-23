'use client';

import React, { useEffect } from 'react';
import { AlertCircle, X, Save, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface BackDraftConfirmationModalProps {
  isOpen: boolean;
  onSaveDraft: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
  onContinueEditing: () => void;
  isSaving?: boolean;
}

export function BackDraftConfirmationModal({
  isOpen,
  onSaveDraft,
  onDiscard,
  onContinueEditing,
  isSaving = false,
}: BackDraftConfirmationModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onContinueEditing();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onContinueEditing]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-confirm-title"
      aria-describedby="draft-confirm-body"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h2
                id="draft-confirm-title"
                className="text-base font-bold text-slate-900 leading-tight"
              >
                Save this survey as a draft?
              </h2>
              <p
                id="draft-confirm-body"
                className="text-xs text-slate-600 mt-0.5"
              >
                Your progress will be lost if you leave without saving.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onContinueEditing}
            className="touch-target-44 min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Actions per Phase D specification */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100 justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onContinueEditing}
            className="w-full sm:w-auto touch-target min-h-[44px] text-xs font-bold"
          >
            Continue editing
          </Button>

          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={onDiscard}
            className="w-full sm:w-auto touch-target min-h-[44px] text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1 text-rose-600" />
            Discard
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onSaveDraft}
            isLoading={isSaving}
            className="w-full sm:w-auto touch-target min-h-[44px] text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-xs"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save Draft
          </Button>
        </div>
      </div>
    </div>
  );
}
