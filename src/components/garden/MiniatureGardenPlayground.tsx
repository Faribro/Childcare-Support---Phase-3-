'use client';

import React, { useRef, useEffect } from 'react';

/**
 * MiniatureGardenPlayground
 * Compact physics-based miniature live garden with children PLAYING
 * (running, passing, authentic soccer kicking, skipping, twirling,
 * chasing butterflies, and cheering) on a rolling green hill.
 * Features a miniature soccer goal with flexible net on the left,
 * realistic rolling & kicking physics, and goal celebration where the
 * scoring player raises arms and shouts "GOAL! ⚽" in a comic speech bubble.
 */
export function MiniatureGardenPlayground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Mouse tracking for physics interaction
    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
    };

    // Rolling hill elevation formula: sleek arch positioned near bottom of canvas
    const getGroundY = (x: number, w: number, h: number) => {
      const normalizedX = Math.max(0, Math.min(1, x / (w || 1)));
      const arch = Math.sin(normalizedX * Math.PI) * (h * 0.14);
      const baseLine = h * 0.88;
      return baseLine - arch;
    };

    // Soccer Goal Dimensions on Left Slope
    const goal = {
      mouthX: 50,    // Front goal line
      backX: 18,     // Back of the net
      height: 22,    // Crossbar height
      netBulge: 0,   // Dynamic net ripple/bulge when ball enters
      netBulgeVel: 0,
    };

    // Goal event tracking
    let goalTimer = 0;       // frames countdown during celebration (~160 frames)
    let scorerId: number | null = null;

    // Celebration Confetti Particles
    const celebrationParticles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      life: number;
    }> = [];

    // Interactive Soccer Ball with Realistic Physics
    const ball = {
      x: 160,
      y: 60,
      vx: 2.2,
      vy: 0,
      radius: 5.2,
      rotation: 0,
      rotSpeed: 0.08,
      bounciness: 0.52, // Turf restitution
      lastKickerId: 1,  // Who kicked the ball
      inNet: false,
      kickImpulsePending: false,
    };

    // Fluttering Butterflies
    const butterflies = [
      { x: 140, y: 35, vx: 0.4, vy: 0, wingAngle: 0, wingSpeed: 0.26, color: '#f43f5e', size: 3 },
      { x: 440, y: 28, vx: -0.5, vy: 0, wingAngle: 0, wingSpeed: 0.28, color: '#0ea5e9', size: 3 },
      { x: 720, y: 38, vx: 0.4, vy: 0, wingAngle: 0, wingSpeed: 0.24, color: '#eab308', size: 3 },
    ];

    // Drifting Clouds
    const clouds = [
      { x: 60, y: 16, speed: 0.18, scale: 0.75, opacity: 0.7 },
      { x: 420, y: 12, speed: 0.15, scale: 0.9, opacity: 0.8 },
      { x: 760, y: 18, speed: 0.2, scale: 0.7, opacity: 0.65 },
    ];

    // Playing Children definitions with Real Kicking Physics & Animation
    interface PlayingChild {
      id: number;
      baseRatioX: number;
      curX: number;
      yOffset: number;
      vy: number;
      behavior: 'striker-left' | 'skipping' | 'playmaker-center' | 'butterfly-catcher' | 'winger-right' | 'twirler' | 'cheerer';
      facing: 1 | -1; // 1 = right, -1 = left
      hairColor: string;
      hairStyle: 'short-brown' | 'ponytail-red' | 'spiky-black' | 'blonde-bob' | 'beanie' | 'orange-pigtails' | 'curly-brown';
      shirtColor: string;
      pantsColor: string;
      skinColor: string;
      hasDress?: boolean;
      twirlAngle: number;
      kickCooldown: number;
      runCycle: number;
      // Realistic 4-phase kicking motion
      kickPhase: 'idle' | 'windup' | 'strike' | 'followthrough';
      kickProgress: number; // 0 to 1
      kickLegAngle: number; // in radians
      kickSide: 1 | -1;     // right leg or left leg
      particles: Array<{ x: number; y: number; vy: number; vx: number; life: number; color: string }>;
    }

    const children: PlayingChild[] = [
      {
        id: 1,
        baseRatioX: 0.14,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'striker-left',
        facing: -1,
        hairColor: '#b45309',
        hairStyle: 'short-brown',
        shirtColor: '#0284c7', // Sky blue jersey
        pantsColor: '#1e293b',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        kickSide: 1,
        particles: [],
      },
      {
        id: 2,
        baseRatioX: 0.26,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'skipping',
        facing: 1,
        hairColor: '#ea580c',
        hairStyle: 'ponytail-red',
        shirtColor: '#f472b6', // Pink dress
        pantsColor: '#f472b6',
        skinColor: '#fef3c7',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        kickSide: 1,
        particles: [],
      },
      {
        id: 3,
        baseRatioX: 0.40,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'playmaker-center',
        facing: -1,
        hairColor: '#334155',
        hairStyle: 'spiky-black',
        shirtColor: '#f59e0b', // Yellow jersey
        pantsColor: '#15803d',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        kickSide: 1,
        particles: [],
      },
      {
        id: 4,
        baseRatioX: 0.54,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'butterfly-catcher',
        facing: 1,
        hairColor: '#facc15',
        hairStyle: 'blonde-bob',
        shirtColor: '#ec4899', // Pink frock
        pantsColor: '#ec4899',
        skinColor: '#fef3c7',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        kickSide: 1,
        particles: [],
      },
      {
        id: 5,
        baseRatioX: 0.68,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'winger-right',
        facing: -1,
        hairColor: '#7c2d12',
        hairStyle: 'beanie',
        shirtColor: '#84cc16', // Lime green jersey
        pantsColor: '#1e3a8a',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        kickSide: 1,
        particles: [],
      },
      {
        id: 6,
        baseRatioX: 0.82,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'twirler',
        facing: 1,
        hairColor: '#d97706',
        hairStyle: 'orange-pigtails',
        shirtColor: '#2563eb', // Blue dress
        pantsColor: '#2563eb',
        skinColor: '#fef3c7',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        kickSide: 1,
        particles: [],
      },
      {
        id: 7,
        baseRatioX: 0.93,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'cheerer',
        facing: -1,
        hairColor: '#451a03',
        hairStyle: 'curly-brown',
        shirtColor: '#f43f5e', // Rose red dress
        pantsColor: '#f43f5e',
        skinColor: '#fde047',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        kickSide: 1,
        particles: [],
      },
    ];

    // Flower patches
    const flowers = [
      { ratioX: 0.08, color: '#f43f5e', size: 2.8, sway: 0 },
      { ratioX: 0.18, color: '#a855f7', size: 2.5, sway: 1.2 },
      { ratioX: 0.32, color: '#38bdf8', size: 2.8, sway: 2.4 },
      { ratioX: 0.48, color: '#f59e0b', size: 2.5, sway: 0.8 },
      { ratioX: 0.62, color: '#ec4899', size: 3.2, sway: 3.1 },
      { ratioX: 0.77, color: '#f97316', size: 2.8, sway: 1.7 },
      { ratioX: 0.89, color: '#a855f7', size: 2.8, sway: 2.1 },
    ];

    // Canvas resize handling with crisp DPI
    const handleResize = () => {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);

      // Initialize children positions
      children.forEach((c) => {
        if (!c.curX) c.curX = c.baseRatioX * width;
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };

    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;

      if (!ball.inNet) {
        // Nudge ball towards click with realistic arc
        ball.vx = (clickX - ball.x) * 0.055;
        ball.vy = -4.5;
        ball.rotSpeed = ball.vx * 0.15;
      }

      // Nearby child celebrates with playful hop
      children.forEach((c) => {
        if (Math.abs(clickX - c.curX) < 35 && c.yOffset === 0 && c.kickPhase === 'idle') {
          c.vy = -4; // gentle joyful hop
          for (let p = 0; p < 4; p++) {
            c.particles.push({
              x: c.curX + (Math.random() - 0.5) * 12,
              y: getGroundY(c.curX, width, height) - 26,
              vx: (Math.random() - 0.5) * 2,
              vy: -1.5 - Math.random() * 2,
              life: 1,
              color: ['#f59e0b', '#ec4899', '#38bdf8', '#10b981'][Math.floor(Math.random() * 4)],
            });
          }
        }
      });
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.touches[0].clientX - rect.left;
        if (!ball.inNet) {
          ball.vx = (clickX - ball.x) * 0.055;
          ball.vy = -4.5;
          ball.rotSpeed = ball.vx * 0.15;
        }
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });

    let tick = 0;

    // Helper to start kick animation for a player
    const triggerPlayerKick = (c: PlayingChild, kickDirection: -1 | 1) => {
      c.kickPhase = 'windup';
      c.kickProgress = 0;
      c.facing = kickDirection;
      c.kickSide = 1; // right foot strike
      c.kickLegAngle = 0;
      c.kickCooldown = 75;
    };

    // MAIN ANIMATION / PLAY PHYSICS LOOP
    const render = () => {
      tick++;

      mouse.x += (mouse.targetX - mouse.x) * 0.15;
      mouse.y += (mouse.targetY - mouse.y) * 0.15;

      ctx.clearRect(0, 0, width, height);

      // 1. SKY BACKGROUND (Soft pastel morning horizon)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, 'rgba(238, 248, 255, 0.95)');
      skyGrad.addColorStop(0.7, 'rgba(240, 253, 244, 0.9)');
      skyGrad.addColorStop(1, 'rgba(236, 253, 245, 0.95)');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. SMILING SUN WITH ROTATING RAYS
      const sunX = width * 0.73;
      const sunY = height * 0.22;
      const sunRadius = 10.5;

      ctx.save();
      ctx.translate(sunX, sunY);

      // Rotating doodle rays
      ctx.save();
      ctx.rotate(tick * 0.007);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      const numRays = 8;
      for (let r = 0; r < numRays; r++) {
        const angle = (r * Math.PI * 2) / numRays;
        const rayLen = 4 + Math.sin(tick * 0.06 + r) * 1.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * (sunRadius + 2.5), Math.sin(angle) * (sunRadius + 2.5));
        ctx.lineTo(Math.cos(angle) * (sunRadius + 2.5 + rayLen), Math.sin(angle) * (sunRadius + 2.5 + rayLen));
        ctx.stroke();
      }
      ctx.restore();

      // Sun circle
      ctx.beginPath();
      ctx.arc(0, 0, sunRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // Sun face
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(-3, -1.5, 1, 0, Math.PI * 2);
      ctx.arc(3, -1.5, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 1, 4, 0.2 * Math.PI, 0.8 * Math.PI, false);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();

      // 3. FLUFFY DRIFTING CLOUDS
      clouds.forEach((cloud) => {
        cloud.x += cloud.speed;
        if (cloud.x > width + 50) cloud.x = -50;

        ctx.save();
        ctx.translate(cloud.x, cloud.y);
        ctx.scale(cloud.scale, cloud.scale);
        ctx.fillStyle = `rgba(186, 230, 253, ${cloud.opacity})`;
        ctx.strokeStyle = `rgba(125, 211, 252, ${cloud.opacity * 0.9})`;
        ctx.lineWidth = 1.3;

        ctx.beginPath();
        ctx.arc(0, 0, 10, Math.PI * 0.5, Math.PI * 1.5);
        ctx.arc(8, -6, 12, Math.PI * 1, Math.PI * 1.85);
        ctx.arc(22, -5, 10, Math.PI * 1.35, Math.PI * 2.05);
        ctx.arc(30, 0, 8, Math.PI * 1.6, Math.PI * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      // 4. BIRDS
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      const birdOffset = (tick * 0.35) % (width + 80);
      for (let b = 0; b < 3; b++) {
        const bx = ((width - birdOffset) + b * 14) % width;
        const by = 18 + b * 4 + Math.sin(tick * 0.08 + b) * 1.8;
        ctx.beginPath();
        ctx.arc(bx - 2.5, by, 2.5, Math.PI * 1.1, Math.PI * 1.9);
        ctx.arc(bx + 2.5, by, 2.5, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }

      // 5. SCENERY BACKGROUND (Houses, Trees, School with Flag, Toy Car)
      // Tree 1 (Left)
      const tree1X = width * 0.25;
      const tree1GroundY = getGroundY(tree1X, width, height);
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(tree1X, tree1GroundY);
      ctx.lineTo(tree1X, tree1GroundY - 24);
      ctx.stroke();
      ctx.fillStyle = '#86efac';
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(tree1X, tree1GroundY - 32, 11, 0, Math.PI * 2);
      ctx.arc(tree1X - 6, tree1GroundY - 27, 8, 0, Math.PI * 2);
      ctx.arc(tree1X + 6, tree1GroundY - 27, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tree 2 (Center Right)
      const tree2X = width * 0.61;
      const tree2GroundY = getGroundY(tree2X, width, height);
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(tree2X, tree2GroundY);
      ctx.lineTo(tree2X, tree2GroundY - 22);
      ctx.stroke();
      ctx.fillStyle = '#a7f3d0';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(tree2X, tree2GroundY - 30, 10, 0, Math.PI * 2);
      ctx.arc(tree2X - 5, tree2GroundY - 25, 7, 0, Math.PI * 2);
      ctx.arc(tree2X + 5, tree2GroundY - 25, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cottage 1 (Left)
      const cotX = width * 0.18;
      const cotGroundY = getGroundY(cotX, width, height);
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.3;
      ctx.fillRect(cotX - 9, cotGroundY - 14, 18, 14);
      ctx.strokeRect(cotX - 9, cotGroundY - 14, 18, 14);
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.moveTo(cotX - 12, cotGroundY - 14);
      ctx.lineTo(cotX, cotGroundY - 24);
      ctx.lineTo(cotX + 12, cotGroundY - 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Two-Story House (Center)
      const houseX = width * 0.39;
      const houseGroundY = getGroundY(houseX, width, height);
      ctx.fillStyle = '#f5f5f4';
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 1.3;
      ctx.fillRect(houseX - 12, houseGroundY - 20, 24, 20);
      ctx.strokeRect(houseX - 12, houseGroundY - 20, 24, 20);
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(houseX - 14, houseGroundY - 26, 28, 6);
      ctx.strokeRect(houseX - 14, houseGroundY - 26, 28, 6);

      // Yellow Toy Car (Center)
      const carX = width * 0.49;
      const carGroundY = getGroundY(carX, width, height);
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(carX, carGroundY - 3, 7, Math.PI * 1, Math.PI * 2);
      ctx.lineTo(carX + 8, carGroundY - 3);
      ctx.lineTo(carX + 8, carGroundY);
      ctx.lineTo(carX - 8, carGroundY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(carX - 4.5, carGroundY, 2, 0, Math.PI * 2);
      ctx.arc(carX + 4.5, carGroundY, 2, 0, Math.PI * 2);
      ctx.fill();

      // School Building with Waving Flag (Right)
      const schoolX = width * 0.77;
      const schoolGroundY = getGroundY(schoolX, width, height);
      ctx.fillStyle = '#e7e5e4';
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.3;
      ctx.fillRect(schoolX - 11, schoolGroundY - 20, 22, 20);
      ctx.strokeRect(schoolX - 11, schoolGroundY - 20, 22, 20);
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(schoolX - 5, schoolGroundY - 20);
      ctx.lineTo(schoolX - 5, schoolGroundY - 32);
      ctx.stroke();
      const flagWave = Math.sin(tick * 0.1) * 1.5;
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(schoolX - 5, schoolGroundY - 32);
      ctx.quadraticCurveTo(schoolX, schoolGroundY - 34 + flagWave, schoolX + 6, schoolGroundY - 30);
      ctx.lineTo(schoolX + 6, schoolGroundY - 25);
      ctx.lineTo(schoolX - 5, schoolGroundY - 26);
      ctx.closePath();
      ctx.fill();

      // 6. ROLLING GREEN HILL GROUND
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, getGroundY(0, width, height));

      const segments = 45;
      for (let i = 0; i <= segments; i++) {
        const px = (i / segments) * width;
        ctx.lineTo(px, getGroundY(px, width, height));
      }

      ctx.lineTo(width, height);
      ctx.closePath();

      const hillGrad = ctx.createLinearGradient(0, height * 0.7, 0, height);
      hillGrad.addColorStop(0, '#bef264');
      hillGrad.addColorStop(0.3, '#a3e635');
      hillGrad.addColorStop(0.7, '#65a30d');
      hillGrad.addColorStop(1, '#4d7c0f');
      ctx.fillStyle = hillGrad;
      ctx.fill();

      ctx.strokeStyle = '#4d7c0f';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Grass tufts
      ctx.strokeStyle = '#365314';
      ctx.lineWidth = 1.1;
      for (let g = 0; g < 15; g++) {
        const gx = ((g + 0.5) / 15) * width;
        const gy = getGroundY(gx, width, height);
        const sway = Math.sin(tick * 0.04 + g) * 1.5;
        ctx.beginPath();
        ctx.moveTo(gx - 2, gy);
        ctx.lineTo(gx - 3 + sway, gy - 4);
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + sway, gy - 5);
        ctx.moveTo(gx + 2, gy);
        ctx.lineTo(gx + 3 + sway, gy - 4);
        ctx.stroke();
      }

      // Flowers
      flowers.forEach((fl) => {
        const fx = fl.ratioX * width;
        const fy = getGroundY(fx, width, height);
        const sway = Math.sin(tick * 0.05 + fl.sway) * 1.2;

        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + sway, fy - 8);
        ctx.stroke();

        ctx.fillStyle = fl.color;
        ctx.beginPath();
        ctx.arc(fx + sway, fy - 9, fl.size, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      // 7. MINIATURE SOCCER NET ON THE LEFT (Real 3D Goal with Net Mesh & Bulge Physics)
      const mouthGroundY = getGroundY(goal.mouthX, width, height);
      const backGroundY = getGroundY(goal.backX, width, height);
      const crossbarY = mouthGroundY - goal.height;
      const backTopY = backGroundY - (goal.height * 0.78);

      // Dynamic net bulge damping
      goal.netBulgeVel += -goal.netBulge * 0.12 - goal.netBulgeVel * 0.22;
      goal.netBulge += goal.netBulgeVel;
      const currentBulge = Math.max(0, goal.netBulge);

      // Draw Goal Line on Turf
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, mouthGroundY - 1);
      ctx.lineTo(goal.mouthX, mouthGroundY + 3);
      ctx.stroke();

      // Goal Back Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.beginPath();
      ctx.ellipse((goal.mouthX + goal.backX) * 0.5, mouthGroundY + 1, (goal.mouthX - goal.backX) * 0.6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // A) BACK NETTING AND SIDE MESH (Drawn behind the ball for authentic depth)
      ctx.save();
      // Translucent net fill
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, crossbarY);
      ctx.lineTo(goal.backX - currentBulge, backTopY);
      ctx.lineTo(goal.backX - currentBulge, backGroundY);
      ctx.lineTo(goal.mouthX, mouthGroundY);
      ctx.closePath();
      ctx.fill();

      // Net Mesh Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
      ctx.lineWidth = 0.85;

      // Horizontal mesh ropes
      const netRows = 5;
      for (let r = 1; r <= netRows; r++) {
        const t = r / (netRows + 1);
        const frontY = crossbarY + t * (mouthGroundY - crossbarY);
        const rearY = backTopY + t * (backGroundY - backTopY);
        const rearX = goal.backX - currentBulge * (1 - t * 0.3);

        ctx.beginPath();
        ctx.moveTo(goal.mouthX, frontY);
        ctx.quadraticCurveTo((goal.mouthX + rearX) * 0.5, (frontY + rearY) * 0.5 + 1, rearX, rearY);
        ctx.stroke();
      }

      // Angled vertical net cords
      const netCols = 5;
      for (let c = 1; c <= netCols; c++) {
        const t = c / (netCols + 1);
        const topX = goal.mouthX - t * (goal.mouthX - (goal.backX - currentBulge));
        const topY = crossbarY - t * (crossbarY - backTopY);
        const botX = goal.mouthX - t * (goal.mouthX - (goal.backX - currentBulge));
        const botY = mouthGroundY - t * (mouthGroundY - backGroundY);

        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(botX, botY);
        ctx.stroke();
      }

      // Back Support Frame
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      // Rear post
      ctx.moveTo(goal.backX - currentBulge, backGroundY);
      ctx.lineTo(goal.backX - currentBulge, backTopY);
      // Top diagonal strut
      ctx.lineTo(goal.mouthX, crossbarY);
      // Bottom ground anchor
      ctx.moveTo(goal.backX - currentBulge, backGroundY);
      ctx.lineTo(goal.mouthX, mouthGroundY);
      ctx.stroke();
      ctx.restore();

      // 8. SOCCER BALL WITH AUTHENTIC ROLLING, DRAG, AND TURF SLOPE PHYSICS
      const ballGroundY = getGroundY(ball.x, width, height) - ball.radius;

      // Hill slope computation at ball position
      const slopeDelta = (getGroundY(ball.x + 2, width, height) - getGroundY(ball.x - 2, width, height)) / 4;
      const slopeAngle = Math.atan(slopeDelta);

      // GOAL DETECTION: Did ball enter the soccer goal on the left?
      const isInsideGoalMouth =
        ball.x <= goal.mouthX + 2 &&
        ball.x >= goal.backX - 8 &&
        ball.y >= crossbarY - 3 &&
        ball.y <= mouthGroundY + 4;

      if (isInsideGoalMouth && !ball.inNet && goalTimer === 0) {
        // GOAL SCORED!
        ball.inNet = true;
        goalTimer = 175; // ~2.9 seconds celebration
        scorerId = ball.lastKickerId || 1;

        // Impart net bulge from kick velocity
        goal.netBulge = Math.min(13, Math.abs(ball.vx) * 2.4 + 4);
        goal.netBulgeVel = -goal.netBulge * 0.2;

        // Soft net deceleration
        ball.vx *= 0.2;
        ball.vy = Math.min(ball.vy * 0.2, 0.5);

        // Confetti explosion around the goal net
        for (let i = 0; i < 18; i++) {
          celebrationParticles.push({
            x: goal.mouthX + (Math.random() - 0.5) * 16,
            y: crossbarY + Math.random() * goal.height,
            vx: (Math.random() - 0.5) * 3,
            vy: -1.8 - Math.random() * 2.8,
            size: 2 + Math.random() * 2.2,
            color: ['#10b981', '#f59e0b', '#ec4899', '#38bdf8', '#fbbf24', '#ffffff'][Math.floor(Math.random() * 6)],
            life: 1,
          });
        }
      }

      // Ball Physics Loop
      if (ball.inNet) {
        // Ball resting or settling inside net
        ball.vy += 0.2;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= 0.85;

        // Ground constraint in net
        if (ball.y >= ballGroundY) {
          ball.y = ballGroundY;
          ball.vy = -ball.vy * 0.25;
          if (Math.abs(ball.vy) < 0.2) ball.vy = 0;
        }
        // Contain within back net wall
        if (ball.x < goal.backX + ball.radius) {
          ball.x = goal.backX + ball.radius;
          ball.vx = Math.abs(ball.vx) * 0.3;
        }

        // Countdown goal celebration
        if (goalTimer > 0) {
          goalTimer--;
          if (goalTimer === 1) {
            // Kickoff restart from midfield after celebration
            ball.inNet = false;
            scorerId = null;
            ball.x = width * 0.42;
            ball.y = getGroundY(ball.x, width, height) - 22;
            ball.vx = 1.6 + Math.random() * 1.2;
            ball.vy = -3.2;
            ball.lastKickerId = 3;
          }
        }
      } else {
        // Normal Turf & Air Ball Physics
        const onGround = ball.y >= ballGroundY - 0.8;

        if (onGround) {
          // Ball is rolling on grass
          ball.y = ballGroundY;

          // Realistic gravity component along the slope
          const gravitySlopeForce = Math.sin(slopeAngle) * 0.22;
          ball.vx += gravitySlopeForce;

          // Rolling friction on natural grass turf
          ball.vx *= 0.984;

          // No-slip condition: rotation is strictly proportional to linear velocity (v = omega * r)
          ball.rotSpeed = ball.vx / ball.radius;
          ball.rotation += ball.rotSpeed;

          // If vertical bounce is tiny, kill bounce so ball rolls smoothly
          if (Math.abs(ball.vy) < 0.5) {
            ball.vy = 0;
          } else {
            ball.vy = -ball.vy * ball.bounciness;
          }
        } else {
          // Ball is airborne
          ball.vy += 0.24; // Gravity
          ball.vx *= 0.995; // Air drag
          ball.vy *= 0.995;
          ball.rotation += ball.rotSpeed;

          // Ground impact collision
          if (ball.y >= ballGroundY) {
            ball.y = ballGroundY;
            ball.vy = -ball.vy * ball.bounciness;

            // Transfer linear velocity to spin upon bounce
            ball.rotSpeed = ball.vx * 0.16;

            // Small grass particle puff on impact
            if (Math.abs(ball.vy) > 1.8) {
              celebrationParticles.push({
                x: ball.x,
                y: ballGroundY,
                vx: (Math.random() - 0.5) * 1.5,
                vy: -0.8 - Math.random() * 1.2,
                size: 1.5,
                color: '#65a30d',
                life: 0.7,
              });
            }
          }
        }

        ball.x += ball.vx;
        ball.y += ball.vy;

        // Boundaries: Right edge turnback
        if (ball.x >= width - ball.radius - 8) {
          ball.x = width - ball.radius - 8;
          ball.vx = -(Math.abs(ball.vx) * 0.75 + 1.2);
        }
        // Left boundary if misses goal
        if (ball.x <= ball.radius + 6) {
          ball.x = ball.radius + 6;
          ball.vx = Math.abs(ball.vx) * 0.8 + 1.2;
        }
      }

      // Ball Shadow on Turf
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.ellipse(ball.x, ballGroundY + 2.5, ball.radius * 1.15, ball.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // RENDER SOCCER BALL (Classic 32-Panel Geometric Hexagon/Pentagon Texture)
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(ball.rotation);

      // Ball white sphere base
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Classic center black pentagon
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

      // Outer seam segments
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 0.8;
      for (let p = 0; p < 5; p++) {
        const pAngle = (p * Math.PI * 2) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(pAngle) * pentaRadius, Math.sin(pAngle) * pentaRadius);
        ctx.lineTo(Math.cos(pAngle) * ball.radius, Math.sin(pAngle) * ball.radius);
        ctx.stroke();
      }

      // Ball 3D shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(-ball.radius * 0.35, -ball.radius * 0.35, ball.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // B) FRONT GOAL POSTS & CROSSBAR (Drawn IN FRONT of the ball for realistic 3D depth)
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Front Upright Post
      ctx.moveTo(goal.mouthX, mouthGroundY);
      ctx.lineTo(goal.mouthX, crossbarY);
      ctx.stroke();

      // Front Crossbar
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, crossbarY);
      ctx.lineTo(goal.backX - currentBulge * 0.5, crossbarY - 2);
      ctx.stroke();

      // Post outline for crisp clarity against green hill
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(goal.mouthX - 1.2, mouthGroundY);
      ctx.lineTo(goal.mouthX - 1.2, crossbarY - 1);
      ctx.moveTo(goal.mouthX + 1.2, mouthGroundY);
      ctx.lineTo(goal.mouthX + 1.2, crossbarY - 1);
      ctx.stroke();
      ctx.restore();

      // 9. BUTTERFLIES
      butterflies.forEach((bf) => {
        bf.x += bf.vx;
        bf.y += bf.vy + Math.sin(tick * 0.08) * 0.6;
        bf.wingAngle += bf.wingSpeed;

        if (Math.random() < 0.02) {
          bf.vx = (Math.random() - 0.5) * 1.0;
          bf.vy = (Math.random() - 0.5) * 0.6;
        }

        if (bf.x < 15) bf.vx = 0.6;
        if (bf.x > width - 15) bf.vx = -0.6;
        if (bf.y < 12) bf.vy = 0.4;
        if (bf.y > height * 0.65) bf.vy = -0.4;

        ctx.save();
        ctx.translate(bf.x, bf.y);
        const wingScale = Math.cos(bf.wingAngle);
        ctx.fillStyle = bf.color;
        ctx.beginPath();
        ctx.ellipse(-bf.size * 0.7 * Math.abs(wingScale), 0, bf.size * Math.abs(wingScale), bf.size * 0.6, -0.3, 0, Math.PI * 2);
        ctx.ellipse(bf.size * 0.7 * Math.abs(wingScale), 0, bf.size * Math.abs(wingScale), bf.size * 0.6, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 10. AUTHENTIC PLAYGROUND & SOCCER MATCH BEHAVIORS
      children.forEach((c) => {
        const baseX = c.baseRatioX * width;
        const groundY = getGroundY(c.curX, width, height);

        if (c.kickCooldown > 0) c.kickCooldown--;

        const isScorerCelebrating = scorerId === c.id && goalTimer > 0;

        // REALISTIC 4-PHASE KICKING ANIMATION STATE MACHINE
        if (c.kickPhase === 'windup') {
          // Phase 1: Wind-up (leg pulls back, torso leans into the ball)
          c.kickProgress += 0.22;
          c.kickLegAngle = -0.75 * Math.sin(c.kickProgress * Math.PI * 0.5);

          if (c.kickProgress >= 1) {
            c.kickPhase = 'strike';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'strike') {
          // Phase 2: Forward Strike (snappy kick stroke delivering impulse)
          c.kickProgress += 0.32;
          c.kickLegAngle = 0.85 * Math.sin(c.kickProgress * Math.PI * 0.5);

          // EXACT PHYSICAL IMPACT POINT: Mid-strike
          if (c.kickProgress >= 0.5 && c.kickCooldown >= 70) {
            c.kickCooldown = 68; // mark impacted
            ball.lastKickerId = c.id;

            // Calculate realistic kick trajectory based on position & game flow:
            if (c.behavior === 'striker-left' || c.curX < width * 0.32) {
              // Striker shoots toward left soccer goal!
              const distToGoal = ball.x - goal.mouthX;
              const power = Math.max(4.2, Math.min(6.2, distToGoal * 0.08 + 3.8));
              ball.vx = -power;
              ball.vy = -2.6 - Math.random() * 2.0; // Low drive or dipped volley
              ball.rotSpeed = -0.32; // aggressive top/backspin
            } else if (c.behavior === 'playmaker-center') {
              // Center playmaker passes forward to striker or takes long shot!
              if (Math.random() < 0.55) {
                // Shoot toward goal
                ball.vx = -5.0 - Math.random() * 1.5;
                ball.vy = -3.2 - Math.random() * 1.5;
              } else {
                // Pass to left striker
                ball.vx = -3.8 - Math.random() * 1.0;
                ball.vy = -2.4;
              }
              ball.rotSpeed = -0.25;
            } else if (c.behavior === 'winger-right') {
              // Right winger crosses ball back into the box / midfield!
              ball.vx = -4.5 - Math.random() * 1.4;
              ball.vy = -3.8 - Math.random() * 1.2;
              ball.rotSpeed = -0.28;
            }

            // Turf kick puff
            for (let k = 0; k < 5; k++) {
              c.particles.push({
                x: c.curX + c.facing * 8,
                y: groundY - 2,
                vx: c.facing * (1 + Math.random() * 2),
                vy: -1 - Math.random() * 1.5,
                life: 0.7,
                color: '#65a30d',
              });
            }
          }

          if (c.kickProgress >= 1) {
            c.kickPhase = 'followthrough';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'followthrough') {
          // Phase 3: Follow-through (leg decelerates smoothly back to stance)
          c.kickProgress += 0.16;
          c.kickLegAngle = 0.85 * (1 - c.kickProgress);

          if (c.kickProgress >= 1) {
            c.kickPhase = 'idle';
            c.kickLegAngle = 0;
            c.kickProgress = 0;
          }
        }

        // REALISTIC PLAYGROUND BEHAVIORS
        if (isScorerCelebrating) {
          // CELEBRATION MODE: Scorer jumps joyfully, raises both arms, and shouts GOAL!
          c.yOffset = -Math.abs(Math.sin(tick * 0.22)) * 5.5;
          c.runCycle = 0;
        } else if (goalTimer > 0) {
          // Other kids celebrate the goal: clapping & cheering
          c.yOffset = -Math.abs(Math.sin(tick * 0.15 + c.id)) * 2.5;
          c.facing = c.curX > goal.mouthX ? -1 : 1; // turn towards goal
        } else {
          // STANDARD MATCH PLAY & PLAYGROUND ACTIVITIES
          switch (c.behavior) {
            case 'striker-left': {
              // Player 1 (Striker): Runs to intercept ball and shoot into the net
              const targetX = Math.max(goal.mouthX + 16, Math.min(baseX + 45, ball.x + (ball.vx > 0 ? 10 : -8)));
              const dx = targetX - c.curX;

              if (c.kickPhase === 'idle') {
                if (Math.abs(dx) > 3) {
                  c.curX += Math.sign(dx) * 0.85;
                  c.facing = Math.sign(dx) as 1 | -1;
                  c.runCycle += 0.24;
                } else {
                  c.runCycle = 0;
                }

                // Check kicking distance to ball
                const distToBall = Math.hypot(ball.x - c.curX, ball.y - groundY);
                if (distToBall < 18 && c.kickCooldown === 0 && !ball.inNet) {
                  triggerPlayerKick(c, -1); // Kick towards left goal
                }
              }
              break;
            }

            case 'skipping': {
              // Player 2: Skipping joyfully with dress swaying
              c.yOffset = -Math.abs(Math.sin(tick * 0.12 + c.id)) * 3.5;
              c.runCycle += 0.12;
              break;
            }

            case 'playmaker-center': {
              // Player 3 (Midfielder / Playmaker): Controls center, passes or shoots
              const targetX = Math.max(baseX - 35, Math.min(baseX + 35, ball.x + 8));
              const dx = targetX - c.curX;

              if (c.kickPhase === 'idle') {
                if (Math.abs(dx) > 3) {
                  c.curX += Math.sign(dx) * 0.8;
                  c.facing = Math.sign(dx) as 1 | -1;
                  c.runCycle += 0.22;
                } else {
                  c.runCycle = 0;
                }

                const distToBall = Math.hypot(ball.x - c.curX, ball.y - groundY);
                if (distToBall < 18 && c.kickCooldown === 0 && !ball.inNet) {
                  triggerPlayerKick(c, -1); // Kick towards left goal / striker
                }
              }
              break;
            }

            case 'butterfly-catcher': {
              // Player 4: Playfully chases fluttering butterfly
              const nearestBf = butterflies[1];
              const targetX = Math.max(baseX - 22, Math.min(baseX + 22, nearestBf.x));
              const dx = targetX - c.curX;
              if (Math.abs(dx) > 2) {
                c.curX += Math.sign(dx) * 0.65;
                c.facing = Math.sign(dx) as 1 | -1;
                c.runCycle += 0.18;
              } else {
                c.runCycle = 0;
              }
              break;
            }

            case 'winger-right': {
              // Player 5 (Right Winger): Keeps ball in play, crosses back left
              const targetX = Math.max(baseX - 30, Math.min(baseX + 35, ball.x + 10));
              const dx = targetX - c.curX;

              if (c.kickPhase === 'idle') {
                if (Math.abs(dx) > 3) {
                  c.curX += Math.sign(dx) * 0.85;
                  c.facing = Math.sign(dx) as 1 | -1;
                  c.runCycle += 0.22;
                } else {
                  c.runCycle = 0;
                }

                const distToBall = Math.hypot(ball.x - c.curX, ball.y - groundY);
                if (distToBall < 18 && c.kickCooldown === 0 && !ball.inNet) {
                  triggerPlayerKick(c, -1); // Cross ball left towards center
                }
              }
              break;
            }

            case 'twirler': {
              // Player 6: Twirling & dancing
              c.twirlAngle = Math.sin(tick * 0.08) * 0.15;
              c.runCycle += 0.08;
              break;
            }

            case 'cheerer': {
              // Player 7: Cheering on sideline
              c.yOffset = -Math.abs(Math.sin(tick * 0.14)) * 2.5;
              break;
            }
          }
        }

        // Apply physics to gentle hops from mouse clicks
        if (c.vy !== 0) {
          c.vy += 0.35;
          c.yOffset += c.vy;
          if (c.yOffset >= 0) {
            c.yOffset = 0;
            c.vy = 0;
          }
        }

        // Draw shadow on ground
        ctx.fillStyle = 'rgba(30, 41, 59, 0.2)';
        ctx.beginPath();
        ctx.ellipse(c.curX, groundY + 1, 10, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // DRAW PLAYING CHILD
        ctx.save();
        ctx.translate(c.curX, groundY + c.yOffset);
        if (c.behavior === 'twirler') {
          ctx.rotate(c.twirlAngle);
        }

        // Proportional scale for compact banner: head at -28, feet at 0
        const headY = -28;
        const headRadius = 5.8;
        const bodyY = -18;
        const waistY = -9;

        // 1) LEGS: REAL KICKING DYNAMICS OR RUNNING CYCLE
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';

        if (c.kickPhase !== 'idle') {
          // REALISTIC SOCCER KICK STANCE
          // Plant leg (supporting weight firmly on the turf)
          const plantLegX = -c.facing * 2.6;
          ctx.beginPath();
          ctx.moveTo(plantLegX, waistY);
          ctx.lineTo(plantLegX, 0);
          ctx.stroke();

          // Plant foot shoe
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(plantLegX, 0, 1.8, 0, Math.PI * 2);
          ctx.fill();

          // Kicking leg (swinging with authentic joint rotation angle)
          const kickHipX = c.facing * 2.2;
          const legLen = 9.2;
          const footX = kickHipX + Math.sin(c.kickLegAngle * c.facing) * legLen;
          const footY = waistY + Math.cos(c.kickLegAngle * c.facing) * legLen;

          ctx.beginPath();
          ctx.moveTo(kickHipX, waistY);
          ctx.lineTo(footX, footY);
          ctx.stroke();

          // Kicking shoe
          ctx.fillStyle = '#dc2626'; // Red soccer cleat
          ctx.beginPath();
          ctx.arc(footX, footY, 2.0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Standard running / walking stride
          const legSwing = Math.sin(c.runCycle) * 4;
          // Left leg
          ctx.beginPath();
          ctx.moveTo(-2.5, waistY);
          ctx.lineTo(-2.5 - legSwing, 0);
          // Right leg
          ctx.moveTo(2.5, waistY);
          ctx.lineTo(2.5 + legSwing, 0);
          ctx.stroke();

          // Shoes
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(-2.5 - legSwing, 0, 1.8, 0, Math.PI * 2);
          ctx.arc(2.5 + legSwing, 0, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // 2) CLOTHES
        if (c.hasDress) {
          ctx.fillStyle = c.shirtColor;
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(0, bodyY);
          ctx.lineTo(-7, waistY + 1);
          ctx.lineTo(7, waistY + 1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // Shorts
          ctx.fillStyle = c.pantsColor;
          ctx.fillRect(-4.5, waistY - 1.5, 9, 5);
          // Shirt / Jersey
          ctx.fillStyle = c.shirtColor;
          ctx.fillRect(-5, bodyY, 10, 9);
        }

        // 3) ARMS: TRIUMPHANT GOAL CELEBRATION, ATHLETIC KICK BALANCE, OR RUNNING
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';

        if (isScorerCelebrating) {
          // TRIUMPHANT RAISED ARMS IN A 'V' SHAPE!
          const celebrateWiggle = Math.sin(tick * 0.25) * 2;
          ctx.beginPath();
          ctx.moveTo(-4, bodyY + 3);
          ctx.lineTo(-10 + celebrateWiggle, bodyY - 11);
          ctx.moveTo(4, bodyY + 3);
          ctx.lineTo(10 - celebrateWiggle, bodyY - 11);
          ctx.stroke();
        } else if (c.kickPhase !== 'idle') {
          // ATHLETIC KICK BALANCE: Counter-balancing arm forward, kicking-side arm back
          ctx.beginPath();
          // Forward balancing arm
          ctx.moveTo(c.facing * 4, bodyY + 2);
          ctx.lineTo(c.facing * 10, bodyY - 2);
          // Rear arm
          ctx.moveTo(-c.facing * 4, bodyY + 2);
          ctx.lineTo(-c.facing * 8, bodyY + 7);
          ctx.stroke();
        } else if (goalTimer > 0 || c.behavior === 'cheerer') {
          // Clapping / cheering hands
          const clap = Math.sin(tick * 0.22) * 3;
          ctx.beginPath();
          ctx.moveTo(-4, bodyY + 3);
          ctx.lineTo(-1 + clap, bodyY + 4);
          ctx.moveTo(4, bodyY + 3);
          ctx.lineTo(1 - clap, bodyY + 4);
          ctx.stroke();
        } else if (c.behavior === 'skipping' || c.behavior === 'twirler') {
          // Cheerful open arms
          const armWave = Math.sin(tick * 0.15) * 2;
          ctx.beginPath();
          ctx.moveTo(-4, bodyY + 3);
          ctx.lineTo(-8, bodyY - 1 + armWave);
          ctx.moveTo(4, bodyY + 3);
          ctx.lineTo(8, bodyY - 1 - armWave);
          ctx.stroke();
        } else {
          // Running arm swing
          const armSwing = Math.cos(c.runCycle) * 4;
          ctx.beginPath();
          ctx.moveTo(-4, bodyY + 3);
          ctx.lineTo(-4 - armSwing, bodyY + 7);
          ctx.moveTo(4, bodyY + 3);
          ctx.lineTo(4 + armSwing, bodyY + 7);
          ctx.stroke();
        }

        // 4) HEAD & FACE
        ctx.fillStyle = c.skinColor;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eyes
        const eyeLookX = c.facing * 1.2;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-1.8 + eyeLookX, headY - 1, 0.9, 0, Math.PI * 2);
        ctx.arc(1.8 + eyeLookX, headY - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Mouth (Open shouting smile during celebration!)
        if (isScorerCelebrating) {
          ctx.fillStyle = '#991b1b';
          ctx.strokeStyle = '#7c2d12';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(0, headY + 1.2, 2.6, 0, Math.PI);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#7c2d12';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(0, headY + 0.8, 2.6, 0.15 * Math.PI, 0.85 * Math.PI, false);
          ctx.stroke();
        }

        // Rosy cheeks
        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(-3, headY + 1.2, 1.2, 0, Math.PI * 2);
        ctx.arc(3, headY + 1.2, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // 5) HAIR STYLES
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
          ctx.moveTo(c.facing * headRadius, headY);
          ctx.lineTo(c.facing * (headRadius + 3), headY + 4);
          ctx.stroke();
        } else if (c.hairStyle === 'spiky-black') {
          ctx.beginPath();
          ctx.moveTo(-headRadius, headY);
          ctx.lineTo(-4, headY - 9);
          ctx.lineTo(-1, headY - 5);
          ctx.lineTo(1, headY - 10);
          ctx.lineTo(4, headY - 5);
          ctx.lineTo(headRadius, headY);
          ctx.closePath();
          ctx.fill();
        } else if (c.hairStyle === 'blonde-bob') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.5, headRadius + 1, Math.PI * 0.8, Math.PI * 2.2);
          ctx.lineTo(headRadius + 2, headY + 2);
          ctx.lineTo(-headRadius - 2, headY + 2);
          ctx.closePath();
          ctx.fill();
        } else if (c.hairStyle === 'beanie') {
          ctx.fillStyle = '#991b1b';
          ctx.beginPath();
          ctx.arc(0, headY - 2, headRadius + 0.8, Math.PI * 1, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(0, headY - 9, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (c.hairStyle === 'orange-pigtails') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.5, headRadius + 0.5, Math.PI * 0.9, Math.PI * 2.1);
          ctx.fill();
          const pigtailSway = Math.sin(tick * 0.15) * 1.5;
          ctx.beginPath();
          ctx.moveTo(-headRadius, headY);
          ctx.lineTo(-headRadius - 3, headY + 4 + pigtailSway);
          ctx.moveTo(headRadius, headY);
          ctx.lineTo(headRadius + 3, headY + 4 - pigtailSway);
          ctx.stroke();
        } else if (c.hairStyle === 'curly-brown') {
          for (let cp = -2; cp <= 2; cp++) {
            ctx.beginPath();
            ctx.arc(cp * 2.5, headY - 5, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 6) "GOAL! ⚽" COMIC SPEECH BUBBLE OVER SCORER'S HEAD
        if (isScorerCelebrating) {
          const bubbleAnim = Math.min(1, (175 - goalTimer) / 12);
          const bounce = 1 + Math.sin(tick * 0.2) * 0.08;

          ctx.save();
          ctx.translate(0, headY - 22);
          ctx.scale(bubbleAnim * bounce, bubbleAnim * bounce);

          // Bubble background pill
          const bw = 46;
          const bh = 18;
          const br = 7;

          const drawBubbleRect = (rx: number, ry: number) => {
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(rx, ry, bw, bh, br);
            } else {
              // Universal canvas rounded rect fallback
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

          // Drop shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          drawBubbleRect(-bw / 2 + 1, -bh / 2 + 1);
          ctx.fill();

          // Bubble fill
          const bGrad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
          bGrad.addColorStop(0, '#ffffff');
          bGrad.addColorStop(1, '#ecfdf5');
          ctx.fillStyle = bGrad;
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1.4;
          drawBubbleRect(-bw / 2, -bh / 2);
          ctx.fill();
          ctx.stroke();

          // Speech Bubble Pointer Tail pointing to head
          ctx.fillStyle = '#ecfdf5';
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(-3, bh / 2 - 0.5);
          ctx.lineTo(0, bh / 2 + 5);
          ctx.lineTo(4, bh / 2 - 0.5);
          ctx.fill();
          ctx.stroke();

          // White mask over tail top seam
          ctx.fillStyle = '#ecfdf5';
          ctx.beginPath();
          ctx.fillRect(-2, bh / 2 - 2, 5, 2.5);

          // "GOAL! ⚽" Text
          ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#047857';
          ctx.fillText('GOAL! ⚽', 0, 0);

          ctx.restore();
        }

        ctx.restore();

        // Celebration star particles
        for (let p = c.particles.length - 1; p >= 0; p--) {
          const pt = c.particles[p];
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += 0.08;
          pt.life -= 0.03;

          if (pt.life <= 0) {
            c.particles.splice(p, 1);
          } else {
            ctx.save();
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = pt.life;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 1.8 * pt.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      });

      // 11. CELEBRATION CONFETTI PARTICLES (During Goal Event)
      for (let cp = celebrationParticles.length - 1; cp >= 0; cp--) {
        const cpItem = celebrationParticles[cp];
        cpItem.x += cpItem.vx;
        cpItem.y += cpItem.vy;
        cpItem.vy += 0.07;
        cpItem.vx *= 0.98;
        cpItem.life -= 0.018;

        if (cpItem.life <= 0) {
          celebrationParticles.splice(cp, 1);
        } else {
          ctx.save();
          ctx.globalAlpha = cpItem.life;
          ctx.fillStyle = cpItem.color;
          ctx.beginPath();
          ctx.arc(cpItem.x, cpItem.y, cpItem.size * cpItem.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('touchstart', onTouchStart);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-24 sm:h-28 md:h-30 rounded-2xl border border-emerald-200/90 shadow-xs relative overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-label="Interactive live miniature garden with playing children"
      />
    </div>
  );
}
