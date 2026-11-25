'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { SubmissionViewModal } from '@/components/sync/SubmissionViewModal';
import { getAllQueueItems, migrateLegacyQueueItems } from '@/lib/db/syncQueueRepository';
import { getAllDrafts, deleteDraft } from '@/lib/db/draftRepository';
import { DraftCard } from '@/components/forms/DraftCard';
import { clearAllLocalData } from '@/lib/db/dexieDb';
import { useSupervisorData } from '@/hooks/useSupervisorData';
import { processQueue, isWorkerRunning } from '@/features/submission/submissionWorker';
import { migrateLegacyItems } from '@/features/submission/submissionQueueRepository';
import { submissionEvents } from '@/features/submission/submissionEvents';
import type { SyncQueueItem, AssessmentRecord } from '@/types/domain';
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
  ArrowLeft,
  Landmark,
} from 'lucide-react';
import { deriveSubmissionStages, maskBankAccountNumber } from '@/lib/shared/submissionStages';
import { BankDetailsEntryModal } from '@/components/sync/BankDetailsEntryModal';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

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
  chipStatus:
    | 'Waiting to send'
    | 'Validation blocked'
    | 'Server validation rejection'
    | 'Network failure'
    | 'Draft'
    | 'Saved on this device'
    | 'Waiting to retry'
    | 'Local'
    | 'Retrying'
    | 'Sending'
    | 'Checking submission status'
    | 'Submitted'
    | 'Submitted — documents processing'
    | 'Submitted — document upload needs retry'
    | 'Needs correction'
    | 'Conflict'
    | 'Sign in again';
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
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Submitted
        </span>
      );
    case 'Submitted — documents processing':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">
          <Clock className="w-3 h-3 text-teal-600" />
          Submitted — documents processing
        </span>
      );
    case 'Submitted — document upload needs retry':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 shadow-2xs">
          <RefreshCw className="w-3 h-3 text-orange-600" />
          Submitted — document upload needs retry
        </span>
      );
    case 'Sending':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
          Sending…
        </span>
      );
    case 'Checking submission status':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
          Checking submission status
        </span>
      );
    case 'Sign in again':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200 shadow-2xs">
          <AlertCircle className="w-3 h-3 text-yellow-600" />
          Sign in again
        </span>
      );
    case 'Waiting to retry':
    case 'Retrying':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 shadow-2xs">
          <RefreshCw className="w-3 h-3 text-orange-600" />
          Waiting to retry
        </span>
      );
    case 'Conflict':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 shadow-2xs">
          <AlertTriangle className="w-3 h-3 text-purple-600" />
          Conflict
        </span>
      );
    case 'Needs correction':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          Needs correction
        </span>
      );
    case 'Validation blocked':
    case 'Server validation rejection':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          {chipStatus}
        </span>
      );
    case 'Network failure':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 shadow-2xs">
          <RefreshCw className="w-3 h-3 text-orange-600" />
          Network failure — retrying
        </span>
      );
    case 'Waiting to send':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
          <Clock className="w-3 h-3 text-amber-600" />
          Waiting to send
        </span>
      );
    case 'Draft':
    case 'Saved on this device':
    case 'Local':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
          <Clock className="w-3 h-3 text-slate-500" />
          {chipStatus}
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

  if (effectiveStatus === 'local_saved' || effectiveStatus === 'waiting_to_sync') {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-amber-950">Saved on this device</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                Waiting to sync
              </span>
            </div>
            <p className="text-xs text-amber-800 mt-1">
              Reference: <strong className="font-mono font-bold text-amber-950">{submittedRef || 'Local'}</strong>. Your changes are safely preserved in local storage and queued to synchronize with the central server.
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

  if (effectiveStatus === 'synced') {
    return (
      <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-emerald-950">Assessment saved &amp; synced to Google Sheets</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                Synced
              </span>
            </div>
            <p className="text-xs text-emerald-800 mt-1">
              Reference: <strong className="font-mono font-bold text-emerald-950">{submittedRef || 'Recorded'}</strong>. Central sheet and Revisions log have confirmed receipt of this update.
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

  if (effectiveStatus === 'sheet_pending' || effectiveStatus === 'saved_to_server') {
    return (
      <div className="bg-sky-50 border border-sky-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-sky-100 border border-sky-300 flex items-center justify-center text-sky-700 shrink-0 mt-0.5">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-sky-950">Saved to central server</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300">
                Sheet Mirror Pending
              </span>
            </div>
            <p className="text-xs text-sky-800 mt-1">
              Reference: <strong className="font-mono font-bold text-sky-950">{submittedRef || 'Recorded'}</strong>. Your revision is safely committed to the central database. Replication to Google Sheets and document mirrors is queued.
            </p>
            {submittedRef && (
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/submissions/${encodeURIComponent(submittedRef)}/sync-retry`, { method: 'POST' });
                      const d = await res.json();
                      if (d.status === 'success') {
                        alert('Sync to Google Sheets completed successfully!');
                        window.location.href = `/assessment/sync?status=synced&ref=${encodeURIComponent(submittedRef)}&submitted=true`;
                      } else {
                        alert('Sync pending or retry failed: ' + (d.message || 'Unknown error'));
                      }
                    } catch (e: any) {
                      alert('Retry error: ' + (e.message || 'Network error'));
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Sync Now
                </button>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-sky-700 hover:text-sky-900 p-1 rounded-lg touch-target min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (effectiveStatus === 'sheet_failed') {
    return (
      <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-700 shrink-0 mt-0.5">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-rose-950">Saved. Sheet sync failed, retry available</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                Sync Failed
              </span>
            </div>
            <p className="text-xs text-rose-800 mt-1">
              Reference: <strong className="font-mono font-bold text-rose-950">{submittedRef || 'Recorded'}</strong>. The database has your changes, but the Google Sheets mirror encountered an error.
            </p>
            {submittedRef && (
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/submissions/${encodeURIComponent(submittedRef)}/sync-retry`, { method: 'POST' });
                      const d = await res.json();
                      if (d.status === 'success') {
                        alert('Sync to Google Sheets succeeded!');
                        window.location.href = `/assessment/sync?status=synced&ref=${encodeURIComponent(submittedRef)}&submitted=true`;
                      } else {
                        alert('Retry failed: ' + (d.message || 'Error'));
                      }
                    } catch (e: any) {
                      alert('Retry error: ' + (e.message || 'Network error'));
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Sync Now
                </button>
              </div>
            )}
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
  const [isOnline, setIsOnline] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<UnifiedAssessmentItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    records: serverSubmissions,
    status: serverStatus,
    error: serverError,
    total: serverTotal,
    refresh: refreshServer,
    retry: retryServer,
    isLoading: isServerLoading,
  } = useSupervisorData();

  const { user, isUnlocked } = useEvaluationAccess();
  const tabParam = searchParams.get('tab');

  // Strict role-aware workspace routing: Evaluation users belong in /supervisor/assessments
  useEffect(() => {
    if (isUnlocked && user && user.isVerified) {
      const isEval = user.role === 'LEADERSHIP' || user.role === 'STATE_REVIEWER' || user.role === 'ADMIN';
      if (isEval) {
        if (tabParam === 'bank_pending' || tabParam === 'bank-pending') {
          router.replace('/supervisor/assessments?worklist=bank_pending');
        } else if (tabParam === 'docs' || tabParam === 'missing_docs') {
          router.replace('/supervisor/assessments?worklist=intake_pending');
        } else {
          router.replace('/supervisor/assessments');
        }
      }
    }
  }, [isUnlocked, user, tabParam, router]);

  const canEnterBankDetails = Boolean(
    isUnlocked &&
    (user?.role === 'ADMIN' || user?.role === 'LEADERSHIP')
  );

  const [bankTargetItem, setBankTargetItem] = useState<UnifiedAssessmentItem | null>(null);
  const [bankSuccessToast, setBankSuccessToast] = useState<string | null>(null);

  // Tab State: 'all' | 'drafts' | 'outbox' | 'synced' | 'bank_pending'
  const initialTab: 'all' | 'drafts' | 'outbox' | 'synced' | 'bank_pending' =
    tabParam === 'drafts'
      ? 'drafts'
      : tabParam === 'outbox'
      ? 'outbox'
      : tabParam === 'bank_pending' || tabParam === 'bank-pending'
      ? 'bank_pending'
      : tabParam === 'synced' || tabParam === 'submitted'
      ? 'synced'
      : 'all';

  const [activeTab, setActiveTab] = useState<'all' | 'drafts' | 'outbox' | 'synced' | 'bank_pending'>(initialTab);
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);

  useEffect(() => {
    if (tabParam === 'drafts') {
      setActiveTab('drafts');
    } else if (tabParam === 'outbox') {
      setActiveTab('outbox');
    } else if (tabParam === 'bank_pending' || tabParam === 'bank-pending') {
      setActiveTab('bank_pending');
    } else if (tabParam === 'synced' || tabParam === 'submitted') {
      setActiveTab('synced');
    } else if (tabParam === 'all') {
      setActiveTab('all');
    }
  }, [tabParam]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadLocalData = useCallback(async () => {
    try {
      await migrateLegacyItems();
      await migrateLegacyQueueItems();
      const [q, d] = await Promise.all([getAllQueueItems(), getAllDrafts()]);

      // Scope outbox queue items and drafts to the currently signed-in field worker account
      let currentWorkerName: string | null = null;
      let currentWorkerId: string | null = null;
      if (typeof window !== 'undefined') {
        try {
          const rawProfile = localStorage.getItem('field_user_profile');
          if (rawProfile) {
            const parsed = JSON.parse(rawProfile);
            currentWorkerName = parsed.name?.trim().toLowerCase() || null;
            currentWorkerId = parsed.workerId?.trim().toLowerCase() || null;
          }
        } catch (_) {}
      }

      const isScopedToWorker = (item: any) => {
        if (!currentWorkerName && !currentWorkerId) return true; // No profile active
        const payload = item.payload || item;
        const submittedBy = (payload.submittedBy || payload['4\nSubmitted By'] || payload.interviewerName || payload.demographics?.interviewerName || '')
          .trim()
          .toLowerCase();
        const userId = (payload.userId || '').trim().toLowerCase();
        if (!submittedBy && !userId) return true; // Legacy/unassigned draft on device
        return (
          (currentWorkerName && submittedBy === currentWorkerName) ||
          (currentWorkerId && (submittedBy === currentWorkerId || userId === currentWorkerId))
        );
      };

      setQueueItems((q || []).filter(isScopedToWorker));
      setDrafts((d || []).filter(isScopedToWorker));
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOnline(online);
    } catch (err) {
      console.error('[SyncCentre] Error loading local queue:', err);
    }
  }, []);

  const handleDeleteDraft = async (id: number) => {
    await deleteDraft(id);
    await loadLocalData();
  };

  const handleResumeDraft = (id: string | number) => {
    router.push(`/assessment/draft/${id}`);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let isAuthed = false;
      try {
        const rawProfile = localStorage.getItem('field_user_profile');
        if (rawProfile) {
          const parsed = JSON.parse(rawProfile);
          if (
            parsed &&
            (parsed.id ||
              parsed.googleEmail ||
              parsed.email ||
              (parsed.name && parsed.name !== 'Field Caseworker' && parsed.assignedState))
          ) {
            isAuthed = true;
          }
        }
      } catch (_) {}
      if (!isAuthed && !user?.isVerified) {
        router.replace('/app?onboarding=open&mode=signin');
        return;
      }
    }

    loadLocalData().then(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        processQueue('sync_page_mount')
          .then(() => {
            loadLocalData();
            refreshServer();
          })
          .catch(() => {});
      }
    });

    const handleOnline = () => {
      setIsOnline(true);
      loadLocalData().then(() => {
        processQueue('online_event')
          .then(() => {
            loadLocalData();
            refreshServer();
          })
          .catch(() => {});
      });
    };
    const handleOffline = () => setIsOnline(false);

    const handleSyncUpdate = () => {
      loadLocalData();
    };

    const handleServerSyncComplete = () => {
      loadLocalData();
      refreshServer();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubSuccess = submissionEvents.on('submission:success', handleServerSyncComplete);
    const unsubFailed = submissionEvents.on('submission:failed', handleSyncUpdate);
    const unsubRetrying = submissionEvents.on('submission:retrying', handleSyncUpdate);
    const unsubConflict = submissionEvents.on('submission:conflict', handleSyncUpdate);
    const unsubSending = submissionEvents.on('submission:sending', handleSyncUpdate);

    window.addEventListener('child_nutrition:sync_completed', handleServerSyncComplete);
    window.addEventListener('child_nutrition:record_synced', handleServerSyncComplete);
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
      window.removeEventListener('child_nutrition:sync_completed', handleServerSyncComplete);
      window.removeEventListener('child_nutrition:record_synced', handleServerSyncComplete);
      window.removeEventListener('child_nutrition:record_queued', handleSyncUpdate);
    };
  }, [loadLocalData, refreshServer]);

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
      const raw = r.rawRecord || r;
      const id =
        raw['1\nUnique ID'] ||
        raw.uniqueId ||
        raw.art_number ||
        raw.artNumber ||
        r.id ||
        r.artNumber ||
        raw.client_submission_id ||
        raw._uuid ||
        `BENEFICIARY-${idx + 1}`;

      const submissionId =
        r.remoteSubmissionId ||
        raw._uuid ||
        raw.remote_submission_id ||
        raw.client_submission_id ||
        id;
      const childName = raw['9\nChild Name'] || raw.child_name || r.childName || 'Child Beneficiary';
      const caregiverName =
        raw['14\nCaregiver Full Name'] ||
        raw.caregiver_name ||
        r.caregiverName ||
        'Caregiver';
      const caregiverPhone =
        raw['16\nCaregiver Contact'] ||
        raw.caregiver_phone ||
        r.caregiverPhone;
      const district = raw['19\nDistrict'] || raw.district || r.district || '';
      const state = raw['18\nState'] || raw.state || r.state || '';
      const revisionNumber = Number(raw['2\nRevision Number'] || raw.revision || r.version || 1);
      const createdAt =
        r.createdAt ||
        raw['3\nSubmission Time'] ||
        raw.submissionTime ||
        raw.created_at ||
        raw.updated_at ||
        r.lastVisit ||
        new Date().toISOString();
      const lastEditedAt =
        r.updatedAt ||
        raw.lastEditedAt ||
        raw.updated_at ||
        (revisionNumber > 1 ? createdAt : undefined);
      const editReason =
        r.editReason ||
        raw['4\nEdit Reason'] ||
        raw['48\nEdit Reason'] ||
        raw.editReason ||
        raw.edit_reason;
      const sheetRow = r.sheetRow || raw.sheetRow || raw.rowNumber || idx + 2;

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
        rawRecord: raw,
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
      const isTimeoutUnknown = qItem.errorCategory === 'timeout_unknown_outcome' || (qItem.errorCategory === 'timeout' && !payload?.remoteSubmissionId);

      if (rawStatus === 'synced') {
        status = 'synced';
        if ((payload as any)?.assetStatus === 'PENDING') {
          chipStatus = 'Submitted — documents processing';
        } else if ((payload as any)?.assetStatus === 'FAILED_RETRYABLE') {
          chipStatus = 'Submitted — document upload needs retry';
        } else {
          chipStatus = 'Submitted';
        }
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
          chipStatus = 'Saved on this device';
          serverStatus = 'waiting';
          sheetsStatus = 'waiting';
        }
      } else if (isTimeoutUnknown) {
        status = 'failed_retryable';
        chipStatus = 'Checking submission status';
        serverStatus = 'waiting';
        sheetsStatus = 'waiting';
      } else if (isUnauthorized) {
        status = 'failed_retryable';
        chipStatus = 'Sign in again';
        serverStatus = 'waiting';
        sheetsStatus = 'waiting';
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
      } else if (isSignatureMigrationError) {
        status = 'failed_retryable';
        chipStatus = 'Waiting to retry';
        serverStatus = 'waiting';
        sheetsStatus = 'waiting';
      } else if (rawStatus === 'failed_final' || (rawStatus === 'failed' && (isTerminal4xx || isTerminalHalted))) {
        status = 'failed_final';
        if (qItem.errorCategory === 'validation' || isTerminal4xx) {
          chipStatus = qItem.lastErrorCode === 422 ? 'Server validation rejection' : 'Validation blocked';
        } else {
          chipStatus = 'Needs correction';
        }
        serverStatus = 'error';
        sheetsStatus = 'failed';
      } else if (rawStatus === 'failed_retryable' || rawStatus === 'failed') {
        status = 'failed_retryable';
        chipStatus = qItem.errorCategory === 'network' || qItem.errorCategory === 'upstream_unavailable' ? 'Network failure' : 'Waiting to retry';
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
  const submittedCount = Math.max(syncedItems.length, serverTotal ?? 0);

  const bankPendingItems = useMemo(() => {
    const list = syncedItems.filter((item) => {
      const stages = deriveSubmissionStages(item.rawRecord || item);
      return stages.approvalState === 'approved' && stages.bankWorkflow === 'pending';
    });

    return [...list].sort((a, b) => {
      const getApprovalTime = (x: UnifiedAssessmentItem) => {
        const raw = x.rawRecord || {};
        const t = raw.approvalDate || raw.approvedAt || raw['68\nDate of Approval'] || x.createdAt;
        const ms = new Date(t).getTime();
        return isNaN(ms) ? 0 : ms;
      };
      const tA = getApprovalTime(a);
      const tB = getApprovalTime(b);
      if (tA !== tB) return tA - tB; // oldest approval timestamp first
      return String(a.id).localeCompare(String(b.id)); // stable record ID
    });
  }, [syncedItems]);

  // Filter with Tab + Search Query + From/To Date
  const filteredItems = useMemo(() => {
    const list =
      activeTab === 'outbox'
        ? outboxItems
        : activeTab === 'synced'
        ? syncedItems
        : activeTab === 'bank_pending'
        ? bankPendingItems
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
  }, [unifiedItems, outboxItems, syncedItems, bankPendingItems, activeTab, searchQuery, fromDate, toDate]);

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    router.replace('/assessment/sync', { scroll: false });
  };

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch (_) {}
    }
  };

  const renderItemCard = (item: UnifiedAssessmentItem) => {
    const isExpanded = expandedId === item.localId;
    const revisionCount = item.revisionNumber || 1;
    const isAmended = revisionCount > 1;
    const stages = deriveSubmissionStages(item.rawRecord || item);
    const isBankPending = stages.approvalState === 'approved' && stages.bankWorkflow === 'pending';

    return (
      <div
        key={item.localId}
        className={`flex bg-white rounded-2xl border transition-all duration-150 shadow-[0_2px_12px_rgba(37,99,235,0.05)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.08)] overflow-hidden ${
          item.isOutbox ? 'border-amber-200 hover:border-amber-300' : 'border-sky-100 hover:border-sky-300'
        }`}
      >
        {/* Left Vertical ID Column (Tablet / Desktop) */}
        <div className="hidden sm:flex w-12 sm:w-14 bg-sky-50/70 border-r border-sky-100 items-center justify-center shrink-0 py-3.5 select-all">
          <div className="flex items-center gap-1.5 [writing-mode:vertical-rl] rotate-180">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-400">
              Id
            </span>
            <span className="text-sky-300">•</span>
            <span className="font-mono font-bold text-[#093282] text-xs tracking-wider">
              {item.id}
            </span>
          </div>
        </div>

        {/* Main Card Content */}
        <div className="p-3 sm:p-5 flex-1 flex flex-col justify-between gap-3 min-w-0">
          <div className="flex flex-col gap-2.5">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="sm:hidden font-mono font-bold text-[#093282] text-[11px] bg-sky-50 px-2.5 py-0.5 rounded-lg border border-sky-200 select-all">
                  {item.id}
                </span>
                <h3 className="font-black text-slate-900 text-sm sm:text-base tracking-tight truncate">
                  {item.childName}
                </h3>
                <span className="text-slate-300 hidden xs:inline">•</span>
                <span className="text-xs text-slate-600">
                  Caregiver: <strong className="text-slate-800 font-semibold">{item.caregiverName}</strong>
                </span>
                {item.district && (
                  <>
                    <span className="text-slate-300 hidden sm:inline">•</span>
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
                <p className="flex items-center gap-1.5 flex-wrap">
                  <Clock className="w-3 h-3 text-slate-400 shrink-0 inline" />
                  <span>
                    Saved on {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}{' '}
                    at {new Date(item.createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                  </span>
                  {item.lastEditedAt && (
                    <span className="text-slate-400">
                      {' '}• Updated {new Date(item.lastEditedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}{' '}
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
                      : item.validationIssuePaths && item.validationIssuePaths.length > 0
                        ? `Required fields need correction: ${item.validationIssuePaths.map((p) => p.split('.').pop()).join(', ')}. Select "Open and correct" below.`
                        : (item.lastError || 'Validation error. Please correct this assessment.')}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons: View, Edit, per-status action, History */}
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto pt-2.5 border-t border-slate-100 justify-end flex-wrap">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setViewingItem(item);
                }}
                className="touch-target-44 min-h-[44px] text-xs px-4 font-bold bg-white hover:bg-sky-50 text-[#093282] border border-sky-200 rounded-xl transition-all active:scale-[0.97] shadow-2xs cursor-pointer flex items-center justify-center flex-1 sm:flex-initial"
              >
                View
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  handleEditSubmission(item);
                }}
                className="touch-target-44 min-h-[44px] text-xs px-4 font-bold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl transition-all active:scale-[0.97] shadow-xs shadow-sky-500/20 cursor-pointer flex items-center justify-center flex-1 sm:flex-initial"
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
                  onClick={() => {
                    triggerHaptic();
                    handleRetryItem(item);
                  }}
                  disabled={retryingItemId === item.queueId || isSyncing || !isOnline}
                  aria-label="Try sending this record again"
                  aria-live="polite"
                  className={`touch-target-44 min-h-[44px] text-xs px-3.5 font-bold border rounded-xl transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 flex-1 sm:flex-initial ${
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
                    onClick={() => {
                      triggerHaptic();
                      handleEditSubmission(item);
                    }}
                    aria-label={isInterviewerNameIssue ? 'Edit assessment' : 'Open and correct this record'}
                    className="touch-target-44 min-h-[44px] text-xs px-3.5 font-bold bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 rounded-xl transition-all active:scale-[0.97] cursor-pointer flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
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
                  className="touch-target-44 min-h-[44px] text-xs px-3.5 font-bold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-xl transition-all active:scale-[0.97] cursor-pointer flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                >
                  Sign in again
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setExpandedId(isExpanded ? null : item.localId);
                }}
                className="touch-target-44 min-h-[44px] text-xs px-3 font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer flex items-center justify-center flex-1 sm:flex-initial"
              >
                {isExpanded ? 'Hide' : 'History'}
              </button>
            </div>
          </div>

          {/* Expandable Technical Details & History Drawer */}
          {isExpanded && (
            <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-100 text-xs space-y-2.5 pt-3">
              <div className="flex items-center justify-between pb-1.5 border-b border-sky-200/60">
                <span className="font-bold text-[#093282] text-[11px] uppercase tracking-wider">
                  Technical details &amp; History
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
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
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-[#093282] font-semibold transition-colors flex-shrink-0 cursor-pointer"
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
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-[11px]">
                  <span className="font-bold block">Reason for Update (Revision {item.revisionNumber}):</span>
                  <span>{item.editReason}</span>
                </div>
              )}

              {item.lastError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px]">
                  <span className="font-bold block">Status Note:</span>
                  <span>{item.lastError}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 pt-1 border-t border-sky-100">
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
      <div
        className="min-h-[calc(100vh-64px)] w-full overflow-x-hidden"
        style={{
          background: 'linear-gradient(180deg, #E8F2FF 0%, #F5F9FF 36%, #FFFFFF 100%)',
        }}
      >
        <div className="w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-12 space-y-4 sm:space-y-5 animate-in fade-in duration-200">
          {/* Desktop Compact Header Banner (Hidden on mobile < 768px for clean top spacing) */}
          <div className="hidden md:flex items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-[#093282] to-[#1E6EEB] text-white shadow-sm">
            <div className="flex items-center gap-3">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-semibold backdrop-blur-md transition-all active:scale-[0.97]"
                aria-label="Return to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
                <span>Back to Dashboard</span>
              </Link>
              <div className="h-5 w-px bg-white/20" />
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                <span>Submitted Surveys &amp; Records</span>
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-white/90">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {isOnline ? 'Online' : 'Offline'}
              </span>
              <span className="px-3 py-1 rounded-full bg-white/15 border border-white/20 font-bold tabular-nums">
                {unifiedItems.length} Total Records
              </span>
            </div>
          </div>

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
          <div className="bg-white rounded-3xl border border-sky-200/80 shadow-[0_4px_24px_rgba(37,99,235,0.06)] p-4 sm:p-6 space-y-4">
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl">
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
              <div className="flex items-center gap-2.5 p-3.5 bg-rose-50/80 border border-rose-200 rounded-2xl">
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

            {/* Tab Navigation: Responsive Segmented Control */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2 sm:border-b sm:border-slate-200/80 sm:pb-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setActiveTab('all');
                }}
                className={`px-3.5 py-2.5 sm:py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer touch-target min-h-[44px] flex items-center justify-between sm:justify-start gap-2 ${
                  activeTab === 'all'
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#155AD1] text-white shadow-md shadow-blue-500/20 font-bold border border-blue-400/40'
                    : 'bg-white hover:bg-sky-50 text-slate-700 hover:text-slate-900 border border-slate-200/90 sm:border-transparent'
                }`}
              >
                <span className="whitespace-nowrap">All Records</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                  activeTab === 'all' ? 'bg-white/25 text-white border border-white/30' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {unifiedItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setActiveTab('outbox');
                }}
                className={`px-3.5 py-2.5 sm:py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer touch-target min-h-[44px] flex items-center justify-between sm:justify-start gap-2 ${
                  activeTab === 'outbox'
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#155AD1] text-white shadow-md shadow-blue-500/20 font-bold border border-blue-400/40'
                    : 'bg-white hover:bg-sky-50 text-slate-700 hover:text-slate-900 border border-slate-200/90 sm:border-transparent'
                }`}
              >
                <span className="whitespace-nowrap">On Device</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                  activeTab === 'outbox'
                    ? 'bg-white/25 text-white border border-white/30'
                    : outboxItems.length > 0 ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {outboxItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setActiveTab('drafts');
                }}
                className={`px-3.5 py-2.5 sm:py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer touch-target min-h-[44px] flex items-center justify-between sm:justify-start gap-2 ${
                  activeTab === 'drafts'
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#155AD1] text-white shadow-md shadow-blue-500/20 font-bold border border-blue-400/40'
                    : 'bg-white hover:bg-sky-50 text-slate-700 hover:text-slate-900 border border-slate-200/90 sm:border-transparent'
                }`}
              >
                <span className="whitespace-nowrap">Drafts</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                  activeTab === 'drafts' ? 'bg-white/25 text-white border border-white/30' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {drafts.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setActiveTab('synced');
                }}
                className={`px-3.5 py-2.5 sm:py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer touch-target min-h-[44px] flex items-center justify-between sm:justify-start gap-2 ${
                  activeTab === 'synced'
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#155AD1] text-white shadow-md shadow-blue-500/20 font-bold border border-blue-400/40'
                    : 'bg-white hover:bg-sky-50 text-slate-700 hover:text-slate-900 border border-slate-200/90 sm:border-transparent'
                }`}
              >
                <span className="whitespace-nowrap hidden sm:inline">Submitted Records</span>
                <span className="whitespace-nowrap sm:hidden">Submitted</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                  activeTab === 'synced' ? 'bg-white/25 text-white border border-white/30' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {submittedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setActiveTab('bank_pending');
                }}
                className={`col-span-2 sm:col-span-1 px-3.5 py-2.5 sm:py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer touch-target min-h-[44px] flex items-center justify-between sm:justify-start gap-2 ${
                  activeTab === 'bank_pending'
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#155AD1] text-white shadow-md shadow-blue-500/20 font-bold border border-blue-400/40'
                    : 'bg-white hover:bg-sky-50 text-slate-700 hover:text-slate-900 border border-slate-200/90 sm:border-transparent'
                }`}
              >
                <span className="whitespace-nowrap hidden sm:inline">Approved — Bank Details Pending</span>
                <span className="whitespace-nowrap sm:hidden">Approved — Bank</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                  activeTab === 'bank_pending'
                    ? 'bg-white/25 text-white border border-white/30'
                    : bankPendingItems.length > 0 ? 'bg-amber-100 text-amber-950 border border-amber-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {bankPendingItems.length}
                </span>
              </button>
            </div>

            {/* Search Bar & Date Range Filters */}
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                {/* Search Input */}
                <div className="relative w-full md:col-span-6">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500/70 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by child name, ART number, caregiver..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-cosmic w-full pl-10 pr-3 py-2.5 min-h-[44px] text-xs sm:text-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Accessible Stacked From/To Date Range Inputs with Calendar Affordance */}
                <div className="md:col-span-6 grid grid-cols-1 xs:grid-cols-2 gap-2.5 pt-0.5">
                  {/* From Date */}
                  <div className="flex flex-col space-y-1">
                    <label htmlFor="filter-from-date" className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-sky-600" />
                      <span>From Date</span>
                    </label>
                    <input
                      id="filter-from-date"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="input-cosmic w-full px-3 py-2 min-h-[44px] text-xs sm:text-sm"
                    />
                  </div>

                  {/* To Date */}
                  <div className="flex flex-col space-y-1">
                    <label htmlFor="filter-to-date" className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-sky-600" />
                      <span>To Date</span>
                    </label>
                    <input
                      id="filter-to-date"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="input-cosmic w-full px-3 py-2 min-h-[44px] text-xs sm:text-sm"
                    />
                  </div>
                </div>
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
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer underline flex items-center gap-1 touch-target min-h-[44px]"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear filters</span>
                </button>
              </div>
            )}
          </div>

          {/* Survey Lists Section */}
          <section className="space-y-4">
            {activeTab === 'drafts' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Local Drafts ({drafts.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">Saved on this device</span>
                </div>
                {drafts.length === 0 ? (
                  <div className="p-6 sm:p-8 rounded-2xl border border-dashed border-slate-300 text-center space-y-2 bg-white shadow-2xs">
                    <p className="text-xs sm:text-sm font-semibold text-slate-800">No active drafts on this device</p>
                    <p className="text-[11px] sm:text-xs text-slate-500 max-w-md mx-auto">
                      When you start a survey, your edits will save locally so you can continue anytime.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {drafts.map((d) => (
                      <DraftCard
                        key={d.id || d.uuid}
                        draft={d}
                        onResume={handleResumeDraft}
                        onDelete={handleDeleteDraft}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-6 sm:p-8 rounded-2xl border border-dashed border-slate-300 text-center space-y-2 bg-white shadow-2xs">
                <p className="text-xs sm:text-sm font-semibold text-slate-800">
                  {searchQuery || fromDate || toDate
                    ? 'No surveys match your search or date filter'
                    : activeTab === 'outbox'
                    ? 'All records have been sent to the server. No pending items on this device.'
                    : activeTab === 'bank_pending'
                    ? 'No approved records awaiting bank details.'
                    : activeTab === 'synced'
                    ? 'No confirmed server records found.'
                    : 'No submitted surveys yet'}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 max-w-md mx-auto">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredItems.filter((i) => !i.isOutbox).map(renderItemCard)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.map(renderItemCard)}
              </div>
            )}
          </section>
        </div>
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

      {bankTargetItem && (
        <BankDetailsEntryModal
          isOpen={true}
          submission={bankTargetItem}
          onClose={() => setBankTargetItem(null)}
          onSuccess={async () => {
            setBankTargetItem(null);
            setBankSuccessToast('Bank details updated successfully.');
            setTimeout(() => setBankSuccessToast(null), 4000);
            await refreshServer();
            await loadLocalData();
          }}
        />
      )}

      {bankSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>{bankSuccessToast}</span>
        </div>
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
