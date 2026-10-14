/**
 * Synthetic & Production Leader Identity Store
 * 
 * Security Guarantees:
 * 1. Zero Production PII in Source Control:
 *    - All hardcoded synthetic fixtures use the reserved RFC 2606 domain `@example.org`.
 * 2. Fail-Closed in Production:
 *    - In production (NODE_ENV === 'production' or VERCEL_ENV === 'production'),
 *      synthetic fallback is strictly forbidden.
 *    - Missing, empty, malformed, or duplicate `LEADERSHIP_ALLOWLIST_JSON` safely disables
 *      leadership email login.
 * 3. Role Integrity:
 *    - All identities are strictly clamped to role 'LEADERSHIP' and surveillance scope.
 *    - Display labels like 'Developer' never elevate privileges to 'ADMIN'.
 * 4. Directory Access Boundary:
 *    - `getPublicDirectoryLeaders()` exposes ONLY `{ id, name, title }`.
 *    - Zero emails or credentials are ever exposed in public bundles or directory endpoints.
 */

export interface LeaderIdentity {
  id: string;
  email: string;
  name: string;
  title: string;
  role: 'LEADERSHIP';
  allowedStates: string[];
  allowedDistricts: string[];
  isActive: boolean;
  authVersion: number;
}

export interface PublicDirectoryLeader {
  id: string;
  name: string;
  title: string;
}

const SYNTHETIC_FIXTURE_LEADERS: LeaderIdentity[] = [
  {
    id: 'lead-ananya-roy',
    email: 'ananya.roy@example.org',
    name: 'Dr. Ananya Roy',
    title: 'National Programme Director',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isActive: true,
    authVersion: 1,
  },
  {
    id: 'lead-rajiv-menon',
    email: 'rajiv.menon@example.org',
    name: 'Rajiv Menon',
    title: 'Senior Technical Lead',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isActive: true,
    authVersion: 1,
  },
  {
    id: 'lead-priya-sharma',
    email: 'priya.sharma@example.org',
    name: 'Priya Sharma',
    title: 'Regional Operations Head',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isActive: true,
    authVersion: 1,
  },
  {
    id: 'lead-samuel-k',
    email: 'samuel.k@example.org',
    name: 'Samuel K',
    title: 'Governance & Compliance Officer',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isActive: true,
    authVersion: 1,
  },
  {
    id: 'lead-fatima-sheikh',
    email: 'fatima.sheikh@example.org',
    name: 'Fatima Sheikh',
    title: 'Former Programme Lead (Deactivated)',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isActive: false, // Intentionally deactivated to test security enforcement
    authVersion: 1,
  },
];

/**
 * Normalizes email strings for safe case-insensitive matching.
 */
export function normalizeEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Loads and validates leadership identities from environment or test fixtures.
 * In production environments, strictly fails closed if configuration is invalid or missing.
 */
export function loadInitialLeaders(): LeaderIdentity[] {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.APP_ENV === 'production';

  const rawJson = process.env.LEADERSHIP_ALLOWLIST_JSON;

  if (rawJson && typeof rawJson === 'string' && rawJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        if (isProduction) {
          console.error('[LEADER_IDENTITY_STORE:FATAL] LEADERSHIP_ALLOWLIST_JSON is empty in production. Disabling leadership email authentication.');
          return [];
        }
      } else {
        const seenEmails = new Set<string>();
        const seenIds = new Set<string>();
        const validatedLeaders: LeaderIdentity[] = [];

        for (const item of parsed) {
          const normEmail = normalizeEmail(item.email);
          if (!normEmail || !normEmail.includes('@')) {
            console.error('[LEADER_IDENTITY_STORE:ERROR] Invalid email in allowlist entry:', item.email);
            if (isProduction) return []; // Fail closed in production on malformed entry
            continue;
          }

          const id = String(item.id || `lead-${normEmail.split('@')[0] || Date.now()}`);

          // Duplicate detection: fail closed
          if (seenEmails.has(normEmail) || seenIds.has(id)) {
            console.error('[LEADER_IDENTITY_STORE:FATAL] Duplicate identity or email detected in allowlist:', normEmail);
            if (isProduction) return []; // Fail closed in production on duplicates
            continue;
          }

          seenEmails.add(normEmail);
          seenIds.add(id);

          validatedLeaders.push({
            id,
            email: normEmail,
            name: String(item.name || 'Alliance India Leader'),
            title: String(item.title || 'Leadership Reviewer'),
            role: 'LEADERSHIP', // Strictly enforced: NEVER elevation to ADMIN
            allowedStates: ['*'],
            allowedDistricts: ['*'],
            isActive: item.isActive !== false,
            authVersion: Number(item.authVersion || 1),
          });
        }

        if (validatedLeaders.length > 0) {
          return validatedLeaders;
        }

        if (isProduction) {
          console.error('[LEADER_IDENTITY_STORE:FATAL] No valid identities parsed from LEADERSHIP_ALLOWLIST_JSON. Disabling leadership email authentication.');
          return [];
        }
      }
    } catch (err: any) {
      console.error('[LEADER_IDENTITY_STORE:FATAL] Failed to parse LEADERSHIP_ALLOWLIST_JSON:', err?.message);
      if (isProduction) {
        return []; // Fail closed
      }
    }
  }

  // In production, no synthetic fallback is ever permitted
  if (isProduction) {
    console.warn('[LEADER_IDENTITY_STORE:NOTICE] No LEADERSHIP_ALLOWLIST_JSON configured in production. Leadership email sign-in is safely disabled.');
    return [];
  }

  // Development and test environment fallback using RFC 2606 reserved domains
  return JSON.parse(JSON.stringify(SYNTHETIC_FIXTURE_LEADERS));
}

let leadersDatabase: LeaderIdentity[] = loadInitialLeaders();

/**
 * Returns public directory information for approved directory-access boundaries.
 * Strictly exposes ONLY id, name, and title. Zero emails or private tokens.
 */
export function getPublicDirectoryLeaders(): PublicDirectoryLeader[] {
  return leadersDatabase
    .filter((l) => l.isActive)
    .map((l) => ({
      id: l.id,
      name: l.name,
      title: l.title,
    }));
}

/**
 * Looks up a leader identity by email (case-insensitive).
 */
export function findLeaderByEmail(email: string): LeaderIdentity | null {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  const match = leadersDatabase.find((l) => normalizeEmail(l.email) === norm);
  return match ? { ...match } : null;
}

/**
 * Looks up a leader identity by user ID.
 */
export function findLeaderById(id: string): LeaderIdentity | null {
  if (!id) return null;
  const match = leadersDatabase.find((l) => l.id === id);
  return match ? { ...match } : null;
}

/**
 * Checks if a leader exists and is currently active.
 */
export function isLeaderActive(emailOrId: string): boolean {
  const norm = normalizeEmail(emailOrId);
  const match = leadersDatabase.find((l) => normalizeEmail(l.email) === norm || l.id === emailOrId);
  return Boolean(match?.isActive);
}

/**
 * Returns current auth version for mid-session revocation checks.
 */
export function getLeaderAuthVersion(emailOrId: string): number {
  const norm = normalizeEmail(emailOrId);
  const match = leadersDatabase.find((l) => normalizeEmail(l.email) === norm || l.id === emailOrId);
  return match ? match.authVersion : 0;
}

// ---------------------------------------------------------------------------
// Testing & Admin Helpers
// ---------------------------------------------------------------------------

export function setLeaderActiveStatusForTesting(idOrEmail: string, isActive: boolean): void {
  const norm = normalizeEmail(idOrEmail);
  const idx = leadersDatabase.findIndex((l) => l.id === idOrEmail || normalizeEmail(l.email) === norm);
  if (idx !== -1) {
    leadersDatabase[idx].isActive = isActive;
  }
}

export function bumpLeaderAuthVersionForTesting(idOrEmail: string): void {
  const norm = normalizeEmail(idOrEmail);
  const idx = leadersDatabase.findIndex((l) => l.id === idOrEmail || normalizeEmail(l.email) === norm);
  if (idx !== -1) {
    leadersDatabase[idx].authVersion += 1;
  }
}

export function resetLeaderIdentitiesForTesting(): void {
  leadersDatabase = loadInitialLeaders();
}
