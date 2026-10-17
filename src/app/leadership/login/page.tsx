'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { LeadershipOtpFlow } from '@/components/auth/LeadershipOtpFlow';

/**
 * Validates and sanitizes returnUrl to prevent open redirect vulnerabilities.
 * Must begin with '/' and not start with '//' or '/\' or specify an absolute scheme.
 */
function sanitizeReturnUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '/supervisor';
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes('://')
  ) {
    return trimmed;
  }
  return '/supervisor';
}

function LeadershipLoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeReturnUrl = sanitizeReturnUrl(searchParams?.get('returnUrl'));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-200 motion-reduce:animate-none">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-6 py-6 text-white text-center relative">
          <div className="inline-flex p-3 bg-teal-700/60 rounded-2xl border border-teal-500/30 mb-3 shadow-inner">
            <Building2 className="w-7 h-7 text-teal-200" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Alliance India Leadership</h1>
          <p className="text-xs text-teal-200/90 mt-1">
            Childcare Support Programme — Surveillance &amp; Evaluation
          </p>
        </div>

        {/* Body with shared LeadershipOtpFlow */}
        <div className="p-6 sm:p-8 space-y-6">
          <LeadershipOtpFlow
            isModal={false}
            onSuccess={() => {
              router.push(safeReturnUrl);
            }}
            onCancel={() => {
              router.push('/app');
            }}
          />

          {/* Navigation link */}
          <div className="pt-4 border-t border-slate-200 text-center">
            <Link
              href="/app"
              className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1 transition-colors"
            >
              ← Return to Caseworker Field Workspace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LeadershipLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-teal-200 text-sm">
          Loading Alliance India Leadership Portal...
        </div>
      }
    >
      <LeadershipLoginCard />
    </Suspense>
  );
}
