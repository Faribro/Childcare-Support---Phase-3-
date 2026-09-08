import React from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  ClipboardCheck,
  FileText,
  RefreshCw,
  ShieldCheck,
  BarChart3,
  ChevronRight,
  HeartPulse,
  Users,
  GraduationCap,
  Sparkles,
  TableProperties,
} from 'lucide-react';

export default function HomePage() {
  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8 flex flex-col justify-between">
        <div>
          {/* Institutional Hero Banner */}
          <section className="bg-gradient-to-br from-brand via-brand to-brand-dark text-white rounded-2xl p-5 sm:p-7 lg:p-8 shadow-md mb-6 lg:mb-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center space-x-2 bg-white/10 px-3 py-1 rounded-full text-xs font-semibold text-blue-200 mb-3 backdrop-blur-xs">
                <HeartPulse className="h-4 w-4 text-emerald-400" />
                <span>India HIV/AIDS Alliance • Paediatric Care Platform</span>
              </div>
              <h1 className="text-xl sm:text-3xl lg:text-4xl font-bold leading-tight">
                Children Nutrition & Education Support
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-blue-100/90 mt-2 leading-relaxed">
                Offline-first clinical and educational assessment system for field staff. Seamlessly evaluates acute malnutrition (SAM/MAM), calculates school grant entitlements, and synchronizes to Google Sheets.
              </p>

              <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                <Link href="/assessment/new" className="w-full sm:w-auto">
                  <Button
                    variant="emerald"
                    size="lg"
                    className="w-full sm:w-auto font-bold shadow-lg"
                  >
                    <ClipboardCheck className="h-5 w-5 mr-2" />
                    <span>Start New Assessment</span>
                  </Button>
                </Link>

                <Link href="/supervisor/linelist" className="w-full sm:w-auto">
                  <Button
                    variant="ghost"
                    size="lg"
                    className="w-full sm:w-auto text-white border border-white/30 hover:bg-white/10"
                  >
                    <TableProperties className="h-5 w-5 mr-2" />
                    <span>Supervisor Line-List</span>
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          {/* Quick Action Navigation Grid (1 col on mobile, 2 cols on tablet, 4 cols on desktop) */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 lg:mb-8">
            {/* Action 1: New Assessment */}
            <Link
              href="/assessment/new"
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-brand-light transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-brand flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <ClipboardCheck className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-ink-900 group-hover:text-brand transition-colors">
                  New Assessment
                </h3>
                <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                  Step-by-step intake for demographics, anthropometry, and education.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-brand">
                <span>Begin Intake</span>
                <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Action 2: Saved Drafts */}
            <Link
              href="/assessment/drafts"
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-brand-light transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="h-12 w-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-ink-900 group-hover:text-brand transition-colors">
                  Saved Drafts
                </h3>
                <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                  Resume locally saved assessments with 100% data recovery.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-slate-700">
                <span>View Local Drafts</span>
                <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Action 3: Sync Centre */}
            <Link
              href="/assessment/sync"
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-brand-light transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="h-12 w-12 rounded-xl bg-emerald-50 text-alliance-emerald flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <RefreshCw className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-ink-900 group-hover:text-brand transition-colors">
                  Sync Centre
                </h3>
                <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                  Inspect pending upload queue and manage Google Sheets synchronization.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-alliance-emerald">
                <span>Inspect Outbox</span>
                <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Action 4: Clinical Analytics */}
            <Link
              href="/supervisor/analytics"
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-brand-light transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="h-12 w-12 rounded-xl bg-amber-50 text-alert-amber flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-ink-900 group-hover:text-brand transition-colors">
                  Clinical Analytics
                </h3>
                <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                  Review MAM/SAM malnutrition prevalence and grant disbursement data.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-alert-amber">
                <span>View Metrics</span>
                <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </section>

          {/* Key Program Metrics Bar on Desktop */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm mb-6 lg:mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-bold text-ink-900">Program Performance Overview</h2>
              <span className="text-xs font-semibold text-slate-500">Live Pilot Staging</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2 text-slate-500 text-xs mb-1">
                  <Users className="h-4 w-4 text-brand" />
                  <span>Total Screened</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-ink-900">142 Children</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2 text-slate-500 text-xs mb-1">
                  <HeartPulse className="h-4 w-4 text-alert-amber" />
                  <span>Malnutrition Triage</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-alert-amber">40 Cases (28.1%)</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2 text-slate-500 text-xs mb-1">
                  <GraduationCap className="h-4 w-4 text-alliance-emerald" />
                  <span>Educational Grants</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-alliance-emerald">₹3,48,500</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2 text-slate-500 text-xs mb-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Sync Reliability</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-700">100% Idempotent</div>
              </div>
            </div>
          </section>
        </div>

        {/* Security & Offline Institutional Footer */}
        <footer className="pt-6 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Offline-First IndexedDB Encryption • Masked Aadhaar Privacy • Zero Stigma Presentation
              </span>
            </div>
            <span>Version 3.0.0 • Deployment: Render Web Service</span>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
