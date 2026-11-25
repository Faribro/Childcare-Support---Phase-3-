'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Clock,
  AlertTriangle,
  FileWarning,
  Landmark,
  CheckCircle2,
  ChevronRight,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AssessmentRecord } from '@/types/domain';
import { MiniatureGardenPlayground } from '@/components/garden/MiniatureGardenPlayground';
import { useScrollSoundscape } from '@/lib/audio/useScrollSoundscape';
import { RocketSurveyButton } from '@/components/launch/RocketSurveyButton';
import { useLaunchTransitionStore, selectIsLaunching } from '@/store/useLaunchTransitionStore';
import { DASHBOARD_COPY } from '@/lib/constants/dashboardCopy';
import type { FieldPrincipalInput, RouterPrefetchLike } from '@/lib/portal/portalWarmCache';
import { usePortalTransition } from '@/components/portal/usePortalTransition';
import {
  DraftsPortalOverlay,
  DocsPortalOverlay,
  BankPortalOverlay,
  SubmittedPortalGlow,
  PortalStatusIndicator,
} from '@/components/portal/PortalVisualEffects';

const FALLBACK_BROWSER_ROUTER: RouterPrefetchLike = {
  push: (href: string) => {
    if (typeof window !== 'undefined') window.location.assign(href);
  },
  prefetch: () => {},
};

// ─── Props ────────────────────────────────────────────────────────────────────

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
  onFormReady?: () => void;
  router?: RouterPrefetchLike;
  userRole?: string | null;
  principal?: FieldPrincipalInput;
}

// ─── GPU-Composited Keyframes (transform + opacity only for 60fps WebView) ───

const COSMIC_STYLES = `
  @keyframes kobo-star-twinkle {
    0%, 100% { opacity: 0.28; transform: scale(0.82); }
    50%      { opacity: 1;    transform: scale(1.22); }
  }
  @keyframes kobo-planet-float {
    0%, 100% { transform: translate3d(0, 0px, 0); }
    50%      { transform: translate3d(0, -5px, 0); }
  }
  @keyframes kobo-flame-flicker {
    0%, 100% { transform: scaleX(1) scaleY(1); opacity: 0.96; }
    35%      { transform: scaleX(0.84) scaleY(1.1); opacity: 0.84; }
    70%      { transform: scaleX(1.12) scaleY(0.92); opacity: 1; }
  }
  @keyframes kobo-halo-breathe {
    0%, 100% { opacity: 0.55; transform: scale(0.98); }
    50%      { opacity: 0.95; transform: scale(1.07); }
  }
  @keyframes kobo-sun-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes kobo-gem-drift {
    0%, 100% { transform: translate3d(0, 0px, 0) rotate(0deg); }
    50%      { transform: translate3d(0, -6px, 0) rotate(5deg); }
  }

  .kobo-star         { animation: kobo-star-twinkle var(--dur, 2.4s) var(--delay, 0s) ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .kobo-float-d      { animation: kobo-planet-float 5.6s 0.0s ease-in-out infinite; will-change: transform; }
  .kobo-float-o      { animation: kobo-planet-float 6.2s 0.7s ease-in-out infinite; will-change: transform; }
  .kobo-float-p      { animation: kobo-planet-float 6.8s 1.3s ease-in-out infinite; will-change: transform; }
  .kobo-flame        { animation: kobo-flame-flicker 0.48s ease-in-out infinite; transform-box: fill-box; transform-origin: 100% 50%; }
  .kobo-halo-active  { animation: kobo-halo-breathe 2.5s ease-in-out infinite; will-change: transform, opacity; }
  .kobo-sun-rays     { animation: kobo-sun-spin 28s linear infinite; transform-box: fill-box; transform-origin: center; will-change: transform; }
  .kobo-gem          { animation: kobo-gem-drift 5.2s ease-in-out infinite; will-change: transform; }

  .kobo-animations-paused *,
  .kobo-animations-paused *::before,
  .kobo-animations-paused *::after {
    animation-play-state: paused !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .kobo-star, .kobo-float-d, .kobo-float-o, .kobo-float-p,
    .kobo-flame, .kobo-halo-active, .kobo-sun-rays, .kobo-gem {
      animation: none !important;
    }
  }
`;

// ─── Main Component ───────────────────────────────────────────────────────────

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
  onFormReady,
  router,
  userRole,
  principal,
}: MobileKoboHomeScreenProps) {
  // ── Counts ──────────────────────────────────────────────────────────────────
  const draftsLoading    = isDraftsLoading    ?? isLoading;
  const waitingLoading   = isWaitingLoading   ?? isLoading;
  const submittedLoading = isSubmittedLoading ?? isLoading;

  const count                 = isAuthenticated ? (draftsCount ?? drafts?.length ?? 0) : 0;
  const effectiveMissingDocs  = isAuthenticated ? submittedMissingDocsCount : 0;
  const effectiveBankPending  = isAuthenticated ? approvedBankPendingCount  : 0;
  const effectiveWaitingCount = isAuthenticated ? waitingCount              : 0;
  // Pendings represents Missing Documents ONLY (Bank Details has its own dedicated planet)
  const pendingsTotal         = effectiveMissingDocs;
  const totalActionable       = count + effectiveWaitingCount + effectiveMissingDocs + effectiveBankPending;

  // ── State ───────────────────────────────────────────────────────────────────
  const isGlobalLaunching = useLaunchTransitionStore(selectIsLaunching);
  const [isPendingsExpanded, setIsPendingsExpanded] = useState(false);
  const [isLaunching, setIsLaunching]               = useState(false);
  const [animationsEnabled, setAnimationsEnabled]   = useState(true);
  const { isSoundEnabled, toggleSound }             = useScrollSoundscape({ animationsEnabled });

  const {
    activePortal,
    slowPortal,
    statusMessage,
    getPortalProps,
  } = usePortalTransition({
    router: router || FALLBACK_BROWSER_ROUTER,
    isAuthenticated,
    userRole,
    principal,
    animationsEnabled,
    onRequireAuth: (e) => {
      if (onRequireAuth) onRequireAuth();
      else if (onStartSurvey) onStartSurvey(e);
    },
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasMatchMedia = typeof window.matchMedia === 'function';
    const prefersReduced =
      hasMatchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setAnimationsEnabled(false);
      return;
    }
    try {
      const stored = window.localStorage.getItem('mobile-dash-animations');
      if (stored !== null) setAnimationsEnabled(stored === 'true');
    } catch {
      // Ignore restricted WebView storage errors
    }
    if (!hasMatchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setAnimationsEnabled(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleAnimations = () => {
    setAnimationsEnabled((prev) => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('mobile-dash-animations', String(next));
        }
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  // ── Badge ───────────────────────────────────────────────────────────────────
  const badgeText =
    totalActionable === 0
      ? DASHBOARD_COPY.badgeZero
      : totalActionable === 1
        ? DASHBOARD_COPY.badgeSingular
        : DASHBOARD_COPY.badgePlural(totalActionable);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleStartSurvey = (e: React.MouseEvent) => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
      window.location.assign('/assessment/new');
      return false;
    }
    if (!isAuthenticated && onRequireAuth) {
      e.preventDefault();
      onRequireAuth();
      return false;
    }
    if (onStartSurvey) {
      onStartSurvey(e);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className={`md:hidden relative flex w-full flex-col justify-between overflow-x-hidden select-none ${
        animationsEnabled ? '' : 'kobo-animations-paused'
      }`}
      style={{ minHeight: 'calc(100svh - 56px)' }}
    >
      <style dangerouslySetInnerHTML={{ __html: COSMIC_STYLES }} />

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 0 — SEAMLESS SPACE-TO-DAYTIME-SKY BACKDROP
      ═══════════════════════════════════════════════════════════════════════ */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(180deg, #072B7C 0%, #0D44B6 16%, #1864E0 36%, #2C88F8 58%, #4BAEFF 76%, #88D1FF 90%, #BCE9FF 100%)',
        }}
      >
        {/* Soft upper sky luminescence */}
        <div
          className="absolute inset-x-0 top-0 h-[55%] opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 90% 45% at 50% 18%, rgba(125,211,252,0.34) 0%, rgba(30,110,235,0) 70%)',
          }}
        />

        {/* Twinkling stars & 4-point comic sparkles */}
        <svg
          viewBox="0 0 390 560"
          className="absolute inset-x-0 top-0 h-[82%] w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          {[
            [24, 24, 1.5, '2.0s', '0.0s'],
            [76, 16, 1.1, '2.6s', '0.4s'],
            [142, 46, 1.3, '1.8s', '0.9s'],
            [316, 22, 1.6, '2.4s', '0.2s'],
            [358, 52, 1.2, '2.1s', '1.1s'],
            [194, 146, 1.7, '1.9s', '0.6s'],
            [224, 194, 1.3, '2.7s', '1.4s'],
            [188, 280, 1.6, '2.2s', '0.3s'],
            [42, 272, 1.4, '2.5s', '0.8s'],
            [366, 286, 1.4, '1.9s', '0.5s'],
            [132, 366, 1.5, '2.3s', '1.2s'],
            [236, 364, 1.8, '2.0s', '0.7s'],
            [74, 412, 1.3, '2.6s', '1.5s'],
            [334, 424, 1.2, '2.1s', '0.4s'],
          ].map(([cx, cy, r, dur, delay], i) => (
            <circle
              key={i}
              cx={cx as number}
              cy={cy as number}
              r={r as number}
              fill="#FFFFFF"
              className="kobo-star"
              style={{ '--dur': dur, '--delay': delay } as React.CSSProperties}
            />
          ))}
          {/* Crisp 4-point comic sparkles */}
          <path
            d="M210 156 l2.2 6.4 6.4 2.2-6.4 2.2-2.2 6.4-2.2-6.4-6.4-2.2 6.4-2.2z"
            fill="#E0F2FE"
            className="kobo-star"
            style={{ '--dur': '2.4s', '--delay': '0.5s' } as React.CSSProperties}
          />
          <path
            d="M242 384 l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z"
            fill="#FFFFFF"
            className="kobo-star"
            style={{ '--dur': '2.8s', '--delay': '1.2s' } as React.CSSProperties}
          />
        </svg>

        {/* Decorative floating edge moons & crystals (exact comic balance) */}
        {/* Upper-left spotted mini moon */}
        <svg
          className="kobo-gem absolute left-2 top-[156px] h-5 w-5 opacity-95"
          style={{ animationDelay: '0s' }}
          viewBox="0 0 28 28"
        >
          <defs>
            <radialGradient id="kobo-mini-moon-tl" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#F5D0FE" />
              <stop offset="55%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#4C1D95" />
            </radialGradient>
          </defs>
          <circle cx="14" cy="14" r="11" fill="url(#kobo-mini-moon-tl)" />
          <circle cx="10" cy="11" r="2.2" fill="#4C1D95" opacity="0.45" />
          <circle cx="18" cy="16" r="1.8" fill="#4C1D95" opacity="0.4" />
        </svg>

        {/* Upper-right ringed purple mini planet */}
        <svg
          className="kobo-gem absolute right-1.5 top-[156px] h-10 w-14 opacity-95"
          style={{ animationDelay: '1.1s' }}
          viewBox="0 0 64 44"
        >
          <defs>
            <radialGradient id="kobo-mini-saturn" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#DDD6FE" />
              <stop offset="55%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#3B0764" />
            </radialGradient>
          </defs>
          <ellipse
            cx="32"
            cy="22"
            rx="27"
            ry="6.5"
            transform="rotate(-10 32 22)"
            fill="none"
            stroke="#E879F9"
            strokeWidth="2.4"
            opacity="0.72"
          />
          <circle cx="32" cy="21.5" r="12.5" fill="url(#kobo-mini-saturn)" />
          <path
            d="M6.5 26.5 A27 6.5 -10 0 0 57.5 17.5"
            fill="none"
            stroke="#F5D0FE"
            strokeWidth="2.2"
          />
        </svg>

        {/* Mid-left faceted glowing crystal */}
        <svg
          className="kobo-gem absolute left-2.5 top-[292px] h-5 w-5 opacity-95"
          style={{ animationDelay: '0.6s' }}
          viewBox="0 0 24 24"
        >
          <polygon points="12,1 21,9 17,22 7,22 3,9" fill="#C084FC" />
          <polygon points="12,1 21,9 12,12" fill="#F5D0FE" opacity="0.85" />
          <polygon points="12,12 17,22 7,22" fill="#7E22CE" opacity="0.75" />
        </svg>

        {/* Lower-left faceted crystal */}
        <svg
          className="kobo-gem absolute left-2 top-[430px] h-4 w-4 opacity-90"
          style={{ animationDelay: '1.8s' }}
          viewBox="0 0 24 24"
        >
          <polygon points="12,2 20,10 16,21 8,21 4,10" fill="#A855F7" />
          <polygon points="12,2 20,10 12,12" fill="#E9D5FF" opacity="0.85" />
        </svg>

        {/* Mid-right cratered purple moon */}
        <svg
          className="kobo-gem absolute right-1.5 top-[374px] h-9 w-9 opacity-95"
          style={{ animationDelay: '0.9s' }}
          viewBox="0 0 36 36"
        >
          <defs>
            <radialGradient id="kobo-mini-moon-mr" cx="34%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#DDD6FE" />
              <stop offset="55%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#4C1D95" />
            </radialGradient>
          </defs>
          <circle cx="18" cy="18" r="15" fill="url(#kobo-mini-moon-mr)" />
          <circle cx="12" cy="14" r="3" fill="#4C1D95" opacity="0.4" />
          <circle cx="22" cy="21" r="2.4" fill="#4C1D95" opacity="0.38" />
          <circle cx="20" cy="11" r="1.8" fill="#4C1D95" opacity="0.32" />
        </svg>

        {/* Continuous soft horizon clouds (no sharp vertical center cutoffs) */}
        <svg
          viewBox="0 0 390 150"
          preserveAspectRatio="none"
          className="pointer-events-none absolute bottom-[28px] inset-x-0 h-[145px] w-full"
        >
          <defs>
            <linearGradient id="kobo-horizon-cloud" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
              <stop offset="65%" stopColor="#E6F5FF" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#CBEAFF" stopOpacity="0.65" />
            </linearGradient>
          </defs>
          <path
            d="M-10 150 L-10 68 Q30 48 70 65 Q110 52 150 78 Q175 82 195 86 Q215 82 240 78 Q280 52 320 65 Q360 48 400 68 L400 150 Z"
            fill="url(#kobo-horizon-cloud)"
          />
          {/* Soft luminous mist across the bottom behind the grass crest */}
          <path
            d="M-10 150 L-10 112 Q85 96 195 110 Q305 94 400 108 L400 150 Z"
            fill="#FFFFFF"
            opacity="0.72"
          />
        </svg>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 1 — INTERACTIVE DASHBOARD CONTENT
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 mx-auto w-full max-w-[412px] px-3 py-3 sm:py-4 space-y-3">
        {/* ── Unauthenticated Notice ── */}
        {!isAuthenticated && (
          <div className="w-full rounded-2xl border border-white/35 bg-white/18 p-3 backdrop-blur-md flex items-center justify-between shadow-sm">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-teal-300 animate-pulse" />
                <h4 className="text-xs font-bold text-white">Sign In Required</h4>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-white/85">
                Please sign in or register to record and sync surveys.
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                if (onRequireAuth) onRequireAuth();
                else if (onStartSurvey) onStartSurvey(e);
              }}
              className="shrink-0 cursor-pointer rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-teal-800 shadow-sm transition-colors hover:bg-teal-50"
            >
              Sign In
            </button>
          </div>
        )}

        {/* ── 1. UNIFIED SPACESHIP "Start New Survey" CTA (Pointing Right) with 3.0s Zustand Launch ── */}
        <div className="flex justify-center pt-0.5">
          <RocketSurveyButton
            logoSrc="/images/alliance-india-logo.png"
            label={DASHBOARD_COPY.mobile.startSurveyTitle}
            onPreLaunch={handleStartSurvey}
            onFormReady={onFormReady || (() => {
              if (typeof window !== 'undefined') {
                window.location.assign('/assessment/new');
              }
            })}
          />
        </div>

        {/* ── 2. "Needs Attention" Header Row ── */}
        <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
          <h2
            className="text-[15px] font-black tracking-[-0.01em] text-white"
            style={{
              textShadow:
                '0 1px 0 rgba(8,28,78,0.95), 0 -1px 0 rgba(8,28,78,0.85), 1px 0 0 rgba(8,28,78,0.85), -1px 0 0 rgba(8,28,78,0.85), 0 3px 10px rgba(8,28,78,0.65)',
            }}
          >
            {DASHBOARD_COPY.sectionHeading}
          </h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm ${
              totalActionable === 0
                ? 'border-emerald-300/90 bg-[#B9F8D3]/95 text-emerald-950'
                : 'border-amber-300/90 bg-amber-100/95 text-amber-950'
            }`}
          >
            {totalActionable === 0 ? (
              <CheckCircle2
                className="h-3.5 w-3.5 shrink-0 text-emerald-700 stroke-[2.4]"
                aria-hidden="true"
              />
            ) : (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-amber-500 animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            <span className="whitespace-nowrap">{badgeText}</span>
          </span>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            3. FREE-FLOATING COMIC CRATERED PLANETS STAGE
            (Zero container card, zero bridges, dark high-contrast digits)
        ═══════════════════════════════════════════════════════════════════ */}
        <section
          role="region"
          aria-label="Action items 3D stage"
          className="relative py-0.5"
        >
          <div className="flex items-center justify-between gap-1.5">
            {/* ── LEFT COLUMN: Drafts (top) + Bank Details (bottom) ── */}
            <div className="flex shrink-0 flex-col items-center gap-3.5">
              {/* ── DRAFTS PLANET (Warm Yellow, NO Ring) ── */}
              <div className="kobo-float-d relative">
                {/* GPU-composited outer glow halo */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute -inset-2 rounded-full blur-md ${
                    count >= 1 ? 'kobo-halo-active' : 'opacity-65'
                  }`}
                  style={{
                    background:
                      'radial-gradient(circle, rgba(251,191,36,0.68) 0%, rgba(245,158,11,0) 70%)',
                  }}
                />
                <Link
                  href="/assessment/drafts"
                  prefetch={true}
                  {...getPortalProps('drafts')}
                  aria-label={`${DASHBOARD_COPY.cards.formsToFinish.title}: ${count} - ${DASHBOARD_COPY.cards.formsToFinish.linkText}`}
                  className={`relative block h-[138px] w-[138px] min-[390px]:h-[150px] min-[390px]:w-[150px] cursor-pointer rounded-full transition-transform duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    activePortal === 'drafts' ? 'scale-[1.04]' : ''
                  }`}
                >
                  {/* Luminous comic golden sphere */}
                  <div
                    className="absolute inset-0 overflow-hidden rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle at 30% 26%, #FFF8C2 0%, #FDE047 36%, #F59E0B 72%, #C26806 100%)',
                      boxShadow:
                        'inset -7px -9px 18px rgba(146,64,14,0.38), inset 5px 5px 12px rgba(255,255,255,0.6), 0 0 0 1.5px rgba(254,240,138,0.6)',
                    }}
                  >
                    {/* Comic craters SVG */}
                    <svg
                      viewBox="0 0 150 150"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      aria-hidden="true"
                    >
                      <circle cx="24" cy="72" r="9.5" fill="#B45309" opacity="0.2" />
                      <circle cx="25.5" cy="73.5" r="7" fill="#FEF08A" opacity="0.28" />
                      <circle cx="122" cy="64" r="9" fill="#B45309" opacity="0.2" />
                      <circle cx="108" cy="112" r="7" fill="#92400E" opacity="0.2" />
                      <circle cx="42" cy="110" r="5.5" fill="#92400E" opacity="0.18" />
                      <ellipse
                        cx="46"
                        cy="32"
                        rx="22"
                        ry="9"
                        fill="#FFFFFF"
                        opacity="0.28"
                        transform="rotate(-22 46 32)"
                      />
                    </svg>
                  </div>

                  <DraftsPortalOverlay active={activePortal === 'drafts'} variant="mobile" />

                  {/* Content overlay */}
                  <div className="relative z-10 flex h-full flex-col items-center justify-between px-2 py-3">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-amber-950 shadow-xs"
                      style={{ background: 'rgba(255, 255, 255, 0.94)', border: '1px solid rgba(255, 255, 255, 0.9)' }}
                    >
                      <FileText className="h-2.5 w-2.5 shrink-0 text-amber-800" aria-hidden="true" />
                      <span>Drafts</span>
                    </span>

                    <div className="flex flex-col items-center -mt-1">
                      <span
                        className="text-[2.5rem] leading-none font-black tracking-tight text-[#09142A] tabular-nums"
                        style={{ fontWeight: 900, WebkitTextStroke: '0.45px #09142A' }}
                      >
                        {draftsLoading ? (
                          <span className="inline-block h-7 w-7 animate-pulse rounded-full bg-amber-950/20" />
                        ) : (
                          count
                        )}
                      </span>
                      <span className="mt-0.5 text-[10px] font-extrabold text-[#3B1E02]">
                        {count === 0 ? 'No drafts' : `${count} saved`}
                      </span>
                    </div>

                    <span className="inline-flex items-center justify-center rounded-full bg-[#925408] px-3.5 py-1 text-[10px] font-extrabold text-white shadow-sm ring-1 ring-amber-200/35 whitespace-nowrap">
                      Continue ›
                      <span className="sr-only"> {DASHBOARD_COPY.cards.formsToFinish.linkText}</span>
                    </span>
                  </div>
                </Link>
              </div>

              {/* ── BANK DETAILS PLANET (Rich Comic-Space Green, NO Ring) ── */}
              <div className="kobo-float-o relative">
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute -inset-2 rounded-full blur-md ${
                    effectiveBankPending >= 1 ? 'kobo-halo-active' : 'opacity-65'
                  }`}
                  style={{
                    background:
                      'radial-gradient(circle, rgba(52,211,153,0.62) 0%, rgba(16,185,129,0) 70%)',
                  }}
                />
                <Link
                  href="/assessment/sync?tab=bank"
                  prefetch={true}
                  {...getPortalProps('bank')}
                  aria-label={`Bank Details: ${effectiveBankPending} - View bank details`}
                  className={`relative block h-[138px] w-[138px] min-[390px]:h-[150px] min-[390px]:w-[150px] cursor-pointer rounded-full transition-transform duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    activePortal === 'bank' ? 'scale-[0.96]' : ''
                  }`}
                >
                  {/* Luminous comic emerald sphere */}
                  <div
                    className="absolute inset-0 overflow-hidden rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle at 30% 26%, #B4FFE4 0%, #34E8A8 34%, #10B981 68%, #047857 100%)',
                      boxShadow:
                        'inset -7px -9px 18px rgba(4,78,56,0.45), inset 5px 5px 12px rgba(255,255,255,0.52), 0 0 0 1.5px rgba(167,243,208,0.55)',
                    }}
                  >
                    {/* Comic craters SVG */}
                    <svg
                      viewBox="0 0 150 150"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      aria-hidden="true"
                    >
                      <circle cx="24" cy="64" r="9.5" fill="#047857" opacity="0.22" />
                      <circle cx="25.5" cy="65.5" r="7.5" fill="#6EE7B7" opacity="0.24" />
                      <circle cx="122" cy="76" r="10.5" fill="#047857" opacity="0.24" />
                      <circle cx="123.5" cy="77.5" r="8" fill="#34D399" opacity="0.2" />
                      <circle cx="106" cy="40" r="6" fill="#047857" opacity="0.18" />
                      <circle cx="34" cy="108" r="6.5" fill="#065F46" opacity="0.2" />
                      <circle cx="104" cy="116" r="5" fill="#065F46" opacity="0.18" />
                      <ellipse
                        cx="46"
                        cy="32"
                        rx="22"
                        ry="9"
                        fill="#FFFFFF"
                        opacity="0.22"
                        transform="rotate(-22 46 32)"
                      />
                    </svg>
                  </div>

                  <BankPortalOverlay active={activePortal === 'bank'} variant="mobile" />

                  {/* Content overlay */}
                  <div className="relative z-10 flex h-full flex-col items-center justify-between px-2 py-3">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-emerald-950 shadow-xs"
                      style={{ background: 'rgba(255, 255, 255, 0.94)', border: '1px solid rgba(255, 255, 255, 0.9)' }}
                    >
                      <Landmark className="h-2.5 w-2.5 shrink-0 text-emerald-800" aria-hidden="true" />
                      <span>Bank Details</span>
                    </span>

                    <div className="flex flex-col items-center -mt-1">
                      <span
                        className="text-[2.5rem] leading-none font-black tracking-tight text-[#09142A] tabular-nums"
                        style={{ fontWeight: 900, WebkitTextStroke: '0.45px #09142A' }}
                      >
                        {waitingLoading ? (
                          <span className="inline-block h-7 w-7 animate-pulse rounded-full bg-emerald-950/20" />
                        ) : (
                          effectiveBankPending
                        )}
                      </span>
                      <span className="mt-0.5 text-[10px] font-extrabold text-[#072920]">
                        {effectiveBankPending === 0
                          ? 'No pending items'
                          : `${effectiveBankPending} bank${effectiveBankPending === 1 ? '' : 's'} pending`}
                      </span>
                    </div>

                    <span className="inline-flex items-center justify-center rounded-full bg-[#0C6E43] px-3.5 py-1 text-[10px] font-extrabold text-white shadow-sm ring-1 ring-emerald-300/35 whitespace-nowrap">
                      Bank list ›
                      <span className="sr-only"> View bank details</span>
                    </span>
                  </div>
                </Link>
              </div>
            </div>

            {/* ── RIGHT COLUMN: PENDINGS PLANET (Larger Coral-Rose WITH Saturn Ring) ── */}
            <div className="flex flex-1 items-center justify-center">
              <div className="kobo-float-p relative">
                {/* GPU-composited outer glow halo */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute -inset-3 rounded-full blur-lg ${
                    pendingsTotal >= 1 ? 'kobo-halo-active' : 'opacity-60'
                  }`}
                  style={{
                    background:
                      'radial-gradient(circle, rgba(251,113,133,0.62) 0%, rgba(244,63,94,0) 72%)',
                  }}
                />

                {/* Saturn Ring — BACK ARC (behind planet sphere, z-0) */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-[43%] z-0 h-[56px] w-[134%] -translate-x-1/2 -translate-y-1/2 -rotate-[24deg]"
                >
                  <svg
                    viewBox="0 0 260 64"
                    className="h-full w-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="kobo-saturn-ring" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#EC4899" stopOpacity="0.92" />
                        <stop offset="28%" stopColor="#F9A8D4" stopOpacity="0.96" />
                        <stop offset="52%" stopColor="#F472B6" stopOpacity="0.88" />
                        <stop offset="78%" stopColor="#C084FC" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#A855F7" stopOpacity="0.88" />
                      </linearGradient>
                      <clipPath id="kobo-ring-back">
                        <rect x="-20" y="-20" width="300" height="52" />
                      </clipPath>
                    </defs>
                    <ellipse
                      cx="130"
                      cy="32"
                      rx="124"
                      ry="24"
                      fill="none"
                      stroke="url(#kobo-saturn-ring)"
                      strokeWidth="9"
                      clipPath="url(#kobo-ring-back)"
                    />
                    <ellipse
                      cx="130"
                      cy="32"
                      rx="116"
                      ry="20"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="1.8"
                      opacity="0.45"
                      clipPath="url(#kobo-ring-back)"
                    />
                  </svg>
                </div>

                {/* Main Planet Link (Direct navigation to Missing Documents) */}
                <Link
                  href="/assessment/sync?tab=docs"
                  prefetch={true}
                  {...getPortalProps('docs')}
                  aria-label={`Missing Docs: ${effectiveMissingDocs} - ${
                    effectiveMissingDocs === 0 ? 'All clear' : 'Review missing documents'
                  }`}
                  className={`relative z-10 block h-[176px] w-[176px] min-[390px]:h-[190px] min-[390px]:w-[190px] cursor-pointer rounded-full transition-transform duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    activePortal === 'docs' ? 'scale-[1.03]' : ''
                  }`}
                >
                  {/* Luminous peach-coral-magenta comic sphere */}
                  <div
                    className="absolute inset-0 overflow-hidden rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle at 28% 26%, #FFD99A 0%, #FB923C 28%, #F45B69 62%, #C8235D 100%)',
                      boxShadow:
                        'inset -8px -11px 22px rgba(136,19,55,0.42), inset 6px 6px 14px rgba(255,255,255,0.48), 0 0 0 1.5px rgba(254,205,211,0.5)',
                    }}
                  >
                    {/* Comic craters SVG */}
                    <svg
                      viewBox="0 0 190 190"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      aria-hidden="true"
                    >
                      <circle cx="30" cy="84" r="10.5" fill="#9A3412" opacity="0.2" />
                      <circle cx="32" cy="85.5" r="8" fill="#FDBA74" opacity="0.28" />
                      <circle cx="150" cy="64" r="12" fill="#9F1239" opacity="0.22" />
                      <circle cx="152" cy="66" r="9" fill="#FDA4AF" opacity="0.2" />
                      <circle cx="160" cy="112" r="8" fill="#881337" opacity="0.22" />
                      <circle cx="48" cy="52" r="7" fill="#C2410C" opacity="0.16" />
                      <circle cx="42" cy="134" r="7.5" fill="#9F1239" opacity="0.2" />
                      <ellipse
                        cx="58"
                        cy="36"
                        rx="28"
                        ry="11"
                        fill="#FFFFFF"
                        opacity="0.24"
                        transform="rotate(-22 58 36)"
                      />
                    </svg>
                  </div>

                  {/* Saturn Ring — FRONT ARC (above sphere surface z-20, BELOW text z-30 so text never obscures!) */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-[43%] z-20 h-[56px] w-[134%] -translate-x-1/2 -translate-y-1/2 -rotate-[24deg]"
                  >
                    <svg
                      viewBox="0 0 260 64"
                      className="h-full w-full overflow-visible"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <clipPath id="kobo-ring-front">
                          <rect x="-20" y="32" width="300" height="52" />
                        </clipPath>
                      </defs>
                      <ellipse
                        cx="130"
                        cy="32"
                        rx="124"
                        ry="24"
                        fill="none"
                        stroke="url(#kobo-saturn-ring)"
                        strokeWidth="9"
                        opacity="0.88"
                        clipPath="url(#kobo-ring-front)"
                      />
                      <ellipse
                        cx="130"
                        cy="32"
                        rx="116"
                        ry="20"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="1.8"
                        opacity="0.5"
                        clipPath="url(#kobo-ring-front)"
                      />
                    </svg>
                  </div>

                  <DocsPortalOverlay active={activePortal === 'docs'} variant="mobile" />

                  {/* Foreground UI Content (z-30 — razor-sharp above ring) */}
                  <div className="relative z-30 flex h-full flex-col items-center justify-between px-2.5 py-3.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-950 shadow-xs"
                      style={{ background: 'rgba(255, 255, 255, 0.94)', border: '1px solid rgba(255, 255, 255, 0.9)' }}
                    >
                      <FileWarning
                        className="h-2.5 w-2.5 shrink-0 text-rose-700"
                        aria-hidden="true"
                      />
                      <span>Missing Docs</span>
                    </span>

                    <div className="flex flex-col items-center -mt-1">
                      <span
                        className="text-[2.85rem] leading-none font-black tracking-tight text-[#09142A] tabular-nums"
                        style={{ fontWeight: 900, WebkitTextStroke: '0.5px #09142A' }}
                      >
                        {submittedLoading ? (
                          <span className="inline-block h-8 w-8 animate-pulse rounded-full bg-rose-950/20" />
                        ) : (
                          effectiveMissingDocs
                        )}
                      </span>
                      <span className="mt-0.5 text-[10.5px] font-extrabold text-[#2D0A14]">
                        {effectiveMissingDocs === 0
                          ? 'No missing documents'
                          : effectiveMissingDocs === 1
                            ? '1 document missing'
                            : `${effectiveMissingDocs} documents missing`}
                      </span>
                    </div>

                    {/* Action CTA Pill */}
                    <span
                      className="inline-flex items-center justify-center rounded-full bg-[#9F1239] px-4 py-1 text-[10.5px] font-extrabold text-white shadow-sm ring-1 ring-rose-300/40 whitespace-nowrap"
                    >
                      Pendings ›
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            4. UNIFIED "Submitted surveys" CLOUD + RADIANT GOLDEN SUN
               (Tucked upwards cleanly below planets stage, count inside sun)
        ═══════════════════════════════════════════════════════════════════ */}
        <section
          aria-labelledby="mobile-submitted-surveys-heading"
          className={`transition-all duration-200 ${
            isPendingsExpanded ? 'pt-2 pb-1' : '-mt-6 min-[390px]:-mt-8 pb-1'
          }`}
        >
          <h3 id="mobile-submitted-surveys-heading" className="sr-only">
            Submitted Surveys
          </h3>

          <div className="flex flex-col items-center">
            <Link
              href="/assessment/sync?tab=synced"
              prefetch={true}
              {...getPortalProps('submitted')}
              aria-label={`Submitted surveys: ${submittedCount ?? 0} - Confirmed on central server`}
              className="group relative flex h-[116px] w-[328px] items-end justify-center cursor-pointer transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-3xl"
            >
              {/* Radiant Golden Sun — tucked HIGHER & FURTHER LEFT behind cloud's right edge (z-10) */}
              <div
                className={`pointer-events-none absolute right-[18px] top-[0px] z-10 flex h-[88px] w-[88px] items-center justify-center will-change-transform ${
                  activePortal === 'submitted' ? 'portal-sun-rise-active' : ''
                }`}
              >
                <SubmittedPortalGlow active={activePortal === 'submitted'} variant="mobile" />
                {/* Soft warm radiating corona */}
                <div
                  className="kobo-halo-active absolute -inset-6 rounded-full blur-xl"
                  aria-hidden="true"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(255, 232, 105, 0.95) 0%, rgba(255, 193, 24, 0.55) 48%, rgba(255, 193, 24, 0) 76%)',
                  }}
                />
                {/* Slowly rotating comic sunburst rays */}
                <svg
                  viewBox="0 0 110 110"
                  className="kobo-sun-rays absolute -inset-3 h-[108px] w-[108px] overflow-visible"
                  aria-hidden="true"
                >
                  {Array.from({ length: 18 }).map((_, idx) => {
                    const deg = idx * 20;
                    return (
                      <polygon
                        key={idx}
                        points="55,2 51.5,14 58.5,14"
                        fill="#FEF08A"
                        opacity={idx % 2 === 0 ? 0.95 : 0.68}
                        transform={`rotate(${deg} 55 55)`}
                      />
                    );
                  })}
                </svg>

                {/* Rich golden orb (not washed-out white) */}
                <div
                  className="relative flex h-[78px] w-[78px] items-center justify-center rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle at 38% 32%, #FFF59D 0%, #FFD60A 32%, #F59E0B 74%, #D97706 100%)',
                    boxShadow:
                      '0 0 24px rgba(255, 214, 10, 0.85), inset -4px -6px 12px rgba(180, 83, 9, 0.35), inset 3px 3px 8px rgba(255, 255, 255, 0.8), 0 0 0 2.5px rgba(254, 243, 199, 0.9)',
                  }}
                >
                  <span
                    className="text-[2rem] leading-none tabular-nums -mt-1.5"
                    style={{
                      fontWeight: 900,
                      color: '#081226',
                      WebkitTextStroke: '0.55px #081226',
                    }}
                  >
                    {submittedLoading ? (
                      <span
                        className="inline-block h-6 w-6 animate-pulse rounded-full bg-amber-900/20"
                        role="status"
                        aria-label="Loading submitted count"
                      />
                    ) : (
                      (submittedCount ?? 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Sculpted Comic Cloud — centered, overlapping Sun's lower-left curve (z-20) */}
              <div
                className={`relative z-20 mr-10 mb-1 flex h-[76px] w-[244px] items-center justify-center will-change-transform ${
                  activePortal === 'submitted' ? 'portal-cloud-glide-active' : ''
                }`}
              >
                <svg
                  viewBox="0 0 270 86"
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_8px_18px_rgba(14,74,158,0.28)]"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="kobo-cloud-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="68%" stopColor="#F5FAFF" />
                      <stop offset="100%" stopColor="#CBE5FF" />
                    </linearGradient>
                  </defs>
                  {/* Single seamless fluffy cloud path — zero internal shadow lines */}
                  <path
                    d="M44 74 C22 74 8 62 8 47 C8 34 19 23 34 22 C42 10 57 4 74 8 C87 1 106 1 119 10 C134 2 156 5 168 18 C184 14 202 20 210 32 C226 30 244 37 252 48 C260 59 252 74 232 74 C218 81 196 81 182 76 C164 83 136 83 118 77 C98 83 70 82 54 75 Z"
                    fill="url(#kobo-cloud-fill)"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                </svg>

                {/* Cloud foreground content */}
                <div className="relative z-10 flex w-full items-center justify-between px-5 pt-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100/95 ring-1 ring-emerald-200/80">
                      <CheckCircle2
                        className="h-5 w-5 text-emerald-600 stroke-[2.3]"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="truncate text-[13.5px] font-extrabold tracking-[-0.01em] text-[#0B132B]">
                      Submitted surveys
                    </span>
                    <span className="sr-only">
                      {submittedLoading
                        ? 'Checking server...'
                        : submittedStatus === 'error'
                        ? 'Server unreachable (tap Retry)'
                        : submittedStatus === 'offline'
                        ? 'Showing locally confirmed (offline)'
                        : 'Confirmed on central server'}
                    </span>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[#0B132B] transition-transform duration-150 group-hover:translate-x-0.5"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </Link>

            {/* Unobtrusive retry chip only when offline/error */}
            {(submittedStatus === 'error' || submittedStatus === 'offline') &&
              onRetrySubmitted && (
                <button
                  type="button"
                  onClick={onRetrySubmitted}
                  aria-label="Retry loading submitted count"
                  className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-[10.5px] font-bold text-slate-800 shadow-xs backdrop-blur-xs hover:bg-white cursor-pointer"
                >
                  <RotateCw className="h-3 w-3" aria-hidden="true" />
                  <span>
                    {submittedStatus === 'offline'
                      ? 'Offline · Tap to retry sync'
                      : 'Retry'}
                  </span>
                </button>
              )}
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 2 — BOTTOM PLAYGROUND FOOTER + VIEWPORT-SAFE PAUSE BUTTON
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 mt-auto w-full pb-[env(safe-area-inset-bottom)]">
        {/* Translucent Pause / Play control anchored cleanly in open lower-left sky */}
        <button
          type="button"
          onClick={toggleAnimations}
          aria-label={animationsEnabled ? 'Pause animations' : 'Resume animations'}
          aria-pressed={!animationsEnabled}
          className="absolute bottom-[calc(100%+6px)] left-3.5 z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
          style={{
            background: 'rgba(100, 130, 175, 0.42)',
            backdropFilter: 'blur(8px)',
            border: '1.5px solid rgba(255, 255, 255, 0.72)',
            boxShadow: '0 4px 12px rgba(8, 30, 82, 0.22)',
          }}
        >
          {animationsEnabled ? (
            <svg viewBox="0 0 20 20" fill="#FFFFFF" width="15" height="15" aria-hidden="true">
              <rect x="4.5" y="3.5" width="3.8" height="13" rx="1.2" />
              <rect x="11.7" y="3.5" width="3.8" height="13" rx="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="#FFFFFF" width="15" height="15" aria-hidden="true">
              <path d="M6 4.2l10.5 5.8L6 15.8z" />
            </svg>
          )}
        </button>

        {/* Translucent Sound Mute / Unmute control */}
        <button
          type="button"
          onClick={toggleSound}
          aria-label={isSoundEnabled ? 'Mute ambient sound' : 'Enable ambient sound'}
          aria-pressed={!isSoundEnabled}
          className="absolute bottom-[calc(100%+6px)] left-[58px] z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
          style={{
            background: 'rgba(100, 130, 175, 0.42)',
            backdropFilter: 'blur(8px)',
            border: '1.5px solid rgba(255, 255, 255, 0.72)',
            boxShadow: '0 4px 12px rgba(8, 30, 82, 0.22)',
          }}
        >
          {isSoundEnabled ? (
            <Volume2 className="h-4 w-4 text-white" aria-hidden="true" />
          ) : (
            <VolumeX className="h-4 w-4 text-white/70" aria-hidden="true" />
          )}
        </button>

        <MiniatureGardenPlayground
          transparentSky
          hideControls
          isPaused={!animationsEnabled || isGlobalLaunching}
        />
      </div>

      <PortalStatusIndicator
        activePortal={activePortal}
        slowPortal={slowPortal}
        statusMessage={statusMessage}
        className="fixed bottom-5 inset-x-0 z-50 flex justify-center pointer-events-none"
      />
    </div>
  );
}

export default MobileKoboHomeScreen;
