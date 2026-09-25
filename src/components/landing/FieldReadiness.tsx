'use client';

import React from 'react';
import { WifiOff, BatteryCharging, Shield, Smartphone, HardDrive, Zap, Check } from 'lucide-react';

export function FieldReadiness() {
  const specs = [
    {
      icon: WifiOff,
      title: 'Full Offline Autonomy',
      metric: '0 KB',
      metricLabel: 'Network needed to record',
      description: 'The complete survey workflow functions with zero active connectivity. Caseworkers can fill dozens of assessments in remote villages or dense urban bastis without interruption.',
    },
    {
      icon: BatteryCharging,
      title: 'Low Power & Battery Gentle',
      metric: '< 2%',
      metricLabel: 'Typical battery drain/hour',
      description: 'Lightweight DOM architecture without heavy canvas polling or background telemetry loops, keeping budget Android smartphones alive through an entire 8-hour field day.',
    },
    {
      icon: HardDrive,
      title: 'IndexedDB Zero-Loss Vault',
      metric: '500+',
      metricLabel: 'Local records capacity',
      description: 'High-reliability client-side storage holds full draft sessions, un-synced submissions, and photo attachments securely until safe synchronization is initiated.',
    },
    {
      icon: Zap,
      title: 'Instant App Resume',
      metric: '< 100ms',
      metricLabel: 'Restore draft speed',
      description: 'If the phone shuts off or the browser is backgrounded, reopening the app instantly restores the active draft without losing form state or entered measurements.',
    },
  ];

  return (
    <section aria-labelledby="readiness-heading" className="py-16 md:py-24 border-b border-[#E8DFD1] bg-[#F7F4EE]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Narrative and Specs Grid */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <div className="inline-block px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#EFE7DC] text-[#6B5A45] border border-[#DECDBB] mb-3">
                Field Engineering
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
                    className="p-4 sm:p-5 rounded-xl bg-white border border-[#E8DFD1] shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-8 h-8 rounded-lg bg-[#FAF7F2] border border-[#E8DFD1] flex items-center justify-center text-emerald-800">
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
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
                    <div className="mt-3 pt-2 border-t border-[#F0EBE1] text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                      {item.metricLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Stylized Handcrafted Device Mockup (Pure CSS & SVG) */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-[320px] sm:max-w-[340px]">
              {/* Outer Device Silhouette */}
              <div className="relative rounded-[36px] p-3 bg-slate-900 shadow-2xl border-4 border-slate-800">
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
                    <span className="font-semibold text-slate-700">Section 2: Nutrition & Diet</span>
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
                        <span>Committed to IndexedDB (Zero loss)</span>
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
              <div className="absolute -bottom-4 -left-4 p-3 rounded-xl bg-white border border-[#DECDBB] shadow-lg flex items-center gap-2.5 text-xs">
                <Shield className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="font-bold text-slate-800 text-[11px]">
                  Tamper-Evident Local Storage
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
