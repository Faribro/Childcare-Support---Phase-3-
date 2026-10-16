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
 * - Dynamic prefers-reduced-motion changes are respected: if the user enables
 *   reduced motion after mount, the armed offset is immediately removed.
 * - Observers are disconnected on unmount. Classes are left in place once
 *   `shown` — no reverse animation on already-visible content.
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

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleMotionChange = () => {
      if (reducedMotion.matches) {
        // User switched to reduced-motion mid-session: disarm immediately.
        el.classList.remove(styles.armed, styles.shown);
        observer?.disconnect();
        observer = null;
      }
    };

    try {
      if (reducedMotion.matches) return; // leave content in natural position
      if (typeof IntersectionObserver === 'undefined') return;

      el.classList.add(styles.armed);

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              el.classList.add(styles.shown);
              observer?.disconnect();
              observer = null;
            }
          }
        },
        { threshold: 0.2 }
      );
      observer.observe(el);

      // Listen for dynamic preference changes
      reducedMotion.addEventListener('change', handleMotionChange);
    } catch {
      // Arming failed or observer threw: restore natural position so content
      // can never remain displaced.
      el.classList.remove(styles.armed);
      observer?.disconnect();
    }

    return () => {
      observer?.disconnect();
      reducedMotion.removeEventListener('change', handleMotionChange);
      // Do NOT remove classes here when already shown — removing `armed` and
      // `shown` on a visible element causes an awkward snap-back transform.
      // Only remove `armed` if the element never reached `shown` (i.e.,
      // component unmounted before it entered the viewport).
      if (!el.classList.contains(styles.shown)) {
        el.classList.remove(styles.armed);
      }
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}