/**
 * Release Manifest Contract & Type Bridge
 *
 * Provides compatibility aliases mapping between Thread 03 and Thread 07
 * while delegating all validation to the canonical releaseManifest.ts module.
 */

export * from './releaseManifest';
export { DEFAULT_RELEASE_MANIFEST } from './defaultReleaseManifest';
