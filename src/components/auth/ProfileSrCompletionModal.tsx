'use client';

import React, { useState, useEffect } from 'react';
import { Building2, CheckCircle2, AlertTriangle, ArrowRight, X } from 'lucide-react';

interface StateSR {
  id: string;
  code: string;
  name: string;
  state: string;
}

interface ProfileSrCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState?: string;
  onSave: (sr: { id?: string; name: string }) => void;
}

export function ProfileSrCompletionModal({
  isOpen,
  onClose,
  currentState = '',
  onSave,
}: ProfileSrCompletionModalProps) {
  const [srs, setSrs] = useState<StateSR[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSrId, setSelectedSrId] = useState('');
  const [customSrName, setCustomSrName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsLoading(true);
      const url = currentState
        ? `/api/reference-data/state-srs?state=${encodeURIComponent(currentState)}`
        : '/api/reference-data/state-srs';

      fetch(url)
        .then((res) => res.json())
        .then((json) => {
          if (json?.status === 'success' && Array.isArray(json.data)) {
            setSrs(json.data);
            if (json.data.length > 0) {
              setSelectedSrId(json.data[0].id);
            }
          }
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, currentState]);

  if (!isOpen) return null;

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    let finalName = '';
    let finalId: string | undefined = undefined;

    if (srs.length > 0 && selectedSrId) {
      const match = srs.find((s) => s.id === selectedSrId);
      if (match) {
        finalName = match.name;
        finalId = match.id;
      }
    } else if (customSrName.trim()) {
      finalName = customSrName.trim();
    }

    if (!finalName) {
      setErrorMessage('Please select or specify your State Sub-Recipient (SR).');
      return;
    }

    // Persist to local session
    try {
      localStorage.setItem('field_user_sr', JSON.stringify({ srId: finalId || null, srName: finalName }));
    } catch (_) {}

    onSave({ id: finalId, name: finalName });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sr-completion-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 motion-reduce:animate-none"
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-teal-100 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-800 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-teal-100" />
              </div>
              <div>
                <h2 id="sr-completion-title" className="text-base font-bold text-white">
                  State Sub-Recipient (SR)
                </h2>
                <p className="text-xs text-teal-100/90">One-time profile completion step</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/70 hover:text-white p-1 rounded-lg"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Before submitting your assessment, please confirm your assigned{' '}
            <strong className="text-slate-900">State Sub-Recipient (SR)</strong>. This will be automatically
            linked to all future records.
          </p>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-6 text-center text-xs text-slate-500 animate-pulse">
              Loading authorized State SR list...
            </div>
          ) : srs.length > 0 ? (
            <div>
              <label htmlFor="sr-select-field" className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned State SR *
              </label>
              <select
                id="sr-select-field"
                value={selectedSrId}
                onChange={(e) => setSelectedSrId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all cursor-pointer"
              >
                {srs.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.name} ({sr.state})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="custom-sr-field" className="block text-xs font-semibold text-slate-700 mb-1">
                State Sub-Recipient (SR) Name *
              </label>
              <input
                id="custom-sr-field"
                type="text"
                value={customSrName}
                onChange={(e) => setCustomSrName(e.target.value)}
                placeholder="Enter State SR (e.g. Alliance India State Partner)"
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Official registry list will be populated by admin.
              </p>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <span>Save &amp; Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
