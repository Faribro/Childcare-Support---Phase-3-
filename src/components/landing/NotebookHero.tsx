'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Download, WifiOff, Smartphone, ShieldCheck, Heart, BookOpen, Apple, Home, RefreshCw } from 'lucide-react';

interface NotebookHeroProps {
  canInstall: boolean;
  onInstallClick: () => void;
}

export function NotebookHero({ canInstall, onInstallClick }: NotebookHeroProps) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative pt-6 pb-16 md:pt-12 md:pb-24 overflow-hidden border-b border-[#E8DFD1]"
    >
      {/* Decorative notebook left margin binding stitch effect on desktop */}
      <div className="hidden lg:block absolute left-8 top-0 bottom-0 w-px border-r-2 border-dashed border-[#DDD2C0] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Archival metadata tag header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-[#E8DFD1]/70">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#E8F5E9] text-[#1B5E20] border border-[#C8E6C9]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] animate-pulse" />
              Alliance India • Phase 3 PWA
            </span>
            <span className="hidden sm:inline-block text-xs font-mono uppercase tracking-wider text-slate-500">
              DOC: CNSP-2026
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className="inline-flex items-center gap-1">
              <WifiOff className="w-3.5 h-3.5 text-emerald-700" />
              Offline-Capable
            </span>
            <span className="text-slate-300">•</span>
            <span>Mobile-First</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Mission Narrative & Immediate Actions */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-block px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#F3ECE2] text-[#6B5A45] border border-[#DECDBB]">
              Field Caseworker Intake & Care
            </div>

            <h1
              id="hero-heading"
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.15]"
            >
              Every child’s story deserves a{' '}
              <span className="relative inline-block text-emerald-800">
                clearer picture.
                <svg
                  className="absolute left-0 -bottom-1 w-full h-2 text-emerald-500/40"
                  viewBox="0 0 200 8"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M1 5.5C40 2 120 2 199 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-700 leading-relaxed max-w-2xl font-medium">
              A dignified, offline-first field journal for frontline caseworkers. Record nutrition, education, 
              and household support in remote homes—saving every answer locally, and synchronizing smoothly whenever connection returns.
            </p>

            {/* Primary Action Button Bar */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <Link
                href="/app"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-base font-bold text-white bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-emerald-500/40 min-h-[48px]"
                aria-label="Open Field App workspace"
              >
                <span>Open Field App</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-base font-semibold text-slate-800 bg-[#F5EFEB] hover:bg-[#EFE6DC] active:bg-[#E5D9CC] border border-[#D8C9B5] transition-all focus:outline-none focus:ring-4 focus:ring-slate-300 min-h-[48px]"
              >
                <span>How It Works</span>
              </a>

              {canInstall && (
                <button
                  type="button"
                  onClick={onInstallClick}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold text-emerald-900 bg-emerald-100/80 hover:bg-emerald-200/80 border border-emerald-300 transition-all min-h-[48px]"
                  aria-label="Install Field App on this device"
                >
                  <Download className="w-4 h-4 text-emerald-800" />
                  <span>Install App</span>
                </button>
              )}
            </div>

            {/* Reassurance Micro-Badges */}
            <div className="pt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Zero real beneficiary data public</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-700" />
                <span>Touch-first for Android phones</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-emerald-700" />
                <span>Local IndexedDB auto-save</span>
              </div>
            </div>
          </div>

          {/* Right Column: Handcrafted Illustrated Notebook Spread */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-md lg:max-w-none p-5 sm:p-7 rounded-2xl bg-[#FCFAF6] border border-[#DECDBB] shadow-xl notebook-border">
              {/* Notebook page header band */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#E8DFD1]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                </div>
                <div className="text-[11px] font-mono text-slate-500 uppercase tracking-widest font-bold">
                  Field Journal • Case Linelist
                </div>
              </div>

              {/* The Interconnected Support Path SVG */}
              <div className="relative py-2">
                <svg
                  className="w-full h-44 sm:h-52"
                  viewBox="0 0 340 180"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="Illustrated path of care connecting nutrition, schooling, shelter, and sync"
                >
                  {/* Dashed Journey Path */}
                  <path
                    d="M 30 90 C 80 30, 110 30, 150 90 C 190 150, 230 150, 280 85"
                    stroke="#0D9488"
                    strokeWidth="2.5"
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                    className="opacity-70"
                  />

                  {/* Node 1: Nutrition */}
                  <g transform="translate(30, 90)">
                    <circle r="22" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" />
                    <circle r="6" fill="#D97706" />
                    <text x="0" y="36" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#78350F">
                      Nutrition
                    </text>
                  </g>

                  {/* Node 2: Education */}
                  <g transform="translate(150, 90)">
                    <circle r="22" fill="#E0F2FE" stroke="#0284C7" strokeWidth="2" />
                    <circle r="6" fill="#0369A1" />
                    <text x="0" y="36" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0C4A6E">
                      Education
                    </text>
                  </g>

                  {/* Node 3: Home & Wellbeing */}
                  <g transform="translate(280, 85)">
                    <circle r="22" fill="#DCFCE7" stroke="#16A34A" strokeWidth="2" />
                    <circle r="6" fill="#15803D" />
                    <text x="0" y="36" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#14532D">
                      Care & Sync
                    </text>
                  </g>
                </svg>

                {/* Notebook Field Note Annotation Tag */}
                <div className="mt-4 p-3.5 rounded-xl bg-[#F5EFEB] border border-[#DECDBB] text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
                    <span className="uppercase tracking-wider">Field Note #01</span>
                    <span className="font-mono text-slate-500">IndexedDB: Active</span>
                  </div>
                  <p className="text-slate-700 leading-snug">
                    «Assessments completed without connection stay encrypted on the phone, ready for automated sync upon return.»
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
