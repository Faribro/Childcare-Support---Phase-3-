'use client';

import React from 'react';
import { HeartHandshake, EyeOff, Smartphone, CheckSquare, Sparkles } from 'lucide-react';

export function DesignPrinciples() {
  const principles = [
    {
      icon: HeartHandshake,
      title: 'Dignity Over Deficit',
      tag: 'Human First',
      description:
        'Questions are worded to respect caregivers and children as proactive partners rather than victims. We collect actionable realities without patronizing judgments or invasive language.',
      implication: 'Caregiver consent and mutual respect precede all data collection.',
    },
    {
      icon: EyeOff,
      title: 'Data Minimization & Privacy',
      tag: 'Strict Protection',
      description:
        'Only information required to coordinate health and educational aid is requested. No commercial trackers, no external CDNs, and zero third-party scripts touching child records.',
      implication: 'Data stays localized on-device until secure institutional synchronization.',
    },
    {
      icon: Smartphone,
      title: 'Field Ergonomics',
      tag: 'Single-Handed Usability',
      description:
        'Designed for a caseworker holding a clipboard in one hand and a mobile phone in the other. 48px+ touch targets, high sunlight contrast, and simple numeric pads.',
      implication: 'Tested against direct glare and rugged entry conditions.',
    },
    {
      icon: CheckSquare,
      title: 'Truthful Status & No False Hopes',
      tag: 'Zero Deception',
      description:
        'The interface never fakes an upload. Drafts are explicitly marked as local, queue counts are transparent, and syncing only displays success when confirmed by server checksum.',
      implication: 'Frontline teams always know the exact operational status of every record.',
    },
  ];

  return (
    <section aria-labelledby="principles-heading" className="py-16 md:py-24 border-b border-[#E8DFD1] bg-[#FAF7F2]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <div className="inline-block px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#F3ECE2] text-[#6B5A45] border border-[#DECDBB] mb-3">
            Core Philosophy
          </div>
          <h2
            id="principles-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            Designed with care: our guiding principles.
          </h2>
          <p className="mt-3 text-base sm:text-lg text-slate-700 font-medium">
            Building software for vulnerable children requires more than efficient code.
            It requires empathy, restraint, and an uncompromising commitment to privacy and operational dignity.
          </p>
        </div>

        {/* Principles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {principles.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 sm:p-7 rounded-2xl bg-white border border-[#E8DFD1] shadow-xs hover:border-[#DECDBB] transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] border border-[#E5DDD2] flex items-center justify-center text-emerald-800">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-[#F5EFE6] text-[#7A6854] border border-[#E2D6C6]">
                      {item.tag}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    {item.title}
                  </h3>

                  <p className="text-sm text-slate-700 leading-relaxed font-normal mb-4">
                    {item.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#F0EBE1] flex items-start gap-2 text-xs font-medium text-emerald-900">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{item.implication}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
