'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { DraftCard } from '@/components/forms/DraftCard';
import { getDraftsCount, getAllDrafts, deleteDraft } from '@/lib/db/draftRepository';
import { getWaitingQueueCount, getLocalSyncedCount } from '@/lib/db/syncQueueRepository';
import type { AssessmentRecord } from '@/types/domain';
import { Plus, Loader2 } from 'lucide-react';
import { AnimatedHeartUnlock } from '@/components/ui/AnimatedHeartUnlock';
import { MiniatureGardenPlayground } from '@/components/garden/MiniatureGardenPlayground';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';
import { DesktopComicWorkspace } from '@/components/dashboard/DesktopComicWorkspace';
import { NeedsAttentionPanel } from '@/components/dashboard/NeedsAttentionPanel';
import { submissionEvents } from '@/features/submission/submissionEvents';
import { useEvaluationAccess, setEvaluationUnlocked } from '@/lib/auth/evaluationAccess';
import { WelcomeKiteOnboardingModal } from '@/components/auth/WelcomeKiteOnboardingModal';
import { cosmicSound } from '@/lib/audio/cosmicSoundEngine';

export default function FieldWorkspacePage() {
  const router = useRouter();
  const { user, isLoaded } = useEvaluationAccess();
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingInitialMode, setOnboardingInitialMode] = useState<'signin' | 'register'>('signin');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkAuth = useCallback(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem('field_user_profile');
      if (stored) {
        const p = JSON.parse(stored);
        if (
          p &&
          (p.id ||
            p.googleEmail ||
            p.email ||
            (p.name && p.name !== 'Field Caseworker' && p.assignedState))
        ) {
          return true;
        }
      }
    } catch (_) {}
    return Boolean(user?.isVerified && user?.name);
  }, [user]);

  useEffect(() => {
    setIsAuthenticated(checkAuth());
  }, [checkAuth]);

  // Strict role-aware workspace routing: Evaluation users (Leadership, State Reviewer, Admin)
  // belong in the Evaluation workspace (/supervisor) and must never be shown the field-worker forms dashboard.
  useEffect(() => {
    if (isLoaded && user && user.isVerified) {
      const isEvalRole = user.role === 'LEADERSHIP' || user.role === 'STATE_REVIEWER' || user.role === 'ADMIN';
      if (isEvalRole) {
        router.replace('/supervisor');
      }
    }
  }, [isLoaded, user, router]);

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

  // Stage-based readiness counts
  const [submittedMissingDocsCount, setSubmittedMissingDocsCount] = useState<number>(0);
  const [approvedBankPendingCount, setApprovedBankPendingCount] = useState<number>(0);
  const [serverScopeLabel, setServerScopeLabel] = useState<string>('Authorized scope');

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

    // Gate on session readiness: do not query protected endpoint if signed out or session not yet loaded
    if (!isLoaded || !user?.isVerified) {
      try {
        const localCount = await getLocalSyncedCount();
        if (isMountedRef.current) {
          setSubmittedCount(localCount);
          setSubmittedStatus('success');
          setIsSubmittedLoading(false);
          setServerScopeLabel('Sign in for server sync');
        }
      } catch (_) {
        if (isMountedRef.current) {
          setSubmittedCount(0);
          setSubmittedStatus('success');
          setIsSubmittedLoading(false);
        }
      }
      return;
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
      let res = await fetch('/api/submissions/summary', {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store',
        },
      });
      if (res.status === 401 || res.status === 403) {
        clearTimeout(timeoutId);
        setEvaluationUnlocked(false, null);
        const localCount = await getLocalSyncedCount();
        if (isMountedRef.current) {
          setSubmittedCount(localCount);
          setSubmittedStatus('success');
          setIsSubmittedLoading(false);
          setServerScopeLabel('Sign in for server sync');
        }
        return;
      }
      if (!res.ok) {
        res = await fetch('/api/submissions?limit=1', {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache, no-store',
          },
        });
      }
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        let count: number | null = null;
        if (typeof json.data?.serverConfirmed === 'number') {
          count = json.data.serverConfirmed;
        } else if (typeof json.pagination?.totalCount === 'number') {
          count = json.pagination.totalCount;
        } else if (typeof json.data?.total === 'number') {
          count = json.data.total;
        } else if (typeof json.total === 'number') {
          count = json.total;
        } else if (typeof json.count === 'number') {
          count = json.count;
        }

        if (isMountedRef.current) {
          if (typeof json.data?.intakeIncomplete === 'number') {
            setSubmittedMissingDocsCount(json.data.intakeIncomplete);
          }
          if (typeof json.data?.bankPending === 'number') {
            setApprovedBankPendingCount(json.data.bankPending);
          }
          if (json.data?.scope?.allowedStates) {
            const states = json.data.scope.allowedStates;
            setServerScopeLabel(
              states.includes('*')
                ? 'National'
                : states.length > 0
                ? states.join(', ')
                : 'Authorized scope'
            );
          }
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
  }, [user?.isVerified, isLoaded]);

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

  // Reactive sync when user session unlocks
  useEffect(() => {
    if (isLoaded && user?.isVerified) {
      refreshSubmitted();
    }
  }, [isLoaded, user?.isVerified, refreshSubmitted]);

  // Check for onboarding query flag on mount & custom events
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('onboarding') === 'open' || params.get('onboarding') === '1') {
        if (params.get('mode') === 'signin') {
          setOnboardingInitialMode('signin');
        } else {
          setOnboardingInitialMode('register');
        }
        setIsOnboardingOpen(true);
      }
    }

    const handleOpenWelcomeKite = (e: any) => {
      if (e?.detail?.mode === 'signin') {
        setOnboardingInitialMode('signin');
      } else if (e?.detail?.mode === 'register') {
        setOnboardingInitialMode('register');
      }
      setIsOnboardingOpen(true);
    };

    window.addEventListener('child_nutrition:open_welcome_kite', handleOpenWelcomeKite);
    return () => window.removeEventListener('child_nutrition:open_welcome_kite', handleOpenWelcomeKite);
  }, []);

  const handleRequireAuth = useCallback(() => {
    setOnboardingInitialMode('signin');
    setIsOnboardingOpen(true);
  }, []);

  const handleStartNewSurvey = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // 1. When offline, bypass auth gating and immediately navigate to cached shell
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
        window.location.assign('/assessment/new');
        return false;
      }

      // 2. Returning user with valid verified session or existing stored profile proceeds directly
      if (checkAuth()) {
        return true;
      }

      // 3. First-time unverified user: open Welcome Kite onboarding to sign in or register
      handleRequireAuth();
      return false;
    },
    [checkAuth, handleRequireAuth]
  );

  useEffect(() => {
    isMountedRef.current = true;

    // Independent concurrent initialization
    refreshDrafts();
    refreshWaiting();
    if (isLoaded && user?.isVerified) {
      refreshSubmitted();
    } else {
      getLocalSyncedCount().then((localCount) => {
        if (isMountedRef.current) {
          setSubmittedCount(localCount);
          setSubmittedStatus('success');
          setIsSubmittedLoading(false);
          setServerScopeLabel('Sign in for server sync');
        }
      });
    }

    const handleDraftUpdated = () => {
      refreshDrafts();
    };
    const handleSyncComplete = () => {
      refreshWaiting();
      if (user?.isVerified) refreshSubmitted();
    };
    const handleRecordSynced = () => {
      refreshWaiting();
      if (user?.isVerified) refreshSubmitted();
    };
    const handleOnline = () => {
      refreshWaiting();
      if (user?.isVerified) refreshSubmitted();
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
      if (user?.isVerified) refreshSubmitted();
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
    if (!checkAuth()) {
      handleRequireAuth();
      return;
    }
    router.push(`/assessment/draft/${id}`);
  };

  if (isLoaded && user && user.isVerified) {
    const isEvalRole = user.role === 'LEADERSHIP' || user.role === 'STATE_REVIEWER' || user.role === 'ADMIN';
    if (isEvalRole) {
      return (
        <AppShell>
          <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-20 text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
            <h2 className="text-sm font-semibold text-slate-800">Opening Evaluation Workspace…</h2>
          </div>
        </AppShell>
      );
    }
  }

  return (
    <AppShell
      pendingSyncCount={isAuthenticated ? (waitingCount ?? 0) : 0}
      submittedCount={isAuthenticated ? (submittedCount ?? 0) : 0}
    >
      {/* Mobile KoboCollect-Style Home View (<768px) */}
      <MobileKoboHomeScreen
        drafts={drafts}
        draftsCount={isAuthenticated ? (draftCount ?? drafts.length) : 0}
        waitingCount={isAuthenticated ? (waitingCount ?? 0) : 0}
        submittedCount={isAuthenticated ? submittedCount : 0}
        submittedMissingDocsCount={isAuthenticated ? submittedMissingDocsCount : 0}
        approvedBankPendingCount={isAuthenticated ? approvedBankPendingCount : 0}
        serverScopeLabel={serverScopeLabel}
        isLoading={isDraftsLoading && isWaitingLoading && isSubmittedLoading}
        isDraftsLoading={isDraftsLoading}
        isWaitingLoading={isWaitingLoading}
        isSubmittedLoading={isSubmittedLoading}
        submittedStatus={submittedStatus}
        onRetrySubmitted={handleRetrySubmitted}
        onDeleteDraft={handleDeleteDraft}
        onResumeDraft={handleResumeDraft}
        onStartSurvey={handleStartNewSurvey}
        isAuthenticated={isAuthenticated}
        onRequireAuth={handleRequireAuth}
        onFormReady={() => router.push('/assessment/new')}
      />

      {/* Desktop Workspace View (>=768px) */}
      <DesktopComicWorkspace
        drafts={drafts}
        draftCount={draftCount}
        isDraftsLoading={isDraftsLoading}
        isDraftListLoading={isDraftListLoading}
        waitingCount={waitingCount}
        isWaitingLoading={isWaitingLoading}
        submittedCount={submittedCount}
        isSubmittedLoading={isSubmittedLoading}
        submittedStatus={submittedStatus}
        submittedMissingDocsCount={submittedMissingDocsCount}
        approvedBankPendingCount={approvedBankPendingCount}
        serverScopeLabel={serverScopeLabel}
        isAuthenticated={isAuthenticated}
        onStartNewSurvey={handleStartNewSurvey}
        onResumeDraft={handleResumeDraft}
        onDeleteDraft={handleDeleteDraft}
        onRetrySubmitted={handleRetrySubmitted}
        onRequireAuth={handleRequireAuth}
        onFormReady={() => router.push('/assessment/new')}
      />
{/* Welcome Kite First-Time Field User Onboarding Modal */}
      <WelcomeKiteOnboardingModal
        isOpen={isOnboardingOpen}
        initialMode={onboardingInitialMode}
        onClose={() => setIsOnboardingOpen(false)}
        onSuccess={() => {
          setIsOnboardingOpen(false);
          router.push('/assessment/new');
        }}
      />
    </AppShell>
  );
}
