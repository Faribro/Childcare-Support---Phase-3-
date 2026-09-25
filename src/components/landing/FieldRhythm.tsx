'use client';

import React from 'react';
import { PenTool, Database, CloudUpload, CheckCircle, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';

export function FieldRhythm() {
  const steps = [
    {
      number: '01',
      title: 'Record',
      subtitle: '6-Section Guided Intake',
      icon: PenTool,
      accent: 'amber',
      tagColor: 'bg-amber-100 text-amber-900 border-amber-300',
      description:
        'Walk through demographic details, caregiver consent, anthropometry, nutritional appetite, and education costs with standardized Indian dropdowns and non-judgmental questions.',
      technicalNote: 'Designed for local intake without blocking on remote requests.',
      bulletPoints: [
        'Standardized India class selector (Pre-Nursery to Class 12+)',
        'Built-in WHO Z-score growth reference calculations',
        'Optional photo attachment compressed client-side',
      ],
    },
    {
      number: '02',
      title: 'Save Offline',
      subtitle: 'Resilient Local Persistence',
      icon: Database,
      accent: 'emerald',
      tagColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      description:
        'Every keystroke, tap, and draft state is automatically committed to the device’s local IndexedDB storage. Closing the tab, running out of battery, or moving off-grid preserves entered data.',
      technicalNote: 'Full Dexie.js ACID-compliant client storage with versioned schemas.',
      bulletPoints: [
        'Instant background auto-saving on every field change',
        'Offline draft review & edit table for caseworkers',
        'Resilient to app closures, browser crashes, and low power',
      ],
    },
    {
      number: '03',
      title: 'Sync',
      subtitle: 'One-Tap Verified Bridge',
      icon: CloudUpload,
      accent: 'sky',
      tagColor: 'bg-sky-100 text-sky-900 border-sky-300',
      description:
        'When returning to a field office or encountering stable cellular signal, records synchronize cleanly with the central Google Sheets registry with payload checksum validation.',
      technicalNote: 'Batch queue with automatic retry, exponential backoff, and idempotent deduplication.',
      bulletPoints: [
        'Clear sync status indicators: Draft, Queued, Synced',
        'Supervisor review portal with immediate data visibility',
        'Zero duplicate records via client-generated UUID keys',
      ],
    },
  ];

  return (
    <section id="field-rhythm" aria-labelledby="rhythm-heading" className="relative py-16 md:py-24 border-b border-[#E4D8C7] bg-[#FAF8F5]">
      <span id="how-it-works" className="sr-only" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#EDE3D2] text-[#63513D] border border-[#D5C2AA] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            Chapter III • Operational Cadence
          </div>
          <h2
            id="rhythm-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            How it works: the 3-step field rhythm.
          </h2>
          <p className="mt-3 text-base sm:text-lg text-slate-700 font-medium">
            Frontline caseworkers operate in environments where connectivity is an exception, not the rule.
            The PWA is architected around a simple, unbreakable three-step rhythm.
          </p>
        </div>

        {/* 3 Step Cards Grid with subtle desktop connector line */}
        <div className="relative">
          {/* Subtle desktop connector dashed line behind cards */}
          <div 
            className="hidden md:block absolute top-12 left-16 right-16 h-0.5 border-t-2 border-dashed border-[#D8C7B0] z-0 pointer-events-none" 
            aria-hidden="true" 
          />

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className="relative flex flex-col justify-between p-6 sm:p-7 rounded-2xl bg-white border border-[#D5C2AA] shadow-xs hover:shadow-md transition-shadow notebook-paper-sheet overflow-hidden"
                >
                  {/* Subtle top edge serrated perforation styling */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-1 bg-[#E4D8C7] [mask-image:repeating-linear-gradient(to_right,#000_0px,#000_6px,transparent_6px,transparent_10px)]"
                    aria-hidden="true"
                  />

                  {/* Step Header */}
                  <div>
                    <div className="flex items-center justify-between mb-5 pt-1">
                      <span className="font-mono text-xl font-black text-slate-400 bg-[#F5EFE6] px-2 py-0.5 rounded border border-[#E5DDD2]">
                        STEP //{step.number}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${step.tagColor}`}>
                        {step.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] border border-[#E4DDD3] flex items-center justify-center text-slate-800 shadow-2xs">
                        <Icon className="w-5 h-5 text-emerald-800" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          {step.title}
                        </h3>
                        <p className="text-xs font-mono font-semibold text-slate-500">
                          {step.subtitle}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 leading-relaxed font-normal mb-5">
                      {step.description}
                    </p>

                    {/* Bullet points */}
                    <ul className="space-y-2 mb-6">
                      {step.bulletPoints.map((bullet, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 font-medium">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Technical architectural footer note */}
                  <div className="pt-3.5 border-t border-[#EDE5D8] text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-700 shrink-0" />
                    <span>{step.technicalNote}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Operational Assurance Banner */}
        <div className="mt-10 p-5 rounded-2xl bg-[#EDE4D4] border border-[#D2BFA8] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 shadow-xs">
              <CheckCircle className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                Thoroughly Verified Field Workflow
              </p>
              <p className="text-xs text-slate-600 font-medium">
                Automated regression suites verify that draft preservation, normalization, and sync conflict resolution function reliably in offline state.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-bold text-emerald-900 bg-white/80 px-3 py-1.5 rounded-lg border border-[#D2BFA8] self-end sm:self-center shrink-0">
            TEST-SUITE: CI-VERIFIED
          </span>
        </div>
      </div>
    </section>
  );
}
