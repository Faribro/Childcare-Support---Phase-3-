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
  Sparkles,
  Wifi,
  WifiOff,
  User,
  Calendar,
  Activity,
} from 'lucide-react';
import motionStyles from './landing-motion.module.css';

interface NotebookHeroProps {
  canInstall: boolean;
  onInstallClick: () => void;
  isStandalone?: boolean;
}

export function NotebookHero({ canInstall, onInstallClick, isStandalone = false }: NotebookHeroProps) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative pt-4 pb-12 md:pt-6 md:pb-20 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* ── THE PHYSICAL MANILA CASE FOLDER SPREAD (Layer 1) ── */}
        <div className="notebook-folder rounded-3xl p-3 sm:p-6 lg:p-8 relative animate-folder-unfold">

          {/* Die-Cut Folder Left Index Tabs (Desktop / Tablet) */}
          <div
            className="hidden xl:flex flex-col absolute -left-9 top-12 space-y-2 z-20"
            aria-label="Notebook Chapter Index"
          >
            <span className="px-3 py-1.5 rounded-l-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#0F5132] text-white shadow-sm border border-emerald-900 border-r-0 text-right">
              I. Note
            </span>
            <a
              href="#whole-child"
              className="px-3 py-1.5 rounded-l-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-r-0 transition-colors text-right"
            >
              II. Scope
            </a>
            <a
              href="#field-rhythm"
              className="px-3 py-1.5 rounded-l-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-r-0 transition-colors text-right"
            >
              III. Rhythm
            </a>
            <a
              href="#field-readiness"
              className="px-3 py-1.5 rounded-l-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-r-0 transition-colors text-right"
            >
              IV. Reality
            </a>
            <a
              href="#preview-heading"
              className="px-3 py-1.5 rounded-l-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-r-0 transition-colors text-right"
            >
              V. Preview
            </a>
            <a
              href="#faq-heading"
              className="px-3 py-1.5 rounded-l-lg text-[10px] font-mono font-bold tracking-wider uppercase bg-[#E8DEC8] hover:bg-[#DFCFA8] text-slate-800 shadow-xs border border-[#C5B396] border-r-0 transition-colors text-right"
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

            {/* ── MAIN HERO GRID (Layer 3 Content + Synthetic Device Anchor) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center relative z-10">

              {/* Left Column: Mission Narrative & Immediate Actions */}
              <div className={`lg:col-span-7 space-y-6 ${motionStyles.heroHeadline}`}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-mono font-bold tracking-wider uppercase bg-[#F2EAE0] text-[#5C4D3C] border border-[#DAC8B5]">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  <span>Frontline Casework Intake &amp; Care</span>
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
                  {isStandalone ? (
                    <Link
                      href="/app"
                      className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold text-white bg-[#0F5132] hover:bg-[#0A3622] active:bg-[#072417] transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-emerald-500/40 min-h-[48px] cursor-pointer"
                      aria-label="Open in App"
                    >
                      <span>Open in App</span>
                      <ArrowRight className="w-4 h-4 text-emerald-200" />
                    </Link>
                  ) : (
                    <>
                      <Link
                        href="/app"
                        className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold text-white bg-[#0F5132] hover:bg-[#0A3622] active:bg-[#072417] transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-emerald-500/40 min-h-[48px] cursor-pointer"
                        aria-label="Open Field Workspace"
                      >
                        <span>Open Field Workspace</span>
                        <ArrowRight className="w-4 h-4 text-emerald-200" />
                      </Link>

                      <button
                        type="button"
                        onClick={onInstallClick}
                        className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-sm sm:text-base font-semibold text-slate-800 bg-[#EFE6D8] hover:bg-[#E5DACB] active:bg-[#DBCFB8] border border-[#D5C4AA] transition-all focus:outline-none focus:ring-4 focus:ring-slate-400/40 min-h-[48px] cursor-pointer"
                        aria-label="Download the App"
                      >
                        <Download className="w-4 h-4 text-emerald-800" />
                        <span>Download the App</span>
                      </button>
                    </>
                  )}

                  <a
                    href="#whole-child"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono font-bold text-emerald-800 hover:text-emerald-950 underline underline-offset-4 transition-colors"
                  >
                    <span>Explore case file</span>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </a>
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
                    <span>Local draft storage</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Synthetic Intake Device Mockup */}
              <div className={`lg:col-span-5 ${motionStyles.heroDevice}`}>
                <SyntheticIntakeMockup />
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

/* ──────────────────────────────────────────────────────────────────────────
   Synthetic Intake Device Mockup
   Shows a realistic-looking but entirely synthetic phone/tablet UI
   of the field intake form — no real beneficiary data.
   ────────────────────────────────────────────────────────────────────────── */
function SyntheticIntakeMockup() {
  return (
    <div className="relative mx-auto max-w-[340px] lg:max-w-none" aria-label="Sample field intake form preview">
      {/* Archival tape strip pinning the device card */}
      <div className="notebook-tape absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-6 rounded-xs transform -rotate-1 pointer-events-none" aria-hidden="true" />

      {/* Outer device shell — tablet/phone frame */}
      <div className="relative rounded-2xl bg-[#1A211E] p-2 shadow-2xl border border-[#2D3A35]">

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 text-[10px] font-mono text-slate-400">
          <span>09:47</span>
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3 h-3 text-amber-400" aria-label="Offline mode active" />
            <span className="text-amber-400 font-bold">OFFLINE</span>
            <span className="w-4 h-2.5 rounded-sm border border-slate-500 inline-flex items-center px-0.5">
              <span className="h-1.5 w-1.5 rounded-sm bg-emerald-400" />
            </span>
          </div>
        </div>

        {/* App content area */}
        <div className="rounded-xl bg-[#F8F4EB] overflow-hidden">

          {/* App nav header */}
          <div className="bg-[#0F5132] px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-sm bg-emerald-300/20 flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 text-emerald-200" />
              </div>
              <span className="text-[10px] font-bold text-white font-mono tracking-wide">FIELD NOTEBOOK</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] font-mono text-emerald-300">
              <Wifi className="w-2.5 h-2.5" aria-hidden="true" />
              <span>Sync pending</span>
            </div>
          </div>

          {/* Form paper area */}
          <div className="px-3 pt-3 pb-2 space-y-2.5">

            {/* Record header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-[#E2D5C3]">
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Child Assessment Form
              </span>
              <span className="text-[9px] font-mono text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                #REC-0042
              </span>
            </div>

            {/* Synthetic field: Child name */}
            <FormField
              icon={<User className="w-2.5 h-2.5 text-slate-500" />}
              label="Child Name"
              value="Aanya K. (Synthetic)"
              filled
            />

            {/* Synthetic field: Age */}
            <FormField
              icon={<Calendar className="w-2.5 h-2.5 text-slate-500" />}
              label="Age"
              value="7 yrs 4 mo"
              filled
            />

            {/* Nutrition status indicator */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                  <Activity className="w-2.5 h-2.5" />
                  Nutrition Status
                </span>
                <span className="text-[8px] font-bold font-mono text-amber-700 bg-amber-100 px-1 py-0.5 rounded border border-amber-300">
                  MAM
                </span>
              </div>
              {/* WHO z-score bar */}
              <div className="relative h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
                  style={{ width: '62%' }}
                  aria-hidden="true"
                />
              </div>
              <div className="flex justify-between text-[8px] font-mono text-slate-400">
                <span>Severe</span>
                <span>Normal</span>
              </div>
            </div>

            {/* Schooling field */}
            <FormField
              icon={
                <svg className="w-2.5 h-2.5 text-slate-500" fill="none" viewBox="0 0 12 12" aria-hidden="true">
                  <rect x="1" y="2" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M3 5h6M3 7h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
              }
              label="School Enrolment"
              value="Class 2 — enrolled"
              filled
            />

            {/* Sync / save status footer */}
            <div className="flex items-center justify-between pt-1.5 border-t border-[#E2D5C3]">
              <div className="flex items-center gap-1 text-[9px] font-mono text-emerald-800">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="font-bold">Saved locally</span>
              </div>
              <div className="text-[8px] font-mono text-slate-400">
                Queued for sync
              </div>
            </div>
          </div>

          {/* Keyboard hint bar */}
          <div className="bg-slate-100 border-t border-slate-200 px-3 py-1.5 flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500">Next field</span>
            <div className="flex gap-1">
              {['←', '→'].map((k) => (
                <span
                  key={k}
                  className="px-1.5 py-0.5 text-[9px] font-mono bg-white border border-slate-300 rounded shadow-xs text-slate-600"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Home indicator */}
        <div className="mt-1.5 flex justify-center">
          <div className="w-10 h-0.5 bg-slate-600 rounded-full" aria-hidden="true" />
        </div>
      </div>

      {/* Explanatory footnote beneath device */}
      <p className="mt-3 text-center text-[10px] font-mono text-slate-500 italic">
        Sample record — no real beneficiary data
      </p>
    </div>
  );
}

/* Small reusable form field row */
function FormField({
  icon,
  label,
  value,
  filled,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  filled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#DDD0BA] bg-white/70 px-2.5 py-1.5">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-[11px] font-medium ${filled ? 'text-slate-800' : 'text-slate-300'}`}>
        {value}
      </div>
    </div>
  );
}
