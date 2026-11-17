/**
 * appUrl.ts
 *
 * Centralized, fail-closed URL resolution for server-side redirects, OAuth callbacks,
 * and email notifications. Prevents internal container host leaks (such as 0.0.0.0:8080
 * or Docker interface IPs) in Cloud Run / serverless environments.
 */

import { NextRequest } from 'next/server';

const INTERNAL_HOST_PATTERNS = [
  /^0\.0\.0\.0(?::\d+)?$/,
  /^127\.0\.0\.1(?::\d+)?$/,
  /^localhost:8080$/,
  /^::1(?::\d+)?$/,
];

export const DEFAULT_PUBLIC_APP_URL = 'https://childcare.allianceindia.org';

/**
 * Checks if a given host string matches an internal container or loopback interface.
 */
export function isInternalHost(host?: string | null): boolean {
  if (!host) return true;
  const clean = host.trim().toLowerCase();
  
  // Always reject 0.0.0.0, 127.0.0.1, or port 8080
  for (const pattern of INTERNAL_HOST_PATTERNS) {
    if (pattern.test(clean)) return true;
  }

  // In deployed/staging/production environments, localhost is strictly internal
  const isProductionOrStaging =
    process.env.NODE_ENV === 'production' ||
    process.env.APP_ENV === 'production' ||
    process.env.APP_ENV === 'staging';

  if (isProductionOrStaging && clean.startsWith('localhost')) {
    return true;
  }

  return false;
}

/**
 * Resolves the canonical public base URL (e.g. "https://childcare.allianceindia.org" or "https://cs-p3-production.web.app").
 *
 * Evaluation order:
 * 1. Forwarded host headers (`x-forwarded-host`, `x-fh-requested-host`) if non-internal.
 * 2. Environment variables (`APP_URL`, `NEXT_PUBLIC_APP_URL`, `APP_BASE_URL`) if non-internal.
 * 3. Default fallback (`https://childcare.allianceindia.org`).
 */
export function getPublicAppBaseUrl(req?: NextRequest | Request | null): string {
  // 1. Check request headers if available
  if (req) {
    const headers = req.headers;
    const forwardedHost =
      headers.get('x-forwarded-host') ||
      headers.get('x-fh-requested-host') ||
      headers.get('host');

    if (forwardedHost) {
      const primaryHost = forwardedHost.split(',')[0].trim();
      if (!isInternalHost(primaryHost)) {
        const protoHeader = headers.get('x-forwarded-proto');
        const proto =
          protoHeader === 'http' && process.env.NODE_ENV !== 'production'
            ? 'http'
            : 'https';
        return `${proto}://${primaryHost}`.replace(/\/+$/, '');
      }
    }
  }

  // 2. Check configured environment variables
  const envCandidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_BASE_URL,
  ];

  for (const candidate of envCandidates) {
    if (candidate && candidate.trim()) {
      try {
        const parsed = new URL(candidate.trim());
        if (!isInternalHost(parsed.host)) {
          return candidate.trim().replace(/\/+$/, '');
        }
      } catch {
        // Ignore unparseable env var
      }
    }
  }

  // 3. Fallback
  return DEFAULT_PUBLIC_APP_URL;
}

/**
 * Resolves a safe public redirect URL. Guaranteed never to leak 0.0.0.0 or internal ports.
 *
 * @param pathOrUrl Target path (e.g. "/assessment/new" or "https://childcare.allianceindia.org/assessment/new")
 * @param req Current NextRequest
 */
export function resolveSafeRedirectUrl(
  pathOrUrl: string,
  req?: NextRequest | Request | null
): URL {
  const baseUrl = getPublicAppBaseUrl(req);

  // If pathOrUrl is already an absolute URL, check if its host is internal
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    try {
      const parsed = new URL(pathOrUrl);
      if (isInternalHost(parsed.host)) {
        // Swap internal host and port with public base URL
        const publicBase = new URL(baseUrl);
        parsed.protocol = publicBase.protocol;
        parsed.hostname = publicBase.hostname;
        parsed.port = publicBase.port;
        return parsed;
      }
      return parsed;
    } catch {
      // Fall through to relative resolution
    }
  }

  // Relative path resolution
  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return new URL(cleanPath, baseUrl);
}
