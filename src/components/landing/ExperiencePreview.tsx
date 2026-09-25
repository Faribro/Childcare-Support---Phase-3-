'use client';

import React, { useState, useRef } from 'react';
import { 
  FileCheck2, 
  UserCheck, 
  Apple, 
  GraduationCap, 
  Receipt, 
  Check, 
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Database,
  Users
} from 'lucide-react';

interface PreviewTab {
  id: string;
  number: string;
  name: string;
  badge: string;
  tabColor: string;
  activeColor: string;
  summary: string;
  sanitizedFields: { label: string; value: string; note?: string }[];
  highlight: string;
  polaroid: {
    title: string;
    caption: string;
    rotation: string;
    badge: string;
  };
}

export function ExperiencePreview() {
  const tabs: PreviewTab[] = [
    {
      id: 'demographics',
      number: '01',
      name: 'Demographics & Enrolment',
      badge: 'Step 2',
      tabColor: 'bg-[#EDE0CD] text-[#5C452D] border-[#D1BD9F]',
      activeColor: 'bg-[#FCFAF6] text-[#45321F] border-[#C4AC8C]',
      summary: 'Basic child identity and enrollment status without invasive profiling. Standardized Indian class dropdown.',
      sanitizedFields: [
        { label: 'Enrolled Class', value: 'Class 4', note: 'Standard Indian School Standard' },
        { label: 'School Category', value: 'Government Primary School' },
        { label: 'Living Arrangement', value: 'Living with Maternal Grandmother' },
        { label: 'District / Cluster', value: 'Field Sector B-4 (Sample)' },
      ],
      highlight: 'Standardized Pre-Nursery to Class 12+ India standard with optional Other specification.',
      polaroid: {
        title: 'CLASS ENROLMENT',
        caption: 'REF: STD-CLASS-4 • GOVT PRIMARY',
        rotation: '-rotate-1',
        badge: 'CONFIRMED',
      },
    },
    {
      id: 'clinical',
      number: '02',
      name: 'Clinical & Anthropometry',
      badge: 'Step 5',
      tabColor: 'bg-[#F0D5CC] text-[#7A3622] border-[#DDB4A6]',
      activeColor: 'bg-[#FCFAF6] text-[#612413] border-[#CFA191]',
      summary: 'Accurate clinical growth monitoring with instant on-device WHO Z-Score calculations.',
      sanitizedFields: [
        { label: 'Standing Height', value: '114.5 cm' },
        { label: 'Weight', value: '19.2 kg' },
        { label: 'MUAC Tape Measurement', value: '14.8 cm (Green / Safe Zone)' },
        { label: 'Calculated Growth Status', value: 'Normal Development (Green)', note: 'WHO standard' },
      ],
      highlight: 'Real-time color-coded growth references reassure caseworkers and families immediately.',
      polaroid: {
        title: 'WHO GROWTH CHART',
        caption: 'HEIGHT: 114.5cm • WT: 19.2kg • Z: 0.2',
        rotation: 'rotate-1',
        badge: 'GREEN ZONE',
      },
    },
    {
      id: 'nutrition',
      number: '03',
      name: 'Nutrition & Daily Appetite',
      badge: 'Step 6',
      tabColor: 'bg-[#F6E3C0] text-[#785116] border-[#E8CD96]',
      activeColor: 'bg-[#FCFAF6] text-[#5C3D0E] border-[#D9BA7D]',
      summary: 'Observational eating frequency and appetite monitoring using empathetic, respectful questions.',
      sanitizedFields: [
        { label: 'Appetite Level', value: 'Good / Regular Meals' },
        { label: 'Meals Per Day', value: '3 Balanced Meals' },
        { label: 'Dietary Diversity', value: 'Pulses, Grains, Dairy & Seasonal Fruit' },
        { label: 'Nutrition Support Kit', value: 'Monthly Supplementary Ration Allocated' },
      ],
      highlight: 'Non-stigmatizing evaluation helps identify micronutrient gaps without shaming.',
      polaroid: {
        title: 'NUTRITION LOG',
        caption: 'DAILY INTAKE: BALANCED • RATION ALLOCATED',
        rotation: '-rotate-1.5',
        badge: 'ACTIVE RATION',
      },
    },
    {
      id: 'education',
      number: '04',
      name: 'Education Costs & Aid',
      badge: 'Step 8',
      tabColor: 'bg-[#D2E4D8] text-[#1E5232] border-[#ADCBB7]',
      activeColor: 'bg-[#FCFAF6] text-[#143B23] border-[#97BDA3]',
      summary: 'Itemized expense requirements enabling exact, transparent support grants and direct transfers.',
      sanitizedFields: [
        { label: 'School Tuition & Examination', value: '₹ 1,800 / Term' },
        { label: 'Books & Stationery Kit', value: '₹ 650 / Complete Kit' },
        { label: 'Uniform & Shoes Allowance', value: '₹ 950 / Annual Set' },
        { label: 'Recommended Programme Support', value: '₹ 3,400 Total Direct Aid' },
      ],
      highlight: 'Itemized verification prevents misallocation and accelerates district approval.',
      polaroid: {
        title: 'GRANT DISBURSEMENT',
        caption: 'RECOMMENDED AID: ₹ 3,400 • RECEIPTS OK',
        rotation: 'rotate-1',
        badge: 'MATCHED',
      },
    },
    {
      id: 'family',
      number: '05',
      name: 'Family Support & Consent',
      badge: 'Step 1',
      tabColor: 'bg-[#E3DCED] text-[#483366] border-[#C8BDD9]',
      activeColor: 'bg-[#FCFAF6] text-[#362352] border-[#B2A4C7]',
      summary: 'Verified caregiver consent, guardian signature preservation, and household stability details.',
      sanitizedFields: [
        { label: 'Legal Guardian', value: 'Maternal Grandmother (Verified)' },
        { label: 'Consent Status', value: 'Informed Consent Signed & Recorded' },
        { label: 'Primary Caregiver Phone', value: '+91 ••••• •••12 (Masked for privacy)' },
        { label: 'Bank Direct Transfer', value: 'DBT Seeded / Account Verified' },
      ],
      highlight: 'Caregiver autonomy and mutual consent precede all field recording.',
      polaroid: {
        title: 'CAREGIVER ACCORD',
        caption: 'INFORMED CONSENT ON FILE • AADHAAR MIN',
        rotation: '-rotate-1',
        badge: 'VERIFIED',
      },
    },
    {
      id: 'sync',
      number: '06',
      name: 'Field Sync & Offline Queue',
      badge: 'Step 9',
      tabColor: 'bg-[#CFE2EB] text-[#1D4A5E] border-[#A9C8D6]',
      activeColor: 'bg-[#FCFAF6] text-[#133645] border-[#91B5C6]',
      summary: 'On-device IndexedDB queue management with zero data loss during network dropouts.',
      sanitizedFields: [
        { label: 'Offline Queue Status', value: '1 Record Ready for Upload' },
        { label: 'Device Storage', value: 'Committed to Browser IndexedDB' },
        { label: 'Sync Channel', value: 'Google Sheets Apps Script API' },
        { label: 'Idempotent Token', value: 'UUIDv4 Checksum Validated' },
      ],
      highlight: 'Automatic retry with exponential backoff guarantees clean zero-duplicate reconciliation.',
      polaroid: {
        title: 'OFFLINE QUEUE',
        caption: '1 DRAFT COMMITTED • READY FOR SYNC',
        rotation: 'rotate-1.5',
        badge: 'LOCAL FIRST',
      },
    },
  ];

  const [activeTabId, setActiveTabId] = useState<string>('demographics');
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeIndex = tabs.findIndex((t) => t.id === activeTabId);

  const handlePrevTab = () => {
    const newIndex = activeIndex > 0 ? activeIndex - 1 : tabs.length - 1;
    const targetTab = tabs[newIndex];
    setActiveTabId(targetTab.id);
    const el = document.getElementById(`tab-${targetTab.id}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  const handleNextTab = () => {
    const newIndex = activeIndex < tabs.length - 1 ? activeIndex + 1 : 0;
    const targetTab = tabs[newIndex];
    setActiveTabId(targetTab.id);
    const el = document.getElementById(`tab-${targetTab.id}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  return (
    <section id="preview-heading" aria-labelledby="preview-heading-title" className="py-16 md:py-24 border-b border-[#E4D8C7] bg-[#FAF8F5]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#EDE3D2] text-[#63513D] border border-[#D5C2AA] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            Chapter V • The 6-Section Case Navigator
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

        {/* ── Mosby's Files Interactive Folder Filing System ── */}
        <div className="rounded-3xl bg-[#F0E6D6] border-2 border-[#CBB89F] shadow-2xl p-2 sm:p-5">
          {/* Staggered Colorful Folder Tabs with Slider Buttons */}
          <div className="relative flex items-center mb-0">
            {/* Left Slider Button */}
            <button
              type="button"
              onClick={handlePrevTab}
              aria-label="Previous section"
              title="Previous section"
              className="absolute -left-1 sm:-left-2 z-30 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#FCFAF6] hover:bg-white text-slate-800 shadow-md border border-[#C5B396] transition-all hover:scale-110 active:scale-95 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
            </button>

            {/* Staggered Folder Tabs - No native scrollbar */}
            <div
              ref={tabsContainerRef}
              role="tablist"
              aria-label="Assessment Section Previews"
              className="flex items-end gap-1 sm:gap-2 px-8 sm:px-10 overflow-x-auto pb-0 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden w-full"
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
                    onClick={() => {
                      setActiveTabId(tab.id);
                      const el = document.getElementById(`tab-${tab.id}`);
                      if (el && typeof el.scrollIntoView === 'function') {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                      }
                    }}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-t-xl sm:rounded-t-2xl text-[11px] sm:text-xs font-mono font-bold transition-all shrink-0 cursor-pointer border-t-2 border-x-2 ${
                      isActive
                        ? `${tab.activeColor} shadow-md z-20 translate-y-1`
                        : `${tab.tabColor} hover:brightness-95 opacity-85 hover:opacity-100 z-10`
                    }`}
                  >
                    <span className="text-[10px] opacity-60">/{tab.number}</span>
                    <span className="whitespace-nowrap">{tab.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Slider Button */}
            <button
              type="button"
              onClick={handleNextTab}
              aria-label="Next section"
              title="Next section"
              className="absolute -right-1 sm:-right-2 z-30 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#FCFAF6] hover:bg-white text-slate-800 shadow-md border border-[#C5B396] transition-all hover:scale-110 active:scale-95 cursor-pointer shrink-0"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
            </button>
          </div>

          {/* Active Folder Interior: Layered Cotton Ruled Sheet & Polaroid Specimen with Folder Flap Animation */}
          <div
            key={activeTab.id}
            id={`panel-${activeTab.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab.id}`}
            className="relative rounded-2xl p-6 sm:p-8 space-y-6 notebook-paper-sheet border-2 border-[#CBB89F] shadow-lg overflow-hidden bg-[#FCFAF6] motion-safe:animate-folder-unfold origin-top-left"
          >
            {/* Red left ledger vertical margin line */}
            <div 
              className="absolute top-0 bottom-0 left-6 sm:left-8 w-px bg-red-400/40 pointer-events-none hidden sm:block" 
              aria-hidden="true" 
            />

            {/* Folder Interior Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[#E8DFD1] sm:pl-6">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300 mb-1">
                  {activeTab.badge} — Form Preview
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {activeTab.name}
                </h3>
              </div>
              <div className="text-[11px] font-mono font-bold text-slate-600 bg-[#F4EFE6] px-3 py-1.5 rounded-lg border border-[#D8C7B0] self-start sm:self-auto shadow-2xs">
                ★ SYNTHETIC SAMPLE RECORD
              </div>
            </div>

            <p className="text-sm sm:text-base text-slate-700 max-w-2xl sm:pl-6 font-normal">
              {activeTab.summary}
            </p>

            {/* 2-Column Spread: Left Form Fields, Right Specimen Polaroid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:pl-6">
              {/* Sanitized Fields Grid */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              {/* Tilted Specimen Polaroid Card with Paperclip & Drop-In Bounce */}
              <div className="lg:col-span-4 flex justify-center items-center">
                <div 
                  key={`polaroid-${activeTab.id}`}
                  className={`relative p-3.5 pb-5 rounded-xl bg-white border border-slate-300 shadow-xl max-w-[240px] w-full transform ${activeTab.polaroid.rotation} transition-all duration-300 ease-out motion-safe:animate-polaroid-drop hover:scale-105 hover:-rotate-1 hover:shadow-2xl cursor-pointer`}
                >
                  {/* Silver Paperclip SVG pinning the Polaroid */}
                  <div className="absolute -top-3.5 right-6 w-5 h-10 z-20 pointer-events-none" aria-hidden="true">
                    <svg viewBox="0 0 24 48" fill="none" className="w-full h-full drop-shadow-sm">
                      <path
                        d="M8,12 L8,36 C8,41 16,41 16,36 L16,8 C16,3 4,3 4,8 L4,38 C4,45 20,45 20,38 L20,12"
                        stroke="#64748B"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  {/* Polaroid Photo Frame */}
                  <div className="h-32 bg-[#F1E9DB] rounded-lg border border-[#DECDBB] flex flex-col items-center justify-center p-3 text-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center mb-2 shadow-xs">
                      <FileCheck2 className="w-4 h-4" />
                    </div>
                    <span className="font-mono text-[9px] font-extrabold text-slate-800 tracking-wider">
                      {activeTab.polaroid.title}
                    </span>
                    <span className="mt-1 px-2 py-0.5 rounded-full text-[8px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                      {activeTab.polaroid.badge}
                    </span>
                  </div>

                  {/* Typewritten Metadata Caption */}
                  <div className="mt-3 text-center">
                    <p className="font-mono text-[9px] text-slate-600 font-semibold tracking-tight">
                      {activeTab.polaroid.caption}
                    </p>
                  </div>
                </div>
              </div>
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
