'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Shield,
  MapPin,
  Building,
  LogOut,
  HelpCircle,
  AlertTriangle,
  X,
  ChevronDown,
  Mail,
  Sparkles,
  Activity,
  TableProperties,
} from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { useSubmissionSummary } from '@/hooks/useSubmissionSummary';
import { platformRegistry } from '@/lib/platform/platformRegistry';
import { CosmicSpaceButton } from '@/components/ui/CosmicSpaceButton';
import { supervisorReadModel } from '@/lib/read-model/supervisorReadModel';

interface FieldUserProfile {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  assignedState?: string;
  assignedDistrict?: string;
  maskedMobile?: string;
  googleEmail?: string;
  srName?: string;
  ssrName?: string;
}

export function ProfileMenu() {
  const router = useRouter();
  const menuId = useId();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [fieldProfile, setFieldProfile] = useState<FieldUserProfile | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { user, isUnlocked, logout } = useEvaluationAccess();
  const { localPendingSyncCount } = useSubmissionSummary();

  // Ensure client-side hydration match
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('field_user_profile');
        if (stored) {
          setFieldProfile(JSON.parse(stored));
        }
      } catch (_) {}
    }
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const isSupervisorUser = isUnlocked && user && user.role !== 'FIELD_USER';
  const hasFieldProfile = Boolean(
    fieldProfile &&
      (fieldProfile.id ||
        fieldProfile.googleEmail ||
        (fieldProfile.name && fieldProfile.name !== 'Field Caseworker'))
  );
  const isLoggedIn = Boolean(
    isSupervisorUser || (user?.isVerified && user?.name) || hasFieldProfile
  );

  const displayName = isSupervisorUser
    ? user?.name || 'State Evaluator'
    : hasFieldProfile
    ? fieldProfile?.name ||
      `${fieldProfile?.firstName || ''} ${fieldProfile?.lastName || ''}`.trim() ||
      user?.name ||
      'Field Caseworker'
    : '';

  const userRoleBadge = isSupervisorUser
    ? user?.role === 'LEADERSHIP'
      ? 'Administration'
      : user?.role === 'ADMIN'
      ? 'Administrator'
      : 'State Reviewer'
    : hasFieldProfile
    ? 'Field Caseworker'
    : 'Not Signed In';

  const handleSignOutClick = () => {
    if (localPendingSyncCount > 0) {
      setShowLogoutConfirm(true);
    } else {
      executeSignOut();
    }
  };

  const executeSignOut = async () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('field_user_profile');
        localStorage.removeItem('field_user_sr');
        localStorage.removeItem('child_nutrition_evaluation_unlocked');
        localStorage.removeItem('child_nutrition:user_session_v1');
        localStorage.removeItem('child_nutrition:supervisor_cache_v1');
      }
      try {
        supervisorReadModel.purgeSession();
      } catch (_) {}
      try {
        const { invalidateAllPortalCaches } = await import('@/lib/portal/portalWarmCache');
        invalidateAllPortalCaches();
      } catch (_) {}
      try {
        const storage = platformRegistry.getSecureStorage();
        await storage.removeSecret('field_session_token');
      } catch (_) {}
      await logout();
      // Server-side session cookie clearance
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    } finally {
      setIsOpen(false);
      setShowLogoutConfirm(false);
      router.push('/');
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        try {
          window.location.reload();
        } catch (_) {}
      }
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {/* Profile Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id={`profile-btn-${menuId}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={isMounted ? (isLoggedIn ? `User menu for ${displayName}` : 'Sign in / user menu') : 'User menu'}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-9 px-3 rounded-full flex items-center gap-1.5 transition-all duration-200 cursor-pointer select-none ${
          !isLoggedIn
            ? 'text-white shadow-[0_4px_14px_rgba(225,29,72,0.35)] hover:brightness-105 active:scale-95'
            : isOpen
            ? 'bg-sky-50 border border-sky-400 ring-2 ring-sky-400/20 text-slate-800'
            : 'bg-white/90 hover:bg-white border border-slate-200/90 text-slate-700 shadow-2xs'
        }`}
        style={
          !isLoggedIn
            ? {
                background: 'linear-gradient(108deg, #D9480F 0%, #EA580C 28%, #E11D48 70%, #9D174D 100%)',
                border: '1px solid rgba(254, 240, 138, 0.45)',
              }
            : undefined
        }
      >
        {!isLoggedIn ? (
          <>
            <User className="w-3.5 h-3.5 text-white shrink-0" />
            <span className="text-xs font-bold text-white tracking-tight">Sign In</span>
            <ChevronDown className={`w-3.5 h-3.5 text-white/90 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        ) : (
          <>
            <div className="w-6 h-6 rounded-full flex items-center justify-center font-extrabold text-xs text-white bg-gradient-to-br from-[#EA580C] to-[#E11D48] shrink-0 shadow-2xs">
              {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className="text-xs font-bold max-w-[120px] truncate text-slate-800 hidden sm:inline">
              {displayName || 'Profile'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-labelledby={`profile-btn-${menuId}`}
          className="absolute right-0 mt-2.5 w-80 max-w-[90vw] bg-white rounded-3xl shadow-[0_24px_48px_-12px_rgba(7,43,124,0.28)] border border-blue-200/80 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header Banner — Cosmic Sky Gradient with subtle star sparkles */}
          <div
            className="relative p-4 text-white overflow-hidden"
            style={{
              background: isSupervisorUser
                ? 'linear-gradient(135deg, #07225E 0%, #0F3E9E 58%, #1E5CC7 100%)'
                : 'linear-gradient(135deg, #093282 0%, #155AD1 55%, #2B84F2 100%)',
            }}
          >
            {/* Twinkling star sparkle dots */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" aria-hidden="true">
              <circle cx="28" cy="14" r="1.2" fill="#FFFFFF" />
              <circle cx="92" cy="38" r="1.5" fill="#FEF08A" />
              <circle cx="240" cy="18" r="1.2" fill="#FFFFFF" />
              <circle cx="280" cy="42" r="1.6" fill="#BAE6FD" />
              <path d="M298 12 l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#FEF08A" opacity="0.8" />
            </svg>

            <div className="relative z-10 flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-white/18 border border-white/30 backdrop-blur-xs flex items-center justify-center text-white font-bold text-sm shrink-0">
                {isLoggedIn && displayName ? (
                  displayName.charAt(0).toUpperCase()
                ) : (
                  <User className="w-5 h-5 text-sky-100" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate leading-tight text-white">
                  {isLoggedIn && displayName ? displayName : 'Guest User'}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 border border-white/25 text-sky-100">
                    {userRoleBadge}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* User Details Body */}
          <div className="p-4 space-y-3 text-xs border-b border-slate-100">
            {!isLoggedIn ? (
              <p className="text-slate-600 font-medium leading-relaxed">
                Please sign in or register to record child nutrition assessments and sync records with the national database.
              </p>
            ) : isSupervisorUser ? (
              // State Team / Leadership Scope
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-400">Role:</span>
                  <span className="font-semibold text-slate-800">{user?.role || 'Reviewer'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-400">Permitted Scope:</span>
                  <span className="font-semibold text-teal-700">
                    {user?.allowedStates && user.allowedStates.includes('*')
                      ? 'All States (National)'
                      : (user?.allowedStates || []).join(', ') || 'Not specified'}
                  </span>
                </div>
              </div>
            ) : (
              // Field Worker Identity Details
              <div className="space-y-2">
                {fieldProfile?.id && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-400">Worker ID:</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-700">{fieldProfile.id}</span>
                  </div>
                )}
                {fieldProfile?.googleEmail && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Email:
                    </span>
                    <span className="font-semibold text-slate-800 truncate max-w-[170px]" title={fieldProfile.googleEmail}>
                      {fieldProfile.googleEmail}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> State / District:
                  </span>
                  <span className="font-semibold text-slate-800">
                    {fieldProfile?.assignedState || 'Not provided'}
                    {fieldProfile?.assignedDistrict ? ` · ${fieldProfile.assignedDistrict}` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Building className="w-3 h-3" /> SR Name:
                  </span>
                  <span className="font-semibold text-slate-800 truncate max-w-[170px]" title={fieldProfile?.srName || 'Not provided'}>
                    {fieldProfile?.srName || 'Not provided'}
                  </span>
                </div>
                {fieldProfile?.ssrName && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-400">SSR Name:</span>
                    <span className="font-semibold text-slate-800 truncate max-w-[170px]" title={fieldProfile.ssrName}>
                      {fieldProfile.ssrName}
                    </span>
                  </div>
                )}
                {fieldProfile?.maskedMobile && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-400">Mobile:</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-700">
                      {fieldProfile.maskedMobile}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Links */}
          <div className="p-3 space-y-1.5">
            {!isLoggedIn ? (
              <div className="pb-1">
                <CosmicSpaceButton
                  variant="comet"
                  onClick={() => {
                    setIsOpen(false);
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('child_nutrition:open_welcome_kite', { detail: { mode: 'signin' } })
                      );
                    }
                    router.push('/app?onboarding=open&mode=signin');
                  }}
                  leftIcon={<Mail className="w-4 h-4 text-white" />}
                  className="!min-h-[42px] !py-2.5 !text-xs !font-bold"
                >
                  Sign In / Register (Email OTP)
                </CosmicSpaceButton>
              </div>
            ) : isSupervisorUser ? (
              /* Evaluation Workspace Shortcuts */
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    router.push('/supervisor');
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-[#093282] rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Activity className="w-4 h-4 text-[#155AD1]" />
                  <span>Overview &amp; Surveillance</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    router.push('/supervisor/assessments');
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-[#093282] rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <TableProperties className="w-4 h-4 text-[#155AD1]" />
                  <span>Beneficiary Linelist</span>
                </button>
              </>
            ) : (
              /* Field Caseworker Switch/Restore */
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('child_nutrition:open_welcome_kite', { detail: { mode: 'signin' } })
                    );
                  }
                  router.push('/app?onboarding=open&mode=signin');
                }}
                className="w-full px-3 py-2.5 text-left text-xs font-bold rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer text-[#093282] bg-sky-50/80 hover:bg-sky-100 border border-sky-200/70"
              >
                <Mail className="w-4 h-4 text-[#155AD1]" />
                <span>Switch / Restore Account (Email OTP)</span>
              </button>
            )}

            {!isLoggedIn && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('child_nutrition:open_login_modal'));
                  }
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-[#093282] rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Shield className="w-4 h-4 text-slate-400 group-hover:text-[#155AD1]" />
                <span>Supervisor / Administration Login</span>
              </button>
            )}

            {isLoggedIn && !isSupervisorUser && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/app');
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-[#093282] rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <User className="w-4 h-4 text-slate-400" />
                <span>View Profile Details</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                alert(
                  'Account Recovery & Support:\n\nIf you have lost access to your registered device or phone number, please contact your State Programme Coordinator for assisted identity verification.'
                );
              }}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-[#093282] rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>Recover Account / Help</span>
            </button>

            {isLoggedIn && (
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOutClick}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-500" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Unsynced Drafts Logout Warning Dialog */}
      {showLogoutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-warn-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-amber-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 id="logout-warn-title" className="text-base font-bold text-slate-900">
                Unsynced Surveys On This Device
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                You have {localPendingSyncCount} survey(s) waiting to sync from this device.
              </p>
              <p className="text-xs text-slate-500">
                Signing out now will keep your records safe in offline storage, but you must sign in again with this account
                to upload them.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  setIsOpen(false);
                  router.push('/assessment/sync');
                }}
                className="w-full py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Review &amp; Sync Now
              </button>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeSignOut}
                  className="flex-1 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  Sign Out Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
