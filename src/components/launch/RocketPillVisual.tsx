'use client';

import React, { useId } from 'react';
import { ChevronRight, Plus } from 'lucide-react';

export const RocketPillVisual = React.memo(function RocketPillVisual({
  label,
  isBoosting = false,
}: {
  label: string;
  isBoosting?: boolean;
}) {
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const hullGradId = `hull_${safeId}`;
  const finGradId = `fin_${safeId}`;
  const flameGradId = `flame_${safeId}`;

  return (
    <div className="relative flex items-center w-full h-full select-none">
      {/* Spaceship SVG Vector */}
      <svg
        viewBox="0 0 360 70"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_8px_18px_rgba(6,24,78,0.45)]"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={hullGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="56%" stopColor="#F0F7FF" />
            <stop offset="86%" stopColor="#CBE4FF" />
            <stop offset="100%" stopColor="#93C5FD" />
          </linearGradient>
          <linearGradient id={finGradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#C2410C" />
          </linearGradient>
          <linearGradient id={flameGradId} x1="1" y1="0.5" x2="0" y2="0.5">
            <stop offset="0%" stopColor="#FEF9C3" />
            <stop offset="35%" stopColor="#FACC15" />
            <stop offset="72%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal flickering exhaust flame shooting LEFT */}
        <g className={isBoosting ? 'rsl-flame-boost' : 'rsl-flame-idle'}>
          <path
            d={isBoosting ? 'M54 25 C24 22 4 29 -32 35 C4 41 24 48 54 45 Z' : 'M54 27 C34 25 18 30 2 35 C18 40 34 45 54 43 Z'}
            fill={`url(#${flameGradId})`}
          />
          <path
            d={isBoosting ? 'M54 29 C36 29 20 31.5 6 35 C20 38.5 36 41 54 41 Z' : 'M54 30.5 C42 30.5 31 32.5 20 35 C31 37.5 42 39.5 54 39.5 Z'}
            fill="#FEFCE8"
          />
        </g>

        {/* Metallic thruster nozzle */}
        <path
          d="M51 25 L63 22 L63 48 L51 45 Z"
          fill="#475569"
          stroke="#1E293B"
          strokeWidth="1.4"
        />
        <line
          x1="56"
          y1="24"
          x2="56"
          y2="46"
          stroke="#94A3B8"
          strokeWidth="1.5"
          opacity="0.7"
        />

        {/* Top & bottom aerodynamic orange rear fins */}
        <path
          d="M65 20 C76 9 95 7 110 11 L86 22 Z"
          fill={`url(#${finGradId})`}
          stroke="#9A3412"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M65 50 C76 61 95 63 110 59 L86 48 Z"
          fill={`url(#${finGradId})`}
          stroke="#9A3412"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />

        {/* Main aerodynamic white fuselage pointing RIGHT */}
        <path
          d="M62 22 C88 10 164 6 254 7 C308 8 349 18 354 35 C349 52 308 62 254 63 C164 64 88 60 62 48 Z"
          fill={`url(#${hullGradId})`}
          stroke="#2563EB"
          strokeWidth="1.6"
        />

        {/* Glossy comic upper specular highlight */}
        <path
          d="M88 16 C158 11 246 11 312 16"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.95"
        />
        {/* Subtle nose panel contour */}
        <path
          d="M312 15 C329 19 341 26 346 35 C341 44 329 51 312 55"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.32"
        />
      </svg>

      {/* Foreground CTA content cleanly centered inside fuselage */}
      <div className="relative z-10 flex w-full items-center justify-between pl-[76px] pr-7 bg-transparent border-none p-0 text-left pointer-events-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-[0_3px_8px_rgba(13,148,136,0.45)] ring-2 ring-white/85">
            <Plus className="w-5 h-5 stroke-[2.75]" />
          </span>
          <span className="truncate text-[15px] font-extrabold tracking-[-0.015em] text-[#0B132B]">
            {label}
          </span>
        </div>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-[#0B132B]"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </div>
    </div>
  );
});
