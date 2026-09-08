'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  getAllQueueItems,
  markSynced,
  markFailed,
  markConflict,
  acquireSyncLock,
  releaseSyncLock,
  isSyncLocked,
} from '@/lib/db/syncQueueRepository';
import { getAllDrafts, deleteDraft } from '@/lib/db/draftRepository';
import type { SyncQueueItem, AssessmentRecord } from '@/types/domain';
import {
  RefreshCw,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  PlusCircle,
  FileText,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';

function SyncCenterContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'outbox' | 'drafts' | 'history') || 'outbox';
  const justSubmitted = searchParams.get('submitted') === 'true';
  const submittedRef = searchParams.get('ref');

  const [activeTab, setActiveTab] = useState<'outbox' | 'drafts' | 'history'>(initialTab);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [q, d] = await Promise.all([getAllQueueItems(), getAllDrafts()]);
      setQueueItems(q);
      setDrafts(d);
    } catch (err) {
      console.error('Failed to load sync data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSyncAll = async () => {
    if (!acquireSyncLock()) {
      alert('A synchronization run is already active in background.');
      return;
    }
    setIsSyncing(true);

    try {
      const pending = queueItems.filter(
        (i) => i.status === 'queued' || i.status === 'failed'
      );

      for (const item of pending) {
        try {
          const res = await fetch('/api/submissions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': item.idempotencyKey || `idem-${item.submissionUuid}`,
            },
            body: JSON.stringify(item.payload),
          });

          if (res.ok) {
            const data = await res.json();
            if (item.id) {
              await markSynced(
                item.id,
                item.submissionUuid,
                data.remoteSubmissionId,
                data.version
              );
            }
          } else if (res.status === 409) {
            const conflictBody = await res.json();
            if (item.id) {
              await markConflict(item.id, conflictBody);
            }
          } else {
            const errBody = await res.json().catch(() => ({}));
            if (item.id) {
              await markFailed(
                item.id,
                errBody.message || `Server returned HTTP ${res.status}`,
                res.status
              );
            }
          }
        } catch (netErr) {
          if (item.id) {
            await markFailed(item.id, 'Network connection unreachable', 503);
          }
        }
      }
      await loadAll();
    } finally {
      releaseSyncLock();
      setIsSyncing(false);
    }
  };

  const handleDeleteDraft = async (id?: number) => {
    if (!id) return;
    if (confirm('Are you sure you want to permanently remove this local draft?')) {
      await deleteDraft(id);
      await loadAll();
    }
  };

  const pendingCount = queueItems.filter(
    (i) => i.status === 'queued' || i.status === 'syncing' || i.status === 'failed'
  ).length;

  const syncedItems = queueItems.filter((i) => i.status === 'synced');

  return (
    <AppShell pendingSyncCount={pendingCount}>
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 lg:py-10 space-y-6">
        {/* Just Submitted Toast */}
        {justSubmitted && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 flex items-start space-x-3.5 shadow-xs">
            <div className="bg-emerald-600 text-white p-2 rounded-xl shrink-0">
              <Check className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm sm:text-base font-bold text-emerald-950">
                Assessment Enqueued for Synchronization!
              </h2>
              <p className="text-xs sm:text-sm text-emerald-800 mt-0.5">
                Reference ID: <strong className="font-mono">{submittedRef || 'Recorded'}</strong> has been saved to device storage and queued for Google Sheets sync.
              </p>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Data & Sync Operations Centre
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Manage pending outbox transmissions, local drafts, and verified sync receipts.
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            <Button
              variant="primary"
              onClick={handleSyncAll}
              isLoading={isSyncing}
              disabled={pendingCount === 0 || isSyncing}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-xs"
            >
              <CloudUpload className="h-4 w-4 mr-2" />
              <span>Sync All ({pendingCount})</span>
            </Button>

            <Link href="/assessment/new">
              <Button variant="secondary" className="shadow-2xs font-semibold">
                <PlusCircle className="h-4 w-4 mr-1.5" />
                <span>New Intake</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('outbox')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'outbox'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>Outbox Queue</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                pendingCount > 0 ? 'bg-amber-500 text-white font-bold' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pendingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('drafts')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'drafts'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>Saved Drafts</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
              {drafts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'history'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>Sync History</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
              {syncedItems.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Outbox Queue */}
        {activeTab === 'outbox' && (
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12 text-xs text-slate-500">Loading queue...</div>
            ) : queueItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800">Outbox is Clean</h3>
                <p className="text-xs text-slate-500 mt-1">All assessments have been successfully synchronized.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {queueItems.map((item) => (
                  <div
                    key={item.submissionUuid}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 px-2 py-0.5 rounded">
                          {item.payload?.demographics?.artNumber || 'ID PENDING'}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                            item.status === 'synced'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : item.status === 'conflict'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : item.status === 'failed'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {item.status === 'synced' ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              <span>Synced</span>
                            </>
                          ) : item.status === 'conflict' ? (
                            <>
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              <span>Needs Review (409)</span>
                            </>
                          ) : item.status === 'failed' ? (
                            <>
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              <span>Retry Scheduled</span>
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              <span>Queued</span>
                            </>
                          )}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">
                        {item.payload?.demographics?.childName || 'Child Beneficiary'}
                      </h3>

                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        <div>Operation: <strong className="text-slate-700">{item.operationType || 'CREATE'}</strong></div>
                        <div>Caregiver: {item.payload?.demographics?.caregiverName}</div>
                        {item.errorMessage && (
                          <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg mt-2 text-[11px]">
                            {item.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Attempts: {item.retryCount || 0}</span>
                      <div className="flex items-center space-x-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Idempotency Key Protected</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Saved Drafts */}
        {activeTab === 'drafts' && (
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12 text-xs text-slate-500">Loading drafts...</div>
            ) : drafts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800">No Saved Drafts</h3>
                <p className="text-xs text-slate-500 mt-1">In-progress assessments will autosave here.</p>
                <div className="mt-4">
                  <Link href="/assessment/new">
                    <Button variant="primary" size="sm">Start Assessment</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {drafts.map((draft) => (
                  <div
                    key={draft.uuid}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 px-2 py-0.5 rounded">
                          {draft.demographics?.artNumber || 'PENDING ID'}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Step {draft.stepIndex || 1} of 6
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">
                        {draft.demographics?.childName || 'Unnamed Intake'}
                      </h3>

                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <div>Caregiver: {draft.demographics?.caregiverName || 'Not recorded'}</div>
                        <div className="text-slate-400 text-[11px]">
                          Last edited: {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                        title="Delete draft"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <Link href={`/assessment/draft/${draft.id || draft.uuid}`}>
                        <Button variant="secondary" size="sm" className="font-bold text-teal-800">
                          <span>Resume Intake</span>
                          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Sync History */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {syncedItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800">No Synced Submissions on this Device</h3>
                <p className="text-xs text-slate-500 mt-1">Confirmed sync receipts will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {syncedItems.map((item) => (
                  <div
                    key={item.submissionUuid}
                    className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 px-2 py-0.5 rounded">
                          {item.payload?.demographics?.artNumber}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {item.payload?.demographics?.childName}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-full">
                          Server Confirmed
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        UUID: {item.submissionUuid} • Last Synced:{' '}
                        {new Date(item.lastAttempt || Date.now()).toLocaleTimeString()}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <Link href={`/assessment/record/${item.submissionUuid}`}>
                        <Button variant="secondary" size="sm">
                          View Record
                        </Button>
                      </Link>
                      <Link href={`/assessment/record/${item.submissionUuid}/receipt`}>
                        <Button variant="secondary" size="sm">
                          Receipt
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function SyncCenterPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-500">Loading Sync Centre...</div>}>
      <SyncCenterContent />
    </Suspense>
  );
}
