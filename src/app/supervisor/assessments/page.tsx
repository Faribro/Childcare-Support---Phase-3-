'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  TableProperties,
  Search,
  Download,
  Filter,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';

interface BeneficiaryRow {
  id: string;
  artNumber: string;
  childName: string;
  age: number;
  gender: string;
  district: string;
  nutritionStatus: 'Normal' | 'MAM (Moderate Acute Malnutrition)' | 'SAM (Severe Acute Malnutrition)';
  bmi: number;
  grantAmount: number;
  syncState: 'SYNCED' | 'QUEUED';
  lastVisit: string;
  version: number;
}

const SAMPLE_BENEFICIARIES: BeneficiaryRow[] = [
  {
    id: 'MH-PUN-0842-01',
    artNumber: 'MH-PUN-0842-01',
    childName: 'Pooja Ramesh K.',
    age: 7,
    gender: 'Female',
    district: 'Pune',
    nutritionStatus: 'SAM (Severe Acute Malnutrition)',
    bmi: 12.8,
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
    bmi: 13.6,
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
    bmi: 15.8,
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
    bmi: 16.2,
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
    bmi: 12.1,
    grantAmount: 4500,
    syncState: 'SYNCED',
    lastVisit: '2026-09-08',
    version: 2,
  },
];

export default function SupervisorAssessmentsPage() {
  const [data, setData] = useState<BeneficiaryRow[]>(SAMPLE_BENEFICIARIES);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [districtFilter, setDistrictFilter] = useState('ALL');

  useEffect(() => {
    async function fetchSubmissions() {
      try {
        const res = await fetch('/api/submissions?limit=50');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.items) && json.items.length > 0) {
            const mapped: BeneficiaryRow[] = json.items.map((it: any) => ({
              id: it.id || it.demographics?.artNumber || it.clientSubmissionId,
              artNumber: it.demographics?.artNumber || 'MH-GEN-00',
              childName: it.demographics?.childName || 'Beneficiary Child',
              age: it.demographics?.calculatedAgeYears ?? 5,
              gender: it.demographics?.gender || 'Unknown',
              district: it.demographics?.district || 'General',
              nutritionStatus: it.nutrition?.nutritionStatus || 'Normal',
              bmi: it.nutrition?.bmi || 14.5,
              grantAmount: it.grantCalculation?.totalGrantAmount || 2000,
              syncState: 'SYNCED',
              lastVisit: (it.updatedAt || it.createdAt || new Date().toISOString()).split('T')[0],
              version: it.version || 1,
            }));
            setData(mapped);
          }
        }
      } catch (err) {
        console.warn('Using baseline dataset for linelist:', err);
      }
    }
    fetchSubmissions();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      const matchesSearch =
        row.childName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.artNumber.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'SAM' && row.nutritionStatus.includes('SAM')) ||
        (statusFilter === 'MAM' && row.nutritionStatus.includes('MAM')) ||
        (statusFilter === 'NORMAL' && row.nutritionStatus === 'Normal');

      const matchesDistrict =
        districtFilter === 'ALL' || row.district.toLowerCase() === districtFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesDistrict;
    });
  }, [data, searchTerm, statusFilter, districtFilter]);

  const handleExportCSV = () => {
    const headers = [
      'Assessment Reference ID',
      'Child Name',
      'Age',
      'Gender',
      'District',
      'Nutrition Status',
      'BMI',
      'Grant Amount (INR)',
      'Sync State',
      'Version',
      'Last Visit Date',
    ];
    const csvRows = [
      headers.join(','),
      ...filteredData.map((r) =>
        [
          `"${r.artNumber}"`,
          `"${r.childName}"`,
          r.age,
          r.gender,
          `"${r.district}"`,
          `"${r.nutritionStatus}"`,
          r.bmi,
          r.grantAmount,
          `"${r.syncState}"`,
          r.version,
          r.lastVisit,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `childcare_assessments_master_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 mb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-teal-700 text-xs font-bold uppercase tracking-wider mb-1">
              <TableProperties className="h-4 w-4" />
              <span>Supervisor Linelist Repository</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Beneficiary Master Line-List</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Verified clinical records and grant entitlements synchronized to central Google Sheets.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/supervisor">
              <Button variant="secondary" size="sm" className="shadow-xs">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                <span>Dashboard</span>
              </Button>
            </Link>

            <Button variant="secondary" onClick={handleExportCSV} className="shadow-xs">
              <Download className="h-4 w-4 mr-2" />
              <span>Export CSV</span>
            </Button>

            <Link href="/assessment/new">
              <Button variant="primary">New Intake</Button>
            </Link>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Reference ID or child name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                className="w-full py-2.5 px-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Nutrition Tiers</option>
                <option value="SAM">SAM (Severe Malnutrition)</option>
                <option value="MAM">MAM (Moderate Malnutrition)</option>
                <option value="NORMAL">Normal Nutrition</option>
              </select>
            </div>

            <select
              className="w-full py-2.5 px-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
            >
              <option value="ALL">All Districts</option>
              <option value="Pune">Pune District</option>
              <option value="Mumbai Suburban">Mumbai Suburban</option>
              <option value="Thane">Thane District</option>
              <option value="Solapur">Solapur District</option>
              <option value="Nashik">Nashik District</option>
              <option value="Nagpur">Nagpur District</option>
            </select>
          </div>
        </div>

        {/* Desktop View: Full Data Grid (>= 768px) */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-900">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">Reference ID</th>
                  <th className="py-3 px-4">Child Name</th>
                  <th className="py-3 px-4">Age / Sex</th>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4">Nutrition Staging</th>
                  <th className="py-3 px-4">Grant (INR)</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Last Visit</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((row) => (
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
                    <td className="py-3.5 px-4 text-slate-600">
                      <div>{row.district}</div>
                    </td>
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
                    <td className="py-3.5 px-4 text-slate-500">{row.lastVisit}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Link href={`/supervisor/assessments/${row.id}`}>
                          <Button variant="secondary" size="sm" className="h-8 px-2.5 text-xs">
                            <span>Audit</span>
                          </Button>
                        </Link>
                        <Link href={`/assessment/record/${row.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-teal-700">
                            <ExternalLink className="h-3.5 w-3.5" />
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

        {/* Mobile View: Cards Over Tables (< 768px) */}
        <div className="md:hidden space-y-3">
          {filteredData.map((row) => (
            <div key={row.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                  {row.artNumber}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    row.nutritionStatus.includes('SAM')
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : row.nutritionStatus.includes('MAM')
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {row.nutritionStatus}
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900">{row.childName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {row.age} yrs • {row.gender} • {row.district}
              </p>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 text-[11px]">Grant: </span>
                  <span className="font-bold text-teal-900">₹{row.grantAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-slate-400">v{row.version}</span>
                  <Link href={`/supervisor/assessments/${row.id}`}>
                    <Button variant="secondary" size="sm" className="h-7 px-2 text-xs">
                      Audit
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
