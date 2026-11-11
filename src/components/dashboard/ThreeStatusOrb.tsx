'use client';

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export interface ThreeStatusOrbProps {
  variant: 'teal' | 'rose' | 'amber';
  count: number;
  isAllClear?: boolean;
  className?: string;
}

const COLOR_MAP = {
  teal: {
    primary: 0x0d9488,
    secondary: 0x14b8a6,
    accent: 0x5eead4,
    particles: 0x99f6e4,
    light: 0x2dd4bf,
  },
  rose: {
    primary: 0xe11d48,
    secondary: 0xf43f5e,
    accent: 0xfb7185,
    particles: 0xfecdd3,
    light: 0xff8599,
  },
  amber: {
    primary: 0xd97706,
    secondary: 0xf59e0b,
    accent: 0xfbbf24,
    particles: 0xfde68a,
    light: 0xfcd34d,
  },
};

export function ThreeStatusOrb({
  variant,
  count,
  isAllClear = false,
  className = '',
}: ThreeStatusOrbProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Detect reduced motion safely
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Check WebGL availability
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const updateSize = () => {
      if (!container || !renderer) return;
      const width = container.clientWidth || 240;
      const height = container.clientHeight || 240;
      renderer.setSize(width, height, false);
      if (camera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };

    const width = container.clientWidth || 240;
    const height = container.clientHeight || 240;

    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.0;

    const colors = COLOR_MAP[variant] || COLOR_MAP.teal;

    // 1. Central Translucent Wireframe / Holographic Icosahedron
    const sphereGeometry = new THREE.IcosahedronGeometry(1.2, 2);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: colors.secondary,
      wireframe: true,
      transparent: true,
      opacity: isAllClear ? 0.22 : 0.35,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // 2. Inner Glowing Core
    const coreGeometry = new THREE.SphereGeometry(0.7, 16, 16);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: isAllClear ? 0x10b981 : colors.primary,
      transparent: true,
      opacity: 0.12,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(core);

    // 3. Glowing Outer Orbit Rings
    const ringGeometry = new THREE.TorusGeometry(1.5, 0.018, 16, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: colors.accent,
      transparent: true,
      opacity: isAllClear ? 0.4 : 0.65,
    });
    const ring1 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring1.rotation.x = Math.PI / 3;
    ring1.rotation.y = Math.PI / 6;
    scene.add(ring1);

    const ring2 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = -Math.PI / 5;
    ring2.scale.set(1.15, 1.15, 1.15);
    scene.add(ring2);

    // 4. Floating Sparkle Particles
    const particleCount = 80;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      const radius = 1.3 + Math.random() * 0.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particlePositions[i] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i + 2] = radius * Math.cos(phi);
    }
    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.04,
      color: colors.particles,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(colors.light, 2, 10);
    pointLight.position.set(2, 2, 2);
    scene.add(pointLight);

    // Dynamic resize observer
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(container);
    }

    let animationId: number;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      targetRotationY = x * 0.3;
      targetRotationX = y * 0.3;
    };

    container.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Animation loop
    const animate = () => {
      if (!prefersReducedMotion) {
        sphere.rotation.y += 0.006;
        sphere.rotation.x += 0.003;
        core.rotation.y -= 0.004;
        ring1.rotation.z += 0.008;
        ring2.rotation.z -= 0.006;
        particles.rotation.y += 0.002;

        sphere.rotation.x += (targetRotationX - sphere.rotation.x) * 0.05;
        sphere.rotation.y += (targetRotationY - sphere.rotation.y) * 0.05;
      }

      renderer?.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener('mousemove', handleMouseMove);
      resizeObserver?.disconnect();

      sphereGeometry.dispose();
      sphereMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      particlesGeometry.dispose();
      particlesMaterial.dispose();
      renderer?.dispose();
    };
  }, [variant, count, isAllClear]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden ${className}`}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
