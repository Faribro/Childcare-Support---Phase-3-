import React, { useState, useEffect } from 'react';

// Central in-memory URL state for native client
let currentUrl = '/assessment/new';
const listeners = new Set<() => void>();

export function navigateTo(url: string) {
  if (!url) return;
  currentUrl = url;
  if (typeof window !== 'undefined') {
    try {
      window.location.hash = url;
    } catch (_) {}
  }
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('[next-navigation] Error in nav listener', e);
    }
  });
}

export function getCurrentUrl(): string {
  return currentUrl;
}

export function subscribeToNavigation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Global event hookup
if (typeof window !== 'undefined') {
  if (window.location.hash && window.location.hash.length > 1) {
    currentUrl = window.location.hash.replace(/^#/, '');
  }

  window.addEventListener('native:navigate', (e: any) => {
    const dest = e.detail;
    if (typeof dest === 'string') {
      navigateTo(dest);
    }
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash) {
      const hashUrl = window.location.hash.replace(/^#/, '');
      if (hashUrl && hashUrl !== currentUrl) {
        currentUrl = hashUrl;
        listeners.forEach((fn) => fn());
      }
    }
  });

  window.addEventListener('popstate', () => {
    if (window.location.hash) {
      const hashUrl = window.location.hash.replace(/^#/, '');
      if (hashUrl && hashUrl !== currentUrl) {
        currentUrl = hashUrl;
        listeners.forEach((fn) => fn());
      }
    }
  });
}

export function useRouter() {
  return {
    push: (url: string) => {
      navigateTo(url);
    },
    replace: (url: string) => {
      navigateTo(url);
    },
    back: () => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else {
        navigateTo('/assessment/new');
      }
    },
    forward: () => {
      if (typeof window !== 'undefined') {
        window.history.forward();
      }
    },
    refresh: () => {
      listeners.forEach((fn) => fn());
    },
    prefetch: () => {},
  };
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => currentUrl.split('?')[0]);

  useEffect(() => {
    const update = () => setPathname(currentUrl.split('?')[0]);
    return subscribeToNavigation(update);
  }, []);

  return pathname;
}

export function useSearchParams(): URLSearchParams {
  const [params, setParams] = useState(() => {
    const qIndex = currentUrl.indexOf('?');
    return new URLSearchParams(qIndex >= 0 ? currentUrl.slice(qIndex) : '');
  });

  useEffect(() => {
    const update = () => {
      const qIndex = currentUrl.indexOf('?');
      setParams(new URLSearchParams(qIndex >= 0 ? currentUrl.slice(qIndex) : ''));
    };
    return subscribeToNavigation(update);
  }, []);

  return params;
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const [params, setParams] = useState<Record<string, string>>(() => extractRouteParams(currentUrl));

  useEffect(() => {
    const update = () => setParams(extractRouteParams(currentUrl));
    return subscribeToNavigation(update);
  }, []);

  return params as T;
}

export function extractRouteParams(url: string): Record<string, string> {
  const pathname = url.split('?')[0];
  const params: Record<string, string> = {};

  const draftReviewMatch = pathname.match(/^\/assessment\/draft\/([^/]+)\/review\/?$/);
  if (draftReviewMatch) {
    params.draftId = decodeURIComponent(draftReviewMatch[1]);
    return params;
  }

  const draftMatch = pathname.match(/^\/assessment\/draft\/([^/]+)\/?$/);
  if (draftMatch) {
    params.draftId = decodeURIComponent(draftMatch[1]);
    return params;
  }

  const recordReceiptMatch = pathname.match(/^\/assessment\/record\/([^/]+)\/receipt\/?$/);
  if (recordReceiptMatch) {
    params.submissionId = decodeURIComponent(recordReceiptMatch[1]);
    return params;
  }

  const recordEditMatch = pathname.match(/^\/assessment\/record\/([^/]+)\/edit\/?$/);
  if (recordEditMatch) {
    params.submissionId = decodeURIComponent(recordEditMatch[1]);
    return params;
  }

  const recordMatch = pathname.match(/^\/assessment\/record\/([^/]+)\/?$/);
  if (recordMatch) {
    params.submissionId = decodeURIComponent(recordMatch[1]);
    return params;
  }

  const supAssessMatch = pathname.match(/^\/supervisor\/assessments\/([^/]+)\/?$/);
  if (supAssessMatch) {
    params.submissionId = decodeURIComponent(supAssessMatch[1]);
    return params;
  }

  const genericAssessMatch = pathname.match(/^\/assessment\/([^/]+)\/?$/);
  if (genericAssessMatch && !['new', 'drafts', 'sync'].includes(genericAssessMatch[1])) {
    params.id = decodeURIComponent(genericAssessMatch[1]);
    return params;
  }

  return params;
}

export function redirect(url: string): never {
  navigateTo(url);
  throw new Error(`NEXT_REDIRECT:${url}`);
}

export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}
