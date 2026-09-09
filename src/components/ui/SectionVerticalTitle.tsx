'use client';

import React from 'react';

export interface SectionColorScheme {
  bg: string;
  border: string;
  badge: string;
  text: string;
  /** RGBA string for the inner/close neon halo, e.g. 'rgba(251,113,133,0.45)' */
  neonMid: string;
  /** RGBA string for the far neon halo, e.g. 'rgba(251,113,133,0.12)' */
  neonFar: string;
  /** Solid color for border-color CSS var, e.g. 'rgba(251,113,133,0.55)' */
  neonBorder: string;
}

interface SectionVerticalTitleProps {
  number: string;
  title: string;
  colorScheme?: SectionColorScheme;
}

export function SectionVerticalTitle({ number, title, colorScheme }: SectionVerticalTitleProps) {
  const bg     = colorScheme?.bg     ?? 'bg-white/95';
  const border = colorScheme?.border ?? 'border-slate-200/90';
  const badge  = colorScheme?.badge  ?? 'bg-slate-900';
  const text   = colorScheme?.text   ?? 'text-slate-900';

  return (
    <aside
      aria-label={`Section ${number}: ${title}`}
      className={`absolute top-0 right-0 z-10 flex flex-col items-center ${bg} border-l border-b ${border} rounded-bl-xl px-1.5 sm:px-2 pt-2 sm:pt-2.5 pb-3 sm:pb-3.5 select-none pointer-events-none transition-all shadow-2xs max-h-[85%] overflow-hidden`}
    >
      <h2 className="sr-only">Section {number}: {title}</h2>
      <span className={`flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-md ${badge} text-white font-black text-[10px] sm:text-[11px] shadow-xs font-mono`}>
        {number}
      </span>
      <span
        style={{ writingMode: 'vertical-rl' }}
        className={`[writing-mode:vertical-rl] text-[10px] sm:text-[11px] font-extrabold tracking-wider ${text} uppercase whitespace-nowrap mt-2 select-none`}
      >
        {title}
      </span>
    </aside>
  );
}
