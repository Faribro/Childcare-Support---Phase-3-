'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { Lock, Unlock, Sparkles } from 'lucide-react';

interface AnimatedHeartUnlockProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AnimatedHeartUnlock({ className = '', size = 'md' }: AnimatedHeartUnlockProps) {
  const { isUnlocked, unlock, lock } = useEvaluationAccess();

  // Dimensions based on size
  // Default md: width 50px, height 44px, curve 14px
  const dims = size === 'sm' 
    ? { width: 40, height: 35, curve: 11, maxTank: 35 }
    : size === 'lg'
    ? { width: 64, height: 56, curve: 16, maxTank: 56 }
    : { width: 50, height: 44, curve: 14, maxTank: 44 };

  const [counter, setCounter] = useState<number>(0);
  const [isPumping, setIsPumping] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  // Synchronize counter if already unlocked in localStorage on page load
  useEffect(() => {
    if (isUnlocked && counter === 0) {
      setCounter(3);
    } else if (!isUnlocked && counter === 3) {
      setCounter(0);
    }
  }, [isUnlocked, counter]);

  // Scaled tank fill levels (in pixels)
  // Level 0: 0 fill
  // Level 1: ~35% fill
  // Level 2: ~68% fill
  // Level 3: 100% full (unlocked!)
  const tankLevels = [
    0,
    Math.round(dims.maxTank * 0.36),
    Math.round(dims.maxTank * 0.70),
    dims.maxTank,
  ];

  // Curve bottom positions (curve floats on top of the liquid in tank)
  const curveLevels = [
    -dims.curve,
    Math.round(dims.maxTank * 0.36) - 4,
    Math.round(dims.maxTank * 0.70) - 4,
    dims.maxTank - 4,
  ];

  const pumpLevelsZ = [12, 18, 24, 0];

  const handleHeartClick = () => {
    if (isPumping) return;

    setIsPumping(true);

    const nextCounter = counter >= 3 ? 0 : counter + 1;
    setCounter(nextCounter);

    if (nextCounter === 3) {
      // 3 clicks reached -> UNLOCK EVALUATION!
      unlock();
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
    } else if (nextCounter === 0) {
      // Reset back to locked
      lock();
    }

    // Pump forward then return
    setTimeout(() => {
      setIsPumping(false);
    }, 450);
  };

  const currentTankHeight = tankLevels[counter] || 0;
  const currentCurveBottom = curveLevels[counter] !== undefined ? curveLevels[counter] : -dims.curve;
  const currentPumpZ = isPumping ? pumpLevelsZ[counter] || 15 : 0;
  const currentScale = isPumping ? 1.14 : 1;

  const getTooltipText = () => {
    if (counter === 0) return 'Evaluation Locked 🔒 (Click 3 times to unlock)';
    if (counter === 1) return 'Pumping... (1/3) • 2 more clicks';
    if (counter === 2) return 'Almost Full! (2/3) • 1 more click';
    return '🎉 Evaluation Unlocked! 🔓 (Click to lock)';
  };

  return (
    <div
      className={`relative inline-flex items-center select-none ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* SVG ClipPath Definition & Wave Path */}
      <svg width="0" height="0" className="absolute pointer-events-none opacity-0" aria-hidden="true">
        <defs>
          <clipPath id="myPath" clipPathUnits="objectBoundingBox">
            <path d="M0.498,1 s0.243,-0.102,0.394,-0.323 S1,0.14,0.864,0.033 S0.498,0.141,0.498,0.141 S0.291,-0.08,0.124,0.031 s-0.159,0.434,-0.021,0.646 S0.498,1,0.498,1" />
          </clipPath>
          <clipPath id="animatedHeartPath" clipPathUnits="objectBoundingBox">
            <path d="M0.498,1 s0.243,-0.102,0.394,-0.323 S1,0.14,0.864,0.033 S0.498,0.141,0.498,0.141 S0.291,-0.08,0.124,0.031 s-0.159,0.434,-0.021,0.646 S0.498,1,0.498,1" />
          </clipPath>
        </defs>
      </svg>

      {/* 3D Heart Wrapper */}
      <div
        onClick={handleHeartClick}
        role="button"
        tabIndex={0}
        aria-label="Liquid pumping heart to unlock evaluation portal"
        className="heart-wrap group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-full p-1"
        style={{
          perspective: '200px',
        }}
      >
        {/* Main Heart Container with Liquid Wave */}
        <div
          className={`heart relative transition-all duration-300 ${
            counter === 3 ? 'heart-unlocked-glow ring-2 ring-teal-400/80' : ''
          }`}
          style={{
            width: `${dims.width}px`,
            height: `${dims.height}px`,
            clipPath: 'url(#myPath)',
            WebkitClipPath: 'url(#myPath)',
            backgroundImage: 'radial-gradient(#c9d8f5 60%, #afc4ee)',
            transform: `translateZ(${currentPumpZ}px) scale(${currentScale})`,
            transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease',
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
              backgroundColor: counter === 3 ? 'rgb(13, 148, 136)' : 'rgb(103, 130, 191)',
              zIndex: 5,
              transition: 'height 0.5s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.4s ease',
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
              transition: 'bottom 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
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
                fill={counter === 3 ? 'rgba(20, 184, 166, 0.5)' : 'rgba(103, 130, 191, 0.5)'}
              />
              <use
                href="#gentle-wave"
                xlinkHref="#gentle-wave"
                x="48"
                y="1"
                fill={counter === 3 ? 'rgba(20, 184, 166, 0.3)' : 'rgba(103, 130, 191, 0.3)'}
              />
              <use
                href="#gentle-wave"
                xlinkHref="#gentle-wave"
                x="48"
                y="2"
                fill={counter === 3 ? 'rgba(13, 148, 136, 1)' : 'rgba(103, 130, 191, 1)'}
              />
            </g>
          </svg>
        </div>

        {/* Micro Status Lock Indicator Badge */}
        <div
          className={`absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full border border-white text-[9px] font-bold shadow-xs transition-colors ${
            counter === 3
              ? 'bg-emerald-600 text-white animate-bounce'
              : counter > 0
              ? 'bg-amber-500 text-white'
              : 'bg-slate-500 text-white'
          }`}
          title={counter === 3 ? 'Unlocked' : `${counter}/3 clicks`}
        >
          {counter === 3 ? (
            <Unlock className="w-2.5 h-2.5 stroke-[2.5]" />
          ) : (
            <span>{counter}</span>
          )}
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {showTooltip && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in duration-150">
          <span>{getTooltipText()}</span>
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-900" />
        </div>
      )}

      {/* Success Unlocked Toast Notification */}
      {showToast && (
        <div className="fixed top-20 right-6 z-50 flex items-center space-x-3 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-teal-500/40 animate-in slide-in-from-top-4 duration-300">
          <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center space-x-1.5">
              <span>Evaluation Portal Unlocked!</span>
              <span className="px-1.5 py-0.2 bg-teal-500 text-slate-950 rounded text-[10px] font-extrabold uppercase">
                ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              The Evaluation tab is now active in the navigation bar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
