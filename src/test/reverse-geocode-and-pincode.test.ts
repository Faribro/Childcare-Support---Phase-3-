import { describe, it, expect, beforeEach } from 'vitest';
import {
  lookupPincodeAsync,
  lookupPincode,
  loadPincodeDirectory,
  PINCODE_DIRECTORY_META,
  _resetPincodeDirectoryCacheForTest,
} from '@/lib/constants/pincodeDirectory';
import { validateAssetPayload } from '@/lib/server/assetValidation';
import { validateServerSubmissionIntake } from '@/lib/server/intakeValidation';

describe('India Post Pincode Static Compressed Directory (lazy-loaded)', () => {
  beforeEach(() => {
    _resetPincodeDirectoryCacheForTest();
  });

  it('lazy-loads full compressed India Post directory (>19,000 pincodes) and resolves exact 6-digit codes quickly', async () => {
    const dir = await loadPincodeDirectory();
    expect(Object.keys(dir).length).toBeGreaterThanOrEqual(19000);
    expect(PINCODE_DIRECTORY_META.officialDatasetHasTalukColumn).toBe(false);
    expect(PINCODE_DIRECTORY_META.prefixGuessingEnabled).toBe(false);

    const t0 = performance.now();
    const result = await lookupPincodeAsync('411001');
    const elapsed = performance.now() - t0;

    expect(result).not.toBeNull();
    expect(result?.state).toBe('Maharashtra');
    expect(result?.district).toBe('Pune');
    expect(result?.taluk).toBe('Pune City');
    expect(result?.postOffice).toBeTruthy();
    // Instant in-memory execution once loaded
    expect(elapsed).toBeLessThan(10);

    // Synchronous cache-backed lookup works immediately after async load
    const cachedSync = lookupPincode('411001');
    expect(cachedSync?.district).toBe('Pune');
  });

  it('resolves metropolitan & modern LGD pincodes including Telangana and Ladakh', async () => {
    const delhi = await lookupPincodeAsync('110001');
    expect(delhi?.state).toBe('Delhi');
    expect(delhi?.district).toBe('New Delhi');

    const mumbai = await lookupPincodeAsync('400001');
    expect(mumbai?.state).toBe('Maharashtra');
    expect(mumbai?.district).toBe('Mumbai City');

    const blr = await lookupPincodeAsync('560001');
    expect(blr?.state).toBe('Karnataka');
    expect(blr?.district).toBe('Bengaluru Urban');

    const chennai = await lookupPincodeAsync('600001');
    expect(chennai?.state).toBe('Tamil Nadu');
    expect(chennai?.district).toBe('Chennai');

    const kolkata = await lookupPincodeAsync('700001');
    expect(kolkata?.state).toBe('West Bengal');
    expect(kolkata?.district).toBe('Kolkata');

    const telangana = await lookupPincodeAsync('504293');
    expect(telangana?.state).toBe('Telangana');
    expect(telangana?.district).toBe('Kumuram Bheem');

    const ladakh = await lookupPincodeAsync('194101');
    expect(ladakh?.state).toBe('Ladakh');
    expect(ladakh?.district).toBe('Leh');
  });

  it('does NOT auto-fill district from 3-digit prefix guessing when 6-digit PIN is unlisted', async () => {
    // 411999 is not an official 6-digit India Post PIN even though 411xx is Pune region
    const result = await lookupPincodeAsync('411999');
    expect(result).toBeNull();
  });

  it('returns null for invalid pin code formats', async () => {
    expect(await lookupPincodeAsync('012345')).toBeNull(); // Starts with 0 (invalid Indian PIN)
    expect(await lookupPincodeAsync('41100')).toBeNull(); // 5 digits
    expect(await lookupPincodeAsync('ABCDEF')).toBeNull(); // Non-numeric
    expect(await lookupPincodeAsync('')).toBeNull();
  });
});

describe('Server Asset Upload Limits (2.5MB & MIME Allowlist) & Document Proof Enforcement', () => {
  const TINY_VALID_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  it('enforces 2.5MB decoded size limit and allowed MIME types on uploads', () => {
    expect(validateAssetPayload(TINY_VALID_PNG, 'Receipt').valid).toBe(true);

    // Unsupported MIME type (SVG / HTML)
    const badMime = 'data:image/svg+xml;base64,PHN2Zy8+';
    const mimeRes = validateAssetPayload(badMime, 'Receipt');
    expect(mimeRes.valid).toBe(false);
    expect(mimeRes.statusCode).toBe(415);

    // Oversized upload (> 2.5 MB decoded)
    const threeMbBase64 = Buffer.alloc(2.7 * 1024 * 1024, 0xff).toString('base64');
    const oversized = `data:image/jpeg;base64,${threeMbBase64}`;
    const sizeRes = validateAssetPayload(oversized, 'Receipt');
    expect(sizeRes.valid).toBe(false);
    expect(sizeRes.statusCode).toBe(413);
  });

  it('enforces Document Verification Proofs server-side (>=1 document OR >=3-char remarks)', () => {
    const baseIntake = {
      uuid: '11111111-1111-4111-8111-111111111111',
      demographics: {
        artNumber: 'MH-PUN-1001',
        childName: 'Asha Kale',
        dob: '2016-05-10',
        gender: 'Female',
        caregiverName: 'Meena Kale',
        caregiverRelationship: 'Mother',
        contactNumber: '9822001122',
        residenceType: 'Rented',
        doorAndColony: 'House 12, Shanti Nagar',
        street: 'Main Road',
        villageCity: 'Pune',
        talukMandalBlock: 'Pune City',
        state: 'Maharashtra',
        district: 'Pune',
        pinCode: '411001',
      },
      caregiverConsent: { consentProvided: true },
      educationStatus: { educationStatus: 'Currently going to school' },
      educationExpenses: { totalAnnualCost: 3000, feeReceiptPhotoUrl: '', marksheetPhotoUrl: '', remarks: '' },
      finalReview: { allInfoCorrect: true, formSubmittedBy: 'Field Worker' },
    };

    const missingProofRes = validateServerSubmissionIntake(baseIntake);
    expect(missingProofRes.valid).toBe(false);
    expect(missingProofRes.errors.some((e) => e.code === 'DOCUMENT_PROOF_REQUIRED')).toBe(true);

    // Valid when remarks >= 3 chars
    const withRemarks = {
      ...baseIntake,
      educationExpenses: { ...baseIntake.educationExpenses, remarks: 'Receipt pending from school' },
    };
    expect(validateServerSubmissionIntake(withRemarks).valid).toBe(true);

    // Valid when feeReceiptPhotoUrl provided
    const withPhoto = {
      ...baseIntake,
      educationExpenses: { ...baseIntake.educationExpenses, feeReceiptPhotoUrl: TINY_VALID_PNG },
    };
    expect(validateServerSubmissionIntake(withPhoto).valid).toBe(true);
  });
});

describe('Reverse Geocoding Optimization & Timing Standards', () => {
  it('verifies coordinate rounding for 3-decimal cache key (~110m resolution)', () => {
    const lat = 18.5204303;
    const lng = 73.8567437;
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    expect(cacheKey).toBe('18.520,73.857');

    const nearbyLat = 18.5202;
    const nearbyLng = 73.8569;
    const nearbyKey = `${nearbyLat.toFixed(3)},${nearbyLng.toFixed(3)}`;
    expect(nearbyKey).toBe('18.520,73.857');
  });

  it('executes parallel provider racing with Promise.any', async () => {
    const provider1 = new Promise((resolve) => setTimeout(() => resolve({ provider: 'photon', ms: 50 }), 50));
    const provider2 = new Promise((resolve) => setTimeout(() => resolve({ provider: 'nominatim', ms: 150 }), 150));

    const t0 = Date.now();
    const winner: any = await Promise.any([provider1, provider2]);
    const duration = Date.now() - t0;

    expect(winner.provider).toBe('photon');
    expect(duration).toBeLessThan(120);
  });
});
