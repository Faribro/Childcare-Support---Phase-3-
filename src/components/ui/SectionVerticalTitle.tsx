'use client';

import React from 'react';

interface SectionVerticalTitleProps {
  number: string;
  title: string;
}

/**
 * SectionVerticalTitle renders the section number badge and title rotated 90 degrees
 * in the top-right corner of each section card.
 * This saves ~60px of vertical height per section, streamlining the form.
 */
export function SectionVerticalTitle({ number, title }: SectionVerticalTitleProps) {
  return (
    <aside
      aria-label={`Section ${number}: ${title}`}
      className="absolute top-0 right-0 z-10 flex flex-col items-center bg-gradient-to-b from-teal-50/95 via-slate-50/90 to-slate-50/70 border-l border-b border-slate-200/90 rounded-bl-xl px-1.5 sm:px-2 pt-2 sm:pt-2.5 pb-3.5 sm:pb-4 select-none pointer-events-none transition-all shadow-2xs"
    >
      {/* Accessible Section Heading for Screen Readers */}
      <h2 className="sr-only">
        Section {number}: {title}
      </h2>

      {/* Numeric Section Badge */}
      <span className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-teal-700 text-white font-black text-[10px] sm:text-[11px] shadow-xs font-mono">
        {number}
      </span>

      {/* Vertical Rotated Title (90° orientation) */}
      <span
        style={{ writingMode: 'vertical-rl' }}
        className="[writing-mode:vertical-rl] text-[10px] sm:text-[11px] font-bold tracking-wider text-teal-950/85 uppercase whitespace-nowrap mt-2"
      >
        {title}
      </span>
    </aside>
  );
}
