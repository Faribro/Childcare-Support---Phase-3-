'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { PhotoUpload } from '@/components/ui/PhotoUpload';
import { Input } from '@/components/ui/Input';
import {
  GraduationCap,
  Clock,
  FileText,
  Copy,
} from 'lucide-react';

export interface ExpenseItem {
  id: string;
  label: string;
  frequency: string;
  frequencyType: 'monthly' | 'bi-annual' | 'annual' | 'need-based';
  criteria: string;
  currentCost: number;
  requiredSupport: number;
  placeholder: string;
}

interface ExpensesAndApprovalGridProps {
  currentExpenses: {
    schoolFees: number;
    tuitionFees: number;
    books: number;
    stationery: number;
    uniform: number;
    transport: number;
    otherExpenses: number;
    feeReceiptPhotoUrl?: string;
    marksheetPhotoUrl?: string;
    remarks?: string;
  };
  requiredSupport: {
    requiredSchoolFees: number;
    requiredTuitionFees?: number;
    requiredBooks: number;
    requiredStationery: number;
    requiredUniform: number;
    requiredTransport: number;
    requiredOtherSupport: number;
  };
  onCurrentExpenseChange: (field: string, value: number) => void;
  onRequiredSupportChange: (field: string, value: number) => void;
  onReceiptPhotoChange?: (dataUrl?: string) => void;
  onMarksheetPhotoChange?: (dataUrl?: string) => void;
  onRemarksChange?: (remarks: string) => void;
  isReadOnly?: boolean;
  errors?: Record<string, string>;
}

// ─── Expense row descriptor (static metadata) ───────────────────────────────
interface ExpenseRowMeta {
  key: string;
  reqKey: string;
  label: string;
  frequency: string;
  frequencyType: 'monthly' | 'bi-annual' | 'annual' | 'need-based';
  criteria: string;
}

const EXPENSE_ROWS: ExpenseRowMeta[] = [
  {
    key: 'schoolFees',
    reqKey: 'requiredSchoolFees',
    label: 'School Fees',
    frequency: 'Annual / Session',
    frequencyType: 'annual',
    criteria: 'Standard tuition/admission fee per government/aided fee schedule. Verified via fee receipt.',
  },
  {
    key: 'tuitionFees',
    reqKey: 'requiredTuitionFees',
    label: 'Private Tuition Fee',
    frequency: 'Monthly (Recurring)',
    frequencyType: 'monthly',
    criteria: 'Remedial academic coaching for children needing learning catch-up or board preparation.',
  },
  {
    key: 'books',
    reqKey: 'requiredBooks',
    label: 'Books & Syllabi',
    frequency: 'Annual / Session Start',
    frequencyType: 'annual',
    criteria: 'Prescribed NCERT/State Board syllabus textbook set for current grade.',
  },
  {
    key: 'stationery',
    reqKey: 'requiredStationery',
    label: 'Stationery (Pen/Paper/Geometry Box)',
    frequency: 'Twice a year (Bi-annual)',
    frequencyType: 'bi-annual',
    criteria: 'Disbursed twice in the year: Semester 1 (June/July) & Semester 2 (Nov/Dec) covering notebooks & instruments.',
  },
  {
    key: 'uniform',
    reqKey: 'requiredUniform',
    label: 'School Uniform',
    frequency: 'Annual (1–2 Sets)',
    frequencyType: 'annual',
    criteria: '2 sets of prescribed uniform plus appropriate seasonal wear/footwear.',
  },
  {
    key: 'transport',
    reqKey: 'requiredTransport',
    label: 'School Transport',
    frequency: 'Monthly (Commute)',
    frequencyType: 'monthly',
    criteria: 'Approved for children residing > 2 km from school (shared auto/bus fare).',
  },
  {
    key: 'otherExpenses',
    reqKey: 'requiredOtherSupport',
    label: 'Other Educational Expenses',
    frequency: 'Need-based / One-time',
    frequencyType: 'need-based',
    criteria: 'Special project materials, board examination fees, or vocational supplies with written remarks.',
  },
];

// ─── Badge colour per frequency type ────────────────────────────────────────
function getBadgeStyle(type: string): string {
  switch (type) {
    case 'monthly':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'bi-annual':
      return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'annual':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

// ─── Controlled number input with validation display ─────────────────────────
function CostInput({
  id,
  value,
  onChange,
  error,
  disabled = false,
  accent = false,
  'aria-label': ariaLabel,
}: {
  id: string;
  value: number;
  onChange: (val: number) => void;
  error?: string;
  disabled?: boolean;
  accent?: boolean;
  'aria-label'?: string;
}) {
  return (
    <div>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold pointer-events-none select-none">
          ₹
        </span>
        <input
          id={id}
          type="number"
          min="0"
          inputMode="numeric"
          value={value === 0 ? '' : value}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            const val = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
            onChange(val);
          }}
          className={[
            'w-full pl-7 pr-2.5 py-2.5 min-h-[44px] rounded-xl text-xs font-mono font-semibold transition-colors focus:outline-none focus:ring-2',
            accent
              ? 'text-purple-950 bg-purple-50/60 focus:bg-white border border-purple-300 focus:ring-purple-400 focus:border-purple-600'
              : 'text-slate-900 bg-white border border-slate-300 focus:ring-purple-400 focus:border-purple-600',
            error ? 'border-rose-400 ring-2 ring-rose-200 focus:ring-rose-200 focus:border-rose-500' : '',
            disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[10px] text-rose-600 font-semibold mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function ExpensesAndApprovalGrid({
  currentExpenses,
  requiredSupport,
  onCurrentExpenseChange,
  onRequiredSupportChange,
  onReceiptPhotoChange,
  onMarksheetPhotoChange,
  onRemarksChange,
  isReadOnly = false,
  errors = {},
}: ExpensesAndApprovalGridProps) {
  /**
   * Per-row "Current cost = required cost" checkbox state.
   * Key: expense row key (e.g. "schoolFees").
   * Value: true when checked — the required field mirrors current cost.
   *
   * Behavior:
   * - Checking copies currentCost → requiredCost immediately.
   * - If currentCost subsequently changes while checked, requiredCost
   *   updates in sync (least surprising — user opted in to mirroring).
   * - Unchecking breaks the link; user can edit requiredCost freely.
   * - State lives only in this component; it is NOT persisted to
   *   IndexedDB or submitted to the server (it is a UX convenience,
   *   not a data field — the actual requiredCost values ARE persisted).
   */
  const [sameCostRows, setSameCostRows] = useState<Record<string, boolean>>({});

  // Build a stable lookup of current values for quick access (useMemo to avoid stale refs in useCallback)
  const currentMap = useMemo<Record<string, number>>(
    () => ({
      schoolFees: currentExpenses.schoolFees,
      tuitionFees: currentExpenses.tuitionFees,
      books: currentExpenses.books,
      stationery: currentExpenses.stationery,
      uniform: currentExpenses.uniform,
      transport: currentExpenses.transport,
      otherExpenses: currentExpenses.otherExpenses,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      currentExpenses.schoolFees,
      currentExpenses.tuitionFees,
      currentExpenses.books,
      currentExpenses.stationery,
      currentExpenses.uniform,
      currentExpenses.transport,
      currentExpenses.otherExpenses,
    ]
  );

  const requiredMap: Record<string, number> = {
    requiredSchoolFees: requiredSupport.requiredSchoolFees,
    requiredTuitionFees: requiredSupport.requiredTuitionFees ?? 0,
    requiredBooks: requiredSupport.requiredBooks,
    requiredStationery: requiredSupport.requiredStationery,
    requiredUniform: requiredSupport.requiredUniform,
    requiredTransport: requiredSupport.requiredTransport,
    requiredOtherSupport: requiredSupport.requiredOtherSupport,
  };

  const handleSameCostToggle = useCallback(
    (rowKey: string, reqKey: string, checked: boolean) => {
      setSameCostRows((prev) => ({ ...prev, [rowKey]: checked }));
      if (checked) {
        // Copy current cost → required cost immediately
        onRequiredSupportChange(reqKey, currentMap[rowKey] ?? 0);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentMap, onRequiredSupportChange]
  );

  const handleCurrentChange = useCallback(
    (rowKey: string, reqKey: string, val: number) => {
      onCurrentExpenseChange(rowKey, val);
      // If mirror is active, propagate to required as well
      if (sameCostRows[rowKey]) {
        onRequiredSupportChange(reqKey, val);
      }
    },
    [sameCostRows, onCurrentExpenseChange, onRequiredSupportChange]
  );

  const totalCurrentCost = EXPENSE_ROWS.reduce(
    (sum, r) => sum + (Number(currentMap[r.key]) || 0),
    0
  );
  const totalRequired = EXPENSE_ROWS.reduce(
    (sum, r) => sum + (Number(requiredMap[r.reqKey]) || 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* Programmatic Approval Guidelines Banner */}
      <div className="p-3.5 bg-purple-50/60 border border-purple-200/90 rounded-xl text-xs space-y-1.5 shadow-2xs">
        <div className="flex items-center space-x-2 text-purple-950 font-bold">
          <GraduationCap className="h-4 w-4 text-purple-700 shrink-0" />
          <span>Educational Support Approval & Disbursement Guidelines</span>
        </div>
        <p className="text-slate-600 leading-relaxed text-[11.5px]">
          Each line item must be validated against programme schedules:
          <span className="font-semibold text-purple-900"> Stationery is approved twice in the year</span> (Semester 1 &
          2),
          <span className="font-semibold text-amber-900"> Transport and Private Tuition are approved monthly</span>, and
          <span className="font-semibold text-purple-900"> School Fees, Books & Uniform are approved annually</span>.
        </p>
      </div>

      {/* ── Desktop Table (≥768px) ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black overflow-hidden shadow-xs">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-900">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4 w-[24%]">Expense Category</th>
                <th className="py-3 px-4 w-[18%]">Frequency Schedule</th>
                <th className="py-3 px-4 w-[26%]">Programme Approval Criteria</th>
                <th className="py-3 px-4 w-[13%] text-right">Current Cost (₹)</th>
                <th className="py-3 px-4 w-[7%] text-center">Same?</th>
                <th className="py-3 px-4 w-[12%] text-right">Required (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {EXPENSE_ROWS.map((item) => {
                const currentVal = currentMap[item.key] ?? 0;
                const requiredVal = requiredMap[item.reqKey] ?? 0;
                const isMirrored = sameCostRows[item.key] ?? false;
                const rowError =
                  errors[item.key] ||
                  errors[`educationExpenses.${item.key}`] ||
                  errors[`expenses-${item.key}`] ||
                  (item.key === 'schoolFees' ? errors['school-fees-current-cost'] : undefined);
                const inputId =
                  item.key === 'schoolFees' ? 'school-fees-current-cost' : `expenses-${item.key}`;

                return (
                  <tr key={item.key} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block leading-snug">{item.label}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getBadgeStyle(item.frequencyType)}`}
                      >
                        <Clock className="h-3 w-3 mr-1 opacity-70 shrink-0" />
                        {item.frequency}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 leading-relaxed text-[11px]">{item.criteria}</td>
                    <td className="py-3.5 px-4 text-right">
                      {isReadOnly ? (
                        <span className="font-mono font-bold text-slate-800">
                          ₹{currentVal.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <CostInput
                          id={inputId}
                          value={currentVal}
                          onChange={(val) => handleCurrentChange(item.key, item.reqKey, val)}
                          error={rowError}
                          aria-label={`Current cost for ${item.label}`}
                        />
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {!isReadOnly && (
                        <label
                          className="inline-flex flex-col items-center gap-0.5 cursor-pointer select-none"
                          title="Current cost is same as required cost"
                        >
                          <input
                            type="checkbox"
                            checked={isMirrored}
                            onChange={(e) => handleSameCostToggle(item.key, item.reqKey, e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                            aria-label={`Current cost is same as required cost for ${item.label}`}
                          />
                          <Copy className="w-2.5 h-2.5 text-slate-400" aria-hidden />
                        </label>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isReadOnly ? (
                        <span className="font-mono font-bold text-purple-950">
                          ₹{requiredVal.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <CostInput
                          id={`req-${item.reqKey}`}
                          value={requiredVal}
                          onChange={(val) => {
                            // Unlink mirror if user manually edits required
                            if (sameCostRows[item.key]) {
                              setSameCostRows((prev) => ({ ...prev, [item.key]: false }));
                            }
                            onRequiredSupportChange(item.reqKey, val);
                          }}
                          disabled={isMirrored}
                          accent
                          aria-label={`Required cost for ${item.label}${isMirrored ? ' (mirroring current cost)' : ''}`}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals Footer */}
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
              <tr>
                <td colSpan={3} className="py-3.5 px-4 text-slate-800 uppercase tracking-wider text-[11px]">
                  Total Annual Education Financial Summary
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-900">
                  ₹{totalCurrentCost.toLocaleString('en-IN')}
                </td>
                <td className="py-3.5 px-4" />
                <td className="py-3.5 px-4 text-right font-mono text-purple-950 text-sm">
                  ₹{totalRequired.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Mobile Cards (<768px) ─────────────────────────────────────── */}
        <div className="md:hidden divide-y divide-slate-100">
          {EXPENSE_ROWS.map((item) => {
            const currentVal = currentMap[item.key] ?? 0;
            const requiredVal = requiredMap[item.reqKey] ?? 0;
            const isMirrored = sameCostRows[item.key] ?? false;
            const rowError =
              errors[item.key] ||
              errors[`educationExpenses.${item.key}`] ||
              errors[`expenses-${item.key}`] ||
              (item.key === 'schoolFees' ? errors['school-fees-current-cost'] : undefined);
            const inputId = `mobile-expenses-${item.key}`;

            return (
              <div key={item.key} className="p-4 space-y-3">
                {/* Row header: label + frequency badge */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-sm leading-snug break-words">{item.label}</h4>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getBadgeStyle(item.frequencyType)}`}
                  >
                    <Clock className="h-2.5 w-2.5 mr-1 shrink-0" />
                    {item.frequency}
                  </span>
                </div>

                {/* Approval criteria */}
                <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100 break-words">
                  <span className="font-bold text-slate-700">Approval rule: </span>
                  {item.criteria}
                </p>

                {/* Current cost field */}
                <div className="space-y-1">
                  <label htmlFor={inputId} className="text-[10px] uppercase font-bold text-slate-500 block">
                    Current Cost (₹)
                  </label>
                  {isReadOnly ? (
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      ₹{currentVal.toLocaleString('en-IN')}
                    </span>
                  ) : (
                    <CostInput
                      id={inputId}
                      value={currentVal}
                      onChange={(val) => handleCurrentChange(item.key, item.reqKey, val)}
                      error={rowError}
                      aria-label={`Current cost for ${item.label}`}
                    />
                  )}
                </div>

                {/* "Same as required" checkbox */}
                {!isReadOnly && (
                  <label className="flex items-center gap-2.5 cursor-pointer select-none group min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={isMirrored}
                      onChange={(e) => handleSameCostToggle(item.key, item.reqKey, e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                      aria-label={`Current cost is same as required cost for ${item.label}`}
                    />
                    <span className="text-xs text-slate-600 group-hover:text-slate-900 flex items-center gap-1.5 leading-tight">
                      <Copy className="w-3 h-3 text-slate-400 shrink-0" aria-hidden />
                      Current cost is same as required cost
                    </span>
                  </label>
                )}

                {/* Required cost field */}
                <div className="space-y-1">
                  <label
                    htmlFor={`mobile-req-${item.reqKey}`}
                    className="text-[10px] uppercase font-bold text-purple-800 block"
                  >
                    Required Grant (₹)
                    {isMirrored && (
                      <span className="ml-1.5 text-[9px] normal-case font-medium text-purple-500">(auto-filled)</span>
                    )}
                  </label>
                  {isReadOnly ? (
                    <span className="font-mono font-bold text-purple-950 text-sm">
                      ₹{requiredVal.toLocaleString('en-IN')}
                    </span>
                  ) : (
                    <CostInput
                      id={`mobile-req-${item.reqKey}`}
                      value={requiredVal}
                      onChange={(val) => {
                        if (sameCostRows[item.key]) {
                          setSameCostRows((prev) => ({ ...prev, [item.key]: false }));
                        }
                        onRequiredSupportChange(item.reqKey, val);
                      }}
                      disabled={isMirrored}
                      accent
                      aria-label={`Required cost for ${item.label}${isMirrored ? ' (mirroring current cost)' : ''}`}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Mobile Totals Summary — both current and required */}
          <div className="p-4 bg-slate-50 border-t-2 border-slate-200 space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Total Annual Education Financial Summary
            </p>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-500 font-semibold">Current Cost</p>
                <p className="font-mono font-bold text-slate-900 text-base">
                  ₹{totalCurrentCost.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="text-slate-300 text-lg font-light select-none">→</div>
              <div className="space-y-0.5 text-right">
                <p className="text-[10px] text-purple-700 font-semibold">Required Grant</p>
                <p className="font-mono font-bold text-purple-950 text-base">
                  ₹{totalRequired.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Document Verification & Photo Uploads */}
      {!isReadOnly && (
        <div className="bg-white rounded-2xl border border-black p-5 space-y-4 shadow-xs">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm pb-2 border-b border-slate-100">
            <FileText className="h-4 w-4 text-purple-700" />
            <span>Document Verification Proofs</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <PhotoUpload
                id="expenses-feeReceiptPhotoUrl"
                label="SCHOOL FEE RECEIPT (PHOTO)"
                helperText="Clear photo of the fee receipt. All text must be readable (< 10MB)."
                value={currentExpenses.feeReceiptPhotoUrl}
                onChange={onReceiptPhotoChange}
                error={errors['expenses-feeReceiptPhotoUrl'] || errors['educationExpenses.feeReceiptPhotoUrl']}
              />
            </div>

            <div className="space-y-1">
              <PhotoUpload
                id="expenses-marksheetPhotoUrl"
                label="PREVIOUS YEAR MARKSHEET (PHOTO)"
                helperText="Photo of last year's report card. Click here to upload file (< 10MB)."
                value={currentExpenses.marksheetPhotoUrl}
                onChange={onMarksheetPhotoChange}
                error={errors['expenses-marksheetPhotoUrl'] || errors['educationExpenses.marksheetPhotoUrl']}
              />
            </div>
          </div>

          <Input
            label="REMARKS (IF ANY)"
            helperText="Reason for documents not available, etc"
            value={currentExpenses.remarks || ''}
            onChange={(e) => onRemarksChange && onRemarksChange(e.target.value)}
            placeholder="e.g. Marksheet pending from school administration office"
          />
        </div>
      )}
    </div>
  );
}
