'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  ArrowDown, 
  Download, 
  ShieldCheck, 
  Smartphone, 
  Database, 
  CheckCircle2, 
  Sparkles 
} from 'lucide-react';

interface NotebookHeroProps {
  canInstall: boolean;
  onInstallClick: () => void;
}

export function NotebookHero({ canInstall, onInstallClick }: NotebookHeroProps) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative pt-4 pb-12 md:pt-6 md:pb-20 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* ── THE PHYSICAL MANILA CASE FOLDER SPREAD (Layer 1) ── */}
        <div className="notebook-folder rounded-3xl p-3 sm:p-6 lg:p-8 relative">
          
          {/* Die-Cut Folder Right Index Tabs (Desktop / Tablet) */}
          <div 
            className="hidden xl:flex flex-col absolute -right-9 top-12 space-y-2 z-20"
            aria-label="Notebook Chapter Index"
          >
            <span className="px-3 py-1.5 rounded-r-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#0F5132] text-white shadow-sm border border-emerald-900 border-l-0">
              I. Note
            </span>
            <a 
              href="#whole-child"
              className="px-3 py-1.5 rounded-r-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-l-0 transition-colors"
            >
              II. Scope
            </a>
            <a 
              href="#field-rhythm"
              className="px-3 py-1.5 rounded-r-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-l-0 transition-colors"
            >
              III. Rhythm
            </a>
            <a 
              href="#field-readiness"
              className="px-3 py-1.5 rounded-r-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-l-0 transition-colors"
            >
              IV. Reality
            </a>
            <a 
              href="#preview-heading"
              className="px-3 py-1.5 rounded-r-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-l-0 transition-colors"
            >
              V. Preview
            </a>
            <a 
              href="#faq-heading"
              className="px-3 py-1.5 rounded-r-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-l-0 transition-colors"
            >
              VI. FAQ
            </a>
          </div>

          {/* Left Binder Strip with Hole Punches & Stitch Motifs */}
          <div className="hidden lg:flex flex-col justify-between items-center absolute left-3 top-8 bottom-8 w-6 pointer-events-none z-20">
            <div className="notebook-punch-hole" aria-hidden="true" />
            <div className="w-px h-24 border-r border-dashed border-[#B8A690]" aria-hidden="true" />
            <div className="notebook-punch-hole" aria-hidden="true" />
            <div className="w-px h-24 border-r border-dashed border-[#B8A690]" aria-hidden="true" />
            <div className="notebook-punch-hole" aria-hidden="true" />
          </div>

          {/* ── THE INNER COTTON JOURNAL SHEET (Layer 2) ── */}
          <div className="notebook-paper-sheet rounded-2xl p-4 sm:p-7 lg:p-10 lg:ml-7 relative overflow-hidden">
            
            {/* Red Margin Line on the left */}
            <div className="hidden sm:block absolute left-12 top-0 bottom-0 w-px bg-red-200/60 pointer-events-none" />

            {/* Archival Metadata Strip & Rubber Stamp */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-6 border-b border-[#E6DBCA] relative z-10">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {/* Handcrafted Rubber Stamp with tactile impact animation */}
                <div className="notebook-stamp px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold rounded-xs shadow-xs motion-safe:animate-stamp-impact origin-center">
                  ★ ALLIANCE INDIA • OFFLINE FIELD CASEFILE ★
                </div>
              </div>
            </div>

            {/* ── MAIN HERO GRID (Layer 3 Content + 2.5D Anchor) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center relative z-10">
              
              {/* Left Column: Mission Narrative & Immediate Actions */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-mono font-bold tracking-wider uppercase bg-[#F2EAE0] text-[#5C4D3C] border border-[#DAC8B5]">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  <span>Frontline Casework Intake & Care</span>
                </div>

                <h1
                  id="hero-heading"
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight text-[#1A211E] leading-[1.12]"
                >
                  Every child’s story deserves a{' '}
                  <span className="relative inline-block text-emerald-900">
                    clearer picture.
                    {/* Handcrafted SVG Highlighter Underline */}
                    <svg
                      className="absolute left-0 -bottom-1.5 w-full h-3 text-emerald-500/35 pointer-events-none"
                      viewBox="0 0 240 10"
                      fill="none"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 6.5C50 2 150 2 238 7"
                        stroke="currentColor"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-slate-700 leading-relaxed max-w-2xl font-normal">
                  A dignified, offline-first field notebook for frontline caseworkers. Record nutrition, 
                  schooling, and household needs in remote homes—saving every detail safely on your device, 
                  and syncing seamlessly when signal returns.
                </p>

                {/* Primary & Secondary Action Button Bar */}
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                  <Link
                    href="/app"
                    className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold text-white bg-[#0F5132] hover:bg-[#0A3622] active:bg-[#072417] transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-emerald-500/40 min-h-[48px] cursor-pointer"
                    aria-label="Open Field App workspace"
                  >
                    <span>Open Field App</span>
                    <ArrowRight className="w-4 h-4 text-emerald-200" />
                  </Link>

                  <a
                    href="#whole-child"
                    className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-sm sm:text-base font-semibold text-slate-800 bg-[#EFE6D8] hover:bg-[#E5DACB] active:bg-[#DBCFB8] border border-[#D5C4AA] transition-all focus:outline-none focus:ring-4 focus:ring-slate-400/40 min-h-[48px] cursor-pointer"
                  >
                    <span>Explore the notebook</span>
                    <ArrowDown className="w-4 h-4 text-slate-600" />
                  </a>

                  {canInstall && (
                    <button
                      type="button"
                      onClick={onInstallClick}
                      className="inline-flex items-center justify-center gap-2 px-4 py-4 rounded-xl text-sm font-bold text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 transition-all min-h-[48px] cursor-pointer"
                      aria-label="Install Field App on this device"
                    >
                      <Download className="w-4 h-4 text-emerald-800" />
                      <span>Install App</span>
                    </button>
                  )}
                </div>

                {/* Reassurance Micro-Badges */}
                <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-medium text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Zero real child PII public</span>
                  </div>
                  <span className="text-slate-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-700" />
                    <span>Touch-first for Android phones</span>
                  </div>
                  <span className="text-slate-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-emerald-700" />
                    <span>Protected local storage</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Original 2.5D Support Journey Spread (The Visual Anchor) */}
              <div className="lg:col-span-5">
                <div className="relative mx-auto max-w-md lg:max-w-none p-5 sm:p-6 rounded-2xl bg-[#F8F4EB] border border-[#DAC8B5] shadow-lg">
                  
                  {/* Decorative Archival Tape Strip at top */}
                  <div className="notebook-tape absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-6 rounded-xs transform -rotate-1 pointer-events-none" />

                  {/* Top Bar of the Case Card */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E2D5C3]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600">
                      Child Support Journey
                    </span>
                  </div>

                  {/* ── Original SVG Illustrated Support Trail ── */}
                  <div className="relative py-2">
                    <svg
                      className="w-full h-44 sm:h-52"
                      viewBox="0 0 340 180"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      role="img"
                      aria-label="Care journey connecting Nutrition, Schooling, and Offline Sync"
                    >
                      {/* Gentle Background Topographic Grid / Lines */}
                      <path d="M10 40 Q 90 20, 180 50 T 330 30" stroke="#E2D7C5" strokeWidth="1" strokeDasharray="3 3" />
                      <path d="M10 140 Q 90 120, 180 150 T 330 130" stroke="#E2D7C5" strokeWidth="1" strokeDasharray="3 3" />

                      {/* Main Connecting Journey Path */}
                      <path
                        d="M 45 90 C 95 30, 125 30, 170 90 C 215 150, 245 150, 295 85"
                        stroke="#0D9488"
                        strokeWidth="3"
                        strokeDasharray="6 6"
                        strokeLinecap="round"
                        className="support-path-draw"
                      />

                      {/* Station 1: Nutrition & Growth */}
                      <g transform="translate(45, 90)">
                        <circle r="26" fill="#FEF3C7" stroke="#D97706" strokeWidth="2.5" />
                        {/* Apple / Nutrition Icon */}
                        <path d="M-6 -6 C-10 -2 -10 6 -6 10 C-2 12 2 12 6 10 C10 6 10 -2 6 -6 C2 -8 -2 -8 -6 -6 Z" fill="#D97706" />
                        <path d="M0 -6 Q 4 -12, 6 -10" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />
                        <text x="0" y="42" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#78350F" fontFamily="sans-serif">
                          Nutrition
                        </text>
                      </g>

                      {/* Station 2: Education Continuity */}
                      <g transform="translate(170, 90)">
                        <circle r="26" fill="#E0F2FE" stroke="#0284C7" strokeWidth="2.5" />
                        {/* Book / Slate Icon */}
                        <rect x="-8" y="-7" width="16" height="14" rx="2" fill="#0284C7" />
                        <line x1="-5" y1="-2" x2="5" y2="-2" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="-5" y1="2" x2="3" y2="2" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
                        <text x="0" y="42" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0C4A6E" fontFamily="sans-serif">
                          Education
                        </text>
                      </g>

                      {/* Station 3: Family Support & Sync */}
                      <g transform="translate(295, 85)">
                        <circle r="26" fill="#DCFCE7" stroke="#16A34A" strokeWidth="2.5" />
                        {/* House / Care Icon */}
                        <path d="M-8 2 L0 -6 L8 2 L8 8 L-8 8 Z" fill="#16A34A" />
                        <path d="M-2 8 L-2 4 L2 4 L2 8 Z" fill="#FFFFFF" />
                        <text x="0" y="42" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#14532D" fontFamily="sans-serif">
                          Care & Sync
                        </text>
                      </g>
                    </svg>

                    {/* ── Pinned Case Docket Card (Polaroid Style) ── */}
                    <div className="mt-4 p-3.5 rounded-xl bg-[#FCFAF6] border border-[#DECDBB] shadow-xs relative">
                      {/* Realistic Silver SVG Paperclip clipping docket to card */}
                      <svg 
                        className="absolute -top-3.5 right-4 w-5 h-8 text-slate-400 drop-shadow-xs pointer-events-none" 
                        viewBox="0 0 20 36" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M6 10 V24 A4 4 0 0 0 14 24 V6 A6 6 0 0 0 2 6 V26 A8 8 0 0 0 18 26 V12" />
                      </svg>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pb-1 mb-1 border-b border-dashed border-[#E8DFD1]">
                        <span className="font-bold text-emerald-900">SAMPLE FIELD RECORD #42</span>
                        <span>STATUS: SAVED LOCALLY</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-snug">
                        «Child assessment recorded in remote village. Anthropometry, schooling grants, and family care details saved to IndexedDB.»
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] font-mono font-semibold text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Ready for auto-sync on return</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Visual Scroll Cue */}
            <div className="mt-8 pt-4 border-t border-[#E8DFD1]/70 flex items-center justify-between text-xs text-slate-500 font-mono">
              <span className="hidden sm:inline">ALLIANCE INDIA • COMMUNITY CARE ARCHITECTURE</span>
              <a 
                href="#whole-child"
                className="inline-flex items-center gap-1.5 text-emerald-800 hover:text-emerald-950 font-bold font-sans transition-colors cursor-pointer ml-auto"
              >
                <span>Scroll to explore case file chapters</span>
                <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
