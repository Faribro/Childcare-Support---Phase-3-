import type { ReleaseManifest } from './releaseManifest';

/**
 * Institutional Default Release Manifest (Production Baseline)
 *
 * Sourced strictly from verified deployment artifacts and public channels.
 *
 * Current Baseline Guarantees:
 * 1. Direct browser access is preserved at `/app` (Field Workspace).
 * 2. PWA installation is available from supported browsers.
 * 3. Default approved native-download origins remain strictly EMPTY ([])
 *    until an actual destination is authorized by Release & Integration.
 * 4. Production default exposes ZERO native download actions (no APK/AAB/native installers).
 * 5. Illustrative native artifacts are kept in test fixtures only.
 */
export const DEFAULT_RELEASE_MANIFEST: ReleaseManifest = {
  schemaVersion: 1,
  manifestVersion: '1.0.0',
  applicationName: 'Alliance Childcare Support',
  appName: 'Alliance Childcare Support',
  updatedAt: '2026-10-16T12:00:00.000Z',
  lastValidatedAt: '2026-10-16T12:00:00.000Z',
  pwa: {
    enabled: true,
    startUrl: '/app',
    scope: '/',
  },
  releases: [
    {
      id: 'childcare-web-field-workspace',
      platform: 'web_pwa',
      platformLabel: 'Web Browser / Progressive Web App (Field Workspace)',
      artifactFormat: 'pwa_web',
      directInstallable: true,
      pwaInstallable: true,
      verifiedOfflineSupport: true,
      version: '3.0.0',
      versionCode: 300,
      minimumOS: 'Modern browser supporting IndexedDB v3 and Service Worker',
      downloadUrl: '/app',
      channel: 'production',
      signingStatus: 'not_applicable',
      status: 'available',
      labelBadge: 'BROWSER READY',
      releaseNotes: 'Direct browser access to field workspace with Dexie.js offline persistence and serwist service worker.',
      publishedAt: '2026-10-16T12:00:00.000Z',
    },
  ],
  nativeArtifacts: [], // Strictly zero native downloads in production default
  storeLinks: [],
};

export const CANONICAL_RELEASE_MANIFEST = DEFAULT_RELEASE_MANIFEST;
