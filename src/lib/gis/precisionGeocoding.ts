/**
 * High-Precision Geocoding & Address Synthesis Engine
 * Combines ESRI World Geocoder, OpenStreetMap Nominatim, and Indian administrative normalisation.
 */

export interface LocationResult {
  fullAddress: string;
  state: string;
  district: string;
  pincode: string;
  subLocality: string;
  locality: string;
  houseNumber?: string;
  road?: string;
  colony?: string;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
}

export interface AddressCandidate {
  label: string;
  address: string;
  lat: number;
  lng: number;
  score: number;
  district?: string;
  sector?: string;
  postal?: string;
}

const STATE_NORMALISE: Record<string, string> = {
  maharashtra: 'Maharashtra',
  karnataka: 'Karnataka',
  'tamil nadu': 'Tamil Nadu',
  tamilnadu: 'Tamil Nadu',
  'andhra pradesh': 'Andhra Pradesh',
  telangana: 'Telangana',
  kerala: 'Kerala',
  gujarat: 'Gujarat',
  rajasthan: 'Rajasthan',
  'madhya pradesh': 'Madhya Pradesh',
  'uttar pradesh': 'Uttar Pradesh',
  'west bengal': 'West Bengal',
  bihar: 'Bihar',
  odisha: 'Odisha',
  orissa: 'Odisha',
  punjab: 'Punjab',
  haryana: 'Haryana',
  jharkhand: 'Jharkhand',
  chhattisgarh: 'Chhattisgarh',
  assam: 'Assam',
  uttarakhand: 'Uttarakhand',
  'himachal pradesh': 'Himachal Pradesh',
  goa: 'Goa',
  tripura: 'Tripura',
  meghalaya: 'Meghalaya',
  manipur: 'Manipur',
  nagaland: 'Nagaland',
  'arunachal pradesh': 'Arunachal Pradesh',
  mizoram: 'Mizoram',
  sikkim: 'Sikkim',
  delhi: 'Delhi',
  'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi',
  'jammu and kashmir': 'Jammu & Kashmir',
  'jammu & kashmir': 'Jammu & Kashmir',
  ladakh: 'Ladakh',
  chandigarh: 'Chandigarh',
  puducherry: 'Puducherry',
  pondicherry: 'Puducherry',
  'andaman and nicobar islands': 'Andaman & Nicobar Islands',
  'dadra and nagar haveli and daman and diu': 'Dadra & Nagar Haveli and Daman & Diu',
  lakshadweep: 'Lakshadweep',
};

export function normaliseState(raw: string): string {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  return STATE_NORMALISE[key] ?? raw.trim();
}

export function cleanDistrict(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\s+(District|district|Division|division)$/, '').trim();
}

/** Search street / building / landmark candidates across India with ESRI World Geocoder */
export async function searchAddressCandidates(
  query: string,
  nearLat?: number,
  nearLng?: number
): Promise<AddressCandidate[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const q = query.trim();
    let url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(
      q
    )}&countryCode=IND&maxLocations=8&outFields=*&f=json`;

    if (nearLat && nearLng) {
      url += `&location=${nearLng},${nearLat}&distance=50000`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    const candidates = data.candidates || [];

    return candidates.map((c: any) => ({
      label: c.address || c.attributes?.Match_addr || '',
      address: c.attributes?.Match_addr || c.address || '',
      lat: c.location?.y,
      lng: c.location?.x,
      score: c.score || 0,
      district: c.attributes?.District || c.attributes?.Subregion || '',
      sector: c.attributes?.Sector || '',
      postal: c.attributes?.Postal || '',
    }));
  } catch (err) {
    console.warn('Address search error:', err);
    return [];
  }
}

/** Reverse geocode with ESRI World Geocoder */
export async function reverseGeocodeWithEsri(lat: number, lng: number): Promise<any | null> {
  try {
    const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&featureTypes=PointAddress,Subaddress,StreetAddress,POI,StreetName&distance=120&f=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.address || null;
  } catch {
    return null;
  }
}

/** Reverse geocode with OSM Nominatim */
export async function reverseGeocodeWithNominatim(lat: number, lng: number): Promise<any | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=en&zoom=18&addressdetails=1&extratags=1&namedetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ChildCareSupportApp/3.0 (India HIV/AIDS Alliance)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Multi-source address synthesis */
export function synthesizeAddress(
  esriAddr: any,
  nomData: any,
  overrideCoords?: { lat: number; lng: number }
): LocationResult | null {
  const e = esriAddr || {};
  const n = nomData?.address || {};

  const rawHouseNum =
    e.AddNum ||
    e.StrucDet ||
    n.house_number ||
    n['addr:housenumber'] ||
    n['addr:flats'] ||
    n['addr:unit'] ||
    n['addr:door_number'] ||
    n['addr:plot_number'] ||
    '';

  const cleanLandmark = (val: string | undefined | null): string => {
    if (!val) return '';
    const s = String(val).trim();
    if (/^(yes|no|true|false|building|apartments|house|residential|commercial|unnamed|undefined|null)$/i.test(s)) {
      return '';
    }
    return s;
  };

  const formatNear = (text: string): string => {
    const s = text.trim();
    if (!s) return '';
    if (/^(near|opp\b|opposite|behind|beside|adjacent to|next to|close to)\b/i.test(s)) {
      return s;
    }
    return `Near ${s}`;
  };

  const rawLandmark =
    cleanLandmark(e.PlaceName) ||
    cleanLandmark(n.amenity) ||
    cleanLandmark(n.building_name) ||
    cleanLandmark(n.place_of_worship) ||
    cleanLandmark(n.house_name) ||
    cleanLandmark(n.shop) ||
    cleanLandmark(n.office) ||
    cleanLandmark(n.building) ||
    cleanLandmark(nomData?.name) ||
    '';

  const rawStreet =
    e.Address ||
    e.StName ||
    n.road ||
    n.street ||
    n.pedestrian ||
    n.footway ||
    '';

  const rawBlock =
    e.Block ||
    n.block ||
    n['addr:block'] ||
    '';

  const rawColony =
    e.Sector ||
    n.neighbourhood ||
    n.subdivision ||
    n.quarter ||
    '';

  const rawSuburb =
    e.District ||
    n.suburb ||
    '';

  const rawCity =
    e.City ||
    n.city ||
    n.town ||
    n.village ||
    n.city_district ||
    '';

  const rawDistrict =
    e.Subregion ||
    n.state_district ||
    n.district ||
    rawCity ||
    '';

  const state = normaliseState(e.Region || n.state || n.state_district || '');
  const district = cleanDistrict(rawDistrict);
  const pincode = e.Postal || n.postcode || '';

  if (!state && !district && !rawCity) return null;

  const parts: string[] = [];

  // 1. Primary Anchor: Landmark (formatted with "Near ") or Street
  if (rawLandmark && rawLandmark.toLowerCase() !== rawStreet.toLowerCase()) {
    parts.push(formatNear(rawLandmark));
  } else if (rawHouseNum && rawStreet) {
    const formatted = /(house|flat|plot|h.no|door)/i.test(rawHouseNum)
      ? rawHouseNum
      : `House No. ${rawHouseNum}`;
    parts.push(formatNear(`${formatted}, ${rawStreet}`));
  } else if (rawStreet) {
    parts.push(formatNear(rawStreet));
  }

  // 2. Block
  if (rawBlock && !parts.some((p) => p.toLowerCase().includes(rawBlock.toLowerCase()))) {
    parts.push(/(block|sector)/i.test(rawBlock) ? rawBlock : `Block ${rawBlock}`);
  }

  // 3. Street / Gali / Road
  if (rawStreet && !parts.some((p) => p.toLowerCase().includes(rawStreet.toLowerCase()))) {
    parts.push(rawStreet);
  }

  // 4. Colony / Extension / Sector
  if (rawColony && !parts.some((p) => p.toLowerCase().includes(rawColony.toLowerCase()))) {
    parts.push(rawColony);
  }

  // 5. Suburb / Sub-locality
  if (rawSuburb && !parts.some((p) => p.toLowerCase().includes(rawSuburb.toLowerCase()))) {
    parts.push(rawSuburb);
  }

  // 6. District / City
  if (rawCity && !parts.some((p) => p.toLowerCase().includes(rawCity.toLowerCase()))) {
    parts.push(rawCity);
  } else if (district && !parts.some((p) => p.toLowerCase().includes(district.toLowerCase()))) {
    parts.push(district);
  }

  // 7. Pincode
  if (pincode && !parts.includes(pincode)) {
    parts.push(pincode);
  }

  let fullAddress = parts.join(', ');

  if (parts.length < 2 && nomData?.display_name) {
    const tokens = nomData.display_name
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (tokens.length > 1 && tokens[tokens.length - 1].toLowerCase() === 'india') {
      tokens.pop();
    }
    fullAddress = tokens.slice(0, 5).join(', ');
  }

  return {
    fullAddress,
    state,
    district: district || rawCity,
    pincode,
    subLocality: rawColony || rawSuburb,
    locality: rawSuburb || rawCity || district,
    houseNumber: rawHouseNum,
    road: rawStreet,
    colony: rawColony,
    lat: overrideCoords?.lat || (e.Y ?? nomData?.lat ? Number(nomData.lat) : undefined),
    lng: overrideCoords?.lng || (e.X ?? nomData?.lon ? Number(nomData.lon) : undefined),
  };
}
