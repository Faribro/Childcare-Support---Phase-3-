'use client';

import React, { useState, useEffect } from 'react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

interface AnimatedHeartUnlockProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function AnimatedHeartUnlock({ className = '', size = 'md' }: AnimatedHeartUnlockProps) {
  const { isUnlocked, unlock, lock } = useEvaluationAccess();

  // Compact, discreet dimensions for seamless secret integration
  const dims = size === 'xs'
    ? { width: 22, height: 20, curve: 6, maxTank: 20 }
    : size === 'sm'
    ? { width: 26, height: 23, curve: 7, maxTank: 23 }
    : size === 'lg'
    ? { width: 38, height: 33, curve: 10, maxTank: 33 }
    : { width: 30, height: 26, curve: 8, maxTank: 26 }; // default md

  const [counter, setCounter] = useState<number>(0);
  const [isPumping, setIsPumping] = useState<boolean>(false);

  // Synchronize counter if already unlocked in localStorage on page load
  useEffect(() => {
    if (isUnlocked && counter === 0) {
      setCounter(3);
    } else if (!isUnlocked && counter === 3) {
      setCounter(0);
    }
  }, [isUnlocked, counter]);

  // Scaled tank fill levels (in pixels)
  const tankLevels = [
    0,
    Math.round(dims.maxTank * 0.36),
    Math.round(dims.maxTank * 0.70),
    dims.maxTank,
  ];

  // Curve bottom positions (curve floats on top of the liquid in tank)
  const curveLevels = [
    -dims.curve,
    Math.round(dims.maxTank * 0.36) - 3,
    Math.round(dims.maxTank * 0.70) - 3,
    dims.maxTank - 3,
  ];

  const pumpLevelsZ = [8, 12, 16, 0];

  const handleHeartClick = () => {
    if (isPumping) return;

    setIsPumping(true);

    const nextCounter = counter >= 3 ? 0 : counter + 1;
    setCounter(nextCounter);

    if (nextCounter === 3) {
      // 3 clicks reached -> Silently unlock Evaluation portal
      unlock();
    } else if (nextCounter === 0) {
      // Reset back to locked
      lock();
    }

    // Pump forward then return
    setTimeout(() => {
      setIsPumping(false);
    }, 400);
  };

  const currentTankHeight = tankLevels[counter] || 0;
  const currentCurveBottom = curveLevels[counter] !== undefined ? curveLevels[counter] : -dims.curve;
  const currentPumpZ = isPumping ? pumpLevelsZ[counter] || 10 : 0;
  const currentScale = isPumping ? 1.12 : 1;

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
        className="heart-wrap group focus:outline-none rounded-full p-0.5"
        style={{
          perspective: '150px',
        }}
      >
        {/* Main Heart Container with Liquid Wave */}
        <div
          className={`heart relative transition-all duration-300 ${
            counter === 3 ? 'heart-unlocked-glow ring-1 ring-teal-400/60' : ''
          }`}
          style={{
            width: `${dims.width}px`,
            height: `${dims.height}px`,
            clipPath: 'url(#myPath)',
            WebkitClipPath: 'url(#myPath)',
            backgroundImage: 'radial-gradient(#c9d8f5 60%, #afc4ee)',
            transform: `translateZ(${currentPumpZ}px) scale(${currentScale})`,
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease',
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
      </div>
    </div>
  );
}
