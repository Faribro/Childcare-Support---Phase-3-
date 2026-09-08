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
      let foundRecord: any = null;

      // 1. Check local Dexie sync queue
      try {
        const queue = await getAllQueueItems();
        const queued = queue.find(
          (q) =>
            q.submissionUuid === submissionId ||
            q.payload?.demographics?.artNumber === submissionId ||
            String(q.id) === submissionId
        );
        if (queued && queued.payload) {
          foundRecord = queued.payload;
          if (queued.expectedVersion) {
            setCurrentVersion(queued.expectedVersion);
          }
        }
      } catch (_) {}

      // 2. Check local Dexie drafts
      if (!foundRecord) {
        try {
          const drafts = await getAllDrafts();
          const draft = drafts.find(
            (d) =>
              d.uuid === submissionId ||
              d.demographics?.artNumber === submissionId ||
              String(d.id) === submissionId
          );
          if (draft) foundRecord = draft;
        } catch (_) {}
      }

      // 3. Check remote API
      try {
        const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`);
        if (res.ok) {
          const body = await res.json();
          if (body.data) {
            foundRecord = body.data;
          }
        }
      } catch (_) {}

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
          passbookPhotoUrl: b.passbookPhotoUrl || foundRecord['25\nPassbook Front Page Link'] || '',
          aadhaarCardPhotoUrl: b.aadhaarCardPhotoUrl || foundRecord['26\nAadhaar Card Link'] || '',
          childPhotoUrl: b.childPhotoUrl || foundRecord['27\nPassport Size Photo Link'] || '',

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
          feeReceiptPhotoUrl: exp.feeReceiptPhotoUrl || foundRecord['64\nSchool Fee Receipt Link'] || '',
          marksheetPhotoUrl: exp.marksheetPhotoUrl || foundRecord['65\nMarksheet Photo Link'] || '',
          remarks: exp.remarks || foundRecord['66\nRemarks (If Any)'] || '',

          requiredSchoolFees: Number(req.requiredSchoolFees || 0),
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
          const sig = await getCaregiverSignatureBlob(submissionId);
          setHasSavedSignature(!!sig);
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
          consent: { agreeToParticipate: formData.agreeToParticipate },
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

        {/* Complete 8-Section Comprehensive Intake Edit Form */}
        <form onSubmit={handleSaveRevision} className="space-y-6">
          {/* Section 1: Child & Caregiver Details */}
          <section className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[hsl(210,80%,35%)] flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <User className="h-4 w-4" />
              <span>1. Child &amp; Caregiver Demographics</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="ART Registration Number *"
                required
                value={formData.artNumber}
                onChange={(e) => setFormData({ ...formData, artNumber: e.target.value })}
              />
              <Input
                label="Date of Filling"
                type="date"
                value={formData.dateOfFilling}
                onChange={(e) => setFormData({ ...formData, dateOfFilling: e.target.value })}
              />
              <Input
                label="Child Full Name *"
                required
                value={formData.childName}
                onChange={(e) => setFormData({ ...formData, childName: e.target.value })}
              />
              <div>
                <Input
                  label="Date of Birth *"
                  type="date"
                  required
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                />
                {ageResult.years > 0 && (
                  <span className="text-[11px] font-semibold text-teal-800 mt-1 block">
                    Calculated Age: {ageResult.years} yrs, {ageResult.months} mos
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Gender *</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Transgender">Transgender</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Orphan Status *</label>
                <select
                  value={formData.orphanStatus}
                  onChange={(e) => setFormData({ ...formData, orphanStatus: e.target.value as OrphanStatus })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Both parents alive">Both parents alive</option>
                  <option value="Maternal orphan">Maternal orphan</option>
                  <option value="Paternal orphan">Paternal orphan</option>
                  <option value="Double orphan">Double orphan</option>
                </select>
              </div>

              <Input
                label="Primary Caregiver Full Name *"
                required
                value={formData.caregiverName}
                onChange={(e) => setFormData({ ...formData, caregiverName: e.target.value })}
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Caregiver Relationship *</label>
                <select
                  value={formData.caregiverRelationship}
                  onChange={(e) => setFormData({ ...formData, caregiverRelationship: e.target.value as CaregiverRelationship })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Mother">Mother</option>
                  <option value="Father">Father</option>
                  <option value="Grandmother">Grandmother</option>
                  <option value="Grandfather">Grandfather</option>
                  <option value="Aunt">Aunt</option>
                  <option value="Uncle">Uncle</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Legal Guardian">Legal Guardian</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <Input
                label="Contact Number (10 digits) *"
                type="tel"
                required
                value={formData.contactNumber}
                onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
              />

              <Input
                label="Child Aadhaar Number"
                value={formData.childAadhaarNumber}
                onChange={(e) => setFormData({ ...formData, childAadhaarNumber: e.target.value })}
              />

              <div className="sm:col-span-2">
                <Input
                  label="Full Residential Address"
                  value={formData.fullAddress}
                  onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">State *</label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
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
              />
            </div>
          </section>

          {/* Section 2: Caregiver Consent */}
          <section className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[hsl(210,80%,35%)] flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <ShieldCheck className="h-4 w-4" />
              <span>2. Caregiver Consent</span>
            </h2>

            <div className="space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.agreeToParticipate}
                  onChange={(e) => setFormData({ ...formData, agreeToParticipate: e.target.checked })}
                  className="mt-1 h-4 w-4 text-teal-600 rounded border-slate-300"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  I agree to participate in the Child Care &amp; Nutrition Support Project, and confirm that all information provided is true and verifiable.
                </span>
              </label>

              <CaregiverSignaturePad
                submissionUuid={submissionId}
                caregiverName={formData.caregiverName}
                caregiverRelationship={formData.caregiverRelationship || 'Caregiver'}
                onSignatureSaved={() => setHasSavedSignature(true)}
              />
            </div>
          </section>

          {/* Section 3: Banking & Identification (KYC) Details */}
          <section className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[hsl(210,80%,35%)] flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <CreditCard className="h-4 w-4" />
              <span>3. Banking &amp; KYC Identification</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Account Holder Name"
                value={formData.bankAccountHolderName}
                onChange={(e) => setFormData({ ...formData, bankAccountHolderName: e.target.value })}
              />
              <Input
                label="Bank Account Number"
                value={formData.bankAccountNumber}
                onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
              />
              <Input
                label="Bank IFSC Code"
                value={formData.bankIfscCode}
                onChange={(e) => setFormData({ ...formData, bankIfscCode: e.target.value.toUpperCase() })}
              />
              <Input
                label="Bank Linked Mobile Number"
                value={formData.bankLinkedMobileNumber}
                onChange={(e) => setFormData({ ...formData, bankLinkedMobileNumber: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <PhotoUpload
                label="Passbook Photo"
                value={formData.passbookPhotoUrl}
                onChange={(url?: string) => setFormData({ ...formData, passbookPhotoUrl: url || '' })}
              />
              <PhotoUpload
                label="Aadhaar Card Photo"
                value={formData.aadhaarCardPhotoUrl}
                onChange={(url?: string) => setFormData({ ...formData, aadhaarCardPhotoUrl: url || '' })}
              />
              <PhotoUpload
                label="Child Beneficiary Photo"
                value={formData.childPhotoUrl}
                onChange={(url?: string) => setFormData({ ...formData, childPhotoUrl: url || '' })}
              />
            </div>
          </section>

          {/* Section 4: Household & Financial Details */}
          <section className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[hsl(210,80%,35%)] flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <FileText className="h-4 w-4" />
              <span>4. Household &amp; Financial Assessment</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Total Household Members"
                type="number"
                value={formData.totalFamilyMembers}
                onChange={(e) => setFormData({ ...formData, totalFamilyMembers: Number(e.target.value) })}
              />
              <Input
                label="Number of Children (< 18)"
                type="number"
                value={formData.numberOfChildrenUnder18}
                onChange={(e) => setFormData({ ...formData, numberOfChildrenUnder18: Number(e.target.value) })}
              />
              <Input
                label="Monthly Income (₹)"
                type="number"
                value={formData.monthlyIncomeRs}
                onChange={(e) => setFormData({ ...formData, monthlyIncomeRs: Number(e.target.value) })}
                unit="₹"
              />
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Main Source of Income</label>
                <select
                  value={formData.mainSourceOfIncome}
                  onChange={(e) => setFormData({ ...formData, mainSourceOfIncome: e.target.value as MainSourceOfIncome })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Daily wage labour">Daily wage labour</option>
                  <option value="Agriculture / Farming">Agriculture / Farming</option>
                  <option value="Salaried employment">Salaried employment</option>
                  <option value="Small business / Vending">Small business / Vending</option>
                  <option value="Poverty / Dependent on support">Poverty / Dependent on support</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </section>

          {/* Section 5: Clinical & ART Status */}
          <section className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[hsl(210,80%,35%)] flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <HeartPulse className="h-4 w-4" />
              <span>5. Health, Clinical &amp; ART Measurements</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Input
                  label="Weight (kg) *"
                  type="number"
                  step="0.1"
                  required
                  value={formData.weightKg}
                  onChange={(e) => setFormData({ ...formData, weightKg: Number(e.target.value) })}
                  unit="kg"
                />
              </div>

              <div>
                <Input
                  label="Height (cm) *"
                  type="number"
                  step="0.1"
                  required
                  value={formData.heightCm}
                  onChange={(e) => setFormData({ ...formData, heightCm: Number(e.target.value) })}
                  unit="cm"
                />
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">BMI &amp; Category</span>
                <div className="flex items-center gap-2 h-9">
                  <span className="font-mono font-bold text-sm text-slate-900">{bmiValue.toFixed(1)}</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {bmiCategory}
                  </span>
                </div>
              </div>

              <Input
                label="Haemoglobin (g/dL)"
                value={formData.haemoglobinGdl}
                onChange={(e) => setFormData({ ...formData, haemoglobinGdl: e.target.value })}
                unit="g/dL"
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ART Status</label>
                <select
                  value={formData.artStatus}
                  onChange={(e) => setFormData({ ...formData, artStatus: e.target.value as ARTStatus })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="On ART">On ART</option>
                  <option value="Pre-ART">Pre-ART</option>
                  <option value="Transferred in">Transferred in</option>
                  <option value="Loss to follow-up">Loss to follow-up</option>
                </select>
              </div>

              <Input
                label="ART Registration Date"
                type="date"
                value={formData.artRegistrationDate}
                onChange={(e) => setFormData({ ...formData, artRegistrationDate: e.target.value })}
              />

              <Input
                label="ART ID / Linked Number"
                value={formData.artIdNumber}
                onChange={(e) => setFormData({ ...formData, artIdNumber: e.target.value })}
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Viral Load Status</label>
                <select
                  value={formData.vlStatus}
                  onChange={(e) => setFormData({ ...formData, vlStatus: e.target.value as VLStatus })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Tested in last 6 months">Tested in last 6 months</option>
                  <option value="Tested > 6 months ago">Tested &gt; 6 months ago</option>
                  <option value="Never tested">Never tested</option>
                  <option value="Awaiting result">Awaiting result</option>
                </select>
              </div>

              <Input
                label="Viral Load Count / Result"
                value={formData.viralLoad}
                onChange={(e) => setFormData({ ...formData, viralLoad: e.target.value })}
              />
            </div>
          </section>

          {/* Section 6: Nutrition Habits */}
          <section className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[hsl(210,80%,35%)] flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Utensils className="h-4 w-4" />
              <span>6. Nutrition Habits</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Appetite Level</label>
                <select
                  value={formData.appetite}
                  onChange={(e) => setFormData({ ...formData, appetite: e.target.value as AppetiteLevel })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Good">Good</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Poor">Poor</option>
                </select>
              </div>

              <Input
                label="Meals Per Day"
                type="number"
                value={formData.mealsPerDay}
                onChange={(e) => setFormData({ ...formData, mealsPerDay: Number(e.target.value) })}
              />
            </div>
          </section>

          {/* Section 7: Education Status & Expenses */}
          <section className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[hsl(210,80%,35%)] flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <GraduationCap className="h-4 w-4" />
              <span>7. Education Status &amp; Annual Expenses</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Education Status</label>
                <select
                  value={formData.educationStatus}
                  onChange={(e) => setFormData({ ...formData, educationStatus: e.target.value as EducationStatus })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Currently going to school">Currently going to school</option>
                  <option value="Never enrolled">Never enrolled</option>
                  <option value="Dropped out">Dropped out</option>
                  <option value="Completed 10th">Completed 10th</option>
                  <option value="Vocational training">Vocational training</option>
                </select>
              </div>

              <Input
                label="School / Institution Name"
                value={formData.schoolName}
                onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">School Type</label>
                <select
                  value={formData.schoolType}
                  onChange={(e) => setFormData({ ...formData, schoolType: e.target.value as SchoolType })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Government school">Government school</option>
                  <option value="Private school">Private school</option>
                  <option value="Government aided">Government aided</option>
                  <option value="Special school">Special school</option>
                </select>
              </div>

              <Input
                label="Current Class / Grade"
                value={formData.currentClass}
                onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Attendance Status</label>
                <select
                  value={formData.attendance}
                  onChange={(e) => setFormData({ ...formData, attendance: e.target.value as AttendanceType })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Regular">Regular</option>
                  <option value="Irregular">Irregular</option>
                </select>
              </div>
            </div>

            {/* Expenses & Approval Grid */}
            <div className="pt-2 border-t border-slate-100">
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

          {/* Section 8: Support Required & Final Review */}
          <section className="bg-white rounded-2xl border border-[hsl(215,18%,85%)] p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[hsl(210,80%,35%)] flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <ShieldCheck className="h-4 w-4" />
              <span>8. Support Required &amp; Caseworker Declaration</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Required School Fees"
                type="number"
                value={formData.requiredSchoolFees}
                onChange={(e) => setFormData({ ...formData, requiredSchoolFees: Number(e.target.value) })}
                unit="₹"
              />
              <Input
                label="Required Books"
                type="number"
                value={formData.requiredBooks}
                onChange={(e) => setFormData({ ...formData, requiredBooks: Number(e.target.value) })}
                unit="₹"
              />
              <Input
                label="Required Stationery"
                type="number"
                value={formData.requiredStationery}
                onChange={(e) => setFormData({ ...formData, requiredStationery: Number(e.target.value) })}
                unit="₹"
              />
              <Input
                label="Required Uniform"
                type="number"
                value={formData.requiredUniform}
                onChange={(e) => setFormData({ ...formData, requiredUniform: Number(e.target.value) })}
                unit="₹"
              />
              <Input
                label="Required Transport"
                type="number"
                value={formData.requiredTransport}
                onChange={(e) => setFormData({ ...formData, requiredTransport: Number(e.target.value) })}
                unit="₹"
              />
              <Input
                label="Required Other Support"
                type="number"
                value={formData.requiredOtherSupport}
                onChange={(e) => setFormData({ ...formData, requiredOtherSupport: Number(e.target.value) })}
                unit="₹"
              />
            </div>

            <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl flex items-center justify-between">
              <span className="text-xs font-bold text-teal-950">Total Support Required:</span>
              <span className="text-base font-bold text-teal-900">₹{totalRequiredSupport.toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <Input
                label="Caseworker / Submitter Name *"
                required
                value={formData.formSubmittedBy}
                onChange={(e) => setFormData({ ...formData, formSubmittedBy: e.target.value })}
              />
              <Input
                label="Organization Name"
                value={formData.organizationName}
                onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
              />
            </div>
          </section>

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
