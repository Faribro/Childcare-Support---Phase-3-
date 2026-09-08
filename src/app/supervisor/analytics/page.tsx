'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  BarChart3,
  TableProperties,
  HeartPulse,
  AlertTriangle,
  GraduationCap,
  Users,
  ArrowRight,
  TrendingUp,
  Download,
  Activity,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  BookOpen,
} from 'lucide-react';

export default function AnalyticsDashboardPage() {
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');

  const districtData = [
    { name: 'Pune', total: 54, vlSuppressed: 47, underweight: 14, grant: 132500, kyc: 98 },
    { name: 'Mumbai Suburban', total: 38, vlSuppressed: 34, underweight: 8, grant: 94000, kyc: 95 },
    { name: 'Thane', total: 28, vlSuppressed: 22, underweight: 9, grant: 68500, kyc: 93 },
    { name: 'Solapur', total: 12, vlSuppressed: 10, underweight: 5, grant: 31000, kyc: 92 },
    { name: 'Nashik', total: 10, vlSuppressed: 8, underweight: 4, grant: 22500, kyc: 90 },
  ];

  const handleExportReport = () => {
    const csvContent = [
      'District,Total Children,VL Suppressed (<1000 c/mL),Suppression Rate,Nutritional Risk (Underweight),DBT Disbursed (INR),KYC Verified (%)',
      ...districtData.map(
        (d) =>
          `"${d.name}",${d.total},${d.vlSuppressed},${Math.round((d.vlSuppressed / d.total) * 100)}%,${d.underweight},"${d.grant}",${d.kyc}%`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alliance_india_clinical_analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        {/* Header - NO NEW INTAKE / NEW ASSESSMENT BUTTON */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 mb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-teal-700 text-xs font-bold uppercase tracking-wider mb-1">
              <BarChart3 className="h-4 w-4" />
              <span>Epidemiological Monitoring & Quality Surveillance</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Clinical HIV & Paediatric Nutrition Oversight</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Authoritative surveillance across NACO 95-95-95 viral suppression, WHO growth stunting tiers, and educational grants.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Button variant="primary" onClick={handleExportReport} className="text-xs h-9">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              <span>Export Analytics (CSV)</span>
            </Button>
          </div>
        </div>

        {/* Exclusive Supervisor Tab Navigation */}
        <div className="flex items-center space-x-1 border-b border-slate-200 mb-6 overflow-x-auto">
          <Link
            href="/supervisor"
            className="flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap"
          >
            <Activity className="h-4 w-4" />
            <span>Overview &amp; Surveillance</span>
          </Link>
          <Link
            href="/supervisor/assessments"
            className="flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap"
          >
            <TableProperties className="h-4 w-4" />
            <span>Master Linelist</span>
          </Link>
          <Link
            href="/supervisor/analytics"
            className="flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 border-teal-600 text-teal-800 bg-teal-50/50 rounded-t-lg whitespace-nowrap"
          >
            <BarChart3 className="h-4 w-4 text-teal-600" />
            <span>Clinical Analytics</span>
          </Link>
        </div>

        {/* 4 Core Clinical Surveillance KPI Summary Cards (NO SAM / NO MAM) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5 mb-8">
          {/* Total Beneficiaries Monitored */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Children Monitored</span>
              <Users className="h-4 w-4 text-teal-700" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">142</div>
            <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" />
              <span>5 Districts in Maharashtra</span>
            </p>
          </div>

          {/* HIV Viral Load Suppression Rate (NACO / UNAIDS Target) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">VL Suppressed</span>
              <Activity className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-700">84.5%</div>
            <p className="text-[11px] text-slate-500 mt-1">
              120 of 142 &lt;1,000 c/mL (Target: 95%)
            </p>
          </div>

          {/* Pediatric Nutritional Underweight (Growth Stunting) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Nutritional Risk</span>
              <HeartPulse className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-amber-600">40</div>
            <p className="text-[11px] text-slate-500 mt-1">
              12 Severe • 28 Moderate Underweight
            </p>
          </div>

          {/* Grants Disbursed */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800">DBT Committed</span>
              <GraduationCap className="h-4 w-4 text-teal-700" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-teal-900">₹3,48,500</div>
            <p className="text-[11px] text-slate-500 mt-1">
              Avg ₹2,454/child • 94.2% verified
            </p>
          </div>
        </div>

        {/* Section 1: Clinical Health Surveillance (BMI & Viral Load) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* 1. Pediatric BMI & Growth Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Paediatric BMI & Growth Stunting Breakdown
              </h3>
              <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full">N = 142</span>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Distribution of children across WHO pediatric growth curves (BMI-for-age Z-scores)
            </p>

            {/* Segmented Visual Bar */}
            <div className="h-6 w-full rounded-xl overflow-hidden flex shadow-inner mb-4">
              <div style={{ width: '68.3%' }} className="bg-emerald-500 h-full" title="Normal: 97 (68.3%)" />
              <div style={{ width: '19.8%' }} className="bg-amber-400 h-full" title="Moderate Underweight: 28 (19.8%)" />
              <div style={{ width: '8.4%' }} className="bg-rose-500 h-full" title="Severe Underweight: 12 (8.4%)" />
              <div style={{ width: '3.5%' }} className="bg-blue-400 h-full" title="Overweight: 5 (3.5%)" />
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="font-bold text-emerald-800 block">Normal (68.3%)</span>
                <span className="text-slate-600">97 children</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="font-bold text-amber-800 block">Moderate (19.8%)</span>
                <span className="text-slate-600">28 children</span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
                <span className="font-bold text-rose-800 block">Severe (8.4%)</span>
                <span className="text-slate-600">12 children</span>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200">
                <span className="font-bold text-blue-800 block">Overweight (3.5%)</span>
                <span className="text-slate-600">5 children</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <span>Severe underweight cases receive priority high-calorie dietary aid.</span>
              <span className="font-bold text-teal-800">NRC Protocol Active</span>
            </div>
          </div>

          {/* 2. HIV Viral Load Suppression Cascade */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                HIV Viral Load Suppression Cascade
              </h3>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">NACO Standard</span>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Measurement against UNAIDS 3rd 95 Target: Viral suppression (&lt;1,000 copies/mL)
            </p>

            {/* Segmented Visual Bar */}
            <div className="h-6 w-full rounded-xl overflow-hidden flex shadow-inner mb-4">
              <div style={{ width: '58.5%' }} className="bg-teal-700 h-full" title="Undetectable: 83 (58.5%)" />
              <div style={{ width: '26.0%' }} className="bg-emerald-500 h-full" title="Suppressed: 37 (26.0%)" />
              <div style={{ width: '15.5%' }} className="bg-rose-500 h-full" title="Unsuppressed: 22 (15.5%)" />
            </div>

            {/* Legend */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200">
                <span className="font-bold text-teal-900 block">Undetectable (58.5%)</span>
                <span className="text-slate-600">83 (&lt;50 c/mL)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="font-bold text-emerald-800 block">Suppressed (26.0%)</span>
                <span className="text-slate-600">37 (50-999 c/mL)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
                <span className="font-bold text-rose-800 block">Unsuppressed (15.5%)</span>
                <span className="text-slate-600">22 (≥1,000 c/mL)</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <span>Overall Suppression: <strong className="text-emerald-700">84.5%</strong> (Target: 95%)</span>
              <span className="text-rose-700 font-bold">22 Require Regimen Triage</span>
            </div>
          </div>
        </div>

        {/* Section 2: Haemoglobin Anemia & Education Support */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Haemoglobin Anemia Tiers */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Haemoglobin (Hb) & Anemia Prevalence
              </h3>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">WHO Paediatric</span>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Clinical stratification of pediatric blood haemoglobin levels (g/dL)
            </p>

            <div className="h-6 w-full rounded-xl overflow-hidden flex shadow-inner mb-4">
              <div style={{ width: '62.0%' }} className="bg-emerald-500 h-full" title="Normal: 88 (62.0%)" />
              <div style={{ width: '21.8%' }} className="bg-amber-300 h-full" title="Mild Anemia: 31 (21.8%)" />
              <div style={{ width: '13.4%' }} className="bg-amber-500 h-full" title="Moderate Anemia: 19 (13.4%)" />
              <div style={{ width: '2.8%' }} className="bg-rose-600 h-full" title="Severe Anemia: 4 (2.8%)" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="font-bold text-emerald-800 block">Normal (62.0%)</span>
                <span className="text-slate-600">88 (≥11 g/dL)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="font-bold text-amber-800 block">Mild (21.8%)</span>
                <span className="text-slate-600">31 (10-10.9)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-100/70 border border-amber-300">
                <span className="font-bold text-amber-900 block">Moderate (13.4%)</span>
                <span className="text-slate-600">19 (7-9.9)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
                <span className="font-bold text-rose-800 block">Severe (2.8%)</span>
                <span className="text-slate-600">4 (&lt;7 g/dL)</span>
              </div>
            </div>
          </div>

          {/* Education Enrolment & Attendance */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Education Enrolment & Attendance Stability
              </h3>
              <span className="text-xs font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full">Right to Education</span>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              School continuity and attendance monitoring linked to DBT grant disbursement
            </p>

            <div className="h-6 w-full rounded-xl overflow-hidden flex shadow-inner mb-4">
              <div style={{ width: '78.2%' }} className="bg-sky-600 h-full" title="Regular Attendance: 111 (78.2%)" />
              <div style={{ width: '14.1%' }} className="bg-amber-400 h-full" title="Irregular Attendance: 20 (14.1%)" />
              <div style={{ width: '7.7%' }} className="bg-rose-500 h-full" title="Out of School: 11 (7.7%)" />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200">
                <span className="font-bold text-sky-900 block">Regular (78.2%)</span>
                <span className="text-slate-600">111 in school</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="font-bold text-amber-800 block">Irregular (14.1%)</span>
                <span className="text-slate-600">20 counseling</span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
                <span className="font-bold text-rose-800 block">Out of School (7.7%)</span>
                <span className="text-slate-600">11 bridging</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: District-Wise Caseload & Performance Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs mb-8">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">District Administrative Performance</h2>
              <p className="text-xs text-slate-500 mt-0.5">Disbursement, suppression rate, and nutritional risk across operational nodes</p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">5 Active Clusters</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-900">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4 text-center">Enrolled Children</th>
                  <th className="py-3 px-4 text-center">VL Suppressed</th>
                  <th className="py-3 px-4 text-center">Suppression Rate</th>
                  <th className="py-3 px-4 text-center">Nutritional Risk</th>
                  <th className="py-3 px-4">Total DBT Disbursed</th>
                  <th className="py-3 px-4 text-right">Bank KYC %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {districtData.map((d) => {
                  const rate = Math.round((d.vlSuppressed / d.total) * 100);
                  return (
                    <tr key={d.name} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-teal-700" />
                        <span>{d.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold">{d.total}</td>
                      <td className="py-3.5 px-4 text-center text-emerald-700 font-bold">{d.vlSuppressed}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            rate >= 85
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {rate}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]">
                          {d.underweight} ({Math.round((d.underweight / d.total) * 100)}%)
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-teal-900">₹{d.grant.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-700">{d.kyc}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
