'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Mail,
  Key,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Building2,
  Lock,
  UserCheck,
} from 'lucide-react';
import { setEvaluationUnlocked } from '@/lib/auth/evaluationAccess';

interface PublicLeader {
  id: string;
  name: string;
  title: string;
}

/**
 * Validates and sanitizes returnUrl to prevent open redirect vulnerabilities.
 * Must begin with '/' and not start with '//' or '/\' or specify an absolute scheme.
 */
function sanitizeReturnUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '/supervisor';
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes('://')
  ) {
    return trimmed;
  }
  return '/supervisor';
}

function LeadershipLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeReturnUrl = sanitizeReturnUrl(searchParams?.get('returnUrl'));

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [authMode, setAuthMode] = useState<'directory' | 'manual'>('manual');
  const [directoryLeaders, setDirectoryLeaders] = useState<PublicLeader[]>([]);
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const isFeatureEnabled =
    process.env.NEXT_PUBLIC_LEADERSHIP_EMAIL_AUTH_ENABLED === 'true' ||
    process.env.LEADERSHIP_EMAIL_AUTH_ENABLED === 'true';

  // Load public directory of leadership names (zero emails exposed)
  useEffect(() => {
    async function loadDirectory() {
      try {
        const res = await fetch('/api/auth/leader/directory');
        if (res.ok) {
          const body = await res.json();
          if (body?.status === 'success' && Array.isArray(body?.data) && body.data.length > 0) {
            setDirectoryLeaders(body.data);
            setSelectedLeaderId(body.data[0].id);
            setAuthMode('directory');
            return;
          }
        }
      } catch {
        // Fall back gracefully to manual email input
      }
      setAuthMode('manual');
    }
    loadDirectory();
  }, []);

  useEffect(() => {
    if (step === 'email') {
      if (authMode === 'manual') {
        emailInputRef.current?.focus();
      }
    } else {
      codeInputRef.current?.focus();
    }
  }, [step, authMode]);

  // Resend cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    const payload: { email?: string; leaderId?: string } = {};

    if (authMode === 'directory') {
      if (!selectedLeaderId) {
        setErrorMessage('Please select your leadership profile.');
        setIsLoading(false);
        return;
      }
      payload.leaderId = selectedLeaderId;
    } else {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        setErrorMessage('Please enter a valid email address.');
        setIsLoading(false);
        return;
      }
      payload.email = cleanEmail;
    }

    try {
      const res = await fetch('/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data?.message || 'Failed to dispatch verification code. Please try again.');
        setIsLoading(false);
        return;
      }

      setInfoMessage(
        data?.message ||
          'If this account is an authorized Leadership identity, a single-use verification code has been dispatched.'
      );
      setStep('code');
      setCooldownSeconds(60);
      setCode('');
    } catch {
      setErrorMessage('Network error while requesting verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toLowerCase().replace(/[^0-9a-f]/g, '');

    if (!cleanCode) {
      setErrorMessage('Please enter the 32-character verification code.');
      return;
    }

    if (cleanCode.length !== 32) {
      setErrorMessage(`Verification code must be exactly 32 hex characters (currently ${cleanCode.length}).`);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const payload: { email?: string; leaderId?: string; code: string } = {
      code: cleanCode,
    };

    if (authMode === 'directory' && selectedLeaderId) {
      payload.leaderId = selectedLeaderId;
    } else {
      payload.email = email.trim().toLowerCase();
    }

    try {
      const res = await fetch('/api/auth/leader/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || body?.status !== 'success') {
        setErrorMessage(body?.message || 'Invalid or expired verification code.');
        setIsLoading(false);
        return;
      }

      const user = body.data?.user;
      if (user) {
        setEvaluationUnlocked(true, {
          userId: user.id,
          name: user.name,
          role: user.role || 'LEADERSHIP',
          allowedStates: user.allowedStates || ['*'],
          allowedDistricts: user.allowedDistricts || ['*'],
          isVerified: true,
        });
      }

      setInfoMessage('Authentication successful! Unlocking Leadership surveillance...');
      setTimeout(() => {
        router.push(safeReturnUrl);
      }, 500);
    } catch {
      setErrorMessage('Network error while verifying code.');
    } finally {
      setIsLoading(false);
    }
  };

  const activeLeaderObj = directoryLeaders.find((l) => l.id === selectedLeaderId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-6 py-6 text-white text-center relative">
          <div className="inline-flex p-3 bg-teal-700/60 rounded-2xl border border-teal-500/30 mb-3 shadow-inner">
            <Building2 className="w-7 h-7 text-teal-200" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Alliance India Leadership</h1>
          <p className="text-xs text-teal-200/90 mt-1">
            Childcare Support Programme — Surveillance &amp; Evaluation
          </p>
        </div>

        {/* Feature disabled warning */}
        {!isFeatureEnabled && (
          <div className="p-4 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Feature Notice:</span> Leadership email authentication is currently disabled on this environment.
            </div>
          </div>
        )}

        {/* Form container */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Notifications */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed font-medium">{errorMessage}</div>
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5 animate-in fade-in"
            >
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed font-medium">{infoMessage}</div>
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              {directoryLeaders.length > 0 && (
                <div className="flex items-center justify-between text-xs pb-1">
                  <span className="font-bold text-slate-800 uppercase tracking-wider">
                    Sign-In Method
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === 'directory' ? 'manual' : 'directory');
                      setErrorMessage(null);
                    }}
                    className="text-teal-700 hover:text-teal-900 font-semibold cursor-pointer underline"
                  >
                    {authMode === 'directory' ? 'Enter email manually' : 'Select from directory'}
                  </button>
                </div>
              )}

              {authMode === 'directory' && directoryLeaders.length > 0 ? (
                <div>
                  <label htmlFor="leader-select" className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wider">
                    Authorized Leadership Profile
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <UserCheck className="h-4 w-4 text-teal-700" />
                    </div>
                    <select
                      id="leader-select"
                      value={selectedLeaderId}
                      onChange={(e) => setSelectedLeaderId(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all font-medium text-slate-900 cursor-pointer"
                    >
                      {directoryLeaders.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name} — {lead.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    A single-use verification code will be sent to your registered approved address.
                  </p>
                </div>
              ) : (
                <div>
                  <label htmlFor="leader-email" className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wider">
                    Leadership Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      ref={emailInputRef}
                      id="leader-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@allianceindia.org"
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all font-medium text-slate-900"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Allowlisted Directors and Senior Technical Officers receive a single-use 128-bit verification code.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Dispatching Code…
                  </span>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="leader-code" className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    128-Bit Verification Code
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setErrorMessage(null);
                      setInfoMessage(null);
                    }}
                    className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> Change Identity
                  </button>
                </div>

                <div className="text-[11px] text-slate-600 mb-2 font-mono bg-slate-50 p-2 rounded-lg border border-slate-200">
                  {authMode === 'directory' && activeLeaderObj ? (
                    <span>Account: <strong className="text-slate-900">{activeLeaderObj.name}</strong> ({activeLeaderObj.title})</span>
                  ) : (
                    <span>Sent to: <strong className="text-slate-900">{email}</strong></span>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Key className="h-4 w-4" />
                  </div>
                  <input
                    ref={codeInputRef}
                    id="leader-code"
                    type="text"
                    required
                    autoComplete="one-time-code"
                    maxLength={32}
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim().toLowerCase())}
                    placeholder="e.g. 4a2b91c0e3f8..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all font-mono tracking-wider text-slate-900"
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
                  <span>Paste entire 32-character hex code</span>
                  <span className="font-mono">{code.length} / 32</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Verifying Code…
                  </span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Verify &amp; Enter Portal</span>
                  </>
                )}
              </button>

              {/* Resend button with cooldown */}
              <div className="text-center pt-2">
                {cooldownSeconds > 0 ? (
                  <span className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    Resend code available in {cooldownSeconds}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequestCode()}
                    disabled={isLoading}
                    className="text-xs text-teal-700 hover:text-teal-900 font-semibold cursor-pointer underline disabled:opacity-50"
                  >
                    Didn&apos;t receive code? Resend
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Navigation link */}
          <div className="pt-4 border-t border-slate-200 text-center">
            <Link
              href="/app"
              className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1"
            >
              ← Return to Caseworker Field Workspace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LeadershipLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-teal-200 text-sm">
          Loading Alliance India Leadership Portal...
        </div>
      }
    >
      <LeadershipLoginForm />
    </Suspense>
  );
}
