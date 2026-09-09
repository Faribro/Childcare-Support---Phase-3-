'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

interface AnimatedHeartUnlockProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

// Secret passcode sequence: 1 click, then 3 clicks, then 2 clicks (132)
const TARGET_PASSCODE = [1, 3, 2];

export function AnimatedHeartUnlock({ className = '', size = 'md' }: AnimatedHeartUnlockProps) {
  const { isUnlocked, unlock, lock } = useEvaluationAccess();

  // Compact dimensions
  const dims = size === 'xs'
    ? { width: 22, height: 20, curve: 6, maxTank: 20 }
    : size === 'sm'
    ? { width: 26, height: 23, curve: 7, maxTank: 23 }
    : size === 'lg'
    ? { width: 38, height: 33, curve: 10, maxTank: 33 }
    : { width: 32, height: 28, curve: 9, maxTank: 28 }; // default md

  // Passcode stage: 0 (waiting for digit 1), 1 (waiting for digit 2), 2 (waiting for digit 3), 3 (unlocked)
  const [stage, setStage] = useState<number>(0);
  const [currentClicks, setCurrentClicks] = useState<number>(0);
  const [displayValue, setDisplayValue] = useState<string | number>(0);
  const [isPumping, setIsPumping] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [badgeStatus, setBadgeStatus] = useState<'idle' | 'clicking' | 'success' | 'wrong'>('idle');

  const commitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronize state with persistent unlock status
  useEffect(() => {
    if (isUnlocked) {
      setStage(3);
      setDisplayValue('✓');
      setBadgeStatus('success');
    } else {
      setStage(0);
      setCurrentClicks(0);
      setDisplayValue(0);
      setBadgeStatus('idle');
    }
  }, [isUnlocked]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Scaled tank fill levels (in pixels)
  const tankLevels = [
    0,
    Math.round(dims.maxTank * 0.36),
    Math.round(dims.maxTank * 0.70),
    dims.maxTank,
  ];

  // Curve bottom positions (floating curve on top of liquid in tank)
  const curveLevels = [
    -dims.curve,
    Math.round(dims.maxTank * 0.36) - 3,
    Math.round(dims.maxTank * 0.70) - 3,
    dims.maxTank - 3,
  ];

  const pumpLevelsZ = [8, 12, 16, 0];

  const handleHeartClick = () => {
    // If already unlocked, clicking it will lock it back and reset
    if (isUnlocked || stage === 3) {
      lock();
      setStage(0);
      setCurrentClicks(0);
      setDisplayValue(0);
      setBadgeStatus('idle');
      return;
    }

    if (isShaking) return;

    // Pump pulse animation
    setIsPumping(true);
    setTimeout(() => setIsPumping(false), 250);

    // Clear any previous idle timer
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    // Increment clicks for current digit
    const nextClicks = currentClicks + 1;
    setCurrentClicks(nextClicks);
    setDisplayValue(nextClicks);
    setBadgeStatus('clicking');

    // Reset commit debounce timer (1000ms pause commits the digit)
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);

    commitTimerRef.current = setTimeout(() => {
      const expectedClicks = TARGET_PASSCODE[stage];

      if (nextClicks === expectedClicks) {
        // Correct number of clicks for this stage!
        if (stage === TARGET_PASSCODE.length - 1) {
          // All digits [1, 3, 2] completed! UNLOCK!
          unlock();
          setStage(3);
          setCurrentClicks(0);
          setDisplayValue('✓');
          setBadgeStatus('success');
        } else {
          // Advance to next stage
          const nextStage = stage + 1;
          setStage(nextStage);
          setCurrentClicks(0);
          setDisplayValue(nextClicks);
          setBadgeStatus('success');

          // After short flash, reset badge to 0 for next digit
          setTimeout(() => {
            setDisplayValue(0);
            setBadgeStatus('idle');
          }, 350);

          // Arm idle timer: if user waits > 7 seconds without clicking next digit, reset to 0
          idleTimerRef.current = setTimeout(() => {
            setStage(0);
            setCurrentClicks(0);
            setDisplayValue(0);
            setBadgeStatus('idle');
          }, 7000);
        }
      } else {
        // Wrong number of clicks! It won't open!
        setIsShaking(true);
        setDisplayValue('✕');
        setBadgeStatus('wrong');
        setStage(0);
        setCurrentClicks(0);

        setTimeout(() => {
          setIsShaking(false);
          setDisplayValue(0);
          setBadgeStatus('idle');
        }, 600);
      }
    }, 1000);
  };

  const currentTankHeight = tankLevels[stage] || 0;
  const currentCurveBottom = curveLevels[stage] !== undefined ? curveLevels[stage] : -dims.curve;
  const currentPumpZ = isPumping ? pumpLevelsZ[stage] || 10 : 0;
  const currentScale = isPumping ? 1.12 : 1;

  // Badge background and text styling
  let badgeBg = 'bg-[#506079] text-white'; // default soft slate-blue
  if (badgeStatus === 'clicking') {
    badgeBg = 'bg-teal-700 text-white scale-110 shadow-md';
  } else if (badgeStatus === 'success') {
    badgeBg = 'bg-emerald-600 text-white shadow-sm';
  } else if (badgeStatus === 'wrong') {
    badgeBg = 'bg-rose-600 text-white animate-pulse shadow-sm';
  }

  return (
    <div className={`relative inline-flex items-center select-none ${className}`}>
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
        role="button"
        tabIndex={0}
        aria-label="Child Nutrition Support"
        className={`heart-wrap group focus:outline-none rounded-full p-0.5 cursor-pointer ${
          isShaking ? 'animate-heart-shake' : ''
        }`}
        style={{
          perspective: '150px',
        }}
      >
        {/* Main Heart Container with Liquid Wave */}
        <div
          className={`heart relative transition-all duration-300 ${
            stage === 3 ? 'heart-unlocked-glow ring-1 ring-teal-400/60' : ''
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
              backgroundColor: stage === 3 ? 'rgb(13, 148, 136)' : 'rgb(103, 130, 191)',
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
                fill={stage === 3 ? 'rgba(20, 184, 166, 0.5)' : 'rgba(103, 130, 191, 0.5)'}
              />
              <use
                href="#gentle-wave"
                xlinkHref="#gentle-wave"
                x="48"
                y="1"
                fill={stage === 3 ? 'rgba(20, 184, 166, 0.3)' : 'rgba(103, 130, 191, 0.3)'}
              />
              <use
                href="#gentle-wave"
                xlinkHref="#gentle-wave"
                x="48"
                y="2"
                fill={stage === 3 ? 'rgba(13, 148, 136, 1)' : 'rgba(103, 130, 191, 1)'}
              />
            </g>
          </svg>
        </div>

        {/* Passcode Click Counter Badge */}
        <div
          className={`absolute -bottom-1 -right-1 flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-bold border-2 border-white shadow-xs transition-all duration-200 select-none ${badgeBg}`}
        >
          <span>{displayValue}</span>
        </div>
      </div>
    </div>
  );
}
