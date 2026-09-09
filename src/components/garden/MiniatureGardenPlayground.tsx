'use client';

import React, { useRef, useEffect } from 'react';

/**
 * MiniatureGardenPlayground
 * Compact physics-based live miniature garden where children are engaged in
 * rich, authentic activities in dynamic side-profile action poses:
 * 1. Soccer Striker: chases the ball, kicks drives & volleys toward the left soccer net, celebrates "GOAL! ⚽".
 * 2. Slingshot Mango Hunter: aims a wooden Y-slingshot at the mango tree, shoots pebbles, drops ripe mangoes into a basket.
 * 3. Soccer Midfielder / Playmaker: patrols midfield & right wing, intercepts balls, passes & shoots so the game NEVER stops.
 * 4. Butterfly Catcher: holds a long bamboo net, playfully chasing fluttering butterflies across the meadow.
 * 5. Bicycle Rider: rides a miniature two-wheeled bicycle across the path with rotating wheels and pedaling legs.
 * 6. Kite Flyer: holds a reel as a colorful diamond kite flutters high in the breeze with dancing ribbon tails.
 * 7. Sideline Cheerer: cheers on the soccer match and celebrates goals.
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
      mouthX: 48,    // Front goal line
      backX: 18,     // Back of the net
      height: 22,    // Crossbar height
      netBulge: 0,   // Dynamic net ripple/bulge when ball enters
      netBulgeVel: 0,
    };

    // Goal event tracking
    let goalTimer = 0;       // celebration frames (~160 frames)
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

    // Interactive Soccer Ball with High-Energy Continuous Physics
    const ball = {
      x: 160,
      y: 50,
      vx: 3.8,        // Lively initial speed!
      vy: -2.0,
      radius: 5.2,
      rotation: 0,
      rotSpeed: 0.15,
      bounciness: 0.55,
      lastKickerId: 1,
      inNet: false,
      idleFrames: 0,  // Tracks how long ball has been idle to dispatch rescue kicks!
    };

    // Tree 1: Mango Tree state with interactive falling mangoes
    const mangoTree = {
      xRatio: 0.25,
      mangoes: [
        { id: 1, relX: -8, relY: -28, isFalling: false, curY: 0, vy: 0 },
        { id: 2, relX: 6, relY: -26, isFalling: false, curY: 0, vy: 0 },
        { id: 3, relX: -2, relY: -32, isFalling: false, curY: 0, vy: 0 },
      ],
      slingshotPebble: { active: false, x: 0, y: 0, vx: 0, vy: 0, targetMangoId: 1 },
      basketMangoCount: 1,
    };

    // Fluttering Butterflies
    const butterflies = [
      { x: 140, y: 32, vx: 0.5, vy: 0, wingAngle: 0, wingSpeed: 0.28, color: '#f43f5e', size: 3 },
      { x: 440, y: 26, vx: -0.6, vy: 0, wingAngle: 0, wingSpeed: 0.30, color: '#0ea5e9', size: 3 },
      { x: 720, y: 36, vx: 0.5, vy: 0, wingAngle: 0, wingSpeed: 0.26, color: '#eab308', size: 3 },
    ];

    // Drifting Clouds
    const clouds = [
      { x: 60, y: 16, speed: 0.18, scale: 0.75, opacity: 0.7 },
      { x: 420, y: 12, speed: 0.15, scale: 0.9, opacity: 0.8 },
      { x: 760, y: 18, speed: 0.2, scale: 0.7, opacity: 0.65 },
    ];

    // Playing Children definitions with Rich Autonomous Activities & Side-Profiles
    interface PlayingChild {
      id: number;
      baseRatioX: number;
      curX: number;
      yOffset: number;
      vy: number;
      activity: 'soccer-striker' | 'slingshot-hunter' | 'soccer-midfield' | 'butterfly-catcher' | 'bicycle-rider' | 'kite-flyer' | 'cheerer';
      facing: 1 | -1; // 1 = facing right, -1 = facing left (profile view!)
      hairColor: string;
      hairStyle: 'short-brown' | 'ponytail-red' | 'spiky-black' | 'blonde-bob' | 'beanie' | 'orange-pigtails' | 'curly-brown';
      shirtColor: string;
      pantsColor: string;
      skinColor: string;
      hasDress?: boolean;
      twirlAngle: number;
      kickCooldown: number;
      runCycle: number;
      // Slingshot animation state
      slingshotPhase: 'aim' | 'pull' | 'release' | 'catch' | 'wait';
      slingshotTimer: number;
      // Bicycle rider state
      bikeDistance: number;
      // Kicking animation state machine
      kickPhase: 'idle' | 'windup' | 'strike' | 'followthrough';
      kickProgress: number;
      kickLegAngle: number;
      particles: Array<{ x: number; y: number; vy: number; vx: number; life: number; color: string }>;
    }

    const children: PlayingChild[] = [
      {
        id: 1,
        baseRatioX: 0.14,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'soccer-striker',
        facing: -1, // Faces left toward soccer net
        hairColor: '#b45309',
        hairStyle: 'short-brown',
        shirtColor: '#0284c7', // Sky blue soccer jersey #9
        pantsColor: '#1e293b',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotPhase: 'wait',
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        particles: [],
      },
      {
        id: 2,
        baseRatioX: 0.27,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'slingshot-hunter',
        facing: -1, // Faces left looking up at the mango tree
        hairColor: '#7c2d12',
        hairStyle: 'beanie',
        shirtColor: '#ea580c', // Orange outdoor vest
        pantsColor: '#15803d',
        skinColor: '#fef3c7',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotPhase: 'pull',
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        particles: [],
      },
      {
        id: 3,
        baseRatioX: 0.42,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'soccer-midfield',
        facing: -1, // Faces left towards goal/striker
        hairColor: '#334155',
        hairStyle: 'spiky-black',
        shirtColor: '#f59e0b', // Yellow playmaker jersey #10
        pantsColor: '#1e3a8a',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotPhase: 'wait',
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        particles: [],
      },
      {
        id: 4,
        baseRatioX: 0.54,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'butterfly-catcher',
        facing: 1, // Faces right chasing butterfly
        hairColor: '#facc15',
        hairStyle: 'blonde-bob',
        shirtColor: '#ec4899', // Pink sundress
        pantsColor: '#ec4899',
        skinColor: '#fef3c7',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotPhase: 'wait',
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        particles: [],
      },
      {
        id: 5,
        baseRatioX: 0.70,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'bicycle-rider',
        facing: 1, // Pedaling right across path
        hairColor: '#ea580c',
        hairStyle: 'ponytail-red',
        shirtColor: '#10b981', // Emerald tee
        pantsColor: '#047857',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotPhase: 'wait',
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        particles: [],
      },
      {
        id: 6,
        baseRatioX: 0.84,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'kite-flyer',
        facing: -1, // Faces left into the breeze holding kite string
        hairColor: '#d97706',
        hairStyle: 'orange-pigtails',
        shirtColor: '#6366f1', // Indigo dress
        pantsColor: '#6366f1',
        skinColor: '#fef3c7',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotPhase: 'wait',
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        particles: [],
      },
      {
        id: 7,
        baseRatioX: 0.94,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'cheerer',
        facing: -1, // Cheering looking across the field
        hairColor: '#451a03',
        hairStyle: 'curly-brown',
        shirtColor: '#f43f5e', // Rose red dress
        pantsColor: '#f43f5e',
        skinColor: '#fde047',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotPhase: 'wait',
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        particles: [],
      },
    ];

    // Flower patches
    const flowers = [
      { ratioX: 0.08, color: '#f43f5e', size: 2.8, sway: 0 },
      { ratioX: 0.18, color: '#a855f7', size: 2.5, sway: 1.2 },
      { ratioX: 0.33, color: '#38bdf8', size: 2.8, sway: 2.4 },
      { ratioX: 0.48, color: '#f59e0b', size: 2.5, sway: 0.8 },
      { ratioX: 0.63, color: '#ec4899', size: 3.2, sway: 3.1 },
      { ratioX: 0.77, color: '#f97316', size: 2.8, sway: 1.7 },
      { ratioX: 0.90, color: '#a855f7', size: 2.8, sway: 2.1 },
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
        // Nudge ball towards click with energetic kick
        ball.vx = (clickX - ball.x) * 0.07;
        ball.vy = -4.5;
        ball.rotSpeed = ball.vx * 0.18;
      }

      // Nearby child celebrates with playful hop
      children.forEach((c) => {
        if (Math.abs(clickX - c.curX) < 35 && c.yOffset === 0 && c.kickPhase === 'idle') {
          c.vy = -4.2;
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
          ball.vx = (clickX - ball.x) * 0.07;
          ball.vy = -4.5;
          ball.rotSpeed = ball.vx * 0.18;
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
      c.kickLegAngle = 0;
      c.kickCooldown = 70;
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

      ctx.beginPath();
      ctx.arc(0, 0, sunRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.3;
      ctx.stroke();

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

      // 5. SCENERY BACKGROUND (Mango Tree, Cottage, Two-Story House, School Building)
      // TREE 1: LUSH MANGO TREE with Golden Ripe Mangoes!
      const tree1X = width * mangoTree.xRatio;
      const tree1GroundY = getGroundY(tree1X, width, height);

      // Tree Trunk
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tree1X, tree1GroundY);
      ctx.lineTo(tree1X - 2, tree1GroundY - 25);
      ctx.stroke();

      // Lush Mango Tree Foliage
      ctx.fillStyle = '#22c55e';
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(tree1X, tree1GroundY - 33, 12.5, 0, Math.PI * 2);
      ctx.arc(tree1X - 7, tree1GroundY - 28, 9, 0, Math.PI * 2);
      ctx.arc(tree1X + 7, tree1GroundY - 28, 9, 0, Math.PI * 2);
      ctx.arc(tree1X, tree1GroundY - 38, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Hanging Ripe Golden Mangoes in Tree 1
      mangoTree.mangoes.forEach((m) => {
        const mx = tree1X + m.relX;
        const my = m.isFalling ? m.curY : tree1GroundY + m.relY;

        // Small stem
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(mx, my - 3.5);
        ctx.lineTo(mx + 0.8, my - 1.5);
        ctx.stroke();

        // Golden Mango Fruit
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(mx, my, 2.6, 3.6, 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Reddish blush on mango
        ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.beginPath();
        ctx.arc(mx + 0.8, my - 0.8, 1.3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Wicker Fruit Basket on ground under Mango tree
      const basketX = tree1X + 8;
      const basketY = tree1GroundY - 1;
      ctx.fillStyle = '#b45309';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(basketX - 5, basketY);
      ctx.lineTo(basketX - 4, basketY - 5);
      ctx.lineTo(basketX + 4, basketY - 5);
      ctx.lineTo(basketX + 5, basketY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Mangoes inside basket
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(basketX - 1.5, basketY - 5.5, 1.8, 0, Math.PI * 2);
      ctx.arc(basketX + 1.5, basketY - 5.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Tree 2 (Shade Tree, Center Right)
      const tree2X = width * 0.61;
      const tree2GroundY = getGroundY(tree2X, width, height);
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(tree2X, tree2GroundY);
      ctx.lineTo(tree2X - 2, tree2GroundY - 22);
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

      // Cottage (Left)
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
      const houseX = width * 0.38;
      const houseGroundY = getGroundY(houseX, width, height);
      ctx.fillStyle = '#f5f5f4';
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 1.3;
      ctx.fillRect(houseX - 12, houseGroundY - 20, 24, 20);
      ctx.strokeRect(houseX - 12, houseGroundY - 20, 24, 20);
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(houseX - 14, houseGroundY - 26, 28, 6);
      ctx.strokeRect(houseX - 14, houseGroundY - 26, 28, 6);

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

      // 7. MINIATURE SOCCER NET ON THE LEFT
      const mouthGroundY = getGroundY(goal.mouthX, width, height);
      const backGroundY = getGroundY(goal.backX, width, height);
      const crossbarY = mouthGroundY - goal.height;
      const backTopY = backGroundY - (goal.height * 0.78);

      goal.netBulgeVel += -goal.netBulge * 0.12 - goal.netBulgeVel * 0.22;
      goal.netBulge += goal.netBulgeVel;
      const currentBulge = Math.max(0, goal.netBulge);

      // Goal Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, mouthGroundY - 1);
      ctx.lineTo(goal.mouthX, mouthGroundY + 3);
      ctx.stroke();

      // Goal shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.beginPath();
      ctx.ellipse((goal.mouthX + goal.backX) * 0.5, mouthGroundY + 1, (goal.mouthX - goal.backX) * 0.6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Netting Mesh (Drawn behind ball)
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(goal.mouthX, crossbarY);
      ctx.lineTo(goal.backX - currentBulge, backTopY);
      ctx.lineTo(goal.backX - currentBulge, backGroundY);
      ctx.lineTo(goal.mouthX, mouthGroundY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
      ctx.lineWidth = 0.85;
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

      // Back frame
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

      // 8. CONTINUOUS SOCCER ENGINE & BALL RESCUE
      const ballGroundY = getGroundY(ball.x, width, height) - ball.radius;
      const slopeDelta = (getGroundY(ball.x + 2, width, height) - getGroundY(ball.x - 2, width, height)) / 4;
      const slopeAngle = Math.atan(slopeDelta);

      // Track ball stagnation to ensure it NEVER stops
      if (!ball.inNet) {
        if (Math.abs(ball.vx) < 0.35) {
          ball.idleFrames++;
        } else {
          ball.idleFrames = 0;
        }

        // Auto-rescue: if ball slows down on the right or anywhere, soccer player kicks it back into play!
        if (ball.idleFrames > 30) {
          const rescuer = ball.x > width * 0.3 ? children[2] : children[0];
          ball.vx = ball.x > goal.mouthX + 40 ? -4.5 : 4.0;
          ball.vy = -3.0;
          ball.idleFrames = 0;
          rescuer.kickCooldown = 40;
        }
      }

      // GOAL DETECTION
      const isInsideGoalMouth =
        ball.x <= goal.mouthX + 3 &&
        ball.x >= goal.backX - 8 &&
        ball.y >= crossbarY - 3 &&
        ball.y <= mouthGroundY + 4;

      if (isInsideGoalMouth && !ball.inNet && goalTimer === 0) {
        ball.inNet = true;
        goalTimer = 165;
        scorerId = ball.lastKickerId || 1;
        goal.netBulge = Math.min(13, Math.abs(ball.vx) * 2.2 + 4);
        goal.netBulgeVel = -goal.netBulge * 0.2;
        ball.vx *= 0.2;
        ball.vy = Math.min(ball.vy * 0.2, 0.5);

        for (let i = 0; i < 16; i++) {
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

      if (ball.inNet) {
        ball.vy += 0.2;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= 0.85;

        if (ball.y >= ballGroundY) {
          ball.y = ballGroundY;
          ball.vy = -ball.vy * 0.25;
          if (Math.abs(ball.vy) < 0.2) ball.vy = 0;
        }
        if (ball.x < goal.backX + ball.radius) {
          ball.x = goal.backX + ball.radius;
          ball.vx = Math.abs(ball.vx) * 0.3;
        }

        if (goalTimer > 0) {
          goalTimer--;
          if (goalTimer === 1) {
            // ENERGETIC MIDFIELD KICKOFF: never stops!
            ball.inNet = false;
            scorerId = null;
            ball.x = width * 0.40;
            ball.y = getGroundY(ball.x, width, height) - 20;
            ball.vx = 4.2 + Math.random() * 1.2; // passes energetic ball to center
            ball.vy = -3.2;
            ball.lastKickerId = 3;
          }
        }
      } else {
        const onGround = ball.y >= ballGroundY - 0.8;

        if (onGround) {
          ball.y = ballGroundY;
          ball.vx += Math.sin(slopeAngle) * 0.22;
          ball.vx *= 0.988; // smooth natural turf roll
          ball.rotSpeed = ball.vx / ball.radius;
          ball.rotation += ball.rotSpeed;

          if (Math.abs(ball.vy) < 0.5) {
            ball.vy = 0;
          } else {
            ball.vy = -ball.vy * ball.bounciness;
          }
        } else {
          ball.vy += 0.24;
          ball.vx *= 0.996;
          ball.vy *= 0.996;
          ball.rotation += ball.rotSpeed;

          if (ball.y >= ballGroundY) {
            ball.y = ballGroundY;
            ball.vy = -ball.vy * ball.bounciness;
            ball.rotSpeed = ball.vx * 0.16;
          }
        }

        ball.x += ball.vx;
        ball.y += ball.vy;

        // RIGHT BOUNDARY INTERCEPTION: energetic rebound back into play
        if (ball.x >= width - ball.radius - 8) {
          ball.x = width - ball.radius - 8;
          ball.vx = -(Math.abs(ball.vx) * 0.8 + 2.5);
        }
        if (ball.x <= ball.radius + 6) {
          ball.x = ball.radius + 6;
          ball.vx = Math.abs(ball.vx) * 0.8 + 2.5;
        }
      }

      // Ball Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.ellipse(ball.x, ballGroundY + 2.5, ball.radius * 1.15, ball.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Render Soccer Ball (Classic Geometric 32-Panel Texture)
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(ball.rotation);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.1;
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
      ctx.lineWidth = 0.8;
      for (let p = 0; p < 5; p++) {
        const pAngle = (p * Math.PI * 2) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(pAngle) * pentaRadius, Math.sin(pAngle) * pentaRadius);
        ctx.lineTo(Math.cos(pAngle) * ball.radius, Math.sin(pAngle) * ball.radius);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(-ball.radius * 0.35, -ball.radius * 0.35, ball.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Front Goal Post & Crossbar (Drawn in front of ball for 3D depth)
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

      // 10. UPDATE FALLING MANGO & SLINGSHOT PEBBLE
      // Slingshot pebble flight
      if (mangoTree.slingshotPebble.active) {
        const pb = mangoTree.slingshotPebble;
        pb.x += pb.vx;
        pb.y += pb.vy;
        pb.vy += 0.15; // arc

        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(pb.x, pb.y, 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Check if pebble hit mango tree canopy
        if (pb.y <= tree1GroundY - 26) {
          pb.active = false;
          // Trigger a mango to fall
          const target = mangoTree.mangoes.find((m) => m.id === pb.targetMangoId);
          if (target && !target.isFalling) {
            target.isFalling = true;
            target.curY = tree1GroundY + target.relY;
            target.vy = 0.2;
          }
        }
      }

      // Falling mango physics
      mangoTree.mangoes.forEach((m) => {
        if (m.isFalling) {
          m.vy += 0.22; // gravity
          m.curY += m.vy;

          // Catch or land in basket
          if (m.curY >= tree1GroundY - 4) {
            m.isFalling = false;
            m.curY = tree1GroundY + m.relY;
            mangoTree.basketMangoCount++;

            // Golden sparkle particles upon catch
            for (let sp = 0; sp < 4; sp++) {
              celebrationParticles.push({
                x: tree1X + m.relX,
                y: tree1GroundY - 6,
                vx: (Math.random() - 0.5) * 1.5,
                vy: -1 - Math.random() * 1.5,
                size: 1.6,
                color: '#f59e0b',
                life: 0.8,
              });
            }
          }
        }
      });

      // 11. AUTONOMOUS ACTIVITIES & SIDE-PROFILE RENDERING FOR EACH CHILD
      children.forEach((c) => {
        const groundY = getGroundY(c.curX, width, height);
        const isScorerCelebrating = scorerId === c.id && goalTimer > 0;

        if (c.kickCooldown > 0) c.kickCooldown--;

        // ==========================================
        // A) SPECIFIC ACTIVITY LOGIC FOR EACH CHILD
        // ==========================================
        switch (c.activity) {
          case 'soccer-striker': {
            if (isScorerCelebrating) {
              c.yOffset = -Math.abs(Math.sin(tick * 0.22)) * 5.5;
              c.runCycle = 0;
            } else {
              const targetX = Math.max(goal.mouthX + 16, Math.min(width * 0.32, ball.x + (ball.vx > 0 ? 12 : -6)));
              const dx = targetX - c.curX;

              if (c.kickPhase === 'idle') {
                if (Math.abs(dx) > 3) {
                  c.curX += Math.sign(dx) * 0.95;
                  c.facing = Math.sign(dx) as 1 | -1;
                  c.runCycle += 0.26;
                } else {
                  c.runCycle = 0;
                  c.facing = -1;
                }

                const distToBall = Math.hypot(ball.x - c.curX, ball.y - groundY);
                if (distToBall < 18 && c.kickCooldown === 0 && !ball.inNet) {
                  triggerPlayerKick(c, -1);
                }
              }
            }
            break;
          }

          case 'slingshot-hunter': {
            c.curX = tree1X + 16;
            c.facing = -1;
            c.slingshotTimer++;

            if (c.slingshotTimer > 180) {
              c.slingshotTimer = 0;
              mangoTree.slingshotPebble = {
                active: true,
                x: c.curX - 6,
                y: groundY - 18,
                vx: -1.2,
                vy: -3.8,
                targetMangoId: 1,
              };
            }
            break;
          }

          case 'soccer-midfield': {
            if (goalTimer > 0) {
              c.facing = -1;
              c.yOffset = -Math.abs(Math.sin(tick * 0.16 + c.id)) * 2.5;
            } else {
              const targetX = Math.max(width * 0.28, Math.min(width * 0.75, ball.x + (ball.vx > 0 ? 14 : 4)));
              const dx = targetX - c.curX;

              if (c.kickPhase === 'idle') {
                if (Math.abs(dx) > 3) {
                  c.curX += Math.sign(dx) * 1.05;
                  c.facing = Math.sign(dx) as 1 | -1;
                  c.runCycle += 0.26;
                } else {
                  c.runCycle = 0;
                  c.facing = -1;
                }

                const distToBall = Math.hypot(ball.x - c.curX, ball.y - groundY);
                if (distToBall < 20 && c.kickCooldown === 0 && !ball.inNet) {
                  triggerPlayerKick(c, -1);
                }
              }
            }
            break;
          }

          case 'butterfly-catcher': {
            const targetBf = butterflies[1];
            const targetX = Math.max(width * 0.48, Math.min(width * 0.65, targetBf.x));
            const dx = targetX - c.curX;

            if (Math.abs(dx) > 2) {
              c.curX += Math.sign(dx) * 0.75;
              c.facing = Math.sign(dx) as 1 | -1;
              c.runCycle += 0.2;
            } else {
              c.runCycle = 0;
            }
            break;
          }

          case 'bicycle-rider': {
            const minBikeX = width * 0.65;
            const maxBikeX = width * 0.82;
            c.curX += c.facing * 0.85;
            c.bikeDistance += 0.85;
            c.runCycle += 0.18;

            if (c.curX >= maxBikeX) {
              c.curX = maxBikeX;
              c.facing = -1;
            } else if (c.curX <= minBikeX) {
              c.curX = minBikeX;
              c.facing = 1;
            }
            break;
          }

          case 'kite-flyer': {
            c.curX = width * c.baseRatioX;
            c.facing = -1;
            c.yOffset = -Math.sin(tick * 0.08) * 1.5;
            break;
          }

          case 'cheerer': {
            c.curX = width * c.baseRatioX;
            c.facing = -1;
            c.yOffset = -Math.abs(Math.sin(tick * 0.15)) * 2.5;
            break;
          }
        }

        // KICKING STATE MACHINE
        if (c.kickPhase === 'windup') {
          c.kickProgress += 0.22;
          c.kickLegAngle = -0.75 * Math.sin(c.kickProgress * Math.PI * 0.5);
          if (c.kickProgress >= 1) {
            c.kickPhase = 'strike';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'strike') {
          c.kickProgress += 0.32;
          c.kickLegAngle = 0.85 * Math.sin(c.kickProgress * Math.PI * 0.5);

          if (c.kickProgress >= 0.5 && c.kickCooldown >= 65) {
            c.kickCooldown = 60;
            ball.lastKickerId = c.id;

            if (c.activity === 'soccer-striker') {
              const distToGoal = ball.x - goal.mouthX;
              const power = Math.max(4.6, Math.min(6.5, distToGoal * 0.09 + 4.2));
              ball.vx = -power;
              ball.vy = -2.8 - Math.random() * 2.0;
              ball.rotSpeed = -0.35;
            } else if (c.activity === 'soccer-midfield') {
              const power = 5.4 + Math.random() * 1.5;
              ball.vx = -power;
              ball.vy = -3.4 - Math.random() * 1.6;
              ball.rotSpeed = -0.3;
            }

            for (let k = 0; k < 4; k++) {
              c.particles.push({
                x: c.curX + c.facing * 8,
                y: groundY - 2,
                vx: c.facing * (1 + Math.random() * 2),
                vy: -1 - Math.random() * 1.2,
                life: 0.6,
                color: '#65a30d',
              });
            }
          }

          if (c.kickProgress >= 1) {
            c.kickPhase = 'followthrough';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'followthrough') {
          c.kickProgress += 0.16;
          c.kickLegAngle = 0.85 * (1 - c.kickProgress);
          if (c.kickProgress >= 1) {
            c.kickPhase = 'idle';
            c.kickLegAngle = 0;
          }
        }

        // Draw shadow
        ctx.fillStyle = 'rgba(30, 41, 59, 0.2)';
        ctx.beginPath();
        if (c.activity === 'bicycle-rider') {
          ctx.ellipse(c.curX, groundY + 1, 14, 3, 0, 0, Math.PI * 2);
        } else {
          ctx.ellipse(c.curX, groundY + 1, 9, 2.6, 0, 0, Math.PI * 2);
        }
        ctx.fill();

        // =======================================================
        // B) DRAWING CHILD IN TRUE DYNAMIC SIDE-PROFILE POSTURE
        // =======================================================
        ctx.save();
        ctx.translate(c.curX, groundY + c.yOffset);

        const headY = -27;
        const headRadius = 5.5;
        const bodyY = -17;
        const waistY = -9;

        // 1) SPECIAL VEHICLE: BICYCLE
        if (c.activity === 'bicycle-rider') {
          const wheelRadius = 5.0;
          const wheelSpan = 10;
          const rearHubX = -c.facing * wheelSpan;
          const frontHubX = c.facing * wheelSpan;
          const hubY = -wheelRadius;

          // Wheels with spokes
          [rearHubX, frontHubX].forEach((hx) => {
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.3;
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

          // Red Bicycle Frame
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          const crankX = 0;
          const crankY = hubY;
          const seatPostX = -c.facing * 3;
          const seatPostY = bodyY + 3;
          const handlePostX = c.facing * 6;
          const handlePostY = bodyY - 1;

          ctx.beginPath();
          ctx.moveTo(rearHubX, hubY);
          ctx.lineTo(seatPostX, seatPostY);
          ctx.lineTo(crankX, crankY);
          ctx.lineTo(rearHubX, hubY);
          ctx.lineTo(crankX, crankY);
          ctx.lineTo(handlePostX, handlePostY);
          ctx.lineTo(seatPostX, seatPostY);
          ctx.moveTo(handlePostX, handlePostY);
          ctx.lineTo(frontHubX, hubY);
          ctx.stroke();

          // Handlebars
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(handlePostX, handlePostY);
          ctx.lineTo(handlePostX + c.facing * 2, handlePostY - 4);
          ctx.stroke();

          // Seat
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.ellipse(seatPostX, seatPostY - 1, 3.2, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();

          // Pedaling Legs in Side Profile
          const pedalAngle = c.runCycle * 2;
          const pedalR = 3.5;
          const pedalFootX = crankX + Math.cos(pedalAngle) * pedalR;
          const pedalFootY = crankY + Math.sin(pedalAngle) * pedalR;

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(seatPostX, waistY);
          ctx.lineTo(pedalFootX, pedalFootY);
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(pedalFootX, pedalFootY, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 2) STANDARD LEGS IN SIDE PROFILE
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.8;
          ctx.lineCap = 'round';

          if (c.kickPhase !== 'idle') {
            const plantLegX = -c.facing * 2.5;
            ctx.beginPath();
            ctx.moveTo(plantLegX, waistY);
            ctx.lineTo(plantLegX, 0);
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(plantLegX, 0, 1.8, 0, Math.PI * 2);
            ctx.fill();

            const kickHipX = c.facing * 2.2;
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
          } else {
            const stride = Math.sin(c.runCycle) * 4;
            ctx.beginPath();
            ctx.moveTo(-c.facing * 1.5, waistY);
            ctx.lineTo(-c.facing * 1.5 - c.facing * stride, 0);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(c.facing * 1.5, waistY);
            ctx.lineTo(c.facing * 1.5 + c.facing * stride, 0);
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(-c.facing * 1.5 - c.facing * stride, 0, 1.8, 0, Math.PI * 2);
            ctx.arc(c.facing * 1.5 + c.facing * stride, 0, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 3) TORSO & CLOTHES IN SIDE PROFILE
        if (c.hasDress) {
          ctx.fillStyle = c.shirtColor;
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(c.facing * 2, bodyY);
          ctx.lineTo(-c.facing * 6, waistY + 1);
          ctx.lineTo(c.facing * 6, waistY + 1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = c.pantsColor;
          ctx.fillRect(-3.5, waistY - 1.5, 7, 5);
          ctx.fillStyle = c.shirtColor;
          ctx.fillRect(-4, bodyY, 8, 9);
        }

        // 4) ARMS & UNIQUE ACTIVITY PROPS
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';

        if (isScorerCelebrating) {
          const celebrateWiggle = Math.sin(tick * 0.25) * 2;
          ctx.beginPath();
          ctx.moveTo(-3, bodyY + 3);
          ctx.lineTo(-9 + celebrateWiggle, bodyY - 11);
          ctx.moveTo(3, bodyY + 3);
          ctx.lineTo(9 - celebrateWiggle, bodyY - 11);
          ctx.stroke();
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
          ctx.moveTo(handX + c.facing * 3, handY - 4);
          ctx.lineTo(handX + c.facing * 1, handY - 8);
          ctx.moveTo(handX + c.facing * 3, handY - 4);
          ctx.lineTo(handX + c.facing * 5, handY - 7);
          ctx.stroke();

          const pullAmount = 3 + Math.sin(c.slingshotTimer * 0.1) * 2.5;
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
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(-c.facing * 2, bodyY + 3);
          ctx.lineTo(pullHandX, pullHandY);
          ctx.stroke();
        } else if (c.activity === 'butterfly-catcher') {
          const netPoleLen = 14;
          const netHandX = c.facing * 6;
          const netHandY = bodyY + 1;

          ctx.beginPath();
          ctx.moveTo(0, bodyY + 3);
          ctx.lineTo(netHandX, netHandY);
          ctx.stroke();

          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 1.2;
          const poleTipX = netHandX + c.facing * netPoleLen;
          const poleTipY = netHandY - 10;
          ctx.beginPath();
          ctx.moveTo(netHandX - c.facing * 2, netHandY + 4);
          ctx.lineTo(poleTipX, poleTipY);
          ctx.stroke();

          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.ellipse(poleTipX + c.facing * 3, poleTipY - 2, 4.5, 3, 0.4, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.beginPath();
          ctx.moveTo(poleTipX, poleTipY);
          ctx.lineTo(poleTipX - c.facing * 6, poleTipY - 8);
          ctx.lineTo(poleTipX + c.facing * 6, poleTipY - 4);
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

          const kiteX = c.curX - 42;
          const kiteY = 22 + Math.sin(tick * 0.05) * 3;

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(0, bodyY - 3);
          ctx.quadraticCurveTo(c.facing * 10 - 20, bodyY - 25, kiteX - c.curX, kiteY - (groundY + c.yOffset));
          ctx.stroke();

          ctx.save();
          ctx.translate(kiteX - c.curX, kiteY - (groundY + c.yOffset));
          ctx.rotate(0.15 + Math.sin(tick * 0.06) * 0.1);

          const kw = 7;
          const kh = 10;
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
          ctx.lineWidth = 0.8;
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
            const tx = Math.sin(tick * 0.15 + t) * 3;
            const ty = kh + t * 4;
            ctx.lineTo(tx, ty);
          }
          ctx.stroke();
          ctx.restore();
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

        // 5) HEAD & PROFILE FACE
        ctx.fillStyle = c.skinColor;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const eyeX = c.facing * 2.4;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(eyeX, headY - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(c.facing * 1.5, headY + 1, 2.0, 0, Math.PI * 0.75);
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
        ctx.beginPath();
        ctx.arc(c.facing * 1.2, headY + 1.2, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // 6) HAIR STYLES IN SIDE PROFILE
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
          ctx.quadraticCurveTo(-c.facing * (headRadius + 5), headY + 2, -c.facing * (headRadius + 4), headY + 7);
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
          ctx.arc(0, headY - 2, headRadius + 0.8, Math.PI * 1, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(c.facing > 0 ? 0 : -headRadius - 3, headY - 3, headRadius + 3, 2);
        } else if (c.hairStyle === 'orange-pigtails') {
          ctx.beginPath();
          ctx.arc(0, headY - 1.5, headRadius + 0.5, Math.PI * 0.9, Math.PI * 2.1);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-c.facing * headRadius, headY);
          ctx.lineTo(-c.facing * (headRadius + 4), headY + 4);
          ctx.stroke();
        } else if (c.hairStyle === 'curly-brown') {
          for (let cp = -2; cp <= 2; cp++) {
            ctx.beginPath();
            ctx.arc(cp * 2.4, headY - 5, 2.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 7) "GOAL! ⚽" SPEECH BUBBLE OVER SCORER'S HEAD
        if (isScorerCelebrating) {
          const bubbleAnim = Math.min(1, (165 - goalTimer) / 12);
          const bounce = 1 + Math.sin(tick * 0.2) * 0.08;

          ctx.save();
          ctx.translate(0, headY - 22);
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

          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          drawBubbleRect(-bw / 2 + 1, -bh / 2 + 1);
          ctx.fill();

          const bGrad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
          bGrad.addColorStop(0, '#ffffff');
          bGrad.addColorStop(1, '#ecfdf5');
          ctx.fillStyle = bGrad;
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1.4;
          drawBubbleRect(-bw / 2, -bh / 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ecfdf5';
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(-3, bh / 2 - 0.5);
          ctx.lineTo(0, bh / 2 + 5);
          ctx.lineTo(4, bh / 2 - 0.5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ecfdf5';
          ctx.beginPath();
          ctx.fillRect(-2, bh / 2 - 2, 5, 2.5);

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

      // 12. CELEBRATION CONFETTI PARTICLES
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
