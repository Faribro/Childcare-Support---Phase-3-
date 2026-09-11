import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Service Worker Response Safety Suite (PR #7 PWA Hotfix)', () => {
  let fetchListeners: Array<(event: any) => void> = [];
  let cacheStore: Map<string, Response> = new Map();
  const ORIGIN = 'https://childcare-support-phase-3.onrender.com';

  const mockCaches = {
    open: vi.fn(async (_cacheName: string) => ({
      put: vi.fn(async (request: any, response: any) => {
        const urlKey = typeof request === 'string' ? request : request.url;
        cacheStore.set(urlKey, response);
      }),
      addAll: vi.fn(async (urls: string[]) => {
        for (const u of urls) {
          cacheStore.set(new URL(u, ORIGIN).href, new Response('<html>Shell</html>', { status: 200 }));
        }
      }),
    })),
    match: vi.fn(async (request: any, options?: { ignoreSearch?: boolean }) => {
      const targetUrl = typeof request === 'string' ? request : request.url;
      const parsedTarget = new URL(targetUrl, ORIGIN);

      if (options?.ignoreSearch) {
        for (const [key, response] of cacheStore.entries()) {
          const parsedKey = new URL(key, ORIGIN);
          if (parsedKey.origin === parsedTarget.origin && parsedKey.pathname === parsedTarget.pathname) {
            return response.clone();
          }
        }
      }

      const match = cacheStore.get(targetUrl) || cacheStore.get(parsedTarget.href);
      return match ? match.clone() : undefined;
    }),
    keys: vi.fn(async () => ['alliance-pwa-v3.0.0']),
    delete: vi.fn(async () => true),
  };

  beforeEach(() => {
    fetchListeners = [];
    cacheStore = new Map();

    // Pre-populate standard precache shells
    cacheStore.set(`${ORIGIN}/assessment/sync`, new Response('<!doctype html><html><body>Sync Shell</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }));
    cacheStore.set(`${ORIGIN}/app`, new Response('<!doctype html><html><body>App Shell</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }));

    // Setup global service worker mocks
    (global as any).self = {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: any) => {
        if (type === 'fetch') fetchListeners.push(listener);
      },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    };
    (global as any).caches = mockCaches;

    // Load and evaluate public/sw.js
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const swCode = fs.readFileSync(swPath, 'utf8');
    const runSw = new Function('self', 'caches', swCode);
    runSw((global as any).self, mockCaches);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function triggerFetch(request: Request): { responded: boolean; responsePromise: Promise<Response> | null } {
    let responded = false;
    let responsePromise: Promise<Response> | null = null;

    const event = {
      request,
      respondWith: (promise: Promise<Response>) => {
        responded = true;
        responsePromise = promise;
      },
      waitUntil: vi.fn(),
    };

    for (const listener of fetchListeners) {
      listener(event);
    }

    return { responded, responsePromise };
  }

  // ── 1. Navigation fetch success ──
  it('1. Navigation fetch success: /assessment/sync?status=syncing&ref=ART-TEST-0001 returns a Response', async () => {
    const syntheticUrl = `${ORIGIN}/assessment/sync?status=syncing&ref=ART-TEST-0001`;
    const networkResponse = new Response('<!doctype html><html><body>Live Sync Page</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });

    global.fetch = vi.fn(async () => networkResponse);

    const request = new Request(syntheticUrl, { method: 'GET' });
    Object.defineProperty(request, 'mode', { value: 'navigate' });

    const { responded, responsePromise } = triggerFetch(request);

    expect(responded).toBe(true);
    expect(responsePromise).not.toBeNull();

    const result = await responsePromise!;
    expect(result).toBeDefined();
    expect(result instanceof Response).toBe(true);
    expect(result.status).toBe(200);
  });

  // ── 2. Navigation fetch network failure ──
  it('2. Navigation fetch network failure: returns cached valid HTML Response or explicit 503 offline Response', async () => {
    const syntheticUrl = `${ORIGIN}/assessment/sync?status=syncing&ref=ART-TEST-0001`;

    // Simulate complete network failure (offline)
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const request = new Request(syntheticUrl, { method: 'GET' });
    Object.defineProperty(request, 'mode', { value: 'navigate' });

    const { responded, responsePromise } = triggerFetch(request);

    expect(responded).toBe(true);
    expect(responsePromise).not.toBeNull();

    const result = await responsePromise!;
    // Must be a valid Response object, never undefined
    expect(result).toBeDefined();
    expect(result instanceof Response).toBe(true);
    // Should match the cached /assessment/sync shell via ignoreSearch
    expect(result.status).toBe(200);
    const bodyText = await result.text();
    expect(bodyText).toContain('Sync Shell');
  });

  // ── 3. No route causes "Failed to convert value to Response" ──
  it('3. No route causes "Failed to convert value to Response" when uncached and network fails', async () => {
    // Clear all cache to test ultimate fallback
    cacheStore.clear();

    global.fetch = vi.fn(async () => {
      throw new Error('Connection refused / offline');
    });

    const testRoutes = [
      { url: `${ORIGIN}/assessment/sync?status=syncing&ref=DL-SOU-111409-01`, mode: 'cors' },
      { url: `${ORIGIN}/assessment/sync?status=synced&ref=ART-TEST-0001`, mode: 'navigate' },
      { url: `${ORIGIN}/_next/static/chunks/main.js`, mode: 'cors' },
      { url: `${ORIGIN}/icons/icon-192x192.png`, mode: 'no-cors' },
    ];

    for (const testCase of testRoutes) {
      const request = new Request(testCase.url, { method: 'GET' });
      Object.defineProperty(request, 'mode', { value: testCase.mode });

      const { responded, responsePromise } = triggerFetch(request);

      expect(responded).toBe(true);
      expect(responsePromise).not.toBeNull();

      const result = await responsePromise!;
      // Crucial: result MUST be a valid Response object.
      // If it resolved to undefined or rejected, browser throws TypeError: Failed to convert value to 'Response'
      expect(result).toBeDefined();
      expect(result instanceof Response).toBe(true);
      expect([200, 503]).toContain(result.status);
    }
  });

  // ── 4. POST/PATCH submission requests bypass cache and remain network-only ──
  it('4. POST/PATCH submission requests bypass cache and remain network-only', () => {
    const mutationRequests = [
      new Request(`${ORIGIN}/api/submissions`, { method: 'POST' }),
      new Request(`${ORIGIN}/api/submissions/f47ac10b-58cc-4372-a567-0e02b2c3d479`, { method: 'PATCH' }),
      new Request(`${ORIGIN}/api/sync`, { method: 'POST' }),
      new Request(`${ORIGIN}/api/submissions?limit=10`, { method: 'GET' }),
    ];

    for (const req of mutationRequests) {
      const { responded, responsePromise } = triggerFetch(req);
      // Service worker MUST NOT intercept API routes or non-GET methods
      expect(responded).toBe(false);
      expect(responsePromise).toBeNull();
    }
  });

  // ── 5. Client-side navigation fetch to /assessment/sync with query parameters ──
  it('5. Subrequest fetch with search params returns cached shell when offline', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('Network unavailable');
    });

    // Client-side router transition (mode: cors)
    const request = new Request(`${ORIGIN}/assessment/sync?status=syncing&ref=DL-SOU-111409-01`, {
      method: 'GET',
    });
    Object.defineProperty(request, 'mode', { value: 'cors' });

    const { responded, responsePromise } = triggerFetch(request);

    expect(responded).toBe(true);
    const result = await responsePromise!;
    expect(result).toBeDefined();
    expect(result instanceof Response).toBe(true);
    expect(result.status).toBe(200);
  });
});
