'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalErrorBoundary] Caught unhandled client error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-lg text-center space-y-5 animate-in fade-in duration-200">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 stroke-[2.2]" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-slate-900">
            Child Nutrition &amp; Support Platform
          </h1>
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            A temporary view error occurred. Your saved drafts and offline data are completely safe in local storage.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload View</span>
          </button>

          <Link
            href="/app"
            className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4 text-slate-600" />
            <span>Return to Workspace</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
