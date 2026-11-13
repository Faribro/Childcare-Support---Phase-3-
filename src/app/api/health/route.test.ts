import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

describe('Health Check Probe API (TCK-003 & Phase C)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return HTTP 200 OK with status ok and version 3.0.0', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('childcare-support-phase-3');
    expect(body.version).toBe('3.0.0');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('returns commit, appEnv, dataEngine, storageProvider, firestoreDatabaseId and reachability flags without leaking secrets or URLs', async () => {
    process.env.K_REVISION = 'csc-staging-00042-xyz';
    process.env.APP_ENV = 'staging';
    process.env.DATA_ENGINE = 'firestore';
    process.env.STORAGE_PROVIDER = 'gcs';
    process.env.FIRESTORE_DATABASE_ID = 'staging';
    process.env.GCS_BUCKET_NAME = 'cs-p3-childcare-staging';
    process.env.WEBHOOK_SECRET = 'ultra-confidential-secret-key-32chars';
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz_SECRET/exec';

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.commit).toBe('csc-staging-00042-xyz');
    expect(body.appEnv).toBe('staging');
    expect(body.dataEngine).toBe('firestore');
    expect(body.storageProvider).toBe('gcs');
    expect(body.firestoreDatabaseId).toBe('staging');

    expect(body.reachability).toBeDefined();
    expect(typeof body.reachability.firestore).toBe('boolean');
    expect(typeof body.reachability.storageBucket).toBe('boolean');
    expect(typeof body.reachability.appsScript).toBe('boolean');
    expect(body.reachability.storageBucket).toBe(true);
    expect(body.reachability.appsScript).toBe(true);

    // Verify zero secrets or full URLs are exposed
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('ultra-confidential');
    expect(serialized).not.toContain('script.google.com');
    expect(serialized).not.toContain('AKfycbz');
    expect(serialized).not.toContain('private_key');
  });
});
