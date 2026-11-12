'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FileText,
  Clock,
  AlertTriangle,
  FileWarning,
  Landmark,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type { AssessmentRecord } from '@/types/domain';
import { MiniatureGardenPlayground } from '@/components/garden/MiniatureGardenPlayground';
import { DASHBOARD_COPY } from '@/lib/constants/dashboardCopy';

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
  isLoading = false,
  isDraftsLoading,
  isWaitingLoading,
  isSubmittedLoading,
  submittedStatus = 'success',
  onRetrySubmitted,
  onStartSurvey,
}: MobileKoboHomeScreenProps) {
  const draftsLoading = isDraftsLoading ?? isLoading;
  const waitingLoading = isWaitingLoading ?? isLoading;
  const submittedLoading = isSubmittedLoading ?? isLoading;
  const count = draftsCount ?? drafts?.length ?? 0;

  // Pendings consolidates Missing Documents + Bank Details Needed per user addendum
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
      {/* ── Row 1: Start New Survey (Prominent Full-Width Primary Action, >=56px touch target) ── */}
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
              <h3 className="text-base font-bold leading-tight text-white">
                {DASHBOARD_COPY.mobile.startSurveyTitle}
              </h3>
              <p className="text-xs text-teal-50/90 font-medium">
                {DASHBOARD_COPY.mobile.startSurveySubtitle}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80 shrink-0" aria-hidden="true" />
        </button>
      </Link>

      {/* ── Unified Menu List (Full width rows with left icon, count pill, subtitle, chevron) ── */}
      <div className="space-y-2.5" role="list">

        {/* ── Menu Item 2: Drafts ── */}
        <div role="listitem">
          <Link
            href="/assessment/drafts"
            prefetch={true}
            className="block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-2xl"
            onClick={(e) => handleOfflineNav(e, '/assessment/drafts')}
          >
            <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">
                      {DASHBOARD_COPY.mobile.draftsTitle}
                    </h4>
                    <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]">
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
                  <p className="text-[11px] text-slate-500 truncate">
                    {DASHBOARD_COPY.mobile.draftsSubtitle}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" aria-hidden="true" />
            </div>
          </Link>
        </div>

        {/* ── Menu Item 3: Waiting to send (Offline outbox count) ── */}
        <div role="listitem">
          <Link
            href="/assessment/sync?tab=outbox"
            prefetch={true}
            className="block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600 rounded-2xl"
            onClick={(e) => handleOfflineNav(e, '/assessment/sync?tab=outbox')}
          >
            <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">
                      {DASHBOARD_COPY.mobile.waitingToSendTitle}
                    </h4>
                    <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]">
                      {waitingLoading ? (
                        <span
                          className="inline-block w-3.5 h-2.5 bg-amber-200 animate-pulse rounded"
                          role="status"
                          aria-label="Loading waiting count"
                        />
                      ) : (
                        waitingCount
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    {DASHBOARD_COPY.mobile.waitingToSendSubtitle}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" aria-hidden="true" />
            </div>
          </Link>
        </div>

        {/* ── Menu Item 4: Pendings (Combined count with expandable sub-rows) ── */}
        <div role="listitem">
          <div className="w-full bg-white border border-rose-200/90 rounded-2xl p-3.5 shadow-2xs transition-colors">
            {/* Header / Toggle row */}
            <button
              type="button"
              onClick={() => setIsPendingsExpanded(!isPendingsExpanded)}
              className="w-full flex items-center justify-between text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg min-h-[44px]"
              aria-expanded={isPendingsExpanded}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">
                      {DASHBOARD_COPY.mobile.pendingsTitle}
                    </h4>
                    <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]">
                      {submittedLoading ? (
                        <span
                          className="inline-block w-3.5 h-2.5 bg-rose-200 animate-pulse rounded"
                          role="status"
                          aria-label="Loading pendings count"
                        />
                      ) : (
                        pendingsTotal
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    {DASHBOARD_COPY.mobile.pendingsSubtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className="text-[10px] font-bold text-rose-700">
                  {isPendingsExpanded ? DASHBOARD_COPY.mobile.hideBreakdown : DASHBOARD_COPY.mobile.showBreakdown}
                </span>
                {isPendingsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-rose-600" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-rose-600" aria-hidden="true" />
                )}
              </div>
            </button>

            {/* Expandable sub-rows */}
            {isPendingsExpanded && (
              <div className="mt-3 pt-3 border-t border-rose-100 space-y-2">
                {/* Sub-row A: Missing documents */}
                <Link
                  href={DASHBOARD_COPY.cards.pendings.rows.missingDocs.href}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/50 hover:bg-rose-100/70 border border-rose-200/60 transition-colors min-h-[44px] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                      <FileWarning className="w-3.5 h-3.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {DASHBOARD_COPY.mobile.missingDocsTitle}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {DASHBOARD_COPY.mobile.missingDocsSubtitle}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-white text-rose-900 border border-rose-200 min-w-[24px] text-center">
                      {submittedLoading ? (
                        <span className="inline-block w-3 h-2 bg-rose-200 animate-pulse rounded" />
                      ) : (
                        submittedMissingDocsCount
                      )}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                  </div>
                </Link>

                {/* Sub-row B: Bank details needed */}
                <Link
                  href={DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.href}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/50 hover:bg-rose-100/70 border border-rose-200/60 transition-colors min-h-[44px] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                      <Landmark className="w-3.5 h-3.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {DASHBOARD_COPY.mobile.bankDetailsTitle}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {DASHBOARD_COPY.mobile.bankDetailsSubtitle}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-white text-rose-900 border border-rose-200 min-w-[24px] text-center">
                      {submittedLoading ? (
                        <span className="inline-block w-3 h-2 bg-rose-200 animate-pulse rounded" />
                      ) : (
                        approvedBankPendingCount
                      )}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Menu Item 5: Submitted surveys ── */}
        <div role="listitem">
          <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors">
            <Link
              href="/assessment/sync?tab=synced"
              className="flex items-center gap-3 min-w-0 flex-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-lg min-h-[44px]"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    {DASHBOARD_COPY.mobile.submittedTitle}
                  </h4>
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]">
                    {submittedLoading ? (
                      <span
                        className="inline-block w-3.5 h-2.5 bg-emerald-300 animate-pulse rounded"
                        role="status"
                        aria-label="Loading submitted count"
                      />
                    ) : (
                      (submittedCount ?? 0)
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
                        : DASHBOARD_COPY.mobile.submittedSubtitle}
                </p>
              </div>
            </Link>

            {submittedStatus === 'error' && onRetrySubmitted ? (
              <button
                type="button"
                onClick={onRetrySubmitted}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors shrink-0 ml-2 cursor-pointer"
                aria-label="Retry loading submitted count"
              >
                Retry
              </button>
            ) : (
              <Link href="/assessment/sync?tab=synced" className="shrink-0 ml-2">
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
