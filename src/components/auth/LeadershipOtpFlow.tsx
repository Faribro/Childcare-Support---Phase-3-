'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail,
  Key,
  Shield,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Building2,
  ChevronDown,
  Check,
  UserCheck,
} from 'lucide-react';
import { setEvaluationUnlocked, EvaluationUser, useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { supervisorReadModel } from '@/lib/read-model/supervisorReadModel';

export interface LeadershipOtpFlowProps {
  isModal?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
  initialEmail?: string;
}

export interface CandidateAuthUser {
  userId?: string;
  email: string;
  name?: string;
  role?: string;
}

// Synthetic fixtures for local development & testing ONLY.
// Gate: rendered ONLY when process.env.NODE_ENV !== 'production' AND NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES === 'true'.
// Using clearly fictional profiles and RFC 2606 reserved example domains.
const DEV_SYNTHETIC_FIXTURES = [
  {
    id: 'fictional-alex-rivera',
    name: 'Alex Rivera (Fictional Demo)',
    title: 'Surveillance Lead (Synthetic)',
    email: 'alex.rivera@example.com',
  },
  {
    id: 'fictional-sam-chen',
    name: 'Sam Chen (Fictional Demo)',
    title: 'Monitoring Coordinator (Synthetic)',
    email: 'sam.chen@example.org',
  },
  {
    id: 'fictional-jordan-taylor',
    name: 'Jordan Taylor (Fictional Demo)',
    title: 'Programme Director (Synthetic)',
    email: 'jordan.taylor@example.net',
  },
];

const MOCK_SYNTHETIC_CODE = '0123456789abcdef0123456789abcdef';
const VALID_AUTH_MODES = ['hybrid', 'email_only', 'password_only'] as const;

export function LeadershipOtpFlow({
  isModal = true,
  onSuccess,
  onCancel,
  initialEmail = '',
}: LeadershipOtpFlowProps) {
  const { login } = useEvaluationAccess();

  // Runtime feature flag & server cutover state
  const [isFeatureEnabled, setIsFeatureEnabled] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<string>('hybrid');
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Stepper state: 'input' -> 'verify'
  const [step, setStep] = useState<'input' | 'verify'>('input');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingSession, setIsSyncingSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Candidate user to match against server session authority
  const [syncFailedCandidate, setSyncFailedCandidate] = useState<CandidateAuthUser | null>(null);

  // Fallback shared password state (when feature is explicitly disabled)
  const [sharedPassword, setSharedPassword] = useState('');

  // Synthetic fixtures state (strictly dev/test gated)
  const isDevOrTest = process.env.NODE_ENV !== 'production';
  const hasFixtureFlag = process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES === 'true';
  const showSyntheticFixtures = isDevOrTest && hasFixtureFlag;

  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [highlightedFixtureIndex, setHighlightedFixtureIndex] = useState(0);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const sharedPasswordRef = useRef<HTMLInputElement>(null);

  // Lifecycle ref to prevent stale in-flight response consumption across account changes
  const activeRequestEmailRef = useRef<string>('');
  const activeStatusRequestIdRef = useRef<number>(0);

  // 1. Check runtime status on mount with strict payload validation
  const checkStatus = useCallback(async () => {
    const requestId = ++activeStatusRequestIdRef.current;
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch('/api/auth/leader/status', {
        headers: { 'Cache-Control': 'no-cache' },
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(6000) : undefined,
      });

      if (requestId !== activeStatusRequestIdRef.current) return;

      if (!res.ok) {
        throw new Error(`Status check failed: HTTP ${res.status}`);
      }

      const json = await res.json().catch(() => null);

      if (requestId !== activeStatusRequestIdRef.current) return;

      if (!json || typeof json !== 'object' || json.status !== 'success' || !json.data || typeof json.data !== 'object') {
        throw new Error('Malformed status response: invalid response structure');
      }

      // Strict boolean validation: reject missing, null, string, numeric, array, and object values
      if (typeof json.data.emailAuthEnabled !== 'boolean') {
        throw new Error('Malformed status response: emailAuthEnabled must be a strict boolean');
      }

      // Strict authMode validation against documented server policy
      const returnedMode = json.data.authMode;
      if (typeof returnedMode !== 'string' || !(VALID_AUTH_MODES as readonly string[]).includes(returnedMode)) {
        throw new Error('Malformed status response: invalid or missing authMode');
      }

      setIsFeatureEnabled(json.data.emailAuthEnabled);
      setAuthMode(returnedMode);
    } catch {
      if (requestId !== activeStatusRequestIdRef.current) return;
      // Fail closed: do NOT enable fallback or set isFeatureEnabled = false
      setIsFeatureEnabled(null);
      setStatusError('Unable to verify authentication service status. Please check your network connection.');
    } finally {
      if (requestId === activeStatusRequestIdRef.current) {
        setStatusLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 2. Focus management on step change
  useEffect(() => {
    if (statusLoading || statusError) return;

    if (isFeatureEnabled === false) {
      setTimeout(() => sharedPasswordRef.current?.focus(), 50);
      return;
    }

    if (step === 'input') {
      setTimeout(() => emailInputRef.current?.focus(), 50);
    } else {
      setTimeout(() => codeInputRef.current?.focus(), 50);
    }
  }, [step, isFeatureEnabled, statusLoading, statusError]);

  // 3. Resend cooldown countdown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // 4. Click outside to close combobox
  useEffect(() => {
    if (!isComboboxOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setIsComboboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isComboboxOpen]);

  // 5. Handle combobox keyboard navigation
  const handleComboboxKeyDown = (e: React.KeyboardEvent) => {
    if (!isComboboxOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsComboboxOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedFixtureIndex((prev) =>
        prev < DEV_SYNTHETIC_FIXTURES.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedFixtureIndex((prev) =>
        prev > 0 ? prev - 1 : DEV_SYNTHETIC_FIXTURES.length - 1
      );
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const fixture = DEV_SYNTHETIC_FIXTURES[highlightedFixtureIndex];
      if (fixture) {
        selectFixture(fixture);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsComboboxOpen(false);
    }
  };

  const selectFixture = (fixture: typeof DEV_SYNTHETIC_FIXTURES[0]) => {
    setEmail(fixture.email);
    setSelectedFixtureId(fixture.id);
    setIsComboboxOpen(false);
    setErrorMessage(null);
    emailInputRef.current?.focus();
  };

  // 6. Handle code request (Step 1)
  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid work email address.');
      emailInputRef.current?.focus();
      return;
    }

    // Set active request email to guard against stale responses
    activeRequestEmailRef.current = cleanEmail;

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    setSuccessMessage(null);

    // Synthetic Fixture Isolation: Synthetic accounts never reach live OTP endpoints
    if (showSyntheticFixtures && selectedFixtureId) {
      setTimeout(() => {
        if (activeRequestEmailRef.current !== cleanEmail) return; // Stale check
        setInfoMessage(
          'Synthetic fixture mode: Demonstration code dispatched to mock memory store. Live evaluation surveillance endpoints remain locked.'
        );
        setStep('verify');
        setCooldownSeconds(60);
        setCode(MOCK_SYNTHETIC_CODE); // Pre-fill mock code for local demonstration
        setSyncFailedCandidate(null);
        setIsLoading(false);
      }, 300);
      return;
    }

    try {
      const res = await fetch('/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json().catch(() => ({}));

      // Guard against stale response if user switched accounts while request was in-flight
      if (activeRequestEmailRef.current !== cleanEmail) {
        return;
      }

      if (!res.ok) {
        // Authoritative server rate-limit handling (HTTP 429)
        if (res.status === 429 && typeof data?.retryAfterSeconds === 'number') {
          setCooldownSeconds(data.retryAfterSeconds);
        }
        setErrorMessage(data?.message || 'Failed to dispatch verification code. Please try again.');
        setIsLoading(false);
        return;
      }

      setInfoMessage(
        data?.message ||
          'If this account is an authorized Leadership identity, a single-use verification code has been dispatched.'
      );
      setStep('verify');
      setCooldownSeconds(60);
      setCode('');
      setSyncFailedCandidate(null);
    } catch {
      if (activeRequestEmailRef.current === cleanEmail) {
        setErrorMessage('Network error while requesting verification code. Please check your connection.');
      }
    } finally {
      if (activeRequestEmailRef.current === cleanEmail) {
        setIsLoading(false);
      }
    }
  };

  // 7. Session Synchronization with Strict Identity Matching (Phase 2 of 2-Phase Auth)
  const synchronizeSession = useCallback(
    async (candidate: CandidateAuthUser): Promise<boolean> => {
      setIsSyncingSession(true);
      try {
        const res = await fetch('/api/auth/session', {
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!res.ok) {
          throw new Error(`Session verification failed: HTTP ${res.status}`);
        }

        const sessionJson = await res.json().catch(() => null);

        if (!sessionJson || sessionJson.status !== 'success' || !sessionJson.data) {
          throw new Error('Invalid session verification response envelope');
        }

        if (sessionJson.data.isVerified !== true) {
          throw new Error('Session is not marked verified by server authority');
        }

        const sessionUserId = sessionJson.data.userId;
        if (!sessionUserId || typeof sessionUserId !== 'string') {
          throw new Error('Missing session identity in server authorization response');
        }

        // Strict Identity Matching: Confirm session matches the verified candidate account
        if (candidate.userId) {
          if (candidate.userId !== sessionUserId) {
            throw new Error(
              `Session identity mismatch: server session identified '${sessionUserId}' but verified account was '${candidate.userId}'.`
            );
          }
        } else if (candidate.email && sessionJson.data.email) {
          const normCandidateEmail = candidate.email.trim().toLowerCase();
          const normSessionEmail = String(sessionJson.data.email).trim().toLowerCase();
          if (normCandidateEmail !== normSessionEmail) {
            throw new Error(
              `Session identity mismatch: server session email '${normSessionEmail}' does not match verified email '${normCandidateEmail}'.`
            );
          }
        }

        // Validate server-authorized role
        const sessionRole = sessionJson.data.role;
        const validRoles = ['LEADERSHIP', 'supervisor', 'ADMIN'];
        if (!sessionRole || !validRoles.includes(sessionRole)) {
          throw new Error(`Insufficient role permissions for Leadership evaluation: '${sessionRole}'`);
        }

        // Validate server-authorized scope
        const sessionStates = sessionJson.data.allowedStates;
        if (!Array.isArray(sessionStates) || sessionStates.length === 0) {
          throw new Error('Session has no authorized geographic states assigned');
        }

        // Use session-returned identity, role, and scope for unlocked state
        const confirmedUser: EvaluationUser = {
          userId: sessionUserId,
          name: sessionJson.data.name || candidate.name || 'Leadership Member',
          role: sessionRole,
          allowedStates: sessionStates,
          allowedDistricts: sessionJson.data.allowedDistricts || ['*'],
          isVerified: true,
        };

        // Purge any stale read-model caches and update client-side auth state
        supervisorReadModel.purgeSession();
        setEvaluationUnlocked(true, confirmedUser);
        setSuccessMessage(`Welcome back, ${confirmedUser.name}! Opening Leadership surveillance…`);
        setSyncFailedCandidate(null);
        setErrorMessage(null);

        setTimeout(() => {
          onSuccess?.();
        }, 600);
        return true;
      } catch (err: any) {
        setErrorMessage(
          err?.message?.includes('identity mismatch')
            ? err.message
            : 'Verification succeeded, but session synchronization failed. Click "Retry Session Sync" to connect without requesting a new code.'
        );
        setSyncFailedCandidate(candidate);
        return false;
      } finally {
        setIsSyncingSession(false);
      }
    },
    [onSuccess]
  );

  // 8. Handle code verification (Step 2)
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clean and normalize 32-hex character code
    const cleanCode = code.trim().toLowerCase().replace(/[^0-9a-f]/g, '');

    if (!cleanCode) {
      setErrorMessage('Please enter the 32-character verification code from your email.');
      codeInputRef.current?.focus();
      return;
    }

    if (cleanCode.length !== 32) {
      setErrorMessage(
        `Verification code must be exactly 32 hex characters (currently ${cleanCode.length} / 32).`
      );
      codeInputRef.current?.focus();
      return;
    }

    const currentVerifyEmail = email.trim().toLowerCase();
    activeRequestEmailRef.current = currentVerifyEmail;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Synthetic Fixture Isolation: Synthetic accounts never reach live verify endpoint
    if (showSyntheticFixtures && selectedFixtureId) {
      setTimeout(async () => {
        if (activeRequestEmailRef.current !== currentVerifyEmail) return;
        if (cleanCode !== MOCK_SYNTHETIC_CODE) {
          setErrorMessage('Invalid mock verification code.');
          setIsLoading(false);
          return;
        }

        const fixture = DEV_SYNTHETIC_FIXTURES.find((f) => f.id === selectedFixtureId);

        // Security boundary: Synthetic success must NEVER unlock live data requests
        // or mutate live read-model session stores.
        setSuccessMessage(
          `Synthetic demonstration verified for ${fixture?.name || 'Synthetic Demo User'}. Live evaluation surveillance endpoints remain locked.`
        );
        setIsLoading(false);
        setTimeout(() => {
          onSuccess?.();
        }, 600);
      }, 300);
      return;
    }

    try {
      // Phase 1: verify-code mutation
      const res = await fetch('/api/auth/leader/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentVerifyEmail,
          code: cleanCode,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (activeRequestEmailRef.current !== currentVerifyEmail) {
        return;
      }

      if (!res.ok || body?.status !== 'success') {
        setErrorMessage(body?.message || 'Invalid or expired verification code.');
        setIsLoading(false);
        codeInputRef.current?.focus();
        return;
      }

      // Phase 1 passed! Validate verification response payload
      const returnedUser = body?.data?.user;
      if (!returnedUser || (!returnedUser.id && !returnedUser.userId)) {
        setErrorMessage('Verification response was malformed (missing user identity).');
        setIsLoading(false);
        return;
      }

      const candidate: CandidateAuthUser = {
        userId: returnedUser.id || returnedUser.userId,
        email: returnedUser.email || currentVerifyEmail,
        name: returnedUser.name,
        role: returnedUser.role,
      };

      // Phase 2: Synchronize and confirm session via /api/auth/session
      await synchronizeSession(candidate);
    } catch {
      if (activeRequestEmailRef.current === currentVerifyEmail) {
        setErrorMessage('Network error while verifying code. Please check your connection.');
      }
    } finally {
      if (activeRequestEmailRef.current === currentVerifyEmail) {
        setIsLoading(false);
      }
    }
  };

  // 9. Fallback shared password login (when email auth is explicitly disabled on server)
  const handleSharedPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharedPassword) {
      setErrorMessage('Please enter the leadership evaluation password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await login('LEADERSHIP-ALL', sharedPassword);
      if (result.success) {
        setSuccessMessage('Authentication successful! Leadership surveillance unlocked.');
        setTimeout(() => {
          onSuccess?.();
        }, 600);
      } else {
        setErrorMessage(result.error || 'Authentication failed. Please verify credentials.');
      }
    } catch {
      setErrorMessage('Network error during authentication.');
    } finally {
      setIsLoading(false);
    }
  };

  // Clean code input on change: keep hex only, max 32 (Never persisted to disk)
  const handleCodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 32);
    setCode(sanitized);
    if (errorMessage && sanitized.length === 32) {
      setErrorMessage(null);
    }
  };

  // Reset to email step without preserving entered code
  const handleChangeAccount = () => {
    setStep('input');
    setCode(''); // Clear entered OTP
    setErrorMessage(null);
    setInfoMessage(null);
    setSyncFailedCandidate(null);
  };

  // Loading skeleton while checking status
  if (statusLoading) {
    return (
      <div className="py-8 flex flex-col items-center justify-center space-y-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
        <p className="text-xs font-medium">Checking authentication services…</p>
      </div>
    );
  }

  // Feature Status Check Failed: Fail closed with retry
  if (statusError) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 text-xs text-rose-900">
        <div className="flex items-center gap-2 font-bold text-rose-950">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>Authentication Service Unavailable</span>
        </div>
        <p className="text-[11px] leading-relaxed text-rose-800">
          {statusError}
        </p>
        <button
          type="button"
          onClick={checkStatus}
          className="w-full py-2 px-3 bg-rose-700 hover:bg-rose-800 active:bg-rose-900 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  // Feature Explicitly Disabled by server: check policy mode
  if (isFeatureEnabled === false) {
    if (authMode === 'email_only') {
      return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <span>Leadership Sign-In Unavailable</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800">
            Leadership email authentication is currently disabled on this environment, and shared password sign-in has been retired under server cutover policy.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-amber-950">Notice:</span> Individual email sign-in is disabled on this environment. Please sign in using the shared leadership credential.
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5"
          >
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1 font-medium">{successMessage}</div>
          </div>
        )}

        <form onSubmit={handleSharedPasswordSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="fallback-leadership-password"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Leadership Shared Password
            </label>
            <input
              ref={sharedPasswordRef}
              id="fallback-leadership-password"
              type="password"
              autoComplete="current-password"
              value={sharedPassword}
              onChange={(e) => setSharedPassword(e.target.value)}
              placeholder="Enter leadership evaluation password"
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
                Sign In &amp; Unlock Leadership
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  // Active Flow: Email OTP with 2 Steps
  return (
    <div className="space-y-4">
      {/* Step Indicator Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${
              step === 'input'
                ? 'bg-teal-700 text-white ring-2 ring-teal-200'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {step === 'verify' ? <Check className="w-3 h-3" /> : '1'}
          </div>
          <span
            className={`font-semibold ${
              step === 'input' ? 'text-teal-950 font-bold' : 'text-slate-500'
            }`}
          >
            Work Email
          </span>
        </div>

        <div className="h-0.5 w-8 bg-slate-200 mx-2" aria-hidden="true" />

        <div className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${
              step === 'verify'
                ? 'bg-teal-700 text-white ring-2 ring-teal-200'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            2
          </div>
          <span
            className={`font-semibold ${
              step === 'verify' ? 'text-teal-950 font-bold' : 'text-slate-400'
            }`}
          >
            Verify Code
          </span>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in motion-reduce:animate-none"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed font-medium">{errorMessage}</div>
        </div>
      )}

      {infoMessage && !errorMessage && !successMessage && (
        <div
          role="status"
          className="p-3 rounded-xl bg-teal-50/80 border border-teal-200 text-xs text-teal-900 flex items-start gap-2.5 animate-in fade-in motion-reduce:animate-none"
        >
          <Mail className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{infoMessage}</div>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5 animate-in fade-in motion-reduce:animate-none"
        >
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex-1 font-semibold">{successMessage}</div>
        </div>
      )}

      {/* Recoverable Session Sync Failure Notice */}
      {syncFailedCandidate && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <span>Session Connection Pending</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800">
            Your verification code was accepted, but the server session sync timed out or reported a mismatch. You do not need to request another code.
          </p>
          <button
            type="button"
            onClick={() => synchronizeSession(syncFailedCandidate)}
            disabled={isSyncingSession}
            className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSyncingSession ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Retrying Sync…
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Session Sync
              </>
            )}
          </button>
        </div>
      )}

      {/* STEP 1: Enter Email / Select Account */}
      {step === 'input' && (
        <form onSubmit={handleRequestCode} className="space-y-4">
          {/* Synthetic Dropdown Combobox (DEV/TEST GATED ONLY with Fictional Profiles) */}
          {showSyntheticFixtures && (
            <div className="relative" ref={comboboxRef}>
              <div className="flex items-center justify-between mb-1">
                <label
                  id="combobox-label"
                  className="block text-xs font-semibold text-teal-900"
                >
                  Quick Test Account (Dev / Test)
                </label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-mono font-medium">
                  Fixture Mode
                </span>
              </div>

              <button
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isComboboxOpen}
                aria-labelledby="combobox-label"
                onClick={() => setIsComboboxOpen((prev) => !prev)}
                onKeyDown={handleComboboxKeyDown}
                className="w-full px-3 py-2 text-left text-xs bg-teal-50/60 border border-teal-200 rounded-xl hover:bg-teal-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 transition-colors cursor-pointer flex items-center justify-between text-teal-950 font-medium"
              >
                <div className="flex items-center gap-2 truncate">
                  <UserCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span className="truncate">
                    {selectedFixtureId
                      ? DEV_SYNTHETIC_FIXTURES.find((f) => f.id === selectedFixtureId)?.name +
                        ' — ' +
                        DEV_SYNTHETIC_FIXTURES.find((f) => f.id === selectedFixtureId)?.title
                      : 'Select a fictional test profile…'}
                  </span>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-teal-700 transition-transform ${
                    isComboboxOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isComboboxOpen && (
                <ul
                  role="listbox"
                  aria-labelledby="combobox-label"
                  className="absolute z-20 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto py-1 text-xs divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100 motion-reduce:animate-none"
                >
                  {DEV_SYNTHETIC_FIXTURES.map((fixture, idx) => {
                    const isSelected = selectedFixtureId === fixture.id;
                    const isHighlighted = highlightedFixtureIndex === idx;
                    return (
                      <li
                        key={fixture.id}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => selectFixture(fixture)}
                        onMouseEnter={() => setHighlightedFixtureIndex(idx)}
                        className={`px-3 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                          isHighlighted
                            ? 'bg-teal-50 text-teal-950'
                            : 'text-slate-700 hover:bg-slate-50'
                        } ${isSelected ? 'font-semibold text-teal-900 bg-teal-50/70' : ''}`}
                      >
                        <div className="truncate pr-2">
                          <p className="font-medium text-slate-900">{fixture.name}</p>
                          <p className="text-[11px] text-teal-700">{fixture.title}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">{fixture.email}</p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-teal-700 shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Privacy-Preserving Work Email Input */}
          <div>
            <label
              htmlFor="leader-email-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Authorized Work Email Address
            </label>
            <div className="relative">
              <input
                ref={emailInputRef}
                id="leader-email-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSelectedFixtureId(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="name@allianceindia.org"
                maxLength={128}
                disabled={isLoading}
                className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all font-medium text-slate-800 disabled:opacity-50"
                required
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
              Sign-in is restricted strictly to allowlisted Technical Leads, Managers, and Directors.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2 text-xs">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Sending verification code…
              </span>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Send Verification Code
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}

      {/* STEP 2: Verify Single 32-Hex Code */}
      {step === 'verify' && (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <div className="truncate pr-2">
              <span className="text-[11px] text-slate-500 block">Sent code to:</span>
              <span className="font-semibold text-slate-900 truncate block font-mono text-xs">
                {email}
              </span>
            </div>
            <button
              type="button"
              onClick={handleChangeAccount}
              className="text-teal-700 hover:text-teal-900 text-xs font-semibold shrink-0 cursor-pointer underline flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Change
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="leader-code-input"
                className="block text-xs font-semibold text-slate-700"
              >
                32-Character Verification Code
              </label>
              <span
                className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-full ${
                  code.length === 32
                    ? 'bg-emerald-100 text-emerald-800 font-bold'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {code.length} / 32
              </span>
            </div>

            <div className="relative">
              <input
                ref={codeInputRef}
                id="leader-code-input"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={code}
                onChange={handleCodeInputChange}
                placeholder="e.g. 4a8f9c... (32 hex characters)"
                maxLength={32}
                disabled={isLoading || isSyncingSession}
                className="w-full pl-9 pr-3.5 py-2.5 text-sm font-mono tracking-widest bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-slate-400 disabled:opacity-50 text-slate-900 text-center sm:text-left"
                required
              />
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
              Check your inbox for the single-use 128-bit verification code dispatched by Alliance India.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || isSyncingSession || code.length !== 32}
            className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm rounded-xl shadow-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading || isSyncingSession ? (
              <span className="inline-flex items-center gap-2 text-xs">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                {isSyncingSession ? 'Synchronizing session…' : 'Verifying code…'}
              </span>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Verify &amp; Open Evaluation
              </>
            )}
          </button>

          {/* Resend Action with cooldown */}
          <div className="pt-1 text-center">
            {cooldownSeconds > 0 ? (
              <p className="text-[11px] text-slate-500 font-medium">
                Resend code available in{' '}
                <span className="font-mono font-bold text-slate-700">{cooldownSeconds}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={() => handleRequestCode()}
                disabled={isLoading}
                className="text-xs text-teal-700 hover:text-teal-900 font-semibold cursor-pointer underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Resend verification code
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
