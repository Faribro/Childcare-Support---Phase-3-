'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { getAllQueueItems, markSynced, markFailed } from '@/lib/db/syncQueueRepository';
import type { SyncQueueItem } from '@/types/domain';
import {
  RefreshCw,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  PlusCircle,
  Sparkles,
} from 'lucide-react';

function SyncCenterContent() {
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get('submitted') === 'true';

  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const items = await getAllQueueItems();
      setQueueItems(items);
    } catch (err) {
      console.error('Failed to load sync queue:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      for (const item of queueItems) {
        if (item.status === 'queued' || item.status === 'failed') {
          try {
            const res = await fetch('/api/submissions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(item.payload),
            });

            if (res.ok) {
              if (item.id) await markSynced(item.id, item.submissionUuid);
            } else {
              if (item.id) await markFailed(item.id, `Server returned HTTP ${res.status}`);
            }
          } catch (netErr) {
            if (item.id) await markFailed(item.id, 'Network connection unreachable');
          }
        }
      }
      await loadQueue();
    } finally {
      setIsSyncing(false);
    }
  };

  const pendingCount = queueItems.filter(
    (item) => item.status === 'queued' || item.status === 'syncing'
  ).length;

  return (
    <AppShell pendingSyncCount={pendingCount}>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        {/* Success Confirmation Toast */}
        {justSubmitted && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 mb-6 flex items-start space-x-3.5 shadow-sm">
            <div className="bg-alliance-emerald text-white p-2 rounded-xl shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm sm:text-base font-bold text-emerald-950">
                Assessment Successfully Enqueued!
              </h2>
              <p className="text-xs sm:text-sm text-emerald-800 mt-0.5">
                Your assessment was saved to your device’s secure offline outbox with an RFC 4122 UUIDv4. It is queued to automatically upload to central Google Sheets.
              </p>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 mb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-brand text-xs font-bold uppercase tracking-wider mb-1">
              <RefreshCw className="h-4 w-4" />
              <span>Transactional Outbox</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink-900">Sync & Upload Centre</h1>
            <p className="text-xs sm:text-sm text-ink-600 mt-0.5">
              Inspect queued beneficiary assessments, retry failed network transmissions, and view central acknowledgement receipts.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              variant="primary"
              onClick={handleSyncAll}
              isLoading={isSyncing}
              disabled={pendingCount === 0 || isSyncing}
              className="w-full sm:w-auto shadow-sm"
            >
              <CloudUpload className="h-4 w-4 mr-2" />
              <span>Sync All ({pendingCount})</span>
            </Button>

            <Link href="/assessment/new">
              <Button variant="secondary" className="w-full sm:w-auto">
                <PlusCircle className="h-4 w-4 mr-2" />
                <span>New</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Queue Items List */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading queue outbox...</div>
        ) : queueItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-lg mx-auto shadow-sm">
            <div className="bg-emerald-50 text-alliance-emerald h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-ink-900">Outbox is Clean</h3>
            <p className="text-xs sm:text-sm text-ink-600 mt-1 max-w-sm mx-auto">
              All completed child assessments on this device have been synchronized to Google Sheets.
            </p>
            <div className="mt-6">
              <Link href="/assessment/new">
                <Button variant="primary">Start New Assessment</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {queueItems.map((item) => (
              <div
                key={item.submissionUuid}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-brand bg-blue-50 px-2 py-0.5 rounded">
                      {item.payload?.demographics?.artNumber || 'ID PENDING'}
                    </span>

                    {/* Status Pill */}
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center space-x-1 ${
                        item.status === 'synced'
                          ? 'bg-emerald-50 text-alliance-emerald border border-emerald-200'
                          : item.status === 'syncing'
                          ? 'bg-blue-50 text-brand border border-blue-200'
                          : item.status === 'failed'
                          ? 'bg-rose-50 text-alert-rose border border-rose-200'
                          : 'bg-amber-50 text-alert-amber border border-amber-200'
                      }`}
                    >
                      {item.status === 'synced' ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-alliance-emerald" />
                          <span>Synced to Sheet</span>
                        </>
                      ) : item.status === 'failed' ? (
                        <>
                          <AlertTriangle className="h-3.5 w-3.5 text-alert-rose" />
                          <span>Retry Scheduled</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-3.5 w-3.5 text-alert-amber" />
                          <span>Queued for Sync</span>
                        </>
                      )}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-ink-900">
                    {item.payload?.demographics?.childName || 'Child Beneficiary'}
                  </h3>

                  <div className="mt-3 space-y-1.5 text-xs text-ink-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">UUIDv4:</span>
                      <span className="font-mono text-slate-700 truncate max-w-[200px] sm:max-w-[300px]">
                        {item.submissionUuid}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Nutritional Status:</span>
                      <span className="font-bold text-ink-900">
                        {item.payload?.nutrition?.nutritionStatus || 'Not evaluated'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Education Grant:</span>
                      <span className="font-bold text-brand">
                        ₹{item.payload?.education?.recommendedGrantAmount || 0}
                      </span>
                    </div>

                    {item.errorMessage && (
                      <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg mt-2 text-[11px]">
                        <strong>Note:</strong> {item.errorMessage}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>Attempts: {item.retryCount || 0}</span>
                  <div className="flex items-center space-x-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Idempotent write protected</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function SyncCenterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading Sync Centre...</div>}>
      <SyncCenterContent />
    </Suspense>
  );
}
