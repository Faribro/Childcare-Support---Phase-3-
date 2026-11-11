'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  FileText,
  FileWarning,
  Clock,
  Landmark,
  ChevronRight,
  CheckCircle2,
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
  const pendingsTotal = outboxAttentionCount + approvedBankPendingCount;
  const totalActionable = localDraftsCount + submittedMissingDocsCount + pendingsTotal;

  const badgeText =
    totalActionable === 0
      ? DASHBOARD_COPY.badgeZero
      : totalActionable === 1
        ? DASHBOARD_COPY.badgeSingular
        : DASHBOARD_COPY.badgePlural(totalActionable);

  return (
    <section
      aria-labelledby="needs-attention-heading"
      className={`bg-white/95 backdrop-blur-xl rounded-[40px] border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-8 transition-all duration-300 hover:shadow-md ${className}`}
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

      {/* 3 True Circular Cards with Completely Rounded Borders (rounded-full aspect-square) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 justify-items-center">
        {/* Circle Card 1: Forms to finish */}
        <Link
          href={DASHBOARD_COPY.cards.formsToFinish.href}
          className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-full w-full max-w-[310px]"
        >
          <div className="relative w-full aspect-square rounded-full border-2 border-teal-200/90 bg-gradient-to-b from-teal-50/70 via-white/95 to-teal-50/40 backdrop-blur-md shadow-md hover:shadow-xl hover:border-teal-400 hover:scale-[1.03] motion-reduce:hover:scale-100 transition-all duration-300 p-6 flex flex-col items-center justify-between text-center overflow-hidden cursor-pointer">
            {/* Ambient Glow & Concentric Inner Ring */}
            <div className="absolute inset-0 rounded-full bg-teal-400/10 blur-xl pointer-events-none" />
            <div className="absolute inset-2.5 rounded-full border border-teal-200/50 pointer-events-none" />

            {/* Three.js 3D WebGL Background Aura */}
            <ThreeStatusOrb
              variant="teal"
              count={localDraftsCount}
              isAllClear={localDraftsCount === 0}
            />

            {/* Top Completely Rounded Pill Header */}
            <div className="relative z-10 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-teal-100/90 text-teal-800 border border-teal-200 text-xs font-bold uppercase tracking-wider shadow-2xs">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{DASHBOARD_COPY.cards.formsToFinish.title}</span>
              </span>
            </div>

            {/* Center Hero Counter & Status */}
            <div className="relative z-10 flex flex-col items-center justify-center my-auto">
              <span className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tight drop-shadow-xs">
                {localDraftsCount}
              </span>
              <span className="text-xs font-semibold text-slate-500 mt-1 max-w-[190px] leading-tight">
                {localDraftsCount === 0
                  ? DASHBOARD_COPY.cards.formsToFinish.allClearText
                  : DASHBOARD_COPY.cards.formsToFinish.description}
              </span>
            </div>

            {/* Bottom Completely Rounded Action Pill */}
            <div className="relative z-10 pb-1 w-full flex justify-center">
              <span className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold text-white bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 group-hover:from-teal-800 group-hover:to-emerald-700 shadow-sm border border-teal-700 transition-all">
                <span>{DASHBOARD_COPY.cards.formsToFinish.linkText}</span>
                <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </div>
        </Link>

        {/* Circle Card 2: Missing documents */}
        <Link
          href={DASHBOARD_COPY.cards.missingDocs.href}
          className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-600 rounded-full w-full max-w-[310px]"
        >
          <div className="relative w-full aspect-square rounded-full border-2 border-rose-200/90 bg-gradient-to-b from-rose-50/70 via-white/95 to-rose-50/40 backdrop-blur-md shadow-md hover:shadow-xl hover:border-rose-400 hover:scale-[1.03] motion-reduce:hover:scale-100 transition-all duration-300 p-6 flex flex-col items-center justify-between text-center overflow-hidden cursor-pointer">
            {/* Ambient Glow & Concentric Inner Ring */}
            <div className="absolute inset-0 rounded-full bg-rose-400/10 blur-xl pointer-events-none" />
            <div className="absolute inset-2.5 rounded-full border border-rose-200/50 pointer-events-none" />

            {/* Three.js 3D WebGL Background Aura */}
            <ThreeStatusOrb
              variant="rose"
              count={submittedMissingDocsCount}
              isAllClear={!isServerLoading && submittedMissingDocsCount === 0}
            />

            {/* Top Completely Rounded Pill Header */}
            <div className="relative z-10 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-rose-100/90 text-rose-800 border border-rose-200 text-xs font-bold uppercase tracking-wider shadow-2xs">
                <FileWarning className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
                <span>{DASHBOARD_COPY.cards.missingDocs.title}</span>
              </span>
            </div>

            {/* Center Hero Counter & Status */}
            <div className="relative z-10 flex flex-col items-center justify-center my-auto">
              <span className="text-5xl sm:text-6xl font-black text-rose-950 tracking-tight drop-shadow-xs">
                {isServerLoading ? (
                  <span className="inline-block w-10 h-10 bg-rose-200 animate-pulse rounded-full" />
                ) : (
                  submittedMissingDocsCount
                )}
              </span>
              <span className="text-xs font-semibold text-rose-800/80 mt-1 max-w-[190px] leading-tight">
                {!isServerLoading && submittedMissingDocsCount === 0
                  ? DASHBOARD_COPY.cards.missingDocs.allClearText
                  : DASHBOARD_COPY.cards.missingDocs.description}
              </span>
            </div>

            {/* Bottom Completely Rounded Action Pill */}
            <div className="relative z-10 pb-1 w-full flex justify-center">
              <span className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold text-white bg-gradient-to-r from-rose-700 via-rose-600 to-rose-800 group-hover:from-rose-800 group-hover:to-rose-900 shadow-sm border border-rose-700 transition-all">
                <span>{DASHBOARD_COPY.cards.missingDocs.linkText}</span>
                <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </div>
        </Link>

        {/* Circle Card 3: Pendings (Combined Waiting to Send + Bank Details) */}
        <div className="relative w-full max-w-[310px] aspect-square rounded-full border-2 border-amber-200/90 bg-gradient-to-b from-amber-50/70 via-white/95 to-amber-50/40 backdrop-blur-md shadow-md hover:shadow-xl hover:border-amber-400 transition-all duration-300 p-5 flex flex-col items-center justify-between text-center overflow-hidden">
          {/* Ambient Glow & Concentric Inner Ring */}
          <div className="absolute inset-0 rounded-full bg-amber-400/10 blur-xl pointer-events-none" />
          <div className="absolute inset-2.5 rounded-full border border-amber-200/50 pointer-events-none" />

          {/* Three.js 3D WebGL Background Aura */}
          <ThreeStatusOrb
            variant="amber"
            count={pendingsTotal}
            isAllClear={pendingsTotal === 0}
          />

          {/* Top Completely Rounded Pill Header */}
          <div className="relative z-10 pt-1">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-amber-100/90 text-amber-900 border border-amber-200 text-xs font-bold uppercase tracking-wider shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-amber-800" aria-hidden="true" />
              <span>{DASHBOARD_COPY.cards.pendings.title}</span>
            </span>
          </div>

          {/* Center Hero Counter & Status */}
          <div className="relative z-10 flex flex-col items-center justify-center my-auto">
            <span className="text-5xl sm:text-6xl font-black text-amber-950 tracking-tight drop-shadow-xs">
              {isServerLoading ? (
                <span className="inline-block w-10 h-10 bg-amber-200 animate-pulse rounded-full" />
              ) : (
                pendingsTotal
              )}
            </span>
            <span className="text-xs font-semibold text-amber-900/80 mt-0.5 max-w-[190px] leading-tight">
              {pendingsTotal === 0
                ? DASHBOARD_COPY.cards.pendings.allClearText
                : DASHBOARD_COPY.cards.pendings.description}
            </span>
          </div>

          {/* Bottom Sub-Pills (Completely rounded buttons for Waiting to send & Bank details needed) */}
          <div className="relative z-10 pb-1 w-full flex flex-col gap-1.5 max-w-[240px]">
            {/* Sub-item 1: Waiting to send */}
            <Link
              href="/assessment/sync?tab=outbox"
              className="inline-flex items-center justify-between px-3.5 py-1.5 rounded-full text-[11px] font-bold text-amber-950 bg-amber-100/80 hover:bg-amber-200 border border-amber-300 shadow-2xs transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              <span className="truncate">{DASHBOARD_COPY.cards.pendings.rows.waitingToSend.label}</span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white text-amber-900 border border-amber-200 shrink-0 ml-1">
                {outboxAttentionCount}
              </span>
            </Link>

            {/* Sub-item 2: Bank details needed */}
            <Link
              href="/assessment/sync?tab=bank_pending"
              className="inline-flex items-center justify-between px-3.5 py-1.5 rounded-full text-[11px] font-bold text-amber-950 bg-amber-100/80 hover:bg-amber-200 border border-amber-300 shadow-2xs transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              <span className="truncate">{DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label}</span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white text-amber-900 border border-amber-200 shrink-0 ml-1">
                {isServerLoading ? (
                  <span
                    className="inline-block w-3 h-2 bg-amber-200 animate-pulse rounded"
                    role="status"
                    aria-label="Loading bank count"
                  />
                ) : (
                  approvedBankPendingCount
                )}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
