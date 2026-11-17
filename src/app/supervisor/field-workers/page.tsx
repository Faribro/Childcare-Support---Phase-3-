'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { SupervisorTabNav } from '@/components/supervisor/SupervisorTabNav';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { EvaluationLoginModal } from '@/components/auth/EvaluationLoginModal';
import { Button } from '@/components/ui/Button';
import {
  Users,
  Search,
  RefreshCw,
  Loader2,
  Shield,
  MapPin,
  Building,
  Mail,
  Calendar,
  FileText,
  Filter,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface FieldWorkerItem {
  id: string;
  googleSub: string;
  email: string;
  name: string;
  assignedState: string;
  assignedDistrict: string;
  srName: string;
  ssrName: string;
  status: string;
  onboardedAt: string | null;
  totalSubmissions: number;
  lastSubmittedAt: string | null;
}

export default function SupervisorFieldWorkersPage() {
  const router = useRouter();
  const { isUnlocked, isLoaded, user } = useEvaluationAccess();
  const [workers, setWorkers] = useState<FieldWorkerItem[]>([]);
  const [stateScope, setStateScope] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const isAuthorized =
    user?.role === 'STATE_REVIEWER' || user?.role === 'LEADERSHIP' || user?.role === 'ADMIN';

  const fetchFieldWorkers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/supervisor/field-workers', {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        setError(json.error || 'Failed to retrieve field workers directory.');
      } else {
        setWorkers(json.data.fieldWorkers || []);
        setStateScope(json.data.stateScope || '');
      }
    } catch {
      setError('Network error while retrieving field workers directory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && isUnlocked && isAuthorized) {
      fetchFieldWorkers();
    } else if (isLoaded) {
      setIsLoading(false);
    }
  }, [isLoaded, isUnlocked, isAuthorized]);

  const uniqueDistricts = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => {
      if (w.assignedDistrict) set.add(w.assignedDistrict);
    });
    return Array.from(set).sort();
  }, [workers]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (districtFilter !== 'ALL' && w.assignedDistrict !== districtFilter) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        w.name.toLowerCase().includes(term) ||
        w.email.toLowerCase().includes(term) ||
        w.assignedDistrict.toLowerCase().includes(term) ||
        w.srName.toLowerCase().includes(term) ||
        w.ssrName.toLowerCase().includes(term)
      );
    });
  }, [workers, searchTerm, districtFilter]);

  const totalSubmissionsInState = useMemo(() => {
    return workers.reduce((acc, curr) => acc + (curr.totalSubmissions || 0), 0);
  }, [workers]);

  if (!isLoaded) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-16 text-center">
          <Loader2 className="w-8 h-8 text-teal-700 animate-spin mx-auto mb-4" />
          <h2 className="text-sm font-semibold text-slate-800">Verifying session…</h2>
        </div>
      </AppShell>
    );
  }

  if (!isUnlocked || !isAuthorized) {
    return (
      <AppShell>
        <div className="flex-1 w-full max-w-md mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xl space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto shadow-inner">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Sign In Required</h2>
              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Viewing the field workers directory requires an authenticated State Reviewer or Supervisor session.
              </p>
            </div>
            <Button
              onClick={() => setIsLoginModalOpen(true)}
              className="w-full bg-teal-800 hover:bg-teal-900 text-white text-xs py-3 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-xs"
            >
              <Shield className="w-4 h-4" />
              Sign In to State Evaluation Portal
            </Button>
          </div>
        </div>
        <EvaluationLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onSuccess={() => {
            setIsLoginModalOpen(false);
            fetchFieldWorkers();
          }}
        />
      </AppShell>
    );
  }

  const displayState =
    stateScope ||
    (user?.role === 'STATE_REVIEWER'
      ? user.allowedStates?.filter((s) => s !== '*')[0] || 'State'
      : 'All States');

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <SupervisorTabNav
          rightAction={
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchFieldWorkers}
              disabled={isLoading}
              className="text-xs h-9 gap-1.5 border-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          }
        />

        {/* State Reviewer Header & KPI Summary */}
        <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-700/60 border border-teal-500/30 rounded-full text-xs font-medium text-teal-200 mb-2">
                <MapPin className="w-3.5 h-3.5 text-teal-300" />
                <span>State Scope: {displayState}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Field Workers Directory
              </h1>
              <p className="text-xs sm:text-sm text-teal-100/80 mt-1 max-w-2xl">
                Active caseworkers collecting child nutrition assessments in {displayState}. View onboarded staff, assigned districts, SR/SSR partnerships, and survey submission volume.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                onClick={() => router.push('/supervisor/assessments')}
                className="bg-teal-600 hover:bg-teal-500 text-white text-xs px-4 py-2.5 rounded-xl font-semibold shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>View State Assessments</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-4 border border-white/10">
              <div className="text-teal-200 text-xs font-medium">Field Workers Active</div>
              <div className="text-2xl font-bold text-white mt-1">{workers.length}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-4 border border-white/10">
              <div className="text-teal-200 text-xs font-medium">Total State Submissions</div>
              <div className="text-2xl font-bold text-white mt-1">{totalSubmissionsInState}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-4 border border-white/10">
              <div className="text-teal-200 text-xs font-medium">Districts Covered</div>
              <div className="text-2xl font-bold text-white mt-1">{uniqueDistricts.length}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-4 border border-white/10">
              <div className="text-teal-200 text-xs font-medium">Avg Surveys / Worker</div>
              <div className="text-2xl font-bold text-white mt-1">
                {workers.length > 0 ? (totalSubmissionsInState / workers.length).toFixed(1) : '0'}
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by worker name, email, district, SR/SSR…"
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              <option value="ALL">All Districts ({uniqueDistricts.length})</option>
              {uniqueDistricts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {(searchTerm || districtFilter !== 'ALL') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setDistrictFilter('ALL');
                }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Field Caseworker</th>
                  <th className="py-3.5 px-4">Assigned Location</th>
                  <th className="py-3.5 px-4">SR / SSR Partner</th>
                  <th className="py-3.5 px-4 text-center">Submissions</th>
                  <th className="py-3.5 px-4">Onboarded / Last Active</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-700" />
                      Loading field workers in {displayState}…
                    </td>
                  </tr>
                ) : filteredWorkers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 space-y-2">
                      <Users className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="font-semibold text-slate-700">No field workers found</p>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        {searchTerm || districtFilter !== 'ALL'
                          ? 'No caseworkers match the active search and filter criteria.'
                          : `No field workers have registered in ${displayState} yet. Send team invitation codes to onboard local caseworkers.`}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredWorkers.map((worker) => (
                    <tr key={worker.id} className="hover:bg-teal-50/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 text-sm">{worker.name}</div>
                        <div className="text-slate-500 font-mono text-[11px] flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{worker.email || 'Direct sync submitter'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-teal-600" />
                          <span>{worker.assignedDistrict || 'All Districts'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">{worker.assignedState}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800 font-medium">{worker.srName || '—'}</div>
                        <div className="text-[11px] text-slate-500">{worker.ssrName || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800">
                          {worker.totalSubmissions}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {worker.lastSubmittedAt ? (
                          <div>
                            <div className="font-medium text-slate-700">
                              {new Date(worker.lastSubmittedAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            <div className="text-[10px] text-slate-400">Last survey submitted</div>
                          </div>
                        ) : worker.onboardedAt ? (
                          <div>
                            <div className="text-slate-600">
                              {new Date(worker.onboardedAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            <div className="text-[10px] text-slate-400">Onboarded</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            router.push(
                              `/supervisor/assessments?worker=${encodeURIComponent(worker.name)}`
                            );
                          }}
                          className="text-xs text-teal-700 hover:text-teal-900 hover:bg-teal-50 cursor-pointer"
                        >
                          View Surveys
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
