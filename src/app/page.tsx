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
  FileText,
  ArrowRight,
  Trash2,
  Clock,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export default function HomePage() {
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
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

  const submittedCount = queueItems.filter((q) => q.status === 'synced').length;

  return (
    <AppShell pendingSyncCount={waitingCount}>
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-5 sm:py-7 flex flex-col justify-between space-y-6">
        <div className="space-y-6">
          {/* Streamlined Header & Primary Action */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
            <div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200/60 text-teal-800 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                <span>Phase 3 Intake</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Children Nutrition & Education Support
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Offline-first intake, acute malnutrition triage, and educational grant support platform.
              </p>
            </div>

            <Link href="/assessment/new" className="shrink-0">
              <Button
                variant="primary"
                className="w-full sm:w-auto font-bold bg-teal-700 hover:bg-teal-800 text-white rounded-xl shadow-2xs px-4 py-2.5 text-xs sm:text-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                <span>Start New Intake</span>
              </Button>
            </Link>
          </div>

          {/* Compact Integrated Metrics Strip */}
          <div className="grid grid-cols-3 divide-x divide-slate-200 bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <Link
              href="/assessment/sync?tab=drafts"
              className="p-3 sm:p-4 text-center hover:bg-slate-50/80 transition-colors group"
            >
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Saved Drafts</div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800 mt-0.5 group-hover:text-teal-700 transition-colors">
                {isLoading ? '...' : drafts.length}
              </div>
            </Link>

            <Link
              href="/assessment/sync?tab=outbox"
              className="p-3 sm:p-4 text-center hover:bg-slate-50/80 transition-colors group"
            >
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Queue Outbox</div>
              <div className={`text-xl sm:text-2xl font-bold mt-0.5 ${waitingCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                {isLoading ? '...' : waitingCount}
              </div>
            </Link>

            <Link
              href="/assessment/sync?tab=history"
              className="p-3 sm:p-4 text-center hover:bg-slate-50/80 transition-colors group"
            >
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Cloud Synced</div>
              <div className="text-xl sm:text-2xl font-bold text-teal-700 mt-0.5">
                {isLoading ? '...' : submittedCount}
              </div>
            </Link>
          </div>

          {/* Active Drafts Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">
                Active Offline Drafts ({isLoading ? '0' : drafts.length})
              </h2>
              {drafts.length > 0 && (
                <Link
                  href="/assessment/sync?tab=drafts"
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  Manage All in Sync Centre →
                </Link>
              )}
            </div>

            {isLoading ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-xs">
                Loading saved drafts...
              </div>
            ) : drafts.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <FileText className="h-7 w-7 stroke-1 text-slate-400 mx-auto mb-2" />
                <h3 className="text-xs font-bold text-slate-700">No active drafts on this device</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  When you begin an assessment, your progress autosaves locally here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {drafts.map((draft) => (
                  <div
                    key={draft.uuid}
                    className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:border-teal-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded">
                          {draft.demographics?.artNumber || 'PENDING ID'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Single-Page Intake
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">
                        {draft.demographics?.childName || 'Unnamed Assessment'}
                      </h3>

                      <div className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                        <div>Caregiver: {draft.demographics?.caregiverName || 'Not recorded'}</div>
                        <div className="flex items-center space-x-1 text-[11px] text-slate-400 pt-0.5">
                          <Clock className="h-3 w-3" />
                          <span>
                            Edited: {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded hover:bg-rose-50"
                        title="Delete draft"
                        aria-label="Delete draft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      <Link href={`/assessment/draft/${draft.id || draft.uuid}`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="font-bold text-teal-800 hover:text-teal-900 border-slate-200 text-xs px-3 py-1"
                        >
                          <span>Resume Intake</span>
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Minimal Clean Footer */}
        <footer className="pt-6 pb-2 border-t border-slate-200 text-center">
          <p className="text-[11px] text-slate-400">
            India HIV/AIDS Alliance • Children Nutrition & Education Support Platform • v3.0
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
