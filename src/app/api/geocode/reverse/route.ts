import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCanonicalState, getDistrictsForState } from '@/lib/constants/indianDistricts';
import { lookupPincode } from '@/lib/constants/pincodeDirectory';

export const dynamic = 'force-dynamic';

const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export interface ReverseGeocodeResult {
  doorAndColony: string;
  street: string;
  villageCity: string;
  talukMandalBlock: string;
  landmark: string;
  district: string;
  state: string;
  pinCode: string;
  fullAddress: string;
  source: 'cache' | 'nominatim' | 'photon';
}

export interface GeocodeTimings {
  provider: string;
  providerMs: number;
  totalMs: number;
}

// ── In-Memory LRU Cache with 24h TTL (Resolution: ~110m / 3 decimal places) ──
interface CacheEntry {
  data: ReverseGeocodeResult;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 5000;

// ── In-Memory Rate Limiting: 30 requests per minute per IP ──
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  entry.count++;
  return true;
}

function cleanDistrictName(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\s+(District|district|Division|division)$/i, '').trim();
}

function formatLandmarkNear(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/^(near|opp\b|opposite|behind|beside|adjacent to|next to)\b/i.test(s)) return s;
  return `Near ${s}`;
}

// ── Provider 1: OpenStreetMap Nominatim with 2s Timeout ──
async function fetchNominatim(lat: number, lng: number, timeoutMs = 2000): Promise<ReverseGeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=en&zoom=18&addressdetails=1&extratags=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ChildCareSupportPWA/3.0 (India HIV/AIDS Alliance; public health research)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  const json = await res.json();
  const addr = json?.address || {};

  const rawState = addr.state || addr.state_district || '';
  let canonicalState = getCanonicalState(rawState) || rawState;
  const rawDistrict = cleanDistrictName(addr.state_district || addr.district || addr.county || addr.city || '');
  
  // Resolve district against official LGD list if possible
  let resolvedDistrict = rawDistrict;
  if (canonicalState) {
    const lgdDistricts = getDistrictsForState(canonicalState);
    const match = lgdDistricts.find(d => d.toLowerCase() === rawDistrict.toLowerCase());
    if (match) resolvedDistrict = match;
  }

  const houseNumber = addr.house_number || addr['addr:housenumber'] || '';
  const colony = addr.neighbourhood || addr.suburb || addr.quarter || addr.residential || '';
  const doorAndColony = [houseNumber ? `House No. ${houseNumber}` : '', colony].filter(Boolean).join(', ');

  const street = addr.road || addr.street || addr.pedestrian || addr.footway || '';
  const villageCity = addr.village || addr.town || addr.city || addr.hamlet || '';
  let talukMandalBlock = addr.county || addr.subdistrict || addr.tehsil || addr.block || '';
  const rawLandmark = addr.amenity || addr.building || addr.place_of_worship || addr.shop || '';
  const landmark = rawLandmark ? formatLandmarkNear(rawLandmark) : '';
  const pinCode = /^[1-9][0-9]{5}$/.test(addr.postcode || '') ? addr.postcode : '';

  // Instant static postal lookup if pincode was resolved
  if (pinCode) {
    const postal = lookupPincode(pinCode);
    if (postal) {
      if (!canonicalState && postal.state) canonicalState = postal.state;
      if (!resolvedDistrict && postal.district) resolvedDistrict = postal.district;
      if (!talukMandalBlock && postal.taluk) talukMandalBlock = postal.taluk;
    }
  }

  if (!canonicalState && !resolvedDistrict && !street && !villageCity) {
    throw new Error('Nominatim returned empty address components');
  }

  const parts = [doorAndColony, street, villageCity, talukMandalBlock, resolvedDistrict, canonicalState, pinCode ? `PIN: ${pinCode}` : ''].filter(Boolean);
  const fullAddress = parts.join(', ');

  return {
    doorAndColony,
    street,
    villageCity,
    talukMandalBlock,
    landmark,
    district: resolvedDistrict,
    state: canonicalState,
    pinCode,
    fullAddress,
    source: 'nominatim',
  };
}

// ── Provider 2: Komoot Photon with 2s Timeout ──
async function fetchPhoton(lat: number, lng: number, timeoutMs = 2000): Promise<ReverseGeocodeResult> {
  const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ChildCareSupportPWA/3.0 (India HIV/AIDS Alliance)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Photon HTTP ${res.status}`);
  }
  const json = await res.json();
  const props = json?.features?.[0]?.properties || {};

  const rawState = props.state || '';
  let canonicalState = getCanonicalState(rawState) || rawState;
  const rawDistrict = cleanDistrictName(props.district || props.city || '');

  let resolvedDistrict = rawDistrict;
  if (canonicalState) {
    const lgdDistricts = getDistrictsForState(canonicalState);
    const match = lgdDistricts.find(d => d.toLowerCase() === rawDistrict.toLowerCase());
    if (match) resolvedDistrict = match;
  }

  const houseNumber = props.housenumber || '';
  const colony = props.locality || '';
  const doorAndColony = [houseNumber ? `House No. ${houseNumber}` : '', colony].filter(Boolean).join(', ');

  const street = props.street || '';
  const villageCity = props.city || props.town || '';
  let talukMandalBlock = '';
  const landmark = props.name && props.name !== street ? formatLandmarkNear(props.name) : '';
  const pinCode = /^[1-9][0-9]{5}$/.test(props.postcode || '') ? props.postcode : '';

  if (pinCode) {
    const postal = lookupPincode(pinCode);
    if (postal) {
      if (!canonicalState && postal.state) canonicalState = postal.state;
      if (!resolvedDistrict && postal.district) resolvedDistrict = postal.district;
      if (!talukMandalBlock && postal.taluk) talukMandalBlock = postal.taluk;
    }
  }

  if (!canonicalState && !resolvedDistrict && !street && !villageCity) {
    throw new Error('Photon returned empty address components');
  }

  const parts = [doorAndColony, street, villageCity, resolvedDistrict, canonicalState, pinCode ? `PIN: ${pinCode}` : ''].filter(Boolean);
  const fullAddress = parts.join(', ');

  return {
    doorAndColony,
    street,
    villageCity,
    talukMandalBlock,
    landmark,
    district: resolvedDistrict,
    state: canonicalState,
    pinCode,
    fullAddress,
    source: 'photon',
  };
}

export async function POST(req: NextRequest) {
  const reqStart = Date.now();

  // ── Rate Limiting ──
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                   req.headers.get('x-real-ip') ||
                   '127.0.0.1';

  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a minute before fetching location again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // ── Coordinate Validation (Strict privacy: NO coordinate coordinates in logs) ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = coordinateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid latitude and longitude numbers are required' }, { status: 400 });
  }

  const { lat, lng } = parsed.data;

  // ── 6. Cache Lookup: Coordinates rounded to 3 decimals (~110m resolution) ──
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    const totalMs = Date.now() - reqStart;
    console.info(`[GEOCODE:TIMING] provider=cache duration=0ms total=${totalMs}ms status=hit`);
    return NextResponse.json({
      success: true,
      data: { ...cached.data, source: 'cache' },
      timings: {
        provider: 'cache',
        providerMs: 0,
        totalMs,
      },
    });
  }

  // ── 2. Run providers in parallel with Promise.any and 2s timeout each ──
  interface TimedProviderResult {
    result: ReverseGeocodeResult;
    provider: 'nominatim' | 'photon';
    providerMs: number;
  }

  const runWithTiming = async (
    provider: 'nominatim' | 'photon',
    fn: (lat: number, lng: number, timeoutMs: number) => Promise<ReverseGeocodeResult>
  ): Promise<TimedProviderResult> => {
    const start = Date.now();
    const result = await fn(lat, lng, 2000);
    const providerMs = Date.now() - start;
    console.info(`[GEOCODE:TIMING] provider=${provider} duration=${providerMs}ms status=completed`);
    return { result, provider, providerMs };
  };

  try {
    const winning = await Promise.any([
      runWithTiming('nominatim', fetchNominatim),
      runWithTiming('photon', fetchPhoton),
    ]);

    const totalMs = Date.now() - reqStart;
    console.info(`[GEOCODE:TIMING] winner=${winning.provider} providerMs=${winning.providerMs}ms totalMs=${totalMs}ms status=success`);

    // Store in LRU Cache with 3-decimal key
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(cacheKey, { data: winning.result, expiresAt: now + CACHE_TTL_MS });

    return NextResponse.json({
      success: true,
      data: winning.result,
      timings: {
        provider: winning.provider,
        providerMs: winning.providerMs,
        totalMs,
      },
    });
  } catch (aggErr: any) {
    const totalMs = Date.now() - reqStart;
    console.warn(`[GEOCODE:TIMING] all_providers_failed totalMs=${totalMs}ms error=${aggErr?.message || 'timeout/network'}`);
    return NextResponse.json(
      {
        error: 'Unable to resolve address from coordinates under 2s limit. Please enter address details manually.',
        timings: {
          provider: 'none',
          providerMs: 2000,
          totalMs,
        },
      },
      { status: 504 }
    );
  }
}
