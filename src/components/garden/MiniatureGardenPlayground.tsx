'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';

interface MountainPeak {
  /** Center X as a 0..1 ratio of canvas width */
  xRatio: number;
  /** Half-width as a 0..1 ratio of canvas width */
  halfWidthRatio: number;
  /** Peak height above baseY as a 0..1 ratio of canvas height */
  heightRatio: number;
  /** Snow coverage down from summit (0.28 - 0.42 looks natural) */
  snowDepth: number;
  /** Distant misty ridge vs. foreground lush green ridge */
  layer: 'far' | 'near';
}

function drawAlpineMountains(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseY: number // Pass river far shoreline Y (e.g. height * 0.74)
) {
  // Overlapping multi-peak ranges framing the central waterfall valley (~0.48)
  const peaks: MountainPeak[] = [
    // Far atmospheric mountain range (cooler misty sage-teal for depth)
    { xRatio: 0.14, halfWidthRatio: 0.14, heightRatio: 0.56, snowDepth: 0.34, layer: 'far' },
    { xRatio: 0.33, halfWidthRatio: 0.13, heightRatio: 0.48, snowDepth: 0.30, layer: 'far' },
    { xRatio: 0.66, halfWidthRatio: 0.14, heightRatio: 0.52, snowDepth: 0.32, layer: 'far' },
    { xRatio: 0.86, halfWidthRatio: 0.15, heightRatio: 0.58, snowDepth: 0.36, layer: 'far' },

    // Near lush alpine range (tucking smoothly toward the center waterfall gorge)
    { xRatio: 0.04, halfWidthRatio: 0.13, heightRatio: 0.44, snowDepth: 0.28, layer: 'near' },
    { xRatio: 0.24, halfWidthRatio: 0.15, heightRatio: 0.60, snowDepth: 0.36, layer: 'near' },
    { xRatio: 0.39, halfWidthRatio: 0.11, heightRatio: 0.36, snowDepth: 0.24, layer: 'near' },
    { xRatio: 0.58, halfWidthRatio: 0.11, heightRatio: 0.38, snowDepth: 0.25, layer: 'near' },
    { xRatio: 0.76, halfWidthRatio: 0.16, heightRatio: 0.62, snowDepth: 0.38, layer: 'near' },
    { xRatio: 0.96, halfWidthRatio: 0.13, heightRatio: 0.46, snowDepth: 0.28, layer: 'near' },
  ];

  // Clamp peak width on narrow mobile screens so summits stay crisp & iconic
  const minHalfW = Math.max(42, width * 0.08);

  peaks.forEach((p) => {
    const cx = p.xRatio * width;
    const hw = Math.max(minHalfW, p.halfWidthRatio * width);
    const peakH = Math.min(baseY - 6, p.heightRatio * height);
    const topY = baseY - peakH;
    const leftX = cx - hw;
    const rightX = cx + hw;
    const isFar = p.layer === 'far';

    // Define crisp mountain silhouette with a softly natural apex
    const tracePeakPath = () => {
      ctx.beginPath();
      ctx.moveTo(leftX, baseY + 2);
      ctx.lineTo(cx - hw * 0.09, topY + peakH * 0.07);
      ctx.quadraticCurveTo(cx, topY - 1.5, cx + hw * 0.09, topY + peakH * 0.07);
      ctx.lineTo(rightX, baseY + 2);
      ctx.closePath();
    };

    ctx.save();
    tracePeakPath();

    // 1) Base sunlit mountain gradient (sunlight from upper-right)
    const bodyGrad = ctx.createLinearGradient(cx, topY, cx, baseY);
    if (isFar) {
      bodyGrad.addColorStop(0, '#4E8F85');
      bodyGrad.addColorStop(0.55, '#3A7C6A');
      bodyGrad.addColorStop(1, '#2B6456');
    } else {
      bodyGrad.addColorStop(0, '#3C9154');
      bodyGrad.addColorStop(0.55, '#2A7343');
      bodyGrad.addColorStop(1, '#1D5635');
    }
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Clip all ridge shading & snow strictly inside the mountain silhouette
    ctx.clip();

    // 2) Shaded left facet split down a gently curved central ridge line
    const ridgeOffset = hw * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx, topY - 2);
    ctx.quadraticCurveTo(cx - ridgeOffset, topY + peakH * 0.45, cx + ridgeOffset * 0.8, baseY + 2);
    ctx.lineTo(leftX - 4, baseY + 2);
    ctx.closePath();
    ctx.fillStyle = isFar ? 'rgba(20, 62, 74, 0.32)' : 'rgba(12, 48, 38, 0.34)';
    ctx.fill();

    // 3) Organic draped snowcap (never flat sawtooth teeth)
    const snowY = topY + peakH * p.snowDepth;
    const snowSpan = hw * (p.snowDepth + 0.12);

    ctx.beginPath();
    ctx.moveTo(cx - snowSpan, topY - 4);
    ctx.lineTo(cx + snowSpan, topY - 4);
    ctx.lineTo(cx + snowSpan, snowY + 2);
    // Natural draped snowline with 3 smooth asymmetrical lobes
    ctx.bezierCurveTo(
      cx + snowSpan * 0.58, snowY - 5,
      cx + snowSpan * 0.34, snowY + 8,
      cx + snowSpan * 0.08, snowY + 1
    );
    ctx.bezierCurveTo(
      cx - snowSpan * 0.14, snowY - 4,
      cx - snowSpan * 0.42, snowY + 7,
      cx - snowSpan, snowY - 1
    );
    ctx.closePath();

    // Sunlit warm-white snow fill
    const snowGrad = ctx.createLinearGradient(cx, topY, cx, snowY + 6);
    snowGrad.addColorStop(0, '#FFFFFF');
    snowGrad.addColorStop(0.75, '#F0F9FF');
    snowGrad.addColorStop(1, '#D8F1FF');
    ctx.fillStyle = snowGrad;
    ctx.fill();

    // Cool glacial blue-ice shadow on the left half of the snowcap (keeps it visible against white clouds!)
    ctx.beginPath();
    ctx.moveTo(cx, topY - 2);
    ctx.quadraticCurveTo(cx - ridgeOffset * 0.7, topY + peakH * 0.22, cx + ridgeOffset * 0.2, snowY + 10);
    ctx.lineTo(cx - snowSpan, snowY + 10);
    ctx.lineTo(cx - snowSpan, topY - 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(125, 211, 252, 0.42)';
    ctx.fill();

    // 4) Soft atmospheric base mist right above the river bank
    const mistGrad = ctx.createLinearGradient(0, baseY - peakH * 0.24, 0, baseY);
    mistGrad.addColorStop(0, 'rgba(224, 247, 255, 0)');
    mistGrad.addColorStop(1, isFar ? 'rgba(186, 230, 253, 0.28)' : 'rgba(186, 230, 253, 0.14)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(leftX, baseY - peakH * 0.24, hw * 2, peakH * 0.26);

    ctx.restore();

    // 5) Crisp subtle glacial rim outline along the upper summit so snow pops over white clouds
    ctx.save();
    tracePeakPath();
    ctx.strokeStyle = isFar ? 'rgba(125, 211, 252, 0.55)' : 'rgba(96, 165, 250, 0.52)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });
}

export interface MiniatureGardenPlaygroundProps {
  hideControls?: boolean;
  isPaused?: boolean;
  /** Blend seamlessly into the parent sky without a boxed border or opaque sky fill */
  transparentSky?: boolean;
  className?: string;
}

export function MiniatureGardenPlayground({
  hideControls = false,
  isPaused: externalPaused,
  transparentSky = false,
  className = '',
}: MiniatureGardenPlaygroundProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [internalPaused, setInternalPaused] = useState(false);
  const isPaused = externalPaused !== undefined ? externalPaused : internalPaused;

  const pausedRef = useRef(isPaused);
  const resumeLoopRef = useRef<(() => void) | null>(null);

  // Sync external/internal pause state without resetting the simulation
  useEffect(() => {
    pausedRef.current = isPaused;
    if (!isPaused) {
      resumeLoopRef.current?.();
    }
  }, [isPaused]);

  // Respect prefers-reduced-motion only when uncontrolled
  useEffect(() => {
    if (externalPaused !== undefined) return;
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setInternalPaused(true);
      pausedRef.current = true;
    }
  }, [externalPaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Offscreen static scenery cache (rebuilt only on resize)
    const staticCanvas = document.createElement('canvas');
    const staticCtx = staticCanvas.getContext('2d', { alpha: true });

    let animationFrameId = 0;
    let isRunning = false;
    let isVisible = true;
    let isDocVisible = typeof document !== 'undefined' ? !document.hidden : true;
    let lastTimestamp = 0;
    let time = 0; // Normalized 60fps-equivalent tick clock

    let width = 0;
    let height = 0;
    let dpr = 1;

    // Interactive wind gust & mango tree shake
    let windGust = 0;
    let treeShake = 0;

    // Rolling hill elevation formula
    const getGroundY = (x: number, w: number, h: number) => {
      const normalizedX = Math.max(0, Math.min(1, x / (w || 1)));
      const arch = Math.sin(normalizedX * Math.PI) * (h * 0.12);
      return h * 0.90 - arch;
    };

    // Soccer Goal Dimensions (scaled safely for narrow 360px phones)
    const goal = {
      mouthX: 44,
      backX: 14,
      height: 22,
      netBulge: 0,
      netBulgeVel: 0,
    };

    // Goal event tracking
    let goalState: 'play' | 'celebrating' = 'play';
    let passCount = 0;
    let goalTimer = 0;
    let scorerId: number | null = null;

    // ─── Hopscotch & Beanbag Toss Game State ───
    let hopscotchTimer = 0;
    const beanbag = {
      x: 0,
      y: 0,
      visible: true,
    };

    // ─── River Jumping Fish & Splash Ripples State ───
    interface RiverFish {
      baseRatio: number;
      curX: number;
      curY: number;
      facing: 1 | -1;
      state: 'underwater' | 'leaping';
      timer: number;
      leapDuration: number;
      leapProgress: number;
      startX: number;
      targetX: number;
      apexHeight: number;
      color: string;
      bellyColor: string;
    }

    const riverFish: RiverFish[] = [
      {
        baseRatio: 0.22,
        curX: 0,
        curY: 0,
        facing: 1,
        state: 'underwater',
        timer: 45,
        leapDuration: 34,
        leapProgress: 0,
        startX: 0,
        targetX: 0,
        apexHeight: 11,
        color: '#f97316',
        bellyColor: '#fef08a',
      },
      {
        baseRatio: 0.65,
        curX: 0,
        curY: 0,
        facing: -1,
        state: 'underwater',
        timer: 155,
        leapDuration: 36,
        leapProgress: 0,
        startX: 0,
        targetX: 0,
        apexHeight: 13,
        color: '#fb923c',
        bellyColor: '#ffffff',
      },
      {
        baseRatio: 0.88,
        curX: 0,
        curY: 0,
        facing: 1,
        state: 'underwater',
        timer: 265,
        leapDuration: 32,
        leapProgress: 0,
        startX: 0,
        targetX: 0,
        apexHeight: 10,
        color: '#0284c7',
        bellyColor: '#e0f2fe',
      },
    ];

    interface RiverRipple {
      x: number;
      y: number;
      r: number;
      maxR: number;
      alpha: number;
      speed: number;
    }
    const riverRipples: RiverRipple[] = [];

    interface RiverDroplet {
      x: number;
      y: number;
      vx: number;
      vy: number;
      alpha: number;
    }
    const riverDroplets: RiverDroplet[] = [];

    // Capped particle list for zero-stutter GC on mid-range Android
    const MAX_PARTICLES = 48;
    const celebrationParticles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      life: number;
      rot: number;
      vrot: number;
    }> = [];

    const spawnParticle = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      size: number,
      color: string,
      life = 1
    ) => {
      if (celebrationParticles.length >= MAX_PARTICLES) {
        celebrationParticles.shift();
      }
      celebrationParticles.push({
        x,
        y,
        vx,
        vy,
        size,
        color,
        life,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.25,
      });
    };

    // Interactive Soccer Ball with squash & stretch
    const ball = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 5.2,
      rotation: 0,
      rotSpeed: 0,
      bounciness: 0.54,
      lastKickerId: 3,
      inNet: false,
      initialized: false,
      stillFrames: 0,
      scaleX: 1,
      scaleY: 1,
    };

    // Mango Tree state
    const mangoTree = {
      xRatio: 0.24,
      mangoes: [
        { id: 1, relX: -8, relY: -28, isFalling: false, curY: 0, vy: 0 },
        { id: 2, relX: 6, relY: -26, isFalling: false, curY: 0, vy: 0 },
        { id: 3, relX: -2, relY: -33, isFalling: false, curY: 0, vy: 0 },
      ],
      slingshotPebble: { active: false, x: 0, y: 0, vx: 0, vy: 0, targetMangoId: 1 },
      basketMangoCount: 2,
    };

    // Width-relative Butterflies (always visible on 360px phones)
    const butterflies = [
      { ratioX: 0.22, x: 0, y: 26, vx: 0.45, vy: 0, wingAngle: 0, wingSpeed: 0.28, color: '#f43f5e', size: 2.9 },
      { ratioX: 0.56, x: 0, y: 22, vx: -0.5, vy: 0, wingAngle: 1.2, wingSpeed: 0.31, color: '#0ea5e9', size: 3.0 },
      { ratioX: 0.82, x: 0, y: 30, vx: 0.4, vy: 0, wingAngle: 2.1, wingSpeed: 0.26, color: '#f59e0b', size: 2.8 },
    ];

    // Width-relative Clouds (only drawn if sky is not transparent, or ultra-soft wisps)
    const clouds = [
      { ratioX: 0.16, x: 0, y: 16, speed: 0.14, scale: 0.72, opacity: 0.65 },
      { ratioX: 0.54, x: 0, y: 12, speed: 0.11, scale: 0.85, opacity: 0.72 },
      { ratioX: 0.86, x: 0, y: 18, speed: 0.16, scale: 0.66, opacity: 0.6 },
    ];

    interface PlayingChild {
      id: number;
      baseRatioX: number;
      curX: number;
      yOffset: number;
      vy: number;
      activity:
        | 'soccer-striker'
        | 'slingshot-hunter'
        | 'soccer-midfield'
        | 'soccer-passer'
        | 'soccer-goalie'
        | 'butterfly-catcher'
        | 'bicycle-rider'
        | 'kite-flyer'
        | 'cheerer';
      facing: 1 | -1;
      hairColor: string;
      hairStyle:
        | 'short-brown'
        | 'ponytail-red'
        | 'spiky-black'
        | 'blonde-bob'
        | 'beanie'
        | 'orange-pigtails'
        | 'curly-brown';
      shirtColor: string;
      pantsColor: string;
      skinColor: string;
      hasDress?: boolean;
      kickCooldown: number;
      runCycle: number;
      speed: number;
      slingshotTimer: number;
      bikeDistance: number;
      kickPhase: 'idle' | 'windup' | 'strike' | 'followthrough';
      kickProgress: number;
      kickLegAngle: number;
      kickHasContacted?: boolean;
      soccerIntent: 'support' | 'hunt-ball';
    }

    const children: PlayingChild[] = [
      {
        id: 8, baseRatioX: 0.12, curX: 0, yOffset: 0, vy: 0,
        activity: 'soccer-goalie', facing: 1,
        hairColor: '#1e293b', hairStyle: 'beanie',
        shirtColor: '#22c55e', pantsColor: '#0f172a', skinColor: '#fde68a',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 1, baseRatioX: 0.18, curX: 0, yOffset: 0, vy: 0,
        activity: 'soccer-striker', facing: 1,
        hairColor: '#b45309', hairStyle: 'short-brown',
        shirtColor: '#0284c7', pantsColor: '#1e293b', skinColor: '#fde68a',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'hunt-ball',
      },
      {
        id: 2, baseRatioX: 0.28, curX: 0, yOffset: 0, vy: 0,
        activity: 'slingshot-hunter', facing: -1,
        hairColor: '#7c2d12', hairStyle: 'beanie',
        shirtColor: '#ea580c', pantsColor: '#15803d', skinColor: '#fef3c7',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 3, baseRatioX: 0.33, curX: 0, yOffset: 0, vy: 0,
        activity: 'soccer-midfield', facing: 1,
        hairColor: '#334155', hairStyle: 'spiky-black',
        shirtColor: '#f59e0b', pantsColor: '#1e3a8a', skinColor: '#fde68a',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 4, baseRatioX: 0.42, curX: 0, yOffset: 0, vy: 0,
        activity: 'butterfly-catcher', facing: 1,
        hairColor: '#facc15', hairStyle: 'blonde-bob',
        shirtColor: '#ec4899', pantsColor: '#ec4899', skinColor: '#fef3c7',
        hasDress: true,
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 5, baseRatioX: 0.69, curX: 0, yOffset: 0, vy: 0,
        activity: 'bicycle-rider', facing: 1,
        hairColor: '#ea580c', hairStyle: 'ponytail-red',
        shirtColor: '#10b981', pantsColor: '#047857', skinColor: '#fde68a',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 6, baseRatioX: 0.855, curX: 0, yOffset: 0, vy: 0,
        activity: 'cheerer', facing: 1,
        hairColor: '#ea580c', hairStyle: 'orange-pigtails',
        shirtColor: '#3b82f6', pantsColor: '#3b82f6', skinColor: '#fef3c7',
        hasDress: true,
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 7, baseRatioX: 0.94, curX: 0, yOffset: 0, vy: 0,
        activity: 'cheerer', facing: -1,
        hairColor: '#451a03', hairStyle: 'curly-brown',
        shirtColor: '#a855f7', pantsColor: '#a855f7', skinColor: '#fde047',
        hasDress: true,
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
    ];

    const flowers = [
      { ratioX: 0.08, color: '#f43f5e', size: 2.5, sway: 0.0 },
      { ratioX: 0.19, color: '#a855f7', size: 2.3, sway: 1.2 },
      { ratioX: 0.34, color: '#38bdf8', size: 2.6, sway: 2.4 },
      { ratioX: 0.49, color: '#f59e0b', size: 2.4, sway: 0.8 },
      { ratioX: 0.64, color: '#ec4899', size: 2.8, sway: 3.1 },
      { ratioX: 0.78, color: '#f97316', size: 2.5, sway: 1.7 },
      { ratioX: 0.91, color: '#a855f7', size: 2.5, sway: 2.1 },
    ];

    // ─── Pre-render static scenery onto offscreen canvas (huge mobile FPS win) ──
    const rebuildStaticLayer = () => {
      if (!staticCtx || width <= 0 || height <= 0) return;

      staticCanvas.width = Math.round(width * dpr);
      staticCanvas.height = Math.round(height * dpr);
      staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      staticCtx.clearRect(0, 0, width, height);

      // Only paint the pale-mint box sky when NOT embedded in the cosmic dashboard
      if (!transparentSky) {
        const skyGrad = staticCtx.createLinearGradient(0, 0, 0, height);
        skyGrad.addColorStop(0, 'rgba(238, 248, 255, 0.95)');
        skyGrad.addColorStop(0.7, 'rgba(240, 253, 244, 0.9)');
        skyGrad.addColorStop(1, 'rgba(236, 253, 245, 0.95)');
        staticCtx.fillStyle = skyGrad;
        staticCtx.fillRect(0, 0, width, height);
      }

      // 1) Layered Alpine Mountain Ranges with Clipped Two-Tone Snowcaps
      const riverFarShoreY = height * 0.74;
      drawAlpineMountains(staticCtx, width, height, riverFarShoreY);

      // 3) Mid-Ground Turquoise River (flowing behind foreground meadow)
      const riverTopY = height * 0.70;
      staticCtx.beginPath();
      staticCtx.moveTo(0, height);
      for (let i = 0; i <= 32; i++) {
        const px = (i / 32) * width;
        staticCtx.lineTo(px, riverTopY + Math.sin(i * 0.4) * 1.5);
      }
      staticCtx.lineTo(width, height);
      staticCtx.closePath();
      const riverGrad = staticCtx.createLinearGradient(0, riverTopY, 0, height * 0.88);
      riverGrad.addColorStop(0, '#38bdf8');
      riverGrad.addColorStop(0.5, '#0ea5e9');
      riverGrad.addColorStop(1, '#0284c7');
      staticCtx.fillStyle = riverGrad;
      staticCtx.fill();

      // River flow streaks / soft water ribbons
      staticCtx.strokeStyle = 'rgba(224, 242, 254, 0.55)';
      staticCtx.lineWidth = 1.0;
      staticCtx.beginPath();
      staticCtx.moveTo(width * 0.15, riverTopY + 2.5);
      staticCtx.lineTo(width * 0.35, riverTopY + 2.0);
      staticCtx.moveTo(width * 0.52, riverTopY + 3.0);
      staticCtx.lineTo(width * 0.75, riverTopY + 2.2);
      staticCtx.stroke();

      // 4) Rocky Cliff & Wet Stone Framing the Waterfall in Center Gap
      const cliffL = width * 0.485;
      const cliffR = width * 0.515;
      const cliffTopY = height * 0.58;
      const cliffBaseY = height * 0.73;

      // Left framing rocks
      staticCtx.fillStyle = '#334155';
      staticCtx.strokeStyle = '#1e293b';
      staticCtx.lineWidth = 1.1;
      staticCtx.beginPath();
      if (typeof staticCtx.roundRect === 'function') {
        staticCtx.roundRect(cliffL - 8, cliffTopY, 8, cliffBaseY - cliffTopY + 2, [3, 1, 1, 3]);
      } else {
        staticCtx.rect(cliffL - 8, cliffTopY, 8, cliffBaseY - cliffTopY + 2);
      }
      staticCtx.fill();
      staticCtx.stroke();
      // Left rock moss highlight
      staticCtx.fillStyle = '#166534';
      staticCtx.fillRect(cliffL - 8, cliffTopY, 8, 2.5);

      // Right framing rocks
      staticCtx.fillStyle = '#334155';
      staticCtx.strokeStyle = '#1e293b';
      staticCtx.beginPath();
      if (typeof staticCtx.roundRect === 'function') {
        staticCtx.roundRect(cliffR, cliffTopY, 8, cliffBaseY - cliffTopY + 2, [1, 3, 3, 1]);
      } else {
        staticCtx.rect(cliffR, cliffTopY, 8, cliffBaseY - cliffTopY + 2);
      }
      staticCtx.fill();
      staticCtx.stroke();
      // Right rock moss highlight
      staticCtx.fillStyle = '#166534';
      staticCtx.fillRect(cliffR, cliffTopY, 8, 2.5);

      // Base rocky pool boulders
      staticCtx.fillStyle = '#1e293b';
      staticCtx.beginPath();
      staticCtx.ellipse(cliffL - 2, cliffBaseY + 1, 4.5, 2.5, 0, 0, Math.PI * 2);
      staticCtx.ellipse(cliffR + 2, cliffBaseY + 1, 4.5, 2.5, 0, 0, Math.PI * 2);
      staticCtx.fill();

      // 3) Static trunks, basket & school building
      const tree1X = width * mangoTree.xRatio;
      const tree1GroundY = getGroundY(tree1X, width, height);

      // Tree 1 trunk (canopy drawn live so it gently sways & shakes on tap)
      staticCtx.strokeStyle = '#78350f';
      staticCtx.lineWidth = 3.4;
      staticCtx.lineCap = 'round';
      staticCtx.beginPath();
      staticCtx.moveTo(tree1X, tree1GroundY);
      staticCtx.lineTo(tree1X - 2, tree1GroundY - 25);
      staticCtx.stroke();

      // Wicker fruit basket
      const basketX = tree1X + 8;
      const basketY = tree1GroundY - 1;
      staticCtx.fillStyle = '#b45309';
      staticCtx.strokeStyle = '#78350f';
      staticCtx.lineWidth = 1.1;
      staticCtx.beginPath();
      staticCtx.moveTo(basketX - 5, basketY);
      staticCtx.lineTo(basketX - 4, basketY - 5);
      staticCtx.lineTo(basketX + 4, basketY - 5);
      staticCtx.lineTo(basketX + 5, basketY);
      staticCtx.closePath();
      staticCtx.fill();
      staticCtx.stroke();
      staticCtx.fillStyle = '#f59e0b';
      staticCtx.beginPath();
      staticCtx.arc(basketX - 1.5, basketY - 5.5, 1.8, 0, Math.PI * 2);
      staticCtx.arc(basketX + 1.5, basketY - 5.5, 1.8, 0, Math.PI * 2);
      staticCtx.fill();

      // Tree 2 (Shade Tree)
      const tree2X = width * 0.61;
      const tree2GroundY = getGroundY(tree2X, width, height);
      staticCtx.strokeStyle = '#854d0e';
      staticCtx.lineWidth = 2.8;
      staticCtx.beginPath();
      staticCtx.moveTo(tree2X, tree2GroundY);
      staticCtx.lineTo(tree2X - 2, tree2GroundY - 22);
      staticCtx.stroke();
      staticCtx.fillStyle = '#86efac';
      staticCtx.strokeStyle = '#10b981';
      staticCtx.lineWidth = 1.3;
      staticCtx.beginPath();
      staticCtx.arc(tree2X, tree2GroundY - 30, 10, 0, Math.PI * 2);
      staticCtx.arc(tree2X - 5, tree2GroundY - 25, 7, 0, Math.PI * 2);
      staticCtx.arc(tree2X + 5, tree2GroundY - 25, 7, 0, Math.PI * 2);
      staticCtx.fill();
      staticCtx.stroke();

      // School Building (flag drawn live so it ripples with wind)
      const schoolX = width * 0.77;
      const schoolGroundY = getGroundY(schoolX, width, height);
      staticCtx.fillStyle = '#f5f5f4';
      staticCtx.strokeStyle = '#57534e';
      staticCtx.lineWidth = 1.25;
      staticCtx.fillRect(schoolX - 11, schoolGroundY - 20, 22, 20);
      staticCtx.strokeRect(schoolX - 11, schoolGroundY - 20, 22, 20);
      // Warm little doorway + window
      staticCtx.fillStyle = '#d6d3d1';
      staticCtx.fillRect(schoolX - 2.5, schoolGroundY - 8, 5, 8);
      staticCtx.fillStyle = '#bae6fd';
      staticCtx.fillRect(schoolX + 4, schoolGroundY - 15, 4, 4);
      staticCtx.fillRect(schoolX - 8, schoolGroundY - 15, 4, 4);
      // Flagpole
      staticCtx.strokeStyle = '#78716c';
      staticCtx.lineWidth = 1.2;
      staticCtx.beginPath();
      staticCtx.moveTo(schoolX - 5, schoolGroundY - 20);
      staticCtx.lineTo(schoolX - 5, schoolGroundY - 32);
      staticCtx.stroke();

      // 4) Foreground Rolling Sunlit Meadow Hill
      staticCtx.beginPath();
      staticCtx.moveTo(0, height);
      for (let i = 0; i <= 44; i++) {
        const px = (i / 44) * width;
        staticCtx.lineTo(px, getGroundY(px, width, height));
      }
      staticCtx.lineTo(width, height);
      staticCtx.closePath();

      const hillGrad = staticCtx.createLinearGradient(0, height * 0.7, 0, height);
      hillGrad.addColorStop(0, '#bef264');
      hillGrad.addColorStop(0.28, '#84cc16');
      hillGrad.addColorStop(0.72, '#65a30d');
      hillGrad.addColorStop(1, '#3f6212');
      staticCtx.fillStyle = hillGrad;
      staticCtx.fill();

      // Sunlit rim highlight along hill crest
      staticCtx.strokeStyle = 'rgba(236, 252, 203, 0.75)';
      staticCtx.lineWidth = 1.6;
      staticCtx.beginPath();
      for (let i = 0; i <= 44; i++) {
        const px = (i / 44) * width;
        const py = getGroundY(px, width, height) + 0.6;
        if (i === 0) staticCtx.moveTo(px, py);
        else staticCtx.lineTo(px, py);
      }
      staticCtx.stroke();

      // 4b) Compact 3-Square Pastel Chalk Hopscotch Court between Girls 6 & 7
      const hsC6BaseX = width * 0.855;
      const hsC7BaseX = width * 0.94;
      const hsCourtSpan = Math.min(Math.max(hsC7BaseX - hsC6BaseX - 14, 28), 52);
      const hsCourtCenterX = (hsC6BaseX + hsC7BaseX) * 0.5;
      const hsCourtLeft = hsCourtCenterX - hsCourtSpan * 0.5;
      const hsSqW = hsCourtSpan / 3;

      for (let s = 0; s < 3; s++) {
        const sqX = hsCourtLeft + s * hsSqW;
        const sqMidX = sqX + hsSqW * 0.5;
        const sqGroundY = getGroundY(sqMidX, width, height);

        // Soft pastel chalk fill
        const chalkFills = [
          'rgba(254, 205, 211, 0.24)', // Soft pastel pink (Square 1)
          'rgba(186, 230, 253, 0.24)', // Soft pastel sky (Square 2)
          'rgba(254, 240, 138, 0.24)', // Soft pastel yellow (Square 3)
        ];
        staticCtx.fillStyle = chalkFills[s];
        staticCtx.beginPath();
        const sqH = 7.0;
        staticCtx.moveTo(sqX + 1.2, sqGroundY - sqH * 0.5);
        staticCtx.lineTo(sqX + hsSqW - 1.2, sqGroundY - sqH * 0.5);
        staticCtx.lineTo(sqX + hsSqW - 1.2, sqGroundY + sqH * 0.5);
        staticCtx.lineTo(sqX + 1.2, sqGroundY + sqH * 0.5);
        staticCtx.closePath();
        staticCtx.fill();

        // Chalk outline
        staticCtx.strokeStyle = 'rgba(254, 240, 138, 0.72)';
        staticCtx.lineWidth = 1.15;
        staticCtx.stroke();

        // Chalk number "1", "2", "3"
        staticCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        staticCtx.font = 'bold 5.5px sans-serif';
        staticCtx.textAlign = 'center';
        staticCtx.textBaseline = 'middle';
        staticCtx.fillText(String(s + 1), sqMidX, sqGroundY);
      }
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      // Scale goal cleanly on compact screens
      goal.mouthX = Math.max(38, Math.min(50, width * 0.12));
      goal.backX = Math.max(10, goal.mouthX - 28);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      rebuildStaticLayer();

      children.forEach((c) => {
        if (!c.curX) c.curX = c.baseRatioX * width;
        else c.curX = Math.max(12, Math.min(width - 12, c.curX));
      });

      butterflies.forEach((bf) => {
        if (!bf.x) bf.x = bf.ratioX * width;
        else bf.x = Math.min(width - 12, bf.x);
      });

      clouds.forEach((cl) => {
        if (!cl.x) cl.x = cl.ratioX * width;
      });

      if (!ball.initialized) {
        ball.x = width * 0.25;
        ball.y = getGroundY(ball.x, width, height) - ball.radius;
        ball.vx = 0;
        ball.vy = 0;
        ball.initialized = true;
      } else {
        ball.x = Math.max(goal.backX + ball.radius + 3, Math.min(width - ball.radius - 8, ball.x));
      }

      // Repaint a crisp single frame immediately if paused
      if (pausedRef.current) {
        drawFrame(0);
      }
    };

    const triggerPlayerKick = (c: PlayingChild, kickDirection: -1 | 1) => {
      c.kickPhase = 'windup';
      c.kickProgress = 0;
      c.facing = kickDirection;
      c.kickLegAngle = 0;
      c.kickCooldown = 60;
      c.kickHasContacted = false;
    };

    // Unified Pointer Interaction (handles mouse + touch seamlessly with 44px hit targets)
    const handleTap = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const tapX = clientX - rect.left;
      const tapY = clientY - rect.top;
      let hitInteractive = false;

      // 1) Tap near soccer ball -> kick with squash & turf particles
      const distToBall = Math.hypot(tapX - ball.x, tapY - ball.y);
      if (distToBall < 36 && !ball.inNet) {
        hitInteractive = true;
        ball.vx = (tapX > ball.x ? -1 : 1) * (4.0 + Math.random() * 1.8);
        ball.vy = -3.9;
        ball.rotSpeed = ball.vx * 0.16;
        ball.scaleX = 1.28;
        ball.scaleY = 0.76;
        for (let k = 0; k < 5; k++) {
          spawnParticle(
            ball.x,
            ball.y + 3,
            (Math.random() - 0.5) * 2.4,
            -1.2 - Math.random() * 1.5,
            1.8,
            '#84cc16',
            0.75
          );
        }
      }

      // 2) Tap mango tree canopy -> shake & drop a ripe mango
      const tree1X = width * mangoTree.xRatio;
      const tree1GroundY = getGroundY(tree1X, width, height);
      if (Math.hypot(tapX - tree1X, tapY - (tree1GroundY - 30)) < 26) {
        hitInteractive = true;
        treeShake = 1;
        const hanging = mangoTree.mangoes.find((m) => !m.isFalling);
        if (hanging) {
          hanging.isFalling = true;
          hanging.curY = tree1GroundY + hanging.relY;
          hanging.vy = 0.4;
        }
      }

      // 3) Tap near any child -> playful gravity hop + colorful stars
      children.forEach((c) => {
        const gy = getGroundY(c.curX, width, height);
        if (
          Math.abs(tapX - c.curX) < 26 &&
          Math.abs(tapY - (gy - 14)) < 28 &&
          c.yOffset >= -0.5 &&
          c.kickPhase === 'idle'
        ) {
          hitInteractive = true;
          c.vy = -3.6;
          for (let p = 0; p < 5; p++) {
            spawnParticle(
              c.curX + (Math.random() - 0.5) * 10,
              gy - 24,
              (Math.random() - 0.5) * 2.2,
              -1.6 - Math.random() * 1.8,
              2.0,
              ['#f59e0b', '#ec4899', '#38bdf8', '#10b981'][p % 4],
              0.9
            );
          }
        }
      });

      // 4) Tap open sky -> playful wind gust that lifts kite & flutters butterflies
      if (!hitInteractive) {
        windGust = 2.6;
        butterflies.forEach((bf) => {
          bf.vx += (Math.random() - 0.5) * 1.2;
          bf.vy -= 0.6;
        });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      handleTap(e.clientX, e.clientY);
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });

    // ─── Frame Render Function (dt = 1.0 at 60fps, 0.5 at 120fps) ─────────────
    const drawFrame = (dt: number) => {
      time += dt;
      if (goalState !== 'celebrating') {
        hopscotchTimer += dt;
      }

      // Decay interactive impulses
      windGust *= Math.pow(0.95, dt);
      treeShake *= Math.pow(0.88, dt);

      const globalWind = Math.sin(time * 0.045) * 1.2 + windGust;

      ctx.clearRect(0, 0, width, height);

      // 1) Blit cached static scenery in ONE draw call
      ctx.drawImage(staticCanvas, 0, 0, width, height);

      // 1b) Realistic Animated Waterfall (Center Gap)
      const cliffL = width * 0.485;
      const cliffR = width * 0.515;
      const cliffTopY = height * 0.58;
      const cliffBaseY = height * 0.73;
      const cascadeW = Math.max(12, cliffR - cliffL);
      const cascadeH = cliffBaseY - cliffTopY;

      ctx.save();
      ctx.beginPath();
      ctx.rect(cliffL, cliffTopY, cascadeW, cascadeH + 2);
      ctx.clip();

      // Translucent aqua-turquoise water column (#38BDF8 -> #0EA5E9 -> #E0F2FE)
      const waterGrad = ctx.createLinearGradient(0, cliffTopY, 0, cliffBaseY);
      waterGrad.addColorStop(0, 'rgba(56, 189, 248, 0.82)');
      waterGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.88)');
      waterGrad.addColorStop(1, 'rgba(224, 242, 254, 0.94)');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(cliffL, cliffTopY, cascadeW, cascadeH + 2);

      // Downward-scrolling white speed streaks / foam lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 1.1;
      const streakCount = Math.max(3, Math.floor(cascadeW / 3.5));
      for (let s = 0; s < streakCount; s++) {
        const sx = cliffL + 1.5 + s * ((cascadeW - 3) / Math.max(1, streakCount - 1));
        const streakLen = 5 + (s % 3) * 2;
        const offset = (time * 2.6 + s * 6.5) % (cascadeH + streakLen);
        ctx.beginPath();
        ctx.moveTo(sx, cliffTopY + offset - streakLen);
        ctx.lineTo(sx, cliffTopY + offset);
        ctx.stroke();
      }
      ctx.restore();

      // Splash pool foam ring at waterfall base
      const cascadeCenterX = (cliffL + cliffR) / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.ellipse(cascadeCenterX, cliffBaseY + 1, cascadeW * 0.75, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Expanding water ripples at pool base
      for (let r = 0; r < 3; r++) {
        const rTime = (time * 0.035 + r * 0.33) % 1;
        const rw = cascadeW * 0.5 + rTime * 14;
        const rh = 1.8 + rTime * 3.5;
        const rAlpha = (1 - rTime) * 0.55;
        ctx.strokeStyle = `rgba(224, 242, 254, ${rAlpha})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(cascadeCenterX, cliffBaseY + 1.5, rw, rh, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rising mist puffs (soft fading white particles drifting upward)
      for (let m = 0; m < 5; m++) {
        const mTime = (time * 0.04 + m * 0.22) % 1;
        const mx = cascadeCenterX + Math.sin(time * 0.08 + m * 2) * (cascadeW * 0.5);
        const my = cliffBaseY - mTime * 12;
        const mAlpha = Math.sin(mTime * Math.PI) * 0.42;
        const mRadius = 2.5 + mTime * 5.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${mAlpha})`;
        ctx.beginPath();
        ctx.arc(mx, my, mRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 1c) River Fisherman in Small Wooden Boat
      const boatBaseX = width * 0.555;
      const boatBobY = Math.sin(time * 0.055 + 1.2) * 1.5;
      const boatY = height * 0.73 + boatBobY;
      const boatRock = Math.sin(time * 0.045) * 0.05;

      ctx.save();
      ctx.translate(boatBaseX, boatY);
      ctx.rotate(boatRock);

      // Water reflection shadow beneath boat
      ctx.fillStyle = 'rgba(14, 116, 144, 0.30)';
      ctx.beginPath();
      ctx.ellipse(0, 4.2, 11.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wooden Boat Hull (#92400E / #B45309)
      ctx.fillStyle = '#92400e';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-11, -1);
      ctx.quadraticCurveTo(-12.5, 3.2, -8, 4);
      ctx.lineTo(8, 4);
      ctx.quadraticCurveTo(12.5, 3.2, 11, -1);
      ctx.quadraticCurveTo(0, 1.2, -11, -1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wood plank lines
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-9, 1.5);
      ctx.lineTo(9, 1.5);
      ctx.stroke();

      // Seated Fisherman in Shirt
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-4.5, -6, 5, 5.5, 1.2);
      } else {
        ctx.rect(-4.5, -6, 5, 5.5);
      }
      ctx.fill();
      ctx.stroke();

      // Head
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(-2, -7.8, 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Straw Sun-Hat (#FACC15 / #EAB308)
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(-2, -9.2, 6.5, 2, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-2, -10.2, 2.8, Math.PI, 0);
      ctx.fill();
      ctx.stroke();

      // Curved Fishing Rod with gentle tip motion
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      const rodWiggle = Math.sin(time * 0.08) * 0.9;
      const rodTipX = 14 + rodWiggle * 0.4;
      const rodTipY = -12 + rodWiggle;
      ctx.beginPath();
      ctx.moveTo(-1.5, -4);
      ctx.quadraticCurveTo(6, -11, rodTipX, rodTipY);
      ctx.stroke();

      // Thin Fishing Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.70)';
      ctx.lineWidth = 0.75;
      const bobberX = 18;
      const bobberY = 3.2 + Math.sin(time * 0.09) * 0.8;
      ctx.beginPath();
      ctx.moveTo(rodTipX, rodTipY);
      ctx.quadraticCurveTo(rodTipX + 1, (rodTipY + bobberY) / 2, bobberX, bobberY);
      ctx.stroke();

      // Floating Bobber (red/white)
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(bobberX, bobberY - 0.9, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bobberX, bobberY + 0.4, 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Ripple rings around bobber
      const globalBobberX = boatBaseX + 18;
      const globalBobberY = boatY + 3.2 + Math.sin(time * 0.09) * 0.8;
      for (let br = 0; br < 2; br++) {
        const brTime = (time * 0.032 + br * 0.5) % 1;
        const brAlpha = (1 - brTime) * 0.45;
        ctx.strokeStyle = `rgba(224, 242, 254, ${brAlpha})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(globalBobberX, globalBobberY, 2 + brTime * 5, 0.8 + brTime * 1.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 1d) Animated Jumping Fish & Water Splash Ripples in the River
      const riverWaterY = height * 0.70;

      // Update & Draw Expanding River Ripples
      for (let ri = riverRipples.length - 1; ri >= 0; ri--) {
        const rp = riverRipples[ri];
        rp.r += rp.speed * dt;
        rp.alpha = Math.max(0, 0.75 * (1 - rp.r / rp.maxR));
        if (rp.alpha <= 0 || rp.r >= rp.maxR) {
          riverRipples.splice(ri, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(224, 242, 254, ${rp.alpha})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Update & Draw River Droplets
      for (let di = riverDroplets.length - 1; di >= 0; di--) {
        const dp = riverDroplets[di];
        dp.x += dp.vx * dt;
        dp.y += dp.vy * dt;
        dp.vy += 0.18 * dt; // gravity
        dp.alpha -= 0.045 * dt;
        if (dp.alpha <= 0 || dp.y > riverWaterY + 4) {
          riverDroplets.splice(di, 1);
          continue;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${dp.alpha})`;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update & Render each Leaping Fish
      riverFish.forEach((f) => {
        const nominalX = width * f.baseRatio;
        if (f.state === 'underwater') {
          f.timer -= dt;
          // Underwater subtle wake shimmer
          const swimWiggle = Math.sin(time * 0.08 + f.baseRatio * 10) * 4;
          const wakeAlpha = 0.18 + Math.sin(time * 0.05 + f.baseRatio * 5) * 0.08;
          ctx.strokeStyle = `rgba(255, 255, 255, ${wakeAlpha})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.ellipse(nominalX + swimWiggle, riverWaterY + 2.5, 4.5, 1.4, 0, 0, Math.PI * 2);
          ctx.stroke();

          if (f.timer <= 0) {
            f.state = 'leaping';
            f.startX = nominalX + (Math.random() - 0.5) * 14;
            const leapDist = f.facing * (14 + Math.random() * 8);
            f.targetX = f.startX + leapDist;
            f.apexHeight = 8 + Math.random() * 6;
            f.leapDuration = 32 + Math.random() * 8;
            f.leapProgress = 0;

            // Spawn launch ripples and splash
            riverRipples.push({
              x: f.startX,
              y: riverWaterY + 1,
              r: 1.5,
              maxR: 9 + Math.random() * 4,
              alpha: 0.8,
              speed: 0.38,
            });
            for (let d = 0; d < 3; d++) {
              riverDroplets.push({
                x: f.startX + (Math.random() - 0.5) * 4,
                y: riverWaterY - 1,
                vx: -f.facing * (0.3 + Math.random() * 0.6),
                vy: -1.2 - Math.random() * 0.8,
                alpha: 0.9,
              });
            }
          }
        } else if (f.state === 'leaping') {
          f.leapProgress += (1 / f.leapDuration) * dt;
          if (f.leapProgress >= 1) {
            // Re-entered water!
            f.state = 'underwater';
            f.timer = 180 + Math.random() * 200; // unhurried cooldown interval
            f.facing = (f.facing === 1 ? -1 : 1) as 1 | -1;

            // Dive ripples & splash
            riverRipples.push({
              x: f.targetX,
              y: riverWaterY + 1,
              r: 1.5,
              maxR: 11 + Math.random() * 4,
              alpha: 0.85,
              speed: 0.42,
            });
            for (let d = 0; d < 4; d++) {
              riverDroplets.push({
                x: f.targetX + (Math.random() - 0.5) * 5,
                y: riverWaterY - 1,
                vx: (Math.random() - 0.5) * 1.2,
                vy: -1.4 - Math.random() * 0.9,
                alpha: 0.95,
              });
            }
          } else {
            // In aerial parabolic arc
            f.curX = f.startX + f.leapProgress * (f.targetX - f.startX);
            const arcY = Math.sin(f.leapProgress * Math.PI) * f.apexHeight;
            f.curY = riverWaterY - arcY;

            // Velocity vector angle for realistic comic fish tilt
            const vx = f.targetX - f.startX;
            const vy = -Math.cos(f.leapProgress * Math.PI) * Math.PI * f.apexHeight;
            const fishAngle = Math.atan2(vy, vx);

            ctx.save();
            ctx.translate(f.curX, f.curY);
            ctx.rotate(fishAngle);

            // Fish body
            ctx.fillStyle = f.color;
            ctx.strokeStyle = '#9a3412';
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(4.5, 0);
            ctx.quadraticCurveTo(1.5, -2.6, -3, -1.8);
            ctx.lineTo(-4.5, -2.8);
            ctx.lineTo(-3.8, 0);
            ctx.lineTo(-4.5, 2.8);
            ctx.lineTo(-3, 1.8);
            ctx.quadraticCurveTo(1.5, 2.6, 4.5, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Light belly
            ctx.fillStyle = f.bellyColor;
            ctx.beginPath();
            ctx.moveTo(3.5, 0.4);
            ctx.quadraticCurveTo(1, 2.1, -2.5, 1.3);
            ctx.lineTo(3.5, 0.4);
            ctx.fill();

            // Eye
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(2.8, -0.6, 1.0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(3.1, -0.6, 0.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
          }
        }
      });

      // 2) Drifting fluffy clouds (only drawn if sky is not transparent; dashboard provides horizon clouds)
      if (!transparentSky) {
        clouds.forEach((cloud) => {
          cloud.x += (cloud.speed + windGust * 0.2) * dt;
          if (cloud.x > width + 44) cloud.x = -44;

          ctx.save();
          ctx.translate(cloud.x, cloud.y);
          ctx.scale(cloud.scale, cloud.scale);
          ctx.fillStyle = `rgba(186, 230, 253, ${cloud.opacity})`;
          ctx.strokeStyle = `rgba(125, 211, 252, ${cloud.opacity * 0.85})`;
          ctx.lineWidth = 1.2;

          ctx.beginPath();
          ctx.arc(0, 0, 9.5, Math.PI * 0.5, Math.PI * 1.5);
          ctx.arc(8, -5.5, 11, Math.PI * 1, Math.PI * 1.85);
          ctx.arc(21, -4.5, 9.5, Math.PI * 1.35, Math.PI * 2.05);
          ctx.arc(28, 0, 7.5, Math.PI * 1.6, Math.PI * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }

      // 3) Distant gliding birds
      ctx.strokeStyle = transparentSky ? 'rgba(15, 45, 98, 0.52)' : '#64748b';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      const birdOffset = (time * 0.34) % (width + 70);
      for (let b = 0; b < 3; b++) {
        const bx = ((width - birdOffset + b * 14) % (width + 70)) - 20;
        const flap = Math.sin(time * 0.14 + b * 1.2) * 1.6;
        const by = 16 + b * 4 + flap * 0.7;
        ctx.beginPath();
        ctx.moveTo(bx - 4.5, by + flap * 0.35);
        ctx.quadraticCurveTo(bx - 2, by - 2.4, bx, by);
        ctx.quadraticCurveTo(bx + 2, by - 2.4, bx + 4.5, by + flap * 0.35);
        ctx.stroke();
      }

      // 4) Live Mango Tree Canopy (sways with wind & shakes on tap) + Mangoes
      const tree1X = width * mangoTree.xRatio;
      const tree1GroundY = getGroundY(tree1X, width, height);
      const canopySway =
        Math.sin(time * 0.05) * 0.7 +
        Math.sin(time * 0.75) * treeShake * 3.2 +
        windGust * 0.4;

      ctx.save();
      ctx.translate(canopySway, 0);
      ctx.fillStyle = '#22c55e';
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.arc(tree1X, tree1GroundY - 33, 12.2, 0, Math.PI * 2);
      ctx.arc(tree1X - 7, tree1GroundY - 28, 8.8, 0, Math.PI * 2);
      ctx.arc(tree1X + 7, tree1GroundY - 28, 8.8, 0, Math.PI * 2);
      ctx.arc(tree1X, tree1GroundY - 38, 7.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Warm sun-kissed canopy highlight (from top-right sun)
      ctx.fillStyle = 'rgba(190, 242, 100, 0.38)';
      ctx.beginPath();
      ctx.arc(tree1X + 3, tree1GroundY - 36, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Mangoes (hanging or falling)
      mangoTree.mangoes.forEach((m) => {
        if (m.isFalling) {
          m.vy += 0.22 * dt;
          m.curY += m.vy * dt;
          if (m.curY >= tree1GroundY - 4) {
            m.isFalling = false;
            m.curY = tree1GroundY + m.relY;
            mangoTree.basketMangoCount++;
            for (let sp = 0; sp < 4; sp++) {
              spawnParticle(
                tree1X + m.relX,
                tree1GroundY - 5,
                (Math.random() - 0.5) * 1.6,
                -1.0 - Math.random() * 1.4,
                1.7,
                '#f59e0b',
                0.75
              );
            }
          }
        }

        const mx = tree1X + m.relX + (m.isFalling ? 0 : canopySway);
        const my = m.isFalling ? m.curY : tree1GroundY + m.relY;

        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(mx, my - 3.4);
        ctx.lineTo(mx + 0.7, my - 1.5);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.ellipse(mx, my, 2.5, 3.4, 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(239, 68, 68, 0.48)';
        ctx.beginPath();
        ctx.arc(mx + 0.7, my - 0.7, 1.2, 0, Math.PI * 2);
        ctx.fill();
      });

      // School animated wind flag
      const schoolX = width * 0.77;
      const schoolGroundY = getGroundY(schoolX, width, height);
      const flagWave = Math.sin(time * 0.14) * (1.5 + windGust * 0.9);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(schoolX - 5, schoolGroundY - 32);
      ctx.quadraticCurveTo(
        schoolX,
        schoolGroundY - 34 + flagWave,
        schoolX + 6.5,
        schoolGroundY - 30 + flagWave * 0.5
      );
      ctx.lineTo(schoolX + 6.5, schoolGroundY - 25 + flagWave * 0.4);
      ctx.lineTo(schoolX - 5, schoolGroundY - 26);
      ctx.closePath();
      ctx.fill();

      // 5) Wind-swaying Grass Tufts & Wildflowers
      ctx.strokeStyle = '#365314';
      ctx.lineWidth = 1.05;
      for (let g = 0; g < 14; g++) {
        const gx = ((g + 0.5) / 14) * width;
        const gy = getGroundY(gx, width, height);
        const sway = Math.sin(time * 0.05 + g * 0.7) * 1.4 + windGust * 1.1;
        ctx.beginPath();
        ctx.moveTo(gx - 2, gy);
        ctx.lineTo(gx - 3 + sway, gy - 4);
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + sway, gy - 5);
        ctx.moveTo(gx + 2, gy);
        ctx.lineTo(gx + 3 + sway, gy - 4);
        ctx.stroke();
      }

      flowers.forEach((fl) => {
        const fx = fl.ratioX * width;
        const fy = getGroundY(fx, width, height);
        const sway = Math.sin(time * 0.055 + fl.sway) * 1.2 + windGust * 0.9;

        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + sway, fy - 7.5);
        ctx.stroke();

        ctx.fillStyle = fl.color;
        ctx.beginPath();
        ctx.arc(fx + sway, fy - 8.5, fl.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(fx + sway, fy - 8.5, fl.size * 0.38, 0, Math.PI * 2);
        ctx.fill();
      });

      // 6) Miniature Soccer Net (Back Layer)
      const mouthGroundY = getGroundY(goal.mouthX, width, height);
      const backGroundY = getGroundY(goal.backX, width, height);
      const crossbarY = mouthGroundY - goal.height;
      const backTopY = backGroundY - goal.height * 0.78;

      goal.netBulgeVel += (-goal.netBulge * 0.12 - goal.netBulgeVel * 0.22) * dt;
      goal.netBulge += goal.netBulgeVel * dt;
      const currentBulge = Math.max(0, goal.netBulge);

      // Goal line + soft shadow
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, mouthGroundY - 1);
      ctx.lineTo(goal.mouthX, mouthGroundY + 3);
      ctx.stroke();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
      ctx.beginPath();
      ctx.ellipse(
        (goal.mouthX + goal.backX) * 0.5 - 1.5,
        mouthGroundY + 1,
        (goal.mouthX - goal.backX) * 0.6,
        2.5,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Netting Mesh
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, crossbarY);
      ctx.lineTo(goal.backX - currentBulge, backTopY);
      ctx.lineTo(goal.backX - currentBulge, backGroundY);
      ctx.lineTo(goal.mouthX, mouthGroundY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 0.85;
      for (let r = 1; r <= 5; r++) {
        const t = r / 6;
        const frontY = crossbarY + t * (mouthGroundY - crossbarY);
        const rearY = backTopY + t * (backGroundY - backTopY);
        const rearX = goal.backX - currentBulge * (1 - t * 0.3);
        ctx.beginPath();
        ctx.moveTo(goal.mouthX, frontY);
        ctx.quadraticCurveTo(
          (goal.mouthX + rearX) * 0.5,
          (frontY + rearY) * 0.5 + 1,
          rearX,
          rearY
        );
        ctx.stroke();
      }
      for (let col = 1; col <= 5; col++) {
        const t = col / 6;
        const topX = goal.mouthX - t * (goal.mouthX - (goal.backX - currentBulge));
        const topY = crossbarY - t * (crossbarY - backTopY);
        const botX = goal.mouthX - t * (goal.mouthX - (goal.backX - currentBulge));
        const botY = mouthGroundY - t * (mouthGroundY - backGroundY);
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(botX, botY);
        ctx.stroke();
      }

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(goal.backX - currentBulge, backGroundY);
      ctx.lineTo(goal.backX - currentBulge, backTopY);
      ctx.lineTo(goal.mouthX, crossbarY);
      ctx.moveTo(goal.backX - currentBulge, backGroundY);
      ctx.lineTo(goal.mouthX, mouthGroundY);
      ctx.stroke();
      ctx.restore();

      // 7) Ball Physics & Goalie Retrieval (Delta-Time Normalized)
      const ballGroundY = getGroundY(ball.x, width, height) - ball.radius;
      const slopeDelta =
        (getGroundY(ball.x + 2, width, height) - getGroundY(ball.x - 2, width, height)) / 4;
      const slopeAngle = Math.atan(slopeDelta);

      // Spring ball squash-and-stretch back to 1.0
      ball.scaleX += (1 - ball.scaleX) * Math.min(1, 0.24 * dt);
      ball.scaleY += (1 - ball.scaleY) * Math.min(1, 0.24 * dt);

      const isInsideGoalMouth =
        ball.x <= goal.mouthX + 2 &&
        ball.x >= goal.backX - 4 &&
        ball.y >= crossbarY - 4 &&
        ball.y <= mouthGroundY + 5;

      if (
        isInsideGoalMouth &&
        !ball.inNet &&
        goalState === 'play' &&
        goalTimer === 0 &&
        ball.vx <= 0.1
      ) {
        ball.inNet = true;
        goalState = 'celebrating';
        goalTimer = 175;
        scorerId = ball.lastKickerId || 1;
        goal.netBulge = Math.min(14, Math.abs(ball.vx) * 2.2 + 6);
        goal.netBulgeVel = -goal.netBulge * 0.25;
        ball.vx *= 0.1;
        ball.vy = Math.min(ball.vy * 0.2, 0.4);

        for (let i = 0; i < 18; i++) {
          spawnParticle(
            goal.mouthX + (Math.random() - 0.5) * 16,
            crossbarY + Math.random() * goal.height,
            (Math.random() - 0.5) * 3.4,
            -1.8 - Math.random() * 2.8,
            2 + Math.random() * 2,
            ['#10b981', '#f59e0b', '#ec4899', '#38bdf8', '#fbbf24', '#ffffff'][i % 6],
            1
          );
        }
      }

      if (ball.inNet) {
        ball.vy += 0.22 * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.vx *= Math.pow(0.75, dt);

        if (ball.y >= ballGroundY) {
          ball.y = ballGroundY;
          ball.vy = 0;
          ball.vx = 0;
        }
        if (ball.x < goal.backX + ball.radius + 4) {
          ball.x = goal.backX + ball.radius + 4;
          ball.vx = 0;
        }
        if (ball.x > goal.mouthX - 3 && goalTimer > 60) {
          ball.x = goal.mouthX - 3;
          ball.vx = 0;
        }

        if (goalTimer > 0) {
          const prevGoalTimer = goalTimer;
          goalTimer = Math.max(0, goalTimer - dt);
          const goalie = children.find((c) => c.activity === 'soccer-goalie');

          if (goalie) {
            if (goalTimer > 115) {
              goalie.facing = -1;
              const gdx = ball.x + 5 - goalie.curX;
              if (Math.abs(gdx) > 1.5) {
                goalie.curX += Math.sign(gdx) * 1.0 * dt;
                goalie.runCycle += 0.24 * dt;
                goalie.speed = 1;
              } else {
                goalie.runCycle = 0;
                goalie.speed = 0;
              }
            } else if (goalTimer > 48) {
              goalie.facing = 1;
              const gdx = goal.mouthX + 8 - goalie.curX;
              if (Math.abs(gdx) > 1.5) {
                goalie.curX += Math.sign(gdx) * 0.95 * dt;
                goalie.runCycle += 0.22 * dt;
                goalie.speed = 0.95;
              } else {
                goalie.runCycle = 0;
                goalie.speed = 0;
              }
              ball.x = goalie.curX + goalie.facing * 3;
              ball.y = getGroundY(goalie.curX, width, height) - 10;
              ball.vx = 0;
              ball.vy = 0;
            } else if (goalTimer > 15) {
              ball.x = goal.mouthX + 10;
              ball.y = getGroundY(ball.x, width, height) - ball.radius;
              goalie.curX = ball.x - 6;
              goalie.facing = 1;
              goalie.runCycle = 0;
              goalie.speed = 0;
            } else if (prevGoalTimer > 15 && goalTimer <= 15) {
              triggerPlayerKick(goalie, 1);
            }
          }

          if (goalTimer === 0) {
            goalState = 'play';
            ball.inNet = false;
            scorerId = null;
            passCount = 0;
          }
        }
      } else {
        const onGround = ball.y >= ballGroundY - 0.8;
        if (onGround) {
          ball.y = ballGroundY;
          const slopeForce = Math.sin(slopeAngle) * 0.16;
          ball.vx += slopeForce * dt;
          ball.vx *= Math.pow(0.982, dt);

          if (Math.abs(ball.vx) < 0.12 && Math.abs(slopeForce) < 0.08) {
            ball.vx = 0;
            ball.rotSpeed = 0;
          } else {
            ball.rotSpeed = ball.vx / ball.radius;
            ball.rotation += ball.rotSpeed * dt;
          }

          if (Math.abs(ball.vy) < 0.45) {
            ball.vy = 0;
          } else {
            ball.vy = -ball.vy * ball.bounciness;
            ball.scaleX = 1.2;
            ball.scaleY = 0.82;
          }
        } else {
          ball.vy += 0.24 * dt;
          ball.vx *= Math.pow(0.995, dt);
          ball.vy *= Math.pow(0.995, dt);
          ball.rotation += ball.rotSpeed * dt;

          if (ball.y + ball.vy * dt >= ballGroundY) {
            ball.y = ballGroundY;
            if (Math.abs(ball.vy) > 1.2) {
              ball.scaleX = 1.22;
              ball.scaleY = 0.8;
            }
            ball.vy = -ball.vy * ball.bounciness;
            ball.rotSpeed = ball.vx * 0.16;
          }
        }

        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        if (ball.x < goal.backX + ball.radius + 3) {
          ball.x = goal.backX + ball.radius + 3;
          ball.vx = Math.abs(ball.vx) * 0.4;
        }
        if (ball.x >= width - ball.radius - 8) {
          ball.x = width - ball.radius - 8;
          ball.vx = 0;
        }

        // Motionless watchdog
        if (goalState === 'play') {
          if (Math.abs(ball.vx) < 0.05 && Math.abs(ball.vy) < 0.05) {
            ball.stillFrames += dt;
            if (ball.stillFrames > 95) {
              const outfielders = children.filter(
                (c) =>
                  c.activity === 'soccer-striker' ||
                  c.activity === 'soccer-midfield' ||
                  c.activity === 'soccer-passer'
              );
              let closest = outfielders[0];
              let minD = Infinity;
              outfielders.forEach((p) => {
                const d = Math.abs(p.curX - ball.x);
                if (d < minD) {
                  minD = d;
                  closest = p;
                }
              });
              if (closest) {
                closest.kickCooldown = 0;
                closest.soccerIntent = 'hunt-ball';
              }
            }
            if (ball.stillFrames > 190) {
              ball.vx = ball.x < width * 0.35 ? 3.5 : -3.5;
              ball.vy = -2.0;
              ball.stillFrames = 0;
            }
          } else {
            ball.stillFrames = 0;
          }
        }
      }

      // Altitude-reactive directional ball shadow (sun at top-right -> shadow slightly left)
      const ballHeightAboveGround = Math.max(0, ballGroundY - ball.y);
      const shadowScale = Math.max(0.45, 1 - ballHeightAboveGround / 48);
      ctx.fillStyle = `rgba(15, 23, 42, ${0.19 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(
        ball.x - 1.2 - ballHeightAboveGround * 0.12,
        ballGroundY + 2.6,
        ball.radius * 1.15 * shadowScale,
        ball.radius * 0.35 * shadowScale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Render Soccer Ball (32-panel geometric look + squash/stretch)
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.scale(ball.scaleX, ball.scaleY);
      ctx.rotate(ball.rotation);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      const pentaRadius = ball.radius * 0.44;
      for (let p = 0; p < 5; p++) {
        const pAngle = (p * Math.PI * 2) / 5 - Math.PI / 2;
        const px = Math.cos(pAngle) * pentaRadius;
        const py = Math.sin(pAngle) * pentaRadius;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 0.75;
      for (let p = 0; p < 5; p++) {
        const pAngle = (p * Math.PI * 2) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(pAngle) * pentaRadius, Math.sin(pAngle) * pentaRadius);
        ctx.lineTo(Math.cos(pAngle) * ball.radius, Math.sin(pAngle) * ball.radius);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(ball.radius * 0.3, -ball.radius * 0.32, ball.radius * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Front Goal Post & Crossbar (in front of ball for 3D depth)
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, mouthGroundY);
      ctx.lineTo(goal.mouthX, crossbarY);
      ctx.moveTo(goal.mouthX, crossbarY);
      ctx.lineTo(goal.backX - currentBulge * 0.5, crossbarY - 2);
      ctx.stroke();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(goal.mouthX - 1.2, mouthGroundY);
      ctx.lineTo(goal.mouthX - 1.2, crossbarY - 1);
      ctx.moveTo(goal.mouthX + 1.2, mouthGroundY);
      ctx.lineTo(goal.mouthX + 1.2, crossbarY - 1);
      ctx.stroke();
      ctx.restore();

      // 8) Butterflies
      butterflies.forEach((bf) => {
        bf.x += (bf.vx + windGust * 0.25) * dt;
        bf.y += (bf.vy + Math.sin(time * 0.08 + bf.ratioX * 10) * 0.5) * dt;
        bf.wingAngle += bf.wingSpeed * dt;

        if (Math.random() < 0.018 * dt) {
          bf.vx = (Math.random() - 0.5) * 1.0;
          bf.vy = (Math.random() - 0.5) * 0.55;
        }
        if (bf.x < 14) bf.vx = Math.abs(bf.vx) + 0.35;
        if (bf.x > width - 14) bf.vx = -Math.abs(bf.vx) - 0.35;
        if (bf.y < 10) bf.vy = 0.35;
        if (bf.y > height * 0.62) bf.vy = -0.35;

        ctx.save();
        ctx.translate(bf.x, bf.y);
        const wingScale = Math.abs(Math.cos(bf.wingAngle));
        ctx.fillStyle = bf.color;
        ctx.beginPath();
        ctx.ellipse(-bf.size * 0.7 * wingScale, 0, bf.size * wingScale, bf.size * 0.6, -0.3, 0, Math.PI * 2);
        ctx.ellipse(bf.size * 0.7 * wingScale, 0, bf.size * wingScale, bf.size * 0.6, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 9) Slingshot Pebble
      if (mangoTree.slingshotPebble.active) {
        const pb = mangoTree.slingshotPebble;
        pb.x += pb.vx * dt;
        pb.y += pb.vy * dt;
        pb.vy += 0.15 * dt;

        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(pb.x, pb.y, 1.4, 0, Math.PI * 2);
        ctx.fill();

        if (pb.y <= tree1GroundY - 26) {
          pb.active = false;
          treeShake = 0.8;
          const target = mangoTree.mangoes.find((m) => m.id === pb.targetMangoId);
          if (target && !target.isFalling) {
            target.isFalling = true;
            target.curY = tree1GroundY + target.relY;
            target.vy = 0.2;
          }
        }
      }

      // 10) Intelligent Soccer AI Coordination
      const outfielders = children.filter(
        (c) =>
          c.activity === 'soccer-striker' ||
          c.activity === 'soccer-midfield' ||
          c.activity === 'soccer-passer'
      );

      if (goalState === 'play' && !ball.inNet) {
        let closestPlayer = outfielders[0];
        let minDist = Infinity;
        outfielders.forEach((p) => {
          const d = Math.abs(p.curX - ball.x);
          if (d < minDist) {
            minDist = d;
            closestPlayer = p;
          }
        });
        outfielders.forEach((p) => {
          p.soccerIntent = p === closestPlayer ? 'hunt-ball' : 'support';
        });
      }

      // 11) Update & Draw Playing Children
      children.forEach((c) => {
        const groundY = getGroundY(c.curX, width, height);
        const isScorerCelebrating = scorerId === c.id && goalTimer > 0;

        if (c.kickCooldown > 0) c.kickCooldown = Math.max(0, c.kickCooldown - dt);

        // Actual gravity physics for tap-to-hop!
        if (c.vy !== 0 || c.yOffset < 0) {
          c.yOffset += c.vy * dt;
          c.vy += 0.28 * dt;
          if (c.yOffset >= 0) {
            c.yOffset = 0;
            c.vy = 0;
          }
        }

        // Outfield soccer players
        if (
          c.activity === 'soccer-striker' ||
          c.activity === 'soccer-midfield' ||
          c.activity === 'soccer-passer'
        ) {
          if (goalState === 'celebrating') {
            c.yOffset = -Math.abs(Math.sin(time * 0.22 + c.id)) * 5.2;
            c.runCycle = 0;
            c.speed = 0;
            c.facing = 1;
          } else if (goalState === 'play' && c.kickPhase === 'idle') {
            if (c.soccerIntent === 'hunt-ball') {
              let kickDir: 1 | -1 = 1;
              if (c.activity === 'soccer-passer') kickDir = -1;
              else if (c.activity === 'soccer-striker') kickDir = passCount < 3 ? 1 : -1;
              else kickDir = passCount < 3 ? (c.curX < ball.x ? 1 : -1) : -1;

              const targetX = kickDir === 1 ? ball.x - 6 : ball.x + 6;
              const dx = targetX - c.curX;

              if (Math.abs(dx) > 2) {
                c.curX += Math.sign(dx) * 1.35 * dt;
                c.facing = Math.sign(dx) as 1 | -1;
                c.runCycle += 0.32 * dt;
                c.speed = 1.35;
              } else {
                c.facing = kickDir;
                c.runCycle = 0;
                c.speed = 0;
                const dist = Math.hypot(c.curX - targetX, groundY - ball.y);
                if (dist < 22 && c.kickCooldown <= 0 && !ball.inNet) {
                  triggerPlayerKick(c, kickDir);
                }
              }
            } else {
              const homeX =
                c.activity === 'soccer-striker'
                  ? width * 0.21
                  : c.activity === 'soccer-midfield'
                    ? width * 0.36
                    : width * 0.47;
              const zoneTarget = homeX + (ball.x - homeX) * 0.25;
              const dx = zoneTarget - c.curX;
              if (Math.abs(dx) > 3) {
                c.curX += Math.sign(dx) * 0.72 * dt;
                c.facing = Math.sign(dx) as 1 | -1;
                c.runCycle += 0.18 * dt;
                c.speed = 0.72;
              } else {
                c.facing = ball.x > c.curX ? 1 : -1;
                c.runCycle = 0;
                c.speed = 0;
              }
            }
          }

          // Zone clamps
          if (c.activity === 'soccer-striker') {
            c.curX = Math.max(goal.mouthX + 14, Math.min(width * 0.32, c.curX));
          } else if (c.activity === 'soccer-midfield') {
            c.curX = Math.max(width * 0.26, Math.min(width * 0.44, c.curX));
          } else {
            c.curX = Math.max(width * 0.38, Math.min(width * 0.56, c.curX));
          }
        } else if (c.activity === 'soccer-goalie') {
          if (goalState === 'play') {
            const homeX = goal.mouthX + 6;
            const targetX = Math.max(
              goal.mouthX + 2,
              Math.min(goal.mouthX + 12, homeX + (ball.x - width * 0.3) * 0.04)
            );
            const dx = targetX - c.curX;
            if (Math.abs(dx) > 1.5) {
              c.curX += Math.sign(dx) * 0.6 * dt;
              c.runCycle += 0.16 * dt;
              c.speed = 0.6;
            } else {
              c.runCycle = 0;
              c.speed = 0;
            }
            c.facing = 1;
            if (ball.vx < -2.0 && ball.x < width * 0.28) {
              c.yOffset = -Math.abs(Math.sin(time * 0.3)) * 5.8;
            }
          }
        } else if (c.activity === 'slingshot-hunter') {
          c.curX = tree1X + 15;
          c.facing = -1;
          c.slingshotTimer += dt;
          if (c.slingshotTimer > 180) {
            c.slingshotTimer = 0;
            const nextMango = mangoTree.mangoes[Math.floor(Math.random() * mangoTree.mangoes.length)];
            mangoTree.slingshotPebble = {
              active: true,
              x: c.curX - 6,
              y: groundY - 18,
              vx: -1.2,
              vy: -3.8,
              targetMangoId: nextMango.id,
            };
          }
        } else if (c.activity === 'butterfly-catcher') {
          const targetBf = butterflies[1];
          const targetX = Math.max(width * 0.48, Math.min(width * 0.64, targetBf.x));
          const dx = targetX - c.curX;
          if (Math.abs(dx) > 2) {
            c.curX += Math.sign(dx) * 0.72 * dt;
            c.facing = Math.sign(dx) as 1 | -1;
            c.runCycle += 0.2 * dt;
            c.speed = 0.72;
          } else {
            c.runCycle = 0;
            c.speed = 0;
          }
        } else if (c.activity === 'bicycle-rider') {
          const minBikeX = width * 0.65;
          const maxBikeX = width * 0.81;
          c.curX += c.facing * 0.85 * dt;
          c.bikeDistance += 0.85 * dt;
          c.runCycle += 0.18 * dt;
          c.speed = 0.85;
          if (c.curX >= maxBikeX) {
            c.curX = maxBikeX;
            c.facing = -1;
          } else if (c.curX <= minBikeX) {
            c.curX = minBikeX;
            c.facing = 1;
          }
        } else if (c.activity === 'kite-flyer') {
          c.curX = width * c.baseRatioX;
          c.facing = -1;
          if (c.vy === 0) c.yOffset = -Math.sin(time * 0.08) * 1.2;
        } else if (c.activity === 'cheerer') {
          if (c.id === 6 || c.id === 7) {
            const hsC6BaseX = width * 0.855;
            const hsC7BaseX = width * 0.94;
            const hsCourtSpan = Math.min(Math.max(hsC7BaseX - hsC6BaseX - 14, 28), 52);
            const hsCourtCenterX = (hsC6BaseX + hsC7BaseX) * 0.5;
            const hsCourtLeft = hsCourtCenterX - hsCourtSpan * 0.5;
            const hsCourtRight = hsCourtCenterX + hsCourtSpan * 0.5;
            const hsSqW = hsCourtSpan / 3;
            const sq1X = hsCourtLeft + hsSqW * 0.5;
            const sq2X = hsCourtLeft + hsSqW * 1.5;
            const sq3X = hsCourtLeft + hsSqW * 2.5;
            const c6HomeX = hsCourtLeft - 5.5;
            const c7HomeX = hsCourtRight + 5.5;

            if (goalState === 'celebrating') {
              c.curX = c.id === 6 ? c6HomeX : c7HomeX;
              c.facing = c.id === 6 ? 1 : -1;
              if (c.vy === 0) {
                c.yOffset = -Math.abs(Math.sin(time * 0.24)) * 5.2;
              }
            } else {
              // Active cooperative hopscotch & beanbag toss game
              const CYCLE = 300;
              const ht = hopscotchTimer % CYCLE;

              if (ht < 150) {
                // ── Phase A: Girl 6 (Blue dress, orange cap) Turn ──
                if (c.id === 6) {
                  c.facing = 1;
                  if (ht < 25) {
                    c.curX = c6HomeX;
                    if (c.vy === 0) c.yOffset = 0;
                    if (ht < 8) {
                      beanbag.x = c.curX + 4;
                      beanbag.y = groundY - 10;
                    } else {
                      const prog = (ht - 8) / 17;
                      beanbag.x = (c.curX + 4) + prog * (sq2X - (c.curX + 4));
                      beanbag.y =
                        (groundY - 10) +
                        prog * (getGroundY(sq2X, width, height) - 1.5 - (groundY - 10)) -
                        Math.sin(prog * Math.PI) * 12;
                    }
                  } else if (ht < 65) {
                    const prog = (ht - 25) / 40;
                    c.curX = c6HomeX + prog * (sq1X - c6HomeX);
                    if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 7.5;
                    beanbag.x = sq2X;
                    beanbag.y = getGroundY(sq2X, width, height) - 1.5;
                  } else if (ht < 105) {
                    const prog = (ht - 65) / 40;
                    c.curX = sq1X + prog * (sq2X - sq1X);
                    if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 7.5;
                    if (prog < 0.7) {
                      beanbag.x = sq2X;
                      beanbag.y = getGroundY(sq2X, width, height) - 1.5;
                    } else {
                      beanbag.x = c.curX + 4;
                      beanbag.y = groundY + c.yOffset - 10;
                    }
                  } else if (ht < 130) {
                    const prog = (ht - 105) / 25;
                    c.curX = sq2X + prog * (sq3X - sq2X);
                    if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 7.0;
                    beanbag.x = c.curX + 4;
                    beanbag.y = groundY + c.yOffset - 10;
                  } else {
                    const prog = (ht - 130) / 20;
                    c.curX = sq3X - prog * (sq3X - c6HomeX);
                    if (c.vy === 0) c.yOffset = -Math.abs(Math.sin(prog * Math.PI * 2)) * 4.5;
                    const tossProg = Math.min(1, (ht - 130) / 16);
                    beanbag.x = sq3X + tossProg * (c7HomeX - 4 - sq3X);
                    beanbag.y =
                      getGroundY(sq3X, width, height) - 10 +
                      tossProg * (getGroundY(c7HomeX, width, height) - 10 - (getGroundY(sq3X, width, height) - 10)) -
                      Math.sin(tossProg * Math.PI) * 8;
                  }
                } else if (c.id === 7) {
                  // Girl 7 bobs & claps encouragingly
                  c.facing = -1;
                  c.curX = c7HomeX;
                  if (c.vy === 0) {
                    c.yOffset = -Math.abs(Math.sin((ht - 25) * 0.28)) * 2.2;
                  }
                }
              } else {
                // ── Phase B: Girl 7 (Purple dress, curly hair) Turn ──
                if (c.id === 7) {
                  c.facing = -1;
                  if (ht < 175) {
                    c.curX = c7HomeX;
                    if (c.vy === 0) c.yOffset = 0;
                    if (ht < 158) {
                      beanbag.x = c.curX - 4;
                      beanbag.y = groundY - 10;
                    } else {
                      const prog = (ht - 158) / 17;
                      beanbag.x = (c.curX - 4) + prog * (sq2X - (c.curX - 4));
                      beanbag.y =
                        (groundY - 10) +
                        prog * (getGroundY(sq2X, width, height) - 1.5 - (groundY - 10)) -
                        Math.sin(prog * Math.PI) * 12;
                    }
                  } else if (ht < 215) {
                    const prog = (ht - 175) / 40;
                    c.curX = c7HomeX - prog * (c7HomeX - sq3X);
                    if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 7.5;
                    beanbag.x = sq2X;
                    beanbag.y = getGroundY(sq2X, width, height) - 1.5;
                  } else if (ht < 255) {
                    const prog = (ht - 215) / 40;
                    c.curX = sq3X - prog * (sq3X - sq2X);
                    if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 7.5;
                    if (prog < 0.7) {
                      beanbag.x = sq2X;
                      beanbag.y = getGroundY(sq2X, width, height) - 1.5;
                    } else {
                      beanbag.x = c.curX - 4;
                      beanbag.y = groundY + c.yOffset - 10;
                    }
                  } else if (ht < 280) {
                    const prog = (ht - 255) / 25;
                    c.curX = sq2X - prog * (sq2X - sq1X);
                    if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 7.0;
                    beanbag.x = c.curX - 4;
                    beanbag.y = groundY + c.yOffset - 10;
                  } else {
                    const prog = (ht - 280) / 20;
                    c.curX = sq1X + prog * (c7HomeX - sq1X);
                    if (c.vy === 0) c.yOffset = -Math.abs(Math.sin(prog * Math.PI * 2)) * 4.5;
                    const tossProg = Math.min(1, (ht - 280) / 16);
                    beanbag.x = sq1X + tossProg * (c6HomeX + 4 - sq1X);
                    beanbag.y =
                      getGroundY(sq1X, width, height) - 10 +
                      tossProg * (getGroundY(c6HomeX, width, height) - 10 - (getGroundY(sq1X, width, height) - 10)) -
                      Math.sin(tossProg * Math.PI) * 8;
                  }
                } else if (c.id === 6) {
                  // Girl 6 bobs & claps encouragingly
                  c.facing = 1;
                  c.curX = c6HomeX;
                  if (c.vy === 0) {
                    c.yOffset = -Math.abs(Math.sin((ht - 175) * 0.28)) * 2.2;
                  }
                }
              }
            }
          } else {
            c.curX = width * c.baseRatioX;
            c.facing = -1;
            if (c.vy === 0) {
              const amp = goalState === 'celebrating' ? 4.8 : 2.0;
              c.yOffset = -Math.abs(Math.sin(time * (goalState === 'celebrating' ? 0.24 : 0.14))) * amp;
            }
          }
        }

        // Kicking state machine (physical foot-to-ball contact)
        if (c.kickPhase === 'windup') {
          c.kickProgress += 0.2 * dt;
          c.kickLegAngle = -0.75 * Math.sin(Math.min(1, c.kickProgress) * Math.PI * 0.5);
          if (c.kickProgress >= 1) {
            c.kickPhase = 'strike';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'strike') {
          c.kickProgress += 0.28 * dt;
          c.kickLegAngle = 0.85 * Math.sin(Math.min(1, c.kickProgress) * Math.PI * 0.5);

          if (c.kickProgress >= 0.4 && !c.kickHasContacted) {
            c.kickHasContacted = true;
            c.kickCooldown = 40;
            ball.lastKickerId = c.id;
            ball.scaleX = 1.3;
            ball.scaleY = 0.74;

            if (c.activity === 'soccer-goalie') {
              ball.vx = 4.3 + Math.random() * 0.6;
              ball.vy = -2.2;
              ball.rotSpeed = 0.28;
              passCount = 0;
            } else if (c.facing === 1) {
              ball.vx = 3.5 + Math.random() * 0.7;
              ball.vy = -1.8;
              ball.rotSpeed = 0.22;
              passCount++;
            } else {
              if (passCount < 3 && ball.x > width * 0.3) {
                ball.vx = -(3.5 + Math.random() * 0.7);
                ball.vy = -1.8;
                ball.rotSpeed = -0.22;
                passCount++;
              } else {
                const distToGoal = ball.x - goal.mouthX;
                const power = Math.max(5.0, Math.min(6.6, distToGoal * 0.08 + 4.0));
                ball.vx = -power;
                ball.vy = -2.4 - Math.random() * 1.4;
                ball.rotSpeed = -0.34;
                passCount = 0;
              }
            }

            for (let k = 0; k < 4; k++) {
              spawnParticle(
                c.curX + c.facing * 6,
                groundY - 1,
                c.facing * (1 + Math.random() * 2),
                -1 - Math.random() * 1.2,
                1.7,
                '#65a30d',
                0.65
              );
            }
          }

          if (c.kickProgress >= 1) {
            c.kickPhase = 'followthrough';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'followthrough') {
          c.kickProgress += 0.16 * dt;
          c.kickLegAngle = 0.85 * Math.max(0, 1 - c.kickProgress);
          if (c.kickProgress >= 1) {
            c.kickPhase = 'idle';
            c.kickLegAngle = 0;
          }
        }

        // Grounded directional shadow (shrinks softly during jump)
        const jumpHeight = Math.max(0, -c.yOffset);
        const childShadowScale = Math.max(0.65, 1 - jumpHeight / 28);
        ctx.fillStyle = `rgba(15, 23, 42, ${0.2 * childShadowScale})`;
        ctx.beginPath();
        ctx.ellipse(
          c.curX - 1.2,
          groundY + 1,
          (c.activity === 'bicycle-rider' ? 14 : 8.5) * childShadowScale,
          2.6 * childShadowScale,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();

        // Draw child in articulated side-profile with subtle sprint lean & bounce
        ctx.save();
        const runBob = c.speed > 0.2 ? -Math.abs(Math.sin(c.runCycle)) * 1.3 : 0;
        ctx.translate(c.curX, groundY + c.yOffset + runBob);

        const headY = -27;
        const headRadius = 5.4;
        const bodyY = -17;
        const waistY = -9;

        // 1) Bicycle or Articulated Legs
        if (c.activity === 'bicycle-rider') {
          const wheelRadius = 5.0;
          const wheelSpan = 10;
          const rearHubX = -c.facing * wheelSpan;
          const frontHubX = c.facing * wheelSpan;
          const hubY = -wheelRadius;

          [rearHubX, frontHubX].forEach((hx) => {
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.35;
            ctx.beginPath();
            ctx.arc(hx, hubY, wheelRadius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 0.7;
            const spokeRot = c.bikeDistance * 0.25;
            for (let s = 0; s < 4; s++) {
              const sa = spokeRot + (s * Math.PI) / 2;
              ctx.beginPath();
              ctx.moveTo(hx, hubY);
              ctx.lineTo(hx + Math.cos(sa) * wheelRadius, hubY + Math.sin(sa) * wheelRadius);
              ctx.stroke();
            }
          });

          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          const seatPostX = -c.facing * 3;
          const seatPostY = bodyY + 3;
          const handlePostX = c.facing * 6;
          const handlePostY = bodyY - 1;

          ctx.beginPath();
          ctx.moveTo(rearHubX, hubY);
          ctx.lineTo(seatPostX, seatPostY);
          ctx.lineTo(0, hubY);
          ctx.lineTo(rearHubX, hubY);
          ctx.moveTo(0, hubY);
          ctx.lineTo(handlePostX, handlePostY);
          ctx.lineTo(seatPostX, seatPostY);
          ctx.moveTo(handlePostX, handlePostY);
          ctx.lineTo(frontHubX, hubY);
          ctx.stroke();

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(handlePostX, handlePostY);
          ctx.lineTo(handlePostX + c.facing * 2, handlePostY - 4);
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.ellipse(seatPostX, seatPostY - 1, 3.2, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();

          const pedalAngle = c.runCycle * 2;
          const pedalFootX = Math.cos(pedalAngle) * 3.4;
          const pedalFootY = hubY + Math.sin(pedalAngle) * 3.4;

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.75;
          ctx.beginPath();
          ctx.moveTo(seatPostX, waistY);
          ctx.lineTo(pedalFootX, pedalFootY);
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(pedalFootX, pedalFootY, 1.7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.8;
          ctx.lineCap = 'round';

          if (c.kickPhase !== 'idle') {
            const plantLegX = -c.facing * 2.4;
            ctx.beginPath();
            ctx.moveTo(plantLegX, waistY);
            ctx.lineTo(plantLegX, 0);
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(plantLegX, 0, 1.8, 0, Math.PI * 2);
            ctx.fill();

            const kickHipX = c.facing * 2.1;
            const legLen = 9.2;
            const footX = kickHipX + Math.sin(c.kickLegAngle * c.facing) * legLen;
            const footY = waistY + Math.cos(c.kickLegAngle * c.facing) * legLen;

            ctx.beginPath();
            ctx.moveTo(kickHipX, waistY);
            ctx.lineTo(footX, footY);
            ctx.stroke();

            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(footX, footY, 2.0, 0, Math.PI * 2);
            ctx.fill();
          } else if (c.id === 6 || c.id === 7) {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.75;
            ctx.lineCap = 'round';

            if (c.yOffset < -1.5) {
              // Hopping leg with knee lift
              const backLegX = -c.facing * 1.5;
              ctx.beginPath();
              ctx.moveTo(backLegX, waistY);
              ctx.lineTo(backLegX, 0.5);
              ctx.stroke();

              const frontHipX = c.facing * 1.5;
              const kneeX = frontHipX + c.facing * 2.6;
              const kneeY = waistY + 3.8;
              const footX = frontHipX + c.facing * 0.8;
              const footY = waistY + 6.8;
              ctx.beginPath();
              ctx.moveTo(frontHipX, waistY);
              ctx.lineTo(kneeX, kneeY);
              ctx.lineTo(footX, footY);
              ctx.stroke();

              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(backLegX, 0.5, 1.75, 0, Math.PI * 2);
              ctx.arc(footX, footY, 1.75, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Crisp vertical stick legs
              const leg1X = -c.facing * 1.5;
              const leg2X = c.facing * 1.5;
              ctx.beginPath();
              ctx.moveTo(leg1X, waistY);
              ctx.lineTo(leg1X, 0);
              ctx.moveTo(leg2X, waistY);
              ctx.lineTo(leg2X, 0);
              ctx.stroke();

              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(leg1X, 0, 1.75, 0, Math.PI * 2);
              ctx.arc(leg2X, 0, 1.75, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            const stride = Math.sin(c.runCycle) * 4.2;
            const liftA = Math.max(0, -Math.cos(c.runCycle)) * (c.speed > 0.2 ? 2.1 : 0);
            const liftB = Math.max(0, Math.cos(c.runCycle)) * (c.speed > 0.2 ? 2.1 : 0);

            // Back leg with subtle knee bend
            const footAX = -c.facing * 1.4 - c.facing * stride;
            const footAY = -liftA;
            ctx.beginPath();
            ctx.moveTo(-c.facing * 1.4, waistY);
            ctx.quadraticCurveTo(
              (-c.facing * 1.4 + footAX) * 0.5 + c.facing * 1.2,
              waistY * 0.45,
              footAX,
              footAY
            );
            ctx.stroke();

            // Front leg
            const footBX = c.facing * 1.4 + c.facing * stride;
            const footBY = -liftB;
            ctx.beginPath();
            ctx.moveTo(c.facing * 1.4, waistY);
            ctx.quadraticCurveTo(
              (c.facing * 1.4 + footBX) * 0.5 + c.facing * 1.2,
              waistY * 0.45,
              footBX,
              footBY
            );
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(footAX, footAY, 1.75, 0, Math.PI * 2);
            ctx.arc(footBX, footBY, 1.75, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Subtle forward torso lean when sprinting
        const runLean = c.activity !== 'bicycle-rider' && c.speed > 0.5 ? c.facing * 0.08 : 0;
        ctx.save();
        ctx.rotate(runLean);

        // 2) Torso & Clothes
        if (c.hasDress) {
          const dressOutline = c.id === 6 ? '#1e3a8a' : (c.id === 7 ? '#581c87' : '#475569');
          ctx.fillStyle = c.shirtColor;
          ctx.strokeStyle = dressOutline;
          ctx.lineWidth = (c.id === 6 || c.id === 7) ? 1.25 : 1.05;
          ctx.beginPath();
          ctx.moveTo(c.facing * 1.5, bodyY);
          ctx.lineTo(-c.facing * 6.5, waistY + 1.2);
          ctx.lineTo(c.facing * 6.5, waistY + 1.2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Signature inner diagonal line/strap from image_803fdb.png
          if (c.id === 6) {
            ctx.strokeStyle = '#1d4ed8';
            ctx.lineWidth = 1.15;
            ctx.beginPath();
            ctx.moveTo(-c.facing * 1.5, bodyY + 3);
            ctx.lineTo(c.facing * 2.5, waistY - 1);
            ctx.stroke();
          } else if (c.id === 7) {
            ctx.strokeStyle = '#7e22ce';
            ctx.lineWidth = 1.15;
            ctx.beginPath();
            ctx.moveTo(c.facing * 1.5, bodyY + 3);
            ctx.lineTo(-c.facing * 2.5, waistY - 1);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = c.pantsColor;
          ctx.fillRect(-3.5, waistY - 1.5, 7, 5);
          ctx.fillStyle = c.shirtColor;
          ctx.fillRect(-4, bodyY, 8, 9);
        }

        // 3) Arms & Props
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.75;
        ctx.lineCap = 'round';

        if (c.activity === 'soccer-goalie') {
          const gloveOffset = isScorerCelebrating ? 0 : Math.sin(time * 0.12) * 1.5;
          const g1X = c.facing * 5;
          const g1Y = bodyY - 1 + gloveOffset;
          const g2X = c.facing * 7;
          const g2Y = bodyY + 3 - gloveOffset;

          ctx.beginPath();
          ctx.moveTo(-1, bodyY + 3);
          ctx.lineTo(g1X, g1Y);
          ctx.moveTo(1, bodyY + 3);
          ctx.lineTo(g2X, g2Y);
          ctx.stroke();

          ctx.fillStyle = '#facc15';
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 0.8;
          [
            [g1X, g1Y],
            [g2X, g2Y],
          ].forEach(([gx, gy]) => {
            ctx.beginPath();
            ctx.arc(gx, gy, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        } else if (isScorerCelebrating || (c.activity === 'cheerer' && goalState === 'celebrating')) {
          const wiggle = Math.sin(time * 0.25) * 2;
          ctx.beginPath();
          ctx.moveTo(-3, bodyY + 3);
          ctx.lineTo(-8.5 + wiggle, bodyY - 10.5);
          ctx.moveTo(3, bodyY + 3);
          ctx.lineTo(8.5 - wiggle, bodyY - 10.5);
          ctx.stroke();
        } else if (c.id === 6 || c.id === 7) {
          // Cooperative Hopscotch & Beanbag Toss Arms
          const ht = hopscotchTimer % 300;
          const isGirl6Active = ht < 150;
          const isActive = (c.id === 6 && isGirl6Active) || (c.id === 7 && !isGirl6Active);

          if (isActive) {
            const turnT = isGirl6Active ? ht : (ht - 150);
            if (turnT < 25) {
              // Tossing arm motion
              ctx.beginPath();
              ctx.moveTo(-c.facing * 2, bodyY + 3);
              ctx.lineTo(-c.facing * 4, bodyY + 6);
              ctx.moveTo(c.facing * 1, bodyY + 2);
              ctx.lineTo(c.facing * 7.5, bodyY - 4);
              ctx.stroke();
            } else {
              // Balance swinging arms while hopping
              const swing = Math.sin(time * 0.3) * 3;
              ctx.beginPath();
              ctx.moveTo(-c.facing * 2, bodyY + 3);
              ctx.lineTo(-c.facing * 6.5, bodyY - swing);
              ctx.moveTo(c.facing * 2, bodyY + 3);
              ctx.lineTo(c.facing * 7, bodyY + swing);
              ctx.stroke();
            }
          } else {
            // Partner clapping encouragingly!
            const clap = Math.sin(time * 0.35);
            const clapX = 2.5 + clap * 2.0;
            ctx.beginPath();
            ctx.moveTo(-2, bodyY + 3);
            ctx.lineTo(c.facing * clapX, bodyY + 2);
            ctx.moveTo(2, bodyY + 3);
            ctx.lineTo(c.facing * clapX, bodyY + 2);
            ctx.stroke();
          }
        } else if (c.activity === 'slingshot-hunter') {
          const handX = c.facing * 8;
          const handY = bodyY + 1;
          ctx.beginPath();
          ctx.moveTo(0, bodyY + 3);
          ctx.lineTo(handX, handY);
          ctx.stroke();

          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(handX, handY);
          ctx.lineTo(handX + c.facing * 3, handY - 4);
          ctx.lineTo(handX + c.facing * 1, handY - 8);
          ctx.moveTo(handX + c.facing * 3, handY - 4);
          ctx.lineTo(handX + c.facing * 5, handY - 7);
          ctx.stroke();

          const pullAmount = 3 + Math.sin(c.slingshotTimer * 0.1) * 2.4;
          const pullHandX = -c.facing * pullAmount;
          const pullHandY = bodyY + 2;

          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(handX + c.facing * 1, handY - 8);
          ctx.lineTo(pullHandX, pullHandY);
          ctx.lineTo(handX + c.facing * 5, handY - 7);
          ctx.stroke();

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.75;
          ctx.beginPath();
          ctx.moveTo(-c.facing * 2, bodyY + 3);
          ctx.lineTo(pullHandX, pullHandY);
          ctx.stroke();
        } else if (c.activity === 'butterfly-catcher') {
          const netHandX = c.facing * 6;
          const netHandY = bodyY + 1;
          ctx.beginPath();
          ctx.moveTo(0, bodyY + 3);
          ctx.lineTo(netHandX, netHandY);
          ctx.stroke();

          const poleTipX = netHandX + c.facing * 13;
          const poleTipY = netHandY - 10;
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(netHandX - c.facing * 2, netHandY + 4);
          ctx.lineTo(poleTipX, poleTipY);
          ctx.stroke();

          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.ellipse(poleTipX + c.facing * 3, poleTipY - 2, 4.4, 2.9, 0.4, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
          ctx.beginPath();
          ctx.moveTo(poleTipX, poleTipY);
          ctx.lineTo(poleTipX - c.facing * 5.5, poleTipY - 7.5);
          ctx.lineTo(poleTipX + c.facing * 5.5, poleTipY - 3.5);
          ctx.closePath();
          ctx.fill();
        } else if (c.activity === 'bicycle-rider') {
          ctx.beginPath();
          ctx.moveTo(0, bodyY + 3);
          ctx.lineTo(c.facing * 7, bodyY - 1);
          ctx.stroke();
        } else if (c.activity === 'kite-flyer') {
          ctx.beginPath();
          ctx.moveTo(0, bodyY + 3);
          ctx.lineTo(c.facing * 5, bodyY - 2);
          ctx.stroke();

          ctx.fillStyle = '#b45309';
          ctx.fillRect(c.facing * 4, bodyY - 4, 3, 4);

          // Only draw flying diamond kite if NOT transparentSky (keeps dashboard sky clean & matches target)
          if (!transparentSky) {
            const kiteX = c.curX - 38 + globalWind * 2.4;
            const kiteY = 20 + Math.sin(time * 0.055) * 3 - windGust * 2.2;
            const relKiteX = kiteX - c.curX;
            const relKiteY = kiteY - (groundY + c.yOffset);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(c.facing * 4, bodyY - 3);
            ctx.quadraticCurveTo(relKiteX * 0.45, bodyY - 22, relKiteX, relKiteY);
            ctx.stroke();

            ctx.save();
            ctx.translate(relKiteX, relKiteY);
            ctx.rotate(0.14 + Math.sin(time * 0.06) * 0.1 + windGust * 0.08);

            const kw = 6.5;
            const kh = 9.5;
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.moveTo(0, -kh);
            ctx.lineTo(kw, 0);
            ctx.lineTo(0, kh);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(0, -kh);
            ctx.lineTo(-kw, 0);
            ctx.lineTo(0, kh);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(0, -kh);
            ctx.lineTo(0, kh);
            ctx.moveTo(-kw, 0);
            ctx.lineTo(kw, 0);
            ctx.stroke();

            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(0, kh);
            for (let t = 1; t <= 3; t++) {
              const tx = Math.sin(time * 0.16 + t) * (2.6 + windGust * 0.9);
              ctx.lineTo(tx, kh + t * 3.8);
            }
            ctx.stroke();
            ctx.restore();
          }
        } else if (c.kickPhase !== 'idle') {
          ctx.beginPath();
          ctx.moveTo(c.facing * 3, bodyY + 2);
          ctx.lineTo(c.facing * 9, bodyY - 3);
          ctx.moveTo(-c.facing * 3, bodyY + 2);
          ctx.lineTo(-c.facing * 7, bodyY + 6);
          ctx.stroke();
        } else {
          const armSwing = Math.cos(c.runCycle) * 3.5;
          ctx.beginPath();
          ctx.moveTo(0, bodyY + 3);
          ctx.lineTo(c.facing * armSwing, bodyY + 7);
          ctx.stroke();
        }

        // 4) Head & Side-Profile Face
        ctx.fillStyle = c.skinColor;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(c.facing * 2.3, headY - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.arc(c.facing * 1.4, headY + 1, 1.9, 0, Math.PI * 0.75);
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.42)';
        ctx.beginPath();
        ctx.arc(c.facing * 1.1, headY + 1.2, 1.15, 0, Math.PI * 2);
        ctx.fill();

        // 5) Hair Styles
        ctx.fillStyle = c.hairColor;
        ctx.strokeStyle = c.hairColor;
        ctx.lineWidth = 1.2;

        if (c.hairStyle === 'short-brown') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.5, headRadius + 0.5, Math.PI * 0.9, Math.PI * 2.1);
          ctx.fill();
        } else if (c.hairStyle === 'ponytail-red') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.5, headRadius + 0.5, Math.PI * 0.85, Math.PI * 2.15);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-c.facing * headRadius, headY - 1);
          ctx.quadraticCurveTo(
            -c.facing * (headRadius + 5),
            headY + 2,
            -c.facing * (headRadius + 4),
            headY + 7
          );
          ctx.stroke();
        } else if (c.hairStyle === 'spiky-black') {
          ctx.beginPath();
          ctx.moveTo(-c.facing * headRadius, headY);
          ctx.lineTo(-c.facing * 4, headY - 9);
          ctx.lineTo(0, headY - 10);
          ctx.lineTo(c.facing * 4, headY - 6);
          ctx.lineTo(c.facing * headRadius, headY);
          ctx.closePath();
          ctx.fill();
        } else if (c.hairStyle === 'blonde-bob') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.5, headRadius + 1, Math.PI * 0.8, Math.PI * 2.2);
          ctx.lineTo(c.facing * (headRadius + 2), headY + 2);
          ctx.lineTo(-c.facing * (headRadius + 2), headY + 2);
          ctx.closePath();
          ctx.fill();
        } else if (c.hairStyle === 'beanie') {
          ctx.fillStyle = '#991b1b';
          ctx.beginPath();
          ctx.arc(0, headY - 2, headRadius + 0.8, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(c.facing > 0 ? 0 : -headRadius - 3, headY - 3, headRadius + 3, 2);
        } else if (c.hairStyle === 'orange-pigtails') {
          // Orange cap with backward flap from image_803fdb.png
          ctx.fillStyle = '#ea580c';
          ctx.beginPath();
          ctx.arc(0, headY - 1, headRadius + 0.6, Math.PI * 0.85, Math.PI * 2.15);
          ctx.fill();
          // Backward cap flap / strap
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = '#ea580c';
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-c.facing * (headRadius * 0.7), headY);
          ctx.lineTo(-c.facing * (headRadius + 5), headY + 4);
          ctx.stroke();
        } else if (c.hairStyle === 'curly-brown') {
          // Curly hair puffs across top and side from image_803fdb.png
          ctx.fillStyle = '#451a03';
          for (let cp = -2; cp <= 2; cp++) {
            ctx.beginPath();
            ctx.arc(cp * 2.3, headY - 5.2, 2.3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(-headRadius - 0.5, headY - 2.5, 2.0, 0, Math.PI * 2);
          ctx.arc(headRadius + 0.5, headY - 2.5, 2.0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore(); // End sprint lean

        // 6) "GOAL! ⚽" Comic Speech Bubble (skipped in dashboard transparentSky mode to keep sky pristine)
        if (!transparentSky && isScorerCelebrating) {
          const bubbleAnim = Math.min(1, (175 - goalTimer) / 12);
          const bounce = 1 + Math.sin(time * 0.22) * 0.07;

          ctx.save();
          ctx.translate(0, headY - 21);
          ctx.scale(bubbleAnim * bounce, bubbleAnim * bounce);

          const bw = 46;
          const bh = 18;
          const br = 7;

          const drawBubbleRect = (rx: number, ry: number) => {
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(rx, ry, bw, bh, br);
            } else {
              ctx.moveTo(rx + br, ry);
              ctx.lineTo(rx + bw - br, ry);
              ctx.quadraticCurveTo(rx + bw, ry, rx + bw, ry + br);
              ctx.lineTo(rx + bw, ry + bh - br);
              ctx.quadraticCurveTo(rx + bw, ry + bh, rx + bw - br, ry + bh);
              ctx.lineTo(rx + br, ry + bh);
              ctx.quadraticCurveTo(rx, ry + bh, rx, ry + bh - br);
              ctx.lineTo(rx, ry + br);
              ctx.quadraticCurveTo(rx, ry, rx + br, ry);
              ctx.closePath();
            }
          };

          ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
          drawBubbleRect(-bw / 2 + 1, -bh / 2 + 1);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1.4;
          drawBubbleRect(-bw / 2, -bh / 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(-3, bh / 2 - 0.5);
          ctx.lineTo(0, bh / 2 + 5);
          ctx.lineTo(4, bh / 2 - 0.5);
          ctx.fill();
          ctx.stroke();
          ctx.fillRect(-2.2, bh / 2 - 2, 5.2, 2.5);

          ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#047857';
          ctx.fillText('GOAL! ⚽', 0, 0.5);
          ctx.restore();
        }

        ctx.restore(); // End child transform
      });

      // 11.5) Hopscotch Beanbag (tossed between Character 6 and 7)
      if (beanbag.visible && goalState !== 'celebrating') {
        ctx.save();
        ctx.translate(beanbag.x, beanbag.y);
        ctx.fillStyle = '#f43f5e';
        ctx.strokeStyle = '#9f1239';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-2.2, -2.2, 4.4, 4.4, 1.2);
        } else {
          ctx.rect(-2.2, -2.2, 4.4, 4.4);
        }
        ctx.fill();
        ctx.stroke();
        // Inner contrast stitch
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, 0, 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 12) Confetti & Sparkle Particles (pooled & rotated)
      for (let cp = celebrationParticles.length - 1; cp >= 0; cp--) {
        const pt = celebrationParticles[cp];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 0.08 * dt;
        pt.vx *= Math.pow(0.98, dt);
        pt.rot += pt.vrot * dt;
        pt.life -= 0.02 * dt;

        if (pt.life <= 0) {
          celebrationParticles.splice(cp, 1);
        } else {
          ctx.save();
          ctx.globalAlpha = pt.life;
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.rot);
          ctx.fillStyle = pt.color;
          ctx.fillRect(-pt.size * 0.6, -pt.size * 0.4, pt.size * 1.2, pt.size * 0.8);
          ctx.restore();
        }
      }
    };

    // ─── Smart Battery-Safe Animation Loop ────────────────────────────────────
    const loop = (timestamp: number) => {
      if (pausedRef.current || !isVisible || !isDocVisible) {
        isRunning = false;
        lastTimestamp = 0;
        return;
      }

      isRunning = true;
      if (!lastTimestamp) lastTimestamp = timestamp;
      const elapsed = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      // Clamp dt to avoid physics jumps after switching tabs
      const dt = Math.min(Math.max(elapsed / 16.667, 0.25), 2.0);
      drawFrame(dt);

      animationFrameId = requestAnimationFrame(loop);
    };

    const startIfActive = () => {
      if (!isRunning && !pausedRef.current && isVisible && isDocVisible) {
        lastTimestamp = 0;
        animationFrameId = requestAnimationFrame(loop);
      }
    };

    resumeLoopRef.current = startIfActive;

    // ResizeObserver for crisp layout & orientation changes
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => handleResize())
        : null;
    resizeObserver?.observe(container);
    window.addEventListener('resize', handleResize);

    // Pause automatically when scrolled out of view
    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              isVisible = entries[0]?.isIntersecting ?? true;
              if (isVisible) startIfActive();
            },
            { threshold: 0.05 }
          )
        : null;
    intersectionObserver?.observe(container);

    // Pause automatically when phone screen locks or app is backgrounded
    const onVisibilityChange = () => {
      isDocVisible = !document.hidden;
      if (isDocVisible) startIfActive();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Initial layout & first frame
    handleResize();
    drawFrame(0);
    startIfActive();

    return () => {
      cancelAnimationFrame(animationFrameId);
      isRunning = false;
      resumeLoopRef.current = null;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [transparentSky]);

  return (
    <div
      ref={containerRef}
      className={
        transparentSky
          ? `w-full h-28 sm:h-32 relative select-none ${className}`
          : `w-full h-24 sm:h-28 md:h-30 rounded-2xl border border-emerald-200/90 shadow-xs relative overflow-hidden select-none ${className}`
      }
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-manipulation"
        aria-label="Interactive live miniature garden with playing children"
      />
      {!hideControls && (
        <button
          type="button"
          onClick={() => setInternalPaused((prev) => !prev)}
          className="absolute top-2 right-2 z-10 touch-target-44 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/80 hover:bg-white text-slate-600 border border-slate-200 shadow-xs backdrop-blur-xs cursor-pointer transition-colors"
          aria-label={isPaused ? 'Resume garden animation' : 'Pause garden animation'}
          title={isPaused ? 'Resume garden animation' : 'Pause garden animation'}
        >
          {isPaused ? (
            <Play className="h-4 w-4 text-emerald-700" />
          ) : (
            <Pause className="h-4 w-4 text-slate-700" />
          )}
        </button>
      )}
    </div>
  );
}
