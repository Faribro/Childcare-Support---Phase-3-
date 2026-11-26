import { describe, it, expect } from 'vitest';
import { INDIAN_STATES_AND_UTS } from '@/lib/constants/indianStates';
import {
  STATE_CATALOG,
  resolveCanonicalStateEntry,
} from '@/lib/constants/stateCatalog';
import { canonicalizeStateName, getStateQueryVariants } from '@/lib/constants/stateNormalization';
import { getStateAbbreviation } from '@/lib/server/invitationCrypto';
import { getStateCode } from '@/lib/utils/idGenerator';

describe('Canonical 36-State LGD Catalog & Additive Normalization Regression Suite', () => {
  it('covers all 36 official INDIAN_STATES_AND_UTS entries with unique 3-digit zero-padded LGD numeric codes', () => {
    expect(STATE_CATALOG).toHaveLength(36);
    expect(INDIAN_STATES_AND_UTS).toHaveLength(36);

    const catalogNames = new Set(STATE_CATALOG.map((s) => s.canonicalName));
    const lgdCodes = new Set(STATE_CATALOG.map((s) => s.lgdCode));
    const numericCodes = new Set(STATE_CATALOG.map((s) => s.lgdNumericCode));
    const isoCodes = new Set(STATE_CATALOG.map((s) => s.isoCode));
    const prefixes = new Set(STATE_CATALOG.map((s) => s.invitationCodePrefix));

    expect(catalogNames.size).toBe(36);
    expect(lgdCodes.size).toBe(36);
    expect(numericCodes.size).toBe(36);
    expect(isoCodes.size).toBe(36);
    expect(prefixes.size).toBe(36);

    for (const state of INDIAN_STATES_AND_UTS) {
      expect(catalogNames.has(state)).toBe(true);
    }
    for (const entry of STATE_CATALOG) {
      expect(entry.lgdCode).toMatch(/^\d{2}$/);
      expect(entry.lgdNumericCode).toBe(entry.lgdCode.padStart(3, '0'));
      // LGD 25 (Daman & Diu) and 26 (Dadra & Nagar Haveli) merged into 38
      expect(['25', '26']).not.toContain(entry.lgdCode);
    }
  });

  it('preserves exact resolution for every previously stored state value and identifier', () => {
    const legacyPairs: Array<[string, string]> = [
      ['MH', 'Maharashtra'],
      ['STATE-MH', 'Maharashtra'],
      ['DL', 'Delhi'],
      ['STATE-DL', 'Delhi'],
      ['WB', 'West Bengal'],
      ['STATE-WB', 'West Bengal'],
      ['KA', 'Karnataka'],
      ['STATE-KA', 'Karnataka'],
      ['TN', 'Tamil Nadu'],
      ['STATE-TN', 'Tamil Nadu'],
      ['GJ', 'Gujarat'],
      ['STATE-GJ', 'Gujarat'],
      ['TG', 'Telangana'],
      ['STATE-TG', 'Telangana'],
      ['UP', 'Uttar Pradesh'],
      ['STATE-UP', 'Uttar Pradesh'],
      ['AP', 'Andhra Pradesh'],
      ['STATE-AP', 'Andhra Pradesh'],
      ['KL', 'Kerala'],
      ['STATE-KL', 'Kerala'],
      ['MP', 'Madhya Pradesh'],
      ['STATE-MP', 'Madhya Pradesh'],
      ['RJ', 'Rajasthan'],
      ['STATE-RJ', 'Rajasthan'],
      ['PB', 'Punjab'],
      ['STATE-PB', 'Punjab'],
      ['HR', 'Haryana'],
      ['STATE-HR', 'Haryana'],
      ['BR', 'Bihar'],
      ['STATE-BR', 'Bihar'],
      ['OD', 'Odisha'],
      ['STATE-OD', 'Odisha'],
      ['JH', 'Jharkhand'],
      ['STATE-JH', 'Jharkhand'],
      ['CT', 'Chhattisgarh'],
      ['STATE-CT', 'Chhattisgarh'],
      ['AS', 'Assam'],
      ['STATE-AS', 'Assam'],
    ];

    for (const [input, expected] of legacyPairs) {
      expect(canonicalizeStateName(input)).toBe(expected);
      expect(canonicalizeStateName(input.toLowerCase())).toBe(expected);
      expect(canonicalizeStateName(expected)).toBe(expected);
      expect(canonicalizeStateName(expected.toUpperCase())).toBe(expected);
    }

    // Legacy 19 invitation prefixes remain untouched
    expect(getStateAbbreviation('Telangana')).toBe('TG');
    expect(getStateAbbreviation('Chhattisgarh')).toBe('CG');
    expect(getStateAbbreviation('Odisha')).toBe('OD');

    // Stored assessment ID generator mapping remains untouched
    expect(getStateCode('Telangana')).toBe('TS');
    expect(getStateCode('Chhattisgarh')).toBe('CG');

    // Query variants preserved
    expect(getStateQueryVariants('STATE-MH')).toEqual(['Maharashtra', 'MAHARASHTRA', 'maharashtra']);
    expect(getStateQueryVariants('*')).toEqual([]);
    expect(getStateQueryVariants('ALL')).toEqual([]);
  });

  it('additively resolves newly covered States/UTs and fixes Ladakh/Lakshadweep collision', () => {
    expect(canonicalizeStateName('CG')).toBe('Chhattisgarh');
    expect(canonicalizeStateName('STATE-CG')).toBe('Chhattisgarh');
    expect(canonicalizeStateName('TS')).toBe('Telangana');
    expect(canonicalizeStateName('STATE-TS')).toBe('Telangana');
    expect(canonicalizeStateName('LA')).toBe('Ladakh');
    expect(canonicalizeStateName('STATE-LA')).toBe('Ladakh');
    expect(canonicalizeStateName('LD')).toBe('Lakshadweep');
    expect(canonicalizeStateName('STATE-LD')).toBe('Lakshadweep');
    expect(canonicalizeStateName('GA')).toBe('Goa');
    expect(canonicalizeStateName('DD')).toBe('Dadra and Nagar Haveli and Daman and Diu');

    // Previously Ladakh & Lakshadweep collided as 'LA'
    expect(getStateAbbreviation('Ladakh')).toBe('LA');
    expect(getStateAbbreviation('Lakshadweep')).toBe('LD');
    expect(getStateAbbreviation('Goa')).toBe('GA');
    expect(getStateAbbreviation('Manipur')).toBe('MN');
    expect(getStateAbbreviation('Mizoram')).toBe('MZ');
    expect(getStateAbbreviation('Meghalaya')).toBe('ML');

    // Strict resolver rejects arbitrary/non-state strings while accepting all canonical names & aliases
    expect(resolveCanonicalStateEntry('Maharashtra')?.lgdNumericCode).toBe('027');
    expect(resolveCanonicalStateEntry('Ladakh')?.lgdNumericCode).toBe('037');
    expect(resolveCanonicalStateEntry('Lakshadweep')?.lgdNumericCode).toBe('031');
    expect(resolveCanonicalStateEntry('Telangana')?.lgdNumericCode).toBe('036');
    expect(resolveCanonicalStateEntry('Dadra and Nagar Haveli and Daman and Diu')?.lgdNumericCode).toBe('038');
    expect(resolveCanonicalStateEntry('Atlantis')).toBeNull();
  });
});
