'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'child_nutrition_evaluation_unlocked';
const EVENT_NAME = 'child_nutrition:evaluation_unlock_changed';

/**
 * Check if the evaluation tab is unlocked (client-side only).
 */
export function isEvaluationUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Update evaluation unlocked status, saving to localStorage and notifying listeners.
 */
export function setEvaluationUnlocked(unlocked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(unlocked));
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { unlocked } })
    );
  } catch (err) {
    console.error('Failed to set evaluation unlock status:', err);
  }
}

/**
 * React hook for reactive evaluation access.
 */
export function useEvaluationAccess() {
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    setUnlocked(isEvaluationUnlocked());
    setIsLoaded(true);

    const handleUnlockChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ unlocked?: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.unlocked === 'boolean') {
        setUnlocked(customEvent.detail.unlocked);
      } else {
        setUnlocked(isEvaluationUnlocked());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setUnlocked(e.newValue === 'true');
      }
    };

    window.addEventListener(EVENT_NAME, handleUnlockChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(EVENT_NAME, handleUnlockChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const unlock = useCallback(() => setEvaluationUnlocked(true), []);
  const lock = useCallback(() => setEvaluationUnlocked(false), []);
  const toggle = useCallback(() => setEvaluationUnlocked(!isEvaluationUnlocked()), []);

  return { isUnlocked: unlocked, isLoaded, unlock, lock, toggle };
}
