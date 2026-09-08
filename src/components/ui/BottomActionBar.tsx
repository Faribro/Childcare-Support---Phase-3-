'use client';

import React from 'react';
import { Button } from './Button';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

interface BottomActionBarProps {
  onNext: () => void;
  onPrev?: () => void;
  nextLabel?: string;
  prevLabel?: string;
  isSubmitting?: boolean;
  disableNext?: boolean;
  isFinalStep?: boolean;
}

export function BottomActionBar({
  onNext,
  onPrev,
  nextLabel,
  prevLabel = 'Previous',
  isSubmitting = false,
  disableNext = false,
  isFinalStep = false,
}: BottomActionBarProps) {
  const defaultNextLabel = isFinalStep ? 'Queue for Sync' : 'Continue';
  const effectiveNextLabel = nextLabel || defaultNextLabel;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-t border-slate-200/90 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] sticky-bottom-bar px-3 pt-2.5">
      <div className="max-w-lg mx-auto flex items-center space-x-2.5">
        {/* Previous Button (Optional) */}
        {onPrev && (
          <Button
            type="button"
            variant="secondary"
            onClick={onPrev}
            disabled={isSubmitting}
            className="flex-1 max-w-[120px] xs:max-w-[140px]"
            aria-label="Go to previous step"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5 shrink-0" />
            <span>{prevLabel}</span>
          </Button>
        )}

        {/* Primary Forward CTA */}
        <Button
          type="button"
          variant={isFinalStep ? 'emerald' : 'primary'}
          onClick={onNext}
          isLoading={isSubmitting}
          disabled={disableNext || isSubmitting}
          className="flex-1 shadow-md"
          aria-label={effectiveNextLabel}
        >
          <span>{effectiveNextLabel}</span>
          {!isSubmitting && (
            isFinalStep ? (
              <Check className="h-4 w-4 ml-2 shrink-0" />
            ) : (
              <ArrowRight className="h-4 w-4 ml-2 shrink-0" />
            )
          )}
        </Button>
      </div>
    </div>
  );
}
