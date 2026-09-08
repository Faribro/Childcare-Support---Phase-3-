'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  steps: Array<{
    number: number;
    title: string;
    description?: string;
  }>;
  onStepClick?: (step: number) => void;
}

export function StepIndicator({
  currentStep,
  totalSteps,
  steps,
  onStepClick,
}: StepIndicatorProps) {
  const activeStepObj = steps.find((s) => s.number === currentStep) || steps[0];

  return (
    <div className="w-full bg-white border-b border-slate-200/80 px-4 py-3 sm:py-4 select-none">
      <div className="max-w-7xl mx-auto">
        {/* Mobile View: Compact Segmented Progress Bar (< 768px) */}
        <div className="md:hidden">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-brand uppercase tracking-wider">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="font-semibold text-ink-900 truncate ml-2">
              {activeStepObj.title}
            </span>
          </div>

          <div
            className="grid grid-cols-6 gap-1.5 h-2 w-full"
            role="progressbar"
            aria-valuenow={currentStep}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-label={`Step ${currentStep} of ${totalSteps}: ${activeStepObj.title}`}
          >
            {steps.map((step) => {
              const isCompleted = step.number < currentStep;
              const isActive = step.number === currentStep;

              return (
                <div
                  key={step.number}
                  className={`h-full rounded-full transition-all ${
                    isCompleted
                      ? 'bg-alliance-emerald'
                      : isActive
                      ? 'bg-brand'
                      : 'bg-slate-200'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Desktop View: Full Responsive Stepper (>= 768px) */}
        <nav aria-label="Progress" className="hidden md:block">
          <ol className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isCompleted = step.number < currentStep;
              const isActive = step.number === currentStep;
              const isClickable = onStepClick && step.number <= currentStep;

              return (
                <li
                  key={step.number}
                  className={`relative flex-1 ${
                    index !== steps.length - 1 ? 'pr-4 sm:pr-6' : ''
                  }`}
                >
                  <div className="flex items-center">
                    <button
                      type="button"
                      disabled={!isClickable}
                      onClick={() => isClickable && onStepClick(step.number)}
                      className={`flex items-center text-left group focus:outline-none ${
                        isClickable ? 'cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      {/* Step Circle */}
                      <span
                        className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors shadow-sm ${
                          isCompleted
                            ? 'bg-alliance-emerald text-white'
                            : isActive
                            ? 'bg-brand text-white ring-4 ring-blue-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-300'
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          step.number
                        )}
                      </span>

                      {/* Step Label */}
                      <span className="ml-3 flex flex-col">
                        <span
                          className={`text-xs uppercase font-bold tracking-wider leading-none ${
                            isActive
                              ? 'text-brand'
                              : isCompleted
                              ? 'text-alliance-emerald'
                              : 'text-slate-400'
                          }`}
                        >
                          Step {step.number}
                        </span>
                        <span
                          className={`text-sm font-semibold truncate max-w-[120px] lg:max-w-[160px] ${
                            isActive
                              ? 'text-ink-900'
                              : isCompleted
                              ? 'text-ink-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {step.title}
                        </span>
                      </span>
                    </button>

                    {/* Connecting Line */}
                    {index !== steps.length - 1 && (
                      <div
                        className={`hidden lg:block flex-1 h-0.5 ml-4 mr-2 ${
                          step.number < currentStep
                            ? 'bg-alliance-emerald'
                            : 'bg-slate-200'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
