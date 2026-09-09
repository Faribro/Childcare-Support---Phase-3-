'use client';

import React from 'react';

interface SectionVerticalTitleProps {
  number: string;
  title: string;
}

/**
 * SectionVerticalTitle renders the section number badge and title rotated 90 degrees
 * in the top-right corner of each section card.
 * Styled in high-contrast crisp black & slate per design specifications.
 */
export function SectionVerticalTitle({ number, title }: SectionVerticalTitleProps) {
  return (
    <aside
      aria-label={`Section ${number}: ${title}`}
      className="absolute top-0 right-0 z-10 flex flex-col items-center bg-white/95 border-l border-b border-slate-200/90 rounded-bl-xl px-1.5 sm:px-2 pt-2 sm:pt-2.5 pb-3 sm:pb-3.5 select-none pointer-events-none transition-all shadow-2xs max-h-[85%] overflow-hidden"
    >
      {/* Accessible Section Heading for Screen Readers */}
      <h2 className="sr-only">
        Section {number}: {title}
      </h2>

      {/* Numeric Section Badge (Black instead of green) */}
      <span className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-slate-900 text-white font-black text-[10px] sm:text-[11px] shadow-xs font-mono">
        {number}
      </span>

      {/* Vertical Rotated Title (90° orientation, Black uppercase, no breaking) */}
      <span
        style={{ writingMode: 'vertical-rl' }}
        className="[writing-mode:vertical-rl] text-[10px] sm:text-[11px] font-extrabold tracking-wider text-slate-900 uppercase whitespace-nowrap mt-2 select-none"
      >
        {title}
      </span>
    </aside>
  );
}
