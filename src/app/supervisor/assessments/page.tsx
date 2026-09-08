'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  Search,
  TableProperties,
  BarChart3,
  Download,
  Filter,
  ArrowLeft,
  Eye,
  Pencil,
  Trash2,
  Activity,
  School,
  HeartHandshake,
  Building2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { BMICategory, VLCategory, HbCategory, SchoolType, OrphanStatus } from '@/types/domain';

interface BeneficiaryRow {
  id: string;
  artNumber: string;
  childName: string;
  age: number;
  gender: string;
  district: string;
  schoolType: string;
  orphanStatus: string;
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

export default function SupervisorAssessmentsPage() {
  const [data, setData] = useState<BeneficiaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolTypeFilter, setSchoolTypeFilter] = useState('ALL');
  const [orphanStatusFilter, setOrphanStatusFilter] = useState('ALL');
  const [vlFilter, setVlFilter] = useState('ALL');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState<{ id: string; name: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchSubmissions = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/submissions?limit=100');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data) || Array.isArray(json.items)) {
          const rawItems = Array.isArray(json.data) ? json.data : json.items;
          const mapped: BeneficiaryRow[] = rawItems.map((it: any) => {
            const rawBmi = it.nutrition?.bmi || it.clinical?.bmi || it.bmi || 0;
            let bmiCat: BMICategory = 'Normal';
            if (rawBmi > 0) {
              if (rawBmi < 13.5) bmiCat = 'Severe Underweight';
              else if (rawBmi < 15.0) bmiCat = 'Moderate Underweight';
              else if (rawBmi > 22.0) bmiCat = 'Overweight / Obese';
            }

            const rawVl = it.clinical?.viralLoad ?? it.clinical?.viralload ?? it.viralload ?? '';
            const numVl = parseFloat(String(rawVl).replace(/[^0-9.]/g, ''));
            let vlCat: VLCategory = 'Unknown / Pending';
            if (String(rawVl).toLowerCase().includes('undetect') || String(rawVl).includes('<50') || numVl < 50) {
              vlCat = 'Undetectable (<50 copies/mL)';
            } else if (!isNaN(numVl)) {
              if (numVl < 1000) vlCat = 'Suppressed (<1000 copies/mL)';
              else vlCat = 'Unsuppressed (≥1000 copies/mL)';
            }

            const rawHb = it.clinical?.hemoglobin ?? it.clinical?.haemoglobin ?? it.hemoglobin ?? '';
            const numHb = parseFloat(String(rawHb));
            let hbCat: HbCategory = 'Normal';
            if (!isNaN(numHb) && numHb > 0) {
              if (numHb < 7.0) hbCat = 'Severe Anemia';
              else if (numHb < 10.0) hbCat = 'Moderate Anemia';
              else if (numHb < 11.0) hbCat = 'Mild Anemia';
            }

            return {
              id: it.id || it.demographics?.artNumber || it.clientSubmissionId || it._uuid,
              artNumber: it.demographics?.artNumber || it.art_number || 'MH-BEN-00',
              childName: it.demographics?.childName || it.child_name || 'Beneficiary Child',
              age: it.demographics?.calculatedAgeYears ?? it.calculated_age ?? 0,
              gender: it.demographics?.gender || it.gender || '—',
              district: it.demographics?.district || it.district || 'General',
              schoolType: it.educationStatus?.schoolType || it.education?.schoolType || it.school_type || 'Government school',
              orphanStatus: it.demographics?.orphanStatus || it.orphan_status || 'Both parents alive',
              bmi: Number(rawBmi) || 0,
              bmiCategory: (it.clinical?.bmiCategory || it.bmicategory || bmiCat) as BMICategory,
              viralLoad: rawVl || '—',
              vlCategory: (it.clinical?.vlCategory || it.vl_category || vlCat) as VLCategory,
              hemoglobin: rawHb || '—',
              hbCategory: (it.clinical?.hbCategory || it.hb_category || hbCat) as HbCategory,
              grantAmount: it.grantCalculation?.totalGrantAmount || it.recommended_grant_amount || it.educationExpenses?.totalRequiredSupport || 0,
              syncState: 'SYNCED',
              lastVisit: (it.updatedAt || it.createdAt || new Date().toISOString()).split('T')[0],
              version: it.version || 1,
            };
          });
          setData(mapped);
        } else {
          setData([]);
        }
      }
    } catch (err) {
      console.warn('Error fetching linelist:', err);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleDeleteRecord = async () => {
    if (!deleteConfirmId) return;
    const { id, name } = deleteConfirmId;
    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setData((prev) => prev.filter((r) => r.id !== id));
        setToastMessage(`Record for ${name} successfully deleted.`);
        setTimeout(() => setToastMessage(null), 3500);
      } else {
        alert('Failed to delete record. Please check network connection.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Error connecting to server to delete record.');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Filtered dataset using School Type, Orphan Status, Viral Load, District, and Search
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        !term ||
        row.childName.toLowerCase().includes(term) ||
        row.artNumber.toLowerCase().includes(term) ||
        row.district.toLowerCase().includes(term);

      const matchesSchoolType =
        schoolTypeFilter === 'ALL' ||
        row.schoolType.toLowerCase().includes(schoolTypeFilter.toLowerCase());

      const matchesOrphanStatus =
        orphanStatusFilter === 'ALL' ||
        row.orphanStatus.toLowerCase().includes(orphanStatusFilter.toLowerCase());

      const matchesVl =
        vlFilter === 'ALL' ||
        (vlFilter === 'SUPPRESSED' && (row.vlCategory.includes('Suppressed') || row.vlCategory.includes('Undetectable'))) ||
        (vlFilter === 'UNSUPPRESSED' && row.vlCategory.includes('Unsuppressed')) ||
        (vlFilter === 'UNDETECTABLE' && row.vlCategory.includes('Undetectable'));

      const matchesDistrict =
        districtFilter === 'ALL' || row.district.toLowerCase() === districtFilter.toLowerCase();

      return matchesSearch && matchesSchoolType && matchesOrphanStatus && matchesVl && matchesDistrict;
    });
  }, [data, searchTerm, schoolTypeFilter, orphanStatusFilter, vlFilter, districtFilter]);

  const hasActiveFilters =
    searchTerm !== '' ||
    schoolTypeFilter !== 'ALL' ||
    orphanStatusFilter !== 'ALL' ||
    vlFilter !== 'ALL' ||
    districtFilter !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setSchoolTypeFilter('ALL');
    setOrphanStatusFilter('ALL');
    setVlFilter('ALL');
    setDistrictFilter('ALL');
  };

  const handleExportCSV = () => {
    const headers = [
      'Reference ID',
      'Child Name',
      'Age',
      'Gender',
      'District',
      'School Type',
      'Orphan Status',
      'BMI',
      'BMI Category',
      'Viral Load',
      'VL Status',
      'Haemoglobin (g/dL)',
      'Hb Category',
      'Grant Amount (INR)',
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
          `"${r.schoolType}"`,
          `"${r.orphanStatus}"`,
          r.bmi,
          `"${r.bmiCategory}"`,
          `"${r.viralLoad}"`,
          `"${r.vlCategory}"`,
          `"${r.hemoglobin}"`,
          `"${r.hbCategory}"`,
          r.grantAmount,
          r.lastVisit,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alliance_india_linelist_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

        {/* Exclusive Supervisor Tab Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 mb-6 gap-3">
          <div className="flex items-center space-x-1 overflow-x-auto">
            <Link
              href="/supervisor"
              className="flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap"
            >
              <Activity className="h-4 w-4" />
              <span>Overview &amp; Surveillance</span>
            </Link>
            <Link
              href="/supervisor/assessments"
              className="flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 border-teal-600 text-teal-800 bg-teal-50/50 rounded-t-lg whitespace-nowrap"
            >
              <TableProperties className="h-4 w-4 text-teal-600" />
              <span>Master Linelist</span>
            </Link>
            <Link
              href="/supervisor/analytics"
              className="flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Clinical Analytics</span>
            </Link>
          </div>

          <div className="flex items-center space-x-2 pb-2 sm:pb-0">
            <Button variant="ghost" size="sm" onClick={fetchSubmissions} className="h-9 px-2.5 text-xs text-slate-600">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin text-teal-700' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button variant="primary" onClick={handleExportCSV} size="sm" className="shadow-xs text-xs h-9">
              <Download className="h-4 w-4 mr-1.5" />
              <span>Export CSV ({filteredData.length})</span>
            </Button>
          </div>
        </div>

        {/* Precision Multi-Dimension Filters: School Type, Orphan Status, Viral Load, District */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search ID, child name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              />
            </div>

            {/* School Type Filter */}
            <div className="flex items-center space-x-2">
              <School className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                value={schoolTypeFilter}
                onChange={(e) => setSchoolTypeFilter(e.target.value)}
              >
                <option value="ALL">All School Types</option>
                <option value="Government">Government School</option>
                <option value="Private">Private School</option>
                <option value="Aided">Aided School</option>
                <option value="Not In School">Not in School / Dropped out</option>
              </select>
            </div>

            {/* Orphan Status Filter */}
            <div className="flex items-center space-x-2">
              <HeartHandshake className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                value={orphanStatusFilter}
                onChange={(e) => setOrphanStatusFilter(e.target.value)}
              >
                <option value="ALL">All Orphan Statuses</option>
                <option value="Both parents alive">Both parents alive</option>
                <option value="Single orphan">Single orphan</option>
                <option value="Double orphan">Double orphan</option>
              </select>
            </div>

            {/* HIV Viral Load Filter */}
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
            <div className="flex items-center space-x-2">
              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
              >
                <option value="ALL">All Districts</option>
                <option value="Pune">Pune</option>
                <option value="Mumbai Suburban">Mumbai Suburban</option>
                <option value="Thane">Thane</option>
                <option value="Solapur">Solapur</option>
                <option value="Nashik">Nashik</option>
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Filtered: <strong>{filteredData.length}</strong> of <strong>{data.length}</strong> records
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-teal-700 font-bold hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Desktop View: Full Data Grid (>= 768px) - NO VERSION COLUMN */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-900">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">Reference ID</th>
                  <th className="py-3 px-4">Child Name</th>
                  <th className="py-3 px-4">Age / Sex</th>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4">School & Orphan</th>
                  <th className="py-3 px-4">BMI & Growth</th>
                  <th className="py-3 px-4">Viral Load</th>
                  <th className="py-3 px-4">Haemoglobin</th>
                  <th className="py-3 px-4">Grant (INR)</th>
                  <th className="py-3 px-4">Last Visit</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-xs text-slate-400">
                      Loading linelist surveys...
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center">
                      <div className="max-w-xs mx-auto text-center space-y-2">
                        <AlertCircle className="h-8 w-8 text-slate-300 mx-auto" />
                        <h4 className="text-sm font-bold text-slate-700">No Survey Records Found</h4>
                        <p className="text-xs text-slate-400">
                          {hasActiveFilters
                            ? 'No records match the selected filters.'
                            : 'Submitted surveys from field caseworkers will appear here in real-time.'}
                        </p>
                        {hasActiveFilters && (
                          <Button variant="secondary" size="sm" onClick={resetFilters} className="mt-2 text-xs">
                            Reset Filters
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-teal-800">
                        <Link href={`/assessment/record/${row.id}`} className="hover:underline">
                          {row.artNumber}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{row.childName}</td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {row.age} yrs • {row.gender}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{row.district}</td>

                      {/* School & Orphan Status */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="font-medium text-slate-800">{row.schoolType}</div>
                        <div className="text-[10px] text-slate-400">{row.orphanStatus}</div>
                      </td>

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
                          {row.bmiCategory} {row.bmi > 0 ? `(${row.bmi})` : ''}
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
                          {row.hemoglobin} {row.hemoglobin !== '—' ? 'g/dL' : ''}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-teal-900">₹{row.grantAmount.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-4 text-slate-500">{row.lastVisit}</td>

                      {/* Premium Action Icons: View, Edit, Delete */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* 1. View Survey */}
                          <Link
                            href={`/assessment/record/${row.id}`}
                            title="View Survey"
                            className="p-1.5 text-teal-700 bg-teal-50 hover:bg-teal-100 hover:text-teal-900 rounded-lg transition-colors border border-teal-200/60 shadow-2xs"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>

                          {/* 2. Edit Survey */}
                          <Link
                            href={`/assessment/record/${row.id}/edit`}
                            title="Edit Survey"
                            className="p-1.5 text-amber-700 bg-amber-50 hover:bg-amber-100 hover:text-amber-900 rounded-lg transition-colors border border-amber-200/60 shadow-2xs"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>

                          {/* 3. Delete Survey */}
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId({ id: row.id, name: row.childName })}
                            title="Delete Survey"
                            className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 rounded-lg transition-colors border border-rose-200/60 shadow-2xs cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile View: Cards Over Tables (< 768px) - NO VERSION */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading surveys...</div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
              No survey records found.
            </div>
          ) : (
            filteredData.map((row) => (
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
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {row.schoolType} • {row.orphanStatus}
                </p>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Viral Load:</span>
                    <span className={`font-bold ${row.vlCategory.includes('Unsuppressed') ? 'text-rose-600' : 'text-teal-700'}`}>
                      {row.vlCategory.includes('Unsuppressed') ? `${row.viralLoad} c/mL` : 'Suppressed'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Grant:</span>
                    <span className="font-bold text-teal-900">₹{row.grantAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Mobile Action Icons */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">{row.lastVisit}</span>
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/assessment/record/${row.id}`}
                      className="p-1.5 text-teal-700 bg-teal-50 rounded-lg border border-teal-200/60"
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/assessment/record/${row.id}/edit`}
                      className="p-1.5 text-amber-700 bg-amber-50 rounded-lg border border-amber-200/60"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId({ id: row.id, name: row.childName })}
                      className="p-1.5 text-rose-600 bg-rose-50 rounded-lg border border-rose-200/60"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
              <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Delete Survey?</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete the survey record for{' '}
                <strong className="text-slate-900">{deleteConfirmId.name}</strong>? This action cannot be undone.
              </p>
              <div className="mt-5 flex items-center justify-end space-x-2">
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)} className="text-xs">
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={handleDeleteRecord} className="text-xs">
                  Yes, Delete Survey
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
