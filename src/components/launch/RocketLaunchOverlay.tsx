'use client';

import React from 'react';
import { useLaunchTransitionStore } from '@/store/useLaunchTransitionStore';
import { RocketPillVisual } from './RocketPillVisual';
import './rocket-launch.css';

const STARS = [
  { top: '14%', left: '16%', size: 10, delay: '0s' },
  { top: '20%', left: '78%', size: 12, delay: '0.25s' },
  { top: '12%', left: '54%', size: 8, delay: '0.45s' },
  { top: '28%', left: '88%', size: 9, delay: '0.15s' },
  { top: '26%', left: '26%', size: 7, delay: '0.55s' },
] as const;

const AllianceIndiaFallbackLogo = React.memo(function AllianceIndiaFallbackLogo() {
  return (
    <div className="flex flex-col items-start leading-none select-none">
      <div className="relative flex items-baseline text-[26px] sm:text-[30px] font-extrabold tracking-tight text-slate-800">
        <span>Allianc</span>
        <span className="relative text-[#f58220]">
          e
          <span
            aria-hidden="true"
            className="absolute -top-2 -right-2 text-[13px] font-black text-slate-900 leading-none"
          >
            &gt;
          </span>
        </span>
      </div>
      <span className="text-[15px] sm:text-[17px] font-semibold tracking-wide text-slate-700 -mt-0.5">
        India
      </span>
    </div>
  );
});

const CloudBankSVG = React.memo(function CloudBankSVG({
  gradientId,
  className = '',
}: {
  gradientId: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 640 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="320" y1="20" x2="320" y2="275" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="72%" stopColor="#F0F9FF" />
          <stop offset="100%" stopColor="#CFE8FF" />
        </linearGradient>
      </defs>
      <path
        d="M52 250C22 250 0 227 0 198C0 171 20 149 46 146C55 104 92 72 137 72C155 72 172 78 186 87C208 45 253 16 305 16C364 16 414 54 431 107C445 99 462 94 480 94C526 94 565 127 573 171C611 175 640 206 640 244C640 264 624 280 604 280H52V250Z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
});

export function RocketLaunchOverlay() {
  const phase = useLaunchTransitionStore((s) => s.phase);
  const origin = useLaunchTransitionStore((s) => s.origin);
  const label = useLaunchTransitionStore((s) => s.label);
  const logoSrc = useLaunchTransitionStore((s) => s.logoSrc);
  const loadingText = useLaunchTransitionStore((s) => s.loadingText);

  if (phase === 'idle') return null;

  if (phase === 'reduced') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Launching new survey"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-b from-[#133891]/95 via-[#2563eb]/95 to-[#60a5fa]/95 select-none"
      >
        <div className="px-8 py-6 rounded-3xl bg-white/95 shadow-2xl flex flex-col items-center gap-2">
          {logoSrc ? (
            <img src={logoSrc} alt="Alliance India" className="h-12 w-auto object-contain" />
          ) : (
            <AllianceIndiaFallbackLogo />
          )}
          <span className="text-xs font-medium text-slate-500">{loadingText}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Launching new survey"
      className="fixed inset-0 z-[9999] overflow-hidden select-none"
    >
      {/* 1) Cosmic Sky Veil */}
      <div
        className="rsl-gpu absolute inset-0 bg-gradient-to-b from-[#0f2d7a] via-[#2563eb] to-[#7dd3fc]"
        style={{ animation: 'rsl-sky-backdrop 3000ms ease-in-out forwards' }}
      >
        {STARS.map((star, idx) => (
          <svg
            key={idx}
            viewBox="0 0 24 24"
            fill="white"
            className="absolute pointer-events-none"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              animation: `rsl-twinkle 1.4s ease-in-out ${star.delay} infinite`,
            }}
          >
            <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2L12 0Z" />
          </svg>
        ))}
      </div>

      {/* 2) Detached Flying Rocket & Contrail (0.00s - 0.95s) */}
      {origin && (
        <>
          <div
            className="rsl-gpu pointer-events-none fixed rounded-full bg-gradient-to-r from-amber-200/80 via-white/90 to-transparent blur-md"
            style={{
              top: origin.top + origin.height * 0.5,
              left: origin.left + 8,
              width: 68,
              height: 68,
              animation: 'rsl-launch-puff 3000ms ease-out forwards',
            }}
          />

          <div
            className="rsl-gpu pointer-events-none fixed origin-left rounded-full bg-gradient-to-r from-transparent via-amber-200/80 to-white/95 blur-[3px]"
            style={{
              top: origin.top + origin.height * 0.5 - 7,
              left: Math.max(0, origin.left - 30),
              width: '100vw',
              height: 14,
              animation: 'rsl-contrail 3000ms cubic-bezier(0.32, 0.08, 0.24, 1) forwards',
            }}
          />

          <div
            className="rsl-gpu pointer-events-none fixed z-30"
            style={
              {
                top: origin.top,
                left: origin.left,
                width: origin.width,
                height: origin.height,
                '--rsl-recoil': `${origin.recoilX}px`,
                '--rsl-travel': `${origin.travelX}px`,
                animation: 'rsl-rocket-flight 3000ms cubic-bezier(0.55, 0.04, 0.82, 0.28) forwards',
              } as React.CSSProperties
            }
          >
            <RocketPillVisual label={label} isBoosting />
          </div>
        </>
      )}

      {/* 3) Back Cloud Banks */}
      <div
        className="rsl-gpu pointer-events-none absolute -top-12 inset-x-0 flex justify-center z-10"
        style={{ animation: 'rsl-cloud-top-in-out 3000ms cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        <CloudBankSVG gradientId="rslCloudTop" className="w-[115vw] max-w-[1100px] opacity-70 rotate-180" />
      </div>

      <div
        className="rsl-gpu pointer-events-none absolute top-[14%] -left-[12%] z-10"
        style={{ animation: 'rsl-cloud-left-in-out 3000ms cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        <CloudBankSVG gradientId="rslCloudBackL" className="w-[78vw] max-w-[760px] opacity-90" />
      </div>

      <div
        className="rsl-gpu pointer-events-none absolute top-[18%] -right-[12%] z-10"
        style={{ animation: 'rsl-cloud-right-in-out 3000ms cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        <CloudBankSVG gradientId="rslCloudBackR" className="w-[78vw] max-w-[760px] opacity-90 -scale-x-100" />
      </div>

      {/* 4) Alliance India Logo Nestled Between Cloud Layers */}
      <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
        <div
          className="rsl-gpu relative flex flex-col items-center"
          style={{ animation: 'rsl-logo-showcase 3000ms cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
        >
          <div
            aria-hidden="true"
            className="absolute -inset-10 rounded-full bg-radial from-white/95 via-amber-100/60 to-transparent blur-2xl"
          />

          <div className="relative flex flex-col items-center gap-3 px-9 py-6 sm:px-12 sm:py-7 rounded-[2rem] bg-white/95 border border-white shadow-[0_20px_60px_rgba(15,45,122,0.24),0_0_0_6px_rgba(255,255,255,0.4)]">
            {logoSrc ? (
              <img src={logoSrc} alt="Alliance India" className="h-12 sm:h-14 w-auto object-contain" />
            ) : (
              <AllianceIndiaFallbackLogo />
            )}

            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs sm:text-[13px] font-semibold tracking-wide text-sky-900/75">
                {loadingText}
              </span>
              <div className="w-28 h-1 rounded-full bg-sky-100 overflow-hidden">
                <div
                  className="rsl-gpu w-full h-full origin-left rounded-full bg-gradient-to-r from-teal-400 via-sky-500 to-amber-400"
                  style={{ animation: 'rsl-progress-fill 3000ms ease-out forwards' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5) Foreground Cloud Pillows */}
      <div
        className="rsl-gpu pointer-events-none absolute -bottom-10 -left-[10%] z-30"
        style={{ animation: 'rsl-cloud-left-in-out 3000ms cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        <CloudBankSVG gradientId="rslCloudFrontL" className="w-[74vw] max-w-[700px]" />
      </div>

      <div
        className="rsl-gpu pointer-events-none absolute -bottom-10 -right-[10%] z-30"
        style={{ animation: 'rsl-cloud-right-in-out 3000ms cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        <CloudBankSVG gradientId="rslCloudFrontR" className="w-[74vw] max-w-[700px] -scale-x-100" />
      </div>

      <div
        className="rsl-gpu pointer-events-none absolute -bottom-14 inset-x-0 flex justify-center z-30"
        style={{ animation: 'rsl-cloud-bottom-in-out 3000ms cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        <CloudBankSVG gradientId="rslCloudBottom" className="w-[105vw] max-w-[960px]" />
      </div>
    </div>
  );
}
