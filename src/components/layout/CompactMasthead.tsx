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

interface CompactMastheadProps {
  pendingSyncCount?: number;
}

export function CompactMasthead({ pendingSyncCount = 0 }: CompactMastheadProps) {
  const [isOnline, setIsOnline] = useState(true);
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
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-[hsl(210,80%,95%)] text-[hsl(210,80%,35%)]'
                      : 'text-[hsl(220,15%,35%)] hover:bg-[hsl(215,20%,94%)]'
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge !== undefined && link.badge > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Evaluation Tab - Muted with Lock icon when locked; unlocked when clicked 3 times on animated heart */}
            {isUnlocked ? (
              <Link
                href="/supervisor"
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  pathname?.startsWith('/supervisor')
                    ? 'bg-teal-50 text-teal-900 border border-teal-200 shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Evaluation Portal (Unlocked)"
              >
                <Shield className="h-3.5 w-3.5 text-teal-700" />
                <span>Evaluation</span>
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              </Link>
            ) : (
              <button
                type="button"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-400 bg-slate-50/70 border border-dashed border-slate-200/80 cursor-not-allowed transition-all opacity-70"
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
