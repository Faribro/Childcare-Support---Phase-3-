'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDraftsCount } from '@/lib/db/draftRepository';
import { getWaitingQueueCount, getLocalSyncedCount } from '@/lib/db/syncQueueRepository';

export interface SubmissionSummaryFilters {
  state?: string;
  district?: string;
  enabled?: boolean;
}

export interface SubmissionSummaryState {
  serverConfirmedCount: number;
  localDraftCount: number;
  localPendingSyncCount: number;
  localSyncedCount: number;
  submittedCount: number;
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  isOffline: boolean;
  source: 'server' | 'cache' | 'local';
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

const CACHE_KEY = 'child_nutrition:summary_cache_v1';

export function useSubmissionSummary(filters?: SubmissionSummaryFilters): SubmissionSummaryState {
  const [serverConfirmedCount, setServerConfirmedCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (typeof parsed.count === 'number') return parsed.count;
        }
      } catch (_) {}
    }
    return 0;
  });

  const [localDraftCount, setLocalDraftCount] = useState<number>(0);
  const [localPendingSyncCount, setLocalPendingSyncCount] = useState<number>(0);
  const [localSyncedCount, setLocalSyncedCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [source, setSource] = useState<'server' | 'cache' | 'local'>('cache');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const loadCounts = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine;
    setIsOffline(offlineNow);

    // 1. Instant local IndexedDB queries (< 10ms)
    try {
      const [drafts, waiting, synced] = await Promise.all([
        getDraftsCount().catch(() => 0),
        getWaitingQueueCount().catch(() => 0),
        getLocalSyncedCount().catch(() => 0),
      ]);

      if (isMountedRef.current) {
        setLocalDraftCount(drafts);
        setLocalPendingSyncCount(waiting);
        setLocalSyncedCount(synced);
      }
    } catch (_) {}

    // 2. If completely offline, use local data / cache
    if (offlineNow) {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsError(false);
        setSource('local');
      }
      return;
    }

    // 3. Online fetch from authoritative summary endpoint
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const params = new URLSearchParams();
      if (filters?.state && filters.state.toUpperCase() !== 'ALL') {
        params.set('state', filters.state);
      }
      if (filters?.district && filters.district.toUpperCase() !== 'ALL') {
        params.set('district', filters.district);
      }

      const queryString = params.toString() ? `?${params.toString()}` : '';
      let confirmed: number | null = null;

      // Primary: /api/submissions/summary
      try {
        const res = await fetch(`/api/submissions/summary${queryString}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          const json = await res.json();
          if (typeof json.data?.serverConfirmed === 'number') {
            confirmed = json.data.serverConfirmed;
          } else if (typeof json.data?.total === 'number') {
            confirmed = json.data.total;
          } else if (typeof json.pagination?.totalCount === 'number') {
            confirmed = json.pagination.totalCount;
          }
        }
      } catch (_) {}

      // Fallback: /api/submissions?limit=1 if summary failed
      if (confirmed === null && !controller.signal.aborted) {
        const fallbackRes = await fetch(`/api/submissions?limit=1${queryString ? '&' + queryString.slice(1) : ''}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (fallbackRes.ok) {
          const json = await fallbackRes.json();
          if (typeof json.pagination?.totalCount === 'number') {
            confirmed = json.pagination.totalCount;
          } else if (typeof json.data?.total === 'number') {
            confirmed = json.data.total;
          } else if (typeof json.total === 'number') {
            confirmed = json.total;
          }
        }
      }

      clearTimeout(timeoutId);

      if (confirmed !== null && isMountedRef.current) {
        setServerConfirmedCount(confirmed);
        setSource('server');
        setIsLoading(false);
        setIsError(false);
        setLastUpdated(new Date());

        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              count: confirmed,
              timestamp: new Date().toISOString(),
            })
          );
        } catch (_) {}
      } else if (isMountedRef.current) {
        setIsLoading(false);
        setIsError(true);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsError(true);
      }
    }
  }, [filters?.state, filters?.district]);

  useEffect(() => {
    if (filters?.enabled === false) {
      setIsLoading(false);
      return;
    }
    isMountedRef.current = true;
    loadCounts();

    const handleSync = () => loadCounts();
    const handleOnline = () => loadCounts();
    const handleOffline = () => {
      setIsOffline(true);
      setSource('local');
    };

    window.addEventListener('child_nutrition:sync_completed', handleSync);
    window.addEventListener('child_nutrition:draft_saved', handleSync);
    window.addEventListener('child_nutrition:submission_created', handleSync);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      window.removeEventListener('child_nutrition:sync_completed', handleSync);
      window.removeEventListener('child_nutrition:draft_saved', handleSync);
      window.removeEventListener('child_nutrition:submission_created', handleSync);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadCounts, filters?.enabled]);

  const effectiveSubmittedCount = isOffline
    ? (localSyncedCount > 0 ? localSyncedCount : serverConfirmedCount)
    : serverConfirmedCount;

  return {
    serverConfirmedCount,
    localDraftCount,
    localPendingSyncCount,
    localSyncedCount,
    submittedCount: effectiveSubmittedCount,
    totalCount: effectiveSubmittedCount + localPendingSyncCount,
    isLoading,
    isError,
    isOffline,
    source,
    lastUpdated,
    refresh: loadCounts,
  };
}
