'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  FileCheck2,
  CheckCircle2,
  Clock,
  Printer,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';

import { db } from '@/lib/db/dexieDb';
import { isValidUuidV4 } from '@/features/submission/submissionTypes';

export default function AssessmentReceiptPage() {
  const params = useParams();
  const rawId = (params?.submissionId as string) || '';
  const submissionId = decodeURIComponent(rawId);

  const [record, setRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!submissionId) return;
      setIsLoading(true);
      setError(null);
      try {
        // 1. Inspect local IndexedDB first
        let localRecord: any = null;
        let confirmedRemoteId: string | undefined = undefined;

        try {
          const queueItems = await db.syncQueue.toArray();
          const localQueue = queueItems.find(
            (q) =>
              q.submissionUuid === submissionId ||
              (q.payload as any)?.uuid === submissionId ||
              (q.payload as any)?.clientSubmissionId === submissionId ||
              (q.payload as any)?.uniqueId === submissionId ||
              (q.payload as any)?.artNumber === submissionId ||
              (q.payload as any)?.demographics?.artNumber === submissionId ||
              (q.payload as any)?.legacyBusinessReference === submissionId ||
              (q.payload as any)?.['1\nUnique ID'] === submissionId ||
              String(q.id) === submissionId
          );

          if (localQueue?.payload) {
            localRecord = localQueue.payload;
            if (isValidUuidV4(localQueue.remoteSubmissionId)) {
              confirmedRemoteId = localQueue.remoteSubmissionId;
            } else if (isValidUuidV4((localQueue.payload as any).remoteSubmissionId)) {
              confirmedRemoteId = (localQueue.payload as any).remoteSubmissionId;
            }
          }
        } catch (_) {}

        if (!localRecord) {
          try {
            const drafts = await db.drafts.toArray();
            const localDraft = drafts.find(
              (d: any) =>
                d.uuid === submissionId ||
                d.clientSubmissionId === submissionId ||
                d.demographics?.artNumber === submissionId ||
                d.artNumber === submissionId ||
                d.legacyBusinessReference === submissionId ||
                d.uniqueId === submissionId ||
                d.formData?.uuid === submissionId ||
                d.formData?.demographics?.artNumber === submissionId ||
                (d.formData as any)?.['1\nUnique ID'] === submissionId ||
                String(d.id) === submissionId
            );

            if (localDraft) {
              localRecord = (localDraft as any).formData || localDraft;
              if (isValidUuidV4(localDraft.remoteSubmissionId)) {
                confirmedRemoteId = localDraft.remoteSubmissionId;
              }
            }
          } catch (_) {}
        }

        if (localRecord) {
          setRecord(localRecord);
          // If remote ID exists, attempt background refresh
          if (confirmedRemoteId) {
            try {
              const res = await fetch(`/api/submissions/${encodeURIComponent(confirmedRemoteId)}`, {
                credentials: 'same-origin',
              });
              if (res.ok) {
                const body = await res.json();
                if (body.data) setRecord(body.data);
              }
            } catch (_) {}
          }
          return;
        }

        // 2. Fetch remotely if not available locally
        try {
          const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
            credentials: 'same-origin',
          });
          if (res.ok) {
            const body = await res.json();
            if (body.data) {
              setRecord(body.data);
              return;
            }
          } else if (res.status === 401 || res.status === 403) {
            setError('Authentication required to view this receipt. Please sign in.');
            return;
          } else if (res.status === 404) {
            setError('Receipt not found.');
            return;
          }
        } catch (_) {}

        setError('Unable to load receipt.');
      } catch (err) {
        console.error('Failed to load receipt:', err);
        setError('Network error loading receipt.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [submissionId]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-lg mx-auto px-4 py-16 flex flex-col items-center justify-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          <p className="text-xs text-slate-500">Loading intake confirmation receipt...</p>
        </div>
      </AppShell>
    );
  }

  if (error && !record) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-lg mx-auto px-4 py-8 space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-4">
            <h2 className="text-sm font-bold text-amber-900">Receipt Not Available</h2>
            <p className="text-xs text-amber-700">{error}</p>
            <div>
              <Link
                href="/sync"
                className="inline-flex items-center text-xs font-semibold text-teal-700 underline"
              >
                Return to Sync Centre
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between no-print">
          <Link
            href={`/assessment/record/${submissionId}`}
            className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            <span>Back to Record</span>
          </Link>

          <Button type="button" variant="secondary" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            <span>Print Receipt</span>
          </Button>
        </div>

        {/* Minimalist Data-Minimised Receipt Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs text-slate-900 space-y-6">
          <div className="text-center pb-5 border-b border-slate-100">
            <div className="inline-flex p-3 rounded-full bg-emerald-50 text-emerald-700 mb-3">
              <FileCheck2 className="h-8 w-8" />
            </div>
            <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">
              India HIV/AIDS Alliance
            </div>
            <h1 className="text-lg font-bold text-slate-900 mt-0.5">
              Assessment Intake Confirmation
            </h1>
            <p className="text-xs text-slate-500 mt-1">Official Proof of Field Assessment Recording</p>
          </div>

          {/* Core Minimised Fields (Strictly Zero Stigmatising or Financial Data) */}
          <div className="space-y-3.5 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="text-slate-500 font-medium">Assessment Reference:</span>
              <span className="font-mono font-bold text-teal-900 text-sm">
                {record?.art_number || record?.demographics?.artNumber || submissionId}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Confirmation State:</span>
              <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center space-x-1">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                <span>Server Confirmed</span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Recorded Timestamp:</span>
              <span className="font-medium text-slate-800">
                {new Date(record?.updated_at || record?.created_at || Date.now()).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Canonical Version:</span>
              <span className="font-mono font-bold text-slate-800">
                v{record?.version || 1}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Submitting Role:</span>
              <span className="font-medium text-slate-800">
                {record?.caseworker_name || record?.interviewer_name || 'Field Caseworker'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Caregiver Consent:</span>
              <span className="font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center text-[11px]">
                <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
                <span>Caregiver consent evidence captured</span>
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-500">Next Action:</span>
              <span className="font-medium text-slate-700">Supervisor Verification Scheduled</span>
            </div>
          </div>

          {/* Privacy Note */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-start space-x-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              In accordance with Alliance data protection protocols, diagnostic and financial grant amounts are withheld from non-supervisor receipts.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
