'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { getAllDrafts, deleteDraft } from '@/lib/db/draftRepository';
import { getAllQueueItems } from '@/lib/db/syncQueueRepository';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';
import {
  Plus,
  ArrowRight,
  Trash2,
  Clock,
  FileText,
} from 'lucide-react';

export default function HomePage() {
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [serverSyncedCount, setServerSyncedCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
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
      console.error('Failed to load local records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteDraft = async (id?: number) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this saved draft?')) {
      await deleteDraft(id);
      await loadData();
    }
  };

  const waitingCount = queueItems.filter(
    (q) => q.status === 'queued' || q.status === 'syncing' || q.status === 'failed'
  ).length;

  const localSyncedCount = queueItems.filter((q) => q.status === 'synced').length;
  const submittedCount = serverSyncedCount !== null ? serverSyncedCount : localSyncedCount;

  return (
    <AppShell pendingSyncCount={waitingCount}>
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 sm:py-10 flex flex-col justify-between space-y-8">
        <div className="space-y-8">
          {/* Top Hero Container Card Matching Reference */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-8">
            {/* Top Row: Title + Outer Pill Wrapper with Action Button */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Child Nutrition &amp; Support Form
              </h1>

              <div className="self-start sm:self-auto p-1 bg-teal-50/80 rounded-2xl inline-flex">
                <Link href="/assessment/new" className="block">
                  <Button
                    variant="primary"
                    className="font-bold bg-[#0D9488] hover:bg-[#0F766E] text-white px-5 py-2.5 rounded-xl text-sm shadow-xs flex items-center space-x-2 transition-transform active:scale-[0.99]"
                  >
                    <Plus className="h-4 w-4 stroke-[2.5]" />
                    <span>Start New Assessment</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* Bottom Row: 3-Column Metrics Grid Matching Reference */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Box 1: Local In-Progress Drafts */}
              <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Local In-Progress Drafts
                </span>
                <span className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
                  {isLoading ? '...' : drafts.length}
                </span>
              </div>

              {/* Box 2: Waiting to be Sent */}
              <div className="bg-blue-50/30 border border-blue-100 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Waiting to be Sent
                </span>
                <span className={`text-2xl sm:text-3xl font-bold mt-2 ${waitingCount > 0 ? 'text-amber-600' : 'text-blue-600'}`}>
                  {isLoading ? '...' : waitingCount}
                </span>
              </div>

              {/* Box 3: Submitted Surveys / Assessments */}
              <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Submitted Assessments
                </span>
                <span className="text-2xl sm:text-3xl font-bold text-emerald-600 mt-2">
                  {isLoading ? '...' : submittedCount}
                </span>
              </div>
            </div>
          </div>

          {/* My In-Progress Drafts Section Matching Reference */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-800">
              My In-Progress Drafts ({isLoading ? '0' : drafts.length})
            </h2>

            {isLoading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
                Loading drafts...
              </div>
            ) : drafts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200/90 p-10 sm:p-14 text-center">
                <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2.5 stroke-[1.5]" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-700">
                  No active drafts on this device
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  When you start an assessment, your edits will autosave here so you can continue anytime.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {drafts.map((draft) => (
                  <div
                    key={draft.uuid}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:border-teal-300 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-md">
                          {draft.demographics?.artNumber || 'NEW DRAFT'}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-2 truncate">
                        {draft.demographics?.childName || 'Unnamed Assessment'}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        Caregiver: {draft.demographics?.caregiverName || 'Not recorded'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50"
                        title="Delete draft"
                        aria-label="Delete draft"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <Link href={`/assessment/draft/${draft.id || draft.uuid}`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="font-bold text-teal-800 hover:text-teal-900 border-slate-200 text-xs px-3.5 py-1.5"
                        >
                          <span>Resume Intake</span>
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Minimal Clean Footer Matching Reference */}
        <footer className="pt-8 pb-4 text-center">
          <p className="text-xs text-slate-400 font-normal">
            Child Nutrition &amp; Support Platform • ART Centre Linelist Standard
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
