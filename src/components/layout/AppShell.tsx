'use client';

import React from 'react';
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
  hideHeader?: boolean;
}

export function AppShell({
  children,
  activeChild,
  pendingSyncCount = 0,
  hideHeader = false,
}: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-ink-900 w-full overflow-x-hidden">
      {/* Top Masthead */}
      {!hideHeader && <CompactMasthead pendingSyncCount={pendingSyncCount} />}

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
