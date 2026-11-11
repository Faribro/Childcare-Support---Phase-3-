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
import { ThreeStatusOrb } from './ThreeStatusOrb';

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
  // Pendings consolidates Missing Documents + Bank Details Needed per user instruction
  const pendingsTotal = submittedMissingDocsCount + approvedBankPendingCount;
  const totalActionable = localDraftsCount + submittedMissingDocsCount + pendingsTotal;

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
      className={`bg-white/95 backdrop-blur-xl rounded-[36px] border border-slate-200/90 p-6 sm:p-8 shadow-xs space-y-6 transition-all duration-300 hover:shadow-md ${className}`}
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-100 to-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0 shadow-xs">
            <AlertTriangle className="w-5 h-5 stroke-[2.2]" aria-hidden="true" />
          </div>
          <div>
            <h3 id="needs-attention-heading" className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {DASHBOARD_COPY.sectionHeading}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              {DASHBOARD_COPY.sectionSubtitle}
            </p>
          </div>
        </div>
        <div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-full border shadow-2xs transition-all ${
              totalActionable === 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {totalActionable === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 stroke-[2.5]" aria-hidden="true" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
            )}
            <span>{badgeText}</span>
          </span>
        </div>
      </div>

      {/* 3 True Completely Rounded Cards (Vertical rounded rectangles rounded-[32px] matching design specs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
        {/* Card 1: Forms to finish */}
        <Link
          href={DASHBOARD_COPY.cards.formsToFinish.href}
          className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-[32px] h-full"
        >
          <div className="relative h-full rounded-[32px] border border-teal-100/90 bg-gradient-to-b from-teal-50/40 via-white to-slate-50/40 p-6 shadow-sm hover:shadow-lg hover:border-teal-300 hover:-translate-y-1 motion-reduce:hover:translate-y-0 transition-all duration-300 flex flex-col items-center justify-between text-center overflow-hidden min-h-[340px]">
            {/* Top Completely Rounded Pill Header */}
            <div className="w-full flex items-center justify-between z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100/90 text-teal-800 border border-teal-200 text-xs font-bold uppercase tracking-wider shadow-2xs">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{DASHBOARD_COPY.cards.formsToFinish.title}</span>
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                localDraftsCount === 0
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-amber-800 bg-amber-50 border-amber-200'
              }`}>
                {localDraftsCount === 0 && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                <span>{localDraftsCount === 0 ? DASHBOARD_COPY.badgeZero : `${localDraftsCount} active`}</span>
              </span>
            </div>

            {/* Center 3D WebGL Aura / Orb */}
            <div className="relative z-10 flex flex-col items-center justify-center my-3">
              <ThreeStatusOrb
                variant="teal"
                count={localDraftsCount}
                isAllClear={localDraftsCount === 0}
              />
            </div>

            {/* Description */}
            <div className="relative z-10 space-y-1 mb-3">
              <p className="text-xs font-semibold text-slate-500 max-w-[200px] leading-tight mx-auto">
                {localDraftsCount === 0
                  ? DASHBOARD_COPY.cards.formsToFinish.allClearText
                  : DASHBOARD_COPY.cards.formsToFinish.description}
              </p>
            </div>

            {/* Bottom Completely Rounded Action Pill */}
            <div className="relative z-10 w-full flex justify-center mt-auto">
              <span className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold text-teal-700 bg-teal-50 group-hover:bg-teal-100/80 border border-teal-200 shadow-2xs transition-all">
                <span>{DASHBOARD_COPY.cards.formsToFinish.linkText}</span>
                <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </div>
        </Link>

        {/* Card 2: Missing documents */}
        <Link
          href={DASHBOARD_COPY.cards.missingDocs.href}
          className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-600 rounded-[32px] h-full"
        >
          <div className="relative h-full rounded-[32px] border border-rose-100/90 bg-gradient-to-b from-rose-50/40 via-white to-slate-50/40 p-6 shadow-sm hover:shadow-lg hover:border-rose-300 hover:-translate-y-1 motion-reduce:hover:translate-y-0 transition-all duration-300 flex flex-col items-center justify-between text-center overflow-hidden min-h-[340px]">
            {/* Top Completely Rounded Pill Header */}
            <div className="w-full flex items-center justify-between z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100/90 text-rose-800 border border-rose-200 text-xs font-bold uppercase tracking-wider shadow-2xs">
                <FileWarning className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
                <span>{DASHBOARD_COPY.cards.missingDocs.title}</span>
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                submittedMissingDocsCount === 0
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-rose-800 bg-rose-50 border-rose-200'
              }`}>
                {submittedMissingDocsCount === 0 && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                <span>{submittedMissingDocsCount === 0 ? DASHBOARD_COPY.badgeZero : `${submittedMissingDocsCount} pending`}</span>
              </span>
            </div>

            {/* Center 3D WebGL Aura / Orb */}
            <div className="relative z-10 flex flex-col items-center justify-center my-3">
              <ThreeStatusOrb
                variant="rose"
                count={submittedMissingDocsCount}
                isAllClear={!isServerLoading && submittedMissingDocsCount === 0}
              />
            </div>

            {/* Description */}
            <div className="relative z-10 space-y-1 mb-3">
              <p className="text-xs font-semibold text-slate-500 max-w-[200px] leading-tight mx-auto">
                {!isServerLoading && submittedMissingDocsCount === 0
                  ? DASHBOARD_COPY.cards.missingDocs.allClearText
                  : DASHBOARD_COPY.cards.missingDocs.description}
              </p>
            </div>

            {/* Bottom Completely Rounded Action Pill */}
            <div className="relative z-10 w-full flex justify-center mt-auto">
              <span className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold text-rose-700 bg-rose-50 group-hover:bg-rose-100/80 border border-rose-200 shadow-2xs transition-all">
                <span>{DASHBOARD_COPY.cards.missingDocs.linkText}</span>
                <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </div>
        </Link>

        {/* Card 3: Pendings (Missing Documents + Bank Details Needed) */}
        <div className="relative h-full rounded-[32px] border border-amber-200/80 bg-gradient-to-b from-amber-50/40 via-white to-slate-50/40 p-6 shadow-sm hover:shadow-lg hover:border-amber-300 transition-all duration-300 flex flex-col items-center justify-between text-center overflow-hidden min-h-[340px]">
          {/* Top Completely Rounded Pill Header */}
          <div className="w-full flex items-center justify-between z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/90 text-amber-900 border border-amber-200 text-xs font-bold uppercase tracking-wider shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-amber-800" aria-hidden="true" />
              <span>{DASHBOARD_COPY.cards.pendings.title}</span>
            </span>
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shadow-2xs ${
              pendingsTotal === 0
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-amber-800 bg-amber-50 border-amber-200'
            }`}>
              {pendingsTotal === 0 && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
              <span>{pendingsTotal === 0 ? DASHBOARD_COPY.badgeZero : `${pendingsTotal} items`}</span>
            </span>
          </div>

          {/* Center 3D WebGL Aura / Orb */}
          <div className="relative z-10 flex flex-col items-center justify-center my-3">
            <ThreeStatusOrb
              variant="amber"
              count={pendingsTotal}
              isAllClear={pendingsTotal === 0}
            />
          </div>

          {/* Description & Breakdown Toggle */}
          <div className="relative z-10 space-y-2 w-full mb-3">
            <p className="text-xs font-semibold text-slate-500 max-w-[200px] leading-tight mx-auto">
              {pendingsTotal === 0
                ? DASHBOARD_COPY.cards.pendings.allClearText
                : DASHBOARD_COPY.cards.pendings.description}
            </p>

            <button
              type="button"
              onClick={() => setIsPendingsExpanded(!isPendingsExpanded)}
              className="text-xs font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 hover:bg-amber-100/70 border border-amber-200/60 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600 cursor-pointer min-h-[32px]"
              aria-expanded={isPendingsExpanded}
              aria-label={isPendingsExpanded ? 'Hide breakdown' : 'Show breakdown'}
            >
              <span>{isPendingsExpanded ? 'Hide breakdown' : 'Show breakdown'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isPendingsExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Breakdown Rows: Concentric Encircled Pills (Missing documents + Bank details needed) */}
          {isPendingsExpanded && (
            <div className="relative z-10 w-full flex flex-col gap-2 pt-2 border-t border-amber-100 animate-in fade-in duration-200">
              {/* Row 1: Missing documents */}
              <Link
                href="/supervisor/assessments"
                className="group relative flex min-h-[50px] items-center justify-between rounded-full border border-amber-200/80 bg-gradient-to-r from-amber-50/80 via-white/90 to-amber-50/60 p-1.5 pr-3 shadow-[0_2px_8px_-2px_rgba(217,119,6,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-amber-300/90 hover:bg-white hover:shadow-[0_8px_20px_-4px_rgba(217,119,6,0.16),inset_0_1px_0_0_rgba(255,255,255,1)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-200/90 bg-gradient-to-br from-rose-100 to-rose-50 text-rose-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform duration-300 group-hover:scale-105">
                    <FileWarning className="h-3.5 w-3.5 text-rose-700" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-xs font-bold tracking-tight text-amber-950 group-hover:text-black">
                      Missing documents
                    </p>
                    <p className="truncate text-[10.5px] font-medium text-amber-800/75">
                      Records that need an Aadhaar or photo
                    </p>
                  </div>
                </div>

                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                  <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full border border-amber-300/80 bg-amber-100/90 px-2 font-mono text-xs font-bold tabular-nums text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] group-hover:bg-amber-200/80">
                    {submittedMissingDocsCount}
                  </span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full text-amber-700 group-hover:translate-x-0.5 transition-transform">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>

              {/* Row 2: Bank details needed */}
              <Link
                href="/assessment/sync?tab=bank_pending"
                className="group relative flex min-h-[50px] items-center justify-between rounded-full border border-amber-200/80 bg-gradient-to-r from-amber-50/80 via-white/90 to-amber-50/60 p-1.5 pr-3 shadow-[0_2px_8px_-2px_rgba(217,119,6,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-amber-300/90 hover:bg-white hover:shadow-[0_8px_20px_-4px_rgba(217,119,6,0.16),inset_0_1px_0_0_rgba(255,255,255,1)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200/90 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform duration-300 group-hover:scale-105">
                    <Landmark className="h-3.5 w-3.5 text-amber-700" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-xs font-bold tracking-tight text-amber-950 group-hover:text-black">
                      Bank details needed
                    </p>
                    <p className="truncate text-[10.5px] font-medium text-amber-800/75">
                      Cases that still need bank details
                    </p>
                  </div>
                </div>

                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                  <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full border border-amber-300/80 bg-amber-100/90 px-2 font-mono text-xs font-bold tabular-nums text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] group-hover:bg-amber-200/80">
                    {isServerLoading ? (
                      <span className="inline-block h-2.5 w-3 animate-pulse rounded-full bg-amber-300/90" />
                    ) : (
                      approvedBankPendingCount
                    )}
                  </span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full text-amber-700 group-hover:translate-x-0.5 transition-transform">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
