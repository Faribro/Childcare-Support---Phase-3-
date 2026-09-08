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
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 lg:py-10 flex flex-col justify-between space-y-6 sm:space-y-8">
        <div className="space-y-6 sm:space-y-8">
          {/* Main Action Header Card matching the clean minimalist reference */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-100 gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Children Nutrition & Education Support
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Offline-first intake, acute malnutrition triage, and educational grant support platform.
                </p>
              </div>

              <Link href="/assessment/new" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto font-bold bg-teal-700 hover:bg-teal-800 text-white rounded-xl shadow-xs px-5 py-3"
                >
                  <Plus className="h-5 w-5 mr-1.5" />
                  <span>Start New Assessment</span>
                </Button>
              </Link>
            </div>

            {/* Three Status Counter Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mt-6">
              {/* Box 1: Local In-Progress Drafts */}
              <Link
                href="/assessment/sync?tab=drafts"
                className="bg-slate-50/70 hover:bg-slate-100/80 border border-slate-200 rounded-xl p-4 transition-colors group"
              >
                <div className="text-xs font-semibold text-slate-600">Local In-Progress Drafts</div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 group-hover:text-teal-700 transition-colors">
                  {isLoading ? '...' : drafts.length}
                </div>
              </Link>

              {/* Box 2: Waiting to be Sent */}
              <Link
                href="/assessment/sync?tab=outbox"
                className="bg-sky-50/40 hover:bg-sky-50/80 border border-sky-200/80 rounded-xl p-4 transition-colors group"
              >
                <div className="text-xs font-semibold text-sky-900">Waiting to be Sent</div>
                <div className="text-2xl sm:text-3xl font-bold text-sky-700 mt-1">
                  {isLoading ? '...' : waitingCount}
                </div>
              </Link>

              {/* Box 3: Submitted Assessments */}
              <Link
                href="/assessment/sync?tab=history"
                className="bg-emerald-50/40 hover:bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-4 transition-colors group"
              >
                <div className="text-xs font-semibold text-emerald-900">Submitted Assessments</div>
                <div className="text-2xl sm:text-3xl font-bold text-emerald-700 mt-1">
                  {isLoading ? '...' : submittedCount}
                </div>
              </Link>
            </div>
          </section>

          {/* In-Progress Drafts Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                My In-Progress Drafts ({isLoading ? '0' : drafts.length})
              </h2>
              {drafts.length > 0 && (
                <Link
                  href="/assessment/sync?tab=drafts"
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  View All in Sync Centre →
                </Link>
              )}
            </div>

            {isLoading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                Loading saved drafts...
              </div>
            ) : drafts.length === 0 ? (
              /* Clean Dashed Empty State Card matching the reference image */
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 sm:p-14 text-center">
                <div className="text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <FileText className="h-9 w-9 stroke-1 text-slate-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-800">No active drafts on this device</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  When you start an assessment, your edits will autosave here so you can continue anytime.
                </p>
              </div>
            ) : (
              /* List of active drafts */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {drafts.map((draft) => (
                  <div
                    key={draft.uuid}
                    className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                          {draft.demographics?.artNumber || 'ID PENDING'}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Step {draft.stepIndex || 1} of 6
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">
                        {draft.demographics?.childName || 'Unnamed Assessment'}
                      </h3>

                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <div>Caregiver: {draft.demographics?.caregiverName || 'Not recorded'}</div>
                        {draft.nutrition?.nutritionStatus && (
                          <div className="text-slate-700 font-medium">
                            Status: {draft.nutrition.nutritionStatus}
                          </div>
                        )}
                        <div className="flex items-center space-x-1 text-[11px] text-slate-400 mt-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            Last saved: {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-md hover:bg-rose-50"
                        title="Delete draft"
                        aria-label="Delete draft"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      {/* Resume button linking to canonical /assessment/[id] */}
                      <Link href={`/assessment/${draft.id || draft.uuid}`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="font-bold text-teal-800 hover:text-teal-900 border-slate-300"
                        >
                          <span>Resume Intake</span>
                          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
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
        <footer className="pt-8 pb-4 border-t border-slate-200/80 text-center">
          <p className="text-xs text-slate-400">
            India HIV/AIDS Alliance • Children Nutrition & Education Support Platform • Version 3.0.0
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
