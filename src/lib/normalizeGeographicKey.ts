/**
 * Geographic key normalizer for robust state and district name matching
 * across GeoJSON boundary attributes and survey submissions.
 */

const GEOGRAPHIC_SUFFIXES = [
  'district',
  'city',
  'rural',
  'urban',
  'municipality',
  'corporation',
  'municipal',
  'nagar',
  'town',
  'taluk',
  'tehsil',
  'block',
  'division',
];

const SUFFIX_REGEXES = GEOGRAPHIC_SUFFIXES.map((suffix) => new RegExp(`\\s*${suffix}\\s*$`, 'gi'));
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]/g;

const normalizationCache = new Map<string, string>();

export function normalizeGeographicKey(input: string | null | undefined): string {
  if (!input) return '';

  const cached = normalizationCache.get(input);
  if (cached !== undefined) return cached;

  let normalized = input.toLowerCase().trim();

  // Remove all geographic suffixes using pre-compiled regexes
  for (let i = 0; i < SUFFIX_REGEXES.length; i++) {
    normalized = normalized.replace(SUFFIX_REGEXES[i], '');
  }

  // Strip ALL spaces, punctuation, and special characters
  normalized = normalized.replace(NON_ALPHANUMERIC_REGEX, '');

  normalizationCache.set(input, normalized);
  return normalized;
}
