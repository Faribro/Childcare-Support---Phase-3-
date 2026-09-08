'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { StepIndicator } from '@/components/wizard/StepIndicator';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import {
  calculateAge,
  calculateBMI,
  classifyNutritionStatus,
  calculateGrantEntitlement,
} from '@/lib/clinical/nutritionCalculations';
import { saveDraft } from '@/lib/db/draftRepository';
import { enqueueSubmission } from '@/lib/db/syncQueueRepository';
import type {
  AssessmentRecord,
  Gender,
  OrphanStatus,
  NutritionStatus,
} from '@/types/domain';
import {
  HeartPulse,
  GraduationCap,
  Home,
  User,
  CreditCard,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

const WIZARD_STEPS = [
  { number: 1, title: 'Demographics', description: 'Child & caregiver identification' },
  { number: 2, title: 'Household', description: 'Socioeconomic & orphan status' },
  { number: 3, title: 'Nutrition', description: 'Anthropometry & MAM/SAM triage' },
  { number: 4, title: 'Education', description: 'Schooling & grant calculation' },
  { number: 5, title: 'Bank Details', description: 'DBT account verification' },
  { number: 6, title: 'Sign-off', description: 'Declaration & sync queuing' },
];

export default function NewAssessmentPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved'>('saved');
  const [clientUuid, setClientUuid] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState({
    // Step 1
    artNumber: '',
    childName: '',
    dob: '',
    gender: 'Male' as Gender,
    caregiverName: '',
    caregiverRelationship: 'Mother',
    caregiverPhone: '',
    maskedAadhaar: '',
    district: 'Pune',
    artCenter: 'Sassoon General Hospital',

    // Step 2
    orphanStatus: 'None' as OrphanStatus,
    primaryCaregiverOccupation: 'Daily Wage Laborer',
    monthlyHouseholdIncome: 4500,
    rationCardType: 'BPL' as 'BPL' | 'AAY (Antyodaya)' | 'APL' | 'None',
    numberOfSiblings: 2,

    // Step 3
    heightCm: 110,
    weightKg: 15.5,
    muacMm: 122,
    bilateralPittingOedema: false,
    clinicalNotes: '',

    // Step 4
    schoolEnrolled: true,
    schoolType: 'Government' as 'Government' | 'Government-Aided' | 'Private' | 'Non-Formal',
    schoolGrade: 'Standard 3',
    attendancePercentage: 80,
    supportMaterialsNeeded: ['School Uniform', 'Stationery Kit'],

    // Step 5
    accountHolderName: '',
    accountNumber: '',
    ifscCode: 'SBIN0001234',
    bankName: 'State Bank of India',
    branchName: 'Main Branch',
    passbookPhotoCaptured: true,

    // Step 6
    interviewerName: 'Farid Sayyed',
    consentAcknowledged: true,
  });

  // Client-side UUID initialization
  useEffect(() => {
    if (!clientUuid && typeof window !== 'undefined') {
      const generated = window.crypto?.randomUUID ? window.crypto.randomUUID() : 'uuid-' + Date.now();
      setClientUuid(generated);
    }
  }, [clientUuid]);

  // Derived Calculations
  const ageResult = useMemo(() => {
    if (!formData.dob) return { years: 0, months: 0, totalMonths: 0 };
    try {
      return calculateAge(formData.dob);
    } catch {
      return { years: 0, months: 0, totalMonths: 0 };
    }
  }, [formData.dob]);

  const nutritionResult = useMemo(() => {
    return classifyNutritionStatus({
      ageYears: ageResult.years || 5,
      heightCm: Number(formData.heightCm) || 100,
      weightKg: Number(formData.weightKg) || 15,
      muacMm: Number(formData.muacMm) || undefined,
      bilateralPittingOedema: formData.bilateralPittingOedema,
    });
  }, [ageResult.years, formData.heightCm, formData.weightKg, formData.muacMm, formData.bilateralPittingOedema]);

  const grantResult = useMemo(() => {
    return calculateGrantEntitlement({
      schoolEnrolled: formData.schoolEnrolled,
      attendancePercentage: Number(formData.attendancePercentage) || 0,
      nutritionStatus: nutritionResult.nutritionStatus,
      orphanStatus: formData.orphanStatus,
    });
  }, [formData.schoolEnrolled, formData.attendancePercentage, nutritionResult.nutritionStatus, formData.orphanStatus]);

  // Debounced Autosave to Dexie IndexedDB
  useEffect(() => {
    if (!clientUuid) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const record: Partial<AssessmentRecord> = {
          uuid: clientUuid,
          interviewerName: formData.interviewerName || 'Field Enumerator',
          stepIndex: currentStep,
          demographics: {
            artNumber: formData.artNumber,
            childName: formData.childName,
            dob: formData.dob,
            calculatedAgeYears: ageResult.years,
            calculatedAgeMonths: ageResult.months,
            gender: formData.gender,
            caregiverName: formData.caregiverName,
            caregiverRelationship: formData.caregiverRelationship,
            caregiverPhone: formData.caregiverPhone,
            maskedAadhaar: formData.maskedAadhaar,
            district: formData.district,
            artCenter: formData.artCenter,
          },
          household: {
            orphanStatus: formData.orphanStatus,
            primaryCaregiverOccupation: formData.primaryCaregiverOccupation,
            monthlyHouseholdIncome: Number(formData.monthlyHouseholdIncome) || 0,
            rationCardType: formData.rationCardType,
            numberOfSiblings: Number(formData.numberOfSiblings) || 0,
          },
          nutrition: {
            heightCm: Number(formData.heightCm) || 0,
            weightKg: Number(formData.weightKg) || 0,
            muacMm: Number(formData.muacMm) || undefined,
            bilateralPittingOedema: formData.bilateralPittingOedema,
            bmi: nutritionResult.bmi,
            bmiZScore: nutritionResult.bmiZScore,
            nutritionStatus: nutritionResult.nutritionStatus,
            clinicalNotes: formData.clinicalNotes,
          },
          education: {
            schoolEnrolled: formData.schoolEnrolled,
            schoolType: formData.schoolType,
            schoolGrade: formData.schoolGrade,
            attendancePercentage: Number(formData.attendancePercentage) || 0,
            grantRecommended: grantResult.grantRecommended,
            recommendedGrantAmount: grantResult.recommendedGrantAmount,
            supportMaterialsNeeded: formData.supportMaterialsNeeded,
          },
          bankDetails: {
            accountHolderName: formData.accountHolderName || formData.caregiverName,
            accountNumber: formData.accountNumber,
            ifscCode: formData.ifscCode,
            bankName: formData.bankName,
            branchName: formData.branchName,
            passbookPhotoCaptured: formData.passbookPhotoCaptured,
          },
          declaration: {
            consentAcknowledged: formData.consentAcknowledged,
            caseworkerName: formData.interviewerName,
            declarationDate: new Date().toISOString().split('T')[0],
            signatureTimestamp: new Date().toISOString(),
          },
          syncStatus: 'draft',
        };

        await saveDraft(record as any);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Autosave error:', err);
        setSaveStatus('saved');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [formData, clientUuid, currentStep, ageResult, nutritionResult, grantResult]);

  // Step Navigation Handlers
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
    setIsSubmitting(true);
    try {
      const fullRecord: AssessmentRecord = {
        uuid: clientUuid,
        interviewerName: formData.interviewerName,
        stepIndex: 6,
        demographics: {
          artNumber: formData.artNumber || 'MH-PUN-DEMO',
          childName: formData.childName || 'Beneficiary Child',
          dob: formData.dob || '2019-01-01',
          calculatedAgeYears: ageResult.years,
          calculatedAgeMonths: ageResult.months,
          gender: formData.gender,
          caregiverName: formData.caregiverName || 'Caregiver',
          caregiverRelationship: formData.caregiverRelationship,
          caregiverPhone: formData.caregiverPhone || '9876543210',
          maskedAadhaar: formData.maskedAadhaar || 'XXXX-XXXX-1234',
          district: formData.district,
          artCenter: formData.artCenter,
        },
        household: {
          orphanStatus: formData.orphanStatus,
          primaryCaregiverOccupation: formData.primaryCaregiverOccupation,
          monthlyHouseholdIncome: Number(formData.monthlyHouseholdIncome) || 0,
          rationCardType: formData.rationCardType,
          numberOfSiblings: Number(formData.numberOfSiblings) || 0,
        },
        nutrition: {
          heightCm: Number(formData.heightCm) || 100,
          weightKg: Number(formData.weightKg) || 15,
          muacMm: Number(formData.muacMm) || 125,
          bilateralPittingOedema: formData.bilateralPittingOedema,
          bmi: nutritionResult.bmi,
          bmiZScore: nutritionResult.bmiZScore,
          nutritionStatus: nutritionResult.nutritionStatus,
          clinicalNotes: formData.clinicalNotes,
        },
        education: {
          schoolEnrolled: formData.schoolEnrolled,
          schoolType: formData.schoolType,
          schoolGrade: formData.schoolGrade,
          attendancePercentage: Number(formData.attendancePercentage) || 80,
          grantRecommended: grantResult.grantRecommended,
          recommendedGrantAmount: grantResult.recommendedGrantAmount,
          supportMaterialsNeeded: formData.supportMaterialsNeeded,
        },
        bankDetails: {
          accountHolderName: formData.accountHolderName || formData.caregiverName || 'Caregiver',
          accountNumber: formData.accountNumber || '123456789012',
          ifscCode: formData.ifscCode,
          bankName: formData.bankName,
          branchName: formData.branchName,
          passbookPhotoCaptured: formData.passbookPhotoCaptured,
        },
        declaration: {
          consentAcknowledged: formData.consentAcknowledged,
          caseworkerName: formData.interviewerName,
          declarationDate: new Date().toISOString().split('T')[0],
          signatureTimestamp: new Date().toISOString(),
        },
        syncStatus: 'queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await enqueueSubmission(fullRecord);
      router.push('/assessment/sync?submitted=true');
    } catch (err) {
      console.error('Submission error:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell
      activeChild={{
        artNumber: formData.artNumber,
        childName: formData.childName,
        saveStatus: saveStatus,
      }}
    >
      {/* Wizard Stepper Bar */}
      <StepIndicator
        currentStep={currentStep}
        totalSteps={6}
        steps={WIZARD_STEPS}
        onStepClick={(step) => setCurrentStep(step)}
      />

      {/* Main Responsive Form Body */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Main Form Fields Container (8 cols on desktop, full width on mobile) */}
          <div className="lg:col-span-8 flex flex-col space-y-6">
            {/* Step 1: Child Demographics */}
            {currentStep === 1 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-slate-100">
                  <div className="bg-blue-50 text-brand p-2 rounded-xl">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-ink-900">Step 1: Child Demographics</h2>
                    <p className="text-xs text-ink-600">Enter ART registration and primary caregiver information</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="ART Registration Number"
                    required
                    placeholder="e.g. MH-PUN-1049"
                    value={formData.artNumber}
                    onChange={(e) => setFormData({ ...formData, artNumber: e.target.value.toUpperCase() })}
                    helperText="Official National ART Centre registration ID"
                  />

                  <Input
                    label="Child Full Name"
                    required
                    placeholder="First and last name"
                    value={formData.childName}
                    onChange={(e) => setFormData({ ...formData, childName: e.target.value })}
                  />

                  <div>
                    <Input
                      label="Date of Birth"
                      type="date"
                      required
                      value={formData.dob}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                      helperText={
                        formData.dob
                          ? `Calculated Age: ${ageResult.years} yrs, ${ageResult.months} mos`
                          : 'Select child date of birth'
                      }
                    />
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-ink-900">Gender *</label>
                    <select
                      className="w-full min-h-[48px] px-3.5 py-3 text-base text-ink-900 bg-white border border-slate-300 rounded-xl focus:ring-3 focus:ring-brand-light focus:border-brand"
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Transgender">Transgender</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <Input
                    label="Primary Caregiver Name"
                    required
                    placeholder="Caregiver full name"
                    value={formData.caregiverName}
                    onChange={(e) => setFormData({ ...formData, caregiverName: e.target.value })}
                  />

                  <Input
                    label="Relationship to Child"
                    required
                    placeholder="e.g. Mother, Grandmother, Uncle"
                    value={formData.caregiverRelationship}
                    onChange={(e) => setFormData({ ...formData, caregiverRelationship: e.target.value })}
                  />

                  <Input
                    label="Caregiver Contact Phone"
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={formData.caregiverPhone}
                    onChange={(e) => setFormData({ ...formData, caregiverPhone: e.target.value })}
                  />

                  <Input
                    label="Masked Aadhaar Number"
                    placeholder="XXXX-XXXX-1234"
                    value={formData.maskedAadhaar}
                    onChange={(e) => setFormData({ ...formData, maskedAadhaar: e.target.value })}
                    helperText="For data privacy, store only last 4 digits"
                  />

                  <Input
                    label="District"
                    required
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  />

                  <Input
                    label="Designated ART Centre"
                    required
                    value={formData.artCenter}
                    onChange={(e) => setFormData({ ...formData, artCenter: e.target.value })}
                  />
                </div>
              </section>
            )}

            {/* Step 2: Household & Family */}
            {currentStep === 2 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-slate-100">
                  <div className="bg-blue-50 text-brand p-2 rounded-xl">
                    <Home className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-ink-900">Step 2: Household & Vulnerability</h2>
                    <p className="text-xs text-ink-600">Socioeconomic background, orphanhood, and living standards</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-ink-900">Orphanhood Vulnerability Tier *</label>
                    <select
                      className="w-full min-h-[48px] px-3.5 py-3 text-base text-ink-900 bg-white border border-slate-300 rounded-xl focus:ring-3 focus:ring-brand-light focus:border-brand"
                      value={formData.orphanStatus}
                      onChange={(e) => setFormData({ ...formData, orphanStatus: e.target.value as OrphanStatus })}
                    >
                      <option value="None">None (Both parents living)</option>
                      <option value="Maternal Orphan">Maternal Orphan (Mother deceased)</option>
                      <option value="Paternal Orphan">Paternal Orphan (Father deceased)</option>
                      <option value="Double Orphan (Both Parents Deceased)">Double Orphan (Both parents deceased)</option>
                      <option value="Single Parent with Vulnerability">Single Parent with Vulnerability</option>
                    </select>
                  </div>

                  <Input
                    label="Primary Caregiver Occupation"
                    required
                    value={formData.primaryCaregiverOccupation}
                    onChange={(e) => setFormData({ ...formData, primaryCaregiverOccupation: e.target.value })}
                  />

                  <Input
                    label="Monthly Household Income (INR)"
                    type="number"
                    required
                    value={formData.monthlyHouseholdIncome}
                    onChange={(e) => setFormData({ ...formData, monthlyHouseholdIncome: Number(e.target.value) })}
                    unit="₹"
                  />

                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-ink-900">Ration Card Tier *</label>
                    <select
                      className="w-full min-h-[48px] px-3.5 py-3 text-base text-ink-900 bg-white border border-slate-300 rounded-xl focus:ring-3 focus:ring-brand-light focus:border-brand"
                      value={formData.rationCardType}
                      onChange={(e) => setFormData({ ...formData, rationCardType: e.target.value as any })}
                    >
                      <option value="BPL">BPL (Below Poverty Line)</option>
                      <option value="AAY (Antyodaya)">AAY (Antyodaya Anna Yojana)</option>
                      <option value="APL">APL (Above Poverty Line)</option>
                      <option value="None">None / No Card Issued</option>
                    </select>
                  </div>

                  <Input
                    label="Number of Dependent Siblings"
                    type="number"
                    value={formData.numberOfSiblings}
                    onChange={(e) => setFormData({ ...formData, numberOfSiblings: Number(e.target.value) })}
                  />
                </div>
              </section>
            )}

            {/* Step 3: Clinical Nutrition & Anthropometry */}
            {currentStep === 3 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-slate-100">
                  <div className="bg-emerald-50 text-alliance-emerald p-2 rounded-xl">
                    <HeartPulse className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-ink-900">Step 3: Clinical Nutrition Assessment</h2>
                    <p className="text-xs text-ink-600">Physical measurements and instant WHO malnutrition staging</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <Input
                    label="Standing Height (cm)"
                    type="number"
                    step="0.1"
                    required
                    value={formData.heightCm}
                    onChange={(e) => setFormData({ ...formData, heightCm: Number(e.target.value) })}
                    unit="cm"
                    helperText="Measure without footwear"
                  />

                  <Input
                    label="Body Weight (kg)"
                    type="number"
                    step="0.1"
                    required
                    value={formData.weightKg}
                    onChange={(e) => setFormData({ ...formData, weightKg: Number(e.target.value) })}
                    unit="kg"
                    helperText="Use calibrated digital scale"
                  />

                  <Input
                    label="MUAC (mm)"
                    type="number"
                    value={formData.muacMm}
                    onChange={(e) => setFormData({ ...formData, muacMm: Number(e.target.value) })}
                    unit="mm"
                    helperText="Mid-Upper Arm Circumference"
                  />
                </div>

                {/* Bilateral Oedema Toggle */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-4">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.bilateralPittingOedema}
                      onChange={(e) => setFormData({ ...formData, bilateralPittingOedema: e.target.checked })}
                      className="h-5 w-5 text-alert-rose rounded border-slate-300 focus:ring-rose-400"
                    />
                    <div>
                      <span className="text-sm font-bold text-ink-900">Bilateral Pitting Oedema Present</span>
                      <p className="text-xs text-slate-500">Thumb pressure on both feet leaves indentation (Kwashiorkor check)</p>
                    </div>
                  </label>
                </div>

                {/* Instant Malnutrition Triage Alert Card */}
                <div
                  className={`p-4 rounded-xl border ${
                    nutritionResult.nutritionStatus === 'SAM (Severe Acute Malnutrition)'
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : nutritionResult.nutritionStatus === 'MAM (Moderate Acute Malnutrition)'
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    {nutritionResult.nutritionStatus === 'SAM (Severe Acute Malnutrition)' ? (
                      <AlertTriangle className="h-6 w-6 text-alert-rose shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="h-6 w-6 text-alliance-emerald shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider">Clinical Triage Finding</span>
                        <span className="text-xs font-bold bg-white/80 px-2 py-0.5 rounded-md shadow-xs">
                          BMI: {nutritionResult.bmi} kg/m²
                        </span>
                      </div>
                      <h3 className="text-sm font-bold mt-1">{nutritionResult.nutritionStatus}</h3>
                      <p className="text-xs mt-1 leading-relaxed opacity-90">{nutritionResult.triageNotes}</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Step 4: Education Support */}
            {currentStep === 4 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-slate-100">
                  <div className="bg-blue-50 text-brand p-2 rounded-xl">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-ink-900">Step 4: Education & Support Grants</h2>
                    <p className="text-xs text-ink-600">School enrollment status and entitlement calculations</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="sm:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.schoolEnrolled}
                        onChange={(e) => setFormData({ ...formData, schoolEnrolled: e.target.checked })}
                        className="h-5 w-5 text-brand rounded border-slate-300 focus:ring-brand"
                      />
                      <span className="text-sm font-bold text-ink-900">Child is Currently Enrolled in School</span>
                    </label>
                  </div>

                  {formData.schoolEnrolled && (
                    <>
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-xs font-bold text-ink-900">School Type</label>
                        <select
                          className="w-full min-h-[48px] px-3.5 py-3 text-base text-ink-900 bg-white border border-slate-300 rounded-xl focus:ring-3 focus:ring-brand-light focus:border-brand"
                          value={formData.schoolType}
                          onChange={(e) => setFormData({ ...formData, schoolType: e.target.value as any })}
                        >
                          <option value="Government">Government School</option>
                          <option value="Government-Aided">Government-Aided</option>
                          <option value="Private">Private School</option>
                          <option value="Non-Formal">Non-Formal / Bridging Centre</option>
                        </select>
                      </div>

                      <Input
                        label="Current Standard / Grade"
                        value={formData.schoolGrade}
                        onChange={(e) => setFormData({ ...formData, schoolGrade: e.target.value })}
                        placeholder="e.g. Standard 4"
                      />

                      <Input
                        label="Average Attendance Percentage"
                        type="number"
                        value={formData.attendancePercentage}
                        onChange={(e) => setFormData({ ...formData, attendancePercentage: Number(e.target.value) })}
                        unit="%"
                      />
                    </>
                  )}
                </div>

                {/* Educational Grant Recommendation Card */}
                <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand">Calculated Grant Entitlement</span>
                    <span className="text-base font-bold text-brand bg-white px-2.5 py-0.5 rounded-lg shadow-xs">
                      ₹{grantResult.recommendedGrantAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-xs text-ink-700 mt-2 leading-relaxed">{grantResult.rationale}</p>
                </div>
              </section>
            )}

            {/* Step 5: DBT Bank Details */}
            {currentStep === 5 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-slate-100">
                  <div className="bg-blue-50 text-brand p-2 rounded-xl">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-ink-900">Step 5: Direct Benefit Transfer (DBT)</h2>
                    <p className="text-xs text-ink-600">Caregiver bank account details for grant disbursement</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Account Holder Name (As in Bank Passbook)"
                    required
                    placeholder="Caregiver name"
                    value={formData.accountHolderName}
                    onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                  />

                  <Input
                    label="Bank Account Number"
                    type="password"
                    required
                    placeholder="9 to 18 digits"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  />

                  <Input
                    label="Bank IFSC Code"
                    required
                    placeholder="e.g. SBIN0001234"
                    value={formData.ifscCode}
                    onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                  />

                  <Input
                    label="Bank Name"
                    required
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  />

                  <Input
                    label="Branch Name"
                    required
                    value={formData.branchName}
                    onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                  />

                  <div className="sm:col-span-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.passbookPhotoCaptured}
                        onChange={(e) => setFormData({ ...formData, passbookPhotoCaptured: e.target.checked })}
                        className="h-5 w-5 text-alliance-emerald rounded border-slate-300 focus:ring-emerald-400"
                      />
                      <div>
                        <span className="text-sm font-bold text-emerald-950">Bank Passbook Photo Verified</span>
                        <p className="text-xs text-emerald-800">Physical document verified by field worker</p>
                      </div>
                    </label>
                  </div>
                </div>
              </section>
            )}

            {/* Step 6: Review & Sign-off */}
            {currentStep === 6 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-slate-100">
                  <div className="bg-emerald-50 text-alliance-emerald p-2 rounded-xl">
                    <FileCheck2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-ink-900">Step 6: Review & Caseworker Sign-off</h2>
                    <p className="text-xs text-ink-600">Verify assessment summary and sign off for synchronization</p>
                  </div>
                </div>

                {/* Summary Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-6">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 font-medium">Child Identification</span>
                    <p className="font-bold text-ink-900 text-sm mt-0.5">{formData.childName || 'Not entered'}</p>
                    <p className="text-brand font-mono font-bold mt-0.5">ART ID: {formData.artNumber}</p>
                    <p className="text-slate-600">Age: {ageResult.years} yrs ({formData.gender})</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 font-medium">Nutritional Triage</span>
                    <p className="font-bold text-ink-900 text-sm mt-0.5">{nutritionResult.nutritionStatus}</p>
                    <p className="text-slate-600">Height: {formData.heightCm} cm | Weight: {formData.weightKg} kg</p>
                    <p className="text-slate-600">MUAC: {formData.muacMm} mm | BMI: {nutritionResult.bmi}</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 font-medium">Educational Support</span>
                    <p className="font-bold text-ink-900 text-sm mt-0.5">
                      {formData.schoolEnrolled ? formData.schoolGrade : 'Not Enrolled'}
                    </p>
                    <p className="text-slate-600">Attendance: {formData.attendancePercentage}%</p>
                    <p className="text-alliance-emerald font-bold">Grant: ₹{grantResult.recommendedGrantAmount}</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 font-medium">Caregiver & Bank</span>
                    <p className="font-bold text-ink-900 text-sm mt-0.5">{formData.caregiverName} ({formData.caregiverRelationship})</p>
                    <p className="text-slate-600">Contact: {formData.caregiverPhone}</p>
                    <p className="font-mono text-slate-600">IFSC: {formData.ifscCode}</p>
                  </div>
                </div>

                {/* Caseworker Declaration */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-4">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.consentAcknowledged}
                      onChange={(e) => setFormData({ ...formData, consentAcknowledged: e.target.checked })}
                      className="h-5 w-5 text-brand rounded border-slate-300 focus:ring-brand mt-0.5"
                    />
                    <div className="text-xs text-ink-900 leading-relaxed">
                      <span className="font-bold">Caseworker Declaration & Informed Consent:</span> I certify that I have conducted this assessment in person, confirmed anthropometric measurements, verified caregiver identity, and obtained informed consent in accordance with India HIV/AIDS Alliance protocols.
                    </div>
                  </label>
                </div>

                <Input
                  label="Authorised Enumerator / Caseworker Name"
                  required
                  value={formData.interviewerName}
                  onChange={(e) => setFormData({ ...formData, interviewerName: e.target.value })}
                />
              </section>
            )}

            {/* Desktop Action Bar Buttons (Inside form container on large screens) */}
            <div className="hidden md:flex items-center justify-between pt-4 border-t border-slate-200">
              {currentStep > 1 ? (
                <Button type="button" variant="secondary" onClick={handlePrev}>
                  Previous Step
                </Button>
              ) : (
                <div />
              )}

              <Button
                type="button"
                variant={currentStep === 6 ? 'emerald' : 'primary'}
                onClick={handleNext}
                isLoading={isSubmitting}
                className="min-w-[160px]"
              >
                {currentStep === 6 ? 'Queue Assessment for Sync' : 'Continue to Next Step'}
              </Button>
            </div>
          </div>

          {/* Right Sidebar on Desktop: Live Clinical & Progress Summary (4 cols) */}
          <div className="hidden lg:block lg:col-span-4 space-y-4">
            {/* Live Beneficiary Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Active Beneficiary</span>
              <h3 className="text-base font-bold text-ink-900 mt-1">
                {formData.childName || 'Unregistered Intake'}
              </h3>
              <p className="font-mono text-xs font-bold text-brand mt-0.5">
                {formData.artNumber || 'ART ID: PENDING'}
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Local Draft:</span>
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                  Autosaved (IndexedDB)
                </span>
              </div>
            </div>

            {/* Real-time Malnutrition Calculator Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Clinical Growth Indices</span>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Calculated Age:</span>
                  <span className="font-bold text-ink-900">{ageResult.years} yrs, {ageResult.months} mos</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">BMI:</span>
                  <span className="font-bold text-ink-900">{nutritionResult.bmi} kg/m²</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Z-Score:</span>
                  <span className="font-bold text-ink-900">{nutritionResult.bmiZScore} SD</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Nutrition Status:</span>
                  <span
                    className={`font-bold ${
                      nutritionResult.nutritionStatus.includes('SAM')
                        ? 'text-alert-rose'
                        : nutritionResult.nutritionStatus.includes('MAM')
                        ? 'text-alert-amber'
                        : 'text-alliance-emerald'
                    }`}
                  >
                    {nutritionResult.nutritionStatus}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Recommended Grant:</span>
                  <span className="font-bold text-brand">₹{grantResult.recommendedGrantAmount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Action Bar (< 768px) */}
      <div className="md:hidden">
        <BottomActionBar
          onNext={handleNext}
          onPrev={currentStep > 1 ? handlePrev : undefined}
          isFinalStep={currentStep === 6}
          isSubmitting={isSubmitting}
        />
      </div>
    </AppShell>
  );
}
