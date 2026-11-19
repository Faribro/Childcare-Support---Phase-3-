'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Building,
  MapPin,
  Sparkles,
  Mail,
  KeyRound,
  RotateCcw,
  Send,
  ArrowLeft,
} from 'lucide-react';
import { INDIAN_STATES_AND_UTS } from '@/lib/clinical/nutritionCalculations';
import { DistrictCombobox } from '@/components/forms/DistrictCombobox';
import { setEvaluationUnlocked } from '@/lib/auth/evaluationAccess';
import { platformRegistry } from '@/lib/platform/platformRegistry';

interface WelcomeKiteOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialTicketData?: {
    googleEmail?: string;
    firstName?: string;
    lastName?: string;
  } | null;
  initialMode?: 'signin' | 'register';
}

export function WelcomeKiteOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
  initialTicketData,
  initialMode,
}: WelcomeKiteOnboardingModalProps) {
  const router = useRouter();

  // Mode switcher: Returning worker (Email OTP) vs New registration
  const [activeTab, setActiveTab] = useState<'register' | 'signin'>(() => initialMode || 'register');

  // Sign In (Email OTP) State
  const [signInEmail, setSignInEmail] = useState('');
  const [signInCode, setSignInCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Registration State
  const [googleEmail, setGoogleEmail] = useState(() => initialTicketData?.googleEmail || '');
  const [registerEmail, setRegisterEmail] = useState(() => initialTicketData?.googleEmail || '');
  const [firstName, setFirstName] = useState(() => initialTicketData?.firstName || '');
  const [lastName, setLastName] = useState(() => initialTicketData?.lastName || '');
  const [state, setState] = useState('Maharashtra');
  const [district, setDistrict] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [srName, setSrName] = useState('');
  const [ssrName, setSsrName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [stateSrs, setStateSrs] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSrId, setSelectedSrId] = useState('');
  const [isCustomSr, setIsCustomSr] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Registration Email OTP State
  const [regStep, setRegStep] = useState<'details' | 'otp'>('details');
  const [regOtp, setRegOtp] = useState('');
  const [regOtpCooldown, setRegOtpCooldown] = useState(0);
  const [isVerifyingRegOtp, setIsVerifyingRegOtp] = useState(false);

  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const signInEmailInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const regOtpInputRef = useRef<HTMLInputElement>(null);

  // Cooldown countdown effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (otpCooldown > 0) {
      timer = setTimeout(() => setOtpCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  // Registration OTP Cooldown countdown effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (regOtpCooldown > 0) {
      timer = setTimeout(() => setRegOtpCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [regOtpCooldown]);

  // Load active State SRs for the selected state
  useEffect(() => {
    if (isOpen && state) {
      fetch(platformRegistry.resolveUrl(`/api/reference-data/state-srs?state=${encodeURIComponent(state)}`))
        .then((res) => res.json())
        .then((json) => {
          if (json?.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
            setStateSrs(json.data);
            setSelectedSrId(json.data[0].id);
            setSrName((prev) => prev || json.data[0].name);
            setIsCustomSr(false);
          } else {
            setStateSrs([]);
            setIsCustomSr(true);
          }
        })
        .catch(() => {
          setStateSrs([]);
          setIsCustomSr(true);
        });
    }
  }, [isOpen, state]);

  // Reset on modal open
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setInfoMessage(null);
      setRegStep('details');
      setRegOtp('');
      if (initialMode) {
        setActiveTab(initialMode);
      }
      if (initialTicketData?.googleEmail) {
        setGoogleEmail(initialTicketData.googleEmail);
        setRegisterEmail(initialTicketData.googleEmail);
        setFirstName(initialTicketData.firstName || '');
        setLastName(initialTicketData.lastName || '');
      }
    }
  }, [isOpen, initialMode, initialTicketData]);

  // Focus input when tab changes or modal opens
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'register') {
        setTimeout(() => firstNameInputRef.current?.focus(), 80);
      } else {
        setTimeout(() => signInEmailInputRef.current?.focus(), 80);
      }
    }
  }, [isOpen, activeTab]);

  // Escape key closes modal
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

  // --------------------------------------------------------------------------
  // Returning Caseworker: Email OTP Request & Verification Handlers
  // --------------------------------------------------------------------------
  const handleRequestSignInOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = signInEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMessage('Please enter a valid official email address.');
      return;
    }

    setIsSigningIn(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/field-user/email-otp/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setErrorMessage(data.error || 'Failed to send sign-in code.');
        setIsSigningIn(false);
        return;
      }
      setIsOtpSent(true);
      setOtpCooldown(60);
      setInfoMessage(data.message || '6-digit sign-in code sent to your email. Valid for 10 minutes.');
      setIsSigningIn(false);
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch {
      setErrorMessage('Network error requesting sign-in code. Please check your connection.');
      setIsSigningIn(false);
    }
  };

  const handleVerifySignInOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = signInCode.trim();
    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setErrorMessage('Please enter the 6-digit numeric verification code.');
      return;
    }

    setIsSigningIn(true);
    setErrorMessage(null);

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/field-user/email-otp/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signInEmail.trim().toLowerCase(),
          code: cleanCode,
          purpose: 'login',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setErrorMessage(data.error || 'Verification code failed. Please check and try again.');
        setIsSigningIn(false);
        return;
      }

      const profile = data.profile;
      const cleanEmail = signInEmail.trim().toLowerCase();
      if (typeof window !== 'undefined' && profile) {
        const fullProfile = {
          ...profile,
          organizationName: profile.organizationName || profile.srName || 'India HIV/AIDS Alliance',
          organizationEmail: profile.organizationEmail || profile.googleEmail || profile.email || cleanEmail,
          email: profile.email || profile.googleEmail || cleanEmail,
        };
        localStorage.setItem('field_user_profile', JSON.stringify(fullProfile));
        if (profile.srName) {
          localStorage.setItem(
            'field_user_sr',
            JSON.stringify({
              srName: profile.srName,
              ssrName: profile.ssrName || '',
            })
          );
        }
      }

      // Secure storage backup for mobile native persistence
      try {
        if (data.sessionToken) {
          const storage = platformRegistry.getSecureStorage();
          await storage.setSecret('field_session_token', data.sessionToken);
        }
      } catch (_) {}

      // Update evaluation session context
      if (profile) {
        setEvaluationUnlocked(false, {
          userId: profile.id,
          name: profile.name,
          role: 'FIELD_USER',
          allowedStates: [profile.assignedState],
          allowedDistricts: [profile.assignedDistrict],
          isVerified: true,
        });
      }

      setIsSigningIn(false);
      onSuccess?.();
      onClose();
      router.push('/app');
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        try {
          window.location.reload();
        } catch (_) {}
      }
    } catch {
      setErrorMessage('Network or server error during sign-in. Please try again.');
      setIsSigningIn(false);
    }
  };

  // --------------------------------------------------------------------------
  // New Worker Registration Submission Handler (Email OTP & Profile)
  // --------------------------------------------------------------------------
  const executeRegistration = async (emailTicket?: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    const finalSr = srName.trim();
    const cleanEmail = registerEmail.trim().toLowerCase();

    const persistLocal = (profileId?: string, profileName?: string, userEmail?: string) => {
      if (typeof window !== 'undefined') {
        const cleanMobile = mobileNumber.trim().replace(/\D/g, '');
        const maskedMobile = cleanMobile.length >= 4 ? `+91 ******${cleanMobile.slice(-4)}` : undefined;
        const finalEmail = userEmail || cleanEmail || googleEmail.trim() || undefined;
        const profileObj = {
          id: profileId || `fld_local_${Date.now()}`,
          name: profileName || `${firstName.trim()} ${lastName.trim()}`.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          assignedState: state.trim(),
          assignedDistrict: district.trim(),
          googleEmail: finalEmail,
          email: finalEmail,
          organizationName: finalSr || 'India HIV/AIDS Alliance',
          organizationEmail: finalEmail,
          maskedMobile,
          srName: finalSr,
          ssrName: ssrName.trim(),
        };
        localStorage.setItem('field_user_profile', JSON.stringify(profileObj));
        localStorage.setItem(
          'field_user_sr',
          JSON.stringify({
            srName: finalSr,
            ssrName: ssrName.trim(),
          })
        );
      }
    };

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/field-user/complete-onboarding'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          state: state.trim(),
          district: district.trim(),
          email: cleanEmail || googleEmail.trim() || undefined,
          emailTicket: emailTicket || undefined,
          mobileNumber: mobileNumber.trim() || undefined,
          invitationCode: invitationCode.trim() || undefined,
          srName: finalSr,
          ssrName: ssrName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === 'error') {
        setErrorMessage(data.error || 'Failed to complete registration. Please verify details.');
        setIsLoading(false);
        setIsVerifyingRegOtp(false);
        return;
      }

      persistLocal(data.profile?.id, data.profile?.name, data.profile?.googleEmail);

      // Save session token in native secure storage if returned
      try {
        if (data.data?.session?.token) {
          const storage = platformRegistry.getSecureStorage();
          await storage.setSecret('field_session_token', data.data.session.token);
        }
      } catch (_) {}

      if (data.profile) {
        setEvaluationUnlocked(false, {
          userId: data.profile.id,
          name: data.profile.name,
          role: 'FIELD_USER',
          allowedStates: [data.profile.assignedState],
          allowedDistricts: [data.profile.assignedDistrict],
          isVerified: true,
        });
      }

      setIsLoading(false);
      setIsVerifyingRegOtp(false);
      onSuccess?.();
      onClose();
      router.push(data.redirectUrl || '/assessment/new');
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        try {
          window.location.reload();
        } catch (_) {}
      }
    } catch {
      setErrorMessage('Network or server error completing profile. Please try again.');
      setIsLoading(false);
      setIsVerifyingRegOtp(false);
    }
  };

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setErrorMessage('Please enter your first name.');
      return;
    }
    if (!state.trim()) {
      setErrorMessage('Please select your state.');
      return;
    }
    if (!district.trim()) {
      setErrorMessage('Please enter your assigned district.');
      return;
    }
    if (mobileNumber.trim() && !/^[6-9]\d{9}$/.test(mobileNumber.trim())) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number starting with 6-9, or leave blank.');
      return;
    }
    const finalSr = srName.trim();
    if (!finalSr) {
      setErrorMessage('Please enter or select your State Sub-Recipient (SR) Name.');
      return;
    }
    if (!invitationCode.trim()) {
      setErrorMessage('Please enter your state-team invitation code.');
      return;
    }

    const cleanEmail = (registerEmail.trim() || googleEmail.trim()).toLowerCase();

    // If official email is entered and user is not authenticated via Google OAuth:
    // Request Email OTP for first-time registration verification
    if (!googleEmail) {
      if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
        setErrorMessage('Please enter a valid official email address.');
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      setInfoMessage(null);

      try {
        const res = await fetch(platformRegistry.resolveUrl('/api/auth/field-user/email-otp/request'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, purpose: 'registration' }),
        });
        const data = await res.json();
        if (!res.ok || data.status === 'error') {
          setErrorMessage(data.error || 'Failed to send verification code to your email.');
          setIsLoading(false);
          return;
        }

        setRegStep('otp');
        setRegOtpCooldown(60);
        setInfoMessage(data.message || `6-digit verification code sent to ${cleanEmail}. Valid for 10 minutes.`);
        setIsLoading(false);
        setTimeout(() => regOtpInputRef.current?.focus(), 100);
        return;
      } catch {
        setErrorMessage('Network error requesting verification code. Please check your connection.');
        setIsLoading(false);
        return;
      }
    }

    // Direct registration for pre-authenticated Google OAuth
    await executeRegistration();
  };

  const handleVerifyRegOtpAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = regOtp.trim();
    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setErrorMessage('Please enter the 6-digit numeric verification code.');
      return;
    }

    setIsVerifyingRegOtp(true);
    setErrorMessage(null);

    const cleanEmail = registerEmail.trim().toLowerCase();

    try {
      const verifyRes = await fetch(platformRegistry.resolveUrl('/api/auth/field-user/email-otp/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          code: cleanCode,
          purpose: 'registration',
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || verifyData.status === 'error') {
        setErrorMessage(verifyData.error || 'Verification code failed. Please check and try again.');
        setIsVerifyingRegOtp(false);
        return;
      }

      const emailTicket = verifyData.emailTicket;
      await executeRegistration(emailTicket);
    } catch {
      setErrorMessage('Network error verifying code. Please try again.');
      setIsVerifyingRegOtp(false);
    }
  };

  const handleResendRegOtp = async () => {
    const cleanEmail = registerEmail.trim().toLowerCase();
    if (!cleanEmail) return;

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await fetch(platformRegistry.resolveUrl('/api/auth/field-user/email-otp/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, purpose: 'registration' }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setErrorMessage(data.error || 'Failed to resend verification code.');
        setIsLoading(false);
        return;
      }

      setRegOtpCooldown(60);
      setInfoMessage(data.message || `New 6-digit verification code sent to ${cleanEmail}.`);
      setIsLoading(false);
    } catch {
      setErrorMessage('Network error resending code. Please check your connection.');
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-kite-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 motion-reduce:animate-none"
    >
      <div
        className="w-full max-w-lg max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-teal-100 overflow-hidden animate-in zoom-in-95 duration-150 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Playful & Pastoral Kite Header Banner */}
        <div className="relative bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-800 px-6 py-5 text-white shrink-0 overflow-hidden">
          {/* Subtle background SVG Kite Motif */}
          <div className="absolute right-4 -top-2 opacity-15 pointer-events-none" aria-hidden="true">
            <svg width="140" height="140" viewBox="0 0 100 100" fill="none">
              <polygon points="50,10 85,50 50,90 15,50" fill="currentColor" stroke="#fff" strokeWidth="2" />
              <line x1="50" y1="10" x2="50" y2="90" stroke="#fff" strokeWidth="1.5" />
              <line x1="15" y1="50" x2="85" y2="50" stroke="#fff" strokeWidth="1.5" />
              <path d="M 50,90 Q 60,110 50,130" stroke="#fff" strokeWidth="1.5" fill="none" />
            </svg>
          </div>

          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-3.5">
              {/* Kite Icon Badge */}
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner shrink-0">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" className="transform -rotate-12">
                  <polygon points="16,3 28,15 16,27 4,15" fill="#38BDF8" fillOpacity="0.85" stroke="#FFFFFF" strokeWidth="2" />
                  <line x1="16" y1="3" x2="16" y2="27" stroke="#F59E0B" strokeWidth="1.5" />
                  <line x1="4" y1="15" x2="28" y2="15" stroke="#F59E0B" strokeWidth="1.5" />
                  <path d="M 16,27 C 14,30 20,31 17,34" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
              </div>

              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-600/60 border border-teal-400/30 text-[11px] font-medium text-teal-100 mb-1">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>Field Caseworker Onboarding</span>
                </div>
                <h2 id="welcome-kite-title" className="text-lg font-bold text-white tracking-tight leading-snug">
                  Welcome to Child Care Support
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-white/70 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher: Returning Worker (Email OTP) vs New Registration */}
        <div className="flex border-b border-slate-100 bg-slate-50/80 px-6 pt-2.5 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setErrorMessage(null);
              setInfoMessage(null);
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'register'
                ? 'border-teal-700 text-teal-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            <span>New Registration</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('signin');
              setErrorMessage(null);
              setInfoMessage(null);
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'signin'
                ? 'border-teal-700 text-teal-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-teal-700" />
            <span>Returning Caseworker</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-start gap-2.5 animate-in fade-in"
            >
              <CheckCircle className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{infoMessage}</div>
            </div>
          )}

          {/* TAB 1: RETURNING CASEWORKER (EMAIL OTP SIGN IN) */}
          {activeTab === 'signin' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800">Sign In to Your Existing Account</h3>
                <p className="text-[11px] text-slate-500">
                  Enter your registered official email. We will send you a 6-digit verification code to restore your profile and all previous submissions.
                </p>
              </div>

              {!isOtpSent ? (
                <form onSubmit={handleRequestSignInOtp} noValidate className="space-y-4">
                  <div>
                    <label htmlFor="signin-email" className="block text-xs font-semibold text-slate-700 mb-1">
                      Official Email Address *
                    </label>
                    <div className="relative">
                      <input
                        ref={signInEmailInputRef}
                        id="signin-email"
                        type="email"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        required
                        placeholder="e.g. caseworker@allianceindia.org"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all pl-9"
                      />
                      <div className="absolute left-3 top-2.5 text-slate-400 pointer-events-none">
                        <Mail className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      We will send a 6-digit single-use code valid for 10 minutes.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSigningIn ? (
                      <span className="inline-flex items-center gap-2 text-xs">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Sending 6-Digit Code…
                      </span>
                    ) : (
                      <>
                        <span>Send Sign-in Code</span>
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">First time here?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('register');
                        setRegStep('details');
                        if (signInEmail) setRegisterEmail(signInEmail);
                        setErrorMessage(null);
                        setInfoMessage(null);
                      }}
                      className="font-semibold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Register New Account</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifySignInOtp} noValidate className="space-y-4">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-teal-700" />
                      <span className="text-xs font-semibold text-slate-800">{signInEmail}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsOtpSent(false);
                        setSignInCode('');
                        setErrorMessage(null);
                        setInfoMessage(null);
                      }}
                      className="text-[11px] text-teal-700 hover:underline font-medium cursor-pointer"
                    >
                      Change Email
                    </button>
                  </div>

                  <div>
                    <label htmlFor="signin-otp" className="block text-xs font-semibold text-slate-700 mb-1">
                      Enter 6-Digit Code *
                    </label>
                    <div className="relative">
                      <input
                        ref={otpInputRef}
                        id="signin-otp"
                        type="text"
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        value={signInCode}
                        onChange={(e) => setSignInCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        required
                        placeholder="••••••"
                        className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-widest bg-emerald-50/40 border border-emerald-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
                      />
                      <div className="absolute right-3 top-3 text-emerald-600 pointer-events-none">
                        <KeyRound className="w-4 h-4 opacity-50" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px]">
                      <span className="text-slate-500">Max 3 attempts per code</span>
                      {otpCooldown > 0 ? (
                        <span className="text-slate-400">Resend in {otpCooldown}s</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestSignInOtp()}
                          disabled={isSigningIn}
                          className="text-teal-700 hover:underline font-semibold cursor-pointer"
                        >
                          Resend Code
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSigningIn || signInCode.length !== 6}
                    className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSigningIn ? (
                      <span className="inline-flex items-center gap-2 text-xs">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Verifying Code…
                      </span>
                    ) : (
                      <>
                        <span>Verify &amp; Restore Account</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Not receiving code?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('register');
                        setRegStep('details');
                        if (signInEmail) setRegisterEmail(signInEmail);
                        setErrorMessage(null);
                        setInfoMessage(null);
                      }}
                      className="font-semibold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                    >
                      Register as a new caseworker
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: NEW WORKER REGISTRATION (DETAILS FORM) */}
          {activeTab === 'register' && regStep === 'details' && (
            <form onSubmit={handleSubmitProfile} noValidate className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800">Complete Field Profile</h3>
                <p className="text-[11px] text-slate-500">
                  Register with your official email using our single-use Email OTP system. Your profile will be securely registered in the state programme database.
                </p>
              </div>

              {googleEmail && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-800">{googleEmail}</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                    Linked Account
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-first-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    First Name *
                  </label>
                  <input
                    ref={firstNameInputRef}
                    id="field-first-name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    placeholder="Enter first name"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="field-last-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Last Name
                  </label>
                  <input
                    id="field-last-name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Single name supported"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {!googleEmail && (
                <div>
                  <label htmlFor="field-register-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Official Email Address *
                  </label>
                  <div className="relative">
                    <input
                      id="field-register-email"
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="e.g. caseworker@allianceindia.org"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all pl-9"
                    />
                    <div className="absolute left-3 top-2.5 text-slate-400 pointer-events-none">
                      <Mail className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    We will send a 6-digit verification code to confirm your email address.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-state-select" className="block text-xs font-semibold text-slate-700 mb-1">
                    State / UT *
                  </label>
                  <select
                    id="field-state-select"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all cursor-pointer"
                  >
                    {INDIAN_STATES_AND_UTS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <DistrictCombobox
                    state={state}
                    value={district}
                    onChange={setDistrict}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-sr-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    State Sub-Recipient (SR) *
                  </label>
                  {stateSrs.length > 0 && !isCustomSr ? (
                    <select
                      id="field-sr-select"
                      aria-label="State Sub-Recipient (SR)"
                      value={selectedSrId}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setIsCustomSr(true);
                          setSrName('');
                        } else {
                          setSelectedSrId(val);
                          const matched = stateSrs.find((s) => s.id === val);
                          setSrName(matched?.name || '');
                        }
                      }}
                      required
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all cursor-pointer"
                    >
                      {stateSrs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value="__custom__">+ Enter custom SR Name</option>
                    </select>
                  ) : (
                    <div>
                      <input
                        id="field-sr-name"
                        aria-label="State Sub-Recipient (SR)"
                        type="text"
                        value={srName}
                        onChange={(e) => setSrName(e.target.value)}
                        required
                        placeholder="e.g. Alliance India State Partner"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
                      />
                      {stateSrs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsCustomSr(false)}
                          className="mt-1 text-[11px] text-teal-700 hover:underline"
                        >
                          Select from authorized SR list
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="field-ssr-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Sub-Sub-Recipient (SSR)
                  </label>
                  <input
                    id="field-ssr-name"
                    aria-label="Sub-Sub-Recipient (SSR)"
                    type="text"
                    value={ssrName}
                    onChange={(e) => setSsrName(e.target.value)}
                    placeholder="e.g. Pune Care Center / NGO"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="field-mobile-number" className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number (Optional)
                </label>
                <div className="relative">
                  <input
                    id="field-mobile-number"
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="e.g. 9876543210 (10 digits)"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all font-mono"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Optional contact number for field coordination.
                </p>
              </div>

              <div>
                <label htmlFor="field-invitation-code" className="block text-xs font-semibold text-slate-700 mb-1">
                  State-Team Invitation Code *
                </label>
                <div className="relative">
                  <input
                    id="field-invitation-code"
                    type="text"
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                    required
                    placeholder="e.g. ALN-MH-7K9W-4P2R"
                    className="w-full px-3 py-2.5 text-sm font-mono tracking-wider bg-emerald-50/40 border border-emerald-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none uppercase transition-all"
                  />
                  <div className="absolute right-3 top-2.5 text-emerald-600 pointer-events-none">
                    <Building className="w-4 h-4 opacity-50" />
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Enter the private code provided by your state programme team. Required for authorization.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      Sending Verification Code…
                    </span>
                  ) : (
                    <>
                      <span>Complete Registration &amp; Open Survey</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: NEW WORKER REGISTRATION (EMAIL OTP VERIFICATION STEP) */}
          {activeTab === 'register' && regStep === 'otp' && (
            <form onSubmit={handleVerifyRegOtpAndSubmit} noValidate className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800">Verify Your Email Address</h3>
                <p className="text-[11px] text-slate-500">
                  A 6-digit verification code was dispatched to your email. Enter it below to complete registration and create your caseworker profile.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-semibold text-slate-800">{registerEmail}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRegStep('details');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className="text-[11px] text-teal-700 hover:underline font-medium cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Edit Details</span>
                </button>
              </div>

              <div>
                <label htmlFor="reg-otp" className="block text-xs font-semibold text-slate-700 mb-1">
                  Enter 6-Digit Code *
                </label>
                <div className="relative">
                  <input
                    ref={regOtpInputRef}
                    id="reg-otp"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={regOtp}
                    onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    placeholder="••••••"
                    className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-widest bg-emerald-50/40 border border-emerald-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
                  />
                  <div className="absolute right-3 top-3 text-emerald-600 pointer-events-none">
                    <KeyRound className="w-4 h-4 opacity-50" />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px]">
                  <span className="text-slate-500">Valid for 10 minutes</span>
                  {regOtpCooldown > 0 ? (
                    <span className="text-slate-400">Resend in {regOtpCooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendRegOtp}
                      disabled={isLoading}
                      className="text-teal-700 hover:underline font-semibold cursor-pointer"
                    >
                      Resend Code
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isVerifyingRegOtp || regOtp.length !== 6}
                  className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isVerifyingRegOtp ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      Verifying &amp; Creating Profile…
                    </span>
                  ) : (
                    <>
                      <span>Verify Code &amp; Complete Registration</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setRegStep('details')}
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors cursor-pointer"
                >
                  Back to Registration Details
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
