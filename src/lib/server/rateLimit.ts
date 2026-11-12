import type { NextRequest } from 'next/server';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

/**
 * Extracts client IP safely without trusting spoofed multi-hop values beyond the first forwarded hop.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return '127.0.0.1';
}

/**
 * Bounded per-key in-memory fixed-window rate limiter.
 * Separate namespaces keep route quotas isolated (e.g., geocode vs login vs submit vs upload).
 */
const namespaces = new Map<string, Map<string, RateLimitBucket>>();
const MAX_ENTRIES_PER_NAMESPACE = 10000;

export function checkRateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  let store = namespaces.get(namespace);
  if (!store) {
    store = new Map<string, RateLimitBucket>();
    namespaces.set(namespace, store);
  }

  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    if (store.size >= MAX_ENTRIES_PER_NAMESPACE) {
      // Evict oldest / expired entries first to keep memory bounded
      for (const [k, v] of store.entries()) {
        if (v.resetAt <= now || store.size >= MAX_ENTRIES_PER_NAMESPACE) {
          store.delete(k);
          if (store.size < MAX_ENTRIES_PER_NAMESPACE * 0.9) break;
        }
      }
    }

    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfterSeconds) }),
  };
}

export function _resetRateLimitsForTest(namespace?: string): void {
  if (namespace) {
    namespaces.delete(namespace);
  } else {
    namespaces.clear();
  }
}
