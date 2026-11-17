'use client';

import React, { useId } from 'react';
import { GraduationCap, Apple, HeartPulse, LayoutGrid } from 'lucide-react';
import type { SupportCategory } from '@/lib/assessment/categoryApplicability';
import { CATEGORY_LABELS } from '@/lib/assessment/categoryApplicability';

interface CategorySelectionStepProps {
  selected?: SupportCategory[];
  selectedCategories?: SupportCategory[];
  onChange: (categories: SupportCategory[]) => void;
  error?: string | null;
  onContinue: (categories?: SupportCategory[]) => void;
  onBack?: () => void;
}

const CATEGORY_META: {
  key: SupportCategory;
  Icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    key: 'education',
    Icon: GraduationCap,
    description: 'School enrolment, fees, attendance, scheme benefits',
  },
  {
    key: 'nutrition',
    Icon: Apple,
    description: 'Nutritional status, weight, height, appetite',
  },
  {
    key: 'hiv_support',
    Icon: HeartPulse,
    description: 'ART status, viral load, clinical details',
  },
];

const ALL_KEYS: SupportCategory[] = ['education', 'nutrition', 'hiv_support'];

export function CategorySelectionStep({
  selected,
  selectedCategories,
  onChange,
  error,
  onContinue,
  onBack,
}: CategorySelectionStepProps) {
  const legendId = useId();
  const errorId = useId();

  const currentSelection = selected || selectedCategories || [];

  const allSelected = ALL_KEYS.every((k) => currentSelection.includes(k));
  const someSelected = currentSelection.length > 0 && !allSelected;

  const toggleCategory = (cat: SupportCategory) => {
    const next = currentSelection.includes(cat)
      ? currentSelection.filter((c) => c !== cat)
      : [...currentSelection, cat];
    onChange(next);
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange([...ALL_KEYS]);
    }
  };

  const handleContinue = () => {
    onContinue(currentSelection);
  };

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* Title block */}
      <div className="space-y-1.5">
        <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-slate-400">
          Step 0 of 9 · Before you begin
        </p>
        <h1
          id={legendId}
          className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight"
        >
          What support is this assessment for?
        </h1>
        <p className="text-sm text-slate-600">
          {"Select all that apply. We'll show only the relevant questions."}
        </p>
      </div>

      {/* Category checkboxes */}
      <fieldset aria-labelledby={legendId} className="space-y-3">
        <legend className="sr-only">Support categories</legend>

        {/* Individual categories */}
        {CATEGORY_META.map(({ key, Icon, description }) => {
          const checked = currentSelection.includes(key);
          const checkboxId = `cat-${key}`;
          return (
            <label
              key={key}
              htmlFor={checkboxId}
              className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all min-h-[64px] select-none ${
                checked
                  ? 'border-purple-500 bg-purple-50/70 shadow-[0_0_14px_rgba(168,85,247,0.18)]'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
              }`}
            >
              <input
                id={checkboxId}
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => toggleCategory(key)}
                aria-describedby={error ? errorId : undefined}
              />
              {/* Custom checkbox */}
              <span
                aria-hidden="true"
                className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
                  checked
                    ? 'bg-purple-600 border-purple-600'
                    : 'bg-white border-slate-300'
                }`}
              >
                {checked && (
                  <svg
                    viewBox="0 0 12 12"
                    className="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                )}
              </span>

              <Icon
                className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                  checked ? 'text-purple-600' : 'text-slate-400'
                }`}
              />

              <span className="flex flex-col min-w-0">
                <span
                  className={`text-sm font-bold ${
                    checked ? 'text-purple-900' : 'text-slate-800'
                  }`}
                >
                  {CATEGORY_LABELS[key]}
                </span>
                <span className="text-xs text-slate-500 mt-0.5">
                  {description}
                </span>
              </span>
            </label>
          );
        })}

        {/* "All categories" select-all control */}
        <label
          htmlFor="cat-all"
          className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all min-h-[56px] select-none ${
            allSelected
              ? 'border-emerald-500 bg-emerald-50/70'
              : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
          }`}
        >
          <input
            id="cat-all"
            type="checkbox"
            className="sr-only"
            checked={allSelected}
            aria-checked={someSelected ? 'mixed' : allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            aria-describedby={error ? errorId : undefined}
          />
          {/* Custom checkbox */}
          <span
            aria-hidden="true"
            className={`flex-shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
              allSelected
                ? 'bg-emerald-600 border-emerald-600'
                : someSelected
                ? 'bg-slate-400 border-slate-400'
                : 'bg-white border-slate-300'
            }`}
          >
            {allSelected ? (
              <svg
                viewBox="0 0 12 12"
                className="w-3 h-3 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="2,6 5,9 10,3" />
              </svg>
            ) : someSelected ? (
              <span className="block w-2.5 h-0.5 bg-white rounded" />
            ) : null}
          </span>

          <LayoutGrid
            className={`h-5 w-5 flex-shrink-0 ${
              allSelected ? 'text-emerald-600' : 'text-slate-400'
            }`}
          />

          <span
            className={`text-sm font-bold ${
              allSelected ? 'text-emerald-900' : 'text-slate-700'
            }`}
          >
            All categories
          </span>
        </label>
      </fieldset>

      {/* Validation error */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-semibold text-rose-600 flex items-center gap-1.5"
        >
          <svg
            viewBox="0 0 16 16"
            className="w-4 h-4 shrink-0"
            fill="currentColor"
          >
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4.5zm0 6.75a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z" />
          </svg>
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex-1 h-12 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleContinue}
          className="flex-1 h-12 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold transition-colors shadow-md cursor-pointer"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
