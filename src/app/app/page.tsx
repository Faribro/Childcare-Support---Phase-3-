'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { DraftCard } from '@/components/forms/DraftCard';
import { getAllDrafts, deleteDraft } from '@/lib/db/draftRepository';
import { getAllQueueItems } from '@/lib/db/syncQueueRepository';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';
import { Plus, BookOpen } from 'lucide-react';
import { AnimatedHeartUnlock } from '@/components/ui/AnimatedHeartUnlock';
import { MiniatureGardenPlayground } from '@/components/garden/MiniatureGardenPlayground';

export default function FieldWorkspacePage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [serverSyncedCount, setServerSyncedCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [draftsData, queueData] = await Promise.all([
        getAllDrafts(),
        getAllQueueItems(),
      ]);
      setDrafts(draftsData);
      setQueueItems(queueData);

      // Attempt to load total synced records from backend
      try {
        const res = await fetch('/api/submissions?limit=1');
        if (res.ok) {
          const json = await res.json();
          if (json.pagination?.totalCount !== undefined) {
            setServerSyncedCount(json.pagination.totalCount);
          } else if (json.total !== undefined) {
            setServerSyncedCount(json.total);
          }
        }
      } catch (_) {}
    } catch (err) {
      console.error('[FieldWorkspace] Failed to load local records:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const handleSyncComplete = () => {
      loadData();
    };
    window.addEventListener('child_nutrition:sync_completed', handleSyncComplete);
    return () => {
      window.removeEventListener('child_nutrition:sync_completed', handleSyncComplete);
    };
  }, [loadData]);

  const handleDeleteDraft = async (id: number) => {
    await deleteDraft(id);
    await loadData();
  };

  const handleResumeDraft = (id: string | number) => {
    router.push(`/assessment/draft/${id}`);
  };

  const waitingCount = queueItems.filter(
    (q) => q.status === 'queued' || q.status === 'syncing' || q.status === 'failed'
  ).length;

  const localSyncedCount = queueItems.filter((q) => q.status === 'synced').length;
  const submittedCount = serverSyncedCount !== null ? serverSyncedCount : localSyncedCount;

  return (
    <AppShell pendingSyncCount={waitingCount} submittedCount={submittedCount}>
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 pt-2 pb-8 sm:pt-2.5 sm:pb-10 flex flex-col justify-between space-y-6 animate-in fade-in duration-200">
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
                <Link href="/assessment/new" className="block">
                  <Button
                    variant="primary"
                    size="lg"
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
                <span className="text-xl font-bold text-[hsl(220,15%,15%)] tabular-nums">
                  {isLoading ? '...' : drafts.length}
                </span>
              </div>

              <Link
                href="/assessment/sync"
                className="p-3.5 rounded-lg bg-[hsl(210,80%,98%)] border border-[hsl(210,80%,85%)] cursor-pointer hover:bg-[hsl(210,80%,95%)] transition-colors"
              >
                <span className="text-[11px] font-semibold text-[hsl(210,80%,35%)] block">
                  Waiting to be Sent
                </span>
                <span className="text-xl font-bold text-[hsl(210,80%,30%)] tabular-nums">
                  {isLoading ? '...' : waitingCount}
                </span>
              </Link>

              <Link
                href="/assessment/sync"
                className="p-3.5 rounded-lg bg-[hsl(145,60%,97%)] border border-[hsl(145,50%,85%)] col-span-2 sm:col-span-1 cursor-pointer hover:bg-[hsl(145,60%,94%)] transition-colors"
              >
                <span className="text-[11px] font-semibold text-[hsl(145,65%,28%)] block">
                  Submitted Surveys
                </span>
                <span className="text-xl font-bold text-[hsl(145,65%,25%)] tabular-nums">
                  {isLoading ? '...' : submittedCount}
                </span>
              </Link>
            </div>
          </div>

          {/* In-Progress Drafts Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[hsl(220,15%,15%)]">
                My In-Progress Drafts ({isLoading ? 0 : drafts.length})
              </h3>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100/80 px-2.5 py-1 rounded-lg border border-teal-200 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Field Guide</span>
              </Link>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-xs text-[hsl(215,12%,50%)]">
                Loading local drafts...
              </div>
            ) : drafts.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-[hsl(215,18%,85%)] text-center space-y-2 bg-white/50">
                <svg className="w-8 h-8 text-[hsl(215,12%,60%)] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs font-semibold text-[hsl(220,15%,30%)]">No active drafts on this device</p>
                <p className="text-[11px] text-[hsl(215,12%,50%)]">
                  When you start a survey, your edits will autosave here so you can continue anytime.
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
