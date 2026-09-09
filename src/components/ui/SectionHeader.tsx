'use client';

import React from 'react';

interface SectionHeaderProps {
  /** Optional eyebrow label (e.g. "01 — CONSENT"). Omit if SectionVerticalTitle already shows it. */
  eyebrow?: string;
  prefix: string;
  emphasis: string;
  suffix: string;
  emphasisColor: string;
  borderColor: string;
  eyebrowColor?: string;
}

/**
 * Premium section header with optional eyebrow label + italic colored emphasis heading.
 * Eyebrow is now optional since SectionVerticalTitle already shows the section number/name.
 */
export function SectionHeader({
  eyebrow,
  prefix,
  emphasis,
  suffix,
  emphasisColor,
  borderColor,
  eyebrowColor = 'text-slate-400/90',
}: SectionHeaderProps) {
  return (
    <div className={`mb-3 pb-3 border-b ${borderColor} overflow-hidden`}>
      {/* Eyebrow — only render if explicitly provided */}
      {eyebrow && (
        <p className={`text-[9.5px] font-black uppercase tracking-[0.22em] ${eyebrowColor} mb-1.5 select-none`}>
          {eyebrow}
        </p>
      )}

      {/* Heading — typewriter style using CSS steps() */}
      <div className="max-w-full overflow-hidden flex items-center">
        <h3 className="line-1 anim-typewriter text-[16px] sm:text-[19px] font-extrabold text-slate-900 leading-snug tracking-tight">
          <span>{prefix}</span>
          <span className={`italic font-black ${emphasisColor}`}>{emphasis}</span>
          <span>{suffix}</span>
        </h3>
      </div>
    </div>
  );
}