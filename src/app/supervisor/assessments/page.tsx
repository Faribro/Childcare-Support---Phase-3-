'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { SupervisorTabNav } from '@/components/supervisor/SupervisorTabNav';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import {
  useSupervisorData,
  type SupervisorBeneficiaryRow,
  type BeneficiaryDocumentStatus,
} from '@/hooks/useSupervisorData';
import { deduplicateRecordsByChild } from '@/lib/read-model/beneficiaryReadiness';
import { CaseStatusSummaryDashboard } from '@/components/supervisor/CaseStatusSummaryDashboard';
import { RecordActionMenu } from '@/components/supervisor/RecordActionMenu';
import { EvaluationLoginModal } from '@/components/auth/EvaluationLoginModal';
import { ColumnFilterPopover } from '@/components/supervisor/ColumnFilterPopover';
import {
  type LinelistColumnFilters,
  INITIAL_COLUMN_FILTERS,
  type LinelistSortState,
  type SortColumn,
  filterBeneficiaryRows,
  sortBeneficiaryRows,
  computeColumnFacets,
  sanitizeCsvCell,
  normalizeFilterValue,
} from '@/components/supervisor/linelistFilterUtils';
import { deriveSubmissionStages } from '@/lib/shared/submissionStages';

type BeneficiaryRow = SupervisorBeneficiaryRow;

function getDocTypeParam(docName: string): string {
  const lower = docName.toLowerCase();
  if (lower.includes('passbook')) return 'passbookPhoto';
  if (lower.includes('aadhaar')) return 'aadhaarCardPhoto';
  if (lower.includes('passport') || lower.includes('photo')) return 'childPhoto';
  if (lower.includes('fee')) return 'feeReceiptPhoto';
  if (lower.includes('mark') || lower.includes('grade')) return 'marksheetPhoto';
  if (lower.includes('signature')) return 'caregiverSignature';
  return 'childPhoto';
}

export default function SupervisorAssessmentsPage() {
  const { isUnlocked, isLoaded, user } = useEvaluationAccess();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const {
    records: data,
    total,
    status,
    isLoading,
    isError,
    isUnauthorized,
    isForbidden,
    isEmpty,
    isOfflineCache,
    networkStatus,
    error,
    refresh,
    fetchWithFilters,
    retry,
    setRecords: setData,
    lastRefreshed,
  } = useSupervisorData({ enabled: isLoaded && isUnlocked });

  // Filter & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<LinelistColumnFilters>(INITIAL_COLUMN_FILTERS);
  const [sortState, setSortState] = useState<LinelistSortState | null>(null);

  // Debounce global search input to prevent main-thread jank across large datasets (10,000 rows)
  useEffect(() => {
    if (!searchTerm) {
      setDebouncedSearchTerm('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Client-Side Pagination State (for scaling up to 10,000 records without DOM bloat)
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Deletion State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    name: string;
    artNumber: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Approval Mutation State
  const [approvalModalTarget, setApprovalModalTarget] = useState<BeneficiaryRow | null>(null);
  const [updatingApprovalId, setUpdatingApprovalId] = useState<string | null>(null);

  // Document Verification Cloud Modal State
  const [activeDocModal, setActiveDocModal] = useState<{
    id: string;
    childName: string;
    artNumber: string;
    status: BeneficiaryDocumentStatus;
  } | null>(null);

  // Feedback Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const userAllowedStatesKey = user?.allowedStates?.join(',') || '';
  const userAllowedDistrictsKey = user?.allowedDistricts?.join(',') || '';

  // Clear filters and reset page when session scope or user identity changes
  useEffect(() => {
    setColumnFilters(INITIAL_COLUMN_FILTERS);
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setCurrentPage(1);
  }, [user?.userId, user?.role, userAllowedStatesKey, userAllowedDistrictsKey]);

  // Reset pagination to page 1 whenever filters or debounced search term change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, columnFilters]);

  // Escape key handler for cloud modal and confirmation modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDocModal(null);
        setDeleteConfirmTarget(null);
        setApprovalModalTarget(null);
      }
    };
    if (activeDocModal || deleteConfirmTarget || approvalModalTarget) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeDocModal, deleteConfirmTarget, approvalModalTarget]);

  // 1. Authorized scope filtering: Strictly ensure records never cross geographic clearance
  const authorizedRecords = useMemo(() => {
    return data.filter((row) => {
      if (user?.allowedStates && !user.allowedStates.includes('*')) {
        const rowState = (row.state || 'Maharashtra').toLowerCase();
        if (!user.allowedStates.some((s) => s.toLowerCase() === rowState)) {
          return false;
        }
      }
      if (user?.allowedDistricts && !user.allowedDistricts.includes('*')) {
        const rowDist = (row.district || '').toLowerCase();
        if (!user.allowedDistricts.some((d) => d.toLowerCase() === rowDist)) {
          return false;
        }
      }
      return true;
    });
  }, [data, user]);

  // 1b. Distinct children in authorized scope under established visit chronology
  const currentChildRecords = useMemo(() => {
    return deduplicateRecordsByChild(authorizedRecords).distinctRecords;
  }, [authorizedRecords]);

  const totalChildrenInScope = currentChildRecords.length;

  // 2. Filtered dataset combining global search and multi-select column filters
  const filteredData = useMemo(() => {
    return filterBeneficiaryRows(currentChildRecords, columnFilters, debouncedSearchTerm, user);
  }, [currentChildRecords, columnFilters, debouncedSearchTerm, user]);

  // 3. Stable tie-break sorted dataset
  const sortedData = useMemo(() => {
    return sortBeneficiaryRows(filteredData, sortState);
  }, [filteredData, sortState]);

  // 4. Paginated rows slice for DOM rendering performance
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // 5. Faceted Option Derivation for Column Headers (memoized per column using current child records)
  const artNumberFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'artNumber',
        (rows) => Array.from(new Set(rows.map((r) => r.artNumber))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const childNameFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'childName',
        (rows) => Array.from(new Set(rows.map((r) => r.childName))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const ageFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'age',
        (rows) =>
          Array.from(
            new Set(
              rows.map((r) =>
                r.age !== null && r.age !== undefined ? String(r.age) : '(Blank / Unknown)'
              )
            )
          ),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const genderFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'gender',
        (rows) => Array.from(new Set(rows.map((r) => normalizeFilterValue(r.gender)))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const stateFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'state',
        (rows) => Array.from(new Set(rows.map((r) => normalizeFilterValue(r.state)))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const districtFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'district',
        (rows) => Array.from(new Set(rows.map((r) => normalizeFilterValue(r.district)))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const schoolTypeFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'schoolType',
        (rows) => Array.from(new Set(rows.map((r) => normalizeFilterValue(r.schoolType)))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const orphanStatusFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'orphanStatus',
        (rows) => Array.from(new Set(rows.map((r) => normalizeFilterValue(r.orphanStatus)))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );


  const vlFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'vlCategory',
        (rows) => Array.from(new Set(rows.map((r) => normalizeFilterValue(r.vlCategory)))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const hbFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'hbCategory',
        (rows) => Array.from(new Set(rows.map((r) => normalizeFilterValue(r.hbCategory)))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const grantFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'grantAmount',
        (rows) => Array.from(new Set(rows.map((r) => String(r.grantAmount || 0)))),
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const docFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'documentStatus',
        () => ['Complete', 'Pending'],
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  const approvalFacets = useMemo(
    () =>
      computeColumnFacets(
        currentChildRecords,
        columnFilters,
        debouncedSearchTerm,
        'approvalStatus',
        (rows) => {
          const distinct = new Set<string>(['Approved', 'Pending']);
          rows.forEach((r) => {
            if (r.approvedStatus) distinct.add(r.approvedStatus);
          });
          return Array.from(distinct);
        },
        user
      ),
    [currentChildRecords, columnFilters, debouncedSearchTerm, user]
  );

  // Filter application & clear handlers
  const handleApplyColumnFilter = useCallback((selectionsBySection: Record<string, string[]>) => {
    setColumnFilters((prev) => ({
      ...prev,
      ...selectionsBySection,
    }));
  }, []);

  const handleClearColumnFilter = useCallback((sectionKeys: (keyof LinelistColumnFilters)[]) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      for (const key of sectionKeys) {
        next[key] = [];
      }
      return next;
    });
  }, []);

  const handleSortChange = useCallback((column: SortColumn, direction: 'asc' | 'desc' | null) => {
    if (!direction) {
      setSortState(null);
    } else {
      setSortState({ column, direction });
    }
  }, []);

  // Reset all filters (preserves authorized scope)
  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setColumnFilters(INITIAL_COLUMN_FILTERS);
    setSortState(null);
  }, []);

  // Determine active filter count across all columns & search
  const activeFilterList = useMemo(() => {
    const list: { key: keyof LinelistColumnFilters | 'search'; label: string; count: number }[] = [];
    if (searchTerm.trim()) {
      list.push({ key: 'search', label: `Search: "${searchTerm}"`, count: 1 });
    }
    const filterLabels: Record<keyof LinelistColumnFilters, string> = {
      artNumber: 'ART ID',
      childName: 'Child Name',
      gender: 'Gender',
      age: 'Age',
      state: 'State',
      district: 'District',
      schoolType: 'School Type',
      orphanStatus: 'Orphan Status',
      bmiCategory: 'BMI',
      vlCategory: 'Viral Load',
      hbCategory: 'Haemoglobin',
      grantAmount: 'Grant',
      documentStatus: 'Documents',
      approvalStatus: 'Approval',
    };
    for (const [k, vals] of Object.entries(columnFilters)) {
      const key = k as keyof LinelistColumnFilters;
      if (vals && vals.length > 0) {
        list.push({
          key,
          label: `${filterLabels[key]}: ${vals.join(', ')}`,
          count: vals.length,
        });
      }
    }
    return list;
  }, [searchTerm, columnFilters]);

  const hasActiveFilters = activeFilterList.length > 0;

  // Single filter chip removal
  const handleRemoveFilterChip = (key: keyof LinelistColumnFilters | 'search') => {
    if (key === 'search') {
      setSearchTerm('');
    } else {
      handleClearColumnFilter([key]);
    }
  };

  // Safe CSV Export (Formula Injection Safe via sanitizeCsvCell, Exports ALL matching records)
  const handleExportCSV = useCallback(() => {
    if (sortedData.length === 0) return;

    const headers = [
      'Reference ID',
      'Child Name',
      'Age',
      'Gender',
      'District',
      'State',
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
      'Intake Completeness',
      'Approval Status',
      'Bank Workflow State',
    ];

    const csvRows = [
      headers.map(sanitizeCsvCell).join(','),
      ...sortedData.map((r) => {
        const stages = deriveSubmissionStages(r.rawRecord || r);
        return [
          sanitizeCsvCell(r.artNumber),
          sanitizeCsvCell(r.childName),
          sanitizeCsvCell(r.age !== null ? r.age : ''),
          sanitizeCsvCell(r.gender),
          sanitizeCsvCell(r.district),
          sanitizeCsvCell(r.state || 'Maharashtra'),
          sanitizeCsvCell(r.schoolType),
          sanitizeCsvCell(r.orphanStatus),
          sanitizeCsvCell(r.bmi !== null ? r.bmi : ''),
          sanitizeCsvCell(r.bmiCategory),
          sanitizeCsvCell(r.viralLoad || ''),
          sanitizeCsvCell(r.vlCategory),
          sanitizeCsvCell(r.hemoglobin || ''),
          sanitizeCsvCell(r.hbCategory),
          sanitizeCsvCell(r.grantAmount),
          sanitizeCsvCell(r.documentStatus.isComplete ? 'Complete' : 'Pending'),
          sanitizeCsvCell(r.documentStatus.pendingDocs.join('; ') || 'None'),
          sanitizeCsvCell(stages.intakeCompleteness),
          sanitizeCsvCell(r.isApproved ? 'Approved' : r.approvedStatus || 'Pending'),
          sanitizeCsvCell(stages.bankWorkflow),
        ].join(',');
      }),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alliance_india_linelist_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedData]);

  // Working Permission-Aware Approval Mutation (Admin only, server-confirmed, OCC versioned)
  const handleConfirmApproval = async (row: BeneficiaryRow) => {
    setUpdatingApprovalId(row.id);
    const nextApproved = !row.isApproved;
    const nextStatus = nextApproved ? 'Approved' : 'Pending';

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
        // Server confirmation: update row data in state with incremented version
        setData((prev) =>
          prev.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  isApproved: nextApproved,
                  approvedStatus: nextStatus,
                  version: item.version + 1,
                  readiness: item.readiness
                    ? {
                        ...item.readiness,
                        isApproved: nextApproved,
                        approvalStatus: nextStatus,
                      }
                    : undefined,
                }
              : item
          )
        );
        setToastMessage(
          nextApproved
            ? `Survey for ${row.childName} Approved and synced to central surveillance!`
            : `Survey for ${row.childName} marked as Pending.`
        );
        setTimeout(() => setToastMessage(null), 3500);
      } else if (res.status === 409) {
        alert(
          'Version Conflict (HTTP 409): This assessment was modified concurrently by another user. Refreshing latest surveillance data...'
        );
        await refresh();
      } else if (res.status === 401) {
        alert('Authentication required: Your session has expired. Please sign in again.');
      } else if (res.status === 403) {
        alert('Forbidden: Only verified administrators have permission to alter approval status.');
      } else {
        alert('Failed to update approval status. Please check your network connection.');
      }
    } catch (err) {
      console.error('Approval sync error:', err);
      alert('Network error communicating with server to update approval status.');
    } finally {
      setUpdatingApprovalId(null);
      setApprovalModalTarget(null);
    }
  };

  // Working Permission-Aware Deletion Mutation (Admin only, server-confirmed)
  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget || isDeleting) return;
    const { id, name } = deleteConfirmTarget;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setData((prev) => prev.filter((r) => r.id !== id));
        setToastMessage(`Record for ${name} permanently deleted.`);
        setTimeout(() => setToastMessage(null), 3500);
      } else if (res.status === 401) {
        alert('Authentication required: Your session has expired.');
      } else if (res.status === 403) {
        alert('Forbidden: Deletion is restricted to verified administrators.');
      } else if (res.status === 409) {
        alert('Conflict: Record state changed on server. Please refresh.');
      } else {
        alert('Failed to delete record. Please check server connection.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Network error while deleting record.');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmTarget(null);
    }
  };

  // Loading authorization gate
  if (!isLoaded) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-md mx-auto px-4 py-20 text-center">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4">
            <Loader2 className="w-8 h-8 text-teal-700 animate-spin mx-auto" />
            <h2 className="text-sm font-semibold text-slate-800">Verifying Authorization…</h2>
            <p className="text-xs text-slate-500">Checking credentials and scope clearance.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // Authentication gate for unauthenticated users
  if (isLoaded && !isUnlocked && !isUnauthorized) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-md mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Authentication Required</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Beneficiary evaluation and surveillance records are restricted to authenticated personnel with authorized state and district scope.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsLoginModalOpen(true)}
                className="w-full sm:w-auto text-xs bg-teal-800 hover:bg-teal-900 text-white"
              >
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                Sign In to Access
              </Button>
              <Link href="/app" className="w-full sm:w-auto">
                <Button variant="secondary" size="sm" className="w-full text-xs">
                  Return to Forms
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <EvaluationLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 pt-2 pb-6 sm:pt-3 sm:pb-8">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Supervisor Tab Navigation */}
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
                <RefreshCw
                  className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin text-teal-700' : ''}`}
                />
                <span>Refresh</span>
              </Button>
            </div>
          }
        />

        {/* Model A Evaluation Read-Only Notice Banner */}
        {user?.role && user.role !== 'ADMIN' && (
          <div className="mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 flex items-center justify-between shadow-2xs">
            <div className="flex items-center space-x-2.5">
              <Info className="h-4 w-4 text-teal-700 shrink-0" />
              <span>
                <strong>Evaluation Read-Only Mode ({user.role}):</strong> You have read-only clearance for surveillance and review. Record mutations, approvals, and deletions are restricted to verified administrators.
              </span>
            </div>
          </div>
        )}

        {/* Unauthorized State Banner */}
        {isUnauthorized && (
          <div className="mb-5 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 shadow-xs">
            <div className="flex items-start space-x-3">
              <Lock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Session Authentication Required</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Your session has expired or requires authentication. Please sign in to read beneficiary records.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsLoginModalOpen(true)}
                className="text-xs bg-teal-800 hover:bg-teal-900 text-white"
              >
                <Lock className="w-3.5 h-3.5 mr-1" />
                Sign In Again
              </Button>
            </div>
          </div>
        )}

        {/* Forbidden Scope Banner */}
        {isForbidden && (
          <div className="mb-5 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 shadow-xs">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Geographic Scope Restricted</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  {error?.message || 'Your account does not have clearance for this state or district selection.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Genuine Network / Upstream Error State Banner */}
        {isError && !isUnauthorized && !isForbidden && (
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
          <div
            role="status"
            aria-live="polite"
            className="mb-5 bg-amber-50/90 border border-amber-300 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 text-amber-900 shadow-xs"
          >
            <div className="flex items-center space-x-2.5 text-xs">
              <Cloud className="w-5 h-5 text-amber-600 shrink-0" />
              <span>
                {networkStatus === 'offline' ? (
                  <>
                    <strong>Offline · Cached Linelist:</strong> Network connection is offline. Cached linelist records are preserved.
                  </>
                ) : (
                  <>
                    <strong>Online · Cached Linelist:</strong> Live central bridge sync is pending or unreachable. Cached linelist records are preserved.
                  </>
                )}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              className="text-xs text-amber-900 hover:bg-amber-100/80 border border-amber-300/80 rounded-xl cursor-pointer"
            >
              Reconnect
            </Button>
          </div>
        )}

        {/* Case Status & Document Verification Readiness Dashboard */}
        {!isError && (
          <div className="mb-5">
            <CaseStatusSummaryDashboard
              records={filteredData}
              totalInScope={totalChildrenInScope}
            />
          </div>
        )}

        {/* Precision Command Ribbon: Global Search, Open GIS & Export CSV */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 mb-5 shadow-xs transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Global Search Field with Clear Button */}
            <div className="relative flex-1 min-w-[220px] max-w-full sm:max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search ART ID, child name, district, state..."
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

            {/* Action Buttons: Open GIS & Export CSV */}
            <div className="flex items-center gap-2.5 shrink-0">
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

              <Button
                variant="primary"
                onClick={handleExportCSV}
                disabled={isError || sortedData.length === 0}
                className={`flex-1 sm:flex-initial h-10 px-4 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-xs flex items-center justify-center space-x-2 transition-all shrink-0 ${
                  isError || sortedData.length === 0
                    ? 'opacity-50 cursor-not-allowed pointer-events-none'
                    : ''
                }`}
                title="Export all matching records to CSV with formula injection protection"
              >
                <Download className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <span>Export CSV</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                  {sortedData.length}
                </span>
              </Button>
            </div>
          </div>

          {/* Active Filter Chips Bar */}
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 font-medium">Active Filters:</span>
                {activeFilterList.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-900 border border-teal-200/80 text-[11px] font-medium"
                  >
                    <span>{item.label}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFilterChip(item.key)}
                      className="text-teal-700 hover:text-rose-700 p-0.5 rounded transition-colors cursor-pointer"
                      title={`Remove ${item.label}`}
                      aria-label={`Remove filter: ${item.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-slate-500 font-medium text-[11px]">
                  Showing <strong>{filteredData.length}</strong> of <strong>{authorizedRecords.length}</strong> records
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-teal-700 hover:text-rose-600 font-bold hover:underline cursor-pointer text-[11px] flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Clear all</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Filter Quick-Access Ribbon (< 768px) */}
        <div className="md:hidden mb-4 bg-white rounded-2xl border border-slate-200 p-3 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-teal-600" />
            <span>Multi-Select Column Filters</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ColumnFilterPopover
              columnId="locationMobile"
              columnTitle="Location"
              sections={[
                { id: 'state', title: 'State', options: stateFacets, selectedValues: columnFilters.state },
                { id: 'district', title: 'District', options: districtFacets, selectedValues: columnFilters.district },
              ]}
              onApply={handleApplyColumnFilter}
              onClear={() => handleClearColumnFilter(['state', 'district'])}
              sortDirection={sortState?.column === 'location' ? sortState.direction : null}
              onSortChange={(dir) => handleSortChange('location', dir)}
            />
            <ColumnFilterPopover
              columnId="ageSexMobile"
              columnTitle="Age & Sex"
              sections={[
                { id: 'age', title: 'Age', options: ageFacets, selectedValues: columnFilters.age },
                { id: 'gender', title: 'Gender', options: genderFacets, selectedValues: columnFilters.gender },
              ]}
              onApply={handleApplyColumnFilter}
              onClear={() => handleClearColumnFilter(['age', 'gender'])}
              sortDirection={sortState?.column === 'age' ? sortState.direction : null}
              onSortChange={(dir) => handleSortChange('age', dir)}
            />
            <ColumnFilterPopover
              columnId="schoolOrphanMobile"
              columnTitle="School & Orphan"
              sections={[
                { id: 'schoolType', title: 'School', options: schoolTypeFacets, selectedValues: columnFilters.schoolType },
                { id: 'orphanStatus', title: 'Orphan', options: orphanStatusFacets, selectedValues: columnFilters.orphanStatus },
              ]}
              onApply={handleApplyColumnFilter}
              onClear={() => handleClearColumnFilter(['schoolType', 'orphanStatus'])}
              sortDirection={sortState?.column === 'schoolOrphan' ? sortState.direction : null}
              onSortChange={(dir) => handleSortChange('schoolOrphan', dir)}
            />
            <ColumnFilterPopover
              columnId="docsMobile"
              columnTitle="Documents"
              sections={[
                { id: 'documentStatus', title: 'Docs', options: docFacets, selectedValues: columnFilters.documentStatus },
              ]}
              onApply={handleApplyColumnFilter}
              onClear={() => handleClearColumnFilter(['documentStatus'])}
              sortDirection={sortState?.column === 'documents' ? sortState.direction : null}
              onSortChange={(dir) => handleSortChange('documents', dir)}
            />
            <ColumnFilterPopover
              columnId="approvalMobile"
              columnTitle="Approval"
              sections={[
                { id: 'approvalStatus', title: 'Approval', options: approvalFacets, selectedValues: columnFilters.approvalStatus },
              ]}
              onApply={handleApplyColumnFilter}
              onClear={() => handleClearColumnFilter(['approvalStatus'])}
              sortDirection={sortState?.column === 'approval' ? sortState.direction : null}
              onSortChange={(dir) => handleSortChange('approval', dir)}
            />
          </div>
        </div>

        {/* Desktop View: Full Data Grid with Column-Header Multi-Select Popovers (>= 768px) */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-900">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  {/* 1. Reference ID */}
                  <th className="py-3 px-3.5">
                    <div className="flex items-center justify-between">
                      <span className="truncate">Reference ID</span>
                      <ColumnFilterPopover
                        columnId="artNumber"
                        columnTitle="Reference ID"
                        sections={[
                          {
                            id: 'artNumber',
                            title: 'ART ID',
                            options: artNumberFacets,
                            selectedValues: columnFilters.artNumber,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['artNumber'])}
                        sortDirection={sortState?.column === 'artNumber' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('artNumber', dir)}
                      />
                    </div>
                  </th>

                  {/* 2. Child Name */}
                  <th className="py-3 px-3.5">
                    <div className="flex items-center justify-between">
                      <span className="truncate">Child Name</span>
                      <ColumnFilterPopover
                        columnId="childName"
                        columnTitle="Child Name"
                        sections={[
                          {
                            id: 'childName',
                            title: 'Name',
                            options: childNameFacets,
                            selectedValues: columnFilters.childName,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['childName'])}
                        sortDirection={sortState?.column === 'childName' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('childName', dir)}
                      />
                    </div>
                  </th>

                  {/* 3. Age / Sex */}
                  <th className="py-3 px-3.5">
                    <div className="flex items-center justify-between">
                      <span className="truncate">Age / Sex</span>
                      <ColumnFilterPopover
                        columnId="ageSex"
                        columnTitle="Age / Sex"
                        sections={[
                          {
                            id: 'age',
                            title: 'Age',
                            options: ageFacets,
                            selectedValues: columnFilters.age,
                          },
                          {
                            id: 'gender',
                            title: 'Gender',
                            options: genderFacets,
                            selectedValues: columnFilters.gender,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['age', 'gender'])}
                        sortDirection={sortState?.column === 'age' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('age', dir)}
                      />
                    </div>
                  </th>

                  {/* 4. Location (State & District) */}
                  <th className="py-3 px-3.5">
                    <div className="flex items-center justify-between">
                      <span className="truncate">Location</span>
                      <ColumnFilterPopover
                        columnId="location"
                        columnTitle="Location"
                        sections={[
                          {
                            id: 'state',
                            title: 'State',
                            options: stateFacets,
                            selectedValues: columnFilters.state,
                          },
                          {
                            id: 'district',
                            title: 'District',
                            options: districtFacets,
                            selectedValues: columnFilters.district,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['state', 'district'])}
                        sortDirection={sortState?.column === 'location' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('location', dir)}
                      />
                    </div>
                  </th>

                  {/* 5. School & Orphan */}
                  <th className="py-3 px-3.5">
                    <div className="flex items-center justify-between">
                      <span className="truncate">School &amp; Orphan</span>
                      <ColumnFilterPopover
                        columnId="schoolOrphan"
                        columnTitle="School & Orphan"
                        sections={[
                          {
                            id: 'schoolType',
                            title: 'School',
                            options: schoolTypeFacets,
                            selectedValues: columnFilters.schoolType,
                          },
                          {
                            id: 'orphanStatus',
                            title: 'Orphan',
                            options: orphanStatusFacets,
                            selectedValues: columnFilters.orphanStatus,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['schoolType', 'orphanStatus'])}
                        sortDirection={sortState?.column === 'schoolOrphan' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('schoolOrphan', dir)}
                      />
                    </div>
                  </th>

                  {/* 6. Viral Load */}
                  <th className="py-3 px-3">
                    <div className="flex items-center justify-between">
                      <span className="truncate">Viral Load</span>
                      <ColumnFilterPopover
                        columnId="vl"
                        columnTitle="Viral Load"
                        sections={[
                          {
                            id: 'vlCategory',
                            title: 'VL Status',
                            options: vlFacets,
                            selectedValues: columnFilters.vlCategory,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['vlCategory'])}
                        sortDirection={sortState?.column === 'viralLoad' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('viralLoad', dir)}
                      />
                    </div>
                  </th>

                  {/* 8. Haemoglobin */}
                  <th className="py-3 px-3">
                    <div className="flex items-center justify-between">
                      <span className="truncate">Hb</span>
                      <ColumnFilterPopover
                        columnId="hb"
                        columnTitle="Haemoglobin"
                        sections={[
                          {
                            id: 'hbCategory',
                            title: 'Hb Status',
                            options: hbFacets,
                            selectedValues: columnFilters.hbCategory,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['hbCategory'])}
                        sortDirection={sortState?.column === 'hemoglobin' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('hemoglobin', dir)}
                      />
                    </div>
                  </th>

                  {/* 9. Grant (INR) */}
                  <th className="py-3 px-3.5">
                    <div className="flex items-center justify-between">
                      <span className="truncate">Grant</span>
                      <ColumnFilterPopover
                        columnId="grantAmount"
                        columnTitle="Grant (INR)"
                        sections={[
                          {
                            id: 'grantAmount',
                            title: 'Grant Amount',
                            options: grantFacets,
                            selectedValues: columnFilters.grantAmount,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['grantAmount'])}
                        sortDirection={sortState?.column === 'grantAmount' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('grantAmount', dir)}
                      />
                    </div>
                  </th>

                  {/* 10. Documents */}
                  <th className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center">
                      <span className="truncate">Docs</span>
                      <ColumnFilterPopover
                        columnId="documents"
                        columnTitle="Documents"
                        sections={[
                          {
                            id: 'documentStatus',
                            title: 'Document Status',
                            options: docFacets,
                            selectedValues: columnFilters.documentStatus,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['documentStatus'])}
                        sortDirection={sortState?.column === 'documents' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('documents', dir)}
                      />
                    </div>
                  </th>

                  {/* 11. Approval */}
                  <th className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center">
                      <span className="truncate">Approval</span>
                      <ColumnFilterPopover
                        columnId="approval"
                        columnTitle="Approval"
                        sections={[
                          {
                            id: 'approvalStatus',
                            title: 'Approval Status',
                            options: approvalFacets,
                            selectedValues: columnFilters.approvalStatus,
                          },
                        ]}
                        onApply={handleApplyColumnFilter}
                        onClear={() => handleClearColumnFilter(['approvalStatus'])}
                        sortDirection={sortState?.column === 'approval' ? sortState.direction : null}
                        onSortChange={(dir) => handleSortChange('approval', dir)}
                      />
                    </div>
                  </th>

                  {/* 12. Actions (No filter popover as required) */}
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-xs text-slate-400">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                        <span>Loading linelist surveys...</span>
                      </div>
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center">
                      <div className="max-w-md mx-auto text-center space-y-3">
                        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
                        <h4 className="text-sm font-bold text-slate-800">
                          Linelist Upstream Connection Failed
                        </h4>
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
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center">
                      <div className="max-w-xs mx-auto text-center space-y-2">
                        <AlertCircle className="h-8 w-8 text-slate-300 mx-auto" />
                        <h4 className="text-sm font-bold text-slate-700">
                          {hasActiveFilters ? 'No Matching Records' : 'No Survey Records Found'}
                        </h4>
                        <p className="text-xs text-slate-400">
                          {hasActiveFilters
                            ? 'No records match the selected multi-select column filters.'
                            : 'Submitted surveys from field caseworkers will appear here in real-time.'}
                        </p>
                        {hasActiveFilters && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={resetFilters}
                            className="mt-2 text-xs"
                          >
                            Reset All Filters
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => {
                    const stages = deriveSubmissionStages(row.rawRecord || row);
                    return (
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
                      {/* 1. Reference ID */}
                      <td className="py-3.5 px-3.5 font-mono font-bold text-teal-800">
                        <Link href={`/assessment/record/${row.id}`} className="hover:underline">
                          {row.artNumber}
                        </Link>
                      </td>

                      {/* 2. Child Name */}
                      <td className="py-3.5 px-3.5 font-bold text-slate-900">{row.childName}</td>

                      {/* 3. Age / Sex */}
                      <td className="py-3.5 px-3.5 text-slate-600">
                        <div className="font-semibold text-slate-800">
                          {row.age !== null && row.age !== undefined ? `${row.age} yrs` : '—'} • {row.gender}
                        </div>
                      </td>

                      {/* 4. Location (District & State) */}
                      <td className="py-3.5 px-3.5 text-slate-600">
                        <div className="font-semibold text-slate-800">{row.district}</div>
                        <div className="text-[10px] text-slate-400">{row.state || 'Maharashtra'}</div>
                      </td>

                      {/* 5. School & Orphan Status */}
                      <td className="py-3.5 px-3.5 text-slate-600">
                        <div className="font-medium text-slate-800">{row.schoolType}</div>
                        <div className="text-[10px] text-slate-400">{row.orphanStatus}</div>
                      </td>

                      {/* 6. Viral Load */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            row.vlCategory.includes('Unsuppressed')
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-teal-50 text-teal-800 border border-teal-200'
                          }`}
                        >
                          {row.vlCategory.includes('Unsuppressed')
                            ? `${row.viralLoad || ''} c/mL (High)`
                            : row.vlCategory.includes('Undetectable')
                            ? 'Undetectable'
                            : 'Suppressed'}
                        </span>
                      </td>

                      {/* 8. Haemoglobin */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                            row.hbCategory === 'Severe Anemia'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : row.hbCategory === 'Moderate Anemia'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.hemoglobin} {row.hemoglobin && row.hemoglobin !== '—' ? 'g/dL' : ''}
                        </span>
                      </td>

                      {/* 9. Grant Amount */}
                      <td className="py-3.5 px-3.5 font-bold text-teal-900">
                        ₹{row.grantAmount.toLocaleString('en-IN')}
                      </td>

                      {/* 10. Documents & Bank Stage */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {row.documentStatus.isComplete ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                              <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                              Intake Complete
                            </span>
                          ) : (
                            <div className="inline-flex items-center justify-center gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                                Intake Pending
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

                          {row.isApproved && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                stages.bankWorkflow === 'complete'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {stages.bankWorkflow === 'complete' ? 'Bank Details Complete' : 'Bank Details Pending'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 11. Approval Status: Admin / Leadership Actionable Control vs Evaluation Read-Only Badge */}
                      <td className="py-3.5 px-3 text-center">
                        {(user?.role === 'ADMIN' || user?.role === 'LEADERSHIP') ? (
                          <button
                            type="button"
                            onClick={() => setApprovalModalTarget(row)}
                            disabled={updatingApprovalId === row.id}
                            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer shadow-2xs ${
                              row.isApproved
                                ? 'bg-amber-400 text-amber-950 border border-amber-500 hover:bg-amber-300 ring-2 ring-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                                : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 hover:border-slate-400'
                            } ${updatingApprovalId === row.id ? 'opacity-60 cursor-wait' : ''}`}
                            title={
                              row.isApproved
                                ? 'Click to revoke approval'
                                : 'Click to approve survey record'
                            }
                            aria-label={`Approval control: current status ${row.isApproved ? 'Approved' : 'Pending'}`}
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
                                {row.isApproved && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                                )}
                              </span>
                            )}
                            <span>{row.isApproved ? 'Approved' : 'Approve'}</span>
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] ${
                              row.isApproved
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                            title="Evaluation access is read-only. Approval is managed by central administration."
                            aria-label={`Approval status: ${row.isApproved ? 'Approved' : 'Pending'} (Read-only)`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                row.isApproved ? 'bg-amber-600' : 'bg-slate-400'
                              }`}
                            />
                            <span>{row.isApproved ? 'Approved' : 'Pending'}</span>
                          </span>
                        )}
                      </td>

                      {/* 12. Actions Column */}
                      <td className="py-3.5 px-3 text-right">
                        <RecordActionMenu
                          row={row}
                          user={user}
                          onDeleteRequest={(r) =>
                            setDeleteConfirmTarget({
                              id: r.id,
                              name: r.childName,
                              artNumber: r.artNumber,
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })
              )}
              </tbody>
            </table>
          </div>

          {/* Table Client-Side Pagination Bar */}
          {sortedData.length > 0 && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>
                  Showing{' '}
                  <strong>{(currentPage - 1) * pageSize + 1}</strong> to{' '}
                  <strong>{Math.min(currentPage * pageSize, sortedData.length)}</strong> of{' '}
                  <strong>{sortedData.length}</strong> matching records
                </span>
                {authorizedRecords.length !== sortedData.length && (
                  <span className="text-slate-400">
                    (from {authorizedRecords.length} in scope)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2 font-semibold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile View: Cards Over Tables (< 768px) */}
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
              <p className="text-xs text-rose-700">
                {error?.message || 'Connection error with central bridge.'}
              </p>
              <div className="flex justify-center gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={retry} className="text-xs">
                  Retry
                </Button>
                <Button variant="primary" size="sm" onClick={refresh} className="text-xs">
                  Refresh
                </Button>
              </div>
            </div>
          ) : sortedData.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200 space-y-2">
              <p>{hasActiveFilters ? 'No records match the current filters.' : 'No survey records found.'}</p>
              {hasActiveFilters && (
                <Button variant="secondary" size="sm" onClick={resetFilters} className="text-xs">
                  Reset All Filters
                </Button>
              )}
            </div>
          ) : (
            paginatedRows.map((row) => (
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
                      {row.age !== null && row.age !== undefined ? `${row.age} yrs` : '—'} • {row.gender} • {row.district} ({row.state || 'Maharashtra'})
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {row.schoolType} • {row.orphanStatus}
                    </p>
                  </div>
                  {/* Mobile Approval Status (Admin/Leadership Toggle / Read-Only Badge) */}
                  {(user?.role === 'ADMIN' || user?.role === 'LEADERSHIP') ? (
                    <button
                      type="button"
                      onClick={() => setApprovalModalTarget(row)}
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
                  ) : (
                    <span
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                        row.isApproved
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                      title="Evaluation access is read-only"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          row.isApproved ? 'bg-amber-600' : 'bg-slate-400'
                        }`}
                      />
                      <span>{row.isApproved ? 'Approved' : 'Pending'}</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Viral Load:</span>
                    <span
                      className={`font-bold ${
                        row.vlCategory.includes('Unsuppressed') ? 'text-rose-600' : 'text-teal-700'
                      }`}
                    >
                      {row.vlCategory.includes('Unsuppressed') ? `${row.viralLoad || ''} c/mL` : 'Suppressed'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Grant:</span>
                    <span className="font-bold text-teal-900">₹{row.grantAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Mobile Documents & Actions */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
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
                          className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white text-slate-600 border border-slate-300 hover:text-sky-600 hover:border-sky-300 shadow-2xs cursor-pointer"
                          aria-label="View pending documents"
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <RecordActionMenu
                    row={row}
                    user={user}
                    onDeleteRequest={(r) =>
                      setDeleteConfirmTarget({
                        id: r.id,
                        name: r.childName,
                        artNumber: r.artNumber,
                      })
                    }
                  />
                </div>
              </div>
            ))
          )}

          {/* Mobile Pagination Controls */}
          {sortedData.length > 0 && (
            <div className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center justify-between text-xs text-slate-600 shadow-xs">
              <span className="font-medium">
                Page {currentPage} of {totalPages} ({sortedData.length} total)
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 disabled:opacity-40 font-semibold"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 disabled:opacity-40 font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
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
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400" />

              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-50 to-teal-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-xs">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Document Status Cloud</h3>
                    <p className="text-xs text-slate-500">
                      {activeDocModal.childName} •{' '}
                      <span className="font-mono font-semibold text-teal-700">
                        {activeDocModal.artNumber}
                      </span>
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
                  <span
                    className={
                      activeDocModal.status.isComplete
                        ? 'text-emerald-700 font-bold'
                        : 'text-amber-700 font-bold'
                    }
                  >
                    {activeDocModal.status.uploadedCount} of {activeDocModal.status.totalRequired} Uploaded
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      activeDocModal.status.isComplete
                        ? 'bg-emerald-500'
                        : 'bg-gradient-to-r from-amber-400 to-amber-500'
                    }`}
                    style={{
                      width: `${
                        activeDocModal.status.totalRequired > 0
                          ? Math.round(
                              (activeDocModal.status.uploadedCount /
                                activeDocModal.status.totalRequired) *
                                100
                            )
                          : 0
                      }%`,
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
                  <p className="text-xs text-emerald-600 font-medium py-1">
                    All required documents have been uploaded!
                  </p>
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

              {/* Uploaded Documents List with Visual Preview */}
              {activeDocModal.status.uploadedDocs.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Uploaded Documents &amp; Previews ({activeDocModal.status.uploadedDocs.length})</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                    {activeDocModal.status.uploadedDocs.map((doc, idx) => {
                      const docType = getDocTypeParam(doc);
                      const assetUrl = `/api/submissions/${encodeURIComponent(activeDocModal.id)}/asset?docType=${docType}`;
                      return (
                        <div
                          key={idx}
                          className="flex flex-col p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs text-slate-800 truncate" title={doc}>
                              {doc}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              Uploaded
                            </span>
                          </div>
                          <div className="h-28 w-full bg-white rounded-lg border border-slate-200 overflow-hidden relative flex items-center justify-center">
                            <img
                              src={assetUrl}
                              alt={`Preview of ${doc}`}
                              className="w-full h-full object-contain p-1"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                                const parent = (e.target as HTMLElement).parentElement;
                                if (parent && !parent.querySelector('.doc-fallback')) {
                                  const fallback = document.createElement('div');
                                  fallback.className = 'doc-fallback flex flex-col items-center justify-center text-slate-400 p-2 text-center';
                                  fallback.innerHTML = `<span class="text-xs font-medium text-slate-600">Document File</span><span class="text-[10px] text-slate-400">Click preview to open</span>`;
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          </div>
                          <a
                            href={assetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center space-x-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100/70 border border-teal-200 rounded-lg py-1 transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            <span>View Full Document</span>
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                {(user?.role === 'ADMIN' || user?.role === 'LEADERSHIP') && (
                  <Link
                    href={`/assessment/record/${activeDocModal.id}/edit`}
                    className="inline-flex items-center space-x-1.5 text-xs font-bold text-teal-700 hover:text-teal-900 hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Upload Documents in Edit Mode &rarr;</span>
                  </Link>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveDocModal(null)}
                  className="text-xs ml-auto"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Actionable Approval Confirmation Modal for ADMIN and LEADERSHIP */}
        {approvalModalTarget && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-dialog-title"
          >
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
                <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 id="approval-dialog-title" className="text-base font-bold text-slate-900">
                    Confirm Approval Status Transition
                  </h3>
                  <p className="text-xs text-slate-500">
                    Beneficiary: <strong className="text-slate-800">{approvalModalTarget.childName}</strong> • ART ID:{' '}
                    <span className="font-mono font-semibold text-teal-800">
                      {approvalModalTarget.artNumber}
                    </span>
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Current Status:</span>
                  <span className="font-bold text-slate-800">
                    {approvalModalTarget.isApproved ? 'Approved' : 'Pending'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Proposed Transition:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full ${
                      approvalModalTarget.isApproved
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {approvalModalTarget.isApproved ? 'Approved → Pending (Remove Approval)' : 'Pending → Approved (Approve Record)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span>Record Version (OCC):</span>
                  <span className="font-mono font-semibold">v{approvalModalTarget.version}</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Confirming will synchronize this sensitive approval state to the central surveillance sheet under your authorized identity.
              </p>

              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setApprovalModalTarget(null)}
                  disabled={updatingApprovalId === approvalModalTarget.id}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleConfirmApproval(approvalModalTarget)}
                  disabled={updatingApprovalId === approvalModalTarget.id}
                  className={`text-xs ${
                    approvalModalTarget.isApproved
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-teal-800 hover:bg-teal-900 text-white'
                  }`}
                >
                  {updatingApprovalId === approvalModalTarget.id ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>
                      {approvalModalTarget.isApproved ? 'Remove Approval' : 'Approve Record'}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Explicit Single-Record Deletion Modal for ADMIN */}
        {deleteConfirmTarget && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
              <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 id="delete-dialog-title" className="text-base font-bold text-slate-900">
                Delete Beneficiary Survey?
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete the survey record for{' '}
                <strong className="text-slate-900">{deleteConfirmTarget.name}</strong> (ART ID:{' '}
                <span className="font-mono text-teal-800">{deleteConfirmTarget.artNumber}</span>)?
              </p>
              <p className="text-[11px] text-rose-600 mt-2 font-medium">
                This action is irreversible and restricted to verified administrators.
              </p>
              <div className="mt-5 flex items-center justify-end space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmTarget(null)}
                  disabled={isDeleting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Yes, Permanently Delete</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <EvaluationLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </AppShell>
  );
}
