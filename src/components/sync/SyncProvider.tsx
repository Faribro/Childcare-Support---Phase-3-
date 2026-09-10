'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { syncOrchestrator, SyncFlushResult } from '@/lib/sync/syncOrchestrator';
import { getQueueStats } from '@/lib/db/syncQueueRepository';

interface SyncContextType {
  flushNow: (trigger?: string) => Promise<SyncFlushResult>;
  isSyncing: boolean;
  lastResult: SyncFlushResult | null;
  stats: {
    total: number;
    queued: number;
    syncing: number;
    synced: number;
    failedRetryable: number;
    failedFinal: number;
    conflict: number;
  };
  refreshStats: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function useSyncContext(): SyncContextType {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSyncContext must be used within a SyncProvider');
  }
  return ctx;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncFlushResult | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    queued: 0,
    syncing: 0,
    synced: 0,
    failedRetryable: 0,
    failedFinal: 0,
    conflict: 0,
  });

  const refreshStats = useCallback(async () => {
    try {
      const s = await getQueueStats();
      setStats(s);
    } catch {
      // IndexedDB might not be open yet during early SSR/hydration
    }
  }, []);

  const flushNow = useCallback(
    async (trigger: string = 'manual') => {
      setIsSyncing(true);
      try {
        const res = await syncOrchestrator.flushQueue(trigger as any);
        setLastResult(res);
        await refreshStats();
        return res;
      } finally {
        setIsSyncing(false);
      }
    },
    [refreshStats]
  );

  useEffect(() => {
    let mounted = true;

    // 1. Initial hydration flush
    const initTimer = setTimeout(async () => {
      if (mounted) {
        await refreshStats();
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          flushNow('app_init').catch(() => {});
        }
      }
    }, 1000);

    // 2. Lifecycle event wiring
    const handleOnline = () => {
      if (mounted) flushNow('online_event').catch(() => {});
    };

    const handleFocus = () => {
      if (mounted && typeof navigator !== 'undefined' && navigator.onLine) {
        flushNow('window_focus').catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (
        mounted &&
        document.visibilityState === 'visible' &&
        typeof navigator !== 'undefined' &&
        navigator.onLine
      ) {
        flushNow('visibility_visible').catch(() => {});
      }
    };

    const handleCustomTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      const trigger = customEvent?.detail?.trigger || 'manual';
      if (mounted) {
        flushNow(trigger).catch(() => {});
      }
    };

    const handleRecordSynced = () => {
      if (mounted) {
        refreshStats();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('child_nutrition:trigger_sync', handleCustomTrigger);
    window.addEventListener('child_nutrition:record_synced', handleRecordSynced);
    window.addEventListener('child_nutrition:sync_completed', handleRecordSynced);

    // 3. Periodic interval (every 25 seconds when page is visible)
    const interval = setInterval(() => {
      if (
        mounted &&
        document.visibilityState === 'visible' &&
        typeof navigator !== 'undefined' &&
        navigator.onLine
      ) {
        flushNow('interval').catch(() => {});
      }
    }, 25000);

    return () => {
      mounted = false;
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('child_nutrition:trigger_sync', handleCustomTrigger);
      window.removeEventListener('child_nutrition:record_synced', handleRecordSynced);
      window.removeEventListener('child_nutrition:sync_completed', handleRecordSynced);
    };
  }, [flushNow, refreshStats]);

  return (
    <SyncContext.Provider
      value={{
        flushNow,
        isSyncing,
        lastResult,
        stats,
        refreshStats,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
