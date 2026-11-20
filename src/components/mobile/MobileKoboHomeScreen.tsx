'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  isAuthenticated?: boolean;
  onRequireAuth?: () => void;
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
  isAuthenticated = true,
  onRequireAuth,
}: MobileKoboHomeScreenProps) {
  const draftsLoading = isDraftsLoading ?? isLoading;
  const waitingLoading = isWaitingLoading ?? isLoading;
  const submittedLoading = isSubmittedLoading ?? isLoading;
  const count = isAuthenticated ? (draftsCount ?? drafts?.length ?? 0) : 0;

  // Pendings consolidates Missing Documents + Bank Details Needed per user addendum
  const effectiveMissingDocs = isAuthenticated ? submittedMissingDocsCount : 0;
  const effectiveBankPending = isAuthenticated ? approvedBankPendingCount : 0;
  const effectiveWaitingCount = isAuthenticated ? waitingCount : 0;
  const pendingsTotal = effectiveMissingDocs + effectiveBankPending;
  const [isPendingsExpanded, setIsPendingsExpanded] = useState(false);
  const totalActionable = count + effectiveWaitingCount + pendingsTotal;

  // Carousel active state and track ref for bounded stage pagination
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const carouselTrackRef = useRef<HTMLDivElement>(null);

  const handleCarouselScroll = useCallback(() => {
    const track = carouselTrackRef.current;
    if (!track) return;
    const scrollLeft = track.scrollLeft;
    const slides = track.querySelectorAll<HTMLElement>('[data-card-slide]');
    if (slides.length === 0) return;

    let closestIndex = 0;
    let minDiff = Infinity;
    slides.forEach((slide) => {
      const idx = Number(slide.getAttribute('data-card-slide'));
      const diff = Math.abs(slide.offsetLeft - track.offsetLeft - scrollLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });

    setActiveCardIndex(closestIndex);
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const track = carouselTrackRef.current;
    if (!track) return;
    const targetSlide = track.querySelector<HTMLElement>(`[data-card-slide="${index}"]`);
    if (!targetSlide) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const targetLeft = targetSlide.offsetLeft - track.offsetLeft;
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({
        left: targetLeft,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    } else {
      track.scrollLeft = targetLeft;
    }
    setActiveCardIndex(index);
  }, []);

  useEffect(() => {
    const track = carouselTrackRef.current;
    if (!track) return;
    handleCarouselScroll();
    const onResize = () => handleCarouselScroll();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [handleCarouselScroll]);

  const badgeText =
    totalActionable === 0
      ? DASHBOARD_COPY.badgeZero
      : totalActionable === 1
        ? DASHBOARD_COPY.badgeSingular
        : DASHBOARD_COPY.badgePlural(totalActionable);

  const handleProtectedNav = (e: React.MouseEvent, url: string) => {
    if (!isAuthenticated) {
      e.preventDefault();
      if (onRequireAuth) {
        onRequireAuth();
      } else if (onStartSurvey) {
        onStartSurvey(e);
      }
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      e.preventDefault();
      window.location.assign(url);
    }
  };

  const handleStartSurvey = (e: React.MouseEvent) => {
    if (!isAuthenticated && onRequireAuth) {
      e.preventDefault();
      onRequireAuth();
      return;
    }
    if (onStartSurvey) {
      onStartSurvey(e);
    } else {
      window.location.assign('/assessment/new');
    }
  };

  return (
    <div className="md:hidden w-full max-w-md mx-auto px-4 py-3 sm:py-4 space-y-3.5 animate-in fade-in duration-150">
      {/* ── Unauthenticated Sign-In Notice Banner ── */}
      {!isAuthenticated && (
        <div className="w-full bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200/90 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
              <h4 className="text-xs font-bold text-teal-950">Sign In Required</h4>
            </div>
            <p className="text-[11px] text-teal-800 font-medium mt-0.5">
              Please sign in or register to record and sync surveys.
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              if (onRequireAuth) onRequireAuth();
              else if (onStartSurvey) onStartSurvey(e);
            }}
            className="px-3.5 py-1.5 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-bold text-xs rounded-xl shrink-0 cursor-pointer shadow-xs transition-colors"
          >
            Sign In
          </button>
        </div>
      )}

      {/* ── Row 1: Start New Survey (Prominent Full-Width Primary Action, >=56px touch target) ── */}
      <Link
        href="/assessment/new"
        onClick={handleStartSurvey}
        className="w-full min-h-[56px] bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 active:scale-[0.99] text-white rounded-2xl p-4 shadow-sm border border-teal-800 flex items-center justify-between transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600"
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
      </Link>

      {/* ── Needs Attention Carousel (3D Status Orbs on Mobile) ── */}
      <section aria-labelledby="mobile-needs-attention-heading" className="pt-0.5 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3 h-3 stroke-[2.2]" aria-hidden="true" />
            </div>
            <h2 id="mobile-needs-attention-heading" className="text-xs font-bold text-slate-800 tracking-tight">
              {DASHBOARD_COPY.sectionHeading}
            </h2>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shadow-2xs ${
              totalActionable === 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {totalActionable === 0 ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 stroke-[2.5]" aria-hidden="true" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
            )}
            <span>{badgeText}</span>
          </span>
        </div>

        {/* ── Bounded Outer Stage ── */}
        <div className="relative w-full rounded-2xl bg-white border border-slate-200/90 shadow-2xs py-3.5 px-3 overflow-hidden">
          {/* Horizontal snap-scroll carousel track */}
          <div
            ref={carouselTrackRef}
            onScroll={handleCarouselScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none overscroll-x-contain touch-pan-y py-1 px-1 -mx-1"
            style={{ WebkitOverflowScrolling: 'touch' }}
            role="region"
            aria-label="Action items 3D carousel"
          >
            {/* Mobile Card 1: Forms to finish (Teal) */}
            <div
              data-card-slide="0"
              className="shrink-0 snap-start w-[196px] sm:w-[204px] flex justify-center"
            >
              <Link
                href={DASHBOARD_COPY.cards.formsToFinish.href}
                prefetch={true}
                onClick={(e) => handleProtectedNav(e, DASHBOARD_COPY.cards.formsToFinish.href)}
                className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-full w-[180px]"
              >
                <div className="relative w-full aspect-square rounded-full border-2 border-teal-200/90 bg-gradient-to-b from-teal-50/70 via-white/95 to-teal-50/40 backdrop-blur-md shadow-xs hover:shadow-sm pt-2.5 px-3 pb-3 flex flex-col items-center justify-between text-center overflow-hidden cursor-pointer">
                  {/* Ambient Glow & Concentric Inner Ring */}
                  <div className="absolute inset-0 rounded-full bg-teal-400/10 blur-xl pointer-events-none" />
                  <div className="absolute inset-1.5 rounded-full border border-teal-200/50 pointer-events-none" />

                  {/* Three.js 3D WebGL Background Aura */}
                  <ThreeStatusOrb
                    variant="teal"
                    count={count}
                    isAllClear={count === 0}
                  />

                  {/* Top Pill Header */}
                  <div className="relative z-10 pt-0.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-100/90 text-teal-800 border border-teal-200 text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                      <FileText className="w-3 h-3" aria-hidden="true" />
                      <span>{DASHBOARD_COPY.cards.formsToFinish.title}</span>
                    </span>
                  </div>

                  {/* Center Hero Counter & Status */}
                  <div className="relative z-10 flex flex-col items-center justify-center my-auto -mt-0.5">
                    <span className="text-3xl font-black text-teal-950 tracking-tight drop-shadow-xs">
                      {draftsLoading ? (
                        <span className="inline-block w-7 h-7 bg-teal-200 animate-pulse rounded-full" />
                      ) : (
                        count
                      )}
                    </span>
                    <span className="text-[10px] font-semibold text-teal-900/80 mt-0.5 max-w-[130px] leading-tight text-center">
                      {count === 0
                        ? DASHBOARD_COPY.cards.formsToFinish.allClearText
                        : DASHBOARD_COPY.cards.formsToFinish.description}
                    </span>
                  </div>

                  {/* Bottom Action Pill */}
                  <div className="relative z-10 w-full flex justify-center pb-0.5">
                    <span className="inline-flex items-center justify-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 shadow-xs border border-teal-700">
                      <span>{DASHBOARD_COPY.cards.formsToFinish.linkText}</span>
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Mobile Card 2: Waiting to send (Amber) */}
            <div
              data-card-slide="1"
              className="shrink-0 snap-start w-[196px] sm:w-[204px] flex justify-center"
            >
              <Link
                href={DASHBOARD_COPY.cards.waitingToSend.href}
                prefetch={true}
                onClick={(e) => handleProtectedNav(e, DASHBOARD_COPY.cards.waitingToSend.href)}
                className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600 rounded-full w-[180px]"
              >
                <div className="relative w-full aspect-square rounded-full border-2 border-amber-200/90 bg-gradient-to-b from-amber-50/70 via-white/95 to-amber-50/40 backdrop-blur-md shadow-xs hover:shadow-sm pt-2.5 px-3 pb-3 flex flex-col items-center justify-between text-center overflow-hidden cursor-pointer">
                  {/* Ambient Glow & Concentric Inner Ring */}
                  <div className="absolute inset-0 rounded-full bg-amber-400/10 blur-xl pointer-events-none" />
                  <div className="absolute inset-1.5 rounded-full border border-amber-200/50 pointer-events-none" />

                  {/* Three.js 3D WebGL Background Aura */}
                  <ThreeStatusOrb
                    variant="amber"
                    count={waitingCount}
                    isAllClear={waitingCount === 0}
                  />

                  {/* Top Pill Header */}
                  <div className="relative z-10 pt-0.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100/90 text-amber-900 border border-amber-200 text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                      <Clock className="w-3 h-3 text-amber-800" aria-hidden="true" />
                      <span>{DASHBOARD_COPY.cards.waitingToSend.title}</span>
                    </span>
                  </div>

                  {/* Center Hero Counter & Status */}
                  <div className="relative z-10 flex flex-col items-center justify-center my-auto -mt-0.5">
                    <span className="text-3xl font-black text-amber-950 tracking-tight drop-shadow-xs">
                      {waitingLoading ? (
                        <span className="inline-block w-7 h-7 bg-amber-200 animate-pulse rounded-full" />
                      ) : (
                        waitingCount
                      )}
                    </span>
                    <span className="text-[10px] font-semibold text-amber-900/80 mt-0.5 max-w-[130px] leading-tight text-center">
                      {waitingCount === 0
                        ? DASHBOARD_COPY.cards.waitingToSend.allClearText
                        : DASHBOARD_COPY.cards.waitingToSend.description}
                    </span>
                  </div>

                  {/* Bottom Action Pill */}
                  <div className="relative z-10 w-full flex justify-center pb-0.5">
                    <span className="inline-flex items-center justify-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-to-r from-amber-700 via-amber-600 to-amber-800 shadow-xs border border-amber-700">
                      <span>{DASHBOARD_COPY.cards.waitingToSend.linkText}</span>
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Mobile Card 3: Pendings (Rose) */}
            <div
              data-card-slide="2"
              className="shrink-0 snap-start w-[196px] sm:w-[204px] flex justify-center"
            >
              <div className="relative w-[180px] aspect-square rounded-full border-2 border-rose-200/90 bg-gradient-to-b from-rose-50/70 via-white/95 to-rose-50/40 backdrop-blur-md shadow-xs hover:shadow-sm pt-2.5 px-2.5 pb-2.5 flex flex-col items-center justify-between text-center overflow-hidden">
                {/* Ambient Glow & Concentric Inner Ring */}
                <div className="absolute inset-0 rounded-full bg-rose-400/10 blur-xl pointer-events-none" />
                <div className="absolute inset-1.5 rounded-full border border-rose-200/50 pointer-events-none" />

                {/* Three.js 3D WebGL Background Aura */}
                <ThreeStatusOrb
                  variant="rose"
                  count={pendingsTotal}
                  isAllClear={pendingsTotal === 0}
                />

                {/* Top Pill Header */}
                <div className="relative z-10 pt-0.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100/90 text-rose-900 border border-rose-200 text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                    <AlertTriangle className="w-3 h-3 text-rose-800" aria-hidden="true" />
                    <span>{DASHBOARD_COPY.cards.pendings.title}</span>
                  </span>
                </div>

                {/* Center Hero Counter & Status */}
                <div className="relative z-10 flex flex-col items-center justify-center my-auto -mt-0.5">
                  <span className="text-3xl font-black text-rose-950 tracking-tight drop-shadow-xs">
                    {submittedLoading ? (
                      <span className="inline-block w-7 h-7 bg-rose-200 animate-pulse rounded-full" />
                    ) : (
                      pendingsTotal
                    )}
                  </span>
                  <span className="text-[10px] font-semibold text-rose-900/80 mt-0.5 max-w-[130px] leading-tight text-center">
                    {pendingsTotal === 0
                      ? DASHBOARD_COPY.cards.pendings.allClearText
                      : DASHBOARD_COPY.cards.pendings.description}
                  </span>
                </div>

                {/* Bottom Sub-Pills */}
                <div className="relative z-10 w-full flex flex-col items-center gap-1 max-w-[136px] pb-0.5">
                  <Link
                    href={DASHBOARD_COPY.cards.pendings.rows.missingDocs.href}
                    prefetch={true}
                    onClick={(e) => handleProtectedNav(e, DASHBOARD_COPY.cards.pendings.rows.missingDocs.href)}
                    className="w-full inline-flex items-center justify-between gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-rose-950 bg-rose-100/90 hover:bg-rose-200 border border-rose-300 shadow-2xs transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-1 truncate min-w-0">
                      <FileWarning className="w-2.5 h-2.5 text-rose-700 shrink-0" aria-hidden="true" />
                      <span className="truncate">{DASHBOARD_COPY.cards.pendings.rows.missingDocs.label}</span>
                    </span>
                    <span className="font-mono text-[10px] px-1 rounded-full bg-white text-rose-900 border border-rose-200 shrink-0 ml-1">
                      {submittedLoading ? (
                        <span className="inline-block w-2.5 h-2 bg-rose-200 animate-pulse rounded" />
                      ) : (
                        submittedMissingDocsCount
                      )}
                    </span>
                  </Link>

                  <Link
                    href={DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.href}
                    prefetch={true}
                    onClick={(e) => handleProtectedNav(e, DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.href)}
                    className="w-full inline-flex items-center justify-between gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-rose-950 bg-rose-100/90 hover:bg-rose-200 border border-rose-300 shadow-2xs transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-1 truncate min-w-0">
                      <Landmark className="w-2.5 h-2.5 text-rose-700 shrink-0" aria-hidden="true" />
                      <span className="truncate">{DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label}</span>
                    </span>
                    <span className="font-mono text-[10px] px-1 rounded-full bg-white text-rose-900 border border-rose-200 shrink-0 ml-1">
                      {submittedLoading ? (
                        <span className="inline-block w-2.5 h-2 bg-rose-200 animate-pulse rounded" />
                      ) : (
                        approvedBankPendingCount
                      )}
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            {/* End spacing spacer to ensure last card can scroll completely into view */}
            <div className="w-1 shrink-0" aria-hidden="true" />
          </div>

          {/* ── Compact Pagination Controls ── */}
          <div
            className="flex items-center justify-center gap-1 mt-2.5 pt-1 border-t border-slate-100/80"
            role="tablist"
            aria-label="Needs attention carousel pagination"
          >
            {[
              { label: DASHBOARD_COPY.cards.formsToFinish.title, index: 0, activeClass: 'bg-teal-600' },
              { label: DASHBOARD_COPY.cards.waitingToSend.title, index: 1, activeClass: 'bg-amber-600' },
              { label: DASHBOARD_COPY.cards.pendings.title, index: 2, activeClass: 'bg-rose-600' },
            ].map((item) => {
              const isActive = activeCardIndex === item.index;
              return (
                <button
                  key={item.index}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Go to ${item.label}`}
                  onClick={() => scrollToIndex(item.index)}
                  className="group relative flex items-center justify-center min-w-[44px] min-h-[44px] p-2 rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <span
                    className={`block rounded-full transition-all duration-200 ${
                      isActive
                        ? `w-5 h-2 ${item.activeClass} shadow-2xs`
                        : 'w-2 h-2 bg-slate-300 group-hover:bg-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Unified Menu List (Full width rows with left icon, count pill, subtitle, chevron) ── */}
      <div className="space-y-2.5" role="list">

        {/* ── Menu Item 2: Drafts ── */}
        <div role="listitem">
          <Link
            href="/assessment/drafts"
            prefetch={true}
            className="block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 rounded-2xl"
            onClick={(e) => handleProtectedNav(e, '/assessment/drafts')}
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
            onClick={(e) => handleProtectedNav(e, '/assessment/sync?tab=outbox')}
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
                        effectiveWaitingCount
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
              onClick={() => {
                if (!isAuthenticated && onRequireAuth) {
                  onRequireAuth();
                  return;
                }
                setIsPendingsExpanded(!isPendingsExpanded);
              }}
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
                  onClick={(e) => handleProtectedNav(e, DASHBOARD_COPY.cards.pendings.rows.missingDocs.href)}
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
                        effectiveMissingDocs
                      )}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                  </div>
                </Link>

                {/* Sub-row B: Bank details needed */}
                <Link
                  href={DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.href}
                  onClick={(e) => handleProtectedNav(e, DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.href)}
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
                        effectiveBankPending
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
