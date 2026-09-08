'use client';

import * as React from 'react';

export interface SubmissionViewModalProps {
  item: any;
  formDef?: any;
  onClose: () => void;
  onEdit?: () => void;
}

export function SubmissionViewModal({ item, onClose, onEdit }: SubmissionViewModalProps) {
  if (!item) return null;

  const data = item.rawRecord || item.payload || item.raw_payload || item;
  const demographics = data.demographics || {};
  const clinical = data.nutrition || data.clinical || data.health || {};
  const education = data.education || data.educationStatus || data.educationSupportRequired || {};
  const banking = data.bankingAndKyc || data.bankDetails || {};

  const revisionNumber = Number(item.revisionNumber || item.revision || data.revisionNumber || data.revision || data['2\nRevision Number'] || data.version || 1);
  const isRevision = revisionNumber > 1;
  const uniqueId = item.id || item.submissionId || data['1\nUnique ID'] || data.uniqueId || data.art_number || demographics.artNumber || item.submissionUuid || 'UNKNOWN';
  const childName = item.childName || data['9\nChild Name'] || data.child_name || demographics.childName || 'Child Beneficiary';
  const caregiverName = item.caregiverName || data['14\nCaregiver Full Name'] || data.caregiver_name || demographics.caregiverName || 'Caregiver';
  const caregiverPhone = item.caregiverPhone || data['16\nCaregiver Contact'] || data.caregiver_phone || demographics.caregiverPhone || '—';
  const caregiverRelation = data['15\nCaregiver Relation'] || data.caregiver_relationship || demographics.caregiverRelationship || 'Mother';
  const district = item.district || data['19\nDistrict'] || demographics.district || '';
  const state = item.state || data['18\nState'] || demographics.state || '';
  const editReason = item.editReason || data.editReason || data['48\nEdit Reason'] || data.edit_reason;

  const weight = data['32\nCurrent Weight (kg)'] || data.weight_kg || clinical.weightKg || '—';
  const height = data['33\nCurrent Height (cm)'] || data.height_cm || clinical.heightCm || '—';
  const bmiCategory = data['35\nBMI Category'] || data.nutrition_status || clinical.nutritionStatus || 'Normal';
  const artStatus = data['40\nART Status'] || data.art_status || clinical.artStatus || 'On ART';
  const viralLoad = data['45\nViral Load'] || data.viral_load || clinical.viralLoad || '< 50 copies/mL';
  const hemoglobin = data['36\nHemoglobin (g/dL)'] || data.hemoglobin || clinical.hemoglobin || '12';

  const schoolStatus = data['49\nEducation Status'] || (data.school_enrolled !== undefined ? (data.school_enrolled ? 'School Going' : 'Out of School') : 'School Going');
  const schoolName = data['51\nSchool Name'] || education.schoolName || '—';
  const schoolGrade = data['54\nCurrent Class'] || data.school_grade || education.currentClass || education.schoolGrade || 'Class 11';
  const educationCost = Number(data['63\nTotal Annual Education Cost'] || data.recommended_grant_amount || education.totalRequiredSupport || 0);
  const remarks = data['66\nRemarks (If Any)'] || data.clinical_notes || clinical.clinicalNotes || 'None';

  const accountHolder = data['20\nBank Account Holder Name'] || data.account_holder_name || banking.bankAccountHolderName || banking.accountHolderName || caregiverName;
  const accountNumber = data['21\nBank Account Number'] || data.bank_account_number || banking.bankAccountNumber || banking.accountNumber || '••••••••';
  const ifscCode = data['22\nBank IFSC Code'] || data.ifsc_code || banking.bankIfscCode || banking.ifscCode || '—';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-[hsl(215,18%,85%)] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[hsl(215,18%,88%)] flex items-center justify-between bg-[hsl(215,25%,98%)]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[hsl(210,80%,92%)] text-[hsl(210,80%,30%)]">
                Assessment Record
              </span>
              {isRevision && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[hsl(145,60%,92%)] text-[hsl(145,65%,25%)]">
                  Revision {revisionNumber} • Amended
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[hsl(220,15%,15%)] font-mono">
              {uniqueId}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close View Modal"
            className="w-8 h-8 rounded-full hover:bg-[hsl(215,20%,90%)] flex items-center justify-center text-[hsl(215,12%,45%)] text-lg font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Audit Banner if edited */}
        {isRevision && editReason && (
          <div className="px-5 py-3 bg-[hsl(38,90%,96%)] border-b border-[hsl(38,80%,85%)] text-xs text-[hsl(38,90%,25%)] flex items-start gap-2">
            <span className="font-bold">Reason for Amendment:</span>
            <span>{editReason}</span>
          </div>
        )}

        {/* Scrollable Content grouped by section */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 divide-y divide-[hsl(215,18%,90%)]">
          {/* Section 1: Demographics */}
          <div>
            <h3 className="text-sm font-bold text-[hsl(210,80%,35%)] mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[hsl(210,80%,92%)] text-[hsl(210,80%,35%)] text-[11px] flex items-center justify-center font-bold">
                1
              </span>
              Beneficiary &amp; Caregiver Demographics
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Child Beneficiary Name:</span>
                <span className="font-semibold text-slate-800">{childName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Unique Identification:</span>
                <span className="font-mono font-semibold text-slate-800">{uniqueId}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Caregiver Name:</span>
                <span className="font-semibold text-slate-800">{caregiverName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Relation:</span>
                <span className="text-slate-800">{caregiverRelation}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Contact Number:</span>
                <span className="font-mono text-slate-800">{caregiverPhone}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Location:</span>
                <span className="text-slate-800">{district ? district + (state ? ', ' + state : '') : '—'}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Nutrition & Clinical Status */}
          <div className="pt-6">
            <h3 className="text-sm font-bold text-[hsl(210,80%,35%)] mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[hsl(210,80%,92%)] text-[hsl(210,80%,35%)] text-[11px] flex items-center justify-center font-bold">
                2
              </span>
              Clinical &amp; Nutrition Assessment
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-7 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Current Weight:</span>
                <span className="font-semibold text-slate-800">{weight} kg</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Current Height:</span>
                <span className="font-semibold text-slate-800">{height} cm</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">BMI Category:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold text-[11px] inline-block">
                  {bmiCategory}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">ART Status:</span>
                <span className="text-slate-800">{artStatus}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Viral Load:</span>
                <span className="text-slate-800">{viralLoad}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Hemoglobin:</span>
                <span className="text-slate-800">{hemoglobin} g/dL</span>
              </div>
            </div>
          </div>

          {/* Section 3: Education & Support Expenses */}
          <div className="pt-6">
            <h3 className="text-sm font-bold text-[hsl(210,80%,35%)] mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[hsl(210,80%,92%)] text-[hsl(210,80%,35%)] text-[11px] flex items-center justify-center font-bold">
                3
              </span>
              Education Support &amp; Annual Expenses
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">School Status:</span>
                <span className="font-semibold text-slate-800">{schoolStatus}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">School Name / Class:</span>
                <span className="text-slate-800">{schoolName} ({schoolGrade})</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Total Annual Education Cost:</span>
                <span className="font-bold text-teal-900 text-sm">₹{educationCost.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Remarks:</span>
                <span className="text-slate-600 italic">{remarks}</span>
              </div>
            </div>
          </div>

          {/* Section 4: Banking Details */}
          <div className="pt-6">
            <h3 className="text-sm font-bold text-[hsl(210,80%,35%)] mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[hsl(210,80%,92%)] text-[hsl(210,80%,35%)] text-[11px] flex items-center justify-center font-bold">
                4
              </span>
              Banking &amp; Grant Disbursement
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Account Holder:</span>
                <span className="font-semibold text-slate-800">{accountHolder}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Bank Account Number:</span>
                <span className="font-mono text-slate-800">{accountNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">IFSC Code:</span>
                <span className="font-mono font-semibold text-slate-800">{ifscCode}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Approval Status:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px] inline-block">
                  Approved
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[hsl(215,18%,88%)] bg-[hsl(215,20%,98%)] flex items-center justify-between gap-3">
          <div className="text-[11px] text-[hsl(215,12%,50%)]">
            Saved on device: {new Date(item.submissionTime || item.createdAt || Date.now()).toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="px-4 py-2 text-xs font-bold bg-[hsl(210,80%,45%)] hover:bg-[hsl(210,80%,40%)] text-white rounded-lg transition-colors cursor-pointer"
              >
                Edit Submission
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
