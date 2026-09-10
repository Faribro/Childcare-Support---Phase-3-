'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { SubmissionViewModal } from '@/components/sync/SubmissionViewModal';
import { getAllQueueItems } from '@/lib/db/syncQueueRepository';
import { syncOrchestrator } from '@/lib/sync/syncOrchestrator';
import type { SyncQueueItem } from '@/types/domain';
import {
  Search,
  Calendar,
  X,
  CheckCircle2,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';

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
  status: 'synced' | 'ready_to_sync' | 'syncing' | 'failed_retryable' | 'failed_final' | 'conflict';
  chipStatus: 'Local' | 'Sending' | 'Submitted' | 'Needs attention' | 'Conflict';
  serverStatus: 'accepted' | 'syncing' | 'waiting' | 'error';
  sheetsStatus: 'exported' | 'exporting' | 'waiting' | 'failed';
  createdAt: string;
  lastEditedAt?: string;
  editReason?: string;
  sheetRow?: number | string;
  lastError?: string;
  retryCount?: number;
  rawRecord: any;
  isOutbox: boolean;
}

function StatusChip({ chipStatus }: { chipStatus: 'Local' | 'Sending' | 'Submitted' | 'Needs attention' | 'Conflict' }) {
  switch (chipStatus) {
    case 'Submitted':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Submitted
        </span>
      );
    case 'Sending':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          Sending…
        </span>
      );
    case 'Conflict':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-300">
          <AlertTriangle className="w-2.5 h-2.5" />
          Conflict
        </span>
      );
    case 'Needs attention':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-300">
          <AlertCircle className="w-2.5 h-2.5" />
          Needs attention
        </span>
      );
    case 'Local':
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
          <Clock className="w-2.5 h-2.5" />
          On device
        </span>
      );
  }
}

function SubmissionStatusBanner({
  submittedRef,
  status,
  errorMessage,
  isOnline,
  onDismiss,
}: {
  submittedRef: string | null;
  status: string | null;
  errorMessage?: string | null;
  isOnline: boolean;
  onDismiss: () => void;
}) {
  const effectiveStatus = status || (isOnline ? 'syncing' : 'offline');

  if (effectiveStatus === 'synced') {
    return (
      <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-emerald-950">Assessment submitted &amp; saved to server</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                Submitted
              </span>
            </div>
            <p className="text-xs text-emerald-800 mt-1">
              Reference: <strong className="font-mono font-bold text-emerald-950">{submittedRef || 'Recorded'}</strong>. Canonical server confirmation received. Your assessment is recorded in the central linelist.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg touch-target min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (effectiveStatus === 'syncing') {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-amber-950">Assessment recorded locally. Sending to server…</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                Sending
              </span>
            </div>
            <p className="text-xs text-amber-800 mt-1">
              Reference: <strong className="font-mono font-bold text-amber-950">{submittedRef || 'Local'}</strong>. Your assessment is safely saved on this device. Automatic background sync is in progress.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-700 hover:text-amber-900 p-1 rounded-lg touch-target min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (effectiveStatus === 'offline') {
    return (
      <div className="bg-slate-50 border border-slate-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900">Saved safely to device (Offline)</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300">
                Local
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Reference: <strong className="font-mono font-bold text-slate-900">{submittedRef || 'Local'}</strong>. You are currently offline. This record is protected in local storage and will automatically send once your connection is restored.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-600 hover:text-slate-900 p-1 rounded-lg touch-target min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (effectiveStatus === 'retryable') {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-amber-950">Assessment saved locally. Waiting to retry send.</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                Retrying soon
              </span>
            </div>
            <p className="text-xs text-amber-800 mt-1">
              Reference: <strong className="font-mono font-bold text-amber-950">{submittedRef || 'Local'}</strong>. A network or server pause occurred. Automatic retry with exponential backoff is scheduled.
              {errorMessage && <span className="block mt-1 font-mono text-[11px] text-amber-900">Details: {errorMessage}</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-700 hover:text-amber-900 p-1 rounded-lg touch-target min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (effectiveStatus === 'conflict') {
    return (
      <div className="bg-purple-50 border border-purple-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-100 border border-purple-300 flex items-center justify-center text-purple-700 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-purple-950">Assessment saved locally. Version conflict detected.</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                Conflict
              </span>
            </div>
            <p className="text-xs text-purple-800 mt-1">
              Reference: <strong className="font-mono font-bold text-purple-950">{submittedRef || 'Local'}</strong>. A newer version of this record exists on the central server. Please review before overwriting.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-purple-700 hover:text-purple-900 p-1 rounded-lg touch-target min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Failed final / needs attention
  return (
    <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-700 shrink-0 mt-0.5">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-rose-950">Assessment saved locally. Requires attention.</h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
              Needs attention
            </span>
          </div>
          <p className="text-xs text-rose-800 mt-1">
            Reference: <strong className="font-mono font-bold text-rose-950">{submittedRef || 'Local'}</strong>. The server rejected the submission format. Your data is safe locally on this device. Please review the details.
            {errorMessage && <span className="block mt-1 font-mono text-[11px] text-rose-900">Details: {errorMessage}</span>}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-rose-700 hover:text-rose-900 p-1 rounded-lg touch-target min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
        aria-label="Dismiss banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function SyncCentreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get('submitted') === 'true';
  const submittedRef = searchParams.get('ref');
  const submittedStatus = searchParams.get('status');
  const submittedErr = searchParams.get('err');

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [serverSubmissions, setServerSubmissions] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReachable, setIsReachable] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<UnifiedAssessmentItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Tab State: 'all' | 'outbox' | 'synced'
  const [activeTab, setActiveTab] = useState<'all' | 'outbox' | 'synced'>('all');

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

      // Resilient array extraction:
      const rawData = serverRes?.data;
      let records: any[] = [];
      if (Array.isArray(rawData)) {
        records = rawData;
      } else if (rawData && Array.isArray(rawData.records)) {
        records = rawData.records;
      } else if (Array.isArray(serverRes)) {
        records = serverRes;
      }
      setServerSubmissions(records);

      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOnline(online);
      setIsReachable(reachable);
    } catch (err) {
      console.error('[SyncCentre] Error loading data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const handleSyncUpdate = () => {
      loadData();
    };
    window.addEventListener('child_nutrition:sync_completed', handleSyncUpdate);
    window.addEventListener('child_nutrition:record_synced', handleSyncUpdate);
    const interval = setInterval(loadData, 5000);
    return () => {
      window.removeEventListener('child_nutrition:sync_completed', handleSyncUpdate);
      window.removeEventListener('child_nutrition:record_synced', handleSyncUpdate);
      clearInterval(interval);
    };
  }, [loadData]);

  const handleSyncAll = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncOrchestrator.flushQueue('manual');
      await loadData();
    } catch (err) {
      console.error('[SyncCentre] Error during manual sync:', err);
    } finally {
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
        chipStatus: 'Submitted',
        serverStatus: 'accepted',
        sheetsStatus: 'exported',
        createdAt,
        lastEditedAt,
        editReason,
        sheetRow,
        rawRecord: r,
        isOutbox: false,
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
      let chipStatus: UnifiedAssessmentItem['chipStatus'] = 'Local';
      let serverStatus: UnifiedAssessmentItem['serverStatus'] = 'waiting';
      let sheetsStatus: UnifiedAssessmentItem['sheetsStatus'] = 'waiting';
      let isOutbox = true;

      if (qItem.status === 'synced') {
        status = 'synced';
        chipStatus = 'Submitted';
        serverStatus = 'accepted';
        sheetsStatus = 'exported';
        isOutbox = false;
      } else if (qItem.status === 'syncing') {
        status = 'syncing';
        chipStatus = 'Sending';
        serverStatus = 'syncing';
        sheetsStatus = 'exporting';
      } else if (qItem.status === 'failed') {
        const code = Number(qItem.statusCode || qItem.lastErrorCode || 0);
        if (code === 409 || qItem.errorMessage?.toLowerCase().includes('conflict')) {
          status = 'conflict';
          chipStatus = 'Conflict';
          serverStatus = 'error';
          sheetsStatus = 'failed';
        } else if (code >= 400 && code < 500 && code !== 408 && code !== 429) {
          status = 'failed_final';
          chipStatus = 'Needs attention';
          serverStatus = 'error';
          sheetsStatus = 'failed';
        } else {
          status = 'failed_retryable';
          chipStatus = 'Local';
          serverStatus = 'waiting';
          sheetsStatus = 'waiting';
        }
      }

      if (map.has(id)) {
        const existing = map.get(id)!;
        if (qItem.status !== 'synced' || revisionNumber >= existing.revisionNumber) {
          map.set(id, {
            ...existing,
            revisionNumber: Math.max(revisionNumber, existing.revisionNumber),
            status,
            chipStatus,
            serverStatus,
            sheetsStatus,
            lastEditedAt: lastEditedAt || existing.lastEditedAt,
            editReason: editReason || existing.editReason,
            lastError: qItem.errorMessage || undefined,
            retryCount: qItem.retryCount,
            rawRecord: payload,
            isOutbox,
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
          chipStatus,
          serverStatus,
          sheetsStatus,
          createdAt,
          lastEditedAt,
          editReason,
          lastError: qItem.errorMessage || undefined,
          retryCount: qItem.retryCount,
          rawRecord: payload,
          isOutbox,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const timeA = a.lastEditedAt || a.createdAt;
      const timeB = b.lastEditedAt || b.createdAt;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
  }, [serverSubmissions, queueItems]);

  const outboxItems = useMemo(() => {
    return unifiedItems.filter((i) => i.isOutbox);
  }, [unifiedItems]);

  const syncedItems = useMemo(() => {
    return unifiedItems.filter((i) => !i.isOutbox);
  }, [unifiedItems]);

  const pendingCount = outboxItems.length;
  const submittedCount = syncedItems.length;

  // Filter with Tab + Search Query + From/To Date
  const filteredItems = useMemo(() => {
    const list =
      activeTab === 'outbox'
        ? outboxItems
        : activeTab === 'synced'
        ? syncedItems
        : unifiedItems;

    return list.filter((item) => {
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
  }, [unifiedItems, outboxItems, syncedItems, activeTab, searchQuery, fromDate, toDate]);

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    router.replace('/assessment/sync', { scroll: false });
  };

  const renderItemCard = (item: UnifiedAssessmentItem) => {
    const isExpanded = expandedId === item.localId;
    const revisionCount = item.revisionNumber || 1;
    const isAmended = revisionCount > 1;

    return (
      <div
        key={item.localId}
        className={`flex bg-white rounded-xl border transition-colors shadow-2xs overflow-hidden ${
          item.isOutbox ? 'border-amber-200 hover:border-amber-300' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {/* Left Vertical ID Column (Tablet / Desktop) */}
        <div className="hidden sm:flex w-12 sm:w-14 bg-slate-50 border-r border-slate-200/80 items-center justify-center shrink-0 py-3.5 select-all">
          <div className="flex items-center gap-1.5 [writing-mode:vertical-rl] rotate-180">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Id
            </span>
            <span className="text-slate-300">•</span>
            <span className="font-mono font-bold text-teal-800 text-xs tracking-wider">
              {item.id}
            </span>
          </div>
        </div>

        {/* Main Card Content */}
        <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-2.5 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="sm:hidden font-mono font-bold text-teal-800 text-[11px] bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {item.id}
                </span>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  {item.childName}
                </h3>
                <span className="text-slate-400">•</span>
                <span className="text-xs text-slate-600">
                  Caregiver: <strong className="text-slate-800">{item.caregiverName}</strong>
                </span>
                {item.district && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span className="text-xs text-slate-500">
                      {item.district}{item.state ? `, ${item.state}` : ''}
                    </span>
                  </>
                )}

                {/* Status Chip */}
                <StatusChip chipStatus={item.chipStatus} />

                {isAmended && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Updated {revisionCount} times
                  </span>
                )}
              </div>

              {/* Timestamps & Outbox Context */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 text-[11px] text-slate-500">
                <p>
                  Saved on {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}{' '}
                  at {new Date(item.createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                  {item.lastEditedAt && (
                    <span>
                      {' '}• Last updated on {new Date(item.lastEditedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}{' '}
                      at {new Date(item.lastEditedAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                    </span>
                  )}
                </p>
                {item.isOutbox && (
                  <span className="font-medium text-amber-700 sm:before:content-['•'] sm:before:mx-1 sm:before:text-slate-300">
                    On this device (Outbox)
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons: View, Edit, History */}
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t border-slate-100 sm:border-t-0 justify-end">
              <button
                type="button"
                onClick={() => setViewingItem(item)}
                className="touch-target-44 min-h-[44px] text-xs px-3.5 font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition-colors cursor-pointer flex items-center justify-center flex-1 sm:flex-initial"
              >
                View
              </button>

              <button
                type="button"
                onClick={() => handleEditSubmission(item)}
                className="touch-target-44 min-h-[44px] text-xs px-3.5 font-bold bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center flex-1 sm:flex-initial"
              >
                Edit
              </button>

              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : item.localId)}
                className="touch-target-44 min-h-[44px] text-xs px-3 font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer flex items-center justify-center"
              >
                {isExpanded ? 'Hide' : 'History'}
              </button>
            </div>
          </div>

          {/* Expandable Technical Details & History Drawer */}
          {isExpanded && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2.5 pt-3">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                  Technical details &amp; History
                </span>
                <span className="text-[10px] text-slate-500">
                  Id: {item.id}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="font-semibold text-slate-500 block">
                    Full Submission ID:
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-slate-800 break-all select-all font-medium">
                      {item.submissionId}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(item.submissionId)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold transition-colors flex-shrink-0 cursor-pointer"
                    >
                      {copiedId === item.submissionId ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-slate-500 block">
                    Revision Number:
                  </span>
                  <span className="font-medium text-slate-800">
                    Revision {revisionCount} {isAmended ? `(Updated ${revisionCount} times)` : '(Original submission)'}
                  </span>
                </div>
              </div>

              {item.editReason && (
                <div className="p-2.5 rounded bg-blue-50 border border-blue-200 text-blue-900 text-[11px]">
                  <span className="font-bold block">Reason for Update (Revision {item.revisionNumber}):</span>
                  <span>{item.editReason}</span>
                </div>
              )}

              {item.lastError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-900 text-[11px]">
                  <span className="font-bold block">Status Note:</span>
                  <span>{item.lastError}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 pt-1 border-t border-slate-200">
                <span>Storage: {item.isOutbox ? 'Local Outbox (Dexie)' : 'Central Linelist (Google Sheets)'}</span>
                <span>
                  {item.sheetRow ? `Report Row: ${item.sheetRow}` : 'Report Status: In queue'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <AppShell pendingSyncCount={pendingCount} submittedCount={submittedCount}>
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

        {/* Truthful Submission Status Banner */}
        {justSubmitted && !bannerDismissed && (
          <SubmissionStatusBanner
            submittedRef={submittedRef}
            status={submittedStatus}
            errorMessage={submittedErr}
            isOnline={isOnline}
            onDismiss={handleDismissBanner}
          />
        )}

        {/* Top Control Bar: Search, Date Filter & Sync Actions Bar */}
        <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
          {/* Outbox Banner (Shown when records are waiting on device) */}
          {pendingCount > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <div>
                  <p className="text-xs font-bold text-amber-950">
                    {pendingCount} assessment{pendingCount === 1 ? '' : 's'} on this device waiting to synchronize
                  </p>
                  <p className="text-[11px] text-amber-800">
                    {isOnline
                      ? 'Network connection active. Automatic sync in progress or tap to send immediately.'
                      : 'You are offline. Records will synchronize automatically when connection is restored.'}
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={handleSyncAll}
                disabled={isSyncing || !isOnline || !isReachable}
                className="font-bold px-5 py-2 text-xs shadow-xs flex-shrink-0 bg-purple-700 hover:bg-purple-800 text-white cursor-pointer touch-target min-h-[44px]"
              >
                {isSyncing ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Sending…
                  </span>
                ) : (
                  `Send ${pendingCount} Waiting Record${pendingCount === 1 ? '' : 's'}`
                )}
              </Button>
            </div>
          )}

          {/* Tab Navigation: All | Waiting to Send | Submitted Records */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer touch-target min-h-[40px] flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-purple-100 text-purple-900 border border-purple-300'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <span>All Records</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/80 font-bold border border-slate-200">
                {unifiedItems.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('outbox')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer touch-target min-h-[40px] flex items-center gap-1.5 ${
                activeTab === 'outbox'
                  ? 'bg-amber-100 text-amber-950 border border-amber-300'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <span>Waiting to Send</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold border ${
                pendingCount > 0 ? 'bg-amber-200 text-amber-900 border-amber-300' : 'bg-white/80 border-slate-200'
              }`}>
                {pendingCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('synced')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer touch-target min-h-[40px] flex items-center gap-1.5 ${
                activeTab === 'synced'
                  ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <span>Submitted Records</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/80 font-bold border border-slate-200">
                {submittedCount}
              </span>
            </button>
          </div>

          {/* Search Bar & Date Range Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="relative sm:col-span-6">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by child name, ART number, caregiver, district..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-400/40 focus:border-purple-600 transition-colors"
              />
            </div>

            {/* From Date */}
            <div className="sm:col-span-3 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-400/40 focus:border-purple-600 transition-colors"
              />
            </div>

            {/* To Date */}
            <div className="sm:col-span-3 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-400/40 focus:border-purple-600 transition-colors"
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
                className="text-xs font-semibold text-purple-700 hover:text-purple-900 cursor-pointer underline flex items-center gap-1 touch-target min-h-[44px]"
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear filters</span>
              </button>
            </div>
          )}
        </div>

        {/* Survey Lists Section */}
        <section className="space-y-4">
          {filteredItems.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 text-center space-y-1.5 bg-white">
              <p className="text-xs font-semibold text-slate-800">
                {searchQuery || fromDate || toDate
                  ? 'No surveys match your search or date filter'
                  : activeTab === 'outbox'
                  ? 'All records have been sent to the server. No pending items in outbox.'
                  : activeTab === 'synced'
                  ? 'No confirmed server records found.'
                  : 'No submitted surveys yet'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                {searchQuery || fromDate || toDate
                  ? 'Try clearing or changing your search criteria.'
                  : 'When you complete a survey, it will appear here so you can verify that it has been safely sent for reporting.'}
              </p>
            </div>
          ) : activeTab === 'all' ? (
            /* When 'all' is selected: visually separate outbox from submitted */
            <div className="space-y-6">
              {/* Outbox Section (if any items match filter) */}
              {filteredItems.some((i) => i.isOutbox) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                        On this device / Waiting to send ({filteredItems.filter((i) => i.isOutbox).length})
                      </h3>
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    </div>
                    <span className="text-[11px] text-slate-500">Local outbox</span>
                  </div>
                  <div className="space-y-3">
                    {filteredItems.filter((i) => i.isOutbox).map(renderItemCard)}
                  </div>
                </div>
              )}

              {/* Confirmed Submissions Section (if any items match filter) */}
              {filteredItems.some((i) => !i.isOutbox) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Submitted records ({filteredItems.filter((i) => !i.isOutbox).length})
                    </h3>
                    <span className="text-[11px] text-emerald-700 font-medium">Confirmed on server</span>
                  </div>
                  <div className="space-y-3">
                    {filteredItems.filter((i) => !i.isOutbox).map(renderItemCard)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map(renderItemCard)}
            </div>
          )}
        </section>
      </div>

      {viewingItem && (
        <SubmissionViewModal
          item={viewingItem}
          onClose={() => setViewingItem(null)}
          onEdit={() => {
            const item = viewingItem;
            setViewingItem(null);
            handleEditSubmission(item);
          }}
        />
      )}
    </AppShell>
  );
}

export default function SyncCentrePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-xs text-slate-500 font-medium">Loading sync centre...</div>
        </div>
      }
    >
      <SyncCentreContent />
    </Suspense>
  );
}
