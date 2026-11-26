'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { cosmicSound } from '@/lib/audio/cosmicSoundEngine';
import { platformRegistry } from '@/lib/platform/platformRegistry';

interface EvaluationLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  requireAccessCodeGate?: boolean;
}

interface UnlockedStateGate {
  state: string;
  lgdNumericCode: string;
  isoCode: string;
}

export function EvaluationLoginModal({
  isOpen,
  onClose,
  onSuccess,
  requireAccessCodeGate = false,
}: EvaluationLoginModalProps) {
  const router = useRouter();
  const { isUnlocked, user, logout } = useEvaluationAccess();
  const [activeTab, setActiveTab] = useState<'state' | 'leadership'>('state');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [unsentCount, setUnsentCount] = useState(0);
  const [confirmingLogoutWithUnsent, setConfirmingLogoutWithUnsent] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Dynamic Staff Access code gate state
  const [gateCode, setGateCode] = useState('');
  const [gateLoading, setGateLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [unlockedStateGate, setUnlockedStateGate] = useState<UnlockedStateGate | null>(null);
  const gateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      setConfirmingLogoutWithUnsent(false);
      if (requireAccessCodeGate && !isUnlocked && !unlockedStateGate) {
        setTimeout(() => gateInputRef.current?.focus(), 60);
      }
      if (isUnlocked) {
        getWaitingQueueCount()
          .then((count) => setUnsentCount(count))
          .catch(() => setUnsentCount(0));
      } else {
        setUnsentCount(0);
      }
    } else {
      setGateCode('');
      setGateError(null);
      setGateLoading(false);
      setUnlockedStateGate(null);
    }
  }, [isOpen, isUnlocked, activeTab, requireAccessCodeGate]);

  const handleGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = gateCode.trim();
    if (!cleaned) {
      setGateError('Please enter your 3-digit State PIN or Administration access code.');
      return;
    }

    setGateLoading(true);
    setGateError(null);

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/staff-access/gate'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleaned }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || json?.status !== 'success') {
        setGateError(json?.error || 'Invalid State PIN or Administration access code.');
        return;
      }

      if (json.mode === 'state_team' && json.data?.state) {
        cosmicSound.playEvaluationUnlock();
        setUnlockedStateGate({
          state: json.data.state,
          lgdNumericCode: json.data.lgdNumericCode || cleaned,
          isoCode: json.data.isoCode || '',
        });
        setActiveTab('state');
        return;
      }

      if (json.mode === 'administration') {
        cosmicSound.playEvaluationUnlock();
        onClose();
        router.push(json.data?.redirectUrl || '/leadership/login?gate=1');
        return;
      }

      setGateError('Unexpected access gate response. Please retry.');
    } catch {
      setGateError('Network error while verifying access code. Please check your connection.');
    } finally {
      setGateLoading(false);
    }
  };

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

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="eval-login-title"
      className="fixed inset-0 z-50 overflow-y-auto p-3 sm:p-4 bg-[rgba(7,29,79,0.52)] backdrop-blur-md flex items-start sm:items-center justify-center animate-in fade-in duration-150 motion-reduce:animate-none"
    >
      <div
        className="relative w-full max-w-md my-auto max-h-[min(90vh,680px)] flex flex-col bg-white rounded-3xl shadow-[0_24px_48px_-12px_rgba(7,43,124,0.32)] border border-blue-200/80 overflow-hidden animate-in zoom-in-95 duration-150 motion-reduce:animate-none"
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
                {unlockedStateGate ? `Staff Access — ${unlockedStateGate.state}` : 'Staff Access'}
              </h2>
              <p className="text-xs text-sky-200/80">
                {unlockedStateGate
                  ? `${unlockedStateGate.state} State Team • PIN ${unlockedStateGate.lgdNumericCode}`
                  : requireAccessCodeGate && !isUnlocked
                    ? 'Enter State Code or Administration Code'
                    : 'State Team & Administration Access'}
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
                      ? `Continue to State Team Dashboard (${user.allowedStates.filter((s: string) => s !== '*').join(', ') || 'State'})`
                      : 'Continue to Administration Dashboard'}
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
          ) : requireAccessCodeGate && !unlockedStateGate ? (
            <form onSubmit={handleGateSubmit} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-slate-700 leading-relaxed">
                Enter your <strong>3-digit State Gate Code</strong> to unlock that state&apos;s login &amp; signup options, or enter your confidential <strong>Administration Code</strong>.
              </div>

              <div>
                <label
                  htmlFor="staff-access-gate-code"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  State PIN or Administration Access Code
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    ref={gateInputRef}
                    id="staff-access-gate-code"
                    type="password"
                    inputMode="text"
                    autoComplete="off"
                    value={gateCode}
                    onChange={(e) => {
                      setGateCode(e.target.value);
                      if (gateError) setGateError(null);
                    }}
                    placeholder="Enter 3-digit State Code or Admin Code"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm font-mono tracking-wider bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                  />
                </div>
              </div>

              {gateError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{gateError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={gateLoading}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }}
              >
                <span>{gateLoading ? 'Verifying Code…' : 'Unlock Staff Access'}</span>
                {!gateLoading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          ) : unlockedStateGate ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                <div className="flex items-center gap-2 font-semibold truncate">
                  <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate">
                    {unlockedStateGate.state} ({unlockedStateGate.lgdNumericCode})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUnlockedStateGate(null);
                    setGateCode('');
                    setGateError(null);
                  }}
                  className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline shrink-0 cursor-pointer"
                >
                  Switch code
                </button>
              </div>

              <StateTeamAuthFlow
                key={unlockedStateGate.lgdNumericCode}
                lockedState={unlockedStateGate.state}
                lockedStateCode={unlockedStateGate.lgdNumericCode}
                onSuccess={() => {
                  cosmicSound.playEvaluationUnlock();
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('child_nutrition:dissolve_navbar'));
                  }
                  onSuccess?.();
                  onClose();
                  router.push('/supervisor');
                }}
                onCancel={onClose}
              />
            </div>
          ) : (
            <>
              {/* Tab Selector: State Evaluation vs Leadership */}
              <div
                className="grid grid-cols-2 p-1.5 bg-sky-50/90 rounded-2xl gap-1.5 border border-sky-100"
                role="tablist"
                aria-label="Staff access role"
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
                  State Team
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
                  Administration
                </button>
              </div>

              {/* Tab 1: State Evaluation */}
              {activeTab === 'state' && (
                <StateTeamAuthFlow
                  onSuccess={() => {
                    cosmicSound.playEvaluationUnlock();
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
                    cosmicSound.playEvaluationUnlock();
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

  if (mounted && typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
