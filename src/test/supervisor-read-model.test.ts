import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supervisorReadModel } from '@/lib/read-model/supervisorReadModel';

describe('Supervisor Shared Read Model Singleton Test Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    supervisorReadModel.resetForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('initializes in idle state with empty records', () => {
    const state = supervisorReadModel.getState();
    expect(state.status).toBe('idle');
    expect(state.records).toEqual([]);
    expect(state.total).toBe(0);
    expect(state.error).toBeNull();
  });

  it('deduplicates simultaneous concurrent fetch requests to a single in-flight call', async () => {
    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({
          status: 'success',
          data: { records: [{ id: 'SUB-1', name: 'Child 1' }], total: 1 },
        }),
      };
    });

    const promise1 = supervisorReadModel.fetchSubmissions({ force: true });
    const promise2 = supervisorReadModel.fetchSubmissions({ force: false });

    // Both promises should resolve to the same result
    await Promise.all([promise1, promise2]);
    expect(fetchCount).toBe(1);
    expect(supervisorReadModel.getState().status).toBe('success');
    expect(supervisorReadModel.getState().records.length).toBe(1);
  });

  it('sets status to empty when response contains zero records', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        status: 'success',
        data: { records: [], total: 0 },
      }),
    });

    await supervisorReadModel.fetchSubmissions({ force: true });
    const state = supervisorReadModel.getState();
    expect(state.status).toBe('empty');
    expect(state.records).toEqual([]);
    expect(state.total).toBe(0);
  });

  it('preserves cached snapshot as offline_cache when a subsequent upstream fetch fails', async () => {
    // 1. Initial successful fetch seeds the cache
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        status: 'success',
        data: { records: [{ id: 'SUB-SAFE-1', childName: 'Test Child' }], total: 1 },
      }),
    });

    await supervisorReadModel.fetchSubmissions({ force: true });
    expect(supervisorReadModel.getState().status).toBe('success');
    expect(supervisorReadModel.getState().records.length).toBe(1);

    // 2. Second fetch fails with 502 UPSTREAM_UNAVAILABLE
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        status: 'error',
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Google Apps Script bridge unavailable',
      }),
    });

    await supervisorReadModel.fetchSubmissions({ force: true });
    const state = supervisorReadModel.getState();

    // Invariant: MUST preserve previous good records and mark offline_cache
    expect(state.status).toBe('offline_cache');
    expect(state.records.length).toBe(1);
    expect(state.records[0].id).toBe('SUB-SAFE-1');
    expect(state.error).not.toBeNull();
    expect(state.error?.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('halts automatic retries immediately on terminal 4xx client error (no polling loop)', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 400,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Invalid limit parameter',
        }),
      };
    });

    await supervisorReadModel.fetchSubmissions();

    const state = supervisorReadModel.getState();
    expect(state.status).toBe('error');
    expect(state.error?.statusCode).toBe(400);

    // Advance time past several intervals — polling should be cancelled and NO further calls made
    await vi.advanceTimersByTimeAsync(30000);
    expect(callCount).toBe(1);

    supervisorReadModel.stopPolling();
  });
});
