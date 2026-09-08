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
  FileSpreadsheet,
  Database,
  ShieldCheck,
  Zap,
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
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 sm:py-9 flex flex-col justify-between space-y-6">
        <div className="space-y-6">
          {/* Primary Intake Linelist Card (Hero Action) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-teal-300 transition-all p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start space-x-3.5">
                <div className="h-11 w-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                      Child Nutrition & Education Support
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                    Single-page intake linelist: demographics, clinical vitals, ART tracking, education expenses, and KYC documentation.
                  </p>
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200 uppercase tracking-wider">
                Phase 3
              </span>
            </div>

            {/* Feature Metadata Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/70 text-[11px] font-medium text-slate-600">
                <Database className="h-3 w-3 text-teal-600" />
                <span>73 Standard Columns</span>
              </span>
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/70 text-[11px] font-medium text-slate-600">
                <Zap className="h-3 w-3 text-amber-500" />
                <span>Offline Auto-Save</span>
              </span>
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/70 text-[11px] font-medium text-slate-600">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                <span>Auto ID Generator</span>
              </span>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <Link href="/assessment/new" className="block w-full">
                <Button
                  variant="primary"
                  className="w-full font-bold bg-teal-700 hover:bg-teal-800 text-white rounded-xl shadow-xs py-3 text-sm flex items-center justify-center space-x-2 transition-transform active:scale-[0.99]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Start New Assessment</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* Saved Drafts Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Saved Drafts
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                  {isLoading ? '...' : drafts.length}
                </span>
              </div>
              {drafts.length > 0 && (
                <Link
                  href="/assessment/sync?tab=drafts"
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  Manage All →
                </Link>
              )}
            </div>

            {isLoading ? (
              <div className="bg-white rounded-xl border border-slate-200/70 p-5 text-center text-slate-400 text-xs">
                Loading drafts...
              </div>
            ) : drafts.length === 0 ? (
              <div className="bg-white/60 rounded-xl border border-dashed border-slate-200 p-5 text-center">
                <p className="text-xs text-slate-500 font-medium">No saved drafts on this device</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Submissions in progress will appear here automatically.
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
                        <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded">
                          {draft.demographics?.artNumber || 'NEW DRAFT'}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {draft.demographics?.childName || 'Unnamed Assessment'}
                        </h4>
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
        </div>

        {/* Discreet Minimal Footer */}
        <footer className="pt-6 pb-2 text-center border-t border-slate-100">
          <p className="text-[11px] text-slate-400">
            India HIV/AIDS Alliance • Paediatric Support Platform • Phase 3
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
