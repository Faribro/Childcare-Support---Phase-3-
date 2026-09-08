'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { SubmissionViewModal } from '@/components/sync/SubmissionViewModal';
import {
  getAllQueueItems,
  markSynced,
  markFailed,
  markConflict,
  acquireSyncLock,
  releaseSyncLock,
} from '@/lib/db/syncQueueRepository';
import type { SyncQueueItem } from '@/types/domain';
import { Search, Calendar, X } from 'lucide-react';

export interface UnifiedAssessmentItem {
  id: string;
  submissionId: string;
  localId: string;
  childName: string;
  caregiverName: string;
  caregiverPhone?: string;
  district?: string;
  state?: string;
  revisionNumber: number;
  status: 'synced' | 'ready_to_sync' | 'syncing' | 'failed_retryable' | 'failed_requires_attention';
  serverStatus: 'accepted' | 'syncing' | 'waiting' | 'error';
  sheetsStatus: 'exported' | 'exporting' | 'waiting' | 'failed';
  createdAt: string;
  lastEditedAt?: string;
  editReason?: string;
  sheetRow?: number | string;
  lastError?: string;
  rawRecord: any;
}

function SyncCentreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get('submitted') === 'true';
  const submittedRef = searchParams.get('ref');

  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [serverSubmissions, setServerSubmissions] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReachable, setIsReachable] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<UnifiedAssessmentItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const checkReachability = async () => {
    try {
      const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [q, serverRes, reachable] = await Promise.all([
        getAllQueueItems(),
        fetch('/api/submissions?limit=100', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        checkReachability(),
      ]);

      setQueueItems(q || []);
      if (serverRes && (serverRes.data || Array.isArray(serverRes))) {
        setServerSubmissions(serverRes.data || serverRes);
      }

      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOnline(online);
      setIsReachable(reachable);
    } catch (err) {
      console.error('[SyncCentre] Error loading data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const handleSyncComplete = () => {
      loadData();
    };
    window.addEventListener('child_nutrition:sync_completed', handleSyncComplete);
    const interval = setInterval(loadData, 5000);
    return () => {
      window.removeEventListener('child_nutrition:sync_completed', handleSyncComplete);
      clearInterval(interval);
    };
  }, [loadData]);

  const handleSyncAll = async () => {
    if (isSyncing) return;
    if (!acquireSyncLock()) return;

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
        } catch {
          if (item.id) {
            await markFailed(item.id, 'Network connection unreachable', 503);
          }
        }
      }
      await loadData();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('child_nutrition:sync_completed'));
      }
    } finally {
      releaseSyncLock();
      setIsSyncing(false);
    }
  };

  const handleEditSubmission = (item: UnifiedAssessmentItem) => {
    router.push(`/assessment/record/${encodeURIComponent(item.id)}/edit`);
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  // Merge server records and local queued items into a unified list
  const unifiedItems: UnifiedAssessmentItem[] = useMemo(() => {
    const map = new Map<string, UnifiedAssessmentItem>();

    // 1. Process server submissions (e.g. from Google Sheets / central database)
    serverSubmissions.forEach((r: any, idx: number) => {
      const id =
        r['1\nUnique ID'] ||
        r.uniqueId ||
        r.art_number ||
        r.artNumber ||
        r.client_submission_id ||
        r._uuid ||
        `BENEFICIARY-${idx + 1}`;

      const submissionId = r._uuid || r.remote_submission_id || r.client_submission_id || id;
      const childName = r['9\nChild Name'] || r.child_name || r.childName || 'Child Beneficiary';
      const caregiverName = r['14\nCaregiver Full Name'] || r.caregiver_name || r.caregiverName || 'Caregiver';
      const caregiverPhone = r['16\nCaregiver Contact'] || r.caregiver_phone || r.caregiverPhone;
      const district = r['19\nDistrict'] || r.district || '';
      const state = r['18\nState'] || r.state || '';
      const revisionNumber = Number(r['2\nRevision Number'] || r.revision || r.version || 1);
      const createdAt = r['3\nSubmission Time'] || r.submissionTime || r.created_at || r.updated_at || new Date().toISOString();
      const lastEditedAt = r.lastEditedAt || r.updated_at || (revisionNumber > 1 ? createdAt : undefined);
      const editReason = r['48\nEdit Reason'] || r.editReason || r.edit_reason;
      const sheetRow = r.sheetRow || r.rowNumber || idx + 2;

      map.set(id, {
        id,
        submissionId,
        localId: String(submissionId),
        childName,
        caregiverName,
        caregiverPhone,
        district,
        state,
        revisionNumber,
        status: 'synced',
        serverStatus: 'accepted',
        sheetsStatus: 'exported',
        createdAt,
        lastEditedAt,
        editReason,
        sheetRow,
        rawRecord: r,
      });
    });

    // 2. Process local Dexie queue items
    queueItems.forEach((qItem: SyncQueueItem) => {
      const payload = qItem.payload || ({} as any);
      const demographics = payload.demographics || {};
      const id = demographics.artNumber || qItem.submissionUuid;
      const submissionId = qItem.submissionUuid;
      const childName = demographics.childName || 'Child Beneficiary';
      const caregiverName = demographics.caregiverName || 'Caregiver';
      const caregiverPhone = demographics.caregiverPhone;
      const district = demographics.district || '';
      const state = demographics.state || '';
      const revisionNumber = Number(payload.version || (qItem as any).version || qItem.expectedVersion || 1);
      const createdAt = payload.createdAt || (qItem.lastAttempt ? new Date(qItem.lastAttempt).toISOString() : new Date().toISOString());
      const lastEditedAt = payload.updatedAt || (qItem.lastAttempt ? new Date(qItem.lastAttempt).toISOString() : undefined);
      const editReason = (payload as any).editReason;

      let status: UnifiedAssessmentItem['status'] = 'ready_to_sync';
      let serverStatus: UnifiedAssessmentItem['serverStatus'] = 'waiting';
      let sheetsStatus: UnifiedAssessmentItem['sheetsStatus'] = 'waiting';

      if (qItem.status === 'synced') {
        status = 'synced';
        serverStatus = 'accepted';
        sheetsStatus = 'exported';
      } else if (qItem.status === 'syncing') {
        status = 'syncing';
        serverStatus = 'syncing';
        sheetsStatus = 'exporting';
      } else if (qItem.status === 'failed') {
        status = 'failed_retryable';
        serverStatus = 'error';
        sheetsStatus = 'failed';
      }

      if (map.has(id)) {
        const existing = map.get(id)!;
        if (qItem.status !== 'synced' || revisionNumber >= existing.revisionNumber) {
          map.set(id, {
            ...existing,
            revisionNumber: Math.max(revisionNumber, existing.revisionNumber),
            status,
            serverStatus,
            sheetsStatus,
            lastEditedAt: lastEditedAt || existing.lastEditedAt,
            editReason: editReason || existing.editReason,
            lastError: qItem.errorMessage || undefined,
            rawRecord: payload,
          });
        }
      } else {
        map.set(id, {
          id,
          submissionId,
          localId: String(qItem.id || submissionId),
          childName,
          caregiverName,
          caregiverPhone,
          district,
          state,
          revisionNumber,
          status,
          serverStatus,
          sheetsStatus,
          createdAt,
          lastEditedAt,
          editReason,
          lastError: qItem.errorMessage || undefined,
          rawRecord: payload,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const timeA = a.lastEditedAt || a.createdAt;
      const timeB = b.lastEditedAt || b.createdAt;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
  }, [serverSubmissions, queueItems]);

  const pendingCount = unifiedItems.filter(
    (i) => i.status === 'ready_to_sync' || i.status === 'failed_retryable' || i.status === 'syncing' || i.sheetsStatus !== 'exported'
  ).length;

  const syncedCount = unifiedItems.filter(
    (i) => i.status === 'synced' && i.sheetsStatus === 'exported'
  ).length;

  // Filter with Search Query + From/To Date
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.id.toLowerCase().includes(q) ||
          item.childName.toLowerCase().includes(q) ||
          item.caregiverName.toLowerCase().includes(q) ||
          (item.district && item.district.toLowerCase().includes(q)) ||
          (item.state && item.state.toLowerCase().includes(q));
        if (!match) return false;
      }

      const itemDateStr = item.createdAt ? item.createdAt.split('T')[0] : '';
      if (fromDate && itemDateStr && itemDateStr < fromDate) {
        return false;
      }
      if (toDate && itemDateStr && itemDateStr > toDate) {
        return false;
      }

      return true;
    });
  }, [unifiedItems, searchQuery, fromDate, toDate]);

  return (
    <AppShell pendingSyncCount={pendingCount}>
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-5 animate-in fade-in duration-200">
        {/* Read-only Submission View Modal */}
        {viewingItem && (
          <SubmissionViewModal
            item={viewingItem}
            onClose={() => setViewingItem(null)}
            onEdit={() => {
              const target = viewingItem;
              setViewingItem(null);
              handleEditSubmission(target);
            }}
          />
        )}

        {/* Just Submitted Notification Banner */}
        {justSubmitted && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <p className="text-xs sm:text-sm text-emerald-950 font-semibold">
                Assessment recorded! Reference: <strong className="font-mono">{submittedRef || 'Saved'}</strong>
              </p>
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">Saved to device</span>
          </div>
        )}

        {/* Replaced Header: Search, Date Filter & Sync Actions Bar */}
        <div className="p-4 sm:p-5 bg-white border border-[hsl(215,18%,82%)] rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-base sm:text-lg font-bold text-[hsl(220,15%,15%)]">
                Submitted Assessments ({filteredItems.length})
              </h1>
              <p className="text-xs text-[hsl(215,12%,45%)] mt-0.5">
                {syncedCount} added to the report • {pendingCount} waiting
              </p>
            </div>

            {/* Top Action: Send Pending Assessments (Hidden when 0 waiting) */}
            {pendingCount > 0 && (
              <Button
                variant="primary"
                onClick={handleSyncAll}
                disabled={isSyncing || !isReachable}
                className="font-bold px-5 py-2 text-xs shadow-xs flex-shrink-0 bg-[hsl(210,80%,45%)] hover:bg-[hsl(210,80%,40%)] text-white cursor-pointer"
              >
                {isSyncing ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending assessments…
                  </span>
                ) : (
                  `Send ${pendingCount} Pending Assessment${pendingCount === 1 ? '' : 's'}`
                )}
              </Button>
            )}
          </div>

          {/* Search Bar & Date Range Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-[hsl(215,18%,90%)]">
            {/* Search Input */}
            <div className="relative sm:col-span-6">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by child name, ART number, caregiver, district..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[hsl(215,18%,85%)] bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:bg-white transition-colors"
              />
            </div>

            {/* From Date */}
            <div className="sm:col-span-3 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-[hsl(215,18%,85%)] bg-slate-50/50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:bg-white transition-colors"
              />
            </div>

            {/* To Date */}
            <div className="sm:col-span-3 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-[hsl(215,18%,85%)] bg-slate-50/50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {(searchQuery || fromDate || toDate) && (
            <div className="flex items-center justify-between text-xs pt-1 text-slate-500">
              <span>Showing {filteredItems.length} filtered results</span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFromDate('');
                  setToDate('');
                }}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer underline flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                <span>Clear filters</span>
              </button>
            </div>
          )}
        </div>

        {/* Your Assessments List */}
        <section className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-[hsl(215,18%,85%)] text-center space-y-1.5 bg-white">
              <p className="text-xs font-semibold text-[hsl(220,15%,25%)]">
                {searchQuery || fromDate || toDate ? 'No assessments match your search or date filter' : 'No submitted assessments yet'}
              </p>
              <p className="text-[11px] text-[hsl(215,12%,50%)] max-w-md mx-auto">
                {searchQuery || fromDate || toDate
                  ? 'Try clearing or changing your search criteria.'
                  : 'When you complete an assessment, it will appear here so you can check that it has been safely sent for reporting.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => {
                const isExpanded = expandedId === item.localId;
                const isServerAccepted = item.serverStatus === 'accepted' || item.status === 'synced';
                const isSheetsExported = item.sheetsStatus === 'exported';
                const isFailed = item.status === 'failed_requires_attention' || item.status === 'failed_retryable' || item.sheetsStatus === 'failed';
                const isSending = item.status === 'syncing' || item.serverStatus === 'syncing' || item.sheetsStatus === 'exporting' || isSyncing;

                const revisionCount = item.revisionNumber || 1;
                const isAmended = revisionCount > 1;

                // Operational helper text for ART Centre staff
                let helperText = 'This assessment is saved on this device and will be sent when internet is available.';
                if (isSheetsExported && isServerAccepted) {
                  helperText = 'The latest assessment information is now available in the reporting sheet.';
                } else if (item.status === 'failed_retryable' || item.sheetsStatus === 'failed') {
                  helperText = 'Your assessment is safe. We will try again automatically.';
                } else if (item.status === 'failed_requires_attention') {
                  helperText = 'Please open this assessment and follow the instructions to complete sending.';
                } else if (isServerAccepted && !isSheetsExported) {
                  helperText = 'The assessment is saved securely. It will appear in the reporting sheet shortly.';
                }

                return (
                  <div
                    key={item.localId}
                    className="p-4 sm:p-5 bg-white rounded-xl border border-[hsl(215,18%,85%)] hover:border-[hsl(215,18%,75%)] transition-colors shadow-2xs space-y-3"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-2 flex-1">
                        {/* Top Row Badges & Assessment Reference */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* 1. Server Security Status Badge */}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5 border ${
                              isServerAccepted
                                ? 'bg-[hsl(145,60%,94%)] text-[hsl(145,65%,25%)] border-[hsl(145,60%,80%)]'
                                : isSending
                                  ? 'bg-[hsl(210,80%,94%)] text-[hsl(210,80%,30%)] border-[hsl(210,80%,80%)]'
                                  : isFailed
                                    ? 'bg-[hsl(0,72%,94%)] text-[hsl(0,72%,35%)] border-[hsl(0,72%,80%)]'
                                    : 'bg-[hsl(40,90%,94%)] text-[hsl(40,90%,30%)] border-[hsl(40,90%,80%)]'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isServerAccepted
                                  ? 'bg-[hsl(145,65%,45%)]'
                                  : isSending
                                    ? 'bg-[hsl(210,80%,50%)] animate-ping'
                                    : isFailed
                                      ? 'bg-[hsl(0,72%,50%)]'
                                      : 'bg-[hsl(40,90%,50%)]'
                              }`}
                            />
                            {isServerAccepted ? 'Saved securely' : isSending ? 'Sending…' : isFailed ? 'Could not update' : 'Saved on this device'}
                          </span>

                          {/* 2. Reporting Sheet Status Badge */}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5 border ${
                              isSheetsExported
                                ? 'bg-[hsl(160,60%,94%)] text-[hsl(160,70%,25%)] border-[hsl(160,60%,80%)]'
                                : isSending
                                  ? 'bg-[hsl(210,80%,94%)] text-[hsl(210,80%,30%)] border-[hsl(210,80%,80%)]'
                                  : item.sheetsStatus === 'failed'
                                    ? 'bg-[hsl(0,72%,94%)] text-[hsl(0,72%,35%)] border-[hsl(0,72%,80%)]'
                                    : 'bg-[hsl(215,20%,94%)] text-[hsl(215,15%,35%)] border-[hsl(215,18%,80%)]'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isSheetsExported
                                  ? 'bg-[hsl(160,70%,40%)]'
                                  : isSending
                                    ? 'bg-[hsl(210,80%,50%)] animate-pulse'
                                    : item.sheetsStatus === 'failed'
                                      ? 'bg-[hsl(0,72%,50%)]'
                                      : 'bg-[hsl(215,15%,60%)]'
                              }`}
                            />
                            {isSheetsExported
                              ? 'Added to the report'
                              : isSending
                                ? 'Sending…'
                                : item.sheetsStatus === 'failed'
                                  ? 'Could not update the report'
                                  : 'Waiting to appear in the report'}
                          </span>

                          {/* 3. Revision Text */}
                          {isAmended && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[hsl(210,80%,92%)] text-[hsl(210,80%,30%)] border border-[hsl(210,80%,85%)]">
                              Updated {revisionCount} times
                            </span>
                          )}

                          {/* 4. Assessment Reference */}
                          <span className="text-xs font-semibold text-[hsl(220,15%,25%)]">
                            Assessment reference: <strong className="font-bold text-[hsl(220,15%,15%)] font-mono">{item.id}</strong>
                          </span>
                        </div>

                        {/* Beneficiary Details */}
                        <div className="text-xs text-slate-700">
                          <span className="font-bold text-slate-900">{item.childName}</span>
                          <span className="text-slate-400 mx-1.5">•</span>
                          <span>Caregiver: <strong>{item.caregiverName}</strong></span>
                          {item.district && (
                            <>
                              <span className="text-slate-400 mx-1.5">•</span>
                              <span className="text-slate-500">{item.district}{item.state ? `, ${item.state}` : ''}</span>
                            </>
                          )}
                        </div>

                        {/* Operational Helper Text */}
                        <p className="text-xs text-[hsl(215,12%,40%)] leading-relaxed">
                          {helperText}
                        </p>

                        {/* Timestamps */}
                        <p className="text-[11px] text-[hsl(215,12%,50%)]">
                          Saved on {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}{' '}
                          at {new Date(item.createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                          {item.lastEditedAt && (
                            <span>
                              {' '}• Last updated on {new Date(item.lastEditedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}{' '}
                              at {new Date(item.lastEditedAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Action Buttons: View, Edit, History */}
                      <div className="flex items-center gap-2 flex-wrap self-start lg:self-center">
                        <button
                          type="button"
                          onClick={() => setViewingItem(item)}
                          className="text-xs h-8 px-3.5 font-semibold bg-white border border-[hsl(215,18%,82%)] hover:bg-[hsl(215,20%,97%)] text-[hsl(220,15%,20%)] rounded-lg transition-colors cursor-pointer"
                        >
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEditSubmission(item)}
                          className="text-xs h-8 px-3.5 font-semibold bg-white border border-[hsl(215,18%,82%)] hover:bg-[hsl(215,20%,97%)] text-[hsl(220,15%,20%)] rounded-lg transition-colors cursor-pointer"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : item.localId)}
                          className="text-xs h-8 px-2.5 text-[hsl(215,12%,45%)] hover:text-slate-800 transition-colors cursor-pointer"
                        >
                          {isExpanded ? 'Hide' : 'History'}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Technical Details & History Drawer */}
                    {isExpanded && (
                      <div className="p-3.5 rounded-lg bg-[hsl(215,20%,97%)] border border-[hsl(215,18%,88%)] text-xs space-y-2.5 pt-3">
                        <div className="flex items-center justify-between pb-1.5 border-b border-[hsl(215,18%,90%)]">
                          <span className="font-bold text-[hsl(220,15%,20%)] text-[11px] uppercase tracking-wider">
                            Technical details &amp; History
                          </span>
                          <span className="text-[10px] text-[hsl(215,12%,50%)]">
                            Reference: {item.id}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="font-semibold text-[hsl(215,12%,45%)] block">
                              Full Submission ID:
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[hsl(220,15%,20%)] break-all select-all font-medium">
                                {item.submissionId}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyId(item.submissionId)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(215,20%,90%)] hover:bg-[hsl(215,20%,85%)] text-[hsl(220,15%,25%)] font-semibold transition-colors flex-shrink-0 cursor-pointer"
                              >
                                {copiedId === item.submissionId ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>

                          <div>
                            <span className="font-semibold text-[hsl(215,12%,45%)] block">
                              Revision Number:
                            </span>
                            <span className="font-medium text-[hsl(220,15%,20%)]">
                              Revision {revisionCount} {isAmended ? `(Updated ${revisionCount} times)` : '(Original submission)'}
                            </span>
                          </div>
                        </div>

                        {item.editReason && (
                          <div className="p-2.5 rounded bg-[hsl(210,80%,97%)] border border-[hsl(210,80%,85%)] text-[hsl(210,80%,25%)] text-[11px]">
                            <span className="font-bold block">Reason for Update (Revision {item.revisionNumber}):</span>
                            <span>{item.editReason}</span>
                          </div>
                        )}

                        {item.lastError && (
                          <div className="p-2.5 rounded bg-[hsl(0,72%,96%)] border border-[hsl(0,72%,80%)] text-[hsl(0,72%,35%)] text-[11px]">
                            <span className="font-bold block">Status Note:</span>
                            <span>{item.lastError}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] font-semibold text-[hsl(215,12%,40%)] pt-1 border-t border-[hsl(215,18%,90%)]">
                          <span>Form Version: 3.0.0</span>
                          <span>
                            {item.sheetRow ? `Report Row: ${item.sheetRow}` : 'Report Status: In queue'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export default function SyncCentrePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[hsl(40,20%,98%)] flex items-center justify-center">
          <div className="text-xs text-slate-500 font-medium">Loading sync centre...</div>
        </div>
      }
    >
      <SyncCentreContent />
    </Suspense>
  );
}
