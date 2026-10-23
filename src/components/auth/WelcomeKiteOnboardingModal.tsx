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
} from 'lucide-react';
import { INDIAN_STATES_AND_UTS } from '@/lib/clinical/nutritionCalculations';

interface WelcomeKiteOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialTicketData?: {
    googleEmail?: string;
    firstName?: string;
    lastName?: string;
  } | null;
}

export function WelcomeKiteOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
  initialTicketData,
}: WelcomeKiteOnboardingModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<'welcome' | 'profile'>(() =>
    initialTicketData?.googleEmail ? 'profile' : 'welcome'
  );
  const [googleEmail, setGoogleEmail] = useState(() => initialTicketData?.googleEmail || '');
  const [firstName, setFirstName] = useState(() => initialTicketData?.firstName || '');
  const [lastName, setLastName] = useState(() => initialTicketData?.lastName || '');
  const [state, setState] = useState('Maharashtra');
  const [district, setDistrict] = useState('');
  const [invitationCode, setInvitationCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const firstNameInputRef = useRef<HTMLInputElement>(null);

  // Check if onboarding ticket already exists in cookie
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (initialTicketData?.googleEmail) {
        setGoogleEmail(initialTicketData.googleEmail);
        setFirstName(initialTicketData.firstName || '');
        setLastName(initialTicketData.lastName || '');
        setStep('profile');
      } else {
        // Query ticket status from server
        fetch('/api/auth/field-user/ticket')
          .then((res) => res.json())
          .then((data) => {
            if (data?.hasTicket && data?.data) {
              setGoogleEmail(data.data.googleEmail || '');
              setFirstName(data.data.firstName || '');
              setLastName(data.data.lastName || '');
              setStep('profile');
            } else {
              setStep('welcome');
            }
          })
          .catch(() => {
            setStep('welcome');
          });
      }
    }
  }, [isOpen, initialTicketData]);

  // Focus input on step change
  useEffect(() => {
    if (step === 'profile') {
      setTimeout(() => firstNameInputRef.current?.focus(), 80);
    }
  }, [step]);

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

  const handleStartGoogle = () => {
    // Redirect to Google login route with returnTo set to /assessment/new
    window.location.href = '/api/auth/google/login?returnTo=/assessment/new';
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
    if (!invitationCode.trim()) {
      setErrorMessage('Please enter your state-team invitation code.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/field-user/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          state: state.trim(),
          district: district.trim(),
          invitationCode: invitationCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === 'error') {
        setErrorMessage(data.error || 'Failed to complete onboarding. Please check your invitation code.');
        setIsLoading(false);
        return;
      }

      onSuccess?.();
      onClose();
      router.push(data.redirectUrl || '/assessment/new');
    } catch {
      setErrorMessage('Network or server error completing profile. Please try again.');
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
        <div className="relative bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-800 px-6 py-6 text-white shrink-0 overflow-hidden">
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
              {/* Animated/Pastoral Kite Icon Badge */}
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Step 1: Welcome & Continue with Google */}
          {step === 'welcome' && (
            <div className="space-y-6 py-2">
              <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
                <p className="font-semibold text-slate-800 text-base">
                  Ready to begin a new survey?
                </p>
                <p>
                  To ensure child assessment records are linked accurately to your authorized state programme,
                  please connect your Google account and enter the invitation code provided by your state coordinator.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200/60 space-y-2.5">
                <div className="flex items-center gap-2 text-teal-950 font-semibold text-xs">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  <span>Simple One-Time Verification:</span>
                </div>
                <ul className="text-xs text-teal-900 space-y-1.5 pl-6 list-disc">
                  <li>Quick sign-in with your personal or work Google account</li>
                  <li>Enter your state team&apos;s private invitation code once</li>
                  <li>Returning surveys will open instantly without repeating this setup</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={handleStartGoogle}
                className="w-full py-3.5 px-5 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-3 group"
              >
                {/* Google "G" Logo */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  Cancel and return to workspace
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Confirm Profile & Invitation Code */}
          {step === 'profile' && (
            <form onSubmit={handleSubmitProfile} noValidate className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Complete Field Profile</h3>
              {googleEmail && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-800">{googleEmail}</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                    Verified
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

              <div className="grid grid-cols-2 gap-3">
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
                  <label htmlFor="field-district-input" className="block text-xs font-semibold text-slate-700 mb-1">
                    District *
                  </label>
                  <input
                    id="field-district-input"
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    required
                    placeholder="Assigned district"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
                  />
                </div>
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
                  Enter the private code provided by your state programme team.
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
                      Validating &amp; Creating Profile…
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
        </div>
      </div>
    </div>
  );
}
