/**
 * Feature Flags for Nightly Sheet Reconciliation & Mirror Soft-Delete Flows
 *
 * All reconciliation/mirror mutation flags strictly default OFF (`false`) until
 * explicitly enabled via environment variables after staging sign-off.
 */

function isExplicitlyEnabled(rawValue: string | undefined): boolean {
  const norm = (rawValue || '').trim().toLowerCase();
  return norm === 'true' || norm === '1' || norm === 'on';
}

/** Enables GET /api/workers/reconcile-snapshot (default: false). */
export function isReconcileSnapshotEnabled(): boolean {
  return isExplicitlyEnabled(process.env.RECONCILIATION_SNAPSHOT_ENABLED);
}

/** Enables scheduled nightly reconciliation orchestration (default: false). */
export function isNightlyReconciliationEnabled(): boolean {
  return isExplicitlyEnabled(process.env.SHEET_RECONCILE_ENABLED);
}

/** Enables Trash tab mirror writes from Apps Script (default: false). */
export function isTrashMirrorTabEnabled(): boolean {
  return isExplicitlyEnabled(process.env.SHEET_TRASH_MIRROR_ENABLED);
}
