'use client';

import React from 'react';
import { PhotoUpload } from '@/components/ui/PhotoUpload';
import { Input } from '@/components/ui/Input';
import {
  GraduationCap,
  Calendar,
  Clock,
  CheckCircle2,
  FileText,
  AlertCircle,
  HelpCircle,
  TrendingUp,
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
  savedFeeReceipt?: boolean;
  savedMarksheet?: boolean;
  isReadOnly?: boolean;
  errors?: Record<string, string>;
}

export function ExpensesAndApprovalGrid({
  currentExpenses,
  requiredSupport,
  onCurrentExpenseChange,
  onRequiredSupportChange,
  onReceiptPhotoChange,
  onMarksheetPhotoChange,
  onRemarksChange,
  savedFeeReceipt = false,
  savedMarksheet = false,
  isReadOnly = false,
  errors = {},
}: ExpensesAndApprovalGridProps) {
  const expenseCategories = [
    {
      key: 'schoolFees',
      reqKey: 'requiredSchoolFees',
      label: 'School Fees',
      frequency: 'Annual / Session',
      frequencyType: 'annual' as const,
      criteria: 'Standard tuition/admission fee per government/aided fee schedule. Verified via fee receipt.',
      currentVal: currentExpenses.schoolFees,
      requiredVal: requiredSupport.requiredSchoolFees,
      hasRequired: true,
    },
    {
      key: 'tuitionFees',
      reqKey: 'requiredTuitionFees',
      label: 'Private Tuition Fee',
      frequency: 'Monthly (Recurring)',
      frequencyType: 'monthly' as const,
      criteria: 'Remedial academic coaching for children needing learning catch-up or board preparation.',
      currentVal: currentExpenses.tuitionFees,
      requiredVal: requiredSupport.requiredTuitionFees || 0,
      hasRequired: true,
    },
    {
      key: 'books',
      reqKey: 'requiredBooks',
      label: 'Books & Syllabi',
      frequency: 'Annual / Session Start',
      frequencyType: 'annual' as const,
      criteria: 'Prescribed NCERT/State Board syllabus textbook set for current grade.',
      currentVal: currentExpenses.books,
      requiredVal: requiredSupport.requiredBooks,
      hasRequired: true,
    },
    {
      key: 'stationery',
      reqKey: 'requiredStationery',
      label: 'Stationery (Pen/Paper/Geometry Box)',
      frequency: 'Twice a year (Bi-annual)',
      frequencyType: 'bi-annual' as const,
      criteria: 'Disbursed twice in the year: Semester 1 (June/July) & Semester 2 (Nov/Dec) covering notebooks & instruments.',
      currentVal: currentExpenses.stationery,
      requiredVal: requiredSupport.requiredStationery,
      hasRequired: true,
    },
    {
      key: 'uniform',
      reqKey: 'requiredUniform',
      label: 'School Uniform',
      frequency: 'Annual (1–2 Sets)',
      frequencyType: 'annual' as const,
      criteria: '2 sets of prescribed uniform plus appropriate seasonal wear/footwear.',
      currentVal: currentExpenses.uniform,
      requiredVal: requiredSupport.requiredUniform,
      hasRequired: true,
    },
    {
      key: 'transport',
      reqKey: 'requiredTransport',
      label: 'School Transport',
      frequency: 'Monthly (Commute)',
      frequencyType: 'monthly' as const,
      criteria: 'Approved for children residing > 2 km from school (shared auto/bus fare).',
      currentVal: currentExpenses.transport,
      requiredVal: requiredSupport.requiredTransport,
      hasRequired: true,
    },
    {
      key: 'otherExpenses',
      reqKey: 'requiredOtherSupport',
      label: 'Other Educational Expenses',
      frequency: 'Need-based / One-time',
      frequencyType: 'need-based' as const,
      criteria: 'Special project materials, board examination fees, or vocational supplies with written remarks.',
      currentVal: currentExpenses.otherExpenses,
      requiredVal: requiredSupport.requiredOtherSupport,
      hasRequired: true,
    },
  ];

  const totalCurrentCost = expenseCategories.reduce((sum, c) => sum + (Number(c.currentVal) || 0), 0);
  const totalRequired = expenseCategories.reduce((sum, c) => sum + (Number(c.requiredVal) || 0), 0);

  const getBadgeStyle = (type: string) => {
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
  };

  return (
    <div className="space-y-4">
      {/* Programmatic Approval Guidelines Banner */}
      <div className="p-3.5 bg-purple-50/60 border border-purple-200/90 rounded-xl text-xs space-y-1.5 shadow-2xs">
        <div className="flex items-center space-x-2 text-purple-950 font-bold">
          <GraduationCap className="h-4 w-4 text-purple-700" />
          <span>Educational Support Approval & Disbursement Guidelines</span>
        </div>
        <p className="text-slate-600 leading-relaxed text-[11.5px]">
          Each line item must be validated against programme schedules:
          <span className="font-semibold text-purple-900"> Stationery is approved twice in the year</span> (Semester 1 & 2),
          <span className="font-semibold text-amber-900"> Transport and Private Tuition are approved monthly</span>, and
          <span className="font-semibold text-purple-900"> School Fees, Books & Uniform are approved annually</span>.
        </p>
      </div>

      {/* Beautiful Expenses & Approval Grid */}
      <div className="bg-white rounded-2xl border border-black overflow-hidden shadow-xs">
        {/* Desktop Table View (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-900">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4 w-[28%]">Expense Category</th>
                <th className="py-3 px-4 w-[20%]">Frequency Schedule</th>
                <th className="py-3 px-4 w-[28%]">Programme Approval Criteria</th>
                <th className="py-3 px-4 w-[12%] text-right">Current Cost (₹)</th>
                <th className="py-3 px-4 w-[12%] text-right">Required (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenseCategories.map((item) => (
                <tr key={item.key} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 block">{item.label}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getBadgeStyle(
                        item.frequencyType
                      )}`}
                    >
                      <Clock className="h-3 w-3 mr-1 opacity-70" />
                      {item.frequency}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 leading-relaxed text-[11px]">
                    {item.criteria}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {isReadOnly ? (
                      <span className="font-mono font-bold text-slate-800">
                        ₹{(item.currentVal || 0).toLocaleString('en-IN')}
                      </span>
                    ) : (() => {
                        const rowError = errors[item.key] || errors[`educationExpenses.${item.key}`] || errors[`expenses-${item.key}`] || (item.key === 'schoolFees' ? errors['school-fees-current-cost'] : undefined);
                        const inputId = item.key === 'schoolFees' ? 'school-fees-current-cost' : `expenses-${item.key}`;
                        return (
                          <div className="flex flex-col items-end">
                            <input
                              id={inputId}
                              type="number"
                              min="0"
                              value={item.currentVal ? item.currentVal : ''}
                              aria-invalid={rowError ? 'true' : 'false'}
                              aria-describedby={rowError ? `${inputId}-error` : undefined}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const val = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                onCurrentExpenseChange(item.key, val);
                              }}
                              className={`w-24 text-right font-mono text-xs px-2.5 py-1.5 rounded-lg border focus:ring-2 focus:outline-none bg-white ${
                                rowError
                                  ? 'border-rose-400 ring-2 ring-rose-200 focus:ring-rose-200 focus:border-rose-500'
                                  : 'border-black focus:ring-purple-400 focus:border-purple-600'
                              }`}
                            />
                            {rowError && (
                              <p id={`${inputId}-error`} role="alert" className="text-[10px] text-rose-600 font-semibold mt-0.5 text-right">
                                {rowError}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {item.hasRequired ? (
                      isReadOnly ? (
                        <span className="font-mono font-bold text-purple-950">
                          ₹{(item.requiredVal || 0).toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={item.requiredVal ? item.requiredVal : ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const val = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                            onRequiredSupportChange(item.reqKey!, val);
                          }}
                          className="w-24 text-right font-mono font-bold text-purple-950 text-xs px-2.5 py-1.5 rounded-lg border border-black focus:ring-2 focus:ring-purple-400 focus:border-purple-600 focus:outline-none bg-purple-50/40 focus:bg-white"
                        />
                      )
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
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
                <td className="py-3.5 px-4 text-right font-mono text-purple-950 text-sm">
                  ₹{totalRequired.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile View: Cards (< 768px) */}
        <div className="md:hidden divide-y divide-slate-200">
          {expenseCategories.map((item) => (
            <div key={item.key} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{item.label}</h4>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-semibold border ${getBadgeStyle(
                      item.frequencyType
                    )}`}
                  >
                    <Clock className="h-2.5 w-2.5 mr-1" />
                    {item.frequency}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-700">Approval rule: </span>
                {item.criteria}
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Current Cost (₹)
                  </label>
                  {isReadOnly ? (
                    <span className="font-mono font-bold text-slate-900">
                      ₹{(item.currentVal || 0).toLocaleString('en-IN')}
                    </span>
                  ) : (() => {
                      const rowError = errors[item.key] || errors[`educationExpenses.${item.key}`] || errors[`expenses-${item.key}`] || (item.key === 'schoolFees' ? errors['school-fees-current-cost'] : undefined);
                      const inputId = `mobile-expenses-${item.key}`;
                      return (
                        <div>
                          <input
                            id={inputId}
                            type="number"
                            min="0"
                            value={item.currentVal ? item.currentVal : ''}
                            aria-invalid={rowError ? 'true' : 'false'}
                            aria-describedby={rowError ? `${inputId}-error` : undefined}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                              onCurrentExpenseChange(item.key, val);
                            }}
                            className={`w-full font-mono text-xs px-2.5 py-2 rounded-lg border bg-white focus:ring-2 ${
                              rowError
                                ? 'border-rose-400 ring-2 ring-rose-200 focus:ring-rose-200 focus:border-rose-500'
                                : 'border-black focus:ring-purple-400 focus:border-purple-600'
                            }`}
                          />
                          {rowError && (
                            <p id={`${inputId}-error`} role="alert" className="text-[10px] text-rose-600 font-semibold mt-0.5">
                              {rowError}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                </div>

                {item.hasRequired && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-purple-800 block mb-1">
                      Required Grant (₹)
                    </label>
                    {isReadOnly ? (
                      <span className="font-mono font-bold text-purple-950">
                        ₹{(item.requiredVal || 0).toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        value={item.requiredVal ? item.requiredVal : ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                          onRequiredSupportChange(item.reqKey!, val);
                        }}
                        className="w-full font-mono font-bold text-purple-950 text-xs px-2.5 py-2 rounded-lg border border-black bg-purple-50/40 focus:bg-white focus:ring-2 focus:ring-purple-400 focus:border-purple-600"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase">Total Required Grant</span>
            <span className="text-base font-mono font-bold text-purple-950">
              ₹{totalRequired.toLocaleString('en-IN')}
            </span>
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
              {savedFeeReceipt && (
                <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                  Saved School Fee Receipt on File
                </span>
              )}
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
              {savedMarksheet && (
                <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                  Saved Marksheet on File
                </span>
              )}
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
