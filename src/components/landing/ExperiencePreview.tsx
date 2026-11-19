'use client';

import React, { useState, useRef, useMemo } from 'react';
import { 
  FileCheck2, 
  UserCheck, 
  Apple, 
  GraduationCap, 
  Check, 
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Users,
  HeartHandshake,
  Activity,
  CreditCard,
  Building2,
  Clock,
  Send
} from 'lucide-react';

export type SupportCategory = 'all' | 'education' | 'nutrition' | 'hiv';

interface PreviewStep {
  id: string;
  number: string;
  name: string;
  badge: string;
  tabColor: string;
  activeColor: string;
  summary: string;
  applicableTo: SupportCategory[];
  sanitizedFields: { label: string; value: string; note?: string }[];
  highlight: string;
  polaroid: {
    title: string;
    caption: string;
    rotation: string;
    badge: string;
    icon: React.ElementType;
  };
}

export function ExperiencePreview() {
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory>('all');

  const allSteps: PreviewStep[] = useMemo(() => [
    {
      id: 'step-01',
      number: '01',
      name: 'Choose the support needed',
      badge: 'Step 1',
      tabColor: 'bg-[#EDE0CD] text-[#5C452D] border-[#D1BD9F]',
      activeColor: 'bg-[#FCFAF6] text-[#45321F] border-[#C4AC8C]',
      summary: 'At the beginning, the field worker chooses the type of support the child may need. The form then shows only the questions relevant to the selected support.',
      applicableTo: ['all', 'education', 'nutrition', 'hiv'],
      sanitizedFields: [
        { label: 'Support choice 1', value: 'Education support' },
        { label: 'Support choice 2', value: 'Nutrition support' },
        { label: 'Support choice 3', value: 'HIV-related support' },
        { label: 'Support choice 4', value: 'All categories' },
      ],
      highlight: 'Selecting a category immediately hides unrelated questions so the field worker only asks what is truly needed.',
      polaroid: {
        title: 'SUPPORT SELECTION',
        caption: 'CATEGORY CHOICE • FOCUSED FORM',
        rotation: '-rotate-1',
        badge: 'ADAPTIVE FORM',
        icon: HeartHandshake,
      },
    },
    {
      id: 'step-02',
      number: '02',
      name: 'Take consent',
      badge: 'Step 2',
      tabColor: 'bg-[#F0D5CC] text-[#7A3622] border-[#DDB4A6]',
      activeColor: 'bg-[#FCFAF6] text-[#612413] border-[#CFA191]',
      summary: 'The field worker explains the purpose of the form and takes consent from the caregiver or responsible adult.',
      applicableTo: ['all', 'education', 'nutrition', 'hiv'],
      sanitizedFields: [
        { label: 'Caregiver consent', value: 'Consent given and agreed' },
        { label: 'Date of visit', value: '18 November 2026' },
        { label: 'Child details', value: 'Child present with adult caregiver' },
        { label: 'Visit note', value: 'Purpose and voluntary participation explained' },
      ],
      highlight: 'Clear consent and caregiver agreement are required before any child information is collected.',
      polaroid: {
        title: 'CAREGIVER CONSENT',
        caption: 'INFORMED CONSENT • VISIT CONFIRMED',
        rotation: 'rotate-1',
        badge: 'AGREED',
        icon: UserCheck,
      },
    },
    {
      id: 'step-03',
      number: '03',
      name: 'Enter child and caregiver details',
      badge: 'Step 3',
      tabColor: 'bg-[#F6E3C0] text-[#785116] border-[#E8CD96]',
      activeColor: 'bg-[#FCFAF6] text-[#5C3D0E] border-[#D9BA7D]',
      summary: 'The field worker enters child identity, home address, and caregiver contact details. Caregiver contact is entered once.',
      applicableTo: ['all', 'education', 'nutrition', 'hiv'],
      sanitizedFields: [
        { label: 'Child name', value: 'Aarav Sharma (Sample)' },
        { label: 'Date of birth and age', value: '14 July 2017 (9 years)' },
        { label: 'Gender', value: 'Male' },
        { label: 'Caregiver name and relationship', value: 'Sunita Sharma (Maternal Aunt)' },
        { label: 'Caregiver contact number', value: '+91 ••••• ••124 (Entered once)' },
        { label: 'Home address', value: 'House 14, Ward 3, Rampur Village' },
        { label: 'State and district', value: 'Maharashtra, Pune' },
      ],
      highlight: 'Caregiver contact number and home address are collected once to respect the family’s time.',
      polaroid: {
        title: 'IDENTITY & ADDRESS',
        caption: 'AARAV SHARMA (9 YRS) • PUNE',
        rotation: '-rotate-1.5',
        badge: 'ENTERED ONCE',
        icon: Users,
      },
    },
    {
      id: 'step-04',
      number: '04',
      name: 'Add family and income details',
      badge: 'Step 4',
      tabColor: 'bg-[#D2E4D8] text-[#1E5232] border-[#ADCBB7]',
      activeColor: 'bg-[#FCFAF6] text-[#143B23] border-[#97BDA3]',
      summary: 'If education or nutrition support is selected, the field worker adds family and income details to help understand the household situation.',
      applicableTo: ['all', 'education', 'nutrition'],
      sanitizedFields: [
        { label: 'Household members', value: '5 people in home' },
        { label: 'Children in household', value: '2 children under 18' },
        { label: 'Monthly household income', value: '₹ 8,500 / month' },
        { label: 'Main income source', value: 'Daily wage labour' },
      ],
      highlight: 'Helps the team understand family vulnerability and allocate priority nutrition or education grants.',
      polaroid: {
        title: 'FAMILY PROFILE',
        caption: '5 MEMBERS • ₹ 8,500 MONTHLY INCOME',
        rotation: 'rotate-1',
        badge: 'PRIORITY TIER',
        icon: Building2,
      },
    },
    {
      id: 'step-05',
      number: '05',
      name: 'Add health information',
      badge: 'Step 5',
      tabColor: 'bg-[#E3DCED] text-[#483366] border-[#C8BDD9]',
      activeColor: 'bg-[#FCFAF6] text-[#362352] border-[#B2A4C7]',
      summary: 'The field worker records health information: growth and haemoglobin for nutrition, or treatment and viral-load status for HIV-related support.',
      applicableTo: ['all', 'nutrition', 'hiv'],
      sanitizedFields: [
        { label: 'Nutrition: Current weight', value: '21.4 kg (Growth tracking)' },
        { label: 'Nutrition: Current height', value: '118.0 cm (Safe zone)' },
        { label: 'Nutrition: Haemoglobin level', value: '11.2 g/dL (Available)' },
        { label: 'HIV care: ART status', value: 'On ART (Active clinical follow-up)' },
        { label: 'HIV care: ART registration', value: 'Registered with local center' },
        { label: 'HIV care: Viral-load status', value: 'Suppressed / stable (< 1,000 copies/mL)' },
      ],
      highlight: 'The field worker enters only the health questions relevant to the selected support.',
      polaroid: {
        title: 'HEALTH DETAILS',
        caption: 'WT: 21.4kg • HT: 118cm • HB: 11.2',
        rotation: '-rotate-1',
        badge: 'ACTIVE CARE',
        icon: Activity,
      },
    },
    {
      id: 'step-06',
      number: '06',
      name: 'Add education details',
      badge: 'Step 6',
      tabColor: 'bg-[#CFE2EB] text-[#1D4A5E] border-[#A9C8D6]',
      activeColor: 'bg-[#FCFAF6] text-[#133645] border-[#91B5C6]',
      summary: 'If education support is selected, the field worker records school enrolment, class, attendance, expenses, and attaches school documents.',
      applicableTo: ['all', 'education'],
      sanitizedFields: [
        { label: 'School enrolment', value: 'Enrolled & regular attendance' },
        { label: 'School name & type', value: 'Government Primary School Rampur' },
        { label: 'Current class', value: 'Class 4 (Primary standard)' },
        { label: 'Attendance information', value: 'Regular (>85% monthly attendance)' },
        { label: 'School-related expenses', value: 'Books, examination fees, and uniform' },
        { label: 'Add photo or document', value: 'School fee receipt attached (Sample)' },
      ],
      highlight: 'Itemized educational costs enable direct fee support without unnecessary delays.',
      polaroid: {
        title: 'SCHOOL DETAILS',
        caption: 'CLASS 4 • GOVT PRIMARY • RECEIPTS OK',
        rotation: 'rotate-1.5',
        badge: 'ENROLLED',
        icon: GraduationCap,
      },
    },
    {
      id: 'step-07',
      number: '07',
      name: 'Add nutrition details',
      badge: 'Step 7',
      tabColor: 'bg-[#FBE5D6] text-[#7A3614] border-[#E8C2A8]',
      activeColor: 'bg-[#FCFAF6] text-[#5C270C] border-[#D6A98C]',
      summary: 'If nutrition support is selected, the field worker records appetite, meal frequency per day, and notes any visible signs of malnutrition.',
      applicableTo: ['all', 'nutrition'],
      sanitizedFields: [
        { label: 'Child appetite', value: 'Good / takes regular meals' },
        { label: 'Meals per day', value: '3 balanced meals daily' },
        { label: 'Signs of malnutrition', value: 'None observed (Healthy child appearance)' },
        { label: 'Supplementary support', value: 'Monthly supplementary ration kit recommended' },
      ],
      highlight: 'Respectful, non-judgmental questions about daily meals and immediate supplementary nutrition planning.',
      polaroid: {
        title: 'NUTRITION DETAILS',
        caption: '3 MEALS DAILY • RATION ALLOCATED',
        rotation: '-rotate-1',
        badge: 'BALANCED MEALS',
        icon: Apple,
      },
    },
    {
      id: 'step-08',
      number: '08',
      name: 'Add HIV-related details',
      badge: 'Step 8',
      tabColor: 'bg-[#E6DEF0] text-[#4E2B75] border-[#C6B6D9]',
      activeColor: 'bg-[#FCFAF6] text-[#3A1B5E] border-[#AD99C4]',
      summary: 'If HIV-related support is selected, the field worker records ART status, ART registration date/ID, viral-load status, and clinical notes.',
      applicableTo: ['all', 'hiv'],
      sanitizedFields: [
        { label: 'ART status', value: 'On ART' },
        { label: 'ART registration date & ID', value: '12 March 2023 • ID: Sample-Reg-772' },
        { label: 'Viral-load status', value: 'Suppressed (< 1,000 copies/mL)' },
        { label: 'Viral-load test date', value: '10 August 2026' },
        { label: 'Clinical care notes', value: 'Routine quarterly health check attended' },
      ],
      highlight: 'Only questions relevant to HIV-related care are shown, maintaining privacy and clinical dignity.',
      polaroid: {
        title: 'CLINICAL CARE DETAILS',
        caption: 'ON ART • VIRAL LOAD SUPPRESSED',
        rotation: 'rotate-1',
        badge: 'STABLE CARE',
        icon: ShieldCheck,
      },
    },
    {
      id: 'step-09',
      number: '09',
      name: 'Add bank details for support',
      badge: 'Step 9',
      tabColor: 'bg-[#D6E6E2] text-[#195244] border-[#B2D1C9]',
      activeColor: 'bg-[#FCFAF6] text-[#103E33] border-[#9AC2B8]',
      summary: 'If education or nutrition support is selected, the field worker adds bank details to provide financial support, with sample document proofs.',
      applicableTo: ['all', 'education', 'nutrition'],
      sanitizedFields: [
        { label: 'Account holder name', value: 'Sunita Sharma (Caregiver)' },
        { label: 'Account number', value: '•••• •••• 4812 (Sample mock data)' },
        { label: 'IFSC code', value: 'SBIN0001234 (Sample branch)' },
        { label: 'Bank-linked mobile number', value: '+91 ••••• ••124 (Verified)' },
        { label: 'Passbook front page', value: 'Sample passbook photo attached' },
        { label: 'Aadhaar card upload', value: 'Sample identity document attached' },
      ],
      highlight: 'Direct support bank details are collected with privacy masking and sample proofs.',
      polaroid: {
        title: 'SUPPORT BANK ACCOUNT',
        caption: 'CARE ACCOUNT • PASSBOOK & AADHAAR OK',
        rotation: '-rotate-1.5',
        badge: 'SAMPLE DATA',
        icon: CreditCard,
      },
    },
    {
      id: 'step-10',
      number: '10',
      name: 'Review and submit',
      badge: 'Step 10',
      tabColor: 'bg-[#EADED2] text-[#5C4229] border-[#D0BAA2]',
      activeColor: 'bg-[#FCFAF6] text-[#422C17] border-[#BF9F80]',
      summary: 'Before submitting, the field worker checks all entered information. The organisation name and email are automatically taken from the field worker’s verified profile.',
      applicableTo: ['all', 'education', 'nutrition', 'hiv'],
      sanitizedFields: [
        { label: 'Check the information', value: 'All entered sections checked and confirmed' },
        { label: 'Organisation name', value: 'India HIV/AIDS Alliance (from profile)' },
        { label: 'Field worker email', value: 'worker@allianceindia.org (from profile)' },
        { label: 'Profile verification', value: 'automatically taken from the field worker’s verified profile' },
        { label: 'Next step', value: 'Ready to send for support team review' },
      ],
      highlight: 'Organisation details are locked and automatically attached from the field worker profile to prevent entry errors.',
      polaroid: {
        title: 'READY TO SEND',
        caption: 'FORM COMPLETE • PROFILE ATTACHED',
        rotation: 'rotate-1',
        badge: 'READY TO SUBMIT',
        icon: FileCheck2,
      },
    },
  ], []);

  // Filter steps based on selected category
  const visibleSteps = useMemo(() => {
    return allSteps.filter((s) => s.applicableTo.includes(selectedCategory));
  }, [allSteps, selectedCategory]);

  const [activeStepId, setActiveStepId] = useState<string>('step-01');
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Ensure active step is always among visible steps
  const activeStep = useMemo(() => {
    const found = visibleSteps.find((s) => s.id === activeStepId);
    if (found) return found;
    return visibleSteps[0] || allSteps[0];
  }, [visibleSteps, activeStepId, allSteps]);

  const activeIndex = visibleSteps.findIndex((s) => s.id === activeStep.id);

  const handlePrevTab = () => {
    const newIndex = activeIndex > 0 ? activeIndex - 1 : visibleSteps.length - 1;
    const targetStep = visibleSteps[newIndex];
    if (targetStep) {
      setActiveStepId(targetStep.id);
      const el = document.getElementById(`tab-${targetStep.id}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  };

  const handleNextTab = () => {
    const newIndex = activeIndex < visibleSteps.length - 1 ? activeIndex + 1 : 0;
    const targetStep = visibleSteps[newIndex];
    if (targetStep) {
      setActiveStepId(targetStep.id);
      const el = document.getElementById(`tab-${targetStep.id}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  };

  const handleKeyDownTab = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % visibleSteps.length;
      const targetStep = visibleSteps[nextIndex];
      setActiveStepId(targetStep.id);
      document.getElementById(`tab-${targetStep.id}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + visibleSteps.length) % visibleSteps.length;
      const targetStep = visibleSteps[prevIndex];
      setActiveStepId(targetStep.id);
      document.getElementById(`tab-${targetStep.id}`)?.focus();
    }
  };

  const categoryOptions: { id: SupportCategory; label: string }[] = [
    { id: 'all', label: 'All categories' },
    { id: 'education', label: 'Education support' },
    { id: 'nutrition', label: 'Nutrition support' },
    { id: 'hiv', label: 'HIV-related support' },
  ];

  const getCategoryCountLabel = (cat: SupportCategory) => {
    const count = allSteps.filter((s) => s.applicableTo.includes(cat)).length;
    return `${count} steps`;
  };

  const PolaroidIcon = activeStep.polaroid.icon;

  return (
    <section 
      id="preview-heading" 
      aria-labelledby="preview-heading-title" 
      className="py-16 md:py-24 border-b border-[#E4D8C7] bg-[#FAF8F5]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header & Explanatory Intro */}
        <div className="max-w-3xl space-y-3">
          <h2
            id="preview-heading-title"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            A simple, respectful way to request support for a child.
          </h2>
          <p className="text-base sm:text-lg text-slate-700 font-medium leading-relaxed">
            See how the field worker completes the support form, saves it safely and shares it with the support team.
          </p>
          <div className="p-3.5 rounded-xl bg-[#F4EFE6] border border-[#DACBB7] text-xs sm:text-sm text-slate-700 flex items-start gap-2.5">
            <span className="font-bold text-slate-900 shrink-0">Note:</span>
            <span>All examples use privacy-safe sample information. No real child or family details are shown.</span>
          </div>
        </div>

        {/* How the form works header & Category Filter Selector */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
              How the form works
            </h3>
            <p className="text-sm sm:text-base text-slate-700">
              The field worker completes the form in clear steps. They can save their work and return later if needed.
            </p>
          </div>

          {/* Category Filter Chips */}
          <div className="pt-2">
            <label id="category-filter-label" className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-600 mb-2">
              Filter by support category:
            </label>
            <div 
              role="group" 
              aria-labelledby="category-filter-label" 
              className="flex flex-wrap items-center gap-2"
            >
              {categoryOptions.map((opt) => {
                const isSelected = selectedCategory === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(opt.id);
                      // If active step is hidden in new category, switch to first visible
                      const applicableInNew = allSteps.filter((s) => s.applicableTo.includes(opt.id));
                      if (!applicableInNew.some((s) => s.id === activeStepId)) {
                        setActiveStepId(applicableInNew[0]?.id || 'step-01');
                      }
                    }}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-[#FCFAF6] text-slate-700 border-[#D8C7B0] hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                      isSelected ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {getCategoryCountLabel(opt.id)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-2 font-mono">
              Showing {visibleSteps.length} applicable steps for {categoryOptions.find((c) => c.id === selectedCategory)?.label}.
            </p>
          </div>
        </div>

        {/* ── Mosby's Files Interactive Folder Filing System ── */}
        <div className="rounded-3xl bg-[#F0E6D6] border-2 border-[#CBB89F] shadow-2xl p-2 sm:p-5">
          {/* Staggered Colorful Folder Tabs with Slider Buttons */}
          <div className="relative flex items-center mb-0">
            {/* Left Slider Button */}
            <button
              type="button"
              onClick={handlePrevTab}
              aria-label="Previous step"
              title="Previous step"
              className="absolute -left-1 sm:-left-2 z-30 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#FCFAF6] hover:bg-white text-slate-800 shadow-md border border-[#C5B396] transition-all hover:scale-110 active:scale-95 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
            </button>

            {/* Staggered Folder Tabs - No native scrollbar */}
            <div
              ref={tabsContainerRef}
              role="tablist"
              aria-label="10-Step Support Form Preview"
              className="flex items-end gap-1 sm:gap-2 px-8 sm:px-10 overflow-x-auto pb-0 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden w-full"
            >
              {visibleSteps.map((step, idx) => {
                const isActive = step.id === activeStep.id;
                return (
                  <button
                    key={step.id}
                    role="tab"
                    aria-selected={isActive}
                    id={`tab-${step.id}`}
                    aria-controls={`panel-${step.id}`}
                    onClick={() => {
                      setActiveStepId(step.id);
                      const el = document.getElementById(`tab-${step.id}`);
                      if (el && typeof el.scrollIntoView === 'function') {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                      }
                    }}
                    onKeyDown={(e) => handleKeyDownTab(e, idx)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-t-xl sm:rounded-t-2xl text-[11px] sm:text-xs font-mono font-bold transition-all shrink-0 cursor-pointer border-t-2 border-x-2 ${
                      isActive
                        ? `${step.activeColor} shadow-md z-20 translate-y-1`
                        : `${step.tabColor} hover:brightness-95 opacity-85 hover:opacity-100 z-10`
                    }`}
                  >
                    <span className="text-[10px] opacity-60">/{step.number}</span>
                    <span className="whitespace-nowrap">{step.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Slider Button */}
            <button
              type="button"
              onClick={handleNextTab}
              aria-label="Next step"
              title="Next step"
              className="absolute -right-1 sm:-right-2 z-30 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#FCFAF6] hover:bg-white text-slate-800 shadow-md border border-[#C5B396] transition-all hover:scale-110 active:scale-95 cursor-pointer shrink-0"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
            </button>
          </div>

          {/* Active Folder Interior: Layered Cotton Ruled Sheet & Polaroid Specimen */}
          <div
            key={activeStep.id}
            id={`panel-${activeStep.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeStep.id}`}
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
                  {activeStep.badge} — Support Form Preview
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {activeStep.name}
                </h3>
              </div>
              <div className="text-[11px] font-mono font-bold text-slate-600 bg-[#F4EFE6] px-3 py-1.5 rounded-lg border border-[#D8C7B0] self-start sm:self-auto shadow-2xs">
                ★ SYNTHETIC SAMPLE FORM (PRIVACY SAFE) ★
              </div>
            </div>

            <p className="text-sm sm:text-base text-slate-700 max-w-2xl sm:pl-6 font-normal">
              {activeStep.summary}
            </p>

            {/* 2-Column Spread: Left Form Fields, Right Specimen Polaroid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:pl-6">
              {/* Sanitized Fields Grid */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeStep.sanitizedFields.map((field, idx) => (
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

              {/* Tilted Specimen Polaroid Card with Paperclip */}
              <div className="lg:col-span-4 flex justify-center items-center">
                <div 
                  key={`polaroid-${activeStep.id}`}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width - 0.5;
                    const y = (e.clientY - rect.top) / rect.height - 0.5;
                    setTilt({ x: y * -10, y: x * 10 });
                  }}
                  onMouseLeave={() => setTilt({ x: 0, y: 0 })}
                  style={{
                    transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                  }}
                  className={`relative p-3.5 pb-5 rounded-xl bg-white border border-slate-300 shadow-xl max-w-[240px] w-full ${activeStep.polaroid.rotation} transition-transform duration-150 ease-out motion-safe:animate-polaroid-drop hover:scale-105 hover:shadow-2xl cursor-pointer`}
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
                      <PolaroidIcon className="w-4 h-4" />
                    </div>
                    <span className="font-mono text-[9px] font-extrabold text-slate-800 tracking-wider">
                      {activeStep.polaroid.title}
                    </span>
                    <span className="mt-1 px-2 py-0.5 rounded-full text-[8px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                      {activeStep.polaroid.badge}
                    </span>
                  </div>

                  {/* Typewritten Metadata Caption */}
                  <div className="mt-3 text-center">
                    <p className="font-mono text-[9px] text-slate-600 font-semibold tracking-tight">
                      {activeStep.polaroid.caption}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Field Assurance Highlight */}
            <div className="p-4 rounded-xl bg-[#F0EAE0] border border-[#D5C2AA] flex items-start gap-3 sm:ml-6 shadow-2xs">
              <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-medium">
                <strong className="text-slate-900 font-bold">Field Note: </strong>
                {activeStep.highlight}
              </p>
            </div>
          </div>
        </div>

        {/* ── LIFECYCLE GUIDANCE CARDS ── */}
        <div className="space-y-6 pt-4">
          <div className="border-b border-[#E4D8C7] pb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 block">
              Field Worker Orientation
            </span>
            <p className="text-sm font-semibold text-slate-800">
              Clear guidance on what happens to the form, saving drafts, and signing back in.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: What happens after submission */}
            <div className="p-6 rounded-2xl bg-[#FCFAF6] border border-[#DACBB7] shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  What happens after submission
                </h3>
                <ul className="text-xs sm:text-sm text-slate-700 space-y-2 list-disc list-inside leading-relaxed">
                  <li>Once submitted, the form is saved securely and shared with the support team for review.</li>
                  <li>The support team checks the information and decides the next steps.</li>
                  <li>If support is approved, the field worker may be asked to add bank documents later.</li>
                </ul>
              </div>
              <div className="pt-3 border-t border-[#E8DFD1] text-[11px] font-mono font-bold text-emerald-800">
                SUPPORT TEAM REVIEW
              </div>
            </div>

            {/* Card 2: If the field worker needs to stop */}
            <div className="p-6 rounded-2xl bg-[#FCFAF6] border border-[#DACBB7] shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  If the field worker needs to stop
                </h3>
                <ul className="text-xs sm:text-sm text-slate-700 space-y-2 list-disc list-inside leading-relaxed">
                  <li>The field worker can save the form as a draft.</li>
                  <li>They can return later and continue from where they stopped.</li>
                  <li>If they try to sign out while work has not yet been sent, the app asks them to check and send it first.</li>
                  <li>Saved drafts remain stored on this device until sent to the support team.</li>
                </ul>
              </div>
              <div className="pt-3 border-t border-[#E8DFD1] text-[11px] font-mono font-bold text-amber-800">
                SAVED ON THIS DEVICE
              </div>
            </div>

            {/* Card 3: If the field worker logs out */}
            <div className="p-6 rounded-2xl bg-[#FCFAF6] border border-[#DACBB7] shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  If the field worker logs out
                </h3>
                <ul className="text-xs sm:text-sm text-slate-700 space-y-2 list-disc list-inside leading-relaxed">
                  <li>The field worker can sign back in using their verified email address and a one-time code sent to their email.</li>
                  <li>After signing back in, they can see their previously submitted forms.</li>
                  <li>Forms that have already been sent remain safe in the central support register.</li>
                </ul>
              </div>
              <div className="pt-3 border-t border-[#E8DFD1] text-[11px] font-mono font-bold text-sky-800">
                ONE-TIME CODE SIGN-IN
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
