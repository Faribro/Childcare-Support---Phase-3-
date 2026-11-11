'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  FileText,
  FileWarning,
  Clock,
  Landmark,
  ChevronRight,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { DASHBOARD_COPY } from '@/lib/constants/dashboardCopy';

export interface NeedsAttentionPanelProps {
  localDraftsCount?: number;
  outboxAttentionCount?: number;
  submittedMissingDocsCount?: number;
  approvedBankPendingCount?: number;
  serverScopeLabel?: string;
  isServerLoading?: boolean;
  className?: string;
}

export function NeedsAttentionPanel({
  localDraftsCount = 0,
  outboxAttentionCount = 0,
  submittedMissingDocsCount = 0,
  approvedBankPendingCount = 0,
  serverScopeLabel = 'Authorized scope',
  isServerLoading = false,
  className = '',
}: NeedsAttentionPanelProps) {
  const pendingsTotal = outboxAttentionCount + approvedBankPendingCount;
  const totalActionable = localDraftsCount + submittedMissingDocsCount + pendingsTotal;

  // Expandable panel state for Pendings card
  const [isPendingsExpanded, setIsPendingsExpanded] = useState(true);

  const badgeText =
    totalActionable === 0
      ? DASHBOARD_COPY.badgeZero
      : totalActionable === 1
        ? DASHBOARD_COPY.badgeSingular
        : DASHBOARD_COPY.badgePlural(totalActionable);

  return (
    <section
      aria-labelledby="needs-attention-heading"
      className={`bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-5 transition-shadow hover:shadow-sm ${className}`}
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 flex items-center justify-center shrink-0 shadow-2xs">
            <AlertTriangle className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
          </div>
          <div>
            <h3 id="needs-attention-heading" className="text-base font-bold text-slate-900 tracking-tight">
              {DASHBOARD_COPY.sectionHeading}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {DASHBOARD_COPY.sectionSubtitle}
            </p>
          </div>
        </div>
        <div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              totalActionable === 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {totalActionable === 0 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" aria-hidden="true" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
            )}
            <span>{badgeText}</span>
          </span>
        </div>
      </div>

      {/* 3-Card Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Forms to finish */}
        <Link
          href={DASHBOARD_COPY.cards.formsToFinish.href}
          className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-3xl"
        >
          <div className="h-full p-5 rounded-3xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 transition-all duration-200 flex flex-col justify-between space-y-4 min-h-[160px] cursor-pointer">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-200/80 text-slate-700 flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                  <span>{DASHBOARD_COPY.cards.formsToFinish.title}</span>
                </span>
                {localDraftsCount === 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>{DASHBOARD_COPY.allClear}</span>
                  </span>
                )}
              </div>

              <div className="text-3xl font-extrabold text-slate-900 tracking-tight pt-1">
                {localDraftsCount}
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                {localDraftsCount === 0
                  ? DASHBOARD_COPY.cards.formsToFinish.allClearText
                  : DASHBOARD_COPY.cards.formsToFinish.description}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-teal-800 group-hover:text-teal-950 min-h-[44px]">
              <span>{DASHBOARD_COPY.cards.formsToFinish.linkText}</span>
              <ChevronRight className="w-4 h-4 transform group-hover:translate-x-0.5 motion-reduce:transform-none transition-transform" />
            </div>
          </div>
        </Link>

        {/* Card 2: Missing documents */}
        <Link
          href={DASHBOARD_COPY.cards.missingDocs.href}
          className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-600 rounded-3xl"
        >
          <div className="h-full p-5 rounded-3xl border border-rose-200/80 bg-rose-50/40 hover:bg-rose-50/70 hover:border-rose-300 hover:shadow-xs hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 transition-all duration-200 flex flex-col justify-between space-y-4 min-h-[160px] cursor-pointer">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <FileWarning className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                  <span>{DASHBOARD_COPY.cards.missingDocs.title}</span>
                </span>
                {!isServerLoading && submittedMissingDocsCount === 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>{DASHBOARD_COPY.allClear}</span>
                  </span>
                )}
              </div>

              <div className="text-3xl font-extrabold text-rose-950 tracking-tight pt-1">
                {isServerLoading ? (
                  <span className="inline-block w-12 h-8 bg-rose-200/60 animate-pulse rounded-lg" />
                ) : (
                  submittedMissingDocsCount
                )}
              </div>

              <p className="text-xs text-rose-800/80 leading-relaxed">
                {!isServerLoading && submittedMissingDocsCount === 0
                  ? DASHBOARD_COPY.cards.missingDocs.allClearText
                  : DASHBOARD_COPY.cards.missingDocs.description}
              </p>
            </div>

            <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between text-xs font-bold text-rose-900 group-hover:text-rose-950 min-h-[44px]">
              <span>{DASHBOARD_COPY.cards.missingDocs.linkText}</span>
              <ChevronRight className="w-4 h-4 transform group-hover:translate-x-0.5 motion-reduce:transform-none transition-transform" />
            </div>
          </div>
        </Link>

        {/* Card 3: Pendings (Combined Waiting to Send + Bank Details) */}
        <div className="p-5 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-yellow-50/40 hover:from-amber-50/80 hover:to-yellow-50/60 hover:border-amber-300 hover:shadow-xs transition-all duration-200 flex flex-col justify-between space-y-4 min-h-[160px]">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <span>{DASHBOARD_COPY.cards.pendings.title}</span>
              </span>
              {pendingsTotal === 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{DASHBOARD_COPY.allClear}</span>
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="text-3xl font-extrabold text-amber-950 tracking-tight">
                {isServerLoading ? (
                  <span className="inline-block w-12 h-8 bg-amber-200/60 animate-pulse rounded-lg" />
                ) : (
                  pendingsTotal
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsPendingsExpanded(!isPendingsExpanded)}
                className="text-xs font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-1 p-1 rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600 min-h-[44px]"
                aria-expanded={isPendingsExpanded}
                aria-label={isPendingsExpanded ? 'Collapse pending details' : 'Expand pending details'}
              >
                <span>{isPendingsExpanded ? 'Hide breakdown' : 'Show breakdown'}</span>
                {isPendingsExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 transform rotate-180 transition-transform" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 transition-transform" />
                )}
              </button>
            </div>

            <p className="text-xs text-amber-900/80 leading-relaxed">
              {pendingsTotal === 0
                ? DASHBOARD_COPY.cards.pendings.allClearText
                : DASHBOARD_COPY.cards.pendings.description}
            </p>
          </div>

          {/* Breakdown Rows (Inline / Expandable) */}
          {isPendingsExpanded && (
            <div className="space-y-2 pt-2 border-t border-amber-200/70 animate-in fade-in duration-150">
              {/* Row 1: Waiting to send */}
              <Link
                href={DASHBOARD_COPY.cards.pendings.rows.waitingToSend.href}
                className="group flex items-center justify-between p-2.5 rounded-xl bg-white/70 hover:bg-white border border-amber-200/80 hover:border-amber-300 transition-colors min-h-[44px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-950 truncate">
                      {DASHBOARD_COPY.cards.pendings.rows.waitingToSend.label}
                    </p>
                    <p className="text-[10px] text-amber-800/80 truncate">
                      {DASHBOARD_COPY.cards.pendings.rows.waitingToSend.hint}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 min-w-[24px] text-center">
                    {outboxAttentionCount}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-700 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>

              {/* Row 2: Bank details needed */}
              <Link
                href={DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.href}
                className="group flex items-center justify-between p-2.5 rounded-xl bg-white/70 hover:bg-white border border-amber-200/80 hover:border-amber-300 transition-colors min-h-[44px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Landmark className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-950 truncate">
                      {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label}
                    </p>
                    <p className="text-[10px] text-amber-800/80 truncate">
                      {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.hint}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 min-w-[24px] text-center">
                    {isServerLoading ? (
                      <span className="inline-block w-4 h-3 bg-amber-200 animate-pulse rounded" />
                    ) : (
                      approvedBankPendingCount
                    )}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-700 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
