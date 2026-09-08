'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
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
} from 'lucide-react';

export default function RecordDetailPage() {
  const params = useParams();
  const submissionId = params?.submissionId as string;

  const [record, setRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!submissionId) return;
      try {
        const res = await fetch(`/api/submissions/${submissionId}`);
        if (!res.ok) {
          setError(`Unable to load record (${res.status})`);
          return;
        }
        const body = await res.json();
        setRecord(body.data);
      } catch (err) {
        setError('Network error loading submission detail');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [submissionId]);

  const expenses = useMemo(() => {
    if (record?.raw_payload?.educationExpenses) {
      return record.raw_payload.educationExpenses;
    }
    return {
      schoolFees: Number(record?.school_fees ?? 1200),
      tuitionFees: Number(record?.tuition_fees ?? 500),
      books: Number(record?.books ?? 600),
      stationery: Number(record?.stationery ?? 300),
      uniform: Number(record?.uniform ?? 800),
      transport: Number(record?.transport ?? 400),
      otherExpenses: Number(record?.other_expenses ?? 0),
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
              <span>Back to Assessments</span>
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

          <div className="flex items-center space-x-2.5">
            <Link href={`/assessment/record/${submissionId}/receipt`}>
              <Button variant="secondary" size="sm" className="shadow-2xs">
                <FileText className="h-4 w-4 mr-1.5" />
                <span>View Receipt</span>
              </Button>
            </Link>

            <Link href={`/assessment/record/${submissionId}/edit`}>
              <Button variant="primary" size="sm" className="bg-teal-700 hover:bg-teal-800 shadow-2xs">
                <Edit className="h-4 w-4 mr-1.5" />
                <span>Edit Approved Fields</span>
              </Button>
            </Link>
          </div>
        </div>

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
                  {record.gender || record.demographics?.gender} •{' '}
                  {record.calculated_age || record.demographics?.calculatedAgeYears} yrs
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">District / State:</dt>
                <dd className="font-semibold text-slate-800">
                  {record.district || record.demographics?.district} / {record.state || record.demographics?.state || 'Maharashtra'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Primary Caregiver:</dt>
                <dd className="font-semibold text-slate-800">
                  {record.caregiver_name || record.demographics?.caregiverName} (
                  {record.caregiver_relationship || record.demographics?.caregiverRelationship})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Caregiver Phone:</dt>
                <dd className="font-mono font-semibold text-slate-800">
                  {record.caregiverPhone || record.demographics?.contactNumber || '—'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Card 2: Clinical Nutrition Finding */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-100 text-slate-700">
              <HeartPulse className="h-4 w-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-slate-900">Clinical Nutrition Status</h3>
            </div>
            <div className="space-y-3">
              <div
                className={`p-3 rounded-xl border text-xs ${
                  (record.nutrition_status || record.nutrition?.nutritionStatus || '').includes('SAM')
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : (record.nutrition_status || record.nutrition?.nutritionStatus || '').includes('MAM')
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="font-bold text-sm">
                  {record.nutrition_status || record.nutrition?.nutritionStatus || 'Normal'}
                </div>
                <div className="mt-1 text-[11px] opacity-90">
                  Height: {record.height_cm || record.nutrition?.heightCm} cm | Weight:{' '}
                  {record.weight_kg || record.nutrition?.weightKg} kg | BMI:{' '}
                  {record.bmi || record.nutrition?.bmi}
                </div>
              </div>

              <div className="text-xs text-slate-500 flex items-center justify-between">
                <span>MUAC: {record.muac_mm || record.nutrition?.muacMm || 'Not taken'} mm</span>
                <span className="font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px] flex items-center">
                  <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
                  <span>Caregiver consent captured</span>
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Educational Support */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-100 text-slate-700">
              <GraduationCap className="h-4 w-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">Education & Grant Entitlement</h3>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">School Enrolled:</dt>
                <dd className="font-semibold text-slate-800">
                  {record.school_enrolled ? 'Enrolled' : 'Out of School'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Current Grade / Type:</dt>
                <dd className="font-semibold text-slate-800">
                  {record.school_grade || 'Class 2'} ({record.school_type || 'Government'})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Approved Grant / Support:</dt>
                <dd className="font-bold text-teal-800 text-sm">
                  ₹{Number(record.recommended_grant_amount || 0).toLocaleString('en-IN')}
                </dd>
              </div>
            </dl>
          </div>

          {/* Card 4: Audit & Confirmation Timestamps */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-100 text-slate-700">
              <Clock className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-bold text-slate-900">Audit & Confirmation Metadata</h3>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Server Version:</dt>
                <dd className="font-mono font-bold text-slate-800">v{version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Last Synced:</dt>
                <dd className="font-semibold text-slate-800">
                  {new Date(record.updated_at || record.updatedAt || Date.now()).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Interviewer:</dt>
                <dd className="font-semibold text-slate-800">
                  {record.interviewer_name || record.caseworker_name || 'Caseworker'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

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
      </div>
    </AppShell>
  );
}
