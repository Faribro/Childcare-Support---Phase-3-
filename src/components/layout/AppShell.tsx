'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { CompactMasthead } from './CompactMasthead';
import { MobileContextBar } from './MobileContextBar';
import type { SyncStatus } from '@/types/domain';

interface AppShellProps {
  children: React.ReactNode;
  activeChild?: {
    artNumber?: string;
    childName?: string;
    saveStatus?: 'saving' | 'saved' | SyncStatus;
    lastSavedText?: string;
  };
  pendingSyncCount?: number;
  submittedCount?: number;
  hideHeader?: boolean;
}

export function AppShell({
  children,
  activeChild,
  pendingSyncCount = 0,
  submittedCount,
  hideHeader = false,
}: AppShellProps) {
  const pathname = usePathname();
  const isCosmicPage = pathname === '/app' || pathname === '/';
  const isSupervisorPage = Boolean(pathname?.startsWith('/supervisor'));

  return (
    <div
      className={`min-h-screen flex flex-col w-full overflow-x-clip ${
        isCosmicPage
          ? 'bg-transparent text-slate-900'
          : isSupervisorPage
          ? 'bg-[#F4F8FF] text-slate-900 cosmic-scroll'
          : 'bg-surface-canvas text-ink-900'
      }`}
      style={
        isCosmicPage
          ? {
              background:
                'linear-gradient(180deg, #072B7C 0%, #0D44B6 16%, #1864E0 36%, #2C88F8 58%, #4BAEFF 76%, #88D1FF 90%, #BCE9FF 100%)',
            }
          : undefined
      }
    >
      {/* Top Masthead — Option B Floating Cloud-Glass Navbar */}
      {!hideHeader && (
        <CompactMasthead
          pendingSyncCount={pendingSyncCount}
          submittedCount={submittedCount}
        />
      )}

      {/* Persistent Form Context Bar (Rendered during active assessment) */}
      {activeChild && (
        <MobileContextBar
          artNumber={activeChild.artNumber}
          childName={activeChild.childName}
          saveStatus={activeChild.saveStatus}
          lastSavedText={activeChild.lastSavedText}
        />
      )}

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 flex flex-col w-full">
        {children}
      </main>
    </div>
  );
}
