import { describe, it, expect, beforeEach } from 'vitest';
import {
  CANONICAL_RELEASE_MANIFEST,
  validateReleaseManifest,
  validateReleaseUrl,
  getPublicDisplayReleases,
  getInternalTestReleases,
  releaseItemSchema,
  configureApprovedOrigins,
  resetApprovedOrigins,
  calculateSha256,
  verifyArtifactChecksum,
} from '@/lib/release/releaseManifest';

describe('Release Manifest Contract & Landing Page Distribution Invariants', () => {
  beforeEach(() => {
    resetApprovedOrigins();
  });

  it('1. Canonical manifest passes strict schema validation with /app entry point and zero available native downloads', () => {
    const result = validateReleaseManifest(CANONICAL_RELEASE_MANIFEST);
    expect(result.valid).toBe(true);
    const validated = result.manifest!;
    expect(validated.schemaVersion).toBe(1);
    expect(validated.releases.length).toBeGreaterThanOrEqual(1);

    // Browser entry point
    const webPwa = validated.releases.find((r) => r.platform === 'web_pwa');
    expect(webPwa).toBeDefined();
    expect(webPwa?.channel).toBe('production');
    expect(webPwa?.status).toBe('available');
    expect(webPwa?.downloadUrl).toBe('/app');
    expect(webPwa?.directInstallable).toBe(true);
    expect(webPwa?.pwaInstallable).toBe(true);
    expect(webPwa?.verifiedOfflineSupport).toBe(true);

    // Android native entry defaults to zero available public native downloads
    const publicReleases = getPublicDisplayReleases(validated);
    const androidPublic = publicReleases.filter((r) => r.platform === 'android');
    expect(androidPublic).toHaveLength(0);
  });

  it('2. Distinguishes direct-install APKs from store-upload AAB bundles', () => {
    const invalidAabDirectInstall = {
      id: 'invalid-aab-direct',
      platform: 'android' as const,
      platformLabel: 'Android Client Bundle',
      artifactFormat: 'aab_bundle' as const,
      directInstallable: true, // VIOLATION: AABs cannot be directly installed by end-users
      version: '3.0.0',
      versionCode: 1,
      minimumOS: 'Android 7.0 (API Level 24)',
      downloadUrl: '/releases/internal/bundle.aab',
      channel: 'internal_test' as const,
      signingStatus: 'debug_signed' as const,
      status: 'pending_verification' as const,
      labelBadge: 'INTERNAL TEST ONLY',
      releaseNotes: 'Testing AAB constraint',
      publishedAt: new Date().toISOString(),
    };

    expect(() => releaseItemSchema.parse(invalidAabDirectInstall)).toThrow(
      /Android App Bundles \(\.aab\) are store-upload artifacts and cannot be marked directInstallable/
    );
  });

  it('3. Enforces dynamic approved origins from Release & Integration and rejects unapproved domains', () => {
    // When no origins are configured, external URLs are rejected
    const unapprovedOriginItem = {
      id: 'unapproved-origin',
      platform: 'android' as const,
      platformLabel: 'Android Client APK',
      artifactFormat: 'apk_universal' as const,
      directInstallable: true,
      version: '3.0.0',
      versionCode: 1,
      minimumOS: 'Android 7.0 (API Level 24)',
      downloadUrl: 'https://custom-storage.example.org/app.apk',
      sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSizeBytes: 15000000,
      channel: 'production' as const,
      signingStatus: 'release_signed' as const,
      status: 'available' as const,
      releaseNotes: 'Testing unapproved origin',
      publishedAt: new Date().toISOString(),
    };

    expect(() => releaseItemSchema.parse(unapprovedOriginItem)).toThrow(
      /Download URL must originate from an approved HTTPS origin supplied by Release & Integration/
    );

    // When configured by Release & Integration, approved origin succeeds
    configureApprovedOrigins(['https://custom-storage.example.org']);
    expect(() => releaseItemSchema.parse(unapprovedOriginItem)).not.toThrow();
  });

  it('4. Rejects debug builds placed on the production channel or missing the "INTERNAL TEST ONLY" badge', () => {
    const debugOnProd = {
      id: 'debug-on-prod',
      platform: 'android' as const,
      platformLabel: 'Android Client APK',
      artifactFormat: 'apk_universal' as const,
      directInstallable: true,
      version: '3.0.0',
      versionCode: 1,
      minimumOS: 'Android 7.0 (API Level 24)',
      downloadUrl: '/releases/internal/android-debug.apk',
      channel: 'production' as const, // VIOLATION: debug on prod
      signingStatus: 'debug_signed' as const,
      status: 'pending_verification' as const,
      labelBadge: 'INTERNAL TEST ONLY',
      releaseNotes: 'Testing debug on prod',
      publishedAt: new Date().toISOString(),
    };

    expect(() => releaseItemSchema.parse(debugOnProd)).toThrow(
      /Debug signed or internal test builds cannot be marked as production channel/
    );

    const missingBadge = {
      id: 'missing-badge',
      platform: 'android' as const,
      platformLabel: 'Android Client APK',
      artifactFormat: 'apk_universal' as const,
      directInstallable: true,
      version: '3.0.0',
      versionCode: 1,
      minimumOS: 'Android 7.0 (API Level 24)',
      downloadUrl: '/releases/internal/android-debug.apk',
      channel: 'internal_test' as const,
      signingStatus: 'debug_signed' as const,
      status: 'pending_verification' as const,
      labelBadge: 'Pre-release Test', // VIOLATION: missing exact badge
      releaseNotes: 'Testing missing badge',
      publishedAt: new Date().toISOString(),
    };

    expect(() => releaseItemSchema.parse(missingBadge)).toThrow(
      /INTERNAL TEST ONLY/
    );
  });

  it('5. Requires verified SHA-256 and positive byte size on any native release marked "available"', () => {
    configureApprovedOrigins(['https://approved-cdn.net']);
    const unverifiedNative = {
      id: 'unverified-native',
      platform: 'android' as const,
      platformLabel: 'Android Client APK',
      artifactFormat: 'apk_universal' as const,
      directInstallable: true,
      version: '3.0.0',
      versionCode: 1,
      minimumOS: 'Android 7.0 (API Level 24)',
      downloadUrl: 'https://approved-cdn.net/app.apk',
      channel: 'production' as const,
      signingStatus: 'release_signed' as const,
      status: 'available' as const, // VIOLATION: marked available without checksum/size
      releaseNotes: 'Testing unverified native',
      publishedAt: new Date().toISOString(),
    };

    expect(() => releaseItemSchema.parse(unverifiedNative)).toThrow(
      /Available native releases must include a verified sha256Checksum/
    );
  });

  it('6. Public display filter strictly defaults to zero available native downloads', () => {
    const publicReleases = getPublicDisplayReleases(CANONICAL_RELEASE_MANIFEST);
    // Only web_pwa is active; zero native downloads available by default
    expect(publicReleases.length).toBe(1);
    expect(publicReleases[0].platform).toBe('web_pwa');
    expect(publicReleases[0].downloadUrl).toBe('/app');

    const nativePublic = publicReleases.filter((r) => r.platform === 'android');
    expect(nativePublic.length).toBe(0); // Zero native downloads available by default
  });

  it('7. Rejects protocol-relative URLs (//host/path) as external prohibited URLs', () => {
    const protocolRelativeCheck = validateReleaseUrl('//malicious-domain.org/app.apk');
    expect(protocolRelativeCheck.valid).toBe(false);
    expect(protocolRelativeCheck.error).toContain('Protocol-relative URL');
  });

  it('8. Rejects public production release artifacts with relative URLs (cannot bypass empty allowlist)', () => {
    const relativeNativeOnProd = {
      id: 'relative-prod-native',
      platform: 'android' as const,
      platformLabel: 'Android Client APK',
      artifactFormat: 'apk_universal' as const,
      directInstallable: true,
      version: '3.0.0',
      versionCode: 1,
      minimumOS: 'Android 7.0 (API Level 24)',
      downloadUrl: '/downloads/arbitrary.apk',
      sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSizeBytes: 15000000,
      channel: 'production' as const,
      signingStatus: 'release_signed' as const,
      status: 'available' as const,
      releaseNotes: 'Testing relative on prod',
      publishedAt: new Date().toISOString(),
    };

    expect(() => releaseItemSchema.parse(relativeNativeOnProd)).toThrow(
      /Public production release artifacts cannot use relative download URLs/
    );
  });

  it('9. Rejects localhost native downloads in production and requires explicit allowLocalDev in dev', () => {
    const localhostProd = {
      id: 'localhost-prod',
      platform: 'android' as const,
      platformLabel: 'Android Client APK',
      artifactFormat: 'apk_universal' as const,
      directInstallable: true,
      version: '3.0.0',
      versionCode: 1,
      minimumOS: 'Android 7.0 (API Level 24)',
      downloadUrl: 'http://localhost:3000/app.apk',
      sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSizeBytes: 15000000,
      channel: 'production' as const,
      signingStatus: 'release_signed' as const,
      status: 'available' as const,
      releaseNotes: 'Testing localhost on prod',
      publishedAt: new Date().toISOString(),
    };

    expect(() => releaseItemSchema.parse(localhostProd)).toThrow(
      /Localhost download URL .* is unavailable in public production-release validation/
    );

    // Non-production localhost without explicit allowLocalDev must fail
    const nonProdLocalhostCheck = validateReleaseUrl('http://localhost:3000/app.apk', {
      isProduction: false,
      allowLocalDev: false,
    });
    expect(nonProdLocalhostCheck.valid).toBe(false);
    expect(nonProdLocalhostCheck.error).toContain('explicit allowLocalDev exception');

    // Non-production localhost WITH explicit allowLocalDev succeeds
    const nonProdAllowed = validateReleaseUrl('http://localhost:3000/app.apk', {
      isProduction: false,
      allowLocalDev: true,
    });
    expect(nonProdAllowed.valid).toBe(true);
  });

  it('10. Calculates SHA-256 directly from binary payload and verifies against manifest', async () => {
    const samplePayload = new TextEncoder().encode('Alliance Childcare Support Test Binary Payload');
    const computedHash = await calculateSha256(samplePayload);
    expect(computedHash).toMatch(/^[a-f0-9]{64}$/);

    const verificationSuccess = await verifyArtifactChecksum(samplePayload, computedHash);
    expect(verificationSuccess.valid).toBe(true);
    expect(verificationSuccess.computed).toBe(computedHash);

    const verificationFailure = await verifyArtifactChecksum(
      samplePayload,
      '0000000000000000000000000000000000000000000000000000000000000000'
    );
    expect(verificationFailure.valid).toBe(false);
    expect(verificationFailure.error).toContain('Binary checksum mismatch');
  });
});
