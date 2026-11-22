'use client';

import React, { useId, useRef } from 'react';
import Link from 'next/link';
import {
  selectIsLaunching,
  useLaunchTransitionStore,
} from '@/store/useLaunchTransitionStore';
import { RocketPillVisual } from './RocketPillVisual';

export interface RocketSurveyButtonProps {
  onFormReady?: () => void;
  onComplete?: () => void;
  onPreLaunch?: (e: React.MouseEvent) => boolean | void;
  logoSrc?: string;
  label?: string;
  loadingText?: string;
  disabled?: boolean;
  className?: string;
}

export const RocketSurveyButton = React.forwardRef<HTMLAnchorElement, RocketSurveyButtonProps>(
  function RocketSurveyButton(
    {
      onFormReady,
      onComplete,
      onPreLaunch,
      logoSrc,
      label = 'Start New Survey',
      loadingText = 'Opening survey form...',
      disabled = false,
      className = '',
    },
    forwardedRef
  ) {
    const triggerId = useId();
    const linkRef = useRef<HTMLAnchorElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    const isAnyLaunching = useLaunchTransitionStore(selectIsLaunching);
    const isThisButtonFlying = useLaunchTransitionStore(
      (s) => s.phase !== 'idle' && s.activeTriggerId === triggerId
    );
    const startLaunch = useLaunchTransitionStore((s) => s.startLaunch);

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (disabled) return;

      // Offline immediate fallback: offline PWA always navigates directly to cached assessment shell
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
        window.location.assign('/assessment/new');
        return;
      }

      if (isAnyLaunching) return;

      if (onPreLaunch && onPreLaunch(e) === false) {
        return;
      }

      startLaunch({
        triggerId,
        rect: (buttonRef.current || linkRef.current)?.getBoundingClientRect() ?? null,
        label,
        logoSrc,
        loadingText,
        onFormReady: () => {
          if (typeof window !== 'undefined' && !navigator.onLine) {
            window.location.assign('/assessment/new');
          } else {
            onFormReady?.();
          }
        },
        onComplete,
      });
    };

    return (
      <Link
        href="/assessment/new"
        onClick={handleClick}
        aria-label={label}
        className={`group relative flex h-[58px] w-full max-w-[340px] items-center cursor-pointer transition-transform duration-200 hover:translate-x-1.5 active:scale-[0.98] disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full shrink-0 ${
          isThisButtonFlying ? 'opacity-0 pointer-events-none' : 'opacity-100'
        } ${className}`}
      >
        <button
          ref={(node) => {
            buttonRef.current = node;
            if (typeof forwardedRef === 'function') {
              forwardedRef(node as any);
            } else if (forwardedRef) {
              (forwardedRef as React.MutableRefObject<any>).current = node;
            }
          }}
          type="button"
          onClick={handleClick}
          aria-label={label}
          tabIndex={-1}
          className="relative z-10 flex w-full h-full min-h-[56px] items-center justify-between bg-transparent border-none p-0 cursor-pointer focus:outline-none"
        >
          <RocketPillVisual label={label} />
        </button>
      </Link>
    );
  }
);
RocketSurveyButton.displayName = 'RocketSurveyButton';
