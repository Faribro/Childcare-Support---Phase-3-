'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  Eye,
  FileWarning,
  MapPin,
  School,
  ShieldCheck,
  Info,
  X,
} from 'lucide-react';
import { triggerHaptic } from '@/hooks/useMobileTouch';

export interface EvaluationBeneficiaryRow {
  id: string;
  displayCode?: string;
  childName: string;
  workerName: string;
  ageText: string;
  sexText: string;
  district: string;
  state: string;
  schoolType: string;
  orphanStatus: string;
  grantAmountInr: number;
  docsStatus: 'intake_pending' | 'bank_pending' | 'complete';
  missingDocs: string[];
  missingReasons?: string[];
  approvalStatus: 'pending' | 'approved' | 'rejected';
  viralLoadText?: string;
  vlCategory?: string;
  hbText?: string;
  hbCategory?: string;
  bmiCategory?: string;
}

interface EvaluationLinelistTableProps {
  rows: EvaluationBeneficiaryRow[];
  isLoading?: boolean;
  canApprove?: boolean;
  onOpenApprovalModal: (row: EvaluationBeneficiaryRow) => void;
  onViewRecord: (row: EvaluationBeneficiaryRow) => void;
  onInspectDocs?: (row: EvaluationBeneficiaryRow) => void;
}

const DOC_BADGE_MAP = {
  intake_pending: {
    label: 'Intake Pending',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    railColor: 'bg-amber-400',
  },
  bank_pending: {
    label: 'Bank Pending',
    className: 'bg-sky-50 text-[#093282] border-sky-200',
    railColor: 'bg-[#1E6EEB]',
  },
  complete: {
    label: 'Docs Complete',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    railColor: 'bg-emerald-500',
  },
} as const;

export function EvaluationLinelistTable({
  rows,
  isLoading = false,
  canApprove = true,
  onOpenApprovalModal,
  onViewRecord,
  onInspectDocs,
}: EvaluationLinelistTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openInfoRowId, setOpenInfoRowId] = useState<string | null>(null);
  const openPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openInfoRowId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenInfoRowId(null);
      }
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (openPopoverRef.current && !openPopoverRef.current.contains(e.target as Node)) {
        setOpenInfoRowId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [openInfoRowId]);

  const getPendingReasonsList = (row: EvaluationBeneficiaryRow): string[] => {
    const items: string[] = [];
    for (const d of row.missingDocs || []) {
      if (d && !items.includes(d)) items.push(d);
    }
    for (const r of row.missingReasons || []) {
      if (r && !items.includes(r)) items.push(r);
    }
    if (items.length === 0) {
      if (row.docsStatus === 'bank_pending') {
        items.push('Bank account or passbook proof pending');
      } else if (row.docsStatus === 'intake_pending') {
        items.push('Required intake details or document verification pending');
      }
    }
    return items;
  };

  const handleCopyId = (fullId: string) => {
    navigator.clipboard?.writeText(fullId).catch(() => {});
    triggerHaptic('light');
    setCopiedId(fullId);
    window.setTimeout(() => setCopiedId((prev) => (prev === fullId ? null : prev)), 1600);
  };

  const formatShortId = (row: EvaluationBeneficiaryRow) =>
    row.displayCode || `#${row.id.slice(0, 8).toUpperCase()}`;

  if (isLoading && rows.length === 0) {
    return (
      <>
        <div
          className="hidden lg:block overflow-hidden rounded-3xl border border-sky-100/90 bg-white shadow-[0_14px_34px_-14px_rgba(7,43,124,0.12)]"
          aria-busy="true"
          aria-label="Loading beneficiary linelist"
        >
          <div className="border-b border-sky-100 bg-[#F4F8FF] px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">
            Loading Beneficiary Records…
          </div>
          <div className="divide-y divide-slate-100 p-2 animate-pulse">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="grid grid-cols-8 gap-3 px-3 py-3.5 items-center">
                <div className="h-6 w-20 rounded-lg bg-sky-50" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-28 rounded bg-slate-200" />
                  <div className="h-2.5 w-20 rounded bg-slate-100" />
                </div>
                <div className="h-3.5 w-14 rounded bg-slate-100" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 rounded bg-slate-200" />
                  <div className="h-2.5 w-16 rounded bg-slate-100" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 rounded bg-slate-200" />
                  <div className="h-2.5 w-20 rounded bg-slate-100" />
                </div>
                <div className="h-4 w-14 ml-auto rounded bg-slate-200" />
                <div className="h-6 w-24 rounded-full bg-amber-50" />
                <div className="flex justify-end gap-1.5">
                  <div className="h-8 w-8 rounded-full bg-slate-100" />
                  <div className="h-8 w-20 rounded-full bg-purple-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden animate-pulse" aria-busy="true">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-sky-100 bg-white p-4 space-y-3">
              <div className="flex justify-between">
                <div className="space-y-1.5">
                  <div className="h-5 w-20 rounded bg-sky-50" />
                  <div className="h-4 w-32 rounded bg-slate-200" />
                </div>
                <div className="h-5 w-20 rounded-full bg-amber-50" />
              </div>
              <div className="h-16 rounded-xl bg-slate-50" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-11 rounded-full bg-slate-100" />
                <div className="h-11 rounded-full bg-purple-100" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-sky-100 bg-white p-10 text-center shadow-xs">
        <p className="text-[15px] font-bold text-slate-800">No children match the current filters</p>
        <p className="mt-1 text-[13px] text-slate-500">
          Try clearing the search bar or switching filter chips above.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ─── DESKTOP TABLE (Zero Horizontal Overflow — Viral Load & HB Removed) ─── */}
      <div className="hidden lg:block rounded-3xl border border-sky-100/90 bg-white shadow-[0_14px_34px_-14px_rgba(7,43,124,0.12)]">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-sky-100 bg-[#F4F8FF] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
              <th className="w-[13%] rounded-tl-3xl py-3.5 pl-5 pr-2">Ref ID</th>
              <th className="w-[17%] px-2 py-3.5">Child &amp; Worker</th>
              <th className="w-[9%] px-2 py-3.5">Age / Sex</th>
              <th className="w-[14%] px-2 py-3.5">Location</th>
              <th className="w-[15%] px-2 py-3.5">School &amp; Orphan</th>
              <th className="w-[8%] px-2 py-3.5 text-right">Grant</th>
              <th className="w-[12%] px-2 py-3.5">Docs Status</th>
              <th className="w-[12%] rounded-tr-3xl py-3.5 pl-2 pr-5 text-right">Approval</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-[13px]">
            {rows.map((row, rowIdx) => {
              const docMeta = DOC_BADGE_MAP[row.docsStatus] || DOC_BADGE_MAP.intake_pending;
              const isApproved = row.approvalStatus === 'approved';
              const shortId = formatShortId(row);
              const openPopoverUpward = rows.length > 2 && rowIdx >= rows.length - 2;

              return (
                <tr
                  key={row.id}
                  className="group relative bg-white hover:bg-sky-50/45 transition-colors"
                >
                  {/* Ref ID with left semantic status rail & 1-click copy */}
                  <td className="relative py-3.5 pl-5 pr-2 align-middle">
                    <span
                      className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${
                        isApproved ? 'bg-emerald-500' : docMeta.railColor
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyId(row.id)}
                      title={`Copy full ID: ${row.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50/90 px-2 py-1 font-mono text-[11.5px] font-bold text-[#093282] border border-sky-100 hover:bg-sky-100 transition-colors cursor-pointer"
                    >
                      <span>{shortId}</span>
                      {copiedId === row.id ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-400 group-hover:text-[#155AD1]" />
                      )}
                    </button>
                  </td>

                  {/* Child Name & Caseworker */}
                  <td className="px-2 py-3.5 align-middle">
                    <div className="font-bold text-slate-900 truncate">{row.childName}</div>
                    <div className="text-[11.5px] text-slate-500 truncate">{row.workerName}</div>
                  </td>

                  {/* Age / Sex */}
                  <td className="px-2 py-3.5 align-middle text-slate-700 font-medium">
                    {row.ageText || '—'} · {row.sexText || '—'}
                  </td>

                  {/* Location */}
                  <td className="px-2 py-3.5 align-middle">
                    <div className="font-semibold text-slate-800 truncate">{row.district}</div>
                    <div className="text-[11.5px] text-slate-500 truncate">{row.state}</div>
                  </td>

                  {/* School & Orphan */}
                  <td className="px-2 py-3.5 align-middle">
                    <div className="font-medium text-slate-800 truncate">{row.schoolType}</div>
                    <div className="text-[11.5px] text-slate-500 truncate">{row.orphanStatus}</div>
                  </td>

                  {/* Grant */}
                  <td className="px-2 py-3.5 align-middle text-right font-mono font-bold text-slate-900 tabular-nums">
                    ₹{row.grantAmountInr.toLocaleString('en-IN')}
                  </td>

                  {/* Docs Status + Missing Popover */}
                  <td className="px-2 py-3.5 align-middle">
                    {(() => {
                      const pendingItems = getPendingReasonsList(row);
                      const hasDetails = row.docsStatus !== 'complete' || pendingItems.length > 0;
                      const isInfoOpen = openInfoRowId === row.id;

                      return (
                        <div className="relative inline-flex items-center gap-1">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${docMeta.className}`}
                          >
                            {docMeta.label}
                          </span>
                          {hasDetails && (
                            <div
                              className="relative"
                              ref={isInfoOpen ? openPopoverRef : undefined}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerHaptic('light');
                                  setOpenInfoRowId((prev) => (prev === row.id ? null : row.id));
                                }}
                                aria-label={`View missing items for ${row.childName}`}
                                aria-expanded={isInfoOpen}
                                aria-haspopup="dialog"
                                className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors cursor-pointer ${
                                  isInfoOpen
                                    ? 'bg-sky-100 text-[#155AD1]'
                                    : 'text-slate-400 hover:bg-sky-50 hover:text-[#155AD1]'
                                }`}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>

                              {isInfoOpen && (
                                <div
                                  role="dialog"
                                  aria-label={`${docMeta.label} details for ${row.childName}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`absolute right-0 ${
                                    openPopoverUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                                  } z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-sky-200 bg-white p-3.5 text-left shadow-xl animate-in fade-in zoom-in-95 duration-100`}
                                >
                                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                                    <div>
                                      <p className="text-xs font-bold text-slate-900">{docMeta.label}</p>
                                      <p className="text-[11px] text-slate-500 truncate">{row.childName}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setOpenInfoRowId(null)}
                                      aria-label="Close details"
                                      className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  <ul className="mt-2 space-y-1">
                                    {pendingItems.map((item, idx) => (
                                      <li
                                        key={idx}
                                        className="flex items-center gap-1.5 rounded-lg bg-amber-50/70 px-2 py-1 text-[11px] font-medium text-amber-950 border border-amber-200/70"
                                      >
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>

                                  {onInspectDocs && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenInfoRowId(null);
                                        onInspectDocs(row);
                                      }}
                                      className="mt-2.5 w-full rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1.5 text-[11px] font-bold text-[#093282] transition-colors cursor-pointer"
                                    >
                                      View Documents &amp; Previews
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Deliberate Approval + Record View */}
                  <td className="py-3.5 pl-2 pr-5 align-middle text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onViewRecord(row);
                        }}
                        aria-label={`View record for ${row.childName}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-[#155AD1] transition-colors cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>

                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approved
                        </span>
                      ) : canApprove ? (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('medium');
                            onOpenApprovalModal(row);
                          }}
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-extrabold text-white shadow-xs transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                          style={{
                            background:
                              'linear-gradient(110deg, #6D28D9 0%, #A21CAF 58%, #BE185D 100%)',
                          }}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Approve
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11.5px] font-bold text-slate-600"
                          title="Evaluation access is read-only. Approval is managed by central administration."
                        >
                          Pending Review
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── MOBILE & TABLET CARD STACK (< lg) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
        {rows.map((row) => {
          const docMeta = DOC_BADGE_MAP[row.docsStatus] || DOC_BADGE_MAP.intake_pending;
          const isApproved = row.approvalStatus === 'approved';
          return (
            <article
              key={row.id}
              className="relative overflow-hidden rounded-2xl border border-sky-100 bg-white p-4 shadow-xs"
            >
              <span
                className={`absolute left-0 top-0 bottom-0 w-1 ${
                  isApproved ? 'bg-emerald-500' : docMeta.railColor
                }`}
              />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-block rounded-md bg-sky-50 px-2 py-0.5 font-mono text-[11px] font-bold text-[#093282]">
                    {formatShortId(row)}
                  </span>
                  <h3 className="mt-1 text-[15px] font-extrabold text-slate-900">
                    {row.childName}
                  </h3>
                  <p className="text-[12px] text-slate-500">{row.workerName}</p>
                </div>

                <div className="inline-flex items-center gap-1 shrink-0">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${docMeta.className}`}
                  >
                    {docMeta.label}
                  </span>
                  {(row.docsStatus !== 'complete' || (row.missingDocs && row.missingDocs.length > 0)) && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        if (onInspectDocs) {
                          onInspectDocs(row);
                        } else {
                          setOpenInfoRowId((prev) => (prev === row.id ? null : row.id));
                        }
                      }}
                      aria-label={`View missing items for ${row.childName}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-sky-50 hover:text-[#155AD1] cursor-pointer"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {openInfoRowId === row.id && (
                <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50/50 p-2.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800 mb-1">
                    <span>{docMeta.label} — Missing Items</span>
                    <button
                      type="button"
                      onClick={() => setOpenInfoRowId(null)}
                      aria-label="Close details"
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ul className="space-y-1 text-[11px] text-amber-950">
                    {getPendingReasonsList(row).map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50/80 p-2.5 text-[12px] text-slate-600">
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#155AD1]" />
                  <span className="truncate">
                    {row.district}, {row.state}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <School className="h-3.5 w-3.5 shrink-0 text-[#155AD1]" />
                  <span className="truncate">{row.schoolType}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FileWarning className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>{row.missingDocs ? row.missingDocs.length : 0} docs missing</span>
                </div>
                <div className="text-right font-mono font-bold text-slate-900">
                  Grant: ₹{row.grantAmountInr.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onViewRecord(row)}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white text-[13px] font-bold text-slate-700 active:scale-95 transition-transform cursor-pointer"
                >
                  <Eye className="h-4 w-4" />
                  View Record
                </button>

                {isApproved ? (
                  <div className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[13px] font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Approved
                  </div>
                ) : canApprove ? (
                  <button
                    type="button"
                    onClick={() => onOpenApprovalModal(row)}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full text-[13px] font-extrabold text-white active:scale-95 transition-transform cursor-pointer"
                    style={{
                      background: 'linear-gradient(110deg, #6D28D9 0%, #A21CAF 58%, #BE185D 100%)',
                    }}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Approve
                  </button>
                ) : (
                  <div className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 text-[13px] font-bold text-slate-600 text-center">
                    Pending Review
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
export default EvaluationLinelistTable;
