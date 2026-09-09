'use client';

import React, { useRef, useEffect } from 'react';

/**
 * MiniatureGardenPlayground
 * Compact physics-based miniature live garden with children PLAYING
 * (running, passing the soccer ball back and forth, skipping, twirling,
 * chasing butterflies, and cheering) on a rolling green hill.
 * Zero constant frantic jumping, sleek reduced height, no unwanted white spaces,
 * and no hint badges.
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

    // Interactive Soccer / Play Ball
    const ball = {
      x: 180,
      y: 60,
      vx: 2.2,
      vy: 0,
      radius: 5.5,
      rotation: 0,
      rotSpeed: 0.08,
      bounciness: 0.72,
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

    // Playing Children definitions
    interface PlayingChild {
      id: number;
      baseRatioX: number;
      curX: number;
      yOffset: number;
      vy: number;
      // Play behavior & personality
      behavior: 'kicker-left' | 'skipping' | 'chaser-center' | 'butterfly-catcher' | 'runner-right' | 'twirler' | 'cheerer';
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
      particles: Array<{ x: number; y: number; vy: number; vx: number; life: number; color: string }>;
    }

    const children: PlayingChild[] = [
      {
        id: 1,
        baseRatioX: 0.10,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'kicker-left',
        facing: 1,
        hairColor: '#b45309',
        hairStyle: 'short-brown',
        shirtColor: '#38bdf8', // Blue tee
        pantsColor: '#1e293b',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        particles: [],
      },
      {
        id: 2,
        baseRatioX: 0.22,
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
        particles: [],
      },
      {
        id: 3,
        baseRatioX: 0.38,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'chaser-center',
        facing: -1,
        hairColor: '#334155',
        hairStyle: 'spiky-black',
        shirtColor: '#f59e0b', // Yellow shirt
        pantsColor: '#15803d',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
        particles: [],
      },
      {
        id: 4,
        baseRatioX: 0.52,
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
        particles: [],
      },
      {
        id: 5,
        baseRatioX: 0.66,
        curX: 0,
        yOffset: 0,
        vy: 0,
        behavior: 'runner-right',
        facing: -1,
        hairColor: '#7c2d12',
        hairStyle: 'beanie',
        shirtColor: '#84cc16', // Olive green shirt
        pantsColor: '#1e3a8a',
        skinColor: '#fde68a',
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
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
        shirtColor: '#2563eb', // Blue striped dress
        pantsColor: '#2563eb',
        skinColor: '#fef3c7',
        hasDress: true,
        twirlAngle: 0,
        kickCooldown: 0,
        runCycle: 0,
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
        particles: [],
      },
    ];

    // Flower patches
    const flowers = [
      { ratioX: 0.05, color: '#f43f5e', size: 2.8, sway: 0 },
      { ratioX: 0.16, color: '#a855f7', size: 2.5, sway: 1.2 },
      { ratioX: 0.30, color: '#38bdf8', size: 2.8, sway: 2.4 },
      { ratioX: 0.46, color: '#f59e0b', size: 2.5, sway: 0.8 },
      { ratioX: 0.60, color: '#ec4899', size: 3.2, sway: 3.1 },
      { ratioX: 0.75, color: '#f97316', size: 2.8, sway: 1.7 },
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

      // Nudge ball towards click
      ball.vx = (clickX - ball.x) * 0.06;
      ball.vy = -5.5;

      // Nearby child celebrates with playful hop
      children.forEach((c) => {
        if (Math.abs(clickX - c.curX) < 40 && c.yOffset === 0) {
          c.vy = -4.5; // gentle joyful hop
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
        ball.vx = (clickX - ball.x) * 0.06;
        ball.vy = -5.5;
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });

    let tick = 0;

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

      // 7. SOCCER BALL PASSING PHYSICS
      const ballGroundY = getGroundY(ball.x, width, height) - ball.radius;
      ball.vy += 0.28; // Gravity
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.rotation += ball.rotSpeed;

      // Ground bounce
      if (ball.y >= ballGroundY) {
        ball.y = ballGroundY;
        ball.vy = -ball.vy * ball.bounciness;
        const slope = (getGroundY(ball.x + 2, width, height) - getGroundY(ball.x - 2, width, height)) / 4;
        ball.vx += slope * 0.2;
        ball.vx *= 0.99; // rolling friction
        ball.rotSpeed = ball.vx * 0.18;
        if (Math.abs(ball.vy) < 0.4) ball.vy = 0;
      }

      // Boundaries
      if (ball.x <= ball.radius + 10) {
        ball.x = ball.radius + 10;
        ball.vx = Math.abs(ball.vx) * 0.9 + 1;
      } else if (ball.x >= width - ball.radius - 10) {
        ball.x = width - ball.radius - 10;
        ball.vx = -(Math.abs(ball.vx) * 0.9 + 1);
      }

      // Render ball shadow & body
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath();
      ctx.ellipse(ball.x, ballGroundY + 3, ball.radius * 1.1, ball.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(ball.rotation);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 8. BUTTERFLIES
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

      // 9. AUTHENTIC PLAYGROUND BEHAVIORS (RUNNING, PASSING BALL, SKIPPING, DANCING)
      children.forEach((c) => {
        const baseX = c.baseRatioX * width;
        const groundY = getGroundY(c.curX, width, height);

        if (c.kickCooldown > 0) c.kickCooldown--;

        // REAL PLAYGROUND BEHAVIORS:
        switch (c.behavior) {
          case 'kicker-left': {
            // Player 1: Runs towards ball when ball is on left half!
            const targetX = Math.max(baseX - 15, Math.min(baseX + 30, ball.x - 12));
            const dx = targetX - c.curX;
            if (Math.abs(dx) > 2) {
              c.curX += Math.sign(dx) * 0.75;
              c.facing = Math.sign(dx) as 1 | -1;
              c.runCycle += 0.22;
            } else {
              c.runCycle = 0;
            }

            // Kick ball towards center if close
            const distToBall = Math.hypot(ball.x - c.curX, ball.y - groundY);
            if (distToBall < 20 && c.kickCooldown === 0) {
              ball.vx = 3.5 + Math.random() * 1.5; // kick right
              ball.vy = -4.5 - Math.random() * 2;
              c.kickCooldown = 60;
              c.facing = 1;
            }
            break;
          }

          case 'skipping': {
            // Player 2: Joyfully skipping in place
            c.yOffset = -Math.abs(Math.sin(tick * 0.12 + c.id)) * 4;
            c.runCycle += 0.12;
            break;
          }

          case 'chaser-center': {
            // Player 3: Playful receiver / kicker in center
            const targetX = Math.max(baseX - 25, Math.min(baseX + 25, ball.x));
            const dx = targetX - c.curX;
            if (Math.abs(dx) > 3) {
              c.curX += Math.sign(dx) * 0.7;
              c.facing = Math.sign(dx) as 1 | -1;
              c.runCycle += 0.2;
            } else {
              c.runCycle = 0;
            }

            // Kick ball back towards left or right
            const distToBall = Math.hypot(ball.x - c.curX, ball.y - groundY);
            if (distToBall < 20 && c.kickCooldown === 0) {
              ball.vx = ball.x > c.curX ? -3.5 : 3.5;
              ball.vy = -4.5 - Math.random() * 1.5;
              c.kickCooldown = 60;
            }
            break;
          }

          case 'butterfly-catcher': {
            // Player 4: Jogs playfully chasing the nearest butterfly
            const nearestBf = butterflies[1];
            const targetX = Math.max(baseX - 20, Math.min(baseX + 20, nearestBf.x));
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

          case 'runner-right': {
            // Player 5: Running playful tag route
            const route = Math.sin(tick * 0.04) * 20;
            c.curX = baseX + route;
            c.facing = Math.cos(tick * 0.04) > 0 ? 1 : -1;
            c.runCycle += 0.22;

            // Kicks ball if ball rolls right
            const distToBall = Math.hypot(ball.x - c.curX, ball.y - groundY);
            if (distToBall < 20 && c.kickCooldown === 0) {
              ball.vx = -3.8 - Math.random(); // kick left back to game
              ball.vy = -4 - Math.random() * 2;
              c.kickCooldown = 60;
              c.facing = -1;
            }
            break;
          }

          case 'twirler': {
            // Player 6: Gentle twirling / dancing
            c.twirlAngle = Math.sin(tick * 0.08) * 0.15;
            c.runCycle += 0.08;
            break;
          }

          case 'cheerer': {
            // Player 7: Cheering, bobbing knees & clapping hands
            c.yOffset = -Math.abs(Math.sin(tick * 0.14)) * 2.5;
            break;
          }
        }

        // Apply physics to gentle hops (if triggered by click)
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

        // Proportional scale for compact banner: head at -30, feet at 0
        const headY = -28;
        const headRadius = 5.8;
        const bodyY = -18;
        const waistY = -9;

        // 1) LEGS (Dynamic running / walking cycle)
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';

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
          // Shirt
          ctx.fillStyle = c.shirtColor;
          ctx.fillRect(-5, bodyY, 10, 9);
        }

        // 3) ARMS (Pumping while running, clapping, or cheering)
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';

        if (c.behavior === 'cheerer') {
          // Clapping hands
          const clap = Math.sin(tick * 0.2) * 3;
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

        // Eyes (looking in facing direction)
        const eyeLookX = c.facing * 1.2;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-1.8 + eyeLookX, headY - 1, 0.9, 0, Math.PI * 2);
        ctx.arc(1.8 + eyeLookX, headY - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Smiling mouth
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(0, headY + 0.8, 2.6, 0.15 * Math.PI, 0.85 * Math.PI, false);
        ctx.stroke();

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

        ctx.restore();

        // Celebration star particles if any
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
