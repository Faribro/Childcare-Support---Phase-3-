'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CaregiverSignaturePad } from '@/components/ui/CaregiverSignaturePad';
import { ExpensesAndApprovalGrid } from '@/components/education/ExpensesAndApprovalGrid';
import { PhotoUpload } from '@/components/ui/PhotoUpload';
import { AnimatedAppetiteSelector } from '@/components/ui/AnimatedAppetiteSelector';
import { LocationFetchButton } from '@/components/ui/LocationFetchButton';
import { ConsentAudioNotice } from '@/components/ui/ConsentAudioNotice';
import { getAllQueueItems, enqueueSubmission } from '@/lib/db/syncQueueRepository';
import { getAllDrafts } from '@/lib/db/draftRepository';
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
  type ApprovedAllianceStatus,
} from '@/types/domain';
import {
  User,
  ShieldCheck,
  CreditCard,
  FileText,
  HeartPulse,
  Utensils,
  GraduationCap,
  Save,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  History,
  Home,
  FileCheck,
  Scale,
  Pill,
  Microscope,
  Activity,
} from 'lucide-react';

export default function EditRecordPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = (params?.submissionId as string) || '';
  const submissionId = decodeURIComponent(rawId);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<any>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [amendmentReason, setAmendmentReason] = useState<string>('');
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [existingSignatureUrl, setExistingSignatureUrl] = useState<string>('');
  const [fallbackSigUuid, setFallbackSigUuid] = useState<string>('');

  // Form State covering all 73 Linelist & Google Sheet fields
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
    haemoglobinGdl: '12.0',
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
    requiredTuitionFees: 0,
    requiredBooks: 0,
    requiredStationery: 0,
    requiredUniform: 0,
    requiredTransport: 0,
    requiredOtherSupport: 0,

    // Section 9: Programme Approval & Final Review
    approvedAllianceIndia: 'Approved' as ApprovedAllianceStatus,
    allInfoCorrect: true,
    organizationName: 'India HIV/AIDS Alliance',
    formSubmittedBy: 'Caseworker',
    organizationEmail: 'fieldworker@allianceindia.org',
  });

  const loadRecord = async () => {
    setIsLoading(true);
    setConflictError(null);
    try {
      let localRecord: any = null;

      // 1. Check local Dexie sync queue
      try {
        const queue = await getAllQueueItems();
        const queued = queue.find(
          (q) =>
            q.submissionUuid === submissionId ||
            q.payload?.uuid === submissionId ||
            q.payload?.clientSubmissionId === submissionId ||
            q.payload?.demographics?.artNumber === submissionId ||
            (q.payload as any)?.artNumber === submissionId ||
            q.payload?.uniqueId === submissionId ||
            String(q.id) === submissionId
        );
        if (queued && queued.payload) {
          localRecord = queued.payload;
          if (queued.expectedVersion) {
            setCurrentVersion(queued.expectedVersion);
          }
        }
      } catch (_) {}

      // 2. Check local Dexie drafts
      if (!localRecord) {
        try {
          const drafts = await getAllDrafts();
          const draft = drafts.find(
            (d) =>
              d.uuid === submissionId ||
              d.clientSubmissionId === submissionId ||
              d.demographics?.artNumber === submissionId ||
              (d as any).artNumber === submissionId ||
              String(d.id) === submissionId
          );
          if (draft) localRecord = draft;
        } catch (_) {}
      }

      // 3. Check remote API
      let remoteRecord: any = null;
      try {
        const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`);
        if (res.ok) {
          const body = await res.json();
          if (body.data) {
            remoteRecord = body.data;
          }
        }
      } catch (_) {}

      // If remote wasn't found by submissionId, try altId from localRecord if available
      if (!remoteRecord && localRecord) {
        const altId = localRecord.demographics?.artNumber || localRecord.uuid || localRecord.clientSubmissionId;
        if (altId && altId !== submissionId) {
          try {
            const res2 = await fetch(`/api/submissions/${encodeURIComponent(altId)}`);
            if (res2.ok) {
              const body2 = await res2.json();
              if (body2.data) {
                remoteRecord = body2.data;
              }
            }
          } catch (_) {}
        }
      }

      // If localRecord was not found by submissionId, but remoteRecord was loaded, lookup local Dexie by remote identifiers
      if (!localRecord && remoteRecord) {
        const candidates = [
          remoteRecord.art_number,
          remoteRecord.uniqueId,
          remoteRecord.client_submission_id,
          remoteRecord._uuid,
          remoteRecord['1\nUnique ID'],
        ].filter(Boolean);

        try {
          const queue = await getAllQueueItems();
          const queued = queue.find((q) =>
            candidates.some(
              (c) =>
                q.submissionUuid === c ||
                q.payload?.uuid === c ||
                q.payload?.clientSubmissionId === c ||
                q.payload?.demographics?.artNumber === c ||
                (q.payload as any)?.artNumber === c
            )
          );
          if (queued && queued.payload) localRecord = queued.payload;
        } catch (_) {}

        if (!localRecord) {
          try {
            const drafts = await getAllDrafts();
            const draft = drafts.find((d) =>
              candidates.some(
                (c) =>
                  d.uuid === c ||
                  d.clientSubmissionId === c ||
                  d.demographics?.artNumber === c
              )
            );
            if (draft) localRecord = draft;
          } catch (_) {}
        }
      }

      // Merge records so local high-res Base64 images and drafts are never erased
      const foundRecord: any = (remoteRecord || localRecord)
        ? {
            ...(remoteRecord || {}),
            ...(localRecord || {}),
            bankingAndKyc: {
              ...(remoteRecord?.bankingAndKyc || remoteRecord?.bankDetails || {}),
              ...(localRecord?.bankingAndKyc || localRecord?.bankDetails || {}),
            },
            educationExpenses: {
              ...(remoteRecord?.educationExpenses || {}),
              ...(localRecord?.educationExpenses || {}),
            },
            demographics: {
              ...(remoteRecord?.demographics || {}),
              ...(localRecord?.demographics || {}),
            },
            consent: {
              ...(remoteRecord?.consent || remoteRecord?.caregiverConsent || {}),
              ...(localRecord?.consent || localRecord?.caregiverConsent || {}),
            },
          }
        : null;

      if (foundRecord) {
        const d = foundRecord.demographics || foundRecord;
        const c = foundRecord.consent || foundRecord;
        const b = foundRecord.bankingAndKyc || foundRecord.bankDetails || foundRecord;
        const hf = foundRecord.householdFinancial || foundRecord.household || foundRecord;
        const h = foundRecord.health || foundRecord.clinical || foundRecord;
        const n = foundRecord.nutrition || foundRecord;
        const ed = foundRecord.educationStatus || foundRecord.education || foundRecord;
        const exp = foundRecord.educationExpenses || foundRecord;
        const req = foundRecord.educationSupportRequired || foundRecord;
        const fr = foundRecord.finalReview || foundRecord;

        const rev = Number(
          foundRecord.version ||
          foundRecord.revision ||
          foundRecord['2\\nRevision Number'] ||
          foundRecord['2\nRevision Number'] ||
          1
        );
        setCurrentVersion(rev);

        const reason =
          foundRecord.editReason ||
          foundRecord.edit_reason ||
          foundRecord['48\\nEdit Reason'] ||
          foundRecord['48\nEdit Reason'] ||
          '';
        setAmendmentReason(reason);

        // Comprehensive document photo extraction across all potential storage keys
        const passbookPhoto =
          b.passbookPhotoUrl ||
          b.passbook_photo_url ||
          foundRecord.passbookPhotoUrl ||
          foundRecord.passbook_photo_url ||
          localRecord?.bankingAndKyc?.passbookPhotoUrl ||
          localRecord?.passbookPhotoUrl ||
          remoteRecord?.bankingAndKyc?.passbookPhotoUrl ||
          remoteRecord?.passbookPhotoUrl ||
          remoteRecord?.passbook_photo_url ||
          foundRecord['25\nPassbook Front Page Link'] ||
          '';

        const aadhaarPhoto =
          b.aadhaarCardPhotoUrl ||
          b.aadhaar_card_photo_url ||
          foundRecord.aadhaarCardPhotoUrl ||
          foundRecord.aadhaar_card_photo_url ||
          localRecord?.bankingAndKyc?.aadhaarCardPhotoUrl ||
          localRecord?.aadhaarCardPhotoUrl ||
          remoteRecord?.bankingAndKyc?.aadhaarCardPhotoUrl ||
          remoteRecord?.aadhaarCardPhotoUrl ||
          remoteRecord?.aadhaar_card_photo_url ||
          foundRecord['26\nAadhaar Card Link'] ||
          '';

        const childPhoto =
          b.childPhotoUrl ||
          b.child_photo_url ||
          foundRecord.childPhotoUrl ||
          foundRecord.child_photo_url ||
          localRecord?.bankingAndKyc?.childPhotoUrl ||
          localRecord?.childPhotoUrl ||
          remoteRecord?.bankingAndKyc?.childPhotoUrl ||
          remoteRecord?.childPhotoUrl ||
          remoteRecord?.child_photo_url ||
          foundRecord['27\nPassport Size Photo Link'] ||
          '';

        const feeReceiptPhoto =
          exp.feeReceiptPhotoUrl ||
          exp.fee_receipt_photo_url ||
          foundRecord.feeReceiptPhotoUrl ||
          foundRecord.fee_receipt_photo_url ||
          localRecord?.educationExpenses?.feeReceiptPhotoUrl ||
          localRecord?.feeReceiptPhotoUrl ||
          remoteRecord?.educationExpenses?.feeReceiptPhotoUrl ||
          remoteRecord?.feeReceiptPhotoUrl ||
          remoteRecord?.fee_receipt_photo_url ||
          foundRecord['64\nSchool Fee Receipt Link'] ||
          '';

        const marksheetPhoto =
          exp.marksheetPhotoUrl ||
          exp.marksheet_photo_url ||
          foundRecord.marksheetPhotoUrl ||
          foundRecord.marksheet_photo_url ||
          localRecord?.educationExpenses?.marksheetPhotoUrl ||
          localRecord?.marksheetPhotoUrl ||
          remoteRecord?.educationExpenses?.marksheetPhotoUrl ||
          remoteRecord?.marksheetPhotoUrl ||
          remoteRecord?.marksheet_photo_url ||
          foundRecord['65\nMarksheet Photo Link'] ||
          '';

        const sigDataUrl =
          c.signatureDataUrl ||
          c.signatureUrl ||
          c.signature_data_url ||
          foundRecord.signatureDataUrl ||
          foundRecord.signature_data_url ||
          localRecord?.caregiverConsent?.signatureDataUrl ||
          localRecord?.consent?.signatureDataUrl ||
          remoteRecord?.caregiverConsent?.signatureDataUrl ||
          remoteRecord?.consent?.signatureDataUrl ||
          remoteRecord?.signatureDataUrl ||
          remoteRecord?.signature_data_url ||
          foundRecord['72\nSignature Link'] ||
          '';

        if (sigDataUrl) {
          setExistingSignatureUrl(sigDataUrl);
          setHasSavedSignature(true);
        }

        const fbUuid = localRecord?.uuid || localRecord?.clientSubmissionId || foundRecord.uuid || '';
        if (fbUuid) {
          setFallbackSigUuid(fbUuid);
        }

        setFormData({
          artNumber: d.artNumber || foundRecord['1\nUnique ID'] || foundRecord.uniqueId || submissionId,
          koboId: foundRecord.koboId || d.artNumber || '',
          dateOfFilling: d.dateOfFilling || foundRecord['7\nVisit Date'] || new Date().toISOString().split('T')[0],
          childName: d.childName || foundRecord['9\nChild Name'] || foundRecord.child_name || '',
          dob: d.dob || foundRecord['10\nDate of Birth'] || '',
          gender: (d.gender || foundRecord['12\nGender'] || 'Male') as Gender,
          orphanStatus: (d.orphanStatus || foundRecord['13\nOrphan Status'] || 'Both parents alive') as OrphanStatus,
          caregiverName: d.caregiverName || foundRecord['14\nCaregiver Full Name'] || foundRecord.caregiver_name || '',
          caregiverRelationship: (d.caregiverRelationship || foundRecord['15\nCaregiver Relation'] || foundRecord.caregiver_relationship || 'Mother') as CaregiverRelationship,
          contactNumber: d.contactNumber || d.caregiverPhone || foundRecord['16\nCaregiver Contact'] || foundRecord.caregiver_phone || '',
          fullAddress: d.fullAddress || foundRecord['17\nAddress'] || foundRecord.address || '',
          state: d.state || foundRecord['18\nState'] || 'Maharashtra',
          district: d.district || foundRecord['19\nDistrict'] || 'Pune',
          childAadhaarNumber: d.childAadhaarNumber || b.childAadhaarNumber || foundRecord['24\nChild Aadhaar Number'] || '',

          agreeToParticipate: c.agreeToParticipate ?? true,

          bankAccountHolderName: b.bankAccountHolderName || b.accountHolderName || foundRecord['20\nBank Account Holder Name'] || foundRecord.account_holder_name || '',
          bankAccountNumber: b.bankAccountNumber || b.accountNumber || foundRecord['21\nBank Account Number'] || foundRecord.bank_account_number || '',
          bankIfscCode: b.bankIfscCode || b.ifscCode || foundRecord['22\nBank IFSC Code'] || foundRecord.ifsc_code || '',
          bankLinkedMobileNumber: b.bankLinkedMobileNumber || foundRecord['23\nBank Linked Mobile Number'] || '',
          passbookPhotoUrl: passbookPhoto,
          aadhaarCardPhotoUrl: aadhaarPhoto,
          childPhotoUrl: childPhoto,

          totalFamilyMembers: Number(hf.totalFamilyMembers || foundRecord['28\nHousehold Members'] || 4),
          numberOfChildrenUnder18: Number(hf.numberOfChildrenUnder18 || foundRecord['29\nNo of Children'] || 2),
          monthlyIncomeRs: Number(hf.monthlyIncomeRs || foundRecord['30\nMonthly Income'] || 5000),
          mainSourceOfIncome: (hf.mainSourceOfIncome || foundRecord['31\nIncome Source'] || 'Daily wage labour') as MainSourceOfIncome,

          weightKg: Number(h.weightKg || n.weightKg || foundRecord['32\nCurrent Weight (kg)'] || foundRecord.weight_kg || 14.5),
          heightCm: Number(h.heightCm || n.heightCm || foundRecord['33\nCurrent Height (cm)'] || foundRecord.height_cm || 100),
          haemoglobinGdl: String(h.haemoglobinGdl || foundRecord['36\nHemoglobin (g/dL)'] || '12.0'),
          otherHealthConditions: h.otherHealthConditions || [],
          otherHealthConditionSpecify: h.otherHealthConditionSpecify || '',
          artStatus: (h.artStatus || foundRecord['40\nART Status'] || 'On ART') as ARTStatus,
          artRegistrationDate: h.artRegistrationDate || foundRecord['41\nART Registration Date'] || '',
          artIdNumber: h.artIdNumber || foundRecord['42\nART ID Number'] || '',
          vlStatus: (h.vlStatus || foundRecord['43\nVL Status'] || 'Tested in last 6 months') as VLStatus,
          vlDate: h.vlDate || foundRecord['44\nVL Date'] || '',
          viralLoad: String(h.viralLoad || foundRecord['45\nViral Load'] || '< 50'),

          appetite: (n.appetite || foundRecord['47\nAppetite'] || 'Good') as AppetiteLevel,
          mealsPerDay: Number(n.mealsPerDay || foundRecord['48\nMeals per Day'] || 3),

          educationStatus: (ed.educationStatus || foundRecord['49\nEducation Status'] || 'Currently going to school') as EducationStatus,
          educationStatusSpecify: ed.educationStatusSpecify || '',
          schoolName: ed.schoolName || foundRecord['51\nSchool Name'] || '',
          schoolSessionStartDate: ed.schoolSessionStartDate || foundRecord['52\nSchool Session Start Date'] || '',
          schoolType: (ed.schoolType || foundRecord['53\nSchool Type'] || 'Government school') as SchoolType,
          currentClass: ed.currentClass || ed.schoolGrade || foundRecord['54\nCurrent Class'] || 'Class 2',
          attendance: (ed.attendance || foundRecord['55\nAttendance Status'] || 'Regular') as AttendanceType,

          schoolFees: Number(exp.schoolFees || foundRecord['56\nSchool Fees'] || 0),
          tuitionFees: Number(exp.tuitionFees || foundRecord['57\nPrivate Tuition Fee'] || 0),
          books: Number(exp.books || foundRecord['58\nSchool Books'] || 0),
          stationery: Number(exp.stationery || foundRecord['59\nSchool Stationery'] || 0),
          uniform: Number(exp.uniform || foundRecord['60\nSchool Uniform'] || 0),
          transport: Number(exp.transport || foundRecord['61\nSchool Transport'] || 0),
          otherExpenses: Number(exp.otherExpenses || foundRecord['62\nSchool Other Expenses'] || 0),
          feeReceiptPhotoUrl: feeReceiptPhoto,
          marksheetPhotoUrl: marksheetPhoto,
          remarks: exp.remarks || foundRecord['66\nRemarks (If Any)'] || '',

          requiredSchoolFees: Number(req.requiredSchoolFees || 0),
          requiredTuitionFees: Number(req.requiredTuitionFees || 0),
          requiredBooks: Number(req.requiredBooks || 0),
          requiredStationery: Number(req.requiredStationery || 0),
          requiredUniform: Number(req.requiredUniform || 0),
          requiredTransport: Number(req.requiredTransport || 0),
          requiredOtherSupport: Number(req.requiredOtherSupport || 0),

          approvedAllianceIndia: (foundRecord.approvedAllianceIndia || fr.approvedAllianceIndia || foundRecord['67\nApproved Alliance India'] || 'Approved') as ApprovedAllianceStatus,
          allInfoCorrect: true,
          organizationName: fr.organizationName || foundRecord['69\nOrganization Name'] || 'India HIV/AIDS Alliance',
          formSubmittedBy: fr.formSubmittedBy || foundRecord['70\nForm Submitted By'] || 'Caseworker',
          organizationEmail: fr.organizationEmail || foundRecord['71\nOrganization Email'] || 'fieldworker@allianceindia.org',
        });

        // Check local signature
        try {
          const sig = (await getCaregiverSignatureBlob(submissionId)) ||
            (fbUuid ? await getCaregiverSignatureBlob(fbUuid) : undefined);
          if (sig) {
            setHasSavedSignature(true);
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error('[EditRecordPage] Error loading record:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecord();
  }, [submissionId]);

  // Real-time Clinical Calculations
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

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSaveRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.childName.trim()) {
      setFormError('Child name is required.');
      return;
    }
    if (!formData.caregiverName.trim()) {
      setFormError('Caregiver name is required.');
      return;
    }

    const note = amendmentReason.trim() || 'Assessment information updated during clinical review';
    setIsSaving(true);
    setConflictError(null);
    setFormError(null);

    const nextVersion = currentVersion + 1;

    const patchPayload: any = {
      ...formData,
      expectedVersion: currentVersion,
      version: nextVersion,
      revision: nextVersion,
      editReason: note,
      uniqueId: formData.artNumber || submissionId,
      artNumber: formData.artNumber || submissionId,
      calculatedAgeYears: ageResult.years,
      bmi: bmiValue,
      bmiCategory: bmiCategory,
      hbCategory: hbCategory,
      vlCategory: vlCategory,
      nutritionStatus: nutritionResult.nutritionStatus,
      totalAnnualCost: totalAnnualEducationCost,
      totalRequiredSupport: totalRequiredSupport,
      signatureDataUrl: existingSignatureUrl,
      signature_data_url: existingSignatureUrl,
    };

    try {
      // 1. Send PATCH to server API
      let serverSaved = false;
      try {
        const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `"${currentVersion}"`,
          },
          body: JSON.stringify(patchPayload),
        });

        if (res.status === 409) {
          const body = await res.json();
          setConflictError({
            currentVersion: body.currentVersion || currentVersion + 1,
            expectedVersion: currentVersion,
            message: body.message || 'This assessment was updated elsewhere. Please refresh before saving.',
          });
          setIsSaving(false);
          return;
        }

        if (res.ok) {
          serverSaved = true;
        }
      } catch (_) {
        // Network offline / fallback to local queue
      }

      // 2. Also enqueue / record in local Dexie Sync Queue
      try {
        const queuePayload: any = {
          uuid: submissionId,
          clientSubmissionId: submissionId,
          uniqueId: formData.artNumber || submissionId,
          version: nextVersion,
          editReason: note,
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
            signatureDataUrl: existingSignatureUrl,
          },
          caregiverConsent: {
            agreeToParticipate: formData.agreeToParticipate,
            signatureDataUrl: existingSignatureUrl,
          },
          signatureDataUrl: existingSignatureUrl,
          bankingAndKyc: {
            bankAccountHolderName: formData.bankAccountHolderName,
            bankAccountNumber: formData.bankAccountNumber,
            bankIfscCode: formData.bankIfscCode,
            bankLinkedMobileNumber: formData.bankLinkedMobileNumber,
            passbookPhotoUrl: formData.passbookPhotoUrl,
            aadhaarCardPhotoUrl: formData.aadhaarCardPhotoUrl,
            childPhotoUrl: formData.childPhotoUrl,
          },
          householdFinancial: {
            totalFamilyMembers: formData.totalFamilyMembers,
            numberOfChildrenUnder18: formData.numberOfChildrenUnder18,
            monthlyIncomeRs: formData.monthlyIncomeRs,
            mainSourceOfIncome: formData.mainSourceOfIncome,
          },
          health: {
            weightKg: formData.weightKg,
            heightCm: formData.heightCm,
            bmi: bmiValue,
            bmiCategory,
            haemoglobinGdl: Number(formData.haemoglobinGdl) || 12,
            hbCategory,
            otherHealthConditions: formData.otherHealthConditions,
            artStatus: formData.artStatus,
            artRegistrationDate: formData.artRegistrationDate,
            artIdNumber: formData.artIdNumber,
            vlStatus: formData.vlStatus,
            vlDate: formData.vlDate,
            viralLoad: formData.viralLoad,
            vlCategory,
            nutritionStatus: nutritionResult.nutritionStatus,
          },
          nutrition: {
            appetite: formData.appetite,
            mealsPerDay: formData.mealsPerDay,
          },
          educationStatus: {
            educationStatus: formData.educationStatus,
            schoolName: formData.schoolName,
            schoolSessionStartDate: formData.schoolSessionStartDate,
            schoolType: formData.schoolType,
            currentClass: formData.currentClass,
            attendance: formData.attendance,
          },
          educationExpenses: {
            schoolFees: formData.schoolFees,
            tuitionFees: formData.tuitionFees,
            books: formData.books,
            stationery: formData.stationery,
            uniform: formData.uniform,
            transport: formData.transport,
            otherExpenses: formData.otherExpenses,
            totalAnnualCost: totalAnnualEducationCost,
            feeReceiptPhotoUrl: formData.feeReceiptPhotoUrl,
            marksheetPhotoUrl: formData.marksheetPhotoUrl,
            remarks: formData.remarks,
          },
          educationSupportRequired: {
            requiredSchoolFees: formData.requiredSchoolFees,
            requiredTuitionFees: formData.requiredTuitionFees,
            requiredBooks: formData.requiredBooks,
            requiredStationery: formData.requiredStationery,
            requiredUniform: formData.requiredUniform,
            requiredTransport: formData.requiredTransport,
            requiredOtherSupport: formData.requiredOtherSupport,
            totalRequiredSupport: totalRequiredSupport,
          },
          finalReview: {
            approvedAllianceIndia: formData.approvedAllianceIndia,
            allInfoCorrect: true,
            organizationName: formData.organizationName,
            formSubmittedBy: formData.formSubmittedBy,
            organizationEmail: formData.organizationEmail,
          },
          updatedAt: new Date().toISOString(),
        };

        if (!serverSaved) {
          await enqueueSubmission(queuePayload as any, {
            operationType: 'UPDATE',
            expectedVersion: currentVersion,
          });
        }
      } catch (dexieErr) {
        console.error('Dexie queue update error:', dexieErr);
      }

      setSaveSuccess(true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('child_nutrition:sync_completed'));
      }

      setTimeout(() => {
        router.push(`/assessment/sync?submitted=true&ref=${encodeURIComponent(formData.artNumber || submissionId)}`);
      }, 900);
    } catch (err: any) {
      alert('Error updating record: ' + (err.message || 'Unknown network error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-24 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading full assessment for editing...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-10 space-y-6 animate-in fade-in duration-200">
        {/* Top Navigation & Breadcrumb */}
        <div className="flex items-center justify-between pb-3 border-b border-[hsl(215,18%,88%)]">
          <Link
            href="/assessment/sync"
            className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            <span>Cancel &amp; Return to Submitted Assessments</span>
          </Link>
          <span className="text-xs font-mono font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
            {formData.artNumber || submissionId}
          </span>
        </div>

        {/* OCC 409 Conflict Alert Banner */}
        {conflictError && (
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-5 shadow-xs flex items-start space-x-3.5">
            <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-rose-950">Concurrency Conflict (HTTP 409)</h3>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                {conflictError.message}
                <br />
                Your base was <strong>v{conflictError.expectedVersion}</strong>, but the sheet/server is at <strong>v{conflictError.currentVersion}</strong>.
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
                  <span>Refresh Latest Data</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Save Success Banner */}
        {saveSuccess && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center space-x-2.5 text-emerald-900 text-xs font-bold shadow-xs">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>Revision v{currentVersion + 1} saved successfully! Redirecting to Submitted Assessments...</span>
          </div>
        )}

        {/* Revision Tracking Header Card */}
        <div className="p-5 sm:p-6 bg-white border border-[hsl(215,18%,82%)] rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                Edit &amp; Amend Assessment Record
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Beneficiary: <strong className="text-slate-800">{formData.childName || 'Child'}</strong> • Unique Reference: <span className="font-mono text-teal-800">{formData.artNumber || submissionId}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[hsl(210,80%,92%)] text-[hsl(210,80%,30%)] border border-[hsl(210,80%,85%)]">
                Base Version: v{currentVersion}
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
                Submitting: Revision {currentVersion + 1}
              </span>
            </div>
          </div>

          {/* Reason for Amendment / Update Audit Trail Input */}
          <div className="pt-3 border-t border-[hsl(215,18%,90%)] space-y-1.5">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-teal-700" />
              <span>Reason for Amendment / Revision Note *</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Updated child anthropometric measurements and fee receipt for Q3 review"
              value={amendmentReason}
              onChange={(e) => setAmendmentReason(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-[hsl(215,18%,85%)] bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:bg-white"
            />
          </div>
        </div>

        {formError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-xs font-semibold text-rose-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{formError}</span>
          </div>
        )}

        {/* Complete 9-Section Comprehensive Intake Edit Form matching New Assessment */}
        <form onSubmit={handleSaveRevision} className="space-y-6">
          {/* Unified Single Survey Entity Container (Zero Gaps) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {/* SECTION 1: Caregiver Consent & Signature Gate */}
          <section id="sec-consent" className="p-6 sm:p-8 space-y-5 scroll-mt-20">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-50 text-teal-800 font-bold text-xs border border-teal-200/80">
                01
              </span>
              <h2 className="line-1 anim-typewriter text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Caregiver Consent &amp; Signature
              </h2>
            </div>

            <div className="space-y-4">
              {/* Verbatim Caregiver Audio Consent Statement & Interactive Audio Player */}
              <ConsentAudioNotice
                currentLanguage={currentLanguage}
                agreeToParticipate={formData.agreeToParticipate}
                onConsentDecision={(agreed) => setFormData({ ...formData, agreeToParticipate: agreed })}
              />

              {/* Consent Decision Radio Buttons */}
              <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2">
                <label className="text-xs font-bold text-slate-900 block">
                  DO YOU AGREE TO PARTICIPATE IN THIS SURVEY? (INFORMED CONSENT) *
                </label>
                

                <div className="flex items-center space-x-3 pt-1">
                  <label
                    className={`flex items-center space-x-2.5 px-3.5 py-2 rounded-xl border cursor-pointer transition-all ${
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
                    className={`flex items-center space-x-2.5 px-3.5 py-2 rounded-xl border cursor-pointer transition-all ${
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

              {/* Caregiver Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Caregiver's Full Name *"
                  required
                  value={formData.caregiverName}
                  onChange={(e) => setFormData({ ...formData, caregiverName: e.target.value })}
                  
                  placeholder="e.g. Manoj S."
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
                  
                  placeholder="e.g. 9822055667"
                />
              </div>

              {/* Signature Pad */}
              {formData.agreeToParticipate ? (
                <div className="pt-1">
                  <CaregiverSignaturePad
                    submissionUuid={submissionId}
                    fallbackUuid={fallbackSigUuid || submissionId}
                    initialSignatureUrl={existingSignatureUrl}
                    caregiverName={formData.caregiverName}
                    caregiverRelationship={formData.caregiverRelationship || 'Caregiver'}
                    onSignatureChange={(dataUrl) => {
                      setExistingSignatureUrl(dataUrl);
                      setHasSavedSignature(!!dataUrl);
                    }}
                    onSignatureSaved={() => setHasSavedSignature(true)}
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
          <section
            id="sec-child"
            className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  2
                </div>
                <div>
                  <h2 className="line-1 anim-typewriter text-sm sm:text-base font-bold text-slate-900">
                    Child Demographics &amp; Residence
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Child profile, date of birth, orphan status, and residential address
                  </p>
                </div>
              </div>
              <div className="flex items-center text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 w-fit">
                <User className="w-3.5 h-3.5 mr-1 text-teal-600" />
                <span>Beneficiary Profile</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* System Generated Unique ID Display */}
              <div className="p-3 bg-teal-50/80 border border-teal-200/90 rounded-xl sm:col-span-2 md:col-span-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-teal-950 uppercase tracking-wide">
                      Unique Beneficiary ID
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-teal-600 text-white rounded-md tracking-wider">
                      SYSTEM ID
                    </span>
                  </div>
                  
                </div>
                <div className="flex items-center space-x-2 bg-white px-3.5 py-2 rounded-lg border border-teal-300 font-mono text-sm font-bold text-teal-950 shadow-2xs w-fit">
                  <span>{formData.artNumber || submissionId}</span>
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
                
                placeholder="e.g. Rahul Manoj S."
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
                        className="text-teal-600 focus:ring-teal-500"
                      />
                      <span className="truncate">{st}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Input
                label="Child Aadhaar Number"
                value={formData.childAadhaarNumber}
                onChange={(e) => setFormData({ ...formData, childAadhaarNumber: e.target.value })}
                
                placeholder="e.g. 123456789012"
              />

              <div className="sm:col-span-2">
                <Input
                  label="Full Residential Address *"
                  required
                  value={formData.fullAddress}
                  onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                  placeholder="e.g. Room 4, Shanti Nagar, Near ZP School"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">State / Union Territory *</label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full h-11 px-3 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  {INDIAN_STATES_AND_UTS.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <Input
                label="District *"
                required
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

          {/* SECTION 3: Banking & KYC Documents */}
          <section
            id="sec-banking"
            className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  3
                </div>
                <div>
                  <h2 className="line-1 anim-typewriter text-sm sm:text-base font-bold text-slate-900">
                    Banking &amp; KYC Documents
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Beneficiary bank account details for direct benefit transfer and verification documents
                  </p>
                </div>
              </div>
              <div className="flex items-center text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 w-fit">
                <CreditCard className="w-3.5 h-3.5 mr-1 text-teal-600" />
                <span>DBT Verification</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="BANK ACCOUNT HOLDER NAME"
                value={formData.bankAccountHolderName}
                onChange={(e) => setFormData({ ...formData, bankAccountHolderName: e.target.value })}
                helperText="Primary account holder name as printed in passbook"
                placeholder="Name as printed in passbook"
              />
              <Input
                label="BANK ACCOUNT NUMBER"
                value={formData.bankAccountNumber}
                onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                
                placeholder="e.g. 10023456789"
              />
              <Input
                label="BANK IFSC CODE"
                value={formData.bankIfscCode}
                onChange={(e) => setFormData({ ...formData, bankIfscCode: e.target.value.toUpperCase() })}
                
                placeholder="e.g. SBIN0001234"
              />
              <Input
                label="BANK LINKED MOBILE NUMBER"
                value={formData.bankLinkedMobileNumber}
                onChange={(e) => setFormData({ ...formData, bankLinkedMobileNumber: e.target.value })}
                
                placeholder="e.g. 9822012345"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <PhotoUpload
                label="PASSBOOK FRONT PAGE PHOTO"
                
                value={formData.passbookPhotoUrl}
                onChange={(url?: string) => setFormData({ ...formData, passbookPhotoUrl: url || '' })}
              />
              <PhotoUpload
                label="AADHAAR CARD PHOTO"
                
                value={formData.aadhaarCardPhotoUrl}
                onChange={(url?: string) => setFormData({ ...formData, aadhaarCardPhotoUrl: url || '' })}
              />
              <PhotoUpload
                label="PASSPORT SIZE / BENEFICIARY PHOTO"
                helperText="Recent photograph of child beneficiary"
                value={formData.childPhotoUrl}
                onChange={(url?: string) => setFormData({ ...formData, childPhotoUrl: url || '' })}
              />
            </div>
          </section>

          {/* SECTION 4: Household & Socio-Economic Profile */}
          <section
            id="sec-household"
            className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  4
                </div>
                <div>
                  <h2 className="line-1 anim-typewriter text-sm sm:text-base font-bold text-slate-900">
                    Household &amp; Socio-Economic Profile
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Family composition, dependency ratio, and monthly livelihood context
                  </p>
                </div>
              </div>
              <div className="flex items-center text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 w-fit">
                <Home className="w-3.5 h-3.5 mr-1 text-teal-600" />
                <span>Socio-Economic Profile</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Total Family Members *"
                type="number"
                min="1"
                required
                value={formData.totalFamilyMembers || ''}
                onChange={(e) => setFormData({ ...formData, totalFamilyMembers: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
              />
              <Input
                label="NO OF CHILDREN (≤18 YRS) *"
                type="number"
                min="0"
                required
                value={(formData.numberOfChildrenUnder18 as any) !== '' && formData.numberOfChildrenUnder18 !== undefined ? formData.numberOfChildrenUnder18 : ''}
                onChange={(e) => setFormData({ ...formData, numberOfChildrenUnder18: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
              />
              <Input
                label="MONTHLY INCOME (RS.) *"
                type="number"
                min="0"
                required
                unit="₹"
                value={(formData.monthlyIncomeRs as any) !== '' && formData.monthlyIncomeRs !== undefined ? formData.monthlyIncomeRs : ''}
                onChange={(e) => setFormData({ ...formData, monthlyIncomeRs: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
              />
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">INCOME SOURCE *</label>
                <select
                  value={formData.mainSourceOfIncome}
                  onChange={(e) => setFormData({ ...formData, mainSourceOfIncome: e.target.value as MainSourceOfIncome })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="Daily wage labour">Daily wage labour</option>
                  <option value="Agriculture / farming">Agriculture / farming</option>
                  <option value="Salaried employment">Salaried employment</option>
                  <option value="Informal trade / petty shop">Informal trade / petty shop</option>
                  <option value="Domestic work">Domestic work</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </section>

          {/* SECTION 5: Clinical Health, ART & Viral Load */}
          <section
            id="sec-health"
            className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  5
                </div>
                <div>
                  <h2 className="line-1 anim-typewriter text-sm sm:text-base font-bold text-slate-900">
                    Clinical Health, ART &amp; Viral Load
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Anthropometric measurements, nutritional status, NACO ART treatment, and viral load suppression
                  </p>
                </div>
              </div>
              <div className="flex items-center text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 w-fit">
                <HeartPulse className="w-3.5 h-3.5 mr-1 text-teal-600" />
                <span>Clinical Health</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Sub-Card 1: Anthropometry & Growth (WHO Standards) */}
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                      <Scale className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Child Anthropometry &amp; Growth Assessment
                      </h4>
                      <p className="text-[11px] text-slate-500">WHO child growth benchmarks and calculated nutritional status</p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                    WHO Standards
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-stretch">
                  <Input
                    label="CURRENT WEIGHT (KG) *"
                    type="number"
                    step="0.1"
                    min="2"
                    max="150"
                    required
                    unit="kg"
                    value={formData.weightKg ? formData.weightKg : ''}
                    onChange={(e) => setFormData({ ...formData, weightKg: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                    placeholder="e.g. 14.5"
                  />

                  <Input
                    label="CURRENT HEIGHT (CM) *"
                    type="number"
                    step="0.1"
                    min="40"
                    max="220"
                    required
                    unit="cm"
                    value={formData.heightCm ? formData.heightCm : ''}
                    onChange={(e) => setFormData({ ...formData, heightCm: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                    placeholder="e.g. 98.0"
                  />

                  {/* BMI Metric Tile */}
                  <div className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all shadow-2xs ${
                    bmiValue > 0
                      ? bmiCategory === 'Normal'
                        ? 'bg-emerald-50/90 border-emerald-300'
                        : bmiCategory.includes('Underweight')
                        ? 'bg-rose-50/90 border-rose-300'
                        : 'bg-amber-50/90 border-amber-300'
                      : 'bg-slate-50/90 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wider text-slate-600">BMI</span>
                      {bmiValue > 0 ? (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          bmiCategory === 'Normal'
                            ? 'bg-emerald-200/80 text-emerald-900'
                            : bmiCategory === 'Severe Underweight'
                            ? 'bg-rose-200/80 text-rose-900 animate-pulse'
                            : 'bg-amber-200/80 text-amber-900'
                        }`}>
                          {bmiCategory}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400">Awaiting inputs</span>
                      )}
                    </div>

                    <div className="my-1 flex items-baseline gap-1.5">
                      {bmiValue > 0 ? (
                        <>
                          <span className="text-2xl font-black font-mono tracking-tight text-slate-900">{bmiValue}</span>
                          <span className="text-xs font-bold text-slate-500">kg/m²</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium italic">Enter weight &amp; height</span>
                      )}
                    </div>

                    <div className="w-full">
                      <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden flex">
                        <div className="w-1/3 bg-rose-400 h-full opacity-60" title="Underweight" />
                        <div className="w-1/2 bg-emerald-500 h-full opacity-70" title="Normal" />
                        <div className="w-1/6 bg-amber-400 h-full opacity-60" title="Overweight" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-Card 2: ART Care */}
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                      <Pill className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        HIV Clinical Care &amp; ART Regimen
                      </h4>
                      <p className="text-[11px] text-slate-500">Antiretroviral treatment verification and ART center registration</p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                    NACO Protocol
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ART STATUS *</label>
                    <select
                      value={formData.artStatus}
                      onChange={(e) => setFormData({ ...formData, artStatus: e.target.value as ARTStatus })}
                      className="w-full h-11 px-3 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      <option value="On ART">On ART</option>
                      <option value="Initiating ART">Initiating ART</option>
                      <option value="Defaulted / Lost to follow-up">Defaulted / Lost to follow-up</option>
                      <option value="Not enrolled">Not enrolled</option>
                    </select>
                  </div>

                  <Input
                    label="ART ID NUMBER *"
                    required
                    value={formData.artIdNumber}
                    onChange={(e) => setFormData({ ...formData, artIdNumber: e.target.value })}
                    placeholder="e.g. MH-PUN-00123"
                  />

                  <Input
                    label="ART REGISTRATION DATE"
                    type="date"
                    value={formData.artRegistrationDate}
                    onChange={(e) => setFormData({ ...formData, artRegistrationDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Sub-Card 3: Diagnostics Lab Monitoring (Hb & Viral Load) */}
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                      <Microscope className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Laboratory Diagnostics &amp; Biomarkers
                      </h4>
                      <p className="text-[11px] text-slate-500">Hemoglobin anemia staging and HIV viral load suppression tracking</p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                    Lab Diagnostics
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Part A: Hb */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-teal-600" />
                        Hemoglobin (Hb) Anemia Screening
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        formData.haemoglobinGdl
                          ? hbCategory === 'Normal'
                            ? 'bg-emerald-100 text-emerald-800'
                            : hbCategory === 'Severe Anemia'
                            ? 'bg-rose-100 text-rose-800 font-black animate-pulse'
                            : 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {formData.haemoglobinGdl ? hbCategory : 'Not Tested'}
                      </span>
                    </div>

                    <Input
                      label="HEMOGLOBIN (G/DL)"
                      type="number"
                      step="0.1"
                      min="2"
                      max="25"
                      unit="g/dL"
                      value={formData.haemoglobinGdl}
                      onChange={(e) => setFormData({ ...formData, haemoglobinGdl: e.target.value })}
                      placeholder="e.g. 11.2"
                    />

                    <p className="text-[11px] text-slate-500 leading-tight">
                      {formData.haemoglobinGdl ? (
                        Number(formData.haemoglobinGdl) < 7.0 ? (
                          <span className="text-rose-600 font-bold">🚨 Severe anemia (&lt; 7.0 g/dL). Referral recommended.</span>
                        ) : Number(formData.haemoglobinGdl) < 11.0 ? (
                          <span className="text-amber-700 font-medium">⚠️ Mild/Moderate anemia. Iron supplementation recommended.</span>
                        ) : (
                          <span className="text-emerald-700 font-medium">✓ Normal pediatric reference range (≥ 11.0 g/dL).</span>
                        )
                      ) : (
                        'Record recent clinical lab test result. Normal threshold is ≥ 11.0 g/dL.'
                      )}
                    </p>
                  </div>

                  {/* Part B: Viral Load */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <HeartPulse className="w-3.5 h-3.5 text-teal-600" />
                        Viral Load (VL) &amp; Suppression
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        vlCategory.includes('Undetectable') || vlCategory.includes('Suppressed')
                          ? 'bg-emerald-100 text-emerald-800'
                          : vlCategory.includes('Unsuppressed')
                          ? 'bg-rose-100 text-rose-800 font-black animate-pulse'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {vlCategory}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                          VL STATUS *
                        </label>
                        <select
                          value={formData.vlStatus}
                          onChange={(e) => setFormData({ ...formData, vlStatus: e.target.value as VLStatus })}
                          className="w-full h-11 px-2.5 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        >
                          <option value="Tested in last 6 months">Tested in last 6 months</option>
                          <option value="Tested > 6 months ago">Tested &gt; 6 months ago</option>
                          <option value="Never tested">Never tested</option>
                          <option value="Awaiting result">Awaiting result</option>
                        </select>
                      </div>

                      <Input
                        label="VIRAL LOAD TEST DATE"
                        type="date"
                        value={formData.vlDate}
                        onChange={(e) => setFormData({ ...formData, vlDate: e.target.value })}
                      />
                    </div>

                    <Input
                      label="VIRAL LOAD (COPIES/ML)"
                      value={formData.viralLoad}
                      onChange={(e) => setFormData({ ...formData, viralLoad: e.target.value })}
                      placeholder="e.g. < 50 or 450"
                    />
                  </div>
                </div>
              </div>

              {/* Sub-Card 4: Comorbidities */}
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Active Co-Morbidities &amp; Health Conditions
                  </h4>
                  <p className="text-[11px] text-slate-500">Select all confirmed conditions requiring clinical management</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {['TB (Tuberculosis)', 'Hepatitis B', 'Hepatitis C', 'Any Other Health Condition (specify)'].map((c) => {
                    const isChecked = formData.otherHealthConditions.includes(c);
                    return (
                      <label
                        key={c}
                        className={`flex items-center space-x-2.5 h-11 px-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-teal-50 border-teal-500 text-teal-950 font-bold ring-2 ring-teal-400/50'
                            : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, otherHealthConditions: [...formData.otherHealthConditions, c] });
                            } else {
                              setFormData({ ...formData, otherHealthConditions: formData.otherHealthConditions.filter((x) => x !== c) });
                            }
                          }}
                          className="rounded text-teal-600 focus:ring-teal-500 shrink-0"
                        />
                        <span className="truncate">{c}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 6: Daily Nutrition Habits */}
          <section
            id="sec-nutrition"
            className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  6
                </div>
                <div>
                  <h2 className="line-1 anim-typewriter text-sm sm:text-base font-bold text-slate-900">
                    Appetite &amp; Nutrition Habits
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Child appetite assessment and daily meal frequency
                  </p>
                </div>
              </div>
              <div className="flex items-center text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 w-fit">
                <Utensils className="w-3.5 h-3.5 mr-1 text-teal-600" />
                <span>Nutrition Tracker</span>
              </div>
            </div>

            <div className="pt-1">
              <AnimatedAppetiteSelector
                appetite={formData.appetite}
                mealsPerDay={formData.mealsPerDay}
                onAppetiteChange={(app) => setFormData((prev) => ({ ...prev, appetite: app }))}
                onMealsChange={(m) => setFormData((prev) => ({ ...prev, mealsPerDay: m }))}
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
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">EDUCATION STATUS *</label>
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
                      className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        formData.educationStatus === st
                          ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="educationStatus"
                        value={st}
                        checked={formData.educationStatus === st}
                        onChange={() => setFormData({ ...formData, educationStatus: st as EducationStatus })}
                        className="text-teal-600 focus:ring-teal-500"
                      />
                      <span className="truncate">{st}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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
                  onChange={(e) => setFormData({ ...formData, schoolSessionStartDate: e.target.value })}
                  
                />
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">SCHOOL TYPE</label>
                  <select
                    value={formData.schoolType}
                    onChange={(e) => setFormData({ ...formData, schoolType: e.target.value as SchoolType })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="Government school">Government school</option>
                    <option value="Private school">Private school</option>
                    <option value="Government aided">Government aided</option>
                    <option value="Special school">Special school</option>
                  </select>
                </div>
                <Input
                  label="CURRENT CLASS"
                  value={formData.currentClass}
                  onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                  placeholder="e.g. Class 2"
                />
                <div className="sm:col-span-3">
                  <label className="text-xs font-bold text-slate-800 block mb-1">ATTENDANCE STATUS</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Regular', 'Irregular', 'Dropped out'] as AttendanceType[]).map((att) => (
                      <label
                        key={att}
                        className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                          formData.attendance === att
                            ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="attendance"
                          value={att}
                          checked={formData.attendance === att}
                          onChange={() => setFormData({ ...formData, attendance: att })}
                          className="text-teal-600 focus:ring-teal-500"
                        />
                        <span>{att}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 8: Education Expenses & Aid Breakdown */}
          <section
            id="sec-expenses"
            className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  8
                </div>
                <div>
                  <h2 className="line-1 anim-typewriter text-sm sm:text-base font-bold text-slate-900">
                    Education Expenses &amp; Aid Breakdown
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Annual and monthly school expenditures, required support schedule, and bill receipts
                  </p>
                </div>
              </div>
              <div className="flex items-center text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 w-fit">
                <FileCheck className="w-3.5 h-3.5 mr-1 text-teal-600" />
                <span>Support Schedule</span>
              </div>
            </div>

            {/* Expenses & Approval Grid */}
            <div className="pt-2">
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
                onCurrentExpenseChange={(field: string, val: number) =>
                  setFormData((prev) => ({ ...prev, [field]: val }))
                }
                onRequiredSupportChange={(field: string, val: number) =>
                  setFormData((prev) => ({ ...prev, [field]: val }))
                }
                onReceiptPhotoChange={(url?: string) =>
                  setFormData((prev) => ({ ...prev, feeReceiptPhotoUrl: url || '' }))
                }
                onMarksheetPhotoChange={(url?: string) =>
                  setFormData((prev) => ({ ...prev, marksheetPhotoUrl: url || '' }))
                }
                onRemarksChange={(rem: string) =>
                  setFormData((prev) => ({ ...prev, remarks: rem }))
                }
              />
            </div>
          </section>

          {/* SECTION 9: Review & Submitter Attestation */}
          <section
            id="sec-review"
            className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  9
                </div>
                <div>
                  <h2 className="line-1 anim-typewriter text-sm sm:text-base font-bold text-slate-900">
                    Review &amp; Submitter Attestation
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Alliance India approval decision, data verification, and caseworker sign-off
                  </p>
                </div>
              </div>
              <div className="flex items-center text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 w-fit">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-teal-600" />
                <span>Programme Sign-Off</span>
              </div>
            </div>

            {/* Verification & Review Confirmation Card */}
            <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-teal-950 uppercase tracking-wide">
                  Caseworker Verification &amp; Accuracy Attestation *
                </h4>
                <p className="text-[11px] text-teal-800/90 mt-0.5">
                  Confirm all clinical metrics, educational needs, and guardian identity documents have been verified.
                </p>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <label
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all shadow-2xs ${
                    formData.allInfoCorrect
                      ? 'bg-emerald-600 border-emerald-600 text-white font-bold ring-2 ring-emerald-400/40 shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="allInfoCorrect"
                    checked={formData.allInfoCorrect}
                    onChange={() => setFormData({ ...formData, allInfoCorrect: true })}
                    className="accent-emerald-600 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Yes — Verified</span>
                </label>
                <label
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all shadow-2xs ${
                    !formData.allInfoCorrect
                      ? 'bg-rose-600 border-rose-600 text-white font-bold ring-2 ring-rose-400/40 shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="allInfoCorrect"
                    checked={!formData.allInfoCorrect}
                    onChange={() => setFormData({ ...formData, allInfoCorrect: false })}
                    className="accent-rose-600 text-rose-600 focus:ring-rose-500"
                  />
                  <span>No — Needs Review</span>
                </label>
              </div>
            </div>

            {/* Submitter & Organization Details in Clean 3-Column Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <Input
                label="FORM SUBMITTED BY (INTERVIEWER NAME) *"
                required
                value={formData.formSubmittedBy}
                onChange={(e) => setFormData({ ...formData, formSubmittedBy: e.target.value })}
                placeholder="e.g. Sunita Sharma"
              />

              <Input
                label="ORGANIZATION NAME"
                value={formData.organizationName}
                onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                placeholder="India HIV/AIDS Alliance"
              />

              <Input
                label="ORGANIZATION EMAIL ID"
                type="email"
                value={formData.organizationEmail}
                onChange={(e) => setFormData({ ...formData, organizationEmail: e.target.value })}
                placeholder="fieldworker@allianceindia.org"
              />
            </div>
          </section>
          </div>

          {/* Form Action Footer */}
          <div className="flex items-center justify-between pt-4 pb-12">
            <Link href="/assessment/sync">
              <Button type="button" variant="secondary" className="px-5">
                Cancel
              </Button>
            </Link>

            <Button
              type="submit"
              variant="primary"
              disabled={isSaving}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-8 py-3 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving Revision…' : `Save & Submit Revision (v${currentVersion + 1})`}</span>
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
