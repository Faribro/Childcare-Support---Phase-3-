/**
 * Official ART Regimen Catalogue for Child Nutrition & Support Platform
 *
 * Source:
 *   National AIDS Control Organisation (NACO), Ministry of Health and Family Welfare,
 *   Government of India - National Guidelines for HIV Care and Treatment (2021 & 2023 Updates)
 *   World Health Organization (WHO) Consolidated Guidelines on HIV Prevention, Testing,
 *   Treatment, Service Delivery & Monitoring (Pediatric & Adolescent ARV Regimens)
 *
 * Version: NACO-ART-2023.1
 *
 * This catalogue documents prescribed treatment regimens for field casework.
 * It is NOT a clinical recommendation or prescribing engine.
 */

export interface ARTRegimen {
  code: string;
  name: string;
  abbreviations: string[];
  line:
    | 'First-line'
    | 'First-line Pediatric'
    | 'First-line Legacy'
    | 'First-line Alternative'
    | 'Second-line'
    | 'Third-line / Salvage'
    | 'Other'
    | 'Unknown';
  description: string;
  targetPopulation: string;
  searchTokens: string[];
}

export const REGIMEN_CATALOGUE_METADATA = {
  authority: 'National AIDS Control Organisation (NACO) / WHO',
  guidelineTitle: 'NACO National Guidelines for HIV Care and Treatment',
  version: 'NACO-ART-2023.1',
  effectiveDate: '2023-06-01',
  offlineAvailable: true,
} as const;

export const NACO_ART_REGIMEN_CATALOGUE: readonly ARTRegimen[] = [
  {
    code: 'TLD',
    name: 'TLD (Tenofovir 300mg + Lamivudine 300mg + Dolutegravir 50mg)',
    abbreviations: ['TLD', 'TDF+3TC+DTG', 'TDF/3TC/DTG'],
    line: 'First-line',
    description: 'Preferred 1st-line fixed-dose combination tablet for adolescents (≥30kg) and adults',
    targetPopulation: 'Adolescents (≥30 kg) and Adults',
    searchTokens: ['tld', 'tenofovir', 'lamivudine', 'dolutegravir', 'tdf', '3tc', 'dtg', 'first-line'],
  },
  {
    code: 'pDTG_ABC_3TC',
    name: 'pDTG + ABC + 3TC (Abacavir 120mg + Lamivudine 60mg + Dolutegravir 10mg dispersible)',
    abbreviations: ['pDTG', 'ABC+3TC+DTG', 'pDTG+ABC+3TC', 'ABC/3TC/DTG'],
    line: 'First-line Pediatric',
    description: 'Preferred 1st-line pediatric regimen with dispersible DTG 10mg scored tablets',
    targetPopulation: 'Infants & Children (weight 3 kg to <30 kg, age ≥4 weeks)',
    searchTokens: ['pdtg', 'pediatric', 'abacavir', 'lamivudine', 'dolutegravir', 'abc', '3tc', 'dtg', 'dispersible'],
  },
  {
    code: 'ABC_3TC_LPVr',
    name: 'ABC + 3TC + LPV/r (Abacavir + Lamivudine + Lopinavir/ritonavir pellets/syrup/tablets)',
    abbreviations: ['ABC+3TC+LPV/r', 'LPV/r', 'Kaletra', 'Pellets'],
    line: 'First-line Pediatric',
    description: 'Alternative 1st-line pediatric regimen (children with intolerance or contraindication to DTG)',
    targetPopulation: 'Pediatric (alternative for infants/children)',
    searchTokens: ['abc', '3tc', 'lpv/r', 'lpvr', 'lopinavir', 'ritonavir', 'pellets', 'kaletra', 'abacavir', 'lamivudine'],
  },
  {
    code: 'AZT_3TC_NVP',
    name: 'AZT + 3TC + NVP (Zidovudine + Lamivudine + Nevirapine)',
    abbreviations: ['AZT+3TC+NVP', 'ZDV+3TC+NVP'],
    line: 'First-line Legacy',
    description: 'Legacy 1st-line pediatric fixed dose combination (transitioning to DTG-based regimens)',
    targetPopulation: 'Children on established legacy maintenance therapy',
    searchTokens: ['azt', 'zdv', '3tc', 'nvp', 'zidovudine', 'lamivudine', 'nevirapine', 'legacy'],
  },
  {
    code: 'AZT_3TC_EFV',
    name: 'AZT + 3TC + EFV (Zidovudine + Lamivudine + Efavirenz)',
    abbreviations: ['AZT+3TC+EFV', 'ZDV+3TC+EFV'],
    line: 'First-line Legacy',
    description: 'Legacy 1st-line regimen (children ≥3 years or where DTG is unavailable)',
    targetPopulation: 'Children ≥3 years / maintenance',
    searchTokens: ['azt', '3tc', 'efv', 'zidovudine', 'lamivudine', 'efavirenz'],
  },
  {
    code: 'ABC_3TC_EFV',
    name: 'ABC + 3TC + EFV (Abacavir + Lamivudine + Efavirenz)',
    abbreviations: ['ABC+3TC+EFV'],
    line: 'First-line Alternative',
    description: 'Alternative 1st-line pediatric regimen for children ≥3 years (>10kg)',
    targetPopulation: 'Children ≥3 years / >10 kg',
    searchTokens: ['abc', '3tc', 'efv', 'abacavir', 'lamivudine', 'efavirenz'],
  },
  {
    code: 'TLE',
    name: 'TLE (Tenofovir 300mg + Lamivudine 300mg + Efavirenz 400/600mg)',
    abbreviations: ['TLE', 'TDF+3TC+EFV'],
    line: 'First-line Legacy',
    description: 'Legacy adult / older adolescent 1st-line regimen',
    targetPopulation: 'Older adolescents / Adults',
    searchTokens: ['tle', 'tenofovir', 'lamivudine', 'efavirenz', 'tdf', '3tc', 'efv'],
  },
  {
    code: 'TAFD',
    name: 'TAFD (Tenofovir Alafenamide + Lamivudine + Dolutegravir)',
    abbreviations: ['TAFD', 'TAF+3TC+DTG'],
    line: 'First-line Alternative',
    description: 'Special indication 1st-line alternative for established renal impairment or bone disease',
    targetPopulation: 'Patients with renal dysfunction or osteopenia',
    searchTokens: ['tafd', 'taf', '3tc', 'dtg', 'tenofovir alafenamide', 'dolutegravir'],
  },
  {
    code: 'AZT_3TC_ATVr',
    name: 'AZT + 3TC + ATV/r (Zidovudine + Lamivudine + Atazanavir/ritonavir)',
    abbreviations: ['AZT+3TC+ATV/r', 'ATV/r based', '2nd line ATV/r'],
    line: 'Second-line',
    description: 'Standard 2nd-line protease inhibitor regimen following 1st-line failure with TDF',
    targetPopulation: 'Patients on confirmed second-line therapy',
    searchTokens: ['azt', '3tc', 'atv/r', 'atvr', 'atazanavir', 'ritonavir', 'second-line', '2nd line'],
  },
  {
    code: 'TDF_3TC_ATVr',
    name: 'TDF + 3TC + ATV/r (Tenofovir + Lamivudine + Atazanavir/ritonavir)',
    abbreviations: ['TDF+3TC+ATV/r'],
    line: 'Second-line',
    description: 'Alternative 2nd-line protease inhibitor regimen following AZT-based 1st-line failure',
    targetPopulation: 'Patients on second-line therapy with AZT resistance',
    searchTokens: ['tdf', '3tc', 'atv/r', 'atazanavir', 'ritonavir', 'second-line'],
  },
  {
    code: 'TDF_3TC_LPVr',
    name: 'TDF + 3TC + LPV/r (Tenofovir + Lamivudine + Lopinavir/ritonavir)',
    abbreviations: ['TDF+3TC+LPV/r'],
    line: 'Second-line',
    description: 'Second-line protease inhibitor regimen for adolescents and adults',
    targetPopulation: 'Adolescents & Adults on second-line PI therapy',
    searchTokens: ['tdf', '3tc', 'lpv/r', 'lopinavir', 'ritonavir', 'second-line'],
  },
  {
    code: 'THIRD_LINE_DRVr',
    name: 'Third-line / Salvage Regimen (DRV/r + DTG ± optimized NRTIs)',
    abbreviations: ['DRV/r based', 'Third-line', 'Salvage'],
    line: 'Third-line / Salvage',
    description: 'Third-line expert-committee-approved salvage regimen (Darunavir/ritonavir + Dolutegravir)',
    targetPopulation: 'Patients with multi-class drug resistance',
    searchTokens: ['third-line', 'salvage', 'drv/r', 'darunavir', 'ritonavir', 'dtg', 'resistance'],
  },
  {
    code: 'OTHER',
    name: 'Other — specify',
    abbreviations: ['Other', 'Custom'],
    line: 'Other',
    description: 'Regimen not listed in standard catalogue (requires explicit specification)',
    targetPopulation: 'Non-standard, clinical trial, or specialized regimens',
    searchTokens: ['other', 'specify', 'custom', 'special'],
  },
  {
    code: 'UNKNOWN',
    name: 'Unknown / Not available',
    abbreviations: ['Unknown', 'N/A', 'Pending Record'],
    line: 'Unknown',
    description: 'Documentation of prescribed regimen is pending verification from ART centre green card',
    targetPopulation: 'Beneficiaries whose regimen record is pending confirmation',
    searchTokens: ['unknown', 'not available', 'pending', 'na', 'unspecified'],
  },
] as const;

/**
 * Search the catalogue by substring matching against name, abbreviation,
 * code, line, or search tokens.
 */
export function searchRegimens(query: string): ARTRegimen[] {
  const clean = (query || '').trim().toLowerCase();
  if (!clean) {
    return [...NACO_ART_REGIMEN_CATALOGUE];
  }

  return NACO_ART_REGIMEN_CATALOGUE.filter((regimen) => {
    if (regimen.name.toLowerCase().includes(clean)) return true;
    if (regimen.code.toLowerCase().includes(clean)) return true;
    if (regimen.description.toLowerCase().includes(clean)) return true;
    if (regimen.line.toLowerCase().includes(clean)) return true;
    if (regimen.abbreviations.some((abbr) => abbr.toLowerCase().includes(clean))) return true;
    if (regimen.searchTokens.some((tok) => tok.includes(clean))) return true;
    return false;
  });
}

/**
 * Locate a catalogue regimen by its exact code, abbreviation, or name.
 */
export function findRegimenByCodeOrName(value?: string): ARTRegimen | undefined {
  if (!value) return undefined;
  const clean = value.trim().toLowerCase();

  return NACO_ART_REGIMEN_CATALOGUE.find((regimen) => {
    if (regimen.code.toLowerCase() === clean) return true;
    if (regimen.name.toLowerCase() === clean) return true;
    if (regimen.abbreviations.some((abbr) => abbr.toLowerCase() === clean)) return true;
    return false;
  });
}

/**
 * Human-readable format of an ART regimen suitable for screen readers and UI badges.
 */
export function formatRegimenDisplay(regimen: ARTRegimen): string {
  const primaryAbbr = regimen.abbreviations[0];
  if (regimen.code === 'OTHER' || regimen.code === 'UNKNOWN') {
    return regimen.name;
  }
  return `${primaryAbbr} (${regimen.line})`;
}
