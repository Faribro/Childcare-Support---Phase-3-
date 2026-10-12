import { describe, it, expect } from 'vitest';
import {
  formatSystemStatus,
  getBrowserNetworkHint,
  NetworkStatus,
  DataSource,
  SyncStatus,
} from '@/lib/status/statusModel';

describe('Issue #51 Status Model Specification Suite', () => {
  it('online + live yields "Online" with success variant', () => {
    const res = formatSystemStatus({
      networkStatus: 'online',
      dataSource: 'live',
      syncStatus: 'synced',
    });
    expect(res.label).toBe('Online');
    expect(res.variant).toBe('success');
    expect(res.ariaLabel).toContain('Online');
  });

  it('online + cache yields "Online · Showing cached data" with warning variant', () => {
    const res = formatSystemStatus({
      networkStatus: 'online',
      dataSource: 'cache',
      syncStatus: 'synced',
    });
    expect(res.label).toBe('Online · Showing cached data');
    expect(res.variant).toBe('warning');
    expect(res.ariaLabel).toContain('Showing cached data');
  });

  it('offline + local-only yields "Offline · Local data"', () => {
    const res = formatSystemStatus({
      networkStatus: 'offline',
      dataSource: 'local-only',
      syncStatus: 'synced',
    });
    expect(res.label).toBe('Offline · Local data');
    expect(res.variant).toBe('neutral');
    expect(res.ariaLabel).toContain('Local data');
  });

  it('online + pending yields "Online · Pending sync"', () => {
    const res = formatSystemStatus({
      networkStatus: 'online',
      dataSource: 'live',
      syncStatus: 'pending',
    });
    expect(res.label).toBe('Online · Pending sync');
    expect(res.variant).toBe('info');
    expect(res.ariaLabel).toContain('Pending sync');
  });

  it('offline + pending yields "Offline · Will sync when connected"', () => {
    const res = formatSystemStatus({
      networkStatus: 'offline',
      dataSource: 'local-only',
      syncStatus: 'pending',
    });
    expect(res.label).toBe('Offline · Will sync when connected');
    expect(res.variant).toBe('warning');
    expect(res.ariaLabel).toContain('Will sync when connected');
  });

  it('online + retrying yields "Online · Retrying sync"', () => {
    const res = formatSystemStatus({
      networkStatus: 'online',
      dataSource: 'cache',
      syncStatus: 'retrying',
    });
    expect(res.label).toBe('Online · Retrying sync');
    expect(res.variant).toBe('warning');
  });

  it('online + failed yields "Online · Sync issue"', () => {
    const res = formatSystemStatus({
      networkStatus: 'online',
      dataSource: 'live',
      syncStatus: 'failed',
    });
    expect(res.label).toBe('Online · Sync issue');
    expect(res.variant).toBe('error');
  });

  it('provides accessible aria labels for screen readers without leaking sensitive data', () => {
    const res = formatSystemStatus({
      networkStatus: 'online',
      dataSource: 'cache',
      syncStatus: 'pending',
    });
    expect(res.ariaLabel).toBe(
      'System status: Online · Pending sync. Network is online, data source is cache, sync is pending.'
    );
  });
});
