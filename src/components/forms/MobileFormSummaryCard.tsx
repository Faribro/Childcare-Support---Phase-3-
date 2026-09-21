'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';

interface MobileFormSummaryCardProps {
  formData: any;
  hasSavedSignature: boolean;
  totalRequiredSupport: number;
  onJumpToSection: (sectionIndex: number) => void;
}

export function MobileFormSummaryCard({
  formData,
  hasSavedSignature,
  totalRequiredSupport,
  onJumpToSection,
}: MobileFormSummaryCardProps) {
  const summaryItems = [
    {
      index: 0,
      label: 'Caregiver Consent',
      isComplete: formData.agreeToParticipate === true && hasSavedSignature,
      summary:
        formData.agreeToParticipate === true
          ? hasSavedSignature
            ? 'Consent granted & signature saved'
            : 'Consent granted, signature pending'
          : 'Consent not granted',
    },
    {
      index: 1,
      label: 'Child Demographics',
      isComplete: Boolean(formData.childName && formData.dateOfBirth && formData.gender),
      summary: formData.childName
        ? `${formData.childName} • ${formData.district || 'District pending'}`
        : 'Incomplete child profile',
    },
    {
      index: 2,
      label: 'Banking & KYC',
      isComplete: Boolean(formData.accountHolderName && formData.bankAccountNumber),
      summary: formData.bankAccountNumber
        ? `Account: ••••${String(formData.bankAccountNumber).slice(-4)}`
        : 'Bank details pending',
    },
    {
      index: 3,
      label: 'Household & Socio-Economic',
      isComplete: Boolean(formData.primaryCaregiverName && formData.monthlyHouseholdIncome),
      summary: formData.primaryCaregiverName
        ? `Caregiver: ${formData.primaryCaregiverName}`
        : 'Household details pending',
    },
    {
      index: 4,
      label: 'Clinical & ART Health',
      isComplete: Boolean(formData.artNumber && formData.onArt !== undefined),
      summary: formData.artNumber
        ? `ART ID: ${formData.artNumber} • ${formData.viralLoadCategory || 'VL recorded'}`
        : 'Clinical metrics pending',
    },
    {
      index: 5,
      label: 'Anthropometry & Nutrition',
      isComplete: Boolean(formData.weightKg && formData.heightCm),
      summary: formData.weightKg
        ? `Weight: ${formData.weightKg} kg • ${formData.bmiCategory || 'BMI evaluated'}`
        : 'Measurements pending',
    },
    {
      index: 6,
      label: 'Education Assessment',
      isComplete: Boolean(formData.schoolEnrolled !== undefined),
      summary: formData.schoolEnrolled
        ? `${formData.schoolType || 'Enrolled'} • Grade ${formData.currentGrade || 'N/A'}`
        : 'School enrollment recorded',
    },
    {
      index: 7,
      label: 'Education Aid Breakdown',
      isComplete: totalRequiredSupport > 0,
      summary: `Total aid requested: ₹${totalRequiredSupport}`,
    },
  ];

  const completedCount = summaryItems.filter((i) => i.isComplete).length;

  return (
    <div className="md:hidden bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 mb-4">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Form Completion Checklist
          </h4>
          <p className="text-[11px] text-slate-500">
            Review all sections before final caseworker attestation
          </p>
        </div>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
          {completedCount}/8 Done
        </span>
      </div>

      <div className="space-y-1.5">
        {summaryItems.map((item) => (
          <button
            key={item.index}
            type="button"
            onClick={() => onJumpToSection(item.index)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/90 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer min-h-[40px]"
          >
            <div className="flex items-center gap-2 min-w-0">
              {item.isComplete ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{item.label}</p>
                <p className="text-[10px] text-slate-500 truncate">{item.summary}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-slate-400 shrink-0 ml-2">
              <span className="text-[10px] text-teal-700 font-medium">Edit</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
