'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Shield,
  Lock,
} from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { useSubmissionSummary } from '@/hooks/useSubmissionSummary';
import { EvaluationLoginModal } from '@/components/auth/EvaluationLoginModal';
import { ProfileMenu } from '@/components/layout/ProfileMenu';

interface CompactMastheadProps {
  pendingSyncCount?: number;
  submittedCount?: number;
}

export function CompactMasthead({ pendingSyncCount, submittedCount }: CompactMastheadProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const pathname = usePathname();
  const { isUnlocked } = useEvaluationAccess();
  const summary = useSubmissionSummary({ enabled: submittedCount === undefined });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      const handleOpenLogin = () => setIsLoginModalOpen(true);
      window.addEventListener('child_nutrition:open_login_modal', handleOpenLogin);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('child_nutrition:open_login_modal', handleOpenLogin);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const displayCount = submittedCount !== undefined ? submittedCount : summary.submittedCount;
  const effectivePending = pendingSyncCount !== undefined ? pendingSyncCount : summary.localPendingSyncCount;

  const isFormsActive = pathname === '/' || pathname === '/app';
  const isSyncActive = Boolean(pathname?.startsWith('/assessment/sync'));
  const isSupervisorActive = Boolean(pathname?.startsWith('/supervisor'));

  return (
    <header className="sticky top-0 z-40 w-full transition-all bg-transparent pointer-events-auto select-none">
      {/* ═══════════════════════════════════════════════════════════════════════
          DESKTOP (md:flex): Option B Floating White Cloud-Glass Pill Bar
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block pt-2.5 px-4 w-full">
        <div
          className="max-w-6xl mx-auto h-14 rounded-full flex items-center justify-between px-4 sm:px-6 shadow-[0_10px_28px_-6px_rgba(6,26,76,0.28)] border border-white/88 backdrop-blur-[14px]"
          style={{
            background: 'rgba(255, 255, 255, 0.90)',
          }}
        >
          {/* Brand Logo — Unboxed on light cloud surface */}
          <Link
            href="/app"
            aria-label="Alliance India Home"
            className="flex items-center rounded-lg p-0.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="India HIV/AIDS Alliance"
          >
            <Image
              src="/alliance-india-logo.png"
              alt="India HIV/AIDS Alliance"
              width={160}
              height={44}
              className="h-9 sm:h-10 w-auto object-contain transition-transform group-hover:scale-[1.02]"
              priority
            />
          </Link>

          {/* Center Pill Dock: Forms, Submitted Surveys, Evaluation */}
          <nav className="flex items-center space-x-1" aria-label="Main Navigation">
            <div className="flex items-center p-1 rounded-full bg-[#EFF6FF] border border-blue-100/80 gap-1 shadow-2xs">
              {/* Tab 1: Forms */}
              <Link
                href="/app"
                aria-current={isFormsActive ? 'page' : undefined}
                className={`flex items-center px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 select-none ${
                  isFormsActive
                    ? 'text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                }`}
                style={
                  isFormsActive
                    ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                    : undefined
                }
              >
                <span>Forms</span>
              </Link>

              {/* Tab 2: Submitted Surveys + Golden Sun Count Badge */}
              <Link
                href="/assessment/sync"
                aria-current={isSyncActive ? 'page' : undefined}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 select-none ${
                  isSyncActive
                    ? 'text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
                }`}
                style={
                  isSyncActive
                    ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                    : undefined
                }
              >
                <span>Submitted Surveys</span>
                <span
                  className="inline-flex items-center justify-center rounded-full px-1.5 py-0.2 font-mono text-[11px] font-black leading-tight shadow-2xs"
                  style={{
                    background: 'linear-gradient(135deg, #FEF08A 0%, #FACC15 100%)',
                    color: '#081226',
                    border: '1px solid rgba(234, 179, 8, 0.45)',
                  }}
                  title={
                    summary.isLocalOnlyCount
                      ? 'Submissions saved locally on this device'
                      : 'Authoritative server-confirmed submissions'
                  }
                  aria-label={
                    summary.isLocalOnlyCount
                      ? `${displayCount} local submissions saved on this device`
                      : `${displayCount} server-confirmed submissions`
                  }
                >
                  {displayCount}
                </span>
                {effectivePending > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full shadow-2xs">
                    {effectivePending}
                  </span>
                )}
              </Link>

              {/* Tab 3: Evaluation Portal */}
              {isUnlocked ? (
                <Link
                  href="/supervisor"
                  aria-current={isSupervisorActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 select-none ${
                    isSupervisorActive
                      ? 'text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
                  }`}
                  style={
                    isSupervisorActive
                      ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                      : undefined
                  }
                  title="Evaluation Portal (Unlocked)"
                >
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                  <span>Evaluation</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/70 cursor-pointer transition-all select-none"
                  title="Sign in to unlock Evaluation Portal"
                  aria-label="Evaluation Portal Locked - Sign in to access"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Evaluation</span>
                </button>
              )}
            </div>

            <EvaluationLoginModal
              isOpen={isLoginModalOpen}
              onClose={() => setIsLoginModalOpen(false)}
            />
          </nav>

          {/* Right Utility Cluster: Wi-Fi, Profile / Sign In, Refresh */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Outbox Badge when items are waiting */}
            {effectivePending > 0 && (
              <Link
                href="/assessment/sync?tab=outbox"
                data-testid="waiting-to-send-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-[11px] font-bold shadow-2xs transition-colors whitespace-nowrap"
                title={`${effectivePending} assessment${effectivePending === 1 ? '' : 's'} waiting to send`}
                aria-label={`${effectivePending} waiting to send`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse shrink-0" aria-hidden="true" />
                <span className="tabular-nums">{effectivePending} waiting</span>
              </Link>
            )}

            {/* Wi-Fi Status Orb */}
            <div
              role="status"
              aria-live="polite"
              aria-label={isOnline ? 'Online' : 'Offline'}
              title={isOnline ? 'Online — Connected to server' : 'Offline — Operating from local cache'}
              className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors shadow-2xs ${
                isOnline
                  ? 'bg-[rgba(209,250,229,0.85)] border border-emerald-200/70 text-[#059669]'
                  : 'bg-amber-100 border border-amber-300 text-amber-800'
              }`}
            >
              {isOnline ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
            </div>

            {/* Profile Menu Trigger (Blazing Solar Comet Pill or Solar Avatar) */}
            <ProfileMenu />

            {/* Refresh / Sync Button */}
            <Link
              href="/assessment/sync"
              className="h-9 w-9 rounded-full bg-[rgba(239,246,255,0.95)] border border-[rgba(191,219,254,0.9)] flex items-center justify-center text-sky-700 hover:bg-sky-100 active:scale-95 transition-all shadow-2xs"
              title="Open Sync Centre"
              aria-label={`Open Sync Centre, ${effectivePending} pending`}
            >
              <RefreshCw className={`w-4 h-4 ${effectivePending > 0 ? 'animate-spin' : ''}`} />
            </Link>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MOBILE (md:hidden): Option B Sticky White Cloud-Glass Header Bar
      ═══════════════════════════════════════════════════════════════════════ */}
      <div
        className="md:hidden w-full h-14 border-b border-blue-200/75 flex items-center justify-between px-3 select-none backdrop-blur-[12px]"
        style={{
          background: 'rgba(255, 255, 255, 0.92)',
        }}
      >
        {/* Brand Logo */}
        <Link
          href="/app"
          aria-label="Alliance India Home"
          className="flex items-center rounded-lg p-0.5 group focus-visible:outline-none"
          title="India HIV/AIDS Alliance"
        >
          <Image
            src="/alliance-india-logo.png"
            alt="India HIV/AIDS Alliance"
            width={140}
            height={38}
            className="h-8 w-auto object-contain transition-transform group-hover:scale-[1.02]"
            priority
          />
        </Link>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {effectivePending > 0 && (
            <Link
              href="/assessment/sync?tab=outbox"
              data-testid="waiting-to-send-badge-mobile"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-bold"
              aria-label={`${effectivePending} waiting`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
              <span>{effectivePending}</span>
            </Link>
          )}

          {/* Wi-Fi Orb */}
          <div
            role="status"
            aria-label={isOnline ? 'Online' : 'Offline'}
            title={isOnline ? 'Online' : 'Offline'}
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors shadow-2xs ${
              isOnline
                ? 'bg-[rgba(209,250,229,0.85)] border border-emerald-200/70 text-[#059669]'
                : 'bg-amber-100 border border-amber-300 text-amber-800'
            }`}
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
          </div>

          {/* Profile Menu Trigger */}
          <ProfileMenu />

          {/* Sync Centre shortcut */}
          <Link
            href="/assessment/sync"
            className="relative h-8 w-8 rounded-full bg-[rgba(239,246,255,0.95)] border border-[rgba(191,219,254,0.9)] flex items-center justify-center text-sky-700 active:bg-sky-100 transition-colors"
            title="Open Sync Centre"
            aria-label={`Open Sync Centre, ${effectivePending} pending`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
