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
  Activity,
  HeartPulse,
} from 'lucide-react';
import type { BMICategory, VLCategory, HbCategory } from '@/types/domain';

interface BeneficiaryRow {
  id: string;
  artNumber: string;
  childName: string;
  age: number;
  gender: string;
  district: string;
  bmi: number;
  bmiCategory: BMICategory;
  viralLoad: string | number;
  vlCategory: VLCategory;
  hemoglobin: string | number;
  hbCategory: HbCategory;
  grantAmount: number;
  syncState: 'SYNCED' | 'QUEUED';
  lastVisit: string;
  version: number;
}

const SAMPLE_BENEFICIARIES: BeneficiaryRow[] = [
  {
    id: 'MH-PUN-0842-01',
    artNumber: 'MH-PUN-0842',
    childName: 'Pooja Ramesh K.',
    age: 7,
    gender: 'Female',
    district: 'Pune',
    bmi: 11.6,
    bmiCategory: 'Severe Underweight',
    viralLoad: '34',
    vlCategory: 'Undetectable (<50 copies/mL)',
    hemoglobin: '11.2',
    hbCategory: 'Normal',
    grantAmount: 3500,
    syncState: 'SYNCED',
    lastVisit: '2026-09-04',
    version: 1,
  },
  {
    id: 'MH-PUN-0914-02',
    artNumber: 'MH-PUN-0914',
    childName: 'Aarav Sachin P.',
    age: 5,
    gender: 'Male',
    district: 'Pune',
    bmi: 13.6,
    bmiCategory: 'Moderate Underweight',
    viralLoad: '120',
    vlCategory: 'Suppressed (<1000 copies/mL)',
    hemoglobin: '9.4',
    hbCategory: 'Moderate Anemia',
    grantAmount: 3000,
    syncState: 'SYNCED',
    lastVisit: '2026-09-05',
    version: 1,
  },
  {
    id: 'MH-MUM-1102-03',
    artNumber: 'MH-MUM-1102',
    childName: 'Tanvi Dilip M.',
    age: 9,
    gender: 'Female',
    district: 'Mumbai Suburban',
    bmi: 15.8,
    bmiCategory: 'Normal',
    viralLoad: '28',
    vlCategory: 'Undetectable (<50 copies/mL)',
    hemoglobin: '12.1',
    hbCategory: 'Normal',
    grantAmount: 2000,
    syncState: 'SYNCED',
    lastVisit: '2026-09-06',
    version: 1,
  },
  {
    id: 'MH-THN-0418-04',
    artNumber: 'MH-THN-0418',
    childName: 'Omkar Suresh V.',
    age: 11,
    gender: 'Male',
    district: 'Thane',
    bmi: 16.2,
    bmiCategory: 'Normal',
    viralLoad: '1850',
    vlCategory: 'Unsuppressed (≥1000 copies/mL)',
    hemoglobin: '11.6',
    hbCategory: 'Normal',
    grantAmount: 2000,
    syncState: 'SYNCED',
    lastVisit: '2026-09-07',
    version: 1,
  },
  {
    id: 'MH-PUN-1049-05',
    artNumber: 'MH-PUN-1049',
    childName: 'Rahul Manoj S.',
    age: 6,
    gender: 'Male',
    district: 'Pune',
    bmi: 12.5,
    bmiCategory: 'Severe Underweight',
    viralLoad: '420',
    vlCategory: 'Suppressed (<1000 copies/mL)',
    hemoglobin: '6.8',
    hbCategory: 'Severe Anemia',
    grantAmount: 4500,
    syncState: 'SYNCED',
    lastVisit: '2026-09-08',
    version: 2,
  },
];

export default function SupervisorAssessmentsPage() {
  const [data, setData] = useState<BeneficiaryRow[]>(SAMPLE_BENEFICIARIES);
  const [searchTerm, setSearchTerm] = useState('');
  const [bmiFilter, setBmiFilter] = useState('ALL');
  const [vlFilter, setVlFilter] = useState('ALL');
  const [districtFilter, setDistrictFilter] = useState('ALL');

  useEffect(() => {
    async function fetchSubmissions() {
      try {
        const res = await fetch('/api/submissions?limit=50');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.items) && json.items.length > 0) {
            const mapped: BeneficiaryRow[] = json.items.map((it: any) => {
              const rawBmi = it.nutrition?.bmi || it.clinical?.bmi || it.bmi || 14;
              let bmiCat: BMICategory = 'Normal';
              if (rawBmi < 13.5) bmiCat = 'Severe Underweight';
              else if (rawBmi < 15.0) bmiCat = 'Moderate Underweight';
              else if (rawBmi > 22.0) bmiCat = 'Overweight / Obese';

              const rawVl = it.clinical?.viralLoad ?? it.clinical?.viralload ?? it.viralload ?? '40';
              const numVl = parseFloat(String(rawVl).replace(/[^0-9.]/g, ''));
              let vlCat: VLCategory = 'Suppressed (<1000 copies/mL)';
              if (!isNaN(numVl)) {
                if (numVl < 50) vlCat = 'Undetectable (<50 copies/mL)';
                else if (numVl >= 1000) vlCat = 'Unsuppressed (≥1000 copies/mL)';
              }

              const rawHb = it.clinical?.hemoglobin ?? it.clinical?.haemoglobin ?? it.hemoglobin ?? '11.5';
              const numHb = parseFloat(String(rawHb));
              let hbCat: HbCategory = 'Normal';
              if (!isNaN(numHb)) {
                if (numHb < 7.0) hbCat = 'Severe Anemia';
                else if (numHb < 10.0) hbCat = 'Moderate Anemia';
                else if (numHb < 11.0) hbCat = 'Mild Anemia';
              }

              return {
                id: it.id || it.demographics?.artNumber || it.clientSubmissionId,
                artNumber: it.demographics?.artNumber || it.art_number || 'MH-GEN-00',
                childName: it.demographics?.childName || it.child_name || 'Beneficiary Child',
                age: it.demographics?.calculatedAgeYears ?? it.calculated_age ?? 5,
                gender: it.demographics?.gender || it.gender || 'Unknown',
                district: it.demographics?.district || it.district || 'General',
                bmi: Number(rawBmi) || 14,
                bmiCategory: (it.clinical?.bmiCategory || it.bmicategory || bmiCat) as BMICategory,
                viralLoad: rawVl,
                vlCategory: (it.clinical?.vlCategory || it.vl_category || vlCat) as VLCategory,
                hemoglobin: rawHb,
                hbCategory: (it.clinical?.hbCategory || it.hb_category || hbCat) as HbCategory,
                grantAmount: it.grantCalculation?.totalGrantAmount || it.recommended_grant_amount || 2000,
                syncState: 'SYNCED',
                lastVisit: (it.updatedAt || it.createdAt || new Date().toISOString()).split('T')[0],
                version: it.version || 1,
              };
            });
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
        row.artNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.district.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesBmi =
        bmiFilter === 'ALL' ||
        (bmiFilter === 'NORMAL' && row.bmiCategory === 'Normal') ||
        (bmiFilter === 'MODERATE' && row.bmiCategory === 'Moderate Underweight') ||
        (bmiFilter === 'SEVERE' && row.bmiCategory === 'Severe Underweight') ||
        (bmiFilter === 'OVERWEIGHT' && row.bmiCategory === 'Overweight / Obese');

      const matchesVl =
        vlFilter === 'ALL' ||
        (vlFilter === 'SUPPRESSED' && (row.vlCategory.includes('Suppressed') || row.vlCategory.includes('Undetectable'))) ||
        (vlFilter === 'UNSUPPRESSED' && row.vlCategory.includes('Unsuppressed')) ||
        (vlFilter === 'UNDETECTABLE' && row.vlCategory.includes('Undetectable'));

      const matchesDistrict =
        districtFilter === 'ALL' || row.district.toLowerCase() === districtFilter.toLowerCase();

      return matchesSearch && matchesBmi && matchesVl && matchesDistrict;
    });
  }, [data, searchTerm, bmiFilter, vlFilter, districtFilter]);

  const handleExportCSV = () => {
    const headers = [
      'Assessment Reference ID',
      'Child Name',
      'Age',
      'Gender',
      'District',
      'BMI',
      'BMI Growth Category',
      'Viral Load (copies/mL)',
      'VL Suppression Status',
      'Haemoglobin (g/dL)',
      'Hb Anemia Status',
      'DBT Grant Amount (INR)',
      'Sync State',
      'OCC Version',
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
          r.bmi,
          `"${r.bmiCategory}"`,
          `"${r.viralLoad}"`,
          `"${r.vlCategory}"`,
          `"${r.hemoglobin}"`,
          `"${r.hbCategory}"`,
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
    a.download = `alliance_india_master_linelist_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        {/* Header - NO NEW INTAKE BUTTON */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 mb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-teal-700 text-xs font-bold uppercase tracking-wider mb-1">
              <TableProperties className="h-4 w-4" />
              <span>Supervisor Linelist Surveillance Repository</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Beneficiary Master Line-List</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Authoritative records with clinical HIV viral load suppression, BMI growth staging, and DBT grant entitlements.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/supervisor">
              <Button variant="secondary" size="sm" className="shadow-xs text-xs h-9">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                <span>Dashboard</span>
              </Button>
            </Link>

            <Button variant="primary" onClick={handleExportCSV} size="sm" className="shadow-xs text-xs h-9">
              <Download className="h-4 w-4 mr-1.5" />
              <span>Export CSV ({filteredData.length})</span>
            </Button>
          </div>
        </div>

        {/* Precision Clinical Filter Controls Bar (NO SAM / NO MAM) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search ID, child name, district..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              />
            </div>

            {/* BMI Growth Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                value={bmiFilter}
                onChange={(e) => setBmiFilter(e.target.value)}
              >
                <option value="ALL">All Growth / BMI Tiers</option>
                <option value="SEVERE">Severe Underweight (BMI &lt; 13.5)</option>
                <option value="MODERATE">Moderate Underweight (BMI 13.5-14.9)</option>
                <option value="NORMAL">Normal Growth (BMI 15-22)</option>
                <option value="OVERWEIGHT">Overweight / Obese</option>
              </select>
            </div>

            {/* HIV Viral Load Suppression Filter */}
            <div className="flex items-center space-x-2">
              <Activity className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                value={vlFilter}
                onChange={(e) => setVlFilter(e.target.value)}
              >
                <option value="ALL">All Viral Load Status</option>
                <option value="SUPPRESSED">Suppressed (&lt;1,000 c/mL)</option>
                <option value="UNDETECTABLE">Undetectable (&lt;50 c/mL)</option>
                <option value="UNSUPPRESSED">High Viral Load (≥1,000 c/mL)</option>
              </select>
            </div>

            {/* District Filter */}
            <select
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
            >
              <option value="ALL">All Operational Districts</option>
              <option value="Pune">Pune District</option>
              <option value="Mumbai Suburban">Mumbai Suburban</option>
              <option value="Thane">Thane District</option>
              <option value="Solapur">Solapur District</option>
              <option value="Nashik">Nashik District</option>
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
                  <th className="py-3 px-4">BMI & Growth</th>
                  <th className="py-3 px-4">Viral Load</th>
                  <th className="py-3 px-4">Haemoglobin</th>
                  <th className="py-3 px-4">Grant (INR)</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Last Visit</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-xs text-slate-400">
                      No records matched your search or clinical filters.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row) => (
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

                      {/* BMI & Growth */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            row.bmiCategory === 'Severe Underweight'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : row.bmiCategory === 'Moderate Underweight'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {row.bmiCategory} ({row.bmi})
                        </span>
                      </td>

                      {/* Viral Load */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            row.vlCategory.includes('Unsuppressed')
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-teal-50 text-teal-800 border border-teal-200'
                          }`}
                        >
                          {row.vlCategory.includes('Unsuppressed')
                            ? `${row.viralLoad} c/mL (High)`
                            : row.vlCategory.includes('Undetectable')
                            ? 'Undetectable'
                            : 'Suppressed'}
                        </span>
                      </td>

                      {/* Haemoglobin */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                            row.hbCategory === 'Severe Anemia'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : row.hbCategory === 'Moderate Anemia'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.hemoglobin} g/dL
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
                  ))
                )}
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
                    row.bmiCategory === 'Severe Underweight'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : row.bmiCategory === 'Moderate Underweight'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {row.bmiCategory}
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900">{row.childName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {row.age} yrs • {row.gender} • {row.district}
              </p>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Viral Load:</span>
                  <span className={`font-bold ${row.vlCategory.includes('Unsuppressed') ? 'text-rose-600' : 'text-teal-700'}`}>
                    {row.vlCategory.includes('Unsuppressed') ? `${row.viralLoad} c/mL (High)` : 'Suppressed'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Haemoglobin:</span>
                  <span className="font-bold text-slate-700">{row.hemoglobin} g/dL</span>
                </div>
              </div>

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
