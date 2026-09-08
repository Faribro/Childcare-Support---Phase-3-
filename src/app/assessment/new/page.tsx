'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StepIndicator } from '@/components/wizard/StepIndicator';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { CaregiverSignaturePad } from '@/components/ui/CaregiverSignaturePad';
import { PhotoUpload } from '@/components/ui/PhotoUpload';
import { ExpensesAndApprovalGrid } from '@/components/education/ExpensesAndApprovalGrid';
import { saveDraft } from '@/lib/db/draftRepository';
import { enqueueSubmission } from '@/lib/db/syncQueueRepository';
import { getCaregiverSignatureBlob } from '@/lib/db/dexieDb';
import { generateAssessmentId } from '@/lib/utils/idGenerator';
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
  RotateCcw,
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

export default function NewAssessmentPage() {
  const router = useRouter();

  const [clientUuid, setClientUuid] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(1);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved'>('saved');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);

  // Form State matching CHILD_HIV_SUPPORT_FORM
  const [formData, setFormData] = useState({
    // Step 1: Identification
    artNumber: '',
    dateOfFilling: new Date().toISOString().split('T')[0],
    childName: '',
    dob: '',
    gender: 'Male' as Gender,
    orphanStatus: 'Both parents alive' as OrphanStatus,
    caregiverName: '',
    caregiverRelationship: 'Mother' as CaregiverRelationship,
    contactNumber: '',
    fullAddress: '',
    state: 'Maharashtra',
    district: 'Pune',

    // Step 2: Consent
    agreeToParticipate: true,

    // Step 3: Health & Household
    weightKg: 14.5,
    heightCm: 100,
    haemoglobinGdl: '',
    otherHealthConditions: [] as string[],
    otherHealthConditionSpecify: '',
    totalFamilyMembers: 4,
    numberOfChildrenUnder18: 2,
    monthlyIncomeRs: 5000,
    mainSourceOfIncome: 'Daily wage labour' as MainSourceOfIncome,

    // Step 4: Nutrition Habits
    appetite: 'Good' as AppetiteLevel,
    mealsPerDay: 3,

    // Step 5: Education Profile & Support
    educationStatus: 'Currently going to school' as EducationStatus,
    educationStatusSpecify: '',
    schoolName: '',
    schoolSessionStartDate: '',
    schoolType: 'Government school' as SchoolType,
    currentClass: 'Class 2',
    attendance: 'Regular' as AttendanceType,

    // Current Expenses
    schoolFees: 0,
    tuitionFees: 0,
    books: 0,
    stationery: 0,
    uniform: 0,
    transport: 0,
    otherExpenses: 0,
    feeReceiptPhotoUrl: '',
    marksheetPhotoUrl: '',
    remarks: '',

    // Support Required
    requiredSchoolFees: 0,
    requiredBooks: 0,
    requiredStationery: 0,
    requiredUniform: 0,
    requiredTransport: 0,
    requiredOtherSupport: 0,

    // Step 6: Review
    allInfoCorrect: true,
    organizationName: 'India HIV/AIDS Alliance',
    formSubmittedBy: 'Sunita Sharma',
    organizationEmail: 'fieldworker@allianceindia.org',
  });

  // Generate UUID & Auto-Reference ID on client mount
  useEffect(() => {
    const uuid = crypto.randomUUID();
    setClientUuid(uuid);
    const refId = generateAssessmentId('MH', formData.district);
    setFormData((prev) => ({ ...prev, artNumber: refId }));
  }, []);

  // Check if signature is saved in IndexedDB
  useEffect(() => {
    if (!clientUuid) return;
    getCaregiverSignatureBlob(clientUuid).then((sig) => {
      setHasSavedSignature(!!sig);
    });
  }, [clientUuid, currentStep]);

  // Calculations
  const ageResult = useMemo(() => {
    if (!formData.dob) return { years: 0, months: 0, totalMonths: 0 };
    try {
      return calculateAge(formData.dob);
    } catch {
      return { years: 0, months: 0, totalMonths: 0 };
    }
  }, [formData.dob]);

  const bmiValue = useMemo(() => {
    return calculateBMI(Number(formData.weightKg) || 0, Number(formData.heightCm) || 0);
  }, [formData.weightKg, formData.heightCm]);

  const nutritionResult = useMemo(() => {
    return classifyNutritionStatus({
      ageYears: ageResult.years || 5,
      heightCm: Number(formData.heightCm) || 100,
      weightKg: Number(formData.weightKg) || 15,
    });
  }, [ageResult.years, formData.heightCm, formData.weightKg]);

  const totalAnnualEducationCost = useMemo(() => {
    return (
      Number(formData.schoolFees || 0) +
      Number(formData.tuitionFees || 0) +
      Number(formData.books || 0) +
      Number(formData.stationery || 0) +
      Number(formData.uniform || 0) +
      Number(formData.transport || 0) +
      Number(formData.otherExpenses || 0)
    );
  }, [
    formData.schoolFees,
    formData.tuitionFees,
    formData.books,
    formData.stationery,
    formData.uniform,
    formData.transport,
    formData.otherExpenses,
  ]);

  const totalRequiredSupport = useMemo(() => {
    return (
      Number(formData.requiredSchoolFees || 0) +
      Number(formData.requiredBooks || 0) +
      Number(formData.requiredStationery || 0) +
      Number(formData.requiredUniform || 0) +
      Number(formData.requiredTransport || 0) +
      Number(formData.requiredOtherSupport || 0)
    );
  }, [
    formData.requiredSchoolFees,
    formData.requiredBooks,
    formData.requiredStationery,
    formData.requiredUniform,
    formData.requiredTransport,
    formData.requiredOtherSupport,
  ]);

  // Autosave to Dexie drafts table
  useEffect(() => {
    if (!clientUuid) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const record = {
          uuid: clientUuid,
          clientSubmissionId: clientUuid,
          interviewerName: formData.formSubmittedBy || 'Caseworker',
          stepIndex: currentStep,
          demographics: {
            artNumber: formData.artNumber,
            dateOfFilling: formData.dateOfFilling,
            childName: formData.childName,
            dob: formData.dob,
            calculatedAgeYears: ageResult.years,
            calculatedAgeMonths: ageResult.months,
            gender: formData.gender,
            orphanStatus: formData.orphanStatus,
            caregiverName: formData.caregiverName,
            caregiverRelationship: formData.caregiverRelationship,
            contactNumber: formData.contactNumber,
            caregiverPhone: formData.contactNumber,
            fullAddress: formData.fullAddress,
            state: formData.state,
            district: formData.district,
          },
          consent: {
            agreeToParticipate: formData.agreeToParticipate,
            signatureTimestamp: new Date().toISOString(),
          },
          caregiverConsent: {
            consentProvided: formData.agreeToParticipate,
            consentVersion: 'v1.0-2026',
            caregiverName: formData.caregiverName || 'Caregiver',
            caregiverRelationship: formData.caregiverRelationship || 'Mother',
            consentCapturedAt: new Date().toISOString(),
            signatureRequired: true,
            signatureStatus: hasSavedSignature ? 'CAPTURED_LOCAL' : 'PENDING',
          },
          householdFinancial: {
            totalFamilyMembers: Number(formData.totalFamilyMembers) || 1,
            numberOfChildrenUnder18: Number(formData.numberOfChildrenUnder18) || 0,
            monthlyIncomeRs: Number(formData.monthlyIncomeRs) || 0,
            mainSourceOfIncome: formData.mainSourceOfIncome,
          },
          health: {
            weightKg: Number(formData.weightKg) || 0,
            heightCm: Number(formData.heightCm) || 0,
            bmi: bmiValue,
            haemoglobinGdl: formData.haemoglobinGdl ? Number(formData.haemoglobinGdl) : undefined,
            otherHealthConditions: formData.otherHealthConditions,
            otherHealthConditionSpecify: formData.otherHealthConditionSpecify,
            nutritionStatus: nutritionResult.nutritionStatus,
          },
          nutrition: {
            appetite: formData.appetite,
            mealsPerDay: Number(formData.mealsPerDay) || 3,
          },
          educationStatus: {
            educationStatus: formData.educationStatus,
            educationStatusSpecify: formData.educationStatusSpecify,
            schoolName: formData.schoolName,
            schoolSessionStartDate: formData.schoolSessionStartDate,
            schoolType: formData.schoolType,
            currentClass: formData.currentClass,
            attendance: formData.attendance,
          },
          educationExpenses: {
            schoolFees: Number(formData.schoolFees) || 0,
            tuitionFees: Number(formData.tuitionFees) || 0,
            books: Number(formData.books) || 0,
            stationery: Number(formData.stationery) || 0,
            uniform: Number(formData.uniform) || 0,
            transport: Number(formData.transport) || 0,
            otherExpenses: Number(formData.otherExpenses) || 0,
            totalAnnualCost: totalAnnualEducationCost,
            feeReceiptPhotoUrl: formData.feeReceiptPhotoUrl,
            marksheetPhotoUrl: formData.marksheetPhotoUrl,
            remarks: formData.remarks,
          },
          educationSupportRequired: {
            requiredSchoolFees: Number(formData.requiredSchoolFees) || 0,
            requiredBooks: Number(formData.requiredBooks) || 0,
            requiredStationery: Number(formData.requiredStationery) || 0,
            requiredUniform: Number(formData.requiredUniform) || 0,
            requiredTransport: Number(formData.requiredTransport) || 0,
            requiredOtherSupport: Number(formData.requiredOtherSupport) || 0,
            totalRequiredSupport: totalRequiredSupport,
          },
          finalReview: {
            allInfoCorrect: formData.allInfoCorrect,
            organizationName: formData.organizationName,
            formSubmittedBy: formData.formSubmittedBy,
            organizationEmail: formData.organizationEmail,
          },
          syncStatus: 'draft',
          updatedAt: new Date().toISOString(),
        };

        await saveDraft(record as any);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Autosave error:', err);
        setSaveStatus('saved');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    formData,
    clientUuid,
    currentStep,
    ageResult,
    bmiValue,
    nutritionResult,
    totalAnnualEducationCost,
    totalRequiredSupport,
    hasSavedSignature,
  ]);

  // Step Gating Validation
  const canProceed = useMemo(() => {
    if (currentStep === 1) {
      return (
        formData.childName.trim().length >= 2 &&
        formData.dob.length > 0 &&
        formData.caregiverName.trim().length >= 2 &&
        formData.contactNumber.trim().length === 10
      );
    }
    if (currentStep === 2) {
      // Locked Caretaker Signature Policy Gate:
      // If consent = No -> blocked.
      // If consent = Yes -> caregiver signature must be saved locally in IndexedDB.
      return formData.agreeToParticipate && hasSavedSignature;
    }
    if (currentStep === 3) {
      return (
        Number(formData.weightKg) > 2 &&
        Number(formData.heightCm) > 40 &&
        Number(formData.totalFamilyMembers) >= 1
      );
    }
    if (currentStep === 4) {
      return Number(formData.mealsPerDay) >= 1;
    }
    if (currentStep === 5) {
      return true;
    }
    if (currentStep === 6) {
      return formData.allInfoCorrect && formData.formSubmittedBy.trim().length >= 2;
    }
    return true;
  }, [currentStep, formData, hasSavedSignature]);

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

  const handleRegenerateId = () => {
    const newId = generateAssessmentId('MH', formData.district, Math.floor(Math.random() * 90) + 10);
    setFormData((prev) => ({ ...prev, artNumber: newId }));
  };

  const handleFinalSubmission = async () => {
    setIsSubmitting(true);
    try {
      const fullRecord: AssessmentRecord = {
        uuid: clientUuid,
        clientSubmissionId: clientUuid,
        version: 1,
        interviewerName: formData.formSubmittedBy,
        stepIndex: 6,
        demographics: {
          artNumber: formData.artNumber,
          dateOfFilling: formData.dateOfFilling,
          childName: formData.childName,
          dob: formData.dob,
          calculatedAgeYears: ageResult.years,
          calculatedAgeMonths: ageResult.months,
          gender: formData.gender,
          orphanStatus: formData.orphanStatus,
          caregiverName: formData.caregiverName,
          caregiverRelationship: formData.caregiverRelationship,
          contactNumber: formData.contactNumber,
          caregiverPhone: formData.contactNumber,
          fullAddress: formData.fullAddress,
          state: formData.state,
          district: formData.district,
        },
        consent: {
          agreeToParticipate: formData.agreeToParticipate,
          signatureTimestamp: new Date().toISOString(),
        },
        caregiverConsent: {
          consentProvided: formData.agreeToParticipate,
          consentVersion: 'v1.0-2026',
          caregiverName: formData.caregiverName,
          caregiverRelationship: formData.caregiverRelationship,
          consentCapturedAt: new Date().toISOString(),
          signatureRequired: true,
          signatureStatus: 'CAPTURED_LOCAL',
        },
        householdFinancial: {
          totalFamilyMembers: Number(formData.totalFamilyMembers) || 1,
          numberOfChildrenUnder18: Number(formData.numberOfChildrenUnder18) || 0,
          monthlyIncomeRs: Number(formData.monthlyIncomeRs) || 0,
          mainSourceOfIncome: formData.mainSourceOfIncome,
        },
        health: {
          weightKg: Number(formData.weightKg) || 0,
          heightCm: Number(formData.heightCm) || 0,
          bmi: bmiValue,
          haemoglobinGdl: formData.haemoglobinGdl ? Number(formData.haemoglobinGdl) : undefined,
          otherHealthConditions: formData.otherHealthConditions,
          otherHealthConditionSpecify: formData.otherHealthConditionSpecify,
          nutritionStatus: nutritionResult.nutritionStatus,
        },
        nutrition: {
          appetite: formData.appetite,
          mealsPerDay: Number(formData.mealsPerDay) || 3,
        },
        educationStatus: {
          educationStatus: formData.educationStatus,
          educationStatusSpecify: formData.educationStatusSpecify,
          schoolName: formData.schoolName,
          schoolSessionStartDate: formData.schoolSessionStartDate,
          schoolType: formData.schoolType,
          currentClass: formData.currentClass,
          attendance: formData.attendance,
        },
        educationExpenses: {
          schoolFees: Number(formData.schoolFees) || 0,
          tuitionFees: Number(formData.tuitionFees) || 0,
          books: Number(formData.books) || 0,
          stationery: Number(formData.stationery) || 0,
          uniform: Number(formData.uniform) || 0,
          transport: Number(formData.transport) || 0,
          otherExpenses: Number(formData.otherExpenses) || 0,
          totalAnnualCost: totalAnnualEducationCost,
          feeReceiptPhotoUrl: formData.feeReceiptPhotoUrl,
          marksheetPhotoUrl: formData.marksheetPhotoUrl,
          remarks: formData.remarks,
        },
        educationSupportRequired: {
          requiredSchoolFees: Number(formData.requiredSchoolFees) || 0,
          requiredBooks: Number(formData.requiredBooks) || 0,
          requiredStationery: Number(formData.requiredStationery) || 0,
          requiredUniform: Number(formData.requiredUniform) || 0,
          requiredTransport: Number(formData.requiredTransport) || 0,
          requiredOtherSupport: Number(formData.requiredOtherSupport) || 0,
          totalRequiredSupport: totalRequiredSupport,
        },
        finalReview: {
          allInfoCorrect: formData.allInfoCorrect,
          organizationName: formData.organizationName,
          formSubmittedBy: formData.formSubmittedBy,
          organizationEmail: formData.organizationEmail,
        },
        grantCalculation: {
          totalGrantAmount: totalRequiredSupport || 2000,
        },
        syncStatus: 'queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await enqueueSubmission(fullRecord, { operationType: 'CREATE' });
      router.push(`/assessment/sync?submitted=true&ref=${encodeURIComponent(formData.artNumber)}`);
    } catch (err) {
      console.error('Submission failed:', err);
      setIsSubmitting(false);
    }
  };

  const toggleHealthCondition = (cond: string) => {
    setFormData((prev) => {
      const exists = prev.otherHealthConditions.includes(cond);
      return {
        ...prev,
        otherHealthConditions: exists
          ? prev.otherHealthConditions.filter((c) => c !== cond)
          : [...prev.otherHealthConditions, cond],
      };
    });
  };

  return (
    <AppShell
      activeChild={{
        artNumber: formData.artNumber,
        childName: formData.childName,
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
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-2.5">
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

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerateId}
                  className="text-xs text-teal-700"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  <span>Regenerate ID</span>
                </Button>
              </div>

              {/* Assessment Reference ID */}
              <div className="p-3 bg-teal-50/50 border border-teal-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-teal-800">
                    Assessment Reference ID
                  </span>
                  <div className="font-mono font-bold text-base text-teal-900">{formData.artNumber}</div>
                </div>
                <span className="text-[11px] text-teal-700 font-medium">Non-stigmatising ID</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="DATE OF FILLING THIS FORM *"
                  type="date"
                  required
                  value={formData.dateOfFilling}
                  onChange={(e) => setFormData({ ...formData, dateOfFilling: e.target.value })}
                  helperText="Today's date (DD/MM/YY)"
                />

                <Input
                  label="CHILD'S FULL NAME *"
                  required
                  value={formData.childName}
                  onChange={(e) => setFormData({ ...formData, childName: e.target.value })}
                  helperText="As per official records."
                  placeholder="e.g. Pooja Ramesh K."
                />

                <Input
                  label="DATE OF BIRTH *"
                  type="date"
                  required
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
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

                {/* GENDER */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">GENDER *</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['Male', 'Female', 'Other'] as Gender[]).map((g) => (
                      <label
                        key={g}
                        className={`flex items-center space-x-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                          formData.gender === g
                            ? 'bg-teal-50/70 border-teal-500 text-teal-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="gender"
                          value={g}
                          checked={formData.gender === g}
                          onChange={() => setFormData({ ...formData, gender: g })}
                          className="text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-xs">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* ORPHAN STATUS */}
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
                          formData.orphanStatus === status
                            ? 'bg-teal-50/70 border-teal-500 text-teal-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="orphanStatus"
                          value={status}
                          checked={formData.orphanStatus === status}
                          onChange={() => setFormData({ ...formData, orphanStatus: status as OrphanStatus })}
                          className="text-teal-600 focus:ring-teal-500 shrink-0"
                        />
                        <span className="text-xs">{status}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Input
                  label="CAREGIVER'S FULL NAME *"
                  required
                  value={formData.caregiverName}
                  onChange={(e) => setFormData({ ...formData, caregiverName: e.target.value })}
                  helperText="Name of the person caring for the child."
                  placeholder="e.g. Ramesh K."
                />

                {/* CAREGIVER'S RELATIONSHIP TO CHILD */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">
                    CAREGIVER&apos;S RELATIONSHIP TO CHILD *
                  </label>
                  <select
                    className="w-full min-h-[48px] px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    value={formData.caregiverRelationship}
                    onChange={(e) =>
                      setFormData({ ...formData, caregiverRelationship: e.target.value as CaregiverRelationship })
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
                  value={formData.contactNumber}
                  onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  helperText="10-digit mobile number."
                  placeholder="98XXXXXXXX"
                />

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">STATE / UNION TERRITORY *</label>
                  <select
                    className="w-full min-h-[48px] px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
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
                    className="w-full min-h-[48px] px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    value={formData.district}
                    onChange={(e) => {
                      const newDist = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        district: newDist,
                        artNumber: generateAssessmentId('MH', newDist),
                      }));
                    }}
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
                    value={formData.fullAddress}
                    onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                    helperText="House no., street, village/ward."
                    placeholder="e.g. Flat 12, Shiv Smruti, Market Yard, Pune"
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
                <p className="font-bold text-slate-900">
                  Consent Statement (Version v1.0-2026):
                </p>
                <p>
                  I voluntarily confirm that I am the designated caregiver for{' '}
                  <strong>{formData.childName || 'the child'}</strong> and consent to participation in the India
                  HIV/AIDS Alliance Paediatric Care and Nutritional Support Programme. I agree to anthropometric
                  measurements, clinical triage, and educational grant evaluation.
                </p>
              </div>

              {/* DO YOU AGREE TO PARTICIPATE? */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 block">
                  DO YOU AGREE TO PARTICIPATE? *
                </label>
                <p className="text-[11px] text-slate-500">You must say Yes to continue.</p>

                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <label
                    className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      formData.agreeToParticipate
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="agreeToParticipate"
                      checked={formData.agreeToParticipate === true}
                      onChange={() => setFormData({ ...formData, agreeToParticipate: true })}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs">Yes</span>
                  </label>

                  <label
                    className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      formData.agreeToParticipate === false
                        ? 'bg-rose-50 border-rose-400 text-rose-900 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="agreeToParticipate"
                      checked={formData.agreeToParticipate === false}
                      onChange={() => setFormData({ ...formData, agreeToParticipate: false })}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-xs">No</span>
                  </label>
                </div>
              </div>

              {/* Consent NOT Given Warning Banner */}
              {!formData.agreeToParticipate && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start space-x-3 text-xs">
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold">⚠ CONSENT NOT GIVEN — THIS FORM CANNOT BE SUBMITTED.</h4>
                    <p className="mt-0.5 text-rose-700">
                      Caregiver authorization is mandatory under programme safeguarding guidelines. No nutritional or
                      educational evaluation data can be captured without consent.
                    </p>
                  </div>
                </div>
              )}

              {/* Caregiver Signature Pad (Shown only when consent = Yes) */}
              {formData.agreeToParticipate && (
                <div className="pt-2">
                  <CaregiverSignaturePad
                    submissionUuid={clientUuid}
                    caregiverName={formData.caregiverName}
                    caregiverRelationship={formData.caregiverRelationship}
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
                  value={formData.weightKg}
                  onChange={(e) => setFormData({ ...formData, weightKg: Number(e.target.value) })}
                  helperText="Measured in kilograms."
                  unit="kg"
                />

                <Input
                  label="CURRENT HEIGHT (CM) *"
                  type="number"
                  step="0.1"
                  required
                  value={formData.heightCm}
                  onChange={(e) => setFormData({ ...formData, heightCm: Number(e.target.value) })}
                  helperText="Measured in centimetres."
                  unit="cm"
                />

                <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    BMI: KG/M² |
                  </span>
                  <div className="text-base font-bold text-teal-900">{bmiValue} kg/m²</div>
                </div>

                <div className="sm:col-span-2">
                  <Input
                    label="HAEMOGLOBIN (G/DL)"
                    type="number"
                    step="0.1"
                    value={formData.haemoglobinGdl}
                    onChange={(e) => setFormData({ ...formData, haemoglobinGdl: e.target.value })}
                    helperText="Latest result. Normal: 11–16 g/dL."
                    placeholder="e.g. 11.5"
                    unit="g/dL"
                  />
                </div>
              </div>

              {/* OTHER HEALTH CONDITIONS */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-800 block">
                  OTHER HEALTH CONDITIONS (Select all that apply.)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    'TB (Tuberculosis)',
                    'Hepatitis B',
                    'Hepatitis C',
                    'Any Other Health Condition (specify)',
                  ].map((cond) => {
                    const checked = formData.otherHealthConditions.includes(cond);
                    return (
                      <label
                        key={cond}
                        className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleHealthCondition(cond)}
                          className="h-4 w-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                        />
                        <span className="text-xs">{cond}</span>
                      </label>
                    );
                  })}
                </div>

                {formData.otherHealthConditions.includes('Any Other Health Condition (specify)') && (
                  <div className="mt-3">
                    <Input
                      label="OTHER HEALTH CONDITION (PLEASE SPECIFY)"
                      value={formData.otherHealthConditionSpecify}
                      onChange={(e) =>
                        setFormData({ ...formData, otherHealthConditionSpecify: e.target.value })
                      }
                      helperText="Specify the other health condition."
                      placeholder="e.g. Chronic Asthma"
                    />
                  </div>
                )}
              </div>

              {/* Section 2 — Household & Financial Details */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Section 2 — Household & Financial Details
                  </h3>
                  <p className="text-xs text-slate-500">
                    TELL US ABOUT THE FAMILY&apos;S SIZE AND FINANCIAL SITUATION.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="TOTAL FAMILY MEMBERS *"
                    type="number"
                    required
                    value={formData.totalFamilyMembers}
                    onChange={(e) => setFormData({ ...formData, totalFamilyMembers: Number(e.target.value) })}
                    helperText="Number of people in the household."
                  />

                  <Input
                    label="NUMBER OF CHILDREN (≤18 YRS) *"
                    type="number"
                    required
                    value={formData.numberOfChildrenUnder18}
                    onChange={(e) =>
                      setFormData({ ...formData, numberOfChildrenUnder18: Number(e.target.value) })
                    }
                  />

                  <Input
                    label="MONTHLY INCOME (RS.) *"
                    type="number"
                    required
                    value={formData.monthlyIncomeRs}
                    onChange={(e) => setFormData({ ...formData, monthlyIncomeRs: Number(e.target.value) })}
                    unit="₹"
                  />

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 block">
                      MAIN SOURCE OF INCOME *
                    </label>
                    <select
                      className="w-full min-h-[48px] px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      value={formData.mainSourceOfIncome}
                      onChange={(e) =>
                        setFormData({ ...formData, mainSourceOfIncome: e.target.value as MainSourceOfIncome })
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

              {/* CHILD'S APPETITE */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 block">CHILD&apos;S APPETITE *</label>
                <p className="text-[11px] text-slate-500">How is the child&apos;s usual appetite?</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['Good', 'Reduced', 'Poor / Very low'] as AppetiteLevel[]).map((app) => (
                    <label
                      key={app}
                      className={`flex items-center space-x-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                        formData.appetite === app
                          ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="appetite"
                        value={app}
                        checked={formData.appetite === app}
                        onChange={() => setFormData({ ...formData, appetite: app })}
                        className="text-teal-600 focus:ring-teal-500"
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
                  value={formData.mealsPerDay}
                  onChange={(e) => setFormData({ ...formData, mealsPerDay: Number(e.target.value) })}
                  helperText="Full meals eaten daily."
                />
              </div>

              {/* Anthropometric Triage Summary */}
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
                <div className="text-xs mt-1 opacity-85">
                  BMI: {bmiValue} kg/m² | Classification notes: {nutritionResult.triageNotes}
                </div>
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

              {/* EDUCATION STATUS */}
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
                      className={`flex items-center space-x-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                        formData.educationStatus === st
                          ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="educationStatus"
                        value={st}
                        checked={formData.educationStatus === st}
                        onChange={() => setFormData({ ...formData, educationStatus: st as EducationStatus })}
                        className="text-teal-600 focus:ring-teal-500 shrink-0"
                      />
                      <span className="text-xs">{st}</span>
                    </label>
                  ))}
                </div>
              </div>

              {formData.educationStatus === 'Other' && (
                <Input
                  label="OTHER EDUCATION STATUS (PLEASE SPECIFY)"
                  value={formData.educationStatusSpecify}
                  onChange={(e) => setFormData({ ...formData, educationStatusSpecify: e.target.value })}
                  helperText="Describe the child's education situation."
                />
              )}

              {formData.educationStatus === 'Currently going to school' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <Input
                    label="SCHOOL NAME"
                    value={formData.schoolName}
                    onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                    helperText="Full name of the school."
                    placeholder="e.g. Pune Zilla Parishad Primary School"
                  />

                  <Input
                    label="SCHOOL SESSION START DATE"
                    type="date"
                    value={formData.schoolSessionStartDate}
                    onChange={(e) => setFormData({ ...formData, schoolSessionStartDate: e.target.value })}
                    helperText="Enter the date when the school is going to start"
                  />

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 block">SCHOOL TYPE</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Government school', 'Private school', 'Aided school'] as SchoolType[]).map((st) => (
                        <label
                          key={st}
                          className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer ${
                            formData.schoolType === st
                              ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="schoolType"
                            value={st}
                            checked={formData.schoolType === st}
                            onChange={() => setFormData({ ...formData, schoolType: st })}
                            className="text-teal-600"
                          />
                          <span className="truncate">{st.replace(' school', '')}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <Input
                    label="CURRENT CLASS"
                    value={formData.currentClass}
                    onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                    helperText="e.g. Class 5"
                  />

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 block">ATTENDANCE</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['Regular', 'Irregular', 'Dropped out'] as AttendanceType[]).map((att) => (
                        <label
                          key={att}
                          className={`flex items-center space-x-2 p-3 rounded-xl border text-xs cursor-pointer ${
                            formData.attendance === att
                              ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="attendance"
                            value={att}
                            checked={formData.attendance === att}
                            onChange={() => setFormData({ ...formData, attendance: att })}
                            className="text-teal-600"
                          />
                          <span>{att}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Education Expenses & Programme Approval Grid */}
              <div className="pt-4 border-t border-slate-100">
                <ExpensesAndApprovalGrid
                  currentExpenses={{
                    schoolFees: formData.schoolFees,
                    tuitionFees: formData.tuitionFees,
                    books: formData.books,
                    stationery: formData.stationery,
                    uniform: formData.uniform,
                    transport: formData.transport,
                    otherExpenses: formData.otherExpenses,
                    feeReceiptPhotoUrl: formData.feeReceiptPhotoUrl,
                    marksheetPhotoUrl: formData.marksheetPhotoUrl,
                    remarks: formData.remarks,
                  }}
                  requiredSupport={{
                    requiredSchoolFees: formData.requiredSchoolFees,
                    requiredBooks: formData.requiredBooks,
                    requiredStationery: formData.requiredStationery,
                    requiredUniform: formData.requiredUniform,
                    requiredTransport: formData.requiredTransport,
                    requiredOtherSupport: formData.requiredOtherSupport,
                  }}
                  onCurrentExpenseChange={(field, val) =>
                    setFormData((prev) => ({ ...prev, [field]: val }))
                  }
                  onRequiredSupportChange={(field, val) =>
                    setFormData((prev) => ({ ...prev, [field]: val }))
                  }
                  onReceiptPhotoChange={(url) =>
                    setFormData((prev) => ({ ...prev, feeReceiptPhotoUrl: url || '' }))
                  }
                  onMarksheetPhotoChange={(url) =>
                    setFormData((prev) => ({ ...prev, marksheetPhotoUrl: url || '' }))
                  }
                  onRemarksChange={(rem) =>
                    setFormData((prev) => ({ ...prev, remarks: rem }))
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
                    <span className="font-bold text-slate-900 text-sm">{formData.childName}</span>
                    <span className="font-mono text-teal-900 text-xs block">Ref: {formData.artNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      AGE / DOB
                    </span>
                    <span className="font-semibold text-slate-800">
                      {ageResult.years} YEARS | DOB: {formData.dob}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      CAREGIVER
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formData.caregiverName} ({formData.caregiverRelationship})
                    </span>
                    <span className="text-slate-500 block">Phone: {formData.contactNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      DISTRICT / STATE
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formData.district} / {formData.state}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      WEIGHT / HEIGHT / BMI
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formData.weightKg} KG / {formData.heightCm} CM | BMI: ({bmiValue})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      HAEMOGLOBIN
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formData.haemoglobinGdl ? `${formData.haemoglobinGdl} G/DL` : 'Not recorded'}
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

              {/* IS ALL INFORMATION CORRECT AND COMPLETE? */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-slate-900 block">
                  IS ALL INFORMATION CORRECT AND COMPLETE? *
                </label>

                <div className="space-y-2">
                  <label
                    className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer ${
                      formData.allInfoCorrect
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="allInfoCorrect"
                      checked={formData.allInfoCorrect === true}
                      onChange={() => setFormData({ ...formData, allInfoCorrect: true })}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs">Yes — all information is correct</span>
                  </label>

                  <label
                    className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer ${
                      formData.allInfoCorrect === false
                        ? 'bg-rose-50 border-rose-400 text-rose-900 font-bold'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="allInfoCorrect"
                      checked={formData.allInfoCorrect === false}
                      onChange={() => setFormData({ ...formData, allInfoCorrect: false })}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-xs">No — I need to make corrections</span>
                  </label>
                </div>

                {!formData.allInfoCorrect && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                    ⚠ PLEASE GO BACK AND CORRECT ANY ERRORS BEFORE SUBMITTING.
                  </div>
                )}
              </div>

              {/* Submitter Metadata */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Final Review Sign-off</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="ORGANIZATION NAME"
                    value={formData.organizationName}
                    onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                  />

                  <Input
                    label="FORM SUBMITTED BY *"
                    required
                    value={formData.formSubmittedBy}
                    onChange={(e) => setFormData({ ...formData, formSubmittedBy: e.target.value })}
                    helperText="Enter your name"
                  />

                  <Input
                    label="ORGANIZATION EMAIL ID"
                    type="email"
                    value={formData.organizationEmail}
                    onChange={(e) => setFormData({ ...formData, organizationEmail: e.target.value })}
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
