'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { Landmark, ChevronRight, FileWarning, Clock } from 'lucide-react';

interface BankDetailsPendingProps {
  DASHBOARD_COPY: {
    cards: {
      pendings: {
        title?: string;
        description?: string;
        allClearText?: string;
        rows: {
          bankDetailsNeeded: {
            href: string;
            label: string;
            hint: string;
          };
          waitingToSend?: {
            href: string;
            label: string;
            hint: string;
          };
        };
      };
      missingDocs?: {
        title: string;
        description: string;
        href: string;
      };
    };
  };
  isServerLoading: boolean;
  approvedBankPendingCount: number;
  submittedMissingDocsCount?: number;
  outboxAttentionCount?: number;
  hasPendings?: boolean;
  mode?: 'mobile' | 'desktop';
}

export default function PendingActionsCard({
  DASHBOARD_COPY,
  isServerLoading,
  approvedBankPendingCount,
  submittedMissingDocsCount = 0,
  outboxAttentionCount = 0,
  hasPendings = true,
  mode = 'desktop',
}: BankDetailsPendingProps) {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    // 1. Respect OS Reduced Motion Preference
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = container.clientWidth || 360;
    let height = container.clientHeight || 120;

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let geometry: THREE.PlaneGeometry;
    let material: THREE.ShaderMaterial;
    let frameId: number;

    try {
      // 2. Scene, Camera & Renderer Setup
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.z = 4.5;

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
      container.appendChild(renderer.domElement);

      // 3. Custom GLSL Organic Aura / Silk Mesh Shader (Awwwards Aesthetic)
      geometry = new THREE.PlaneGeometry(10, 6, 48, 48);
      const uniforms = {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uColorPrimary: { value: new THREE.Color('#fef3c7') }, // Amber-100
        uColorAccent: { value: new THREE.Color('#f59e0b') },  // Amber-500
        uColorBase: { value: new THREE.Color('#fffbeb') },    // Amber-50
      };

      material = new THREE.ShaderMaterial({
        transparent: true,
        uniforms,
        vertexShader: `
          uniform float uTime;
          uniform vec2 uMouse;
          varying vec2 vUv;
          varying float vElevation;

          void main() {
            vUv = uv;
            vec3 pos = position;

            // Organic liquid wave displacement + subtle cursor magnetic pull
            float waveX = sin(pos.x * 1.4 + uTime * 0.7 + uMouse.x * 1.5) * 0.18;
            float waveY = cos(pos.y * 1.8 + uTime * 0.5 + uMouse.y * 1.5) * 0.18;
            pos.z += waveX + waveY;
            vElevation = pos.z;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColorPrimary;
          uniform vec3 uColorAccent;
          uniform vec3 uColorBase;
          varying vec2 vUv;
          varying float vElevation;

          void main() {
            float mixStrength = smoothstep(-0.25, 0.25, vElevation);
            vec3 color = mix(uColorBase, uColorPrimary, vUv.x);
            color = mix(color, uColorAccent, mixStrength * 0.22);

            // Soft radial vignette so edges blend seamlessly into the pill card
            float dist = distance(vUv, vec2(0.5));
            float alpha = smoothstep(0.65, 0.1, dist) * 0.45;

            gl_FragColor = vec4(color, alpha);
          }
        `,
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // 4. Interactive Pointer Tracking with Linear Interpolation (Lerp)
      const onPointerMove = (e: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        pointerRef.current.targetX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerRef.current.targetY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };
      container.addEventListener('pointermove', onPointerMove, { passive: true });

      // 5. Render Loop with Context Loss & Reduced Motion Handling
      const clock = new THREE.Clock();

      const tick = () => {
        const elapsed = clock.getElapsedTime();
        if (!prefersReducedMotion) {
          uniforms.uTime.value = elapsed;
          pointerRef.current.x += (pointerRef.current.targetX - pointerRef.current.x) * 0.06;
          pointerRef.current.y += (pointerRef.current.targetY - pointerRef.current.y) * 0.06;
          uniforms.uMouse.value.set(pointerRef.current.x, pointerRef.current.y);
        }
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(tick);
      };
      tick();

      // 6. Responsive ResizeObserver
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: newW, height: newH } = entry.contentRect;
          if (newW === 0 || newH === 0) return;
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();
          renderer.setSize(newW, newH);
        }
      });
      resizeObserver.observe(container);

      // 7. Strict Memory & WebGL Context Cleanup
      return () => {
        cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        container.removeEventListener('pointermove', onPointerMove);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    } catch {
      // In non-WebGL or JSDOM environments, degrade gracefully
      return;
    }
  }, []);

  const bankRow = DASHBOARD_COPY.cards.pendings.rows.bankDetailsNeeded;
  const waitingRow = DASHBOARD_COPY.cards.pendings.rows.waitingToSend;
  const missingDocsCard = DASHBOARD_COPY.cards.missingDocs;

  return (
    <section className="relative w-full">
      <div className="relative overflow-hidden rounded-[32px] border border-amber-200/50 bg-white/75 p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-500">
        {/* Three.js Interactive Ambient Silk Shader Canvas */}
        <div
          ref={canvasContainerRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[32px]"
        />

        <div className="relative z-10">
          {hasPendings && (
            <div className="flex flex-col gap-2.5">
              {/* Row 1: Missing Documents (on Mobile) or Waiting to Send (on Desktop) */}
              {mode === 'mobile' ? (
                <Link
                  href={missingDocsCard?.href || '/supervisor/assessments'}
                  className="group relative flex min-h-[54px] items-center justify-between rounded-full border border-amber-200/80 bg-gradient-to-r from-amber-50/80 via-white/90 to-amber-50/60 p-2 pr-3.5 shadow-[0_2px_10px_-3px_rgba(217,119,6,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-amber-300/90 hover:bg-white hover:shadow-[0_10px_25px_-5px_rgba(217,119,6,0.18),inset_0_1px_0_0_rgba(255,255,255,1)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-200/90 bg-gradient-to-br from-rose-100 to-amber-50 text-rose-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform duration-300 ease-out group-hover:scale-105 group-hover:border-rose-300">
                      <FileWarning className="h-4 w-4 text-rose-700 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-bold tracking-tight text-amber-950 transition-colors group-hover:text-black">
                        {missingDocsCard?.title || 'Missing documents'}
                      </p>
                      <p className="truncate text-[11px] font-medium text-amber-800/75">
                        {missingDocsCard?.description || 'Records that still need an Aadhaar or photo.'}
                      </p>
                    </div>
                  </div>

                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span
                      aria-live="polite"
                      className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full border border-amber-300/80 bg-amber-100/90 px-2.5 font-mono text-xs font-bold tabular-nums text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors duration-300 group-hover:border-amber-400 group-hover:bg-amber-200/80"
                    >
                      {isServerLoading ? (
                        <span className="inline-block h-3 w-4 animate-pulse rounded-full bg-amber-300/90" />
                      ) : (
                        submittedMissingDocsCount
                      )}
                    </span>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100/0 transition-colors duration-300 group-hover:bg-amber-100/70">
                      <ChevronRight className="h-3.5 w-3.5 text-amber-700 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 group-hover:text-amber-950" />
                    </div>
                  </div>
                </Link>
              ) : waitingRow ? (
                <Link
                  href={waitingRow.href}
                  className="group relative flex min-h-[54px] items-center justify-between rounded-full border border-amber-200/80 bg-gradient-to-r from-amber-50/80 via-white/90 to-amber-50/60 p-2 pr-3.5 shadow-[0_2px_10px_-3px_rgba(217,119,6,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-amber-300/90 hover:bg-white hover:shadow-[0_10px_25px_-5px_rgba(217,119,6,0.18),inset_0_1px_0_0_rgba(255,255,255,1)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-200/90 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform duration-300 ease-out group-hover:scale-105 group-hover:border-amber-300">
                      <Clock className="h-4 w-4 text-amber-700 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-bold tracking-tight text-amber-950 transition-colors group-hover:text-black">
                        {waitingRow.label}
                      </p>
                      <p className="truncate text-[11px] font-medium text-amber-800/75">
                        {waitingRow.hint}
                      </p>
                    </div>
                  </div>

                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span
                      aria-live="polite"
                      className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full border border-amber-300/80 bg-amber-100/90 px-2.5 font-mono text-xs font-bold tabular-nums text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors duration-300 group-hover:border-amber-400 group-hover:bg-amber-200/80"
                    >
                      {outboxAttentionCount}
                    </span>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100/0 transition-colors duration-300 group-hover:bg-amber-100/70">
                      <ChevronRight className="h-3.5 w-3.5 text-amber-700 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 group-hover:text-amber-950" />
                    </div>
                  </div>
                </Link>
              ) : null}

              {/* Row 2: Bank details needed - Encircled Pill Architecture */}
              <Link
                href={bankRow.href}
                className="group relative flex min-h-[54px] items-center justify-between rounded-full border border-amber-200/80 bg-gradient-to-r from-amber-50/80 via-white/90 to-amber-50/60 p-2 pr-3.5 shadow-[0_2px_10px_-3px_rgba(217,119,6,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-amber-300/90 hover:bg-white hover:shadow-[0_10px_25px_-5px_rgba(217,119,6,0.18),inset_0_1px_0_0_rgba(255,255,255,1)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                {/* Left Content: Encircled Icon Orb + Crisp Hierarchy */}
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-200/90 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform duration-300 ease-out group-hover:scale-105 group-hover:border-amber-300 group-hover:from-amber-200/70 group-hover:to-amber-100">
                    <Landmark className="h-4 w-4 text-amber-700 transition-transform duration-300 group-hover:rotate-[-4deg]" />
                  </div>

                  <div className="min-w-0 text-left">
                    <p className="truncate text-xs font-bold tracking-tight text-amber-950 transition-colors group-hover:text-black">
                      {bankRow.label}
                    </p>
                    <p className="truncate text-[11px] font-medium text-amber-800/75">
                      {bankRow.hint}
                    </p>
                  </div>
                </div>

                {/* Right Content: Encircled Metric Pill + Animated Chevron */}
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <span
                    aria-live="polite"
                    className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full border border-amber-300/80 bg-amber-100/90 px-2.5 font-mono text-xs font-bold tabular-nums text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors duration-300 group-hover:border-amber-400 group-hover:bg-amber-200/80"
                  >
                    {isServerLoading ? (
                      <span className="inline-block h-3 w-4 animate-pulse rounded-full bg-amber-300/90" />
                    ) : (
                      approvedBankPendingCount
                    )}
                  </span>

                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100/0 transition-colors duration-300 group-hover:bg-amber-100/70">
                    <ChevronRight className="h-3.5 w-3.5 text-amber-700 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 group-hover:text-amber-950" />
                  </div>
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export { PendingActionsCard };
