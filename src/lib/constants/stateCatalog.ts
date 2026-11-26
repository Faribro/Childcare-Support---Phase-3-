/**
 * Canonical Indian States & Union Territories Catalog
 *
 * Single source of truth linking official names (`INDIAN_STATES_AND_UTS`),
 * official Local Government Directory (LGD) 2-digit codes (zero-padded to 3 digits
 * for informational display), standard 2-letter codes, and additive legacy aliases.
 *
 * OFFICIAL VERIFICATION METADATA:
 * - Source: Local Government Directory (LGD), Ministry of Panchayati Raj, Govt. of India
 *   (https://lgdirectory.gov.in/)
 * - Verified Date: 2026-11-26 (36 active States/UTs verified; 0 unverified active entries;
 *   retired legacy codes 025 Daman & Diu and 026 Dadra & Nagar Haveli merged into 038).
 *
 * SECURITY NOTE: `lgdNumericCode` (e.g. '027' for Maharashtra) is strictly
 * informational convenience metadata. It MUST NEVER be treated as an access
 * credential, OTP bypass, or state scope authorization token.
 *
 * HISTORICAL COMPATIBILITY:
 * Stored IDs / prefixes such as `STATE-CT`, `STATE-TG`, `CT`, `TG`, and
 * `ALN-CG-*` / `ALN-TG-*` remain preserved via additive alias entries.
 */

import type { IndianStateOrUT } from './indianStates';

export const LGD_CATALOG_SOURCE =
  'Local Government Directory (LGD), Ministry of Panchayati Raj, Government of India (https://lgdirectory.gov.in/)';
export const LGD_CATALOG_VERIFIED_DATE = '2026-11-26';
export const LGD_RETIRED_MERGED_CODES = ['025', '026'] as const;

export interface CanonicalStateCatalogEntry {
  canonicalName: IndianStateOrUT;
  /** Official 2-digit LGD state code from lgdirectory.gov.in */
  lgdCode: string;
  /** Informational 3-digit zero-padded LGD code (display only, never a credential) */
  lgdNumericCode: string;
  /** Standard ISO 3166-2:IN 2-letter postal/geo code */
  isoCode: string;
  /** Prefix preserved for state-team invitation codes (ALN-<PREFIX>-XXXX-XXXX) */
  invitationCodePrefix: string;
  /** Additional case-insensitive normalized tokens that resolve additively to this state */
  legacyAliases: readonly string[];
}

export const STATE_CATALOG: readonly CanonicalStateCatalogEntry[] = [
  {
    canonicalName: 'Andhra Pradesh',
    lgdCode: '28',
    lgdNumericCode: '028',
    isoCode: 'AP',
    invitationCodePrefix: 'AP',
    legacyAliases: ['AP', 'STATE-AP', 'ANDHRA PRADESH'],
  },
  {
    canonicalName: 'Arunachal Pradesh',
    lgdCode: '12',
    lgdNumericCode: '012',
    isoCode: 'AR',
    invitationCodePrefix: 'AR',
    legacyAliases: ['AR', 'STATE-AR', 'ARUNACHAL PRADESH'],
  },
  {
    canonicalName: 'Assam',
    lgdCode: '18',
    lgdNumericCode: '018',
    isoCode: 'AS',
    invitationCodePrefix: 'AS',
    legacyAliases: ['AS', 'STATE-AS', 'ASSAM'],
  },
  {
    canonicalName: 'Bihar',
    lgdCode: '10',
    lgdNumericCode: '010',
    isoCode: 'BR',
    invitationCodePrefix: 'BR',
    legacyAliases: ['BR', 'STATE-BR', 'BIHAR'],
  },
  {
    canonicalName: 'Chhattisgarh',
    lgdCode: '22',
    lgdNumericCode: '022',
    isoCode: 'CG',
    invitationCodePrefix: 'CG',
    legacyAliases: ['CT', 'STATE-CT', 'CG', 'STATE-CG', 'CHHATTISGARH'],
  },
  {
    canonicalName: 'Delhi',
    lgdCode: '07',
    lgdNumericCode: '007',
    isoCode: 'DL',
    invitationCodePrefix: 'DL',
    legacyAliases: ['DL', 'STATE-DL', 'DELHI', 'NCT OF DELHI'],
  },
  {
    canonicalName: 'Goa',
    lgdCode: '30',
    lgdNumericCode: '030',
    isoCode: 'GA',
    invitationCodePrefix: 'GA',
    legacyAliases: ['GA', 'STATE-GA', 'GOA'],
  },
  {
    canonicalName: 'Gujarat',
    lgdCode: '24',
    lgdNumericCode: '024',
    isoCode: 'GJ',
    invitationCodePrefix: 'GJ',
    legacyAliases: ['GJ', 'STATE-GJ', 'GUJARAT'],
  },
  {
    canonicalName: 'Haryana',
    lgdCode: '06',
    lgdNumericCode: '006',
    isoCode: 'HR',
    invitationCodePrefix: 'HR',
    legacyAliases: ['HR', 'STATE-HR', 'HARYANA'],
  },
  {
    canonicalName: 'Himachal Pradesh',
    lgdCode: '02',
    lgdNumericCode: '002',
    isoCode: 'HP',
    invitationCodePrefix: 'HP',
    legacyAliases: ['HP', 'STATE-HP', 'HIMACHAL PRADESH'],
  },
  {
    canonicalName: 'Jharkhand',
    lgdCode: '20',
    lgdNumericCode: '020',
    isoCode: 'JH',
    invitationCodePrefix: 'JH',
    legacyAliases: ['JH', 'STATE-JH', 'JHARKHAND'],
  },
  {
    canonicalName: 'Karnataka',
    lgdCode: '29',
    lgdNumericCode: '029',
    isoCode: 'KA',
    invitationCodePrefix: 'KA',
    legacyAliases: ['KA', 'STATE-KA', 'KARNATAKA'],
  },
  {
    canonicalName: 'Kerala',
    lgdCode: '32',
    lgdNumericCode: '032',
    isoCode: 'KL',
    invitationCodePrefix: 'KL',
    legacyAliases: ['KL', 'STATE-KL', 'KERALA'],
  },
  {
    canonicalName: 'Madhya Pradesh',
    lgdCode: '23',
    lgdNumericCode: '023',
    isoCode: 'MP',
    invitationCodePrefix: 'MP',
    legacyAliases: ['MP', 'STATE-MP', 'MADHYA PRADESH'],
  },
  {
    canonicalName: 'Maharashtra',
    lgdCode: '27',
    lgdNumericCode: '027',
    isoCode: 'MH',
    invitationCodePrefix: 'MH',
    legacyAliases: ['MH', 'STATE-MH', 'MAHARASHTRA'],
  },
  {
    canonicalName: 'Manipur',
    lgdCode: '14',
    lgdNumericCode: '014',
    isoCode: 'MN',
    invitationCodePrefix: 'MN',
    legacyAliases: ['MN', 'STATE-MN', 'MANIPUR'],
  },
  {
    canonicalName: 'Meghalaya',
    lgdCode: '17',
    lgdNumericCode: '017',
    isoCode: 'ML',
    invitationCodePrefix: 'ML',
    legacyAliases: ['ML', 'STATE-ML', 'MEGHALAYA'],
  },
  {
    canonicalName: 'Mizoram',
    lgdCode: '15',
    lgdNumericCode: '015',
    isoCode: 'MZ',
    invitationCodePrefix: 'MZ',
    legacyAliases: ['MZ', 'STATE-MZ', 'MIZORAM'],
  },
  {
    canonicalName: 'Nagaland',
    lgdCode: '13',
    lgdNumericCode: '013',
    isoCode: 'NL',
    invitationCodePrefix: 'NL',
    legacyAliases: ['NL', 'STATE-NL', 'NAGALAND'],
  },
  {
    canonicalName: 'Odisha',
    lgdCode: '21',
    lgdNumericCode: '021',
    isoCode: 'OD',
    invitationCodePrefix: 'OD',
    legacyAliases: ['OD', 'STATE-OD', 'OR', 'ORISSA', 'ODISHA'],
  },
  {
    canonicalName: 'Punjab',
    lgdCode: '03',
    lgdNumericCode: '003',
    isoCode: 'PB',
    invitationCodePrefix: 'PB',
    legacyAliases: ['PB', 'STATE-PB', 'PUNJAB'],
  },
  {
    canonicalName: 'Rajasthan',
    lgdCode: '08',
    lgdNumericCode: '008',
    isoCode: 'RJ',
    invitationCodePrefix: 'RJ',
    legacyAliases: ['RJ', 'STATE-RJ', 'RAJASTHAN'],
  },
  {
    canonicalName: 'Sikkim',
    lgdCode: '11',
    lgdNumericCode: '011',
    isoCode: 'SK',
    invitationCodePrefix: 'SK',
    legacyAliases: ['SK', 'STATE-SK', 'SIKKIM'],
  },
  {
    canonicalName: 'Tamil Nadu',
    lgdCode: '33',
    lgdNumericCode: '033',
    isoCode: 'TN',
    invitationCodePrefix: 'TN',
    legacyAliases: ['TN', 'STATE-TN', 'TAMIL NADU'],
  },
  {
    canonicalName: 'Telangana',
    lgdCode: '36',
    lgdNumericCode: '036',
    isoCode: 'TS',
    invitationCodePrefix: 'TG',
    legacyAliases: ['TG', 'STATE-TG', 'TS', 'STATE-TS', 'TELANGANA'],
  },
  {
    canonicalName: 'Tripura',
    lgdCode: '16',
    lgdNumericCode: '016',
    isoCode: 'TR',
    invitationCodePrefix: 'TR',
    legacyAliases: ['TR', 'STATE-TR', 'TRIPURA'],
  },
  {
    canonicalName: 'Uttar Pradesh',
    lgdCode: '09',
    lgdNumericCode: '009',
    isoCode: 'UP',
    invitationCodePrefix: 'UP',
    legacyAliases: ['UP', 'STATE-UP', 'UTTAR PRADESH'],
  },
  {
    canonicalName: 'Uttarakhand',
    lgdCode: '05',
    lgdNumericCode: '005',
    isoCode: 'UK',
    invitationCodePrefix: 'UK',
    legacyAliases: ['UK', 'STATE-UK', 'UTTARAKHAND'],
  },
  {
    canonicalName: 'West Bengal',
    lgdCode: '19',
    lgdNumericCode: '019',
    isoCode: 'WB',
    invitationCodePrefix: 'WB',
    legacyAliases: ['WB', 'STATE-WB', 'WEST BENGAL'],
  },
  {
    canonicalName: 'Andaman and Nicobar Islands',
    lgdCode: '35',
    lgdNumericCode: '035',
    isoCode: 'AN',
    invitationCodePrefix: 'AN',
    legacyAliases: ['AN', 'STATE-AN', 'ANDAMAN AND NICOBAR ISLANDS'],
  },
  {
    canonicalName: 'Chandigarh',
    lgdCode: '04',
    lgdNumericCode: '004',
    isoCode: 'CH',
    invitationCodePrefix: 'CH',
    legacyAliases: ['CH', 'STATE-CH', 'CHANDIGARH'],
  },
  {
    canonicalName: 'Dadra and Nagar Haveli and Daman and Diu',
    lgdCode: '38',
    lgdNumericCode: '038',
    isoCode: 'DD',
    invitationCodePrefix: 'DD',
    legacyAliases: ['DD', 'STATE-DD', 'DN', 'DNHDD', 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU'],
  },
  {
    canonicalName: 'Jammu and Kashmir',
    lgdCode: '01',
    lgdNumericCode: '001',
    isoCode: 'JK',
    invitationCodePrefix: 'JK',
    legacyAliases: ['JK', 'STATE-JK', 'JAMMU AND KASHMIR'],
  },
  {
    canonicalName: 'Ladakh',
    lgdCode: '37',
    lgdNumericCode: '037',
    isoCode: 'LA',
    invitationCodePrefix: 'LA',
    legacyAliases: ['LA', 'STATE-LA', 'LADAKH'],
  },
  {
    canonicalName: 'Lakshadweep',
    lgdCode: '31',
    lgdNumericCode: '031',
    isoCode: 'LD',
    invitationCodePrefix: 'LD',
    legacyAliases: ['LD', 'STATE-LD', 'LAKSHADWEEP'],
  },
  {
    canonicalName: 'Puducherry',
    lgdCode: '34',
    lgdNumericCode: '034',
    isoCode: 'PY',
    invitationCodePrefix: 'PY',
    legacyAliases: ['PY', 'STATE-PY', 'PUDUCHERRY'],
  },
] as const;

const ENTRY_BY_TOKEN = new Map<string, CanonicalStateCatalogEntry>();
const ENTRY_BY_LGD_NUMERIC = new Map<string, CanonicalStateCatalogEntry>();
for (const entry of STATE_CATALOG) {
  ENTRY_BY_TOKEN.set(entry.canonicalName.toUpperCase(), entry);
  ENTRY_BY_LGD_NUMERIC.set(entry.lgdNumericCode, entry);
  for (const alias of entry.legacyAliases) {
    ENTRY_BY_TOKEN.set(alias.toUpperCase(), entry);
  }
}

/**
 * Resolves a strict 3-digit LGD State/UT code (e.g. "027" -> Maharashtra)
 * to its canonical catalog entry. Returns null for non-3-digit or unrecognised codes.
 */
export function resolveStateByLgdNumericCode(raw?: string | null): CanonicalStateCatalogEntry | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^\d{3}$/.test(trimmed)) return null;
  return ENTRY_BY_LGD_NUMERIC.get(trimmed) || null;
}

/**
 * Strictly resolves a valid State/UT name or known abbreviation/alias to its canonical catalog entry.
 * Returns null if the input does not belong to the canonical 36-State/UT catalog.
 */
export function resolveCanonicalStateEntry(raw?: string | null): CanonicalStateCatalogEntry | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return ENTRY_BY_TOKEN.get(trimmed.toUpperCase()) || null;
}

/**
 * Exports all additive state code tokens mapped to canonical Title Case names
 * for reuse in stateNormalization.ts while preserving every legacy stored ID.
 */
export function buildCanonicalStateCodeMap(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of STATE_CATALOG) {
    for (const alias of entry.legacyAliases) {
      if (alias.toUpperCase() !== entry.canonicalName.toUpperCase()) {
        result[alias.toUpperCase()] = entry.canonicalName;
      }
    }
  }
  return result;
}
