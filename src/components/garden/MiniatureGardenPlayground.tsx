'use client';

import React, { useRef, useEffect } from 'react';

/**
 * MiniatureGardenPlayground
 * Compact physics-based live miniature garden where:
 * 1. The soccer ball NEVER moves without being physically struck by a player's foot.
 * 2. Intelligent Soccer AI: Striker & Midfielder calculate intercepts, run directly to the ball,
 *    position themselves behind the ball relative to their target, wind up, and strike with physical foot contact!
 * 3. After a goal, the striker jogs into the net, retrieves the ball, and kicks it out to midfield for kickoff.
 * 4. Rich side-profile autonomous children:
 *    - Slingshot Mango Hunter: aims Y-slingshot at the tree, drops ripe mangoes into a wicker basket.
 *    - Butterfly Catcher: holds a bamboo net, playfully chasing butterflies across the meadow.
 *    - Bicycle Rider: rides a miniature bicycle across the path with rotating wheels & pedaling legs.
 *    - Kite Flyer: holds string reel as a colorful diamond kite flutters in the breeze.
 *    - Sideline Cheerer: celebrates goals and cheers on players.
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

    // Rolling hill elevation formula
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
    let goalState: 'play' | 'celebrating' = 'play';
    let passCount = 0;
    let goalTimer = 0;       // frames countdown during celebration (~140 frames)
    let goalCooldown = 0;    // cooldown before another goal can register
    let scorerId: number | null = null;
    let kickoffTimer = 0;

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

    // Interactive Soccer Ball - ONLY MOVES WHEN PHYSICALLY KICKED
    const ball = {
      x: 0,
      y: 0,
      vx: 0, // Starts completely motionless at midfield!
      vy: 0,
      radius: 5.2,
      rotation: 0,
      rotSpeed: 0,
      bounciness: 0.52,
      lastKickerId: 3,
      inNet: false,
      initialized: false,
      stillFrames: 0,
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

    // Playing Children definitions with Intelligent AI & Side-Profiles
    interface PlayingChild {
      id: number;
      baseRatioX: number;
      curX: number;
      yOffset: number;
      vy: number;
      activity: 'soccer-striker' | 'slingshot-hunter' | 'soccer-midfield' | 'soccer-passer' | 'soccer-goalie' | 'butterfly-catcher' | 'bicycle-rider' | 'kite-flyer' | 'cheerer';
      facing: 1 | -1; // 1 = right, -1 = left (profile view)
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
      slingshotTimer: number;
      // Bicycle rider state
      bikeDistance: number;
      // Kicking animation state machine
      kickPhase: 'idle' | 'windup' | 'strike' | 'followthrough';
      kickProgress: number;
      kickLegAngle: number;
      kickHasContacted?: boolean;
      // Intelligent Soccer AI State
      soccerIntent: 'support' | 'hunt-ball' | 'position-for-shot' | 'kick' | 'retrieve';
      particles: Array<{ x: number; y: number; vy: number; vx: number; life: number; color: string }>;
    }

    const children: PlayingChild[] = [
      // 1) Goalkeeper (Child 8)
      {
        id: 8,
        baseRatioX: 0.08,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'soccer-goalie',
        facing: 1,
        hairColor: '#1e293b',
        hairStyle: 'beanie',
        shirtColor: '#22c55e', // Vibrant lime green goalkeeper jersey
        pantsColor: '#0f172a',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'support',
        particles: [],
      },
      // 2) Player 1: Winger / Striker (Child 1 - Sky Blue)
      {
        id: 1,
        baseRatioX: 0.20,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'soccer-striker',
        facing: 1,
        hairColor: '#b45309',
        hairStyle: 'short-brown',
        shirtColor: '#0284c7', // Sky Blue jersey #9
        pantsColor: '#1e293b',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'hunt-ball',
        particles: [],
      },
      // 3) Slingshot Mango Hunter (Child 2)
      {
        id: 2,
        baseRatioX: 0.27,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'slingshot-hunter',
        facing: -1,
        hairColor: '#7c2d12',
        hairStyle: 'beanie',
        shirtColor: '#ea580c',
        pantsColor: '#15803d',
        skinColor: '#fef3c7',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'support',
        particles: [],
      },
      // 4) Player 2: Central Midfield Playmaker (Child 3 - Golden Yellow)
      {
        id: 3,
        baseRatioX: 0.35,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'soccer-midfield',
        facing: 1,
        hairColor: '#334155',
        hairStyle: 'spiky-black',
        shirtColor: '#f59e0b', // Golden yellow jersey #10
        pantsColor: '#1e3a8a',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'support',
        particles: [],
      },
      // 5) Player 3: Attacking Striker / Passer (Child 9 - Crimson Red) - NEW PERSON!
      {
        id: 9,
        baseRatioX: 0.48,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'soccer-passer',
        facing: -1,
        hairColor: '#451a03',
        hairStyle: 'curly-brown',
        shirtColor: '#ef4444', // Crimson red jersey #7
        pantsColor: '#0f172a',
        skinColor: '#fef3c7',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'support',
        particles: [],
      },
      // 6) Butterfly Catcher (Child 4)
      {
        id: 4,
        baseRatioX: 0.58,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'butterfly-catcher',
        facing: 1,
        hairColor: '#facc15',
        hairStyle: 'blonde-bob',
        shirtColor: '#ec4899',
        pantsColor: '#ec4899',
        skinColor: '#fef3c7',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'support',
        particles: [],
      },
      // 7) Bicycle Rider (Child 5)
      {
        id: 5,
        baseRatioX: 0.72,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'bicycle-rider',
        facing: 1,
        hairColor: '#ea580c',
        hairStyle: 'ponytail-red',
        shirtColor: '#10b981',
        pantsColor: '#047857',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'support',
        particles: [],
      },
      // 8) Kite Flyer (Child 6)
      {
        id: 6,
        baseRatioX: 0.85,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'kite-flyer',
        facing: -1,
        hairColor: '#d97706',
        hairStyle: 'orange-pigtails',
        shirtColor: '#6366f1',
        pantsColor: '#6366f1',
        skinColor: '#fef3c7',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'support',
        particles: [],
      },
      // 9) Sideline Cheerer (Child 7)
      {
        id: 7,
        baseRatioX: 0.94,
        curX: 0,
        yOffset: 0,
        vy: 0,
        activity: 'cheerer',
        facing: -1,
        hairColor: '#451a03',
        hairStyle: 'curly-brown',
        shirtColor: '#f43f5e',
        pantsColor: '#f43f5e',
        skinColor: '#fde047',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        slingshotTimer: 0,
        bikeDistance: 0,
        kickPhase: 'idle',
        kickProgress: 0,
        kickLegAngle: 0,
        soccerIntent: 'support',
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

      // Initialize ball at midfield sitting motionless on the grass
      if (!ball.initialized) {
        ball.x = width * 0.22;
        ball.y = getGroundY(ball.x, width, height) - ball.radius;
        ball.vx = 0;
        ball.vy = 0;
        ball.initialized = true;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };

    // When the user clicks, only kick if clicking near the ball or child
    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Click near ball kicks it
      const distToBall = Math.hypot(clickX - ball.x, clickY - ball.y);
      if (distToBall < 30 && !ball.inNet) {
        ball.vx = (clickX > ball.x ? -1 : 1) * (3.8 + Math.random() * 2);
        ball.vy = -3.8;
        ball.rotSpeed = ball.vx * 0.16;
      }

      // Nearby child gives a gentle hop
      children.forEach((c) => {
        if (Math.abs(clickX - c.curX) < 30 && c.yOffset === 0 && c.kickPhase === 'idle') {
          c.vy = -3.8;
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
        const clickY = e.touches[0].clientY - rect.top;
        const distToBall = Math.hypot(clickX - ball.x, clickY - ball.y);
        if (distToBall < 30 && !ball.inNet) {
          ball.vx = (clickX > ball.x ? -1 : 1) * (3.8 + Math.random() * 2);
          ball.vy = -3.8;
          ball.rotSpeed = ball.vx * 0.16;
        }
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });

    let tick = 0;

    // Helper to start kick animation for a player ONLY when physically at the ball
    const triggerPlayerKick = (c: PlayingChild, kickDirection: -1 | 1) => {
      c.kickPhase = 'windup';
      c.kickProgress = 0;
      c.facing = kickDirection;
      c.kickLegAngle = 0;
      c.kickCooldown = 65;
      c.kickHasContacted = false;
    };

    // MAIN ANIMATION / PLAY PHYSICS LOOP
    const render = () => {
      tick++;

      mouse.x += (mouse.targetX - mouse.x) * 0.15;
      mouse.y += (mouse.targetY - mouse.y) * 0.15;

      ctx.clearRect(0, 0, width, height);

      // 1. SKY BACKGROUND
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

      // 5. SCENERY BACKGROUND (Lush Mango Tree, Cottage, House, School)
      // TREE 1: MANGO TREE with Ripe Golden Mangoes
      const tree1X = width * mangoTree.xRatio;
      const tree1GroundY = getGroundY(tree1X, width, height);

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tree1X, tree1GroundY);
      ctx.lineTo(tree1X - 2, tree1GroundY - 25);
      ctx.stroke();

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

      // Golden Mangoes hanging in tree
      mangoTree.mangoes.forEach((m) => {
        const mx = tree1X + m.relX;
        const my = m.isFalling ? m.curY : tree1GroundY + m.relY;

        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(mx, my - 3.5);
        ctx.lineTo(mx + 0.8, my - 1.5);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(mx, my, 2.6, 3.6, 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.beginPath();
        ctx.arc(mx + 0.8, my - 0.8, 1.3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Fruit Basket on ground
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

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(basketX - 1.5, basketY - 5.5, 1.8, 0, Math.PI * 2);
      ctx.arc(basketX + 1.5, basketY - 5.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Tree 2 (Shade Tree)
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

      // School Building with Flag
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

      // 8. PURE REALISTIC BALL PHYSICS & IMMERSIVE SOCCER RETRIEVAL
      const ballGroundY = getGroundY(ball.x, width, height) - ball.radius;
      const slopeDelta = (getGroundY(ball.x + 2, width, height) - getGroundY(ball.x - 2, width, height)) / 4;
      const slopeAngle = Math.atan(slopeDelta);

      if (goalCooldown > 0) goalCooldown--;

      // Goal detection - ball entering goal mouth
      const isInsideGoalMouth =
        ball.x <= goal.mouthX + 2 &&
        ball.x >= goal.backX - 4 &&
        ball.y >= crossbarY - 4 &&
        ball.y <= mouthGroundY + 5;

      if (isInsideGoalMouth && !ball.inNet && goalState === 'play' && goalTimer === 0 && ball.vx <= 0.1) {
        ball.inNet = true;
        goalState = 'celebrating';
        goalTimer = 180;
        scorerId = ball.lastKickerId || 1;
        goal.netBulge = Math.min(14, Math.abs(ball.vx) * 2.2 + 6);
        goal.netBulgeVel = -goal.netBulge * 0.25;
        ball.vx *= 0.1;
        ball.vy = Math.min(ball.vy * 0.2, 0.4);

        for (let i = 0; i < 20; i++) {
          celebrationParticles.push({
            x: goal.mouthX + (Math.random() - 0.5) * 16,
            y: crossbarY + Math.random() * goal.height,
            vx: (Math.random() - 0.5) * 3.5,
            vy: -1.8 - Math.random() * 3.0,
            size: 2 + Math.random() * 2.2,
            color: ['#10b981', '#f59e0b', '#ec4899', '#38bdf8', '#fbbf24', '#ffffff'][Math.floor(Math.random() * 6)],
            life: 1,
          });
        }
      }

      if (ball.inNet) {
        // Settling inside net: strictly keep ball within goal net
        ball.vy += 0.22;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= 0.75;

        if (ball.y >= ballGroundY) {
          ball.y = ballGroundY;
          ball.vy = 0;
          ball.vx = 0;
        }
        // Strict boundary: ball can NEVER be behind the net
        if (ball.x < goal.backX + ball.radius + 4) {
          ball.x = goal.backX + ball.radius + 4;
          ball.vx = 0;
        }
        if (ball.x > goal.mouthX - 3 && goalTimer > 60) {
          ball.x = goal.mouthX - 3;
          ball.vx = 0;
        }

        // Post-goal Goalkeeper Retrieval & Clearance:
        // Goalkeeper walks into the net, scoops the ball, walks to 6-yard line, and passes it out!
        if (goalTimer > 0) {
          goalTimer--;
          const goalie = children.find(c => c.activity === 'soccer-goalie');

          if (goalie) {
            if (goalTimer > 120) {
              // 1) Goalie turns towards net and jogs in to retrieve the ball
              goalie.facing = -1;
              const targetX = ball.x + 5;
              const gdx = targetX - goalie.curX;
              if (Math.abs(gdx) > 1.5) {
                goalie.curX += Math.sign(gdx) * 1.0;
                goalie.runCycle += 0.24;
              } else {
                goalie.runCycle = 0;
              }
            } else if (goalTimer > 50) {
              // 2) Goalie scoops up the ball and jogs back out facing the pitch!
              goalie.facing = 1;
              const targetX = goal.mouthX + 8;
              const gdx = targetX - goalie.curX;
              if (Math.abs(gdx) > 1.5) {
                goalie.curX += Math.sign(gdx) * 0.95;
                goalie.runCycle += 0.22;
              } else {
                goalie.runCycle = 0;
              }
              // Ball is carried in goalie's hands
              ball.x = goalie.curX + goalie.facing * 3;
              ball.y = getGroundY(goalie.curX, width, height) - 10;
              ball.vx = 0;
              ball.vy = 0;
            } else if (goalTimer > 15) {
              // 3) Goalie places ball down on the turf at 6-yard mark and sets up for goal kick
              ball.x = goal.mouthX + 10;
              ball.y = getGroundY(ball.x, width, height) - ball.radius;
              goalie.curX = ball.x - 6;
              goalie.facing = 1;
              goalie.runCycle = 0;
            } else if (goalTimer === 15) {
              // 4) Goalie kicks the ball out to Player 1 (the same person)!
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
        // NATURAL BALL PHYSICS
        const onGround = ball.y >= ballGroundY - 0.8;

        if (onGround) {
          ball.y = ballGroundY;

          // Slope gravity force
          const slopeForce = Math.sin(slopeAngle) * 0.16;
          ball.vx += slopeForce;

          // Realistic grass rolling friction
          ball.vx *= 0.982;

          // Ball comes to a complete halt when slow
          if (Math.abs(ball.vx) < 0.12 && Math.abs(slopeForce) < 0.08) {
            ball.vx = 0;
            ball.rotSpeed = 0;
          } else {
            ball.rotSpeed = ball.vx / ball.radius;
            ball.rotation += ball.rotSpeed;
          }

          if (Math.abs(ball.vy) < 0.4) {
            ball.vy = 0;
          } else {
            ball.vy = -ball.vy * ball.bounciness;
          }
        } else {
          // Airborne
          ball.vy += 0.24;
          ball.vx *= 0.995;
          ball.vy *= 0.995;
          ball.rotation += ball.rotSpeed;

          if (ball.y >= ballGroundY) {
            ball.y = ballGroundY;
            ball.vy = -ball.vy * ball.bounciness;
            ball.rotSpeed = ball.vx * 0.16;
          }
        }

        ball.x += ball.vx;
        ball.y += ball.vy;

        // Hard boundary: ball can NEVER penetrate behind the goal net
        if (ball.x < goal.backX + ball.radius + 3) {
          ball.x = goal.backX + ball.radius + 3;
          ball.vx = Math.abs(ball.vx) * 0.4;
        }
        if (ball.x >= width - ball.radius - 8) {
          ball.x = width - ball.radius - 8;
          ball.vx = 0;
        }

        // Motionless watchdog: if the ball sits completely still for > 100 frames in play mode,
        // awaken the closest soccer player and reset their kickCooldown so they play it.
        // If it sits still for > 200 frames, give it a gentle kick towards the field.
        if (goalState === 'play' && !ball.inNet) {
          if (Math.abs(ball.vx) < 0.05 && Math.abs(ball.vy) < 0.05) {
            ball.stillFrames = (ball.stillFrames || 0) + 1;
            if (ball.stillFrames > 100) {
              const outfielders = children.filter(c =>
                c.activity === 'soccer-striker' || c.activity === 'soccer-midfield' || c.activity === 'soccer-passer'
              );
              let closest = outfielders[0];
              let minD = Infinity;
              outfielders.forEach(p => {
                const d = Math.abs(p.curX - ball.x);
                if (d < minD) { minD = d; closest = p; }
              });
              if (closest) {
                closest.kickCooldown = 0;
                closest.soccerIntent = 'hunt-ball';
              }
            }
            if (ball.stillFrames > 200) {
              ball.vx = ball.x < width * 0.35 ? 3.6 : -3.6;
              ball.vy = -2.0;
              ball.stillFrames = 0;
            }
          } else {
            ball.stillFrames = 0;
          }
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
      if (mangoTree.slingshotPebble.active) {
        const pb = mangoTree.slingshotPebble;
        pb.x += pb.vx;
        pb.y += pb.vy;
        pb.vy += 0.15;

        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(pb.x, pb.y, 1.4, 0, Math.PI * 2);
        ctx.fill();

        if (pb.y <= tree1GroundY - 26) {
          pb.active = false;
          const target = mangoTree.mangoes.find((m) => m.id === pb.targetMangoId);
          if (target && !target.isFalling) {
            target.isFalling = true;
            target.curY = tree1GroundY + target.relY;
            target.vy = 0.2;
          }
        }
      }

      mangoTree.mangoes.forEach((m) => {
        if (m.isFalling) {
          m.vy += 0.22;
          m.curY += m.vy;

          if (m.curY >= tree1GroundY - 4) {
            m.isFalling = false;
            m.curY = tree1GroundY + m.relY;
            mangoTree.basketMangoCount++;

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

      // 11. INTELLIGENT SOCCER PLAYER COORDINATION (TIKI-TAKA PASSING & SHOT LOGIC)
      const outfielders = children.filter(c =>
        c.activity === 'soccer-striker' || c.activity === 'soccer-midfield' || c.activity === 'soccer-passer'
      );

      if (goalState === 'play' && !ball.inNet) {
        // Find which outfield player is closest to the ball
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
          if (p === closestPlayer) {
            p.soccerIntent = 'hunt-ball';
          } else {
            p.soccerIntent = 'support';
          }
        });
      }

      // 12. CHILDREN UPDATE & DRAW LOOP
      children.forEach((c) => {
        const groundY = getGroundY(c.curX, width, height);
        const isScorerCelebrating = scorerId === c.id && goalTimer > 0;

        if (c.kickCooldown > 0) c.kickCooldown--;

        // ===============================================
        // OUTFIELD SOCCER PLAYERS (PLAYER 1, 2, 3)
        // ===============================================
        if (c.activity === 'soccer-striker' || c.activity === 'soccer-midfield' || c.activity === 'soccer-passer') {
          if (goalState === 'celebrating') {
            c.yOffset = -Math.abs(Math.sin(tick * 0.22 + c.id)) * 5.5;
            c.runCycle = 0;
            c.facing = 1;
          } else if (goalState === 'play' && c.kickPhase === 'idle') {
            if (c.soccerIntent === 'hunt-ball') {
              // Decide kick direction based on passing sequence
              let kickDir: 1 | -1 = 1;
              if (c.activity === 'soccer-passer') {
                kickDir = -1; // Player 3 is on right flank, always kicks left
              } else if (c.activity === 'soccer-striker') {
                kickDir = passCount < 3 ? 1 : -1; // Player 1 passes right, or shoots left
              } else {
                kickDir = passCount < 3 ? (c.curX < ball.x ? 1 : -1) : -1;
              }

              // Position behind the ball relative to kick direction
              const targetX = kickDir === 1 ? ball.x - 6 : ball.x + 6;
              const dx = targetX - c.curX;

              if (Math.abs(dx) > 2) {
                c.curX += Math.sign(dx) * 1.35;
                c.facing = Math.sign(dx) as 1 | -1;
                c.runCycle += 0.32;
              } else {
                c.facing = kickDir;
                c.runCycle = 0;

                const dist = Math.hypot(c.curX - (kickDir === 1 ? ball.x - 6 : ball.x + 6), groundY - ball.y);
                if (dist < 22 && c.kickCooldown === 0 && !ball.inNet) {
                  triggerPlayerKick(c, kickDir);
                }
              }
            } else {
              // Support position: each player maintains their zone
              const homeX =
                c.activity === 'soccer-striker'
                  ? width * 0.20
                  : c.activity === 'soccer-midfield'
                  ? width * 0.35
                  : width * 0.48;

              // Drift gently towards ball while staying in zone
              const zoneTarget = homeX + (ball.x - homeX) * 0.25;
              const dx = zoneTarget - c.curX;
              if (Math.abs(dx) > 3) {
                c.curX += Math.sign(dx) * 0.75;
                c.facing = Math.sign(dx) as 1 | -1;
                c.runCycle += 0.18;
              } else {
                c.facing = ball.x > c.curX ? 1 : -1; // Watch ball
                c.runCycle = 0;
              }
            }
          }

          // Boundary clamps for each outfield player
          if (c.activity === 'soccer-striker') {
            c.curX = Math.max(goal.mouthX + 16, Math.min(width * 0.32, c.curX));
          } else if (c.activity === 'soccer-midfield') {
            c.curX = Math.max(width * 0.26, Math.min(width * 0.44, c.curX));
          } else if (c.activity === 'soccer-passer') {
            c.curX = Math.max(width * 0.38, Math.min(width * 0.58, c.curX));
          }
        } else if (c.activity === 'soccer-goalie') {
          if (goalState === 'play') {
            const homeX = goal.mouthX + 6;
            const targetX = Math.max(goal.mouthX + 2, Math.min(goal.mouthX + 12, homeX + (ball.x - width * 0.3) * 0.04));
            const dx = targetX - c.curX;
            if (Math.abs(dx) > 1.5) {
              c.curX += Math.sign(dx) * 0.6;
              c.runCycle += 0.16;
            } else {
              c.runCycle = 0;
            }
            c.facing = 1;

            // Incoming shot dive/save jump reaction
            if (ball.vx < -2.0 && ball.x < width * 0.28) {
              c.yOffset = -Math.abs(Math.sin(tick * 0.3)) * 6.0;
            } else {
              c.yOffset = 0;
            }
          }
        }

        // ===============================================
        // OTHER RICH AUTONOMOUS ACTIVITIES (CHILD 2, 4, 5, 6, 7)
        // ===============================================
        if (c.activity === 'slingshot-hunter') {
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
        } else if (c.activity === 'butterfly-catcher') {
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
        } else if (c.activity === 'bicycle-rider') {
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
        } else if (c.activity === 'kite-flyer') {
          c.curX = width * c.baseRatioX;
          c.facing = -1;
          c.yOffset = -Math.sin(tick * 0.08) * 1.5;
        } else if (c.activity === 'cheerer') {
          c.curX = width * c.baseRatioX;
          c.facing = -1;
          c.yOffset = -Math.abs(Math.sin(tick * 0.15)) * 2.5;
        }

        // ===============================================
        // KICKING STATE MACHINE (DELIVERS REAL PHYSICAL IMPACT)
        // ===============================================
        if (c.kickPhase === 'windup') {
          c.kickProgress += 0.20;
          c.kickLegAngle = -0.75 * Math.sin(c.kickProgress * Math.PI * 0.5);
          if (c.kickProgress >= 1) {
            c.kickPhase = 'strike';
            c.kickProgress = 0;
          }
        } else if (c.kickPhase === 'strike') {
          c.kickProgress += 0.28;
          c.kickLegAngle = 0.85 * Math.sin(c.kickProgress * Math.PI * 0.5);

          // EXACT CONTACT POINT: Foot connects with the ball!
          if (c.kickProgress >= 0.40 && !c.kickHasContacted) {
            c.kickHasContacted = true;
            c.kickCooldown = 40;
            ball.lastKickerId = c.id;

            if (c.activity === 'soccer-goalie') {
              // Goalkeeper clearance / goal kick out to Player 1 (the same person)!
              ball.vx = 4.4 + Math.random() * 0.6;
              ball.vy = -2.2;
              ball.rotSpeed = 0.28;
              passCount = 0;
            } else if (c.facing === 1) {
              // Passing rightwards across pitch to teammate!
              ball.vx = 3.6 + Math.random() * 0.8;
              ball.vy = -1.8;
              ball.rotSpeed = 0.22;
              passCount++;
            } else if (c.facing === -1) {
              if (passCount < 3 && ball.x > width * 0.30) {
                // Passing back/leftwards to teammate
                ball.vx = -(3.6 + Math.random() * 0.8);
                ball.vy = -1.8;
                ball.rotSpeed = -0.22;
                passCount++;
              } else {
                // Striker SHOT ON GOAL!
                const distToGoal = ball.x - goal.mouthX;
                const power = Math.max(5.2, Math.min(6.8, distToGoal * 0.08 + 4.2));
                ball.vx = -power;
                ball.vy = -2.5 - Math.random() * 1.5;
                ball.rotSpeed = -0.34;
                passCount = 0;
              }
            }

            // Green turf particles fly upon foot contact
            for (let k = 0; k < 4; k++) {
              c.particles.push({
                x: c.curX + c.facing * 6,
                y: groundY - 1,
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

        // ===============================================
        // DRAWING CHILD IN TRUE SIDE-PROFILE POSTURE
        // ===============================================
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
          // 2) LEGS IN SIDE PROFILE
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

        // 3) TORSO & CLOTHES
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

        // 4) ARMS & PROPS
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';

        if (c.activity === 'soccer-goalie') {
          // Goalkeeper stance: hands forward with bright yellow padded goalie gloves
          const gloveOffset = isScorerCelebrating ? 0 : Math.sin(tick * 0.12) * 1.5;
          const g1X = c.facing * 5;
          const g1Y = bodyY - 1 + gloveOffset;
          const g2X = c.facing * 7;
          const g2Y = bodyY + 3 - gloveOffset;

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(-1, bodyY + 3);
          ctx.lineTo(g1X, g1Y);
          ctx.moveTo(1, bodyY + 3);
          ctx.lineTo(g2X, g2Y);
          ctx.stroke();

          // Bright padded goalie gloves
          ctx.fillStyle = '#facc15';
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 0.8;
          [[g1X, g1Y], [g2X, g2Y]].forEach(([gx, gy]) => {
            ctx.beginPath();
            ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        } else if (isScorerCelebrating) {
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
          const bubbleAnim = Math.min(1, (160 - goalTimer) / 12);
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

      // 13. CELEBRATION CONFETTI PARTICLES
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
