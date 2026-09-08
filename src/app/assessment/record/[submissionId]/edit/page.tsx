'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

export default function EditRecordPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params?.submissionId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [conflictError, setConflictError] = useState<{
    currentVersion: number;
    expectedVersion: number;
    message: string;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form State for Allowlisted Editable Fields
  const [form, setForm] = useState({
    caregiverName: '',
    caregiverRelationship: '',
    caregiverPhone: '',
    monthlyHouseholdIncome: 0,
    primaryCaregiverOccupation: '',
    heightCm: 0,
    weightKg: 0,
    muacMm: 0,
    clinicalNotes: '',
    schoolEnrolled: true,
    schoolGrade: '',
    attendancePercentage: 0,
    accountNumber: '',
  });

  const loadRecord = async () => {
    setIsLoading(true);
    setConflictError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const rec = body.data;
      setRecord(rec);

      setForm({
        caregiverName: rec.caregiver_name || rec.demographics?.caregiverName || '',
        caregiverRelationship: rec.caregiver_relationship || rec.demographics?.caregiverRelationship || '',
        caregiverPhone: rec.caregiverPhone || rec.caregiver_phone || rec.demographics?.caregiverPhone || '',
        monthlyHouseholdIncome: rec.monthly_household_income || rec.household?.monthlyHouseholdIncome || 0,
        primaryCaregiverOccupation: rec.primary_caregiver_occupation || rec.household?.primaryCaregiverOccupation || '',
        heightCm: rec.height_cm || rec.nutrition?.heightCm || 0,
        weightKg: rec.weight_kg || rec.nutrition?.weightKg || 0,
        muacMm: rec.muac_mm || rec.nutrition?.muacMm || 0,
        clinicalNotes: rec.clinical_notes || rec.nutrition?.clinicalNotes || '',
        schoolEnrolled: rec.school_enrolled ?? true,
        schoolGrade: rec.school_grade || rec.education?.schoolGrade || '',
        attendancePercentage: rec.attendance_percentage || rec.education?.attendancePercentage || 0,
        accountNumber: rec.bank_account_number || rec.bankDetails?.accountNumber || '',
      });
    } catch (err) {
      console.error('Failed to load record for editing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecord();
  }, [submissionId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;

    setIsSaving(true);
    setConflictError(null);

    const expectedVersion = Number(record.version || 1);

    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': `"${expectedVersion}"`,
        },
        body: JSON.stringify({
          expectedVersion,
          caregiverName: form.caregiverName,
          caregiverRelationship: form.caregiverRelationship,
          caregiverPhone: form.caregiverPhone,
          monthlyHouseholdIncome: Number(form.monthlyHouseholdIncome),
          primaryCaregiverOccupation: form.primaryCaregiverOccupation,
          heightCm: Number(form.heightCm),
          weightKg: Number(form.weightKg),
          muacMm: Number(form.muacMm) || undefined,
          clinicalNotes: form.clinicalNotes,
          schoolEnrolled: Boolean(form.schoolEnrolled),
          schoolGrade: form.schoolGrade,
          attendancePercentage: Number(form.attendancePercentage),
          accountNumber: form.accountNumber,
        }),
      });

      if (res.status === 409) {
        const body = await res.json();
        setConflictError({
          currentVersion: body.currentVersion,
          expectedVersion: body.expectedVersion,
          message: body.message || 'The record has been updated by another caseworker.',
        });
        return;
      }

      if (!res.ok) {
        const body = await res.json();
        alert(`Save failed (${res.status}): ${body.message || 'Unknown error'}`);
        return;
      }

      setSaveSuccess(true);
      setTimeout(() => {
        router.push(`/assessment/record/${submissionId}`);
      }, 1000);
    } catch (netErr) {
      alert('Network transmission failed. Please verify connectivity.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-16 text-center text-xs text-slate-500">
          Loading record for editing...
        </div>
      </AppShell>
    );
  }

  if (!record) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-16 text-center">
          <p className="text-xs text-slate-500">Record not found.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <Link
              href={`/assessment/record/${submissionId}`}
              className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 mb-1"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              <span>Cancel & Return</span>
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Edit Approved Fields
            </h1>
            <p className="text-xs text-slate-500">
              Beneficiary: <strong className="text-slate-800">{record.child_name || record.demographics?.childName}</strong> | Base Version: <span className="font-mono font-bold text-teal-800">v{record.version || 1}</span>
            </p>
          </div>
        </div>

        {/* OCC 409 Conflict Alert Banner */}
        {conflictError && (
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-5 shadow-xs flex items-start space-x-3.5">
            <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-rose-950">Concurrency Conflict (HTTP 409)</h3>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                {conflictError.message}
                <br />
                Your base version was <strong>v{conflictError.expectedVersion}</strong>, but the server record is already at <strong>v{conflictError.currentVersion}</strong>.
              </p>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={loadRecord}
                  className="bg-white border-rose-300 text-rose-900 font-bold"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  <span>Refresh to Latest Version</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Success Banner */}
        {saveSuccess && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center space-x-2 text-emerald-900 text-xs font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Updates saved successfully! Version incremented. Redirecting...</span>
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section: Caregiver Contact */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Primary Caregiver Contact Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Caregiver Name"
                required
                value={form.caregiverName}
                onChange={(e) => setForm({ ...form, caregiverName: e.target.value })}
              />
              <Input
                label="Relationship"
                required
                value={form.caregiverRelationship}
                onChange={(e) => setForm({ ...form, caregiverRelationship: e.target.value })}
              />
              <Input
                label="Caregiver Phone"
                type="tel"
                required
                value={form.caregiverPhone}
                onChange={(e) => setForm({ ...form, caregiverPhone: e.target.value })}
              />
              <Input
                label="Caregiver Occupation"
                value={form.primaryCaregiverOccupation}
                onChange={(e) => setForm({ ...form, primaryCaregiverOccupation: e.target.value })}
              />
            </div>
          </section>

          {/* Section: Clinical Measurements */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Updated Anthropometric Measurements
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Height (cm)"
                type="number"
                step="0.1"
                required
                value={form.heightCm}
                onChange={(e) => setForm({ ...form, heightCm: Number(e.target.value) })}
                unit="cm"
              />
              <Input
                label="Weight (kg)"
                type="number"
                step="0.1"
                required
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })}
                unit="kg"
              />
              <Input
                label="MUAC (mm)"
                type="number"
                value={form.muacMm}
                onChange={(e) => setForm({ ...form, muacMm: Number(e.target.value) })}
                unit="mm"
              />
            </div>
            <Input
              label="Clinical Observation Notes"
              value={form.clinicalNotes}
              onChange={(e) => setForm({ ...form, clinicalNotes: e.target.value })}
              placeholder="e.g. Weight gain observed during nutrition support"
            />
          </section>

          {/* Section: Education & Bank */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Schooling & Account Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Current Grade"
                value={form.schoolGrade}
                onChange={(e) => setForm({ ...form, schoolGrade: e.target.value })}
              />
              <Input
                label="Attendance Percentage"
                type="number"
                value={form.attendancePercentage}
                onChange={(e) => setForm({ ...form, attendancePercentage: Number(e.target.value) })}
                unit="%"
              />
              <Input
                label="Caregiver Bank Account Number"
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              />
              <Input
                label="Monthly Household Income"
                type="number"
                value={form.monthlyHouseholdIncome}
                onChange={(e) => setForm({ ...form, monthlyHouseholdIncome: Number(e.target.value) })}
                unit="₹"
              />
            </div>
          </section>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <Link href={`/assessment/record/${submissionId}`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSaving}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-6 shadow-xs"
            >
              <Save className="h-4 w-4 mr-1.5" />
              <span>Save & Verify Version</span>
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
