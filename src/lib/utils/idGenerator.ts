/**
 * Assessment Reference ID Auto-Generator
 * Generates unique non-stigmatising identifiers based on State, District, Date (Day), Time (Hour & Minute), and sequence series.
 * Example format: WB-KOL-081255-01 or MH-PUN-081255-01
 */

const STATE_CODES: Record<string, string> = {
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  Assam: 'AS',
  Bihar: 'BR',
  Chhattisgarh: 'CG',
  Goa: 'GA',
  Gujarat: 'GJ',
  Haryana: 'HR',
  'Himachal Pradesh': 'HP',
  Jharkhand: 'JH',
  Karnataka: 'KA',
  Kerala: 'KL',
  'Madhya Pradesh': 'MP',
  Maharashtra: 'MH',
  Manipur: 'MN',
  Meghalaya: 'ML',
  Mizoram: 'MZ',
  Nagaland: 'NL',
  Odisha: 'OD',
  Punjab: 'PB',
  Rajasthan: 'RJ',
  Sikkim: 'SK',
  'Tamil Nadu': 'TN',
  Telangana: 'TS',
  Tripura: 'TR',
  'Uttar Pradesh': 'UP',
  Uttarakhand: 'UK',
  'West Bengal': 'WB',
  'Andaman and Nicobar Islands': 'AN',
  Chandigarh: 'CH',
  'Dadra and Nagar Haveli and Daman and Diu': 'DD',
  Delhi: 'DL',
  'Jammu and Kashmir': 'JK',
  Ladakh: 'LA',
  Lakshadweep: 'LD',
  Puducherry: 'PY',
};

const DISTRICT_CODES: Record<string, string> = {
  Pune: 'PUN',
  'Mumbai Suburban': 'MUM',
  Mumbai: 'MUM',
  Thane: 'THN',
  Solapur: 'SOL',
  Nashik: 'NAS',
  Nagpur: 'NAG',
  Delhi: 'DEL',
  'New Delhi': 'NDL',
  Bengaluru: 'BLR',
  Chennai: 'CHN',
  Kolkata: 'KOL',
  Howrah: 'HWH',
  Hyderabad: 'HYD',
  Ahmedabad: 'AMD',
  Jaipur: 'JPR',
  Lucknow: 'LKO',
  Patna: 'PAT',
};

export function getStateCode(stateNameOrCode: string): string {
  if (!stateNameOrCode) return 'IN';
  const trimmed = stateNameOrCode.trim();
  if (STATE_CODES[trimmed]) return STATE_CODES[trimmed];
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return trimmed.replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase() || 'IN';
}

export function getDistrictCode(districtName: string): string {
  if (!districtName) return 'GEN';
  const trimmed = districtName.trim();
  if (DISTRICT_CODES[trimmed]) return DISTRICT_CODES[trimmed];
  if (trimmed.length === 3) return trimmed.toUpperCase();
  return trimmed.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'GEN';
}

export function generateAssessmentId(
  stateNameOrCode: string = 'MH',
  districtName: string = 'Pune',
  seriesIndex: number = 1
): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const series = String(seriesIndex).padStart(2, '0');

  const cleanState = getStateCode(stateNameOrCode);
  const districtCode = getDistrictCode(districtName);

  return `${cleanState}-${districtCode}-${day}${hours}${minutes}-${series}`;
}
