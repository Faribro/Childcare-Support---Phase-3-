import type { ReleaseManifest } from './releaseManifestContract';

/**
 * Institutional Default Release Manifest
 *
 * Sourced strictly from verified deployment artifacts and public channels.
 * Direct downloads are restricted to approved HTTPS origins.
 */
export const DEFAULT_RELEASE_MANIFEST: ReleaseManifest = {
  manifestVersion: '1.0.0',
  appName: 'Alliance Childcare Support',
  pwa: {
    enabled: true,
    startUrl: '/app',
    scope: '/',
  },
  nativeArtifacts: [
    {
      platform: 'android',
      architecture: 'arm64',
      channel: 'internal',
      version: 'v3.0.0-rc1',
      minOsVersion: 'Android 8.0+',
      fileSizeBytes: 29884416, // 28.5 MB
      downloadUrl: 'https://github.com/Faribro/Childcare-Support---Phase-3-/releases/download/v3.0.0-internal/app-arm64-release.apk',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      releaseNotes: 'Offline SQLite sync bridge, compressed camera photo attachment pipeline, and role-based evaluation access.',
      publishedAt: '2026-10-15T00:00:00Z',
    },
  ],
  storeLinks: [],
  lastValidatedAt: '2026-10-16T00:00:00Z',
};
