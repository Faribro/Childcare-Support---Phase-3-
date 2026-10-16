'use client';

import React, { useRef, useEffect, useState, useId } from 'react';
import { line as d3Line, curveBasis } from 'd3';
import { useScrollPhysics } from './motion/useScrollPhysics';

interface LivingRiverProps {
  className?: string;
}

/**
 * MOMENT B — THE LIVING RIVER
 *
 * A signature, scroll-responsive liquid SVG transition with 3 distinct deformable layers:
 * 1. Back Layer: Deep Forest Undercurrent (#092E1B)
 * 2. Mid Layer: Olive Flow Current (#164E32)
 * 3. Fore Layer: Living River Surface (#0F5132) seamlessly fusing with FinalCta
 * Plus an Ochre Paper-Crest foam edge (#E8DEC8) accentuating the liquid surface.
 *
 * Physics & Behaviour:
 * - D3 spline curve deformation (d3.curveBasis) over dynamic harmonic control points.
 * - Layer-differentiated phase offsets, amplitudes, and harmonic frequencies.
 * - Scroll-velocity response: faster scroll smoothly deforms wave crests up to a bounded maximum.
 * - Directional awareness: scrolling upward flows backward; downward flows forward.
 * - Damped settling: stops smoothly and oscillates gently back to ambient breathing state.
 * - Full static fallback for prefers-reduced-motion.
 * - Zero seams or horizontal overflow.
 */
export function LivingRiver({ className = '' }: LivingRiverProps) {
  const riverId = useId();
  const physics = useScrollPhysics();
  const [ambientTime, setAmbientTime] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Width coordinates for SVG viewBox: 0 to 1200, height 120
  const SVG_WIDTH = 1200;
  const SVG_HEIGHT = 120;
  const NUM_POINTS = 9;

  // Ambient time progression loop for continuous subtle water breathing
  useEffect(() => {
    if (physics.isReducedMotion) return;

    let lastT = performance.now();
    let currentT = 0;
    let animId: number;

    const tick = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;

      // When scrolling, phase speeds up proportional to velocity
      const velocityBonus = Math.abs(physics.normalizedVelocity) * 2.5;
      const speed = 0.8 + velocityBonus;
      const direction = physics.normalizedVelocity >= 0 ? 1 : -1;

      currentT += dt * speed * direction;
      setAmbientTime(currentT);

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    rafRef.current = animId;

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [physics.isReducedMotion, physics.normalizedVelocity]);

  // D3 line generator with cubic B-spline smoothing
  const splineGenerator = d3Line<[number, number]>().curve(curveBasis);

  /**
   * Computes a deformable wave path for a specific layer.
   */
  const computeWavePath = (
    baseY: number,
    baseAmp: number,
    maxAmp: number,
    freq: number,
    phaseOffset: number,
    velocityInfluence: number
  ): string => {
    if (physics.isReducedMotion) {
      // Static, elegant composed curve for reduced motion
      const staticPoints: [number, number][] = [];
      for (let i = 0; i <= NUM_POINTS; i++) {
        const x = (i / NUM_POINTS) * SVG_WIDTH;
        const y = baseY + Math.sin((x / SVG_WIDTH) * Math.PI * 2 * freq + phaseOffset) * baseAmp;
        staticPoints.push([x, y]);
      }
      const curve = splineGenerator(staticPoints) || '';
      return `${curve} L ${SVG_WIDTH} ${SVG_HEIGHT} L 0 ${SVG_HEIGHT} Z`;
    }

    const velocity = physics.normalizedVelocity;
    // Dynamic amplitude: expands smoothly with scroll speed
    const dynamicAmp = Math.min(
      maxAmp,
      baseAmp + Math.abs(velocity) * (maxAmp - baseAmp) * velocityInfluence
    );

    const points: [number, number][] = [];
    for (let i = 0; i <= NUM_POINTS; i++) {
      const x = (i / NUM_POINTS) * SVG_WIDTH;
      const nx = x / SVG_WIDTH;

      // Dual harmonic superposition for organic water deformation
      const wave1 = Math.sin(nx * Math.PI * 2 * freq + ambientTime + phaseOffset);
      const wave2 = Math.cos(nx * Math.PI * 4 * freq + ambientTime * 0.7 - phaseOffset) * 0.35;
      
      // Velocity shear: causes asymmetric wave crest tilting during rapid scroll
      const shear = velocity * Math.sin(nx * Math.PI * 3) * 6;

      const y = Math.max(10, Math.min(SVG_HEIGHT - 10, baseY + (wave1 + wave2) * dynamicAmp + shear));
      points.push([x, y]);
    }

    const curve = splineGenerator(points) || '';
    return `${curve} L ${SVG_WIDTH} ${SVG_HEIGHT} L 0 ${SVG_HEIGHT} Z`;
  };

  /**
   * Computes the single crest line for the top foam accent.
   */
  const computeCrestPath = (
    baseY: number,
    baseAmp: number,
    maxAmp: number,
    freq: number,
    phaseOffset: number
  ): string => {
    if (physics.isReducedMotion) {
      const staticPoints: [number, number][] = [];
      for (let i = 0; i <= NUM_POINTS; i++) {
        const x = (i / NUM_POINTS) * SVG_WIDTH;
        const y = baseY + Math.sin((x / SVG_WIDTH) * Math.PI * 2 * freq + phaseOffset) * baseAmp;
        staticPoints.push([x, y]);
      }
      return splineGenerator(staticPoints) || '';
    }

    const velocity = physics.normalizedVelocity;
    const dynamicAmp = Math.min(
      maxAmp,
      baseAmp + Math.abs(velocity) * (maxAmp - baseAmp) * 0.9
    );

    const points: [number, number][] = [];
    for (let i = 0; i <= NUM_POINTS; i++) {
      const x = (i / NUM_POINTS) * SVG_WIDTH;
      const nx = x / SVG_WIDTH;
      const wave = Math.sin(nx * Math.PI * 2 * freq + ambientTime + phaseOffset);
      const y = Math.max(10, Math.min(SVG_HEIGHT - 10, baseY + wave * dynamicAmp));
      points.push([x, y]);
    }

    return splineGenerator(points) || '';
  };

  // Layer 1 (Back Deep River Bed): baseY = 36, deeper amplitude
  const pathLayer1 = computeWavePath(36, 14, 38, 1.2, 0.0, 0.85);
  // Layer 2 (Mid Olive Current): baseY = 48, medium amplitude, phase shifted
  const pathLayer2 = computeWavePath(48, 16, 42, 1.8, 2.1, 0.95);
  // Layer 3 (Fore Living River Surface): baseY = 58, exact #0F5132 fill to match CTA
  const pathLayer3 = computeWavePath(58, 18, 48, 1.5, 4.3, 1.0);
  // Crest accent tracing the forefront surface
  const crestLine = computeCrestPath(58, 18, 48, 1.5, 4.3);

  return (
    <div
      className={`relative w-full overflow-hidden select-none pointer-events-none ${className}`}
      style={{ lineHeight: 0 }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-16 sm:h-24 md:h-28 block"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Subtle gradient for deep atmospheric depth */}
          <linearGradient id={`${riverId}-depth`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0B331F" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#072013" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id={`${riverId}-mid`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1B5C3B" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0F261B" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* ── Layer 1: Deep Forest Undercurrent (Back) ── */}
        <path
          d={pathLayer1}
          fill={`url(#${riverId}-depth)`}
          className="transition-colors duration-300"
        />

        {/* ── Layer 2: Olive Current (Mid) ── */}
        <path
          d={pathLayer2}
          fill={`url(#${riverId}-mid)`}
          className="transition-colors duration-300 opacity-90"
        />

        {/* ── Layer 3: Living River Surface (Forefront) ── */}
        <path
          d={pathLayer3}
          fill="#0F261B"
          className="transition-colors duration-300"
        />

        {/* ── Foam / Parchment Edge Crest Accent ── */}
        <path
          d={crestLine}
          fill="none"
          stroke="#E8DEC8"
          strokeWidth="1.75"
          strokeDasharray="8 4"
          className="opacity-45"
        />
      </svg>
    </div>
  );
}
