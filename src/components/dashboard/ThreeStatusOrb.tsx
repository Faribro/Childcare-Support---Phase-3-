'use client';

/**
 * ThreeStatusOrb — Glassmorphic 3D Soccer Ball (Truncated Icosahedron)
 *
 * Design decisions (approved 2026-11-19):
 *   - Crystalline polyhedron faces at ~18% opacity (Option A)
 *   - Tilted equatorial torus rim in gyroscopic/orbital style (Option A)
 *   - Ultra-slow rotation: 1 full rotation ≈ every 25 s (Option A)
 *   - True glassmorphism: curved Bezier tube seams + translucent polygon faces
 *   - Text legibility: canvas sits behind all foreground content (z-index: auto)
 *   - WebGL fallback: soft CSS radial shimmer sphere when WebGL is unavailable
 *   - Reduced-motion: auto-paused on `prefers-reduced-motion: reduce`
 *   - IntersectionObserver: pauses animation when scrolled off-screen
 *   - Tab-visibility: pauses when tab is hidden
 *   - Geometry is shared once per module (singleton cache)
 *   - Proper Three.js disposal on unmount
 */

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

// ─── Public Props ────────────────────────────────────────────────────────────

export interface ThreeStatusOrbProps {
  variant: 'teal' | 'rose' | 'amber';
  count: number;
  isAllClear?: boolean;
  className?: string;
}

// ─── Color Palettes ───────────────────────────────────────────────────────────

const COLOR_MAP = {
  teal: {
    seam:   0x14b8a6, // tube seams
    face:   0x0d9488, // polygon fill
    rim:    0x5eead4, // equatorial torus
    point:  0x99f6e4, // sparkle particles
    light:  0x2dd4bf, // point light
    css:    'rgba(20,184,166,0.18)',
    cssRim: 'rgba(94,234,212,0.35)',
  },
  rose: {
    seam:   0xf43f5e,
    face:   0xe11d48,
    rim:    0xfb7185,
    point:  0xfecdd3,
    light:  0xff8599,
    css:    'rgba(244,63,94,0.18)',
    cssRim: 'rgba(251,113,133,0.35)',
  },
  amber: {
    seam:   0xf59e0b,
    face:   0xd97706,
    rim:    0xfbbf24,
    point:  0xfde68a,
    light:  0xfcd34d,
    css:    'rgba(245,158,11,0.18)',
    cssRim: 'rgba(251,191,36,0.35)',
  },
} as const;

// ─── Soccer Ball (Truncated Icosahedron) Geometry Cache ───────────────────────
// Built once per module load; shared across all orb instances.

interface SoccerBallGeometry {
  seamCurves: THREE.QuadraticBezierCurve3[];
  faceVertices: Float32Array;
  faceIndices: number[];
  radius: number;
}

let _cachedGeometry: SoccerBallGeometry | null = null;

function getSoccerBallGeometry(): SoccerBallGeometry {
  if (_cachedGeometry) return _cachedGeometry;

  // 60 vertices of the truncated icosahedron using golden ratio φ
  // Scaled to unit radius ≈ 1.4 for the orb interior
  const scale = 0.37; // tuned so ball fits comfortably inside the card circle
  const phi = (1.0 + Math.sqrt(5.0)) / 2.0;

  const a = 0.0  * scale;
  const b = 1.0  * scale;
  const c = 2.0  * scale;
  const d = phi  * scale;
  const e = 3.0 * phi * scale;
  const f = (1.0 + 2.0 * phi) * scale;
  const g = (2.0 + phi) * scale;
  const h = 2.0 * phi * scale;

  const raw: [number, number, number][] = [
    [+a, +b, +e], [+a, +b, -e], [+a, -b, +e], [+a, -b, -e],
    [+b, +e, +a], [+b, -e, +a], [-b, +e, +a], [-b, -e, +a],
    [+e, +a, +b], [-e, +a, +b], [+e, +a, -b], [-e, +a, -b],

    [+c, +f, +d], [+c, +f, -d], [+c, -f, +d], [-c, +f, +d],
    [+c, -f, -d], [-c, +f, -d], [-c, -f, +d], [-c, -f, -d],

    [+f, +d, +c], [+f, -d, +c], [-f, +d, +c], [+f, +d, -c],
    [-f, -d, +c], [+f, -d, -c], [-f, +d, -c], [-f, -d, -c],
    [+d, +c, +f], [-d, +c, +f], [+d, +c, -f], [+d, -c, +f],
    [-d, +c, -f], [-d, -c, +f], [+d, -c, -f], [-d, -c, -f],

    [+b, +g, +h], [+b, +g, -h], [+b, -g, +h], [-b, +g, +h],
    [+b, -g, -h], [-b, +g, -h], [-b, -g, +h], [-b, -g, -h],

    [+g, +h, +b], [+g, -h, +b], [-g, +h, +b], [+g, +h, -b],
    [-g, -h, +b], [+g, -h, -b], [-g, +h, -b], [-g, -h, -b],

    [+h, +b, +g], [-h, +b, +g], [+h, +b, -g], [+h, -b, +g],
    [-h, +b, -g], [-h, -b, +g], [+h, -b, -g], [-h, -b, -g],
  ];

  // Radius of the circumsphere
  const p0 = new THREE.Vector3(0, 0, 0);
  const radius = new THREE.Vector3(raw[0][0], raw[0][1], raw[0][2]).distanceTo(p0);

  // ── Bezier seam curves (edges where distance ≈ c) ──────────────────────────
  const seamCurves: THREE.QuadraticBezierCurve3[] = [];
  const edgeLengthThreshold = c * 1.01; // small tolerance for floating point

  for (let i = 0; i < raw.length; i++) {
    for (let j = i + 1; j < raw.length; j++) {
      const p1 = new THREE.Vector3(raw[i][0], raw[i][1], raw[i][2]);
      const p2 = new THREE.Vector3(raw[j][0], raw[j][1], raw[j][2]);
      const dist = p1.distanceTo(p2);
      if (dist > edgeLengthThreshold) continue;

      // Control point: midpoint projected outward along the sphere surface
      const mid = new THREE.Vector3(
        (raw[i][0] + raw[j][0]) / 2,
        (raw[i][1] + raw[j][1]) / 2,
        (raw[i][2] + raw[j][2]) / 2,
      );
      const scaleFactor = p1.distanceTo(p0) / mid.distanceTo(p0);
      const ctrl = new THREE.Vector3(
        mid.x * scaleFactor * scaleFactor,
        mid.y * scaleFactor * scaleFactor,
        mid.z * scaleFactor * scaleFactor,
      );
      seamCurves.push(new THREE.QuadraticBezierCurve3(p1, ctrl, p2));
    }
  }

  // ── Triangulated polyhedron faces (12 pentagons + 20 hexagons) ────────────
  // Pentagon face vertex indices
  const pentagonFaces = [
    [0, 28, 36, 39, 29],
    [1, 32, 41, 37, 30],
    [2, 33, 42, 38, 31],
    [3, 34, 40, 43, 35],
    [4, 12, 44, 47, 13],
    [5, 16, 49, 45, 14],
    [6, 17, 50, 46, 15],
    [7, 18, 48, 51, 19],
    [8, 20, 52, 55, 21],
    [9, 24, 57, 53, 22],
    [10, 25, 58, 54, 23],
    [11, 26, 56, 59, 27],
  ];

  // Hexagon face vertex indices
  const hexagonFaces = [
    [0, 2, 31, 55, 52, 28],
    [0, 29, 53, 57, 33, 2],
    [1, 3, 35, 59, 56, 32],
    [1, 30, 54, 58, 34, 3],
    [4, 6, 15, 39, 36, 12],
    [4, 13, 37, 41, 17, 6],
    [5, 7, 19, 43, 40, 16],
    [5, 14, 38, 42, 18, 7],
    [8, 10, 23, 47, 44, 20],
    [8, 21, 45, 49, 25, 10],
    [9, 11, 27, 51, 48, 24],
    [9, 22, 46, 50, 26, 11],
    [12, 36, 28, 52, 20, 44],
    [13, 47, 23, 54, 30, 37],
    [14, 45, 21, 55, 31, 38],
    [15, 46, 22, 53, 29, 39],
    [16, 40, 34, 58, 25, 49],
    [17, 41, 32, 56, 26, 50],
    [18, 42, 33, 57, 24, 48],
    [19, 51, 27, 59, 35, 43],
  ];

  const allFaces = [...pentagonFaces, ...hexagonFaces];

  // Fan-triangulate each face from vertex 0
  const faceIndices: number[] = [];
  for (const face of allFaces) {
    for (let k = 1; k < face.length - 1; k++) {
      faceIndices.push(face[0], face[k], face[k + 1]);
    }
  }

  // Build flat vertex array for PolyhedronGeometry
  const faceVertices = new Float32Array(raw.length * 3);
  for (let i = 0; i < raw.length; i++) {
    faceVertices[i * 3]     = raw[i][0];
    faceVertices[i * 3 + 1] = raw[i][1];
    faceVertices[i * 3 + 2] = raw[i][2];
  }

  _cachedGeometry = { seamCurves, faceVertices, faceIndices, radius };
  return _cachedGeometry;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ThreeStatusOrb({
  variant,
  count,
  isAllClear = false,
  className = '',
}: ThreeStatusOrbProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    // ── Reduced motion check ─────────────────────────────────────────────────
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── WebGL renderer ───────────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'default', // avoids draining battery on mobile
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    // Verify the context was actually created (some env/jsdom return null)
    if (!renderer.getContext()) {
      renderer.dispose();
      setWebglFailed(true);
      return;
    }

    const colors = COLOR_MAP[variant] ?? COLOR_MAP.teal;

    const setSize = () => {
      if (!container || !renderer) return;
      const w = container.clientWidth  || 240;
      const h = container.clientHeight || 240;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const w = container.clientWidth  || 240;
    const h = container.clientHeight || 240;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      1.75, // cap for mobile GPU safety
    ));

    // ── Scene & Camera ───────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.z = 4.2;

    // ── Lighting ─────────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(colors.light, 1.6, 15);
    pointLight.position.set(2.5, 2.5, 3);
    scene.add(pointLight);

    const fillLight = new THREE.PointLight(0xffffff, 0.4, 15);
    fillLight.position.set(-2, -1, 2);
    scene.add(fillLight);

    // ── Build the soccer ball ────────────────────────────────────────────────
    const { seamCurves, faceVertices, faceIndices, radius } = getSoccerBallGeometry();

    const ball = new THREE.Object3D();

    // Face opacity: slightly higher when there's something needing attention
    const faceOpacity = isAllClear ? 0.14 : 0.19;

    // 1. Crystalline polygon faces (Option A — ~18% transparency)
    const faceMaterial = new THREE.MeshLambertMaterial({
      color: colors.face,
      transparent: true,
      opacity: faceOpacity,
      side: THREE.DoubleSide,
      depthWrite: false, // ensures transparency composites correctly
    });
    // THREE.PolyhedronGeometry signature: (vertices, indices, radius, detail)
    const polyGeom = new THREE.PolyhedronGeometry(
      Array.from(faceVertices) as unknown as number[],
      faceIndices,
      radius,
      1, // subdivision level 1 → smooth-ish without excess geometry
    );
    const faceMesh = new THREE.Mesh(polyGeom, faceMaterial);
    ball.add(faceMesh);

    // 2. Curved Bezier tube seams (the distinctive soccer ball lines)
    const seamMaterial = new THREE.MeshBasicMaterial({
      color: colors.seam,
      transparent: true,
      opacity: isAllClear ? 0.38 : 0.52,
    });
    // Collect all tube geometries for disposal
    const tubeGeoms: THREE.TubeGeometry[] = [];
    for (const curve of seamCurves) {
      const tubeGeom = new THREE.TubeGeometry(curve, 6, 0.011, 4, false);
      tubeGeoms.push(tubeGeom);
      ball.add(new THREE.Mesh(tubeGeom, seamMaterial));
    }

    scene.add(ball);

    // 3. Equatorial torus rim (Option A — tilted gyroscopic ring)
    const rimMaterial = new THREE.MeshBasicMaterial({
      color: colors.rim,
      transparent: true,
      opacity: isAllClear ? 0.30 : 0.42,
    });
    const rimGeom = new THREE.TorusGeometry(radius * 1.08, 0.016, 12, 96);
    const rim = new THREE.Mesh(rimGeom, rimMaterial);
    rim.position.z = radius / 7;
    // Slight tilt for the gyroscopic/orbital look
    rim.rotation.x = Math.PI / 5;
    rim.rotation.y = Math.PI / 8;
    scene.add(rim);

    // 4. Soft sparkle particle halo (very subtle — 32 points)
    const pCount = 32;
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount * 3; i += 3) {
      const r     = radius * 1.18 + Math.random() * radius * 0.22;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pPositions[i]     = r * Math.sin(phi) * Math.cos(theta);
      pPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPositions[i + 2] = r * Math.cos(phi);
    }
    const pGeom = new THREE.BufferGeometry();
    pGeom.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      size:        0.035,
      color:       colors.point,
      transparent: true,
      opacity:     0.55,
      blending:    THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(pGeom, pMat);
    scene.add(particles);

    // ── Rotation speed ───────────────────────────────────────────────────────
    // Target: 1 full rotation (2π) ≈ 25 s at 60 fps
    // Δrot per frame = 2π / (25 × 60) ≈ 0.004189 rad/frame
    // X-axis rotates at half speed for the gentle rolling illusion
    const ROT_Y = (2 * Math.PI) / (25 * 60); // ≈ 0.004189
    const ROT_X = ROT_Y * 0.5;              // ≈ 0.002094

    // ── Mouse parallax ───────────────────────────────────────────────────────
    let targetTiltX = 0;
    let targetTiltY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      const ny = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      // Gentle parallax: max ±0.15 rad tilt
      targetTiltY =  nx * 0.15;
      targetTiltX =  ny * 0.15;
    };
    container.addEventListener('mousemove', handleMouseMove, { passive: true });

    // ── Pause / resume state ─────────────────────────────────────────────────
    let isVisible = true;
    let animationId = 0;

    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    let ioObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      ioObserver = new IntersectionObserver(
        ([entry]) => { isVisible = entry.isIntersecting; },
        { threshold: 0.1 },
      );
      ioObserver.observe(container);
    }

    // ── Resize observer ───────────────────────────────────────────────────────
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(setSize);
      resizeObserver.observe(container);
    }

    // ── Animation loop ────────────────────────────────────────────────────────
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (!isVisible) return;

      if (!prefersReducedMotion) {
        // Slow base rotation
        ball.rotation.y += ROT_Y;
        ball.rotation.x += ROT_X;
        // Rim orbits slightly independently for the gyroscopic look
        rim.rotation.z  += ROT_Y * 0.6;
        // Particle cloud drifts opposite direction
        particles.rotation.y -= ROT_Y * 0.4;

        // Lazy approach towards mouse parallax tilt
        ball.rotation.x += (targetTiltX - ball.rotation.x) * 0.03;
        ball.rotation.y += (targetTiltY - ball.rotation.y) * 0.03;
      }

      renderer!.render(scene, camera);
    };

    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animationId);
      ioObserver?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      container.removeEventListener('mousemove', handleMouseMove);

      // Dispose all Three.js resources
      polyGeom.dispose();
      faceMaterial.dispose();
      for (const g of tubeGeoms) g.dispose();
      seamMaterial.dispose();
      rimGeom.dispose();
      rimMaterial.dispose();
      pGeom.dispose();
      pMat.dispose();
      renderer?.dispose();
    };
  }, [variant, count, isAllClear]); // re-run if variant or state changes

  // ── CSS fallback (no WebGL / SSR) ─────────────────────────────────────────
  if (webglFailed) {
    const pal = COLOR_MAP[variant] ?? COLOR_MAP.teal;
    return (
      <div
        className={`absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden ${className}`}
        aria-hidden="true"
        data-testid="orb-css-fallback"
      >
        {/* Soft gradient sphere silhouette */}
        <div
          style={{
            position: 'absolute',
            inset: '10%',
            borderRadius: '50%',
            background: `radial-gradient(circle at 38% 38%, ${pal.css}, transparent 70%)`,
            border: `1.5px solid ${pal.cssRim}`,
            opacity: 0.7,
          }}
        />
        {/* Two CSS concentric rings for the orbital look */}
        <div
          style={{
            position: 'absolute',
            inset: '6%',
            borderRadius: '50%',
            border: `1px solid ${pal.cssRim}`,
            opacity: 0.4,
            transform: 'rotate(-15deg)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '14%',
            borderRadius: '50%',
            border: `1px solid ${pal.cssRim}`,
            opacity: 0.25,
            transform: 'rotate(10deg)',
          }}
        />
      </div>
    );
  }

  // ── WebGL canvas ──────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden ${className}`}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      aria-hidden="true"
      data-testid="orb-webgl-canvas"
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

export default ThreeStatusOrb;

