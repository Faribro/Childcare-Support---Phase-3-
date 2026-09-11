'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { SubmissionViewModal } from '@/components/sync/SubmissionViewModal';
import { getAllQueueItems, migrateLegacyQueueItems } from '@/lib/db/syncQueueRepository';
import { clearAllLocalData } from '@/lib/db/dexieDb';
import { useSupervisorData } from '@/hooks/useSupervisorData';
import { processQueue, isWorkerRunning } from '@/features/submission/submissionWorker';
import { migrateLegacyItems } from '@/features/submission/submissionQueueRepository';
import { submissionEvents } from '@/features/submission/submissionEvents';
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
  Trash2,
} from 'lucide-react';

export interface UnifiedAssessmentItem {
  id: string;
  submissionId: string;
  localId: string;
  /** IndexedDB numeric key for the SyncQueueItem — undefined for server-only records */
  queueId?: number;
  childName: string;
  caregiverName: string;
  caregiverPhone?: string;
  district?: string;
  state?: string;
  revisionNumber: number;
  status: 'synced' | 'ready_to_sync' | 'syncing' | 'failed_retryable' | 'failed_final' | 'conflict' | 'needs_review';
  chipStatus: 'Waiting to send' | 'Waiting to retry' | 'Local' | 'Retrying' | 'Sending' | 'Submitted' | 'Needs correction' | 'Conflict';
  serverStatus: 'accepted' | 'syncing' | 'waiting' | 'error';
  sheetsStatus: 'exported' | 'exporting' | 'waiting' | 'failed';
  createdAt: string;
  lastEditedAt?: string;
  editReason?: string;
  sheetRow?: number | string;
  lastError?: string;
  retryCount?: number;
  validationIssuePaths?: string[];
  rawRecord: any;
  isOutbox: boolean;
}

function StatusChip({ chipStatus }: { chipStatus: UnifiedAssessmentItem['chipStatus'] }) {
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
    case 'Waiting to retry':
    case 'Retrying':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-300">
          <RefreshCw className="w-2.5 h-2.5" />
          Waiting to retry
        </span>
      );
    case 'Conflict':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-300">
          <AlertTriangle className="w-2.5 h-2.5" />
          Conflict
        </span>
      );
    case 'Needs correction':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-300">
          <AlertCircle className="w-2.5 h-2.5" />
          Needs correction
        </span>
      );
    case 'Waiting to send':
    case 'Local':
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
          <Clock className="w-2.5 h-2.5" />
          Waiting to send
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
            <h4 className="text-sm font-bold text-rose-950">Assessment saved locally. Needs correction before sending.</h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
              Needs correction
            </span>
          </div>
          <p className="text-xs text-rose-800 mt-1">
            Reference: <strong className="font-mono font-bold text-rose-950">{submittedRef || 'Local'}</strong>. One item needs correction before it can be submitted. Your assessment is safe on this device.
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<UnifiedAssessmentItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    records: serverSubmissions,
    status: serverStatus,
    error: serverError,
    refresh: refreshServer,
    retry: retryServer,
    isLoading: isServerLoading,
  } = useSupervisorData();

  // Tab State: 'all' | 'outbox' | 'synced'
  const [activeTab, setActiveTab] = useState<'all' | 'outbox' | 'synced'>('all');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadLocalData = useCallback(async () => {
    try {
      await migrateLegacyItems();
      await migrateLegacyQueueItems();
      const q = await getAllQueueItems();
      setQueueItems(q || []);
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOnline(online);
    } catch (err) {
      console.error('[SyncCentre] Error loading local queue:', err);
    }
  }, []);

  useEffect(() => {
    loadLocalData().then(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        processQueue('sync_page_mount')
          .then(() => loadLocalData())
          .catch(() => {});
      }
    });

    const handleOnline = () => {
      setIsOnline(true);
      loadLocalData().then(() => {
        processQueue('online_event')
          .then(() => loadLocalData())
          .catch(() => {});
      });
    };
    const handleOffline = () => setIsOnline(false);

    const handleSyncUpdate = () => {
      loadLocalData();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubSuccess = submissionEvents.on('submission:success', handleSyncUpdate);
    const unsubFailed = submissionEvents.on('submission:failed', handleSyncUpdate);
    const unsubRetrying = submissionEvents.on('submission:retrying', handleSyncUpdate);
    const unsubConflict = submissionEvents.on('submission:conflict', handleSyncUpdate);
    const unsubSending = submissionEvents.on('submission:sending', handleSyncUpdate);

    window.addEventListener('child_nutrition:sync_completed', handleSyncUpdate);
    window.addEventListener('child_nutrition:record_synced', handleSyncUpdate);
    window.addEventListener('child_nutrition:record_queued', handleSyncUpdate);

    // Periodic autosync check every 30 seconds
    const periodicTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        processQueue('periodic_autosync')
          .then(() => loadLocalData())
          .catch(() => {});
      }
    }, 30000);

    return () => {
      clearInterval(periodicTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubSuccess();
      unsubFailed();
      unsubRetrying();
      unsubConflict();
      unsubSending();
      window.removeEventListener('child_nutrition:sync_completed', handleSyncUpdate);
      window.removeEventListener('child_nutrition:record_synced', handleSyncUpdate);
      window.removeEventListener('child_nutrition:record_queued', handleSyncUpdate);
    };
  }, [loadLocalData]);

  const [retryingItemId, setRetryingItemId] = useState<number | null>(null);
  const [noEligibleWarning, setNoEligibleWarning] = useState<string | null>(null);

  /**
   * Optional secondary "Try again now" action for eligible retryable records.
   */
  const handleRetryAll = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await processQueue('manual_retry');
      await loadLocalData();
      await refreshServer();
    } catch (err) {
      console.error('[SubmissionStatus] Error during retry:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Per-item secondary "Try again now" for a single eligible failed_retryable record.
   * MUST NOT be called for terminal items (failed_final, conflict, needs_review).
   */
  const handleRetryItem = async (item: UnifiedAssessmentItem) => {
    if (!item.queueId) return;
    if (item.status !== 'failed_retryable') return;
    if (retryingItemId === item.queueId) return; // already in flight

    setRetryingItemId(item.queueId);
    try {
      await processQueue('manual_retry');
      await loadLocalData();
      await refreshServer();
    } catch (err) {
      console.error('[SubmissionStatus] handleRetryItem threw unexpectedly:', err);
    } finally {
      setRetryingItemId(null);
    }
  };

  const handleClearLocalDeviceData = async () => {
    if (
      typeof window !== 'undefined' &&
      window.confirm(
        'Are you sure you want to clear all local device drafts, pending queue items, and cached linelist records on this device?'
      )
    ) {
      await clearAllLocalData();
      await loadLocalData();
      await refreshServer();
    }
  };

  const handleEditSubmission = (item: UnifiedAssessmentItem) => {
    const isInterviewerNameIssue =
      item.validationIssuePaths?.includes('interviewerName') ||
      Boolean(item.lastError?.includes('interviewerName'));
    const targetUrl = `/assessment/record/${encodeURIComponent(item.id)}/edit${isInterviewerNameIssue ? '?focus=interviewerName' : ''}`;
    router.push(targetUrl);
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

      const rawStatus = String(qItem.status || '').toLowerCase();
      const code = Number(qItem.statusCode || qItem.lastErrorCode || 0);
      const isTerminalHalted = qItem.nextRetryTimestamp === null;
      const isUnauthorized = code === 401 || code === 403 || qItem.errorCategory === 'unauthorized';
      const isTerminal4xx = code >= 400 && code < 500 && code !== 408 && code !== 429 && code !== 401 && code !== 403;
      const isConflict = rawStatus === 'conflict' || code === 409 || qItem.errorMessage?.toLowerCase().includes('conflict');
      const isNeedsReview = rawStatus === 'needs_review';
      const isSignatureMigrationError = qItem.errorCategory === 'signature_migration_failed';

      if (rawStatus === 'synced') {
        status = 'synced';
        chipStatus = 'Submitted';
        serverStatus = 'accepted';
        sheetsStatus = 'exported';
        isOutbox = false;
      } else if (rawStatus === 'syncing') {
        const isActivelySyncing =
          isWorkerRunning() &&
          Boolean(qItem.lastAttempt && Date.now() - new Date(qItem.lastAttempt).getTime() < 15000);

        if (isActivelySyncing || isSyncing) {
          status = 'syncing';
          chipStatus = 'Sending';
          serverStatus = 'syncing';
          sheetsStatus = 'exporting';
        } else {
          status = 'ready_to_sync';
          chipStatus = 'Waiting to send';
          serverStatus = 'waiting';
          sheetsStatus = 'waiting';
        }
      } else if (isConflict) {
        status = 'conflict';
        chipStatus = 'Conflict';
        serverStatus = 'error';
        sheetsStatus = 'failed';
      } else if (isNeedsReview) {
        status = 'needs_review';
        chipStatus = 'Needs correction';
        serverStatus = 'error';
        sheetsStatus = 'failed';
      } else if (isUnauthorized || isSignatureMigrationError) {
        status = 'failed_retryable';
        chipStatus = 'Waiting to retry';
        serverStatus = 'waiting';
        sheetsStatus = 'waiting';
      } else if (rawStatus === 'failed_final' || (rawStatus === 'failed' && (isTerminal4xx || isTerminalHalted))) {
        status = 'failed_final';
        chipStatus = 'Needs correction';
        serverStatus = 'error';
        sheetsStatus = 'failed';
      } else if (rawStatus === 'failed_retryable' || rawStatus === 'failed') {
        status = 'failed_retryable';
        chipStatus = 'Waiting to retry';
        serverStatus = 'waiting';
        sheetsStatus = 'waiting';
      } else {
        // 'queued', 'draft', 'finalized_local' or newly created
        status = 'ready_to_sync';
        chipStatus = 'Waiting to send';
        serverStatus = 'waiting';
        sheetsStatus = 'waiting';
      }

      if (map.has(id)) {
        const existing = map.get(id)!;
        if (qItem.status !== 'synced' || revisionNumber >= existing.revisionNumber) {
          map.set(id, {
            ...existing,
            queueId: qItem.id,
            revisionNumber: Math.max(revisionNumber, existing.revisionNumber),
            status,
            chipStatus,
            serverStatus,
            sheetsStatus,
            lastEditedAt: lastEditedAt || existing.lastEditedAt,
            editReason: editReason || existing.editReason,
            lastError: qItem.errorMessage || undefined,
            retryCount: qItem.retryCount,
            validationIssuePaths: qItem.validationIssuePaths,
            rawRecord: payload,
            isOutbox,
          });
        }
      } else {
        map.set(id, {
          id,
          submissionId,
          localId: String(qItem.id || submissionId),
          queueId: qItem.id,
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
          validationIssuePaths: qItem.validationIssuePaths,
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
  }, [serverSubmissions, queueItems, isSyncing]);

  const outboxItems = useMemo(() => {
    return unifiedItems.filter((i) => i.isOutbox);
  }, [unifiedItems]);

  const syncedItems = useMemo(() => {
    return unifiedItems.filter((i) => !i.isOutbox);
  }, [unifiedItems]);

  /**
   * Items that CAN be dispatched: queued (first attempt) + retryable failures.
   * These are the only items the "Send" button should count and act on.
   */
  const actionableItems = useMemo(() => {
    return outboxItems.filter((i) => i.status === 'ready_to_sync' || i.status === 'failed_retryable');
  }, [outboxItems]);

  /**
   * Items that need human review — terminal failures and conflicts.
   * These are NOT "waiting to synchronize"; the button must NOT dispatch for them.
   */
  const attentionItems = useMemo(() => {
    return outboxItems.filter((i) => i.status === 'failed_final' || i.status === 'conflict' || i.status === 'needs_review');
  }, [outboxItems]);

  const retryableItems = useMemo(() => {
    return outboxItems.filter((i) => i.status === 'failed_retryable');
  }, [outboxItems]);

  /** Actionable count — used for banner text. Never includes terminal items. */
  const actionableCount = actionableItems.length;
  /** Retryable count — eligible for secondary "Try again now" */
  const retryableCount = retryableItems.length;
  /** Attention count — records that require user correction. */
  const attentionCount = attentionItems.length;
  /** Legacy alias: pendingCount now tracks ONLY actionable items. */
  const pendingCount = actionableCount;
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
                    Saved on this device
                  </span>
                )}
                {item.status === 'failed_retryable' && item.lastError && (
                  <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1 font-medium">
                    {item.lastError}
                  </p>
                )}
                {(item.status === 'failed_final' || item.status === 'needs_review' || item.status === 'conflict') && (
                  <p className="text-xs text-rose-800 bg-rose-50/80 border border-rose-200 rounded-lg px-2.5 py-1.5 mt-1 font-medium">
                    {item.validationIssuePaths?.includes('interviewerName') || item.lastError?.includes('interviewerName')
                      ? 'Please enter your name using at least 2 characters.'
                      : (item.lastError || 'Validation error. Please correct this assessment.')}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons: View, Edit, per-status action, History */}
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t border-slate-100 sm:border-t-0 justify-end flex-wrap">
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

              {/* Per-status semantic action button */}
              {item.status === 'ready_to_sync' && (
                <span className="text-[11px] text-slate-500 font-medium self-center px-2">
                  Sending automatically
                </span>
              )}

              {item.status === 'syncing' && (
                <button
                  type="button"
                  disabled
                  aria-label="Sending your assessment"
                  className="touch-target-44 min-h-[44px] text-xs px-3.5 font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-xl flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-not-allowed opacity-75"
                >
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Sending…
                </button>
              )}

              {item.status === 'failed_retryable' && item.queueId && (
                <button
                  type="button"
                  onClick={() => handleRetryItem(item)}
                  disabled={retryingItemId === item.queueId || isSyncing || !isOnline}
                  aria-label="Try sending this record again"
                  aria-live="polite"
                  className={`touch-target-44 min-h-[44px] text-xs px-3.5 font-bold border rounded-xl transition-colors flex items-center justify-center gap-1.5 flex-1 sm:flex-initial ${
                    retryingItemId === item.queueId
                      ? 'bg-orange-100 border-orange-200 text-orange-800 cursor-wait'
                      : 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-800 cursor-pointer'
                  }`}
                >
                  {retryingItemId === item.queueId ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      Try again now
                    </>
                  )}
                </button>
              )}

              {(item.status === 'failed_final' || item.status === 'needs_review' || item.status === 'conflict') && (() => {
                const isInterviewerNameIssue =
                  item.validationIssuePaths?.includes('interviewerName') ||
                  Boolean(item.lastError?.includes('interviewerName'));
                return (
                  <button
                    type="button"
                    onClick={() => handleEditSubmission(item)}
                    aria-label={isInterviewerNameIssue ? 'Edit assessment' : 'Open and correct this record'}
                    className="touch-target-44 min-h-[44px] text-xs px-3.5 font-bold bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                  >
                    <AlertCircle className="w-3 h-3" />
                    {isInterviewerNameIssue ? 'Edit assessment' : 'Open and correct'}
                  </button>
                );
              })()}

              {item.status === 'failed_retryable' && Boolean(item.lastError?.toLowerCase().includes('session expired') || item.lastError?.toLowerCase().includes('sign in again')) && (
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  aria-label="Sign in again to resume synchronization"
                  className="touch-target-44 min-h-[44px] text-xs px-3.5 font-bold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                >
                  Sign in again
                </button>
              )}

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
                <span>Storage: {item.isOutbox ? 'Saved on this device' : 'Central register'}</span>
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
          {/* Explicit visible reason when send attempted without eligible items */}
          {noEligibleWarning && (
            <div role="alert" className="flex items-center justify-between gap-2.5 p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <p className="text-xs font-semibold">{noEligibleWarning}</p>
              </div>
              <button
                type="button"
                onClick={() => setNoEligibleWarning(null)}
                aria-label="Dismiss warning"
                className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Waiting/Retry Banner */}
          {actionableCount > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <div>
                  <p className="text-xs font-bold text-amber-950">
                    {actionableCount} assessment{actionableCount === 1 ? '' : 's'} saved on this device
                  </p>
                  <p className="text-[11px] text-amber-800">
                    {isOnline
                      ? 'Sending your assessment… Submissions send automatically when online.'
                      : 'Saved on this device. It will send automatically when you reconnect.'}
                  </p>
                </div>
              </div>

              {retryableCount > 0 && isOnline && (
                <Button
                  variant="secondary"
                  onClick={handleRetryAll}
                  disabled={isSyncing}
                  aria-live="polite"
                  className="font-bold px-4 py-2 text-xs shadow-xs flex-shrink-0 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 cursor-pointer touch-target min-h-[44px]"
                >
                  {isSyncing ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Sending…
                    </span>
                  ) : (
                    'Try again now'
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Correction Required Banner */}
          {attentionCount > 0 && (
            <div className="flex items-center gap-2.5 p-3.5 bg-rose-50/80 border border-rose-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-rose-900">
                  {attentionCount === 1
                    ? 'One item needs correction before it can be submitted.'
                    : `${attentionCount} items need correction before they can be submitted.`}
                </p>
                <p className="text-[11px] text-rose-700">
                  Select &quot;Open and correct&quot; on any affected record below.
                </p>
              </div>
            </div>
          )}

          {/* Tab Navigation: All Records | On Device | Submitted Records */}
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
              <span>On Device</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold border ${
                outboxItems.length > 0 ? 'bg-amber-200 text-amber-900 border-amber-300' : 'bg-white/80 border-slate-200'
              }`}>
                {outboxItems.length}
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
                  ? 'All records have been sent to the server. No pending items on this device.'
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
            /* When 'all' is selected: visually separate pending device items from submitted */
            <div className="space-y-6">
              {/* Pending device items section */}
              {filteredItems.some((i) => i.isOutbox) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                        Saved on this device ({filteredItems.filter((i) => i.isOutbox).length})
                      </h3>
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    </div>
                    <span className="text-[11px] text-slate-500">Saved on this device</span>
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
