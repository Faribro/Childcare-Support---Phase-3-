/**
 * Canonical State Normalization Utility
 *
 * Ensures consistent Title Case representation of Indian States and UTs
 * across all database writes, queries, session tokens, and access checks.
 */

import { INDIAN_STATES_AND_UTS } from './indianStates';

const STATE_CODE_MAP: Record<string, string> = {
  MH: 'Maharashtra',
  'STATE-MH': 'Maharashtra',
  DL: 'Delhi',
  'STATE-DL': 'Delhi',
  WB: 'West Bengal',
  'STATE-WB': 'West Bengal',
  KA: 'Karnataka',
  'STATE-KA': 'Karnataka',
  TN: 'Tamil Nadu',
  'STATE-TN': 'Tamil Nadu',
  GJ: 'Gujarat',
  'STATE-GJ': 'Gujarat',
  TG: 'Telangana',
  'STATE-TG': 'Telangana',
  UP: 'Uttar Pradesh',
  'STATE-UP': 'Uttar Pradesh',
  AP: 'Andhra Pradesh',
  'STATE-AP': 'Andhra Pradesh',
  KL: 'Kerala',
  'STATE-KL': 'Kerala',
  MP: 'Madhya Pradesh',
  'STATE-MP': 'Madhya Pradesh',
  RJ: 'Rajasthan',
  'STATE-RJ': 'Rajasthan',
  PB: 'Punjab',
  'STATE-PB': 'Punjab',
  HR: 'Haryana',
  'STATE-HR': 'Haryana',
  BR: 'Bihar',
  'STATE-BR': 'Bihar',
  OD: 'Odisha',
  'STATE-OD': 'Odisha',
  JH: 'Jharkhand',
  'STATE-JH': 'Jharkhand',
  CT: 'Chhattisgarh',
  'STATE-CT': 'Chhattisgarh',
  AS: 'Assam',
  'STATE-AS': 'Assam',
};

/**
 * Normalizes any state variant (UPPERCASE, lowercase, abbreviation, code)
 * to its canonical Title Case name (e.g. 'Maharashtra').
 */
export function canonicalizeStateName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '*' || trimmed.toUpperCase() === 'ALL') return trimmed;

  const upper = trimmed.toUpperCase();
  if (STATE_CODE_MAP[upper]) {
    return STATE_CODE_MAP[upper];
  }

  const match = INDIAN_STATES_AND_UTS.find(
    (st) => st.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match;

  // Fallback: title case conversion
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Returns all potential string variants of a state for resilient matching.
 */
export function getStateQueryVariants(raw?: string | null): string[] {
  const canonical = canonicalizeStateName(raw);
  if (!canonical || canonical === '*' || canonical.toUpperCase() === 'ALL') {
    return [];
  }
  return Array.from(
    new Set([
      canonical,
      canonical.toUpperCase(),
      canonical.toLowerCase(),
    ])
  );
}
