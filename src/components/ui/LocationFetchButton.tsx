'use client';

import React, { useState, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Navigation } from 'lucide-react';

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

// ── GPS Acquisition with Satellite Lock Filtering ──
// Uses watchPosition so the browser GNSS receiver has time to acquire
// true high-accuracy satellite lock (<= 15m) instead of snapping to a coarse cell/ISP fix.
async function acquireHighPrecisionGps(timeoutMs = 10000, targetAccuracy = 15): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser.');
  }

  return new Promise<GeolocationPosition>((resolve, reject) => {
    let bestPos: GeolocationPosition | null = null;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    timer = setTimeout(() => {
      cleanup();
      if (bestPos) {
        resolve(bestPos);
      } else {
        // Fallback: Attempt single direct fix before giving up
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
        );
      }
    }, timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
            bestPos = pos;
          }
          // High-precision threshold reached (e.g. <= 15m) -> resolve immediately
          if (pos.coords.accuracy <= targetAccuracy) {
            cleanup();
            resolve(pos);
          }
        },
        (err) => {
          if (bestPos) {
            cleanup();
            resolve(bestPos);
          } else {
            cleanup();
            reject(err);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
        }
      );
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

// ── 1. Optional Self-Hosted Open-Source Geocoder (Photon / Pelias / Traccar / Addok Docker) ──
async function reverseGeocodeWithSelfHosted(lat: number, lng: number): Promise<any | null> {
  const localEndpoint = process.env.NEXT_PUBLIC_GEOCODER_URL || process.env.NEXT_PUBLIC_LOCAL_GEOCODER_URL;
  if (!localEndpoint) return null;

  try {
    const url = `${localEndpoint.replace(/\/+$/, '')}/reverse?lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── 2. Photon Public API (Komoot / Elasticsearch OSM Reverse Geocoder down to house numbers) ──
async function reverseGeocodeWithPhoton(lat: number, lng: number): Promise<any | null> {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ChildCareSupportPWA/3.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.features?.[0]?.properties || null;
  } catch {
    return null;
  }
}

// ── 3. OpenStreetMap Nominatim (High-Accuracy Address Hierarchy, Landmarks & POIs) ──
async function reverseGeocodeWithNominatim(lat: number, lng: number): Promise<any | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=en&zoom=18&addressdetails=1&extratags=1&namedetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ChildCareSupportPWA/3.0 (India HIV/AIDS Alliance; public health assessment)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── 4. ESRI ArcGIS World Geocoder (Building Footprints, POIs, Subaddresses & Street Names) ──
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

// ── 5. BigDataCloud Fallback (Reliable Global Locality Hierarchy) ──
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

// ── Multi-Source High-Precision Synthesizer (Photon + Nominatim + ESRI) ──
function synthesizeAddress(esriAddr: any, nomData: any, photonProps: any): LocationResult | null {
  const e = esriAddr || {};
  const n = nomData?.address || {};
  const p = photonProps || {};

  // Extract house / flat / plot number
  const rawHouseNum =
    e.AddNum ||
    e.StrucDet ||
    n.house_number ||
    n['addr:housenumber'] ||
    p.housenumber ||
    n['addr:flats'] ||
    n['addr:unit'] ||
    n['addr:door_number'] ||
    n['addr:plot_number'] ||
    '';

  // Extract landmark / building / society / POI
  const rawLandmark =
    p.name ||
    e.PlaceName ||
    n.building ||
    n.house_name ||
    n.amenity ||
    n.shop ||
    n.office ||
    '';

  // Extract street / road name
  const rawStreet =
    n.road ||
    n.street ||
    p.street ||
    e.Address ||
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
    p.locality ||
    e.Sector ||
    n.subdivision ||
    n.quarter ||
    '';

  // Extract suburb / sub-locality
  const rawSuburb =
    n.suburb ||
    p.district ||
    e.District ||
    '';

  // Extract city & district
  const rawCity =
    p.city ||
    e.City ||
    n.city ||
    n.town ||
    n.village ||
    n.city_district ||
    '';

  const rawDistrict =
    e.Subregion ||
    p.district ||
    n.state_district ||
    n.district ||
    rawCity ||
    '';

  // Extract state & pincode
  const rawState = p.state || e.Region || n.state || n.state_district || '';
  const state = normaliseState(rawState);
  const district = cleanDistrict(rawDistrict);
  const pincode = p.postcode || e.Postal || n.postcode || '';

  if (!state && !district && !rawCity) return null;

  // Build ordered address components without duplication
  const parts: string[] = [];

  // 1. House / Flat / Plot Number
  if (rawHouseNum) {
    const formatted = /(house|flat|plot|h.no|door)/i.test(rawHouseNum)
      ? rawHouseNum
      : `House No. ${rawHouseNum}`;
    parts.push(formatted);
  }

  // 2. Specific Building / Society / Landmark
  if (rawLandmark && rawLandmark.toLowerCase() !== rawStreet.toLowerCase() && !parts.includes(rawLandmark)) {
    parts.push(rawLandmark);
  }

  // 3. Block / Sector
  if (rawBlock && !parts.some((pt) => pt.toLowerCase().includes(rawBlock.toLowerCase()))) {
    parts.push(/(block|sector)/i.test(rawBlock) ? rawBlock : `Block ${rawBlock}`);
  }

  // 4. Street / Road (e.g. O.P. Sharda Marg)
  if (rawStreet && !parts.some((pt) => pt.toLowerCase().includes(rawStreet.toLowerCase()))) {
    parts.push(rawStreet);
  }

  // 5. Colony / Sector / Neighbourhood (e.g. Greater Kailash I)
  if (rawColony && !parts.some((pt) => pt.toLowerCase().includes(rawColony.toLowerCase()))) {
    parts.push(rawColony);
  }

  // 6. Suburb / Sub-locality (e.g. Greater Kailash)
  if (rawSuburb && !parts.some((pt) => pt.toLowerCase().includes(rawSuburb.toLowerCase()))) {
    parts.push(rawSuburb);
  }

  // 7. City / District (e.g. South Delhi)
  if (district && !parts.some((pt) => pt.toLowerCase().includes(district.toLowerCase()))) {
    parts.push(district);
  } else if (rawCity && !parts.some((pt) => pt.toLowerCase().includes(rawCity.toLowerCase()))) {
    parts.push(rawCity);
  }

  // 8. State
  if (state && !parts.some((pt) => pt.toLowerCase().includes(state.toLowerCase()))) {
    parts.push(state);
  }

  // 9. Pincode
  if (pincode && !parts.includes(pincode)) {
    parts.push(pincode);
  }

  let fullAddress = parts.join(', ');

  // Fallback to display_name if parts are too brief
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
  requesting: 'Acquiring Satellite GPS Fix…',
  geocoding: 'Pinpointing Exact Doorstep & Street…',
  success: 'Exact Address Located!',
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

    // ── 1. Acquire high-precision GPS via satellite lock filtering ──
    let coords: GeolocationCoordinates;
    try {
      const pos = await acquireHighPrecisionGps(10000, 15);
      coords = pos.coords;
      const acc = Math.round(pos.coords.accuracy);
      setAccuracy(acc);
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      const msg =
        geoErr.code === 1
          ? 'Location access denied. Please allow location permissions in your browser.'
          : geoErr.code === 2
          ? 'GPS position unavailable. Please ensure GPS/location services are enabled.'
          : 'GPS request timed out. Please try again with clear view of the sky.';
      setErrorMsg(msg);
      setStatus('error');
      return;
    }

    // ── 2. Multi-tier High-Precision Geocoding in parallel (Photon + Nominatim + ESRI) ──
    setStatus('geocoding');
    let result: LocationResult | null = null;

    try {
      const [selfHostedRes, photonRes, nomRes, esriRes] = await Promise.allSettled([
        reverseGeocodeWithSelfHosted(coords.latitude, coords.longitude),
        reverseGeocodeWithPhoton(coords.latitude, coords.longitude),
        reverseGeocodeWithNominatim(coords.latitude, coords.longitude),
        reverseGeocodeWithEsri(coords.latitude, coords.longitude),
      ]);

      const selfData = selfHostedRes.status === 'fulfilled' ? selfHostedRes.value : null;
      const photonData = photonRes.status === 'fulfilled' ? photonRes.value : (selfData?.features?.[0]?.properties || null);
      const nomData = nomRes.status === 'fulfilled' ? nomRes.value : (selfData?.address ? selfData : null);
      const esriData = esriRes.status === 'fulfilled' ? esriRes.value : null;

      result = synthesizeAddress(esriData, nomData, photonData);
      if (result) {
        result.lat = coords.latitude;
        result.lng = coords.longitude;
        result.accuracyMeters = accuracy !== null ? accuracy : undefined;
      }
    } catch (e) {
      console.warn('Geocoding synthesis error:', e);
    }

    // ── 3. Fallback to BigDataCloud if primary engines yielded no state ──
    if (!result || !result.state) {
      result = await reverseGeocodeWithBDC(coords.latitude, coords.longitude);
      if (result) {
        result.lat = coords.latitude;
        result.lng = coords.longitude;
        result.accuracyMeters = accuracy !== null ? accuracy : undefined;
      }
    }

    if (!result || !result.state) {
      setErrorMsg('Could not detect address. Please check your internet connectivity and try again.');
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
    }, 8000);
  }, [disabled, onLocationFetched, status, accuracy]);

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
    <div className={`w-full flex flex-col items-start gap-1.5 ${className || ''}`}>
      <div className="w-full flex items-stretch">
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
            w-full h-11 px-4 rounded-xl border font-bold text-xs
            flex items-center justify-center gap-2
            transition-all duration-200 cursor-pointer select-none shadow-2xs
            ${bgClass}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-indigo-700" />
          ) : status === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
          ) : status === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          ) : (
            <Navigation className="w-4 h-4 text-indigo-600 shrink-0" />
          )}
          <span className="truncate">{STATUS_MSG[status]}</span>
        </button>
      </div>

      {/* Accuracy & Pinpointed Location Badge */}
      {status === 'success' && (
        <div className="w-full flex items-center justify-between px-1 text-[10.5px] text-emerald-800 font-semibold animate-fadeIn">
          <span className="truncate">✓ Located: {locatedDetail || 'Exact address'}</span>
          {accuracy !== null && (
            <span className="shrink-0 bg-emerald-100/90 px-1.5 py-0.5 rounded font-mono text-[9.5px]">
              ±{accuracy}m
            </span>
          )}
        </div>
      )}

      {/* Error detail with quick retry */}
      {status === 'error' && errorMsg && (
        <div className="w-full flex items-center justify-between px-1">
          <p className="text-[10.5px] text-rose-600 font-medium">{errorMsg}</p>
          <button
            type="button"
            onClick={handleFetch}
            className="text-[10.5px] font-bold text-indigo-700 hover:underline cursor-pointer ml-2 shrink-0"
          >
            Retry Now →
          </button>
        </div>
      )}
    </div>
  );
}
