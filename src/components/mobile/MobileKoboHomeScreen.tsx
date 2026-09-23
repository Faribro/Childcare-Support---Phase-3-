'use client';

import React from 'react';
import Link from 'next/link';
import {
  Plus,
  FileText,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import type { AssessmentRecord } from '@/types/domain';
import { MiniatureGardenPlayground } from '@/components/garden/MiniatureGardenPlayground';

interface MobileKoboHomeScreenProps {
  drafts?: AssessmentRecord[];
  draftsCount?: number;
  waitingCount?: number;
  submittedCount: number | null;
  isLoading?: boolean;
  isDraftsLoading?: boolean;
  isWaitingLoading?: boolean;
  isSubmittedLoading?: boolean;
  submittedStatus?: 'loading' | 'success' | 'offline' | 'error';
  onRetrySubmitted?: () => void;
  onDeleteDraft?: (id: number) => Promise<void>;
  onResumeDraft?: (id: string | number) => void;
}

export function MobileKoboHomeScreen({
  drafts,
  draftsCount,
  submittedCount,
  isLoading = false,
  isDraftsLoading,
  isSubmittedLoading,
  submittedStatus = 'success',
  onRetrySubmitted,
}: MobileKoboHomeScreenProps) {
  const draftsLoading = isDraftsLoading ?? isLoading;
  const submittedLoading = isSubmittedLoading ?? isLoading;
  const count = draftsCount ?? drafts?.length ?? 0;

  return (
    <div className="md:hidden w-full max-w-md mx-auto px-4 py-3 sm:py-4 space-y-3 animate-in fade-in duration-150">
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

      {/* Navigation Action Cards (White, High-Contrast, >=48px touch targets) */}
      <div className="space-y-2.5">
        {/* Action 2: Drafts (Dedicated Page Navigation) */}
        <Link href="/assessment/drafts" className="block">
          <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">Drafts</h4>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]">
                    {draftsLoading ? (
                      <span
                        className="inline-block w-3.5 h-2.5 bg-slate-300 animate-pulse rounded"
                        role="status"
                        aria-label="Loading draft count"
                      />
                    ) : (
                      count
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">Saved locally on this device</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
          </div>
        </Link>

        {/* Action 3: Submitted Surveys */}
        <div className="w-full min-h-[52px] bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors">
          <Link href="/assessment/sync?tab=synced" className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">Submitted surveys</h4>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 tabular-nums inline-flex items-center justify-center min-w-[28px] min-h-[20px]">
                  {submittedLoading ? (
                    <span
                      className="inline-block w-3.5 h-2.5 bg-emerald-300 animate-pulse rounded"
                      role="status"
                      aria-label="Loading submitted count"
                    />
                  ) : (
                    submittedCount ?? 0
                  )}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {submittedStatus === 'offline' ? 'Showing locally confirmed (offline)' : 'Confirmed on central server'}
              </p>
            </div>
          </Link>

          {submittedStatus === 'error' && onRetrySubmitted ? (
            <button
              type="button"
              onClick={onRetrySubmitted}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors shrink-0 ml-2 cursor-pointer"
              aria-label="Retry loading submitted count"
            >
              Retry
            </button>
          ) : (
            <Link href="/assessment/sync?tab=synced" className="shrink-0 ml-2">
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Link>
          )}
        </div>
      </div>

      {/* Restored Decorative Animated Playground at Bottom */}
      <div className="pt-1">
        <MiniatureGardenPlayground />
      </div>
    </div>
  );
}
