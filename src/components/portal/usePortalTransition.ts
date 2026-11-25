'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  abortSpeculativePortalPrefetches,
  PORTAL_DEFINITIONS,
  PORTAL_TRANSITION_DURATION_MS,
  resolveFieldPrincipalKey,
  startPortalWarmup,
  type FieldPrincipalInput,
  type PortalId,
  type RouterPrefetchLike,
} from '@/lib/portal/portalWarmCache';
import { cosmicSound } from '@/lib/audio/cosmicSoundEngine';
import { triggerHaptic } from '@/hooks/useMobileTouch';

export interface UsePortalTransitionOptions {
  router: RouterPrefetchLike;
  isAuthenticated: boolean;
  userRole?: string | null;
  principal?: FieldPrincipalInput;
  animationsEnabled?: boolean;
  onRequireAuth?: (e?: any) => void;
}

export interface PortalEventHandlers {
  onMouseEnter: () => void;
  onFocus: () => void;
  onTouchStart: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLAnchorElement>) => void;
}

export interface UsePortalTransitionReturn {
  isPortalFeatureEnabled: boolean;
  activePortal: PortalId | null;
  slowPortal: PortalId | null;
  statusMessage: string;
  shouldAnimate: boolean;
  getPortalProps: (portal: PortalId) => PortalEventHandlers;
  resetPortalState: () => void;
}

function isModifiedClick(e: React.MouseEvent | React.KeyboardEvent): boolean {
  return Boolean(
    ('metaKey' in e && e.metaKey) ||
      ('ctrlKey' in e && e.ctrlKey) ||
      ('shiftKey' in e && e.shiftKey) ||
      ('altKey' in e && e.altKey) ||
      ('button' in e && typeof e.button === 'number' && e.button !== 0)
  );
}

function detectPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function usePortalTransition(
  options: UsePortalTransitionOptions
): UsePortalTransitionReturn {
  const {
    router,
    isAuthenticated,
    userRole,
    principal,
    animationsEnabled = true,
    onRequireAuth,
  } = options;

  // Strictly bound field-worker portal micro-interactions to non-supervisor/field context
  const isPortalFeatureEnabled = !userRole || userRole === 'FIELD_USER';

  const [activePortal, setActivePortal] = useState<PortalId | null>(null);
  const [slowPortal, setSlowPortal] = useState<PortalId | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(detectPrefersReducedMotion);

  const activationLockRef = useRef<PortalId | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  }, []);

  const resetPortalState = useCallback(() => {
    clearTimers();
    activationLockRef.current = null;
    if (isMountedRef.current) {
      setActivePortal(null);
      setSlowPortal(null);
      setStatusMessage('');
    }
  }, [clearTimers]);

  // Listen to OS/browser prefers-reduced-motion dynamically
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mq.matches);
    handleChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    if (typeof (mq as any).addListener === 'function') {
      (mq as any).addListener(handleChange);
      return () => (mq as any).removeListener(handleChange);
    }
  }, []);

  // Reset transition lock/animation cleanly on Back/Forward cache restore or history popstate
  useEffect(() => {
    isMountedRef.current = true;
    const handleHistoryOrPageShow = () => {
      resetPortalState();
    };
    window.addEventListener('pageshow', handleHistoryOrPageShow);
    window.addEventListener('popstate', handleHistoryOrPageShow);

    return () => {
      isMountedRef.current = false;
      clearTimers();
      activationLockRef.current = null;
      abortSpeculativePortalPrefetches();
      window.removeEventListener('pageshow', handleHistoryOrPageShow);
      window.removeEventListener('popstate', handleHistoryOrPageShow);
    };
  }, [clearTimers, resetPortalState]);

  const shouldAnimate = animationsEnabled && !prefersReducedMotion;

  const warmupIntent = useCallback(
    (portal: PortalId) => {
      if (!isPortalFeatureEnabled || !isAuthenticated) return;
      if (!resolveFieldPrincipalKey(principal)) return;
      startPortalWarmup({
        portal,
        ownership: 'speculative',
        router,
        principal,
      });
    },
    [isPortalFeatureEnabled, isAuthenticated, principal, router]
  );

  const navigateToDestination = useCallback(
    (portal: PortalId) => {
      const def = PORTAL_DEFINITIONS[portal];
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

      if (isMountedRef.current) {
        setSlowPortal(portal);
        setStatusMessage(def.slowLoadingText);
      }

      try {
        if (isOffline && typeof window !== 'undefined') {
          window.location.assign(def.href);
        } else if (typeof (router as any)?.push === 'function') {
          (router as any).push(def.href);
        } else if (typeof window !== 'undefined') {
          window.location.assign(def.href);
        }
      } catch {
        resetPortalState();
        return;
      }

      // Safety recovery if navigation stalls on same view (e.g., cancelled or blocked route)
      recoveryTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          activationLockRef.current = null;
          setActivePortal(null);
        }
      }, 4000);
    },
    [resetPortalState, router]
  );

  const activatePortal = useCallback(
    (portal: PortalId, e: React.MouseEvent | React.KeyboardEvent) => {
      if (!isPortalFeatureEnabled) return;

      // Preserve native modifier clicks (Cmd/Ctrl/Shift/Alt/middle-click -> new tab)
      if (isModifiedClick(e)) {
        return;
      }

      e.preventDefault();

      if (!isAuthenticated) {
        resetPortalState();
        onRequireAuth?.(e);
        return;
      }

      // Immediate lock against double-taps and simultaneous portal switching
      if (activationLockRef.current !== null) {
        return;
      }
      activationLockRef.current = portal;

      const def = PORTAL_DEFINITIONS[portal];

      // 1. Promote/start route + module + data warmups concurrently with UI feedback
      startPortalWarmup({
        portal,
        ownership: 'destination',
        router,
        principal,
      });

      // 2. Gesture-only haptics & optional synthesized sound cue
      try {
        triggerHaptic('selection');
      } catch {
        // Ignore haptic unavailability
      }
      try {
        if (cosmicSound.isEnabled()) {
          cosmicSound.unlock();
          cosmicSound.playPortalCue(portal);
        }
      } catch {
        // Ignore AudioContext blocks
      }

      setStatusMessage(def.slowLoadingText);

      // 3. Respect reduced-motion / animations-paused toggle immediately, and bypass timed transition when offline
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!shouldAnimate || isOffline) {
        navigateToDestination(portal);
        return;
      }

      setActivePortal(portal);

      navTimerRef.current = setTimeout(() => {
        navTimerRef.current = null;
        navigateToDestination(portal);
      }, PORTAL_TRANSITION_DURATION_MS);
    },
    [
      isPortalFeatureEnabled,
      isAuthenticated,
      resetPortalState,
      onRequireAuth,
      router,
      principal,
      shouldAnimate,
      navigateToDestination,
    ]
  );

  const getPortalProps = useCallback(
    (portal: PortalId): PortalEventHandlers => ({
      onMouseEnter: () => warmupIntent(portal),
      onFocus: () => warmupIntent(portal),
      onTouchStart: () => warmupIntent(portal),
      onMouseLeave: () => {
        if (!activationLockRef.current) {
          abortSpeculativePortalPrefetches();
        }
      },
      onClick: (e) => activatePortal(portal, e),
      onKeyDown: (e) => {
        if (e.key === ' ') {
          activatePortal(portal, e);
        }
      },
    }),
    [warmupIntent, activatePortal]
  );

  return {
    isPortalFeatureEnabled,
    activePortal,
    slowPortal,
    statusMessage,
    shouldAnimate,
    getPortalProps,
    resetPortalState,
  };
}
