import React from 'react';
import Link from 'next/link';
import {
  ClipboardCheck,
  FileText,
  RefreshCw,
  ShieldCheck,
  BarChart3,
  Wifi,
  ChevronRight,
  HeartPulse,
} from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col w-full max-w-lg mx-auto px-4 py-3 sm:py-6">
      {/* Compact Institutional Masthead */}
      <header className="bg-brand text-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-white/10 p-2 rounded-lg">
              <HeartPulse className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-blue-200">
                India HIV/AIDS Alliance
              </p>
              <h1 className="text-base font-bold leading-tight">Childcare Support — Phase 3</h1>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 bg-emerald-900/60 border border-emerald-500/30 px-2.5 py-1 rounded-full text-xs font-medium text-emerald-200">
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            <span>Ready</span>
          </div>
        </div>
        <p className="text-xs text-blue-100/80 mt-2">
          Paediatric Nutrition & Education Support Field Platform (Offline-First)
        </p>
      </header>

      {/* Primary Action Card: New Assessment */}
      <section className="mb-4">
        <Link
          href="/assessment/new"
          className="group block bg-gradient-to-r from-brand to-brand-dark text-white rounded-xl p-4 shadow-md active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white/15 p-2.5 rounded-xl">
                <ClipboardCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold">Start New Assessment</h2>
                <p className="text-xs text-blue-100">6-Step Intake & Malnutrition Triage</p>
              </div>
            </div>
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
              <ChevronRight className="h-5 w-5 text-white" />
            </div>
          </div>
        </Link>
      </section>

      {/* Grid of Secondary Actions */}
      <section className="grid grid-cols-2 gap-3 mb-4">
        {/* Saved Drafts */}
        <Link
          href="/assessment/drafts"
          className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm active:bg-slate-50 transition-colors flex flex-col justify-between min-h-[104px]"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="bg-blue-50 p-2 rounded-lg text-brand">
              <FileText className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              Local
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink-900 leading-tight">Saved Drafts</h3>
            <p className="text-[11px] text-ink-600 mt-0.5">Resume assessments</p>
          </div>
        </Link>

        {/* Sync Centre */}
        <Link
          href="/assessment/sync"
          className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm active:bg-slate-50 transition-colors flex flex-col justify-between min-h-[104px]"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-700">
              <RefreshCw className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Outbox
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink-900 leading-tight">Sync Centre</h3>
            <p className="text-[11px] text-ink-600 mt-0.5">Queue & history</p>
          </div>
        </Link>
      </section>

      {/* Supervisor Overview Section */}
      <section className="mb-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4 text-brand" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Supervisor Oversight
              </h3>
            </div>
            <span className="text-[10px] font-medium text-slate-500">Authorised Staff</span>
          </div>

          <div className="flex flex-col space-y-2">
            <Link
              href="/supervisor/linelist"
              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors text-xs font-semibold text-ink-900 min-h-[44px]"
            >
              <span>Beneficiary Line-List & Audits</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>

            <Link
              href="/supervisor/analytics"
              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors text-xs font-semibold text-ink-900 min-h-[44px]"
            >
              <span>Clinical Malnutrition Charts (D3)</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>
          </div>
        </div>
      </section>

      {/* Security & Offline Guarantee Footer */}
      <footer className="mt-auto pt-4 border-t border-slate-200/80">
        <div className="flex items-center space-x-2 text-[11px] text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <p>
            Offline-First Client Encryption • Aadhaar Masking • Zero Plaintext Child HIV Stigma
          </p>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          App Version 3.0.0 • Deployment Target: Render Web Service
        </p>
      </footer>
    </main>
  );
}
