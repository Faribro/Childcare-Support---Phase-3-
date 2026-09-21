'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  List,
  Save,
  Send,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { FormValidationError } from '@/lib/validations/formValidationRegistry';

export const FORM_SECTIONS = [
  { id: 'sec-consent', key: 'consent', number: '01', title: 'Caregiver Consent & Signature', shortTitle: 'Consent' },
  { id: 'sec-child', key: 'demographics', number: '02', title: 'Child Demographics & Residence', shortTitle: 'Demographics' },
  { id: 'sec-banking', key: 'banking', number: '03', title: 'Banking & KYC Documents', shortTitle: 'Banking' },
  { id: 'sec-household', key: 'household', number: '04', title: 'Household & Socio-Economic', shortTitle: 'Household' },
  { id: 'sec-health', key: 'health', number: '05', title: 'Clinical & ART Health Metrics', shortTitle: 'Health' },
  { id: 'sec-nutrition', key: 'nutrition', number: '06', title: 'Anthropometry & Nutrition', shortTitle: 'Nutrition' },
  { id: 'sec-education', key: 'education', number: '07', title: 'Education & Schooling', shortTitle: 'Education' },
  { id: 'sec-expenses', key: 'expenses', number: '08', title: 'Education Expenses & Aid', shortTitle: 'Expenses' },
  { id: 'sec-review', key: 'review', number: '09', title: 'Caseworker Verification & Submit', shortTitle: 'Finalize' },
] as const;

interface MobileFormSectionRunnerProps {
  activeSectionIndex: number;
  onSelectSection: (index: number) => void;
  onSaveDraft: () => Promise<void> | void;
  onSubmit: () => void;
  isSubmitting: boolean;
  errorsBySection: Record<string, FormValidationError[]>;
  artNumber?: string;
  hasSavedSignature?: boolean;
}

export function MobileFormSectionRunner({
  activeSectionIndex,
  onSelectSection,
  onSaveDraft,
  onSubmit,
  isSubmitting,
  errorsBySection,
  artNumber,
  hasSavedSignature,
}: MobileFormSectionRunnerProps) {
  const [isJumpModalOpen, setIsJumpModalOpen] = useState(false);
  const currentSection = FORM_SECTIONS[activeSectionIndex] || FORM_SECTIONS[0];
  const progressPercent = Math.round(((activeSectionIndex + 1) / FORM_SECTIONS.length) * 100);

  const handlePrev = () => {
    if (activeSectionIndex > 0) {
      onSelectSection(activeSectionIndex - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNext = () => {
    if (activeSectionIndex < FORM_SECTIONS.length - 1) {
      onSelectSection(activeSectionIndex + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpTo = (index: number) => {
    onSelectSection(index);
    setIsJumpModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* ── Fixed Sticky Top Section Tracker (Mobile Only: <768px) ────────────────── */}
      <div className="md:hidden sticky top-0 z-25 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="px-3.5 py-2 flex items-center justify-between gap-2">
          {/* Back to Home / Prev Indicator */}
          <Link
            href="/app"
            className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 py-1 px-1.5 rounded-lg -ml-1.5"
            aria-label="Back to home"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
            <span className="hidden xs:inline">Home</span>
          </Link>

          {/* Section Indicator & Title Pill */}
          <div className="flex-1 min-w-0 text-center px-1">
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md">
                Sec {activeSectionIndex + 1}/9
              </span>
              <span className="text-xs font-bold text-slate-900 truncate">
                {currentSection.shortTitle}
              </span>
            </div>
          </div>

          {/* Right Action Icons: Jump Drawer & Save Draft */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsJumpModalOpen(true)}
              aria-label="Jump to section"
              className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded-lg flex items-center gap-1 text-xs font-medium cursor-pointer"
            >
              <List className="w-4 h-4 text-slate-600" />
              <span className="hidden xs:inline text-[11px]">Sections</span>
            </button>

            <button
              type="button"
              onClick={onSaveDraft}
              aria-label="Save draft"
              className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded-lg flex items-center gap-1 text-xs font-medium cursor-pointer"
            >
              <Save className="w-4 h-4 text-teal-600" />
              <span className="hidden xs:inline text-[11px]">Save</span>
            </button>
          </div>
        </div>

        {/* Progress Bar (% of 9 sections) */}
        <div className="w-full h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-teal-600 to-emerald-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ── Fixed Sticky Bottom Navigation Footer (Mobile Only: <768px) ─────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-35 bg-white/98 backdrop-blur-md border-t border-slate-200 shadow-md px-3 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]">
        <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
          {/* Previous Button */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={activeSectionIndex === 0}
            className={`min-h-[48px] px-3.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer ${
              activeSectionIndex === 0
                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>

          {/* Center Jump Button */}
          <button
            type="button"
            onClick={() => setIsJumpModalOpen(true)}
            className="min-h-[48px] px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <List className="w-4 h-4 text-slate-500" />
            <span className="tabular-nums font-mono text-[11px] text-teal-800 font-bold">
              {activeSectionIndex + 1}/9
            </span>
          </button>

          {/* Next / Submit Button */}
          {activeSectionIndex < FORM_SECTIONS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="min-h-[48px] flex-1 max-w-[200px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer"
            >
              <span className="truncate">Next: {FORM_SECTIONS[activeSectionIndex + 1]?.shortTitle}</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              id="btn-submit-survey-mobile"
              className="min-h-[48px] flex-1 max-w-[220px] px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:from-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Submitting...' : 'Finalize & Submit'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Accessible Section Jumper Modal Drawer ─────────────────────────────────── */}
      {isJumpModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="jump-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end justify-center animate-in fade-in duration-150"
          onClick={() => setIsJumpModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl border-t border-slate-200 shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 id="jump-modal-title" className="text-base font-bold text-slate-900">
                  Jump to Section
                </h3>
                <p className="text-xs text-slate-500">
                  Select a section to review or complete
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsJumpModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                aria-label="Close sections list"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section Item List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {FORM_SECTIONS.map((sec, idx) => {
                const isCurrent = idx === activeSectionIndex;
                const sectionErrors = errorsBySection[sec.key] || [];
                const hasErrors = sectionErrors.length > 0;

                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleJumpTo(idx)}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-colors cursor-pointer min-h-[48px] ${
                      isCurrent
                        ? 'bg-teal-50/80 border-teal-300 ring-1 ring-teal-200 text-teal-950 font-bold'
                        : hasErrors
                        ? 'bg-rose-50/50 border-rose-200 text-rose-900 hover:bg-rose-50'
                        : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
                          isCurrent
                            ? 'bg-teal-600 text-white'
                            : hasErrors
                            ? 'bg-rose-200 text-rose-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {sec.number}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs truncate">{sec.title}</p>
                        {isCurrent && (
                          <p className="text-[10px] text-teal-700 font-semibold">
                            Currently Viewing
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {hasErrors ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          {sectionErrors.length} {sectionErrors.length === 1 ? 'issue' : 'issues'}
                        </span>
                      ) : idx < activeSectionIndex ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </span>
                      ) : null}
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick Jumper Footer */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleJumpTo(0)}
                className="min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                <span>Go to Start (Sec 1)</span>
              </button>

              <button
                type="button"
                onClick={() => handleJumpTo(FORM_SECTIONS.length - 1)}
                className="min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                <span>Go to End (Sec 9)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
