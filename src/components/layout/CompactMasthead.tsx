'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Shield,
  Lock,
  Unlock,
  TableProperties,
  Activity,
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
  const [requireAccessCodeGate, setRequireAccessCodeGate] = useState(false);
  const pathname = usePathname();
  const { isUnlocked, user } = useEvaluationAccess();
  const summary = useSubmissionSummary({ enabled: submittedCount === undefined });

  const isEvalRole = Boolean(
    isUnlocked &&
    user?.isVerified &&
    (user.role === 'LEADERSHIP' || user.role === 'STATE_REVIEWER' || user.role === 'ADMIN')
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      const handleOpenLogin = (evt: Event) => {
        const detail = (evt as CustomEvent<{ requireAccessCodeGate?: boolean }>)?.detail;
        setRequireAccessCodeGate(
          typeof detail?.requireAccessCodeGate === 'boolean' ? detail.requireAccessCodeGate : !isUnlocked
        );
        setIsLoginModalOpen(true);
      };
      window.addEventListener('child_nutrition:open_login_modal', handleOpenLogin);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('child_nutrition:open_login_modal', handleOpenLogin);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, [isUnlocked]);

  const displayCount = submittedCount !== undefined ? submittedCount : summary.submittedCount;
  const effectivePending = pendingSyncCount !== undefined ? pendingSyncCount : summary.localPendingSyncCount;

  const isFormsActive = pathname === '/' || pathname === '/app';
  const isSyncActive = Boolean(pathname?.startsWith('/assessment/sync'));
  const isSupervisorActive = Boolean(pathname?.startsWith('/supervisor'));
  const isFormRoute = Boolean(
    pathname?.startsWith('/assessment/new') ||
    pathname?.startsWith('/assessment/draft') ||
    pathname?.startsWith('/assessment/record')
  );

  const headerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDisintegrated, setIsDisintegrated] = useState(false);

  const triggerDisintegration = () => {
    if (!headerRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const rect = headerRef.current.getBoundingClientRect();
    const colors = ['#ffffff', '#38bdf8', '#1e6eeb', '#60a5fa', '#facc15', '#10b981'];
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      decay: number;
      color: string;
    }> = [];

    const step = 8;
    for (let x = rect.left; x < rect.right; x += step) {
      for (let y = rect.top; y < rect.bottom; y += step) {
        particles.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 2.5 - 0.8,
          size: Math.random() * 3 + 1.5,
          alpha: 1,
          decay: Math.random() * 0.025 + 0.015,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }

    setIsDisintegrated(true);

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      if (particles.length > 0) {
        animId = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    animId = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const handleDissolve = () => {
      triggerDisintegration();
    };
    window.addEventListener('child_nutrition:dissolve_navbar', handleDissolve);
    return () => {
      window.removeEventListener('child_nutrition:dissolve_navbar', handleDissolve);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-40 w-full transition-all duration-500 bg-transparent select-none ${
        isDisintegrated
          ? 'opacity-0 pointer-events-none -translate-y-4 scale-[0.98]'
          : 'opacity-100 pointer-events-auto'
      }`}
    >
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-50"
        aria-hidden="true"
      />
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
            href={isEvalRole ? '/supervisor' : '/app'}
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

          {/* Center Pill Dock */}
          <nav className="flex items-center space-x-1" aria-label="Main Navigation">
            {isEvalRole ? (
              isSupervisorActive ? (
                /* Inside /supervisor* routes, SupervisorTabNav right below provides the single workspace nav bar */
                <div
                  data-testid="evaluation-scope-pill"
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EFF6FF] border border-blue-100/90 text-xs font-bold text-[#093282] shadow-2xs select-none"
                >
                  <Shield className="w-3.5 h-3.5 text-[#155AD1] shrink-0" aria-hidden="true" />
                  <span>
                    {user?.role === 'STATE_REVIEWER'
                      ? `State Evaluation · ${(user.allowedStates || []).filter((s) => s !== '*').join(', ') || 'Assigned Scope'}`
                      : user?.role === 'ADMIN'
                      ? 'System Evaluation · All States'
                      : 'National Administration · All States'}
                  </span>
                </div>
              ) : (
                /* Evaluation Workspace Quick Switcher when viewing sub-pages outside /supervisor* (e.g. Full Dossier) */
                <div className="flex items-center p-1 rounded-full bg-[#EFF6FF] border border-blue-100/80 gap-1 shadow-2xs">
                {/* Tab 1: Overview & Surveillance */}
                <Link
                  href="/supervisor"
                  aria-current={pathname === '/supervisor' ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 select-none ${
                    pathname === '/supervisor'
                      ? 'text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
                  }`}
                  style={
                    pathname === '/supervisor'
                      ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                      : undefined
                  }
                >
                  <Activity className={`w-3.5 h-3.5 ${pathname === '/supervisor' ? 'text-white' : 'text-blue-600'}`} />
                  <span>Overview</span>
                </Link>

                {/* Tab 2: Beneficiary Linelist */}
                <Link
                  href="/supervisor/assessments"
                  aria-current={pathname?.startsWith('/supervisor/assessments') ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 select-none ${
                    pathname?.startsWith('/supervisor/assessments')
                      ? 'text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
                  }`}
                  style={
                    pathname?.startsWith('/supervisor/assessments')
                      ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                      : undefined
                  }
                >
                  <TableProperties className={`w-3.5 h-3.5 ${pathname?.startsWith('/supervisor/assessments') ? 'text-white' : 'text-blue-600'}`} />
                  <span>Beneficiary Linelist</span>
                </Link>

                {/* Tab 3: Clinical Analytics */}
                <Link
                  href="/supervisor/analytics"
                  aria-current={pathname?.startsWith('/supervisor/analytics') ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 select-none ${
                    pathname?.startsWith('/supervisor/analytics')
                      ? 'text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                  style={
                    pathname?.startsWith('/supervisor/analytics')
                      ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                      : undefined
                  }
                >
                  <span>Analytics</span>
                </Link>

                {/* Tab 4: Field Workers */}
                <Link
                  href="/supervisor/field-workers"
                  aria-current={pathname?.startsWith('/supervisor/field-workers') ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 select-none ${
                    pathname?.startsWith('/supervisor/field-workers')
                      ? 'text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                  style={
                    pathname?.startsWith('/supervisor/field-workers')
                      ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                      : undefined
                  }
                >
                  <span>Field Workers</span>
                </Link>
              </div>
              )
            ) : (
              /* Field Caseworker & Signed-out Dock: Forms, Submitted Surveys, Evaluation */
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

                {/* Tab 3: Staff Access */}
                {isUnlocked ? (
                  <Link
                    href="/supervisor"
                    onClick={triggerDisintegration}
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
                    title="Staff Access (Active)"
                  >
                    <Unlock className={`w-3.5 h-3.5 ${isSupervisorActive ? 'text-white' : 'text-blue-600'}`} />
                    <span>Staff Access</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRequireAccessCodeGate(true);
                      setIsLoginModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/70 cursor-pointer transition-all select-none"
                    title="Sign in for Staff Access"
                    aria-label="Staff Access Locked - Sign in to access"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Staff Access</span>
                  </button>
                )}
              </div>
            )}

            <EvaluationLoginModal
              isOpen={isLoginModalOpen}
              requireAccessCodeGate={requireAccessCodeGate}
              onClose={() => {
                setIsLoginModalOpen(false);
                setRequireAccessCodeGate(false);
              }}
            />
          </nav>

          {/* Right Utility Cluster: Wi-Fi, Profile / Sign In, Refresh */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Outbox Badge when items are waiting (Field Workers only) */}
            {!isEvalRole && effectivePending > 0 && (
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
              className={`h-9 w-9 rounded-full flex items-center justify-center transition-all ${
                isOnline
                  ? 'bg-emerald-400/20 border border-emerald-400/90 text-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.7),inset_0_0_7px_rgba(52,211,153,0.45)]'
                  : 'bg-red-500/25 border border-red-500/90 text-red-500 animate-pulse shadow-[0_0_16px_rgba(239,68,68,0.85),inset_0_0_8px_rgba(248,113,113,0.55)]'
              }`}
            >
              {isOnline ? (
                <Wifi className="w-4 h-4 text-emerald-500 drop-shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.95)]" />
              )}
            </div>

            {/* Profile Menu Trigger (Blazing Solar Comet Pill or Solar Avatar) */}
            <ProfileMenu />

            {/* Refresh / Sync Button (Hidden on Form Pages) */}
            {!isFormRoute && (
              <Link
                href="/assessment/sync"
                className="h-9 w-9 rounded-full bg-[rgba(239,246,255,0.95)] border border-[rgba(191,219,254,0.9)] flex items-center justify-center text-sky-700 hover:bg-sky-100 active:scale-95 transition-all shadow-2xs"
                title="Open Sync Centre"
                aria-label={`Open Sync Centre, ${effectivePending} pending`}
              >
                <RefreshCw className={`w-4 h-4 ${effectivePending > 0 ? 'animate-spin' : ''}`} />
              </Link>
            )}
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
          href={isEvalRole ? '/supervisor' : '/app'}
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
          {!isEvalRole && effectivePending > 0 && (
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
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${
              isOnline
                ? 'bg-emerald-400/20 border border-emerald-400/90 text-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.65),inset_0_0_6px_rgba(52,211,153,0.4)]'
                : 'bg-red-500/25 border border-red-500/90 text-red-500 animate-pulse shadow-[0_0_14px_rgba(239,68,68,0.85),inset_0_0_7px_rgba(248,113,113,0.5)]'
            }`}
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-500 drop-shadow-[0_0_5px_rgba(16,185,129,0.9)]" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-red-500 drop-shadow-[0_0_7px_rgba(239,68,68,0.95)]" />
            )}
          </div>

          {/* Profile Menu Trigger */}
          <ProfileMenu />

          {/* Right Action: Sync Centre for Field, Quick Linelist only when Eval is outside /supervisor* */}
          {!isFormRoute && (
            isEvalRole ? (
              !isSupervisorActive ? (
                <Link
                  href="/supervisor/assessments"
                  className="relative h-8 w-8 rounded-full bg-[rgba(239,246,255,0.95)] border border-[rgba(191,219,254,0.9)] flex items-center justify-center text-sky-700 active:bg-sky-100 transition-colors"
                  title="Beneficiary Linelist"
                  aria-label="Beneficiary Linelist"
                >
                  <TableProperties className="h-3.5 w-3.5" />
                </Link>
              ) : null
            ) : (
              <Link
                href="/assessment/sync"
                className="relative h-8 w-8 rounded-full bg-[rgba(239,246,255,0.95)] border border-[rgba(191,219,254,0.9)] flex items-center justify-center text-sky-700 active:bg-sky-100 transition-colors"
                title="Open Sync Centre"
                aria-label={`Open Sync Centre, ${effectivePending} pending`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
