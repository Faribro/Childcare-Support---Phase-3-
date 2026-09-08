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
import { getDraftByAnyId, saveDraft } from '@/lib/db/draftRepository';
import { enqueueSubmission } from '@/lib/db/syncQueueRepository';
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
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State strictly covering all 73 official linelist & Sheet fields
  const [formData, setFormData] = useState({
    // Section 1: Child & Caregiver Details
    artNumber: '',
    koboId: '',
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
    childAadhaarNumber: '',

    // Section 2: Consent
    agreeToParticipate: true,

    // Section 3: Banking & Identification (KYC) Details
    bankAccountHolderName: '',
    bankAccountNumber: '',
    bankIfscCode: '',
    bankLinkedMobileNumber: '',
    passbookPhotoUrl: '',
    aadhaarCardPhotoUrl: '',
    childPhotoUrl: '',

    // Section 4: Household & Financial Details
    totalFamilyMembers: 4,
    numberOfChildrenUnder18: 2,
    monthlyIncomeRs: 5000,
    mainSourceOfIncome: 'Daily wage labour' as MainSourceOfIncome,

    // Section 5: Health, Clinical, ART & Viral Load
    weightKg: 14.5,
    heightCm: 100,
    haemoglobinGdl: '',
    otherHealthConditions: [] as string[],
    otherHealthConditionSpecify: '',
    artStatus: 'On ART' as ARTStatus,
    artRegistrationDate: '',
    artIdNumber: '',
    vlStatus: 'Tested in last 6 months' as VLStatus,
    vlDate: '',
    viralLoad: '< 50',

    // Section 6: Nutrition Habits
    appetite: 'Good' as AppetiteLevel,
    mealsPerDay: 3,

    // Section 7: Education Status
    educationStatus: 'Currently going to school' as EducationStatus,
    educationStatusSpecify: '',
    schoolName: '',
    schoolSessionStartDate: '',
    schoolType: 'Government school' as SchoolType,
    currentClass: 'Class 2',
    attendance: 'Regular' as AttendanceType,

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
    requiredBooks: 0,
    requiredStationery: 0,
    requiredUniform: 0,
    requiredTransport: 0,
    requiredOtherSupport: 0,

    // Section 9: Programme Approval & Final Review
    approvedAllianceIndia: 'Pending' as ApprovedAllianceStatus,
    allInfoCorrect: true,
    organizationName: 'India HIV/AIDS Alliance',
    formSubmittedBy: 'Sunita Sharma',
    organizationEmail: 'fieldworker@allianceindia.org',
  });

  // Load draft from Dexie
  useEffect(() => {
    async function load() {
      if (!draftId) return;
      try {
        const found = await getDraftByAnyId(draftId);
        if (found) {
          const uuid = found.uuid || found.clientSubmissionId || draftId;
          setClientUuid(uuid);

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
          interviewerName: formData.formSubmittedBy || 'Caseworker',
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
            allInfoCorrect: formData.allInfoCorrect,
            organizationName: formData.organizationName,
            formSubmittedBy: formData.formSubmittedBy,
            organizationEmail: formData.organizationEmail,
            approvedAllianceIndia: formData.approvedAllianceIndia,
            reviewConfirmed: formData.allInfoCorrect,
          },
          approvedAllianceIndia: formData.approvedAllianceIndia,
          reviewConfirmed: formData.allInfoCorrect,
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

      const finalRecord: AssessmentRecord = {
        uuid: clientUuid,
        clientSubmissionId: clientUuid,
        uniqueId: formData.artNumber,
        version: 1,
        koboId: formData.koboId || formData.artNumber,
        interviewerName: formData.formSubmittedBy || 'Caseworker',
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
          agreeToParticipate: formData.agreeToParticipate,
          signatureDataUrl: signatureDataUrl,
          signatureTimestamp: new Date().toISOString(),
        },
        caregiverConsent: {
          consentProvided: formData.agreeToParticipate,
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
          approvedAllianceIndia: formData.approvedAllianceIndia,
          reviewConfirmed: formData.allInfoCorrect,
        },
        approvedAllianceIndia: formData.approvedAllianceIndia,
        reviewConfirmed: formData.allInfoCorrect,
        syncNeeded: 'NO',
        syncStatus: 'queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await enqueueSubmission(finalRecord, { operationType: 'CREATE' });
      router.push(
        `/assessment/sync?submitted=true&ref=${encodeURIComponent(
          finalRecord.demographics.artNumber || finalRecord.uuid
        )}`
      );
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
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 pb-60 sm:pb-64">
        {/* Header Summary Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-4">
            <div>
              <div className="flex items-center space-x-2 text-teal-700 text-xs font-bold uppercase tracking-wider mb-1">
                <FileCheck className="h-4 w-4" />
                <span>CHILD_HIV_SUPPORT_FORM (Resume Saved Draft)</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                Child Nutrition & Education Support Intake
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Saved offline draft. Review or update any of the 73 fields on this single page and submit when complete.
              </p>
            </div>

            <div className="flex items-center space-x-2.5">
              <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono">
                <span className="text-slate-400">Unique ID:</span>
                <span className="font-bold text-teal-900">{formData.artNumber || 'Generating...'}</span>
              </div>

              <div
                className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center space-x-1 border ${
                  saveStatus === 'saving'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                <div
                  className={`h-2 w-2 rounded-full ${
                    saveStatus === 'saving' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                <span>{saveStatus === 'saving' ? 'Saving draft...' : 'Draft saved offline'}</span>
              </div>
            </div>
          </div>

          {/* Quick Jump Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-slate-400 font-bold uppercase text-[10px] mr-1">Quick Jump:</span>
            {[
              { id: 'sec-consent', label: '1. Consent & Signature' },
              { id: 'sec-child', label: '2. Child Demographics' },
              { id: 'sec-banking', label: '3. Banking & KYC' },
              { id: 'sec-household', label: '4. Household' },
              { id: 'sec-health', label: '5. Clinical & ART' },
              { id: 'sec-nutrition', label: '6. Nutrition' },
              { id: 'sec-education', label: '7. Education' },
              { id: 'sec-expenses', label: '8. Expenses & Aid' },
              { id: 'sec-review', label: '9. Final Review' },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => scrollToSection(btn.id)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 text-slate-700 transition-colors font-medium text-[11px]"
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
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {/* SECTION 1: Caregiver Consent & Signature Gate */}
        <section id="sec-consent" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              01
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Caregiver Consent &amp; Signature
            </h2>
          </div>

          <div className="space-y-5">
            {/* Consent Decision */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2.5">
              <label className="text-xs font-bold text-slate-900 block">
                DO YOU AGREE TO PARTICIPATE IN THIS SURVEY? (INFORMED CONSENT) *
              </label>
              

              <div className="flex items-center space-x-3 pt-1">
                <label
                  className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${
                    formData.agreeToParticipate === true
                      ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="agreeToParticipate"
                    checked={formData.agreeToParticipate === true}
                    onChange={() => setFormData({ ...formData, agreeToParticipate: true })}
                    className="text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-xs">Yes — Consent Granted</span>
                </label>

                <label
                  className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${
                    formData.agreeToParticipate === false
                      ? 'bg-rose-50 border-rose-500 text-rose-900 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="agreeToParticipate"
                    checked={formData.agreeToParticipate === false}
                    onChange={() => setFormData({ ...formData, agreeToParticipate: false })}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-xs">No — Consent Refused</span>
                </label>
              </div>
            </div>

            {/* Caregiver Details Required for Consent & Signing */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Caregiver's Full Name *"
                required
                value={formData.caregiverName}
                onChange={(e) => setFormData({ ...formData, caregiverName: e.target.value })}
                
                placeholder="e.g. Meena Sharma"
              />

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  Relationship to Child *
                </label>
                <select
                  value={formData.caregiverRelationship}
                  onChange={(e) =>
                    setFormData({ ...formData, caregiverRelationship: e.target.value as CaregiverRelationship })
                  }
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  {['Mother', 'Father', 'Grandparent', 'Legal Guardian', 'Other'].map((rel) => (
                    <option key={rel} value={rel}>
                      {rel}
                    </option>
                  ))}
                </select>
                
              </div>

              <Input
                label="Caregiver Contact Number *"
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

            {/* Signature Pad or Refusal Alert */}
            {formData.agreeToParticipate ? (
              <div className="pt-1">
                <CaregiverSignaturePad
                  submissionUuid={clientUuid}
                  caregiverName={formData.caregiverName || 'Caregiver'}
                  caregiverRelationship={formData.caregiverRelationship || 'Mother'}
                  onSignatureSaved={(blob) => setHasSavedSignature(!!blob)}
                />
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-3">
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
        </section>

        {/* SECTION 2: Child Demographics & Residence */}
        <section id="sec-child" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              02
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Child Demographics &amp; Residence
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* System Generated Unique ID Display */}
            <div className="p-3 bg-teal-50/80 border border-teal-200/90 rounded-xl sm:col-span-2 md:col-span-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-teal-950 uppercase tracking-wide">
                    Unique Beneficiary ID (Auto-Generated)
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-teal-600 text-white rounded-md tracking-wider">
                    SYSTEM ID
                  </span>
                </div>
                
              </div>
              <div className="flex items-center space-x-2 bg-white px-3.5 py-2 rounded-lg border border-teal-300 font-mono text-sm font-bold text-teal-950 shadow-2xs w-fit">
                <span>{formData.artNumber || 'Generating...'}</span>
              </div>
            </div>

            <Input
              label="Date of Filling Form (Visit Date) *"
              type="date"
              required
              value={formData.dateOfFilling}
              onChange={(e) => setFormData({ ...formData, dateOfFilling: e.target.value })}
              
            />

            <Input
              label="Child's Full Name *"
              required
              value={formData.childName}
              onChange={(e) => setFormData({ ...formData, childName: e.target.value })}
              
              placeholder="e.g. Aarav Sharma"
            />

            <Input
              label="Date of Birth *"
              type="date"
              required
              value={formData.dob}
              onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
              
            />

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">Gender *</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Male', 'Female', 'Other'] as Gender[]).map((g) => (
                  <label
                    key={g}
                    className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      formData.gender === g
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700'
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
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-800 block">Orphan Status *</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  'Both parents alive',
                  'Single orphan (one parent deceased)',
                  'Double orphan (both parents deceased)',
                ].map((st) => (
                  <label
                    key={st}
                    className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      formData.orphanStatus === st
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="orphanStatus"
                      value={st}
                      checked={formData.orphanStatus === st}
                      onChange={() => setFormData({ ...formData, orphanStatus: st as OrphanStatus })}
                      className="text-teal-600 focus:ring-teal-500 shrink-0"
                    />
                    <span className="truncate">{st}</span>
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

            <div className="sm:col-span-2">
              <Input
                label="Full Residential Address *"
                value={formData.fullAddress}
                onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                
                placeholder="e.g. Room 4, Shanti Nagar, Near ZP School"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">State / Union Territory *</label>
              <select
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                {INDIAN_STATES_AND_UTS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="District *"
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
              
              placeholder="e.g. Pune"
            />
          </div>
        </section>

        {/* SECTION 3: Banking & Identification (KYC) Details */}
        <section id="sec-banking" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              03
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Banking &amp; KYC Documents
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="BANK ACCOUNT HOLDER NAME"
                value={formData.bankAccountHolderName}
                onChange={(e) => setFormData({ ...formData, bankAccountHolderName: e.target.value })}
                placeholder="Name as printed in passbook"
                
              />
            </div>

            <div className="sm:col-span-2">
              <Input
                label="BANK ACCOUNT NUMBER"
                value={formData.bankAccountNumber}
                onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                placeholder="e.g. 10023456789"
                
              />
            </div>

            <Input
              label="BANK IFSC CODE"
              value={formData.bankIfscCode}
              onChange={(e) => setFormData({ ...formData, bankIfscCode: e.target.value.toUpperCase() })}
              placeholder="e.g. SBIN0001234"
              
            />

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
        <section id="sec-household" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              04
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Household &amp; Socio-Economic Profile
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label="HOUSEHOLD MEMBERS (TOTAL FAMILY) *"
              type="number"
              min="1"
              required
              value={formData.totalFamilyMembers}
              onChange={(e) => setFormData({ ...formData, totalFamilyMembers: Number(e.target.value) })}
              
            />

            <Input
              label="NO OF CHILDREN (≤18 YRS) *"
              type="number"
              min="0"
              required
              value={formData.numberOfChildrenUnder18}
              onChange={(e) =>
                setFormData({ ...formData, numberOfChildrenUnder18: Number(e.target.value) })
              }
              
            />

            <Input
              label="MONTHLY INCOME (RS.) *"
              type="number"
              min="0"
              required
              value={formData.monthlyIncomeRs}
              onChange={(e) => setFormData({ ...formData, monthlyIncomeRs: Number(e.target.value) })}
              unit="₹"
              
            />

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">INCOME SOURCE *</label>
              <select
                value={formData.mainSourceOfIncome}
                onChange={(e) =>
                  setFormData({ ...formData, mainSourceOfIncome: e.target.value as MainSourceOfIncome })
                }
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
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
        <section id="sec-health" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              05
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Clinical Health, ART &amp; Viral Load
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label="CURRENT WEIGHT (KG) *"
              type="number"
              step="0.1"
              min="2"
              max="150"
              required
              value={formData.weightKg}
              onChange={(e) => setFormData({ ...formData, weightKg: Number(e.target.value) })}
              unit="kg"
              
            />

            <Input
              label="CURRENT HEIGHT (CM) *"
              type="number"
              step="0.1"
              min="40"
              max="220"
              required
              value={formData.heightCm}
              onChange={(e) => setFormData({ ...formData, heightCm: Number(e.target.value) })}
              unit="cm"
              
            />

            <div className="flex flex-col justify-center bg-teal-50 border border-teal-200 rounded-xl px-3.5 py-2">
              <span className="text-[10px] uppercase font-bold text-teal-800">BMI & CATEGORY</span>
              <div className="text-lg font-bold text-teal-900">{bmiValue} kg/m²</div>
              <span className="text-[11px] text-teal-700 font-semibold">{bmiCategory}</span>
            </div>

            <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2">
              <span className="text-[10px] uppercase font-bold text-slate-500">HB & CATEGORY</span>
              <div className="text-base font-bold text-slate-800">
                {formData.haemoglobinGdl ? `${formData.haemoglobinGdl} g/dL` : 'Not recorded'}
              </div>
              <span className="text-[11px] text-slate-600 font-semibold">{hbCategory}</span>
            </div>

            <Input
              label="HEMOGLOBIN (G/DL)"
              type="number"
              step="0.1"
              min="2"
              max="25"
              value={formData.haemoglobinGdl}
              onChange={(e) => setFormData({ ...formData, haemoglobinGdl: e.target.value })}
              unit="g/dL"
              
            />

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">ART STATUS *</label>
              <select
                value={formData.artStatus}
                onChange={(e) => setFormData({ ...formData, artStatus: e.target.value as ARTStatus })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                {['On ART', 'Not on ART', 'Defaulted / Interrupted', 'Transferred In'].map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="ART REGISTRATION DATE"
              type="date"
              value={formData.artRegistrationDate}
              onChange={(e) => setFormData({ ...formData, artRegistrationDate: e.target.value })}
              
            />

            <Input
              label="ART ID NUMBER"
              value={formData.artIdNumber}
              onChange={(e) => setFormData({ ...formData, artIdNumber: e.target.value })}
              placeholder="e.g. MH-PUN-00123"
              
            />

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">VIRAL LOAD STATUS *</label>
              <select
                value={formData.vlStatus}
                onChange={(e) => setFormData({ ...formData, vlStatus: e.target.value as VLStatus })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
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
              label="VIRAL LOAD TEST DATE"
              type="date"
              value={formData.vlDate}
              onChange={(e) => setFormData({ ...formData, vlDate: e.target.value })}
              
            />

            <Input
              label="VIRAL LOAD (COPIES/ML)"
              value={formData.viralLoad}
              onChange={(e) => setFormData({ ...formData, viralLoad: e.target.value })}
              placeholder="e.g. < 50 or 450"
              
            />

            <div className="flex flex-col justify-center bg-teal-50/50 border border-teal-200 rounded-xl px-3.5 py-2">
              <span className="text-[10px] uppercase font-bold text-teal-800">VL CATEGORY</span>
              <div className="text-xs font-bold text-teal-900 mt-1">{vlCategory}</div>
              <span className="text-[10px] text-teal-700">Auto-classified</span>
            </div>

            {/* Comorbidities */}
            <div className="sm:col-span-4 space-y-2 pt-1">
              <label className="text-xs font-bold text-slate-800 block">
                COMORBIDITIES (Select all that apply)
              </label>
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
                      className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                          : 'bg-white border-slate-200'
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
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span className="truncate">{cond}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {formData.otherHealthConditions.includes('Any Other Health Condition (specify)') && (
              <div className="sm:col-span-4">
                <Input
                  label="COMORBIDITIES OTHER (PLEASE SPECIFY) *"
                  value={formData.otherHealthConditionSpecify}
                  onChange={(e) =>
                    setFormData({ ...formData, otherHealthConditionSpecify: e.target.value })
                  }
                  
                  placeholder="e.g. Asthma, Skin allergy"
                />
              </div>
            )}
          </div>
        </section>

        {/* SECTION 6: Nutrition Habits */}
        <section id="sec-nutrition" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              06
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Daily Nutrition Habits
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">CHILD&apos;S APPETITE *</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Good', 'Reduced', 'Poor / Very low'] as AppetiteLevel[]).map((app) => (
                  <label
                    key={app}
                    className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      formData.appetite === app
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                        : 'bg-white border-slate-200'
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
                    <span>{app}</span>
                  </label>
                ))}
              </div>
            </div>

            <Input
              label="MEALS PER DAY *"
              type="number"
              min="1"
              max="10"
              required
              value={formData.mealsPerDay}
              onChange={(e) => setFormData({ ...formData, mealsPerDay: Number(e.target.value) })}
              
            />
          </div>
        </section>

        {/* SECTION 7: Education Status */}
        <section id="sec-education" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              07
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Education Status
            </h2>
          </div>

          <div className="space-y-4">
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
                      onChange={() =>
                        setFormData({ ...formData, educationStatus: st as EducationStatus })
                      }
                      className="text-teal-600 focus:ring-teal-500 shrink-0"
                    />
                    <span className="text-xs">{st}</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                <div className="sm:col-span-2">
                  <Input
                    label="SCHOOL NAME"
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

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">SCHOOL TYPE</label>
                  <select
                    value={formData.schoolType}
                    onChange={(e) => setFormData({ ...formData, schoolType: e.target.value as SchoolType })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    {['Government school', 'Private school', 'Aided school'].map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="CURRENT CLASS"
                  value={formData.currentClass}
                  onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                  
                />

                <div className="sm:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">ATTENDANCE STATUS</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Regular', 'Irregular', 'Dropped out'] as AttendanceType[]).map((att) => (
                      <label
                        key={att}
                        className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
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
          </div>
        </section>

        {/* SECTION 8: Expenses & Programme Support */}
        <section id="sec-expenses" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              08
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Education Expenses &amp; Aid Breakdown
            </h2>
          </div>

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
        <section id="sec-review" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
              09
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Review &amp; Submitter Attestation
            </h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  APPROVED ALLIANCE INDIA (PROGRAMME STATUS)
                </label>
                <select
                  value={formData.approvedAllianceIndia}
                  onChange={(e) =>
                    setFormData({ ...formData, approvedAllianceIndia: e.target.value as ApprovedAllianceStatus })
                  }
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-teal-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  {['Pending', 'Approved', 'Conditionally Approved', 'Rejected'].map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  REVIEW CONFIRMED (ALL INFORMATION ACCURATE) *
                </label>
                <div className="flex items-center space-x-4 pt-1">
                  <label
                    className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl border cursor-pointer ${
                      formData.allInfoCorrect === true
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
                    <span className="text-xs">Yes — Verified</span>
                  </label>

                  <label
                    className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl border cursor-pointer ${
                      formData.allInfoCorrect === false
                        ? 'bg-rose-50 border-rose-500 text-rose-900 font-bold'
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
                    <span className="text-xs">No — Needs correction</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <Input
                label="ORGANIZATION NAME"
                value={formData.organizationName}
                onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                placeholder="India HIV/AIDS Alliance"
              />

              <Input
                label="FORM SUBMITTED BY (INTERVIEWER NAME) *"
                required
                value={formData.formSubmittedBy}
                onChange={(e) => setFormData({ ...formData, formSubmittedBy: e.target.value })}
                placeholder="Your full name"
              />

              <Input
                label="ORGANIZATION EMAIL ID"
                type="email"
                value={formData.organizationEmail}
                onChange={(e) => setFormData({ ...formData, organizationEmail: e.target.value })}
                placeholder="fieldworker@allianceindia.org"
              />
            </div>
          </div>
        </section>
        </div>

        {/* Dedicated Bottom Clearance Spacer ensuring full scroll past sticky bar */}
        <div className="h-32 w-full shrink-0 pointer-events-none" aria-hidden="true" />

        {/* Sticky Floating Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-4 py-3">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3 text-xs w-full sm:w-auto justify-between sm:justify-start">
              <span className="font-mono font-bold text-teal-900">{formData.artNumber}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600">
                Grant: <strong className="text-teal-900">₹{totalRequiredSupport}</strong>
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
                className="w-full sm:w-auto"
              >
                <Save className="h-4 w-4 mr-1.5" />
                <span>Save Draft</span>
              </Button>

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 shadow-xs font-bold"
              >
                <Send className="h-4 w-4 mr-1.5" />
                <span>Submit Survey</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
