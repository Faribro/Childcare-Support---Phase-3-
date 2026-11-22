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
  Plus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AssessmentRecord } from '@/types/domain';
import { AnimatedHeartUnlock } from '@/components/ui/AnimatedHeartUnlock';
import { DraftCard } from '@/components/forms/DraftCard';
import { MiniatureGardenPlayground } from '@/components/garden/MiniatureGardenPlayground';
import { useScrollSoundscape } from '@/lib/audio/useScrollSoundscape';
import { NeedsAttentionPanel } from './NeedsAttentionPanel';
import { COSMIC_STYLES } from './cosmicStyles';

export interface DesktopComicWorkspaceProps {
  drafts: AssessmentRecord[];
  draftCount: number | null;
  isDraftsLoading: boolean;
  isDraftListLoading: boolean;
  waitingCount: number | null;
  isWaitingLoading: boolean;
  submittedCount: number | null;
  isSubmittedLoading: boolean;
  submittedStatus: 'loading' | 'success' | 'offline' | 'error';
  submittedMissingDocsCount: number;
  approvedBankPendingCount: number;
  serverScopeLabel: string;
  isAuthenticated: boolean;
  onStartNewSurvey: (e: React.MouseEvent) => void;
  onResumeDraft: (id: string | number) => void;
  onDeleteDraft: (id: number) => Promise<void>;
  onRetrySubmitted: () => void;
  onRequireAuth: () => void;
}

export function DesktopComicWorkspace({
  drafts,
  draftCount,
  isDraftsLoading,
  isDraftListLoading,
  waitingCount,
  isWaitingLoading,
  submittedCount,
  isSubmittedLoading,
  submittedStatus,
  submittedMissingDocsCount,
  approvedBankPendingCount,
  serverScopeLabel,
  isAuthenticated,
  onStartNewSurvey,
  onResumeDraft,
  onDeleteDraft,
  onRetrySubmitted,
  onRequireAuth,
}: DesktopComicWorkspaceProps) {
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const { isSoundEnabled, toggleSound } = useScrollSoundscape({ animationsEnabled });

  // Sync animation preferences with localStorage and prefers-reduced-motion
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
      // Ignore storage restrictions
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
        // Ignore
      }
      return next;
    });
  };

  const effectiveDraftsCount = isAuthenticated ? (draftCount ?? drafts.length) : 0;
  const effectiveWaitingCount = isAuthenticated ? (waitingCount ?? 0) : 0;
  const effectiveMissingDocs = isAuthenticated ? submittedMissingDocsCount : 0;
  const effectiveBankPending = isAuthenticated ? approvedBankPendingCount : 0;
  const effectiveSubmittedCount = isAuthenticated ? (submittedCount ?? 0) : 0;

  return (
    <div
      data-testid="desktop-workspace"
      className={`hidden md:flex relative flex-1 flex-col justify-between w-full min-h-[calc(100vh-64px)] overflow-x-hidden select-none ${
        animationsEnabled ? '' : 'kobo-animations-paused'
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: COSMIC_STYLES }} />

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 0 — FULL-BLEED SPACE-TO-DAYTIME-SKY VIEWPORT BACKDROP
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
          className="absolute inset-x-0 top-0 h-[52%] opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 90% 45% at 50% 18%, rgba(125,211,252,0.34) 0%, rgba(30,110,235,0) 70%)',
          }}
        />

        {/* Twinkling stars across wide desktop viewport */}
        <svg
          viewBox="0 0 1440 900"
          className="absolute inset-x-0 top-0 h-[86%] w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          {[
            // Left flank
            [48, 38, 1.8, '2.1s', '0.0s'],
            [124, 82, 1.3, '2.6s', '0.5s'],
            [92, 186, 1.5, '1.9s', '1.1s'],
            [180, 240, 1.7, '2.4s', '0.3s'],
            [64, 320, 1.4, '2.2s', '0.8s'],
            [138, 410, 1.6, '2.7s', '1.4s'],
            [52, 510, 1.3, '2.0s', '0.6s'],
            [110, 620, 1.5, '2.5s', '1.0s'],
            // Mid left
            [280, 48, 1.6, '2.3s', '0.4s'],
            [360, 110, 1.2, '1.8s', '0.9s'],
            [260, 210, 1.4, '2.4s', '0.2s'],
            [340, 310, 1.7, '2.6s', '1.3s'],
            // Center sky
            [520, 42, 1.5, '2.0s', '0.1s'],
            [720, 68, 1.8, '2.5s', '0.7s'],
            [890, 38, 1.4, '1.9s', '1.2s'],
            [610, 140, 1.3, '2.7s', '0.4s'],
            [810, 150, 1.6, '2.2s', '0.9s'],
            [540, 260, 1.5, '2.1s', '0.5s'],
            [740, 270, 1.7, '2.8s', '1.5s'],
            [920, 250, 1.4, '2.0s', '0.3s'],
            // Mid right
            [1080, 52, 1.7, '2.4s', '0.6s'],
            [1160, 120, 1.3, '1.9s', '1.0s'],
            [1040, 210, 1.5, '2.3s', '0.2s'],
            [1140, 320, 1.6, '2.6s', '1.1s'],
            // Right flank
            [1280, 44, 1.9, '2.2s', '0.3s'],
            [1380, 96, 1.4, '2.7s', '0.8s'],
            [1310, 192, 1.6, '2.0s', '0.1s'],
            [1400, 270, 1.3, '2.5s', '1.3s'],
            [1270, 380, 1.7, '2.1s', '0.5s'],
            [1360, 460, 1.5, '2.4s', '0.9s'],
            [1290, 560, 1.4, '2.8s', '1.4s'],
            [1390, 640, 1.6, '2.2s', '0.4s'],
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
            d="M174 94 l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"
            fill="#E0F2FE"
            className="kobo-star"
            style={{ '--dur': '2.4s', '--delay': '0.5s' } as React.CSSProperties}
          />
          <path
            d="M320 230 l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z"
            fill="#FFFFFF"
            className="kobo-star"
            style={{ '--dur': '2.8s', '--delay': '1.1s' } as React.CSSProperties}
          />
          <path
            d="M1240 140 l3.5 10 10 3.5-10 3.5-3.5 10-3.5-10-10-3.5 10-3.5z"
            fill="#E0F2FE"
            className="kobo-star"
            style={{ '--dur': '2.6s', '--delay': '0.7s' } as React.CSSProperties}
          />
          <path
            d="M1120 280 l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z"
            fill="#FFFFFF"
            className="kobo-star"
            style={{ '--dur': '2.9s', '--delay': '1.3s' } as React.CSSProperties}
          />
        </svg>

        {/* ── Decorative Floating Outer-Margin Mini-Planets & Crystals ── */}
        {/* Top-Left spotted purple mini moon */}
        <svg
          className="kobo-gem absolute left-7 top-[72px] h-9 w-9 opacity-95"
          style={{ animationDelay: '0s' }}
          viewBox="0 0 28 28"
        >
          <defs>
            <radialGradient id="desk-mini-moon-tl" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#F5D0FE" />
              <stop offset="55%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#4C1D95" />
            </radialGradient>
          </defs>
          <circle cx="14" cy="14" r="12" fill="url(#desk-mini-moon-tl)" />
          <circle cx="10" cy="11" r="2.4" fill="#4C1D95" opacity="0.45" />
          <circle cx="18" cy="16" r="2" fill="#4C1D95" opacity="0.4" />
        </svg>

        {/* Mid-Left faceted purple crystal */}
        <svg
          className="kobo-gem absolute left-9 top-[250px] h-8 w-8 opacity-95"
          style={{ animationDelay: '0.6s' }}
          viewBox="0 0 24 24"
        >
          <polygon points="12,1 21,9 17,22 7,22 3,9" fill="#C084FC" />
          <polygon points="12,1 21,9 12,12" fill="#F5D0FE" opacity="0.85" />
          <polygon points="12,12 17,22 7,22" fill="#7E22CE" opacity="0.75" />
        </svg>

        {/* Lower-Left lavender crystal */}
        <svg
          className="kobo-gem absolute left-7 top-[420px] h-7 w-7 opacity-90"
          style={{ animationDelay: '1.8s' }}
          viewBox="0 0 24 24"
        >
          <polygon points="12,2 20,10 16,21 8,21 4,10" fill="#A855F7" />
          <polygon points="12,2 20,10 12,12" fill="#E9D5FF" opacity="0.85" />
        </svg>

        {/* Top-Right ringed purple mini Saturn */}
        <svg
          className="kobo-gem absolute right-7 top-[76px] h-14 w-20 opacity-95"
          style={{ animationDelay: '1.1s' }}
          viewBox="0 0 64 44"
        >
          <defs>
            <radialGradient id="desk-mini-saturn-tr" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#DDD6FE" />
              <stop offset="55%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#3B0764" />
            </radialGradient>
          </defs>
          <ellipse
            cx="32"
            cy="22"
            rx="28"
            ry="7"
            transform="rotate(-10 32 22)"
            fill="none"
            stroke="#E879F9"
            strokeWidth="2.8"
            opacity="0.72"
          />
          <circle cx="32" cy="21.5" r="13.5" fill="url(#desk-mini-saturn-tr)" />
          <path
            d="M6.5 26.5 A28 7 -10 0 0 57.5 17.5"
            fill="none"
            stroke="#F5D0FE"
            strokeWidth="2.5"
          />
        </svg>

        {/* Mid-Right violet crystal */}
        <svg
          className="kobo-gem absolute right-9 top-[250px] h-8 w-8 opacity-95"
          style={{ animationDelay: '1.5s' }}
          viewBox="0 0 24 24"
        >
          <polygon points="12,1 21,9 17,22 7,22 3,9" fill="#C084FC" />
          <polygon points="12,1 21,9 12,12" fill="#F5D0FE" opacity="0.85" />
          <polygon points="12,12 17,22 7,22" fill="#7E22CE" opacity="0.75" />
        </svg>

        {/* Lower-Right cratered purple moon */}
        <svg
          className="kobo-gem absolute right-8 top-[390px] h-12 w-12 opacity-95"
          style={{ animationDelay: '0.9s' }}
          viewBox="0 0 36 36"
        >
          <defs>
            <radialGradient id="desk-mini-moon-br" cx="34%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#DDD6FE" />
              <stop offset="55%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#4C1D95" />
            </radialGradient>
          </defs>
          <circle cx="18" cy="18" r="16" fill="url(#desk-mini-moon-br)" />
          <circle cx="12" cy="14" r="3.2" fill="#4C1D95" opacity="0.4" />
          <circle cx="22" cy="21" r="2.6" fill="#4C1D95" opacity="0.38" />
          <circle cx="20" cy="11" r="2" fill="#4C1D95" opacity="0.32" />
        </svg>

        {/* Parted left-and-right fluffy horizon clouds (open blue sky in the center) */}
        <svg
          viewBox="0 0 1440 220"
          preserveAspectRatio="none"
          className="pointer-events-none absolute bottom-[38px] inset-x-0 h-[220px] w-full"
        >
          <defs>
            <linearGradient id="desk-horizon-cloud" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
              <stop offset="65%" stopColor="#E6F5FF" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#CBEAFF" stopOpacity="0.65" />
            </linearGradient>
          </defs>
          {/* Continuous soft horizon cloud bank (no sharp vertical center cutoffs) */}
          <path
            d="M-20 220 L-20 85 Q80 55 180 78 Q280 62 380 95 Q480 85 580 115 Q660 112 720 120 Q780 112 860 115 Q960 85 1060 95 Q1160 62 1260 78 Q1360 55 1460 85 L1460 220 Z"
            fill="url(#desk-horizon-cloud)"
          />
          {/* Soft luminous mist across the bottom behind grass crest */}
          <path
            d="M-20 220 L-20 160 Q360 135 720 155 Q1080 135 1460 155 L1460 220 Z"
            fill="#FFFFFF"
            opacity="0.75"
          />
        </svg>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 1 — INTERACTIVE DASHBOARD CONTENT (max-w-5xl Centered)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-3 pb-3 space-y-4">
        {/* ── Unauthenticated Notice ── */}
        {!isAuthenticated && (
          <div className="w-full rounded-2xl border border-white/35 bg-white/20 p-3.5 backdrop-blur-md flex items-center justify-between shadow-sm">
            <div className="min-w-0 pr-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-300 animate-pulse" />
                <h4 className="text-sm font-bold text-white">Sign In Required</h4>
              </div>
              <p className="mt-0.5 text-xs font-medium text-white/90">
                Please sign in or register to record and sync surveys.
              </p>
            </div>
            <button
              type="button"
              onClick={onRequireAuth}
              className="shrink-0 cursor-pointer rounded-xl bg-white px-4 py-2 text-xs font-bold text-teal-800 shadow-sm transition-colors hover:bg-teal-50"
            >
              Sign In
            </button>
          </div>
        )}

        {/* ── 1. OPEN COSMIC HERO LAUNCH ROW ── */}
        <div className="flex items-center justify-between gap-4 pt-1">
          {/* Floating White Title + Frosted Heart Badge */}
          <div className="flex items-center gap-3.5 flex-wrap">
            <h2
              className="text-2xl lg:text-3xl font-black text-white tracking-tight"
              style={{
                textShadow:
                  '0 2px 4px rgba(6,24,78,0.85), 0 1px 0 rgba(8,28,78,0.95), 0 -1px 0 rgba(8,28,78,0.85), 1px 0 0 rgba(8,28,78,0.85), -1px 0 0 rgba(8,28,78,0.85)',
              }}
            >
              Child Nutrition &amp; Support Form
            </h2>
            <AnimatedHeartUnlock />
          </div>

          {/* Horizontal Comic Spaceship "Start New Survey >" Button */}
          <Link
            href="/assessment/new"
            onClick={onStartNewSurvey}
            className="group relative flex h-[58px] w-[340px] items-center cursor-pointer transition-transform duration-200 hover:translate-x-1.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full shrink-0"
          >
            {/* Spaceship SVG */}
            <svg
              viewBox="0 0 360 70"
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_8px_18px_rgba(6,24,78,0.45)]"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="desk-ship-hull" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="56%" stopColor="#F0F7FF" />
                  <stop offset="86%" stopColor="#CBE4FF" />
                  <stop offset="100%" stopColor="#93C5FD" />
                </linearGradient>
                <linearGradient id="desk-ship-fin" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FDE047" />
                  <stop offset="50%" stopColor="#F97316" />
                  <stop offset="100%" stopColor="#C2410C" />
                </linearGradient>
                <linearGradient id="desk-ship-flame" x1="1" y1="0.5" x2="0" y2="0.5">
                  <stop offset="0%" stopColor="#FEF9C3" />
                  <stop offset="35%" stopColor="#FACC15" />
                  <stop offset="72%" stopColor="#F97316" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Horizontal flickering exhaust flame shooting LEFT */}
              <g className="kobo-flame">
                <path
                  d="M54 27 C34 25 18 30 2 35 C18 40 34 45 54 43 Z"
                  fill="url(#desk-ship-flame)"
                />
                <path
                  d="M54 30.5 C42 30.5 31 32.5 20 35 C31 37.5 42 39.5 54 39.5 Z"
                  fill="#FEFCE8"
                />
              </g>

              {/* Metallic thruster nozzle */}
              <path
                d="M51 25 L63 22 L63 48 L51 45 Z"
                fill="#475569"
                stroke="#1E293B"
                strokeWidth="1.4"
              />
              <line
                x1="56"
                y1="24"
                x2="56"
                y2="46"
                stroke="#94A3B8"
                strokeWidth="1.5"
                opacity="0.7"
              />

              {/* Top & bottom aerodynamic orange rear fins */}
              <path
                d="M65 20 C76 9 95 7 110 11 L86 22 Z"
                fill="url(#desk-ship-fin)"
                stroke="#9A3412"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path
                d="M65 50 C76 61 95 63 110 59 L86 48 Z"
                fill="url(#desk-ship-fin)"
                stroke="#9A3412"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />

              {/* Main aerodynamic white fuselage pointing RIGHT */}
              <path
                d="M62 22 C88 10 164 6 254 7 C308 8 349 18 354 35 C349 52 308 62 254 63 C164 64 88 60 62 48 Z"
                fill="url(#desk-ship-hull)"
                stroke="#2563EB"
                strokeWidth="1.6"
              />

              {/* Glossy comic upper specular highlight */}
              <path
                d="M88 16 C158 11 246 11 312 16"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3.2"
                strokeLinecap="round"
                opacity="0.95"
              />
              {/* Subtle nose panel contour */}
              <path
                d="M312 15 C329 19 341 26 346 35 C341 44 329 51 312 55"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.32"
              />
            </svg>

            {/* Foreground CTA content cleanly centered inside fuselage */}
            <button
              type="button"
              aria-label="Start New Survey"
              className="relative z-10 flex w-full items-center justify-between pl-[76px] pr-7 bg-transparent border-none p-0 cursor-pointer focus:outline-none text-left"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-[0_3px_8px_rgba(13,148,136,0.45)] ring-2 ring-white/85">
                  <span className="text-[20px] font-black leading-none -mt-[1px]">+</span>
                </span>
                <span className="truncate text-[15px] font-extrabold tracking-[-0.015em] text-[#0B132B]">
                  Start New Survey
                </span>
              </div>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-[#0B132B] transition-transform duration-200 group-hover:translate-x-1"
                strokeWidth={2.5}
                aria-hidden="true"
              />
            </button>
          </Link>
        </div>

        {/* ── 2. FREE-FLOATING 3-PLANET ORBITAL TRIO ── */}
        <NeedsAttentionPanel
          localDraftsCount={effectiveDraftsCount}
          outboxAttentionCount={effectiveWaitingCount}
          submittedMissingDocsCount={effectiveMissingDocs}
          approvedBankPendingCount={effectiveBankPending}
          serverScopeLabel={serverScopeLabel}
          isServerLoading={isSubmittedLoading}
        />

        {/* ── 3. LOWER DAYTIME SKY SPLIT (Drafts Dock + Submitted Surveys Cloud & Sun) ── */}
        <div className="grid grid-cols-12 gap-8 items-end pt-2 pb-2">
          {/* Left Column (7 cols): My In-Progress Drafts */}
          <section className="col-span-12 md:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h3
                className="text-base font-bold text-white flex items-center gap-2"
                style={{
                  textShadow: '0 1px 3px rgba(6,22,66,0.7)',
                }}
              >
                <span>My In-Progress Drafts</span>
                <span className="text-sm font-semibold text-blue-100">
                  (
                  {isDraftsLoading ? (
                    <span
                      className="inline-block w-3.5 h-3 bg-white/40 animate-pulse rounded align-middle"
                      role="status"
                      aria-label="Loading draft count"
                    />
                  ) : (
                    effectiveDraftsCount
                  )}
                  )
                </span>
              </h3>
            </div>

            {/* Frosted Glass Cloud Panel */}
            <div
              className="rounded-2xl border border-white/60 p-4 shadow-sm backdrop-blur-md"
              style={{
                background: 'rgba(255, 255, 255, 0.82)',
              }}
            >
              {isDraftListLoading ? (
                <div className="p-6 text-center text-xs text-slate-600">
                  Loading local drafts...
                </div>
              ) : drafts.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-300 text-center space-y-2 bg-white/45">
                  <svg
                    className="w-7 h-7 text-slate-500 mx-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-xs font-bold text-slate-800">
                    No active drafts on this device
                  </p>
                  <p className="text-[11px] text-slate-600">
                    When you start a survey, your edits will autosave here so you can continue
                    anytime.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[190px] overflow-y-auto pr-1">
                  {drafts.map((d) => (
                    <DraftCard
                      key={d.id || d.uuid}
                      draft={d}
                      onResume={onResumeDraft}
                      onDelete={onDeleteDraft}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Right Column (5 cols): Submitted surveys Cloud & Golden Sun */}
          <div className="col-span-12 md:col-span-5 flex flex-col items-center justify-end pb-1">
            <Link
              href="/assessment/sync?tab=synced"
              prefetch={true}
              onClick={(e) => {
                if (!isAuthenticated) {
                  e.preventDefault();
                  onRequireAuth();
                }
              }}
              aria-label={`Submitted surveys: ${effectiveSubmittedCount} - Confirmed on central server`}
              className="group relative flex h-[120px] w-[340px] items-end justify-center cursor-pointer transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-3xl"
            >
              {/* Radiant Golden Sun — tucked on upper-right shoulder (z-10) */}
              <div className="pointer-events-none absolute right-[16px] top-[-6px] z-10 flex h-[94px] w-[94px] items-center justify-center">
                {/* Corona glow */}
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
                  className="kobo-sun-rays absolute -inset-3 h-[114px] w-[114px] overflow-visible"
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

                {/* Golden orb with count */}
                <div
                  className="relative flex h-[82px] w-[82px] items-center justify-center rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle at 38% 32%, #FFF59D 0%, #FFD60A 32%, #F59E0B 74%, #D97706 100%)',
                    boxShadow:
                      '0 0 24px rgba(255, 214, 10, 0.85), inset -4px -6px 12px rgba(180, 83, 9, 0.35), inset 3px 3px 8px rgba(255, 255, 255, 0.8), 0 0 0 2.5px rgba(254, 243, 199, 0.9)',
                  }}
                >
                  <span
                    className="text-[2.1rem] leading-none tabular-nums -mt-1.5"
                    style={{
                      fontWeight: 900,
                      color: '#081226',
                      WebkitTextStroke: '0.55px #081226',
                    }}
                  >
                    {isSubmittedLoading ? (
                      <span className="inline-block h-6 w-6 animate-pulse rounded-full bg-amber-900/20" />
                    ) : (
                      effectiveSubmittedCount
                    )}
                  </span>
                </div>
              </div>

              {/* Sculpted Comic Cloud (z-20) */}
              <div className="relative z-20 mr-10 mb-1 flex h-[80px] w-[258px] items-center justify-center">
                <svg
                  viewBox="0 0 270 86"
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_8px_18px_rgba(14,74,158,0.28)]"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="desk-cloud-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="68%" stopColor="#F5FAFF" />
                      <stop offset="100%" stopColor="#CBE5FF" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M44 74 C22 74 8 62 8 47 C8 34 19 23 34 22 C42 10 57 4 74 8 C87 1 106 1 119 10 C134 2 156 5 168 18 C184 14 202 20 210 32 C226 30 244 37 252 48 C260 59 252 74 232 74 C218 81 196 81 182 76 C164 83 136 83 118 77 C98 83 70 82 54 75 Z"
                    fill="url(#desk-cloud-fill)"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                </svg>

                {/* Cloud content */}
                <div className="relative z-10 flex w-full items-center justify-between px-5 pt-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100/95 ring-1 ring-emerald-200/80">
                      <CheckCircle2
                        className="h-5 w-5 text-emerald-600 stroke-[2.3]"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="truncate text-[14px] font-extrabold tracking-[-0.01em] text-[#0B132B]">
                      Submitted surveys
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

            {/* Unobtrusive retry chip when offline or error */}
            {(submittedStatus === 'error' || submittedStatus === 'offline') && (
              <button
                type="button"
                onClick={onRetrySubmitted}
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-[10.5px] font-bold text-slate-800 shadow-xs backdrop-blur-xs hover:bg-white cursor-pointer"
              >
                <RotateCw className="h-3 w-3" aria-hidden="true" />
                <span>
                  {submittedStatus === 'offline'
                    ? 'Offline · Tap to retry sync'
                    : 'Retry server count'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 2 — BOTTOM PLAYGROUND FOOTER + VIEWPORT-SAFE PAUSE BUTTON
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 mt-auto w-full select-none">
        {/* Translucent Pause / Play control */}
        <button
          type="button"
          onClick={toggleAnimations}
          aria-label={animationsEnabled ? 'Pause animations' : 'Resume animations'}
          aria-pressed={!animationsEnabled}
          className="absolute bottom-[calc(100%+8px)] left-6 z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
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
          className="absolute bottom-[calc(100%+8px)] left-[74px] z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
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

        <MiniatureGardenPlayground transparentSky hideControls isPaused={!animationsEnabled} />

        {/* Caption inside bottom grass strip */}
        <div className="absolute bottom-1 inset-x-0 text-center pointer-events-none">
          <p className="text-[11px] font-semibold text-emerald-950/80 tracking-wide">
            Child Nutrition &amp; Support Platform • India HIV/AIDS Alliance
          </p>
        </div>
      </div>
    </div>
  );
}

export default DesktopComicWorkspace;
