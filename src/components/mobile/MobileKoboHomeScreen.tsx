'use client';

import React, { useState, useEffect } from 'react';
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

  // Single truth: authenticated users see actual counts; signed-out workers see 0
  const count = isAuthenticated ? (draftsCount ?? drafts?.length ?? 0) : 0;
  const effectiveMissingDocs = isAuthenticated ? submittedMissingDocsCount : 0;
  const effectiveBankPending = isAuthenticated ? approvedBankPendingCount : 0;
  const effectiveWaitingCount = isAuthenticated ? waitingCount : 0;
  const pendingsTotal = effectiveMissingDocs + effectiveBankPending;
  const totalActionable = count + effectiveWaitingCount + pendingsTotal;

  // Expandable Pendings complete breakdown state
  const [isPendingsExpanded, setIsPendingsExpanded] = useState(false);

  // State-driven active bridge states: calm/low-opacity when connected orbs are 0, active when >= 1
  const isTopBridgeActive = count >= 1 || pendingsTotal >= 1;
  const isBottomBridgeActive = effectiveWaitingCount >= 1 || pendingsTotal >= 1;

  // Detect user's reduced-motion preference for SVG flow conduits
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

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

      {/* ── Needs Attention Stage Section ── */}
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

        {/* ── Bounded 3-Orb Architectural Stage Container ── */}
        <div
          className="w-full rounded-[24px] p-3.5 relative overflow-hidden bg-gradient-to-br from-white/95 via-slate-50/90 to-emerald-50/30 border border-slate-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_24px_-12px_rgba(15,23,42,0.08)]"
          role="region"
          aria-label="Action items 3D stage"
        >
          {/* Crisp visible micro-dot grid background */}
          <div
            className="absolute inset-0 opacity-[0.22] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#94a3b8 1.2px, transparent 1.2px)',
              backgroundSize: '15px 15px',
            }}
            aria-hidden="true"
          />

          {/* ── Responsive SVG Flow Conduits & Curved Metaball Bridges ── */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-0"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              {/* Metaball liquid fusion filter for background glass bridges */}
              <filter id="liquidMetaball" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
                  result="goo"
                />
                <feComposite in="SourceGraphic" in2="goo" operator="atop" />
              </filter>

              {/* Luminous stardust sparkle bloom filter */}
              <filter id="stardustGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Delicate star glow filter for twinkling star particles */}
              <filter id="starGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.45" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Linear gradient: emerald-to-rose for top conduit & bridge */}
              <linearGradient id="topConduitGrad" x1="0%" y1="0%" x2="100%" y2="80%">
                <stop offset="0%" stopColor="#059669" />
                <stop offset="35%" stopColor="#10b981" />
                <stop offset="50%" stopColor="#2dd4bf" />
                <stop offset="75%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#e11d48" />
              </linearGradient>

              {/* Linear gradient: amber-to-rose for bottom conduit & bridge */}
              <linearGradient id="bottomConduitGrad" x1="0%" y1="100%" x2="100%" y2="20%">
                <stop offset="0%" stopColor="#d97706" />
                <stop offset="35%" stopColor="#f59e0b" />
                <stop offset="50%" stopColor="#fbbf24" />
                <stop offset="75%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#e11d48" />
              </linearGradient>

              <linearGradient id="topBridgeGrad" x1="25%" y1="20%" x2="65%" y2="45%">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.9" />
                <stop offset="25%" stopColor="#0d9488" stopOpacity="0.85" />
                <stop offset="50%" stopColor="#14b8a6" stopOpacity="0.8" />
                <stop offset="75%" stopColor="#f43f5e" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="0.9" />
              </linearGradient>

              <linearGradient id="bottomBridgeGrad" x1="25%" y1="80%" x2="65%" y2="55%">
                <stop offset="0%" stopColor="#d97706" stopOpacity="0.9" />
                <stop offset="25%" stopColor="#f59e0b" stopOpacity="0.85" />
                <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.8" />
                <stop offset="75%" stopColor="#f43f5e" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="0.9" />
              </linearGradient>

              {/* Soft glow filters for ambient bloom */}
              <filter id="emeraldGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="amberGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Ambient Under-Glow (Soft Colored Bloom behind each orb) */}
            <g opacity="0.25" filter="url(#emeraldGlow)">
              <circle cx="21" cy="29" r="15" fill="#059669" />
            </g>
            <g opacity="0.25" filter="url(#amberGlow)">
              <circle cx="21" cy="71" r="15" fill="#d97706" />
            </g>
            <g opacity="0.25" filter="url(#emeraldGlow)">
              <circle cx="71" cy="50" r="22" fill="#e11d48" />
            </g>

            {/* ── Organic Curved Fluid Bridges (Concave Waist Meniscus) ── */}
            <g className="transition-opacity duration-500 ease-out">
              {/* Top Flared Meniscus Bridge: connects Drafts to Pendings */}
              <path
                d="M 31 16 C 38 23, 44 24, 53 33 L 50 47 C 42 34, 38 35, 34 38 Z"
                fill="url(#topBridgeGrad)"
                className={`transition-opacity duration-500 ease-out ${
                  isTopBridgeActive ? 'opacity-85' : 'opacity-40'
                }`}
              />
              {/* Bottom Flared Meniscus Bridge: connects Outbox to Pendings */}
              <path
                d="M 34 62 C 38 65, 42 66, 50 53 L 53 67 C 44 76, 38 77, 31 84 Z"
                fill="url(#bottomBridgeGrad)"
                className={`transition-opacity duration-500 ease-out ${
                  isBottomBridgeActive ? 'opacity-85' : 'opacity-40'
                }`}
              />
            </g>

            {/* Specular Highlight Sheen along Outer Curved Bridge Rims */}
            {/* Top Bridge Upper Specular Rim */}
            <path
              d="M 31 16 C 38 23, 44 24, 53 33"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth="0.8"
              fill="none"
              strokeLinecap="round"
              className={`transition-opacity duration-500 ${
                isTopBridgeActive ? 'opacity-85' : 'opacity-35'
              }`}
            />
            {/* Top Bridge Lower Specular Rim */}
            <path
              d="M 34 38 C 38 35, 42 34, 50 47"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="0.6"
              fill="none"
              strokeLinecap="round"
              className={`transition-opacity duration-500 ${
                isTopBridgeActive ? 'opacity-70' : 'opacity-25'
              }`}
            />
            {/* Bottom Bridge Upper Specular Rim */}
            <path
              d="M 34 62 C 38 65, 42 66, 50 53"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="0.6"
              fill="none"
              strokeLinecap="round"
              className={`transition-opacity duration-500 ${
                isBottomBridgeActive ? 'opacity-70' : 'opacity-25'
              }`}
            />
            {/* Bottom Bridge Lower Specular Rim */}
            <path
              d="M 31 84 C 38 77, 44 76, 53 67"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth="0.8"
              fill="none"
              strokeLinecap="round"
              className={`transition-opacity duration-500 ${
                isBottomBridgeActive ? 'opacity-85' : 'opacity-35'
              }`}
            />

            {/* ── Highlighted Feature: Luminous Stardust Constellation (Twinkling Micro-Stars) ── */}
            {/* Top Bridge Stardust Constellation (Stationary Twinkling Stars inside Neck) */}
            <g
              filter="url(#starGlow)"
              className={`transition-opacity duration-500 ${
                isTopBridgeActive ? 'opacity-100' : 'opacity-45'
              }`}
            >
              <circle cx="37" cy="26" r="0.45" fill="#ffffff">
                <animate attributeName="opacity" values="0.25;1;0.4;0.9;0.25" dur="2.1s" repeatCount="indefinite" />
              </circle>
              <circle cx="40" cy="24" r="0.35" fill="#a7f3d0">
                <animate attributeName="opacity" values="0.8;0.2;0.95;0.3;0.8" dur="1.7s" repeatCount="indefinite" />
              </circle>
              <circle cx="43" cy="27" r="0.55" fill="#ffffff">
                <animate attributeName="opacity" values="0.3;0.95;0.2;1;0.3" dur="2.5s" repeatCount="indefinite" />
              </circle>
              <circle cx="39" cy="29" r="0.4" fill="#ffffff">
                <animate attributeName="opacity" values="0.9;0.3;0.7;0.2;0.9" dur="1.9s" repeatCount="indefinite" />
              </circle>
              <circle cx="44" cy="31" r="0.45" fill="#6ee7b7">
                <animate attributeName="opacity" values="0.2;0.85;0.3;0.95;0.2" dur="2.3s" repeatCount="indefinite" />
              </circle>
              <circle cx="47" cy="30" r="0.35" fill="#ffffff">
                <animate attributeName="opacity" values="0.7;0.2;1;0.4;0.7" dur="2.0s" repeatCount="indefinite" />
              </circle>
              <circle cx="46" cy="35" r="0.5" fill="#fecdd3">
                <animate attributeName="opacity" values="0.3;1;0.5;0.8;0.3" dur="2.7s" repeatCount="indefinite" />
              </circle>
              <circle cx="42" cy="33" r="0.3" fill="#ffffff">
                <animate attributeName="opacity" values="0.9;0.4;0.2;0.85;0.9" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </g>

            {/* Bottom Bridge Stardust Constellation (Stationary Twinkling Stars inside Neck) */}
            <g
              filter="url(#starGlow)"
              className={`transition-opacity duration-500 ${
                isBottomBridgeActive ? 'opacity-100' : 'opacity-45'
              }`}
            >
              <circle cx="37" cy="74" r="0.45" fill="#ffffff">
                <animate attributeName="opacity" values="0.25;1;0.4;0.9;0.25" dur="2.1s" repeatCount="indefinite" />
              </circle>
              <circle cx="40" cy="76" r="0.35" fill="#fef08a">
                <animate attributeName="opacity" values="0.8;0.2;0.95;0.3;0.8" dur="1.7s" repeatCount="indefinite" />
              </circle>
              <circle cx="43" cy="73" r="0.55" fill="#ffffff">
                <animate attributeName="opacity" values="0.3;0.95;0.2;1;0.3" dur="2.5s" repeatCount="indefinite" />
              </circle>
              <circle cx="39" cy="71" r="0.4" fill="#ffffff">
                <animate attributeName="opacity" values="0.9;0.3;0.7;0.2;0.9" dur="1.9s" repeatCount="indefinite" />
              </circle>
              <circle cx="44" cy="69" r="0.45" fill="#fde68a">
                <animate attributeName="opacity" values="0.2;0.85;0.3;0.95;0.2" dur="2.3s" repeatCount="indefinite" />
              </circle>
              <circle cx="47" cy="70" r="0.35" fill="#ffffff">
                <animate attributeName="opacity" values="0.7;0.2;1;0.4;0.7" dur="2.0s" repeatCount="indefinite" />
              </circle>
              <circle cx="46" cy="65" r="0.5" fill="#fecdd3">
                <animate attributeName="opacity" values="0.3;1;0.5;0.8;0.3" dur="2.7s" repeatCount="indefinite" />
              </circle>
              <circle cx="42" cy="67" r="0.3" fill="#ffffff">
                <animate attributeName="opacity" values="0.9;0.4;0.2;0.85;0.9" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </g>

            {/* Top Conduit Spine Path (Smooth Curved Centerline for test contracts) */}
            <path
              id="topConduitMain"
              d="M 28 24 C 36 26, 42 29, 53 40"
              stroke="url(#topConduitGrad)"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
              className="opacity-25"
            />

            {/* Bottom Conduit Spine Path (Smooth Curved Centerline for test contracts) */}
            <path
              id="bottomConduitMain"
              d="M 28 76 C 36 74, 42 71, 53 60"
              stroke="url(#bottomConduitGrad)"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
              className="opacity-25"
            />

            {/* Staggered slow-drifting tiny twinkling stars moving along curved conduits */}
            {!prefersReducedMotion && (
              <>
                {/* Moving Stars: Top Conduit */}
                <g filter="url(#starGlow)">
                  <circle r="0.55" fill="#ffffff">
                    <animateMotion
                      dur="3.4s"
                      repeatCount="indefinite"
                      path="M 28 24 C 36 26, 42 29, 53 40"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0.9;1;0.7;0"
                      dur="3.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle r="0.45" fill="#a7f3d0">
                    <animateMotion
                      dur="3.4s"
                      begin="1.1s"
                      repeatCount="indefinite"
                      path="M 28 24 C 36 26, 42 29, 53 40"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0.8;1;0.6;0"
                      dur="3.4s"
                      begin="1.1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle r="0.38" fill="#ffffff">
                    <animateMotion
                      dur="3.4s"
                      begin="2.2s"
                      repeatCount="indefinite"
                      path="M 28 24 C 36 26, 42 29, 53 40"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;1;0.8;0.5;0"
                      dur="3.4s"
                      begin="2.2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>

                {/* Moving Stars: Bottom Conduit */}
                <g filter="url(#starGlow)">
                  <circle r="0.55" fill="#ffffff">
                    <animateMotion
                      dur="3.4s"
                      repeatCount="indefinite"
                      path="M 28 76 C 36 74, 42 71, 53 60"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0.9;1;0.7;0"
                      dur="3.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle r="0.45" fill="#fde68a">
                    <animateMotion
                      dur="3.4s"
                      begin="1.1s"
                      repeatCount="indefinite"
                      path="M 28 76 C 36 74, 42 71, 53 60"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0.8;1;0.6;0"
                      dur="3.4s"
                      begin="1.1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle r="0.38" fill="#ffffff">
                    <animateMotion
                      dur="3.4s"
                      begin="2.2s"
                      repeatCount="indefinite"
                      path="M 28 76 C 36 74, 42 71, 53 60"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;1;0.8;0.5;0"
                      dur="3.4s"
                      begin="2.2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              </>
            )}
          </svg>

          {/* ── 3. Asymmetric 2-Column Geometry (42% Left / 58% Right) ── */}
          <div className="relative z-10 grid grid-cols-12 gap-2 items-center">
            {/* Left Column (col-span-5 flex flex-col gap-3 items-center) */}
            <div className="col-span-5 flex flex-col gap-3 items-center justify-center">
              {/* Top-Left Orb: Forms to finish / Drafts (Teal 3D Crystalline Soccer-Ball Orb) */}
              <Link
                href="/assessment/drafts"
                prefetch={true}
                onClick={(e) => handleProtectedNav(e, '/assessment/drafts')}
                aria-label={`${DASHBOARD_COPY.cards.formsToFinish.title}: ${count} - ${DASHBOARD_COPY.cards.formsToFinish.linkText}`}
                className={`group relative w-[118px] h-[118px] min-[390px]:w-[126px] min-[390px]:h-[126px] aspect-square rounded-full border-2 border-teal-200/90 bg-gradient-to-b from-teal-50/75 via-white/95 to-teal-50/45 backdrop-blur-md transition-all duration-300 pt-2 px-1.5 pb-2.5 flex flex-col items-center justify-between text-center overflow-hidden cursor-pointer select-none active:scale-[0.96] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 ${
                  count >= 1
                    ? 'animate-orb-pulse-emerald ring-1 ring-white/90 shadow-lg'
                    : 'shadow-md hover:shadow-xl hover:border-teal-400 hover:scale-[1.03] motion-reduce:hover:scale-100'
                }`}
                style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              >
                {/* Ambient Glow & Concentric Inner Ring */}
                <div className="absolute inset-0 rounded-full bg-teal-400/10 blur-xl pointer-events-none" aria-hidden="true" />
                <div className="absolute inset-1.5 rounded-full border border-teal-200/50 pointer-events-none" aria-hidden="true" />

                {/* Active ThreeStatusOrb: 3D Crystalline Soccer-Ball with Polyhedron & Curved Seams */}
                <ThreeStatusOrb
                  variant="teal"
                  count={count}
                  isAllClear={count === 0}
                />

                {/* Top Pill Header */}
                <div className="relative z-10 pt-0.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-100/90 text-teal-900 border border-teal-200 text-[8.5px] min-[390px]:text-[9px] font-bold uppercase tracking-wider shadow-2xs whitespace-nowrap">
                    <FileText className="w-2.5 h-2.5 text-teal-800" aria-hidden="true" />
                    <span>DRAFTS</span>
                    <span className="sr-only"> - {DASHBOARD_COPY.cards.formsToFinish.title}</span>
                  </span>
                </div>

                {/* Center Metric */}
                <div className="relative z-10 flex flex-col items-center justify-center my-auto -mt-0.5 px-2">
                  <span className="relative z-10 text-3xl min-[390px]:text-4xl font-black text-teal-950 tracking-tight leading-none tabular-nums drop-shadow-xs">
                    {draftsLoading ? (
                      <span className="inline-block w-6 h-6 bg-teal-200 animate-pulse rounded-full" />
                    ) : (
                      count
                    )}
                  </span>
                  <span className="relative z-10 text-[10px] min-[390px]:text-[10.5px] font-semibold text-teal-900/80 mt-0.5 tracking-tight px-1 leading-tight text-center">
                    {count === 0 ? DASHBOARD_COPY.cards.formsToFinish.allClearText : `${count} saved`}
                  </span>
                </div>

                {/* Bottom Action Pill (pb-1.5 mb-1 for generous bottom breathing room) */}
                <div className="relative z-10 w-full flex justify-center pb-1.5 mb-1">
                  <span className="inline-flex items-center justify-center gap-0.5 px-3 py-1 rounded-full text-[9.5px] font-semibold text-white bg-teal-800 hover:bg-teal-900 shadow-sm border border-teal-700/50 whitespace-nowrap">
                    <span>Continue ›</span>
                    <span className="sr-only"> {DASHBOARD_COPY.cards.formsToFinish.linkText}</span>
                  </span>
                </div>
              </Link>

              {/* Bottom-Left Orb: Waiting to Send / Outbox (Amber 3D Crystalline Soccer-Ball Orb) */}
              <Link
                href="/assessment/sync?tab=outbox"
                prefetch={true}
                onClick={(e) => handleProtectedNav(e, '/assessment/sync?tab=outbox')}
                aria-label={`${DASHBOARD_COPY.cards.waitingToSend.title}: ${effectiveWaitingCount} - ${DASHBOARD_COPY.cards.waitingToSend.linkText}`}
                className={`group relative w-[118px] h-[118px] min-[390px]:w-[126px] min-[390px]:h-[126px] aspect-square rounded-full border-2 border-amber-200/90 bg-gradient-to-b from-amber-50/75 via-white/95 to-amber-50/45 backdrop-blur-md transition-all duration-300 pt-2 px-1.5 pb-2.5 flex flex-col items-center justify-between text-center overflow-hidden cursor-pointer select-none active:scale-[0.96] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600 ${
                  effectiveWaitingCount >= 1
                    ? 'animate-orb-pulse-amber ring-1 ring-white/90 shadow-lg'
                    : 'shadow-md hover:shadow-xl hover:border-amber-400 hover:scale-[1.03] motion-reduce:hover:scale-100'
                }`}
                style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              >
                {/* Ambient Glow & Concentric Inner Ring */}
                <div className="absolute inset-0 rounded-full bg-amber-400/10 blur-xl pointer-events-none" aria-hidden="true" />
                <div className="absolute inset-1.5 rounded-full border border-amber-200/50 pointer-events-none" aria-hidden="true" />

                {/* Active ThreeStatusOrb: 3D Crystalline Soccer-Ball with Polyhedron & Curved Seams */}
                <ThreeStatusOrb
                  variant="amber"
                  count={effectiveWaitingCount}
                  isAllClear={effectiveWaitingCount === 0}
                />

                {/* Top Pill Header */}
                <div className="relative z-10 pt-0.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100/90 text-amber-900 border border-amber-200 text-[8.5px] min-[390px]:text-[9px] font-bold uppercase tracking-wider shadow-2xs whitespace-nowrap">
                    <Clock className="w-2.5 h-2.5 text-amber-800" aria-hidden="true" />
                    <span>OUTBOX</span>
                    <span className="sr-only"> - {DASHBOARD_COPY.cards.waitingToSend.title}</span>
                  </span>
                </div>

                {/* Center Metric */}
                <div className="relative z-10 flex flex-col items-center justify-center my-auto -mt-0.5 px-2">
                  <span className="relative z-10 text-3xl min-[390px]:text-4xl font-black text-amber-950 tracking-tight leading-none tabular-nums drop-shadow-xs">
                    {waitingLoading ? (
                      <span className="inline-block w-6 h-6 bg-amber-200 animate-pulse rounded-full" />
                    ) : (
                      effectiveWaitingCount
                    )}
                  </span>
                  <span className="relative z-10 text-[10px] min-[390px]:text-[10.5px] font-semibold text-amber-900/80 mt-0.5 tracking-tight px-1 leading-tight text-center">
                    {effectiveWaitingCount === 0 ? 'All items sent' : `${effectiveWaitingCount} in outbox`}
                  </span>
                </div>

                {/* Bottom Action Pill (pb-1.5 mb-1 for generous bottom breathing room) */}
                <div className="relative z-10 w-full flex justify-center pb-1.5 mb-1">
                  <span className="inline-flex items-center justify-center gap-0.5 px-3 py-1 rounded-full text-[9.5px] font-semibold text-white bg-amber-800 hover:bg-amber-900 shadow-sm border border-amber-700/50 whitespace-nowrap">
                    <span>Outbox ›</span>
                    <span className="sr-only"> {DASHBOARD_COPY.cards.waitingToSend.linkText}</span>
                  </span>
                </div>
              </Link>
            </div>

            {/* Right Column: Hero Pendings Orb (col-span-7 flex items-center justify-center) */}
            <div className="col-span-7 flex items-center justify-center">
              {/* Single coherent keyboard-focusable control for Pendings */}
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated && onRequireAuth) {
                    onRequireAuth();
                    return;
                  }
                  setIsPendingsExpanded(!isPendingsExpanded);
                }}
                aria-expanded={isPendingsExpanded}
                aria-controls="mobile-pendings-breakdown"
                aria-label={`${DASHBOARD_COPY.cards.pendings.title}: ${pendingsTotal} items. ${
                  pendingsTotal > 0
                    ? isPendingsExpanded
                      ? 'Hide breakdown'
                      : 'Open document and bank breakdown'
                    : 'All clear'
                }`}
                className={`group relative w-[174px] h-[174px] min-[390px]:w-[188px] min-[390px]:h-[188px] aspect-square rounded-full border-2 border-rose-200/90 bg-gradient-to-b from-rose-50/75 via-white/95 to-rose-50/45 backdrop-blur-md transition-all duration-300 py-2.5 px-2 flex flex-col items-center justify-between text-center overflow-hidden cursor-pointer select-none active:scale-[0.96] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-600 ${
                  pendingsTotal >= 1
                    ? 'animate-orb-pulse-rose ring-1 ring-white/90 shadow-xl'
                    : 'shadow-md hover:shadow-xl hover:border-rose-400'
                }`}
                style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              >
                {/* Ambient Glow & Concentric Inner Ring */}
                <div className="absolute inset-0 rounded-full bg-rose-400/10 blur-xl pointer-events-none" aria-hidden="true" />
                <div className="absolute inset-2 rounded-full border border-rose-200/50 pointer-events-none" aria-hidden="true" />

                {/* Active ThreeStatusOrb: 3D Crystalline Soccer-Ball with Polyhedron & Curved Seams */}
                <ThreeStatusOrb
                  variant="rose"
                  count={pendingsTotal}
                  isAllClear={pendingsTotal === 0}
                />

                {/* Top Pill Header */}
                <div className="relative z-10 pt-0.5">
                  <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-rose-100/90 text-rose-900 border border-rose-200 text-[9px] min-[390px]:text-[9.5px] font-bold uppercase tracking-wider shadow-2xs whitespace-nowrap">
                    <AlertTriangle className="w-2.5 h-2.5 text-rose-800" aria-hidden="true" />
                    <span>PENDINGS</span>
                    <span className="sr-only"> - {DASHBOARD_COPY.cards.pendings.title}</span>
                  </span>
                </div>

                {/* Center Metric */}
                <div className="relative z-10 flex flex-col items-center justify-center my-auto -mt-1 px-2">
                  <span className="relative z-10 text-4xl min-[390px]:text-5xl font-black text-rose-950 tracking-tight leading-none tabular-nums drop-shadow-xs">
                    {submittedLoading ? (
                      <span className="inline-block w-8 h-8 bg-rose-200 animate-pulse rounded-full" />
                    ) : (
                      pendingsTotal
                    )}
                  </span>
                  <span className="relative z-10 text-[10px] min-[390px]:text-[10.5px] font-semibold text-rose-900/80 mt-0.5 tracking-tight px-1 leading-tight text-center">
                    {pendingsTotal === 0
                      ? DASHBOARD_COPY.cards.pendings.allClearText
                      : pendingsTotal === 1
                        ? '1 item needs attention'
                        : `${pendingsTotal} items need attention`}
                  </span>
                </div>

                {/* Docs and Bank Floating Chips (Visual spans inside the button to avoid invalid nested interactive links) */}
                <div className="relative z-10 flex items-center justify-center gap-1.5 px-1 pb-0.5">
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] min-[390px]:text-[9.5px] font-bold tracking-tight rounded-full bg-white text-rose-950 border border-rose-200 shadow-2xs tabular-nums whitespace-nowrap"
                  >
                    <FileWarning className="w-2.5 h-2.5 shrink-0 text-rose-700" aria-hidden="true" />
                    <span>Docs</span>
                    <span className="sr-only"> {DASHBOARD_COPY.cards.pendings.rows.missingDocs.label}</span>
                    <span className="font-mono text-[9px] min-[390px]:text-[9.5px] px-1 rounded-full font-bold shrink-0 text-rose-900 bg-rose-100">
                      {submittedLoading ? (
                        <span
                          className="inline-block w-2.5 h-2 bg-rose-200 animate-pulse rounded"
                          role="status"
                          aria-label="Loading missing docs count"
                        />
                      ) : (
                        effectiveMissingDocs
                      )}
                    </span>
                  </span>

                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] min-[390px]:text-[9.5px] font-bold tracking-tight rounded-full bg-white text-rose-950 border border-rose-200 shadow-2xs tabular-nums whitespace-nowrap"
                  >
                    <Landmark className="w-2.5 h-2.5 shrink-0 text-rose-700" aria-hidden="true" />
                    <span>Bank</span>
                    <span className="sr-only"> {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label}</span>
                    <span className="font-mono text-[9px] min-[390px]:text-[9.5px] px-1 rounded-full font-bold shrink-0 text-rose-900 bg-rose-100">
                      {submittedLoading ? (
                        <span
                          className="inline-block w-2.5 h-2 bg-rose-200 animate-pulse rounded"
                          role="status"
                          aria-label="Loading bank count"
                        />
                      ) : (
                        effectiveBankPending
                      )}
                    </span>
                  </span>
                </div>

                {/* Bottom Action Button (Emerald Green when all clear, Rose toggle pill when pending) */}
                <div className="relative z-10 w-full flex justify-center pb-0.5 mt-0.5">
                  <span
                    className={`inline-flex items-center justify-center gap-0.5 px-4 py-1 rounded-full text-[10px] min-[390px]:text-[10.5px] font-semibold text-white shadow-md whitespace-nowrap transition-all ${
                      pendingsTotal === 0
                        ? 'bg-emerald-700 border border-emerald-600/50'
                        : 'bg-rose-800 border border-rose-700/50'
                    }`}
                  >
                    <span>{pendingsTotal === 0 ? 'All clear ›' : (isPendingsExpanded ? 'Hide breakdown ▴' : 'Show breakdown ▾')}</span>
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* ── Pendings Complete Breakdown Card (Directly below stage when expanded) ── */}
        {isPendingsExpanded && (
          <div
            id="mobile-pendings-breakdown"
            className="w-full bg-rose-50/70 border border-rose-200/90 rounded-2xl p-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-rose-950">Pendings Breakdown</span>
              <span className="text-[11px] font-semibold text-rose-800">{pendingsTotal} actionable</span>
            </div>
            <div className="space-y-1.5">
              {/* Sub-row A: Missing documents */}
              <Link
                href={DASHBOARD_COPY.cards.pendings.rows.missingDocs.href}
                onClick={(e) => handleProtectedNav(e, DASHBOARD_COPY.cards.pendings.rows.missingDocs.href)}
                className="flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-rose-100/70 border border-rose-200/80 transition-colors min-h-[44px] cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <FileWarning className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {DASHBOARD_COPY.cards.pendings.rows.missingDocs.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono text-xs font-bold text-rose-900 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
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
                className="flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-rose-100/70 border border-rose-200/80 transition-colors min-h-[44px] cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <Landmark className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono text-xs font-bold text-rose-900 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
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
          </div>
        )}
      </section>

      {/* ── Retained Dedicated Card: Submitted Surveys (Confirmed on central server) ── */}
      <section aria-labelledby="mobile-submitted-surveys-heading" className="pt-1">
        <h3 id="mobile-submitted-surveys-heading" className="sr-only">Submitted Surveys</h3>
        <Link
          href="/assessment/sync?tab=submitted"
          prefetch={true}
          onClick={(e) => handleProtectedNav(e, '/assessment/sync?tab=submitted')}
          className="block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-2xl"
          aria-label={`Submitted surveys: ${submittedCount ?? 0} - Confirmed on central server`}
        >
          <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-800 leading-tight">Submitted surveys</h4>
                <p className="text-xs text-slate-500 font-medium truncate">
                  Confirmed on central server
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                {submittedLoading ? (
                  <span
                    className="inline-block w-4 h-3 bg-emerald-200 animate-pulse rounded"
                    role="status"
                    aria-label="Loading submitted count"
                  />
                ) : (
                  submittedCount ?? 0
                )}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </div>
          </div>
        </Link>
      </section>

      {/* ── Bottom Illustration (Natural vertical scroll, rendered where space permits) ── */}
      <section aria-label="Garden Playground" className="pt-2">
        <MiniatureGardenPlayground />
      </section>
    </div>
  );
}
