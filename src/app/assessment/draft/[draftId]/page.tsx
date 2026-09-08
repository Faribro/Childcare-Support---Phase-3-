'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StepIndicator } from '@/components/wizard/StepIndicator';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { CaregiverSignaturePad } from '@/components/ui/CaregiverSignaturePad';
import { PhotoUpload } from '@/components/ui/PhotoUpload';
import { ExpensesAndApprovalGrid } from '@/components/education/ExpensesAndApprovalGrid';
import { getDraftByAnyId, saveDraft } from '@/lib/db/draftRepository';
import { enqueueSubmission } from '@/lib/db/syncQueueRepository';
import { getCaregiverSignatureBlob } from '@/lib/db/dexieDb';
import {
  calculateAge,
  calculateBMI,
  classifyNutritionStatus,
} from '@/lib/clinical/nutritionCalculations';
import {
  INDIAN_STATES_AND_UTS,
  type AssessmentRecord,
  type Gender,
  type OrphanStatus,
  type CaregiverRelationship,
  type MainSourceOfIncome,
  type AppetiteLevel,
  type EducationStatus,
  type SchoolType,
  type AttendanceType,
} from '@/types/domain';
import {
  User,
  ShieldCheck,
  HeartPulse,
  Utensils,
  GraduationCap,
  FileCheck,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

const WIZARD_STEPS = [
  { number: 1, title: 'Child & Caregiver', description: 'Identification & registry' },
  { number: 2, title: 'Consent & Signature', description: 'Caregiver authorisation' },
  { number: 3, title: 'Health Assessment', description: 'Anthropometry & household' },
  { number: 4, title: 'Nutrition Habits', description: 'Appetite & dietary intake' },
  { number: 5, title: 'Education Support', description: 'Schooling & financial need' },
  { number: 6, title: 'Review & Submit', description: 'Verification & sign-off' },
];

export default function ResumeDraftPage() {
  const router = useRouter();
  const params = useParams();
  const draftId = params?.draftId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved'>('saved');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [record, setRecord] = useState<AssessmentRecord | null>(null);

  // Load draft from Dexie
  useEffect(() => {
    async function load() {
      if (!draftId) return;
      try {
        const found = await getDraftByAnyId(draftId);
        if (found) {
          // Data migration: ensure artCenter is not retained in local state
          const sanitizedDemographics = { ...found.demographics };
          delete (sanitizedDemographics as any).artCenter;

          setRecord({
            ...found,
            demographics: sanitizedDemographics,
            consent: found.consent || { agreeToParticipate: true },
            householdFinancial: found.householdFinancial || {
              totalFamilyMembers: 4,
              numberOfChildrenUnder18: 2,
              monthlyIncomeRs: 5000,
              mainSourceOfIncome: 'Daily wage labour',
            },
            health: found.health || {
              weightKg: 14.5,
              heightCm: 100,
              bmi: 14.5,
              otherHealthConditions: [],
            },
            nutrition: found.nutrition || {
              appetite: 'Good',
              mealsPerDay: 3,
            },
            educationStatus: found.educationStatus || {
              educationStatus: 'Currently going to school',
              schoolType: 'Government school',
              currentClass: 'Class 2',
              attendance: 'Regular',
            },
            educationExpenses: found.educationExpenses || {
              schoolFees: 0,
              tuitionFees: 0,
              books: 0,
              stationery: 0,
              uniform: 0,
              transport: 0,
              otherExpenses: 0,
              totalAnnualCost: 0,
            },
            educationSupportRequired: found.educationSupportRequired || {
              requiredSchoolFees: 0,
              requiredBooks: 0,
              requiredStationery: 0,
              requiredUniform: 0,
              requiredTransport: 0,
              requiredOtherSupport: 0,
              totalRequiredSupport: 0,
            },
            finalReview: found.finalReview || {
              allInfoCorrect: true,
              organizationName: 'India HIV/AIDS Alliance',
              formSubmittedBy: found.interviewerName || 'Caseworker',
            },
          });
          setCurrentStep(found.stepIndex || 1);

          // Check signature status
          const sig = await getCaregiverSignatureBlob(found.uuid || found.clientSubmissionId);
          setHasSavedSignature(!!sig);
        }
      } catch (err) {
        console.error('Failed to load draft:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [draftId]);

  // Derived Calculations
  const ageResult = useMemo(() => {
    if (!record?.demographics?.dob) return { years: 0, months: 0, totalMonths: 0 };
    try {
      return calculateAge(record.demographics.dob);
    } catch {
      return { years: 0, months: 0, totalMonths: 0 };
    }
  }, [record?.demographics?.dob]);

  const bmiValue = useMemo(() => {
    return calculateBMI(
      Number(record?.health?.weightKg) || 0,
      Number(record?.health?.heightCm) || 0
    );
  }, [record?.health?.weightKg, record?.health?.heightCm]);

  const nutritionResult = useMemo(() => {
    return classifyNutritionStatus({
      ageYears: ageResult.years || 5,
      heightCm: Number(record?.health?.heightCm) || 100,
      weightKg: Number(record?.health?.weightKg) || 15,
    });
  }, [ageResult.years, record?.health?.heightCm, record?.health?.weightKg]);

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

  // Autosave when record changes
  useEffect(() => {
    if (!record) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await saveDraft({
          ...record,
          stepIndex: currentStep,
          updatedAt: new Date().toISOString(),
        });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Autosave draft error:', err);
        setSaveStatus('saved');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [record, currentStep]);

  // Step Gating Validation
  const canProceed = useMemo(() => {
    if (!record) return false;
    if (currentStep === 1) {
      return (
        (record.demographics?.childName || '').trim().length >= 2 &&
        !!record.demographics?.dob &&
        (record.demographics?.caregiverName || '').trim().length >= 2
      );
    }
    if (currentStep === 2) {
      // Locked Caretaker Signature Policy Gate
      return record.consent?.agreeToParticipate && hasSavedSignature;
    }
    if (currentStep === 3) {
      return Number(record.health?.weightKg) > 2 && Number(record.health?.heightCm) > 40;
    }
    if (currentStep === 4) {
      return Number(record.nutrition?.mealsPerDay) >= 1;
    }
    if (currentStep === 5) {
      return true;
    }
    if (currentStep === 6) {
      return record.finalReview?.allInfoCorrect && (record.finalReview?.formSubmittedBy || '').trim().length >= 2;
    }
    return true;
  }, [currentStep, record, hasSavedSignature]);

  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleFinalSubmission();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFinalSubmission = async () => {
    if (!record) return;
    setIsSubmitting(true);
    try {
      const finalPayload: AssessmentRecord = {
        ...record,
        stepIndex: 6,
        syncStatus: 'queued',
        updatedAt: new Date().toISOString(),
      };
      await enqueueSubmission(finalPayload, { operationType: 'CREATE' });
      router.push(`/assessment/sync?submitted=true&ref=${encodeURIComponent(finalPayload.demographics.artNumber)}`);
    } catch (err) {
      console.error('Submission queue error:', err);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-16 text-center text-xs text-slate-500">
          Loading saved draft...
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
              This draft may have already been queued for synchronization or deleted from this device.
            </p>
            <div className="mt-6 flex justify-center space-x-3">
              <Link href="/assessment/sync?tab=drafts">
                <Button variant="secondary" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  <span>View All Drafts</span>
                </Button>
              </Link>
              <Link href="/assessment/new">
                <Button variant="primary" size="sm">
                  Start New Intake
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeChild={{
        artNumber: record.demographics?.artNumber,
        childName: record.demographics?.childName,
        saveStatus: saveStatus,
      }}
    >
      <StepIndicator
        currentStep={currentStep}
        totalSteps={6}
        steps={WIZARD_STEPS}
        onStepClick={(step) => {
          if (step <= currentStep) setCurrentStep(step);
        }}
      />

      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <div className="space-y-6">
          {/* STEP 1: Child & Caregiver Details */}
          {currentStep === 1 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs space-y-5">
              <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-100">
                <div className="bg-teal-50 text-teal-700 p-2 rounded-xl border border-teal-200">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Section 1 — Child & Caregiver Details
                  </h2>
                  <p className="text-xs text-slate-500">
                    ENTER THE CHILD&apos;S PERSONAL DETAILS AND CAREGIVER INFORMATION CAREFULLY.
                  </p>
                </div>
              </div>

              {/* Assessment Reference ID */}
              <div className="p-3 bg-teal-50/50 border border-teal-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-teal-800">
                    Assessment Reference ID
                  </span>
                  <div className="font-mono font-bold text-base text-teal-900">
                    {record.demographics?.artNumber}
                  </div>
                </div>
                <span className="text-[11px] text-teal-700 font-medium">Non-stigmatising ID</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="DATE OF FILLING THIS FORM *"
                  type="date"
                  required
                  value={record.demographics?.dateOfFilling || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      demographics: { ...record.demographics, dateOfFilling: e.target.value },
                    })
                  }
                  helperText="Today's date (DD/MM/YY)"
                />

                <Input
                  label="CHILD'S FULL NAME *"
                  required
                  value={record.demographics?.childName || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      demographics: { ...record.demographics, childName: e.target.value },
                    })
                  }
                  helperText="As per official records."
                />

                <Input
                  label="DATE OF BIRTH *"
                  type="date"
                  required
                  value={record.demographics?.dob || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      demographics: { ...record.demographics, dob: e.target.value },
                    })
                  }
                  helperText="Enter date as DD/MM/YY. Age is calculated automatically."
                />

                <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    AGE: COMPLETED YEARS
                  </span>
                  <div className="text-base font-bold text-slate-900">
                    {ageResult.years} years {ageResult.months > 0 ? `(${ageResult.months} mos)` : ''}
                  </div>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">GENDER *</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['Male', 'Female', 'Other'] as Gender[]).map((g) => (
                      <label
                        key={g}
                        className={`flex items-center space-x-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                          record.demographics?.gender === g
                            ? 'bg-teal-50/70 border-teal-500 text-teal-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="gender"
                          value={g}
                          checked={record.demographics?.gender === g}
                          onChange={() =>
                            setRecord({
                              ...record,
                              demographics: { ...record.demographics, gender: g },
                            })
                          }
                          className="text-teal-600"
                        />
                        <span className="text-xs">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">ORPHAN STATUS *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      'Both parents alive',
                      'Single orphan (one parent deceased)',
                      'Double orphan (both parents deceased)',
                    ].map((status) => (
                      <label
                        key={status}
                        className={`flex items-center space-x-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                          record.demographics?.orphanStatus === status
                            ? 'bg-teal-50/70 border-teal-500 text-teal-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="orphanStatus"
                          value={status}
                          checked={record.demographics?.orphanStatus === status}
                          onChange={() =>
                            setRecord({
                              ...record,
                              demographics: {
                                ...record.demographics,
                                orphanStatus: status as OrphanStatus,
                              },
                            })
                          }
                          className="text-teal-600 shrink-0"
                        />
                        <span className="text-xs">{status}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Input
                  label="CAREGIVER'S FULL NAME *"
                  required
                  value={record.demographics?.caregiverName || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      demographics: { ...record.demographics, caregiverName: e.target.value },
                    })
                  }
                  helperText="Name of the person caring for the child."
                />

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">
                    CAREGIVER&apos;S RELATIONSHIP TO CHILD *
                  </label>
                  <select
                    className="w-full min-h-[48px] px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl"
                    value={record.demographics?.caregiverRelationship || 'Mother'}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        demographics: {
                          ...record.demographics,
                          caregiverRelationship: e.target.value as CaregiverRelationship,
                        },
                      })
                    }
                  >
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Grandparent">Grandparent</option>
                    <option value="Legal Guardian">Legal Guardian</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <Input
                  label="CONTACT NUMBER *"
                  type="tel"
                  required
                  value={record.demographics?.contactNumber || record.demographics?.caregiverPhone || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      demographics: {
                        ...record.demographics,
                        contactNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                      },
                    })
                  }
                  helperText="10-digit mobile number."
                />

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">STATE / UNION TERRITORY *</label>
                  <select
                    className="w-full min-h-[48px] px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl"
                    value={record.demographics?.state || 'Maharashtra'}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        demographics: { ...record.demographics, state: e.target.value },
                      })
                    }
                  >
                    {INDIAN_STATES_AND_UTS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">DISTRICT *</label>
                  <select
                    className="w-full min-h-[48px] px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl"
                    value={record.demographics?.district || 'Pune'}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        demographics: { ...record.demographics, district: e.target.value },
                      })
                    }
                  >
                    <option value="Pune">Pune District</option>
                    <option value="Mumbai Suburban">Mumbai Suburban</option>
                    <option value="Thane">Thane District</option>
                    <option value="Solapur">Solapur District</option>
                    <option value="Nashik">Nashik District</option>
                    <option value="Nagpur">Nagpur District</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <Input
                    label="FULL ADDRESS *"
                    required
                    value={record.demographics?.fullAddress || ''}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        demographics: { ...record.demographics, fullAddress: e.target.value },
                      })
                    }
                    helperText="House no., street, village/ward."
                  />
                </div>
              </div>
            </section>
          )}

          {/* STEP 2: Consent & Caregiver Signature */}
          {currentStep === 2 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs space-y-6">
              <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-100">
                <div className="bg-teal-50 text-teal-700 p-2 rounded-xl border border-teal-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">Consent</h2>
                  <p className="text-xs text-slate-500">
                    Informed caregiver consent and biometric signature authorization.
                  </p>
                </div>
              </div>

              {/* Consent Statement Card */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs leading-relaxed text-slate-700 space-y-2">
                <p className="font-bold text-slate-900">Consent Statement (Version v1.0-2026):</p>
                <p>
                  I voluntarily confirm that I am the designated caregiver for{' '}
                  <strong>{record.demographics?.childName || 'the child'}</strong> and consent to participation in the India
                  HIV/AIDS Alliance Paediatric Care and Nutritional Support Programme.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 block">
                  DO YOU AGREE TO PARTICIPATE? *
                </label>
                <p className="text-[11px] text-slate-500">You must say Yes to continue.</p>

                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <label
                    className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      record.consent?.agreeToParticipate
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="agreeToParticipate"
                      checked={record.consent?.agreeToParticipate === true}
                      onChange={() =>
                        setRecord({
                          ...record,
                          consent: { ...record.consent, agreeToParticipate: true },
                        })
                      }
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs">Yes</span>
                  </label>

                  <label
                    className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      record.consent?.agreeToParticipate === false
                        ? 'bg-rose-50 border-rose-400 text-rose-900 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="agreeToParticipate"
                      checked={record.consent?.agreeToParticipate === false}
                      onChange={() =>
                        setRecord({
                          ...record,
                          consent: { ...record.consent, agreeToParticipate: false },
                        })
                      }
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-xs">No</span>
                  </label>
                </div>
              </div>

              {!record.consent?.agreeToParticipate && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start space-x-3 text-xs">
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold">⚠ CONSENT NOT GIVEN — THIS FORM CANNOT BE SUBMITTED.</h4>
                    <p className="mt-0.5 text-rose-700">
                      Caregiver authorization is mandatory under programme safeguarding guidelines.
                    </p>
                  </div>
                </div>
              )}

              {record.consent?.agreeToParticipate && (
                <div className="pt-2">
                  <CaregiverSignaturePad
                    submissionUuid={record.uuid || record.clientSubmissionId}
                    caregiverName={record.demographics?.caregiverName || 'Caregiver'}
                    caregiverRelationship={record.demographics?.caregiverRelationship || 'Caregiver'}
                    onSignatureSaved={() => setHasSavedSignature(true)}
                    onSignatureCleared={() => setHasSavedSignature(false)}
                    isSaved={hasSavedSignature}
                  />
                </div>
              )}
            </section>
          )}

          {/* STEP 3: Health & Household */}
          {currentStep === 3 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs space-y-6">
              <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-100">
                <div className="bg-teal-50 text-teal-700 p-2 rounded-xl border border-teal-200">
                  <HeartPulse className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Section 3 — Health Information
                  </h2>
                  <p className="text-xs text-slate-500">
                    RECORD THE CHILD&apos;S CURRENT HEALTH AND CLINICAL DETAILS.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="CURRENT WEIGHT (KG) *"
                  type="number"
                  step="0.1"
                  required
                  value={record.health?.weightKg || 0}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      health: { ...record.health, weightKg: Number(e.target.value) } as any,
                    })
                  }
                  unit="kg"
                />

                <Input
                  label="CURRENT HEIGHT (CM) *"
                  type="number"
                  step="0.1"
                  required
                  value={record.health?.heightCm || 0}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      health: { ...record.health, heightCm: Number(e.target.value) } as any,
                    })
                  }
                  unit="cm"
                />

                <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">BMI: KG/M²</span>
                  <div className="text-base font-bold text-teal-900">{bmiValue} kg/m²</div>
                </div>

                <div className="sm:col-span-2">
                  <Input
                    label="HAEMOGLOBIN (G/DL)"
                    type="number"
                    step="0.1"
                    value={record.health?.haemoglobinGdl || ''}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        health: { ...record.health, haemoglobinGdl: Number(e.target.value) } as any,
                      })
                    }
                    helperText="Latest result. Normal: 11–16 g/dL."
                    unit="g/dL"
                  />
                </div>
              </div>

              {/* Household details */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Section 2 — Household & Financial Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="TOTAL FAMILY MEMBERS *"
                    type="number"
                    required
                    value={record.householdFinancial?.totalFamilyMembers || 4}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        householdFinancial: {
                          ...record.householdFinancial,
                          totalFamilyMembers: Number(e.target.value),
                        } as any,
                      })
                    }
                  />

                  <Input
                    label="NUMBER OF CHILDREN (≤18 YRS) *"
                    type="number"
                    required
                    value={record.householdFinancial?.numberOfChildrenUnder18 || 2}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        householdFinancial: {
                          ...record.householdFinancial,
                          numberOfChildrenUnder18: Number(e.target.value),
                        } as any,
                      })
                    }
                  />

                  <Input
                    label="MONTHLY INCOME (RS.) *"
                    type="number"
                    required
                    value={record.householdFinancial?.monthlyIncomeRs || 0}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        householdFinancial: {
                          ...record.householdFinancial,
                          monthlyIncomeRs: Number(e.target.value),
                        } as any,
                      })
                    }
                    unit="₹"
                  />

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 block">
                      MAIN SOURCE OF INCOME *
                    </label>
                    <select
                      className="w-full min-h-[48px] px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl"
                      value={record.householdFinancial?.mainSourceOfIncome || 'Daily wage labour'}
                      onChange={(e) =>
                        setRecord({
                          ...record,
                          householdFinancial: {
                            ...record.householdFinancial,
                            mainSourceOfIncome: e.target.value as MainSourceOfIncome,
                          } as any,
                        })
                      }
                    >
                      <option value="Daily wage labour">Daily wage labour</option>
                      <option value="Salaried employment">Salaried employment</option>
                      <option value="Self-employed">Self-employed</option>
                      <option value="Pension / Government support">Pension / Government support</option>
                      <option value="No regular income">No regular income</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* STEP 4: Nutrition Habits */}
          {currentStep === 4 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs space-y-6">
              <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-100">
                <div className="bg-teal-50 text-teal-700 p-2 rounded-xl border border-teal-200">
                  <Utensils className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Section 4 — Nutrition
                  </h2>
                  <p className="text-xs text-slate-500">RECORD THE CHILD&apos;S DAILY EATING HABITS.</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 block">CHILD&apos;S APPETITE *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['Good', 'Reduced', 'Poor / Very low'] as AppetiteLevel[]).map((app) => (
                    <label
                      key={app}
                      className={`flex items-center space-x-3 p-3.5 rounded-xl border cursor-pointer ${
                        record.nutrition?.appetite === app
                          ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="appetite"
                        value={app}
                        checked={record.nutrition?.appetite === app}
                        onChange={() =>
                          setRecord({
                            ...record,
                            nutrition: { ...record.nutrition, appetite: app } as any,
                          })
                        }
                        className="text-teal-600"
                      />
                      <span className="text-xs">{app}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="max-w-xs">
                <Input
                  label="MEALS PER DAY *"
                  type="number"
                  required
                  value={record.nutrition?.mealsPerDay || 3}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      nutrition: { ...record.nutrition, mealsPerDay: Number(e.target.value) } as any,
                    })
                  }
                  helperText="Full meals eaten daily."
                />
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  nutritionResult.nutritionStatus.includes('SAM')
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : nutritionResult.nutritionStatus.includes('MAM')
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-teal-50 border-teal-300 text-teal-900'
                }`}
              >
                <div className="text-xs font-bold uppercase tracking-wider">WHO Anthropometric Triage</div>
                <div className="text-base font-bold mt-0.5">{nutritionResult.nutritionStatus}</div>
              </div>
            </section>
          )}

          {/* STEP 5: Education Profile & Support */}
          {currentStep === 5 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs space-y-6">
              <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-100">
                <div className="bg-teal-50 text-teal-700 p-2 rounded-xl border border-teal-200">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Section 5 — Education
                  </h2>
                  <p className="text-xs text-slate-500">
                    RECORD THE CHILD&apos;S CURRENT EDUCATION STATUS.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 block">EDUCATION STATUS *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    'Currently going to school',
                    'Dropped out of school',
                    'Never enrolled in school',
                    'Completed schooling',
                    'Other',
                  ].map((st) => (
                    <label
                      key={st}
                      className={`flex items-center space-x-2.5 p-3 rounded-xl border cursor-pointer ${
                        record.educationStatus?.educationStatus === st
                          ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="educationStatus"
                        value={st}
                        checked={record.educationStatus?.educationStatus === st}
                        onChange={() =>
                          setRecord({
                            ...record,
                            educationStatus: {
                              ...record.educationStatus,
                              educationStatus: st as EducationStatus,
                            } as any,
                          })
                        }
                        className="text-teal-600 shrink-0"
                      />
                      <span className="text-xs">{st}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Education Expenses & Programme Approval Grid */}
              <div className="pt-4 border-t border-slate-100">
                <ExpensesAndApprovalGrid
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
                  onCurrentExpenseChange={(field, val) =>
                    setRecord({
                      ...record,
                      educationExpenses: {
                        ...record.educationExpenses,
                        [field]: val,
                      } as any,
                    })
                  }
                  onRequiredSupportChange={(field, val) =>
                    setRecord({
                      ...record,
                      educationSupportRequired: {
                        ...record.educationSupportRequired,
                        [field]: val,
                      } as any,
                    })
                  }
                  onReceiptPhotoChange={(url) =>
                    setRecord({
                      ...record,
                      educationExpenses: {
                        ...record.educationExpenses,
                        feeReceiptPhotoUrl: url,
                      } as any,
                    })
                  }
                  onMarksheetPhotoChange={(url) =>
                    setRecord({
                      ...record,
                      educationExpenses: {
                        ...record.educationExpenses,
                        marksheetPhotoUrl: url,
                      } as any,
                    })
                  }
                  onRemarksChange={(rem) =>
                    setRecord({
                      ...record,
                      educationExpenses: {
                        ...record.educationExpenses,
                        remarks: rem,
                      } as any,
                    })
                  }
                />
              </div>
            </section>
          )}

          {/* STEP 6: Review & Submit */}
          {currentStep === 6 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs space-y-6">
              <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-100">
                <div className="bg-teal-50 text-teal-700 p-2 rounded-xl border border-teal-200">
                  <FileCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Section 7 — Final Review
                  </h2>
                  <p className="text-xs text-slate-500">
                    REVIEW ALL INFORMATION CAREFULLY BEFORE SUBMITTING.
                  </p>
                </div>
              </div>

              {/* Field Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">CHILD</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {record.demographics?.childName}
                    </span>
                    <span className="font-mono text-teal-900 text-xs block">
                      Ref: {record.demographics?.artNumber}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      AGE / DOB
                    </span>
                    <span className="font-semibold text-slate-800">
                      {ageResult.years} YEARS | DOB: {record.demographics?.dob}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      CAREGIVER
                    </span>
                    <span className="font-semibold text-slate-800">
                      {record.demographics?.caregiverName} ({record.demographics?.caregiverRelationship})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      DISTRICT / STATE
                    </span>
                    <span className="font-semibold text-slate-800">
                      {record.demographics?.district} / {record.demographics?.state}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      TOTAL REQUIRED SUPPORT
                    </span>
                    <span className="text-base font-bold text-teal-900">₹{totalRequiredSupport}</span>
                  </div>
                  <div className="flex items-center text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-semibold">
                    <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" />
                    <span>Caregiver signature captured</span>
                  </div>
                </div>
              </div>

              {/* Submitter Metadata */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Final Review Sign-off</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="FORM SUBMITTED BY *"
                    required
                    value={record.finalReview?.formSubmittedBy || record.interviewerName || ''}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        finalReview: { ...record.finalReview, formSubmittedBy: e.target.value } as any,
                      })
                    }
                    helperText="Enter your name"
                  />
                  <Input
                    label="ORGANIZATION NAME"
                    value={record.finalReview?.organizationName || 'India HIV/AIDS Alliance'}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        finalReview: { ...record.finalReview, organizationName: e.target.value } as any,
                      })
                    }
                  />
                </div>
              </div>
            </section>
          )}

          <BottomActionBar
            onNext={handleNext}
            onPrev={currentStep > 1 ? handlePrev : undefined}
            nextLabel={currentStep === 6 ? 'Queue for Sync' : 'Continue'}
            isFinalStep={currentStep === 6}
            isSubmitting={isSubmitting}
            disableNext={!canProceed}
          />
        </div>
      </div>
    </AppShell>
  );
}
