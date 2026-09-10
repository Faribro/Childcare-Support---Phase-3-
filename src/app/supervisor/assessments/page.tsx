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
  Globe,
  Maximize2,
  Cloud,
  Info,
  X,
  FileCheck,
  Loader2,
  Lock,
  ChevronDown,
} from 'lucide-react';
import { SupervisorTabNav } from '@/components/supervisor/SupervisorTabNav';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import {
  useSupervisorData,
  type SupervisorBeneficiaryRow,
  type BeneficiaryDocumentStatus,
} from '@/hooks/useSupervisorData';
import type { BMICategory, VLCategory, HbCategory, SchoolType, OrphanStatus } from '@/types/domain';

type BeneficiaryRow = SupervisorBeneficiaryRow;

export default function SupervisorAssessmentsPage() {
  const { isUnlocked, isLoaded } = useEvaluationAccess();
  const {
    records: data,
    total,
    status,
    isLoading,
    isError,
    isEmpty,
    isOfflineCache,
    error,
    refresh,
    retry,
    setRecords: setData,
    lastRefreshed,
  } = useSupervisorData();

  const [searchTerm, setSearchTerm] = useState('');
  const [schoolTypeFilter, setSchoolTypeFilter] = useState('ALL');
  const [orphanStatusFilter, setOrphanStatusFilter] = useState('ALL');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState<{ id: string; name: string } | null>(null);
  const [activeDocModal, setActiveDocModal] = useState<{
    id: string;
    childName: string;
    artNumber: string;
    status: BeneficiaryDocumentStatus;
  } | null>(null);
  const [updatingApprovalId, setUpdatingApprovalId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleToggleApproval = async (row: BeneficiaryRow) => {
    setUpdatingApprovalId(row.id);
    const nextApproved = !row.isApproved;
    const nextStatus = nextApproved ? 'Approved' : 'Pending';

    // Optimistic UI update
    setData((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              isApproved: nextApproved,
              approvedStatus: nextStatus,
              version: item.version + 1,
            }
          : item
      )
    );

    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': `"${row.version}"`,
        },
        body: JSON.stringify({
          approvedAllianceIndia: nextStatus,
          expectedVersion: row.version,
        }),
      });

      if (res.ok) {
        setToastMessage(
          nextApproved
            ? `Survey for ${row.childName} Approved and marked in central sheet!`
            : `Survey for ${row.childName} marked as Pending.`
        );
        setTimeout(() => setToastMessage(null), 3500);
      } else {
        // Revert on failure
        setData((prev) =>
          prev.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  isApproved: row.isApproved,
                  approvedStatus: row.approvedStatus,
                }
              : item
          )
        );
        alert('Failed to sync approval status to sheet. Please try again.');
      }
    } catch (err) {
      console.error('Approval sync error:', err);
      setData((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                isApproved: row.isApproved,
                approvedStatus: row.approvedStatus,
              }
            : item
        )
      );
      alert('Network error updating approval status.');
    } finally {
      setUpdatingApprovalId(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDocModal(null);
      }
    };
    if (activeDocModal) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeDocModal]);

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

      const matchesDistrict =
        districtFilter === 'ALL' || row.district.toLowerCase() === districtFilter.toLowerCase();

      return matchesSearch && matchesSchoolType && matchesOrphanStatus && matchesDistrict;
    });
  }, [data, searchTerm, schoolTypeFilter, orphanStatusFilter, districtFilter]);

  const hasActiveFilters =
    searchTerm !== '' ||
    schoolTypeFilter !== 'ALL' ||
    orphanStatusFilter !== 'ALL' ||
    districtFilter !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setSchoolTypeFilter('ALL');
    setOrphanStatusFilter('ALL');
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
      'Documents Status',
      'Pending Documents',
      'Approval Status',
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
          `"${r.documentStatus.isComplete ? 'Complete' : 'Pending'}"`,
          `"${r.documentStatus.pendingDocs.join('; ') || 'None'}"`,
          `"${r.isApproved ? 'Approved' : 'Pending'}"`,
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

  if (isLoaded && !isUnlocked) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-md mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Evaluation Linelist Restricted</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Beneficiary evaluation and surveillance records are restricted to authorized personnel.
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
        {/* Toast Alert */}
        {toastMessage && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

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
          <div className="mb-5 bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-rose-900 shadow-xs">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Failed to Load Beneficiary Records</h4>
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

        {/* Offline Cache Indicator Banner */}
        {isOfflineCache && !isError && (
          <div className="mb-5 bg-amber-50/90 border border-amber-300 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 text-amber-900 shadow-xs">
            <div className="flex items-center space-x-2.5 text-xs">
              <Cloud className="w-5 h-5 text-amber-600 shrink-0" />
              <span>
                <strong>Showing Offline Cached Snapshot:</strong> Network connection to central bridge is offline or unavailable. Cached linelist records are preserved.
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              className="text-xs text-amber-900 hover:bg-amber-100/80 border border-amber-300/80 rounded-xl"
            >
              Reconnect
            </Button>
          </div>
        )}

        {/* Precision Command Ribbon: Search, Smart Filter Suite, Open GIS & CSV Export */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 mb-5 shadow-xs transition-all">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Left Suite: Search & Smart Integrated Dropdowns */}
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              {/* Search Field with Integrated Icon and Clear button */}
              <div className="relative flex-1 min-w-[210px] max-w-full sm:max-w-xs">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search ART ID, child name, district..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 pl-10 pr-9 text-xs bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition-all placeholder:text-slate-400 font-medium text-slate-800"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* School Type Filter Pill */}
              <div className="relative min-w-[145px] sm:min-w-[165px] flex-1 sm:flex-initial">
                <School
                  className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
                    schoolTypeFilter !== 'ALL' ? 'text-teal-600' : 'text-slate-400'
                  }`}
                />
                <select
                  className={`w-full h-10 pl-9 pr-8 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium transition-all appearance-none cursor-pointer ${
                    schoolTypeFilter !== 'ALL'
                      ? 'bg-teal-50/80 border-teal-300 text-teal-900 font-semibold shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100/60 border-slate-200 text-slate-700'
                  }`}
                  value={schoolTypeFilter}
                  onChange={(e) => setSchoolTypeFilter(e.target.value)}
                >
                  <option value="ALL">All School Types</option>
                  <option value="Government">Government School</option>
                  <option value="Private">Private School</option>
                  <option value="Aided">Aided School</option>
                  <option value="Not In School">Not in School</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>

              {/* Orphan Status Filter Pill */}
              <div className="relative min-w-[145px] sm:min-w-[170px] flex-1 sm:flex-initial">
                <HeartHandshake
                  className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
                    orphanStatusFilter !== 'ALL' ? 'text-teal-600' : 'text-slate-400'
                  }`}
                />
                <select
                  className={`w-full h-10 pl-9 pr-8 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium transition-all appearance-none cursor-pointer ${
                    orphanStatusFilter !== 'ALL'
                      ? 'bg-teal-50/80 border-teal-300 text-teal-900 font-semibold shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100/60 border-slate-200 text-slate-700'
                  }`}
                  value={orphanStatusFilter}
                  onChange={(e) => setOrphanStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Orphan Statuses</option>
                  <option value="Both parents alive">Both Parents Alive</option>
                  <option value="Single orphan">Single Orphan</option>
                  <option value="Double orphan">Double Orphan</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>

              {/* District Filter Pill */}
              <div className="relative min-w-[130px] sm:min-w-[150px] flex-1 sm:flex-initial">
                <Building2
                  className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
                    districtFilter !== 'ALL' ? 'text-teal-600' : 'text-slate-400'
                  }`}
                />
                <select
                  className={`w-full h-10 pl-9 pr-8 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium transition-all appearance-none cursor-pointer ${
                    districtFilter !== 'ALL'
                      ? 'bg-teal-50/80 border-teal-300 text-teal-900 font-semibold shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100/60 border-slate-200 text-slate-700'
                  }`}
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
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Right Suite: Action Buttons (Open GIS & Export CSV) */}
            <div className="flex items-center gap-2.5 pt-2 lg:pt-0 shrink-0 border-t lg:border-t-0 border-slate-100">
              {/* Open GIS Button */}
              <Link href="/supervisor/gis" className="flex-1 sm:flex-initial">
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto h-10 px-4 text-xs font-bold rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-100/90 text-teal-800 hover:text-teal-950 shadow-xs flex items-center justify-center space-x-2 transition-all group"
                >
                  <Globe className="h-4 w-4 text-teal-600 group-hover:rotate-45 transition-transform duration-300 shrink-0" />
                  <span>Open GIS</span>
                  <span className="hidden sm:inline text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md bg-teal-200/70 text-teal-900 ml-0.5">
                    Map
                  </span>
                </Button>
              </Link>

              {/* Export CSV Button */}
              <Button
                variant="primary"
                onClick={handleExportCSV}
                disabled={isError || filteredData.length === 0}
                className={`flex-1 sm:flex-initial h-10 px-4 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-xs flex items-center justify-center space-x-2 transition-all shrink-0 ${
                  isError || filteredData.length === 0 ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
                }`}
              >
                <Download className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <span>Export CSV</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                  {filteredData.length}
                </span>
              </Button>
            </div>
          </div>

          {/* Active Filters Pill Bar */}
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 font-medium">Active:</span>
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium">
                    Search: &ldquo;{searchTerm}&rdquo;
                    <button type="button" onClick={() => setSearchTerm('')} className="hover:text-rose-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {schoolTypeFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-medium">
                    School: {schoolTypeFilter}
                    <button type="button" onClick={() => setSchoolTypeFilter('ALL')} className="hover:text-rose-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {orphanStatusFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-medium">
                    Orphan: {orphanStatusFilter}
                    <button type="button" onClick={() => setOrphanStatusFilter('ALL')} className="hover:text-rose-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {districtFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-medium">
                    District: {districtFilter}
                    <button type="button" onClick={() => setDistrictFilter('ALL')} className="hover:text-rose-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-slate-500 font-medium text-[11px]">
                  Showing <strong>{filteredData.length}</strong> of <strong>{data.length}</strong> records
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-teal-700 hover:text-teal-900 font-bold hover:underline cursor-pointer text-[11px]"
                >
                  Clear all
                </button>
              </div>
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
                  <th className="py-3 px-4">School & Orphan</th>
                  <th className="py-3 px-4">BMI & Growth</th>
                  <th className="py-3 px-4">Viral Load</th>
                  <th className="py-3 px-4">Haemoglobin</th>
                  <th className="py-3 px-4">Grant (INR)</th>
                  <th className="py-3 px-4 text-center">Documents</th>
                  <th className="py-3 px-4 text-center">Approval</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-xs text-slate-400">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                        <span>Loading linelist surveys...</span>
                      </div>
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center">
                      <div className="max-w-md mx-auto text-center space-y-3">
                        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
                        <h4 className="text-sm font-bold text-slate-800">Linelist Upstream Connection Failed</h4>
                        <p className="text-xs text-slate-500">
                          {error?.message || 'Unable to retrieve survey rows from central Google Sheets bridge.'}
                        </p>
                        <div className="flex justify-center gap-2 pt-2">
                          <Button variant="secondary" size="sm" onClick={retry} className="text-xs">
                            Retry
                          </Button>
                          <Button variant="primary" size="sm" onClick={refresh} className="text-xs">
                            Refresh Data
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center">
                      <div className="max-w-xs mx-auto text-center space-y-2">
                        <AlertCircle className="h-8 w-8 text-slate-300 mx-auto" />
                        <h4 className="text-sm font-bold text-slate-700">
                          {hasActiveFilters ? 'No Matching Records' : 'No Survey Records Found'}
                        </h4>
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
                    <tr
                      key={row.id}
                      className={
                        row.isApproved
                          ? 'bg-gradient-to-r from-amber-100/80 via-yellow-50/90 to-amber-100/80 hover:from-amber-200/80 hover:to-amber-100/90 border-l-4 border-l-amber-500 shadow-[inset_0_1px_0_rgba(251,191,36,0.35),0_2px_8px_rgba(245,158,11,0.15)] ring-1 ring-amber-300/60 transition-all duration-300'
                          : !row.documentStatus.isComplete
                          ? 'bg-rose-50/50 hover:bg-rose-100/60 border-l-4 border-l-rose-400 border-b border-rose-100/80 transition-colors duration-150'
                          : 'bg-emerald-50/45 hover:bg-emerald-100/55 border-l-4 border-l-emerald-400 border-b border-emerald-100/80 transition-colors duration-150'
                      }
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-teal-800">
                        <Link href={`/assessment/record/${row.id}`} className="hover:underline">
                          {row.artNumber}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{row.childName}</td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="font-semibold text-slate-800">{row.age} yrs • {row.gender}</div>
                        <div className="text-[10px] text-slate-400">{row.district}</div>
                      </td>

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
                      <td className="py-3.5 px-4 text-center">
                        {row.documentStatus.isComplete ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                            Complete
                          </span>
                        ) : (
                          <div className="inline-flex items-center justify-center gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                              Pending
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveDocModal({
                                  id: row.id,
                                  childName: row.childName,
                                  artNumber: row.artNumber,
                                  status: row.documentStatus,
                                })
                              }
                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 hover:bg-sky-100 text-slate-500 hover:text-sky-700 transition-colors cursor-pointer border border-slate-200 hover:border-sky-300"
                              title="View pending documents in cloud modal"
                              aria-label="View pending documents"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Approval Status Toggle / Radio Button */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleApproval(row)}
                          disabled={updatingApprovalId === row.id}
                          className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer shadow-2xs ${
                            row.isApproved
                              ? 'bg-amber-400 text-amber-950 border border-amber-500 hover:bg-amber-300 ring-2 ring-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 hover:border-slate-400'
                          } ${updatingApprovalId === row.id ? 'opacity-60 cursor-wait' : ''}`}
                          title={row.isApproved ? 'Click to revoke approval' : 'Click to approve row in sheet'}
                        >
                          {updatingApprovalId === row.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-amber-950" />
                          ) : (
                            <span
                              className={`w-3 h-3 rounded-full border flex items-center justify-center transition-colors ${
                                row.isApproved
                                  ? 'border-amber-950 bg-amber-950'
                                  : 'border-slate-400 bg-white'
                              }`}
                            >
                              {row.isApproved && <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />}
                            </span>
                          )}
                          <span>{row.isApproved ? 'Approved' : 'Approve'}</span>
                        </button>
                      </td>

                      {/* Unified Action: View / Edit, Delete */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Unified View / Edit Survey */}
                          <Link
                            href={`/assessment/record/${row.id}/edit`}
                            title="View / Edit Survey"
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 hover:text-purple-900 rounded-lg transition-colors border border-purple-200/80 shadow-2xs"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>View / Edit</span>
                          </Link>

                          {/* Delete Survey */}
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

        {/* Mobile View: Cards Over Tables (< 768px) - Dynamic highlights & Approval */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center space-x-2 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span>Loading surveys...</span>
            </div>
          ) : isError ? (
            <div className="p-6 text-center bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
              <h4 className="text-sm font-bold">Failed to Load Surveys</h4>
              <p className="text-xs text-rose-700">{error?.message || 'Connection error with central bridge.'}</p>
              <div className="flex justify-center gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={retry} className="text-xs">
                  Retry
                </Button>
                <Button variant="primary" size="sm" onClick={refresh} className="text-xs">
                  Refresh
                </Button>
              </div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200 space-y-2">
              <p>{hasActiveFilters ? 'No records match the current filters.' : 'No survey records found.'}</p>
              {hasActiveFilters && (
                <Button variant="secondary" size="sm" onClick={resetFilters} className="text-xs">
                  Reset Filters
                </Button>
              )}
            </div>
          ) : (
            filteredData.map((row) => (
              <div
                key={row.id}
                className={`rounded-2xl p-4 shadow-xs transition-all ${
                  row.isApproved
                    ? 'bg-gradient-to-r from-amber-100/90 via-yellow-50/95 to-amber-100/90 border-l-4 border-l-amber-500 ring-1 ring-amber-300/70 shadow-[0_2px_10px_rgba(245,158,11,0.2)]'
                    : !row.documentStatus.isComplete
                    ? 'bg-rose-50/60 border-l-4 border-l-rose-400 border border-rose-200/80'
                    : 'bg-emerald-50/50 border-l-4 border-l-emerald-400 border border-emerald-200/80'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                    {row.artNumber}
                  </span>
                  <div className="flex items-center space-x-1.5">
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
                </div>

                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{row.childName}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {row.age} yrs • {row.gender} • {row.district}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {row.schoolType} • {row.orphanStatus}
                    </p>
                  </div>
                  {/* Mobile Approval Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleApproval(row)}
                    disabled={updatingApprovalId === row.id}
                    className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer shadow-2xs ${
                      row.isApproved
                        ? 'bg-amber-400 text-amber-950 border border-amber-500 hover:bg-amber-300 ring-2 ring-amber-400/60'
                        : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                    } ${updatingApprovalId === row.id ? 'opacity-60 cursor-wait' : ''}`}
                  >
                    {updatingApprovalId === row.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span
                        className={`w-2.5 h-2.5 rounded-full border ${
                          row.isApproved ? 'border-amber-950 bg-amber-950' : 'border-slate-400 bg-white'
                        }`}
                      />
                    )}
                    <span>{row.isApproved ? 'Approved' : 'Approve'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Viral Load:</span>
                    <span
                      className={`font-bold ${
                        row.vlCategory.includes('Unsuppressed') ? 'text-rose-600' : 'text-teal-700'
                      }`}
                    >
                      {row.vlCategory.includes('Unsuppressed') ? `${row.viralLoad} c/mL` : 'Suppressed'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Grant:</span>
                    <span className="font-bold text-teal-900">₹{row.grantAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Mobile Documents & Actions */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                  {/* Documents Status */}
                  <div className="flex items-center space-x-1.5">
                    {row.documentStatus.isComplete ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-700" />
                        Complete
                      </span>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-100 text-amber-800 border border-amber-300">
                          Pending
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveDocModal({
                              id: row.id,
                              childName: row.childName,
                              artNumber: row.artNumber,
                              status: row.documentStatus,
                            })
                          }
                          className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white text-slate-600 border border-slate-300 hover:text-sky-600 hover:border-sky-300 shadow-2xs"
                          aria-label="View pending documents"
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions: Unified View / Edit + Delete */}
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/assessment/record/${row.id}/edit`}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 shadow-2xs"
                      title="View / Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>View / Edit</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId({ id: row.id, name: row.childName })}
                      className="p-1.5 text-rose-600 bg-white hover:bg-rose-50 rounded-lg border border-slate-200"
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

        {/* Cloud Modal for Pending Documents */}
        {activeDocModal && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setActiveDocModal(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-sky-100 relative overflow-hidden animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cloud decorative header */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400" />

              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-50 to-teal-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-xs">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Document Status Cloud</h3>
                    <p className="text-xs text-slate-500">
                      {activeDocModal.childName} • <span className="font-mono font-semibold text-teal-700">{activeDocModal.artNumber}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveDocModal(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center text-xs mb-1.5 font-semibold">
                  <span className="text-slate-600">Verification Progress</span>
                  <span className={activeDocModal.status.isComplete ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                    {activeDocModal.status.uploadedCount} of {activeDocModal.status.totalRequired} Uploaded
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      activeDocModal.status.isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-400 to-amber-500'
                    }`}
                    style={{
                      width: `${Math.round((activeDocModal.status.uploadedCount / activeDocModal.status.totalRequired) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Pending Documents List */}
              <div className="mt-4">
                <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                  <span>Pending Documents ({activeDocModal.status.pendingDocs.length})</span>
                </h4>
                {activeDocModal.status.pendingDocs.length === 0 ? (
                  <p className="text-xs text-emerald-600 font-medium py-1">All required documents have been uploaded!</p>
                ) : (
                  <ul className="space-y-1.5">
                    {activeDocModal.status.pendingDocs.map((doc, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-rose-50/70 border border-rose-200/80 rounded-xl text-xs text-rose-900"
                      >
                        <span className="font-medium">{doc}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                          Missing
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Uploaded Documents List */}
              {activeDocModal.status.uploadedDocs.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Uploaded &amp; Verified ({activeDocModal.status.uploadedDocs.length})</span>
                  </h4>
                  <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {activeDocModal.status.uploadedDocs.map((doc, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between p-2 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-emerald-900"
                      >
                        <span className="truncate">{doc}</span>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <Link
                  href={`/assessment/record/${activeDocModal.id}/edit`}
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-teal-700 hover:text-teal-900 hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Upload Documents in Edit Mode &rarr;</span>
                </Link>
                <Button variant="secondary" size="sm" onClick={() => setActiveDocModal(null)} className="text-xs">
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

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
