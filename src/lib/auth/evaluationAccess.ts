'use client';

import { useState, useEffect, useCallback } from 'react';
import { supervisorReadModel } from '@/lib/read-model/supervisorReadModel';

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
 * Requires both the unlock flag and a verified user session cache.
 */
export function isEvaluationUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isStoredUnlocked = localStorage.getItem(STORAGE_KEY) === 'true';
    if (!isStoredUnlocked) return false;
    const cachedUser = localStorage.getItem(SESSION_CACHE_KEY);
    if (!cachedUser) return false;
    const parsed = JSON.parse(cachedUser);
    return Boolean(parsed && parsed.isVerified === true);
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
    if (unlocked && user?.isVerified) {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SESSION_CACHE_KEY);
    }
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: {
          unlocked: Boolean(unlocked && user?.isVerified),
          user: user?.isVerified ? user : null,
        },
      })
    );
  } catch (err) {
    console.error('Failed to set evaluation unlock status:', err);
  }
}

/**
 * React hook for reactive evaluation access and attributable session identity.
 */
export function useEvaluationAccess() {
  const [unlocked, setUnlocked] = useState<boolean>(() => isEvaluationUnlocked());
  const [user, setUser] = useState<EvaluationUser | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed?.isVerified ? parsed : null;
      }
    } catch (_) {}
    return null;
  });
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
        const parsed = JSON.parse(cached);
        if (parsed?.isVerified) {
          setUser(parsed);
        } else {
          setUser(null);
        }
      }
    } catch (_) {}

    // Verify session with server endpoint
    async function checkServerSession() {
      // Allow unit tests to bypass server network calls unless explicitly testing auth check
      if (process.env.NODE_ENV === 'test' && !(globalThis as any).__TEST_ENABLE_SESSION_FETCH__) {
        if (active) setIsLoaded(true);
        return;
      }
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.isVerified && active) {
            const authedUser: EvaluationUser = {
              userId: json.data.userId,
              name: json.data.name,
              role: json.data.role,
              allowedStates: json.data.allowedStates || [],
              allowedDistricts: json.data.allowedDistricts || [],
              isVerified: true,
            };
            setUser(authedUser);
            setUnlocked(true);
            setEvaluationUnlocked(true, authedUser);
          } else if (active) {
            // Unauthenticated response (e.g. isVerified: false): clear cached credentials
            setUser(null);
            setUnlocked(false);
            setEvaluationUnlocked(false, null);
          }
        } else if (active) {
          // 401 or non-200: clear credentials
          setUser(null);
          setUnlocked(false);
          setEvaluationUnlocked(false, null);
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

    const handleSessionUnauthorized = () => {
      setUser(null);
      setUnlocked(false);
      setEvaluationUnlocked(false, null);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === SESSION_CACHE_KEY) {
        const nextUnlocked = isEvaluationUnlocked();
        setUnlocked(nextUnlocked);
        try {
          const cached = localStorage.getItem(SESSION_CACHE_KEY);
          setUser(cached ? JSON.parse(cached) : null);
        } catch (_) {
          setUser(null);
        }
      }
    };

    window.addEventListener(EVENT_NAME, handleUnlockChange);
    window.addEventListener('child_nutrition:session_unauthorized', handleSessionUnauthorized);
    window.addEventListener('storage', handleStorage);

    return () => {
      active = false;
      window.removeEventListener(EVENT_NAME, handleUnlockChange);
      window.removeEventListener('child_nutrition:session_unauthorized', handleSessionUnauthorized);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
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
            allowedStates: json.data.user.allowedStates || [],
            allowedDistricts: json.data.user.allowedDistricts || [],
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
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      setUser(null);
      setUnlocked(false);
      setEvaluationUnlocked(false, null);
      supervisorReadModel.purgeSession();
    }
  }, []);

  const unlock = useCallback(() => {
    if (user && user.isVerified) {
      setEvaluationUnlocked(true, user);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('child_nutrition:open_login_modal'));
    }
  }, [user]);

  const lock = useCallback(() => logout(), [logout]);

  const toggle = useCallback(() => {
    if (isEvaluationUnlocked()) {
      logout();
    } else {
      unlock();
    }
  }, [logout, unlock]);

  const effectiveUnlocked = Boolean(unlocked && user?.isVerified);

  return {
    isUnlocked: effectiveUnlocked,
    isAuthenticated: effectiveUnlocked,
    user,
    isLoaded,
    isLoading: !isLoaded,
    login,
    logout,
    unlock,
    lock,
    toggle,
  };
}
