'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Download, ShieldCheck, WifiOff, Smartphone } from 'lucide-react';

interface FinalCtaProps {
  canInstall: boolean;
  onInstallClick: () => void;
}

export function FinalCta({ canInstall, onInstallClick }: FinalCtaProps) {
  return (
    <section aria-labelledby="cta-heading" className="bg-[#0F261B] text-white relative overflow-hidden">
      {/* Torn paper edge transition from light notebook paper into dark leather dossier back cover */}
      <div className="w-full overflow-hidden leading-none z-10 relative">
        <svg
          className="relative block w-full h-8 sm:h-12 text-[#F7F3E9]"
          viewBox="0 0 1200 40"
          preserveAspectRatio="none"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0,0 L0,22 Q30,35 60,20 T120,24 T180,18 T240,28 T300,20 T360,26 T420,18 T480,26 T540,22 T600,28 T660,19 T720,27 T780,21 T840,29 T900,18 T960,26 T1020,20 T1080,28 T1140,22 T1200,25 L1200,0 Z" />
        </svg>
      </div>

      {/* Decorative background grid and ambient glow */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#80E5A3_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
      <div className="absolute top-12 -right-24 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 text-center space-y-6">
        {/* Archival Case Closure Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/90 border border-emerald-700/60 text-emerald-300 text-xs font-mono font-bold tracking-wider uppercase shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Ready For Field Deployment
        </div>

        <h2
          id="cta-heading"
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight"
        >
          Equip your field team with clarity and dignity.
        </h2>

        <p className="text-base sm:text-lg text-emerald-100/90 max-w-2xl mx-auto leading-relaxed font-normal">
          Start recording child nutrition, school continuity, and household support with resilient offline persistence.
          Minimizing lost paperwork through structured local draft preservation.
        </p>

        {/* Primary CTA Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/app"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl text-sm font-bold text-slate-900 bg-white hover:bg-emerald-50 transition-all cursor-pointer shadow-lg hover:shadow-xl transform active:scale-[0.98] min-h-[48px]"
          >
            <span>Open Field App</span>
            <ArrowRight className="w-4 h-4 text-emerald-800" />
          </Link>

          {canInstall && (
            <button
              type="button"
              onClick={onInstallClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-sm font-bold text-white bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700 transition-colors cursor-pointer min-h-[48px]"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span>Install PWA to Device</span>
            </button>
          )}
        </div>

        {/* Trust Badges */}
        <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-emerald-200/80 font-medium">
          <span className="inline-flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 text-emerald-400" />
            Offline-ready recording
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Automatic IndexedDB persistence
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            Mobile-optimized touch targets
          </span>
        </div>
      </div>
    </section>
  );
}
