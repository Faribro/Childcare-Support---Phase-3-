'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CaregiverSignaturePad } from '@/components/ui/CaregiverSignaturePad';
import { ExpensesAndApprovalGrid } from '@/components/education/ExpensesAndApprovalGrid';
import { PhotoUpload } from '@/components/ui/PhotoUpload';
import { SectionVerticalTitle, type SectionColorScheme } from '@/components/ui/SectionVerticalTitle';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ConsentAudioNotice } from '@/components/ui/ConsentAudioNotice';
import { LocationFetchButton } from '@/components/ui/LocationFetchButton';
import { AnimatedAppetiteSelector } from '@/components/ui/AnimatedAppetiteSelector';
import { ImmersiveReaderControls } from '@/components/ui/ImmersiveReaderControls';
import { t } from '@/lib/i18n/translations';
import { getDraftByAnyId, saveDraft } from '@/lib/db/draftRepository';
import { completeSubmissionSchema } from '@/lib/validations/submissionSchema';
import { handleSchemaValidationFailure } from '@/lib/validations/submissionValidationGuard';
import { enqueueCreate } from '@/features/submission/submissionQueueRepository';
import { processQueue } from '@/features/submission/submissionWorker';
import { waitForSubmissionOutcome } from '@/features/submission/submissionEvents';
import { isValidUuidV4, generateUuidV4, normalizeCaregiverConsent } from '@/features/submission/submissionTypes';
import { getCaregiverSignatureBlob } from '@/lib/db/dexieDb';
import {
  calculateAge,
  calculateBMI,
  classifyNutritionStatus,
  classifyBMICategory,
  classifyHbCategory,
  classifyVLCategory,
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
  type ARTStatus,
  type VLStatus,
  type VLCategory,
  type BMICategory,
  type HbCategory,
  type ApprovedAllianceStatus,
} from '@/types/domain';
import {
  User,
  ShieldCheck,
  CreditCard,
  FileText,
  Home,
  HeartPulse,
  Utensils,
  GraduationCap,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Save,
  Send,
  ArrowLeft,
  Scale,
  Pill,
  Microscope,
  Activity,
} from 'lucide-react';

export default function ResumeDraftSinglePage() {
  const router = useRouter();
  const params = useParams();
  const draftId = params?.draftId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [draftNotFound, setDraftNotFound] = useState(false);
  const [clientUuid, setClientUuid] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved'>('saved');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'saving' | 'sending' | 'success' | 'retrying' | 'failed'>('idle');
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [activeReadingId, setActiveReadingId] = useState<string | null>(null);

  const getHighlightClass = (id: string) =>
    activeReadingId === id
      ? 'ring-2 ring-purple-400 bg-purple-50/70 rounded-xl p-1 -m-1 transition-all duration-300 shadow-[0_0_18px_rgba(168,85,247,0.35)]'
      : 'transition-all duration-200';

  const ORPHAN_OPTIONS: { value: OrphanStatus; label: string; tooltip: string }[] = [
    { value: 'Both parents alive', label: 'Both parents alive', tooltip: 'Both biological parents are alive' },
    { value: 'Single orphan (one parent deceased)', label: 'Single orphan', tooltip: 'One parent deceased' },
    { value: 'Double orphan (both parents deceased)', label: 'Double orphan', tooltip: 'Both parents deceased' },
  ];

  // ── Premium per-section colour palettes (+ neon glow data) ───────────────
  const SC: Record<string, SectionColorScheme> = {
    consent:   { bg:'bg-rose-50/60',   border:'border-rose-200',   badge:'bg-rose-800',   text:'text-rose-900',   neonMid:'rgba(251,113,133,0.40)', neonFar:'rgba(251,113,133,0.10)', neonBorder:'rgba(251,113,133,0.50)' },
    demo:      { bg:'bg-indigo-50/60', border:'border-indigo-200', badge:'bg-indigo-800', text:'text-indigo-900', neonMid:'rgba(129,140,248,0.40)', neonFar:'rgba(129,140,248,0.10)', neonBorder:'rgba(129,140,248,0.50)' },
    banking:   { bg:'bg-amber-50/60',  border:'border-amber-200',  badge:'bg-amber-800',  text:'text-amber-900',  neonMid:'rgba(251,191,36,0.40)',  neonFar:'rgba(251,191,36,0.10)',  neonBorder:'rgba(251,191,36,0.55)'  },
    household: { bg:'bg-teal-50/60',   border:'border-teal-200',   badge:'bg-teal-800',   text:'text-teal-900',   neonMid:'rgba(45,212,191,0.40)',  neonFar:'rgba(45,212,191,0.10)',  neonBorder:'rgba(45,212,191,0.50)'  },
    clinical:  { bg:'bg-sky-50/60',    border:'border-sky-200',    badge:'bg-sky-800',    text:'text-sky-900',    neonMid:'rgba(56,189,248,0.40)',  neonFar:'rgba(56,189,248,0.10)',  neonBorder:'rgba(56,189,248,0.50)'  },
    nutrition: { bg:'bg-lime-50/60',   border:'border-lime-200',   badge:'bg-lime-800',   text:'text-lime-900',   neonMid:'rgba(163,230,53,0.45)',  neonFar:'rgba(163,230,53,0.11)',  neonBorder:'rgba(132,204,22,0.55)'  },
    education: { bg:'bg-violet-50/60', border:'border-violet-200', badge:'bg-violet-800', text:'text-violet-900', neonMid:'rgba(167,139,250,0.40)', neonFar:'rgba(167,139,250,0.10)', neonBorder:'rgba(167,139,250,0.50)' },
    expenses:  { bg:'bg-orange-50/60', border:'border-orange-200', badge:'bg-orange-800', text:'text-orange-900', neonMid:'rgba(251,146,60,0.40)',  neonFar:'rgba(251,146,60,0.10)',  neonBorder:'rgba(251,146,60,0.50)'  },
    review:    { bg:'bg-emerald-50/60',border:'border-emerald-200',badge:'bg-emerald-800',text:'text-emerald-900',neonMid:'rgba(52,211,153,0.40)',  neonFar:'rgba(52,211,153,0.10)',  neonBorder:'rgba(52,211,153,0.50)'  },
  };

  // Form State strictly covering all 73 official linelist & Sheet fields
  const [formData, setFormData] = useState({
    // Section 1: Child & Caregiver Details
    artNumber: '',
    koboId: '',
    dateOfFilling: new Date().toISOString().split('T')[0],
    childName: '',
    dob: '',
    gender: '' as Gender,
    orphanStatus: '' as OrphanStatus,
    caregiverName: '',
    caregiverRelationship: '' as CaregiverRelationship,
    contactNumber: '',
    fullAddress: '',
    state: '',
    district: '',
    childAadhaarNumber: '',

    // Section 2: Consent
    agreeToParticipate: null as boolean | null,

    // Section 3: Banking & Identification (KYC) Details
    bankAccountHolderName: '',
    bankAccountNumber: '',
    bankIfscCode: '',
    bankLinkedMobileNumber: '',
    passbookPhotoUrl: '',
    aadhaarCardPhotoUrl: '',
    childPhotoUrl: '',

    // Section 4: Household & Financial Details
    totalFamilyMembers: 0,
    numberOfChildrenUnder18: 0,
    monthlyIncomeRs: 0,
    mainSourceOfIncome: '' as MainSourceOfIncome,

    // Section 5: Health, Clinical, ART & Viral Load
    weightKg: 0,
    heightCm: 0,
    haemoglobinGdl: '',
    otherHealthConditions: [] as string[],
    otherHealthConditionSpecify: '',
    artStatus: '' as ARTStatus,
    artRegistrationDate: '',
    artIdNumber: '',
    vlStatus: '' as VLStatus,
    vlDate: '',
    viralLoad: '',

    // Section 6: Nutrition Habits
    appetite: '' as AppetiteLevel,
    mealsPerDay: 0,

    // Section 7: Education Status
    educationStatus: '' as EducationStatus,
    educationStatusSpecify: '',
    schoolName: '',
    schoolSessionStartDate: '',
    schoolType: '' as SchoolType,
    currentClass: '',
    attendance: '' as AttendanceType,

    // Section 8: Current Expenses & Documents
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

    // Section 8: Support Required
    requiredSchoolFees: 0,
    requiredTuitionFees: 0,
    requiredBooks: 0,
    requiredStationery: 0,
    requiredUniform: 0,
    requiredTransport: 0,
    requiredOtherSupport: 0,

    // Section 9: Programme Approval & Final Review
    approvedAllianceIndia: 'Pending' as ApprovedAllianceStatus,
    allInfoCorrect: null as boolean | null,
    organizationName: '',
    formSubmittedBy: '',
    organizationEmail: '',
  });

  // Load draft from Dexie
  useEffect(() => {
    async function load() {
      if (!draftId) return;
      try {
        const found = await getDraftByAnyId(draftId);
        if (found) {
          const rawUuid = found.uuid || found.clientSubmissionId;
          const uuid = isValidUuidV4(rawUuid)
            ? rawUuid
            : isValidUuidV4(draftId)
            ? draftId
            : generateUuidV4();
          setClientUuid(uuid);
          if (found.id && (found.uuid !== uuid || found.clientSubmissionId !== uuid)) {
            await saveDraft({
              ...found,
              uuid,
              clientSubmissionId: uuid,
            });
          }

          // Map found draft to formData
          const d = found.demographics || ({} as any);
          const c = found.consent || ({} as any);
          const b = found.bankingAndKyc || found.bankDetails || ({} as any);
          const hf = found.householdFinancial || ({} as any);
          const h = found.health || ({} as any);
          const n = found.nutrition || ({} as any);
          const ed = found.educationStatus || ({} as any);
          const exp = found.educationExpenses || ({} as any);
          const req = found.educationSupportRequired || ({} as any);
          const fr = found.finalReview || ({} as any);

          setFormData({
            artNumber: d.artNumber || '',
            koboId: found.koboId || d.artNumber || '',
            dateOfFilling: d.dateOfFilling || new Date().toISOString().split('T')[0],
            childName: d.childName || '',
            dob: d.dob || '',
            gender: (d.gender as Gender) || 'Male',
            orphanStatus: (d.orphanStatus as OrphanStatus) || 'Both parents alive',
            caregiverName: d.caregiverName || '',
            caregiverRelationship: (d.caregiverRelationship as CaregiverRelationship) || 'Mother',
            contactNumber: d.contactNumber || d.caregiverPhone || '',
            fullAddress: d.fullAddress || '',
            state: d.state || 'Maharashtra',
            district: d.district || 'Pune',
            childAadhaarNumber: d.childAadhaarNumber || b.childAadhaarNumber || '',

            agreeToParticipate: c.agreeToParticipate ?? true,

            bankAccountHolderName: b.bankAccountHolderName || b.accountHolderName || '',
            bankAccountNumber: b.bankAccountNumber || b.accountNumber || '',
            bankIfscCode: b.bankIfscCode || b.ifscCode || '',
            bankLinkedMobileNumber: b.bankLinkedMobileNumber || '',
            passbookPhotoUrl: b.passbookPhotoUrl || '',
            aadhaarCardPhotoUrl: b.aadhaarCardPhotoUrl || '',
            childPhotoUrl: b.childPhotoUrl || '',

            totalFamilyMembers: Number(hf.totalFamilyMembers) || 4,
            numberOfChildrenUnder18: Number(hf.numberOfChildrenUnder18) || 2,
            monthlyIncomeRs: Number(hf.monthlyIncomeRs) || 5000,
            mainSourceOfIncome: (hf.mainSourceOfIncome as MainSourceOfIncome) || 'Daily wage labour',

            weightKg: Number(h.weightKg || n.weightKg) || 14.5,
            heightCm: Number(h.heightCm || n.heightCm) || 100,
            haemoglobinGdl: h.haemoglobinGdl !== undefined ? String(h.haemoglobinGdl) : '',
            otherHealthConditions: h.otherHealthConditions || [],
            otherHealthConditionSpecify: h.otherHealthConditionSpecify || '',
            artStatus: (h.artStatus as ARTStatus) || 'On ART',
            artRegistrationDate: h.artRegistrationDate || '',
            artIdNumber: h.artIdNumber || '',
            vlStatus: (h.vlStatus as VLStatus) || 'Tested in last 6 months',
            vlDate: h.vlDate || '',
            viralLoad: h.viralLoad !== undefined ? String(h.viralLoad) : '< 50',

            appetite: (n.appetite as AppetiteLevel) || 'Good',
            mealsPerDay: Number(n.mealsPerDay) || 3,

            educationStatus: (ed.educationStatus as EducationStatus) || 'Currently going to school',
            educationStatusSpecify: ed.educationStatusSpecify || '',
            schoolName: ed.schoolName || '',
            schoolSessionStartDate: ed.schoolSessionStartDate || '',
            schoolType: (ed.schoolType as SchoolType) || 'Government school',
            currentClass: ed.currentClass || 'Class 2',
            attendance: (ed.attendance as AttendanceType) || 'Regular',

            schoolFees: Number(exp.schoolFees) || 0,
            tuitionFees: Number(exp.tuitionFees) || 0,
            books: Number(exp.books) || 0,
            stationery: Number(exp.stationery) || 0,
            uniform: Number(exp.uniform) || 0,
            transport: Number(exp.transport) || 0,
            otherExpenses: Number(exp.otherExpenses) || 0,
            feeReceiptPhotoUrl: exp.feeReceiptPhotoUrl || '',
            marksheetPhotoUrl: exp.marksheetPhotoUrl || '',
            remarks: exp.remarks || '',

            requiredSchoolFees: Number(req.requiredSchoolFees) || 0,
            requiredTuitionFees: Number(req.requiredTuitionFees) || 0,
            requiredBooks: Number(req.requiredBooks) || 0,
            requiredStationery: Number(req.requiredStationery) || 0,
            requiredUniform: Number(req.requiredUniform) || 0,
            requiredTransport: Number(req.requiredTransport) || 0,
            requiredOtherSupport: Number(req.requiredOtherSupport) || 0,

            approvedAllianceIndia: (found.approvedAllianceIndia || fr.approvedAllianceIndia || 'Pending') as ApprovedAllianceStatus,
            allInfoCorrect: fr.allInfoCorrect ?? true,
            organizationName: fr.organizationName || 'India HIV/AIDS Alliance',
            formSubmittedBy: fr.formSubmittedBy || found.interviewerName || 'Sunita Sharma',
            organizationEmail: fr.organizationEmail || 'fieldworker@allianceindia.org',
          });

          // Check signature status
          const sig = await getCaregiverSignatureBlob(uuid);
          setHasSavedSignature(!!sig);
        } else {
          setDraftNotFound(true);
        }
      } catch (err) {
        console.error('Failed to load draft:', err);
        setDraftNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [draftId]);

  // Monitor caregiver signature in local IndexedDB
  useEffect(() => {
    if (!clientUuid) return;
    getCaregiverSignatureBlob(clientUuid).then((sig) => {
      setHasSavedSignature(!!sig);
    });
  }, [clientUuid]);

  // Dynamic Clinical Calculations
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

  const bmiCategory = useMemo(() => {
    return classifyBMICategory(bmiValue, ageResult.years || 5);
  }, [bmiValue, ageResult.years]);

  const hbCategory = useMemo(() => {
    return classifyHbCategory(formData.haemoglobinGdl, ageResult.years || 5);
  }, [formData.haemoglobinGdl, ageResult.years]);

  const vlCategory = useMemo(() => {
    return classifyVLCategory(formData.viralLoad);
  }, [formData.viralLoad]);

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
      Number(formData.requiredTuitionFees || 0) +
      Number(formData.requiredBooks || 0) +
      Number(formData.requiredStationery || 0) +
      Number(formData.requiredUniform || 0) +
      Number(formData.requiredTransport || 0) +
      Number(formData.requiredOtherSupport || 0)
    );
  }, [
    formData.requiredSchoolFees,
    formData.requiredTuitionFees,
    formData.requiredBooks,
    formData.requiredStationery,
    formData.requiredUniform,
    formData.requiredTransport,
    formData.requiredOtherSupport,
  ]);

  // Continuous Autosave to Dexie drafts table with all 73 fields
  useEffect(() => {
    if (!clientUuid || isLoading || draftNotFound) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const record: Partial<AssessmentRecord> = {
          uuid: clientUuid,
          clientSubmissionId: clientUuid,
          koboId: formData.koboId || formData.artNumber,
          interviewerName: formData.formSubmittedBy?.trim() || 'Caseworker',
          stepIndex: 1, // Single-page form
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
            childAadhaarNumber: formData.childAadhaarNumber,
          },
          consent: {
            agreeToParticipate: formData.agreeToParticipate ?? false,
            signatureTimestamp: new Date().toISOString(),
          },
          caregiverConsent: {
            consentProvided: formData.agreeToParticipate ?? false,
            consentVersion: 'v1.0-2026',
            caregiverName: formData.caregiverName || 'Caregiver',
            caregiverRelationship: formData.caregiverRelationship || 'Mother',
            consentCapturedAt: new Date().toISOString(),
            signatureRequired: true,
            signatureStatus: hasSavedSignature ? 'CAPTURED_LOCAL' : 'PENDING',
          },
          bankingAndKyc: {
            bankAccountHolderName: formData.bankAccountHolderName,
            bankAccountNumber: formData.bankAccountNumber,
            bankIfscCode: formData.bankIfscCode,
            bankLinkedMobileNumber: formData.bankLinkedMobileNumber,
            childAadhaarNumber: formData.childAadhaarNumber,
            passbookPhotoUrl: formData.passbookPhotoUrl,
            aadhaarCardPhotoUrl: formData.aadhaarCardPhotoUrl,
            childPhotoUrl: formData.childPhotoUrl,
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
            bmiCategory: bmiCategory,
            haemoglobinGdl: formData.haemoglobinGdl ? Number(formData.haemoglobinGdl) : undefined,
            hbCategory: hbCategory,
            otherHealthConditions: formData.otherHealthConditions,
            otherHealthConditionSpecify: formData.otherHealthConditionSpecify,
            artStatus: formData.artStatus,
            artRegistrationDate: formData.artRegistrationDate,
            artIdNumber: formData.artIdNumber,
            vlStatus: formData.vlStatus,
            vlDate: formData.vlDate,
            viralLoad: formData.viralLoad,
            vlCategory: vlCategory,
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
            allInfoCorrect: formData.allInfoCorrect ?? false,
            organizationName: formData.organizationName,
            formSubmittedBy: formData.formSubmittedBy,
            organizationEmail: formData.organizationEmail,
            approvedAllianceIndia: formData.approvedAllianceIndia,
            reviewConfirmed: formData.allInfoCorrect ?? false,
          },
          approvedAllianceIndia: formData.approvedAllianceIndia,
          reviewConfirmed: formData.allInfoCorrect ?? false,
          syncNeeded: 'NO',
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
    isLoading,
    draftNotFound,
    ageResult,
    bmiValue,
    bmiCategory,
    hbCategory,
    vlCategory,
    nutritionResult,
    totalAnnualEducationCost,
    totalRequiredSupport,
    hasSavedSignature,
  ]);

  // Validation Check before queueing submission
  const validateForm = (): string | null => {
    if (!formData.childName.trim() || formData.childName.trim().length < 2) {
      return "Please enter the child's full name (at least 2 characters).";
    }
    if (!formData.dob) {
      return "Please enter the child's date of birth.";
    }
    if (!formData.caregiverName.trim() || formData.caregiverName.trim().length < 2) {
      return "Please enter the caregiver's full name.";
    }
    if (formData.contactNumber.trim().length !== 10) {
      return 'Please enter a valid 10-digit contact number.';
    }
    if (!formData.agreeToParticipate) {
      return 'Consent was not granted. The form cannot be submitted without caregiver consent.';
    }
    if (!hasSavedSignature) {
      return 'Caregiver signature is mandatory. Please have the caregiver draw and save their signature in Section 1.';
    }
    if (!formData.allInfoCorrect) {
      return 'Please verify that all information is correct and complete in the final review section.';
    }
    if (!formData.formSubmittedBy || formData.formSubmittedBy.trim().length < 2) {
      return 'Please enter your name using at least 2 characters.';
    }
    return null;
  };

  const handleManualSaveDraft = async () => {
    setSaveStatus('saving');
    try {
      setSaveStatus('saved');
      setFormError(null);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleSubmit = async () => {
    const err = validateForm();
    if (err) {
      setFormError(err);
      const targetMap: Record<string, string[]> = {
        'child\'s full name': ['childName', 'q-demo-name', 'demographics-childName'],
        'date of birth': ['child-dob', 'q-demo-dob', 'dob'],
        'caregiver\'s full name': ['caregiverName', 'q-consent-name', 'consent-caregiverName'],
        'contact number': ['caregiverContact', 'q-demo-phone', 'contactNumber'],
        'Consent was not granted': ['consent-agreeToParticipate', 'consent-checkbox', 'agreeToParticipate'],
        'signature': ['consent-signature-pad', 'signature-pad'],
        'verify that all information': ['attestation-agreeDeclaration', 'allInfoCorrect', 'q-rev-verify'],
        'name using at least 2 characters': ['formSubmittedBy', 'q-rev-interviewer'],
      };
      for (const [key, ids] of Object.entries(targetMap)) {
        if (err.includes(key)) {
          for (const id of ids) {
            const el = document.getElementById(id);
            if (el) {
              const details = el.closest('details');
              if (details && !details.open) {
                details.open = true;
                details.dispatchEvent(new Event('toggle'));
              }
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              (el as HTMLElement).focus?.();
              return;
            }
          }
        }
      }
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    try {
      // Convert locally stored signature blob to base64 Data URL for Google Drive upload
      let signatureDataUrl: string | undefined = undefined;
      try {
        const storedSig = await getCaregiverSignatureBlob(clientUuid);
        if (storedSig && storedSig.blob) {
          signatureDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(storedSig.blob);
          });
        }
      } catch (sigErr) {
        console.warn('Could not extract signature blob to DataURL:', sigErr);
      }

      const trimmedInterviewer = (formData.formSubmittedBy || '').trim();
      if (trimmedInterviewer.length < 2) {
        setFormError('Please enter your name using at least 2 characters.');
        setIsSubmitting(false);
        const el = document.getElementById('formSubmittedBy') || document.getElementById('q-rev-interviewer');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (el as HTMLElement).focus?.();
        }
        return;
      }

      const finalRecord: AssessmentRecord = {
        uuid: clientUuid,
        clientSubmissionId: clientUuid,
        uniqueId: formData.artNumber,
        version: 1,
        koboId: formData.koboId || formData.artNumber,
        interviewerName: trimmedInterviewer,
        stepIndex: 1,
        signatureDataUrl: signatureDataUrl,
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
          childAadhaarNumber: formData.childAadhaarNumber,
        },
        consent: {
          agreeToParticipate: formData.agreeToParticipate ?? false,
          signatureDataUrl: signatureDataUrl,
          signatureTimestamp: new Date().toISOString(),
        },
        caregiverConsent: {
          consentProvided: formData.agreeToParticipate ?? false,
          consentVersion: 'v1.0-2026',
          caregiverName: formData.caregiverName || 'Caregiver',
          caregiverRelationship: formData.caregiverRelationship || 'Mother',
          consentCapturedAt: new Date().toISOString(),
          signatureRequired: true,
          signatureStatus: (hasSavedSignature || !!signatureDataUrl) ? 'CAPTURED_LOCAL' : 'PENDING',
          signatureDataUrl: signatureDataUrl,
        },
        bankingAndKyc: {
          bankAccountHolderName: formData.bankAccountHolderName,
          bankAccountNumber: formData.bankAccountNumber,
          bankIfscCode: formData.bankIfscCode,
          bankLinkedMobileNumber: formData.bankLinkedMobileNumber,
          childAadhaarNumber: formData.childAadhaarNumber,
          passbookPhotoUrl: formData.passbookPhotoUrl,
          aadhaarCardPhotoUrl: formData.aadhaarCardPhotoUrl,
          childPhotoUrl: formData.childPhotoUrl,
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
          bmiCategory: bmiCategory,
          haemoglobinGdl: formData.haemoglobinGdl ? Number(formData.haemoglobinGdl) : undefined,
          hbCategory: hbCategory,
          otherHealthConditions: formData.otherHealthConditions,
          otherHealthConditionSpecify: formData.otherHealthConditionSpecify,
          artStatus: formData.artStatus,
          artRegistrationDate: formData.artRegistrationDate,
          artIdNumber: formData.artIdNumber,
          vlStatus: formData.vlStatus,
          vlDate: formData.vlDate,
          viralLoad: formData.viralLoad,
          vlCategory: vlCategory,
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
          requiredTuitionFees: Number(formData.requiredTuitionFees) || 0,
          requiredBooks: Number(formData.requiredBooks) || 0,
          requiredStationery: Number(formData.requiredStationery) || 0,
          requiredUniform: Number(formData.requiredUniform) || 0,
          requiredTransport: Number(formData.requiredTransport) || 0,
          requiredOtherSupport: Number(formData.requiredOtherSupport) || 0,
          totalRequiredSupport: totalRequiredSupport,
        },
        finalReview: {
          allInfoCorrect: formData.allInfoCorrect ?? false,
          organizationName: formData.organizationName,
          formSubmittedBy: trimmedInterviewer,
          organizationEmail: formData.organizationEmail,
          approvedAllianceIndia: formData.approvedAllianceIndia,
          reviewConfirmed: formData.allInfoCorrect ?? false,
        },
        approvedAllianceIndia: formData.approvedAllianceIndia,
        reviewConfirmed: formData.allInfoCorrect ?? false,
        syncNeeded: 'NO',
        syncStatus: 'queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const schemaValidation = completeSubmissionSchema.safeParse(finalRecord);
      if (!schemaValidation.success) {
        // BLOCKING: halt on ANY schema error — do not enqueue partial/invalid records
        handleSchemaValidationFailure({
          issues: schemaValidation.error.issues,
          setError: setFormError,
          setSubmitting: (v) => setIsSubmitting(v),
        });
        return;
      }

      await enqueueCreate({
        clientSubmissionId: finalRecord.clientSubmissionId || finalRecord.uuid,
        createIdempotencyKey: `create-${finalRecord.clientSubmissionId || finalRecord.uuid}`,
        snapshot: finalRecord,
      });

      // Immediate Autosync Trigger via canonical worker
      const refId = finalRecord.demographics.artNumber || finalRecord.uuid;
      const targetClientId = finalRecord.clientSubmissionId || finalRecord.uuid;

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
    } catch (e: any) {
      console.error('Submission error:', e);
      setFormError(e?.message || 'Failed to submit survey to sync queue.');
      setIsSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  if (draftNotFound) {
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
        artNumber: formData.artNumber,
        childName: formData.childName,
        saveStatus: saveStatus,
      }}
    >
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 pb-32 sm:pb-24">
        {/* Header Summary Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-3">
            <div className="flex items-center space-x-3">
              <Link
                href="/app"
                className="touch-target-44 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition-colors shadow-2xs shrink-0 cursor-pointer"
                title="Return to Dashboard"
                aria-label="Return to Dashboard"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                  Child Nutrition & Education Support Intake
                </h1>
                <p className="text-xs text-slate-500">
                  Resume saved draft for {formData.childName || 'Beneficiary'}.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Immersive Reader & Regional Languages Dropdown */}
              <ImmersiveReaderControls
                currentLanguage={currentLanguage}
                onLanguageChange={setCurrentLanguage}
                activeReadingId={activeReadingId}
                onReadingChange={setActiveReadingId}
                formData={formData as unknown as Record<string, unknown>}
                hasSavedSignature={hasSavedSignature}
              />

              <div className="flex items-center space-x-1 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">ID</span>
                <span className="font-bold text-slate-900">{formData.artNumber || 'Pending'}</span>
              </div>
            </div>
          </div>

          {/* Quick Jump Bar */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
            <span className="text-slate-400 font-bold uppercase text-[10px] mr-1">Quick Jump:</span>
            {[
              { id: 'sec-consent', label: `1. ${t('sec_consent', currentLanguage)}` },
              { id: 'sec-child', label: `2. ${t('sec_demographics', currentLanguage)}` },
              { id: 'sec-banking', label: `3. ${t('sec_banking', currentLanguage)}` },
              { id: 'sec-household', label: `4. ${t('sec_household', currentLanguage)}` },
              { id: 'sec-health', label: `5. ${t('sec_clinical', currentLanguage)}` },
              { id: 'sec-nutrition', label: `6. ${t('sec_nutrition', currentLanguage)}` },
              { id: 'sec-education', label: `7. ${t('sec_education', currentLanguage)}` },
              { id: 'sec-expenses', label: `8. ${t('sec_expenses', currentLanguage)}` },
              { id: 'sec-review', label: `9. ${t('sec_review', currentLanguage)}` },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => scrollToSection(btn.id)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-purple-50 hover:text-purple-950 border border-black text-slate-800 transition-colors font-medium text-[11px]"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Global Error Notice */}
        {formError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-xs">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Please correct the following before submitting:</p>
              <p className="mt-1">{formError}</p>
            </div>
          </div>
        )}

        {/* Unified Single Survey Entity Container (Zero Gaps) */}
        <div className="flex flex-col gap-3">
          {/* SECTION 1: Caregiver Consent & Signature Gate */}
        <section id="sec-consent" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.consent.bg}`} style={{"--neon-mid":SC.consent.neonMid,"--neon-far":SC.consent.neonFar,"--neon-border":SC.consent.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="01" title={t('sec_consent', currentLanguage)} colorScheme={SC.consent} />
          
          <ConsentAudioNotice
            currentLanguage={currentLanguage}
            agreeToParticipate={formData.agreeToParticipate}
            onConsentDecision={(agreed) => setFormData({ ...formData, agreeToParticipate: agreed })}
            renderHeader={(audioButton) => (
              <SectionHeader
                prefix="Caregiver's "
                emphasis="agreement"
                suffix=" to participate"
                emphasisColor="text-rose-600"
                borderColor="border-rose-100/80"
                eyebrowColor="text-rose-400/90"
                action={audioButton}
              />
            )}
          />

          <div className="space-y-4">

            {/* Consent Decision */}
            <div
              id="q-consent-decision"
              className={`p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2 ${getHighlightClass(
                'q-consent-decision'
              )}`}
            >
              <label className="text-[11.5px] font-bold tracking-wider text-slate-900 uppercase block">
                {t('consent_q', currentLanguage)}
              </label>

              <div className="flex items-center space-x-3 pt-0.5">
                <label
                  className={`flex items-center space-x-2.5 h-11 px-4 rounded-xl border cursor-pointer transition-all shadow-2xs ${
                    formData.agreeToParticipate === true
                      ? 'bg-purple-50/80 border-purple-500 text-purple-950 font-bold ring-2 ring-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                      : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="agreeToParticipate"
                    checked={formData.agreeToParticipate === true}
                    onChange={() => setFormData({ ...formData, agreeToParticipate: true })}
                    className="accent-purple-600 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-xs font-semibold">{t('consent_yes', currentLanguage)}</span>
                </label>

                <label
                  className={`flex items-center space-x-2.5 h-11 px-4 rounded-xl border cursor-pointer transition-all shadow-2xs ${
                    formData.agreeToParticipate === false
                      ? 'bg-rose-50 border-rose-500 text-rose-950 font-bold'
                      : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="agreeToParticipate"
                    checked={formData.agreeToParticipate === false}
                    onChange={() => setFormData({ ...formData, agreeToParticipate: false })}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-xs font-semibold">{t('consent_no', currentLanguage)}</span>
                </label>
              </div>
            </div>

            {/* Caregiver Details Required for Consent & Signing */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div id="q-caregiver-name" className={getHighlightClass('q-caregiver-name')}>
                <Input
                  label={t('caregiver_name', currentLanguage)}
                  required
                  value={formData.caregiverName}
                  onChange={(e) => setFormData({ ...formData, caregiverName: e.target.value })}
                  placeholder="e.g. Meena Sharma"
                />
              </div>

              <div
                id="q-caregiver-rel"
                className={`flex flex-col space-y-1.5 ${getHighlightClass('q-caregiver-rel')}`}
              >
                <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                  {t('caregiver_relationship', currentLanguage)} <span className="text-rose-500 ml-0.5">*</span>
                </label>
                <select
                  value={formData.caregiverRelationship}
                  onChange={(e) =>
                    setFormData({ ...formData, caregiverRelationship: e.target.value as CaregiverRelationship })
                  }
                  className="w-full h-11 px-3 text-sm font-medium text-slate-900 bg-white border border-black hover:border-black focus:border-purple-600 focus:ring-2 focus:ring-purple-400/40 focus:shadow-[0_0_10px_rgba(168,85,247,0.2)] rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer"
                >
                  {['Mother', 'Father', 'Grandparent', 'Legal Guardian', 'Other'].map((rel) => (
                    <option key={rel} value={rel}>
                      {rel}
                    </option>
                  ))}
                </select>
              </div>

              <div id="q-caregiver-contact" className={getHighlightClass('q-caregiver-contact')}>
                <Input
                  label={t('caregiver_contact', currentLanguage)}
                  type="tel"
                  required
                  maxLength={10}
                  value={formData.contactNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, contactNumber: e.target.value.replace(/\D/g, '') })
                  }
                  placeholder="e.g. 9822012345"
                />
              </div>
            </div>

            {/* Signature Pad or Refusal Alert */}
            <div id="q-caregiver-sig" className={getHighlightClass('q-caregiver-sig')}>
              {formData.agreeToParticipate ? (
                <div className="pt-0.5">
                  <CaregiverSignaturePad
                    submissionUuid={clientUuid}
                    caregiverName={formData.caregiverName || 'Caregiver'}
                    caregiverRelationship={formData.caregiverRelationship || 'Mother'}
                    onSignatureSaved={(blob) => setHasSavedSignature(!!blob)}
                  />
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-3">
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                  <div>
                    <p className="font-bold text-sm">Consent Not Granted</p>
                    <p className="mt-0.5 text-rose-700">
                      Under Alliance India child safeguarding protocols, intake cannot proceed without informed caregiver consent.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2: Child Demographics & Residence */}
        <section id="sec-child" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.demo.bg}`} style={{"--neon-mid":SC.demo.neonMid,"--neon-far":SC.demo.neonFar,"--neon-border":SC.demo.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="02" title={t('sec_demographics', currentLanguage)} colorScheme={SC.demo} />
          <SectionHeader prefix="Who is the " emphasis="child" suffix=" we're supporting" emphasisColor="text-indigo-600" borderColor="border-indigo-100/80" eyebrowColor="text-indigo-400/90" />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* System Generated Unique ID Display: Unique ID directly in place of NACO REGISTRY */}
            <div className="p-3 bg-purple-50/60 border border-purple-200/80 rounded-xl sm:col-span-2 md:col-span-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
              <div className="flex items-center space-x-2.5">
                <span className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                  {t('uid_label', currentLanguage)}
                </span>
                <span className="px-3 py-1 text-xs font-mono font-bold bg-slate-900 text-white rounded-md tracking-wider shadow-xs">
                  {formData.artNumber || 'Generating...'}
                </span>
              </div>
            </div>

            <div id="q-child-date">
              <Input
                label="Date of Intake Visit *"
                type="date"
                required
                value={formData.dateOfFilling}
                onChange={(e) => setFormData({ ...formData, dateOfFilling: e.target.value })}
              />
            </div>

            <div id="q-child-name" className={getHighlightClass('q-child-name')}>
              <Input
                label={t('child_name', currentLanguage)}
                required
                value={formData.childName}
                onChange={(e) => setFormData({ ...formData, childName: e.target.value })}
                placeholder="e.g. Aarav Sharma"
              />
            </div>

            <div id="q-child-dob">
              <Input
                label={t('dob', currentLanguage)}
                type="date"
                required
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
              />
            </div>

            <div id="q-child-gender" className={`space-y-1.5 ${getHighlightClass('q-child-gender')}`}>
              <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                {t('gender', currentLanguage)} <span className="text-rose-500 ml-0.5">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Male', 'Female', 'Other'] as Gender[]).map((g) => (
                  <label
                    key={g}
                    className={`flex items-center justify-center space-x-1.5 h-11 px-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all shadow-2xs ${
                      formData.gender === g
                        ? 'bg-purple-50/80 border-purple-500 text-purple-950 font-bold ring-2 ring-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                        : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={formData.gender === g}
                      onChange={() => setFormData({ ...formData, gender: g })}
                      className="accent-purple-600 text-purple-600 focus:ring-purple-500 shrink-0"
                    />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </div>

            <div
              id="q-child-orphan"
              className={`space-y-1.5 sm:col-span-2 ${getHighlightClass('q-child-orphan')}`}
            >
              <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                {t('orphan_status', currentLanguage)} <span className="text-rose-500 ml-0.5">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ORPHAN_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    title={opt.tooltip}
                    className={`group relative flex items-center space-x-2 h-11 px-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all shadow-2xs ${
                      formData.orphanStatus === opt.value
                        ? 'bg-purple-50/80 border-purple-500 text-purple-950 font-bold ring-2 ring-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                        : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="orphanStatus"
                      value={opt.value}
                      checked={formData.orphanStatus === opt.value}
                      onChange={() => setFormData({ ...formData, orphanStatus: opt.value })}
                      className="accent-purple-600 text-purple-600 focus:ring-purple-500 shrink-0"
                    />
                    <span className="truncate">{opt.label}</span>

                    {opt.tooltip && opt.tooltip !== opt.label && (
                      <>
                        <span className="ml-auto inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 group-hover:bg-purple-100 text-slate-400 group-hover:text-purple-700 text-[10px] font-bold transition-colors shrink-0">
                          ?
                        </span>
                        {/* Hover Tooltip Popup */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex items-center px-2.5 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-lg whitespace-nowrap z-30 pointer-events-none animate-in fade-in duration-200">
                          <span>{opt.tooltip}</span>
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                        </div>
                      </>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <Input
              label="Child Aadhaar Number"
              type="text"
              maxLength={12}
              value={formData.childAadhaarNumber}
              onChange={(e) =>
                setFormData({ ...formData, childAadhaarNumber: e.target.value.replace(/\D/g, '') })
              }
              placeholder="e.g. 123456789012"
            />

            <div id="q-child-address" className={`sm:col-span-2 ${getHighlightClass('q-child-address')}`}>
              <Input
                label={t('address', currentLanguage)}
                value={formData.fullAddress}
                onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                placeholder="e.g. Room 4, Shanti Nagar, Near ZP School"
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                {t('state', currentLanguage)} <span className="text-rose-500 ml-0.5">*</span>
              </label>
              <select
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full h-11 px-3 text-sm font-medium text-slate-900 bg-white border border-black hover:border-black focus:border-purple-600 focus:ring-2 focus:ring-purple-400/40 focus:shadow-[0_0_10px_rgba(168,85,247,0.2)] rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer"
              >
                {INDIAN_STATES_AND_UTS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label={t('district', currentLanguage)}
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
              placeholder="e.g. Pune"
            />

            <div className="flex flex-col justify-end">
              <LocationFetchButton
                onLocationFetched={(loc) => setFormData((prev) => ({
                  ...prev,
                  fullAddress: loc.fullAddress || prev.fullAddress,
                  state: loc.state || prev.state,
                  district: loc.district || prev.district,
                }))}
              />
            </div>
          </div>
        </section>

        {/* SECTION 3: Banking & Identification (KYC) Details */}
        <section id="sec-banking" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.banking.bg}`} style={{"--neon-mid":SC.banking.neonMid,"--neon-far":SC.banking.neonFar,"--neon-border":SC.banking.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="03" title={t('sec_banking', currentLanguage)} colorScheme={SC.banking} />
          <SectionHeader prefix="Secure " emphasis="banking" suffix=" & payment details" emphasisColor="text-amber-600" borderColor="border-amber-100/80" eyebrowColor="text-amber-500/90" />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div id="q-bank-holder" className={`sm:col-span-2 ${getHighlightClass('q-bank-holder')}`}>
              <Input
                label={t('bank_acc_holder', currentLanguage)}
                value={formData.bankAccountHolderName}
                onChange={(e) => setFormData({ ...formData, bankAccountHolderName: e.target.value })}
                placeholder="Name as printed in passbook"
              />
            </div>

            <div id="q-bank-num" className={`sm:col-span-2 ${getHighlightClass('q-bank-num')}`}>
              <Input
                label={t('bank_acc_num', currentLanguage)}
                value={formData.bankAccountNumber}
                onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                placeholder="e.g. 10023456789"
              />
            </div>

            <div id="q-bank-ifsc" className={`sm:col-span-2 ${getHighlightClass('q-bank-ifsc')}`}>
              <Input
                label={t('bank_ifsc', currentLanguage)}
                value={formData.bankIfscCode}
                onChange={(e) => setFormData({ ...formData, bankIfscCode: e.target.value.toUpperCase() })}
                placeholder="e.g. SBIN0001234"
              />
            </div>

            <div className="sm:col-span-2">
              <Input
                label="BANK LINKED MOBILE NUMBER"
                type="tel"
                maxLength={10}
                value={formData.bankLinkedMobileNumber}
                onChange={(e) =>
                  setFormData({ ...formData, bankLinkedMobileNumber: e.target.value.replace(/\D/g, '') })
                }
                placeholder="e.g. 9822012345"
              />
            </div>
          </div>

          {/* Verification Photo Attachments */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PhotoUpload
              label="PASSBOOK FRONT PAGE PHOTO"
              value={formData.passbookPhotoUrl}
              onChange={(url) => setFormData((prev) => ({ ...prev, passbookPhotoUrl: url || '' }))}
            />

            <PhotoUpload
              label="AADHAAR CARD PHOTO"
              value={formData.aadhaarCardPhotoUrl}
              onChange={(url) => setFormData((prev) => ({ ...prev, aadhaarCardPhotoUrl: url || '' }))}
            />

            <PhotoUpload
              label="PASSPORT SIZE PHOTO"
              value={formData.childPhotoUrl}
              onChange={(url) => setFormData((prev) => ({ ...prev, childPhotoUrl: url || '' }))}
            />
          </div>
        </section>

        {/* SECTION 4: Household & Financial Details */}
        <section id="sec-household" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.household.bg}`} style={{"--neon-mid":SC.household.neonMid,"--neon-far":SC.household.neonFar,"--neon-border":SC.household.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="04" title={t('sec_household', currentLanguage)} colorScheme={SC.household} />
          <SectionHeader prefix="Family " emphasis="background" suffix=" & income" emphasisColor="text-teal-600" borderColor="border-teal-100/80" eyebrowColor="text-teal-500/90" />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div id="q-hh-members" className={getHighlightClass('q-hh-members')}>
              <Input
                label={t('hh_members', currentLanguage)}
                type="number"
                min="1"
                required
                value={formData.totalFamilyMembers || ''}
                onChange={(e) =>
                  setFormData({ ...formData, totalFamilyMembers: e.target.value === '' ? ('' as any) : Number(e.target.value) })
                }
                placeholder="e.g. 4"
              />
            </div>

            <div id="q-hh-children" className={getHighlightClass('q-hh-children')}>
              <Input
                label={t('hh_children', currentLanguage)}
                type="number"
                min="0"
                required
                value={
                  (formData.numberOfChildrenUnder18 as any) !== '' &&
                  formData.numberOfChildrenUnder18 !== undefined &&
                  formData.numberOfChildrenUnder18 !== null
                    ? formData.numberOfChildrenUnder18
                    : ''
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    numberOfChildrenUnder18: e.target.value === '' ? ('' as any) : Number(e.target.value),
                  })
                }
                placeholder="e.g. 2"
              />
            </div>

            <div id="q-hh-income" className={getHighlightClass('q-hh-income')}>
              <Input
                label={t('hh_income', currentLanguage)}
                type="number"
                min="0"
                required
                value={formData.monthlyIncomeRs || ''}
                onChange={(e) =>
                  setFormData({ ...formData, monthlyIncomeRs: e.target.value === '' ? ('' as any) : Number(e.target.value) })
                }
                placeholder="e.g. 12000"
                unit="₹"
              />
            </div>

            <div id="q-hh-source" className={`flex flex-col space-y-1.5 ${getHighlightClass('q-hh-source')}`}>
              <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                {t('hh_income_source', currentLanguage)} <span className="text-rose-500 ml-0.5">*</span>
              </label>
              <select
                value={formData.mainSourceOfIncome}
                onChange={(e) =>
                  setFormData({ ...formData, mainSourceOfIncome: e.target.value as MainSourceOfIncome })
                }
                className="w-full h-11 px-3 text-sm font-medium text-slate-900 bg-white border border-black hover:border-black focus:border-purple-600 focus:ring-2 focus:ring-purple-400/40 focus:shadow-[0_0_10px_rgba(168,85,247,0.2)] rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer"
              >
                {[
                  'Daily wage labour',
                  'Salaried employment',
                  'Self-employed',
                  'Pension / Government support',
                  'No regular income',
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* SECTION 5: Health, Clinical, ART & Viral Load */}
        <section id="sec-health" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.clinical.bg}`} style={{"--neon-mid":SC.clinical.neonMid,"--neon-far":SC.clinical.neonFar,"--neon-border":SC.clinical.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="05" title={t('sec_clinical', currentLanguage)} colorScheme={SC.clinical} />
          <SectionHeader prefix="Clinical " emphasis="health" suffix=" measurements" emphasisColor="text-sky-600" borderColor="border-sky-100/80" eyebrowColor="text-sky-500/90" />

          <div className="space-y-4">
            {/* Sub-Card 1: Anthropometry & Growth (WHO Standards) */}
            {/* Sub-Card 1: Growth & Measurements */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-sky-200/90 p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-sky-100 pb-2.5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Child Growth &amp; Nutrition Assessment
                    </h4>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-stretch">
                <div id="q-cli-weight" className={getHighlightClass('q-cli-weight')}>
                  <Input
                    label={t('weight', currentLanguage)}
                    type="number"
                    step="0.1"
                    min="2"
                    max="150"
                    required
                    value={formData.weightKg ? formData.weightKg : ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        weightKg: e.target.value === '' ? ('' as any) : Number(e.target.value),
                      })
                    }
                    placeholder="e.g. 14.5"
                    unit="kg"
                  />
                </div>

                <div id="q-cli-height" className={getHighlightClass('q-cli-height')}>
                  <Input
                    label={t('height', currentLanguage)}
                    type="number"
                    step="0.1"
                    min="40"
                    max="220"
                    required
                    value={formData.heightCm ? formData.heightCm : ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        heightCm: e.target.value === '' ? ('' as any) : Number(e.target.value),
                      })
                    }
                    placeholder="e.g. 98.0"
                    unit="cm"
                  />
                </div>

                {/* BMI Interactive Metric Tile */}
                <div
                  id="q-cli-bmi"
                  className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all shadow-2xs ${
                    bmiValue > 0
                      ? bmiCategory === 'Normal'
                        ? 'bg-emerald-50/90 border-emerald-300 shadow-[0_0_12px_rgba(160,185,129,0.18)]'
                        : bmiCategory.includes('Underweight')
                        ? 'bg-rose-50/90 border-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.18)]'
                        : 'bg-amber-50/90 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.18)]'
                      : 'bg-slate-50/90 border-slate-200'
                  } ${getHighlightClass('q-cli-bmi')}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-wider text-slate-600">
                      {t('bmi', currentLanguage)}
                    </span>
                    {bmiValue > 0 ? (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          bmiCategory === 'Normal'
                            ? 'bg-emerald-200/80 text-emerald-900'
                            : bmiCategory === 'Severe Underweight'
                            ? 'bg-rose-200/80 text-rose-900 animate-pulse'
                            : 'bg-amber-200/80 text-amber-900'
                        }`}
                      >
                        {bmiCategory}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">Awaiting inputs</span>
                    )}
                  </div>

                  <div className="my-1 flex items-baseline gap-1.5">
                    {bmiValue > 0 ? (
                      <>
                        <span className="text-2xl font-black font-mono tracking-tight text-slate-900">
                          {bmiValue}
                        </span>
                        <span className="text-xs font-bold text-slate-500">kg/m²</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium italic">
                        Enter weight &amp; height
                      </span>
                    )}
                  </div>

                  <div className="w-full">
                    <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden flex">
                      <div className="w-1/3 bg-rose-400 h-full opacity-60" title="Underweight (<15)" />
                      <div className="w-1/2 bg-emerald-500 h-full opacity-70" title="Normal (15-22)" />
                      <div className="w-1/6 bg-amber-400 h-full opacity-60" title="Overweight (>22)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Card 2: Antiretroviral Therapy (ART) Care */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-indigo-200/90 p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Pill className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      HIV Care &amp; Treatment Details
                    </h4>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col space-y-1.5">
                  <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                    ART STATUS <span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <select
                    value={formData.artStatus}
                    onChange={(e) => setFormData({ ...formData, artStatus: e.target.value as ARTStatus })}
                    className="w-full h-11 px-3 text-sm font-medium text-slate-900 bg-white border border-black hover:border-black focus:border-purple-600 focus:ring-2 focus:ring-purple-400/40 focus:shadow-[0_0_10px_rgba(168,85,247,0.2)] rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer"
                  >
                    {['On ART', 'Not on ART', 'Defaulted / Interrupted', 'Transferred In'].map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div id="q-cli-art-num" className={getHighlightClass('q-cli-art-num')}>
                  <Input
                    label={t('art_num', currentLanguage)}
                    required
                    value={formData.artIdNumber}
                    onChange={(e) => setFormData({ ...formData, artIdNumber: e.target.value })}
                    placeholder="e.g. MH-PUN-00123"
                  />
                </div>

                <Input
                  label="ART REGISTRATION DATE"
                  type="date"
                  value={formData.artRegistrationDate}
                  onChange={(e) => setFormData({ ...formData, artRegistrationDate: e.target.value })}
                />
              </div>
            </div>

            {/* Sub-Card 3: Diagnostics Lab Monitoring (Hb & Viral Load) */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-purple-200/90 p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-purple-100 pb-2.5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Microscope className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Blood Tests &amp; Lab Reports
                    </h4>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Part A: Hemoglobin & Anemia Staging */}
                <div className="p-4 rounded-xl border border-purple-100 bg-purple-50/30 space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-purple-600" />
                      Hemoglobin (Hb) Anemia Screening
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        formData.haemoglobinGdl
                          ? hbCategory === 'Normal'
                            ? 'bg-emerald-100 text-emerald-800'
                            : hbCategory === 'Severe Anemia'
                            ? 'bg-rose-100 text-rose-800 font-black animate-pulse'
                            : 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {formData.haemoglobinGdl ? hbCategory : 'Not Tested'}
                    </span>
                  </div>

                  <Input
                    label="HEMOGLOBIN (G/DL)"
                    type="number"
                    step="0.1"
                    min="2"
                    max="25"
                    value={formData.haemoglobinGdl}
                    onChange={(e) => setFormData({ ...formData, haemoglobinGdl: e.target.value })}
                    placeholder="e.g. 11.2"
                    unit="g/dL"
                  />

                  <p className="text-[11px] text-slate-500 leading-tight">
                    {formData.haemoglobinGdl ? (
                      Number(formData.haemoglobinGdl) < 7.0 ? (
                        <span className="text-rose-600 font-bold">🚨 Severe anemia detected (&lt; 7.0 g/dL). Urgent pediatric clinical referral recommended.</span>
                      ) : Number(formData.haemoglobinGdl) < 11.0 ? (
                        <span className="text-amber-700 font-medium">⚠️ Mild/Moderate anemia. Nutritional iron supplementation and diet tracking recommended.</span>
                      ) : (
                        <span className="text-emerald-700 font-medium">✓ Hemoglobin within normal pediatric reference range (≥ 11.0 g/dL).</span>
                      )
                    ) : (
                      'Record recent clinical lab test result. Normal threshold is ≥ 11.0 g/dL.'
                    )}
                  </p>
                </div>

                {/* Part B: Viral Load & Suppression */}
                <div className="p-4 rounded-xl border border-purple-100 bg-purple-50/30 space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                      <HeartPulse className="w-3.5 h-3.5 text-purple-600" />
                      Viral Load (VL) &amp; Suppression
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        vlCategory.includes('Undetectable') || vlCategory.includes('Suppressed')
                          ? 'bg-emerald-100 text-emerald-800'
                          : vlCategory.includes('Unsuppressed')
                          ? 'bg-rose-100 text-rose-800 font-black animate-pulse'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {vlCategory}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex flex-col space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                        VL STATUS <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <select
                        value={formData.vlStatus}
                        onChange={(e) => setFormData({ ...formData, vlStatus: e.target.value as VLStatus })}
                        className="w-full h-11 px-2.5 text-xs font-medium text-slate-900 bg-white border border-black rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                      >
                        {[
                          'Tested in last 6 months',
                          'Tested > 6 months ago',
                          'Awaiting results',
                          'Not tested',
                        ].map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Input
                      label="VL TEST DATE"
                      type="date"
                      value={formData.vlDate}
                      onChange={(e) => setFormData({ ...formData, vlDate: e.target.value })}
                    />
                  </div>

                  <div id="q-cli-vl" className={getHighlightClass('q-cli-vl')}>
                    <Input
                      label={t('viral_load', currentLanguage)}
                      value={formData.viralLoad}
                      onChange={(e) => setFormData({ ...formData, viralLoad: e.target.value })}
                      placeholder="e.g. < 50 or 450"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Card 4: Comorbidities & Co-infections */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Active Co-Morbidities &amp; Health Conditions
                </h4>
                <p className="text-[11px] text-slate-500">Select all confirmed conditions requiring clinical management</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  'TB (Tuberculosis)',
                  'Hepatitis B',
                  'Hepatitis C',
                  'Any Other Health Condition (specify)',
                ].map((cond) => {
                  const isChecked = formData.otherHealthConditions.includes(cond);
                  return (
                    <label
                      key={cond}
                      className={`flex items-center space-x-2.5 h-11 px-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all shadow-2xs ${
                        isChecked
                          ? 'bg-purple-50 border-purple-500 text-purple-950 font-bold ring-2 ring-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                          : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              otherHealthConditions: [...formData.otherHealthConditions, cond],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              otherHealthConditions: formData.otherHealthConditions.filter(
                                (c) => c !== cond
                              ),
                            });
                          }
                        }}
                        className="rounded accent-purple-600 text-purple-600 focus:ring-purple-500 shrink-0"
                      />
                      <span className="truncate">{cond}</span>
                    </label>
                  );
                })}
              </div>

              {formData.otherHealthConditions.includes('Any Other Health Condition (specify)') && (
                <div className="pt-1">
                  <Input
                    label="OTHER HEALTH CONDITION (PLEASE SPECIFY)"
                    value={formData.otherHealthConditionSpecify}
                    onChange={(e) =>
                      setFormData({ ...formData, otherHealthConditionSpecify: e.target.value })
                    }
                    placeholder="e.g. Asthma, Skin allergy"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 6: Nutrition Habits */}
        <section id="sec-nutrition" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.nutrition.bg}`} style={{"--neon-mid":SC.nutrition.neonMid,"--neon-far":SC.nutrition.neonFar,"--neon-border":SC.nutrition.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="06" title={t('sec_nutrition', currentLanguage)} colorScheme={SC.nutrition} />
          <SectionHeader prefix="Nutrition " emphasis="appetite" suffix=" & eating habits" emphasisColor="text-lime-700" borderColor="border-lime-100/80" eyebrowColor="text-lime-600/90" />

          <div className="pt-1">
            <AnimatedAppetiteSelector
              appetite={formData.appetite}
              mealsPerDay={formData.mealsPerDay}
              onAppetiteChange={(app) => setFormData((prev) => ({ ...prev, appetite: app }))}
              onMealsChange={(m) => setFormData((prev) => ({ ...prev, mealsPerDay: m }))}
              labels={{
                appetiteTitle: t('appetite', currentLanguage),
                mealsTitle: t('meals_per_day', currentLanguage),
              }}
              highlightAppetiteClass={getHighlightClass('q-nut-appetite')}
              highlightMealsClass={getHighlightClass('q-nut-meals')}
            />
          </div>
        </section>

        {/* SECTION 7: Education Status */}
        <section id="sec-education" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.education.bg}`} style={{"--neon-mid":SC.education.neonMid,"--neon-far":SC.education.neonFar,"--neon-border":SC.education.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="07" title={t('sec_education', currentLanguage)} colorScheme={SC.education} />
          <SectionHeader prefix="Child's " emphasis="learning" suffix=" & school status" emphasisColor="text-violet-600" borderColor="border-violet-100/80" eyebrowColor="text-violet-400/90" />

          <div className="space-y-4">
            <div id="q-edu-status" className={`space-y-1.5 ${getHighlightClass('q-edu-status')}`}>
              <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                {t('edu_status', currentLanguage)} <span className="text-rose-500 ml-0.5">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  'Currently going to school',
                  'Dropped out of school',
                  'Never enrolled in school',
                  'Completed schooling',
                  'Other',
                ].map((st) => (
                  <label
                    key={st}
                    className={`flex items-center space-x-2.5 h-11 px-3 rounded-xl border cursor-pointer transition-all shadow-2xs ${
                      formData.educationStatus === st
                        ? 'bg-purple-50/80 border-purple-500 text-purple-950 font-bold ring-2 ring-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                        : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="educationStatus"
                      value={st}
                      checked={formData.educationStatus === st}
                      onChange={() =>
                        setFormData({ ...formData, educationStatus: st as EducationStatus })
                      }
                      className="accent-purple-600 text-purple-600 focus:ring-purple-500 shrink-0"
                    />
                    <span className="text-xs font-semibold">{st}</span>
                  </label>
                ))}
              </div>
            </div>

            {formData.educationStatus === 'Other' && (
              <Input
                label="EDUCATION STATUS OTHER (PLEASE SPECIFY)"
                value={formData.educationStatusSpecify}
                onChange={(e) => setFormData({ ...formData, educationStatusSpecify: e.target.value })}
              />
            )}

            {formData.educationStatus === 'Currently going to school' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1">
                <div id="q-edu-school" className={`sm:col-span-2 ${getHighlightClass('q-edu-school')}`}>
                  <Input
                    label={t('school_name', currentLanguage)}
                    value={formData.schoolName}
                    onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                    placeholder="e.g. Pune Zilla Parishad Primary School"
                  />
                </div>

                <Input
                  label="SCHOOL SESSION START DATE"
                  type="date"
                  value={formData.schoolSessionStartDate}
                  onChange={(e) =>
                    setFormData({ ...formData, schoolSessionStartDate: e.target.value })
                  }
                />

                <div className="flex flex-col space-y-1.5">
                  <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                    {t('school_type', currentLanguage)}
                  </label>
                  <select
                    value={formData.schoolType}
                    onChange={(e) => setFormData({ ...formData, schoolType: e.target.value as SchoolType })}
                    className="w-full h-11 px-3 text-sm font-medium text-slate-900 bg-white border border-black hover:border-black focus:border-purple-600 focus:ring-2 focus:ring-purple-400/40 focus:shadow-[0_0_10px_rgba(168,85,247,0.2)] rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer"
                  >
                    {['Government school', 'Private school', 'Aided school'].map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div id="q-edu-class" className={getHighlightClass('q-edu-class')}>
                  <Input
                    label={t('current_class', currentLanguage)}
                    value={formData.currentClass}
                    onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-3 space-y-1.5">
                  <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
                    {t('attendance', currentLanguage)}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Regular', 'Irregular', 'Dropped out'] as AttendanceType[]).map((att) => (
                      <label
                        key={att}
                        className={`flex items-center justify-center space-x-1.5 h-11 px-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all shadow-2xs ${
                          formData.attendance === att
                            ? 'bg-purple-50/80 border-purple-500 text-purple-950 font-bold ring-2 ring-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                            : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="attendance"
                          value={att}
                          checked={formData.attendance === att}
                          onChange={() => setFormData({ ...formData, attendance: att })}
                          className="accent-purple-600 text-purple-600 focus:ring-purple-500 shrink-0"
                        />
                        <span>{att}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 8: Expenses & Programme Support */}
        <section id="sec-expenses" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.expenses.bg}`} style={{"--neon-mid":SC.expenses.neonMid,"--neon-far":SC.expenses.neonFar,"--neon-border":SC.expenses.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="08" title={t('sec_expenses', currentLanguage)} colorScheme={SC.expenses} />
          <SectionHeader prefix="Programme " emphasis="expenses" suffix=" & required support" emphasisColor="text-orange-600" borderColor="border-orange-100/80" eyebrowColor="text-orange-500/90" />

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
                requiredTuitionFees: formData.requiredTuitionFees,
              requiredBooks: formData.requiredBooks,
              requiredStationery: formData.requiredStationery,
              requiredUniform: formData.requiredUniform,
              requiredTransport: formData.requiredTransport,
              requiredOtherSupport: formData.requiredOtherSupport,
            }}
            onCurrentExpenseChange={(field, val) => setFormData((prev) => ({ ...prev, [field]: val }))}
            onRequiredSupportChange={(field, val) => setFormData((prev) => ({ ...prev, [field]: val }))}
            onReceiptPhotoChange={(url) =>
              setFormData((prev) => ({ ...prev, feeReceiptPhotoUrl: url || '' }))
            }
            onMarksheetPhotoChange={(url) =>
              setFormData((prev) => ({ ...prev, marksheetPhotoUrl: url || '' }))
            }
            onRemarksChange={(rem) => setFormData((prev) => ({ ...prev, remarks: rem }))}
          />
        </section>

        {/* SECTION 9: Programme Approval & Final Review */}
        <section id="sec-review" className={`neon-section relative pt-2.5 sm:pt-3 px-4 sm:px-6 pb-5 sm:pb-6 pr-11 sm:pr-13 space-y-4 scroll-mt-20 ${SC.review.bg}`} style={{"--neon-mid":SC.review.neonMid,"--neon-far":SC.review.neonFar,"--neon-border":SC.review.neonBorder} as React.CSSProperties}>
          <SectionVerticalTitle number="09" title={t('sec_review', currentLanguage)} colorScheme={SC.review} />
          <SectionHeader prefix="Verify & " emphasis="submit" suffix=" this assessment" emphasisColor="text-emerald-700" borderColor="border-emerald-100/80" eyebrowColor="text-emerald-500/90" />

          <div className="space-y-4">
            {/* Caseworker Attestation & Verification Confirmation */}
            <div
              id="q-rev-confirm"
              className={`p-4 rounded-xl border transition-all ${
                formData.allInfoCorrect === true
                  ? 'bg-emerald-50/70 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : formData.allInfoCorrect === false
                  ? 'bg-rose-50/70 border-rose-300'
                  : 'bg-white/80 border-slate-200'
              } ${getHighlightClass('q-rev-confirm')}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-800 block">
                    {t('review_confirmed', currentLanguage)} <span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    I confirm that all entered details and documents have been checked and verified for accuracy.
                  </p>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <label
                    className={`flex items-center space-x-2.5 h-11 px-4 rounded-xl border cursor-pointer transition-all shadow-2xs ${
                      formData.allInfoCorrect === true
                        ? 'bg-emerald-600 border-emerald-700 text-white font-bold ring-2 ring-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                        : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="allInfoCorrect"
                      checked={formData.allInfoCorrect === true}
                      onChange={() => setFormData({ ...formData, allInfoCorrect: true })}
                      className="accent-emerald-600 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-semibold">{t('review_yes', currentLanguage)}</span>
                  </label>

                  <label
                    className={`flex items-center space-x-2.5 h-11 px-4 rounded-xl border cursor-pointer transition-all shadow-2xs ${
                      formData.allInfoCorrect === false
                        ? 'bg-rose-600 border-rose-700 text-white font-bold ring-2 ring-rose-400/50 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                        : 'bg-white border-black text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="allInfoCorrect"
                      checked={formData.allInfoCorrect === false}
                      onChange={() => setFormData({ ...formData, allInfoCorrect: false })}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-xs font-semibold">{t('review_no', currentLanguage)}</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Submitter Credentials in 3 balanced columns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div id="q-rev-interviewer" className={getHighlightClass('q-rev-interviewer')}>
                <Input
                  id="formSubmittedBy"
                  name="formSubmittedBy"
                  label={t('interviewer_name', currentLanguage)}
                  required
                  value={formData.formSubmittedBy}
                  onChange={(e) => setFormData({ ...formData, formSubmittedBy: e.target.value })}
                  placeholder="Your full name"
                />
              </div>

              <Input
                label={t('org_name', currentLanguage)}
                value={formData.organizationName}
                onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                placeholder="India HIV/AIDS Alliance"
              />

              <Input
                label={t('org_email', currentLanguage)}
                type="email"
                value={formData.organizationEmail}
                onChange={(e) => setFormData({ ...formData, organizationEmail: e.target.value })}
                placeholder="fieldworker@allianceindia.org"
              />
            </div>
          </div>
        </section>
        </div>

        {/* Sticky Floating Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3 text-xs w-full sm:w-auto justify-between sm:justify-start">
              <span className="font-mono font-bold text-purple-950">{formData.artNumber}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600">
                Grant: <strong className="text-purple-950 font-bold">₹{totalRequiredSupport}</strong>
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600">
                Signature:{' '}
                {hasSavedSignature ? (
                  <strong className="text-emerald-700">Captured</strong>
                ) : (
                  <strong className="text-amber-700">Pending</strong>
                )}
              </span>
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleManualSaveDraft}
                className="w-full sm:w-auto touch-target min-h-[44px]"
              >
                <Save className="h-4 w-4 mr-1.5" />
                <span>{t('save_draft', currentLanguage)}</span>
              </Button>

              <Button
                type="button"
                variant="primary"
                size="sm"
                id="btn-submit-survey"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                className="w-full sm:w-auto bg-purple-700 hover:bg-purple-800 text-white shadow-xs font-bold touch-target min-h-[44px]"
              >
                <Send className="h-4 w-4 mr-1.5" />
                <span>{t('submit_survey', currentLanguage)}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
