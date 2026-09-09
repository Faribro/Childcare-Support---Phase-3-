'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

interface AnimatedHeartUnlockProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

// Secret passcodes accepted: 132, 312, 332, 321
const VALID_PASSCODES = ['132', '312', '332', '321'];

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

  // Slot states: [slot0, slot1, slot2]
  const [slots, setSlots] = useState<(number | null)[]>([null, null, null]);
  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [currentClicks, setCurrentClicks] = useState<number>(0);
  const [isPumping, setIsPumping] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'clicking' | 'locked-slot' | 'success' | 'wrong'>('idle');

  const commitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronize state with persistent unlock status
  useEffect(() => {
    if (isUnlocked) {
      setSlots([1, 3, 2]);
      setActiveSlot(3);
      setStatus('success');
    } else {
      setSlots([null, null, null]);
      setActiveSlot(0);
      setCurrentClicks(0);
      setStatus('idle');
    }
  }, [isUnlocked]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Liquid tank fill levels (in pixels) based on completed slots
  const completedCount = slots.filter((s) => s !== null).length;
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

  const resetAll = () => {
    setSlots([null, null, null]);
    setActiveSlot(0);
    setCurrentClicks(0);
    setStatus('idle');
  };

  const handleHeartClick = () => {
    // If already unlocked, clicking it will lock it back and reset
    if (isUnlocked || activeSlot >= 3) {
      lock();
      resetAll();
      return;
    }

    if (isShaking) return;

    // Pump pulse animation
    setIsPumping(true);
    setTimeout(() => setIsPumping(false), 220);

    // Reset idle timeout (if no click for 9 seconds, resets)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      resetAll();
    }, 9000);

    const nextClicks = currentClicks + 1;
    setCurrentClicks(nextClicks);
    setStatus('clicking');

    // Clear previous commit timer
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);

    // Commit digit after 850ms pause in clicks
    commitTimerRef.current = setTimeout(() => {
      const lockedVal = nextClicks;
      const newSlots = [...slots];
      newSlots[activeSlot] = lockedVal;
      setSlots(newSlots);
      setCurrentClicks(0);

      if (activeSlot === 0) {
        // Slot 0 locked! Reveal two dashes: e.g. "3 - -"
        setActiveSlot(1);
        setStatus('locked-slot');
      } else if (activeSlot === 1) {
        // Slot 1 locked! E.g. "3 1 -"
        setActiveSlot(2);
        setStatus('locked-slot');
      } else if (activeSlot === 2) {
        // Final slot locked! Check passcode
        const passcodeStr = `${newSlots[0]}${newSlots[1]}${lockedVal}`;
        if (VALID_PASSCODES.includes(passcodeStr)) {
          // Success! Unlock!
          unlock();
          setActiveSlot(3);
          setStatus('success');
        } else {
          // Wrong passcode: shake and reset
          setIsShaking(true);
          setStatus('wrong');
          setTimeout(() => {
            setIsShaking(false);
            resetAll();
          }, 800);
        }
      }
    }, 850);
  };

  const currentTankHeight = isUnlocked ? dims.maxTank : (tankLevels[completedCount] || 0);
  const currentCurveBottom = isUnlocked ? dims.maxTank - 3 : (curveLevels[completedCount] !== undefined ? curveLevels[completedCount] : -dims.curve);
  const currentPumpZ = isPumping ? (pumpLevelsZ[completedCount] || 10) : 0;
  const currentScale = isPumping ? 1.12 : 1;

  // Render badge content
  const renderBadgeContent = () => {
    if (isUnlocked || status === 'success') {
      return <span>✓</span>;
    }

    if (status === 'wrong') {
      return <span>✕</span>;
    }

    // Initial state before locking slot 0
    if (activeSlot === 0 && slots[0] === null) {
      return <span>{currentClicks > 0 ? currentClicks : 0}</span>;
    }

    // Multi-slot mode: displays locked numbers and dashes (e.g. 3 - -)
    return (
      <span className="flex items-center space-x-1 tracking-tight font-mono text-[9px]">
        <span className={activeSlot === 0 ? 'text-amber-300 font-black scale-110' : 'text-white'}>
          {activeSlot === 0 && currentClicks > 0 ? currentClicks : (slots[0] ?? '-')}
        </span>
        <span className="text-slate-300 opacity-60">·</span>
        <span className={activeSlot === 1 ? 'text-amber-300 font-black scale-110' : 'text-white'}>
          {activeSlot === 1 && currentClicks > 0 ? currentClicks : (slots[1] ?? '-')}
        </span>
        <span className="text-slate-300 opacity-60">·</span>
        <span className={activeSlot === 2 ? 'text-amber-300 font-black scale-110' : 'text-white'}>
          {activeSlot === 2 && currentClicks > 0 ? currentClicks : (slots[2] ?? '-')}
        </span>
      </span>
    );
  };

  const isExpandedPill = activeSlot > 0 || (activeSlot === 0 && slots[0] !== null);

  let badgeBg = 'bg-[#506079] text-white';
  if (status === 'clicking') {
    badgeBg = 'bg-purple-700 text-white shadow-md ring-1 ring-purple-300';
  } else if (status === 'success') {
    badgeBg = 'bg-emerald-600 text-white shadow-sm';
  } else if (status === 'wrong') {
    badgeBg = 'bg-rose-600 text-white animate-pulse shadow-sm';
  } else if (status === 'locked-slot') {
    badgeBg = 'bg-[#3e4c63] text-white shadow-xs';
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

        {/* Passcode Click Counter Badge: starts as (0) circle, expands to (3 - -) pill */}
        <div
          className={`absolute -bottom-1 -right-1 flex items-center justify-center ${
            isExpandedPill ? 'px-1.5 h-[18px] min-w-[34px] rounded-full' : 'w-[18px] h-[18px] rounded-full'
          } text-[10px] font-bold border-2 border-white shadow-xs transition-all duration-200 select-none ${badgeBg}`}
        >
          {renderBadgeContent()}
        </div>
      </div>
    </div>
  );
}
