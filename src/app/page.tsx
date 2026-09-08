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
  CheckCircle2,
  RefreshCw,
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

  return (
    <AppShell pendingSyncCount={waitingCount}>
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-5 sm:py-7 flex flex-col justify-between space-y-6">
        <div className="space-y-6">
          {/* Minimalist Clean Header */}
          <div className="pb-1 border-b border-slate-100">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Forms & Assessments
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Select a form to start data collection or continue working on offline drafts.
            </p>
          </div>

          {/* Primary Available Form Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-teal-400/80 transition-all p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start space-x-3.5">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
                  <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Child Nutrition & Support Linelist
                    </h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                      Phase 3
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-lg leading-relaxed">
                    Single-page comprehensive intake: Demographics, Clinical & ART status, Education expenses, and KYC documents.
                  </p>
                  <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-2 font-medium">
                    <span>• 73 Columns</span>
                    <span>• Offline Capable</span>
                    <span>• Auto ID Generation</span>
                  </div>
                </div>
              </div>

              <Link href="/assessment/new" className="shrink-0">
                <Button
                  variant="primary"
                  className="w-full sm:w-auto font-bold bg-teal-700 hover:bg-teal-800 text-white rounded-xl shadow-2xs px-4 py-2 text-xs sm:text-sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  <span>Start New Intake</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* In-Progress Drafts Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-slate-800">
                  Saved Drafts
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {isLoading ? '...' : drafts.length}
                </span>
              </div>
              {drafts.length > 0 && (
                <Link
                  href="/assessment/sync?tab=drafts"
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  Manage in Sync Centre →
                </Link>
              )}
            </div>

            {isLoading ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5 text-center text-slate-400 text-xs">
                Loading saved drafts...
              </div>
            ) : drafts.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center">
                <p className="text-xs font-semibold text-slate-600">No saved drafts on this device</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click &ldquo;Start New Intake&rdquo; above to begin a new assessment.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {drafts.map((draft) => (
                  <div
                    key={draft.uuid}
                    className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-3.5 shadow-2xs hover:border-teal-300 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                          {draft.demographics?.artNumber || 'NEW DRAFT'}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 truncate">
                          {draft.demographics?.childName || 'Unnamed Assessment'}
                        </h3>
                      </div>

                      <div className="flex items-center space-x-3 text-xs text-slate-500 mt-1">
                        <span>Caregiver: {draft.demographics?.caregiverName || 'Not recorded'}</span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center space-x-1 text-[11px] text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span>
                            {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
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
                          className="font-bold text-teal-800 hover:text-teal-900 border-slate-200 text-xs px-3 py-1.5"
                        >
                          <span>Resume</span>
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Slim Sync Status Banner */}
          <Link
            href="/assessment/sync"
            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100 transition-colors text-xs text-slate-600 group"
          >
            <div className="flex items-center space-x-2">
              {waitingCount > 0 ? (
                <RefreshCw className="h-3.5 w-3.5 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
              )}
              <span>
                {waitingCount > 0 ? (
                  <strong className="text-amber-700">{waitingCount} assessment(s) waiting in outbox queue</strong>
                ) : (
                  <span>All assessments synchronized to Google Sheets</span>
                )}
              </span>
            </div>
            <span className="text-teal-700 font-bold group-hover:underline flex items-center space-x-0.5">
              <span>Sync Centre ({waitingCount})</span>
              <ArrowRight className="h-3 w-3 ml-0.5" />
            </span>
          </Link>
        </div>

        {/* Minimal Clean Footer */}
        <footer className="pt-4 pb-2 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            India HIV/AIDS Alliance • Paediatric Support Platform • Phase 3 Linelist Standard
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
