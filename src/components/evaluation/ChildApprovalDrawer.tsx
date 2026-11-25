'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  School,
  HeartHandshake,
  MapPin,
  IndianRupee,
  User,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { CosmicSpaceButton } from '@/components/ui/CosmicSpaceButton';
import { triggerHaptic } from '@/hooks/useMobileTouch';
import { cosmicSound } from '@/lib/audio/cosmicSoundEngine';
import type { EvaluationBeneficiaryRow } from './EvaluationLinelistTable';

interface ChildApprovalDrawerProps {
  isOpen: boolean;
  row: EvaluationBeneficiaryRow | null;
  rawRecord?: any;
  isLoading?: boolean;
  onClose: () => void;
  onConfirmApproval: (row: EvaluationBeneficiaryRow) => Promise<void>;
  onViewDossier?: (row: EvaluationBeneficiaryRow) => void;
}

const KYC_DOCS_LIST = [
  { key: 'aadhaar', label: 'Aadhaar Card', icon: FileText },
  { key: 'passbook', label: 'Bank Passbook / Details', icon: FileText },
  { key: 'photo', label: 'Beneficiary Passport Photo', icon: FileText },
  { key: 'signature', label: 'Caregiver Signed Consent', icon: FileText },
  { key: 'school', label: 'School Enrollment / Fee Receipt', icon: School },
];

export function ChildApprovalDrawer({
  isOpen,
  row,
  rawRecord,
  isLoading = false,
  onClose,
  onConfirmApproval,
  onViewDossier,
}: ChildApprovalDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !row) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirmApproval(row);
      cosmicSound.playEvaluationUnlock();
      triggerHaptic('success');
      onClose();
    } catch {
      triggerHaptic('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDocMissing = (docKey: string): boolean => {
    const lowerKey = docKey.toLowerCase();
    const missing = row.missingDocs || [];
    return missing.some((m) => m.toLowerCase().includes(lowerKey));
  };

  const shortId = row.displayCode || `#${row.id.slice(0, 8).toUpperCase()}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end transition-opacity duration-300 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-sheet-title"
    >
      {/* Backdrop tap to close */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
        aria-hidden="true"
      />

      {/* Slide-over Container: Drawer on md+, Bottom Sheet on mobile */}
      <div className="relative w-full max-w-lg bg-white h-full max-h-[92vh] sm:max-h-full sm:h-full mt-auto sm:mt-0 rounded-t-3xl sm:rounded-none sm:rounded-l-3xl shadow-2xl flex flex-col overflow-hidden border-t sm:border-t-0 sm:border-l border-sky-100 z-10 animate-in slide-in-from-bottom-10 sm:slide-in-from-right-10 duration-300">
        {/* Drawer Header with Authority Cosmic Gradient */}
        <div
          className="relative px-6 py-5 text-white shrink-0 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #07225E 0%, #0F3E9E 58%, #1E5CC7 100%)',
          }}
        >
          {/* Subtle celestial stars */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" aria-hidden="true">
            <span className="absolute top-3 left-8 w-1 h-1 bg-white rounded-full" />
            <span className="absolute top-6 right-16 w-1.5 h-1.5 bg-white rounded-full" />
            <span className="absolute bottom-4 left-1/3 w-1 h-1 bg-white rounded-full" />
            <span className="absolute bottom-2 right-1/4 w-1.5 h-1.5 bg-white rounded-full" />
          </div>

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-[11px] font-bold text-sky-200">
                <ShieldCheck className="h-3.5 w-3.5 text-sky-300" />
                <span>Grant Approval Verification</span>
              </div>
              <h2 id="approval-sheet-title" className="mt-2 text-xl font-extrabold tracking-tight">
                {row.childName}
              </h2>
              <p className="text-xs text-sky-100/80 font-mono mt-0.5">
                Ref ID: {shortId} · {row.ageText} · {row.sexText}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close approval drawer"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 cosmic-scroll text-slate-800">
          {/* Grant Entitlement Card */}
          <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white border border-sky-200 text-[#093282] flex items-center justify-center shadow-xs">
                <IndianRupee className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Approved Financial Entitlement
                </div>
                <div className="text-xl font-extrabold text-[#07225E] font-mono tabular-nums">
                  ₹{row.grantAmountInr.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Direct Benefit
            </span>
          </div>

          {/* Location & Caseworker Metadata */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#155AD1]" /> Location
              </span>
              <span className="font-semibold text-slate-900">
                {row.district}, {row.state}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[#155AD1]" /> Caseworker
              </span>
              <span className="font-semibold text-slate-900">{row.workerName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <School className="h-3.5 w-3.5 text-[#155AD1]" /> Schooling
              </span>
              <span className="font-semibold text-slate-900">{row.schoolType}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <HeartHandshake className="h-3.5 w-3.5 text-[#155AD1]" /> Vulnerability
              </span>
              <span className="font-semibold text-slate-900">{row.orphanStatus}</span>
            </div>

            {(row.viralLoadText || row.hbText || row.bmiCategory) && (
              <div className="pt-2.5 mt-2 border-t border-slate-200/80 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white border border-sky-100 p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-center gap-1">
                    <Activity className="h-3 w-3 text-[#155AD1]" /> Viral Load
                  </span>
                  <span className="mt-0.5 block text-[11px] font-bold text-slate-800 truncate" title={row.vlCategory || row.viralLoadText}>
                    {row.vlCategory || row.viralLoadText || '—'}
                  </span>
                </div>
                <div className="rounded-xl bg-white border border-sky-100 p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Haemoglobin
                  </span>
                  <span className="mt-0.5 block text-[11px] font-bold text-slate-800 truncate" title={row.hbCategory || row.hbText}>
                    {row.hbText ? `${row.hbText} g/dL` : row.hbCategory || '—'}
                  </span>
                </div>
                <div className="rounded-xl bg-white border border-sky-100 p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Growth / BMI
                  </span>
                  <span className="mt-0.5 block text-[11px] font-bold text-slate-800 truncate">
                    {row.bmiCategory || '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* KYC & Verification Checklist */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                KYC &amp; Attachment Checklist
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                {KYC_DOCS_LIST.filter((doc) => !isDocMissing(doc.key)).length} of {KYC_DOCS_LIST.length} Verified
              </span>
            </div>

            <div className="divide-y divide-slate-100 rounded-2xl border border-sky-100 bg-white overflow-hidden shadow-xs">
              {KYC_DOCS_LIST.map((doc) => {
                const missing = isDocMissing(doc.key);
                return (
                  <div key={doc.key} className="flex items-center justify-between p-3 text-xs">
                    <div className="flex items-center gap-2.5 font-medium text-slate-800">
                      <doc.icon className="h-4 w-4 text-slate-400" />
                      <span>{doc.label}</span>
                    </div>

                    {missing ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
                        <AlertCircle className="h-3 w-3 text-amber-600" />
                        Missing
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        Verified
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* High-Trust Confirmation Note */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Confirming approval authorizes this beneficiary for state child-nutrition grant disbursement.
              This decision is audited under your active administrator session and will trigger state payment workflow.
            </p>
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="p-4 border-t border-slate-100 bg-white/95 backdrop-blur-xs flex items-center justify-between gap-3 shrink-0">
          {onViewDossier && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewDossier(row);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-[#155AD1] rounded-xl hover:bg-sky-50 transition-colors cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Full Dossier</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <CosmicSpaceButton
              variant={row.approvalStatus === 'approved' ? 'comet' : 'nebula'}
              isLoading={isSubmitting || isLoading}
              disabled={isSubmitting || isLoading}
              onClick={handleConfirm}
              className="cursor-pointer"
            >
              {row.approvalStatus === 'approved' ? 'Revoke Approval' : 'Confirm Child Approval'}
            </CosmicSpaceButton>
          </div>
        </div>
      </div>
    </div>
  );
}
export default ChildApprovalDrawer;
