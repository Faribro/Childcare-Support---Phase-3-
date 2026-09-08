'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  ShieldCheck,
  TableProperties,
  BarChart3,
  Users,
  AlertTriangle,
  HeartPulse,
  GraduationCap,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Clock,
  CheckCircle2,
  FileCheck,
} from 'lucide-react';

interface SupervisorRecord {
  id: string;
  artNumber: string;
  childName: string;
  age: number;
  gender: string;
  district: string;
  nutritionStatus: 'Normal' | 'MAM (Moderate Acute Malnutrition)' | 'SAM (Severe Acute Malnutrition)';
  grantAmount: number;
  syncState: 'SYNCED' | 'QUEUED';
  lastVisit: string;
  version: number;
}

const DEFAULT_RECORDS: SupervisorRecord[] = [
  {
    id: 'MH-PUN-0842-01',
    artNumber: 'MH-PUN-0842-01',
    childName: 'Pooja Ramesh K.',
    age: 7,
    gender: 'Female',
    district: 'Pune',
    nutritionStatus: 'SAM (Severe Acute Malnutrition)',
    grantAmount: 3500,
    syncState: 'SYNCED',
    lastVisit: '2026-09-04',
    version: 1,
  },
  {
    id: 'MH-PUN-0914-02',
    artNumber: 'MH-PUN-0914-02',
    childName: 'Aarav Sachin P.',
    age: 5,
    gender: 'Male',
    district: 'Pune',
    nutritionStatus: 'MAM (Moderate Acute Malnutrition)',
    grantAmount: 3000,
    syncState: 'SYNCED',
    lastVisit: '2026-09-05',
    version: 1,
  },
  {
    id: 'MH-MUM-1102-03',
    artNumber: 'MH-MUM-1102-03',
    childName: 'Tanvi Dilip M.',
    age: 9,
    gender: 'Female',
    district: 'Mumbai Suburban',
    nutritionStatus: 'Normal',
    grantAmount: 2000,
    syncState: 'SYNCED',
    lastVisit: '2026-09-06',
    version: 1,
  },
  {
    id: 'MH-THN-0418-04',
    artNumber: 'MH-THN-0418-04',
    childName: 'Omkar Suresh V.',
    age: 11,
    gender: 'Male',
    district: 'Thane',
    nutritionStatus: 'Normal',
    grantAmount: 2000,
    syncState: 'SYNCED',
    lastVisit: '2026-09-07',
    version: 1,
  },
  {
    id: 'MH-PUN-1049-05',
    artNumber: 'MH-PUN-1049-05',
    childName: 'Rahul Manoj S.',
    age: 6,
    gender: 'Male',
    district: 'Pune',
    nutritionStatus: 'SAM (Severe Acute Malnutrition)',
    grantAmount: 4500,
    syncState: 'SYNCED',
    lastVisit: '2026-09-08',
    version: 2,
  },
];

export default function SupervisorDashboardPage() {
  const [records, setRecords] = useState<SupervisorRecord[]>(DEFAULT_RECORDS);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadServerRecords() {
      try {
        const res = await fetch('/api/submissions?limit=10');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            const mapped: SupervisorRecord[] = data.items.map((it: any) => ({
              id: it.id || it.demographics?.artNumber || it.clientSubmissionId,
              artNumber: it.demographics?.artNumber || 'MH-GEN-00',
              childName: it.demographics?.childName || 'Beneficiary Child',
              age: it.demographics?.calculatedAgeYears ?? 5,
              gender: it.demographics?.gender || 'Unknown',
              district: it.demographics?.district || 'General',
              nutritionStatus: it.nutrition?.nutritionStatus || 'Normal',
              grantAmount: it.grantCalculation?.totalGrantAmount || 2000,
              syncState: 'SYNCED',
              lastVisit: (it.updatedAt || it.createdAt || new Date().toISOString()).split('T')[0],
              version: it.version || 1,
            }));
            setRecords(mapped);
          }
        }
      } catch (err) {
        console.warn('Using default supervisor dataset:', err);
      }
    }
    loadServerRecords();
  }, []);

  const samCount = records.filter((r) => r.nutritionStatus.includes('SAM')).length;
  const mamCount = records.filter((r) => r.nutritionStatus.includes('MAM')).length;
  const normalCount = records.filter((r) => r.nutritionStatus === 'Normal').length;
  const totalGrant = records.reduce((sum, r) => sum + r.grantAmount, 0);

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        {/* Masthead Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 mb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-teal-700 text-xs font-bold uppercase tracking-wider mb-1">
              <ShieldCheck className="h-4 w-4" />
              <span>Supervisor Clinical & Quality Assurance</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Programme Supervisor Portal</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Authoritative linelist surveillance, OCC audit histories, and clinical triage verification.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/supervisor/assessments">
              <Button variant="secondary" className="shadow-xs">
                <TableProperties className="h-4 w-4 mr-2" />
                <span>Master Linelist</span>
              </Button>
            </Link>
            <Link href="/supervisor/analytics">
              <Button variant="secondary" className="shadow-xs">
                <BarChart3 className="h-4 w-4 mr-2" />
                <span>Analytics</span>
              </Button>
            </Link>
            <Link href="/assessment/new">
              <Button variant="primary">New Intake</Button>
            </Link>
          </div>
        </div>

        {/* Executive KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Evaluated</span>
              <Users className="h-4 w-4 text-teal-700" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{records.length}</div>
            <p className="text-[11px] text-teal-700 font-medium mt-1 flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" />
              <span>Active Linelist Records</span>
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">SAM Flagged</span>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-rose-600">{samCount}</div>
            <p className="text-[11px] text-slate-500 mt-1">
              Urgent NRC clinical referral
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">MAM Flagged</span>
              <HeartPulse className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-amber-600">{mamCount}</div>
            <p className="text-[11px] text-slate-500 mt-1">
              Supplementary nutrition tracking
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700">DBT Entitlement</span>
              <GraduationCap className="h-4 w-4 text-teal-700" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-teal-900">₹{totalGrant.toLocaleString('en-IN')}</div>
            <p className="text-[11px] text-slate-500 mt-1">
              Committed child grant pool
            </p>
          </div>
        </div>

        {/* Navigation Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/supervisor/assessments"
            className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-teal-500 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl">
                <TableProperties className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-teal-700 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-800">Master Line-List Repository</h3>
            <p className="text-xs text-slate-500 mt-1">
              Search, filter, and inspect verified field records across all administrative districts.
            </p>
          </Link>

          <Link
            href="/supervisor/analytics"
            className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-teal-500 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl">
                <BarChart3 className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-teal-700 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-800">Programme Analytics</h3>
            <p className="text-xs text-slate-500 mt-1">
              Epidemiological prevalence curves, SAM/MAM distribution, and educational support disbursement.
            </p>
          </Link>

          <Link
            href="/assessment/sync"
            className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-teal-500 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl">
                <RefreshCw className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-teal-700 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-800">Field Sync Centre</h3>
            <p className="text-xs text-slate-500 mt-1">
              Inspect device outbox queues, offline sync state, and retry transient errors with jitter.
            </p>
          </Link>
        </div>

        {/* Recent Submissions Linelist Preview */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Synchronized Submissions</h2>
              <p className="text-xs text-slate-500 mt-0.5">Authoritative records with full OCC version control</p>
            </div>
            <Link href="/supervisor/assessments">
              <Button variant="ghost" size="sm" className="text-teal-700">
                <span>View All ({records.length})</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-900">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">Reference ID</th>
                  <th className="py-3 px-4">Child Name</th>
                  <th className="py-3 px-4">Age / Sex</th>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4">Nutrition Status</th>
                  <th className="py-3 px-4">Grant Amount</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.slice(0, 5).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-teal-800">
                      <Link href={`/supervisor/assessments/${row.id}`} className="hover:underline">
                        {row.artNumber}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{row.childName}</td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {row.age} yrs • {row.gender}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{row.district}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          row.nutritionStatus.includes('SAM')
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : row.nutritionStatus.includes('MAM')
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {row.nutritionStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-teal-900">₹{row.grantAmount.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">v{row.version}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Link href={`/supervisor/assessments/${row.id}`}>
                          <Button variant="secondary" size="sm" className="h-8 px-2.5 text-xs">
                            <span>Audit</span>
                          </Button>
                        </Link>
                        <Link href={`/assessment/record/${row.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-teal-700">
                            <span>View Record</span>
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
