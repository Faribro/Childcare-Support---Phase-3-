'use client';

import React, { useRef, useState, useEffect } from 'react';

interface SectionHeaderProps {
  /** Optional eyebrow label (e.g. "01 — CONSENT"). Omit if SectionVerticalTitle already shows it. */
  eyebrow?: string;
  prefix: string;
  emphasis: string;
  suffix: string;
  emphasisColor: string;
  borderColor: string;
  eyebrowColor?: string;
  action?: React.ReactNode;
}

/**
 * Premium section header with optional eyebrow label + italic colored emphasis heading.
 * Plays a typewriter reveal on scroll per-section, with an inline trailing cursor that
 * stays right beside the text and disappears once typing completes.
 */
export function SectionHeader({
  eyebrow,
  prefix,
  emphasis,
  suffix,
  emphasisColor,
  borderColor,
  eyebrowColor = 'text-slate-400/90',
  action,
}: SectionHeaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHasStarted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHasStarted(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold: 0.2,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasStarted) return;
    const timer = setTimeout(() => {
      setIsDone(true);
    }, 2400);
    return () => clearTimeout(timer);
  }, [hasStarted]);

  return (
    <div ref={containerRef} className={`mb-3 pb-3 border-b ${borderColor} flex flex-wrap sm:flex-nowrap items-center justify-between gap-3`}>
      <div className="min-w-0">
        {/* Eyebrow — only render if explicitly provided */}
        {eyebrow && (
          <p className={`text-[9.5px] font-black uppercase tracking-[0.22em] ${eyebrowColor} mb-1.5 select-none`}>
            {eyebrow}
          </p>
        )}

        {/* Heading — typewriter effect per-section on scroll with inline cursor */}
        <div className="max-w-full overflow-hidden flex items-center">
          <h3 className="inline-flex items-center text-[16px] sm:text-[19px] font-extrabold text-slate-900 leading-snug tracking-tight">
            <span
              className={`inline-block overflow-hidden whitespace-nowrap align-middle transition-opacity ${
                hasStarted ? 'typewriter-active' : 'max-w-0 opacity-0'
              }`}
            >
              <span>{prefix}</span>
              <span className={`italic font-black ${emphasisColor}`}>{emphasis}</span>
              <span>{suffix}</span>
            </span>
            {/* Trailing cursor right next to typed text */}
            {hasStarted && !isDone && (
              <span className="inline-block w-[2px] sm:w-[2.5px] h-[1.15em] bg-slate-900 ml-1 shrink-0 align-middle typewriter-cursor" />
            )}
          </h3>
        </div>
      </div>

      {action && (
        <div className="shrink-0 flex items-center">
          {action}
        </div>
      )}
    </div>
  );
}