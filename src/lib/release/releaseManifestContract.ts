/**
 * Release Manifest Contract & Safety Validation
 *
 * Enforces:
 * 1. Strict HTTPS protocol and approved institutional origin allowlist.
 * 2. Prohibits temporary/private signed URLs (e.g., S3/Tigris presigned queries).
 * 3. Clear labeling of channels: 'stable', 'beta', 'internal'.
 * 4. Required technical metadata for direct installers: version, minimum OS, file size.
 * 5. Sanitized client-safe structure with zero secrets or PII.
 */

export type PlatformType = 'android' | 'ios' | 'windows' | 'macos' | 'linux';

export type ReleaseChannel = 'stable' | 'beta' | 'internal';

export type ArchitectureType = 'arm64' | 'x64' | 'universal' | 'all';

export interface NativeArtifact {
  readonly platform: PlatformType;
  readonly architecture: ArchitectureType;
  readonly channel: ReleaseChannel;
  readonly version: string;
  readonly minOsVersion: string; // e.g. "Android 8.0+", "iOS 15.0+", "Windows 10+"
  readonly fileSizeBytes: number;
  readonly downloadUrl: string;
  readonly sha256?: string;
  readonly releaseNotes?: string;
  readonly publishedAt: string; // ISO 8601 UTC
}

export interface StoreLink {
  readonly platform: 'android' | 'ios';
  readonly type: 'play-store' | 'app-store' | 'testflight';
  readonly label: string;
  readonly url: string;
  readonly isBeta?: boolean;
}

export interface PwaReleaseConfig {
  readonly enabled: boolean;
  readonly startUrl: string;
  readonly scope: string;
}

export interface ReleaseManifest {
  readonly manifestVersion: string;
  readonly appName: string;
  readonly pwa: PwaReleaseConfig;
  readonly nativeArtifacts: readonly NativeArtifact[];
  readonly storeLinks: readonly StoreLink[];
  readonly lastValidatedAt: string;
}

/**
 * Approved institutional origins for release binary downloads and store listings.
 * Any URL outside this list fails validation closed.
 */
export const APPROVED_RELEASE_ORIGINS: readonly string[] = [
  'https://github.com/Faribro/',
  'https://play.google.com/',
  'https://apps.apple.com/',
  'https://testflight.apple.com/',
  'https://allianceindia.org/',
  'https://releases.allianceindia.org/',
  'https://childcare-support-phase-3.vercel.app/',
];

/**
 * Prohibited query parameters that indicate private or temporary signed URLs.
 */
const PROHIBITED_URL_PARAMS = [
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'sig',
  'signature',
  'token',
  'auth',
  'expires',
];

/**
 * Validates a single release URL against origin and signature safety rules.
 */
export function validateReleaseUrl(urlStr: string): { valid: boolean; error?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, error: `Malformed URL: "${urlStr}".` };
  }

  // Enforce HTTPS
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: `insecure HTTP protocol "${parsed.protocol}". Only HTTPS is permitted.` };
  }

  // Enforce approved institutional origin
  const isApprovedOrigin = APPROVED_RELEASE_ORIGINS.some(
    (approved) => urlStr === approved || urlStr.startsWith(approved)
  );
  if (!isApprovedOrigin) {
    return {
      valid: false,
      error: `Origin "${parsed.origin}" is not in the approved origin allowlist.`,
    };
  }

  // Reject signed / temporary / expiring URLs
  for (const param of parsed.searchParams.keys()) {
    const lower = param.toLowerCase();
    if (PROHIBITED_URL_PARAMS.includes(lower)) {
      return {
        valid: false,
        error: `URL contains private or signed URL query tokens ("${param}"). Static manifests must not contain signed tokens.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Formats byte size into human-readable B / KB / MB string.
 */
export function formatFileSizeBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${megabytes.toFixed(1)} MB`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes >= 1) {
    return `${kilobytes.toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Validates an entire ReleaseManifest object fail-closed.
 */
export function validateReleaseManifest(input: unknown): {
  valid: boolean;
  manifest?: ReleaseManifest;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Manifest must be a non-null object.'] };
  }

  const raw = input as Record<string, any>;

  if (!raw.manifestVersion || typeof raw.manifestVersion !== 'string') {
    errors.push('manifestVersion is required.');
  }

  if (!raw.appName || typeof raw.appName !== 'string') {
    errors.push('appName is required.');
  }

  if (!raw.pwa || typeof raw.pwa !== 'object') {
    errors.push('pwa configuration is required.');
  }

  const nativeArtifacts: NativeArtifact[] = [];
  if (Array.isArray(raw.nativeArtifacts)) {
    for (let i = 0; i < raw.nativeArtifacts.length; i++) {
      const art = raw.nativeArtifacts[i];
      if (!art || typeof art !== 'object') {
        errors.push(`nativeArtifacts[${i}] must be an object.`);
        continue;
      }
      if (!['android', 'ios', 'windows', 'macos', 'linux'].includes(art.platform)) {
        errors.push(`nativeArtifacts[${i}]: Invalid platform "${art.platform}".`);
      }
      if (!['stable', 'beta', 'internal'].includes(art.channel)) {
        errors.push(`nativeArtifacts[${i}]: Invalid channel "${art.channel}".`);
      }
      if (typeof art.fileSizeBytes !== 'number' || art.fileSizeBytes <= 0) {
        errors.push(`nativeArtifacts[${i}]: fileSizeBytes must be a positive number.`);
      }
      if (!art.version || typeof art.version !== 'string') {
        errors.push(`nativeArtifacts[${i}]: version is required.`);
      }
      if (!art.minOsVersion || typeof art.minOsVersion !== 'string') {
        errors.push(`nativeArtifacts[${i}]: minOsVersion is required.`);
      }
      const urlValidation = validateReleaseUrl(art.downloadUrl);
      if (!urlValidation.valid) {
        errors.push(`nativeArtifacts[${i}]: ${urlValidation.error}`);
      } else {
        nativeArtifacts.push({
          platform: art.platform,
          architecture: art.architecture || 'all',
          channel: art.channel,
          version: art.version,
          minOsVersion: art.minOsVersion,
          fileSizeBytes: art.fileSizeBytes,
          downloadUrl: art.downloadUrl,
          sha256: art.sha256,
          releaseNotes: art.releaseNotes,
          publishedAt: art.publishedAt || new Date().toISOString(),
        });
      }
    }
  }

  const storeLinks: StoreLink[] = [];
  if (Array.isArray(raw.storeLinks)) {
    for (let i = 0; i < raw.storeLinks.length; i++) {
      const sl = raw.storeLinks[i];
      if (!sl || typeof sl !== 'object') {
        errors.push(`storeLinks[${i}] must be an object.`);
        continue;
      }
      if (!['android', 'ios'].includes(sl.platform)) {
        errors.push(`storeLinks[${i}]: Invalid store platform "${sl.platform}".`);
      }
      if (!['play-store', 'app-store', 'testflight'].includes(sl.type)) {
        errors.push(`storeLinks[${i}]: Invalid store type "${sl.type}".`);
      }
      const urlValidation = validateReleaseUrl(sl.url);
      if (!urlValidation.valid) {
        errors.push(`storeLinks[${i}]: ${urlValidation.error}`);
      } else {
        storeLinks.push({
          platform: sl.platform,
          type: sl.type,
          label: sl.label || 'Store Link',
          url: sl.url,
          isBeta: !!sl.isBeta,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const validatedManifest: ReleaseManifest = {
    manifestVersion: String(raw.manifestVersion),
    appName: String(raw.appName),
    pwa: {
      enabled: raw.pwa.enabled !== false,
      startUrl: raw.pwa.startUrl || '/app',
      scope: raw.pwa.scope || '/',
    },
    nativeArtifacts,
    storeLinks,
    lastValidatedAt: new Date().toISOString(),
  };

  return { valid: true, manifest: validatedManifest, errors: [] };
}
