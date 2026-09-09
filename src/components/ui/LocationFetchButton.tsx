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

function formatDetailedAddress(addr: Record<string, string>, displayName?: string): string {
  const premises = [
    addr.house_number,
    addr.house_name,
    addr.building,
    addr.flats,
    addr.amenity,
    addr.shop,
    addr.office,
  ].filter(Boolean).join(' ');

  const street = [
    addr.road,
    addr.street,
    addr.pedestrian,
    addr.footway,
    addr.path,
    addr.residential,
    addr.subway,
  ].filter(Boolean)[0] || '';

  const localities = [
    addr.neighbourhood,
    addr.suburb,
    addr.quarter,
    addr.subdivision,
    addr.block,
    addr.sector,
    addr.colony,
    addr.hamlet,
  ].filter(Boolean);

  const city = addr.city || addr.town || addr.village || addr.city_district || addr.county || '';
  const postcode = addr.postcode || '';

  const parts: string[] = [];
  if (premises) parts.push(premises);
  if (street && !parts.some(p => p.toLowerCase().includes(street.toLowerCase()))) parts.push(street);
  for (const loc of localities) {
    if (!parts.some(p => p.toLowerCase().includes(loc.toLowerCase()))) parts.push(loc);
  }
  if (city && !parts.some(p => p.toLowerCase().includes(city.toLowerCase()))) parts.push(city);
  if (postcode && !parts.includes(postcode)) parts.push(postcode);

  let addressStr = parts.join(', ');

  // If addressStr is sparse but displayName is available, clean displayName:
  if (parts.length < 2 && displayName) {
    const tokens = displayName.split(',').map(s => s.trim()).filter(Boolean);
    if (tokens.length > 1 && tokens[tokens.length - 1].toLowerCase() === 'india') {
      tokens.pop();
    }
    addressStr = tokens.slice(0, 4).join(', ');
  }

  return addressStr;
}

// ── 1. OpenStreetMap Nominatim with zoom=18 & addressdetails=1 (Primary High-Accuracy) ──
async function reverseGeocodeWithNominatim(lat: number, lng: number): Promise<LocationResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=en&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ChildCareSupportApp/3.0 (India HIV/AIDS Alliance)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};

    const state = normaliseState(addr.state || addr.state_district || '');
    const rawDistrict = addr.state_district || addr.district || addr.county || addr.city || addr.town || '';
    const district = cleanDistrict(rawDistrict);
    const pincode = addr.postcode || '';
    const locality = addr.city || addr.town || addr.village || addr.city_district || addr.suburb || '';
    const subLocality = addr.suburb || addr.neighbourhood || addr.quarter || '';

    const fullAddress = formatDetailedAddress(addr, data.display_name);

    if (!fullAddress && !state) return null;

    return {
      fullAddress,
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

// ── 2. Photon (Komoot OSM High-Speed Fallback) ──
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

// ── 3. BigDataCloud Fallback ──
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

const STATUS_MSG: Record<FetchStatus, string> = {
  idle: 'Fetch Live Address',
  requesting: 'Getting GPS Coords…',
  geocoding: 'Locating House & Street…',
  success: 'Address Auto-Filled!',
  error: 'Retry GPS Fetch',
};

export function LocationFetchButton({ onLocationFetched, disabled, className }: LocationFetchButtonProps) {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const handleFetch = useCallback(async () => {
    if (disabled) return;
    if (status === 'requesting' || status === 'geocoding') return;

    setErrorMsg('');
    setAccuracy(null);
    setStatus('requesting');

    // ── 1. Request GPS with high accuracy + 15s timeout ──
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
      setAccuracy(Math.round(pos.coords.accuracy));
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

    // ── 2. Reverse geocode: Nominatim (zoom=18) first, then Photon, then BigDataCloud ──
    setStatus('geocoding');
    let result = await reverseGeocodeWithNominatim(coords.latitude, coords.longitude);
    if (!result || !result.state) {
      result = await reverseGeocodeWithPhoton(coords.latitude, coords.longitude);
    }
    if (!result || !result.state) {
      result = await reverseGeocodeWithBDC(coords.latitude, coords.longitude);
    }

    if (!result || !result.state) {
      setErrorMsg('Could not detect address. Check your internet connection.');
      setStatus('error');
      return;
    }

    // ── 3. Deliver result ──
    onLocationFetched(result);
    setStatus('success');
    setTimeout(() => setStatus('idle'), 5000);
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
            : 'Auto-fill house, street, district & state from live GPS'
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
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
        ) : (
          <span className="relative shrink-0 flex items-center justify-center">
            <Navigation className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="absolute -inset-1 rounded-full border border-indigo-400 animate-ping opacity-40 pointer-events-none" />
          </span>
        )}

        <span className="truncate">{STATUS_MSG[status]}</span>

        {status === 'success' && accuracy && (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-mono font-black shrink-0">
            ±{accuracy}m
          </span>
        )}
      </button>

      {status === 'error' && errorMsg && (
        <p className="text-[11px] text-rose-600 font-medium leading-snug flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </p>
      )}
    </div>
  );
}
