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
} from 'lucide-react';
import type { BMICategory, VLCategory, HbCategory, SchoolType, OrphanStatus } from '@/types/domain';

export interface BeneficiaryDocumentStatus {
  isComplete: boolean;
  totalRequired: number;
  uploadedCount: number;
  pendingDocs: string[];
  uploadedDocs: string[];
}

function isFieldPresent(val: any): boolean {
  if (val === true) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return false;
    if (trimmed === '—' || trimmed === '-' || trimmed === 'N/A' || trimmed === 'n/a') return false;
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('not uploaded') ||
      lower.includes('no fee receipt') ||
      lower.includes('no marksheet') ||
      lower === 'none' ||
      lower === 'null' ||
      lower === 'undefined'
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function evaluateDocuments(it: any, schoolTypeStr: string): BeneficiaryDocumentStatus {
  const pendingDocs: string[] = [];
  const uploadedDocs: string[] = [];

  // 1. Bank Passbook Front Page
  const passbook =
    it['25\nPassbook Front Page Link'] ||
    it['25\\nPassbook Front Page Link'] ||
    it['Passbook Front Page Link'] ||
    it.passbookPhotoUrl ||
    it.passbook_photo_url ||
    it.bankingAndKyc?.passbookPhotoUrl ||
    it.bankDetails?.passbookPhotoCaptured ||
    it.raw_payload?.bankingAndKyc?.passbookPhotoUrl;
  if (isFieldPresent(passbook)) {
    uploadedDocs.push('Bank Passbook Front Page');
  } else {
    pendingDocs.push('Bank Passbook Front Page');
  }

  // 2. Aadhaar Card
  const aadhaar =
    it['26\nAadhaar Card Link'] ||
    it['26\\nAadhaar Card Link'] ||
    it['Aadhaar Card Link'] ||
    it.aadhaarCardPhotoUrl ||
    it.aadhaar_card_photo_url ||
    it.bankingAndKyc?.aadhaarCardPhotoUrl ||
    it.raw_payload?.bankingAndKyc?.aadhaarCardPhotoUrl;
  if (isFieldPresent(aadhaar)) {
    uploadedDocs.push('Aadhaar Card');
  } else {
    pendingDocs.push('Aadhaar Card');
  }

  // 3. Child Beneficiary Photo
  const childPhoto =
    it['27\nPassport Size Photo Link'] ||
    it['27\\nPassport Size Photo Link'] ||
    it['Passport Size Photo Link'] ||
    it.childPhotoUrl ||
    it.child_photo_url ||
    it.bankingAndKyc?.childPhotoUrl ||
    it.raw_payload?.bankingAndKyc?.childPhotoUrl;
  if (isFieldPresent(childPhoto)) {
    uploadedDocs.push('Child Beneficiary Photo');
  } else {
    pendingDocs.push('Child Beneficiary Photo');
  }

  // 4. Caregiver Consent Signature
  const signature =
    it['72\nSignature Link'] ||
    it['72\\nSignature Link'] ||
    it['Signature Link'] ||
    it.signatureDataUrl ||
    it.signature_data_url ||
    it.consent?.signatureDataUrl ||
    it.caregiverConsent?.signatureDataUrl ||
    it.raw_payload?.caregiverConsent?.signatureDataUrl ||
    it.raw_payload?.consent?.signatureDataUrl;
  if (isFieldPresent(signature)) {
    uploadedDocs.push('Caregiver Signature');
  } else {
    pendingDocs.push('Caregiver Signature');
  }

  // 5 & 6. Educational proofs (if child is enrolled in school)
  const isOutOfSchool =
    schoolTypeStr.toLowerCase().includes('out of school') ||
    schoolTypeStr.toLowerCase().includes('not in school') ||
    schoolTypeStr.toLowerCase().includes('dropped out') ||
    schoolTypeStr.toLowerCase().includes('never enrolled');

  if (!isOutOfSchool) {
    const feeReceipt =
      it['64\nSchool Fee Receipt Link'] ||
      it['64\\nSchool Fee Receipt Link'] ||
      it['School Fee Receipt Link'] ||
      it.feeReceiptPhotoUrl ||
      it.fee_receipt_photo_url ||
      it.educationExpenses?.feeReceiptPhotoUrl ||
      it.raw_payload?.educationExpenses?.feeReceiptPhotoUrl;
    if (isFieldPresent(feeReceipt)) {
      uploadedDocs.push('School Fee Receipt');
    } else {
      pendingDocs.push('School Fee Receipt');
    }

    const marksheet =
      it['65\nMarksheet Photo Link'] ||
      it['65\\nMarksheet Photo Link'] ||
      it['Marksheet Photo Link'] ||
      it.marksheetPhotoUrl ||
      it.marksheet_photo_url ||
      it.educationExpenses?.marksheetPhotoUrl ||
      it.raw_payload?.educationExpenses?.marksheetPhotoUrl;
    if (isFieldPresent(marksheet)) {
      uploadedDocs.push('Academic Marksheet');
    } else {
      pendingDocs.push('Academic Marksheet');
    }
  }

  const totalRequired = uploadedDocs.length + pendingDocs.length;
  const isComplete = pendingDocs.length === 0;

  return {
    isComplete,
    totalRequired,
    uploadedCount: uploadedDocs.length,
    pendingDocs,
    uploadedDocs,
  };
}

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
  lastVisit?: string;
  version: number;
  documentStatus: BeneficiaryDocumentStatus;
  isApproved: boolean;
  approvedStatus: string;
}

export default function SupervisorAssessmentsPage() {
  const [data, setData] = useState<BeneficiaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const fetchSubmissions = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/submissions?limit=100');
      if (res.ok) {
        const json = await res.json();
        const rawItems = Array.isArray(json.data) ? json.data : Array.isArray(json.items) ? json.items : [];
        if (rawItems.length >= 0) {
          const mapped: BeneficiaryRow[] = rawItems.map((it: any) => {
            const rawBmi = it['34\nBMI'] ?? it.nutrition?.bmi ?? it.clinical?.bmi ?? it.bmi ?? 0;
            let bmiCat: BMICategory = 'Normal';
            const numBmi = Number(rawBmi) || 0;
            if (numBmi > 0) {
              if (numBmi < 13.5) bmiCat = 'Severe Underweight';
              else if (numBmi < 15.0) bmiCat = 'Moderate Underweight';
              else if (numBmi > 22.0) bmiCat = 'Overweight / Obese';
            }

            const rawVl = it['45\nViral Load'] ?? it.clinical?.viralLoad ?? it.clinical?.viralload ?? it.viralload ?? '';
            const numVl = parseFloat(String(rawVl).replace(/[^0-9.]/g, ''));
            let vlCat: VLCategory = 'Unknown / Pending';
            if (String(rawVl).toLowerCase().includes('undetect') || String(rawVl).includes('<50') || numVl < 50) {
              vlCat = 'Undetectable (<50 copies/mL)';
            } else if (!isNaN(numVl)) {
              if (numVl < 1000) vlCat = 'Suppressed (<1000 copies/mL)';
              else vlCat = 'Unsuppressed (≥1000 copies/mL)';
            }

            const rawHb = it['36\nHemoglobin (g/dL)'] ?? it.clinical?.hemoglobin ?? it.clinical?.haemoglobin ?? it.hemoglobin ?? '';
            const numHb = parseFloat(String(rawHb));
            let hbCat: HbCategory = 'Normal';
            if (!isNaN(numHb) && numHb > 0) {
              if (numHb < 7.0) hbCat = 'Severe Anemia';
              else if (numHb < 10.0) hbCat = 'Moderate Anemia';
              else if (numHb < 11.0) hbCat = 'Mild Anemia';
            }

            const id = it['1\nUnique ID'] || it.id || it._uuid || it.client_submission_id || it.clientSubmissionId;
            const artNumber = it['42\nART ID Number'] || it['1\nUnique ID'] || it.demographics?.artNumber || it.art_number || id || 'MH-BEN-00';
            const childName = it['9\nChild Name'] || it.demographics?.childName || it.child_name || 'Beneficiary Child';
            const age = Number(it['11\nAge'] ?? it.demographics?.calculatedAgeYears ?? it.calculated_age ?? 0);
            const gender = it['12\nGender'] || it.demographics?.gender || it.gender || '—';
            const district = it['19\nDistrict'] || it.demographics?.district || it.district || 'General';
            const schoolType = it['53\nSchool Type'] || it.educationStatus?.schoolType || it.education?.schoolType || it.school_type || 'Government school';
            const orphanStatus = it['13\nOrphan Status'] || it.demographics?.orphanStatus || it.orphan_status || 'Both parents alive';
            const grantAmount = Number(it['63\nTotal Annual Education Cost'] ?? it.grantCalculation?.totalGrantAmount ?? it.recommended_grant_amount ?? it.educationExpenses?.totalRequiredSupport ?? 0);
            const lastVisit = (it['7\nVisit Date'] || it['73\nLast Updated'] || it['3\nSubmission Time'] || it.updatedAt || it.createdAt || new Date().toISOString()).split('T')[0];
            const version = Number(it['2\nRevision Number'] ?? it.version ?? 1);
            const documentStatus = evaluateDocuments(it, schoolType);

            const rawApproved =
              it['67\nApproved Alliance India'] ||
              it['67\\nApproved Alliance India'] ||
              it['Approved Alliance India'] ||
              it.approvedAllianceIndia ||
              it.approved_alliance_india ||
              it.finalReview?.approvedAllianceIndia ||
              it.raw_payload?.finalReview?.approvedAllianceIndia;

            const isApproved =
              typeof rawApproved === 'boolean'
                ? rawApproved
                : String(rawApproved || '').toLowerCase().includes('approv') ||
                  String(rawApproved || '').toLowerCase() === 'yes';

            const approvedStatus = isApproved ? 'Approved' : String(rawApproved || 'Pending');

            return {
              id,
              artNumber,
              childName,
              age,
              gender,
              district,
              schoolType,
              orphanStatus,
              bmi: numBmi,
              bmiCategory: (it['35\nBMI Category'] || it.clinical?.bmiCategory || it.bmicategory || bmiCat) as BMICategory,
              viralLoad: String(rawVl || '—'),
              vlCategory: (it['46\nVL Category'] || it.clinical?.vlCategory || it.vl_category || vlCat) as VLCategory,
              hemoglobin: String(rawHb || '—'),
              hbCategory: (it['37\nHb Category'] || it.clinical?.hbCategory || it.hb_category || hbCat) as HbCategory,
              grantAmount,
              syncState: 'SYNCED',
              lastVisit,
              version,
              documentStatus,
              isApproved,
              approvedStatus,
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

        {/* Exclusive Supervisor Tab Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 mb-3 sm:mb-4 gap-3">
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
              <span>ChildrenLinelist</span>
            </Link>
            <Link
              href="/supervisor/analytics"
              className="flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Clinical Analytics</span>
            </Link>
          </div>

          {/* Supervisor Tools */}
          <div className="flex items-center space-x-2 pb-2 sm:pb-0">
            <Button variant="ghost" size="sm" onClick={fetchSubmissions} className="h-9 px-3 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-xl">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin text-teal-700' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Precision Multi-Dimension Filters: Search, School Type, Orphan Status, District & Export */}
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

            {/* Export Linelist CSV */}
            <div>
              <Button
                variant="primary"
                onClick={handleExportCSV}
                className="w-full h-9 sm:h-[38px] text-xs font-semibold shadow-xs flex items-center justify-center rounded-xl bg-teal-700 hover:bg-teal-800 text-white"
              >
                <Download className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <span>Export CSV ({filteredData.length})</span>
              </Button>
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

        {/* Mobile View: Cards Over Tables (< 768px) - Dynamic highlights & Approval */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading surveys...</div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
              No survey records found.
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

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/assessment/record/${row.id}`}
                      className="p-1.5 text-teal-700 bg-white hover:bg-teal-50 rounded-lg border border-slate-200"
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/assessment/record/${row.id}/edit`}
                      className="p-1.5 text-amber-700 bg-white hover:bg-amber-50 rounded-lg border border-slate-200"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
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
