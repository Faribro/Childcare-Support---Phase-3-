/**
 * Synthetic Leader Identity Store
 * 
 * Provides allowlisted leadership accounts with strict authorization parameters.
 * Uses ONLY synthetic personas in development, test, and evaluation environments.
 * ZERO production user credentials or live PII.
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

const INITIAL_SYNTHETIC_LEADERS: LeaderIdentity[] = [
  {
    id: 'lead-ananya-roy',
    email: 'ananya.roy@allianceindia.org',
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
    email: 'rajiv.menon@allianceindia.org',
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
    email: 'priya.sharma@allianceindia.org',
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
    email: 'samuel.k@allianceindia.org',
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
    email: 'fatima.sheikh@allianceindia.org',
    name: 'Fatima Sheikh',
    title: 'Former Programme Lead (Deactivated)',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isActive: false, // Intentionally deactivated to test security enforcement
    authVersion: 1,
  },
];

export function loadInitialLeaders(): LeaderIdentity[] {
  if (typeof process !== 'undefined' && process.env?.LEADERSHIP_ALLOWLIST_JSON) {
    try {
      const parsed = JSON.parse(process.env.LEADERSHIP_ALLOWLIST_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          id: String(item.id || `lead-${(item.email || '').split('@')[0] || Date.now()}`),
          email: String(item.email || '').trim().toLowerCase(),
          name: String(item.name || 'Alliance India Leader'),
          title: String(item.title || 'Leadership Reviewer'),
          role: 'LEADERSHIP' as const, // Strictly enforced: NEVER elevation to ADMIN
          allowedStates: ['*'],
          allowedDistricts: ['*'],
          isActive: item.isActive !== false,
          authVersion: Number(item.authVersion || 1),
        }));
      }
    } catch (err: any) {
      console.error('[LEADER_IDENTITY_STORE] Failed to parse LEADERSHIP_ALLOWLIST_JSON:', err?.message);
    }
  }
  return JSON.parse(JSON.stringify(INITIAL_SYNTHETIC_LEADERS));
}

let leadersDatabase: LeaderIdentity[] = loadInitialLeaders();

/**
 * Normalizes email strings for safe case-insensitive matching.
 */
export function normalizeEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
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
