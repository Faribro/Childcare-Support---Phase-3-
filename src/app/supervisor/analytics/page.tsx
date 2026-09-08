'use client';

import React from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  BarChart3,
  HeartPulse,
  AlertTriangle,
  GraduationCap,
  Users,
  ArrowRight,
  TrendingUp,
  Download,
} from 'lucide-react';

export default function AnalyticsDashboardPage() {
  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 mb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-brand text-xs font-bold uppercase tracking-wider mb-1">
              <BarChart3 className="h-4 w-4" />
              <span>Programme Monitoring & Clinical Analytics</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink-900">Clinical Nutrition & Education Oversight</h1>
            <p className="text-xs sm:text-sm text-ink-600 mt-0.5">
              Aggregate prevalence of acute malnutrition (SAM/MAM) and educational support disbursement across districts.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/supervisor/assessments">
              <Button variant="secondary" className="shadow-sm">
                <span>View Line-List</span>
              </Button>
            </Link>

            <Link href="/assessment/new">
              <Button variant="primary">New Assessment</Button>
            </Link>
          </div>
        </div>

        {/* Executive KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5 mb-6 sm:mb-8">
          {/* Total Beneficiaries */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Children Assessed</span>
              <Users className="h-4 w-4 text-brand" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-ink-900">142</div>
            <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" />
              <span>+18 this week</span>
            </p>
          </div>

          {/* Severe Malnutrition (SAM) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">SAM Cases</span>
              <AlertTriangle className="h-4 w-4 text-alert-rose" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-alert-rose">12</div>
            <p className="text-[11px] text-slate-500 mt-1">
              8.4% of cohort (NRC referred)
            </p>
          </div>

          {/* Moderate Malnutrition (MAM) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">MAM Cases</span>
              <HeartPulse className="h-4 w-4 text-alert-amber" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-alert-amber">28</div>
            <p className="text-[11px] text-slate-500 mt-1">
              19.7% of cohort (Supplementary diet)
            </p>
          </div>

          {/* Grants Disbursed */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">DBT Committed</span>
              <GraduationCap className="h-4 w-4 text-alliance-emerald" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-alliance-emerald">₹3,48,500</div>
            <p className="text-[11px] text-slate-500 mt-1">
              Average grant: ₹2,454
            </p>
          </div>
        </div>

        {/* Analytics Visualisation Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Nutrition Cohort Distribution Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
            <h3 className="text-sm sm:text-base font-bold text-ink-900 mb-1">
              Paediatric Nutritional Status Breakdown
            </h3>
            <p className="text-xs text-ink-600 mb-6">
              Distribution of children across WHO growth standard tiers (N = 142)
            </p>

            {/* Segmented Visual Bar */}
            <div className="h-6 w-full rounded-xl overflow-hidden flex shadow-inner mb-4">
              <div style={{ width: '71.9%' }} className="bg-alliance-emerald h-full" title="Normal: 102 (71.9%)" />
              <div style={{ width: '19.7%' }} className="bg-alert-amber h-full" title="MAM: 28 (19.7%)" />
              <div style={{ width: '8.4%' }} className="bg-alert-rose h-full" title="SAM: 12 (8.4%)" />
            </div>

            {/* Legend */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
                <span className="font-bold text-alliance-emerald block">Normal (71.9%)</span>
                <span className="text-slate-600">102 children</span>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200">
                <span className="font-bold text-alert-amber block">MAM (19.7%)</span>
                <span className="text-slate-600">28 children</span>
              </div>
              <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200">
                <span className="font-bold text-alert-rose block">SAM (8.4%)</span>
                <span className="text-slate-600">12 children</span>
              </div>
            </div>
          </div>

          {/* Programmatic Triage Journey */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
            <h3 className="text-sm sm:text-base font-bold text-ink-900 mb-1">
              Field Care Pathway & Triage Progression
            </h3>
            <p className="text-xs text-ink-600 mb-4">
              Standardized flow from ART intake to DBT disbursement
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink-900">1. ART Field Outreach & Intake</span>
                  <p className="text-[11px] text-slate-500">Demographic registry & caregiver verification</p>
                </div>
                <span className="font-bold text-brand bg-blue-100/70 px-2 py-0.5 rounded">100%</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink-900">2. Anthropometric Screening (Ht/Wt/MUAC)</span>
                  <p className="text-[11px] text-slate-500">Instant BMI-for-age & bilateral oedema check</p>
                </div>
                <span className="font-bold text-brand bg-blue-100/70 px-2 py-0.5 rounded">100%</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink-900">3. Supplementary Nutrition Entitlement</span>
                  <p className="text-[11px] text-slate-500">40 SAM/MAM children linked to food support</p>
                </div>
                <span className="font-bold text-alliance-emerald bg-emerald-100/70 px-2 py-0.5 rounded">28.1%</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink-900">4. Direct Benefit Transfer (DBT) Bank Account</span>
                  <p className="text-[11px] text-slate-500">Passbook verification & grant processing</p>
                </div>
                <span className="font-bold text-brand bg-blue-100/70 px-2 py-0.5 rounded">94.2%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
