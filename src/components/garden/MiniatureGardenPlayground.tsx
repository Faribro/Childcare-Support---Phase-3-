'use client';

import React, { useRef, useEffect, useState } from 'react';

/**
 * MiniatureGardenPlayground
 * Ultra-realistic physics-based miniature live garden with playing children,
 * matching the user reference illustration (rolling green hill, children jumping,
 * trees, schoolhouse with flag, cottage, yellow car, smiling sun, drifting clouds,
 * bouncing soccer ball, fluttering butterflies, and organic interactive physics).
 */
export function MiniatureGardenPlayground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

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
      isDown: false,
      lastInteractionTime: 0,
    };

    // Calculate rolling hill elevation at x
    const getGroundY = (x: number, w: number, h: number) => {
      const normalizedX = x / w;
      // Gentle arch hill matching reference image with small natural ripples
      const arch = Math.sin(normalizedX * Math.PI) * (h * 0.18);
      const ripple = Math.sin(normalizedX * Math.PI * 4) * 3;
      const baseLine = h * 0.82;
      return baseLine - arch + ripple;
    };

    // Physics Ball
    const ball = {
      x: 200,
      y: 100,
      vx: 1.8,
      vy: 0,
      radius: 7,
      rotation: 0,
      rotSpeed: 0.05,
      bounciness: 0.76,
      color: '#ffffff',
      shadowColor: 'rgba(0,0,0,0.15)',
    };

    // Butterfly particles
    interface Butterfly {
      x: number;
      y: number;
      vx: number;
      vy: number;
      wingAngle: number;
      wingSpeed: number;
      color: string;
      size: number;
      targetX: number;
      targetY: number;
    }

    const butterflies: Butterfly[] = [
      { x: 120, y: 60, vx: 0.5, vy: 0, wingAngle: 0, wingSpeed: 0.25, color: '#f43f5e', size: 3.5, targetX: 180, targetY: 50 },
      { x: 420, y: 40, vx: -0.4, vy: 0, wingAngle: 0, wingSpeed: 0.28, color: '#0ea5e9', size: 3.5, targetX: 360, targetY: 45 },
      { x: 700, y: 70, vx: 0.6, vy: 0, wingAngle: 0, wingSpeed: 0.22, color: '#eab308', size: 3.5, targetX: 780, targetY: 60 },
    ];

    // Clouds
    const clouds = [
      { x: 80, y: 22, speed: 0.22, scale: 0.85, opacity: 0.75 },
      { x: 460, y: 15, speed: 0.18, scale: 1.1, opacity: 0.85 },
      { x: 820, y: 28, speed: 0.25, scale: 0.75, opacity: 0.7 },
    ];

    // Children definition matching the illustration
    interface ChildChar {
      id: number;
      ratioX: number; // 0 to 1 position on hill
      hairColor: string;
      hairStyle: 'short-brown' | 'ponytail-red' | 'spiky-black' | 'blonde-bob' | 'beanie' | 'orange-pigtails' | 'curly-brown';
      shirtColor: string;
      pantsColor: string;
      skinColor: string;
      isGirl: boolean;
      hasDress?: boolean;
      // Physics state
      yOffset: number;
      vy: number;
      targetYOffset: number;
      gravity: number;
      jumpForce: number;
      jumpTimer: number;
      jumpInterval: number;
      squash: number;
      armAngle: number;
      legAngle: number;
      isWaving: boolean;
      particles: Array<{ x: number; y: number; vy: number; vx: number; life: number; color: string }>;
    }

    // 7 Characters based exactly on user illustration
    const children: ChildChar[] = [
      {
        id: 1,
        ratioX: 0.08,
        hairColor: '#b45309',
        hairStyle: 'short-brown',
        shirtColor: '#38bdf8', // Blue tee
        pantsColor: '#1e293b', // Dark shorts
        skinColor: '#fde68a',
        isGirl: false,
        yOffset: 0,
        vy: 0,
        targetYOffset: 0,
        gravity: 0.38,
        jumpForce: -8.5,
        jumpTimer: 20,
        jumpInterval: 140,
        squash: 1,
        armAngle: 0,
        legAngle: 0,
        isWaving: false,
        particles: [],
      },
      {
        id: 2,
        ratioX: 0.20,
        hairColor: '#ea580c',
        hairStyle: 'ponytail-red',
        shirtColor: '#f472b6', // Pink dress
        pantsColor: '#f472b6',
        skinColor: '#fef3c7',
        isGirl: true,
        hasDress: true,
        yOffset: 0,
        vy: 0,
        targetYOffset: 0,
        gravity: 0.36,
        jumpForce: -9.2,
        jumpTimer: 70,
        jumpInterval: 170,
        squash: 1,
        armAngle: 0,
        legAngle: 0,
        isWaving: true,
        particles: [],
      },
      {
        id: 3,
        ratioX: 0.36,
        hairColor: '#334155',
        hairStyle: 'spiky-black',
        shirtColor: '#f59e0b', // Yellow shirt
        pantsColor: '#15803d', // Green shorts
        skinColor: '#fde68a',
        isGirl: false,
        yOffset: 0,
        vy: 0,
        targetYOffset: 0,
        gravity: 0.40,
        jumpForce: -12.0, // High star jump center-left
        jumpTimer: 10,
        jumpInterval: 130,
        squash: 1,
        armAngle: 0,
        legAngle: 0,
        isWaving: false,
        particles: [],
      },
      {
        id: 4,
        ratioX: 0.50,
        hairColor: '#facc15',
        hairStyle: 'blonde-bob',
        shirtColor: '#ec4899', // Pink frock
        pantsColor: '#ec4899',
        skinColor: '#fef3c7',
        isGirl: true,
        hasDress: true,
        yOffset: 0,
        vy: 0,
        targetYOffset: 0,
        gravity: 0.37,
        jumpForce: -10.5,
        jumpTimer: 90,
        jumpInterval: 160,
        squash: 1,
        armAngle: 0,
        legAngle: 0,
        isWaving: true,
        particles: [],
      },
      {
        id: 5,
        ratioX: 0.63,
        hairColor: '#7c2d12',
        hairStyle: 'beanie',
        shirtColor: '#84cc16', // Olive green shirt
        pantsColor: '#1e3a8a', // Blue jeans
        skinColor: '#fde68a',
        isGirl: false,
        yOffset: 0,
        vy: 0,
        targetYOffset: 0,
        gravity: 0.39,
        jumpForce: -11.0,
        jumpTimer: 45,
        jumpInterval: 150,
        squash: 1,
        armAngle: 0,
        legAngle: 0,
        isWaving: false,
        particles: [],
      },
      {
        id: 6,
        ratioX: 0.81,
        hairColor: '#d97706',
        hairStyle: 'orange-pigtails',
        shirtColor: '#2563eb', // Blue striped dress
        pantsColor: '#2563eb',
        skinColor: '#fef3c7',
        isGirl: true,
        hasDress: true,
        yOffset: 0,
        vy: 0,
        targetYOffset: 0,
        gravity: 0.37,
        jumpForce: -9.8,
        jumpTimer: 110,
        jumpInterval: 180,
        squash: 1,
        armAngle: 0,
        legAngle: 0,
        isWaving: true,
        particles: [],
      },
      {
        id: 7,
        ratioX: 0.94,
        hairColor: '#451a03',
        hairStyle: 'curly-brown',
        shirtColor: '#f43f5e', // Rose red dress
        pantsColor: '#f43f5e',
        skinColor: '#fde047',
        isGirl: true,
        hasDress: true,
        yOffset: 0,
        vy: 0,
        targetYOffset: 0,
        gravity: 0.38,
        jumpForce: -9.0,
        jumpTimer: 135,
        jumpInterval: 165,
        squash: 1,
        armAngle: 0,
        legAngle: 0,
        isWaving: true,
        particles: [],
      },
    ];

    // Flower patches
    const flowers = [
      { ratioX: 0.04, color: '#f43f5e', size: 3.5, swayOffset: 0 },
      { ratioX: 0.14, color: '#a855f7', size: 3, swayOffset: 1.2 },
      { ratioX: 0.28, color: '#38bdf8', size: 3.5, swayOffset: 2.4 },
      { ratioX: 0.44, color: '#f59e0b', size: 3, swayOffset: 0.8 },
      { ratioX: 0.58, color: '#ec4899', size: 4, swayOffset: 3.1 },
      { ratioX: 0.73, color: '#f97316', size: 3.5, swayOffset: 1.7 },
      { ratioX: 0.88, color: '#a855f7', size: 3.5, swayOffset: 2.1 },
      { ratioX: 0.98, color: '#10b981', size: 3, swayOffset: 0.5 },
    ];

    // Resize canvas with high DPI sharpness
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
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Mouse / Touch handlers
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
      mouse.lastInteractionTime = performance.now();
    };

    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      mouse.isDown = true;
      setIsInteracting(true);

      // Launch ball towards click or nudge it upwards
      ball.vx = (clickX - ball.x) * 0.05;
      ball.vy = -7.5;

      // Children jump when clicked near them
      children.forEach((child) => {
        const childX = child.ratioX * width;
        const groundY = getGroundY(childX, width, height);
        const childY = groundY + child.yOffset;
        const dist = Math.hypot(clickX - childX, clickY - (childY - 20));

        if (dist < 45 || Math.abs(clickX - childX) < 35) {
          child.vy = child.jumpForce * 1.25;
          child.squash = 0.8;
          // Spawn little celebration stars
          for (let p = 0; p < 6; p++) {
            child.particles.push({
              x: childX + (Math.random() - 0.5) * 16,
              y: childY - 30,
              vx: (Math.random() - 0.5) * 3,
              vy: -2 - Math.random() * 3,
              life: 1,
              color: ['#f59e0b', '#ec4899', '#38bdf8', '#10b981'][Math.floor(Math.random() * 4)],
            });
          }
        }
      });
    };

    const onMouseUp = () => {
      mouse.isDown = false;
      setTimeout(() => setIsInteracting(false), 800);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        mouse.targetX = e.touches[0].clientX - rect.left;
        mouse.targetY = e.touches[0].clientY - rect.top;
        mouse.lastInteractionTime = performance.now();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const clickX = touch.clientX - rect.left;
        const clickY = touch.clientY - rect.top;
        mouse.isDown = true;
        setIsInteracting(true);

        ball.vx = (clickX - ball.x) * 0.05;
        ball.vy = -8;

        children.forEach((child) => {
          const childX = child.ratioX * width;
          const dist = Math.abs(clickX - childX);
          if (dist < 40) {
            child.vy = child.jumpForce * 1.2;
            child.squash = 0.8;
          }
        });
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });

    let tick = 0;

    // MAIN PHYSICS RENDER LOOP
    const render = () => {
      tick++;

      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.15;
      mouse.y += (mouse.targetY - mouse.y) * 0.15;

      ctx.clearRect(0, 0, width, height);

      // 1. SKY GRADIENT (Gentle sunny pastel horizon)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, 'rgba(238, 248, 255, 0.95)');
      skyGrad.addColorStop(0.65, 'rgba(240, 253, 244, 0.9)');
      skyGrad.addColorStop(1, 'rgba(236, 253, 245, 0.95)');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. HAPPY SMILING SUN WITH ROTATING RAYS (upper-center right like image)
      const sunX = width * 0.72;
      const sunY = height * 0.22;
      const sunRadius = 13;

      ctx.save();
      ctx.translate(sunX, sunY);

      // Rotating doodle rays
      ctx.save();
      ctx.rotate(tick * 0.006);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      const numRays = 10;
      for (let r = 0; r < numRays; r++) {
        const angle = (r * Math.PI * 2) / numRays;
        const rayLen = 5 + Math.sin(tick * 0.05 + r) * 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * (sunRadius + 3), Math.sin(angle) * (sunRadius + 3));
        ctx.lineTo(Math.cos(angle) * (sunRadius + 3 + rayLen), Math.sin(angle) * (sunRadius + 3 + rayLen));
        ctx.stroke();
      }
      ctx.restore();

      // Sun circle
      ctx.beginPath();
      ctx.arc(0, 0, sunRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Smiling face
      ctx.fillStyle = '#78350f';
      // Eyes
      ctx.beginPath();
      ctx.arc(-4, -2, 1.2, 0, Math.PI * 2);
      ctx.arc(4, -2, 1.2, 0, Math.PI * 2);
      ctx.fill();
      // Smile curve
      ctx.beginPath();
      ctx.arc(0, 1, 5, 0.2 * Math.PI, 0.8 * Math.PI, false);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Cheeks
      ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
      ctx.beginPath();
      ctx.arc(-6, 2, 2, 0, Math.PI * 2);
      ctx.arc(6, 2, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 3. FLUFFY DRIFTING CLOUDS
      clouds.forEach((cloud) => {
        cloud.x += cloud.speed;
        if (cloud.x > width + 60) cloud.x = -60;

        ctx.save();
        ctx.translate(cloud.x, cloud.y);
        ctx.scale(cloud.scale, cloud.scale);
        ctx.fillStyle = `rgba(186, 230, 253, ${cloud.opacity})`;
        ctx.strokeStyle = `rgba(125, 211, 252, ${cloud.opacity * 0.9})`;
        ctx.lineWidth = 1.5;

        // Doodle cloud with multiple overlapping circles
        ctx.beginPath();
        ctx.arc(0, 0, 12, Math.PI * 0.5, Math.PI * 1.5);
        ctx.arc(10, -8, 14, Math.PI * 1, Math.PI * 1.85);
        ctx.arc(26, -6, 12, Math.PI * 1.35, Math.PI * 2.05);
        ctx.arc(36, 0, 10, Math.PI * 1.6, Math.PI * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      // 4. BIRDS FLYING (V-formations)
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      const birdOffset = (tick * 0.3) % (width + 100);
      for (let b = 0; b < 3; b++) {
        const bx = ((width - birdOffset) + b * 16) % width;
        const by = 26 + b * 5 + Math.sin(tick * 0.08 + b) * 2;
        ctx.beginPath();
        ctx.arc(bx - 3, by, 3, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx + 3, by, 3, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }

      // 5. SCENERY BACKGROUND: Houses, School with flag, Trees, Yellow Car (as in reference image)
      // Tree 1 (Left - behind kids)
      const tree1X = width * 0.24;
      const tree1GroundY = getGroundY(tree1X, width, height);
      // Trunk
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(tree1X, tree1GroundY);
      ctx.lineTo(tree1X, tree1GroundY - 32);
      ctx.stroke();
      // Green crown (fluffy watercolor circles)
      ctx.fillStyle = '#86efac';
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(tree1X, tree1GroundY - 42, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tree1X - 7, tree1GroundY - 36, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tree1X + 7, tree1GroundY - 36, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tree 2 (Center Right)
      const tree2X = width * 0.60;
      const tree2GroundY = getGroundY(tree2X, width, height);
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(tree2X, tree2GroundY);
      ctx.lineTo(tree2X, tree2GroundY - 28);
      ctx.stroke();
      ctx.fillStyle = '#a7f3d0';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(tree2X, tree2GroundY - 38, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tree2X - 6, tree2GroundY - 32, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tree2X + 6, tree2GroundY - 32, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cottage 1 (Left - next to tree 1)
      const cotX = width * 0.17;
      const cotGroundY = getGroundY(cotX, width, height);
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.5;
      ctx.fillRect(cotX - 12, cotGroundY - 18, 24, 18);
      ctx.strokeRect(cotX - 12, cotGroundY - 18, 24, 18);
      // Roof
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.moveTo(cotX - 16, cotGroundY - 18);
      ctx.lineTo(cotX, cotGroundY - 30);
      ctx.lineTo(cotX + 16, cotGroundY - 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Door
      ctx.fillStyle = '#78350f';
      ctx.fillRect(cotX - 3, cotGroundY - 10, 6, 10);

      // School / Center Two-Story House (Center - between boy 3 and girl 4)
      const houseX = width * 0.38;
      const houseGroundY = getGroundY(houseX, width, height);
      ctx.fillStyle = '#f5f5f4';
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 1.5;
      ctx.fillRect(houseX - 16, houseGroundY - 26, 32, 26);
      ctx.strokeRect(houseX - 16, houseGroundY - 26, 32, 26);
      // Balcony / Second story roof
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(houseX - 18, houseGroundY - 34, 36, 8);
      ctx.strokeRect(houseX - 18, houseGroundY - 34, 36, 8);
      // Windows
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(houseX - 11, houseGroundY - 22, 6, 6);
      ctx.strokeRect(houseX - 11, houseGroundY - 22, 6, 6);
      ctx.fillRect(houseX + 5, houseGroundY - 22, 6, 6);
      ctx.strokeRect(houseX + 5, houseGroundY - 22, 6, 6);

      // Yellow Toy Car (Center - parked on hill)
      const carX = width * 0.49;
      const carGroundY = getGroundY(carX, width, height);
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.4;
      // Body
      ctx.beginPath();
      ctx.arc(carX, carGroundY - 4, 9, Math.PI * 1, Math.PI * 2);
      ctx.lineTo(carX + 11, carGroundY - 4);
      ctx.lineTo(carX + 11, carGroundY - 1);
      ctx.lineTo(carX - 11, carGroundY - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Wheels
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(carX - 6, carGroundY, 2.5, 0, Math.PI * 2);
      ctx.arc(carX + 6, carGroundY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Church / Clinic with Tower (Right center)
      const churchX = width * 0.65;
      const churchGroundY = getGroundY(churchX, width, height);
      ctx.fillStyle = '#e0f2fe';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.fillRect(churchX - 10, churchGroundY - 28, 20, 28);
      ctx.strokeRect(churchX - 10, churchGroundY - 28, 20, 28);
      // Spire
      ctx.beginPath();
      ctx.moveTo(churchX - 12, churchGroundY - 28);
      ctx.lineTo(churchX, churchGroundY - 44);
      ctx.lineTo(churchX + 12, churchGroundY - 28);
      ctx.closePath();
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.stroke();

      // School Building with Waving Flag (Far right)
      const schoolX = width * 0.77;
      const schoolGroundY = getGroundY(schoolX, width, height);
      ctx.fillStyle = '#e7e5e4';
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.5;
      ctx.fillRect(schoolX - 14, schoolGroundY - 26, 28, 26);
      ctx.strokeRect(schoolX - 14, schoolGroundY - 26, 28, 26);
      // Flagpole
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(schoolX - 6, schoolGroundY - 26);
      ctx.lineTo(schoolX - 6, schoolGroundY - 42);
      ctx.stroke();
      // Waving Flag
      const flagWave = Math.sin(tick * 0.1) * 2;
      ctx.fillStyle = '#10b981';
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(schoolX - 6, schoolGroundY - 42);
      ctx.quadraticCurveTo(schoolX, schoolGroundY - 44 + flagWave, schoolX + 7, schoolGroundY - 40);
      ctx.lineTo(schoolX + 7, schoolGroundY - 33);
      ctx.quadraticCurveTo(schoolX, schoolGroundY - 36 + flagWave, schoolX - 6, schoolGroundY - 34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Playground Slide (Far left)
      const slideX = width * 0.05;
      const slideGroundY = getGroundY(slideX, width, height);
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 1.8;
      // Ladder
      ctx.beginPath();
      ctx.moveTo(slideX - 4, slideGroundY);
      ctx.lineTo(slideX - 4, slideGroundY - 24);
      ctx.lineTo(slideX + 14, slideGroundY);
      ctx.stroke();
      // Rungs
      for (let rg = 1; rg <= 3; rg++) {
        const ry = slideGroundY - rg * 6;
        ctx.beginPath();
        ctx.moveTo(slideX - 6, ry);
        ctx.lineTo(slideX - 2, ry);
        ctx.stroke();
      }

      // 6. ROLLING GREEN HILL GROUND (Smooth bezier curve filled with vibrant green watercolor style)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, getGroundY(0, width, height));

      // Draw curve along hill with multiple points
      const segments = 60;
      for (let i = 0; i <= segments; i++) {
        const px = (i / segments) * width;
        const py = getGroundY(px, width, height);
        ctx.lineTo(px, py);
      }

      ctx.lineTo(width, height);
      ctx.closePath();

      // Rich layered gradient for realistic grass
      const hillGrad = ctx.createLinearGradient(0, height * 0.6, 0, height);
      hillGrad.addColorStop(0, '#bef264'); // Fresh lime grass highlight
      hillGrad.addColorStop(0.2, '#a3e635'); // Vibrant green
      hillGrad.addColorStop(0.6, '#65a30d'); // Lush grass depth
      hillGrad.addColorStop(1, '#4d7c0f'); // Earthy base
      ctx.fillStyle = hillGrad;
      ctx.fill();

      // Hill doodle contour stroke matching illustration
      ctx.strokeStyle = '#4d7c0f';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Grass tufts along surface
      ctx.strokeStyle = '#365314';
      ctx.lineWidth = 1.2;
      for (let g = 0; g < 18; g++) {
        const gx = ((g + 0.5) / 18) * width;
        const gy = getGroundY(gx, width, height);
        const sway = Math.sin(tick * 0.04 + g) * 2;
        ctx.beginPath();
        ctx.moveTo(gx - 2, gy);
        ctx.lineTo(gx - 4 + sway, gy - 5);
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + sway, gy - 7);
        ctx.moveTo(gx + 2, gy);
        ctx.lineTo(gx + 4 + sway, gy - 5);
        ctx.stroke();
      }

      // Flowers on the hill
      flowers.forEach((fl) => {
        const fx = fl.ratioX * width;
        const fy = getGroundY(fx, width, height);
        const sway = Math.sin(tick * 0.05 + fl.swayOffset) * 1.5;

        // Stem
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + sway, fy - 6, fx + sway * 1.2, fy - 10);
        ctx.stroke();

        // Blossom petals
        ctx.fillStyle = fl.color;
        ctx.beginPath();
        ctx.arc(fx + sway * 1.2, fy - 11, fl.size, 0, Math.PI * 2);
        ctx.fill();

        // Center
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(fx + sway * 1.2, fy - 11, fl.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      // 7. PHYSICS PLAYING BALL SIMULATION
      const ballGroundY = getGroundY(ball.x, width, height) - ball.radius;

      // Ball gravity & motion
      ball.vy += 0.32; // Gravity
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.rotation += ball.rotSpeed;

      // Ground bounce & roll physics
      if (ball.y >= ballGroundY) {
        ball.y = ballGroundY;
        ball.vy = -ball.vy * ball.bounciness;

        // Slope friction & roll acceleration
        const slopeAngle = (getGroundY(ball.x + 2, width, height) - getGroundY(ball.x - 2, width, height)) / 4;
        ball.vx += slopeAngle * 0.25; // Accelerate down hill
        ball.vx *= 0.985; // Rolling friction
        ball.rotSpeed = ball.vx * 0.15;

        if (Math.abs(ball.vy) < 0.6) ball.vy = 0;
      }

      // Wall boundaries bounce
      if (ball.x <= ball.radius) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx) * 0.8;
      } else if (ball.x >= width - ball.radius) {
        ball.x = width - ball.radius;
        ball.vx = -Math.abs(ball.vx) * 0.8;
      }

      // Render Ball Shadow
      ctx.fillStyle = ball.shadowColor;
      ctx.beginPath();
      const shadowScale = Math.max(0.3, 1 - (ballGroundY - ball.y) / 60);
      ctx.ellipse(ball.x, ballGroundY + 4, ball.radius * shadowScale * 1.2, ball.radius * 0.4 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Render Soccer Ball with black/white hexagon patches
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(ball.rotation);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Ball pattern
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, -ball.radius * 0.4);
      ctx.lineTo(0, -ball.radius);
      ctx.moveTo(-ball.radius * 0.35, ball.radius * 0.2);
      ctx.lineTo(-ball.radius * 0.85, ball.radius * 0.5);
      ctx.moveTo(ball.radius * 0.35, ball.radius * 0.2);
      ctx.lineTo(ball.radius * 0.85, ball.radius * 0.5);
      ctx.stroke();
      ctx.restore();

      // 8. BUTTERFLIES FLUTTERING
      butterflies.forEach((bf) => {
        // Wandering autonomous steering
        bf.x += bf.vx;
        bf.y += bf.vy + Math.sin(tick * 0.08) * 0.8;
        bf.wingAngle += bf.wingSpeed;

        if (Math.random() < 0.02) {
          bf.vx = (Math.random() - 0.5) * 1.2;
          bf.vy = (Math.random() - 0.5) * 0.8;
        }

        // Keep inside bounds
        if (bf.x < 20) bf.vx = 0.8;
        if (bf.x > width - 20) bf.vx = -0.8;
        if (bf.y < 15) bf.vy = 0.5;
        if (bf.y > height * 0.7) bf.vy = -0.6;

        ctx.save();
        ctx.translate(bf.x, bf.y);
        const wingScale = Math.cos(bf.wingAngle);

        ctx.fillStyle = bf.color;
        // Left wing
        ctx.beginPath();
        ctx.ellipse(-bf.size * 0.8 * Math.abs(wingScale), 0, bf.size * Math.abs(wingScale), bf.size * 0.7, -0.3, 0, Math.PI * 2);
        ctx.fill();
        // Right wing
        ctx.beginPath();
        ctx.ellipse(bf.size * 0.8 * Math.abs(wingScale), 0, bf.size * Math.abs(wingScale), bf.size * 0.7, 0.3, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-0.6, -bf.size * 0.5, 1.2, bf.size);
        ctx.restore();
      });

      // 9. ANIMATED PLAYING CHILDREN WITH REALISTIC GRAVITY, SQUASH & JUMP PHYSICS
      children.forEach((child) => {
        const childX = child.ratioX * width;
        const groundY = getGroundY(childX, width, height);

        // Jump physics cycle
        child.jumpTimer++;
        if (child.jumpTimer >= child.jumpInterval) {
          // Trigger organic jump
          child.vy = child.jumpForce;
          child.jumpTimer = 0;
          child.squash = 0.82; // Pre-jump crouch
        }

        // Apply gravity & velocity
        child.vy += child.gravity;
        child.yOffset += child.vy;

        // Ground landing collision
        if (child.yOffset >= 0) {
          if (child.vy > 1.5) {
            // Landing impact squash & stretch recovery
            child.squash = Math.max(0.72, 1 - child.vy * 0.04);
          }
          child.yOffset = 0;
          child.vy = 0;
        }

        // Spring-damper recovery of squash back to 1.0
        child.squash += (1.0 - child.squash) * 0.18;

        // Dynamic limbs & posture
        const isAirborne = child.yOffset < -2;
        const airborneHeight = Math.abs(child.yOffset);

        // Interactive Ball Kicking: if ball is close, child kicks it!
        const distToBall = Math.hypot(ball.x - childX, ball.y - groundY);
        if (distToBall < 28 && Math.abs(ball.y - groundY) < 25) {
          ball.vx = (ball.x > childX ? 4.5 : -4.5) + (Math.random() - 0.5);
          ball.vy = -6 - Math.random() * 3;
          child.vy = child.jumpForce * 0.8;
          child.squash = 0.78;
        }

        // Draw Child Shadow on the ground
        const childGroundY = groundY;
        const shadowOpacity = Math.max(0.12, 0.45 - airborneHeight * 0.008);
        const shadowWidth = (14 * (1 / child.squash)) * Math.max(0.4, 1 - airborneHeight * 0.015);
        ctx.fillStyle = `rgba(30, 41, 59, ${shadowOpacity})`;
        ctx.beginPath();
        ctx.ellipse(childX, childGroundY + 1, shadowWidth, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // DRAW CHILD CHARACTER
        ctx.save();
        ctx.translate(childX, childGroundY + child.yOffset);
        // Squash & stretch physics transform
        ctx.scale(1 / Math.sqrt(child.squash), child.squash);

        // Character height reference: head center is at -38, feet at 0
        const headY = -38;
        const headRadius = 7.5;
        const bodyY = -24;
        const waistY = -12;

        // 1) LEGS & FEET
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';

        if (isAirborne) {
          // Star jump / flying legs in mid-air (as in reference drawing)
          const legSpread = 6 + Math.min(6, airborneHeight * 0.2);
          // Left leg
          ctx.beginPath();
          ctx.moveTo(-3, waistY);
          ctx.lineTo(-legSpread, waistY + 7);
          ctx.lineTo(-legSpread - 2, 0);
          ctx.stroke();
          // Right leg
          ctx.beginPath();
          ctx.moveTo(3, waistY);
          ctx.lineTo(legSpread, waistY + 7);
          ctx.lineTo(legSpread + 2, 0);
          ctx.stroke();

          // Shoes
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(-legSpread - 2, 0, 2.8, 0, Math.PI * 2);
          ctx.arc(legSpread + 2, 0, 2.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Standing / bouncing slightly
          const legSway = Math.sin(tick * 0.1 + child.id) * 1.2;
          ctx.beginPath();
          ctx.moveTo(-3.5, waistY);
          ctx.lineTo(-3.5 + legSway, 0);
          ctx.moveTo(3.5, waistY);
          ctx.lineTo(3.5 - legSway, 0);
          ctx.stroke();

          // Shoes
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(-3.5 + legSway, 0, 2.5, 0, Math.PI * 2);
          ctx.arc(3.5 - legSway, 0, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // 2) PANTS / DRESS
        if (child.hasDress) {
          // Triangular dress (matching pink, blue, magenta dresses in image)
          ctx.fillStyle = child.shirtColor;
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(0, bodyY);
          ctx.lineTo(-9, waistY + 2);
          ctx.lineTo(9, waistY + 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // Shorts / Trousers
          ctx.fillStyle = child.pantsColor;
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.2;
          ctx.fillRect(-5.5, waistY - 2, 11, 7);
          ctx.strokeRect(-5.5, waistY - 2, 11, 7);

          // Shirt Body
          ctx.fillStyle = child.shirtColor;
          ctx.fillRect(-6, bodyY, 12, 12);
          ctx.strokeRect(-6, bodyY, 12, 12);
        }

        // 3) ARMS & HANDS
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';

        if (isAirborne) {
          // Hands raised up high with joy (Star Jump as in image!)
          const armWave = Math.sin(tick * 0.15 + child.id) * 2;
          // Left arm up
          ctx.beginPath();
          ctx.moveTo(-5, bodyY + 3);
          ctx.lineTo(-12, headY + 3 + armWave);
          ctx.stroke();
          // Right arm up
          ctx.beginPath();
          ctx.moveTo(5, bodyY + 3);
          ctx.lineTo(12, headY + 3 - armWave);
          ctx.stroke();

          // Hands
          ctx.fillStyle = child.skinColor;
          ctx.beginPath();
          ctx.arc(-12, headY + 3 + armWave, 2.2, 0, Math.PI * 2);
          ctx.arc(12, headY + 3 - armWave, 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Waving / joyful gesture
          const waveLeft = Math.sin(tick * 0.12 + child.id) * 4;
          const waveRight = Math.cos(tick * 0.12 + child.id) * 4;

          ctx.beginPath();
          ctx.moveTo(-5, bodyY + 4);
          ctx.lineTo(-11, bodyY + (child.isWaving ? -6 + waveLeft : 6));
          ctx.moveTo(5, bodyY + 4);
          ctx.lineTo(11, bodyY + (child.isWaving ? -6 + waveRight : 6));
          ctx.stroke();

          ctx.fillStyle = child.skinColor;
          ctx.beginPath();
          ctx.arc(-11, bodyY + (child.isWaving ? -6 + waveLeft : 6), 2, 0, Math.PI * 2);
          ctx.arc(11, bodyY + (child.isWaving ? -6 + waveRight : 6), 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // 4) HEAD & FACE
        ctx.fillStyle = child.skinColor;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Expressive Eyes (Joyful dots looking towards mouse if nearby)
        const eyeLookX = Math.max(-1.5, Math.min(1.5, (mouse.x - childX) * 0.03));
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-2.5 + eyeLookX, headY - 1, 1.2, 0, Math.PI * 2);
        ctx.arc(2.5 + eyeLookX, headY - 1, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Smiling mouth (wide happy curve)
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(0, headY + 1, 3.5, 0.15 * Math.PI, 0.85 * Math.PI, false);
        ctx.stroke();

        // Rosy cheeks
        ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
        ctx.beginPath();
        ctx.arc(-4, headY + 1.5, 1.6, 0, Math.PI * 2);
        ctx.arc(4, headY + 1.5, 1.6, 0, Math.PI * 2);
        ctx.fill();

        // 5) HAIR STYLES (Hand-drawn doodle match)
        ctx.fillStyle = child.hairColor;
        ctx.strokeStyle = child.hairColor;
        ctx.lineWidth = 1.5;

        if (child.hairStyle === 'short-brown') {
          ctx.beginPath();
          ctx.arc(0, headY - 2, headRadius + 0.8, Math.PI * 0.9, Math.PI * 2.1);
          ctx.fill();
          // Fringe tufts
          ctx.beginPath();
          ctx.moveTo(-5, headY - 5);
          ctx.lineTo(-2, headY - 3);
          ctx.lineTo(2, headY - 5);
          ctx.stroke();
        } else if (child.hairStyle === 'ponytail-red') {
          // Hair cap
          ctx.beginPath();
          ctx.arc(0, headY - 2, headRadius + 0.8, Math.PI * 0.85, Math.PI * 2.15);
          ctx.fill();
          // Side wavy hair
          ctx.beginPath();
          ctx.moveTo(-headRadius, headY);
          ctx.lineTo(-headRadius - 3, headY + 6);
          ctx.moveTo(headRadius, headY);
          ctx.lineTo(headRadius + 3, headY + 6);
          ctx.stroke();
        } else if (child.hairStyle === 'spiky-black') {
          // Spiky playful hair
          ctx.beginPath();
          ctx.moveTo(-headRadius, headY);
          ctx.lineTo(-5, headY - 12);
          ctx.lineTo(-2, headY - 7);
          ctx.lineTo(0, headY - 14);
          ctx.lineTo(3, headY - 7);
          ctx.lineTo(6, headY - 12);
          ctx.lineTo(headRadius, headY);
          ctx.closePath();
          ctx.fill();
        } else if (child.hairStyle === 'blonde-bob') {
          // Blonde round bob with flower
          ctx.beginPath();
          ctx.arc(0, headY - 2, headRadius + 1.5, Math.PI * 0.8, Math.PI * 2.2);
          ctx.lineTo(headRadius + 3, headY + 3);
          ctx.lineTo(-headRadius - 3, headY + 3);
          ctx.closePath();
          ctx.fill();
          // Cute hair bow
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(5, headY - 6, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (child.hairStyle === 'beanie') {
          // Maroon cap (matching reference boy 5)
          ctx.fillStyle = '#991b1b';
          ctx.beginPath();
          ctx.arc(0, headY - 3, headRadius + 1, Math.PI * 1, Math.PI * 2);
          ctx.fill();
          // Pompom on top
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(0, headY - 12, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (child.hairStyle === 'orange-pigtails') {
          // Hair base
          ctx.beginPath();
          ctx.arc(0, headY - 2, headRadius + 0.5, Math.PI * 0.9, Math.PI * 2.1);
          ctx.fill();
          // Pigtails left and right
          const pigtailSway = Math.sin(tick * 0.15) * 2;
          ctx.beginPath();
          ctx.moveTo(-headRadius, headY - 2);
          ctx.quadraticCurveTo(-headRadius - 5, headY + 2 + pigtailSway, -headRadius - 4, headY + 8);
          ctx.moveTo(headRadius, headY - 2);
          ctx.quadraticCurveTo(headRadius + 5, headY + 2 - pigtailSway, headRadius + 4, headY + 8);
          ctx.stroke();
        } else if (child.hairStyle === 'curly-brown') {
          // Curly puff
          for (let cp = -2; cp <= 2; cp++) {
            ctx.beginPath();
            ctx.arc(cp * 3.5, headY - 7, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();

        // 6) Particles (Joyful celebration stars upon click)
        for (let p = child.particles.length - 1; p >= 0; p--) {
          const pt = child.particles[p];
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += 0.08;
          pt.life -= 0.025;

          if (pt.life <= 0) {
            child.particles.splice(p, 1);
          } else {
            ctx.save();
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = pt.life;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2.2 * pt.life, 0, Math.PI * 2);
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
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchstart', onTouchStart);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-32 sm:h-36 md:h-40 rounded-2xl border border-emerald-200/90 shadow-xs relative overflow-hidden select-none cursor-pointer group mb-6 transition-all duration-300 hover:border-emerald-300 hover:shadow-md"
      title="Miniature Children Garden Playground • Tap or hover to interact"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-label="Interactive live miniature garden with playing children"
      />

      {/* Subtle Interactive Hint Badge */}
      <div className="absolute top-2.5 right-3 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/85 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-emerald-200 text-[10px] font-bold text-emerald-800 flex items-center space-x-1 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mr-0.5" />
        <span>Tap children or kick ball</span>
      </div>
    </div>
  );
}
