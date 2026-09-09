'use client';

import React, { useState, useCallback } from 'react';
import { MapPin, Loader2, CheckCircle2, AlertCircle, Navigation } from 'lucide-react';

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
}

type FetchStatus = 'idle' | 'requesting' | 'geocoding' | 'success' | 'error';

// Canonical Indian state name normalisation map
// Maps any variant returned by geocoders -> exact INDIAN_STATES_AND_UTS value
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
  const key = raw.trim().toLowerCase();
  return STATE_NORMALISE[key] ?? raw.trim();
}

// ── Reverse-geocoding via BigDataCloud (free, no key, structured India data) ──
async function reverseGeocodeWithBDC(lat: number, lng: number): Promise<LocationResult | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();

    const state   = normaliseState(data.principalSubdivision || data.countryName || '');
    const district = data.city || data.locality || data.localityInfo?.administrative?.[3]?.name || '';
    const pincode  = data.postcode || '';
    const locality = data.locality || data.city || '';
    const subLocality = data.localityInfo?.informative?.find(
      (i: { description: string; name: string }) => i.description === 'neighbourhood'
    )?.name || data.locality || '';

    // Build human-readable address from parts
    const parts: string[] = [];
    if (subLocality && subLocality !== locality) parts.push(subLocality);
    if (locality) parts.push(locality);
    if (district && district !== locality) parts.push(district);
    if (state) parts.push(state);
    if (pincode) parts.push(pincode);

    return {
      fullAddress: parts.slice(0, 3).join(', '),
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

// ── Fallback: OpenStreetMap Nominatim ─────────────────────────────────────────
async function reverseGeocodeWithNominatim(lat: number, lng: number): Promise<LocationResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en&zoom=14`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ChildNutritionSupportPWA/3.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};

    const state    = normaliseState(addr.state || addr.state_district || '');
    const district = addr.county || addr.district || addr.city || addr.town || addr.village || '';
    const pincode  = addr.postcode || '';
    const subLocality = addr.suburb || addr.neighbourhood || addr.hamlet || '';
    const locality    = addr.city || addr.town || addr.village || addr.county || '';

    const parts: string[] = [];
    const houseRoad = [addr.house_number, addr.road].filter(Boolean).join(' ');
    if (houseRoad) parts.push(houseRoad);
    if (subLocality) parts.push(subLocality);
    if (locality && locality !== district) parts.push(locality);

    return {
      fullAddress: parts.slice(0, 3).join(', ') || data.display_name?.split(',').slice(0, 3).join(',') || '',
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

const STATUS_MSG: Record<FetchStatus, string> = {
  idle:      'Fetch Address',
  requesting:'Requesting GPS…',
  geocoding: 'Locating address…',
  success:   'Address Filled!',
  error:     'Retry',
};

export function LocationFetchButton({ onLocationFetched, disabled }: LocationFetchButtonProps) {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const handleFetch = useCallback(async () => {
    if (disabled) return;
    if (status === 'requesting' || status === 'geocoding') return;

    setErrorMsg('');
    setAccuracy(null);
    setStatus('requesting');

    // ── 1. Request GPS with high accuracy + 15s timeout ─────────────────────
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
          ? 'Location access denied. Please allow location in browser settings.'
          : geoErr.code === 2
          ? 'GPS signal unavailable. Try moving near a window.'
          : 'Location request timed out. Try again.';
      setErrorMsg(msg);
      setStatus('error');
      return;
    }

    // ── 2. Reverse geocode: BigDataCloud first, Nominatim fallback ────────────
    setStatus('geocoding');
    let result = await reverseGeocodeWithBDC(coords.latitude, coords.longitude);
    if (!result || !result.state) {
      result = await reverseGeocodeWithNominatim(coords.latitude, coords.longitude);
    }

    if (!result || !result.state) {
      setErrorMsg('Could not detect address. Check internet and try again.');
      setStatus('error');
      return;
    }

    // ── 3. Deliver result ─────────────────────────────────────────────────────
    onLocationFetched(result);
    setStatus('success');
    setTimeout(() => setStatus('idle'), 4000);
  }, [disabled, onLocationFetched, status]);

  const iconColor = status === 'success' ? 'text-emerald-600'
    : status === 'error' ? 'text-rose-600'
    : 'text-indigo-600';

  const bgClass = status === 'success'
    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-[0_0_14px_rgba(52,211,153,0.3)]'
    : status === 'error'
    ? 'bg-rose-50 border-rose-300 text-rose-800'
    : status === 'requesting' || status === 'geocoding'
    ? 'bg-indigo-50 border-indigo-300 text-indigo-800 shadow-[0_0_16px_rgba(129,140,248,0.35)] animate-pulse'
    : 'bg-white border-indigo-200 text-indigo-800 hover:bg-indigo-50 hover:border-indigo-400 hover:shadow-[0_0_16px_rgba(129,140,248,0.25)] active:scale-95';

  const isLoading = status === 'requesting' || status === 'geocoding';

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleFetch}
        disabled={disabled || isLoading}
        title={
          status === 'success' && accuracy
            ? `GPS accuracy: ±${accuracy}m`
            : 'Auto-fill address from your current location'
        }
        className={`
          inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border font-bold text-xs
          transition-all duration-200 cursor-pointer select-none
          ${bgClass}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {/* Icon */}
        {isLoading ? (
          <Loader2 className={`w-3.5 h-3.5 ${iconColor} animate-spin shrink-0`} />
        ) : status === 'success' ? (
          <CheckCircle2 className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
        ) : status === 'error' ? (
          <AlertCircle className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
        ) : (
          <span className="relative shrink-0">
            <Navigation className={`w-3.5 h-3.5 ${iconColor}`} />
            {/* Ripple ring on idle */}
            <span className="absolute inset-0 rounded-full border border-indigo-400 animate-ping opacity-40" />
          </span>
        )}

        <span className="whitespace-nowrap">{STATUS_MSG[status]}</span>

        {/* GPS accuracy badge on success */}
        {status === 'success' && accuracy && (
          <span className="ml-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-mono font-black">
            ±{accuracy}m
          </span>
        )}
      </button>

      {/* Error message */}
      {status === 'error' && errorMsg && (
        <p className="text-[11px] text-rose-600 font-medium max-w-[240px] leading-snug flex items-start gap-1">
          <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-rose-500" />
          {errorMsg}
        </p>
      )}
    </div>
  );
}