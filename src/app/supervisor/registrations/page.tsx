'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { SupervisorTabNav } from '@/components/supervisor/SupervisorTabNav';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { EvaluationLoginModal } from '@/components/auth/EvaluationLoginModal';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  AlertCircle,
  RefreshCw,
  Loader2,
  Lock,
  Building,
  Building2,
  MapPin,
  Mail,
  UserCheck,
  Send,
  Sparkles,
  KeyRound,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { INDIAN_STATES_AND_UTS } from '@/lib/clinical/nutritionCalculations';

interface RegistrationItem {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  requestedState: string;
  assignedState?: string | null;
  organization: string;
  status: 'PENDING' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'REVOKED';
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
  approvedBy?: string | null;
  approvedAt?: number | null;
  revokedBy?: string | null;
  revokedAt?: number | null;
  revocationReason?: string | null;
  notes?: string;
}

interface AccessInvitationItem {
  id: string;
  invitedEmail: string;
  assignedState: string;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';
  issuedBy: string;
  issuedAt: number;
  expiresAt: number;
  redeemedAt?: number | null;
}

function RegistrationsReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetId = searchParams?.get('id')?.trim() || null;

  const { isUnlocked, isLoaded, user } = useEvaluationAccess();
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [accessInvitations, setAccessInvitations] = useState<AccessInvitationItem[]>([]);
  const [assignedStateMap, setAssignedStateMap] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteState, setInviteState] = useState('Maharashtra');
  const [inviteExpiryDays, setInviteExpiryDays] = useState(7);
  const [issuedPlainCode, setIssuedPlainCode] = useState<string | null>(null);
  const [isIssuingInvite, setIsIssuingInvite] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const isAuthorized = user?.role === 'LEADERSHIP' || user?.role === 'ADMIN';

  const fetchRegistrations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [regRes, invRes] = await Promise.all([
        fetch('/api/admin/registrations', { headers: { Accept: 'application/json' } }),
        fetch('/api/admin/state-team-invitations', { headers: { Accept: 'application/json' } }),
      ]);
      const data = await regRes.json();
      if (!regRes.ok || data.status === 'error') {
        setError(data.error || 'Failed to load registrations.');
      } else {
        const list: RegistrationItem[] = data.data.registrations || [];
        // If a targetId is provided in URL, prioritize and sort it to the top
        if (targetId) {
          list.sort((a, b) => {
            if (a.id === targetId) return -1;
            if (b.id === targetId) return 1;
            return b.createdAt - a.createdAt;
          });
        }
        setRegistrations(list);
      }
      if (invRes.ok) {
        const invData = await invRes.json().catch(() => null);
        if (invData?.status === 'success' && Array.isArray(invData.invitations)) {
          setAccessInvitations(invData.invitations);
        }
      }
    } catch {
      setError('Network error while loading registrations.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && isUnlocked && isAuthorized) {
      fetchRegistrations();
    } else if (isLoaded) {
      setIsLoading(false);
    }
  }, [isLoaded, isUnlocked, isAuthorized, targetId]);

  const handleApprove = async (id: string, email: string, fallbackState: string) => {
    const serverState = assignedStateMap[id] || fallbackState;
    if (!confirm(`Approve State Team access for ${email} assigned to ${serverState}?`)) {
      return;
    }

    setProcessingId(id);
    setActionSuccess(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedState: serverState }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setError(data.error || 'Failed to approve registration.');
      } else {
        setActionSuccess(`Approved State Team access for ${email} (${serverState}).`);
        await fetchRegistrations();
      }
    } catch {
      setError('Network error while processing approval.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevoke = async (id: string, email: string) => {
    const reason = prompt(`Enter reason for revoking State Team access for ${email}:`, 'Access revoked by Administration');
    if (reason === null) return;

    setProcessingId(id);
    setActionSuccess(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/registrations/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setError(data.error || 'Failed to revoke access.');
      } else {
        setActionSuccess(`Access revoked for ${email}. Active sessions blocked immediately.`);
        await fetchRegistrations();
      }
    } catch {
      setError('Network error while revoking access.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleIssueAccessInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setError('Please enter a valid work email address.');
      return;
    }
    setIsIssuingInvite(true);
    setError(null);
    setActionSuccess(null);
    setIssuedPlainCode(null);

    try {
      const res = await fetch('/api/admin/state-team-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitedEmail: inviteEmail.trim(),
          assignedState: inviteState,
          expiresInDays: inviteExpiryDays,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setError(data.error || 'Failed to issue single-use State Team invitation.');
      } else {
        setIssuedPlainCode(data.plainCode || null);
        setActionSuccess(
          `Issued single-use invitation for ${inviteEmail.trim()} (${inviteState}).`
        );
        setInviteEmail('');
        await fetchRegistrations();
      }
    } catch {
      setError('Network error while issuing invitation.');
    } finally {
      setIsIssuingInvite(false);
    }
  };

  const handleRevokeAccessInvitation = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/admin/state-team-invitations?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setActionSuccess('Invitation code revoked.');
        await fetchRegistrations();
      }
    } catch {
      setError('Failed to revoke invitation.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string, email: string) => {
    const reason = prompt(`Enter reason for rejecting ${email}:`, 'Registration requirements not met');
    if (reason === null) return;

    setProcessingId(id);
    setActionSuccess(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/registrations/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setError(data.error || 'Failed to reject registration.');
      } else {
        setActionSuccess(`Registration for ${email} has been rejected.`);
        await fetchRegistrations();
      }
    } catch {
      setError('Network error while processing rejection.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleNotifyAdmin = async (id: string, email: string) => {
    setProcessingId(id);
    setActionSuccess(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/registrations/${id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setError(data.error || 'Failed to dispatch administrator notification.');
      } else {
        setActionSuccess(`Approval request email successfully sent to ${data.data?.recipient || 'administrator'}.`);
        await fetchRegistrations();
      }
    } catch {
      setError('Network error while dispatching notification.');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isLoaded || isLoading) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-16 text-center">
          <Loader2 className="w-8 h-8 text-[#155AD1] animate-spin mx-auto mb-4" />
          <h2 className="text-sm font-semibold text-slate-800">Loading Administrator Review…</h2>
          <p className="text-xs text-slate-500">Checking clearance and retrieving registrations.</p>
        </div>
      </AppShell>
    );
  }

  if (isUnlocked && user?.role === 'STATE_REVIEWER') {
    const reviewerState = user.allowedStates?.filter((s: string) => s !== '*')[0] || 'State';
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">
          <SupervisorTabNav />
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center max-w-md mx-auto my-8 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-[#155AD1] flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Coordinator Registration Approvals</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              State Team coordinator approvals and invitations are reserved for Administration and Administrator accounts.
            </p>
            <div className="text-xs text-[#093282] bg-sky-50/80 border border-sky-200 rounded-xl p-3 text-left">
              As a State Reviewer for <strong>{reviewerState}</strong>, you can view the active field workers, their assigned districts, SR/SSR details, and survey submission totals in the Field Workers Directory.
            </div>
            <div className="pt-2">
              <Button
                onClick={() => router.push('/supervisor/field-workers')}
                className="w-full bg-[#155AD1] hover:bg-[#093282] text-white rounded-full text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-xs"
              >
                <Users className="w-4 h-4" />
                View {reviewerState} Field Workers Directory
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!isUnlocked || !isAuthorized) {
    const returnUrl = typeof window !== 'undefined'
      ? (window.location.pathname + window.location.search)
      : (targetId ? `/supervisor/registrations?id=${targetId}` : '/supervisor/registrations');

    return (
      <AppShell>
        <div className="flex-1 w-full max-w-md mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xl space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto shadow-inner">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Administration Access Required</h2>
              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Reviewing and approving State Team coordinator registrations requires an authenticated Administration session.
              </p>
            </div>

            {targetId && (
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-left">
                <span className="text-[11px] font-semibold text-[#093282] uppercase tracking-wider block">Target Application</span>
                <span className="text-xs text-[#07225E] font-mono break-all">{targetId}</span>
                <span className="text-[11px] text-[#155AD1] block mt-1">You will be returned directly to this record after signing in.</span>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-3">
              <Button
                onClick={() => setIsLoginModalOpen(true)}
                className="w-full bg-[#155AD1] hover:bg-[#093282] text-white rounded-full text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm font-semibold"
              >
                <Shield className="w-4 h-4" />
                Open Staff Access
              </Button>
              <a
                href={`/leadership/login?returnUrl=${encodeURIComponent(returnUrl)}`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Building2 className="w-4 h-4 text-[#155AD1]" />
                Sign in with email OTP
              </a>
            </div>
          </div>
        </div>

        <EvaluationLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onSuccess={() => {
            setIsLoginModalOpen(false);
            fetchRegistrations();
          }}
        />
      </AppShell>
    );
  }

  const pendingCount = registrations.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'PENDING').length;
  const approvedCount = registrations.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = registrations.filter((r) => r.status === 'REJECTED' || r.status === 'SUSPENDED' || r.status === 'REVOKED').length;

  return (
    <AppShell>
      <div className="w-full max-w-7xl mx-auto px-4 pt-2 pb-6 sm:pt-3 sm:pb-8 space-y-5">
        <SupervisorTabNav
          rightAction={
            <Button
              onClick={fetchRegistrations}
              variant="ghost"
              size="sm"
              className="h-9 px-3.5 text-xs font-semibold text-[#093282] bg-sky-50/80 hover:bg-sky-100 border border-sky-200 rounded-full flex items-center gap-1.5 cursor-pointer transition-colors"
              disabled={isLoading}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#155AD1] ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          }
        />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-6 h-6 text-[#155AD1]" />
              State Team Registrations Review
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Review and authorize external state coordinators before activating field-team invitation codes.
            </p>
          </div>
          <Button
            onClick={fetchRegistrations}
            variant="secondary"
            className="flex items-center gap-2 text-xs"
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Failed</p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Success</p>
              <p className="text-xs text-emerald-700 mt-0.5">{actionSuccess}</p>
            </div>
          </div>
        )}

        {/* Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-sky-100/90 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Pending Review</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-2">{pendingCount}</p>
          </div>
          <div className="bg-white rounded-3xl border border-sky-100/90 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Approved</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-700 mt-2">{approvedCount}</p>
          </div>
          <div className="bg-white rounded-3xl border border-sky-100/90 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Rejected / Suspended</span>
              <XCircle className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-2xl font-bold text-slate-700 mt-2">{rejectedCount}</p>
          </div>
        </div>

        {/* Issue Single-Use Email-Bound State Team Invitation */}
        <div className="bg-white rounded-3xl border border-sky-100/90 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#155AD1]" />
                Issue Single-Use State Team Invitation
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bound to one email address and server-assigned state. Expires automatically after single redemption or timeout.
              </p>
            </div>
          </div>

          <form onSubmit={handleIssueAccessInvitation} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <label htmlFor="admin-invite-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Coordinator Work Email
              </label>
              <input
                id="admin-invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="coordinator@allianceindia.org"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#155AD1]"
              />
            </div>
            <div>
              <label htmlFor="admin-invite-state" className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned State Scope
              </label>
              <select
                id="admin-invite-state"
                value={inviteState}
                onChange={(e) => setInviteState(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white"
              >
                {INDIAN_STATES_AND_UTS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <select
                aria-label="Invitation validity days"
                value={inviteExpiryDays}
                onChange={(e) => setInviteExpiryDays(Number(e.target.value))}
                className="w-24 px-2 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
              </select>
              <Button
                type="submit"
                disabled={isIssuingInvite}
                className="flex-1 bg-[#155AD1] hover:bg-[#093282] text-white text-xs py-2 px-3 rounded-xl font-semibold"
              >
                {isIssuingInvite ? 'Sending…' : 'Send Invite'}
              </Button>
            </div>
          </form>

          {issuedPlainCode && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between flex-wrap gap-2">
              <span>Single-use invitation code generated:</span>
              <code className="font-mono font-bold px-2 py-0.5 bg-white border border-emerald-300 rounded">
                {issuedPlainCode}
              </code>
            </div>
          )}

          {accessInvitations.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Recent State Team Invitations</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {accessInvitations.slice(0, 6).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <div className="truncate pr-2">
                      <p className="font-semibold text-slate-800 truncate">{inv.invitedEmail}</p>
                      <p className="text-[11px] text-slate-500">
                        {inv.assignedState} · <span className="font-semibold">{inv.status}</span>
                      </p>
                    </div>
                    {inv.status === 'ACTIVE' && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleRevokeAccessInvitation(inv.id)}
                        disabled={processingId === inv.id}
                        className="text-rose-600 border-rose-200 hover:bg-rose-50 text-[11px] px-2.5 py-1 h-auto"
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Registrations List */}
        <div className="bg-white rounded-3xl border border-sky-100/90 shadow-[0_14px_34px_-14px_rgba(7,43,124,0.10)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              All Applications ({registrations.length})
            </h2>
          </div>

          {registrations.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium">No registrations recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {registrations.map((reg) => {
                const isTarget = targetId === reg.id;
                const isPending = reg.status === 'PENDING_APPROVAL' || reg.status === 'PENDING';
                const isApproved = reg.status === 'APPROVED';
                const isRejected = reg.status === 'REJECTED' || reg.status === 'SUSPENDED' || reg.status === 'REVOKED';
                const isProcessing = processingId === reg.id;
                const effectiveAssignedState = assignedStateMap[reg.id] || reg.assignedState || reg.requestedState;

                let notesParsed: any = null;
                try {
                  if (reg.notes) notesParsed = JSON.parse(reg.notes);
                } catch {
                  notesParsed = null;
                }

                return (
                  <div
                    key={reg.id}
                    id={`reg-${reg.id}`}
                    className={`p-6 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                      isTarget
                        ? 'bg-sky-50/60 ring-2 ring-[#155AD1] border-l-4 border-[#155AD1]'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1">
                      {isTarget && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-100 text-[#093282] text-[11px] font-bold uppercase tracking-wider mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-[#155AD1]" />
                          Target Application for Review
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-slate-900">
                          {reg.firstName} {reg.lastName}
                        </span>
                        {isPending && (
                          <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-amber-200">
                            Pending Review
                          </span>
                        )}
                        {isApproved && (
                          <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
                            Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="bg-rose-100 text-rose-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-rose-200">
                            {reg.status}
                          </span>
                        )}
                        {reg.emailVerified ? (
                          <span className="bg-sky-50 text-[#155AD1] text-xs font-medium px-2 py-0.5 rounded border border-sky-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Email Verified
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Email Pending
                          </span>
                        )}
                        {notesParsed?.adminNotifiedAt && (
                          <span className="bg-blue-50 text-blue-700 text-[11px] font-medium px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                            <Mail className="w-3 h-3" /> Admin Notified
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1 gap-x-4 text-xs text-slate-600 pt-1">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{reg.workEmail}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>{reg.organization}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#155AD1]" />
                          <span className="font-semibold text-slate-800">
                            {reg.assignedState || reg.requestedState}
                            {reg.assignedState && reg.assignedState !== reg.requestedState
                              ? ` (requested: ${reg.requestedState})`
                              : ''}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 pt-1">
                        Applied: {new Date(reg.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        {reg.approvedBy && (
                          <span className="ml-3 font-medium text-slate-600">
                            Approved by: {reg.approvedBy} ({reg.approvedAt ? new Date(reg.approvedAt).toLocaleDateString('en-IN') : ''})
                          </span>
                        )}
                        {reg.revokedBy && (
                          <span className="ml-3 font-medium text-rose-700">
                            Revoked by: {reg.revokedBy} ({reg.revokedAt ? new Date(reg.revokedAt).toLocaleDateString('en-IN') : ''})
                          </span>
                        )}
                        {notesParsed?.adminNotifiedAt && (
                          <span className="ml-3 text-slate-500">
                            Notification sent: {new Date(notesParsed.adminNotifiedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:flex-row flex-wrap">
                      {isPending && (
                        <>
                          <select
                            aria-label={`Assigned state for ${reg.workEmail}`}
                            value={effectiveAssignedState}
                            onChange={(e) =>
                              setAssignedStateMap((prev) => ({ ...prev, [reg.id]: e.target.value }))
                            }
                            className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                          >
                            {INDIAN_STATES_AND_UTS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                          <Button
                            onClick={() => handleNotifyAdmin(reg.id, reg.workEmail)}
                            disabled={isProcessing}
                            variant="secondary"
                            className="text-slate-700 hover:bg-slate-100 border-slate-300 text-xs px-3 py-1.5 h-auto flex items-center gap-1.5"
                            title="Resend approval notification email to administrator"
                          >
                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 text-slate-500" />}
                            Email Admin
                          </Button>
                          <Button
                            onClick={() => handleApprove(reg.id, reg.workEmail, reg.requestedState)}
                            disabled={isProcessing || !reg.emailVerified}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-1.5 h-auto flex items-center gap-1.5 shadow-xs font-semibold"
                          >
                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                            Approve
                          </Button>
                          <Button
                            onClick={() => handleReject(reg.id, reg.workEmail)}
                            disabled={isProcessing}
                            variant="secondary"
                            className="text-rose-600 hover:bg-rose-50 border-rose-200 text-xs px-3.5 py-1.5 h-auto flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </Button>
                        </>
                      )}
                      {isApproved && (
                        <>
                          <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1 px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Access Active
                          </span>
                          <Button
                            onClick={() => handleRevoke(reg.id, reg.workEmail)}
                            disabled={isProcessing}
                            variant="secondary"
                            className="text-rose-700 hover:bg-rose-50 border-rose-200 text-xs px-3 py-1.5 h-auto flex items-center gap-1.5"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Revoke
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function PendingRegistrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-[#093282] text-sm">
          <Loader2 className="w-6 h-6 animate-spin text-[#155AD1] mr-2" />
          Loading Administrator Review Screen...
        </div>
      }
    >
      <RegistrationsReviewContent />
    </Suspense>
  );
}
