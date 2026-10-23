'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface RegistrationItem {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  requestedState: string;
  organization: string;
  status: 'PENDING' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
  approvedBy?: string | null;
  approvedAt?: number | null;
  notes?: string;
}

function RegistrationsReviewContent() {
  const searchParams = useSearchParams();
  const targetId = searchParams?.get('id')?.trim() || null;

  const { isUnlocked, isLoaded, user } = useEvaluationAccess();
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
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
      const res = await fetch('/api/admin/registrations', {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
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

  const handleApprove = async (id: string, email: string) => {
    if (!confirm(`Are you sure you want to approve registration for ${email}? This will activate their field team invitation code.`)) {
      return;
    }

    setProcessingId(id);
    setActionSuccess(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setError(data.error || 'Failed to approve registration.');
      } else {
        setActionSuccess(`Registration for ${email} has been approved and field team invitation activated.`);
        await fetchRegistrations();
      }
    } catch {
      setError('Network error while processing approval.');
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
          <Loader2 className="w-8 h-8 text-teal-700 animate-spin mx-auto mb-4" />
          <h2 className="text-sm font-semibold text-slate-800">Loading Administrator Review…</h2>
          <p className="text-xs text-slate-500">Checking clearance and retrieving registrations.</p>
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
              <h2 className="text-lg font-bold text-slate-900">Administrator Access Required</h2>
              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Reviewing and approving state-team coordinator registrations requires an authenticated Administrator or Leadership session.
              </p>
            </div>

            {targetId && (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-left">
                <span className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider block">Target Application</span>
                <span className="text-xs text-teal-900 font-mono break-all">{targetId}</span>
                <span className="text-[11px] text-teal-600 block mt-1">You will be returned directly to this record after signing in.</span>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-3">
              <Button
                onClick={() => setIsLoginModalOpen(true)}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm font-semibold"
              >
                <Shield className="w-4 h-4" />
                Authenticate as System Administrator
              </Button>
              <a
                href={`/leadership/login?returnUrl=${encodeURIComponent(returnUrl)}`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Building2 className="w-4 h-4 text-teal-600" />
                Sign In with Leadership Email OTP
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
  const rejectedCount = registrations.filter((r) => r.status === 'REJECTED' || r.status === 'SUSPENDED').length;

  return (
    <AppShell>
      <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-6">
        <SupervisorTabNav />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-6 h-6 text-teal-700" />
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
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Pending Review</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-2">{pendingCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Approved</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-700 mt-2">{approvedCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Rejected / Suspended</span>
              <XCircle className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-2xl font-bold text-slate-700 mt-2">{rejectedCount}</p>
          </div>
        </div>

        {/* Registrations List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
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
                const isRejected = reg.status === 'REJECTED' || reg.status === 'SUSPENDED';
                const isProcessing = processingId === reg.id;

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
                        ? 'bg-teal-50/40 ring-2 ring-teal-600 border-l-4 border-teal-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1">
                      {isTarget && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-100 text-teal-800 text-[11px] font-bold uppercase tracking-wider mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-teal-700" />
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
                          <span className="bg-teal-50 text-teal-700 text-xs font-medium px-2 py-0.5 rounded border border-teal-200 flex items-center gap-1">
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
                          <MapPin className="w-3.5 h-3.5 text-teal-600" />
                          <span className="font-semibold text-slate-800">{reg.requestedState}</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 pt-1">
                        Applied: {new Date(reg.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        {reg.approvedBy && (
                          <span className="ml-3 font-medium text-slate-600">
                            Approved by: {reg.approvedBy} ({reg.approvedAt ? new Date(reg.approvedAt).toLocaleDateString('en-IN') : ''})
                          </span>
                        )}
                        {notesParsed?.adminNotifiedAt && (
                          <span className="ml-3 text-slate-500">
                            Notification sent: {new Date(notesParsed.adminNotifiedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:flex-row items-center gap-2">
                      {isPending && (
                        <>
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
                            onClick={() => handleApprove(reg.id, reg.workEmail)}
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
                        <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1 px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Invitation Active
                        </span>
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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-teal-800 text-sm">
          <Loader2 className="w-6 h-6 animate-spin text-teal-700 mr-2" />
          Loading Administrator Review Screen...
        </div>
      }
    >
      <RegistrationsReviewContent />
    </Suspense>
  );
}
