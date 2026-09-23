'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { DraftCard } from '@/components/forms/DraftCard';
import { getAllDrafts, deleteDraft } from '@/lib/db/draftRepository';
import { getAllQueueItems } from '@/lib/db/syncQueueRepository';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';
import {
  FileText,
  Plus,
  ArrowLeft,
  Clock,
} from 'lucide-react';

export default function DedicatedDraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [draftsData, queueData] = await Promise.all([
        getAllDrafts(),
        getAllQueueItems(),
      ]);
      setDrafts(draftsData || []);
      setQueueItems(queueData || []);
    } catch (err) {
      console.error('[DraftsPage] Failed to load drafts:', err);
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

  const handleDeleteDraft = async (id: number): Promise<void> => {
    setDeleteError(null);
    // Optimistic remove — instant visual feedback
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    try {
      await deleteDraft(id);
    } catch (err: any) {
      // Restore list on failure
      console.error('[DraftsPage] deleteDraft failed:', err);
      setDeleteError('Failed to delete draft. Please try again.');
      await loadData();
    }
  };

  const handleResumeDraft = (id: string | number) => {
    router.push(`/assessment/draft/${encodeURIComponent(String(id))}`);
  };

  const waitingCount = queueItems.filter(
    (q) => q.status === 'queued' || q.status === 'syncing' || q.status === 'failed'
  ).length;
  const submittedCount = queueItems.filter((q) => q.status === 'synced').length;

  return (
    <AppShell pendingSyncCount={waitingCount} submittedCount={submittedCount}>
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-5 animate-in fade-in duration-200">
        {/* Navigation Bar / Return to Dashboard */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-2xs transition-colors touch-target"
            aria-label="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back to Dashboard</span>
          </Link>

          <Link
            href="/assessment/new"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs transition-colors touch-target"
          >
            <Plus className="w-4 h-4" />
            <span>Start New Survey</span>
          </Link>
        </div>

        {/* Header Summary Card */}
        <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Saved Assessment Drafts</h1>
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
                {isLoading ? '...' : drafts.length}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Drafts are stored securely in your browser&apos;s IndexedDB and remain accessible offline.
            </p>
          </div>
        </div>

        {/* Delete Error Banner */}
        {deleteError && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center justify-between gap-2">
            <span>{deleteError}</span>
            <button type="button" onClick={() => setDeleteError(null)} className="text-rose-500 hover:text-rose-700 shrink-0" aria-label="Dismiss error">✕</button>
          </div>
        )}

        {/* Drafts List Section */}
        <section className="space-y-4">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              Loading saved drafts from device storage...
            </div>
          ) : drafts.length === 0 ? (
            <div className="p-8 sm:p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 shadow-2xs space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No active drafts on this device</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                When you start an assessment, your progress automatically saves here so you can safely continue anytime even without internet connectivity.
              </p>
              <div className="pt-2">
                <Link
                  href="/assessment/new"
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start an Assessment</span>
                </Link>
              </div>
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
    </AppShell>
  );
}
