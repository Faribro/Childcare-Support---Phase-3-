'use client';

import React from 'react';

interface SectionHeaderProps {
  eyebrow: string;
  prefix: string;
  emphasis: string;
  suffix: string;
  emphasisColor: string;
  borderColor: string;
  eyebrowColor: string;
}

/**
 * Premium section header with eyebrow label + italic colored emphasis word.
 * Inspired by Awwwards / editorial typography — e.g.:
 *   "NATIONAL OVERVIEW"
 *   "Where the portfolio stands today"
 */
export function SectionHeader({
  eyebrow,
  prefix,
  emphasis,
  suffix,
  emphasisColor,
  borderColor,
  eyebrowColor,
}: SectionHeaderProps) {
  return (
    <div className={`mb-3.5 pb-3.5 border-b ${borderColor}`}>
      {/* Eyebrow — small, tracked, uppercase */}
      <p className={`text-[9.5px] font-black uppercase tracking-[0.22em] ${eyebrowColor} mb-1.5 select-none`}>
        {eyebrow}
      </p>

      {/* Heading — dark base + italic colored emphasis word */}
      <h3 className="text-[17px] sm:text-[19px] font-extrabold text-slate-900 leading-snug tracking-tight">
        {prefix}
        <span className={`italic font-black ${emphasisColor}`}>{emphasis}</span>
        {suffix}
      </h3>
    </div>
  );
}