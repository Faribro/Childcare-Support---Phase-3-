'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Users,
  MapPin,
} from 'lucide-react';
import { SupervisorTabNav } from '@/components/supervisor/SupervisorTabNav';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import {
  useSupervisorData,
  type SupervisorBeneficiaryRow,
  type BeneficiaryDocumentStatus,
} from '@/hooks/useSupervisorData';
import { deduplicateRecordsByChild } from '@/lib/read-model/beneficiaryReadiness';
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
import {
  EvaluationLinelistTable,
  type EvaluationBeneficiaryRow,
} from '@/components/evaluation/EvaluationLinelistTable';
import { ChildApprovalDrawer } from '@/components/evaluation/ChildApprovalDrawer';

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
  const router = useRouter();
  const { isUnlocked, isLoaded, user } = useEvaluationAccess();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const canApprove = user?.role === 'ADMIN' || user?.role === 'LEADERSHIP';
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

  // Dedicated Worklist Tabs & Caseworker Filter
  const [worklistTab, setWorklistTab] = useState<'all' | 'bank_pending' | 'pending_approval' | 'intake_pending' | 'intake_complete'>('all');
  const [workerFilter, setWorkerFilter] = useState<string | null>(null);
  const [missingDocFilter, setMissingDocFilter] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const w = sp.get('worker');
      if (w) setWorkerFilter(w);
      const md = sp.get('missingDoc');
      if (md) setMissingDocFilter(md);
      const tab = sp.get('tab');
      if (tab === 'bank_pending' || tab === 'pending_approval' || tab === 'intake_pending' || tab === 'intake_complete') {
        setWorklistTab(tab);
      }
    }
  }, []);

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
  const [selectedDrawerRow, setSelectedDrawerRow] = useState<EvaluationBeneficiaryRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [updatingApprovalId, setUpdatingApprovalId] = useState<string | null>(null);
  const effectiveLoading = isLoading || (isLoaded && isUnlocked && status === 'idle' && data.length === 0);

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
    setMissingDocFilter(null);
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
      }
    };
    if (activeDocModal || deleteConfirmTarget) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeDocModal, deleteConfirmTarget]);

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

  // Worklist aggregate counts across all children in authorized scope
  const worklistCounts = useMemo(() => {
    let bankPending = 0;
    let pendingApproval = 0;
    let intakePending = 0;
    let intakeComplete = 0;

    for (const r of currentChildRecords) {
      const stages = deriveSubmissionStages(r.rawRecord || r);
      const hasIntakeIncomplete =
        stages.intakeCompleteness === 'incomplete' ||
        stages.intakeCompleteness === 'pending_review' ||
        stages.intakeCompleteness === 'partial';
      if (r.isApproved) {
        if (stages.bankWorkflow !== 'complete') {
          bankPending++;
        } else if (!hasIntakeIncomplete) {
          intakeComplete++;
        }
      } else {
        pendingApproval++;
      }
      if (hasIntakeIncomplete) {
        intakePending++;
      }
    }

    return {
      all: currentChildRecords.length,
      bankPending,
      pendingApproval,
      intakePending,
      intakeComplete,
    };
  }, [currentChildRecords]);

  // Worklist-filtered records before multi-select faceted filters
  const worklistFilteredRecords = useMemo(() => {
    let subset = currentChildRecords;
    if (workerFilter) {
      const wf = workerFilter.toLowerCase();
      subset = subset.filter(
        (r) =>
          (r.submittedBy || '').toLowerCase().includes(wf) ||
          (r.interviewerName || '').toLowerCase().includes(wf)
      );
    }
    if (worklistTab === 'bank_pending') {
      subset = subset.filter((r) => {
        const stages = deriveSubmissionStages(r.rawRecord || r);
        return r.isApproved && stages.bankWorkflow !== 'complete';
      });
    } else if (worklistTab === 'pending_approval') {
      subset = subset.filter((r) => !r.isApproved);
    } else if (worklistTab === 'intake_pending') {
      subset = subset.filter((r) => {
        const stages = deriveSubmissionStages(r.rawRecord || r);
        return (
          stages.intakeCompleteness === 'incomplete' ||
          stages.intakeCompleteness === 'pending_review' ||
          stages.intakeCompleteness === 'partial'
        );
      });
    } else if (worklistTab === 'intake_complete') {
      subset = subset.filter((r) => {
        const stages = deriveSubmissionStages(r.rawRecord || r);
        return r.isApproved && stages.bankWorkflow === 'complete' && stages.intakeCompleteness === 'complete';
      });
    }

    if (missingDocFilter) {
      const target = missingDocFilter.toLowerCase();
      subset = subset.filter((r) => {
        const pending = (r.documentStatus?.pendingDocs || []).map((d) => d.toLowerCase());
        if (target === 'aadhaar') return pending.some((p) => p.includes('aadhaar'));
        if (target === 'passbook') return pending.some((p) => p.includes('passbook') || p.includes('bank'));
        if (target === 'photo') return pending.some((p) => p.includes('photo'));
        if (target === 'signature') return pending.some((p) => p.includes('signature') || p.includes('consent'));
        if (target === 'school') return pending.some((p) => p.includes('school') || p.includes('enrollment') || p.includes('fee'));
        return pending.some((p) => p.includes(target));
      });
    }

    return subset;
  }, [currentChildRecords, workerFilter, worklistTab, missingDocFilter]);

  // 2. Filtered dataset combining global search and multi-select column filters
  const filteredData = useMemo(() => {
    return filterBeneficiaryRows(worklistFilteredRecords, columnFilters, debouncedSearchTerm, user);
  }, [worklistFilteredRecords, columnFilters, debouncedSearchTerm, user]);

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

  // 4b. Formatted Evaluation Rows for 8-column layout with 1-click copy and zero overflow
  const evaluationRows: EvaluationBeneficiaryRow[] = useMemo(() => {
    return paginatedRows.map((row) => {
      const stages = deriveSubmissionStages(row.rawRecord || row);
      const isApproved = row.isApproved;
      const hasIntakeGap =
        stages.intakeCompleteness === 'incomplete' ||
        stages.intakeCompleteness === 'pending_review' ||
        stages.intakeCompleteness === 'partial';

      let docsStatus: 'intake_pending' | 'bank_pending' | 'complete' = 'intake_pending';
      if (isApproved && stages.bankWorkflow === 'pending') {
        docsStatus = 'bank_pending';
      } else if (!hasIntakeGap && (!isApproved || stages.bankWorkflow === 'complete')) {
        docsStatus = 'complete';
      }

      return {
        id: row.id,
        displayCode: row.artNumber,
        childName: row.childName,
        workerName: row.submittedBy || row.interviewerName || row.srName || 'Caseworker',
        ageText: row.age !== null && row.age !== undefined ? `${row.age} yrs` : '—',
        sexText: row.gender || '—',
        district: row.district || '—',
        state: row.state || 'Maharashtra',
        schoolType: row.schoolType || (row.schoolEnrolled ? 'Enrolled' : 'Not Enrolled'),
        orphanStatus: row.orphanStatus || '—',
        grantAmountInr: row.grantAmount || 0,
        docsStatus,
        missingDocs: row.documentStatus?.pendingDocs || [],
        approvalStatus: isApproved ? 'approved' : 'pending',
        viralLoadText: row.viralLoad,
        vlCategory: row.vlCategory,
        hbText: row.hemoglobin,
        hbCategory: row.hbCategory,
        bmiCategory: row.bmiCategory,
      };
    });
  }, [paginatedRows]);

  // 5. Faceted Option Derivation for Multi-Select Filter Ribbon (memoized per column using current child records)

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
    setDebouncedSearchTerm('');
    setColumnFilters(INITIAL_COLUMN_FILTERS);
    setWorkerFilter(null);
    setMissingDocFilter(null);
    setWorklistTab('all');
    setSortState(null);
    setCurrentPage(1);
  }, []);

  // Determine active filter count across all columns & search
  const activeFilterList = useMemo(() => {
    const list: { key: string; label: string; count: number }[] = [];
    if (searchTerm.trim()) {
      list.push({ key: 'search', label: `Search: "${searchTerm}"`, count: 1 });
    }
    if (workerFilter) {
      list.push({ key: 'worker', label: `Field Worker: ${workerFilter}`, count: 1 });
    }
    if (missingDocFilter) {
      list.push({ key: 'missingDoc', label: `Missing Doc: ${missingDocFilter.toUpperCase()}`, count: 1 });
    }
    if (worklistTab !== 'all') {
      const tabLabels: Record<string, string> = {
        bank_pending: 'Worklist: Approved — Bank Pending',
        pending_approval: 'Worklist: Pending Review',
        intake_pending: 'Worklist: Intake Docs Pending',
        intake_complete: 'Worklist: Intake Complete',
      };
      list.push({ key: 'worklist', label: tabLabels[worklistTab] || worklistTab, count: 1 });
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
  }, [searchTerm, workerFilter, missingDocFilter, worklistTab, columnFilters]);

  const hasActiveFilters = activeFilterList.length > 0;

  // Single filter chip removal
  const handleRemoveFilterChip = (key: string) => {
    if (key === 'search') {
      setSearchTerm('');
    } else if (key === 'worker') {
      setWorkerFilter(null);
    } else if (key === 'missingDoc') {
      setMissingDocFilter(null);
    } else if (key === 'worklist') {
      setWorklistTab('all');
    } else {
      handleClearColumnFilter([key as keyof LinelistColumnFilters]);
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
    }
  };

  const handleDrawerConfirmApproval = async (row: EvaluationBeneficiaryRow) => {
    const fullRow = sortedData.find((r) => r.id === row.id) || currentChildRecords.find((r) => r.id === row.id);
    if (fullRow) {
      await handleConfirmApproval(fullRow);
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

  // Loading authorization gate (layout-stabilized skeleton matching Evaluation workspace geometry)
  if (!isLoaded) {
    return (
      <AppShell>
        <div
          className="flex-1 w-full max-w-7xl mx-auto px-4 pt-2 pb-6 sm:pt-3 sm:pb-8 animate-pulse"
          aria-busy="true"
        >
          <span className="sr-only">Verifying Authorization…</span>
          <div className="mb-4 h-[52px] rounded-2xl border border-sky-100/90 bg-white/95 shadow-2xs" />
          <div className="mb-5 rounded-3xl bg-gradient-to-br from-[#07225E] via-[#155AD1] to-[#1E5CC7] h-[204px] shadow-md" />
          <div className="mb-5 h-[48px] rounded-2xl border border-sky-100/90 bg-white" />
          <div className="mb-4 h-[56px] rounded-2xl border border-sky-100/90 bg-white" />
          <div className="rounded-3xl border border-sky-100/90 bg-white h-[360px]" />
        </div>
      </AppShell>
    );
  }

  // Authentication gate for unauthenticated users
  if (isLoaded && !isUnlocked && !isUnauthorized) {
    const isFieldWorker = user?.role === 'FIELD_USER';
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-md mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-[#155AD1] flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              {isFieldWorker ? 'Access Restricted' : 'Authentication Required'}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isFieldWorker
                ? 'The Evaluation portal is permanently restricted to State Reviewers and Leadership. Field caseworkers cannot access clinical surveillance or evaluation linelists.'
                : 'Beneficiary evaluation and surveillance records are restricted to authenticated personnel with authorized state and district scope.'}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              {!isFieldWorker && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="w-full sm:w-auto text-xs bg-[#155AD1] hover:bg-[#093282] text-white rounded-full"
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  Sign In to Access
                </Button>
              )}
              <Link href="/app" className="w-full sm:w-auto">
                <Button variant="secondary" size="sm" className="w-full text-xs">
                  Return to Forms
                </Button>
              </Link>
            </div>
          </div>
        </div>
        {!isFieldWorker && (
          <EvaluationLoginModal
            isOpen={isLoginModalOpen}
            onClose={() => setIsLoginModalOpen(false)}
          />
        )}
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
                className="h-9 px-3.5 text-xs font-semibold text-[#093282] bg-sky-50/80 hover:bg-sky-100 border border-sky-200 rounded-full cursor-pointer transition-colors"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 mr-1.5 text-[#155AD1] ${effectiveLoading ? 'animate-spin' : ''}`}
                />
                <span>Refresh</span>
              </Button>
            </div>
          }
        />

        {/* State Team / Leadership Scope & Programme Overview Banner (Authority Cosmic Royal Blue) */}
        <div
          className="relative mb-5 overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-[0_16px_36px_-12px_rgba(7,43,124,0.35)] space-y-4"
          style={{
            background: 'linear-gradient(135deg, #07225E 0%, #0F3E9E 58%, #1E5CC7 100%)',
          }}
        >
          {/* Subtle Star Sparkles Overlay */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: `radial-gradient(1.5px 1.5px at 20px 30px, #ffffff, transparent),
                                radial-gradient(1px 1px at 80px 60px, rgba(255,255,255,0.7), transparent),
                                radial-gradient(1.5px 1.5px at 160px 25px, #ffffff, transparent),
                                radial-gradient(1px 1px at 240px 75px, rgba(255,255,255,0.6), transparent),
                                radial-gradient(2px 2px at 340px 40px, rgba(255,255,255,0.9), transparent),
                                radial-gradient(1px 1px at 450px 85px, rgba(255,255,255,0.7), transparent),
                                radial-gradient(1.5px 1.5px at 560px 30px, #ffffff, transparent),
                                radial-gradient(1px 1px at 700px 65px, rgba(255,255,255,0.8), transparent),
                                radial-gradient(2px 2px at 840px 45px, rgba(255,255,255,0.9), transparent)`,
              backgroundRepeat: 'repeat',
              backgroundSize: '400px 100px',
            }}
          />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 border border-white/20 rounded-full text-xs font-semibold text-sky-100 mb-1 backdrop-blur-xs">
                <MapPin className="w-3.5 h-3.5 text-sky-200" />
                <span>
                  {user?.role === 'STATE_REVIEWER'
                    ? `State Reviewer Workspace: ${user.allowedStates?.filter((s) => s !== '*').join(', ') || 'State'}`
                    : user?.role === 'LEADERSHIP'
                    ? 'National Leadership Surveillance: All States'
                    : 'System Administrator Surveillance'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                Submitted Surveys &amp; Beneficiary Linelist
              </h2>
              <p className="text-xs text-sky-100/90 mt-0.5 max-w-2xl">
                All successfully submitted assessments across all field caseworkers. Track approvals, intake completeness, and post-approval bank documents.
              </p>
            </div>
            <div className="relative z-10 flex items-center gap-2 self-start sm:self-auto">
              <Link href="/supervisor/field-workers">
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-white/16 hover:bg-white/24 text-white border border-white/25 text-xs rounded-full flex items-center gap-1.5 font-semibold cursor-pointer shadow-xs transition-all backdrop-blur-xs"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Field Workers Directory</span>
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
            <div
              onClick={() => setWorklistTab('all')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer backdrop-blur-xs ${
                worklistTab === 'all'
                  ? 'bg-white/25 border-white/50 shadow-xs ring-1 ring-white/40'
                  : 'bg-white/12 hover:bg-white/18 border-white/20'
              }`}
            >
              <div className="text-sky-200 text-[11px] font-semibold">Total Submitted Surveys</div>
              <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                {worklistCounts.all}
              </div>
              <div className="text-[10px] text-sky-200/70 mt-0.5">All field workers combined</div>
            </div>

            <div
              onClick={() => setWorklistTab('pending_approval')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer backdrop-blur-xs ${
                worklistTab === 'pending_approval'
                  ? 'bg-amber-400/30 border-amber-300/60 shadow-xs ring-1 ring-amber-300/50'
                  : 'bg-white/12 hover:bg-white/18 border-white/20'
              }`}
            >
              <div className="text-amber-200 text-[11px] font-semibold">Pending Review / Decision</div>
              <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                {worklistCounts.pendingApproval}
              </div>
              <div className="text-[10px] text-amber-200/80 mt-0.5">Awaiting leadership grant decision</div>
            </div>

            <div
              onClick={() => setWorklistTab('bank_pending')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer backdrop-blur-xs ${
                worklistTab === 'bank_pending'
                  ? 'bg-sky-400/30 border-sky-300/60 shadow-xs ring-1 ring-sky-300/50'
                  : 'bg-white/12 hover:bg-white/18 border-white/20'
              }`}
            >
              <div className="text-sky-200 text-[11px] font-semibold">Approved — Bank Pending</div>
              <div className="text-xl sm:text-2xl font-extrabold text-amber-300 mt-0.5">
                {worklistCounts.bankPending}
              </div>
              <div className="text-[10px] text-sky-200/80 mt-0.5">Post-approval KYC needed</div>
            </div>

            <div
              onClick={() => setWorklistTab('intake_pending')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer backdrop-blur-xs ${
                worklistTab === 'intake_pending'
                  ? 'bg-rose-500/30 border-rose-300/60 shadow-xs ring-1 ring-rose-300/50'
                  : 'bg-white/12 hover:bg-white/18 border-white/20'
              }`}
            >
              <div className="text-rose-200 text-[11px] font-semibold">Intake Docs Pending</div>
              <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                {worklistCounts.intakePending}
              </div>
              <div className="text-[10px] text-rose-200/80 mt-0.5">Missing passbook/Aadhaar/photo</div>
            </div>

            <div
              onClick={() => setWorklistTab('intake_complete')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer col-span-2 sm:col-span-1 backdrop-blur-xs ${
                worklistTab === 'intake_complete'
                  ? 'bg-emerald-500/30 border-emerald-300/60 shadow-xs ring-1 ring-emerald-300/50'
                  : 'bg-white/12 hover:bg-white/18 border-white/20'
              }`}
            >
              <div className="text-emerald-200 text-[11px] font-semibold">Intake Complete</div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-300 mt-0.5">
                {worklistCounts.intakeComplete}
              </div>
              <div className="text-[10px] text-emerald-200/80 mt-0.5">Approved &amp; all KYC verified</div>
            </div>
          </div>
        </div>

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
                className="text-xs bg-[#155AD1] hover:bg-[#093282] text-white rounded-full"
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

        {/* Dedicated Worklist Tabs for Post-Approval and Intake Tracking */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setWorklistTab('all')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              worklistTab === 'all'
                ? 'bg-[#155AD1] text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-sky-50/70 border border-slate-200'
            }`}
          >
            <span>All Submitted Surveys</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                worklistTab === 'all' ? 'bg-[#093282] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {worklistCounts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorklistTab('bank_pending')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              worklistTab === 'bank_pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            <span>Approved — Bank Documents Pending</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                worklistTab === 'bank_pending' ? 'bg-amber-700 text-amber-100' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {worklistCounts.bankPending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorklistTab('pending_approval')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              worklistTab === 'pending_approval'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-sky-50/70 border border-slate-200'
            }`}
          >
            <span>Pending Review</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                worklistTab === 'pending_approval' ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {worklistCounts.pendingApproval}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorklistTab('intake_pending')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              worklistTab === 'intake_pending'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-white text-rose-800 hover:bg-rose-50 border border-rose-200'
            }`}
          >
            <span>Intake Docs Pending</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                worklistTab === 'intake_pending' ? 'bg-rose-800 text-rose-100' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {worklistCounts.intakePending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorklistTab('intake_complete')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              worklistTab === 'intake_complete'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Intake Complete</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                worklistTab === 'intake_complete' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {worklistCounts.intakeComplete}
            </span>
          </button>
        </div>

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
                className="w-full h-10 pl-10 pr-9 text-xs bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#155AD1] transition-all placeholder:text-slate-400 font-medium text-slate-800"
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
                  className="w-full sm:w-auto h-10 px-4 text-xs font-bold rounded-full border border-sky-200 bg-sky-50 hover:bg-sky-100 text-[#093282] shadow-xs flex items-center justify-center space-x-2 transition-all group cursor-pointer"
                >
                  <Globe className="h-4 w-4 text-[#155AD1] group-hover:rotate-45 transition-transform duration-300 shrink-0" />
                  <span>Open GIS</span>
                  <span className="hidden sm:inline text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full bg-sky-200/80 text-[#07225E] ml-0.5">
                    Map
                  </span>
                </Button>
              </Link>

              <Button
                variant="primary"
                onClick={handleExportCSV}
                disabled={isError || sortedData.length === 0}
                className={`flex-1 sm:flex-initial h-10 px-4 text-xs font-bold rounded-full text-white shadow-xs flex items-center justify-center space-x-2 transition-all shrink-0 ${
                  isError || sortedData.length === 0
                    ? 'opacity-50 cursor-not-allowed pointer-events-none'
                    : 'hover:opacity-95 cursor-pointer'
                }`}
                style={{
                  background: 'linear-gradient(135deg, #1E3A8A 0%, #172554 100%)',
                }}
                title="Export all matching records to CSV with formula injection protection"
              >
                <Download className="h-3.5 w-3.5 text-sky-200 shrink-0" />
                <span>Export CSV</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-white/20 text-white border border-white/30">
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
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-[#093282] border border-sky-200 text-[11px] font-medium"
                  >
                    <span>{item.label}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFilterChip(item.key)}
                      className="text-[#155AD1] hover:text-rose-700 p-0.5 rounded transition-colors cursor-pointer"
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
                  className="text-[#155AD1] hover:text-rose-600 font-bold hover:underline cursor-pointer text-[11px] flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Clear all</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Universal Multi-Select Faceted Filter Ribbon */}
        <div className="mb-4 bg-white rounded-2xl border border-sky-100/90 p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#093282] flex items-center gap-1.5 shrink-0">
            <Filter className="h-3.5 w-3.5 text-[#155AD1]" />
            <span>Filters:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ColumnFilterPopover
              showLabel
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
              showLabel
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
              showLabel
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
              showLabel
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
              showLabel
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

        {/* Beneficiary Linelist 8-Column Table & Responsive Mobile Stack (Zero Horizontal Overflow, No Clinical Clutter) */}
        <div className="space-y-4">
          <EvaluationLinelistTable
            rows={evaluationRows}
            isLoading={effectiveLoading}
            canApprove={canApprove}
            onOpenApprovalModal={(row) => {
              setSelectedDrawerRow(row);
              setIsDrawerOpen(true);
            }}
            onViewDossier={(row) => {
              router.push(`/assessment/record/${row.id}`);
            }}
          />

          {/* Client-Side Pagination Bar */}
          {sortedData.length > 0 && (
            <div className="p-3.5 bg-white rounded-2xl border border-sky-100 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>
                  Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to{' '}
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
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#07225E] via-[#155AD1] to-sky-400" />

              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 flex items-center justify-center text-[#155AD1] shadow-xs">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Document Status Cloud</h3>
                    <p className="text-xs text-slate-500">
                      {activeDocModal.childName} •{' '}
                      <span className="font-mono font-semibold text-[#093282]">
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
                            className="inline-flex items-center justify-center space-x-1 text-[11px] font-bold text-[#093282] hover:text-[#07225E] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg py-1 transition-colors"
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
                    className="inline-flex items-center space-x-1.5 text-xs font-bold text-[#155AD1] hover:text-[#093282] hover:underline"
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

        {/* High-Trust Child Approval Drawer for ADMIN and LEADERSHIP */}
      <ChildApprovalDrawer
        isOpen={isDrawerOpen}
        row={selectedDrawerRow}
        rawRecord={(() => {
          const match = sortedData.find((r) => r.id === selectedDrawerRow?.id);
          return match?.rawRecord || match;
        })()}
        isLoading={updatingApprovalId === selectedDrawerRow?.id}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedDrawerRow(null);
        }}
        onConfirmApproval={handleDrawerConfirmApproval}
        onViewDossier={(row) => router.push(`/assessment/record/${row.id}`)}
      />

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
                <span className="font-mono text-[#093282]">{deleteConfirmTarget.artNumber}</span>)?
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
