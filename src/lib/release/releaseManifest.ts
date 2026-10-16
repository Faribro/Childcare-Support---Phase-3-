/**
 * Canonical Release Manifest Contract & Safety Validation
 * Childcare Support Distribution (Phase 3)
 *
 * Reconciles Thread 03 (Landing Page / Install Modal) and Thread 07 (Native Apps & Offline Reliability)
 * into a single unified, production-grade schema and validation pipeline.
 *
 * Enforces:
 * 1. Single entry point across supported devices (Landing Page / PWA installer) while preserving /app browser access.
 * 2. Strictly distinguishes direct-install APKs from store-upload AABs.
 * 3. Enforces dynamic approved distribution origins supplied by Release & Integration (default is empty [] - no unapproved domains).
 * 4. Defaults to zero available native downloads until real hosting and signed artifacts are approved.
 * 5. Rejects private or signed storage URLs (e.g. S3/Tigris presigned queries, AWSAccessKeyId, token=).
 * 6. Explicitly badges debug/internal builds as "INTERNAL TEST ONLY", quarantining them from public release.
 * 7. Clean architecture avoiding order-dependent validation or shared mutable state bugs.
 */

import { z } from 'zod';

export const releasePlatformSchema = z.enum([
  'android',
  'web_pwa',
  'ios',
  'desktop_windows',
  'desktop_macos',
  'desktop_linux',
]);
export type ReleasePlatform = z.infer<typeof releasePlatformSchema>;
export type PlatformType = ReleasePlatform | 'windows' | 'macos' | 'linux';

export const releaseChannelSchema = z.enum([
  'production',
  'internal_test',
  'beta',
  'internal',
  'stable',
]);
export type ReleaseChannel = z.infer<typeof releaseChannelSchema>;

export const signingStatusSchema = z.enum([
  'unsigned',
  'debug_signed',
  'release_signed',
  'not_applicable',
]);
export type SigningStatus = z.infer<typeof signingStatusSchema>;

export const releaseStatusSchema = z.enum([
  'available',
  'verified_internal',
  'pending_verification',
  'withdrawn',
]);
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;

export const artifactFormatSchema = z.enum([
  'apk_universal', // Direct-install Android APK (field distribution)
  'apk_split',     // Architecture-specific APK (arm64-v8a / armeabi-v7a)
  'aab_bundle',    // Store upload bundle only (CANNOT be directly installed by end user)
  'pwa_web',       // Browser Progressive Web App entry
]);
export type ArtifactFormat = z.infer<typeof artifactFormatSchema>;

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

/**
 * Prohibited query parameters that indicate private or temporary signed URLs.
 */
export const PROHIBITED_URL_PARAMS = [
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'awsaccesskeyid',
  'sig',
  'signature',
  'token',
  'auth',
  'expires',
] as const;

/**
 * Registry for approved download origins configured by Release & Integration.
 * Defaults to an empty list so unapproved domains are never assumed.
 */
let configuredApprovedOrigins: string[] = [];

export function configureApprovedOrigins(origins: string[]): void {
  configuredApprovedOrigins = [...origins];
}

export function getConfiguredApprovedOrigins(): string[] {
  return [...configuredApprovedOrigins];
}

export function resetApprovedOrigins(): void {
  configuredApprovedOrigins = [];
}

export interface ValidationOptions {
  readonly approvedOrigins?: readonly string[];
  readonly isBrowserNavigation?: boolean;
  readonly isProduction?: boolean;
  readonly allowLocalDev?: boolean;
}

/**
 * Validates a single release URL against origin and signature safety rules.
 * Does not rely on mutable state if explicit options.approvedOrigins is provided.
 *
 * Invariants:
 * 1. Protocol-relative URLs (//host/path) are treated as external and prohibited.
 * 2. Browser navigation routes (e.g. /app) are distinct from native artifact download URLs.
 * 3. Relative download paths cannot bypass an empty allowlist for production releases.
 * 4. Localhost downloads are strictly prohibited in production and require explicit allowLocalDev in dev.
 */
export function validateReleaseUrl(
  urlStr: string,
  options?: ValidationOptions
): { valid: boolean; error?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string.' };
  }

  // Treat //host/path as an external protocol-relative URL, not a safe relative path
  if (urlStr.startsWith('//')) {
    return {
      valid: false,
      error: `Protocol-relative URL "${urlStr}" is treated as an external URL and is prohibited. Download URLs must explicitly declare https: protocol.`,
    };
  }

  // Browser navigation routes (e.g. /app or PWA startUrl)
  if (options?.isBrowserNavigation) {
    if (urlStr.startsWith('/')) {
      return { valid: true };
    }
  }

  // Relative path handling for native artifact downloads
  if (urlStr.startsWith('/')) {
    if (options?.isProduction) {
      return {
        valid: false,
        error: `Public production release artifacts cannot use relative download URLs ("${urlStr}"). They must originate from an approved HTTPS origin.`,
      };
    }

    const effectiveOrigins = options?.approvedOrigins ?? getConfiguredApprovedOrigins();
    if (effectiveOrigins.length > 0) {
      const isApprovedOrigin = effectiveOrigins.some(
        (origin) => urlStr === origin || urlStr.startsWith(origin)
      );
      if (!isApprovedOrigin) {
        return {
          valid: false,
          error: `Download URL must originate from an approved HTTPS origin supplied by Release & Integration (not in the approved origin allowlist). Relative path "${urlStr}" is not approved.`,
        };
      }
      return { valid: true };
    }

    // When allowlist is empty, native downloads cannot bypass it with arbitrary relative URLs.
    // Only the quarantined internal test sandbox (/releases/internal/) for non-production builds is allowed.
    if (urlStr.startsWith('/releases/internal/')) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `Download URL "${urlStr}" cannot bypass an empty approved origin allowlist using an arbitrary relative path.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, error: `Malformed URL: "${urlStr}".` };
  }

  // Local development check (strictly unavailable in public production-release validation)
  const isLocalDev = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (isLocalDev) {
    if (options?.isProduction) {
      return {
        valid: false,
        error: `Localhost download URL "${urlStr}" is unavailable in public production-release validation.`,
      };
    }
    if (!options?.allowLocalDev) {
      return {
        valid: false,
        error: `Local development URL "${urlStr}" requires an explicit allowLocalDev exception and cannot automatically bypass origin validation.`,
      };
    }
    return { valid: true };
  }

  // Enforce HTTPS
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: `insecure HTTP protocol "${parsed.protocol}". Only HTTPS is permitted.` };
  }

  // Check prohibited signed query tokens
  for (const param of parsed.searchParams.keys()) {
    const lower = param.toLowerCase();
    if (PROHIBITED_URL_PARAMS.includes(lower as any)) {
      return {
        valid: false,
        error: `URL contains private or signed URL query tokens ("${param}"). Static manifests must not contain signed tokens.`,
      };
    }
  }

  // Also check raw string for credential markers in case of malformed URLs
  if (urlStr.includes('AWSAccessKeyId') || urlStr.includes('Signature=') || urlStr.includes('token=')) {
    return {
      valid: false,
      error: 'Download URLs must not expose private storage credentials or presigned query params.',
    };
  }

  // Enforce approved origin allowlist (defaults to empty: zero unauthorized domains)
  const effectiveOrigins = options?.approvedOrigins ?? getConfiguredApprovedOrigins();
  const isApprovedOrigin = effectiveOrigins.some(
    (origin) => urlStr === origin || urlStr.startsWith(origin)
  );

  if (!isApprovedOrigin) {
    return {
      valid: false,
      error: `Download URL must originate from an approved HTTPS origin supplied by Release & Integration (not in the approved origin allowlist). Origin "${parsed.origin}" is not approved.`,
    };
  }

  return { valid: true };
}

/**
 * Calculates SHA-256 hex checksum from a binary payload (Uint8Array, Buffer, or ArrayBuffer).
 * Used during actual release verification to calculate the checksum directly from the binary.
 */
export async function calculateSha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8 as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  const { createHash } = await import('crypto');
  return createHash('sha256').update(uint8).digest('hex');
}

/**
 * Verifies that an actual binary artifact matches the declared manifest checksum.
 * Proves real release integrity by computing the digest from the binary bytes.
 */
export async function verifyArtifactChecksum(
  binaryData: ArrayBuffer | Uint8Array,
  declaredChecksum: string
): Promise<{ valid: boolean; computed: string; error?: string }> {
  if (!declaredChecksum || !/^[a-fA-F0-9]{64}$/.test(declaredChecksum)) {
    return {
      valid: false,
      computed: '',
      error: 'Declared checksum is missing or not a valid 64-character SHA-256 hex string.',
    };
  }

  const computed = await calculateSha256(binaryData);
  const valid = computed.toLowerCase() === declaredChecksum.toLowerCase();
  return {
    valid,
    computed,
    error: valid ? undefined : `Binary checksum mismatch: computed ${computed} does not match declared ${declaredChecksum}.`,
  };
}

/**
 * Formats byte size into human-readable B / KB / MB string.
 */
export function formatFileSizeBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
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
 * Normalized Release Item schema with strict invariants.
 */
export function createReleaseItemSchema(options?: ValidationOptions) {
  return z
    .object({
      id: z.string().min(3),
      platform: releasePlatformSchema,
      platformLabel: z.string().min(2).optional(),
      artifactFormat: artifactFormatSchema,
      directInstallable: z.boolean(),
      pwaInstallable: z.boolean().optional().default(false),
      verifiedOfflineSupport: z.boolean().optional().default(false),
      version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, 'Must follow semantic versioning'),
      versionCode: z.number().int().positive().optional(),
      minimumOS: z.string().min(2),
      minOsVersion: z.string().optional(), // alias
      targetOS: z.string().optional(),
      architecture: z.string().optional(),
      downloadUrl: z.string().min(1),
      fileSizeBytes: z.number().int().nonnegative().optional(),
      sha256Checksum: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Must be a valid 64-char hex SHA-256 string').optional(),
      sha256: z.string().optional(), // alias
      channel: releaseChannelSchema,
      signingStatus: signingStatusSchema.default('not_applicable'),
      status: releaseStatusSchema.default('available'),
      labelBadge: z.string().optional(),
      releaseNotes: z.string().min(5).optional(),
      publishedAt: z.string(),
    })
    .superRefine((data, ctx) => {
      // Invariant 1: Store-upload AAB bundles cannot be labeled direct-installable
      if (data.artifactFormat === 'aab_bundle' && data.directInstallable) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Android App Bundles (.aab) are store-upload artifacts and cannot be marked directInstallable',
          path: ['directInstallable'],
        });
      }

      // Invariant 2: Debug builds MUST be badged "INTERNAL TEST ONLY" and CANNOT be marked production
      if (data.signingStatus === 'debug_signed' || data.channel === 'internal_test' || data.channel === 'internal') {
        if (data.channel === 'production' || data.channel === 'stable') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Debug signed or internal test builds cannot be marked as production channel',
            path: ['channel'],
          });
        }
        if (!data.labelBadge || !data.labelBadge.includes('INTERNAL TEST ONLY')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Internal test/debug builds must carry the badge "INTERNAL TEST ONLY"',
            path: ['labelBadge'],
          });
        }
      }

      // Invariant 3: Available native releases must have verified SHA-256 and positive byte size
      if (data.platform !== 'web_pwa' && data.status === 'available') {
        const checksum = data.sha256Checksum || data.sha256;
        if (!checksum) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Available native releases must include a verified sha256Checksum',
            path: ['sha256Checksum'],
          });
        }
        if (!data.fileSizeBytes || data.fileSizeBytes <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Available native releases must declare a valid positive fileSizeBytes',
            path: ['fileSizeBytes'],
          });
        }
      }

      // Invariant 4: URL Origin & Signature Security
      const isBrowserNav = data.platform === 'web_pwa' || data.artifactFormat === 'pwa_web';
      const isProd =
        data.channel === 'production' ||
        data.channel === 'stable' ||
        data.status === 'available' ||
        data.directInstallable;
      const urlValidation = validateReleaseUrl(data.downloadUrl, {
        ...options,
        isBrowserNavigation: isBrowserNav,
        isProduction: isProd,
      });
      if (!urlValidation.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: urlValidation.error || 'Invalid download URL',
          path: ['downloadUrl'],
        });
      }
    });
}

export const releaseItemSchema = createReleaseItemSchema();

export type ReleaseItem = z.infer<typeof releaseItemSchema>;
export type NativeArtifact = ReleaseItem;

export const releaseManifestSchema = z.object({
  schemaVersion: z.number().default(1),
  manifestVersion: z.string().optional(),
  applicationName: z.string().min(1),
  appName: z.string().optional(),
  updatedAt: z.string().optional(),
  lastValidatedAt: z.string().optional(),
  pwa: z
    .object({
      enabled: z.boolean().default(true),
      startUrl: z.string().default('/app'),
      scope: z.string().default('/'),
    })
    .default({ enabled: true, startUrl: '/app', scope: '/' }),
  releases: z.array(releaseItemSchema),
  nativeArtifacts: z.array(z.any()).optional(),
  storeLinks: z.array(z.any()).optional().default([]),
});

export interface ReleaseManifest {
  readonly schemaVersion?: number;
  readonly manifestVersion?: string;
  readonly applicationName: string;
  readonly appName?: string;
  readonly updatedAt?: string;
  readonly lastValidatedAt?: string;
  readonly pwa: PwaReleaseConfig;
  readonly releases: readonly ReleaseItem[];
  readonly nativeArtifacts: readonly ReleaseItem[];
  readonly storeLinks: readonly StoreLink[];
}

/**
 * Validates any candidate release manifest against strict distribution policies.
 */
export function validateReleaseManifest(
  input: unknown,
  options?: ValidationOptions
): {
  valid: boolean;
  manifest?: ReleaseManifest;
  errors: string[];
} {
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Manifest must be a non-null object.'] };
  }

  const raw = input as Record<string, any>;
  const errors: string[] = [];

  const appName = raw.applicationName || raw.appName;
  if (!appName || typeof appName !== 'string') {
    errors.push('applicationName or appName is required.');
  }

  // Normalize releases list from releases and nativeArtifacts
  let releasesToValidate: any[] = [];
  if (Array.isArray(raw.releases)) {
    releasesToValidate = [...raw.releases];
  }
  if (Array.isArray(raw.nativeArtifacts)) {
    const fromArtifacts = raw.nativeArtifacts.map((art: any, i: number) => ({
      id: art.id || `native-${art.platform}-${art.version || i}`,
      platform: art.platform === 'windows' ? 'desktop_windows' : art.platform === 'macos' ? 'desktop_macos' : art.platform === 'linux' ? 'desktop_linux' : art.platform,
      platformLabel: art.platformLabel || `${art.platform} Client`,
      artifactFormat: art.artifactFormat || 'apk_universal',
      directInstallable: art.directInstallable ?? (art.channel === 'production' || art.channel === 'stable'),
      version: (art.version || '3.0.0').replace(/^v/, ''),
      versionCode: art.versionCode || 1,
      minimumOS: art.minOsVersion || art.minimumOS || 'Android 8.0+',
      minOsVersion: art.minOsVersion || art.minimumOS || 'Android 8.0+',
      downloadUrl: art.downloadUrl,
      fileSizeBytes: art.fileSizeBytes,
      sha256Checksum: art.sha256Checksum || art.sha256,
      channel: art.channel === 'stable' ? 'production' : art.channel === 'internal' ? 'internal_test' : art.channel || 'production',
      signingStatus: art.signingStatus || (art.channel === 'internal' || art.channel === 'internal_test' ? 'debug_signed' : 'release_signed'),
      status: art.status || (art.channel === 'internal' || art.channel === 'internal_test' ? 'pending_verification' : 'available'),
      labelBadge: art.labelBadge || (art.channel === 'internal' || art.channel === 'internal_test' ? 'INTERNAL TEST ONLY' : undefined),
      releaseNotes: art.releaseNotes || 'Production release artifact',
      publishedAt: art.publishedAt || new Date().toISOString(),
    }));

    for (const item of fromArtifacts) {
      const alreadyPresent = releasesToValidate.some(
        (r) => (item.id && r.id === item.id) || (item.downloadUrl && r.downloadUrl === item.downloadUrl)
      );
      if (!alreadyPresent) {
        releasesToValidate.push(item);
      }
    }
  }

  const itemSchema = createReleaseItemSchema(options);
  const validatedReleases: ReleaseItem[] = [];
  for (let i = 0; i < releasesToValidate.length; i++) {
    const item = releasesToValidate[i];
    try {
      const parsed = itemSchema.parse(item);
      validatedReleases.push(parsed);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        for (const issue of err.issues) {
          errors.push(`releases[${i}] (${item?.id || 'unknown'}): ${issue.message}`);
        }
      } else {
        errors.push(`releases[${i}]: ${err.message}`);
      }
    }
  }

  const storeLinks: StoreLink[] = [];
  if (Array.isArray(raw.storeLinks)) {
    for (let i = 0; i < raw.storeLinks.length; i++) {
      const sl = raw.storeLinks[i];
      const urlCheck = validateReleaseUrl(sl?.url, {
        ...options,
        isBrowserNavigation: false,
        isProduction: true,
      });
      if (!urlCheck.valid) {
        errors.push(`storeLinks[${i}]: ${urlCheck.error}`);
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

  const pwaConfig: PwaReleaseConfig = {
    enabled: raw.pwa?.enabled !== false,
    startUrl: raw.pwa?.startUrl || '/app',
    scope: raw.pwa?.scope || '/',
  };

  const pwaUrlCheck = validateReleaseUrl(pwaConfig.startUrl, {
    ...options,
    isBrowserNavigation: true,
  });
  if (!pwaUrlCheck.valid) {
    errors.push(`pwa.startUrl: ${pwaUrlCheck.error}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const nativeArtifacts = validatedReleases.filter(
    (r) => r.platform !== 'web_pwa'
  );

  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    manifestVersion: String(raw.manifestVersion || '1.0.0'),
    applicationName: String(appName),
    appName: String(appName),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    lastValidatedAt: new Date().toISOString(),
    pwa: pwaConfig,
    releases: validatedReleases,
    nativeArtifacts,
    storeLinks,
  };

  return { valid: true, manifest, errors: [] };
}

/**
 * Baseline canonical release manifest.
 *
 * Current Truth:
 * - Direct browser access is preserved at `/app` (Field Workspace).
 * - PWA installation is available from supported browsers.
 * - Verified offline support requires IndexedDB and Service Worker capabilities.
 * - Zero native downloads are marked 'available' until real hosting and artifacts are approved.
 */
export const CANONICAL_RELEASE_MANIFEST: ReleaseManifest = {
  schemaVersion: 1,
  manifestVersion: '1.0.0',
  applicationName: 'Childcare Support Phase 3',
  appName: 'Childcare Support Phase 3',
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
    {
      id: 'childcare-android-debug-slice',
      platform: 'android',
      platformLabel: 'Android Client APK (Field Tablets & Smartphones)',
      artifactFormat: 'apk_universal',
      directInstallable: false,
      pwaInstallable: false,
      verifiedOfflineSupport: false,
      version: '3.0.0',
      versionCode: 1,
      minimumOS: 'Android 7.0 (API Level 24)',
      targetOS: 'Android 16 (API Level 36)',
      architecture: 'universal (arm64-v8a, armeabi-v7a, x86_64)',
      downloadUrl: '/releases/internal/android-debug.apk',
      channel: 'internal_test',
      signingStatus: 'debug_signed',
      status: 'pending_verification',
      labelBadge: 'INTERNAL TEST ONLY',
      releaseNotes: 'Android native vertical slice featuring SQLite draft storage, sandboxed attachments, and Keystore tokens.',
      publishedAt: '2026-10-16T12:00:00.000Z',
    },
  ],
  nativeArtifacts: [],
  storeLinks: [],
};

/**
 * Filter manifest entries suitable for public display on the landing page.
 * Strictly excludes internal test builds, pending builds, and store-only AAB bundles.
 */
export function getPublicDisplayReleases(manifest: ReleaseManifest = CANONICAL_RELEASE_MANIFEST): ReleaseItem[] {
  return (manifest?.releases || []).filter(
    (item) => item.channel === 'production' && item.status === 'available' && item.directInstallable
  );
}

/**
 * Retrieves internal verification builds for QA/field testing coordinators.
 */
export function getInternalTestReleases(manifest: ReleaseManifest = CANONICAL_RELEASE_MANIFEST): ReleaseItem[] {
  return (manifest?.releases || []).filter(
    (item) => item.channel === 'internal_test' || item.signingStatus === 'debug_signed' || item.status === 'pending_verification'
  );
}
