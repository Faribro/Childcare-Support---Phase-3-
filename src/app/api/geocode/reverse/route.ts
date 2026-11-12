import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCanonicalState, getDistrictsForState } from '@/lib/constants/indianDistricts';
import { lookupPincodeAsync } from '@/lib/constants/pincodeDirectory';
import { resolveUserAccessScope } from '@/lib/server/authorisation';
import { buildRateLimitHeaders, checkUserAwareRateLimit } from '@/lib/server/rateLimit';

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

const GEOCODER_CONTACT_EMAIL = 'tech@allianceindia.org';
const GEOCODER_USER_AGENT = `ChildCareSupportPWA/3.0 (India HIV/AIDS Alliance; public health intake; contact: ${GEOCODER_CONTACT_EMAIL})`;

// ── In-Memory LRU Cache with 24h TTL (Resolution: ~110m / 3 decimal places) ──
interface CacheEntry {
  data: ReverseGeocodeResult;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 5000;

const GEOCODE_USER_RATE_LIMIT = 60; // 60 requests per minute per authenticated user
const GEOCODE_SHARED_IP_RATE_LIMIT = 240; // Higher shared-NAT ceiling for clinic/training Wi-Fi
const GEOCODE_WINDOW_MS = 60 * 1000;

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

async function applyExactPincodeEnrichment(
  pinCode: string,
  canonicalState: string,
  resolvedDistrict: string,
  talukMandalBlock: string
): Promise<{ state: string; district: string; taluk: string }> {
  let state = canonicalState;
  let district = resolvedDistrict;
  let taluk = talukMandalBlock;

  if (pinCode) {
    const postal = await lookupPincodeAsync(pinCode);
    if (postal) {
      if (!state && postal.state) state = postal.state;
      if (!district && postal.district) district = postal.district;
      if (!taluk && postal.taluk) taluk = postal.taluk;
    }
  }

  return { state, district, taluk };
}

// ── Provider 1: OpenStreetMap Nominatim with 2s Timeout ──
async function fetchNominatim(lat: number, lng: number, timeoutMs = 2000): Promise<ReverseGeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=en&zoom=18&addressdetails=1&extratags=1&email=${encodeURIComponent(GEOCODER_CONTACT_EMAIL)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': GEOCODER_USER_AGENT,
      'From': GEOCODER_CONTACT_EMAIL,
      'X-Contact': GEOCODER_CONTACT_EMAIL,
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

  let resolvedDistrict = rawDistrict;
  if (canonicalState) {
    const lgdDistricts = getDistrictsForState(canonicalState);
    const match = lgdDistricts.find((d) => d.toLowerCase() === rawDistrict.toLowerCase());
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

  const enriched = await applyExactPincodeEnrichment(pinCode, canonicalState, resolvedDistrict, talukMandalBlock);
  canonicalState = enriched.state;
  resolvedDistrict = enriched.district;
  talukMandalBlock = enriched.taluk;

  if (!canonicalState && !resolvedDistrict && !street && !villageCity) {
    throw new Error('Nominatim returned empty address components');
  }

  const parts = [
    doorAndColony,
    street,
    villageCity,
    talukMandalBlock,
    resolvedDistrict,
    canonicalState,
    pinCode ? `PIN: ${pinCode}` : '',
  ].filter(Boolean);

  return {
    doorAndColony,
    street,
    villageCity,
    talukMandalBlock,
    landmark,
    district: resolvedDistrict,
    state: canonicalState,
    pinCode,
    fullAddress: parts.join(', '),
    source: 'nominatim',
  };
}

// ── Provider 2: Komoot Photon with 2s Timeout ──
async function fetchPhoton(lat: number, lng: number, timeoutMs = 2000): Promise<ReverseGeocodeResult> {
  const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': GEOCODER_USER_AGENT,
      'From': GEOCODER_CONTACT_EMAIL,
      'X-Contact': GEOCODER_CONTACT_EMAIL,
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
    const match = lgdDistricts.find((d) => d.toLowerCase() === rawDistrict.toLowerCase());
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

  const enriched = await applyExactPincodeEnrichment(pinCode, canonicalState, resolvedDistrict, talukMandalBlock);
  canonicalState = enriched.state;
  resolvedDistrict = enriched.district;
  talukMandalBlock = enriched.taluk;

  if (!canonicalState && !resolvedDistrict && !street && !villageCity) {
    throw new Error('Photon returned empty address components');
  }

  const parts = [
    doorAndColony,
    street,
    villageCity,
    talukMandalBlock,
    resolvedDistrict,
    canonicalState,
    pinCode ? `PIN: ${pinCode}` : '',
  ].filter(Boolean);

  return {
    doorAndColony,
    street,
    villageCity,
    talukMandalBlock,
    landmark,
    district: resolvedDistrict,
    state: canonicalState,
    pinCode,
    fullAddress: parts.join(', '),
    source: 'photon',
  };
}

export async function POST(req: NextRequest) {
  const reqStart = Date.now();

  // ── User-Keyed + Shared-IP Rate Limiting ──
  const scope = await resolveUserAccessScope(req);
  const rl = checkUserAwareRateLimit({
    req,
    namespace: 'geocode_reverse',
    perUserLimit: GEOCODE_USER_RATE_LIMIT,
    sharedIpLimit: GEOCODE_SHARED_IP_RATE_LIMIT,
    windowMs: GEOCODE_WINDOW_MS,
    userId: scope.userId,
    isVerifiedUser: scope.isVerified,
  });
  const rateHeaders = buildRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      {
        success: false,
        fallback: true,
        manual: true,
        error: 'Rate limit exceeded. Please wait a minute or enter address details manually.',
      },
      { status: 429, headers: rateHeaders }
    );
  }

  // ── Coordinate Validation (Strict privacy: NO coordinates in logs) ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, fallback: true, manual: true, error: 'Invalid JSON request body' },
      { status: 400, headers: rateHeaders }
    );
  }

  const parsed = coordinateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, fallback: true, manual: true, error: 'Valid latitude and longitude numbers are required' },
      { status: 400, headers: rateHeaders }
    );
  }

  const { lat, lng } = parsed.data;

  // ── Cache Lookup: Coordinates rounded to 3 decimals (~110m resolution) ──
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    const totalMs = Date.now() - reqStart;
    console.info(`[GEOCODE:TIMING] provider=cache duration=0ms total=${totalMs}ms status=hit`);
    return NextResponse.json(
      {
        success: true,
        fallback: false,
        data: { ...cached.data, source: 'cache' },
        timings: {
          provider: 'cache',
          providerMs: 0,
          totalMs,
        },
      },
      { headers: rateHeaders }
    );
  }

  // ── Parallel Race with Promise.any and 2s timeout per provider ──
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
    console.info(
      `[GEOCODE:TIMING] winner=${winning.provider} providerMs=${winning.providerMs}ms totalMs=${totalMs}ms status=success`
    );

    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(cacheKey, { data: winning.result, expiresAt: now + CACHE_TTL_MS });

    return NextResponse.json(
      {
        success: true,
        fallback: false,
        data: winning.result,
        timings: {
          provider: winning.provider,
          providerMs: winning.providerMs,
          totalMs,
        },
      },
      { headers: rateHeaders }
    );
  } catch {
    // Graceful fallback: never block form completion if geocoding providers time out or block.
    const totalMs = Date.now() - reqStart;
    console.warn(`[GEOCODE:TIMING] all_providers_failed totalMs=${totalMs}ms fallback=manual`);
    return NextResponse.json(
      {
        success: false,
        fallback: true,
        manual: true,
        error: 'Live address lookup is currently unavailable. Please enter address fields manually.',
        timings: {
          provider: 'none',
          providerMs: Math.min(totalMs, 2000),
          totalMs,
        },
      },
      { status: 200, headers: rateHeaders }
    );
  }
}
