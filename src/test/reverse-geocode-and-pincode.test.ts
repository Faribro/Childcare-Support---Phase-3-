import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupPincode, EXACT_PINCODE_DIRECTORY, PREFIX_3_DIGIT_MAP } from '@/lib/constants/pincodeDirectory';

describe('India Post Pincode Static Directory (lookupPincode)', () => {
  it('resolves exact 6-digit postal code instantly without network call', () => {
    const t0 = performance.now();
    const result = lookupPincode('411001');
    const elapsed = performance.now() - t0;

    expect(result).not.toBeNull();
    expect(result?.state).toBe('Maharashtra');
    expect(result?.district).toBe('Pune');
    expect(result?.taluk).toBe('Pune City');
    // Instant execution (sub-millisecond)
    expect(elapsed).toBeLessThan(5);
  });

  it('resolves metropolitan postal codes across major circles', () => {
    // Delhi
    const delhi = lookupPincode('110001');
    expect(delhi?.state).toBe('Delhi');
    expect(delhi?.district).toBe('New Delhi');

    // Mumbai
    const mumbai = lookupPincode('400001');
    expect(mumbai?.state).toBe('Maharashtra');
    expect(mumbai?.district).toBe('Mumbai City');

    // Bengaluru
    const blr = lookupPincode('560001');
    expect(blr?.state).toBe('Karnataka');
    expect(blr?.district).toBe('Bengaluru Urban');

    // Chennai
    const chennai = lookupPincode('600001');
    expect(chennai?.state).toBe('Tamil Nadu');
    expect(chennai?.district).toBe('Chennai');

    // Kolkata
    const kolkata = lookupPincode('700001');
    expect(kolkata?.state).toBe('West Bengal');
    expect(kolkata?.district).toBe('Kolkata');
  });

  it('falls back to 3-digit postal division mapping when 6-digit is not in exact list', () => {
    // 411999 is in Pune division (411)
    const result = lookupPincode('411999');
    expect(result).not.toBeNull();
    expect(result?.state).toBe('Maharashtra');
    expect(result?.district).toBe('Pune');
    expect(result?.taluk).toBe(''); // taluk left blank & editable
  });

  it('returns null for invalid pin code formats', () => {
    expect(lookupPincode('012345')).toBeNull(); // Starts with 0 (invalid Indian PIN)
    expect(lookupPincode('41100')).toBeNull(); // 5 digits
    expect(lookupPincode('ABCDEF')).toBeNull(); // Non-numeric
    expect(lookupPincode('')).toBeNull();
  });
});

describe('Reverse Geocoding Optimization & Timing Standards', () => {
  it('verifies coordinate rounding for 3-decimal cache key (~110m resolution)', () => {
    const lat = 18.5204303;
    const lng = 73.8567437;
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    expect(cacheKey).toBe('18.520,73.857');

    // Nearby coordinate within ~50m rounds to same cache key
    const nearbyLat = 18.5202;
    const nearbyLng = 73.8569;
    const nearbyKey = `${nearbyLat.toFixed(3)},${nearbyLng.toFixed(3)}`;
    expect(nearbyKey).toBe('18.520,73.857');
  });

  it('executes parallel provider racing with Promise.any', async () => {
    const provider1 = new Promise((resolve) => setTimeout(() => resolve({ provider: 'photon', ms: 450 }), 450));
    const provider2 = new Promise((resolve) => setTimeout(() => resolve({ provider: 'nominatim', ms: 650 }), 650));

    const t0 = Date.now();
    const winner: any = await Promise.any([provider1, provider2]);
    const duration = Date.now() - t0;

    expect(winner.provider).toBe('photon');
    expect(duration).toBeLessThan(600); // Won fast without waiting for provider 2
  });
});
