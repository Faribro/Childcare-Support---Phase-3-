'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered with scope:', reg.scope);

            // Pre-warm offline routes so their scripts and resources are guaranteed cached
            if (typeof navigator !== 'undefined' && navigator.onLine) {
              const prewarmUrls = ['/assessment/new', '/assessment/drafts', '/assessment/sync'];
              prewarmUrls.forEach((url) => {
                fetch(url, { credentials: 'same-origin' })
                  .then(async (res) => {
                    if (res.ok) {
                      const text = await res.text();
                      // Cache referenced script chunks
                      const scriptMatches = text.matchAll(/<script[^>]+src="([^">]+)"/g);
                      for (const match of scriptMatches) {
                        if (match[1] && match[1].startsWith('/_next/static/')) {
                          fetch(match[1], { credentials: 'same-origin' }).catch(() => {});
                        }
                      }
                      // Cache referenced CSS stylesheets
                      const cssMatches = text.matchAll(/<link[^>]+href="([^">]+\.css)"/g);
                      for (const match of cssMatches) {
                        if (match[1] && match[1].startsWith('/_next/static/')) {
                          fetch(match[1], { credentials: 'same-origin' }).catch(() => {});
                        }
                      }
                    }
                  })
                  .catch(() => {});
              });
            }
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }
  }, []);

  return null;
}
