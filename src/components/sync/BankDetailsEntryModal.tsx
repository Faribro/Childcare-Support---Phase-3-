'use client';

import React, { useState, useEffect } from 'react';
import {
  Landmark,
  X,
  Lock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Save,
} from 'lucide-react';
import { extractBankFields } from '@/lib/shared/submissionStages';

export interface BankDetailsEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: {
    id: string;
    submissionId: string;
    childName: string;
    revisionNumber: number;
    rawRecord?: any;
  } | null;
  onSuccess: () => void;
}

export function BankDetailsEntryModal({
  isOpen,
  onClose,
  submission,
  onSuccess,
}: BankDetailsEntryModalProps) {
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [passbookProof, setPassbookProof] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize form fields when submission target changes
  useEffect(() => {
    if (submission && isOpen) {
      const existing = extractBankFields(submission.rawRecord || submission);
      // Pre-fill existing values, but if accountNumber is masked (e.g. XXXX-XXXX-1234), keep existing or leave editable
      setAccountNumber(existing.accountNumber && !existing.accountNumber.includes('XXXX') ? existing.accountNumber : '');
      setAccountHolderName(existing.accountHolderName || '');
      setBankName(existing.bankName || '');
      setBranchName(existing.branchName || '');
      setIfscCode(existing.ifscCode || '');
      setPassbookProof(existing.passbookProof !== 'verified_attachment' ? existing.passbookProof : '');
      setErrorMessage(null);
      setIsConflict(false);
      setSuccessMessage(null);
    }
  }, [submission, isOpen]);

  if (!isOpen || !submission) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsConflict(false);
    setSuccessMessage(null);

    // Basic client validation
    const cleanAccount = accountNumber.trim();
    const cleanHolder = accountHolderName.trim();
    const cleanBank = bankName.trim();
    const cleanBranch = branchName.trim();
    const cleanIfsc = ifscCode.trim().toUpperCase();
    const cleanProof = passbookProof.trim();

    if (!cleanAccount) {
      setErrorMessage('Account number is required.');
      return;
    }
    if (!cleanHolder) {
      setErrorMessage('Account holder name is required.');
      return;
    }
    if (!cleanBank) {
      setErrorMessage('Bank name is required.');
      return;
    }
    if (!cleanBranch) {
      setErrorMessage('Branch name is required.');
      return;
    }
    if (!cleanIfsc) {
      setErrorMessage('IFSC code is required.');
      return;
    }

    setIsLoading(true);

    try {
      const patchBody = {
        expectedVersion: submission.revisionNumber,
        accountNumber: cleanAccount, // preserve leading zeros as string
        bankAccountNumber: cleanAccount,
        accountHolderName: cleanHolder,
        bankAccountHolderName: cleanHolder,
        bankName: cleanBank,
        branchName: cleanBranch,
        ifscCode: cleanIfsc,
        bankIfscCode: cleanIfsc,
        passbookPhotoUrl: cleanProof || undefined,
        passbookProof: cleanProof || undefined,
        bankingAndKyc: {
          accountNumber: cleanAccount,
          bankAccountNumber: cleanAccount,
          accountHolderName: cleanHolder,
          bankAccountHolderName: cleanHolder,
          bankName: cleanBank,
          branchName: cleanBranch,
          ifscCode: cleanIfsc,
          bankIfscCode: cleanIfsc,
          passbookPhotoUrl: cleanProof || undefined,
        },
      };

      const res = await fetch(`/api/submissions/${encodeURIComponent(submission.submissionId || submission.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': `"${submission.revisionNumber}"`,
        },
        body: JSON.stringify(patchBody),
      });

      if (res.ok) {
        setSuccessMessage('Bank details saved and confirmed on server!');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 800);
      } else if (res.status === 409) {
        // Concurrency conflict: retain user input, show clear message
        setIsConflict(true);
        setErrorMessage(
          'Concurrency conflict (HTTP 409): This record was updated by another user or background sync. Your entered input has been retained. Please refresh the linelist and retry with the current version.'
        );
      } else if (res.status === 401) {
        setErrorMessage('Authentication required (HTTP 401): Your session has expired. Please sign in again.');
      } else if (res.status === 403) {
        setErrorMessage('Permission denied (HTTP 403): You do not have authorization to edit bank details for this record.');
      } else if (res.status === 422) {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(
          errJson.message || 'Validation error (HTTP 422): One or more bank fields are invalid.'
        );
      } else {
        setErrorMessage(`Server error (HTTP ${res.status}): Failed to save bank details.`);
      }
    } catch {
      setErrorMessage('Network connection error: Failed to communicate with server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-700 to-amber-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-600/60 rounded-xl border border-amber-400/30">
              <Landmark className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h2 id="bank-modal-title" className="text-base font-bold text-white tracking-tight">
                Enter Approved Bank Details
              </h2>
              <p className="text-xs text-amber-200/90">
                Beneficiary: <strong className="text-white">{submission.childName}</strong> ({submission.id})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-amber-200 hover:text-white p-1 rounded-lg hover:bg-amber-700/50 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in ${
                isConflict
                  ? 'bg-purple-50 border-purple-200 text-purple-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {isConflict ? (
                <AlertTriangle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed flex-1">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5 animate-in fade-in"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="font-semibold">{successMessage}</div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Account Number (Preserves leading zeros) */}
            <div className="sm:col-span-2">
              <label
                htmlFor="bank-acc-num"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Bank Account Number *
              </label>
              <input
                id="bank-acc-num"
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 000123456789 (preserves leading zeros)"
                className="w-full px-3.5 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Leading zeros are strictly preserved.
              </p>
            </div>

            {/* Account Holder Name */}
            <div className="sm:col-span-2">
              <label
                htmlFor="bank-holder-name"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Account Holder Name *
              </label>
              <input
                id="bank-holder-name"
                type="text"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="Name as printed in passbook"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                required
              />
            </div>

            {/* Bank Name */}
            <div>
              <label
                htmlFor="bank-name"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Bank Name *
              </label>
              <input
                id="bank-name"
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. State Bank of India"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                required
              />
            </div>

            {/* Branch Name */}
            <div>
              <label
                htmlFor="bank-branch"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Branch Name *
              </label>
              <input
                id="bank-branch"
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Pune Main Branch"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                required
              />
            </div>

            {/* IFSC Code */}
            <div>
              <label
                htmlFor="bank-ifsc"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                IFSC Code *
              </label>
              <input
                id="bank-ifsc"
                type="text"
                maxLength={11}
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="e.g. SBIN0001234"
                className="w-full px-3.5 py-2 text-sm font-mono uppercase bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                required
              />
            </div>

            {/* Passbook Proof Reference / URL */}
            <div>
              <label
                htmlFor="bank-passbook"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Passbook Proof Reference *
              </label>
              <input
                id="bank-passbook"
                type="text"
                value={passbookProof}
                onChange={(e) => setPassbookProof(e.target.value)}
                placeholder="Document reference or photo URL"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Bank Details</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
