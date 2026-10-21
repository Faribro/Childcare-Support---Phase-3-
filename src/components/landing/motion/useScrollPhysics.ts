'use client';

import { useState, useEffect, useRef } from 'react';

export interface ScrollPhysicsState {
  scrollY: number;
  scrollProgress: number; // 0 to 1
  velocity: number; // smoothed pixels/sec, signed (+down, -up)
  normalizedVelocity: number; // clamped -1 to 1 for visual shader/deformation mapping
  isScrolling: boolean;
  isReducedMotion: boolean;
}

/**
 * High-performance, zero-dependency scroll physics hook.
 *
 * Provides:
 * 1. Continuous RAF-driven smoothed scroll position and progress.
 * 2. Damped velocity with spring settling (decays naturally to 0 when user stops scrolling).
 * 3. Directional sensing (+ down, - up).
 * 4. Automatic pause when tab is inactive / offscreen.
 * 5. Complete prefers-reduced-motion bypass (zero event overhead, static values).
 */
export function useScrollPhysics(): ScrollPhysicsState {
  const [state, setState] = useState<ScrollPhysicsState>({
    scrollY: 0,
    scrollProgress: 0,
    velocity: 0,
    normalizedVelocity: 0,
    isScrolling: false,
    isReducedMotion: false,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasMatchMedia = typeof window.matchMedia === 'function';
    const mediaQuery = hasMatchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (mediaQuery?.matches) {
      setState((prev) => ({ ...prev, isReducedMotion: true }));
      return;
    }

    let lastScrollY = window.scrollY;
    let lastTime = performance.now();
    let currentVelocity = 0;
    let targetVelocity = 0;
    let rafId: number | null = null;
    let scrollStopTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    // Spring damping constants (dignified, weighted, not jittery)
    const DAMPING = 0.88; // decay per frame
    const VELOCITY_CLAMP = 3000; // max px/sec for visual safety

    const handleScroll = () => {
      const now = performance.now();
      const dt = Math.max(now - lastTime, 8); // clamp minimum dt
      const currentY = window.scrollY;
      const dy = currentY - lastScrollY;

      // Instantaneous velocity (px/sec)
      const rawVelocity = (dy / dt) * 1000;
      targetVelocity = Math.max(-VELOCITY_CLAMP, Math.min(VELOCITY_CLAMP, rawVelocity));

      lastScrollY = currentY;
      lastTime = now;

      if (scrollStopTimeout) clearTimeout(scrollStopTimeout);
      scrollStopTimeout = setTimeout(() => {
        targetVelocity = 0;
      }, 90);
    };

    const updateLoop = () => {
      if (!isMounted) return;

      const currentY = window.scrollY;
      const docHeight = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1
      );
      const progress = Math.min(1, Math.max(0, currentY / docHeight));

      // Damped spring interpolation towards target velocity
      currentVelocity = currentVelocity * DAMPING + targetVelocity * (1 - DAMPING);

      // If nearly at rest, snap to 0 to save CPU
      if (Math.abs(currentVelocity) < 0.5 && targetVelocity === 0) {
        currentVelocity = 0;
      }

      const normVelocity = Math.max(-1, Math.min(1, currentVelocity / 1500));
      const isCurrentlyScrolling = Math.abs(currentVelocity) > 2;

      // Only update React state if there is meaningful motion or change
      const prev = stateRef.current;
      if (
        Math.abs(prev.scrollY - currentY) > 0.5 ||
        Math.abs(prev.velocity - currentVelocity) > 1 ||
        prev.isScrolling !== isCurrentlyScrolling
      ) {
        setState({
          scrollY: currentY,
          scrollProgress: progress,
          velocity: currentVelocity,
          normalizedVelocity: normVelocity,
          isScrolling: isCurrentlyScrolling,
          isReducedMotion: false,
        });
      }

      rafId = requestAnimationFrame(updateLoop);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    rafId = requestAnimationFrame(updateLoop);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setState((prev) => ({
          ...prev,
          velocity: 0,
          normalizedVelocity: 0,
          isScrolling: false,
          isReducedMotion: true,
        }));
        if (rafId) cancelAnimationFrame(rafId);
      }
    };

    mediaQuery?.addEventListener?.('change', handleMotionChange);

    return () => {
      isMounted = false;
      window.removeEventListener('scroll', handleScroll);
      mediaQuery?.removeEventListener?.('change', handleMotionChange);
      if (rafId) cancelAnimationFrame(rafId);
      if (scrollStopTimeout) clearTimeout(scrollStopTimeout);
    };
  }, []);

  return state;
}
