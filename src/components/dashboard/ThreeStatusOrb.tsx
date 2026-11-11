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

    // Detect reduced motion safely (works in browser, SSR, and JSDOM)
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
      // Fallback to CSS representation if WebGL is unavailable
      return;
    }

    const { clientWidth, clientHeight } = container;
    const width = clientWidth || 220;
    const height = clientHeight || 220;

    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.2;

    const colors = COLOR_MAP[variant] || COLOR_MAP.teal;

    // 1. Central Translucent Wireframe / Holographic Sphere
    const sphereGeometry = new THREE.SphereGeometry(1.25, 32, 32);
    const sphereMaterial = new THREE.MeshPhysicalMaterial({
      color: isAllClear ? 0x10b981 : colors.primary,
      emissive: isAllClear ? 0x059669 : colors.secondary,
      emissiveIntensity: 0.22,
      roughness: 0.2,
      metalness: 0.1,
      transmission: 0.7,
      transparent: true,
      opacity: 0.45,
      wireframe: false,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // 2. Glowing Outer Orbit Rings
    const ringGeometry = new THREE.TorusGeometry(1.5, 0.02, 16, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: isAllClear ? 0x34d399 : colors.accent,
      transparent: true,
      opacity: 0.6,
    });
    const ring1 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring1.rotation.x = Math.PI / 3;
    ring1.rotation.y = Math.PI / 6;
    scene.add(ring1);

    const ring2 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = -Math.PI / 5;
    ring2.scale.set(1.12, 1.12, 1.12);
    scene.add(ring2);

    // 3. Floating Sparkle Particles
    const particleCount = 140;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      const radius = 1.35 + Math.random() * 0.7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particlePositions[i] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i + 2] = radius * Math.cos(phi);
    }
    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.045,
      color: isAllClear ? 0x6ee7b7 : colors.particles,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(colors.light, 2.5, 12);
    pointLight.position.set(3, 3, 3);
    scene.add(pointLight);

    const backLight = new THREE.PointLight(0xffffff, 1.2, 10);
    backLight.position.set(-3, -2, -2);
    scene.add(backLight);

    // Mouse Parallax
    let targetRotationX = 0;
    let targetRotationY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotationY = x * 0.45;
      targetRotationX = -y * 0.45;
    };

    container.addEventListener('mousemove', handleMouseMove);

    // Resize handling
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: newW, height: newH } = entry.contentRect;
          if (newW > 0 && newH > 0 && renderer) {
            camera.aspect = newW / newH;
            camera.updateProjectionMatrix();
            renderer.setSize(newW, newH, false);
          }
        }
      });
      resizeObserver.observe(container);
    }

    // Animation Loop
    let animationId: number;
    const animate = () => {
      if (!prefersReducedMotion) {
        sphere.rotation.y += 0.007;
        sphere.rotation.x += 0.003;

        ring1.rotation.z += 0.006;
        ring2.rotation.z -= 0.005;

        particles.rotation.y += 0.003;
        particles.rotation.x -= 0.002;

        // Smooth mouse damping
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

      // Clean disposal
      sphereGeometry.dispose();
      sphereMaterial.dispose();
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
      className={`relative flex items-center justify-center select-none pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
