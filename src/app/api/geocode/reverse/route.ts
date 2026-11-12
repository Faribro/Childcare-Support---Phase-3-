import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCanonicalState, getDistrictsForState, isValidDistrictForState } from '@/lib/constants/indianDistricts';

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

// ── In-Memory LRU Cache with 24h TTL (Resolution: ~11m / 4 decimal places) ──
interface CacheEntry {
  data: ReverseGeocodeResult;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 2000;

// ── In-Memory Rate Limiting: 20 requests per minute per IP ──
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

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

// ── Primary: OpenStreetMap Nominatim ──
async function fetchNominatim(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=en&zoom=18&addressdetails=1&extratags=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ChildCareSupportPWA/3.0 (India HIV/AIDS Alliance; public health research)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(4500),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const addr = json?.address || {};

  const rawState = addr.state || addr.state_district || '';
  const canonicalState = getCanonicalState(rawState) || rawState;
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
  const talukMandalBlock = addr.county || addr.subdistrict || addr.tehsil || addr.block || '';
  const rawLandmark = addr.amenity || addr.building || addr.place_of_worship || addr.shop || '';
  const landmark = rawLandmark ? formatLandmarkNear(rawLandmark) : '';
  const pinCode = /^[1-9][0-9]{5}$/.test(addr.postcode || '') ? addr.postcode : '';

  const parts = [doorAndColony, street, villageCity, talukMandalBlock, resolvedDistrict, canonicalState, pinCode].filter(Boolean);
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

// ── Fallback: Komoot Photon (OSM-based Elasticsearch) ──
async function fetchPhoton(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ChildCareSupportPWA/3.0 (India HIV/AIDS Alliance)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(4500),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const props = json?.features?.[0]?.properties || {};

  const rawState = props.state || '';
  const canonicalState = getCanonicalState(rawState) || rawState;
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
  const talukMandalBlock = '';
  const landmark = props.name && props.name !== street ? formatLandmarkNear(props.name) : '';
  const pinCode = /^[1-9][0-9]{5}$/.test(props.postcode || '') ? props.postcode : '';

  const parts = [doorAndColony, street, villageCity, resolvedDistrict, canonicalState, pinCode].filter(Boolean);
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
  // ── Rate Limiting (20 req / min per IP) ──
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                   req.headers.get('x-real-ip') ||
                   '127.0.0.1';

  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a minute before fetching location again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // ── Coordinate Validation (NO Coordinate Logging for Privacy) ──
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

  // ── Cache Lookup: Resolution ~11m (4 decimal places) ──
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ success: true, data: { ...cached.data, source: 'cache' } });
  }

  // ── Query Primary Service: Nominatim ──
  let result: ReverseGeocodeResult | null = null;
  try {
    result = await fetchNominatim(lat, lng);
  } catch {
    // Failover silently to fallback without logging coordinates
  }

  // ── Query Fallback Service: Photon ──
  if (!result || !result.state) {
    try {
      result = await fetchPhoton(lat, lng);
    } catch {
      // Primary and fallback both failed
    }
  }

  if (!result || !result.state) {
    return NextResponse.json(
      { error: 'Unable to resolve address from coordinates. Please enter your address details manually.' },
      { status: 404 }
    );
  }

  // ── Store in LRU Cache ──
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });

  return NextResponse.json({ success: true, data: result });
}
