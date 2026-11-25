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
          <Loader2 className="w-8 h-8 text-[#155AD1] animate-spin mx-auto mb-4" />
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
              className="w-full bg-[#155AD1] hover:bg-[#093282] text-white rounded-full text-xs py-3 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-xs"
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
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 pt-2 pb-6 sm:pt-3 sm:pb-8 sm:px-6 lg:px-8 space-y-5">
        <SupervisorTabNav
          rightAction={
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchFieldWorkers}
              disabled={isLoading}
              className="h-9 px-3.5 text-xs font-semibold text-[#093282] bg-sky-50/80 hover:bg-sky-100 border border-sky-200 rounded-full gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#155AD1] ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          }
        />

        {/* State Reviewer Header & KPI Summary (Authority Cosmic Royal Blue) */}
        <div
          className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-[0_16px_36px_-12px_rgba(7,43,124,0.35)] space-y-6"
          style={{
            background: 'linear-gradient(135deg, #07225E 0%, #0F3E9E 58%, #1E5CC7 100%)',
          }}
        >
          {/* Subtle Star Sparkles Overlay */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: `radial-gradient(1.5px 1.5px at 20px 30px, #ffffff, transparent),
                                radial-gradient(1px 1px at 80px 60px, rgba(255,255,255,0.7), transparent),
                                radial-gradient(1.5px 1.5px at 160px 25px, #ffffff, transparent),
                                radial-gradient(1px 1px at 240px 75px, rgba(255,255,255,0.6), transparent),
                                radial-gradient(2px 2px at 340px 40px, rgba(255,255,255,0.9), transparent),
                                radial-gradient(1px 1px at 450px 85px, rgba(255,255,255,0.7), transparent),
                                radial-gradient(1.5px 1.5px at 560px 30px, #ffffff, transparent),
                                radial-gradient(1px 1px at 700px 65px, rgba(255,255,255,0.8), transparent)`,
              backgroundRepeat: 'repeat',
              backgroundSize: '400px 100px',
            }}
          />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 border border-white/20 rounded-full text-xs font-semibold text-sky-100 mb-2 backdrop-blur-xs">
                <MapPin className="w-3.5 h-3.5 text-sky-200" />
                <span>State Scope: {displayState}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Field Workers Directory
              </h1>
              <p className="text-xs sm:text-sm text-sky-100/90 mt-1 max-w-2xl">
                Active caseworkers collecting child nutrition assessments in {displayState}. View onboarded staff, assigned districts, SR/SSR partnerships, and survey submission volume.
              </p>
            </div>
            <div className="relative z-10 flex items-center gap-2 self-start sm:self-auto">
              <Button
                onClick={() => router.push('/supervisor/assessments')}
                className="bg-white/16 hover:bg-white/24 text-white border border-white/25 text-xs px-4 py-2.5 rounded-full font-semibold shadow-xs flex items-center gap-2 cursor-pointer transition-all backdrop-blur-xs"
              >
                <FileText className="w-4 h-4" />
                <span>View State Assessments</span>
              </Button>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-white/12 backdrop-blur-xs rounded-2xl p-4 border border-white/20">
              <div className="text-sky-200 text-xs font-semibold">Field Workers Active</div>
              <div className="text-2xl font-extrabold text-white mt-1">{workers.length}</div>
            </div>
            <div className="bg-white/12 backdrop-blur-xs rounded-2xl p-4 border border-white/20">
              <div className="text-sky-200 text-xs font-semibold">Total State Submissions</div>
              <div className="text-2xl font-extrabold text-white mt-1">{totalSubmissionsInState}</div>
            </div>
            <div className="bg-white/12 backdrop-blur-xs rounded-2xl p-4 border border-white/20">
              <div className="text-sky-200 text-xs font-semibold">Districts Covered</div>
              <div className="text-2xl font-extrabold text-white mt-1">{uniqueDistricts.length}</div>
            </div>
            <div className="bg-white/12 backdrop-blur-xs rounded-2xl p-4 border border-white/20">
              <div className="text-sky-200 text-xs font-semibold">Avg Surveys / Worker</div>
              <div className="text-2xl font-extrabold text-white mt-1">
                {workers.length > 0 ? (totalSubmissionsInState / workers.length).toFixed(1) : '0'}
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="bg-white rounded-3xl border border-sky-100/90 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by worker name, email, district, SR/SSR…"
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#155AD1] transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#155AD1] cursor-pointer"
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
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#155AD1]" />
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
                    <tr key={worker.id} className="hover:bg-sky-50/45 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 text-sm">{worker.name}</div>
                        <div className="text-slate-500 font-mono text-[11px] flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{worker.email || 'Direct sync submitter'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[#155AD1]" />
                          <span>{worker.assignedDistrict || 'All Districts'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">{worker.assignedState}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800 font-medium">{worker.srName || '—'}</div>
                        <div className="text-[11px] text-slate-500">{worker.ssrName || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-[#093282] border border-sky-200">
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
                          className="text-xs text-[#155AD1] hover:text-[#093282] hover:bg-sky-50 cursor-pointer"
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
