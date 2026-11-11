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
      className={`bg-white/90 backdrop-blur-md rounded-[36px] border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-6 transition-all duration-300 hover:shadow-md ${className}`}
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100/90 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-100 to-amber-50 text-amber-700 border border-amber-200/80 flex items-center justify-center shrink-0 shadow-2xs">
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
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full border shadow-2xs transition-all ${
              totalActionable === 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/90'
                : 'bg-amber-50 text-amber-800 border-amber-200/90'
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

      {/* 3-Circle Responsive Grid (Circle Cards with 3D Three.js Orbs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Circle Card 1: Forms to finish */}
        <Link
          href={DASHBOARD_COPY.cards.formsToFinish.href}
          className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-[32px]"
        >
          <div className="h-full p-6 rounded-[32px] border border-teal-100/80 bg-gradient-to-b from-teal-50/40 via-white to-slate-50/40 hover:from-teal-50/70 hover:to-white hover:border-teal-200 hover:shadow-lg hover:-translate-y-1 motion-reduce:hover:translate-y-0 transition-all duration-300 flex flex-col items-center text-center justify-between space-y-4 min-h-[310px] cursor-pointer">
            {/* Top Title & Badge */}
            <div className="w-full flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-teal-100/80 text-teal-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <span>{DASHBOARD_COPY.cards.formsToFinish.title}</span>
              </span>
              {localDraftsCount === 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shadow-2xs">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{DASHBOARD_COPY.allClear}</span>
                </span>
              )}
            </div>

            {/* Awwwards 3D Circular Orb & Counter */}
            <div className="relative w-44 h-44 sm:w-48 sm:h-48 my-1 flex items-center justify-center">
              {/* Outer Glowing Glass Halo */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-teal-400/20 to-emerald-300/10 blur-md group-hover:scale-105 transition-transform duration-300" />
              
              {/* Circular Disc Boundary */}
              <div className="absolute inset-1 rounded-full bg-white/70 backdrop-blur-md border border-teal-200/60 shadow-inner overflow-hidden flex items-center justify-center">
                {/* Embedded Three.js 3D WebGL Orb */}
                <ThreeStatusOrb
                  variant="teal"
                  count={localDraftsCount}
                  isAllClear={localDraftsCount === 0}
                  className="w-full h-full absolute inset-0"
                />

                {/* Center Holographic Dial Overlay */}
                <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-4xl font-black text-slate-900 tracking-tight drop-shadow-xs">
                    {localDraftsCount}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-teal-800/80 mt-0.5">
                    {localDraftsCount === 0 ? 'Clear' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-500 leading-relaxed max-w-[220px]">
              {localDraftsCount === 0
                ? DASHBOARD_COPY.cards.formsToFinish.allClearText
                : DASHBOARD_COPY.cards.formsToFinish.description}
            </p>

            {/* Bottom Action Pill */}
            <div className="w-full pt-3 border-t border-teal-100/70 flex items-center justify-center gap-1.5 text-xs font-bold text-teal-700 group-hover:text-teal-900 min-h-[44px]">
              <span>{DASHBOARD_COPY.cards.formsToFinish.linkText}</span>
              <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 motion-reduce:transform-none transition-transform" />
            </div>
          </div>
        </Link>

        {/* Circle Card 2: Missing documents */}
        <Link
          href={DASHBOARD_COPY.cards.missingDocs.href}
          className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-600 rounded-[32px]"
        >
          <div className="h-full p-6 rounded-[32px] border border-rose-100/80 bg-gradient-to-b from-rose-50/40 via-white to-slate-50/40 hover:from-rose-50/70 hover:to-white hover:border-rose-200 hover:shadow-lg hover:-translate-y-1 motion-reduce:hover:translate-y-0 transition-all duration-300 flex flex-col items-center text-center justify-between space-y-4 min-h-[310px] cursor-pointer">
            {/* Top Title & Badge */}
            <div className="w-full flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <FileWarning className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <span>{DASHBOARD_COPY.cards.missingDocs.title}</span>
              </span>
              {!isServerLoading && submittedMissingDocsCount === 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shadow-2xs">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{DASHBOARD_COPY.allClear}</span>
                </span>
              )}
            </div>

            {/* Awwwards 3D Circular Orb & Counter */}
            <div className="relative w-44 h-44 sm:w-48 sm:h-48 my-1 flex items-center justify-center">
              {/* Outer Glowing Glass Halo */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-rose-400/20 to-orange-300/10 blur-md group-hover:scale-105 transition-transform duration-300" />
              
              {/* Circular Disc Boundary */}
              <div className="absolute inset-1 rounded-full bg-white/70 backdrop-blur-md border border-rose-200/60 shadow-inner overflow-hidden flex items-center justify-center">
                {/* Embedded Three.js 3D WebGL Orb */}
                <ThreeStatusOrb
                  variant="rose"
                  count={submittedMissingDocsCount}
                  isAllClear={!isServerLoading && submittedMissingDocsCount === 0}
                  className="w-full h-full absolute inset-0"
                />

                {/* Center Holographic Dial Overlay */}
                <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-4xl font-black text-rose-950 tracking-tight drop-shadow-xs">
                    {isServerLoading ? (
                      <span className="inline-block w-8 h-8 bg-rose-200 animate-pulse rounded-full" />
                    ) : (
                      submittedMissingDocsCount
                    )}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-rose-800/80 mt-0.5">
                    {!isServerLoading && submittedMissingDocsCount === 0 ? 'Clear' : 'Action'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-rose-800/80 leading-relaxed max-w-[220px]">
              {!isServerLoading && submittedMissingDocsCount === 0
                ? DASHBOARD_COPY.cards.missingDocs.allClearText
                : DASHBOARD_COPY.cards.missingDocs.description}
            </p>

            {/* Bottom Action Pill */}
            <div className="w-full pt-3 border-t border-rose-100/70 flex items-center justify-center gap-1.5 text-xs font-bold text-rose-800 group-hover:text-rose-950 min-h-[44px]">
              <span>{DASHBOARD_COPY.cards.missingDocs.linkText}</span>
              <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 motion-reduce:transform-none transition-transform" />
            </div>
          </div>
        </Link>

        {/* Circle Card 3: Pendings (Combined Waiting to Send + Bank Details) */}
        <div className="p-6 rounded-[32px] border border-amber-100/80 bg-gradient-to-b from-amber-50/40 via-white to-slate-50/40 hover:from-amber-50/70 hover:to-white hover:border-amber-200 hover:shadow-lg transition-all duration-300 flex flex-col items-center text-center justify-between space-y-4 min-h-[310px]">
          {/* Top Title & Badge */}
          <div className="w-full flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-100/80 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
              <span>{DASHBOARD_COPY.cards.pendings.title}</span>
            </span>
            {pendingsTotal === 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shadow-2xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{DASHBOARD_COPY.allClear}</span>
              </span>
            )}
          </div>

          {/* Awwwards 3D Circular Orb & Counter */}
          <div className="relative w-44 h-44 sm:w-48 sm:h-48 my-1 flex items-center justify-center">
            {/* Outer Glowing Glass Halo */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-400/20 to-yellow-300/10 blur-md hover:scale-105 transition-transform duration-300" />
            
            {/* Circular Disc Boundary */}
            <div className="absolute inset-1 rounded-full bg-white/70 backdrop-blur-md border border-amber-200/60 shadow-inner overflow-hidden flex items-center justify-center">
              {/* Embedded Three.js 3D WebGL Orb */}
              <ThreeStatusOrb
                variant="amber"
                count={pendingsTotal}
                isAllClear={pendingsTotal === 0}
                className="w-full h-full absolute inset-0"
              />

              {/* Center Holographic Dial Overlay */}
              <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-4xl font-black text-amber-950 tracking-tight drop-shadow-xs">
                  {isServerLoading ? (
                    <span className="inline-block w-8 h-8 bg-amber-200 animate-pulse rounded-full" />
                  ) : (
                    pendingsTotal
                  )}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-amber-800/80 mt-0.5">
                  {pendingsTotal === 0 ? 'Clear' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Description & Toggle */}
          <div className="space-y-1.5 w-full">
            <p className="text-xs text-amber-900/80 leading-relaxed max-w-[220px] mx-auto">
              {pendingsTotal === 0
                ? DASHBOARD_COPY.cards.pendings.allClearText
                : DASHBOARD_COPY.cards.pendings.description}
            </p>
            <button
              type="button"
              onClick={() => setIsPendingsExpanded(!isPendingsExpanded)}
              className="text-xs font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100/70 border border-amber-200/60 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600 cursor-pointer min-h-[36px]"
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

          {/* Breakdown Rows (Circular Mini Pods) */}
          {isPendingsExpanded && (
            <div className="w-full space-y-2 pt-2 border-t border-amber-100/80 animate-in fade-in duration-200">
              {/* Row 1: Waiting to send */}
              <Link
                href={DASHBOARD_COPY.cards.pendings.rows.waitingToSend.href}
                className="group flex items-center justify-between p-2.5 rounded-2xl bg-amber-50/40 hover:bg-white border border-amber-200/60 hover:border-amber-300 transition-all min-h-[44px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <div className="text-left min-w-0">
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
                className="group flex items-center justify-between p-2.5 rounded-2xl bg-amber-50/40 hover:bg-white border border-amber-200/60 hover:border-amber-300 transition-all min-h-[44px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Landmark className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <div className="text-left min-w-0">
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
