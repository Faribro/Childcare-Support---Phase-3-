'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { ExpensesAndApprovalGrid } from '@/components/education/ExpensesAndApprovalGrid';
import { getDraftByAnyId } from '@/lib/db/draftRepository';
import { enqueueCreate } from '@/features/submission/submissionQueueRepository';
import { processQueue } from '@/features/submission/submissionWorker';
import { waitForSubmissionOutcome } from '@/features/submission/submissionEvents';
import { isValidUuidV4, generateUuidV4 } from '@/features/submission/submissionTypes';
import { getCaregiverSignatureBlob } from '@/lib/db/dexieDb';
import {
  calculateAge,
  calculateBMI,
  classifyNutritionStatus,
} from '@/lib/clinical/nutritionCalculations';
import type { AssessmentRecord } from '@/types/domain';
import {
  User,
  Home,
  HeartPulse,
  GraduationCap,
  FileCheck2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Utensils,
} from 'lucide-react';

export default function DraftReviewPage() {
  const router = useRouter();
  const params = useParams();
  const draftId = params?.draftId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'saving' | 'sending' | 'success' | 'retrying' | 'failed'>('idle');
  const [record, setRecord] = useState<AssessmentRecord | null>(null);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!draftId) return;
      try {
        const found = await getDraftByAnyId(draftId);
        if (found) {
          // Data sanitisation: never retain artCenter
          const sanitizedDemographics = { ...found.demographics };
          delete (sanitizedDemographics as any).artCenter;

          setRecord({
            ...found,
            demographics: sanitizedDemographics,
          });

          // Check if signature blob is present in IndexedDB
          if (found.uuid) {
            const sigBlob = await getCaregiverSignatureBlob(found.uuid);
            setHasSavedSignature(!!sigBlob);
          }
        }
      } catch (err) {
        console.error('Failed to load draft for review:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [draftId]);

  const ageResult = useMemo(() => {
    const dob = record?.demographics?.dob;
    if (!dob) return { years: 0, months: 0, totalMonths: 0 };
    try {
      return calculateAge(dob);
    } catch {
      return { years: 0, months: 0, totalMonths: 0 };
    }
  }, [record?.demographics?.dob]);

  const weightKg = Number(record?.health?.weightKg ?? record?.nutrition?.weightKg ?? 15);
  const heightCm = Number(record?.health?.heightCm ?? record?.nutrition?.heightCm ?? 100);

  const bmiValue = useMemo(() => {
    return calculateBMI(weightKg, heightCm);
  }, [weightKg, heightCm]);

  const nutritionResult = useMemo(() => {
    return classifyNutritionStatus({
      ageYears: ageResult.years || 5,
      heightCm,
      weightKg,
    });
  }, [ageResult.years, heightCm, weightKg]);

  const totalAnnualEducationCost = useMemo(() => {
    const exp = record?.educationExpenses;
    if (!exp) return 0;
    return (
      Number(exp.schoolFees || 0) +
      Number(exp.tuitionFees || 0) +
      Number(exp.books || 0) +
      Number(exp.stationery || 0) +
      Number(exp.uniform || 0) +
      Number(exp.transport || 0) +
      Number(exp.otherExpenses || 0)
    );
  }, [record?.educationExpenses]);

  const totalRequiredSupport = useMemo(() => {
    const req = record?.educationSupportRequired;
    if (!req) return 0;
    return (
      Number(req.requiredSchoolFees || 0) +
      Number(req.requiredBooks || 0) +
      Number(req.requiredStationery || 0) +
      Number(req.requiredUniform || 0) +
      Number(req.requiredTransport || 0) +
      Number(req.requiredOtherSupport || 0)
    );
  }, [record?.educationSupportRequired]);

  const handleQueueForSync = async () => {
    if (!record) return;
    if (!consentConfirmed) {
      setError('Please confirm the verification attestation before submitting.');
      return;
    }

    const rawInterviewer = (record.finalReview?.formSubmittedBy || (record as any).interviewerName || '').trim();
    if (rawInterviewer.length < 2) {
      setError('Please enter your name using at least 2 characters.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const canonicalUuid = isValidUuidV4(record.uuid)
        ? record.uuid
        : isValidUuidV4(record.clientSubmissionId)
        ? record.clientSubmissionId
        : generateUuidV4();

      const finalPayload: AssessmentRecord = {
        ...record,
        uuid: canonicalUuid,
        clientSubmissionId: canonicalUuid,
        interviewerName: rawInterviewer,
        finalReview: {
          ...(record.finalReview || {}),
          allInfoCorrect: record.finalReview?.allInfoCorrect ?? true,
          organizationName: record.finalReview?.organizationName || 'India HIV/AIDS Alliance',
          formSubmittedBy: rawInterviewer,
        },
        stepIndex: 6,
        syncStatus: 'queued',
        updatedAt: new Date().toISOString(),
      };
      await enqueueCreate({
        clientSubmissionId: canonicalUuid,
        createIdempotencyKey: `create-${canonicalUuid}`,
        snapshot: finalPayload,
      });

      // Immediate Autosync Trigger via canonical worker
      const refId = finalPayload.demographics?.artNumber || finalPayload.uniqueId || 'Record';
      const targetClientId = canonicalUuid;

      // ── BLOCKER B FIX: Subscribe BEFORE starting processQueue() ──
      setSubmitStatus('saving');

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setSubmitStatus('sending');

        const outcomePromise = waitForSubmissionOutcome(targetClientId, {
          onSending: () => setSubmitStatus('sending'),
          onRetrying: () => setSubmitStatus('retrying'),
        });

        // Start worker AFTER listeners are registered synchronously
        processQueue('form_submit').catch(() => {/* worker handles its own errors */});

        const outcome = await outcomePromise;
        if (outcome.status === 'success') {
          setSubmitStatus('success');
          router.push(`/assessment/sync?status=synced&ref=${encodeURIComponent(refId)}`);
        } else if (outcome.status === 'failed') {
          setSubmitStatus('failed');
          router.push(`/assessment/sync?status=action_required&ref=${encodeURIComponent(refId)}`);
        } else {
          // Timeout -> non-success tracking state
          router.push(`/assessment/sync?status=syncing&ref=${encodeURIComponent(refId)}`);
        }
      } else {
        router.push(`/assessment/sync?status=offline&ref=${encodeURIComponent(refId)}`);
      }
    } catch (err: any) {
      console.error('Failed to queue draft for sync:', err);
      setError(err?.message || 'Failed to queue assessment for sync.');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-16 text-center text-xs text-slate-500">
          Loading assessment draft...
        </div>
      </AppShell>
    );
  }

  if (!record) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-16 px-4 text-center">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">Draft Not Found</h2>
            <p className="text-xs text-slate-500 mt-1">
              This draft could not be found or has already been queued.
            </p>
            <div className="mt-6">
              <Link href="/assessment/sync?tab=drafts">
                <Button variant="secondary" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  <span>Return to Drafts</span>
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
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-teal-700 text-xs font-bold uppercase tracking-wider mb-1">
              <FileCheck2 className="h-4 w-4" />
              <span>Assessment Draft Pre-Submission Review</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {record.demographics?.childName || 'Unnamed Child'}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Ref: {record.demographics?.artNumber || record.uuid} • Draft ID: {draftId}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Link href={`/assessment/draft/${draftId}`}>
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                <span>Edit Form</span>
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold">Submission Blocked</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Triage & Grant Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            className={`p-4 rounded-2xl border ${
              nutritionResult.nutritionStatus.includes('SAM')
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : nutritionResult.nutritionStatus.includes('MAM')
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-teal-50 border-teal-300 text-teal-900'
            }`}
          >
            <div className="flex items-center space-x-2 mb-1">
              <HeartPulse className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Clinical Triage</span>
            </div>
            <div className="text-base font-bold">{nutritionResult.nutritionStatus}</div>
            <div className="text-xs mt-1 opacity-80">
              BMI: {bmiValue} kg/m² | Ht: {heightCm}cm | Wt: {weightKg}kg
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/50 text-teal-950">
            <div className="flex items-center space-x-2 mb-1 text-teal-700">
              <GraduationCap className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Required Support</span>
            </div>
            <div className="text-xl font-bold text-teal-900">
              ₹{totalRequiredSupport.toLocaleString('en-IN')}
            </div>
            <div className="text-xs mt-1 text-teal-700">
              Annual Cost: ₹{totalAnnualEducationCost.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900">
            <div className="flex items-center space-x-2 mb-1 text-slate-600">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <span className="text-xs font-bold uppercase tracking-wider">Consent & Signature</span>
            </div>
            <div className="flex items-center space-x-1.5 mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-800">
                <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
                {hasSavedSignature ? 'Caregiver signature captured' : 'Consent recorded'}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {record.demographics?.caregiverName} ({record.demographics?.caregiverRelationship})
            </div>
          </div>
        </div>

        {/* SECTION 1: Demographics */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
              <User className="h-4 w-4 text-teal-700" />
              <span>Section 1 — Child & Caregiver Details</span>
            </div>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Reference ID</span>
              <span className="font-mono font-bold text-teal-900">{record.demographics?.artNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Child Full Name</span>
              <span className="font-bold text-slate-900">{record.demographics?.childName}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">DOB & Age</span>
              <span className="font-medium text-slate-800">
                {record.demographics?.dob} ({ageResult.years} yrs)
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Gender</span>
              <span className="font-medium text-slate-800">{record.demographics?.gender}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Orphan Status</span>
              <span className="font-medium text-slate-800">{record.demographics?.orphanStatus}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Caregiver</span>
              <span className="font-medium text-slate-800">{record.demographics?.caregiverName}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Relationship</span>
              <span className="font-medium text-slate-800">{record.demographics?.caregiverRelationship}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Contact Number</span>
              <span className="font-mono font-medium text-slate-800">{record.demographics?.contactNumber || record.demographics?.caregiverPhone}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-slate-400 block mb-0.5">Full Address</span>
              <span className="font-medium text-slate-800">{record.demographics?.fullAddress || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">State / UT</span>
              <span className="font-medium text-slate-800">{record.demographics?.state}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">District</span>
              <span className="font-medium text-slate-800">{record.demographics?.district}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Child Aadhaar Number</span>
              <span className="font-mono font-medium text-slate-800">
                {record.demographics?.childAadhaarNumber || record.bankingAndKyc?.childAadhaarNumber || '—'}
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 2: Caregiver Consent & Signature */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <span>Section 2 — Caregiver Consent & Signature Verification</span>
            </div>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Consent Obtained</span>
              <span className="font-bold text-emerald-800">
                {record.caregiverConsent?.consentProvided || record.consent?.agreeToParticipate ? 'Yes' : 'No'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Caregiver Signature Status</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {hasSavedSignature ? 'Captured (Local Storage)' : (record.caregiverConsent?.signatureStatus || 'Recorded')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Signatory Full Name</span>
              <span className="font-semibold text-slate-800">
                {record.caregiverConsent?.caregiverName || record.demographics?.caregiverName || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Signatory Relationship</span>
              <span className="font-semibold text-slate-800">
                {record.caregiverConsent?.caregiverRelationship || record.demographics?.caregiverRelationship || '—'}
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 3: Banking & KYC Details */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <span>Section 3 — Banking & Identification (KYC) Details</span>
            </div>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Account Holder Name</span>
              <span className="font-semibold text-slate-800">
                {record.bankingAndKyc?.bankAccountHolderName || record.bankDetails?.accountHolderName || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Account Number</span>
              <span className="font-mono font-semibold text-slate-800">
                {record.bankingAndKyc?.bankAccountNumber || record.bankDetails?.accountNumber || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Bank IFSC Code</span>
              <span className="font-mono font-semibold text-slate-800">
                {record.bankingAndKyc?.bankIfscCode || record.bankDetails?.ifscCode || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Bank Linked Mobile</span>
              <span className="font-mono font-semibold text-slate-800">
                {record.bankingAndKyc?.bankLinkedMobileNumber || '—'}
              </span>
            </div>
            <div className="sm:col-span-4 flex flex-wrap gap-4 pt-2 border-t border-slate-100 text-[11px]">
              <span className="text-slate-500">KYC Verification Files:</span>
              <span className="font-medium text-emerald-700">
                ✓ Passbook Front Page: {record.bankingAndKyc?.passbookPhotoUrl ? 'Attached' : 'Provided'}
              </span>
              <span className="font-medium text-emerald-700">
                ✓ Aadhaar Card: {record.bankingAndKyc?.aadhaarCardPhotoUrl ? 'Attached' : 'Provided'}
              </span>
              <span className="font-medium text-emerald-700">
                ✓ Passport Size Photo: {record.bankingAndKyc?.childPhotoUrl ? 'Attached' : 'Provided'}
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 4: Household & Financial */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
              <Home className="h-4 w-4 text-teal-700" />
              <span>Section 4 — Household & Financial Details</span>
            </div>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Total Family Members</span>
              <span className="font-medium text-slate-800">
                {record.householdFinancial?.totalFamilyMembers || record.household?.numberOfSiblings || 1}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Children (≤18 yrs)</span>
              <span className="font-medium text-slate-800">
                {record.householdFinancial?.numberOfChildrenUnder18 ?? 1}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Monthly Income</span>
              <span className="font-medium text-slate-800">
                ₹{(record.householdFinancial?.monthlyIncomeRs || record.household?.monthlyHouseholdIncome || 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Main Source of Income</span>
              <span className="font-medium text-slate-800">
                {record.householdFinancial?.mainSourceOfIncome || record.household?.primaryCaregiverOccupation || '—'}
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 5: Clinical Health, ART & Viral Load */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
              <HeartPulse className="h-4 w-4 text-teal-700" />
              <span>Section 5 — Clinical Health, ART & Viral Load</span>
            </div>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Weight / Height</span>
              <span className="font-medium text-slate-800">
                {weightKg} kg / {heightCm} cm
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">BMI & Category</span>
              <span className="font-medium text-slate-800">
                {bmiValue} kg/m² ({record.health?.bmiCategory || nutritionResult.nutritionStatus})
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Hemoglobin (g/dL)</span>
              <span className="font-medium text-slate-800">
                {record.health?.haemoglobinGdl ? `${record.health.haemoglobinGdl} g/dL (${record.health.hbCategory || 'Normal'})` : 'Not recorded'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">ART Status</span>
              <span className="font-bold text-teal-900">{record.health?.artStatus || 'On ART'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">ART Registration Date</span>
              <span className="font-mono text-slate-800">{record.health?.artRegistrationDate || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">ART ID Number</span>
              <span className="font-mono text-slate-800">{record.health?.artIdNumber || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Viral Load Status</span>
              <span className="font-semibold text-slate-800">{record.health?.vlStatus || 'Tested in last 6 months'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Viral Load & Category</span>
              <span className="font-semibold text-slate-800">
                {record.health?.viralLoad || '< 50'} copies/mL ({record.health?.vlCategory || 'Undetectable'})
              </span>
            </div>
            <div className="sm:col-span-4">
              <span className="text-slate-400 block mb-0.5">Comorbidities / Other Health Conditions</span>
              <span className="font-medium text-slate-800">
                {record.health?.otherHealthConditions && record.health.otherHealthConditions.length > 0
                  ? record.health.otherHealthConditions.join(', ') +
                    (record.health.otherHealthConditionSpecify
                      ? ` (${record.health.otherHealthConditionSpecify})`
                      : '')
                  : 'None reported'}
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 6: Nutrition Habits */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
              <Utensils className="h-4 w-4 text-teal-700" />
              <span>Section 6 — Nutrition Habits</span>
            </div>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Child Appetite</span>
              <span className="font-medium text-slate-800">{record.nutrition?.appetite || 'Good'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Meals Per Day</span>
              <span className="font-medium text-slate-800">{record.nutrition?.mealsPerDay || 3} meals</span>
            </div>
          </div>
        </section>

        {/* SECTION 7: Education Status */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
              <GraduationCap className="h-4 w-4 text-teal-700" />
              <span>Section 7 — Education Status</span>
            </div>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Education Status</span>
              <span className="font-medium text-slate-800">
                {record.educationStatus?.educationStatus || (record.education?.schoolEnrolled ? 'Currently going to school' : 'Out of school')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">School Type</span>
              <span className="font-medium text-slate-800">
                {record.educationStatus?.schoolType || record.education?.schoolType || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Current Class</span>
              <span className="font-medium text-slate-800">
                {record.educationStatus?.currentClass || record.education?.schoolGrade || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Attendance</span>
              <span className="font-medium text-slate-800">
                {record.educationStatus?.attendance || `${record.education?.attendancePercentage || 0}%`}
              </span>
            </div>
            {record.educationStatus?.schoolName && (
              <div className="sm:col-span-2">
                <span className="text-slate-400 block mb-0.5">School Name</span>
                <span className="font-medium text-slate-800">{record.educationStatus.schoolName}</span>
              </div>
            )}
            {record.educationStatus?.schoolSessionStartDate && (
              <div>
                <span className="text-slate-400 block mb-0.5">Session Start Date</span>
                <span className="font-medium text-slate-800">{record.educationStatus.schoolSessionStartDate}</span>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 8: Expenses & Programme Approval Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Section 8 — Education Expenses & Programme Support Breakdown
            </h3>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit Expenses
            </Link>
          </div>
          <ExpensesAndApprovalGrid
            isReadOnly={true}
            currentExpenses={{
              schoolFees: record.educationExpenses?.schoolFees || 0,
              tuitionFees: record.educationExpenses?.tuitionFees || 0,
              books: record.educationExpenses?.books || 0,
              stationery: record.educationExpenses?.stationery || 0,
              uniform: record.educationExpenses?.uniform || 0,
              transport: record.educationExpenses?.transport || 0,
              otherExpenses: record.educationExpenses?.otherExpenses || 0,
              feeReceiptPhotoUrl: record.educationExpenses?.feeReceiptPhotoUrl,
              marksheetPhotoUrl: record.educationExpenses?.marksheetPhotoUrl,
              remarks: record.educationExpenses?.remarks,
            }}
            requiredSupport={{
              requiredSchoolFees: record.educationSupportRequired?.requiredSchoolFees || 0,
              requiredBooks: record.educationSupportRequired?.requiredBooks || 0,
              requiredStationery: record.educationSupportRequired?.requiredStationery || 0,
              requiredUniform: record.educationSupportRequired?.requiredUniform || 0,
              requiredTransport: record.educationSupportRequired?.requiredTransport || 0,
              requiredOtherSupport: record.educationSupportRequired?.requiredOtherSupport || 0,
            }}
            onCurrentExpenseChange={() => {}}
            onRequiredSupportChange={() => {}}
          />
        </section>

        {/* SECTION 9: Programme Approval & Submitter Info */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <span>Section 9 — Programme Approval & Submitter Info</span>
            </div>
            <Link href={`/assessment/draft/${draftId}`} className="text-xs text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Approved Alliance India</span>
              <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                record.finalReview?.approvedAllianceIndia === 'Approved'
                  ? 'bg-emerald-100 text-emerald-800'
                  : record.finalReview?.approvedAllianceIndia === 'Rejected'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {record.finalReview?.approvedAllianceIndia || 'Pending'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Review Confirmed</span>
              <span className="font-semibold text-slate-800">
                {record.finalReview?.allInfoCorrect ? 'Yes' : 'No'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Organization Name</span>
              <span className="font-semibold text-slate-800">
                {record.finalReview?.organizationName || 'India HIV/AIDS Alliance'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Form Submitted By</span>
              <span className="font-semibold text-slate-800">
                {record.finalReview?.formSubmittedBy || 'Caseworker'}
              </span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-slate-400 block mb-0.5">Organization Email</span>
              <span className="font-mono text-slate-800">
                {record.finalReview?.organizationEmail || '—'}
              </span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-slate-400 block mb-0.5">Remarks (If Any)</span>
              <span className="text-slate-800 italic">
                {record.educationExpenses?.remarks || record.health?.clinicalNotes || '—'}
              </span>
            </div>
          </div>
        </section>

        {/* Caseworker Attestation & Verification Checkbox */}
        <section className="bg-teal-50/50 rounded-2xl border border-teal-200 p-5 sm:p-6 space-y-4">
          <div className="flex items-start space-x-3">
            <ShieldCheck className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Caseworker Attestation & Final Verification
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                I verify that all information in this assessment has been checked with the caregiver
                and recorded accurately according to India HIV/AIDS Alliance protocols.
              </p>
            </div>
          </div>

          <label className="flex items-center space-x-3 p-3.5 bg-white border border-teal-200 rounded-xl cursor-pointer hover:bg-teal-50/30 transition-colors">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-xs font-bold text-slate-800">
              IS ALL INFORMATION CORRECT AND COMPLETE? (Yes — all information is verified)
            </span>
          </label>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-teal-200/60">
            <Link href={`/assessment/draft/${draftId}`} className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4 mr-2" />
                <span>Back to Edit</span>
              </Button>
            </Link>

            <Button
              variant="primary"
              onClick={handleQueueForSync}
              isLoading={isSubmitting}
              disabled={!consentConfirmed}
              className="w-full sm:w-auto min-w-[200px]"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              <span>Queue for Sync</span>
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
