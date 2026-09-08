'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  unit?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, unit, className, id, required, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const errorId = inputId ? `${inputId}-error` : undefined;
    const helperId = inputId ? `${inputId}-helper` : undefined;

    return (
      <div className="w-full flex flex-col space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-bold text-ink-900 flex items-center justify-between"
          >
            <span>
              {label} {required && <span className="text-alert-rose">*</span>}
            </span>
          </label>
        )}

        <div className="relative flex items-center">
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={twMerge(
              clsx(
                // 16px text-base to prevent mobile browser auto-zoom
                'w-full min-h-[48px] px-3.5 py-3 text-base text-ink-900 bg-white border rounded-xl transition-colors',
                'placeholder:text-ink-400 focus:outline-none focus:ring-3 focus:ring-brand-light focus:border-brand',
                error
                  ? 'border-alert-rose focus:ring-rose-200'
                  : 'border-slate-300 hover:border-slate-400',
                unit ? 'pr-12' : '',
                className
              )
            )}
            {...props}
          />
          {unit && (
            <span className="absolute right-3.5 text-xs font-bold text-ink-600 pointer-events-none select-none">
              {unit}
            </span>
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="text-xs font-semibold text-alert-rose">
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={helperId} className="text-[11px] text-ink-600">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
