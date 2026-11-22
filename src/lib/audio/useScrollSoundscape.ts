'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { cosmicSound } from './cosmicSoundEngine';

export interface UseScrollSoundscapeOptions {
  /** Whether dashboard animations are currently active (from the pause/play toggle) */
  animationsEnabled?: boolean;
}

export function useScrollSoundscape({ animationsEnabled = true }: UseScrollSoundscapeOptions = {}) {
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  const blendRef = useRef(0);
  const hasInteractedRef = useRef(false);

  // Sync initial sound enabled state from engine
  useEffect(() => {
    setIsSoundEnabled(cosmicSound.isEnabled());
  }, []);

  const toggleSound = useCallback(() => {
    const next = !cosmicSound.isEnabled();
    cosmicSound.setEnabled(next);
    setIsSoundEnabled(next);

    if (next && animationsEnabled) {
      cosmicSound.unlock();
      cosmicSound.startAmbience(blendRef.current);
    } else {
      cosmicSound.stopAmbience();
    }
  }, [animationsEnabled]);

  // Compute scroll blend (0 = top cosmic starry sky, 1 = bottom playground meadow)
  const updateScrollBlend = useCallback(() => {
    if (typeof window === 'undefined') return;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const blend = Math.max(0, Math.min(1, scrollY / maxScroll));
    blendRef.current = blend;
    cosmicSound.setScrollBlend(blend);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1) Passive scroll listener
    window.addEventListener('scroll', updateScrollBlend, { passive: true });
    updateScrollBlend();

    // 2) Autoplay unlock on first user pointer/key interaction
    const handleFirstGesture = () => {
      hasInteractedRef.current = true;
      cosmicSound.unlock();
      if (cosmicSound.isEnabled() && animationsEnabled) {
        cosmicSound.startAmbience(blendRef.current);
      }
    };

    window.addEventListener('pointerdown', handleFirstGesture, { once: true, passive: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true, passive: true });

    // 3) Visibility change: silence on tab blur/lock, resume on focus
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cosmicSound.stopAmbience();
      } else if (hasInteractedRef.current && cosmicSound.isEnabled() && animationsEnabled) {
        cosmicSound.startAmbience(blendRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4) Pause state changes from dashboard || toggle
    if (!animationsEnabled) {
      cosmicSound.stopAmbience();
    } else if (hasInteractedRef.current && cosmicSound.isEnabled()) {
      cosmicSound.startAmbience(blendRef.current);
    }

    // 5) Cleanup on unmount (e.g. route transitions to /assessment/new or /supervisor)
    return () => {
      window.removeEventListener('scroll', updateScrollBlend);
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cosmicSound.stopAmbience();
    };
  }, [animationsEnabled, updateScrollBlend]);

  return {
    isSoundEnabled,
    toggleSound,
  };
}
