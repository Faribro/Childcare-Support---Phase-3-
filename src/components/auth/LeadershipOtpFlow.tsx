'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  Clock,
} from 'lucide-react';
import { setEvaluationUnlocked, EvaluationUser, useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { supervisorReadModel } from '@/lib/read-model/supervisorReadModel';
import { CosmicSpaceButton } from '@/components/ui/CosmicSpaceButton';

export interface LeadershipOtpFlowProps {
  isModal?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
  initialEmail?: string;
  initialProfiles?: ApprovedLeaderProfile[];
  gateUnlocked?: boolean;
}

export interface CandidateAuthUser {
  userId?: string;
  email: string;
  name?: string;
  role?: string;
}

export interface ApprovedLeaderProfile {
  id: string;
  name: string;
  title?: string;
  isSynthetic?: boolean;
  email?: string;
}

// Security invariant: never embed real staff/executive emails or privileged directory rows in client JS.
// Authenticated directory entries are supplied explicitly via server-authorized API or test fixtures only.
export const APPROVED_LEADERSHIP_PROFILES: ApprovedLeaderProfile[] = [];

// Synthetic fixtures for local development & testing ONLY.
// Gate: rendered ONLY when process.env.NODE_ENV !== 'production' AND NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES === 'true'.
// Using clearly fictional profiles and RFC 2606 reserved example domains.
const DEV_SYNTHETIC_FIXTURES: ApprovedLeaderProfile[] = [
  {
    id: 'fictional-alex-rivera',
    name: 'Alex Rivera (Fictional Demo)',
    title: 'Surveillance Lead (Synthetic)',
    email: 'alex.rivera@example.com',
    isSynthetic: true,
  },
  {
    id: 'fictional-sam-chen',
    name: 'Sam Chen (Fictional Demo)',
    title: 'Monitoring Coordinator (Synthetic)',
    email: 'sam.chen@example.org',
    isSynthetic: true,
  },
  {
    id: 'fictional-jordan-taylor',
    name: 'Jordan Taylor (Fictional Demo)',
    title: 'Programme Director (Synthetic)',
    email: 'jordan.taylor@example.net',
    isSynthetic: true,
  },
];

const MOCK_SYNTHETIC_CODE = '123456';
const VALID_AUTH_MODES = ['hybrid', 'email_only', 'password_only'] as const;

export function LeadershipOtpFlow({
  isModal = true,
  onSuccess,
  onCancel,
  initialEmail = '',
  initialProfiles,
  gateUnlocked = false,
}: LeadershipOtpFlowProps) {
  const { login } = useEvaluationAccess();

  // Runtime feature flag & server cutover state
  const [isFeatureEnabled, setIsFeatureEnabled] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<string>('hybrid');
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Session reuse state: Check if caller already has a server-verified session
  const [existingSession, setExistingSession] = useState<EvaluationUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Synchronous submission lock to prevent double-clicks
  const isSubmittingRef = useRef(false);

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
  const [gateProfiles, setGateProfiles] = useState<ApprovedLeaderProfile[]>([]);

  // Load allowlisted administrator directory ({ id, name, email }) when Staff Access gate unlocked
  useEffect(() => {
    if (!gateUnlocked || initialProfiles) return;
    let cancelled = false;
    fetch('/api/auth/leader/gate', {
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((json) => {
        if (cancelled) return;
        const list =
          json?.status === 'success' && Array.isArray(json?.data?.leaders)
            ? (json.data.leaders as ApprovedLeaderProfile[])
            : [];
        if (list.length > 0) {
          setGateProfiles(list);
        }
      })
      .catch(() => {
        // Fail closed cleanly: manual email entry remains available
      });
    return () => {
      cancelled = true;
    };
  }, [gateUnlocked, initialProfiles]);

  // Synthetic fixtures state (strictly dev/test gated)
  const isDevOrTest = process.env.NODE_ENV !== 'production';
  const hasFixtureFlag = process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES === 'true';
  const showSyntheticFixtures = isDevOrTest && hasFixtureFlag;

  const baseProfiles =
    initialProfiles ?? (gateProfiles.length > 0 ? gateProfiles : APPROVED_LEADERSHIP_PROFILES);
  const availableProfiles: ApprovedLeaderProfile[] = showSyntheticFixtures
    ? [...baseProfiles, ...DEV_SYNTHETIC_FIXTURES]
    : baseProfiles;

  const [isMounted, setIsMounted] = useState(false);
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{
    placement: 'bottom' | 'top';
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selectedLeader = availableProfiles.find((p) => p.id === selectedLeaderId) || null;

  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const comboboxTriggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const sharedPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  // Check for existing server-verified session to reuse without asking for an OTP
  const checkExistingSession = useCallback(async () => {
    if (process.env.NODE_ENV === 'test' && !(globalThis as any).__TEST_ENABLE_SESSION_FETCH__) {
      setIsCheckingSession(false);
      return;
    }
    setIsCheckingSession(true);
    try {
      const res = await fetch('/api/auth/session', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.status === 'success' && json?.data?.isVerified === true) {
          const role = json.data.role;
          const validRoles = ['LEADERSHIP', 'supervisor', 'ADMIN'];
          if (validRoles.includes(role)) {
            const user: EvaluationUser = {
              userId: json.data.userId,
              name: json.data.name || 'Administration Member',
              role,
              allowedStates: json.data.allowedStates || ['*'],
              allowedDistricts: json.data.allowedDistricts || ['*'],
              isVerified: true,
            };
            setExistingSession(user);
            setEvaluationUnlocked(true, user);
          }
        }
      }
    } catch {
      // Non-fatal, proceed with login form
    } finally {
      setIsCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    checkExistingSession();
  }, [checkExistingSession]);

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

  // 4. Viewport/visualViewport-aware placement & click outside to close portaled combobox
  const updateMenuPosition = useCallback(() => {
    const trigger = comboboxTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vv = window.visualViewport;
    const vvTop = vv?.offsetTop ?? 0;
    const vvHeight = vv?.height ?? window.innerHeight;
    const vvBottom = vvTop + vvHeight;
    const vvLeft = vv?.offsetLeft ?? 0;
    const vvWidth = vv?.width ?? window.innerWidth;

    const spaceBelow = vvBottom - rect.bottom - 10;
    const spaceAbove = rect.top - vvTop - 10;
    const shouldOpenUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
    const rawAvailable = shouldOpenUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(280, Math.floor(rawAvailable)));

    const width = Math.max(220, Math.min(rect.width || 320, vvWidth - 16));
    const left = Math.max(vvLeft + 8, Math.min(rect.left, vvLeft + vvWidth - width - 8));

    if (shouldOpenUpward) {
      setMenuCoords({
        placement: 'top',
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        left,
        width,
        maxHeight,
      });
    } else {
      const rawTop = rect.bottom + 6;
      const safeTop =
        rawTop + maxHeight > vvBottom - 8
          ? Math.max(vvTop + 8, vvBottom - maxHeight - 8)
          : rawTop;
      setMenuCoords({
        placement: 'bottom',
        top: safeTop,
        left,
        width,
        maxHeight,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!isComboboxOpen) return;
    updateMenuPosition();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (comboboxRef.current && comboboxRef.current.contains(target)) ||
        (listboxRef.current && listboxRef.current.contains(target))
      ) {
        return;
      }
      setIsComboboxOpen(false);
    };

    const handleEscapeCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        setIsComboboxOpen(false);
        comboboxTriggerRef.current?.focus();
      }
    };

    const vv = window.visualViewport;
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    vv?.addEventListener('resize', updateMenuPosition);
    vv?.addEventListener('scroll', updateMenuPosition);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscapeCapture, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      vv?.removeEventListener('resize', updateMenuPosition);
      vv?.removeEventListener('scroll', updateMenuPosition);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscapeCapture, true);
    };
  }, [isComboboxOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isComboboxOpen) return;
    optionRefs.current[highlightedIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [isComboboxOpen, highlightedIndex]);

  const toggleCombobox = () => {
    if (!isComboboxOpen) {
      updateMenuPosition();
      setIsComboboxOpen(true);
    } else {
      setIsComboboxOpen(false);
    }
  };

  // 5. Handle combobox keyboard navigation
  const handleComboboxKeyDown = (e: React.KeyboardEvent) => {
    if (availableProfiles.length === 0) return;
    if (!isComboboxOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        updateMenuPosition();
        setIsComboboxOpen(true);
        if (e.key === 'ArrowUp') {
          setHighlightedIndex(availableProfiles.length - 1);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < availableProfiles.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : availableProfiles.length - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlightedIndex(availableProfiles.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const profile = availableProfiles[highlightedIndex];
      if (profile) {
        selectProfile(profile);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsComboboxOpen(false);
      comboboxTriggerRef.current?.focus();
    }
  };

  const selectProfile = (profile: ApprovedLeaderProfile) => {
    setSelectedLeaderId(profile.id);
    if (profile.email) {
      setEmail(profile.email);
    }
    setIsComboboxOpen(false);
    setErrorMessage(null);
    (emailInputRef.current || comboboxTriggerRef.current)?.focus();
  };

  // 6. Handle code request (Step 1)
  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isSubmittingRef.current) return;

    const cleanEmail = email.trim().toLowerCase();
    const hasEmail = Boolean(cleanEmail && cleanEmail.includes('@'));
    const hasLeader = Boolean(selectedLeader);

    if (!hasEmail && !hasLeader) {
      setErrorMessage('Please select an administration account or enter a valid work email address.');
      emailInputRef.current?.focus();
      return;
    }

    if (cleanEmail && !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid work email address.');
      emailInputRef.current?.focus();
      return;
    }

    isSubmittingRef.current = true;
    const trackingIdentifier = cleanEmail || selectedLeader?.id || '';
    activeRequestEmailRef.current = trackingIdentifier;

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    setSuccessMessage(null);

    // Synthetic Fixture Isolation: Synthetic accounts never reach live OTP endpoints
    if (selectedLeader?.isSynthetic) {
      setTimeout(() => {
        if (activeRequestEmailRef.current !== trackingIdentifier) {
          isSubmittingRef.current = false;
          return;
        }
        setInfoMessage(
          'Synthetic fixture mode: Demonstration code dispatched to mock memory store. Live evaluation surveillance endpoints remain locked.'
        );
        setStep('verify');
        setCooldownSeconds(60);
        setCode(MOCK_SYNTHETIC_CODE); // Pre-fill mock code for local demonstration
        setSyncFailedCandidate(null);
        setIsLoading(false);
        isSubmittingRef.current = false;
      }, 300);
      return;
    }

    try {
      const payload: { email?: string; leaderId?: string } = {};
      if (hasEmail) payload.email = cleanEmail;
      if (hasLeader) payload.leaderId = selectedLeader?.id;

      const res = await fetch('/api/auth/leader/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      // Guard against stale response if user switched accounts while request was in-flight
      if (activeRequestEmailRef.current !== trackingIdentifier) {
        return;
      }

      if (!res.ok) {
        // Authoritative server rate-limit handling (HTTP 429)
        if (res.status === 429) {
          const retrySec =
            typeof data?.retryAfterSeconds === 'number'
              ? data.retryAfterSeconds
              : parseInt(res.headers.get('Retry-After') || '60', 10);
          setCooldownSeconds(retrySec);
        }
        setErrorMessage(data?.message || 'Failed to dispatch verification code. Please try again.');
        setIsLoading(false);
        return;
      }

      setInfoMessage(
        data?.message ||
          'If this account is an authorized Administration identity, a single-use verification code has been dispatched.'
      );
      setStep('verify');
      setCooldownSeconds(60);
      setCode('');
      setSyncFailedCandidate(null);
    } catch {
      if (activeRequestEmailRef.current === trackingIdentifier) {
        setErrorMessage('Network error while requesting verification code. Please check your connection.');
      }
    } finally {
      if (activeRequestEmailRef.current === trackingIdentifier) {
        setIsLoading(false);
      }
      isSubmittingRef.current = false;
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
          throw new Error(`Insufficient role permissions for Administration access: '${sessionRole}'`);
        }

        // Validate server-authorized scope
        const sessionStates = sessionJson.data.allowedStates;
        if (!Array.isArray(sessionStates) || sessionStates.length === 0) {
          throw new Error('Session has no authorized geographic states assigned');
        }

        // Use session-returned identity, role, and scope for unlocked state
        const confirmedUser: EvaluationUser = {
          userId: sessionUserId,
          name: sessionJson.data.name || candidate.name || 'Administration Member',
          role: sessionRole,
          allowedStates: sessionStates,
          allowedDistricts: sessionJson.data.allowedDistricts || ['*'],
          isVerified: true,
        };

        // Purge any stale read-model caches and update client-side auth state
        supervisorReadModel.purgeSession();
        setEvaluationUnlocked(true, confirmedUser);
        setSuccessMessage(`Welcome back, ${confirmedUser.name}! Opening Administration workspace…`);
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

    // Clean and normalize 6-digit numeric code
    const cleanCode = code.trim().replace(/[^0-9]/g, '');

    if (!cleanCode) {
      setErrorMessage('Please enter the 6-digit verification code from your email.');
      codeInputRef.current?.focus();
      return;
    }

    if (cleanCode.length !== 6) {
      setErrorMessage(
        `Verification code must be exactly 6 digits (currently ${cleanCode.length} / 6).`
      );
      codeInputRef.current?.focus();
      return;
    }

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const currentVerifyEmail = email.trim().toLowerCase();
    const trackingIdentifier = currentVerifyEmail || selectedLeader?.id || '';
    activeRequestEmailRef.current = trackingIdentifier;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Synthetic Fixture Isolation: Synthetic accounts never reach live verify endpoint
    if (selectedLeader?.isSynthetic) {
      setTimeout(async () => {
        if (activeRequestEmailRef.current !== trackingIdentifier) {
          isSubmittingRef.current = false;
          return;
        }
        if (cleanCode !== MOCK_SYNTHETIC_CODE) {
          setErrorMessage('Invalid mock verification code.');
          setIsLoading(false);
          isSubmittingRef.current = false;
          return;
        }

        setSuccessMessage(
          `Synthetic demonstration verified for ${selectedLeader.name}. Live evaluation surveillance endpoints remain locked.`
        );
        setIsLoading(false);
        isSubmittingRef.current = false;
        setTimeout(() => {
          onSuccess?.();
        }, 600);
      }, 300);
      return;
    }

    try {
      const verifyPayload: { code: string; email?: string; leaderId?: string } = {
        code: cleanCode,
      };
      if (currentVerifyEmail) {
        verifyPayload.email = currentVerifyEmail;
      }
      if (selectedLeader?.id) {
        verifyPayload.leaderId = selectedLeader.id;
      }

      // Phase 1: verify-code mutation
      const res = await fetch('/api/auth/leader/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verifyPayload),
      });

      const body = await res.json().catch(() => ({}));

      if (activeRequestEmailRef.current !== trackingIdentifier) {
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
        name: returnedUser.name || selectedLeader?.name,
        role: returnedUser.role,
      };

      // Phase 2: Synchronize and confirm session via /api/auth/session
      await synchronizeSession(candidate);
    } catch {
      if (activeRequestEmailRef.current === trackingIdentifier) {
        setErrorMessage('Network error while verifying code. Please check your connection.');
      }
    } finally {
      if (activeRequestEmailRef.current === trackingIdentifier) {
        setIsLoading(false);
      }
      isSubmittingRef.current = false;
    }
  };

  // 9. Fallback shared password login (when email auth is explicitly disabled on server)
  const handleSharedPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharedPassword) {
      setErrorMessage('Please enter the administration evaluation password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await login('LEADERSHIP-ALL', sharedPassword);
      if (result.success) {
        setSuccessMessage('Authentication successful! Administration workspace unlocked.');
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

  // Clean code input on change: keep digits only, max 6 (Never persisted to disk)
  const handleCodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = raw.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(sanitized);
    if (errorMessage && sanitized.length === 6) {
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
    setCooldownSeconds(0);
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

  // Feature Explicitly Disabled by server
  if (isFeatureEnabled === false) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
        <div className="flex items-center gap-2 font-bold text-amber-950">
          <AlertTriangle className="w-4 h-4 text-amber-700" />
          <span>Administration Sign-In Unavailable</span>
        </div>
        <p className="text-[11px] leading-relaxed text-amber-800">
          Administration email authentication is currently disabled on this environment.
        </p>
      </div>
    );
  }

  // Active Server-Verified Session: Reuse existing valid session without requesting an OTP
  if (existingSession) {
    return (
      <div className="p-5 bg-teal-50/80 border border-teal-200 rounded-2xl space-y-4 animate-in fade-in motion-reduce:animate-none">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-teal-100 rounded-xl text-teal-800 shrink-0">
            <CheckCircle className="w-5 h-5 text-teal-700" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-teal-950">Active Session Verified</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-bold">
                Server Reused
              </span>
            </div>
            <p className="text-xs text-teal-900">
              Welcome back, <span className="font-semibold">{existingSession.name}</span>. Your administration session is currently active and verified.
            </p>
            <p className="text-[11px] text-teal-700 font-mono">
              Role: {existingSession.role} • Scope: {existingSession.allowedStates.includes('*') ? 'National (All States)' : existingSession.allowedStates.join(', ')}
            </p>
          </div>
        </div>

        <div className="pt-2 space-y-2">
          <CosmicSpaceButton
            variant="nebula"
            onClick={() => onSuccess?.()}
            rightIcon={<ArrowRight className="w-4 h-4 text-white" />}
          >
            Continue to Surveillance Dashboard
          </CosmicSpaceButton>
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
              setExistingSession(null);
              setEvaluationUnlocked(false, null);
              supervisorReadModel.purgeSession();
            }}
            className="w-full py-2 px-3 text-xs text-slate-600 hover:text-slate-900 font-medium transition-colors cursor-pointer text-center"
          >
            Sign out or use a different account
          </button>
        </div>
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
                ? 'bg-[#155AD1] text-white ring-2 ring-sky-200'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {step === 'verify' ? <Check className="w-3 h-3" /> : '1'}
          </div>
          <span
            className={`font-semibold ${
              step === 'input' ? 'text-[#07225E] font-bold' : 'text-slate-500'
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
                ? 'bg-[#155AD1] text-white ring-2 ring-sky-200'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            2
          </div>
          <span
            className={`font-semibold ${
              step === 'verify' ? 'text-[#07225E] font-bold' : 'text-slate-400'
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

      {/* Administration Account Combobox (Rendered ONLY when explicit/authenticated directory profiles are available) */}
      {step === 'input' && (
        <form onSubmit={handleRequestCode} className="space-y-4">
          {availableProfiles.length > 0 && (
            <div className="relative" ref={comboboxRef}>
              <div className="flex items-center justify-between mb-1">
                <label
                  id="leadership-combobox-label"
                  className="block text-xs font-semibold text-teal-900"
                >
                  Administration Account Directory
                </label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-mono font-medium">
                  Verified Directory
                </span>
              </div>

              <button
                ref={comboboxTriggerRef}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isComboboxOpen}
                aria-controls="leadership-combobox-listbox"
                aria-labelledby="leadership-combobox-label"
                aria-activedescendant={
                  isComboboxOpen && availableProfiles[highlightedIndex]
                    ? `admin-profile-opt-${availableProfiles[highlightedIndex].id}`
                    : undefined
                }
                onClick={toggleCombobox}
                onKeyDown={handleComboboxKeyDown}
                className="w-full px-3 py-2 text-left text-xs bg-teal-50/60 border border-teal-200 rounded-xl hover:bg-teal-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 transition-colors cursor-pointer flex items-center justify-between text-teal-950 font-medium"
              >
                <div className="flex items-center gap-2 truncate">
                  <UserCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span className="truncate">
                    {selectedLeader
                      ? selectedLeader.name
                      : 'Select approved administration account…'}
                  </span>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-teal-700 transition-transform ${
                    isComboboxOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isMounted &&
                isComboboxOpen &&
                createPortal(
                  <ul
                    ref={listboxRef}
                    id="leadership-combobox-listbox"
                    role="listbox"
                    aria-labelledby="leadership-combobox-label"
                    onKeyDown={handleComboboxKeyDown}
                    style={{
                      position: 'fixed',
                      zIndex: 70,
                      left: `${menuCoords?.left ?? 16}px`,
                      width: `${menuCoords?.width ?? 280}px`,
                      maxHeight: `${menuCoords?.maxHeight ?? 240}px`,
                      ...(menuCoords?.placement === 'top'
                        ? { bottom: `${menuCoords.bottom ?? 16}px` }
                        : { top: `${menuCoords?.top ?? 100}px` }),
                    }}
                    className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-y-auto overscroll-contain py-1 text-xs divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100 motion-reduce:animate-none"
                  >
                    {availableProfiles.map((profile, idx) => {
                      const isSelected = selectedLeader?.id === profile.id;
                      const isHighlighted = highlightedIndex === idx;
                      return (
                        <li
                          key={profile.id}
                          id={`admin-profile-opt-${profile.id}`}
                          ref={(el) => {
                            optionRefs.current[idx] = el;
                          }}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => selectProfile(profile)}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          className={`px-3 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                            isHighlighted
                              ? 'bg-teal-50 text-teal-950'
                              : 'text-slate-700 hover:bg-slate-50'
                          } ${isSelected ? 'font-semibold text-teal-900 bg-teal-50/70' : ''}`}
                        >
                          <div className="truncate pr-2">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-slate-900">{profile.name}</p>
                              {profile.isSynthetic && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-mono">
                                  Demo
                                </span>
                              )}
                            </div>
                            {profile.email && (
                              <p className="text-[11px] text-teal-700 font-mono truncate">{profile.email}</p>
                            )}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-teal-700 shrink-0" />}
                        </li>
                      );
                    })}
                  </ul>,
                  document.body
                )}
            </div>
          )}

          {selectedLeader ? (
            <div className="p-2.5 bg-teal-50/60 border border-teal-100 rounded-xl text-center">
              <p className="text-xs text-slate-600">
                Verification code will be dispatched to allowlisted address:
              </p>
              <p className="font-mono text-xs font-bold text-teal-900 mt-0.5">
                {selectedLeader.email || email}
              </p>
            </div>
          ) : (
            <div>
              <label
                htmlFor="leader-email-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Administration Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  ref={emailInputRef}
                  id="leader-email-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Enter authorized work email"
                  className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 transition-all"
                  required={availableProfiles.length === 0}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Authorized Administration accounts receive a single-use 6-digit email OTP.
              </p>
            </div>
          )}

          <CosmicSpaceButton
            type="submit"
            variant="nebula"
            disabled={isLoading || cooldownSeconds > 0 || (!selectedLeader && !email.includes('@'))}
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4 text-white" />}
          >
            {cooldownSeconds > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                <Clock className="w-4 h-4" />
                Resend in {cooldownSeconds}s
              </span>
            ) : (
              'Sign in with email OTP'
            )}
          </CosmicSpaceButton>
        </form>
      )}

      {/* STEP 2: Verify Single 32-Hex Code */}
      {step === 'verify' && (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <div className="truncate pr-2">
              <span className="text-[11px] text-slate-500 block">Sent code to:</span>
              <span className="font-semibold text-slate-900 truncate block font-mono text-xs">
                {email || (selectedLeader ? `registered email for ${selectedLeader.name}` : 'registered work email')}
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
                6-Digit Verification Code
              </label>
              <span
                className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-full ${
                  code.length === 6
                    ? 'bg-emerald-100 text-emerald-800 font-bold'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {code.length} / 6
              </span>
            </div>

            <div className="relative">
              <input
                ref={codeInputRef}
                id="leader-code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                value={code}
                onChange={handleCodeInputChange}
                placeholder="e.g. 123456 (6 digits)"
                maxLength={6}
                disabled={isLoading || isSyncingSession}
                className="w-full pl-9 pr-3.5 py-2.5 text-sm font-mono tracking-widest bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-slate-400 disabled:opacity-50 text-slate-900 text-center sm:text-left"
                required
              />
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
              Check your inbox for the single-use 6-digit verification code dispatched by Alliance India.
            </p>
          </div>

          <CosmicSpaceButton
            type="submit"
            variant="nebula"
            disabled={isLoading || isSyncingSession || code.length !== 6}
            isLoading={isLoading || isSyncingSession}
            leftIcon={<CheckCircle className="w-4 h-4 text-white" />}
          >
            Verify &amp; Sign In
          </CosmicSpaceButton>

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
