'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  FileText,
  FileWarning,
  Clock,
  Landmark,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export interface NeedsAttentionPanelProps {
  localDraftsCount?: number;
  outboxAttentionCount?: number;
  submittedMissingDocsCount?: number;
  approvedBankPendingCount?: number;
  serverScopeLabel?: string;
  isServerLoading?: boolean;
  className?: string;
}

export function NeedsAttentionPanel({
  localDraftsCount = 0,
  outboxAttentionCount = 0,
  submittedMissingDocsCount = 0,
  approvedBankPendingCount = 0,
  serverScopeLabel = 'Authorized scope',
  isServerLoading = false,
  className = '',
}: NeedsAttentionPanelProps) {
  const totalActionable =
    localDraftsCount +
    outboxAttentionCount +
    submittedMissingDocsCount +
    approvedBankPendingCount;

  // Pulse limited to 2 iterations (4s total, <= 5s safety ceiling), disabled for reduced motion
  const pulseBadgeStyle: React.CSSProperties = {
    animationIterationCount: 2,
    animationFillMode: 'forwards',
  };

  return (
    <section
      aria-labelledby="needs-attention-heading"
      className={`bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 id="needs-attention-heading" className="text-sm font-bold text-slate-900">
              Needs Attention
            </h3>
            <p className="text-xs text-slate-500">
              Pending workflows across local device storage and {serverScopeLabel}.
            </p>
          </div>
        </div>
        <div>
          <span
            style={pulseBadgeStyle}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 motion-reduce:animate-none"
          >
            <span>{totalActionable} Items Require Action</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Unfinished local forms */}
        <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Unfinished Forms</span>
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                (local)
              </span>
            </div>
            <div className="text-xl font-bold text-slate-900 pt-1">
              {localDraftsCount}
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              Drafts saved on this device awaiting completion.
            </p>
          </div>
          <Link
            href="/assessment/drafts"
            className="text-xs font-bold text-teal-800 hover:text-teal-950 inline-flex items-center gap-1 pt-1"
          >
            <span>Resume drafts</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* 2. Submitted assessments missing required intake docs */}
        <div className="p-3.5 rounded-xl border border-rose-200/80 bg-rose-50/40 hover:bg-rose-50/60 transition-colors flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                <FileWarning className="w-3.5 h-3.5 text-rose-600" />
                <span>Intake Docs Incomplete</span>
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                {serverScopeLabel}
              </span>
            </div>
            <div className="text-xl font-bold text-rose-950 pt-1">
              {isServerLoading ? (
                <span className="inline-block w-8 h-5 bg-rose-200/60 animate-pulse rounded" />
              ) : (
                submittedMissingDocsCount
              )}
            </div>
            <p className="text-[11px] text-rose-800/80 leading-tight">
              Submitted records missing mandatory Aadhaar or photo.
            </p>
          </div>
          <Link
            href="/supervisor/assessments"
            className="text-xs font-bold text-rose-900 hover:text-rose-950 inline-flex items-center gap-1 pt-1"
          >
            <span>Review intake gaps</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* 3. Queued / Failed sync */}
        <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/40 hover:bg-amber-50/60 transition-colors flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span>Queued / Retryable Sync</span>
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                (local)
              </span>
            </div>
            <div className="text-xl font-bold text-amber-950 pt-1">
              {outboxAttentionCount}
            </div>
            <p className="text-[11px] text-amber-800/80 leading-tight">
              Records waiting to send or needing reconnection.
            </p>
          </div>
          <Link
            href="/assessment/sync?tab=outbox"
            className="text-xs font-bold text-amber-900 hover:text-amber-950 inline-flex items-center gap-1 pt-1"
          >
            <span>View local outbox</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* 4. Approved records awaiting bank details (Amber/neutral — NOT red) */}
        <div className="p-3.5 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-yellow-50/40 hover:from-amber-50 hover:to-yellow-50 transition-colors flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-amber-700" />
                <span>Bank Details Pending</span>
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                {serverScopeLabel}
              </span>
            </div>
            <div className="text-xl font-bold text-amber-950 pt-1">
              {isServerLoading ? (
                <span className="inline-block w-8 h-5 bg-amber-200/60 animate-pulse rounded" />
              ) : (
                approvedBankPendingCount
              )}
            </div>
            <p className="text-[11px] text-amber-800 leading-tight">
              Approved cases awaiting banking &amp; passbook for DBT grant.
            </p>
          </div>
          <Link
            href="/assessment/sync?tab=bank_pending"
            className="text-xs font-bold text-amber-950 hover:underline inline-flex items-center gap-1 pt-1"
          >
            <span>Open bank queue</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
