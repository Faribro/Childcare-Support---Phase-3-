'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  processQueue,
  registerSubmissionWorkerListeners,
  resumeOnHydration,
} from '@/features/submission/submissionWorker';
import { submissionEvents } from '@/features/submission/submissionEvents';
import { getQueueStats } from '@/lib/db/syncQueueRepository';

export interface SyncFlushResult {
  status: 'idle' | 'success' | 'partial' | 'failed' | 'conflict_detected' | 'network_error';
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
  terminalCount?: number;
  errors?: Array<{ uuid: string; error: string; statusCode?: number }>;
}

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
    async (trigger: string = 'manual'): Promise<SyncFlushResult> => {
      setIsSyncing(true);
      try {
        await processQueue(trigger);
        await refreshStats();
        const res: SyncFlushResult = {
          status: 'success',
          syncedCount: 0,
          failedCount: 0,
          conflictCount: 0,
        };
        setLastResult(res);
        return res;
      } finally {
        setIsSyncing(false);
      }
    },
    [refreshStats]
  );

  useEffect(() => {
    let mounted = true;

    // 1. Register canonical worker browser listeners (online, visibility) once at app root
    const cleanupListeners = registerSubmissionWorkerListeners();

    // 2. Initial hydration flush & stats load
    const initTimer = setTimeout(async () => {
      if (mounted) {
        await refreshStats();
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          resumeOnHydration()
            .then(() => {
              if (mounted) refreshStats();
            })
            .catch(() => {});
        }
      }
    }, 1000);

    // 3. Read-only stats refresh on worker events
    const handleSyncEvent = () => {
      if (mounted) {
        refreshStats();
      }
    };

    const unsubSuccess = submissionEvents.on('submission:success', handleSyncEvent);
    const unsubFailed = submissionEvents.on('submission:failed', handleSyncEvent);
    const unsubRetrying = submissionEvents.on('submission:retrying', handleSyncEvent);
    const unsubConflict = submissionEvents.on('submission:conflict', handleSyncEvent);

    const handleCustomTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      const trigger = customEvent?.detail?.trigger || 'manual';
      if (mounted) {
        processQueue(trigger)
          .then(() => {
            if (mounted) refreshStats();
          })
          .catch(() => {});
      }
    };

    window.addEventListener('child_nutrition:trigger_sync', handleCustomTrigger);
    window.addEventListener('child_nutrition:record_synced', handleSyncEvent);
    window.addEventListener('child_nutrition:sync_completed', handleSyncEvent);

    return () => {
      mounted = false;
      clearTimeout(initTimer);
      cleanupListeners();
      unsubSuccess();
      unsubFailed();
      unsubRetrying();
      unsubConflict();
      window.removeEventListener('child_nutrition:trigger_sync', handleCustomTrigger);
      window.removeEventListener('child_nutrition:record_synced', handleSyncEvent);
      window.removeEventListener('child_nutrition:sync_completed', handleSyncEvent);
    };
  }, [refreshStats]);

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
