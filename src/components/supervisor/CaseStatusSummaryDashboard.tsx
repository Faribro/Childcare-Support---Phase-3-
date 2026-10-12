'use client';

import React, { useMemo } from 'react';
import {
  FileCheck2,
  FileWarning,
  AlertTriangle,
  HeartHandshake,
  School,
  CheckCircle2,
  Clock,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import type { SupervisorBeneficiaryRow } from '@/hooks/useSupervisorData';

export interface CaseStatusSummaryDashboardProps {
  records: SupervisorBeneficiaryRow[];
  onFilterShortcut?: (filterKey: string, filterValue: string) => void;
  className?: string;
}

export function CaseStatusSummaryDashboard({
  records,
  onFilterShortcut,
  className = '',
}: CaseStatusSummaryDashboardProps) {
  const summary = useMemo(() => {
    const total = records.length;
    if (total === 0) {
      return {
        total: 0,
        completeDocsCount: 0,
        incompleteDocsCount: 0,
        completenessRate: 0,
        missingPassbook: 0,
        missingAadhaar: 0,
        missingPhoto: 0,
        missingSchoolDoc: 0,
        doubleOrphans: 0,
        singleOrphans: 0,
        outOfSchool: 0,
        clinicalAlerts: 0,
        approvedCount: 0,
        pendingApprovalCount: 0,
        approvalRate: 0,
      };
    }

    let completeDocsCount = 0;
    let missingPassbook = 0;
    let missingAadhaar = 0;
    let missingPhoto = 0;
    let missingSchoolDoc = 0;

    let doubleOrphans = 0;
    let singleOrphans = 0;
    let outOfSchool = 0;
    let clinicalAlerts = 0;
    let approvedCount = 0;

    for (const r of records) {
      // Document checks
      if (r.documentStatus.isComplete) {
        completeDocsCount++;
      } else {
        const pending = r.documentStatus.pendingDocs || [];
        if (pending.some((d) => d.toLowerCase().includes('passbook'))) missingPassbook++;
        if (pending.some((d) => d.toLowerCase().includes('aadhaar'))) missingAadhaar++;
        if (pending.some((d) => d.toLowerCase().includes('photo'))) missingPhoto++;
        if (pending.some((d) => d.toLowerCase().includes('fee') || d.toLowerCase().includes('receipt') || d.toLowerCase().includes('school'))) {
          missingSchoolDoc++;
        }
      }

      // Vulnerability checks
      const orphanLower = (r.orphanStatus || '').toLowerCase();
      if (orphanLower.includes('double') || orphanLower.includes('both parents deceased')) {
        doubleOrphans++;
      } else if (orphanLower.includes('single') || orphanLower.includes('deceased')) {
        singleOrphans++;
      }

      if (!r.schoolEnrolled || (r.schoolType && r.schoolType.toLowerCase().includes('not enrolled'))) {
        outOfSchool++;
      }

      // Clinical alert
      const isSevereUnderweight = r.bmiCategory === 'Severe Underweight';
      const isHighVL = r.vlCategory.includes('Unsuppressed') || r.vlCategory.includes('High');
      const isSevereAnemia = r.hbCategory === 'Severe Anemia';
      if (isSevereUnderweight || isHighVL || isSevereAnemia) {
        clinicalAlerts++;
      }

      // Approval
      if (r.isApproved) {
        approvedCount++;
      }
    }

    const completenessRate = Math.round((completeDocsCount / total) * 100);
    const incompleteDocsCount = total - completeDocsCount;
    const pendingApprovalCount = total - approvedCount;
    const approvalRate = Math.round((approvedCount / total) * 100);

    return {
      total,
      completeDocsCount,
      incompleteDocsCount,
      completenessRate,
      missingPassbook,
      missingAadhaar,
      missingPhoto,
      missingSchoolDoc,
      doubleOrphans,
      singleOrphans,
      outOfSchool,
      clinicalAlerts,
      approvedCount,
      pendingApprovalCount,
      approvalRate,
    };
  }, [records]);

  if (summary.total === 0) {
    return null;
  }

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 ${className}`}
      aria-label="Case Status and Document Completeness Dashboard"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-teal-600" />
            <span>Case Status & Document Verification Readiness</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Dossier completeness and vulnerability surveillance across {summary.total} active beneficiaries in scope
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {summary.completeDocsCount} / {summary.total} Complete ({summary.completenessRate}%)
          </span>
        </div>
      </div>

      {/* Grid of Key Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Document Readiness Card */}
        <div className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Documents Complete</span>
            <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-slate-900">{summary.completenessRate}%</span>
            <span className="text-xs font-semibold text-emerald-700">
              {summary.completeDocsCount} ready
            </span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${summary.completenessRate}%` }}
            />
          </div>
        </div>

        {/* Missing Documentation Alert Card */}
        <div className="p-3 rounded-xl border border-amber-100 bg-amber-50/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-800 font-medium">
            <span>Pending Documents</span>
            <FileWarning className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-amber-900">{summary.incompleteDocsCount}</span>
            <span className="text-xs font-semibold text-amber-700">
              Needs Upload
            </span>
          </div>
          <div className="text-[11px] text-amber-700/80 mt-1 truncate">
            {summary.missingAadhaar > 0 && `${summary.missingAadhaar} Aadhaar `}
            {summary.missingPassbook > 0 && `• ${summary.missingPassbook} Passbook`}
          </div>
        </div>

        {/* High Vulnerability Card */}
        <div className="p-3 rounded-xl border border-purple-100 bg-purple-50/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-purple-800 font-medium">
            <span>Orphan Vulnerability</span>
            <HeartHandshake className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-purple-900">
              {summary.doubleOrphans + summary.singleOrphans}
            </span>
            <span className="text-xs font-semibold text-purple-700">
              {summary.doubleOrphans} Double
            </span>
          </div>
          <div className="text-[11px] text-purple-700/80 mt-1">
            {summary.singleOrphans} Single Orphan Cases
          </div>
        </div>

        {/* Alliance Approval Status Card */}
        <div className="p-3 rounded-xl border border-teal-100 bg-teal-50/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-teal-800 font-medium">
            <span>Alliance Approval</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-teal-900">{summary.approvedCount}</span>
            <span className="text-xs font-semibold text-teal-700">
              {summary.approvalRate}% Approved
            </span>
          </div>
          <div className="text-[11px] text-teal-700/80 mt-1">
            {summary.pendingApprovalCount} Pending Approval
          </div>
        </div>
      </div>

      {/* Granular Missing Document Chips */}
      {summary.incompleteDocsCount > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span>Missing KYC & Attachment Bottlenecks:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.missingAadhaar > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                Aadhaar Card: <strong className="ml-1">{summary.missingAadhaar}</strong>
              </span>
            )}
            {summary.missingPassbook > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                Bank Passbook: <strong className="ml-1">{summary.missingPassbook}</strong>
              </span>
            )}
            {summary.missingPhoto > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                Passport Photo: <strong className="ml-1">{summary.missingPhoto}</strong>
              </span>
            )}
            {summary.missingSchoolDoc > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                School Certificate/Receipt: <strong className="ml-1">{summary.missingSchoolDoc}</strong>
              </span>
            )}
            {summary.clinicalAlerts > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200">
                <ShieldAlert className="h-3 w-3 mr-1 text-rose-600" />
                Clinical Alerts: <strong className="ml-1">{summary.clinicalAlerts}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
