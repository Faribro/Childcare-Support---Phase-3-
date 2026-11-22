'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { drawAbrahamStatueAboveWaterfall } from './drawAbrahamStatue';
import { cosmicSound } from '@/lib/audio/cosmicSoundEngine';

interface MountainPeak {
  /** Center X as a 0..1 ratio of canvas width */
  xRatio: number;
  /** Half-width as a 0..1 ratio of canvas width */
  halfWidthRatio: number;
  /** Peak height above baseY as a 0..1 ratio of canvas height */
  heightRatio: number;
  /** Snow coverage down from summit (0.24 - 0.38 looks natural) */
  snowDepth: number;
  /** Distant misty ridge vs. foreground lush green ridge */
  layer: 'far' | 'near';
}

function getSceneScale(width: number, height: number): number {
  const widthScale = width < 400 ? 0.72 : width < 640 ? 0.85 : 1.0;
  const heightScale = Math.min(1.0, Math.max(0.68, height / 112));
  return Math.max(0.66, Math.min(widthScale, heightScale));
}

function drawAlpineMountains(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseY: number,
  sceneScale: number
) {
  const isCompactMobile = width < 480;

  // Mountain ranges framing the center waterfall valley cleanly (open pass at ~0.48-0.52)
  const peaks: MountainPeak[] = isCompactMobile
    ? [
        // Far atmospheric range
        { xRatio: 0.14, halfWidthRatio: 0.18, heightRatio: 0.40, snowDepth: 0.30, layer: 'far' },
        { xRatio: 0.36, halfWidthRatio: 0.14, heightRatio: 0.32, snowDepth: 0.22, layer: 'far' },
        { xRatio: 0.64, halfWidthRatio: 0.15, heightRatio: 0.34, snowDepth: 0.24, layer: 'far' },
        { xRatio: 0.87, halfWidthRatio: 0.18, heightRatio: 0.42, snowDepth: 0.30, layer: 'far' },
        // Near alpine range framing the center waterfall valley (gap at 0.50)
        { xRatio: 0.05, halfWidthRatio: 0.15, heightRatio: 0.30, snowDepth: 0.22, layer: 'near' },
        { xRatio: 0.26, halfWidthRatio: 0.15, heightRatio: 0.42, snowDepth: 0.30, layer: 'near' },
        { xRatio: 0.76, halfWidthRatio: 0.16, heightRatio: 0.44, snowDepth: 0.32, layer: 'near' },
      ]
    : [
        // Far atmospheric mountain range
        { xRatio: 0.12, halfWidthRatio: 0.13, heightRatio: 0.44, snowDepth: 0.30, layer: 'far' },
        { xRatio: 0.31, halfWidthRatio: 0.12, heightRatio: 0.38, snowDepth: 0.26, layer: 'far' },
        { xRatio: 0.50, halfWidthRatio: 0.10, heightRatio: 0.22, snowDepth: 0.14, layer: 'far' }, // Low misty notch behind statue
        { xRatio: 0.69, halfWidthRatio: 0.13, heightRatio: 0.40, snowDepth: 0.28, layer: 'far' },
        { xRatio: 0.88, halfWidthRatio: 0.14, heightRatio: 0.46, snowDepth: 0.32, layer: 'far' },
        // Near lush alpine range
        { xRatio: 0.04, halfWidthRatio: 0.12, heightRatio: 0.34, snowDepth: 0.22, layer: 'near' },
        { xRatio: 0.22, halfWidthRatio: 0.14, heightRatio: 0.46, snowDepth: 0.32, layer: 'near' },
        { xRatio: 0.36, halfWidthRatio: 0.10, heightRatio: 0.28, snowDepth: 0.18, layer: 'near' },
        { xRatio: 0.62, halfWidthRatio: 0.10, heightRatio: 0.30, snowDepth: 0.20, layer: 'near' },
        { xRatio: 0.79, halfWidthRatio: 0.15, heightRatio: 0.48, snowDepth: 0.34, layer: 'near' },
        { xRatio: 0.96, halfWidthRatio: 0.12, heightRatio: 0.34, snowDepth: 0.22, layer: 'near' },
      ];

  const minHalfW = Math.max(26, width * (isCompactMobile ? 0.085 : 0.075));
  const maxPeakHeight = Math.max(18, baseY - height * 0.2);

  peaks.forEach((p) => {
    const cx = p.xRatio * width;
    const hw = Math.max(minHalfW, p.halfWidthRatio * width);
    const peakH = Math.min(maxPeakHeight, p.heightRatio * height * (0.8 + sceneScale * 0.2));
    const topY = baseY - peakH;
    const leftX = cx - hw;
    const rightX = cx + hw;
    const isFar = p.layer === 'far';

    const tracePeakPath = () => {
      ctx.beginPath();
      ctx.moveTo(leftX, baseY + 2);
      ctx.lineTo(cx - hw * 0.06, topY + peakH * 0.04);
      ctx.quadraticCurveTo(cx, topY - 1, cx + hw * 0.06, topY + peakH * 0.04);
      ctx.lineTo(rightX, baseY + 2);
      ctx.closePath();
    };

    ctx.save();
    tracePeakPath();

    // 1) Base sunlit mountain gradient
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

    // Clip ridge shading & snow strictly inside silhouette
    ctx.clip();

    // 2) Shaded left facet
    const ridgeOffset = hw * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx, topY - 2);
    ctx.quadraticCurveTo(cx - ridgeOffset, topY + peakH * 0.45, cx + ridgeOffset * 0.8, baseY + 2);
    ctx.lineTo(leftX - 4, baseY + 2);
    ctx.closePath();
    ctx.fillStyle = isFar ? 'rgba(20, 62, 74, 0.30)' : 'rgba(12, 48, 38, 0.34)';
    ctx.fill();

    // 3) Draped snowcap with cool ice tint so it stays legible against white clouds
    const snowY = topY + peakH * p.snowDepth;
    const snowSpan = hw * (p.snowDepth + 0.14);

    ctx.beginPath();
    ctx.moveTo(cx - snowSpan, topY - 4);
    ctx.lineTo(cx + snowSpan, topY - 4);
    ctx.lineTo(cx + snowSpan, snowY + 2);
    ctx.bezierCurveTo(
      cx + snowSpan * 0.58, snowY - 4,
      cx + snowSpan * 0.34, snowY + 6,
      cx + snowSpan * 0.08, snowY + 1
    );
    ctx.bezierCurveTo(
      cx - snowSpan * 0.14, snowY - 3,
      cx - snowSpan * 0.42, snowY + 5,
      cx - snowSpan, snowY - 1
    );
    ctx.closePath();

    const snowGrad = ctx.createLinearGradient(cx, topY, cx, snowY + 6);
    snowGrad.addColorStop(0, '#F8FDFF');
    snowGrad.addColorStop(0.7, '#E0F2FE');
    snowGrad.addColorStop(1, '#BAE6FD');
    ctx.fillStyle = snowGrad;
    ctx.fill();

    // Cool glacial shadow on left half of snowcap
    ctx.beginPath();
    ctx.moveTo(cx, topY - 2);
    ctx.quadraticCurveTo(cx - ridgeOffset * 0.7, topY + peakH * 0.22, cx + ridgeOffset * 0.2, snowY + 8);
    ctx.lineTo(cx - snowSpan, snowY + 8);
    ctx.lineTo(cx - snowSpan, topY - 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.34)';
    ctx.fill();

    // 4) Soft atmospheric base mist
    const mistGrad = ctx.createLinearGradient(0, baseY - peakH * 0.24, 0, baseY);
    mistGrad.addColorStop(0, 'rgba(224, 247, 255, 0)');
    mistGrad.addColorStop(1, isFar ? 'rgba(186, 230, 253, 0.28)' : 'rgba(186, 230, 253, 0.14)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(leftX, baseY - peakH * 0.24, hw * 2, peakH * 0.26);

    ctx.restore();

    // 5) Crisp alpine rim outline for contrast over light skies/clouds
    ctx.save();
    tracePeakPath();
    ctx.strokeStyle = isFar ? 'rgba(14, 116, 144, 0.28)' : 'rgba(15, 118, 110, 0.34)';
    ctx.lineWidth = 0.85;
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

  useEffect(() => {
    pausedRef.current = isPaused;
    if (!isPaused) {
      resumeLoopRef.current?.();
    }
  }, [isPaused]);

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

    const staticCanvas = document.createElement('canvas');
    const staticCtx = staticCanvas.getContext('2d', { alpha: true });

    let animationFrameId = 0;
    let isRunning = false;
    let isVisible = true;
    let isDocVisible = typeof document !== 'undefined' ? !document.hidden : true;
    let lastTimestamp = 0;
    let time = 0;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let sceneScale = 1;

    let windGust = 0;
    let treeShake = 0;

    // Gentle foreground meadow hill leaving a crisp, visible turquoise river strip behind it
    const getGroundY = (x: number, w: number, h: number) => {
      const normalizedX = Math.max(0, Math.min(1, x / (w || 1)));
      const arch = Math.sin(normalizedX * Math.PI) * (h * 0.085);
      return h * 0.91 - arch;
    };

    // Height-safe mango tree geometry so the canopy NEVER clips at the top edge
    const getMangoTreeMetrics = (w: number, h: number, scale: number) => {
      const x = w * mangoTree.xRatio;
      const groundY = getGroundY(x, w, h);
      const trunkH = Math.min(h * 0.35, 42 * scale);
      const canopyR = Math.min(h * 0.14, 14.5 * scale);
      const sideR = canopyR * 0.74;
      const canopyCenterY = Math.max(canopyR + 4, groundY - trunkH - canopyR * 0.45);
      return { x, groundY, trunkH, canopyR, sideR, canopyCenterY };
    };

    const goal = {
      mouthX: 36,
      backX: 10,
      height: 30,
      netBulge: 0,
      netBulgeVel: 0,
    };

    let goalState: 'play' | 'celebrating' = 'play';
    let goalTimer = 0;
    let scorerId: number | null = null;

    let hopscotchTimer = 0;
    const beanbag = {
      x: 0,
      y: 0,
      visible: true,
    };

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
        baseRatio: 0.20, curX: 0, curY: 0, facing: 1, state: 'underwater',
        timer: 45, leapDuration: 34, leapProgress: 0, startX: 0, targetX: 0,
        apexHeight: 9, color: '#f97316', bellyColor: '#fef08a',
      },
      {
        baseRatio: 0.69, curX: 0, curY: 0, facing: -1, state: 'underwater',
        timer: 155, leapDuration: 36, leapProgress: 0, startX: 0, targetX: 0,
        apexHeight: 10, color: '#fb923c', bellyColor: '#ffffff',
      },
      {
        baseRatio: 0.86, curX: 0, curY: 0, facing: 1, state: 'underwater',
        timer: 265, leapDuration: 32, leapProgress: 0, startX: 0, targetX: 0,
        apexHeight: 8, color: '#0284c7', bellyColor: '#e0f2fe',
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
        x, y, vx, vy, size, color, life,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.25,
      });
    };

    const ball = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 4.5,
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

    // Mango tree positioned cleanly between soccer pitch and butterfly girl
    const mangoTree = {
      xRatio: 0.325,
      mangoes: [
        { id: 1, normX: -0.58, normY: 0.15, isFalling: false, curY: 0, vy: 0 },
        { id: 2, normX: 0.52, normY: 0.25, isFalling: false, curY: 0, vy: 0 },
        { id: 3, normX: -0.05, normY: -0.35, isFalling: false, curY: 0, vy: 0 },
      ],
      slingshotPebble: { active: false, x: 0, y: 0, vx: 0, vy: 0, targetMangoId: 1 },
      basketMangoCount: 2,
    };

    const butterflies = [
      { ratioX: 0.18, x: 0, y: 20, vx: 0.42, vy: 0, wingAngle: 0, wingSpeed: 0.28, color: '#f43f5e', size: 2.5 },
      { ratioX: 0.43, x: 0, y: 24, vx: -0.38, vy: 0, wingAngle: 1.2, wingSpeed: 0.31, color: '#0ea5e9', size: 2.7 },
      { ratioX: 0.84, x: 0, y: 22, vx: 0.36, vy: 0, wingAngle: 2.1, wingSpeed: 0.26, color: '#f59e0b', size: 2.5 },
    ];

    const clouds = [
      { ratioX: 0.16, x: 0, y: 14, speed: 0.14, scale: 0.72, opacity: 0.65 },
      { ratioX: 0.54, x: 0, y: 10, speed: 0.11, scale: 0.85, opacity: 0.72 },
      { ratioX: 0.86, x: 0, y: 15, speed: 0.16, scale: 0.66, opacity: 0.6 },
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
        | 'soccer-goalie'
        | 'butterfly-catcher'
        | 'bicycle-rider'
        | 'hopscotch-player';
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
        id: 8, baseRatioX: 0.105, curX: 0, yOffset: 0, vy: 0,
        activity: 'soccer-goalie', facing: 1,
        hairColor: '#1e293b', hairStyle: 'beanie',
        shirtColor: '#22c55e', pantsColor: '#0f172a', skinColor: '#fde68a',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 1, baseRatioX: 0.175, curX: 0, yOffset: 0, vy: 0,
        activity: 'soccer-striker', facing: 1,
        hairColor: '#b45309', hairStyle: 'short-brown',
        shirtColor: '#0284c7', pantsColor: '#1e293b', skinColor: '#fde68a',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'hunt-ball',
      },
      {
        id: 3, baseRatioX: 0.255, curX: 0, yOffset: 0, vy: 0,
        activity: 'soccer-midfield', facing: -1,
        hairColor: '#1e293b', hairStyle: 'spiky-black',
        shirtColor: '#f59e0b', pantsColor: '#1e3a8a', skinColor: '#fde68a',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 2, baseRatioX: 0.36, curX: 0, yOffset: 0, vy: 0,
        activity: 'slingshot-hunter', facing: -1,
        hairColor: '#7c2d12', hairStyle: 'beanie',
        shirtColor: '#ea580c', pantsColor: '#15803d', skinColor: '#fef3c7',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 4, baseRatioX: 0.43, curX: 0, yOffset: 0, vy: 0,
        activity: 'butterfly-catcher', facing: 1,
        hairColor: '#facc15', hairStyle: 'blonde-bob',
        shirtColor: '#ec4899', pantsColor: '#ec4899', skinColor: '#fef3c7',
        hasDress: true,
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 5, baseRatioX: 0.65, curX: 0, yOffset: 0, vy: 0,
        activity: 'bicycle-rider', facing: 1,
        hairColor: '#ea580c', hairStyle: 'ponytail-red',
        shirtColor: '#10b981', pantsColor: '#047857', skinColor: '#fde68a',
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 6, baseRatioX: 0.82, curX: 0, yOffset: 0, vy: 0,
        activity: 'hopscotch-player', facing: 1,
        hairColor: '#ea580c', hairStyle: 'orange-pigtails',
        shirtColor: '#3b82f6', pantsColor: '#3b82f6', skinColor: '#fef3c7',
        hasDress: true,
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
      {
        id: 7, baseRatioX: 0.94, curX: 0, yOffset: 0, vy: 0,
        activity: 'hopscotch-player', facing: -1,
        hairColor: '#451a03', hairStyle: 'curly-brown',
        shirtColor: '#a855f7', pantsColor: '#a855f7', skinColor: '#fde047',
        hasDress: true,
        kickCooldown: 0, runCycle: 0, speed: 0, slingshotTimer: 0, bikeDistance: 0,
        kickPhase: 'idle', kickProgress: 0, kickLegAngle: 0, soccerIntent: 'support',
      },
    ];

    const flowers = [
      { ratioX: 0.13, color: '#f43f5e', size: 2.1, sway: 0.0 },
      { ratioX: 0.28, color: '#a855f7', size: 2.0, sway: 1.2 },
      { ratioX: 0.39, color: '#38bdf8', size: 2.2, sway: 2.4 },
      { ratioX: 0.53, color: '#f59e0b', size: 2.1, sway: 0.8 },
      { ratioX: 0.62, color: '#ec4899', size: 2.2, sway: 3.1 },
      { ratioX: 0.78, color: '#f97316', size: 2.1, sway: 1.7 },
      { ratioX: 0.88, color: '#a855f7', size: 2.0, sway: 2.1 },
    ];

    const getHopscotchBounds = (w: number) => {
      const rightEdge = w - 13;
      const c7BaseX = Math.min(rightEdge, w * 0.945);
      const c6BaseX = Math.max(w * 0.79, Math.min(c7BaseX - 32, w * 0.82));
      const span = Math.max(22, Math.min(48, c7BaseX - c6BaseX - 8));
      const centerX = (c6BaseX + c7BaseX) * 0.5;
      const leftX = centerX - span * 0.5;
      const rightX = centerX + span * 0.5;
      const sqW = span / 3;
      return {
        c6HomeX: Math.max(w * 0.785, leftX - 4),
        c7HomeX: Math.min(rightEdge, rightX + 4),
        leftX,
        sqW,
        sq1X: leftX + sqW * 0.5,
        sq2X: leftX + sqW * 1.5,
        sq3X: leftX + sqW * 2.5,
      };
    };

    const rebuildStaticLayer = () => {
      if (!staticCtx || width <= 0 || height <= 0) return;

      staticCanvas.width = Math.round(width * dpr);
      staticCanvas.height = Math.round(height * dpr);
      staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      staticCtx.clearRect(0, 0, width, height);

      if (!transparentSky) {
        const skyGrad = staticCtx.createLinearGradient(0, 0, 0, height);
        skyGrad.addColorStop(0, 'rgba(238, 248, 255, 0.95)');
        skyGrad.addColorStop(0.7, 'rgba(240, 253, 244, 0.9)');
        skyGrad.addColorStop(1, 'rgba(236, 253, 245, 0.95)');
        staticCtx.fillStyle = skyGrad;
        staticCtx.fillRect(0, 0, width, height);
      }

      // 1) Layered Alpine Mountain Ranges
      const riverFarShoreY = height * 0.68;
      drawAlpineMountains(staticCtx, width, height, riverFarShoreY, sceneScale);

      // 2) Mid-Ground Turquoise River (generous band visible above meadow hill)
      const riverTopY = height * 0.67;
      staticCtx.beginPath();
      staticCtx.moveTo(0, height);
      for (let i = 0; i <= 32; i++) {
        const px = (i / 32) * width;
        staticCtx.lineTo(px, riverTopY + Math.sin(i * 0.4) * 1.2);
      }
      staticCtx.lineTo(width, height);
      staticCtx.closePath();

      const riverGrad = staticCtx.createLinearGradient(0, riverTopY, 0, height * 0.88);
      riverGrad.addColorStop(0, '#38bdf8');
      riverGrad.addColorStop(0.45, '#0ea5e9');
      riverGrad.addColorStop(1, '#0284c7');
      staticCtx.fillStyle = riverGrad;
      staticCtx.fill();

      // Far shoreline highlight
      staticCtx.strokeStyle = 'rgba(224, 242, 254, 0.6)';
      staticCtx.lineWidth = 0.95;
      staticCtx.beginPath();
      staticCtx.moveTo(width * 0.08, riverTopY + 2.2);
      staticCtx.lineTo(width * 0.34, riverTopY + 1.8);
      staticCtx.moveTo(width * 0.56, riverTopY + 2.4);
      staticCtx.lineTo(width * 0.86, riverTopY + 2.0);
      staticCtx.stroke();

      // 3) Rocky Cliff Framing Waterfall in Center Gap
      const cliffL = width * 0.485;
      const cliffR = width * 0.515;
      const cliffTopY = height * 0.55;
      const cliffBaseY = height * 0.71;
      const rockW = Math.max(5.0, Math.min(8.0, width * 0.013));

      // Left rock cliff
      staticCtx.fillStyle = '#334155';
      staticCtx.strokeStyle = '#1e293b';
      staticCtx.lineWidth = 0.9;
      staticCtx.beginPath();
      if (typeof staticCtx.roundRect === 'function') {
        staticCtx.roundRect(cliffL - rockW, cliffTopY, rockW, cliffBaseY - cliffTopY + 2, [3, 1, 1, 3]);
      } else {
        staticCtx.rect(cliffL - rockW, cliffTopY, rockW, cliffBaseY - cliffTopY + 2);
      }
      staticCtx.fill();
      staticCtx.stroke();
      staticCtx.fillStyle = '#166534';
      staticCtx.fillRect(cliffL - rockW, cliffTopY, rockW, 2.0);

      // Right rock cliff
      staticCtx.fillStyle = '#334155';
      staticCtx.beginPath();
      if (typeof staticCtx.roundRect === 'function') {
        staticCtx.roundRect(cliffR, cliffTopY, rockW, cliffBaseY - cliffTopY + 2, [1, 3, 3, 1]);
      } else {
        staticCtx.rect(cliffR, cliffTopY, rockW, cliffBaseY - cliffTopY + 2);
      }
      staticCtx.fill();
      staticCtx.stroke();
      staticCtx.fillStyle = '#166534';
      staticCtx.fillRect(cliffR, cliffTopY, rockW, 2.0);

      staticCtx.fillStyle = '#1e293b';
      staticCtx.beginPath();
      staticCtx.ellipse(cliffL - 2, cliffBaseY + 1, 3.6, 2.0, 0, 0, Math.PI * 2);
      staticCtx.ellipse(cliffR + 2, cliffBaseY + 1, 3.6, 2.0, 0, 0, Math.PI * 2);
      staticCtx.fill();

      // 4) Background Shade Tree & School Building (drawn behind foreground hill for depth)
      const tree2X = width * 0.565;
      const tree2GroundY = getGroundY(tree2X, width, height);
      const shadeH = Math.min(height * 0.2, 19 * sceneScale);
      const shadeR = Math.min(height * 0.09, 8.5 * sceneScale);

      staticCtx.strokeStyle = '#854d0e';
      staticCtx.lineWidth = Math.max(2, 2.4 * sceneScale);
      staticCtx.beginPath();
      staticCtx.moveTo(tree2X, tree2GroundY);
      staticCtx.lineTo(tree2X - 1, tree2GroundY - shadeH);
      staticCtx.stroke();

      staticCtx.fillStyle = '#86efac';
      staticCtx.strokeStyle = '#10b981';
      staticCtx.lineWidth = 1.1;
      staticCtx.beginPath();
      staticCtx.arc(tree2X, tree2GroundY - shadeH - shadeR * 0.55, shadeR, 0, Math.PI * 2);
      staticCtx.fill();
      staticCtx.stroke();

      // School Building (tucked neatly at 0.755)
      const schoolX = width * 0.755;
      const schoolGroundY = getGroundY(schoolX, width, height);
      const sw = 17 * (0.78 + sceneScale * 0.22);
      const sh = 14.5 * (0.78 + sceneScale * 0.22);
      staticCtx.fillStyle = '#f8fafc';
      staticCtx.strokeStyle = '#64748b';
      staticCtx.lineWidth = 1.0;
      staticCtx.fillRect(schoolX - sw * 0.5, schoolGroundY - sh, sw, sh);
      staticCtx.strokeRect(schoolX - sw * 0.5, schoolGroundY - sh, sw, sh);

      // Tiny school door & windows
      staticCtx.fillStyle = '#94a3b8';
      staticCtx.fillRect(schoolX - 1.8, schoolGroundY - sh * 0.45, 3.6, sh * 0.45);
      staticCtx.fillStyle = '#bae6fd';
      staticCtx.fillRect(schoolX - sw * 0.36, schoolGroundY - sh * 0.76, 3, 3);
      staticCtx.fillRect(schoolX + sw * 0.36 - 3, schoolGroundY - sh * 0.76, 3, 3);

      // Flagpole
      staticCtx.strokeStyle = '#64748b';
      staticCtx.lineWidth = 1.0;
      staticCtx.beginPath();
      staticCtx.moveTo(schoolX - 2, schoolGroundY - sh);
      staticCtx.lineTo(schoolX - 2, schoolGroundY - sh - 8.5 * sceneScale);
      staticCtx.stroke();

      // 5) Foreground Rolling Sunlit Meadow Hill
      staticCtx.beginPath();
      staticCtx.moveTo(0, height);
      for (let i = 0; i <= 44; i++) {
        const px = (i / 44) * width;
        staticCtx.lineTo(px, getGroundY(px, width, height));
      }
      staticCtx.lineTo(width, height);
      staticCtx.closePath();

      const hillGrad = staticCtx.createLinearGradient(0, height * 0.75, 0, height);
      hillGrad.addColorStop(0, '#bef264');
      hillGrad.addColorStop(0.28, '#84cc16');
      hillGrad.addColorStop(0.72, '#65a30d');
      hillGrad.addColorStop(1, '#3f6212');
      staticCtx.fillStyle = hillGrad;
      staticCtx.fill();

      staticCtx.strokeStyle = 'rgba(236, 252, 203, 0.78)';
      staticCtx.lineWidth = 1.3;
      staticCtx.beginPath();
      for (let i = 0; i <= 44; i++) {
        const px = (i / 44) * width;
        const py = getGroundY(px, width, height) + 0.5;
        if (i === 0) staticCtx.moveTo(px, py);
        else staticCtx.lineTo(px, py);
      }
      staticCtx.stroke();

      // 6) Mango Tree Trunk (planted firmly on foreground meadow)
      const tm = getMangoTreeMetrics(width, height, sceneScale);
      staticCtx.fillStyle = 'rgba(15, 23, 42, 0.16)';
      staticCtx.beginPath();
      staticCtx.ellipse(tm.x, tm.groundY + 1, 7 * sceneScale, 1.8, 0, 0, Math.PI * 2);
      staticCtx.fill();

      staticCtx.strokeStyle = '#78350f';
      staticCtx.lineWidth = Math.max(2.6, 3.8 * sceneScale);
      staticCtx.lineCap = 'round';
      staticCtx.beginPath();
      staticCtx.moveTo(tm.x, tm.groundY);
      staticCtx.quadraticCurveTo(tm.x - 1.5, tm.groundY - tm.trunkH * 0.5, tm.x - 1, tm.canopyCenterY + tm.canopyR * 0.4);
      staticCtx.stroke();

      // 7) Compact 3-Square Pastel Chalk Hopscotch Court on Right
      const hs = getHopscotchBounds(width);
      const chalkFills = [
        'rgba(254, 205, 211, 0.35)',
        'rgba(186, 230, 253, 0.35)',
        'rgba(254, 240, 138, 0.35)',
      ];
      for (let s = 0; s < 3; s++) {
        const sqX = hs.leftX + s * hs.sqW;
        const sqMidX = sqX + hs.sqW * 0.5;
        const sqGroundY = getGroundY(sqMidX, width, height) + 2.2;
        const sqH = 5.6;

        staticCtx.fillStyle = chalkFills[s];
        staticCtx.beginPath();
        staticCtx.rect(sqX + 0.8, sqGroundY - sqH * 0.5, Math.max(2, hs.sqW - 1.6), sqH);
        staticCtx.fill();

        staticCtx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
        staticCtx.lineWidth = 1.0;
        staticCtx.stroke();

        staticCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        staticCtx.font = 'bold 5px sans-serif';
        staticCtx.textAlign = 'center';
        staticCtx.textBaseline = 'middle';
        staticCtx.fillText(String(s + 1), sqMidX, sqGroundY);
      }
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const prevWidth = width;
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      sceneScale = getSceneScale(width, height);

      goal.mouthX = Math.max(26, Math.min(44, width * 0.092));
      goal.backX = Math.max(6, goal.mouthX - Math.round(18 * sceneScale + 5));
      goal.height = Math.round(Math.min(height * 0.31, 32 * (0.8 + sceneScale * 0.2)));

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      rebuildStaticLayer();

      const scaleXRatio = prevWidth > 0 ? width / prevWidth : 1;

      children.forEach((c) => {
        c.curX = c.curX ? c.curX * scaleXRatio : c.baseRatioX * width;
        c.curX = Math.max(12, Math.min(width - 13, c.curX));
      });

      butterflies.forEach((bf) => {
        bf.x = bf.x ? bf.x * scaleXRatio : bf.ratioX * width;
        bf.x = Math.max(12, Math.min(width - 14, bf.x));
      });

      clouds.forEach((cl) => {
        cl.x = cl.x ? cl.x * scaleXRatio : cl.ratioX * width;
      });

      if (!ball.initialized) {
        ball.x = width * 0.21;
        ball.y = getGroundY(ball.x, width, height) - ball.radius;
        ball.vx = 0;
        ball.vy = 0;
        ball.initialized = true;
      } else {
        ball.x = Math.max(goal.backX + ball.radius + 3, Math.min(width * 0.29, ball.x * scaleXRatio));
      }

      if (pausedRef.current) {
        drawFrame(0);
      }
    };

    const triggerPlayerKick = (c: PlayingChild, kickDirection: -1 | 1) => {
      c.kickPhase = 'windup';
      c.kickProgress = 0;
      c.facing = kickDirection;
      c.kickLegAngle = 0;
      c.kickCooldown = 56;
      c.kickHasContacted = false;
    };

    const handleTap = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const tapX = clientX - rect.left;
      const tapY = clientY - rect.top;
      let hitInteractive = false;

      const distToBall = Math.hypot(tapX - ball.x, tapY - ball.y);
      if (distToBall < 32 && !ball.inNet) {
        hitInteractive = true;
        ball.vx = -Math.abs((3.4 + Math.random() * 1.2) * (0.78 + sceneScale * 0.22));
        ball.vy = -3.1 * (0.8 + sceneScale * 0.2);
        ball.rotSpeed = ball.vx * 0.16;
        ball.scaleX = 1.26;
        ball.scaleY = 0.78;
        for (let k = 0; k < 5; k++) {
          spawnParticle(
            ball.x,
            ball.y + 3,
            (Math.random() - 0.5) * 2.1,
            -1.0 - Math.random() * 1.3,
            1.6,
            '#84cc16',
            0.75
          );
        }
      }

      const tm = getMangoTreeMetrics(width, height, sceneScale);
      if (Math.hypot(tapX - tm.x, tapY - tm.canopyCenterY) < Math.max(24, tm.canopyR * 1.8)) {
        hitInteractive = true;
        treeShake = 1;
        const hanging = mangoTree.mangoes.find((m) => !m.isFalling);
        if (hanging) {
          hanging.isFalling = true;
          hanging.curY = tm.canopyCenterY + hanging.normY * tm.canopyR;
          hanging.vy = 0.35;
        }
      }

      children.forEach((c) => {
        const gy = getGroundY(c.curX, width, height);
        if (
          Math.abs(tapX - c.curX) < 22 &&
          Math.abs(tapY - (gy - 12)) < 24 &&
          c.yOffset >= -0.5 &&
          c.kickPhase === 'idle'
        ) {
          hitInteractive = true;
          c.vy = -3.0 * (0.82 + sceneScale * 0.18);
          for (let p = 0; p < 5; p++) {
            spawnParticle(
              c.curX + (Math.random() - 0.5) * 9,
              gy - 18,
              (Math.random() - 0.5) * 1.9,
              -1.3 - Math.random() * 1.5,
              1.8,
              ['#f59e0b', '#ec4899', '#38bdf8', '#10b981'][p % 4],
              0.9
            );
          }
        }
      });

      const statueX = width * 0.5;
      const statueY = height * 0.55 - 16 * sceneScale;
      if (Math.hypot(tapX - statueX, tapY - statueY) < 24) {
        hitInteractive = true;
        for (let p = 0; p < 8; p++) {
          spawnParticle(
            statueX + (Math.random() - 0.5) * 12,
            statueY + (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 1.4,
            -0.8 - Math.random() * 1.2,
            1.6,
            '#fef08a',
            0.9
          );
        }
      }

      const currentBoatX = width * 0.64 + Math.sin(time * 0.007) * (width * 0.04);
      if (Math.hypot(tapX - currentBoatX, tapY - height * 0.74) < 24) {
        hitInteractive = true;
      }

      if (hitInteractive) {
        cosmicSound.recordMiniatureInteraction();
      } else {
        windGust = 2.2;
        butterflies.forEach((bf) => {
          bf.vx += (Math.random() - 0.5) * 1.0;
          bf.vy -= 0.45;
        });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      handleTap(e.clientX, e.clientY);
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });

    const drawFrame = (dt: number) => {
      time += dt;

      // Hopscotch game progresses continuously at a slow, peaceful, joyful pace
      hopscotchTimer += dt * 0.15;

      windGust *= Math.pow(0.95, dt);
      treeShake *= Math.pow(0.88, dt);

      const breeze = Math.sin(time * 0.045) * 0.8 + windGust;

      ctx.clearRect(0, 0, width, height);

      // 1) Blit cached static scenery (mountains, river, hill, school, tree trunk)
      ctx.drawImage(staticCanvas, 0, 0, width, height);

      // 1a) Gentle river shimmer lines
      const riverShimmerY = height * 0.725;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.36)';
      ctx.lineWidth = 0.85;
      for (let s = 0; s < 4; s++) {
        const sx = ((width * (0.12 + s * 0.24) + time * 0.18) % width);
        const sy = riverShimmerY + (s % 2) * 3.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 10, sy);
        ctx.stroke();
      }

      // 1b) Animated Waterfall (Center Gap)
      const cliffL = width * 0.485;
      const cliffR = width * 0.515;
      const cliffTopY = height * 0.55;
      const cliffBaseY = height * 0.71;
      const cascadeW = Math.max(9, cliffR - cliffL);
      const cascadeH = cliffBaseY - cliffTopY;

      ctx.save();
      ctx.beginPath();
      ctx.rect(cliffL, cliffTopY, cascadeW, cascadeH + 2);
      ctx.clip();

      const waterGrad = ctx.createLinearGradient(0, cliffTopY, 0, cliffBaseY);
      waterGrad.addColorStop(0, 'rgba(56, 189, 248, 0.88)');
      waterGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.92)');
      waterGrad.addColorStop(1, 'rgba(224, 242, 254, 0.96)');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(cliffL, cliffTopY, cascadeW, cascadeH + 2);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 0.95;
      const streakCount = Math.max(3, Math.floor(cascadeW / 3.4));
      for (let s = 0; s < streakCount; s++) {
        const sx = cliffL + 1.4 + s * ((cascadeW - 2.8) / Math.max(1, streakCount - 1));
        const streakLen = 4.2 + (s % 3) * 1.6;
        const offset = (time * 2.4 + s * 6.2) % (cascadeH + streakLen);
        ctx.beginPath();
        ctx.moveTo(sx, cliffTopY + offset - streakLen);
        ctx.lineTo(sx, cliffTopY + offset);
        ctx.stroke();
      }
      ctx.restore();

      const cascadeCenterX = (cliffL + cliffR) / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.ellipse(cascadeCenterX, cliffBaseY + 1, cascadeW * 0.72, 2.0, 0, 0, Math.PI * 2);
      ctx.fill();

      // Waterfall base splash ripples
      for (let r = 0; r < 3; r++) {
        const rTime = (time * 0.035 + r * 0.33) % 1;
        const rw = cascadeW * 0.5 + rTime * 10;
        const rh = 1.4 + rTime * 2.6;
        const rAlpha = (1 - rTime) * 0.55;
        ctx.strokeStyle = `rgba(224, 242, 254, ${rAlpha})`;
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.ellipse(cascadeCenterX, cliffBaseY + 1.4, rw, rh, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Waterfall rising mist puffs
      for (let m = 0; m < 4; m++) {
        const mTime = (time * 0.04 + m * 0.25) % 1;
        const mx = cascadeCenterX + Math.sin(time * 0.08 + m * 2) * (cascadeW * 0.42);
        const my = cliffBaseY - mTime * 9;
        const mAlpha = Math.sin(mTime * Math.PI) * 0.38;
        const mRadius = 1.8 + mTime * 3.8;
        ctx.fillStyle = `rgba(255, 255, 255, ${mAlpha})`;
        ctx.beginPath();
        ctx.arc(mx, my, mRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 1b2) Dignified Golden Statue of Prophet Abraham with Live Breathing Aura & Glints
      drawAbrahamStatueAboveWaterfall(ctx, {
        waterfallCenterX: cascadeCenterX,
        waterfallTopY: cliffTopY,
        waterfallWidth: Math.max(22, cliffR - cliffL),
        scale: Math.max(0.78, sceneScale * 0.96),
        time: time,
      });

      // 1c) River Fisherman in Small Wooden Boat (clearly visible on the river band)
      const boatCycle = time * 0.007;
      const boatBaseX = width * 0.64 + Math.sin(boatCycle) * (width * 0.04);
      const boatSpeed = Math.cos(boatCycle);
      const boatBobY = Math.sin(time * 0.055 + 1.2) * 1.0;
      const boatY = height * 0.735 + boatBobY;
      const boatRock = Math.sin(time * 0.045) * 0.032 + boatSpeed * 0.018;
      const boatScale = 0.72 + sceneScale * 0.28;

      ctx.save();
      ctx.translate(boatBaseX, boatY);
      ctx.scale(boatScale, boatScale);
      ctx.rotate(boatRock);

      ctx.fillStyle = 'rgba(14, 116, 144, 0.30)';
      ctx.beginPath();
      ctx.ellipse(0, 3.8, 9.8, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#92400e';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.moveTo(-9.5, -1);
      ctx.quadraticCurveTo(-10.8, 2.8, -7.0, 3.5);
      ctx.lineTo(7.0, 3.5);
      ctx.quadraticCurveTo(10.8, 2.8, 9.5, -1);
      ctx.quadraticCurveTo(0, 0.9, -9.5, -1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Fisherman torso + head + straw hat
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-3.8, -5.2, 4.2, 4.6);

      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(-1.7, -6.9, 2.0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(-1.7, -8.2, 5.2, 1.6, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Fishing rod + line + bobber
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 0.95;
      const rodWiggle = Math.sin(time * 0.08) * 0.7;
      const rodTipX = 11.5 + rodWiggle * 0.4;
      const rodTipY = -9.5 + rodWiggle;
      ctx.beginPath();
      ctx.moveTo(-1.0, -3.2);
      ctx.quadraticCurveTo(4.5, -9, rodTipX, rodTipY);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 0.65;
      const bobberX = 14.5;
      const bobberY = 2.8 + Math.sin(time * 0.09) * 0.6;
      ctx.beginPath();
      ctx.moveTo(rodTipX, rodTipY);
      ctx.lineTo(bobberX, bobberY);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(bobberX, bobberY - 0.7, 1.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bobberX, bobberY + 0.3, 1.0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 1d) Jumping Fish & Splash Ripples in River
      const riverWaterY = height * 0.72;

      for (let ri = riverRipples.length - 1; ri >= 0; ri--) {
        const rp = riverRipples[ri];
        rp.r += rp.speed * dt;
        rp.alpha = Math.max(0, 0.75 * (1 - rp.r / rp.maxR));
        if (rp.alpha <= 0 || rp.r >= rp.maxR) {
          riverRipples.splice(ri, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(224, 242, 254, ${rp.alpha})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let di = riverDroplets.length - 1; di >= 0; di--) {
        const dp = riverDroplets[di];
        dp.x += dp.vx * dt;
        dp.y += dp.vy * dt;
        dp.vy += 0.18 * dt;
        dp.alpha -= 0.045 * dt;
        if (dp.alpha <= 0 || dp.y > riverWaterY + 4) {
          riverDroplets.splice(di, 1);
          continue;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${dp.alpha})`;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 0.95, 0, Math.PI * 2);
        ctx.fill();
      }

      riverFish.forEach((f) => {
        const nominalX = width * f.baseRatio;
        if (f.state === 'underwater') {
          f.timer -= dt;
          if (f.timer <= 0) {
            f.state = 'leaping';
            f.startX = nominalX + (Math.random() - 0.5) * 8;
            const leapDist = f.facing * (10 + Math.random() * 5) * (0.72 + sceneScale * 0.28);
            f.targetX = f.startX + leapDist;
            f.apexHeight = (6.5 + Math.random() * 3.5) * (0.72 + sceneScale * 0.28);
            f.leapDuration = 32;
            f.leapProgress = 0;

            riverRipples.push({
              x: f.startX,
              y: riverWaterY + 1,
              r: 1.4,
              maxR: 8.0,
              alpha: 0.8,
              speed: 0.35,
            });
            for (let d = 0; d < 3; d++) {
              riverDroplets.push({
                x: f.startX + (Math.random() - 0.5) * 3.5,
                y: riverWaterY - 1,
                vx: -f.facing * (0.3 + Math.random() * 0.45),
                vy: -1.0 - Math.random() * 0.65,
                alpha: 0.9,
              });
            }
          }
        } else if (f.state === 'leaping') {
          f.leapProgress += (1 / f.leapDuration) * dt;
          if (f.leapProgress >= 1) {
            f.state = 'underwater';
            f.timer = 190 + Math.random() * 190;
            f.facing = (f.facing === 1 ? -1 : 1) as 1 | -1;

            riverRipples.push({
              x: f.targetX,
              y: riverWaterY + 1,
              r: 1.4,
              maxR: 9.0,
              alpha: 0.85,
              speed: 0.38,
            });
          } else {
            f.curX = f.startX + f.leapProgress * (f.targetX - f.startX);
            const arcY = Math.sin(f.leapProgress * Math.PI) * f.apexHeight;
            f.curY = riverWaterY - arcY;

            const vx = f.targetX - f.startX;
            const vy = -Math.cos(f.leapProgress * Math.PI) * Math.PI * f.apexHeight;
            const fishAngle = Math.atan2(vy, vx);

            ctx.save();
            ctx.translate(f.curX, f.curY);
            ctx.scale(0.76 + sceneScale * 0.24, 0.76 + sceneScale * 0.24);
            ctx.rotate(fishAngle);

            ctx.fillStyle = f.color;
            ctx.strokeStyle = '#9a3412';
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(3.8, 0);
            ctx.quadraticCurveTo(1.1, -2.1, -2.6, -1.5);
            ctx.lineTo(-3.8, -2.2);
            ctx.lineTo(-3.2, 0);
            ctx.lineTo(-3.8, 2.2);
            ctx.lineTo(-2.6, 1.5);
            ctx.quadraticCurveTo(1.1, 2.1, 3.8, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.restore();
          }
        }
      });

      // 2) Clouds if not transparentSky
      if (!transparentSky) {
        clouds.forEach((cloud) => {
          cloud.x += (cloud.speed + breeze * 0.16) * dt;
          if (cloud.x > width + 44) cloud.x = -44;
          ctx.save();
          ctx.translate(cloud.x, cloud.y);
          ctx.scale(cloud.scale, cloud.scale);
          ctx.fillStyle = `rgba(186, 230, 253, ${cloud.opacity})`;
          ctx.beginPath();
          ctx.arc(0, 0, 9, 0, Math.PI * 2);
          ctx.arc(8, 2, 7, 0, Math.PI * 2);
          ctx.arc(-8, 2, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      // 3) Distant gliding birds
      ctx.strokeStyle = transparentSky ? 'rgba(15, 45, 98, 0.45)' : '#64748b';
      ctx.lineWidth = 0.95;
      ctx.lineCap = 'round';
      const birdOffset = (time * 0.3) % (width + 60);
      for (let b = 0; b < 3; b++) {
        const bx = ((width - birdOffset + b * 12) % (width + 60)) - 16;
        const flap = Math.sin(time * 0.14 + b * 1.2) * 1.3;
        const by = Math.max(8, height * 0.12) + b * 3.2 + flap * 0.5;
        ctx.beginPath();
        ctx.moveTo(bx - 3.6, by + flap * 0.3);
        ctx.quadraticCurveTo(bx - 1.6, by - 1.9, bx, by);
        ctx.quadraticCurveTo(bx + 1.6, by - 1.9, bx + 3.6, by + flap * 0.3);
        ctx.stroke();
      }

      // 4) Live Mango Tree Canopy, Mangoes & Basket
      const tm = getMangoTreeMetrics(width, height, sceneScale);
      const canopySway =
        breeze * 0.35 + Math.sin(time * 0.75) * treeShake * 2.4;

      ctx.save();
      ctx.translate(canopySway, 0);
      ctx.fillStyle = '#22c55e';
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(tm.x, tm.canopyCenterY, tm.canopyR, 0, Math.PI * 2);
      ctx.arc(tm.x - tm.canopyR * 0.62, tm.canopyCenterY + tm.canopyR * 0.44, tm.sideR, 0, Math.PI * 2);
      ctx.arc(tm.x + tm.canopyR * 0.62, tm.canopyCenterY + tm.canopyR * 0.44, tm.sideR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Woven basket + collected mangoes at base of tree
      const basketX = tm.x + 6.5 * sceneScale;
      const basketY = tm.groundY;
      const visibleBasketMangoes = Math.min(4, mangoTree.basketMangoCount);
      for (let bm = 0; bm < visibleBasketMangoes; bm++) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.ellipse(
          basketX - 2.4 + bm * 1.6,
          basketY - 4.2 - (bm % 2) * 0.8,
          1.4,
          1.8,
          0.2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.fillStyle = '#b45309';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(basketX - 4.2, basketY);
      ctx.lineTo(basketX - 3.3, basketY - 4.2);
      ctx.lineTo(basketX + 3.3, basketY - 4.2);
      ctx.lineTo(basketX + 4.2, basketY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      mangoTree.mangoes.forEach((m) => {
        const homeY = tm.canopyCenterY + m.normY * tm.canopyR;
        if (m.isFalling) {
          m.vy += 0.22 * dt;
          m.curY += m.vy * dt;
          if (m.curY >= tm.groundY - 4) {
            m.isFalling = false;
            m.curY = homeY;
            mangoTree.basketMangoCount++;
          }
        }
        const mx = tm.x + m.normX * tm.canopyR + (m.isFalling ? 0 : canopySway);
        const my = m.isFalling ? m.curY : homeY;
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.ellipse(mx, my, 1.9, 2.5, 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // School animated wind flag
      const schoolX = width * 0.755;
      const schoolGroundY = getGroundY(schoolX, width, height);
      const sh = 14.5 * (0.78 + sceneScale * 0.22);
      const poleTopY = schoolGroundY - sh - 8.5 * sceneScale;
      const flagWave = Math.sin(time * 0.14) * (1.0 + Math.abs(breeze) * 0.45);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(schoolX - 2, poleTopY);
      ctx.quadraticCurveTo(schoolX + 2, poleTopY - 1 + flagWave, schoolX + 6.5, poleTopY + 1.8);
      ctx.lineTo(schoolX - 2, poleTopY + 4.2);
      ctx.closePath();
      ctx.fill();

      // 5) Grass Tufts & Flowers
      ctx.strokeStyle = '#365314';
      ctx.lineWidth = 0.9;
      for (let g = 0; g < 12; g++) {
        const gx = ((g + 0.5) / 12) * width;
        const gy = getGroundY(gx, width, height);
        const sway = Math.sin(time * 0.05 + g * 0.7) * 1.0 + breeze * 0.55;
        ctx.beginPath();
        ctx.moveTo(gx - 1.4, gy);
        ctx.lineTo(gx - 2.3 + sway, gy - 3.2);
        ctx.moveTo(gx + 1.4, gy);
        ctx.lineTo(gx + 2.3 + sway, gy - 3.2);
        ctx.stroke();
      }

      flowers.forEach((fl) => {
        const fx = fl.ratioX * width;
        const fy = getGroundY(fx, width, height);
        const sway = Math.sin(time * 0.055 + fl.sway) * 0.95 + breeze * 0.5;
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + sway, fy - 5.8);
        ctx.stroke();
        ctx.fillStyle = fl.color;
        ctx.beginPath();
        ctx.arc(fx + sway, fy - 6.5, fl.size * (0.8 + sceneScale * 0.2), 0, Math.PI * 2);
        ctx.fill();
      });

      // 6) Miniature Soccer Net
      const mouthGroundY = getGroundY(goal.mouthX, width, height);
      const backGroundY = getGroundY(goal.backX, width, height);
      const crossbarY = mouthGroundY - goal.height;
      const backTopY = backGroundY - goal.height * 0.78;

      goal.netBulgeVel += (-goal.netBulge * 0.12 - goal.netBulgeVel * 0.22) * dt;
      goal.netBulge += goal.netBulgeVel * dt;
      const currentBulge = Math.max(0, goal.netBulge);

      // Net mesh
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
      ctx.lineWidth = 0.75;
      for (let r = 1; r <= 4; r++) {
        const t = r / 5;
        const frontY = crossbarY + t * (mouthGroundY - crossbarY);
        const rearY = backTopY + t * (backGroundY - backTopY);
        const rearX = goal.backX - currentBulge * (1 - t * 0.3);
        ctx.beginPath();
        ctx.moveTo(goal.mouthX, frontY);
        ctx.lineTo(rearX, rearY);
        ctx.stroke();
      }
      for (let c = 1; c <= 3; c++) {
        const t = c / 4;
        const topX = goal.mouthX - t * (goal.mouthX - goal.backX + currentBulge * 0.4);
        const topY = crossbarY + t * (backTopY - crossbarY);
        const botX = goal.mouthX - t * (goal.mouthX - goal.backX);
        const botY = mouthGroundY + t * (backGroundY - mouthGroundY);
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(botX, botY);
        ctx.stroke();
      }

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, mouthGroundY);
      ctx.lineTo(goal.mouthX, crossbarY);
      ctx.lineTo(goal.backX - currentBulge * 0.4, backTopY);
      ctx.lineTo(goal.backX, backGroundY);
      ctx.stroke();

      // 7) Ball Physics
      const ballGroundY = getGroundY(ball.x, width, height) - ball.radius;
      const slopeDelta =
        (getGroundY(ball.x + 2, width, height) - getGroundY(ball.x - 2, width, height)) / 4;
      const slopeAngle = Math.atan(slopeDelta);

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
        goalTimer = 170;
        scorerId = ball.lastKickerId || 1;
        goal.netBulge = Math.min(10, Math.abs(ball.vx) * 1.8 + 4.5);
        goal.netBulgeVel = -goal.netBulge * 0.25;
        ball.vx *= 0.1;
        ball.vy = Math.min(ball.vy * 0.2, 0.4);

        for (let i = 0; i < 16; i++) {
          spawnParticle(
            goal.mouthX + (Math.random() - 0.5) * 12,
            crossbarY + Math.random() * goal.height,
            (Math.random() - 0.5) * 2.8,
            -1.4 - Math.random() * 2.2,
            1.7 + Math.random() * 1.4,
            ['#10b981', '#f59e0b', '#ec4899', '#38bdf8', '#fbbf24'][i % 5],
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
        if (ball.x < goal.backX + ball.radius + 3) {
          ball.x = goal.backX + ball.radius + 3;
          ball.vx = 0;
        }

        if (goalTimer > 0) {
          const prevGoalTimer = goalTimer;
          goalTimer = Math.max(0, goalTimer - dt);
          const goalie = children.find((c) => c.activity === 'soccer-goalie');

          if (goalie) {
            if (goalTimer > 110) {
              goalie.facing = -1;
              const gdx = ball.x + 5 - goalie.curX;
              if (Math.abs(gdx) > 1.5) {
                goalie.curX += Math.sign(gdx) * 0.95 * dt;
                goalie.runCycle += 0.24 * dt;
              }
            } else if (goalTimer > 46) {
              goalie.facing = 1;
              const gdx = goal.mouthX + 6 - goalie.curX;
              if (Math.abs(gdx) > 1.5) {
                goalie.curX += Math.sign(gdx) * 0.9 * dt;
                goalie.runCycle += 0.22 * dt;
              }
              ball.x = goalie.curX + goalie.facing * 3;
              ball.y = getGroundY(goalie.curX, width, height) - 8.5;
              ball.vx = 0;
              ball.vy = 0;
            } else if (goalTimer > 15) {
              ball.x = goal.mouthX + 8;
              ball.y = getGroundY(ball.x, width, height) - ball.radius;
              goalie.curX = ball.x - 5;
              goalie.facing = 1;
            } else if (prevGoalTimer > 15 && goalTimer <= 15) {
              triggerPlayerKick(goalie, 1);
            }
          }

          if (goalTimer === 0) {
            goalState = 'play';
            ball.inNet = false;
            scorerId = null;
          }
        }
      } else {
        const onGround = ball.y >= ballGroundY - 0.8;
        if (onGround) {
          ball.y = ballGroundY;
          const slopeForce = Math.sin(slopeAngle) * 0.14;
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
            ball.scaleX = 1.18;
            ball.scaleY = 0.84;
          }
        } else {
          ball.vy += 0.24 * dt;
          ball.rotation += ball.rotSpeed * dt;
          if (ball.y + ball.vy * dt >= ballGroundY) {
            ball.y = ballGroundY;
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
        const maxPitchX = width * 0.29;
        if (ball.x >= maxPitchX) {
          ball.x = maxPitchX;
          ball.vx = -Math.abs(ball.vx) * 0.65;
        }

        if (goalState === 'play') {
          if (Math.abs(ball.vx) < 0.05 && Math.abs(ball.vy) < 0.05) {
            ball.stillFrames += dt;
            if (ball.stillFrames > 160) {
              ball.vx = ball.x < width * 0.2 ? 2.6 : -2.6;
              ball.vy = -1.6;
              ball.stillFrames = 0;
            }
          } else {
            ball.stillFrames = 0;
          }
        }
      }

      // Ball shadow & soccer ball
      ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.beginPath();
      ctx.ellipse(ball.x - 0.8, ballGroundY + 2.2, ball.radius * 1.05, ball.radius * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(ball.x, ball.y);
      const bScale = 0.82 + sceneScale * 0.18;
      ctx.scale(ball.scaleX * bScale, ball.scaleY * bScale);
      ctx.rotate(ball.rotation);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
      for (let p = 0; p < 3; p++) {
        const ang = (p * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * ball.radius * 0.72, Math.sin(ang) * ball.radius * 0.72, ball.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 8) Butterflies
      butterflies.forEach((bf, idx) => {
        bf.x += (bf.vx + breeze * 0.18) * dt;
        bf.y += (bf.vy + Math.sin(time * 0.08 + bf.ratioX * 10) * 0.4) * dt;
        bf.wingAngle += bf.wingSpeed * dt;

        if (Math.random() < 0.02 * dt) {
          bf.vx = (Math.random() - 0.5) * 0.85;
          bf.vy = (Math.random() - 0.5) * 0.45;
        }

        if (idx === 1) {
          const minM = width * 0.395;
          const maxM = width * 0.465;
          if (bf.x < minM) bf.vx = Math.abs(bf.vx) + 0.3;
          if (bf.x > maxM) bf.vx = -Math.abs(bf.vx) - 0.3;
          const gAtBf = getGroundY(bf.x, width, height);
          if (bf.y < Math.max(12, gAtBf - 32 * sceneScale)) bf.vy = Math.abs(bf.vy) + 0.2;
          if (bf.y > gAtBf - 10) bf.vy = -Math.abs(bf.vy) - 0.2;
        } else {
          if (bf.x < 12) bf.vx = Math.abs(bf.vx) + 0.25;
          if (bf.x > width - 14) bf.vx = -Math.abs(bf.vx) - 0.25;
          if (bf.y < 10) bf.vy = 0.28;
          if (bf.y > height * 0.56) bf.vy = -0.28;
        }

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
        pb.vy += 0.14 * dt;
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(pb.x, pb.y, 1.25, 0, Math.PI * 2);
        ctx.fill();

        const distToCanopy = Math.hypot(pb.x - tm.x, pb.y - tm.canopyCenterY);
        if (distToCanopy <= tm.canopyR * 0.9 || pb.y <= tm.canopyCenterY) {
          pb.active = false;
          treeShake = 0.85;
          const target = mangoTree.mangoes.find((m) => m.id === pb.targetMangoId);
          if (target && !target.isFalling) {
            target.isFalling = true;
            target.curY = tm.canopyCenterY + target.normY * tm.canopyR;
            target.vy = 0.25;
          }
        }
      }

      // 10) Soccer AI
      const outfielders = children.filter(
        (c) => c.activity === 'soccer-striker' || c.activity === 'soccer-midfield'
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

      const hs = getHopscotchBounds(width);

      // 11) Update & Draw Playing Children
      children.forEach((c) => {
        const groundY = getGroundY(c.curX, width, height);
        const isScorerCelebrating = scorerId === c.id && goalTimer > 0;

        if (c.kickCooldown > 0) c.kickCooldown = Math.max(0, c.kickCooldown - dt);

        if (c.activity !== 'hopscotch-player') {
          if (c.vy !== 0 || c.yOffset < 0) {
            c.yOffset += c.vy * dt;
            c.vy += 0.28 * dt;
            if (c.yOffset >= 0) {
              c.yOffset = 0;
              c.vy = 0;
            }
          }
        } else {
          // Hopscotch players have dedicated continuous sinusoidal hopping curves.
          // Only simulate ballistic gravity if player was directly tapped by user (c.vy !== 0).
          if (c.vy !== 0) {
            c.yOffset += c.vy * dt;
            c.vy += 0.28 * dt;
            if (c.yOffset >= 0) {
              c.yOffset = 0;
              c.vy = 0;
            }
          }
        }

        if (c.activity === 'soccer-striker' || c.activity === 'soccer-midfield') {
          if (goalState === 'celebrating') {
            c.yOffset = -Math.abs(Math.sin(time * 0.22 + c.id)) * 4.2;
            c.runCycle = 0;
            c.speed = 0;
            c.facing = 1;
          } else if (goalState === 'play' && c.kickPhase === 'idle') {
            if (c.soccerIntent === 'hunt-ball') {
              const kickDir: 1 | -1 = -1;
              const targetX = ball.x + 5.0;
              const dx = targetX - c.curX;

              if (Math.abs(dx) > 2) {
                c.curX += Math.sign(dx) * 1.1 * dt;
                c.facing = Math.sign(dx) as 1 | -1;
                c.runCycle += 0.28 * dt;
                c.speed = 1.1;
              } else {
                c.facing = kickDir;
                c.runCycle = 0;
                c.speed = 0;
                const dist = Math.hypot(c.curX - targetX, groundY - ball.y);
                if (dist < 20 && c.kickCooldown <= 0 && !ball.inNet) {
                  triggerPlayerKick(c, kickDir);
                }
              }
            } else {
              const homeX = c.activity === 'soccer-striker' ? width * 0.175 : width * 0.26;
              const dx = homeX - c.curX;
              if (Math.abs(dx) > 3) {
                c.curX += Math.sign(dx) * 0.6 * dt;
                c.facing = Math.sign(dx) as 1 | -1;
                c.runCycle += 0.16 * dt;
                c.speed = 0.6;
              } else {
                c.facing = ball.x > c.curX ? 1 : -1;
                c.runCycle = 0;
                c.speed = 0;
              }
            }
          }

          if (c.activity === 'soccer-striker') {
            c.curX = Math.max(goal.mouthX + 10, Math.min(width * 0.23, c.curX));
          } else {
            c.curX = Math.max(width * 0.21, Math.min(width * 0.285, c.curX));
          }
        } else if (c.activity === 'soccer-goalie') {
          if (goalState === 'play') {
            const homeX = goal.mouthX + 5;
            const dx = homeX - c.curX;
            if (Math.abs(dx) > 1.2) {
              c.curX += Math.sign(dx) * 0.55 * dt;
              c.runCycle += 0.15 * dt;
            }
            c.facing = 1;
          }
        } else if (c.activity === 'slingshot-hunter') {
          c.curX = tm.x + Math.max(11, 14 * sceneScale);
          c.facing = -1;
          c.slingshotTimer += dt;
          if (c.slingshotTimer > 175) {
            c.slingshotTimer = 0;
            const nextMango = mangoTree.mangoes[Math.floor(Math.random() * mangoTree.mangoes.length)];
            const startX = c.curX - 4.5;
            const startY = groundY - 14 * sceneScale;
            const flightFrames = 14;
            mangoTree.slingshotPebble = {
              active: true,
              x: startX,
              y: startY,
              vx: (tm.x - startX) / flightFrames,
              vy: (tm.canopyCenterY - startY) / flightFrames - 0.5 * 0.14 * flightFrames,
              targetMangoId: nextMango.id,
            };
          }
        } else if (c.activity === 'butterfly-catcher') {
          const targetBf = butterflies[1];
          const minGirlX = width * 0.405;
          const maxGirlX = width * 0.455;
          const targetX = Math.max(minGirlX, Math.min(maxGirlX, targetBf.x));
          const dx = targetX - c.curX;
          if (Math.abs(dx) > 2.5) {
            c.curX += Math.sign(dx) * 0.7 * dt;
            c.facing = (Math.sign(dx) || 1) as 1 | -1;
            c.runCycle += 0.22 * dt;
            c.speed = 0.7;
          } else {
            c.speed = 0.15;
            c.runCycle += 0.08 * dt;
            if (c.vy === 0 && Math.sin(time * 0.12) > 0.72) {
              c.yOffset = -2.4;
            } else if (c.vy === 0) {
              c.yOffset = 0;
            }
          }
        } else if (c.activity === 'bicycle-rider') {
          const minBikeX = width * 0.60;
          const maxBikeX = width * 0.705;
          c.curX += c.facing * 0.72 * dt;
          c.bikeDistance += 0.72 * dt;
          c.runCycle += 0.16 * dt;
          c.speed = 0.72;
          if (c.curX >= maxBikeX) {
            c.curX = maxBikeX;
            c.facing = -1;
          } else if (c.curX <= minBikeX) {
            c.curX = minBikeX;
            c.facing = 1;
          }
        } else if (c.activity === 'hopscotch-player') {
          // ── Calm, Graceful, Cooperative Hopscotch Game ──
          // Full 800-frame cycle (~80s total session, ~40s per girl's turn at dt * 0.15)
          const CYCLE = 800;
          const ht = hopscotchTimer % CYCLE;
          const sq2GroundY = getGroundY(hs.sq2X, width, height) + 1.0;

          if (ht < 400) {
            // ── Phase A: Girl 6's Turn (Home Left -> Sq1 -> Sq2 [retrieve] -> Sq3 -> Trot Home -> Toss to Partner) ──
            if (c.id === 6) {
              c.facing = 1;
              if (ht < 40) {
                // 1. Ready pose at Home Left holding beanbag
                c.curX = hs.c6HomeX;
                if (c.vy === 0) c.yOffset = 0;
                beanbag.visible = true;
                beanbag.x = c.curX + 3.2;
                beanbag.y = groundY - 8.5;
              } else if (ht < 100) {
                // 2. Slow, graceful underhand toss of beanbag to Square 2
                c.curX = hs.c6HomeX;
                if (c.vy === 0) c.yOffset = 0;
                const prog = (ht - 40) / 60;
                beanbag.visible = true;
                beanbag.x = (hs.c6HomeX + 3.2) + prog * (hs.sq2X - (hs.c6HomeX + 3.2));
                beanbag.y = (groundY - 8.5) + prog * (sq2GroundY - (groundY - 8.5)) - Math.sin(prog * Math.PI) * 11.5;
              } else if (ht < 140) {
                // 3. Calm standing balance pause before hopping
                c.curX = hs.c6HomeX;
                if (c.vy === 0) c.yOffset = 0;
                beanbag.visible = true;
                beanbag.x = hs.sq2X;
                beanbag.y = sq2GroundY;
              } else if (ht < 200) {
                // 4. Hop 1: Home Left -> Square 1 (gentle floating arc)
                const prog = (ht - 140) / 60;
                c.curX = hs.c6HomeX + prog * (hs.sq1X - hs.c6HomeX);
                if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 6.5;
                beanbag.visible = true;
                beanbag.x = hs.sq2X;
                beanbag.y = sq2GroundY;
              } else if (ht < 230) {
                // 5. Standing balance pause on Square 1
                c.curX = hs.sq1X;
                if (c.vy === 0) c.yOffset = 0;
                beanbag.visible = true;
                beanbag.x = hs.sq2X;
                beanbag.y = sq2GroundY;
              } else if (ht < 290) {
                // 6. Hop 2: Square 1 -> Square 2
                const prog = (ht - 230) / 60;
                c.curX = hs.sq1X + prog * (hs.sq2X - hs.sq1X);
                if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 6.5;
                beanbag.visible = true;
                beanbag.x = hs.sq2X;
                beanbag.y = sq2GroundY;
              } else if (ht < 330) {
                // 7. Bends down gracefully on Square 2 to pick up the beanbag
                c.curX = hs.sq2X;
                const bendProg = Math.sin(((ht - 290) / 40) * Math.PI);
                if (c.vy === 0) c.yOffset = bendProg * 1.5;
                beanbag.visible = true;
                beanbag.x = c.curX + 3.2;
                beanbag.y = groundY + c.yOffset - 8.5;
              } else if (ht < 380) {
                // 8. Hop 3: Square 2 -> Square 3
                const prog = (ht - 330) / 50;
                c.curX = hs.sq2X + prog * (hs.sq3X - hs.sq2X);
                if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 6.2;
                beanbag.visible = true;
                beanbag.x = c.curX + 3.2;
                beanbag.y = groundY + c.yOffset - 8.5;
              } else {
                // 9. Turnaround, trot back to Home Left, and toss beanbag across to Partner (Girl 7)
                const prog = (ht - 380) / 20;
                c.curX = hs.sq3X - prog * (hs.sq3X - hs.c6HomeX);
                if (c.vy === 0) c.yOffset = -Math.abs(Math.sin(prog * Math.PI * 2)) * 2.5;

                const tossProg = Math.min(1, Math.max(0, (ht - 382) / 18));
                beanbag.visible = true;
                beanbag.x = hs.sq3X + tossProg * (hs.c7HomeX - 3.2 - hs.sq3X);
                beanbag.y = (groundY - 8.5) - Math.sin(tossProg * Math.PI) * 9.0;
              }
            } else if (c.id === 7) {
              // Girl 7 stands at Home Right, smiling and clapping gently to encourage her friend
              c.facing = -1;
              c.curX = hs.c7HomeX;
              if (c.vy === 0) {
                c.yOffset = -Math.abs(Math.sin(time * 0.06)) * 1.2;
              }
            }
          } else {
            // ── Phase B: Girl 7's Turn (Home Right -> Sq3 -> Sq2 [retrieve] -> Sq1 -> Trot Home -> Toss to Partner) ──
            const t = ht - 400;
            if (c.id === 7) {
              c.facing = -1;
              if (t < 40) {
                // 1. Ready pose at Home Right holding beanbag
                c.curX = hs.c7HomeX;
                if (c.vy === 0) c.yOffset = 0;
                beanbag.visible = true;
                beanbag.x = c.curX - 3.2;
                beanbag.y = groundY - 8.5;
              } else if (t < 100) {
                // 2. Slow, graceful underhand toss of beanbag to Square 2
                c.curX = hs.c7HomeX;
                if (c.vy === 0) c.yOffset = 0;
                const prog = (t - 40) / 60;
                beanbag.visible = true;
                beanbag.x = (hs.c7HomeX - 3.2) - prog * ((hs.c7HomeX - 3.2) - hs.sq2X);
                beanbag.y = (groundY - 8.5) + prog * (sq2GroundY - (groundY - 8.5)) - Math.sin(prog * Math.PI) * 11.5;
              } else if (t < 140) {
                // 3. Calm standing balance pause before hopping
                c.curX = hs.c7HomeX;
                if (c.vy === 0) c.yOffset = 0;
                beanbag.visible = true;
                beanbag.x = hs.sq2X;
                beanbag.y = sq2GroundY;
              } else if (t < 200) {
                // 4. Hop 1: Home Right -> Square 3 (gentle floating arc)
                const prog = (t - 140) / 60;
                c.curX = hs.c7HomeX - prog * (hs.c7HomeX - hs.sq3X);
                if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 6.5;
                beanbag.visible = true;
                beanbag.x = hs.sq2X;
                beanbag.y = sq2GroundY;
              } else if (t < 230) {
                // 5. Standing balance pause on Square 3
                c.curX = hs.sq3X;
                if (c.vy === 0) c.yOffset = 0;
                beanbag.visible = true;
                beanbag.x = hs.sq2X;
                beanbag.y = sq2GroundY;
              } else if (t < 290) {
                // 6. Hop 2: Square 3 -> Square 2
                const prog = (t - 230) / 60;
                c.curX = hs.sq3X - prog * (hs.sq3X - hs.sq2X);
                if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 6.5;
                beanbag.visible = true;
                beanbag.x = hs.sq2X;
                beanbag.y = sq2GroundY;
              } else if (t < 330) {
                // 7. Bends down gracefully on Square 2 to pick up beanbag
                c.curX = hs.sq2X;
                const bendProg = Math.sin(((t - 290) / 40) * Math.PI);
                if (c.vy === 0) c.yOffset = bendProg * 1.5;
                beanbag.visible = true;
                beanbag.x = c.curX - 3.2;
                beanbag.y = groundY + c.yOffset - 8.5;
              } else if (t < 380) {
                // 8. Hop 3: Square 2 -> Square 1
                const prog = (t - 330) / 50;
                c.curX = hs.sq2X - prog * (hs.sq2X - hs.sq1X);
                if (c.vy === 0) c.yOffset = -Math.sin(prog * Math.PI) * 6.2;
                beanbag.visible = true;
                beanbag.x = c.curX - 3.2;
                beanbag.y = groundY + c.yOffset - 8.5;
              } else {
                // 9. Turnaround, trot back to Home Right, and toss beanbag across to Partner (Girl 6)
                const prog = (t - 380) / 20;
                c.curX = hs.sq1X + prog * (hs.c7HomeX - hs.sq1X);
                if (c.vy === 0) c.yOffset = -Math.abs(Math.sin(prog * Math.PI * 2)) * 2.5;

                const tossProg = Math.min(1, Math.max(0, (t - 382) / 18));
                beanbag.visible = true;
                beanbag.x = hs.sq1X - tossProg * (hs.sq1X - (hs.c6HomeX + 3.2));
                beanbag.y = (groundY - 8.5) - Math.sin(tossProg * Math.PI) * 9.0;
              }
            } else if (c.id === 6) {
              // Girl 6 stands at Home Left, smiling and clapping gently to encourage her friend
              c.facing = 1;
              c.curX = hs.c6HomeX;
              if (c.vy === 0) {
                c.yOffset = -Math.abs(Math.sin(time * 0.06)) * 1.2;
              }
            }
          }
          c.curX = Math.max(12, Math.min(width - 13, c.curX));
        }

        // Kick phase updates
        if (c.kickPhase === 'windup') {
          c.kickProgress += 0.2 * dt;
          c.kickLegAngle = -0.72 * Math.sin(Math.min(1, c.kickProgress) * Math.PI * 0.5);
          if (c.kickProgress >= 1) {
            c.kickPhase = 'strike';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'strike') {
          c.kickProgress += 0.28 * dt;
          c.kickLegAngle = 0.88 * Math.sin(Math.min(1, c.kickProgress) * Math.PI * 0.5);
          if (c.kickProgress >= 0.4 && !c.kickHasContacted) {
            c.kickHasContacted = true;
            c.kickCooldown = 42;
            ball.lastKickerId = c.id;
            ball.scaleX = 1.26;
            ball.scaleY = 0.78;
            if (c.activity === 'soccer-goalie') {
              ball.vx = 3.4 * (0.8 + sceneScale * 0.2);
              ball.vy = -1.9;
              ball.rotSpeed = 0.26;
            } else {
              const distToGoal = ball.x - goal.mouthX;
              const power = Math.max(3.4, Math.min(5.6, distToGoal * 0.08 + 3.0));
              ball.vx = -power;
              ball.vy = -1.9 - Math.random() * 0.9;
              ball.rotSpeed = -0.3;
            }
          }
          if (c.kickProgress >= 1) {
            c.kickPhase = 'followthrough';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'followthrough') {
          c.kickProgress += 0.16 * dt;
          c.kickLegAngle = 0.88 * Math.max(0, 1 - c.kickProgress);
          if (c.kickProgress >= 1) {
            c.kickPhase = 'idle';
            c.kickLegAngle = 0;
          }
        }

        // Ground contact shadow
        const charScale = Math.max(0.68, Math.min(1.0, 0.56 + sceneScale * 0.44));
        const shadowScale = Math.max(0.55, 1 + c.yOffset * 0.04);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
        ctx.beginPath();
        ctx.ellipse(
          c.curX,
          groundY + 0.8,
          (c.activity === 'bicycle-rider' ? 11 : 4.6) * charScale * shadowScale,
          1.4 * charScale,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();

        // Draw character scaled cleanly for mobile
        ctx.save();
        const runBob = c.speed > 0.2 ? -Math.abs(Math.sin(c.runCycle)) * 1.0 : 0;
        ctx.translate(c.curX, groundY + c.yOffset + runBob);
        ctx.scale(charScale, charScale);

        const headY = -24;
        const headRadius = 4.7;
        const bodyY = -15.0;
        const waistY = -8.0;

        // Legs or Bicycle
        if (c.activity === 'bicycle-rider') {
          const wheelRadius = 4.5;
          const wheelSpan = 8.5;
          const rearHubX = -c.facing * wheelSpan;
          const frontHubX = c.facing * wheelSpan;
          const hubY = -wheelRadius;
          const spokeAngle = c.bikeDistance * 0.25 * c.facing;

          [rearHubX, frontHubX].forEach((hx) => {
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.arc(hx, hubY, wheelRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Spinning spokes
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)';
            ctx.lineWidth = 0.65;
            ctx.beginPath();
            ctx.moveTo(hx + Math.cos(spokeAngle) * wheelRadius, hubY + Math.sin(spokeAngle) * wheelRadius);
            ctx.lineTo(hx - Math.cos(spokeAngle) * wheelRadius, hubY - Math.sin(spokeAngle) * wheelRadius);
            ctx.moveTo(hx - Math.sin(spokeAngle) * wheelRadius, hubY + Math.cos(spokeAngle) * wheelRadius);
            ctx.lineTo(hx + Math.sin(spokeAngle) * wheelRadius, hubY - Math.cos(spokeAngle) * wheelRadius);
            ctx.stroke();
          });

          // Frame + handlebars + seat
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.45;
          ctx.beginPath();
          ctx.moveTo(rearHubX, hubY);
          ctx.lineTo(-c.facing * 2.2, waistY + 1.5);
          ctx.lineTo(c.facing * 5.2, bodyY + 1.5);
          ctx.lineTo(frontHubX, hubY);
          ctx.moveTo(-c.facing * 2.2, waistY + 1.5);
          ctx.lineTo(c.facing * 0.5, hubY);
          ctx.lineTo(c.facing * 5.2, bodyY + 1.5);
          ctx.stroke();

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(c.facing * 4.5, bodyY + 0.5);
          ctx.lineTo(c.facing * 6.5, bodyY - 0.5);
          ctx.stroke();
        } else if (c.activity === 'hopscotch-player') {
          // Continuous, smooth leg interpolation for hopscotch hops (zero glitching or popping)
          const hopLift = Math.min(1, Math.max(0, -c.yOffset / 6.0));
          const frontHipX = c.facing * 1.5;
          const backLegX = -c.facing * 1.5;

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';

          // Back plant leg extends down to ground
          ctx.beginPath();
          ctx.moveTo(backLegX, waistY);
          ctx.lineTo(backLegX, 0);
          ctx.stroke();

          // Front leg bends smoothly and continuously as character rises
          const kneeX = frontHipX + c.facing * (2.0 * hopLift);
          const kneeY = waistY + 4.5 * (1 - hopLift) + 3.8 * hopLift;
          const footX = frontHipX + c.facing * (0.8 * hopLift);
          const footY = (waistY + 9.0) * (1 - hopLift) + (waistY + 6.8) * hopLift;

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
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          const stride = Math.sin(c.runCycle) * 3.5;

          // Back/planting leg
          ctx.beginPath();
          ctx.moveTo(-c.facing * 1.2, waistY);
          ctx.lineTo(-c.facing * 1.2 - c.facing * stride, 0);
          ctx.stroke();

          // Front/kicking leg (uses kickLegAngle during active kick)
          ctx.beginPath();
          ctx.moveTo(c.facing * 1.2, waistY);
          if (c.kickPhase !== 'idle') {
            const legLen = Math.abs(waistY);
            const kickX = c.facing * 1.2 + c.facing * Math.sin(c.kickLegAngle) * legLen;
            const kickY = waistY + Math.cos(c.kickLegAngle) * legLen;
            ctx.lineTo(kickX, kickY);
          } else {
            ctx.lineTo(c.facing * 1.2 + c.facing * stride, 0);
          }
          ctx.stroke();
        }

        // Torso / Dress
        if (c.hasDress) {
          ctx.fillStyle = c.shirtColor;
          ctx.strokeStyle = c.id === 6 ? '#1e3a8a' : c.id === 7 ? '#581c87' : '#9d174d';
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(c.facing * 1.2, bodyY);
          ctx.lineTo(-c.facing * 5.4, waistY + 1.2);
          ctx.lineTo(c.facing * 5.4, waistY + 1.2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = c.pantsColor;
          ctx.fillRect(-3.0, waistY - 1.2, 6.0, 4.2);
          ctx.fillStyle = c.shirtColor;
          ctx.fillRect(-3.4, bodyY, 6.8, 7.8);
        }

        // Arms & Signature Activity Props
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        if (isScorerCelebrating) {
          ctx.beginPath();
          ctx.moveTo(-2.4, bodyY + 2.2);
          ctx.lineTo(-6.8, bodyY - 8.5);
          ctx.moveTo(2.4, bodyY + 2.2);
          ctx.lineTo(6.8, bodyY - 8.5);
          ctx.stroke();
        } else if (c.activity === 'hopscotch-player') {
          // Cooperative Hopscotch Arms (natural toss, balance swing, or gentle clapping)
          const CYCLE = 800;
          const ht = hopscotchTimer % CYCLE;
          const isGirl6Turn = ht < 400;
          const isActive = (c.id === 6 && isGirl6Turn) || (c.id === 7 && !isGirl6Turn);

          if (isActive) {
            const turnT = isGirl6Turn ? ht : (ht - 400);
            if (turnT < 100) {
              // Graceful underhand toss forward
              const tossProg = Math.min(1, Math.max(0, (turnT - 40) / 60));
              const armLift = Math.sin(tossProg * Math.PI) * 4.5;
              ctx.beginPath();
              ctx.moveTo(-c.facing * 2, bodyY + 3);
              ctx.lineTo(-c.facing * 4, bodyY + 6);
              ctx.moveTo(c.facing * 1, bodyY + 2);
              ctx.lineTo(c.facing * (5.0 + tossProg * 2.5), bodyY - armLift);
              ctx.stroke();
            } else if (turnT >= 290 && turnT < 330) {
              // Bending down to pick up beanbag
              ctx.beginPath();
              ctx.moveTo(-c.facing * 1.5, bodyY + 3);
              ctx.lineTo(-c.facing * 3, bodyY + 6);
              ctx.moveTo(c.facing * 1.5, bodyY + 3);
              ctx.lineTo(c.facing * 4.5, bodyY + 8);
              ctx.stroke();
            } else {
              // Gentle balance swinging arms during hops
              const swing = Math.sin(time * 0.08) * 2.0;
              ctx.beginPath();
              ctx.moveTo(-c.facing * 2, bodyY + 3);
              ctx.lineTo(-c.facing * 6.0, bodyY - swing);
              ctx.moveTo(c.facing * 2, bodyY + 3);
              ctx.lineTo(c.facing * 6.5, bodyY + swing);
              ctx.stroke();
            }
          } else {
            // Resting partner claps hands gently at a calm, delightful tempo
            const clap = Math.sin(time * 0.08);
            const clapX = 2.0 + clap * 1.5;
            ctx.beginPath();
            ctx.moveTo(-2, bodyY + 3);
            ctx.lineTo(c.facing * clapX, bodyY + 2);
            ctx.moveTo(2, bodyY + 3);
            ctx.lineTo(c.facing * clapX, bodyY + 2);
            ctx.stroke();
          }
        } else if (c.activity === 'butterfly-catcher') {
          // Arm holding butterfly net angled toward the blue butterfly
          const armEndX = c.facing * 5.5;
          const armEndY = bodyY - 1.5;
          ctx.beginPath();
          ctx.moveTo(0, bodyY + 2.2);
          ctx.lineTo(armEndX, armEndY);
          ctx.stroke();

          // Net pole & mesh hoop
          const netTipX = armEndX + c.facing * 7.5;
          const netTipY = armEndY - 7.5 + Math.sin(time * 0.16) * 1.6;
          ctx.strokeStyle = '#92400e';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(armEndX, armEndY);
          ctx.lineTo(netTipX, netTipY);
          ctx.stroke();

          ctx.fillStyle = 'rgba(224, 242, 254, 0.55)';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.ellipse(netTipX + c.facing * 2.2, netTipY - 1.5, 3.2, 2.2, c.facing * -0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (c.activity === 'slingshot-hunter') {
          // Aiming arm + Y-shaped wooden slingshot
          const handX = c.facing * 5.8;
          const handY = bodyY - 0.5;
          ctx.beginPath();
          ctx.moveTo(0, bodyY + 2.2);
          ctx.lineTo(handX, handY);
          ctx.stroke();

          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(handX, handY + 1);
          ctx.lineTo(handX, handY - 2.2);
          ctx.lineTo(handX - 1.8, handY - 4.5);
          ctx.moveTo(handX, handY - 2.2);
          ctx.lineTo(handX + 1.8, handY - 4.5);
          ctx.stroke();

          // Elastic pull-back just before firing
          if (c.slingshotTimer > 145) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(handX - 1.8, handY - 4.5);
            ctx.lineTo(handX - c.facing * 3.0, handY - 2.2);
            ctx.lineTo(handX + 1.8, handY - 4.5);
            ctx.stroke();
          }
        } else if (c.activity === 'bicycle-rider') {
          ctx.beginPath();
          ctx.moveTo(c.facing * 1.0, bodyY + 2.0);
          ctx.lineTo(c.facing * 5.6, bodyY + 0.2);
          ctx.stroke();
        } else {
          const swing = Math.cos(c.runCycle) * 2.8;
          ctx.beginPath();
          ctx.moveTo(0, bodyY + 2.2);
          ctx.lineTo(c.facing * swing, bodyY + 6.2);
          ctx.stroke();
        }

        // Head
        ctx.fillStyle = c.skinColor;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eye
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(c.facing * 1.9, headY - 0.7, 0.8, 0, Math.PI * 2);
        ctx.fill();

        // Hair / Cap styles
        ctx.fillStyle = c.hairColor;
        if (c.hairStyle === 'orange-pigtails') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.0, headRadius + 0.4, Math.PI * 0.85, Math.PI * 2.15);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-headRadius - 0.6, headY - 0.5, 1.9, 0, Math.PI * 2);
          ctx.arc(headRadius + 0.6, headY - 0.5, 1.9, 0, Math.PI * 2);
          ctx.fill();
        } else if (c.hairStyle === 'curly-brown') {
          for (let cp = -2; cp <= 2; cp++) {
            ctx.beginPath();
            ctx.arc(cp * 2.0, headY - 4.5, 1.9, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (c.hairStyle === 'ponytail-red') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.1, headRadius + 0.35, Math.PI * 0.9, Math.PI * 2.1);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(-c.facing * (headRadius + 1.5), headY - 0.6, 2.4, 1.4, c.facing * 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (c.hairStyle === 'blonde-bob') {
          ctx.beginPath();
          ctx.arc(0, headY - 0.6, headRadius + 0.5, Math.PI * 0.75, Math.PI * 2.25);
          ctx.fill();
        } else if (c.hairStyle === 'spiky-black') {
          ctx.beginPath();
          ctx.moveTo(-4.2, headY - 2.2);
          ctx.lineTo(-2.5, headY - 6.6);
          ctx.lineTo(-0.4, headY - 4.2);
          ctx.lineTo(1.2, headY - 6.8);
          ctx.lineTo(2.6, headY - 4.0);
          ctx.lineTo(4.4, headY - 5.4);
          ctx.lineTo(4.2, headY - 2.0);
          ctx.closePath();
          ctx.fill();
        } else if (c.hairStyle === 'beanie') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.3, headRadius + 0.45, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, headY - headRadius - 1.4, 1.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, headY - 1.2, headRadius + 0.35, Math.PI * 0.9, Math.PI * 2.1);
          ctx.fill();
        }

        ctx.restore();
      });

      // 11.5) Hopscotch Beanbag
      if (beanbag.visible) {
        ctx.save();
        ctx.translate(beanbag.x, beanbag.y);
        ctx.fillStyle = '#f43f5e';
        ctx.strokeStyle = '#9f1239';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.arc(0, 0, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 12) Confetti Particles
      for (let cp = celebrationParticles.length - 1; cp >= 0; cp--) {
        const pt = celebrationParticles[cp];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 0.08 * dt;
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

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => handleResize())
        : null;
    resizeObserver?.observe(container);
    window.addEventListener('resize', handleResize);

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

    const onVisibilityChange = () => {
      isDocVisible = !document.hidden;
      if (isDocVisible) startIfActive();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

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
          ? `w-full h-24 sm:h-28 md:h-32 relative select-none ${className}`
          : `w-full h-24 sm:h-28 md:h-32 rounded-2xl border border-emerald-200/90 shadow-xs relative overflow-hidden select-none ${className}`
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
