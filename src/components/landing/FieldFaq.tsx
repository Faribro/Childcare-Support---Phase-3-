'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

export function FieldFaq() {
  const faqs: FaqItem[] = [
    {
      question: 'Can I use this app without internet connectivity or mobile cellular data?',
      answer:
        'Yes, completely. The Child Nutrition & Support PWA was built offline-first. All 9 assessment sections—from demographics and caregiver consent to anthropometric calculations and education costs—run entirely inside your mobile browser. You only need a network connection when uploading finished records to the central database.',
    },
    {
      question: 'What happens if my phone battery dies or the browser closes during an intake?',
      answer:
        'Draft progress is saved locally. Every field update, measurement, and note is committed to your phone’s internal IndexedDB database. When you turn your phone back on and open the app, your active draft restores with previously entered answers intact.',
    },
    {
      question: 'How do I install the app on an Android or iPhone device?',
      answer:
        'On Android (Google Chrome): Tap the "Install PWA to Device" button on this page, or open Chrome options and tap "Add to Home Screen" or "Install App". On iPhone/iPad (Apple Safari): Tap the Share icon (box with upward arrow) at the bottom of the screen and choose "Add to Home Screen".',
    },
    {
      question: 'How is child and family privacy protected in the field?',
      answer:
        'Alliance India adheres to strict data dignity standards. The PWA contains zero external tracking scripts, advertising SDKs, or third-party pixels. Information is kept locally on your phone in protected browser storage until you choose to sync via secure HTTPS channels.',
    },
    {
      question: 'How does the central Google Sheets synchronization handle conflicts?',
      answer:
        'Every assessment record generates an immutable client-side UUID. During sync, the PWA submits data through an idempotent queue with exponential backoff. If connection drops mid-upload, the queue retries safely without producing duplicate rows or corrupted records.',
    },
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleIndex = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq-heading" aria-labelledby="faq-heading" className="py-16 md:py-24 border-b border-[#E4D8C7] bg-[#F7F3E9]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#EDE3D2] text-[#63513D] border border-[#D5C2AA] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            Chapter VI • Frontline Protocol FAQ
          </div>
          <h2
            id="faq-heading-title"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            Frequently asked field questions.
          </h2>
          <p className="mt-3 text-base sm:text-lg text-slate-700 font-medium">
            Clear, honest answers for caseworkers, district supervisors, and partner organizations.
          </p>
        </div>

        {/* Spiral-Bound Notebook Docket Container */}
        <div className="relative">
          {/* Spiral Binder Metallic Wire Rings along top */}
          <div className="relative -mb-3.5 z-20 flex justify-around px-6 sm:px-12 pointer-events-none" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-3.5 h-7 rounded-full bg-gradient-to-r from-slate-300 via-white to-slate-400 border border-slate-400 shadow-xs" />
                <div className="w-2 h-2 rounded-xs bg-[#3E342B]/30 -mt-1" />
              </div>
            ))}
          </div>

          {/* Accessible Accordion with Archival Query Sleeves */}
          <div className="rounded-3xl bg-[#F5EFE6] border border-[#D5C2AA] p-3 sm:p-6 pt-7 space-y-3.5 shadow-md">
            {faqs.map((faq, idx) => {
              const isOpen = openIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl bg-[#FCFAF6] border border-[#D5C2AA] overflow-hidden transition-all shadow-xs hover:border-[#C4B097] notebook-paper-sheet"
                >
                <h3>
                  <button
                    type="button"
                    id={`faq-question-${idx}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${idx}`}
                    onClick={() => toggleIndex(idx)}
                    className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-700"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-slate-500 bg-[#EFE7DC] px-2 py-0.5 rounded border border-[#DECDBB] shrink-0">
                        Q.{idx + 1}
                      </span>
                      <span className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                        {faq.question}
                      </span>
                    </div>
                    <span
                      className={`w-8 h-8 rounded-full bg-[#F4F1EA] border border-[#E5DDD2] flex items-center justify-center shrink-0 text-slate-700 transition-transform duration-200 shadow-2xs ${
                        isOpen ? 'rotate-180 bg-emerald-100 text-emerald-900 border-emerald-300' : ''
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </span>
                  </button>
                </h3>
                {isOpen && (
                  <div
                    id={`faq-answer-${idx}`}
                    role="region"
                    aria-labelledby={`faq-question-${idx}`}
                    className="px-5 pb-6 sm:px-6 sm:pb-7 text-sm text-slate-700 leading-relaxed font-normal border-t border-[#EDE4D6] pt-4 pl-12"
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </section>
);
}
