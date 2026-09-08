'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HeartPulse,
  Wifi,
  WifiOff,
  RefreshCw,
  FileText,
  PlusCircle,
  BarChart3,
  TableProperties,
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
    { href: '/', label: 'Dashboard', icon: Home },
    { href: '/assessment/new', label: 'New Assessment', icon: PlusCircle },
    { href: '/assessment/drafts', label: 'Drafts', icon: FileText },
    { href: '/assessment/sync', label: 'Sync Centre', icon: RefreshCw, badge: pendingSyncCount },
    { href: '/supervisor/linelist', label: 'Line-List', icon: TableProperties },
    { href: '/supervisor/analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <header className="bg-brand text-white shadow-sm select-none safe-padding-top sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-16">
          {/* Brand & Organization Identity */}
          <Link
            href="/"
            className="flex items-center space-x-2.5 focus-visible:ring-2 focus-visible:ring-white rounded-lg p-1 group"
          >
            <div className="bg-white/10 group-hover:bg-white/15 p-2 rounded-lg flex items-center justify-center transition-colors">
              <HeartPulse className="h-5 w-5 md:h-6 md:w-6 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] md:text-xs uppercase font-bold tracking-wider text-blue-200 leading-none">
                India HIV/AIDS Alliance
              </span>
              <span className="text-xs md:text-sm font-bold text-white leading-tight">
                Childcare Support — Phase 3
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links (Visible on md and above) */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs lg:text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white font-semibold'
                      : 'text-blue-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{link.label}</span>
                  {link.badge !== undefined && link.badge > 0 && (
                    <span className="bg-alert-amber text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Status Indicators (Mobile + Desktop) */}
          <div className="flex items-center space-x-2.5">
            {/* Connectivity Status Pill */}
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isOnline
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/70 border-amber-500/60 text-amber-300'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                  <span>Offline</span>
                </>
              )}
            </div>

            {/* Sync Centre Mobile Shortcut Icon (Hidden on desktop because it's in nav) */}
            <Link
              href="/assessment/sync"
              className="md:hidden relative p-2 rounded-lg bg-white/10 hover:bg-white/15 active:bg-white/20 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
              title="Open Sync Centre"
              aria-label={`Open Sync Centre, ${pendingSyncCount} pending`}
            >
              <RefreshCw className="h-4 w-4 text-white" />
              {pendingSyncCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-alert-amber text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-brand">
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
