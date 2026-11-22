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
  MapPin,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { getWaitingQueueCount } from '@/lib/db/syncQueueRepository';
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
  const [unsentCount, setUnsentCount] = useState(0);
  const [confirmingLogoutWithUnsent, setConfirmingLogoutWithUnsent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      setConfirmingLogoutWithUnsent(false);
      if (isUnlocked) {
        getWaitingQueueCount()
          .then((count) => setUnsentCount(count))
          .catch(() => setUnsentCount(0));
      } else {
        setUnsentCount(0);
      }
    }
  }, [isOpen, isUnlocked, activeTab]);

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !e.defaultPrevented) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const performLogout = async () => {
    setIsLoading(true);
    setConfirmingLogoutWithUnsent(false);
    await logout();
    setIsLoading(false);
    setSuccessMessage('Logged out successfully.');
    setTimeout(() => onClose(), 600);
  };

  const handleLogout = async () => {
    const latestUnsent = await getWaitingQueueCount().catch(() => 0);
    setUnsentCount(latestUnsent);
    if (latestUnsent > 0 && !confirmingLogoutWithUnsent) {
      setConfirmingLogoutWithUnsent(true);
      return;
    }
    await performLogout();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="eval-login-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(7,29,79,0.48)] backdrop-blur-md animate-in fade-in duration-150 motion-reduce:animate-none"
    >
      <div
        className="w-full max-w-md max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-[0_24px_48px_-12px_rgba(7,43,124,0.28)] border border-blue-200/80 overflow-hidden animate-in zoom-in-95 duration-150 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — Authority Cosmic Sky Gradient */}
        <div
          className="relative px-6 py-5 text-white flex items-center justify-between shrink-0 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #07225E 0%, #0F3E9E 58%, #1E5CC7 100%)',
          }}
        >
          {/* Twinkling star sparkle dots */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" aria-hidden="true">
            <circle cx="32" cy="16" r="1.2" fill="#FFFFFF" />
            <circle cx="110" cy="44" r="1.5" fill="#FEF08A" />
            <circle cx="280" cy="18" r="1.3" fill="#FFFFFF" />
            <circle cx="330" cy="48" r="1.5" fill="#BAE6FD" />
            <path d="M350 14 l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#FEF08A" opacity="0.8" />
          </svg>

          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/15 backdrop-blur-md rounded-2xl border border-white/25 shadow-inner">
              <Shield className="w-5 h-5 text-sky-200" />
            </div>
            <div>
              <h2 id="eval-login-title" className="text-base font-bold text-white tracking-tight">
                Evaluation Portal
              </h2>
              <p className="text-xs text-sky-200/80">
                State &amp; Leadership Surveillance Access
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer relative z-10"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (Scrollable container to accommodate combobox options on small screens) */}
        <div className="p-6 pt-5 space-y-5 overflow-y-auto flex-1">
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

              {unsentCount > 0 && (
                <div
                  role="alert"
                  data-testid="logout-unsent-warning"
                  className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">
                        {unsentCount} {unsentCount === 1 ? 'assessment is' : 'assessments are'} still waiting to send
                      </p>
                      <p className="text-[11px] text-amber-900 mt-0.5">
                        Queued records stay saved on this device, but signing out locks your session while they are still unsent. Send queued records in Sync Centre before signing out when possible.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('child_nutrition:dissolve_navbar'));
                    }
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

                {confirmingLogoutWithUnsent ? (
                  <div
                    role="alertdialog"
                    aria-label="Confirm sign out with unsent records"
                    className="p-3 rounded-lg bg-rose-50 border border-rose-300 space-y-2"
                  >
                    <p className="text-xs font-bold text-rose-950">
                      Are you sure you want to sign out with unsent records?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={performLogout}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 cursor-pointer disabled:opacity-50"
                      >
                        Sign Out Anyway
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingLogoutWithUnsent(false)}
                        className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoading}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Switch Account / Sign Out / Lock Session</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Tab Selector: State Evaluation vs Leadership */}
              <div
                className="grid grid-cols-2 p-1.5 bg-sky-50/90 rounded-2xl gap-1.5 border border-sky-100"
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
                  className={`py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'state'
                      ? 'text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  style={
                    activeTab === 'state'
                      ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                      : undefined
                  }
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
                  className={`py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'leadership'
                      ? 'text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  style={
                    activeTab === 'leadership'
                      ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                      : undefined
                  }
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Leadership
                </button>
              </div>

              {/* Tab 1: State Evaluation */}
              {activeTab === 'state' && (
                <StateTeamAuthFlow
                  onSuccess={() => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('child_nutrition:dissolve_navbar'));
                    }
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
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('child_nutrition:dissolve_navbar'));
                    }
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
