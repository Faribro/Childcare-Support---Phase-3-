'use client';

import React from 'react';

export interface CosmicSpaceButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'comet' | 'nebula';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
}

const BUTTON_STYLES = `
  @keyframes cosmic-comet-shimmer {
    0%, 100% { opacity: 0.72; transform: translateX(0px); }
    50%      { opacity: 1;    transform: translateX(2px); }
  }
  @keyframes cosmic-star-pulse {
    0%, 100% { opacity: 0.55; transform: scale(0.85); }
    50%      { opacity: 1;    transform: scale(1.18); }
  }
  .cosmic-tail-anim {
    animation: cosmic-comet-shimmer 1.8s ease-in-out infinite;
  }
  .cosmic-spark-anim {
    animation: cosmic-star-pulse 2.2s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .cosmic-tail-anim, .cosmic-spark-anim { animation: none !important; }
  }
`;

export function CosmicSpaceButton({
  variant = 'comet',
  leftIcon,
  rightIcon,
  isLoading = false,
  disabled,
  children,
  className = '',
  style,
  ...props
}: CosmicSpaceButtonProps) {
  const isDisabled = disabled || isLoading;
  const isNebula = variant === 'nebula';

  const bgGradient = isDisabled
    ? 'linear-gradient(135deg, #CBD5E1 0%, #94A3B8 100%)'
    : isNebula
      ? 'linear-gradient(110deg, #6D28D9 0%, #A21CAF 52%, #BE185D 100%)'
      : 'linear-gradient(108deg, #D9480F 0%, #EA580C 28%, #E11D48 70%, #9D174D 100%)';

  const boxShadow = isDisabled
    ? 'none'
    : isNebula
      ? '0 8px 20px -4px rgba(162, 28, 175, 0.42), inset 0 1.5px 1px rgba(255, 255, 255, 0.42), inset 0 -2px 5px rgba(74, 4, 78, 0.35)'
      : '0 8px 20px -4px rgba(225, 29, 72, 0.42), inset 0 1.5px 1px rgba(254, 240, 138, 0.55), inset 0 -2px 5px rgba(136, 19, 55, 0.35)';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BUTTON_STYLES }} />
      <button
        type={props.type ?? 'button'}
        disabled={isDisabled}
        className={`group relative flex min-h-[48px] w-full items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 text-[14.5px] font-extrabold tracking-[-0.01em] text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70 ${
          isDisabled
            ? 'cursor-not-allowed opacity-75'
            : 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98]'
        } ${className}`}
        style={{
          background: bgGradient,
          boxShadow,
          border: isDisabled
            ? '1.5px solid rgba(148, 163, 184, 0.4)'
            : isNebula
              ? '1.5px solid rgba(249, 168, 212, 0.55)'
              : '1.5px solid rgba(253, 224, 71, 0.55)',
          ...style,
        }}
        {...props}
      >
        {/* ── Space-Object Inline SVG Artwork (Hidden cleanly when disabled) ── */}
        {!isDisabled && (
          <svg
            aria-hidden="true"
            viewBox="0 0 360 54"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <defs>
              <linearGradient id="comet-tail-gold" x1="1" y1="0.5" x2="0" y2="0.5">
                <stop offset="0%" stopColor="#FEF08A" stopOpacity="0.9" />
                <stop offset="55%" stopColor="#FBBF24" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#FB923C" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="nebula-orbit-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#FDE047" stopOpacity="0.15" />
                <stop offset="50%" stopColor="#F9A8D4" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#FDE047" stopOpacity="0.88" />
              </linearGradient>
            </defs>

            {/* Glossy comic upper rim shine */}
            <path
              d="M28 7 Q180 3 332 7"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.34"
            />

            {isNebula ? (
              /* ── Ringed Nebula Orbit Arc + Orbiting Star ── */
              <g>
                <path
                  d="M-10 42 Q180 6 370 24"
                  fill="none"
                  stroke="url(#nebula-orbit-grad)"
                  strokeWidth="2.6"
                />
                <circle
                  cx="326"
                  cy="19"
                  r="3.2"
                  fill="#FEF08A"
                  className="cosmic-spark-anim"
                />
                <circle cx="38" cy="18" r="1.5" fill="#F9A8D4" opacity="0.75" />
                <circle cx="58" cy="38" r="1.2" fill="#FFFFFF" opacity="0.55" />
              </g>
            ) : (
              /* ── Blazing Comet Stardust Tail (left) + Starburst Head (right) ── */
              <g>
                <g className="cosmic-tail-anim">
                  <path
                    d="M12 16 L84 16 L66 20 L8 20 Z"
                    fill="url(#comet-tail-gold)"
                    opacity="0.7"
                  />
                  <path
                    d="M4 26 L104 26 L82 30 L2 30 Z"
                    fill="url(#comet-tail-gold)"
                    opacity="0.85"
                  />
                  <path
                    d="M16 36 L74 36 L58 39 L12 39 Z"
                    fill="url(#comet-tail-gold)"
                    opacity="0.6"
                  />
                  <circle cx="42" cy="14" r="1.6" fill="#FEF08A" />
                  <circle cx="64" cy="39" r="1.3" fill="#FFFFFF" opacity="0.85" />
                </g>

                {/* Glowing 4-point comic star near comet nose (right) */}
                <path
                  d="M332 13 l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z"
                  fill="#FEF08A"
                  className="cosmic-spark-anim"
                />
                <circle cx="316" cy="38" r="1.5" fill="#FDE68A" opacity="0.85" />
              </g>
            )}
          </svg>
        )}

        {/* ── Foreground Label & Icons ── */}
        <span className="relative z-10 inline-flex items-center justify-center gap-2 drop-shadow-[0_1px_2px_rgba(69,10,10,0.45)]">
          {leftIcon && <span className="shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && (
            <span className="shrink-0 transition-transform duration-200 group-hover:translate-x-1">
              {rightIcon}
            </span>
          )}
        </span>
      </button>
    </>
  );
}

export default CosmicSpaceButton;
