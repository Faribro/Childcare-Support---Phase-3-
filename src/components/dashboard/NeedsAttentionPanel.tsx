'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  FileText,
  FileWarning,
  Clock,
  Landmark,
  CheckCircle2,
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
  // Pendings consolidates Missing Documents + Bank Details Needed
  const pendingsTotal = submittedMissingDocsCount + approvedBankPendingCount;
  // Total distinct actionable items
  const totalActionable = localDraftsCount + outboxAttentionCount + pendingsTotal;

  const badgeText =
    totalActionable === 0
      ? DASHBOARD_COPY.badgeZero
      : totalActionable === 1
        ? DASHBOARD_COPY.badgeSingular
        : DASHBOARD_COPY.badgePlural(totalActionable);

  return (
    <section
      aria-labelledby="needs-attention-heading"
      className={`relative w-full space-y-4 ${className}`}
    >
      {/* ── Header Row (Free-floating above planets) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3
            id="needs-attention-heading"
            className="text-base sm:text-lg md:text-xl font-black text-white tracking-tight"
            style={{
              textShadow:
                '0 1px 0 rgba(8,28,78,0.95), 0 -1px 0 rgba(8,28,78,0.85), 1px 0 0 rgba(8,28,78,0.85), -1px 0 0 rgba(8,28,78,0.85), 0 3px 10px rgba(8,28,78,0.65)',
            }}
          >
            {DASHBOARD_COPY.sectionHeading}
          </h3>
          <p
            className="text-xs sm:text-sm font-medium mt-0.5 text-blue-100"
            style={{
              textShadow: '0 1px 3px rgba(6,22,66,0.6)',
            }}
          >
            {DASHBOARD_COPY.sectionSubtitle}
          </p>
        </div>
        <div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full border shadow-sm transition-all ${
              totalActionable === 0
                ? 'border-emerald-300/90 bg-[#B9F8D3]/95 text-emerald-950'
                : 'border-amber-300/90 bg-amber-100/95 text-amber-950'
            }`}
          >
            {totalActionable === 0 ? (
              <CheckCircle2
                className="w-4 h-4 text-emerald-700 stroke-[2.4]"
                aria-hidden="true"
              />
            ) : (
              <span
                className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            <span>{badgeText}</span>
          </span>
        </div>
      </div>

      {/* ── Free-Floating 3-Planet Orbital Trio ── */}
      <div className="flex flex-row items-center justify-center gap-6 lg:gap-10 pt-2 pb-1">
        {/* ── Planet 1: Forms to finish (Emerald-Teal) ── */}
        <div className="kobo-float-d relative flex flex-col items-center">
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-3 rounded-full blur-xl ${
              localDraftsCount >= 1 ? 'kobo-halo-active' : 'opacity-60'
            }`}
            style={{
              background:
                'radial-gradient(circle, rgba(52,211,153,0.55) 0%, rgba(16,185,129,0) 72%)',
            }}
          />

          <Link
            href={DASHBOARD_COPY.cards.formsToFinish.href}
            prefetch={true}
            aria-label={`${DASHBOARD_COPY.cards.formsToFinish.title}: ${localDraftsCount} - ${DASHBOARD_COPY.cards.formsToFinish.linkText}`}
            className="group relative block h-[224px] w-[224px] cursor-pointer rounded-full transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {/* Luminous emerald sphere */}
            <div
              className="absolute inset-0 overflow-hidden rounded-full"
              style={{
                background:
                  'radial-gradient(circle at 30% 26%, #B4FFE4 0%, #34E8A8 34%, #10B981 68%, #047857 100%)',
                boxShadow:
                  'inset -9px -12px 24px rgba(4,78,56,0.5), inset 6px 6px 14px rgba(255,255,255,0.6), 0 0 0 2px rgba(167,243,208,0.6)',
              }}
            >
              {/* Comic craters */}
              <svg
                viewBox="0 0 220 220"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <circle cx="36" cy="94" r="14" fill="#047857" opacity="0.22" />
                <circle cx="38" cy="96" r="11" fill="#6EE7B7" opacity="0.25" />
                <circle cx="178" cy="110" r="16" fill="#047857" opacity="0.24" />
                <circle cx="180" cy="112" r="12" fill="#34D399" opacity="0.2" />
                <circle cx="156" cy="58" r="9" fill="#047857" opacity="0.18" />
                <circle cx="50" cy="160" r="10" fill="#065F46" opacity="0.2" />
                <circle cx="152" cy="170" r="7.5" fill="#065F46" opacity="0.18" />
                <ellipse
                  cx="68"
                  cy="46"
                  rx="34"
                  ry="13"
                  fill="#FFFFFF"
                  opacity="0.25"
                  transform="rotate(-22 68 46)"
                />
              </svg>
            </div>

            {/* Content overlay */}
            <div className="relative z-10 flex h-full flex-col items-center justify-between px-3 py-4 text-center">
              {/* Title pill */}
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-emerald-950 shadow-xs"
                style={{
                  background: 'rgba(255, 255, 255, 0.94)',
                  border: '1px solid rgba(255, 255, 255, 0.9)',
                }}
              >
                <FileText className="h-3 w-3 shrink-0 text-emerald-800" aria-hidden="true" />
                <span>{DASHBOARD_COPY.cards.formsToFinish.title}</span>
              </span>

              {/* Big bold count + description */}
              <div className="flex flex-col items-center">
                <span
                  className="text-[3.5rem] leading-none font-black tracking-tight text-[#09142A] tabular-nums"
                  style={{
                    fontWeight: 900,
                    WebkitTextStroke: '0.6px #09142A',
                  }}
                >
                  {localDraftsCount}
                </span>
                <span className="mt-1 text-[11.5px] font-extrabold text-[#072920]">
                  {localDraftsCount === 0
                    ? 'No incomplete drafts'
                    : localDraftsCount === 1
                      ? '1 draft saved'
                      : `${localDraftsCount} drafts saved`}
                </span>
              </div>

              {/* Button */}
              <span className="inline-flex items-center justify-center rounded-full bg-[#0C6E43] px-5 py-1.5 text-[11px] font-extrabold text-white shadow-sm ring-1 ring-emerald-300/40 whitespace-nowrap transition-transform duration-150 group-hover:scale-105">
                {DASHBOARD_COPY.cards.formsToFinish.linkText}
              </span>
            </div>
          </Link>
        </div>

        {/* ── Planet 2: Waiting to send (Golden-Amber) ── */}
        <div className="kobo-float-o relative flex flex-col items-center mt-3">
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-3 rounded-full blur-xl ${
              outboxAttentionCount >= 1 ? 'kobo-halo-active' : 'opacity-60'
            }`}
            style={{
              background:
                'radial-gradient(circle, rgba(251,191,36,0.65) 0%, rgba(245,158,11,0) 72%)',
            }}
          />

          <Link
            href={DASHBOARD_COPY.cards.waitingToSend.href}
            prefetch={true}
            aria-label={`${DASHBOARD_COPY.cards.waitingToSend.title}: ${outboxAttentionCount} - ${DASHBOARD_COPY.cards.waitingToSend.linkText}`}
            className="group relative block h-[224px] w-[224px] cursor-pointer rounded-full transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {/* Luminous golden sphere */}
            <div
              className="absolute inset-0 overflow-hidden rounded-full"
              style={{
                background:
                  'radial-gradient(circle at 30% 26%, #FFF8C2 0%, #FDE047 36%, #F59E0B 72%, #C26806 100%)',
                boxShadow:
                  'inset -9px -12px 24px rgba(146,64,14,0.45), inset 6px 6px 14px rgba(255,255,255,0.65), 0 0 0 2px rgba(254,240,138,0.65)',
              }}
            >
              {/* Comic craters */}
              <svg
                viewBox="0 0 220 220"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <circle cx="36" cy="106" r="14" fill="#B45309" opacity="0.2" />
                <circle cx="38" cy="108" r="11" fill="#FEF08A" opacity="0.28" />
                <circle cx="178" cy="94" r="13" fill="#B45309" opacity="0.2" />
                <circle cx="158" cy="164" r="10" fill="#92400E" opacity="0.2" />
                <circle cx="62" cy="162" r="8" fill="#92400E" opacity="0.18" />
                <ellipse
                  cx="68"
                  cy="46"
                  rx="34"
                  ry="13"
                  fill="#FFFFFF"
                  opacity="0.3"
                  transform="rotate(-22 68 46)"
                />
              </svg>
            </div>

            {/* Content overlay */}
            <div className="relative z-10 flex h-full flex-col items-center justify-between px-3 py-4 text-center">
              {/* Title pill */}
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-amber-950 shadow-xs"
                style={{
                  background: 'rgba(255, 255, 255, 0.94)',
                  border: '1px solid rgba(255, 255, 255, 0.9)',
                }}
              >
                <Clock className="h-3 w-3 shrink-0 text-amber-800" aria-hidden="true" />
                <span>{DASHBOARD_COPY.cards.waitingToSend.title}</span>
              </span>

              {/* Big bold count + description */}
              <div className="flex flex-col items-center">
                <span
                  className="text-[3.5rem] leading-none font-black tracking-tight text-[#09142A] tabular-nums"
                  style={{
                    fontWeight: 900,
                    WebkitTextStroke: '0.6px #09142A',
                  }}
                >
                  {outboxAttentionCount}
                </span>
                <span className="mt-1 text-[11.5px] font-extrabold text-[#3B1E02]">
                  {outboxAttentionCount === 0
                    ? 'Everything has been sent'
                    : outboxAttentionCount === 1
                      ? '1 item in outbox'
                      : `${outboxAttentionCount} items in outbox`}
                </span>
              </div>

              {/* Button */}
              <span className="inline-flex items-center justify-center rounded-full bg-[#925408] px-5 py-1.5 text-[11px] font-extrabold text-white shadow-sm ring-1 ring-amber-200/40 whitespace-nowrap transition-transform duration-150 group-hover:scale-105">
                {DASHBOARD_COPY.cards.waitingToSend.linkText}
              </span>
            </div>
          </Link>
        </div>

        {/* ── Planet 3: Pendings (Coral-Rose with 3D Wrapped Saturn Ring) ── */}
        <div className="kobo-float-p relative flex flex-col items-center -mt-1">
          {/* Outer glow halo */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-4 rounded-full blur-2xl ${
              pendingsTotal >= 1 ? 'kobo-halo-active' : 'opacity-60'
            }`}
            style={{
              background:
                'radial-gradient(circle, rgba(251,113,133,0.65) 0%, rgba(244,63,94,0) 74%)',
            }}
          />

          <div className="relative h-[232px] w-[232px]">
            {/* Saturn Ring — BACK ARC (behind sphere, z-0) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[44%] z-0 h-[74px] w-[142%] -translate-x-1/2 -translate-y-1/2 -rotate-[24deg]"
            >
              <svg
                viewBox="0 0 340 84"
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="desk-saturn-ring" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#EC4899" stopOpacity="0.94" />
                    <stop offset="28%" stopColor="#F9A8D4" stopOpacity="0.98" />
                    <stop offset="52%" stopColor="#F472B6" stopOpacity="0.9" />
                    <stop offset="78%" stopColor="#C084FC" stopOpacity="0.96" />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity="0.9" />
                  </linearGradient>
                  <clipPath id="desk-ring-back">
                    <rect x="-30" y="-30" width="400" height="72" />
                  </clipPath>
                </defs>
                <ellipse
                  cx="170"
                  cy="42"
                  rx="160"
                  ry="31"
                  fill="none"
                  stroke="url(#desk-saturn-ring)"
                  strokeWidth="11"
                  clipPath="url(#desk-ring-back)"
                />
                <ellipse
                  cx="170"
                  cy="42"
                  rx="150"
                  ry="26"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.2"
                  opacity="0.45"
                  clipPath="url(#desk-ring-back)"
                />
              </svg>
            </div>

            {/* Luminous coral sphere (z-10) */}
            <div
              className="relative z-10 h-full w-full overflow-hidden rounded-full"
              style={{
                background:
                  'radial-gradient(circle at 28% 26%, #FFD99A 0%, #FB923C 28%, #F45B69 62%, #C8235D 100%)',
                boxShadow:
                  'inset -10px -13px 26px rgba(136,19,55,0.48), inset 7px 7px 16px rgba(255,255,255,0.55), 0 0 0 2px rgba(254,205,211,0.55)',
              }}
            >
              {/* Comic craters */}
              <svg
                viewBox="0 0 230 230"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <circle cx="36" cy="102" r="13" fill="#9A3412" opacity="0.2" />
                <circle cx="38" cy="104" r="10" fill="#FDBA74" opacity="0.28" />
                <circle cx="182" cy="78" r="15" fill="#9F1239" opacity="0.22" />
                <circle cx="184" cy="80" r="11" fill="#FDA4AF" opacity="0.2" />
                <circle cx="194" cy="136" r="10" fill="#881337" opacity="0.22" />
                <circle cx="58" cy="64" r="8.5" fill="#C2410C" opacity="0.16" />
                <circle cx="52" cy="162" r="9" fill="#9F1239" opacity="0.2" />
                <ellipse
                  cx="70"
                  cy="44"
                  rx="34"
                  ry="13"
                  fill="#FFFFFF"
                  opacity="0.26"
                  transform="rotate(-22 70 44)"
                />
              </svg>
            </div>

            {/* Saturn Ring — FRONT ARC (above sphere z-20, BELOW text z-30) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[44%] z-20 h-[74px] w-[142%] -translate-x-1/2 -translate-y-1/2 -rotate-[24deg]"
            >
              <svg
                viewBox="0 0 340 84"
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <clipPath id="desk-ring-front">
                    <rect x="-30" y="42" width="400" height="72" />
                  </clipPath>
                </defs>
                <ellipse
                  cx="170"
                  cy="42"
                  rx="160"
                  ry="31"
                  fill="none"
                  stroke="url(#desk-saturn-ring)"
                  strokeWidth="11"
                  opacity="0.9"
                  clipPath="url(#desk-ring-front)"
                />
                <ellipse
                  cx="170"
                  cy="42"
                  rx="150"
                  ry="26"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.2"
                  opacity="0.5"
                  clipPath="url(#desk-ring-front)"
                />
              </svg>
            </div>

            {/* Foreground UI Content (z-30 — razor-sharp above ring) */}
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-between px-2.5 py-3.5 text-center">
              {/* Title pill */}
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-900 shadow-xs"
                style={{
                  background: 'rgba(255, 255, 255, 0.94)',
                  border: '1px solid rgba(255, 255, 255, 0.9)',
                }}
              >
                <AlertTriangle className="h-3 w-3 shrink-0 text-rose-700" aria-hidden="true" />
                <span>{DASHBOARD_COPY.cards.pendings.title}</span>
              </span>

              {/* Big bold count + description */}
              <div className="flex flex-col items-center -mt-0.5">
                <span
                  className="text-[3.3rem] leading-none font-black tracking-tight text-[#09142A] tabular-nums"
                  style={{
                    fontWeight: 900,
                    WebkitTextStroke: '0.6px #09142A',
                  }}
                >
                  {isServerLoading ? (
                    <span className="inline-block h-8 w-8 animate-pulse rounded-full bg-rose-950/20" />
                  ) : (
                    pendingsTotal
                  )}
                </span>
                <span className="mt-0.5 text-[11px] font-extrabold text-[#2D0A14]">
                  {pendingsTotal === 0
                    ? DASHBOARD_COPY.cards.pendings.allClearText
                    : pendingsTotal === 1
                      ? '1 item pending'
                      : `${pendingsTotal} items pending`}
                </span>
              </div>

              {/* Two sub-pills: Missing documents & Bank details needed */}
              <div className="flex flex-col items-center gap-1 w-full max-w-[200px]">
                <Link
                  href={DASHBOARD_COPY.cards.pendings.rows.missingDocs.href}
                  className="group/pill inline-flex w-full items-center justify-between rounded-full px-2.5 py-0.5 text-[10px] font-bold text-slate-900 shadow-xs transition-transform duration-100 hover:scale-[1.02]"
                  style={{
                    background: 'rgba(255, 255, 255, 0.94)',
                    border: '1px solid rgba(255, 255, 255, 0.88)',
                  }}
                >
                  <span className="flex items-center gap-1 truncate">
                    <FileWarning className="h-2.5 w-2.5 shrink-0 text-slate-700" aria-hidden="true" />
                    <span className="truncate">
                      {DASHBOARD_COPY.cards.pendings.rows.missingDocs.label}
                    </span>
                  </span>
                  {' '}
                  <span className="ml-1 font-black text-[#09142A] tabular-nums shrink-0">
                    {submittedMissingDocsCount}
                  </span>
                </Link>

                <Link
                  href={DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.href}
                  className="group/pill inline-flex w-full items-center justify-between rounded-full px-2.5 py-0.5 text-[10px] font-bold text-slate-900 shadow-xs transition-transform duration-100 hover:scale-[1.02]"
                  style={{
                    background: 'rgba(255, 255, 255, 0.94)',
                    border: '1px solid rgba(255, 255, 255, 0.88)',
                  }}
                >
                  <span className="flex items-center gap-1 truncate">
                    <Landmark className="h-2.5 w-2.5 shrink-0 text-slate-700" aria-hidden="true" />
                    <span className="truncate">
                      {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label}
                    </span>
                  </span>
                  {' '}
                  <span className="ml-1 font-black text-[#09142A] tabular-nums shrink-0">
                    {approvedBankPendingCount}
                  </span>
                </Link>
              </div>

              {/* Action Button Pill */}
              <Link
                href={
                  pendingsTotal > 0
                    ? submittedMissingDocsCount > 0
                      ? DASHBOARD_COPY.cards.pendings.rows.missingDocs.href
                      : DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.href
                    : DASHBOARD_COPY.cards.pendings.rows.missingDocs.href
                }
                className={`inline-flex items-center justify-center rounded-full px-5 py-1 text-[11px] font-extrabold text-white shadow-sm transition-transform duration-150 hover:scale-105 ${
                  pendingsTotal === 0
                    ? 'bg-[#0C8C52] ring-1 ring-emerald-300/50'
                    : 'bg-rose-800 ring-1 ring-rose-300/50'
                }`}
              >
                {pendingsTotal === 0 ? 'All clear ›' : 'Resolve ›'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default NeedsAttentionPanel;
