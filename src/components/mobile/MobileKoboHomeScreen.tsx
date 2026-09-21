'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  FileText,
  Send,
  CheckCircle2,
  Shield,
  ChevronRight,
  ChevronDown,
  Lock,
  Wifi,
  WifiOff,
  Clock,
  ExternalLink,
} from 'lucide-react';
import type { AssessmentRecord } from '@/types/domain';
import { DraftCard } from '@/components/forms/DraftCard';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

interface MobileKoboHomeScreenProps {
  drafts: AssessmentRecord[];
  waitingCount: number;
  submittedCount: number;
  isLoading: boolean;
  onDeleteDraft: (id: number) => Promise<void>;
  onResumeDraft: (id: string | number) => void;
}

export function MobileKoboHomeScreen({
  drafts,
  waitingCount,
  submittedCount,
  isLoading,
  onDeleteDraft,
  onResumeDraft,
}: MobileKoboHomeScreenProps) {
  const router = useRouter();
  const { isUnlocked } = useEvaluationAccess();
  const [draftsExpanded, setDraftsExpanded] = useState(false);
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="md:hidden w-full max-w-md mx-auto px-4 py-4 space-y-4 animate-in fade-in duration-150">
      {/* Top Mobile Status Header */}
      <div className="flex items-center justify-between bg-white border border-slate-200/90 rounded-xl px-3.5 py-2.5 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
          <span className="text-xs font-bold text-slate-800 tracking-tight">
            Child Nutrition &amp; Support
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <Wifi className="w-3 h-3 text-emerald-600" />
              Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              <WifiOff className="w-3 h-3 text-amber-600" />
              Offline Ready
            </span>
          )}
        </div>
      </div>

      {/* Action 1: Start New Survey (Prominent Full-Width Primary Touch Action) */}
      <Link href="/assessment/new" className="block">
        <button
          type="button"
          className="w-full min-h-[56px] bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 active:scale-[0.99] text-white rounded-2xl p-4 shadow-sm border border-teal-800 flex items-center justify-between transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Plus className="w-6 h-6 text-white stroke-[2.5]" />
            </div>
            <div className="text-left">
              <h3 className="text-base font-bold leading-tight text-white">Start New Survey</h3>
              <p className="text-xs text-teal-50/90 font-medium">New beneficiary intake assessment</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80 shrink-0" />
        </button>
      </Link>

      {/* Main 4 Navigation Action Cards (White, High-Contrast, >=48px touch targets) */}
      <div className="space-y-2.5">
        {/* Action 2: Drafts */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden transition-colors">
          <button
            type="button"
            onClick={() => setDraftsExpanded(!draftsExpanded)}
            aria-expanded={draftsExpanded}
            className="w-full min-h-[52px] p-3.5 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">Drafts</h4>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
                    {isLoading ? '...' : drafts.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">Saved locally on this device</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-slate-400 shrink-0 ml-2">
              <span className="text-xs font-semibold text-teal-700 hidden xs:inline">
                {draftsExpanded ? 'Hide' : 'View'}
              </span>
              {draftsExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          </button>

          {/* Inline Collapsible Drafts List */}
          {draftsExpanded && (
            <div className="border-t border-slate-100 p-3 bg-slate-50/50 space-y-2.5">
              {isLoading ? (
                <p className="text-center text-xs text-slate-400 py-3">Loading local drafts...</p>
              ) : drafts.length === 0 ? (
                <div className="text-center py-4 px-2 space-y-1">
                  <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">No active drafts on this device</p>
                  <p className="text-[11px] text-slate-500">
                    When you start a survey, your edits will save here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {drafts.map((d) => (
                    <DraftCard
                      key={d.id || d.uuid}
                      draft={d}
                      onResume={onResumeDraft}
                      onDelete={onDeleteDraft}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action 3: Ready to Send (Outbox) */}
        <Link href="/assessment/sync?tab=outbox" className="block">
          <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  waitingCount > 0
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <Send className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">Ready to send</h4>
                  <span
                    className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full border tabular-nums ${
                      waitingCount > 0
                        ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {isLoading ? '...' : waitingCount}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {waitingCount > 0
                    ? 'Waiting for network or retry'
                    : 'All device records sent to server'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
          </div>
        </Link>

        {/* Action 4: Submitted Surveys */}
        <Link href="/assessment/sync?tab=synced" className="block">
          <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">Submitted surveys</h4>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 tabular-nums">
                    {isLoading ? '...' : submittedCount}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">Confirmed on central server</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
          </div>
        </Link>

        {/* Action 5: Evaluation (Supervisor Portal) */}
        <Link href="/supervisor" className="block">
          <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">Evaluation</h4>
                  {!isUnlocked ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      <Lock className="w-2.5 h-2.5" />
                      Locked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200">
                      Unlocked
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 truncate">Supervisor linelist, analytics &amp; GIS</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
          </div>
        </Link>
      </div>

      {/* Fieldwork Operational Footer */}
      <div className="text-center pt-2 pb-1 space-y-1">
        <p className="text-[11px] text-slate-400 font-medium">
          India HIV/AIDS Alliance • Child Nutrition Phase 3
        </p>
        <p className="text-[10px] text-slate-400">
          Offline PWA • Fast IndexedDB Local Storage
        </p>
      </div>
    </div>
  );
}
