'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  HeartPulse,
  Wifi,
  WifiOff,
  RefreshCw,
  PlusCircle,
  Shield,
  Home,
  Globe,
  Lock,
  Unlock,
} from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { getAllQueueItems } from '@/lib/db/syncQueueRepository';

interface CompactMastheadProps {
  pendingSyncCount?: number;
  submittedCount?: number;
}

export function CompactMasthead({ pendingSyncCount = 0, submittedCount }: CompactMastheadProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [internalSubmittedCount, setInternalSubmittedCount] = useState<number>(submittedCount ?? 0);
  const pathname = usePathname();
  const { isUnlocked } = useEvaluationAccess();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Sync count of submitted surveys dynamically across pages
  useEffect(() => {
    if (submittedCount !== undefined) {
      setInternalSubmittedCount(submittedCount);
      return;
    }

    let active = true;
    async function loadCounts() {
      try {
        const queue = await getAllQueueItems();
        let total = queue.filter((q) => q.status === 'synced').length;
        try {
          const res = await fetch('/api/submissions?limit=1');
          if (res.ok) {
            const json = await res.json();
            if (json.pagination?.totalCount !== undefined) {
              total = json.pagination.totalCount;
            } else if (json.total !== undefined) {
              total = json.total;
            }
          }
        } catch (_) {}

        if (active) {
          setInternalSubmittedCount(total);
        }
      } catch (_) {}
    }

    loadCounts();
    const handleSync = () => loadCounts();
    window.addEventListener('child_nutrition:sync_completed', handleSync);
    return () => {
      active = false;
      window.removeEventListener('child_nutrition:sync_completed', handleSync);
    };
  }, [submittedCount]);

  const displayCount = submittedCount !== undefined ? submittedCount : internalSubmittedCount;

  const navLinks = [
    { href: '/', label: 'Forms', icon: Home },
    { href: '/assessment/sync', label: 'Submitted Surveys', icon: RefreshCw, badge: pendingSyncCount },
  ];

  return (
    <header className="bg-white border-b border-[hsl(215,18%,88%)] text-slate-800 shadow-xs select-none sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Brand & Platform Identity - Alliance India Logo Only (No text in top left) */}
          <Link
            href="/"
            className="flex items-center rounded-lg p-0.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            title="India HIV/AIDS Alliance"
          >
            <Image
              src="/alliance-india-logo.png"
              alt="India HIV/AIDS Alliance"
              width={160}
              height={44}
              className="h-9 sm:h-11 w-auto object-contain transition-transform group-hover:scale-[1.02]"
              priority
            />
          </Link>

          {/* Clean Pill Navigation (Visible on md and above) */}
          <nav className="hidden md:flex items-center space-x-1 sm:space-x-2" aria-label="Main Navigation">
            {navLinks.map((link) => {
              const isActive =
                link.href === '/'
                  ? pathname === '/'
                  : pathname?.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 select-none ${
                    isActive
                      ? 'bg-teal-50/80 text-teal-800'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <span className="inline-flex items-baseline">
                    <span>{link.label}</span>
                    {link.href === '/assessment/sync' && (
                      <sup className="text-[10.5px] font-bold ml-0.5 -top-1.5 select-none font-mono tracking-tight">
                        {displayCount}
                      </sup>
                    )}
                  </span>
                  {link.badge !== undefined && link.badge > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {link.badge}
                    </span>
                  )}
                  {/* Smooth Animated Underline Below Nav Item */}
                  {isActive ? (
                    <span className="absolute -bottom-1 left-2 right-2 h-[2.5px] rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 shadow-[0_2px_6px_rgba(13,148,136,0.35)] animate-in fade-in duration-300" />
                  ) : (
                    <span className="absolute -bottom-1 left-3 right-3 h-[2px] rounded-full bg-teal-400/40 opacity-0 group-hover:opacity-100 transition-all duration-200" />
                  )}
                </Link>
              );
            })}

            {/* Evaluation Tab - Muted with Lock icon when locked; unlocked when clicked 3 times on animated heart */}
            {isUnlocked ? (
              <Link
                href="/supervisor"
                className={`group relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  pathname?.startsWith('/supervisor')
                    ? 'bg-teal-50/80 text-teal-900 border border-teal-200/80 shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Evaluation Portal (Unlocked)"
              >
                <Shield className="h-3.5 w-3.5 text-teal-700 transition-transform duration-200 group-hover:scale-110" />
                <span>Evaluation</span>
                {pathname?.startsWith('/supervisor') ? (
                  <span className="absolute -bottom-1 left-2 right-2 h-[2.5px] rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 shadow-[0_2px_6px_rgba(13,148,136,0.35)] animate-in fade-in duration-300" />
                ) : (
                  <span className="absolute -bottom-1 left-3 right-3 h-[2px] rounded-full bg-teal-400/40 opacity-0 group-hover:opacity-100 transition-all duration-200" />
                )}
              </Link>
            ) : (
              <button
                type="button"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 bg-slate-50/70 border border-dashed border-slate-200/80 cursor-not-allowed transition-all opacity-70"
                title="Evaluation"
                disabled
              >
                <Lock className="h-3 w-3 text-slate-400 shrink-0" />
                <span>Evaluation</span>
              </button>
            )}
          </nav>

          {/* Status & Mobile Actions */}
          <div className="flex items-center space-x-2">
            {/* Connectivity Pill - Wifi Icon Only (No Text) */}
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
                isOnline
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
              title={isOnline ? 'Online' : 'Offline'}
            >
              {isOnline ? (
                <Wifi className="h-4 w-4 text-emerald-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-amber-600" />
              )}
            </div>

            {/* Mobile Sync Centre Shortcut */}
            <Link
              href="/assessment/sync"
              className="md:hidden relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 active:bg-slate-200 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
              title="Open Sync Centre"
              aria-label={`Open Sync Centre, ${pendingSyncCount} pending`}
            >
              <RefreshCw className="h-4 w-4 text-slate-700" />
              {pendingSyncCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-white">
                  {pendingSyncCount > 9 ? '9+' : pendingSyncCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
