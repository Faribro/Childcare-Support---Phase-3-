'use client';

import React, { useState } from 'react';
import {
  FileText,
  Save,
  WifiOff,
  FolderLock,
  Wifi,
  CheckCircle,
  Clock,
  ArrowRight,
  ArrowLeft,
  Shield,
  AlertCircle,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useScrollPhysics } from './motion/useScrollPhysics';

interface StoryStep {
  step: number;
  title: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  fieldState: string;
  networkState: 'online' | 'offline' | 'reconnecting';
  description: string;
  reassurance: string;
}

const STORY_STEPS: readonly StoryStep[] = [
  {
    step: 1,
    title: 'Needs recorded',
    badge: 'Step 1 of 7',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: <FileText className="w-4 h-4 text-emerald-700" />,
    fieldState: 'Draft intake in progress',
    networkState: 'offline',
    description: 'Caseworker enters multi-dimensional observations for nutrition, schooling, and household stability directly during a home visit.',
    reassurance: 'Structured input forms prevent ambiguous notes and standardize field observations.',
  },
  {
    step: 2,
    title: 'Draft saved on device',
    badge: 'Step 2 of 7',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: <Save className="w-4 h-4 text-emerald-700" />,
    fieldState: 'Draft committed to local SQLite',
    networkState: 'offline',
    description: 'Every keystroke and field selection is immediately written to local offline database storage. No external network request is attempted.',
    reassurance: 'Local encryption protects draft data on frontline hardware.',
  },
  {
    step: 3,
    title: 'Connection unavailable',
    badge: 'Step 3 of 7',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: <WifiOff className="w-4 h-4 text-amber-700" />,
    fieldState: 'Zero network reception',
    networkState: 'offline',
    description: 'Field teams routinely operate outside cellular connectivity. The app requires no server handshake to function.',
    reassurance: 'Zero data loss when crossing dead zones or changing field terrains.',
  },
  {
    step: 4,
    title: 'Work remains available',
    badge: 'Step 4 of 7',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: <FolderLock className="w-4 h-4 text-amber-700" />,
    fieldState: 'Complete local record accessible',
    networkState: 'offline',
    description: 'Existing beneficiary histories and today’s active cases remain fully readable and editable without spinning wheels or error alerts.',
    reassurance: 'Caseworkers are never locked out of ongoing interviews.',
  },
  {
    step: 5,
    title: 'Connection returns',
    badge: 'Step 5 of 7',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: <Wifi className="w-4 h-4 text-blue-700" />,
    fieldState: 'Cellular / Wi-Fi detected',
    networkState: 'reconnecting',
    description: 'When the worker travels within tower range or returns to the field office, the background sync manager detects reliable connectivity.',
    reassurance: 'Transmission uses resilient chunked batches to avoid timeouts.',
  },
  {
    step: 6,
    title: 'Submission acknowledged',
    badge: 'Step 6 of 7',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: <CheckCircle className="w-4 h-4 text-emerald-700" />,
    fieldState: 'Payload received & signed',
    networkState: 'online',
    description: 'The server verifies payload integrity and issues a cryptographically verified receipt back to the field device.',
    reassurance: 'Receipt marks the local record as synchronized while retaining a read-only copy.',
  },
  {
    step: 7,
    title: 'Human review remains pending',
    badge: 'Step 7 of 7',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: <Clock className="w-4 h-4 text-purple-700" />,
    fieldState: 'Enqueued for supervisor triage',
    networkState: 'online',
    description: 'Software transmits data; human clinical and social workers make decisions. The case file enters the institutional review queue.',
    reassurance: 'Submission does not equate to automatic case resolution — human oversight is mandatory.',
  },
];

/**
 * MOMENT C — THE CONNECTION RETURNS
 *
 * Clearly labelled illustrative demonstration of the 7-step offline-first
 * data lifecycle:
 * Needs recorded → Draft saved → Offline → Work available → Reconnect → Acknowledged → Human review pending.
 *
 * Accessibility & Design:
 * - Prominent "Illustrative demo — no real child data" banner.
 * - Dual interaction: Step-by-step keyboard buttons + direct step selectors.
 * - Static full-list rendering under prefers-reduced-motion.
 * - Compact layout: zero scroll-hijacking or endless pinning screens.
 */
export function ConnectedCareStory() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const physics = useScrollPhysics();
  const currentStep = STORY_STEPS[activeStepIndex];

  const handleNext = () => {
    setActiveStepIndex((prev) => (prev < STORY_STEPS.length - 1 ? prev + 1 : 0));
  };

  const handlePrev = () => {
    setActiveStepIndex((prev) => (prev > 0 ? prev - 1 : STORY_STEPS.length - 1));
  };

  // SVG thread progress calculation between step 1 (0%) and step 7 (100%)
  const threadProgress = activeStepIndex / (STORY_STEPS.length - 1);
  const strokeDashoffset = 320 * (1 - threadProgress);

  return (
    <section
      id="connected-care-story"
      aria-labelledby="connected-care-heading"
      className="py-14 sm:py-20 bg-[#F7F3E9] border-t border-b border-[#E6DBCA] relative overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAE2D2] border border-[#D5C4AA] text-[11px] font-mono font-bold text-emerald-900 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            MOMENT C • RESILIENT FIELD LIFECYCLE
          </div>

          <h2
            id="connected-care-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#1A211E] tracking-tight"
          >
            The Connection Returns: Every Detail Carried Forward
          </h2>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Frontline casework cannot stop when cellular towers disappear. Experience how local encrypted drafts
            protect observations in remote terrain and hand off safely to human supervisors.
          </p>

          {/* Mandatory Safety & Reality Disclaimers */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-mono font-medium shadow-xs">
            <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>Illustrative demo — no real child data. Transmission never equates to automated case resolution.</span>
          </div>
        </div>

        {/* ── REDUCED MOTION STATIC FALLBACK ── */}
        {physics.isReducedMotion ? (
          <div className="space-y-4 pt-4" aria-label="Step-by-step offline data lifecycle">
            <h3 className="sr-only">7-Step Data Lifecycle Timeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {STORY_STEPS.map((s) => (
                <div
                  key={s.step}
                  className="p-4 rounded-xl bg-white border border-[#DAC8B5] shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${s.badgeColor}`}>
                      {s.badge}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Network: <strong>{s.networkState}</strong>
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    {s.icon}
                    <span>{s.title}</span>
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{s.description}</p>
                  <div className="pt-1 border-t border-[#F0E6D8] text-[11px] text-emerald-800 font-mono">
                    ✓ {s.reassurance}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── INTERACTIVE DUAL-CARD STAGE WITH SVG CONNECTION THREAD ── */
          <div className="space-y-6">
            {/* Step Selector Buttons Bar */}
            <div
              role="tablist"
              aria-label="Lifecycle progression steps"
              className="flex items-center justify-between gap-1 overflow-x-auto pb-2 p-1.5 rounded-2xl bg-[#EFE6D8] border border-[#D5C4AA]"
            >
              {STORY_STEPS.map((s, idx) => (
                <button
                  key={s.step}
                  role="tab"
                  aria-selected={activeStepIndex === idx}
                  aria-controls={`step-panel-${s.step}`}
                  id={`step-tab-${s.step}`}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`flex-1 min-w-[110px] py-2 px-2 rounded-xl text-xs font-bold font-mono transition-all text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700 ${
                    activeStepIndex === idx
                      ? 'bg-white text-emerald-950 shadow-xs border border-[#C5B396]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-[#E8DEC8]'
                  }`}
                >
                  <div className="text-[9px] uppercase tracking-wider opacity-75">Step {s.step}</div>
                  <div className="truncate text-[11px] font-sans font-semibold">{s.title}</div>
                </button>
              ))}
            </div>

            {/* Interactive Showcase Spread */}
            <div
              id={`step-panel-${currentStep.step}`}
              role="tabpanel"
              aria-labelledby={`step-tab-${currentStep.step}`}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
            >
              {/* Left Card: Field Worker Device State */}
              <div className="lg:col-span-5 rounded-2xl bg-white p-5 sm:p-6 border border-[#DAC8B5] shadow-sm flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#EAE0D0] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                      <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wide">
                        Field Notebook Device
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${currentStep.badgeColor}`}>
                        {currentStep.badge}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        Local SQLite DB
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-mono text-slate-500">Current Field Event:</div>
                    <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      {currentStep.icon}
                      <span>{currentStep.title}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed pt-1">
                      {currentStep.description}
                    </p>
                  </div>
                </div>

                {/* Simulated Local Device Status Pill */}
                <div className="p-3 rounded-xl bg-[#F8F5EE] border border-[#E4D7C4] text-xs space-y-1.5 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Device Radio:</span>
                    <span
                      className={`font-bold uppercase ${
                        currentStep.networkState === 'offline'
                          ? 'text-amber-700'
                          : currentStep.networkState === 'reconnecting'
                          ? 'text-blue-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {currentStep.networkState === 'offline' && '● Network Disconnected'}
                      {currentStep.networkState === 'reconnecting' && '◐ Handshake Initialized'}
                      {currentStep.networkState === 'online' && '○ HTTPS Connected'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-500">Storage State:</span>
                    <span className="font-semibold text-[11px]">{currentStep.fieldState}</span>
                  </div>
                </div>
              </div>

              {/* Center Column: Animated SVG Connecting Thread */}
              <div className="hidden lg:flex lg:col-span-2 flex-col items-center justify-center relative my-auto select-none">
                <svg
                  className="w-full h-24 pointer-events-none"
                  viewBox="0 0 160 80"
                  fill="none"
                  aria-hidden="true"
                >
                  {/* Background Track Thread */}
                  <path
                    d="M 10 40 C 60 10, 100 70, 150 40"
                    stroke="#D5C4AA"
                    strokeWidth="2.5"
                    strokeDasharray="4 4"
                  />
                  {/* Dynamic Lit Progress Thread */}
                  <path
                    d="M 10 40 C 60 10, 100 70, 150 40"
                    stroke="#0F5132"
                    strokeWidth="3.5"
                    strokeDasharray="320"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                  />
                  {/* Origin Station Dot */}
                  <circle cx="10" cy="40" r="5" fill="#0F5132" />
                  {/* Target Station Dot */}
                  <circle
                    cx="150"
                    cy="40"
                    r="5"
                    fill={activeStepIndex >= 4 ? '#0F5132' : '#D5C4AA'}
                    className="transition-colors duration-300"
                  />
                </svg>
                <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider text-center mt-1">
                  {activeStepIndex < 4 ? 'Awaiting Signal' : activeStepIndex === 4 ? 'Transmitting' : 'Synchronized'}
                </span>
              </div>

              {/* Right Card: Institutional Review Dossier State */}
              <div className="lg:col-span-5 rounded-2xl bg-white p-5 sm:p-6 border border-[#DAC8B5] shadow-sm flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#EAE0D0] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wide">
                        Institutional Review Desk
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      Supervisor Hub
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-mono text-slate-500">Triage Pipeline Status:</div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-500">Case Intake:</span>
                        <span className="font-bold font-mono text-slate-800">#REC-0042 (Aanya K.)</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-500">Receipt Status:</span>
                        <span
                          className={`font-mono font-bold text-xs ${
                            activeStepIndex < 5
                              ? 'text-slate-400'
                              : activeStepIndex === 5
                              ? 'text-emerald-700'
                              : 'text-purple-700'
                          }`}
                        >
                          {activeStepIndex < 5 && 'Pending Field Sync'}
                          {activeStepIndex === 5 && '✓ Receipt Issued'}
                          {activeStepIndex === 6 && '⏳ Queued for Clinical Review'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Institutional Integrity Reassurance */}
                <div className="p-3 rounded-xl bg-[#F0EBE1] border border-[#DDD1BE] text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Shield className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                    <span>Integrity Guarantee</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-normal">
                    {currentStep.reassurance}
                  </p>
                </div>
              </div>
            </div>

            {/* Accessible Navigation Controls (<button> Previous / Next) */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-[#EFE6D8] border border-[#D5C4AA] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700"
                aria-label="Previous lifecycle step"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous Step</span>
              </button>

              <div className="text-xs font-mono text-slate-500">
                Step <strong>{activeStepIndex + 1}</strong> of <strong>{STORY_STEPS.length}</strong>
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0F5132] hover:bg-[#0A3622] transition-colors cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
                aria-label="Next lifecycle step"
              >
                <span>{activeStepIndex === STORY_STEPS.length - 1 ? 'Restart Sequence' : 'Next Step'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-200" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
