'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'child_nutrition_evaluation_unlocked';
const EVENT_NAME = 'child_nutrition:evaluation_unlock_changed';
const SESSION_CACHE_KEY = 'child_nutrition:user_session_v1';

export interface EvaluationUser {
  userId: string;
  name: string;
  role: string;
  allowedStates: string[];
  allowedDistricts: string[];
  isVerified?: boolean;
}

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
export function setEvaluationUnlocked(unlocked: boolean, user?: EvaluationUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(unlocked));
    if (user) {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
    } else if (!unlocked) {
      localStorage.removeItem(SESSION_CACHE_KEY);
    }
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { unlocked, user } })
    );
  } catch (err) {
    console.error('Failed to set evaluation unlock status:', err);
  }
}

/**
 * React hook for reactive evaluation access and attributable session identity.
 */
export function useEvaluationAccess() {
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [user, setUser] = useState<EvaluationUser | null>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Sync session on mount
  useEffect(() => {
    let active = true;

    // Check cached session
    try {
      const isUn = isEvaluationUnlocked();
      setUnlocked(isUn);
      const cached = localStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        setUser(JSON.parse(cached));
      }
    } catch (_) {}

    // Verify session with server endpoint (only outside unit tests to avoid hijacking fetch mocks)
    async function checkServerSession() {
      if (process.env.NODE_ENV === 'test') {
        if (active) setIsLoaded(true);
        return;
      }
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.isVerified && active) {
            setUser(json.data);
            setUnlocked(true);
            setEvaluationUnlocked(true, json.data);
          }
        }
      } catch (_) {
        // Non-fatal, offline fallback
      } finally {
        if (active) setIsLoaded(true);
      }
    }

    checkServerSession();

    const handleUnlockChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ unlocked?: boolean; user?: EvaluationUser }>;
      if (customEvent.detail) {
        if (typeof customEvent.detail.unlocked === 'boolean') {
          setUnlocked(customEvent.detail.unlocked);
        }
        if (customEvent.detail.user !== undefined) {
          setUser(customEvent.detail.user);
        }
      } else {
        setUnlocked(isEvaluationUnlocked());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setUnlocked(e.newValue === 'true');
      }
      if (e.key === SESSION_CACHE_KEY) {
        try {
          setUser(e.newValue ? JSON.parse(e.newValue) : null);
        } catch (_) {}
      }
    };

    window.addEventListener(EVENT_NAME, handleUnlockChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      active = false;
      window.removeEventListener(EVENT_NAME, handleUnlockChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json();
      if (res.ok && json.status === 'success' && json.data?.user) {
        const authedUser: EvaluationUser = {
          userId: json.data.user.userId,
          name: json.data.user.name,
          role: json.data.user.role,
          allowedStates: json.data.user.allowedStates,
          allowedDistricts: json.data.user.allowedDistricts,
          isVerified: true,
        };
        setUser(authedUser);
        setUnlocked(true);
        setEvaluationUnlocked(true, authedUser);
        return { success: true };
      }

      return { success: false, error: json.message || 'Authentication failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during login' };
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      setUser(null);
      setUnlocked(false);
      setEvaluationUnlocked(false, null);
    }
  }, []);

  const unlock = useCallback(() => setEvaluationUnlocked(true), []);
  const lock = useCallback(() => logout(), [logout]);
  const toggle = useCallback(() => {
    if (isEvaluationUnlocked()) {
      logout();
    } else {
      unlock();
    }
  }, [logout, unlock]);

  return {
    isUnlocked: unlocked,
    user,
    isLoaded,
    login,
    logout,
    unlock,
    lock,
    toggle,
  };
}
