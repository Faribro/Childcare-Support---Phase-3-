'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FileText,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  FileWarning,
  Landmark,
  Clock,
} from 'lucide-react';
import type { AssessmentRecord } from '@/types/domain';
import { MiniatureGardenPlayground } from '@/components/garden/MiniatureGardenPlayground';
import { DASHBOARD_COPY } from '@/lib/constants/dashboardCopy';
import { ThreeStatusOrb } from '@/components/dashboard/ThreeStatusOrb';

interface MobileKoboHomeScreenProps {
  drafts?: AssessmentRecord[];
  draftsCount?: number;
  waitingCount?: number;
  submittedCount: number | null;
  submittedMissingDocsCount?: number;
  approvedBankPendingCount?: number;
  serverScopeLabel?: string;
  isLoading?: boolean;
  isDraftsLoading?: boolean;
  isWaitingLoading?: boolean;
  isSubmittedLoading?: boolean;
  submittedStatus?: 'loading' | 'success' | 'offline' | 'error';
  onRetrySubmitted?: () => void;
  onDeleteDraft?: (id: number) => Promise<void>;
  onResumeDraft?: (id: string | number) => void;
  onStartSurvey?: (e: React.MouseEvent) => void;
}

export function MobileKoboHomeScreen({
  drafts,
  draftsCount,
  waitingCount = 0,
  submittedCount,
  submittedMissingDocsCount = 0,
  approvedBankPendingCount = 0,
  serverScopeLabel = 'Authorized scope',
  isLoading = false,
  isDraftsLoading,
  isWaitingLoading,
  isSubmittedLoading,
  submittedStatus = 'success',
  onRetrySubmitted,
  onStartSurvey,
}: MobileKoboHomeScreenProps) {
  const draftsLoading = isDraftsLoading ?? isLoading;
  const submittedLoading = isSubmittedLoading ?? isLoading;
  const count = draftsCount ?? drafts?.length ?? 0;

  // Pendings consolidates Missing Documents + Bank Details Needed per user correction
  const pendingsTotal = submittedMissingDocsCount + approvedBankPendingCount;
  const [isPendingsExpanded, setIsPendingsExpanded] = useState(true);

  const handleOfflineNav = (e: React.MouseEvent, url: string) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      e.preventDefault();
      window.location.assign(url);
    }
  };

  const handleStartSurvey = (e: React.MouseEvent) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      e.preventDefault();
      window.location.assign('/assessment/new');
      return;
    }
    if (onStartSurvey) {
      onStartSurvey(e);
    }
  };

  return (
    <div className="md:hidden w-full max-w-md mx-auto px-4 py-3 sm:py-4 space-y-3 animate-in fade-in duration-150">
      {/* Action 1: Start New Survey (Prominent Full-Width Primary Touch Action, >=56px) */}
      <Link
        href="/assessment/new"
        prefetch={true}
        className="block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-2xl"
        onClick={handleStartSurvey}
      >
        <button
          type="button"
          onClick={handleStartSurvey}
          className="w-full min-h-[56px] bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 active:scale-[0.99] text-white rounded-2xl p-4 shadow-sm border border-teal-800 flex items-center justify-between transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Plus className="w-6 h-6 text-white stroke-[2.5]" aria-hidden="true" />
            </div>
            <div className="text-left">
              <h3 className="text-base font-bold leading-tight text-white">{DASHBOARD_COPY.mobile.startSurveyTitle}</h3>
              <p className="text-xs text-teal-50/90 font-medium">
                {DASHBOARD_COPY.mobile.startSurveySubtitle}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80 shrink-0" aria-hidden="true" />
        </button>
      </Link>

      {/* Awwwards 3D Circular Status Dial Trio (Forms to finish, Missing Docs, Pendings) */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-3 shadow-2xs space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {DASHBOARD_COPY.sectionHeading}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              pendingsTotal + count + submittedMissingDocsCount === 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {pendingsTotal + count + submittedMissingDocsCount === 0
              ? DASHBOARD_COPY.badgeZero
              : `${pendingsTotal + count + submittedMissingDocsCount} Actionable`}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Circular Dial 1: Forms to finish */}
          <Link
            href="/assessment/drafts"
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-teal-50/50 to-white border border-teal-100 hover:border-teal-300 transition-all active:scale-95 cursor-pointer"
            aria-label="View drafts"
            onClick={(e) => handleOfflineNav(e, '/assessment/drafts')}
          >
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-teal-400/20 blur-xs" />
              <div className="absolute inset-0 rounded-full bg-white/70 backdrop-blur-sm border border-teal-200/60 overflow-hidden flex items-center justify-center">
                <ThreeStatusOrb
                  variant="teal"
                  count={count}
                  isAllClear={count === 0}
                  className="w-full h-full absolute inset-0"
                />
                <span className="relative z-10 text-lg font-black text-slate-900 tracking-tight">
                  {draftsLoading ? (
                    <span className="inline-block w-4 h-4 bg-slate-300 animate-pulse rounded-full" />
                  ) : (
                    count
                  )}
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-teal-800 mt-1.5 text-center truncate w-full">
              Forms
            </span>
          </Link>

          {/* Circular Dial 2: Missing Docs */}
          <Link
            href="/supervisor/assessments"
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-rose-50/50 to-white border border-rose-100 hover:border-rose-300 transition-all active:scale-95 cursor-pointer"
            aria-label="View missing documents"
          >
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-rose-400/20 blur-xs" />
              <div className="absolute inset-0 rounded-full bg-white/70 backdrop-blur-sm border border-rose-200/60 overflow-hidden flex items-center justify-center">
                <ThreeStatusOrb
                  variant="rose"
                  count={submittedMissingDocsCount}
                  isAllClear={submittedMissingDocsCount === 0}
                  className="w-full h-full absolute inset-0"
                />
                <span className="relative z-10 text-lg font-black text-rose-950 tracking-tight">
                  {submittedLoading ? (
                    <span className="inline-block w-4 h-4 bg-rose-200 animate-pulse rounded-full" />
                  ) : (
                    submittedMissingDocsCount
                  )}
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-rose-800 mt-1.5 text-center truncate w-full">
              Docs
            </span>
          </Link>

          {/* Circular Dial 3: Pendings */}
          <Link
            href="/assessment/sync?tab=outbox"
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-amber-50/50 to-white border border-amber-100 hover:border-amber-300 transition-all active:scale-95 cursor-pointer"
            aria-label="View pendings"
          >
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-xs" />
              <div className="absolute inset-0 rounded-full bg-white/70 backdrop-blur-sm border border-amber-200/60 overflow-hidden flex items-center justify-center">
                <ThreeStatusOrb
                  variant="amber"
                  count={pendingsTotal}
                  isAllClear={pendingsTotal === 0}
                  className="w-full h-full absolute inset-0"
                />
                <span className="relative z-10 text-lg font-black text-amber-950 tracking-tight">
                  {submittedLoading ? (
                    <span className="inline-block w-4 h-4 bg-amber-200 animate-pulse rounded-full" />
                  ) : (
                    pendingsTotal
                  )}
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-amber-800 mt-1.5 text-center truncate w-full">
              Pendings
            </span>
          </Link>
        </div>
      </div>

      {/* Navigation Menu List: Unified styling across Drafts, Missing Documents, Pendings, and Submitted Surveys */}
      <div className="space-y-2.5" role="list">
        {/* Menu Item 1: Drafts (Forms to finish) */}
        <div role="listitem">
          <Link
            href="/assessment/drafts"
            prefetch={true}
            className="block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-2xl"
            onClick={(e) => handleOfflineNav(e, '/assessment/drafts')}
          >
            <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{DASHBOARD_COPY.mobile.draftsTitle}</h4>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]">
                      {draftsLoading ? (
                        <span
                          className="inline-block w-3.5 h-2.5 bg-slate-300 animate-pulse rounded"
                          role="status"
                          aria-label="Loading draft count"
                        />
                      ) : (
                        count
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{DASHBOARD_COPY.mobile.draftsSubtitle}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" aria-hidden="true" />
            </div>
          </Link>
        </div>

        {/* Menu Item 2: Pendings (Consolidates Missing Documents + Bank Details Needed) */}
        <div role="listitem">
          <div className="w-full bg-white border border-amber-200 hover:border-amber-300 rounded-[24px] p-3.5 shadow-2xs transition-colors">
            {/* Header / Trigger */}
            <div
              onClick={() => setIsPendingsExpanded(!isPendingsExpanded)}
              className="flex items-center justify-between min-h-[44px] cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsPendingsExpanded(!isPendingsExpanded);
                }
              }}
              aria-expanded={isPendingsExpanded}
              aria-label="Toggle Pendings menu"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{DASHBOARD_COPY.mobile.pendingsTitle}</h4>
                    <span
                      data-testid="mobile-pendings-badge"
                      className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]"
                    >
                      {submittedLoading ? (
                        <span
                          className="inline-block w-3.5 h-2.5 bg-amber-300 animate-pulse rounded"
                          role="status"
                          aria-label="Loading pendings count"
                        />
                      ) : (
                        pendingsTotal
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{DASHBOARD_COPY.cards.pendings.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {isPendingsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-amber-700 transform rotate-180 transition-transform" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-amber-700 transition-transform" />
                )}
              </div>
            </div>

            {/* Sub-lists: Encircled Concentric Pill Rows (Missing Documents + Bank Details Needed) */}
            {isPendingsExpanded && (
              <div className="mt-3 pt-3 border-t border-amber-100 flex flex-col gap-2 animate-in fade-in duration-150">
                {/* Row 1: Missing Documents (Replaces waiting to send inside Pendings) */}
                <Link
                  href="/supervisor/assessments"
                  className="group relative flex min-h-[52px] items-center justify-between rounded-full border border-rose-200/80 bg-gradient-to-r from-rose-50/70 via-white/95 to-amber-50/50 p-1.5 pr-3 shadow-[0_2px_8px_-2px_rgba(244,63,94,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 hover:border-rose-300 hover:bg-white active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-gradient-to-br from-rose-100 to-amber-50 text-rose-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform duration-300 group-hover:scale-105">
                      <FileWarning className="h-4 w-4 text-rose-600 transition-transform duration-300 group-hover:rotate-[-4deg]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-bold tracking-tight text-slate-900 group-hover:text-black">
                        {DASHBOARD_COPY.cards.missingDocs.title}
                      </p>
                      <p className="truncate text-[10.5px] font-medium text-slate-500">
                        {DASHBOARD_COPY.cards.missingDocs.description}
                      </p>
                    </div>
                  </div>

                  <div className="ml-2 flex shrink-0 items-center gap-1.5">
                    <span
                      data-testid="sublist-missing-docs-count"
                      aria-live="polite"
                      className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full border border-rose-200 bg-rose-100/90 px-2 font-mono text-xs font-bold tabular-nums text-rose-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                    >
                      {submittedLoading ? (
                        <span className="inline-block w-3 h-2 bg-rose-200 animate-pulse rounded" role="status" aria-label="Loading missing docs count" />
                      ) : (
                        submittedMissingDocsCount
                      )}
                    </span>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100/0 transition-colors duration-300 group-hover:bg-rose-100/60">
                      <ChevronRight className="h-3.5 w-3.5 text-rose-600 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>

                {/* Row 2: Bank details needed */}
                <Link
                  href="/assessment/sync?tab=bank_pending"
                  className="group relative flex min-h-[52px] items-center justify-between rounded-full border border-amber-200/80 bg-gradient-to-r from-amber-50/80 via-white/95 to-amber-50/50 p-1.5 pr-3 shadow-[0_2px_8px_-2px_rgba(217,119,6,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 hover:border-amber-300 hover:bg-white active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform duration-300 group-hover:scale-105">
                      <Landmark className="h-4 w-4 text-amber-700 transition-transform duration-300 group-hover:rotate-[-4deg]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-bold tracking-tight text-slate-900 group-hover:text-black">
                        {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label}
                      </p>
                      <p className="truncate text-[10.5px] font-medium text-amber-800/80">
                        {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.hint}
                      </p>
                    </div>
                  </div>

                  <div className="ml-2 flex shrink-0 items-center gap-1.5">
                    <span
                      data-testid="sublist-bank-details-count"
                      aria-live="polite"
                      className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full border border-amber-300 bg-amber-100/90 px-2 font-mono text-xs font-bold tabular-nums text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                    >
                      {submittedLoading ? (
                        <span className="inline-block w-3 h-2 bg-amber-200 animate-pulse rounded" role="status" aria-label="Loading bank count" />
                      ) : (
                        approvedBankPendingCount
                      )}
                    </span>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100/0 transition-colors duration-300 group-hover:bg-amber-100/60">
                      <ChevronRight className="h-3.5 w-3.5 text-amber-700 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Menu Item 3: Submitted Surveys */}
        <div role="listitem">
          <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors">
            <Link
              href="/assessment/sync?tab=synced"
              className="flex items-center gap-3 min-w-0 flex-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-xl"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">{DASHBOARD_COPY.mobile.submittedTitle}</h4>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]">
                    {submittedLoading ? (
                      <span
                        className="inline-block w-3.5 h-2.5 bg-emerald-300 animate-pulse rounded"
                        role="status"
                        aria-label="Loading submitted count"
                      />
                    ) : (
                      submittedCount ?? 0
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {submittedStatus === 'offline'
                    ? 'Showing locally confirmed (offline)'
                    : submittedStatus === 'error'
                      ? 'Server unreachable (tap Retry)'
                      : submittedLoading
                        ? 'Checking server...'
                        : 'Confirmed on central server'}
                </p>
              </div>
            </Link>

            {submittedStatus === 'error' && onRetrySubmitted ? (
              <button
                type="button"
                onClick={onRetrySubmitted}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors shrink-0 ml-2 cursor-pointer min-h-[44px]"
                aria-label="Retry loading submitted count"
              >
                Retry
              </button>
            ) : (
              <Link href="/assessment/sync?tab=synced" className="shrink-0 ml-2 min-h-[44px] flex items-center">
                <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Decorative Animated Playground at Bottom */}
      <div className="pt-1">
        <MiniatureGardenPlayground />
      </div>
    </div>
  );
}
