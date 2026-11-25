'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Shield,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Building,
  MapPin,
  Send,
  Lock,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { INDIAN_STATES_AND_UTS } from '@/lib/clinical/nutritionCalculations';
import { setEvaluationUnlocked, EvaluationUser } from '@/lib/auth/evaluationAccess';
import { platformRegistry } from '@/lib/platform/platformRegistry';
import { CosmicSpaceButton } from '@/components/ui/CosmicSpaceButton';

export interface StateTeamAuthFlowProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  onSwitchToPassword?: () => void;
}

export function StateTeamAuthFlow({
  onSuccess,
  onCancel,
  onSwitchToPassword,
}: StateTeamAuthFlowProps) {
  const router = useRouter();
  const [subTab, setSubTab] = useState<'signin' | 'register' | 'otp_signin'>('signin');
  const [step, setStep] = useState<'details' | 'otp' | 'ready'>('details');

  // Registration & Login Fields
  const [workEmail, setWorkEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [requestedState, setRequestedState] = useState('Maharashtra');
  const [organization, setOrganization] = useState('');

  // OTP Field
  const [otp, setOtp] = useState('');

  // Active Team Session & Invitation issuance
  const [teamRegistration, setTeamRegistration] = useState<any>(null);
  const [invitationStatusMessage, setInvitationStatusMessage] = useState<string | null>(null);

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('last_state_coordinator_email');
      if (savedEmail && !workEmail) {
        setWorkEmail(savedEmail);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (subTab === 'signin') {
      setTimeout(() => emailInputRef.current?.focus(), 60);
    } else if (subTab === 'register' && step === 'details') {
      setTimeout(() => emailInputRef.current?.focus(), 60);
    } else if (step === 'otp') {
      setTimeout(() => otpInputRef.current?.focus(), 60);
    }
  }, [subTab, step]);

  // Handler: Password-based sign in
  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workEmail.trim() || !password.trim()) {
      setErrorMessage('Please enter your official email and password.');
      return;
    }

    try {
      localStorage.setItem('last_state_coordinator_email', workEmail.trim());
    } catch {}

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessIdentifier: workEmail.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === 'error') {
        setErrorMessage(data.message || 'Invalid email address or evaluation password.');
        setIsLoading(false);
        return;
      }

      const user = data.data?.user;
      if (user) {
        const authedUser: EvaluationUser = {
          userId: user.userId || `coord-${workEmail.trim()}`,
          name: user.name || workEmail.split('@')[0],
          role: user.role || 'STATE_REVIEWER',
          allowedStates: user.allowedStates || ['Maharashtra'],
          allowedDistricts: user.allowedDistricts || [],
          isVerified: true,
          canEdit: true,
        };
        setEvaluationUnlocked(true, authedUser);
        setSuccessMessage('Signed in successfully! Redirecting to dashboard…');
        setTimeout(() => {
          onSuccess?.();
          router.push('/supervisor');
        }, 500);
      } else {
        setSuccessMessage('Signed in successfully! Redirecting…');
        setTimeout(() => {
          onSuccess?.();
          router.push('/supervisor');
        }, 500);
      }
    } catch {
      setErrorMessage('Network or server error during sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Send OTP / Register
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workEmail.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!firstName.trim()) {
      setErrorMessage('Please enter your first name.');
      return;
    }
    if (!organization.trim()) {
      setErrorMessage('Please enter your organization name.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/state-team/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          workEmail: workEmail.trim(),
          requestedState: requestedState.trim(),
          organization: organization.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === 'error') {
        if (
          res.status === 409 ||
          data.code === 'EMAIL_ALREADY_REGISTERED' ||
          data.error?.toLowerCase().includes('already registered')
        ) {
          setDuplicateEmail(workEmail.trim());
          setErrorMessage(null);
        } else {
          setErrorMessage(data.error || 'Failed to send verification code. Please check your details.');
        }
        setIsLoading(false);
        return;
      }

      setSuccessMessage(data.message || 'Verification code sent to your email.');
      setStep('otp');
    } catch {
      setErrorMessage('Network or server error sending code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/state-team/verify-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: workEmail.trim(),
          otp: otp.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === 'error') {
        setErrorMessage(data.error || 'Verification failed. Please check the code.');
        setIsLoading(false);
        return;
      }

      const reg = data.data?.registration || data.registration;
      setTeamRegistration(reg);

      const session = data.data?.session || data.session;
      if (session) {
        const authedUser: EvaluationUser = {
          userId: session.userId,
          name: session.name,
          role: 'STATE_REVIEWER',
          allowedStates: session.allowedStates || [requestedState],
          allowedDistricts: [],
          isVerified: true,
          canEdit: session.canEdit ?? true,
        };
        setEvaluationUnlocked(true, authedUser);
        setSuccessMessage('Email verified successfully! Redirecting to state dashboard…');
        setTimeout(() => {
          onSuccess?.();
          router.push('/supervisor');
        }, 500);
      } else {
        setSuccessMessage(data.message || 'Email verified! Your registration is pending administrator approval.');
        setStep('ready');
      }
    } catch {
      setErrorMessage('Network or server error during verification.');
    } finally {
      setIsLoading(false);
    }
  };

  // Issue / Dispatch State Team Invitation Code to email
  const handleIssueInvitationCode = async () => {
    if (!teamRegistration?.id) return;

    setIsLoading(true);
    setInvitationStatusMessage(null);

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/state-team/invitation/issue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stateTeamId: teamRegistration.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === 'error') {
        setInvitationStatusMessage(data.error || 'Failed to issue invitation code.');
        setIsLoading(false);
        return;
      }

      setInvitationStatusMessage('State invitation code generated and dispatched privately to your email!');
    } catch {
      setInvitationStatusMessage('Error communicating with invitation service.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {duplicateEmail && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-bold text-amber-900">This email is already registered.</p>
              <p className="text-[11px] text-amber-700">Please sign in instead with your credentials.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setWorkEmail(duplicateEmail);
              setSubTab('signin');
              setDuplicateEmail(null);
              setErrorMessage(null);
              setTimeout(() => passwordInputRef.current?.focus(), 100);
            }}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs transition-all"
          >
            <span>Sign In Instead</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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

      {/* Sub-tab switcher: Sign In vs New Registration */}
      {step === 'details' && (
        <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-2xl gap-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'signin'}
            onClick={() => {
              setSubTab('signin');
              setErrorMessage(null);
            }}
            className={`py-1.5 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              subTab === 'signin'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'register'}
            onClick={() => {
              setSubTab('register');
              setErrorMessage(null);
            }}
            className={`py-1.5 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              subTab === 'register'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            New Coordinator
          </button>
        </div>
      )}

      {/* Mode A: Sign in with Password */}
      {step === 'details' && subTab === 'signin' && (
        <form onSubmit={handlePasswordSignIn} className="space-y-3.5">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Sign in using your official email address and the all-time evaluation password sent to your email.
          </div>

          <div>
            <label htmlFor="st-login-email" className="block text-xs font-semibold text-slate-700 mb-1">
              Official Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                ref={emailInputRef}
                id="st-login-email"
                type="email"
                autoComplete="email"
                required
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                placeholder="coordinator@allianceindia.org"
                className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="st-login-password" className="block text-xs font-semibold text-slate-700">
                Evaluation Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setSubTab('register');
                  setErrorMessage(null);
                }}
                className="text-[11px] text-teal-700 hover:text-teal-900 font-medium transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                ref={passwordInputRef}
                id="st-login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your personal evaluation password"
                className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all font-mono"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <CosmicSpaceButton
              type="submit"
              variant="nebula"
              disabled={isLoading}
              isLoading={isLoading}
              leftIcon={<Lock className="w-4 h-4 text-white" />}
            >
              Sign In with Password
            </CosmicSpaceButton>

            <button
              type="button"
              onClick={() => {
                setSubTab('register');
                setErrorMessage(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-800 py-1 transition-colors underline cursor-pointer text-center"
            >
              First time here? Register as New Coordinator
            </button>
          </div>
        </form>
      )}

      {/* Mode B: Registration / First-Time details */}
      {step === 'details' && subTab === 'register' && (
        <form onSubmit={handleSendOtp} className="space-y-3.5">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Enter your official programme credentials to receive an email OTP and manage team invitations.
          </div>

          <div>
            <label htmlFor="st-email" className="block text-xs font-semibold text-slate-700 mb-1">
              Email address (organisation, Gmail, Outlook, etc.)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                ref={emailInputRef}
                id="st-email"
                type="email"
                autoComplete="email"
                required
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                placeholder="coordinator@allianceindia.org or yourname@gmail.com"
                className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="st-fname" className="block text-xs font-semibold text-slate-700 mb-1">
                First Name
              </label>
              <input
                id="st-fname"
                type="text"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ramesh"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
              />
            </div>
            <div>
              <label htmlFor="st-lname" className="block text-xs font-semibold text-slate-700 mb-1">
                Last Name <span className="font-normal text-slate-400 text-[10px]">(Optional)</span>
              </label>
              <input
                id="st-lname"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Kumar"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="st-state" className="block text-xs font-semibold text-slate-700 mb-1">
                State Scope
              </label>
              <select
                id="st-state"
                value={requestedState}
                onChange={(e) => setRequestedState(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all font-medium text-slate-800 cursor-pointer"
              >
                {INDIAN_STATES_AND_UTS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="st-org" className="block text-xs font-semibold text-slate-700 mb-1">
                Organization / Partner / SR
              </label>
              <input
                id="st-org"
                type="text"
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Alliance India"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <CosmicSpaceButton
              type="submit"
              variant="nebula"
              disabled={isLoading}
              isLoading={isLoading}
              rightIcon={<Send className="w-4 h-4 text-white" />}
            >
              Send Verification Code
            </CosmicSpaceButton>

            <button
              type="button"
              onClick={() => {
                setSubTab('signin');
                setErrorMessage(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-800 py-1 transition-colors underline cursor-pointer text-center"
            >
              Already registered? Sign In with Password
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Enter OTP */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 space-y-1">
            <p className="font-semibold">Verification Code Sent</p>
            <p className="text-[11px] text-teal-800">
              Please enter the 6-digit code sent to <span className="font-mono font-bold">{workEmail}</span>.
            </p>
          </div>

          <div>
            <label htmlFor="st-otp" className="block text-xs font-semibold text-slate-700 mb-1.5">
              6-Digit Code
            </label>
            <input
              ref={otpInputRef}
              id="st-otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-full px-4 py-3 text-center tracking-[0.4em] font-mono text-lg bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setStep('details');
                setOtp('');
                setErrorMessage(null);
              }}
              className="py-2.5 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Change details
            </button>

            <CosmicSpaceButton
              type="submit"
              variant="nebula"
              disabled={isLoading || otp.length !== 6}
              isLoading={isLoading}
              leftIcon={<KeyRound className="w-4 h-4 text-white" />}
              className="!w-auto !px-6"
            >
              Verify &amp; Unlock
            </CosmicSpaceButton>
          </div>
        </form>
      )}

      {/* Step 3: Verified / Manage State Team */}
      {step === 'ready' && (
        <div className="space-y-4 pt-1">
          <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-200/80 space-y-3">
            <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
              <Shield className="w-4 h-4 text-teal-700" />
              <span>State Coordinator Access: {requestedState}</span>
            </div>

            <div className="text-xs text-teal-800 space-y-1">
              <p>Email: <span className="font-semibold">{workEmail}</span></p>
              <p>Organization: <span className="font-semibold">{organization}</span></p>
              <p>Status: <span className="font-semibold uppercase tracking-wider text-emerald-700">Verified</span></p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-xs">
              <KeyRound className="w-4 h-4 text-slate-700" />
              <span>Field Team Invitation Code</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Share your team invitation code privately with authorized caseworkers in {requestedState} so they can onboard onto the survey portal.
            </p>

            {invitationStatusMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-medium">
                {invitationStatusMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleIssueInvitationCode}
              disabled={isLoading}
              className="w-full py-2 px-3 text-xs font-semibold text-teal-900 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300/60 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Email Team Invitation Code to My Address
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onSuccess?.();
              router.push('/supervisor');
            }}
            className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
          >
            Continue to State Evaluation Portal
          </button>
        </div>
      )}
    </div>
  );
}
