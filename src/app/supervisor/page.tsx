'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import {
  Activity,
  TableProperties,
  BarChart3,
  Users,
  TrendingUp,
  HeartPulse,
  GraduationCap,
  Globe,
  Maximize2,
  Lock,
  AlertCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { SupervisorTabNav } from '@/components/supervisor/SupervisorTabNav';
import { useSupervisorData } from '@/hooks/useSupervisorData';
import type { BMICategory, VLCategory, HbCategory } from '@/types/domain';

export default function SupervisorDashboardPage() {
  const { isUnlocked, isLoaded } = useEvaluationAccess();
  const {
    records,
    status,
    isLoading,
    isError,
    isEmpty,
    error,
    refresh,
    retry,
    lastRefreshed,
  } = useSupervisorData();



  // Clinical Metrics Calculations (Authentic Phase 2 indicators)
  const totalEvaluated = records.length;
  
  // HIV Viral Load Suppression
  const suppressedCount = records.filter(
    (r) => r.vlCategory.includes('Suppressed') || r.vlCategory.includes('Undetectable')
  ).length;
  const unsuppressedCount = records.filter((r) => r.vlCategory.includes('Unsuppressed')).length;
  const suppressionRate = totalEvaluated > 0 ? Math.round((suppressedCount / totalEvaluated) * 100) : 0;

  // Pediatric Underweight & Nutritional Risk
  const severeUnderweightCount = records.filter((r) => r.bmiCategory === 'Severe Underweight').length;
  const moderateUnderweightCount = records.filter((r) => r.bmiCategory === 'Moderate Underweight').length;
  const normalBMICount = records.filter((r) => r.bmiCategory === 'Normal').length;
  const nutritionalRiskCount = severeUnderweightCount + moderateUnderweightCount;

  // Severe Anemia
  const severeAnemiaCount = records.filter((r) => r.hbCategory === 'Severe Anemia').length;
  const moderateAnemiaCount = records.filter((r) => r.hbCategory === 'Moderate Anemia').length;

  // Financial Entitlement
  const totalGrant = records.reduce((sum, r) => sum + r.grantAmount, 0);

  // Education & Attendance Status (Live dynamic calculations)
  const enrolledCount = records.filter((r) => r.schoolEnrolled).length;
  const outOfSchoolCount = Math.max(0, totalEvaluated - enrolledCount);
  const enrolledRate = totalEvaluated > 0 ? Math.round((enrolledCount / totalEvaluated) * 100) : 0;
  const outOfSchoolRate = totalEvaluated > 0 ? Math.round((outOfSchoolCount / totalEvaluated) * 100) : 0;

  if (isLoaded && !isUnlocked) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-md mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Evaluation Portal Restricted</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Clinical evaluation and surveillance records are restricted to authorized personnel.
            </p>
            <div className="pt-2">
              <Link href="/">
                <Button variant="primary" size="sm">
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 pt-2 pb-6 sm:pt-3 sm:pb-8">
        {/* Supervisor Tab Navigation with Smooth Animations */}
        <SupervisorTabNav
          rightAction={
            <div className="flex items-center space-x-2">
              {lastRefreshed && (
                <span className="text-[11px] text-slate-400 hidden sm:inline font-mono">
                  Updated: {lastRefreshed.toLocaleTimeString()}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={refresh}
                className="h-9 px-3 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin text-teal-700' : ''}`} />
                <span>Refresh</span>
              </Button>
            </div>
          }
        />

        {/* Error State Banner */}
        {isError && (
          <div className="mb-6 bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-rose-900 shadow-xs">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Failed to Load Surveillance Metrics</h4>
                <p className="text-xs text-rose-700 mt-0.5">
                  {error?.message || 'Upstream spreadsheet bridge returned an error.'}
                  {error?.code && (
                    <span className="ml-2 font-mono text-[11px] bg-rose-200/80 px-1.5 py-0.5 rounded text-rose-800 font-semibold">
                      [{error.code}]
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={retry}
                className="text-xs border-rose-300 text-rose-800 hover:bg-rose-100/80"
              >
                Retry Connection
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={refresh}
                className="text-xs bg-rose-700 hover:bg-rose-800 text-white"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        )}

        {/* Empty State Banner */}
        {isEmpty && !isLoading && (
          <div className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1">
            <h4 className="text-sm font-bold text-slate-700">No Survey Submissions Yet</h4>
            <p className="text-xs text-slate-500">
              Surveillance indicators are currently displaying zero because no assessments have been submitted to the central database yet.
            </p>
          </div>
        )}

        {/* 4 Refined Executive KPI Cards - AUTHENTIC CLINICAL INDICATORS (NO SAM / NO MAM) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5 mb-8">
          {/* 1. Total Evaluated */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Evaluated</span>
              <Users className="h-4 w-4 text-teal-700" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{totalEvaluated}</div>
            <p className="text-[11px] text-teal-700 font-medium mt-1 flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" />
              <span>Active Linelist Beneficiaries</span>
            </p>
          </div>

          {/* 2. Viral Load Suppression Rate (Central HIV Clinical Indicator) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-emerald-300 transition-all">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">VL Suppression Rate</span>
              <Activity className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-700">{suppressionRate}%</div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>{suppressedCount} of {totalEvaluated} Suppressed</span>
              <span className="text-emerald-700 font-bold">(&lt;1,000 c/mL)</span>
            </p>
          </div>

          {/* 3. Nutritional Risk (Underweight Staging) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-amber-300 transition-all">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Nutritional Risk</span>
              <HeartPulse className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-amber-600">{nutritionalRiskCount}</div>
            <p className="text-[11px] text-slate-500 mt-1">
              {severeUnderweightCount} Severe • {moderateUnderweightCount} Moderate Underweight
            </p>
          </div>

          {/* 4. Committed DBT Grant Pool */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-teal-300 transition-all">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800">DBT Entitlement</span>
              <GraduationCap className="h-4 w-4 text-teal-700" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-teal-900">₹{totalGrant.toLocaleString('en-IN')}</div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Committed child grant pool</span>
              <span className="text-teal-700 font-bold">100% KYC</span>
            </p>
          </div>
        </div>

        {/* Clinical Health & Surveillance Visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          {/* Growth & BMI Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Paediatric BMI & Growth</h3>
              <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full">WHO Standard</span>
            </div>
            <div className="text-xs text-slate-500 mb-4">Underweight vs Normal BMI distribution</div>

            {/* Segmented bar */}
            <div className="h-4 w-full rounded-full overflow-hidden flex bg-slate-100 shadow-inner mb-3">
              <div
                style={{ width: `${totalEvaluated > 0 ? (normalBMICount / totalEvaluated) * 100 : 0}%` }}
                className="bg-emerald-500 h-full transition-all"
                title="Normal BMI"
              />
              <div
                style={{ width: `${totalEvaluated > 0 ? (moderateUnderweightCount / totalEvaluated) * 100 : 0}%` }}
                className="bg-amber-400 h-full transition-all"
                title="Moderate Underweight"
              />
              <div
                style={{ width: `${totalEvaluated > 0 ? (severeUnderweightCount / totalEvaluated) * 100 : 0}%` }}
                className="bg-rose-500 h-full transition-all"
                title="Severe Underweight"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="block text-[10px] text-slate-500 font-medium">Normal</span>
                <span className="text-sm font-bold text-emerald-700">{normalBMICount}</span>
              </div>
              <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="block text-[10px] text-slate-500 font-medium">Moderate</span>
                <span className="text-sm font-bold text-amber-700">{moderateUnderweightCount}</span>
              </div>
              <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-200">
                <span className="block text-[10px] text-slate-500 font-medium">Severe</span>
                <span className="text-sm font-bold text-rose-700">{severeUnderweightCount}</span>
              </div>
            </div>
          </div>

          {/* Viral Load Suppression Cascade */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">HIV Viral Load Cascade</h3>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">NACO 95-95-95</span>
            </div>
            <div className="text-xs text-slate-500 mb-4">Suppressed (&lt;1000) vs High Viral Load</div>

            {/* Segmented bar */}
            <div className="h-4 w-full rounded-full overflow-hidden flex bg-slate-100 shadow-inner mb-3">
              <div
                style={{ width: `${totalEvaluated > 0 ? (suppressedCount / totalEvaluated) * 100 : 0}%` }}
                className="bg-teal-600 h-full transition-all"
                title="Suppressed (<1000 copies/mL)"
              />
              <div
                style={{ width: `${totalEvaluated > 0 ? (unsuppressedCount / totalEvaluated) * 100 : 0}%` }}
                className="bg-rose-500 h-full transition-all"
                title="Unsuppressed (≥1000 copies/mL)"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-teal-50/70 border border-teal-200">
                <span className="block text-[10px] text-slate-500 font-medium">Suppressed (&lt;1000)</span>
                <span className="text-sm font-bold text-teal-900">{suppressedCount} ({suppressionRate}%)</span>
              </div>
              <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-200">
                <span className="block text-[10px] text-slate-500 font-medium">High VL (≥1000)</span>
                <span className="text-sm font-bold text-rose-700">{unsuppressedCount}</span>
              </div>
            </div>
          </div>

          {/* Education & Attendance Status */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Education & Attendance</h3>
              <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full">Grant Linked</span>
            </div>
            <div className="text-xs text-slate-500 mb-4">School enrollment & attendance status</div>

            {/* Segmented bar */}
            <div className="h-4 w-full rounded-full overflow-hidden flex bg-slate-100 shadow-inner mb-3">
              <div
                style={{ width: `${totalEvaluated > 0 ? enrolledRate : 0}%` }}
                className="bg-sky-600 h-full transition-all"
                title={`School Enrolled (${enrolledRate}%)`}
              />
              <div
                style={{ width: `${totalEvaluated > 0 ? outOfSchoolRate : 0}%` }}
                className="bg-slate-300 h-full transition-all"
                title={`Out of School (${outOfSchoolRate}%)`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-sky-50/70 border border-sky-200">
                <span className="block text-[10px] text-slate-500 font-medium">Enrolled in School</span>
                <span className="text-sm font-bold text-sky-900">
                  {totalEvaluated > 0 ? `${enrolledCount} (${enrolledRate}%)` : '0 (0%)'}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="block text-[10px] text-slate-500 font-medium">Out of School</span>
                <span className="text-sm font-bold text-slate-700">
                  {totalEvaluated > 0 ? `${outOfSchoolCount} (${outOfSchoolRate}%)` : '0 (0%)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
