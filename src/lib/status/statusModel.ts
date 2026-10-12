/**
 * Status Model for Childcare Support PWA (Issue #51)
 *
 * Orthogonally separates:
 * 1. networkStatus: 'online' | 'offline' | 'unknown'
 * 2. dataSource: 'live' | 'cache' | 'local-only' | 'hybrid'
 * 3. syncStatus: 'synced' | 'pending' | 'retrying' | 'failed'
 */

export type NetworkStatus = 'online' | 'offline' | 'unknown';
export type DataSource = 'live' | 'cache' | 'local-only' | 'hybrid';
export type SyncStatus = 'synced' | 'pending' | 'retrying' | 'failed';

export interface SystemStatus {
  networkStatus: NetworkStatus;
  dataSource: DataSource;
  syncStatus: SyncStatus;
}

export type StatusBadgeVariant = 'success' | 'warning' | 'info' | 'error' | 'neutral';

export interface FormattedStatus {
  label: string;
  ariaLabel: string;
  variant: StatusBadgeVariant;
  networkStatus: NetworkStatus;
  dataSource: DataSource;
  syncStatus: SyncStatus;
}

/**
 * Computes human-readable truthful label and badge variant according to Issue #51 spec:
 * - online + live → "Online"
 * - online + cache → "Online · Showing cached data"
 * - offline + local-only → "Offline · Local data"
 * - online + pending → "Online · Pending sync"
 * - offline + pending → "Offline · Will sync when connected"
 */
export function formatSystemStatus(status: SystemStatus): FormattedStatus {
  const { networkStatus, dataSource, syncStatus } = status;

  let label: string;
  let variant: StatusBadgeVariant = 'neutral';

  if (networkStatus === 'online') {
    if (syncStatus === 'pending') {
      label = 'Online · Pending sync';
      variant = 'info';
    } else if (syncStatus === 'retrying') {
      label = 'Online · Retrying sync';
      variant = 'warning';
    } else if (syncStatus === 'failed') {
      label = 'Online · Sync issue';
      variant = 'error';
    } else if (dataSource === 'cache') {
      label = 'Online · Showing cached data';
      variant = 'warning';
    } else if (dataSource === 'local-only') {
      label = 'Online · Local data';
      variant = 'info';
    } else if (dataSource === 'hybrid') {
      label = 'Online · Hybrid data';
      variant = 'info';
    } else {
      label = 'Online';
      variant = 'success';
    }
  } else if (networkStatus === 'offline') {
    if (syncStatus === 'pending') {
      label = 'Offline · Will sync when connected';
      variant = 'warning';
    } else if (dataSource === 'local-only') {
      label = 'Offline · Local data';
      variant = 'neutral';
    } else if (dataSource === 'cache') {
      label = 'Offline · Showing cached data';
      variant = 'neutral';
    } else if (syncStatus === 'failed') {
      label = 'Offline · Sync issue';
      variant = 'error';
    } else {
      label = 'Offline';
      variant = 'neutral';
    }
  } else {
    // unknown
    label = 'Connecting…';
    variant = 'neutral';
  }

  const ariaLabel = `System status: ${label}. Network is ${networkStatus}, data source is ${dataSource}, sync is ${syncStatus}.`;

  return {
    label,
    ariaLabel,
    variant,
    networkStatus,
    dataSource,
    syncStatus,
  };
}

/**
 * Resolves current browser network status hint without treating it as sole source of truth.
 */
export function getBrowserNetworkHint(): NetworkStatus {
  if (typeof navigator === 'undefined' || typeof navigator.onLine === 'undefined') {
    return 'unknown';
  }
  return navigator.onLine ? 'online' : 'offline';
}
