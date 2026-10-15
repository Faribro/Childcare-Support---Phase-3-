'use client';

import React, { useEffect, useRef } from 'react';
import styles from './landing-motion.module.css';

/**
 * Progressive-enhancement section reveal.
 *
 * Contract (matches landing-motion.module.css):
 * - Without JavaScript the children render at their natural position,
 *   fully visible (the stylesheet's default state).
 * - On mount the component checks for reduced-motion and IntersectionObserver
 *   support. Only when BOTH are safe does it add `armed` (a 12px transform
 *   offset — content remains visible and readable) and then `shown` when
 *   the section enters the viewport.
 * - Any failure path (unsupported browser, reduced motion, observer error)
 *   leaves content completely visible with no transforms.
 * - Observers are disconnected on unmount.
 */
export function Reveal({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let observer: IntersectionObserver | null = null;

    try {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (reducedMotion.matches) return; // leave content in natural position
      if (typeof IntersectionObserver === 'undefined') return;

      el.classList.add(styles.armed);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              el.classList.add(styles.shown);
              observer?.disconnect();
            }
          }
        },
        { threshold: 0.2 }
      );
      observer.observe(el);
    } catch {
      // Arming failed or observer threw: restore natural position so content
      // can never remain displaced.
      el.classList.remove(styles.armed);
      observer?.disconnect();
    }

    return () => {
      observer?.disconnect();
      el.classList.remove(styles.armed, styles.shown);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}