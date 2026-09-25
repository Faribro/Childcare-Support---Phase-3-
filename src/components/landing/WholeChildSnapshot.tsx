'use client';

import React from 'react';
import { Apple, GraduationCap, Users2, HeartHandshake, ShieldCheck } from 'lucide-react';

export function WholeChildSnapshot() {
  const panels = [
    {
      title: 'Nutrition & Health',
      tag: 'Section 4 & 5',
      icon: Apple,
      accentBg: 'bg-amber-50',
      accentBorder: 'border-amber-200',
      tagColor: 'bg-amber-100 text-amber-900 border-amber-300',
      summary:
        'Standardized anthropometry (height, weight, MUAC), appetite observations, and meal frequency to monitor developmental growth without intimidating families.',
      keyAspects: ['WHO Z-Score categorization', 'Non-judgmental eating habits', 'Regular clinical monitoring'],
    },
    {
      title: 'Education Continuity',
      tag: 'Section 6 & 7',
      icon: GraduationCap,
      accentBg: 'bg-sky-50',
      accentBorder: 'border-sky-200',
      tagColor: 'bg-sky-100 text-sky-900 border-sky-300',
      summary:
        'Tracking school enrollment, attendance consistency, India-aligned class standards (Pre-Nursery to Class 12+), and itemized educational expense requirements.',
      keyAspects: ['Standardized Indian grade levels', 'Cost matching & fee receipts', 'Retention & attendance support'],
    },
    {
      title: 'Family & Caregiver Support',
      tag: 'Section 1 & 2',
      icon: Users2,
      accentBg: 'bg-emerald-50',
      accentBorder: 'border-emerald-200',
      tagColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      summary:
        'Documenting legal guardianship, verified caregiver consent, household economic stability, and banking details to enable direct educational aid.',
      keyAspects: ['Caregiver consent & signature', 'Aadhaar data minimization', 'Direct benefit transfer alignment'],
    },
  ];

  return (
    <section aria-labelledby="snapshot-heading" className="py-16 md:py-24 border-b border-[#E8DFD1]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <div className="inline-block px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#F3ECE2] text-[#6B5A45] border border-[#DECDBB] mb-3">
            Holistic Perspective
          </div>
          <h2
            id="snapshot-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            Why it matters: a whole-child snapshot.
          </h2>
          <p className="mt-3 text-base sm:text-lg text-slate-700 font-medium">
            Children are not isolated clinical metrics. Frontline caseworkers assemble the complete picture of health,
            schooling, and family stability so programs can coordinate actionable support with dignity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {panels.map((panel, idx) => {
            const Icon = panel.icon;
            return (
              <div
                key={panel.title}
                className="flex flex-col justify-between p-6 sm:p-7 rounded-2xl bg-[#FCFAF6] border border-[#DECDBB] shadow-sm hover:shadow-md transition-shadow notebook-border"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-5">
                    <div className={`p-3 rounded-xl ${panel.accentBg} border ${panel.accentBorder}`}>
                      <Icon className="w-6 h-6 text-slate-800" />
                    </div>
                    <span className={`text-[11px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${panel.tagColor}`}>
                      {panel.tag}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 mb-2.5">
                    {panel.title}
                  </h3>

                  <p className="text-sm text-slate-700 leading-relaxed font-medium mb-6">
                    {panel.summary}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E8DFD1]">
                  <h4 className="text-xs font-mono font-bold uppercase text-slate-500 mb-2.5 tracking-wider">
                    Key Observables
                  </h4>
                  <ul className="space-y-1.5 text-xs font-semibold text-slate-800">
                    {panel.keyAspects.map((aspect) => (
                      <li key={aspect} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-700 shrink-0" />
                        <span>{aspect}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Responsible Stewardship Note */}
        <div className="mt-10 p-4 sm:p-5 rounded-xl bg-[#F4EFE6] border border-[#DECDBB] flex items-start gap-3.5 text-xs text-slate-700 font-medium">
          <HeartHandshake className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
          <p>
            <strong>Field Dignity Note:</strong> The Child Nutrition & Support PWA serves as a structured intake tool to assist
            trained case managers. The platform does not make automated medical decisions or replace clinical judgment; it ensures 
            information is preserved accurately and made available for thoughtful human follow-up.
          </p>
        </div>
      </div>
    </section>
  );
}
