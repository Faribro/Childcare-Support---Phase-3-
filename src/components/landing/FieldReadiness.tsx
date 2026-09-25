'use client';

import React from 'react';
import { WifiOff, BatteryCharging, Shield, Smartphone, HardDrive, Zap, Check } from 'lucide-react';

export function FieldReadiness() {
  const specs = [
    {
      icon: WifiOff,
      title: 'Offline-First Intake',
      metric: 'Local',
      metricLabel: 'On-Device Recording',
      description: 'The survey intake workflow records assessments directly in browser storage, allowing uninterrupted fieldwork in remote or connectivity-deprived communities.',
    },
    {
      icon: BatteryCharging,
      title: 'Efficient Mobile Footprint',
      metric: 'Fast',
      metricLabel: 'Resource-Conscious DOM',
      description: 'Streamlined UI architecture with lightweight rendering, designed to perform reliably on budget Android smartphones throughout long field visits.',
    },
    {
      icon: HardDrive,
      title: 'IndexedDB Draft Cache',
      metric: 'IndexedDB',
      metricLabel: 'Browser-Isolated Storage',
      description: 'Reliable client-side database retains active drafts, queued submissions, and attachments securely until network synchronization is initiated.',
    },
    {
      icon: Zap,
      title: 'Resilient Session Resume',
      metric: 'Auto',
      metricLabel: 'State Restoration',
      description: 'If the app is closed or the device powers off, reopening the PWA restores the active draft session without discarding completed sections.',
    },
  ];

  return (
    <section id="field-readiness" aria-labelledby="readiness-heading" className="py-16 md:py-24 border-b border-[#E4D8C7] bg-[#F5EFE6]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Narrative and Specs Grid */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#EDE3D2] text-[#63513D] border border-[#D5C2AA] mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
                Chapter IV • Field Environmental Reality
              </div>
              <h2
                id="readiness-heading"
                className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
              >
                Built for real field conditions.
              </h2>
              <p className="mt-3 text-base sm:text-lg text-slate-700 font-medium">
                Field visits happen in monsoon rains, unshaded brickyards, and areas with dead cellular signal.
                The PWA was engineered from the ground up to be resilient, dignified, and fast on low-cost devices.
              </p>
            </div>

            {/* Spec Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {specs.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="relative p-5 rounded-2xl bg-[#FCFAF6] border border-[#D5C2AA] shadow-xs flex flex-col justify-between notebook-paper-sheet"
                  >
                    {/* Punch hole accent in top right */}
                    <div className="absolute top-4 right-4 notebook-punch-hole" aria-hidden="true" />

                    <div>
                      <div className="flex items-center justify-between mb-3 pr-6">
                        <div className="w-8 h-8 rounded-lg bg-[#F4F1EA] border border-[#E5DDD2] flex items-center justify-center text-emerald-800">
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-100/70 px-2 py-0.5 rounded border border-emerald-300">
                          {item.metric}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mb-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed font-normal">
                        {item.description}
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-[#E8DFD1] text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-slate-400" />
                      {item.metricLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Handcrafted Device Mockup on Field Clipboard */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-[340px] sm:max-w-[360px]">
              {/* Field Hardboard Clipboard Backdrop */}
              <div className="relative rounded-3xl p-4 sm:p-5 bg-[#C5A880] border-4 border-[#A3855E] shadow-2xl">
                {/* Metallic Spring Clip SVG at Top */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-7 bg-gradient-to-b from-slate-200 to-slate-400 rounded-t-lg border-2 border-slate-500 shadow-md flex items-center justify-center gap-6 z-30">
                  <span className="w-2 h-2 rounded-full bg-slate-600 shadow-inner" />
                  <span className="w-8 h-1 rounded-full bg-slate-700/40" />
                  <span className="w-2 h-2 rounded-full bg-slate-600 shadow-inner" />
                </div>

                {/* Outer Device Silhouette */}
                <div className="relative rounded-[36px] p-3 bg-slate-900 shadow-xl border-4 border-slate-800 mt-2">
                  {/* Device Speaker Notch */}
                  <div className="absolute top-5 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-slate-700 z-20" />

                  {/* Device Screen Area */}
                  <div className="rounded-[28px] bg-[#FAF8F5] overflow-hidden border border-slate-700 text-slate-900 select-none">
                    {/* Status Bar */}
                    <div className="pt-4 px-4 pb-2 bg-slate-900 text-white flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold">09:42</span>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          OFFLINE
                        </span>
                        <span>•</span>
                        <span>87%</span>
                      </div>
                    </div>

                    {/* App Header in Device */}
                    <div className="px-4 py-3 bg-[#1A3828] text-white flex items-center justify-between border-b border-[#244A36]">
                      <div>
                        <div className="text-[10px] font-mono tracking-wider text-emerald-300 font-bold uppercase">
                          Alliance India PWA
                        </div>
                        <div className="text-xs font-bold">Child Nutrition Intake</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-900/80 text-emerald-200 border border-emerald-700">
                        v3.0
                      </span>
                    </div>

                    {/* Progress Indicator */}
                    <div className="px-4 py-2.5 bg-[#F0EAE1] border-b border-[#E2D8C7] flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700">Section 2: Nutrition &amp; Diet</span>
                      <span className="font-mono text-[10px] font-bold text-emerald-800">Step 2 of 6</span>
                    </div>

                    {/* Simulated Form Content */}
                    <div className="p-4 space-y-3">
                      <div className="p-2.5 rounded-lg bg-white border border-[#E5DDD2] space-y-1">
                        <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">Current Class</label>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                          <span>Class 4</span>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-lg bg-white border border-[#E5DDD2]">
                          <span className="text-[9px] font-mono text-slate-500 uppercase block">Height (cm)</span>
                          <span className="text-xs font-bold text-slate-800">114.5</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-[#E5DDD2]">
                          <span className="text-[9px] font-mono text-slate-500 uppercase block">Weight (kg)</span>
                          <span className="text-xs font-bold text-slate-800">19.2</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-mono text-emerald-800 uppercase block font-bold">WHO Z-Score</span>
                          <span className="text-xs font-bold text-emerald-900">Green / Normal Growth</span>
                        </div>
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white border border-[#E5DDD2] space-y-1">
                        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block">Draft Storage</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Committed to IndexedDB (Local Draft)</span>
                        </div>
                      </div>

                      {/* Simulated Next Step Button */}
                      <div className="pt-1">
                        <div className="w-full py-2 rounded-lg bg-emerald-800 text-white text-xs font-bold text-center shadow-xs">
                          Continue to Education Support →
                        </div>
                      </div>
                    </div>

                    {/* Device Bottom Handle */}
                    <div className="py-2 flex justify-center bg-[#FAF8F5]">
                      <div className="w-24 h-1 rounded-full bg-slate-300" />
                    </div>
                  </div>
                </div>

                {/* Floating field assurance badge */}
                <div className="absolute -bottom-4 -left-3 p-2.5 sm:p-3 rounded-xl bg-white border border-[#D5C2AA] shadow-lg flex items-center gap-2 text-xs z-30">
                  <Shield className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="font-bold text-slate-800 text-[11px]">
                    Local-First Draft Storage
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
