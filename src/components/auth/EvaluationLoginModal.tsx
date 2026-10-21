'use client';

import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { LeadershipOtpFlow } from './LeadershipOtpFlow';

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
  const { isUnlocked, user, login, logout } = useEvaluationAccess();
  const [activeTab, setActiveTab] = useState<'state' | 'leadership'>('state');
  const [selectedState, setSelectedState] = useState('Maharashtra');
  const [customAccessId, setCustomAccessId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setPassword('');
      if (activeTab === 'state') {
        setTimeout(() => passwordInputRef.current?.focus(), 50);
      }
    }
  }, [isOpen, activeTab]);

  // Keyboard navigation: Escape key closes modal (if not handled by child combobox)
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

  const handleStateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMessage('Please enter the password.');
      return;
    }

    const identifier = customAccessId.trim() || selectedState;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await login(identifier, password);
      if (result.success) {
        setSuccessMessage('Authentication successful! State evaluation portal unlocked.');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 600);
      } else {
        setErrorMessage(result.error || 'Authentication failed. Please verify credentials.');
      }
    } catch {
      setErrorMessage('Network or server error during authentication.');
    } finally {
      setIsLoading(false);
    }
  };

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
              <button
                onClick={handleLogout}
                disabled={isLoading}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out / Lock Session
              </button>
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
                    setErrorMessage(null);
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
                    setErrorMessage(null);
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
                <>
                  {errorMessage && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in motion-reduce:animate-none"
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1 leading-relaxed">{errorMessage}</div>
                    </div>
                  )}

                  {successMessage && (
                    <div
                      role="status"
                      className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5 animate-in fade-in motion-reduce:animate-none"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="flex-1 font-medium">{successMessage}</div>
                    </div>
                  )}

                  <form onSubmit={handleStateSubmit} className="space-y-4">
                    <div>
                      <label
                        htmlFor="eval-state-select"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Assigned State
                      </label>
                      <select
                        id="eval-state-select"
                        value={selectedState}
                        onChange={(e) => {
                          setSelectedState(e.target.value);
                          setCustomAccessId('');
                        }}
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all font-medium text-slate-800 cursor-pointer"
                      >
                        {EVALUATION_STATES.map((st) => (
                          <option key={st.code} value={st.name}>
                            {st.name} ({st.id})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Access is restricted strictly to records within this state.
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="eval-password"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        State Evaluation Password
                      </label>
                      <input
                        ref={passwordInputRef}
                        id="eval-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter state shared evaluation password"
                        maxLength={128}
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                          Authenticating…
                        </span>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          Sign In &amp; Unlock Evaluation
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}

              {/* Tab 2: Leadership Flow (Integrated In-Place) */}
              {activeTab === 'leadership' && (
                <LeadershipOtpFlow
                  isModal={true}
                  onSuccess={() => {
                    onSuccess?.();
                    onClose();
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
