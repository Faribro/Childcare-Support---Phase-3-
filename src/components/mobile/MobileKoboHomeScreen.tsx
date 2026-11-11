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

  // Consistent with Web: Pendings is the exact sum of Waiting to send + Bank details needed
  const pendingsTotal = waitingCount + approvedBankPendingCount;
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

        {/* Menu Item 2: Missing Documents (Intake Docs Incomplete - Dedicated Mobile Item) */}
        <div role="listitem">
          <Link
            href="/supervisor/assessments"
            prefetch={true}
            className="block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-600 rounded-2xl"
          >
            <div className="w-full min-h-[52px] bg-white border border-rose-200 hover:border-rose-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-rose-50/40 active:bg-rose-50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
                  <FileWarning className="w-4 h-4 text-rose-600" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{DASHBOARD_COPY.cards.missingDocs.title}</h4>
                    <span
                      data-testid="mobile-missing-docs-badge"
                      className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]"
                    >
                      {submittedLoading ? (
                        <span
                          className="inline-block w-3.5 h-2.5 bg-rose-200 animate-pulse rounded"
                          role="status"
                          aria-label="Loading missing docs count"
                        />
                      ) : (
                        submittedMissingDocsCount
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{DASHBOARD_COPY.cards.missingDocs.description}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" aria-hidden="true" />
            </div>
          </Link>
        </div>

        {/* Menu Item 3: Pendings (Consistent with Web: Waiting to send + Bank details needed) */}
        <div role="listitem">
          <div className="w-full bg-white border border-amber-200 hover:border-amber-300 rounded-2xl p-3.5 shadow-2xs transition-colors">
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

            {/* Sub-lists: Waiting to send & Bank details needed */}
            {isPendingsExpanded && (
              <div className="mt-3 pt-3 border-t border-amber-100 space-y-2 animate-in fade-in duration-150">
                {/* Sub-item 1: Waiting to send */}
                <Link
                  href="/assessment/sync?tab=outbox"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/50 hover:bg-amber-50 border border-amber-200/60 transition-colors min-h-[44px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {DASHBOARD_COPY.cards.pendings.rows.waitingToSend.label}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {DASHBOARD_COPY.cards.pendings.rows.waitingToSend.hint}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span
                      data-testid="sublist-waiting-send-count"
                      className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 min-w-[24px] text-center"
                    >
                      {waitingCount}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </Link>

                {/* Sub-item 2: Bank details needed */}
                <Link
                  href="/assessment/sync?tab=bank_pending"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/50 hover:bg-amber-50 border border-amber-200/60 transition-colors min-h-[44px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Landmark className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.hint}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span
                      data-testid="sublist-bank-details-count"
                      className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 min-w-[24px] text-center"
                    >
                      {submittedLoading ? (
                        <span className="inline-block w-3.5 h-2.5 bg-amber-200 animate-pulse rounded" />
                      ) : (
                        approvedBankPendingCount
                      )}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Menu Item 4: Submitted Surveys */}
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
