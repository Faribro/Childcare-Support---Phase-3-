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
    <section aria-labelledby="cta-heading" className="py-16 md:py-24 bg-[#142B1F] text-white relative overflow-hidden">
      {/* Decorative background grid and ambient glow */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#80E5A3_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Ready to deploy in your district
        </div>

        <h2
          id="cta-heading"
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight"
        >
          Equip your field team with clarity and dignity.
        </h2>

        <p className="text-base sm:text-lg text-emerald-100 max-w-2xl mx-auto leading-relaxed font-normal">
          Start recording child nutrition, school continuity, and household support with resilient offline persistence.
          Minimizing lost paperwork through structured local draft preservation.
        </p>

        {/* Primary CTA Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/app"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl text-sm font-bold text-slate-900 bg-white hover:bg-emerald-50 transition-all cursor-pointer shadow-lg hover:shadow-xl transform active:scale-[0.98]"
          >
            <span>Open Field App</span>
            <ArrowRight className="w-4 h-4 text-emerald-800" />
          </Link>

          {canInstall && (
            <button
              type="button"
              onClick={onInstallClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-sm font-bold text-white bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700 transition-colors cursor-pointer"
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
