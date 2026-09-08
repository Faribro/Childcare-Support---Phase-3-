/**
 * Assessment Reference ID Auto-Generator
 * Generates unique non-stigmatising identifiers based on State, District, Date (Day), Time (Hour & Minute), and sequence series.
 * Example format: MH-PUN-081255-01
 */

const DISTRICT_CODES: Record<string, string> = {
  Pune: 'PUN',
  'Mumbai Suburban': 'MUM',
  Thane: 'THN',
  Solapur: 'SOL',
  Nashik: 'NAS',
  Nagpur: 'NAG',
  Delhi: 'DEL',
  Bengaluru: 'BLR',
  Chennai: 'CHN',
  Kolkata: 'CCU',
};

export function getDistrictCode(districtName: string): string {
  if (!districtName) return 'GEN';
  if (DISTRICT_CODES[districtName]) return DISTRICT_CODES[districtName];
  // Take first 3 letters uppercase
  return districtName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'GEN';
}

export function generateAssessmentId(
  stateCode: string = 'MH',
  districtName: string = 'Pune',
  seriesIndex: number = 1
): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const series = String(seriesIndex).padStart(2, '0');

  const cleanState = (stateCode || 'MH').substring(0, 2).toUpperCase();
  const districtCode = getDistrictCode(districtName);

  return `${cleanState}-${districtCode}-${day}${hours}${minutes}-${series}`;
}
