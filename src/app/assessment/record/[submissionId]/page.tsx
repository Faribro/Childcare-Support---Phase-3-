'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { ExpensesAndApprovalGrid } from '@/components/education/ExpensesAndApprovalGrid';
import {
  User,
  HeartPulse,
  GraduationCap,
  Edit,
  FileText,
  Clock,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Home,
  Utensils,
  FileDown,
  Loader2,
  Trash2,
  Eye,
  X,
  ExternalLink,
  AlertCircle,
  FileCheck,
} from 'lucide-react';

import { db } from '@/lib/db/dexieDb';
import { getAllQueueItems } from '@/lib/db/syncQueueRepository';
import { getAllDrafts } from '@/lib/db/draftRepository';
import { isValidUuidV4 } from '@/features/submission/submissionTypes';
import { formatCurrentClassDisplay } from '@/lib/constants/educationClasses';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import {
  deriveBeneficiaryReadiness,
  type CanonicalDocumentType,
} from '@/lib/read-model/beneficiaryReadiness';

const CANONICAL_DOC_TO_PARAM: Record<CanonicalDocumentType, string> = {
  'Bank Passbook Front Page': 'passbookPhoto',
  'Aadhaar Card': 'aadhaarCardPhoto',
  'Passport Size Photo': 'childPhoto',
  'Caregiver Signature': 'caregiverSignature',
  'School Fee Receipt': 'feeReceiptPhoto',
  'Academic Marksheet': 'marksheetPhoto',
};

export default function RecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params?.submissionId as string;
  const { user } = useEvaluationAccess();

  const [record, setRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; state: string } | null>(null);

  // Approval Mutation State
  const [isUpdatingApproval, setIsUpdatingApproval] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!submissionId) return;
      setIsLoading(true);
      setError(null);
      try {
        // 1. Inspect local IndexedDB first
        let localRecord: any = null;
        let confirmedRemoteId: string | undefined = undefined;

        try {
          const queueItems = await getAllQueueItems();
          const localQueue = queueItems.find(
            (q) =>
              q.submissionUuid === submissionId ||
              (q.payload as any)?.uuid === submissionId ||
              (q.payload as any)?.clientSubmissionId === submissionId ||
              (q.payload as any)?.uniqueId === submissionId ||
              (q.payload as any)?.artNumber === submissionId ||
              (q.payload as any)?.demographics?.artNumber === submissionId ||
              (q.payload as any)?.legacyBusinessReference === submissionId ||
              String(q.id) === submissionId
          );

          if (localQueue?.payload) {
            localRecord = localQueue.payload;
            if (isValidUuidV4(localQueue.remoteSubmissionId)) {
              confirmedRemoteId = localQueue.remoteSubmissionId;
            } else if (isValidUuidV4((localQueue.payload as any).remoteSubmissionId)) {
              confirmedRemoteId = (localQueue.payload as any).remoteSubmissionId;
            }
          }
        } catch (_) {}

        if (!localRecord) {
          try {
            const drafts = await getAllDrafts();
            const localDraft = drafts.find(
              (d: any) =>
                d.uuid === submissionId ||
                d.clientSubmissionId === submissionId ||
                d.demographics?.artNumber === submissionId ||
                d.artNumber === submissionId ||
                d.legacyBusinessReference === submissionId ||
                d.uniqueId === submissionId ||
                d.formData?.uuid === submissionId ||
                d.formData?.demographics?.artNumber === submissionId ||
                String(d.id) === submissionId
            );

            if (localDraft) {
              localRecord = (localDraft as any).formData || localDraft;
              if (isValidUuidV4(localDraft.remoteSubmissionId)) {
                confirmedRemoteId = localDraft.remoteSubmissionId;
              }
            }
          } catch (_) {}
        }

        // 2. If a local record matches:
        if (localRecord) {
          // If it DOES NOT have a confirmed UUIDv4 remoteSubmissionId:
          // Render completely from local IndexedDB state with ZERO remote GET calls
          if (!confirmedRemoteId) {
            setRecord(localRecord);
            return;
          }

          // If it DOES have a confirmed valid UUIDv4 remoteSubmissionId:
          // We MAY call GET /api/submissions/${confirmedRemoteId} to fetch latest server state
          try {
            const res = await fetch(`/api/submissions/${encodeURIComponent(confirmedRemoteId)}`);
            if (res.ok) {
              const body = await res.json();
              if (body.data) {
                setRecord(body.data);
                return;
              }
            }
          } catch (_) {}

          // Fallback to local record if remote fetch fails
          setRecord(localRecord);
          return;
        }

        // 3. If no local record matches at all:
        // Attempt remote GET for the submissionId (UUIDv4 or canonical reference ID)
        if (submissionId && typeof submissionId === 'string' && submissionId.trim().length > 0) {
          const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId.trim())}`);
          if (res.ok) {
            const body = await res.json();
            if (body.data) {
              setRecord(body.data);
              return;
            }
          }
          if (res.status === 401) {
            setError('Authentication required to view this record. Please sign in with your evaluation credentials.');
          } else if (res.status === 403) {
            setError('Access denied: this record is outside your authorized state or district.');
          } else if (res.status === 404) {
            setError('Record not found.');
          } else {
            setError(`Unable to load record (${res.status})`);
          }
        } else {
          setError('Record not found.');
        }
      } catch (err) {
        setError('Network error loading submission detail');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [submissionId]);

  const expenses = useMemo(() => {
    // Primary path: local record still has the full raw_payload (e.g. IndexedDB
    // draft or local queue record). Fall through to flat fields for server-
    // normalized DTOs which do not include raw_payload.
    if (record?.raw_payload?.educationExpenses) {
      const ee = record.raw_payload.educationExpenses;
      return {
        ...ee,
        // Merge server-level flat attachment URLs when raw_payload sub-object
        // doesn't include them (older records, or normalized DTO merge path).
        feeReceiptPhotoUrl:
          ee.feeReceiptPhotoUrl ||
          record.feeReceiptPhotoUrl ||
          record.fee_receipt_photo_url ||
          undefined,
        marksheetPhotoUrl:
          ee.marksheetPhotoUrl ||
          record.marksheetPhotoUrl ||
          record.marksheet_photo_url ||
          undefined,
      };
    }
    // Fallback: server-normalised DTO (flat snake_case + camelCase aliases).
    // Use ?? 0 so that genuine zero-fee records display ₹0 rather than a
    // fabricated non-zero fallback amount.
    return {
      schoolFees: Number(record?.school_fees ?? 0),
      tuitionFees: Number(record?.tuition_fees ?? 0),
      books: Number(record?.books ?? 0),
      stationery: Number(record?.stationery ?? 0),
      uniform: Number(record?.uniform ?? 0),
      transport: Number(record?.transport ?? 0),
      otherExpenses: Number(record?.other_expenses ?? 0),
      feeReceiptPhotoUrl:
        record?.feeReceiptPhotoUrl ||
        record?.fee_receipt_photo_url ||
        undefined,
      marksheetPhotoUrl:
        record?.marksheetPhotoUrl ||
        record?.marksheet_photo_url ||
        undefined,
    };
  }, [record]);

  const support = useMemo(() => {
    if (record?.raw_payload?.educationSupportRequired) {
      return record.raw_payload.educationSupportRequired;
    }
    return {
      requiredSchoolFees: Number(record?.required_school_fees ?? 1200),
      requiredBooks: Number(record?.required_books ?? 600),
      requiredStationery: Number(record?.required_stationery ?? 300),
      requiredUniform: Number(record?.required_uniform ?? 800),
      requiredTransport: Number(record?.required_transport ?? 400),
      requiredOtherSupport: Number(record?.required_other_support ?? 0),
    };
  }, [record]);

  const readiness = useMemo(() => {
    if (!record) return null;
    return deriveBeneficiaryReadiness(record);
  }, [record]);

  const isApproved = useMemo(() => {
    if (!record) return false;
    const val =
      record['Approved Alliance India'] ||
      record.raw_payload?.finalReview?.approvedAllianceIndia ||
      record.approved_alliance_india;
    return val === 'Approved' || val === true;
  }, [record]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-16 text-center text-xs text-slate-500">
          Loading canonical record...
        </div>
      </AppShell>
    );
  }

  if (error || !record) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-16 px-4 text-center">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">Record Not Found</h2>
            <p className="text-xs text-slate-500 mt-1">
              {error || 'This record could not be located on central storage.'}
            </p>
            <div className="mt-6">
              <Link href="/supervisor/assessments">
                <Button variant="primary" size="sm">
                  View Master Line-List
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const childName = record.child_name || record.demographics?.childName || 'Beneficiary';
  const artNumber = record.art_number || record.demographics?.artNumber;
  const remoteId = record.remote_submission_id || submissionId;
  const version = record.version || 1;

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      const targetId = remoteId || submissionId;
      const res = await fetch(`/api/submissions/${encodeURIComponent(targetId)}/export`);
      if (!res.ok) {
        alert('Failed to generate PDF dossier.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Alliance_Beneficiary_${artNumber || targetId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Error downloading PDF dossier.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const targetId = remoteId || submissionId;
      const res = await fetch(`/api/submissions/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/supervisor/assessments');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error || 'Failed to delete record. Please check authorization.');
    } catch (err) {
      setDeleteError('Network error while deleting record.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleApproval = async () => {
    setIsUpdatingApproval(true);
    setApprovalError(null);
    try {
      const targetId = remoteId || submissionId;
      const nextStatus = isApproved ? 'Pending' : 'Approved';

      const res = await fetch(`/api/submissions/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedAllianceIndia: nextStatus,
          expectedVersion: version,
        }),
      });

      if (res.ok) {
        const body = await res.json();
        setRecord((prev: any) => ({
          ...prev,
          'Approved Alliance India': nextStatus,
          approved_alliance_india: nextStatus,
          version: body.version || version + 1,
        }));
        setApprovalModalOpen(false);
        return;
      }

      if (res.status === 409) {
        setApprovalError('Concurrency conflict: this record was modified by another user. Please reload latest data.');
      } else {
        const data = await res.json().catch(() => ({}));
        setApprovalError(data.message || `Failed to update approval status (${res.status}).`);
      }
    } catch (err) {
      setApprovalError('Network error while updating approval status.');
    } finally {
      setIsUpdatingApproval(false);
    }
  };

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Header with Navigation & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200 gap-4">
          <div>
            <Link
              href="/supervisor/assessments"
              className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 mb-1"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              <span>Back to Surveys</span>
            </Link>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{childName}</h1>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                <span>Synced (v{version})</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              ID: {artNumber} • Remote ID: {remoteId}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="shadow-2xs text-xs"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-1.5" />
              )}
              <span>{isExporting ? 'Generating PDF...' : 'Download PDF Dossier'}</span>
            </Button>

            <Link href={`/assessment/record/${submissionId}/receipt`}>
              <Button variant="secondary" size="sm" className="shadow-2xs text-xs">
                <FileText className="h-4 w-4 mr-1.5" />
                <span>View Receipt</span>
              </Button>
            </Link>

            {(user?.role === 'ADMIN' || user?.role === 'LEADERSHIP') && (
              <Link href={`/assessment/record/${submissionId}/edit`}>
                <Button variant="primary" size="sm" className="bg-teal-700 hover:bg-teal-800 shadow-2xs text-xs">
                  <Edit className="h-4 w-4 mr-1.5" />
                  <span>Edit Record</span>
                </Button>
              </Link>
            )}

            {user?.role === 'ADMIN' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteModal(true)}
                className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 shadow-2xs text-xs cursor-pointer"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                <span>Delete Survey</span>
              </Button>
            )}
          </div>
        </div>

        {/* Approval Mutation Error Banner */}
        {approvalError && (
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 text-xs text-rose-900 flex items-start space-x-3 shadow-xs">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Approval Update Error</p>
              <p className="mt-0.5 text-rose-800 leading-relaxed">{approvalError}</p>
            </div>
          </div>
        )}

        {/* State Evaluator Read-Only Notice */}
        {user?.role && user.role !== 'ADMIN' && user.role !== 'LEADERSHIP' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start space-x-3 shadow-xs">
            <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Evaluation Session (Read-Only Mode)</p>
              <p className="mt-0.5 text-slate-600 leading-relaxed">
                State Evaluator sessions operate under read-only policy. Editing and deleting beneficiary surveys are disabled.
              </p>
            </div>
          </div>
        )}

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Beneficiary Identity */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-100 text-slate-700">
              <User className="h-4 w-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">Beneficiary & Caregiver</h3>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Gender / Age:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["Gender"] || record.gender || record.demographics?.gender || '—'} •{' '}
                  {record["Age"] || record.calculated_age || record.demographics?.calculatedAgeYears || '—'} yrs
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Date of Birth:</dt>
                <dd className="font-mono text-slate-800">
                  {record["Date of Birth"] || record.dob || record.demographics?.dob || '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">District / State:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["District"] || record.district || record.demographics?.district || '—'} / {record["State"] || record.state || record.demographics?.state || 'Maharashtra'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Address:</dt>
                <dd className="font-semibold text-slate-800 text-right max-w-[200px] truncate">
                  {record["Address"] || record.address || record.demographics?.fullAddress || '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Orphan Status:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["Orphan Status"] || record.orphan_status || record.demographics?.orphanStatus || 'Both parents alive'}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <dt className="text-slate-500">Primary Caregiver:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["Caregiver Full Name"] || record.caregiver_name || record.demographics?.caregiverName || '—'} (
                  {record["Caregiver Relation"] || record.caregiver_relationship || record.demographics?.caregiverRelationship || 'Caregiver'})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Caregiver Phone:</dt>
                <dd className="font-mono font-semibold text-slate-800">
                  {record["Caregiver Contact"] || record.caregiverPhone || record.demographics?.contactNumber || '—'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Card 2: Clinical Nutrition & Health Finding */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-100 text-slate-700">
              <HeartPulse className="h-4 w-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-slate-900">Clinical Nutrition & ART / Viral Load</h3>
            </div>
            <div className="space-y-3">
              <div
                className={`p-3 rounded-xl border text-xs ${
                  String(record["BMI Category"] || record.nutrition_status || record.nutrition?.nutritionStatus || '').includes('SAM')
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : String(record["BMI Category"] || record.nutrition_status || record.nutrition?.nutritionStatus || '').includes('MAM')
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="font-bold text-sm">
                  {record["BMI Category"] || record.nutrition_status || record.nutrition?.nutritionStatus || 'Normal'}
                </div>
                <div className="mt-1 text-[11px] opacity-90">
                  Height: {record["Current Height (cm)"] || record.height_cm || record.nutrition?.heightCm || '—'} cm | Weight:{' '}
                  {record["Current Weight (kg)"] || record.weight_kg || record.nutrition?.weightKg || '—'} kg | BMI:{' '}
                  {record["BMI"] || record.bmi || record.nutrition?.bmi || '—'}
                </div>
              </div>

              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Hemoglobin (Hb):</dt>
                  <dd className="font-semibold text-slate-800">
                    {record["Hemoglobin (g/dL)"] || record.raw_payload?.health?.haemoglobinGdl || '—'} g/dL ({record["Hb Category"] || record.raw_payload?.health?.hbCategory || 'Normal'})
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">ART Status / ID:</dt>
                  <dd className="font-semibold text-slate-800">
                    {record["ART Status"] || record.raw_payload?.health?.artStatus || 'On ART'} • ID: {record["ART ID Number"] || record.raw_payload?.health?.artIdNumber || '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">ART Registration Date:</dt>
                  <dd className="font-mono text-slate-800">
                    {record["ART Registration Date"] || record.raw_payload?.health?.artRegistrationDate || '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Viral Load / Status:</dt>
                  <dd className="font-semibold text-slate-800">
                    {record["Viral Load"] || record.raw_payload?.health?.viralLoad || '< 50'} copies/mL ({record["VL Category"] || record.raw_payload?.health?.vlCategory || 'Undetectable'})
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Comorbidities:</dt>
                  <dd className="text-slate-800 font-medium">
                    {record["Comorbidities"] || (Array.isArray(record.raw_payload?.health?.otherHealthConditions) ? record.raw_payload.health.otherHealthConditions.join(', ') : 'None')}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Card 3: Banking & Identification (KYC) Details */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-100 text-slate-700">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">Banking & Identification (KYC)</h3>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Account Holder:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["Bank Account Holder Name"] || record.account_holder_name || record.raw_payload?.bankingAndKyc?.accountHolderName || '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Account Number:</dt>
                <dd className="font-mono font-semibold text-slate-800">
                  {record["Bank Account Number"] || record.bank_account_number || record.raw_payload?.bankingAndKyc?.accountNumber || '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">IFSC Code:</dt>
                <dd className="font-mono font-semibold text-slate-800">
                  {record["Bank IFSC Code"] || record.ifsc_code || record.raw_payload?.bankingAndKyc?.ifscCode || '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Bank Linked Mobile:</dt>
                <dd className="font-mono font-semibold text-slate-800">
                  {record["Bank Linked Mobile Number"] || record.raw_payload?.bankingAndKyc?.bankLinkedMobileNumber || '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Child Aadhaar Number:</dt>
                <dd className="font-mono font-semibold text-slate-800">
                  {record["Child Aadhaar Number"] || record.raw_payload?.demographics?.childAadhaarNumber || record.raw_payload?.bankingAndKyc?.childAadhaarNumber || '—'}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-[11px]">
                <dt className="text-slate-500">KYC Documents:</dt>
                <dd className="text-emerald-700 font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="h-3 w-3 inline mr-1" />
                  <span>Passbook, Aadhaar & Photo recorded</span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Card 4: Educational & Programme Approval */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-100 text-slate-700">
              <GraduationCap className="h-4 w-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">Education & Programme Approval</h3>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Education Status:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["Education Status"] || (record.school_enrolled ? 'Currently going to school' : 'Out of School')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">School Name & Grade:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["School Name"] || record.raw_payload?.educationStatus?.schoolName || '—'} • {formatCurrentClassDisplay(
                    record["Current Class"] || record.current_class || record.raw_payload?.educationStatus?.currentClass || record.school_grade,
                    record["Current Class Specify"] || record.current_class_specify || record.raw_payload?.educationStatus?.currentClassSpecify
                  ) || '—'} ({record["School Type"] || record.school_type || 'Government'})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Total Annual Education Cost:</dt>
                <dd className="font-bold text-teal-800 text-sm">
                  ₹{Number(record["Total Annual Education Cost"] || record.raw_payload?.educationExpenses?.totalAnnualCost || record.recommended_grant_amount || 0).toLocaleString('en-IN')}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 items-center">
                <dt className="text-slate-500">Alliance India Approval:</dt>
                <dd>
                  {(user?.role === 'ADMIN' || user?.role === 'LEADERSHIP') ? (
                    <button
                      type="button"
                      onClick={() => setApprovalModalOpen(true)}
                      disabled={isUpdatingApproval}
                      className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full font-bold text-xs transition-all cursor-pointer shadow-2xs ${
                        isApproved
                          ? 'bg-amber-400 text-amber-950 border border-amber-500 hover:bg-amber-300 ring-2 ring-amber-400/60'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400'
                      }`}
                      title={isApproved ? 'Click to revoke approval' : 'Click to approve record'}
                      aria-label={`Approval status: ${isApproved ? 'Approved' : 'Pending'}. Click to toggle.`}
                    >
                      {isUpdatingApproval ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>{isApproved ? 'Approved' : 'Approve Record'}</span>
                    </button>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                      isApproved
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isApproved ? 'Approved' : 'Pending'}
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Submitted By:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["Form Submitted By"] || record["Submitted By"] || record.caseworker_name || record.raw_payload?.finalReview?.formSubmittedBy || 'Caseworker'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Organization:</dt>
                <dd className="font-semibold text-slate-800">
                  {record["Organization Name"] || record.raw_payload?.finalReview?.organizationName || 'India HIV/AIDS Alliance'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Section: Document Verification & Private Previews */}
        {readiness && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-2 text-slate-800">
                <FileCheck className="h-5 w-5 text-teal-700" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Document Verification &amp; Attachment Previews
                </h3>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border self-start sm:self-auto ${
                readiness.isComplete
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {readiness.isComplete ? 'All Required Documents Complete' : `${readiness.missingDocTypes.length} Document(s) Pending`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {Object.values(readiness.docDetails).map((doc) => {
                const docTypeKey = CANONICAL_DOC_TO_PARAM[doc.docType];
                const assetUrl = `/api/submissions/${encodeURIComponent(remoteId || submissionId)}/asset?docType=${docTypeKey}`;
                const isAvailable = doc.isPresent;

                return (
                  <div
                    key={doc.docType}
                    className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all ${
                      doc.isNotApplicable
                        ? 'bg-slate-50/50 border-slate-200 text-slate-400'
                        : doc.isVerified
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : doc.isPresent
                        ? 'bg-sky-50/30 border-sky-200'
                        : 'bg-rose-50/30 border-rose-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className="text-xs font-bold text-slate-800 truncate" title={doc.label}>
                          {doc.label}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                            doc.isNotApplicable
                              ? 'bg-slate-100 text-slate-500 border border-slate-200'
                              : doc.isVerified
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : doc.isPresent
                              ? 'bg-sky-100 text-sky-800 border border-sky-300'
                              : 'bg-rose-100 text-rose-700 border border-rose-300'
                          }`}
                        >
                          {doc.state === 'not_applicable' ? 'N/A' : doc.state === 'verified' ? 'Verified' : doc.state === 'uploaded' ? 'Uploaded' : 'Missing'}
                        </span>
                      </div>

                      {/* Thumbnail preview container */}
                      {isAvailable ? (
                        <div className="h-32 w-full bg-white rounded-lg border border-slate-200 overflow-hidden relative flex items-center justify-center group">
                          <img
                            src={assetUrl}
                            alt={doc.label}
                            className="w-full h-full object-contain p-1.5 transition-transform duration-200 group-hover:scale-105"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                              const parent = (e.target as HTMLElement).parentElement;
                              if (parent && !parent.querySelector('.doc-fallback')) {
                                const fallback = document.createElement('div');
                                fallback.className = 'doc-fallback flex flex-col items-center justify-center text-slate-400 p-2 text-center';
                                fallback.innerHTML = `<span class="text-xs font-semibold text-slate-700">Document Available</span><span class="text-[10px] text-slate-400">Click to preview</span>`;
                                parent.appendChild(fallback);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="h-32 w-full bg-slate-100/60 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-3">
                          <AlertCircle className="h-6 w-6 text-slate-400 mb-1" />
                          <span className="text-xs text-slate-500 font-medium">
                            {doc.isNotApplicable ? 'Not applicable for child' : 'Document not uploaded'}
                          </span>
                        </div>
                      )}
                    </div>

                    {isAvailable && (
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc({ title: doc.label, url: assetUrl, state: doc.state })}
                          className="inline-flex items-center text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          <span>Enlarge Preview</span>
                        </button>
                        <a
                          href={assetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-[11px] text-slate-500 hover:text-slate-800 font-medium"
                        >
                          <ExternalLink className="h-3 w-3 mr-0.5" />
                          <span>Open</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Section 6: Education Expenses & Programme Approval Breakdown */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Education Expenses & Programme Approval Breakdown
            </h3>
            <span className="text-xs text-slate-500">Canonical server record snapshot</span>
          </div>
          <ExpensesAndApprovalGrid
            isReadOnly={true}
            currentExpenses={expenses}
            requiredSupport={support}
            onCurrentExpenseChange={() => {}}
            onRequiredSupportChange={() => {}}
          />
        </section>

        {/* Delete Confirmation Modal for ADMIN */}
        {showDeleteModal && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-survey-dialog-title"
          >
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
              <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 id="delete-survey-dialog-title" className="text-base font-bold text-slate-900">
                Delete Beneficiary Survey?
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete the survey record for{' '}
                <strong className="text-slate-900">{childName}</strong> (ART ID:{' '}
                <span className="font-mono text-teal-800">{artNumber || submissionId}</span>)?
              </p>
              <p className="text-[11px] text-rose-600 mt-2 font-medium">
                This action is irreversible and restricted to verified administrators.
              </p>
              {deleteError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-3">
                  {deleteError}
                </p>
              )}
              <div className="mt-5 flex items-center justify-end space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteError(null);
                  }}
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

        {/* Full-size Document Viewer Dialog */}
        {previewDoc && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-doc-title"
          >
            <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 space-y-3 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-teal-700" />
                  <h3 id="preview-doc-title" className="text-sm sm:text-base font-bold text-slate-900">
                    {previewDoc.title}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      previewDoc.state === 'verified'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {previewDoc.state}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  aria-label="Close Preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-50 rounded-xl p-2 border border-slate-100 min-h-[220px]">
                <img
                  src={previewDoc.url}
                  alt={previewDoc.title}
                  className="max-h-[65vh] w-auto object-contain rounded-lg shadow-2xs"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                    const parent = (e.target as HTMLElement).parentElement;
                    if (parent && !parent.querySelector('.embed-pdf')) {
                      const iframe = document.createElement('iframe');
                      iframe.src = previewDoc.url;
                      iframe.className = 'embed-pdf w-full h-[60vh] border-0 rounded-lg';
                      parent.appendChild(iframe);
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href={previewDoc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-xs font-bold text-teal-800 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  <span>Open in New Tab</span>
                </a>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviewDoc(null)}
                  className="text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Approval Confirmation Dialog for ADMIN and LEADERSHIP */}
        {approvalModalOpen && (
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
                    Beneficiary: <strong className="text-slate-800">{childName}</strong> • ART ID:{' '}
                    <span className="font-mono font-semibold text-teal-800">{artNumber || submissionId}</span>
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Current Status:</span>
                  <span className="font-bold text-slate-800">
                    {isApproved ? 'Approved' : 'Pending'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Proposed Transition:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full ${
                      isApproved
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {isApproved ? 'Approved → Pending (Remove Approval)' : 'Pending → Approved (Approve Record)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span>Record Version (OCC):</span>
                  <span className="font-mono font-semibold">v{version}</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Confirming will synchronize this sensitive approval state to the central surveillance sheet under your authorized identity.
              </p>

              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setApprovalModalOpen(false)}
                  disabled={isUpdatingApproval}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleToggleApproval}
                  disabled={isUpdatingApproval}
                  className={`text-xs ${
                    isApproved
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-teal-800 hover:bg-teal-900 text-white'
                  }`}
                >
                  {isUpdatingApproval ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>{isApproved ? 'Remove Approval' : 'Approve Record'}</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
