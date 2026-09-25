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
      technicalNote: 'Zero network requests required during intake. Instant in-memory validation.',
      bulletPoints: [
        'Standardized India class selector (Pre-Nursery to Class 12+)',
        'Built-in WHO Z-score growth reference calculations',
        'Optional photo attachment compressed client-side',
      ],
    },
    {
      number: '02',
      title: 'Save Offline',
      subtitle: 'Guaranteed Local Persistence',
      icon: Database,
      accent: 'emerald',
      tagColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      description:
        'Every keystroke, tap, and draft state is automatically committed to the device’s local IndexedDB storage. Closing the tab, running out of battery, or moving off-grid never causes lost work.',
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
    <section id="how-it-works" aria-labelledby="rhythm-heading" className="py-16 md:py-24 border-b border-[#E8DFD1] bg-[#FAF7F2]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <div className="inline-block px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#F3ECE2] text-[#6B5A45] border border-[#DECDBB] mb-3">
            Operational Workflow
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

        {/* 3 Step Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative flex flex-col justify-between p-6 sm:p-7 rounded-2xl bg-white border border-[#E8DFD1] shadow-xs hover:shadow-md transition-shadow notebook-paper-bg"
              >
                {/* Step Header */}
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span className="font-mono text-2xl font-black text-slate-400">
                      /{step.number}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider border ${step.tagColor}`}>
                      {step.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] border border-[#E4DDD3] flex items-center justify-center text-slate-800">
                      <Icon className="w-5 h-5 text-emerald-800" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {step.title}
                      </h3>
                      <p className="text-xs font-medium text-slate-500">
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
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Technical architectural footer note */}
                <div className="pt-4 border-t border-[#F0EBE1] text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-700 shrink-0" />
                  <span>{step.technicalNote}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Operational Assurance Banner */}
        <div className="mt-10 p-5 rounded-2xl bg-[#F0EBE1]/80 border border-[#E2D8C7] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-800 text-white flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <CheckCircle className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                100% Tested Field Cycle
              </p>
              <p className="text-xs text-slate-600">
                Over 540 automated tests guarantee that draft preservation, normalization, and sync conflict resolution function reliably in offline state.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold text-slate-600 self-end sm:self-center shrink-0">
            TEST-STATUS: PASSING (542/542)
          </span>
        </div>
      </div>
    </section>
  );
}
