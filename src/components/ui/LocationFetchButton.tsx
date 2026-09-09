'use client';

import React, { useState, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Navigation, MapPin } from 'lucide-react';

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
}

interface LocationFetchButtonProps {
  onLocationFetched: (result: LocationResult) => void;
  disabled?: boolean;
  className?: string;
}

type FetchStatus = 'idle' | 'requesting' | 'geocoding' | 'success' | 'error';

// Canonical Indian state name normalisation map
const STATE_NORMALISE: Record<string, string> = {
  'maharashtra': 'Maharashtra',
  'karnataka': 'Karnataka',
  'tamil nadu': 'Tamil Nadu',
  'tamilnadu': 'Tamil Nadu',
  'andhra pradesh': 'Andhra Pradesh',
  'telangana': 'Telangana',
  'kerala': 'Kerala',
  'gujarat': 'Gujarat',
  'rajasthan': 'Rajasthan',
  'madhya pradesh': 'Madhya Pradesh',
  'uttar pradesh': 'Uttar Pradesh',
  'west bengal': 'West Bengal',
  'bihar': 'Bihar',
  'odisha': 'Odisha',
  'orissa': 'Odisha',
  'punjab': 'Punjab',
  'haryana': 'Haryana',
  'jharkhand': 'Jharkhand',
  'chhattisgarh': 'Chhattisgarh',
  'assam': 'Assam',
  'uttarakhand': 'Uttarakhand',
  'himachal pradesh': 'Himachal Pradesh',
  'goa': 'Goa',
  'tripura': 'Tripura',
  'meghalaya': 'Meghalaya',
  'manipur': 'Manipur',
  'nagaland': 'Nagaland',
  'arunachal pradesh': 'Arunachal Pradesh',
  'mizoram': 'Mizoram',
  'sikkim': 'Sikkim',
  'delhi': 'Delhi',
  'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi',
  'jammu and kashmir': 'Jammu & Kashmir',
  'jammu & kashmir': 'Jammu & Kashmir',
  'ladakh': 'Ladakh',
  'chandigarh': 'Chandigarh',
  'puducherry': 'Puducherry',
  'pondicherry': 'Puducherry',
  'andaman and nicobar islands': 'Andaman & Nicobar Islands',
  'andaman & nicobar islands': 'Andaman & Nicobar Islands',
  'dadra and nagar haveli and daman and diu': 'Dadra & Nagar Haveli and Daman & Diu',
  'lakshadweep': 'Lakshadweep',
};

function normaliseState(raw: string): string {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  return STATE_NORMALISE[key] ?? raw.trim();
}

function cleanDistrict(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\s+(District|district|Division|division)$/, '').trim();
}

// ── 1. ESRI ArcGIS World Geocoder (High-Precision Parcel, Street & House Numbers in India) ──
async function reverseGeocodeWithEsri(lat: number, lng: number): Promise<any | null> {
  try {
    const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&featureTypes=PointAddress,Subaddress,StreetAddress,POI,StreetName&distance=100&f=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.address || null;
  } catch {
    return null;
  }
}

// ── 2. OpenStreetMap Nominatim (High-Accuracy Address Hierarchy, Landmarks & POIs) ──
async function reverseGeocodeWithNominatim(lat: number, lng: number): Promise<any | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=en&zoom=18&addressdetails=1&extratags=1&namedetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ChildCareSupportApp/3.0 (India HIV/AIDS Alliance)' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── 3. Photon Fallback ──
async function reverseGeocodeWithPhoton(lat: number, lng: number): Promise<LocationResult | null> {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.features?.[0]?.properties;
    if (!p) return null;

    const state = normaliseState(p.state || '');
    const district = cleanDistrict(p.county || p.district || p.city || '');
    const pincode = p.postcode || '';
    const locality = p.city || p.locality || '';
    const subLocality = p.locality || p.district || '';

    const parts: string[] = [];
    const houseStreet = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
    if (houseStreet) parts.push(houseStreet);
    if (p.locality && !parts.includes(p.locality)) parts.push(p.locality);
    if (p.district && !parts.includes(p.district)) parts.push(p.district);
    if (p.city && !parts.includes(p.city)) parts.push(p.city);
    if (pincode) parts.push(pincode);

    return {
      fullAddress: parts.join(', '),
      state,
      district,
      pincode,
      subLocality,
      locality,
    };
  } catch {
    return null;
  }
}

// ── 4. BigDataCloud Fallback ──
async function reverseGeocodeWithBDC(lat: number, lng: number): Promise<LocationResult | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();

    const state = normaliseState(data.principalSubdivision || data.countryName || '');
    const rawDistrict = data.city || data.locality || data.localityInfo?.administrative?.[3]?.name || '';
    const district = cleanDistrict(rawDistrict);
    const pincode = data.postcode || '';
    const locality = data.locality || data.city || '';
    const subLocality = data.localityInfo?.informative?.find(
      (i: { description: string; name: string }) => i.description === 'neighbourhood'
    )?.name || data.locality || '';

    const parts: string[] = [];
    if (subLocality) parts.push(subLocality);
    if (locality && locality !== subLocality) parts.push(locality);
    if (district && district !== locality) parts.push(district);
    if (pincode) parts.push(pincode);

    return {
      fullAddress: parts.join(', '),
      state,
      district: district || locality,
      pincode,
      subLocality,
      locality,
    };
  } catch {
    return null;
  }
}

// ── Multi-Source High-Precision Synthesizer ──
function synthesizeAddress(esriAddr: any, nomData: any): LocationResult | null {
  const e = esriAddr || {};
  const n = nomData?.address || {};

  // Extract house number / flat / plot
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

  // Extract landmark / building / society / commercial POI
  const rawLandmark =
    e.PlaceName ||
    n.house_name ||
    n.building ||
    n.amenity ||
    n.shop ||
    n.office ||
    '';

  // Extract street / road name
  const rawStreet =
    e.Address ||
    n.road ||
    n.street ||
    n.pedestrian ||
    n.footway ||
    '';

  // Extract block / sector
  const rawBlock =
    e.Block ||
    n.block ||
    n['addr:block'] ||
    '';

  // Extract colony / neighbourhood
  const rawColony =
    n.neighbourhood ||
    e.Sector ||
    n.subdivision ||
    n.quarter ||
    '';

  // Extract locality / suburb
  const rawSuburb =
    n.suburb ||
    e.District ||
    '';

  // Extract district & city
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

  // Extract state & pincode
  const state = normaliseState(e.Region || n.state || n.state_district || '');
  const district = cleanDistrict(rawDistrict);
  const pincode = e.Postal || n.postcode || '';

  if (!state && !district && !rawCity) return null;

  // Build ordered address components without duplication
  const parts: string[] = [];

  // 1. House / Flat / Plot Number
  if (rawHouseNum) {
    const formatted = /(house|flat|plot|h.no|door)/i.test(rawHouseNum)
      ? rawHouseNum
      : `House No. ${rawHouseNum}`;
    parts.push(formatted);
  } else if (rawLandmark && rawLandmark.toLowerCase() !== rawStreet.toLowerCase()) {
    parts.push(rawLandmark.startsWith('Near') ? rawLandmark : `Near ${rawLandmark}`);
  }

  // 2. Block
  if (rawBlock && !parts.some(p => p.toLowerCase().includes(rawBlock.toLowerCase()))) {
    parts.push(/(block|sector)/i.test(rawBlock) ? rawBlock : `Block ${rawBlock}`);
  }

  // 3. Street / Road (e.g. Kailash Market Road)
  if (rawStreet && !parts.some(p => p.toLowerCase().includes(rawStreet.toLowerCase()))) {
    parts.push(rawStreet);
  }

  // 4. Colony / Sector (e.g. Kailash Colony)
  if (rawColony && !parts.some(p => p.toLowerCase().includes(rawColony.toLowerCase()))) {
    parts.push(rawColony);
  }

  // 5. Suburb / Sub-locality (e.g. Greater Kailash)
  if (rawSuburb && !parts.some(p => p.toLowerCase().includes(rawSuburb.toLowerCase()))) {
    parts.push(rawSuburb);
  }

  // 6. City (e.g. Delhi / South Delhi)
  if (rawCity && !parts.some(p => p.toLowerCase().includes(rawCity.toLowerCase()))) {
    parts.push(rawCity);
  } else if (district && !parts.some(p => p.toLowerCase().includes(district.toLowerCase()))) {
    parts.push(district);
  }

  // 7. Pincode
  if (pincode && !parts.includes(pincode)) {
    parts.push(pincode);
  }

  let fullAddress = parts.join(', ');

  // If address has less than 2 parts, use clean display_name from Nominatim
  if (parts.length < 2 && nomData?.display_name) {
    const tokens = nomData.display_name.split(',').map((s: string) => s.trim()).filter(Boolean);
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
    subLocality: rawSuburb || rawColony,
    locality: rawCity || district,
    houseNumber: rawHouseNum,
    road: rawStreet,
    colony: rawColony,
  };
}

const STATUS_MSG: Record<FetchStatus, string> = {
  idle: 'Fetch Live Address',
  requesting: 'Getting GPS Coords…',
  geocoding: 'Pinpointing House & Street…',
  success: 'Accurate Address Located!',
  error: 'Retry GPS Fetch',
};

export function LocationFetchButton({ onLocationFetched, disabled, className }: LocationFetchButtonProps) {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locatedDetail, setLocatedDetail] = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    if (disabled) return;
    if (status === 'requesting' || status === 'geocoding') return;

    setErrorMsg('');
    setAccuracy(null);
    setLocatedDetail(null);
    setStatus('requesting');

    // ── 1. Request GPS with maximum hardware satellite accuracy ──
    let coords: GeolocationCoordinates;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      coords = pos.coords;
      const acc = Math.round(pos.coords.accuracy);
      setAccuracy(acc);
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      const msg =
        geoErr.code === 1
          ? 'Location access denied. Please allow location permissions in your browser.'
          : geoErr.code === 2
          ? 'GPS position unavailable. Try moving near a window or outdoors.'
          : 'GPS request timed out. Please try again.';
      setErrorMsg(msg);
      setStatus('error');
      return;
    }

    // ── 2. Multi-tier High-Precision Geocoding: ESRI + OSM Nominatim in parallel ──
    setStatus('geocoding');
    let result: LocationResult | null = null;

    try {
      const [esriRes, nomRes] = await Promise.allSettled([
        reverseGeocodeWithEsri(coords.latitude, coords.longitude),
        reverseGeocodeWithNominatim(coords.latitude, coords.longitude),
      ]);

      const esriData = esriRes.status === 'fulfilled' ? esriRes.value : null;
      const nomData = nomRes.status === 'fulfilled' ? nomRes.value : null;

      result = synthesizeAddress(esriData, nomData);
    } catch (e) {
      console.warn('Primary geocoding exception:', e);
    }

    // ── 3. Fallbacks if primary synthesis yielded insufficient data ──
    if (!result || !result.state) {
      result = await reverseGeocodeWithPhoton(coords.latitude, coords.longitude);
    }
    if (!result || !result.state) {
      result = await reverseGeocodeWithBDC(coords.latitude, coords.longitude);
    }

    if (!result || !result.state) {
      setErrorMsg('Could not detect address. Check internet connectivity.');
      setStatus('error');
      return;
    }

    // ── 4. Deliver result & show pinpointed detail toast ──
    onLocationFetched(result);
    setStatus('success');

    const detailText = result.houseNumber
      ? `House ${result.houseNumber}, ${result.road || result.colony || ''}`
      : result.road && result.colony
      ? `${result.road}, ${result.colony}`
      : result.colony || result.fullAddress.split(',')[0];

    setLocatedDetail(detailText);
    setTimeout(() => {
      setStatus('idle');
      setLocatedDetail(null);
    }, 6000);
  }, [disabled, onLocationFetched, status]);

  const isLoading = status === 'requesting' || status === 'geocoding';

  const bgClass =
    status === 'success'
      ? 'bg-emerald-600 border-emerald-700 text-white shadow-[0_0_16px_rgba(16,185,129,0.4)]'
      : status === 'error'
      ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
      : isLoading
      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-[0_0_16px_rgba(129,140,248,0.35)] animate-pulse'
      : 'bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border-indigo-300/90 text-indigo-950 hover:from-indigo-100 hover:to-purple-100 hover:border-indigo-400 hover:shadow-[0_0_14px_rgba(99,102,241,0.25)] active:scale-[0.98]';

  return (
    <div className={`w-full flex flex-col items-start gap-1 ${className || ''}`}>
      <button
        type="button"
        onClick={handleFetch}
        disabled={disabled || isLoading}
        title={
          status === 'success' && accuracy
            ? `GPS accuracy: ±${accuracy}m`
            : 'Pinpoint exact house, street, colony & city from live GPS'
        }
        className={`
          w-full h-11 px-3.5 rounded-xl border font-bold text-xs
          flex items-center justify-center gap-2
          transition-all duration-200 cursor-pointer select-none shadow-2xs
          ${bgClass}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : status === 'success' ? (
          <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
        ) : status === 'error' ? (
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
        ) : (
          <Navigation className="w-4 h-4 text-indigo-600 shrink-0" />
        )}
        <span>{STATUS_MSG[status]}</span>
      </button>

      {/* Accuracy & Pinpointed Location Micro Badge */}
      {status === 'success' && (
        <div className="w-full flex items-center justify-between px-1 text-[10px] text-emerald-800 font-semibold animate-fadeIn">
          <span className="truncate">✓ Located: {locatedDetail || 'Pinpoint address'}</span>
          {accuracy !== null && (
            <span className="shrink-0 bg-emerald-100/90 px-1.5 py-0.5 rounded font-mono text-[9.5px]">
              ±{accuracy}m
            </span>
          )}
        </div>
      )}

      {/* Error detail */}
      {status === 'error' && errorMsg && (
        <p className="text-[10.5px] text-rose-600 px-1 font-medium">{errorMsg}</p>
      )}
    </div>
  );
}
