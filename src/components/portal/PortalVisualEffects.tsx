'use client';

import React from 'react';
import { PORTAL_DEFINITIONS, type PortalId } from '@/lib/portal/portalWarmCache';

interface OverlayProps {
  active: boolean;
  variant?: 'mobile' | 'desktop';
}

/**
 * 1. Drafts: Golden solar-lantern bloom + gentle rising page/light arcs.
 * Uses pre-rendered GPU-composited layers (transform + opacity only).
 */
export const DraftsPortalOverlay: React.FC<OverlayProps> = ({ active, variant = 'mobile' }) => {
  return (
    <span
      aria-hidden="true"
      data-portal-effect="drafts-lantern-bloom"
      data-portal-active={active ? 'true' : 'false'}
      className="pointer-events-none absolute inset-0 overflow-visible flex items-center justify-center"
    >
      {/* Solar-lantern radial bloom */}
      <span
        className={`absolute inset-[-12%] rounded-full will-change-transform transition-opacity duration-300 ${
          active ? 'opacity-100 portal-drafts-bloom' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(circle, rgba(254, 240, 138, 0.72) 0%, rgba(251, 191, 36, 0.36) 48%, rgba(251, 191, 36, 0) 76%)',
        }}
      />

      {/* Rising golden page arc 1 */}
      <svg
        viewBox="0 0 80 80"
        className={`absolute ${variant === 'mobile' ? 'w-[86%] h-[86%]' : 'w-[92%] h-[92%]'} will-change-transform ${
          active ? 'portal-drafts-arc-one' : 'opacity-0'
        }`}
        fill="none"
      >
        <path
          d="M16 48 Q40 22 64 48"
          stroke="#FEF08A"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M22 57 Q40 36 58 57"
          stroke="#FDE047"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeOpacity="0.85"
        />
      </svg>

      {/* Rising golden light arc 2 */}
      <svg
        viewBox="0 0 80 80"
        className={`absolute ${variant === 'mobile' ? 'w-[76%] h-[76%]' : 'w-[82%] h-[82%]'} will-change-transform ${
          active ? 'portal-drafts-arc-two' : 'opacity-0'
        }`}
        fill="none"
      >
        <path
          d="M24 38 Q40 16 56 38"
          stroke="#FFFBEB"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
};

/**
 * 2. Missing Docs: Actual 360° luminous ring scan + one soft beacon ripple.
 * Strictly transform + opacity only.
 */
export const DocsPortalOverlay: React.FC<OverlayProps> = ({ active, variant = 'mobile' }) => {
  return (
    <span
      aria-hidden="true"
      data-portal-effect="docs-ring-scan"
      data-portal-active={active ? 'true' : 'false'}
      className="pointer-events-none absolute inset-0 overflow-visible flex items-center justify-center"
    >
      {/* Soft coral beacon ripple */}
      <span
        className={`absolute inset-[14%] rounded-full border-2 border-[#FFD7CF]/80 will-change-transform ${
          active ? 'portal-docs-beacon' : 'opacity-0'
        }`}
        style={{
          boxShadow: '0 0 18px rgba(255, 168, 152, 0.55)',
        }}
      />

      {/* Tilted orbital 360-degree luminous scan plane */}
      <span
        className="absolute inset-0 flex items-center justify-center will-change-transform"
        style={{
          transform: variant === 'mobile' ? 'rotate(-14deg) scaleY(0.42)' : 'rotate(-12deg) scaleY(0.44)',
        }}
      >
        <svg
          viewBox="0 0 120 120"
          className={`w-[106%] h-[106%] will-change-transform ${
            active ? 'portal-docs-scan-360' : 'opacity-0'
          }`}
          fill="none"
        >
          <circle
            cx="60"
            cy="60"
            r="52"
            stroke="url(#portalDocsScanGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="96 232"
          />
          <circle
            cx="60"
            cy="8"
            r="4.2"
            fill="#FFF3EF"
          />
          <defs>
            <linearGradient id="portalDocsScanGrad" x1="16" y1="8" x2="108" y2="96" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFF7F5" stopOpacity="1" />
              <stop offset="55%" stopColor="#FFB4A5" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#FF7C66" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </span>
    </span>
  );
};

/**
 * 3. Bank Details: Emerald vault-iris contraction & release + small golden light-seed ripple.
 * Strictly transform + opacity only.
 */
export const BankPortalOverlay: React.FC<OverlayProps> = ({ active, variant = 'mobile' }) => {
  return (
    <span
      aria-hidden="true"
      data-portal-effect="bank-vault-iris"
      data-portal-active={active ? 'true' : 'false'}
      className="pointer-events-none absolute inset-0 overflow-visible flex items-center justify-center"
    >
      {/* Contracting & releasing hexagonal emerald vault iris */}
      <svg
        viewBox="0 0 100 100"
        className={`absolute ${variant === 'mobile' ? 'w-[84%] h-[84%]' : 'w-[88%] h-[88%]'} will-change-transform ${
          active ? 'portal-bank-iris-pulse' : 'opacity-0'
        }`}
        fill="none"
      >
        <polygon
          points="50,7 87,28.5 87,71.5 50,93 13,71.5 13,28.5"
          stroke="#A7F3D0"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <circle
          cx="50"
          cy="50"
          r="26"
          stroke="#34D399"
          strokeWidth="2"
          strokeDasharray="12 6"
        />
      </svg>

      {/* Small golden light-seed ripple */}
      <span
        className={`absolute w-8 h-8 rounded-full will-change-transform ${
          active ? 'portal-bank-seed-ripple' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(circle, rgba(254, 240, 138, 0.96) 0%, rgba(251, 191, 36, 0.45) 55%, rgba(251, 191, 36, 0) 80%)',
        }}
      />
    </span>
  );
};

/**
 * 4. Submitted Surveys: Horizon golden aura behind the rising Sun layer.
 */
export const SubmittedPortalGlow: React.FC<OverlayProps> = ({ active }) => {
  return (
    <span
      aria-hidden="true"
      data-portal-effect="submitted-sun-rise"
      data-portal-active={active ? 'true' : 'false'}
      className={`pointer-events-none absolute -inset-4 rounded-full will-change-transform transition-opacity duration-300 ${
        active ? 'opacity-100 portal-submitted-aura' : 'opacity-0'
      }`}
      style={{
        background:
          'radial-gradient(circle, rgba(254, 240, 138, 0.85) 0%, rgba(253, 186, 116, 0.4) 48%, rgba(253, 186, 116, 0) 76%)',
      }}
    />
  );
};

/**
 * Polite, non-blocking slow-loading status banner shown in the dashboard status area
 * when destination transitions take longer than the brief beat.
 */
export const PortalStatusIndicator: React.FC<{
  activePortal: PortalId | null;
  slowPortal: PortalId | null;
  statusMessage: string;
  className?: string;
}> = ({ activePortal, slowPortal, statusMessage, className = '' }) => {
  const effectivePortal = slowPortal || activePortal;
  const resolvedText =
    statusMessage || (effectivePortal ? PORTAL_DEFINITIONS[effectivePortal].slowLoadingText : '');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={className}
    >
      {/* Screen-reader immediate announcement on activation */}
      {!slowPortal && resolvedText && (
        <span className="sr-only">{resolvedText}</span>
      )}

      {/* Calm visible pill only if transition persists past the 340ms beat */}
      {slowPortal && resolvedText && (
        <div
          data-testid="portal-slow-loading-banner"
          className="inline-flex items-center gap-2 rounded-full bg-[#092359]/92 text-white px-4 py-2 text-xs font-semibold tracking-wide shadow-lg border border-white/25 backdrop-blur-md"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-amber-300 animate-pulse shrink-0"
          />
          <span>{resolvedText}</span>
        </div>
      )}
    </div>
  );
};
