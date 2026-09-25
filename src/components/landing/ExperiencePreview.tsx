'use client';

import React, { useState } from 'react';
import { 
  FileCheck2, 
  UserCheck, 
  Apple, 
  GraduationCap, 
  Receipt, 
  Check, 
  ShieldCheck,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface PreviewTab {
  id: string;
  number: string;
  name: string;
  badge: string;
  summary: string;
  sanitizedFields: { label: string; value: string; note?: string }[];
  highlight: string;
}

export function ExperiencePreview() {
  const tabs: PreviewTab[] = [
    {
      id: 'demographics',
      number: '02',
      name: 'Demographics & Enrolment',
      badge: 'Step 2',
      summary: 'Basic child identity and enrollment status without invasive profiling. Standardized Indian class dropdown.',
      sanitizedFields: [
        { label: 'Enrolled Class', value: 'Class 4', note: 'Standard Indian School Standard' },
        { label: 'School Category', value: 'Government Primary School' },
        { label: 'Living Arrangement', value: 'Living with Maternal Grandmother' },
        { label: 'District / Cluster', value: 'Field Sector B-4 (Sample)' },
      ],
      highlight: 'Standardized Pre-Nursery to Class 12+ India standard with optional Other specification.',
    },
    {
      id: 'clinical',
      number: '05',
      name: 'Clinical & Anthropometry',
      badge: 'Step 5',
      summary: 'Accurate clinical growth monitoring with instant on-device WHO Z-Score calculations.',
      sanitizedFields: [
        { label: 'Standing Height', value: '114.5 cm' },
        { label: 'Weight', value: '19.2 kg' },
        { label: 'MUAC Tape Measurement', value: '14.8 cm (Green / Safe Zone)' },
        { label: 'Calculated Growth Status', value: 'Normal Development (Green)', note: 'WHO standard' },
      ],
      highlight: 'Real-time color-coded growth references reassure caseworkers and families immediately.',
    },
    {
      id: 'nutrition',
      number: '06',
      name: 'Nutrition & Daily Appetite',
      badge: 'Step 6',
      summary: 'Observational eating frequency and appetite monitoring using empathetic, respectful icons.',
      sanitizedFields: [
        { label: 'Appetite Level', value: 'Good / Regular Meals' },
        { label: 'Meals Per Day', value: '3 Balanced Meals' },
        { label: 'Dietary Diversity', value: 'Pulses, Grains, Dairy & Seasonal Fruit' },
        { label: 'Nutrition Support Kit', value: 'Monthly Supplementary Ration Allocated' },
      ],
      highlight: 'Non-stigmatizing evaluation helps identify micronutrient gaps without shaming.',
    },
    {
      id: 'education',
      number: '08',
      name: 'Education Costs & Aid',
      badge: 'Step 8',
      summary: 'Itemized expense requirements enabling exact, transparent support grants and direct transfers.',
      sanitizedFields: [
        { label: 'School Tuition & Examination', value: '₹ 1,800 / Term' },
        { label: 'Books & Stationery Kit', value: '₹ 650 / Complete Kit' },
        { label: 'Uniform & Shoes Allowance', value: '₹ 950 / Annual Set' },
        { label: 'Recommended Programme Support', value: '₹ 3,400 Total Direct Aid' },
      ],
      highlight: 'Itemized verification prevents misallocation and accelerates district approval.',
    },
  ];

  const [activeTabId, setActiveTabId] = useState<string>('demographics');
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <section id="preview-heading" aria-labelledby="preview-heading" className="py-16 md:py-24 border-b border-[#E4D8C7] bg-[#FAF8F5]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#EDE3D2] text-[#63513D] border border-[#D5C2AA] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            Chapter V • Interaction Preview
          </div>
          <h2
            id="preview-heading-title"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            A dignified, transparent field intake.
          </h2>
          <p className="mt-3 text-base sm:text-lg text-slate-700 font-medium">
            Explore how field data is captured. All examples below use synthesized, privacy-safe sample data to demonstrate
            field forms without compromising any beneficiary privacy.
          </p>
        </div>

        {/* Interactive Notebook Preview Container with Tabbed Ledger Binder */}
        <div className="rounded-3xl bg-[#F4EDE2] border border-[#D5C2AA] shadow-lg p-2 sm:p-4">
          {/* Physical Ledger Divider Tabs */}
          <div
            role="tablist"
            aria-label="Assessment Section Previews"
            className="flex items-end gap-1.5 px-2 overflow-x-auto pb-0"
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  id={`tab-${tab.id}`}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`flex items-center gap-2 px-3.5 sm:px-5 py-3 rounded-t-xl text-xs font-mono font-bold transition-all shrink-0 cursor-pointer border-t border-x ${
                    isActive
                      ? 'bg-[#FCFAF6] text-emerald-950 border-[#D5C2AA] shadow-xs z-10 translate-y-0.5'
                      : 'bg-[#EAE1D1] text-slate-600 hover:text-slate-900 border-[#D8C7B0] hover:bg-[#E2D8C7]'
                  }`}
                >
                  <span className="text-[10px] text-slate-400">/{tab.number}</span>
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>

          {/* Active Tab Panel — Tactile Ruled Ledger Sheet */}
          <div
            id={`panel-${activeTab.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab.id}`}
            className="relative rounded-2xl p-6 sm:p-8 space-y-6 notebook-paper-sheet border border-[#D5C2AA] shadow-xs overflow-hidden"
          >
            {/* Red left ledger vertical margin line */}
            <div 
              className="absolute top-0 bottom-0 left-6 sm:left-8 w-px bg-red-400/40 pointer-events-none hidden sm:block" 
              aria-hidden="true" 
            />

            {/* Panel Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[#E8DFD1] sm:pl-6">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300 mb-1">
                  {activeTab.badge} — Form Preview
                </span>
                <h3 className="text-xl font-bold text-slate-900">
                  {activeTab.name}
                </h3>
              </div>
              <div className="text-[11px] font-mono font-bold text-slate-600 bg-[#F4EFE6] px-3 py-1.5 rounded-lg border border-[#D8C7B0] self-start sm:self-auto shadow-2xs">
                ★ SYNTHETIC SAMPLE RECORD
              </div>
            </div>

            <p className="text-sm text-slate-700 max-w-2xl sm:pl-6 font-normal">
              {activeTab.summary}
            </p>

            {/* Sanitized Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:pl-6">
              {activeTab.sanitizedFields.map((field, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-white border border-[#E2D8C7] space-y-1 shadow-2xs"
                >
                  <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    {field.label}
                  </div>
                  <div className="text-sm font-bold text-slate-900 flex items-center justify-between">
                    <span>{field.value}</span>
                    <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                  </div>
                  {field.note && (
                    <div className="text-[11px] text-slate-500 font-medium">
                      {field.note}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Key Field Assurance Highlight */}
            <div className="p-4 rounded-xl bg-[#F0EAE0] border border-[#D5C2AA] flex items-start gap-3 sm:ml-6 shadow-2xs">
              <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-medium">
                <strong className="text-slate-900 font-bold">Field Highlight: </strong>
                {activeTab.highlight}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
