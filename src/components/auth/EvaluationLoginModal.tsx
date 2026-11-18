'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Lock,
  AlertTriangle,
  CheckCircle,
  X,
  LogOut,
  Info,
  MapPin,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { LeadershipOtpFlow } from './LeadershipOtpFlow';
import { StateTeamAuthFlow } from './StateTeamAuthFlow';

interface EvaluationLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const EVALUATION_STATES = [
  { code: 'MH', name: 'Maharashtra', id: 'STATE-MH' },
  { code: 'WB', name: 'West Bengal', id: 'STATE-WB' },
  { code: 'DL', name: 'Delhi', id: 'STATE-DL' },
  { code: 'KA', name: 'Karnataka', id: 'STATE-KA' },
  { code: 'TN', name: 'Tamil Nadu', id: 'STATE-TN' },
  { code: 'GJ', name: 'Gujarat', id: 'STATE-GJ' },
  { code: 'TG', name: 'Telangana', id: 'STATE-TG' },
  { code: 'UP', name: 'Uttar Pradesh', id: 'STATE-UP' },
];

export function EvaluationLoginModal({ isOpen, onClose, onSuccess }: EvaluationLoginModalProps) {
  const router = useRouter();
  const { isUnlocked, user, logout } = useEvaluationAccess();
  const [activeTab, setActiveTab] = useState<'state' | 'leadership'>('state');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleLogout = async () => {
    setIsLoading(true);
    await logout();
    setIsLoading(false);
    setSuccessMessage('Logged out successfully.');
    setTimeout(() => onClose(), 600);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="eval-login-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 motion-reduce:animate-none"
    >
      <div
        className="w-full max-w-md max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-700/60 rounded-xl border border-teal-500/30">
              <Shield className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h2 id="eval-login-title" className="text-base font-bold text-white tracking-tight">
                Evaluation Access Control
              </h2>
              <p className="text-xs text-teal-200/80">
                State &amp; Leadership Surveillance Access
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-700/50 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice for Field Users: Password Not Required */}
        <div className="px-6 pt-4 pb-1 shrink-0">
          <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/70 flex items-start gap-2.5 text-xs text-teal-900">
            <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-teal-950">Field Caseworkers:</span> Forms, local drafts, and survey submissions do not require an evaluation password.
            </div>
          </div>
        </div>

        {/* Body (Scrollable container to accommodate combobox options on small screens) */}
        <div className="p-6 pt-3 space-y-5 overflow-y-auto flex-1">
          {/* Active Session Card if already logged in */}
          {isUnlocked && user ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Currently Signed In: {user.name}</span>
              </div>
              <div className="text-xs text-emerald-700 space-y-1 pl-6">
                <p>Role: <span className="font-semibold">{user.role}</span></p>
                <p>
                  Permitted Scope:{' '}
                  <span className="font-semibold">
                    {user.allowedStates.includes('*')
                      ? 'All States (National)'
                      : user.allowedStates.join(', ')}
                  </span>
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    onSuccess?.();
                    onClose();
                    router.push('/supervisor');
                  }}
                  className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Shield className="w-3.5 h-3.5 text-teal-200" />
                  <span>
                    {user.role === 'STATE_REVIEWER'
                      ? `Continue to State Dashboard (${user.allowedStates.filter((s: string) => s !== '*').join(', ') || 'State'})`
                      : 'Continue to Supervisor Dashboard'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Switch Account / Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tab Selector: State Evaluation vs Leadership */}
              <div
                className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1"
                role="tablist"
                aria-label="Evaluation login type"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'state'}
                  onClick={() => {
                    setActiveTab('state');
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'state'
                      ? 'bg-white text-teal-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  State Evaluation
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'leadership'}
                  onClick={() => {
                    setActiveTab('leadership');
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'leadership'
                      ? 'bg-white text-teal-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Leadership
                </button>
              </div>

              {/* Tab 1: State Evaluation */}
              {activeTab === 'state' && (
                <StateTeamAuthFlow
                  onSuccess={() => {
                    onSuccess?.();
                    onClose();
                    router.push('/supervisor');
                  }}
                  onCancel={onClose}
                />
              )}

              {/* Tab 2: Leadership Flow (Integrated In-Place) */}
              {activeTab === 'leadership' && (
                <LeadershipOtpFlow
                  isModal={true}
                  onSuccess={() => {
                    onSuccess?.();
                    onClose();
                    router.push('/supervisor');
                  }}
                  onCancel={onClose}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
