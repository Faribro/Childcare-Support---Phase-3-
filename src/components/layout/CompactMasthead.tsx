'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HeartPulse,
  Wifi,
  WifiOff,
  RefreshCw,
  PlusCircle,
  Shield,
  Home,
} from 'lucide-react';

interface CompactMastheadProps {
  pendingSyncCount?: number;
}

export function CompactMasthead({ pendingSyncCount = 0 }: CompactMastheadProps) {
  const [isOnline, setIsOnline] = useState(true);
  const pathname = usePathname();

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
    { href: '/assessment/new', label: 'New Assessment', icon: PlusCircle },
    { href: '/assessment/sync', label: 'Sync Centre', icon: RefreshCw, badge: pendingSyncCount },
    { href: '/supervisor', label: 'Supervisor', icon: Shield },
  ];

  return (
    <header className="bg-white border-b border-slate-200 text-slate-800 shadow-xs select-none sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Brand & Platform Identity */}
          <Link
            href="/"
            className="flex items-center space-x-2.5 rounded-lg p-1 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div className="bg-emerald-50 text-emerald-700 p-2 rounded-lg flex items-center justify-center border border-emerald-200 group-hover:bg-emerald-100 transition-colors">
              <HeartPulse className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 leading-none">
                India HIV/AIDS Alliance
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                Paediatric Support Platform
              </span>
            </div>
          </Link>

          {/* Clean Pill Navigation (Visible on md and above) */}
          <nav className="hidden md:flex items-center space-x-1.5" aria-label="Main Navigation">
            {navLinks.map((link) => {
              const isActive =
                link.href === '/'
                  ? pathname === '/'
                  : pathname?.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 border border-slate-300 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
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
          </nav>

          {/* Status & Mobile Actions */}
          <div className="flex items-center space-x-2">
            {/* Connectivity Pill */}
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isOnline
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-600" />
                  <span>Offline</span>
                </>
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
