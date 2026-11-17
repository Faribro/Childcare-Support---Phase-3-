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
} from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { useSubmissionSummary } from '@/hooks/useSubmissionSummary';

interface FieldUserProfile {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  assignedState?: string;
  assignedDistrict?: string;
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

  const displayName = isSupervisorUser
    ? user?.name || 'State Evaluator'
    : fieldProfile?.name ||
      `${fieldProfile?.firstName || ''} ${fieldProfile?.lastName || ''}`.trim() ||
      user?.name ||
      'Field Caseworker';

  const userRoleBadge = isSupervisorUser
    ? user?.role === 'LEADERSHIP'
      ? 'Leadership'
      : user?.role === 'ADMIN'
      ? 'Administrator'
      : 'State Reviewer'
    : 'Field Caseworker';

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
      }
      await logout();
      // Server-side session cookie clearance
      await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    } finally {
      setIsOpen(false);
      setShowLogoutConfirm(false);
      router.push('/app');
      if (typeof window !== 'undefined') {
        window.location.reload();
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
        aria-label={isMounted ? `User menu for ${displayName}` : 'User menu'}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-9 px-2.5 rounded-full border flex items-center gap-2 transition-all cursor-pointer select-none ${
          isOpen
            ? 'bg-teal-50 border-teal-500 ring-2 ring-teal-500/20 text-teal-900 shadow-xs'
            : 'bg-white hover:bg-slate-50 border-slate-200/90 text-slate-700'
        }`}
      >
        <div className="w-6 h-6 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
          {isMounted ? (
            displayName.charAt(0).toUpperCase()
          ) : (
            <User className="w-3.5 h-3.5" />
          )}
        </div>
        <span className="text-xs font-semibold max-w-[120px] truncate hidden sm:inline">
          {isMounted ? displayName : 'Profile'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-labelledby={`profile-btn-${menuId}`}
          className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header Banner */}
          <div className="p-4 bg-gradient-to-br from-teal-800 to-emerald-900 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate leading-tight text-white">{displayName}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-teal-100">
                    {userRoleBadge}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* User Details Body */}
          <div className="p-4 space-y-3 text-xs border-b border-slate-100">
            {isSupervisorUser ? (
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
              </div>
            )}
          </div>

          {/* Action Links */}
          <div className="p-2 space-y-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                router.push('/app');
              }}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <User className="w-4 h-4 text-slate-400" />
              <span>View Profile Details</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                // Trigger recovery / help info
                alert(
                  'Account Recovery & Support:\n\nIf you have lost access to your registered device or phone number, please contact your State Programme Coordinator for assisted identity verification.'
                );
              }}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>Recover Account / Help</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={handleSignOutClick}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Sign Out</span>
            </button>
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
