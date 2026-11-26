'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

interface AnimatedHeartUnlockProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const REQUIRED_TAPS = 3;
const TAP_WINDOW_RESET_MS = 900;

export function AnimatedHeartUnlock({ className = '', size = 'md' }: AnimatedHeartUnlockProps) {
  const { isUnlocked } = useEvaluationAccess();

  const dims = size === 'xs'
    ? { width: 22, height: 20, curve: 6, maxTank: 20 }
    : size === 'sm'
    ? { width: 26, height: 23, curve: 7, maxTank: 23 }
    : size === 'lg'
    ? { width: 38, height: 33, curve: 10, maxTank: 33 }
    : { width: 32, height: 28, curve: 9, maxTank: 28 };

  const [tapCount, setTapCount] = useState<number>(0);
  const [isPumping, setIsPumping] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'tapping' | 'opened'>('idle');

  const tapCountRef = useRef<number>(0);
  const lastTapAtRef = useRef<number>(0);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const resetTaps = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    tapCountRef.current = 0;
    lastTapAtRef.current = 0;
    setTapCount(0);
    setStatus('idle');
  }, []);

  const openStaffAccessModal = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('child_nutrition:open_login_modal', {
          detail: {
            source: 'heart',
            requireAccessCodeGate: !isUnlocked,
          },
        })
      );
    }
  }, [isUnlocked]);

  const handleHeartClick = (e?: React.MouseEvent<HTMLElement>) => {
    // Ignore non-primary mouse clicks
    if (e && typeof e.button === 'number' && e.button !== 0) {
      return;
    }

    // Heart entrypoint ALWAYS requires 3 consecutive taps within the inter-tap window
    // regardless of signed-in/unlocked state, so double-clicking never triggers Staff Access.
    const now = Date.now();
    if (tapCountRef.current > 0 && lastTapAtRef.current > 0 && now - lastTapAtRef.current > TAP_WINDOW_RESET_MS) {
      tapCountRef.current = 0;
    }
    lastTapAtRef.current = now;

    setIsPumping(true);
    setTimeout(() => setIsPumping(false), 220);

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    const nextCount = Math.min(REQUIRED_TAPS, tapCountRef.current + 1);
    tapCountRef.current = nextCount;
    setTapCount(nextCount);

    if (nextCount >= REQUIRED_TAPS) {
      tapCountRef.current = 0;
      lastTapAtRef.current = 0;
      setStatus('opened');
      openStaffAccessModal();
      resetTimerRef.current = setTimeout(() => {
        resetTaps();
      }, 900);
      return;
    }

    setStatus('tapping');
    resetTimerRef.current = setTimeout(() => {
      resetTaps();
    }, TAP_WINDOW_RESET_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      handleHeartClick();
    }
  };

  const levelIndex = isUnlocked ? 3 : tapCount;
  const tankLevels = [
    0,
    Math.round(dims.maxTank * 0.36),
    Math.round(dims.maxTank * 0.70),
    dims.maxTank,
  ];

  const curveLevels = [
    -dims.curve,
    Math.round(dims.maxTank * 0.36) - 3,
    Math.round(dims.maxTank * 0.70) - 3,
    dims.maxTank - 3,
  ];

  const pumpLevelsZ = [8, 12, 16, 0];
  const currentTankHeight = isUnlocked ? dims.maxTank : (tankLevels[levelIndex] || 0);
  const currentCurveBottom = isUnlocked
    ? dims.maxTank - 3
    : (curveLevels[levelIndex] !== undefined ? curveLevels[levelIndex] : -dims.curve);
  const currentPumpZ = isPumping ? (pumpLevelsZ[levelIndex] || 10) : 0;
  const currentScale = isPumping ? 1.12 : 1;

  const renderBadgeContent = () => {
    if (isUnlocked) {
      return <span>✓</span>;
    }
    if (status === 'opened') {
      return <span>3</span>;
    }
    return <span>{tapCount}</span>;
  };

  let badgeBg = 'bg-[#506079] text-white';
  if (status === 'tapping') {
    badgeBg = 'bg-purple-700 text-white shadow-md ring-1 ring-purple-300';
  } else if (isUnlocked || status === 'opened') {
    badgeBg = 'bg-emerald-600 text-white shadow-sm';
  }

  return (
    <div className={`relative inline-flex flex-col items-center select-none pb-4 ${className}`}>
      {/* SVG ClipPath Definition & Wave Path */}
      <svg width="0" height="0" className="absolute pointer-events-none opacity-0" aria-hidden="true">
        <defs>
          <clipPath id="myPath" clipPathUnits="objectBoundingBox">
            <path d="M0.498,1 s0.243,-0.102,0.394,-0.323 S1,0.14,0.864,0.033 S0.498,0.141,0.498,0.141 S0.291,-0.08,0.124,0.031 s-0.159,0.434,-0.021,0.646 S0.498,1,0.498,1" />
          </clipPath>
        </defs>
      </svg>

      {/* 3D Heart Wrapper */}
      <div
        onClick={handleHeartClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={isUnlocked ? 'Staff Access (Active)' : 'Staff Access - Tap 3 times to sign in'}
        title={isUnlocked ? 'Staff Access (Active)' : 'Tap 3 times for Staff Access'}
        className="heart-wrap group focus:outline-none rounded-full p-0.5 cursor-pointer relative"
        style={{
          perspective: '150px',
        }}
      >
        {/* Main Heart Container with Liquid Wave */}
        <div
          className={`heart relative transition-all duration-300 ${
            isUnlocked ? 'heart-unlocked-glow ring-1 ring-purple-400/60' : ''
          }`}
          style={{
            width: `${dims.width}px`,
            height: `${dims.height}px`,
            clipPath: 'url(#myPath)',
            WebkitClipPath: 'url(#myPath)',
            backgroundImage: 'radial-gradient(#c9d8f5 60%, #afc4ee)',
            transform: `translateZ(${currentPumpZ}px) scale(${currentScale})`,
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease',
          }}
        >
          {/* Tank Filling Body */}
          <div
            className="tank"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: `${dims.width}px`,
              height: `${currentTankHeight}px`,
              backgroundColor: isUnlocked ? 'rgb(147, 51, 234)' : 'rgb(103, 130, 191)',
              zIndex: 5,
              transition: 'height 0.45s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.4s ease',
            }}
          />

          {/* Liquid Wave Surface SVG */}
          <svg
            className="curve"
            viewBox="0 24 150 28"
            preserveAspectRatio="none"
            shapeRendering="auto"
            style={{
              position: 'absolute',
              bottom: `${currentCurveBottom}px`,
              left: 0,
              width: `${dims.width}px`,
              height: `${dims.curve}px`,
              zIndex: 6,
              transition: 'bottom 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <defs>
              <path
                id="gentle-wave"
                d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"
              />
            </defs>
            <g>
              <use
                href="#gentle-wave"
                xlinkHref="#gentle-wave"
                x="48"
                y="0"
                fill={isUnlocked ? 'rgba(168, 85, 247, 0.5)' : 'rgba(103, 130, 191, 0.5)'}
              />
              <use
                href="#gentle-wave"
                xlinkHref="#gentle-wave"
                x="48"
                y="1"
                fill={isUnlocked ? 'rgba(168, 85, 247, 0.3)' : 'rgba(103, 130, 191, 0.3)'}
              />
              <use
                href="#gentle-wave"
                xlinkHref="#gentle-wave"
                x="48"
                y="2"
                fill={isUnlocked ? 'rgba(147, 51, 234, 1)' : 'rgba(103, 130, 191, 1)'}
              />
            </g>
          </svg>
        </div>

        {/* Counter Badge below heart */}
        <div
          className={`absolute top-[calc(100%+4px)] left-1/2 -translate-x-1/2 flex items-center justify-center w-[19px] h-[19px] rounded-full text-[10px] font-bold border-2 border-white shadow-sm transition-all duration-200 select-none z-10 ${badgeBg}`}
        >
          {renderBadgeContent()}
        </div>
      </div>
    </div>
  );
}