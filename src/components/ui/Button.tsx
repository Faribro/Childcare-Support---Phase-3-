'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'emerald' | 'danger' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  isLoading?: boolean;
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'default',
  isLoading = false,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-light disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 touch-target-48';

  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm',
    secondary: 'bg-white text-ink-900 border border-slate-300 hover:bg-slate-50 shadow-sm',
    emerald: 'bg-alliance-emerald text-white hover:bg-alliance-emerald-dark shadow-sm',
    danger: 'bg-alert-rose text-white hover:bg-rose-800 shadow-sm',
    ghost: 'bg-transparent text-ink-700 hover:bg-slate-100',
  };

  const sizes = {
    default: 'px-4 py-3 text-sm min-h-[48px]',
    sm: 'px-3 py-2 text-xs min-h-[44px]',
    lg: 'px-6 py-3.5 text-base min-h-[52px]',
    icon: 'h-12 w-12 p-2.5',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" />
          <span>Please wait...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
