'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Unlock, AlertTriangle, CheckCircle, X, LogOut, UserCheck } from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

interface EvaluationLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EvaluationLoginModal({ isOpen, onClose, onSuccess }: EvaluationLoginModalProps) {
  const { isUnlocked, user, login, logout } = useEvaluationAccess();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const usernameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setTimeout(() => usernameInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await login(username, password);
      if (result.success) {
        setSuccessMessage('Authentication successful! Access granted.');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 600);
      } else {
        setErrorMessage(result.error || 'Authentication failed. Please verify credentials.');
      }
    } catch (err: any) {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-700/60 rounded-xl border border-teal-500/30">
              <Shield className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h2 id="eval-login-title" className="text-base font-bold text-white tracking-tight">
                Evaluation Access Control
              </h2>
              <p className="text-xs text-teal-200/80">
                Attributable Role-Based Scoped Access
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

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Active Session Card if already logged in */}
          {isUnlocked && user ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Currently Signed In: {user.name}</span>
              </div>
              <div className="text-xs text-emerald-700 space-y-1 pl-6">
                <p>Role: <span className="font-semibold">{user.role}</span></p>
                <p>Permitted States: <span className="font-semibold">{user.allowedStates.join(', ') || 'All'}</span></p>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoading}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out / Lock Session
              </button>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{errorMessage}</div>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5 animate-in fade-in"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 font-medium">{successMessage}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="eval-username"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Username or Identity
                  </label>
                  <input
                    ref={usernameInputRef}
                    id="eval-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. reviewer_mh"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="eval-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <input
                    id="eval-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter assigned evaluation password"
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
                      Sign In & Unlock Portal
                    </>
                  )}
                </button>
              </form>

              {/* Configured System Accounts */}
              <div className="pt-3 border-t border-slate-200">
                <p className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                  Configured User Accounts:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { setUsername('reviewer_mh'); setErrorMessage(null); }}
                    className="px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300 border border-slate-200 rounded-lg transition-colors cursor-pointer text-center"
                  >
                    Reviewer (MH)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUsername('leadership_india'); setErrorMessage(null); }}
                    className="px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300 border border-slate-200 rounded-lg transition-colors cursor-pointer text-center"
                  >
                    Leadership
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUsername('admin'); setErrorMessage(null); }}
                    className="px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300 border border-slate-200 rounded-lg transition-colors cursor-pointer text-center"
                  >
                    Administrator
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
