'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { DraftCard } from '@/components/forms/DraftCard';
import { getDraftsCount, getAllDrafts, deleteDraft } from '@/lib/db/draftRepository';
import { getWaitingQueueCount, getLocalSyncedCount } from '@/lib/db/syncQueueRepository';
import type { AssessmentRecord } from '@/types/domain';
import { Plus } from 'lucide-react';
import { AnimatedHeartUnlock } from '@/components/ui/AnimatedHeartUnlock';
import { MiniatureGardenPlayground } from '@/components/garden/MiniatureGardenPlayground';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';
import { submissionEvents } from '@/features/submission/submissionEvents';

export default function FieldWorkspacePage() {
  const router = useRouter();

  // Decoupled state for Drafts
  const [draftCount, setDraftCount] = useState<number | null>(null);
  const [isDraftsLoading, setIsDraftsLoading] = useState(true);
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);
  const [isDraftListLoading, setIsDraftListLoading] = useState(true);

  // Decoupled state for Outbox/Waiting
  const [waitingCount, setWaitingCount] = useState<number | null>(null);
  const [isWaitingLoading, setIsWaitingLoading] = useState(true);

  // Decoupled state for Submitted Surveys
  const [submittedCount, setSubmittedCount] = useState<number | null>(null);
  const [isSubmittedLoading, setIsSubmittedLoading] = useState(true);
  const [submittedStatus, setSubmittedStatus] = useState<
    'loading' | 'success' | 'offline' | 'error'
  >('loading');

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. Fast count query (5-10ms)
  const refreshDraftCount = useCallback(async () => {
    try {
      const count = await getDraftsCount();
      if (isMountedRef.current) {
        setDraftCount(count);
        setIsDraftsLoading(false);
      }
    } catch (err) {
      console.error('[FieldWorkspace] Failed to count drafts:', err);
      if (isMountedRef.current) {
        setIsDraftsLoading(false);
      }
    }
  }, []);

  // 2. Full draft records for desktop list
  const refreshDraftList = useCallback(async () => {
    try {
      const list = await getAllDrafts();
      if (isMountedRef.current) {
        setDrafts(list);
        setDraftCount((prev) => (prev !== null ? prev : list.length));
        setIsDraftListLoading(false);
        setIsDraftsLoading(false);
      }
    } catch (err) {
      console.error('[FieldWorkspace] Failed to load draft list:', err);
      if (isMountedRef.current) {
        setIsDraftListLoading(false);
        setIsDraftsLoading(false);
      }
    }
  }, []);

  const refreshDrafts = useCallback(async () => {
    await Promise.allSettled([refreshDraftCount(), refreshDraftList()]);
  }, [refreshDraftCount, refreshDraftList]);

  // 3. Fast outbox status count
  const refreshWaiting = useCallback(async () => {
    try {
      const count = await getWaitingQueueCount();
      if (isMountedRef.current) {
        setWaitingCount(count);
        setIsWaitingLoading(false);
      }
    } catch (err) {
      console.error('[FieldWorkspace] Failed to load waiting queue count:', err);
      if (isMountedRef.current) {
        setIsWaitingLoading(false);
      }
    }
  }, []);

  // 4. Remote submitted count with 12s AbortController, offline fallback, and
  //    stale-while-revalidate: the local IndexedDB synced-count is shown
  //    immediately (~5 ms) while the authoritative remote fetch runs in the
  //    background.  This eliminates the multi-second blank/skeleton delay
  //    reported in issue #41.
  const refreshSubmitted = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (isMountedRef.current) {
      setIsSubmittedLoading(true);
      setSubmittedStatus('loading');
    }

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      try {
        const localCount = await getLocalSyncedCount();
        if (isMountedRef.current) {
          setSubmittedCount(localCount);
          setSubmittedStatus('offline');
          setIsSubmittedLoading(false);
        }
      } catch (err) {
        console.error('[FieldWorkspace] Failed to read local synced count:', err);
        if (isMountedRef.current) {
          setSubmittedCount((prev) => prev ?? 0);
          setSubmittedStatus('offline');
          setIsSubmittedLoading(false);
        }
      }
      return;
    }

    // ── Stale-while-revalidate: paint a local count immediately ──────────────
    // getLocalSyncedCount() is an IndexedDB point-read, typically resolves in
    // < 10 ms.  Showing it removes the perceptible loading gap while the
    // network round-trip (GAS backend, 1–12 s) completes in the background.
    try {
      const staleCount = await getLocalSyncedCount();
      if (isMountedRef.current && staleCount > 0) {
        setSubmittedCount(staleCount);
        // Keep submittedStatus as 'loading' so the UI can still show a subtle
        // "refreshing" indicator if desired; isSubmittedLoading stays true.
      }
    } catch (_) {
      // Non-fatal — remote fetch continues regardless.
    }
    // ── End stale-while-revalidate ───────────────────────────────────────────

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch('/api/submissions?limit=1', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        let count: number | null = null;
        if (typeof json.pagination?.totalCount === 'number') {
          count = json.pagination.totalCount;
        } else if (typeof json.data?.total === 'number') {
          count = json.data.total;
        } else if (typeof json.total === 'number') {
          count = json.total;
        } else if (typeof json.count === 'number') {
          count = json.count;
        }

        if (count !== null && isMountedRef.current) {
          setSubmittedCount(count);
          setSubmittedStatus('success');
          setIsSubmittedLoading(false);
          return;
        }
      }
      throw new Error(`Server returned HTTP ${res.status}`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (!isMountedRef.current) return;

      const isNetworkOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      try {
        const localCount = await getLocalSyncedCount();
        if (isMountedRef.current) {
          setSubmittedCount((prev) => (prev !== null ? prev : localCount));
          setSubmittedStatus(isNetworkOffline ? 'offline' : 'error');
          setIsSubmittedLoading(false);
        }
      } catch (_) {
        if (isMountedRef.current) {
          setSubmittedStatus(isNetworkOffline ? 'offline' : 'error');
          setIsSubmittedLoading(false);
        }
      }
    }
  }, []);

  const handleRetrySubmitted = useCallback(() => {
    setIsSubmittedLoading(true);
    setSubmittedStatus('loading');
    refreshSubmitted();
  }, [refreshSubmitted]);

  // Prefetch key operational routes once on mount for instant offline navigation
  useEffect(() => {
    try {
      router.prefetch('/assessment/new');
      router.prefetch('/assessment/drafts');
      router.prefetch('/assessment/sync');
    } catch (_) {
      // Safe fallback if router prefetch fails
    }
  }, [router]);

  useEffect(() => {
    isMountedRef.current = true;

    // Independent concurrent initialization
    refreshDrafts();
    refreshWaiting();
    refreshSubmitted();

    const handleDraftUpdated = () => {
      refreshDrafts();
    };
    const handleSyncComplete = () => {
      refreshWaiting();
      refreshSubmitted();
    };
    const handleRecordSynced = () => {
      refreshWaiting();
      refreshSubmitted();
    };
    const handleOnline = () => {
      refreshWaiting();
      refreshSubmitted();
    };
    const handleOffline = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      getLocalSyncedCount()
        .then((localCount) => {
          if (isMountedRef.current) {
            setSubmittedCount((prev) => (prev !== null ? prev : localCount));
            setSubmittedStatus('offline');
            setIsSubmittedLoading(false);
          }
        })
        .catch(() => {
          if (isMountedRef.current) {
            setSubmittedStatus('offline');
            setIsSubmittedLoading(false);
          }
        });
    };

    window.addEventListener('child_nutrition:draft_updated', handleDraftUpdated);
    window.addEventListener('child_nutrition:sync_completed', handleSyncComplete);
    window.addEventListener('child_nutrition:record_synced', handleRecordSynced);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Canonical worker submission events
    const unsubSaved = submissionEvents.on('submission:saved', () => {
      refreshDrafts();
      refreshWaiting();
    });
    const unsubSuccess = submissionEvents.on('submission:success', () => {
      refreshWaiting();
      refreshSubmitted();
    });
    const unsubRetrying = submissionEvents.on('submission:retrying', () => {
      refreshWaiting();
    });
    const unsubFailed = submissionEvents.on('submission:failed', () => {
      refreshWaiting();
    });

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      window.removeEventListener('child_nutrition:draft_updated', handleDraftUpdated);
      window.removeEventListener('child_nutrition:sync_completed', handleSyncComplete);
      window.removeEventListener('child_nutrition:record_synced', handleRecordSynced);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubSaved();
      unsubSuccess();
      unsubRetrying();
      unsubFailed();
    };
  }, [refreshDrafts, refreshWaiting, refreshSubmitted]);

  const handleDeleteDraft = async (id: number): Promise<void> => {
    // Optimistic remove — instant visual feedback
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setDraftCount((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    try {
      await deleteDraft(id);
    } catch (err: any) {
      console.error('[FieldWorkspace] deleteDraft failed:', err);
      // Restore list on failure
      await refreshDrafts();
    }
  };

  const handleResumeDraft = (id: string | number) => {
    router.push(`/assessment/draft/${id}`);
  };

  return (
    <AppShell
      pendingSyncCount={waitingCount ?? 0}
      submittedCount={submittedCount !== null ? submittedCount : undefined}
    >
      {/* Mobile KoboCollect-Style Home View (<768px) */}
      <MobileKoboHomeScreen
        drafts={drafts}
        draftsCount={draftCount ?? drafts.length}
        waitingCount={waitingCount ?? 0}
        submittedCount={submittedCount}
        isLoading={isDraftsLoading && isWaitingLoading && isSubmittedLoading}
        isDraftsLoading={isDraftsLoading}
        isWaitingLoading={isWaitingLoading}
        isSubmittedLoading={isSubmittedLoading}
        submittedStatus={submittedStatus}
        onRetrySubmitted={handleRetrySubmitted}
        onDeleteDraft={handleDeleteDraft}
        onResumeDraft={handleResumeDraft}
      />

      {/* Desktop Workspace View (>=768px) */}
      <div className="hidden md:flex flex-1 w-full max-w-4xl mx-auto px-4 pt-2 pb-8 sm:pt-2.5 sm:pb-10 flex-col justify-between space-y-6 animate-in fade-in duration-200">
        <div className="space-y-3 sm:space-y-3.5">
          {/* Miniature Children Garden Playground (Physics-based live interactive garden) */}
          <MiniatureGardenPlayground />

          {/* Featured Primary Form Card Matching Reference FormLibrary */}
          <div className="p-6 md:p-8 bg-white border border-[hsl(215,18%,82%)] rounded-2xl shadow-xs space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[hsl(215,18%,90%)] pb-6">
              <div className="flex items-center space-x-3.5 flex-wrap gap-y-2">
                <h2 className="text-lg md:text-xl font-bold text-[hsl(220,15%,15%)] leading-snug">
                  Child Nutrition &amp; Support Form
                </h2>
                <AnimatedHeartUnlock />
              </div>

              <div className="waves-wrapper self-center md:self-start my-2 md:my-0">
                <div className="waves-block">
                  <div className="waves wave-1"></div>
                  <div className="waves wave-2"></div>
                  <div className="waves wave-3"></div>
                </div>
                <Link
                  href="/assessment/new"
                  prefetch={true}
                  className="block"
                  onClick={(e) => {
                    if (typeof navigator !== 'undefined' && !navigator.onLine) {
                      e.preventDefault();
                      window.location.assign('/assessment/new');
                    }
                  }}
                >
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={(e) => {
                      if (typeof navigator !== 'undefined' && !navigator.onLine) {
                        e.preventDefault();
                        window.location.assign('/assessment/new');
                      }
                    }}
                    className="relative z-10 font-bold px-8 py-3.5 bg-gradient-to-r from-[hsl(168,76%,36%)] to-[hsl(175,84%,32%)] hover:from-[hsl(168,76%,32%)] hover:to-[hsl(175,84%,28%)] text-white shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 rounded-xl border border-[hsl(168,76%,30%)] flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-5 h-5 stroke-[2.5]" />
                    <span>Start New Survey</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* Operational Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 rounded-lg bg-[hsl(215,20%,97%)] border border-[hsl(215,18%,88%)]">
                <span className="text-[11px] font-semibold text-[hsl(215,12%,45%)] block">
                  Local In-Progress Drafts
                </span>
                <span className="text-xl font-bold text-[hsl(220,15%,15%)] tabular-nums flex items-center min-h-[28px]">
                  {isDraftsLoading ? (
                    <span
                      className="inline-block w-8 h-5 bg-slate-200 animate-pulse rounded"
                      role="status"
                      aria-label="Loading draft count"
                    />
                  ) : (
                    (draftCount ?? drafts.length)
                  )}
                </span>
              </div>

              <Link
                href="/assessment/sync"
                className="p-3.5 rounded-lg bg-[hsl(210,80%,98%)] border border-[hsl(210,80%,85%)] cursor-pointer hover:bg-[hsl(210,80%,95%)] transition-colors block"
              >
                <span className="text-[11px] font-semibold text-[hsl(210,80%,35%)] block">
                  Waiting to be Sent
                </span>
                <span className="text-xl font-bold text-[hsl(210,80%,30%)] tabular-nums flex items-center min-h-[28px]">
                  {isWaitingLoading ? (
                    <span
                      className="inline-block w-8 h-5 bg-blue-200 animate-pulse rounded"
                      role="status"
                      aria-label="Loading waiting count"
                    />
                  ) : (
                    (waitingCount ?? 0)
                  )}
                </span>
              </Link>

              <div className="p-3.5 rounded-lg bg-[hsl(145,60%,97%)] border border-[hsl(145,50%,85%)] col-span-2 sm:col-span-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <Link
                    href="/assessment/sync?tab=synced"
                    className="text-[11px] font-semibold text-[hsl(145,65%,28%)] hover:underline"
                  >
                    Submitted Surveys
                  </Link>
                  {submittedStatus === 'offline' && (
                    <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      Offline
                    </span>
                  )}
                  {submittedStatus === 'error' && (
                    <button
                      type="button"
                      onClick={handleRetrySubmitted}
                      className="text-[11px] font-medium text-amber-700 hover:text-amber-900 underline cursor-pointer"
                      aria-label="Retry loading submitted count"
                    >
                      Retry
                    </button>
                  )}
                </div>
                <Link
                  href="/assessment/sync?tab=synced"
                  className="text-xl font-bold text-[hsl(145,65%,25%)] tabular-nums flex items-center min-h-[28px] mt-0.5 hover:opacity-80 transition-opacity"
                >
                  {isSubmittedLoading ? (
                    <span
                      className="inline-block w-8 h-5 bg-emerald-200 animate-pulse rounded"
                      role="status"
                      aria-label="Loading submitted count"
                    />
                  ) : (
                    (submittedCount ?? 0)
                  )}
                </Link>
              </div>
            </div>
          </div>

          {/* In-Progress Drafts Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[hsl(220,15%,15%)] flex items-center gap-1.5">
                <span>My In-Progress Drafts</span>
                <span className="text-sm font-semibold text-slate-500">
                  (
                  {isDraftsLoading ? (
                    <span
                      className="inline-block w-3.5 h-3 bg-slate-200 animate-pulse rounded align-middle"
                      role="status"
                      aria-label="Loading draft count"
                    />
                  ) : (
                    (draftCount ?? drafts.length)
                  )}
                  )
                </span>
              </h3>
            </div>

            {isDraftListLoading ? (
              <div className="p-8 text-center text-xs text-[hsl(215,12%,50%)]">
                Loading local drafts...
              </div>
            ) : drafts.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-[hsl(215,18%,85%)] text-center space-y-2 bg-white/50">
                <svg
                  className="w-8 h-8 text-[hsl(215,12%,60%)] mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-xs font-semibold text-[hsl(220,15%,30%)]">
                  No active drafts on this device
                </p>
                <p className="text-[11px] text-[hsl(215,12%,50%)]">
                  When you start a survey, your edits will autosave here so you can continue
                  anytime.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {drafts.map((d) => (
                  <DraftCard
                    key={d.id || d.uuid}
                    draft={d}
                    onResume={handleResumeDraft}
                    onDelete={handleDeleteDraft}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Minimal Clean Footer Matching Reference */}
        <footer className="pt-8 pb-4 text-center">
          <p className="text-xs text-slate-400 font-normal">
            Child Nutrition &amp; Support Platform • India HIV/AIDS Alliance
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
