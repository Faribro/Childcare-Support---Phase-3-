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
            className="text-[11.5px] font-bold tracking-wider text-slate-700 uppercase flex items-center justify-between"
          >
            <span>
              {label} {required && <span className="text-rose-500 ml-0.5">*</span>}
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
                'w-full h-11 min-h-[44px] px-3.5 text-sm text-slate-900 bg-white border rounded-xl transition-all shadow-2xs font-medium',
                'placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600',
                error
                  ? 'border-rose-400 focus:ring-rose-100 focus:border-rose-500'
                  : 'border-slate-200 hover:border-slate-300',
                unit ? 'pr-12' : '',
                className
              )
            )}
            {...props}
          />
          {unit && (
            <span className="absolute right-3.5 text-xs font-bold text-slate-400 pointer-events-none select-none">
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
