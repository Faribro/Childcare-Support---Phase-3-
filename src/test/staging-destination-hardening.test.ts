import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateUpstreamEndpoint,
  OPERATIONAL_APPS_SCRIPT_DEPLOYMENT_IDS,
  canonicalSubmissionAdapter,
} from '@/lib/server/canonicalSubmissionAdapter';

describe('Staging Destination Hardening & Endpoint Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('validateUpstreamEndpoint', () => {
    it('rejects undefined, empty, or non-string URLs with MISSING_ENDPOINT', () => {
      const emptyValues = [undefined, '', '   ', null as any];
      for (const val of emptyValues) {
        const res = validateUpstreamEndpoint(val);
        expect(res.valid).toBe(false);
        expect(res.code).toBe('MISSING_ENDPOINT');
      }
    });

    it('rejects malformed URLs with INVALID_URL', () => {
      const malformedUrls = ['not-a-url', '://missing-scheme', 'http://['];
      for (const url of malformedUrls) {
        const res = validateUpstreamEndpoint(url);
        expect(res.valid).toBe(false);
        expect(res.code).toBe('INVALID_URL');
      }
    });

    it('rejects insecure HTTP protocols with INSECURE_PROTOCOL', () => {
      const insecureUrl = 'http://script.google.com/macros/s/AKfycbx_staging_12345/exec';
      const res = validateUpstreamEndpoint(insecureUrl);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('INSECURE_PROTOCOL');
    });

    it('rejects non-Google hosts with INVALID_HOST', () => {
      const hostileUrl = 'https://malicious-proxy.com/macros/s/AKfycbx_staging_12345/exec';
      const res = validateUpstreamEndpoint(hostileUrl);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('INVALID_HOST');
    });

    it('rejects invalid URL paths with INVALID_PATH', () => {
      const invalidPaths = [
        'https://script.google.com/macros/s/exec',
        'https://script.google.com/macros/s/AKfycbx_staging_12345/dev',
        'https://script.google.com/home/projects/AKfycbx_staging_12345/edit',
      ];
      for (const url of invalidPaths) {
        const res = validateUpstreamEndpoint(url);
        expect(res.valid).toBe(false);
        expect(res.code).toBe('INVALID_PATH');
      }
    });

    it('rejects credentials and secrets in query parameters with QUERY_SECRET_PROHIBITED', () => {
      const urlsWithSecrets = [
        'https://script.google.com/macros/s/AKfycbx_staging_12345/exec?secret=my-secret-token',
        'https://script.google.com/macros/s/AKfycbx_staging_12345/exec?key=api-key-12345',
        'https://script.google.com/macros/s/AKfycbx_staging_12345/exec?token=bearer-token',
        'https://script.google.com/macros/s/AKfycbx_staging_12345/exec?auth=some-auth',
        'https://script.google.com/macros/s/AKfycbx_staging_12345/exec?webhookSecret=shared-secret',
      ];
      for (const url of urlsWithSecrets) {
        const res = validateUpstreamEndpoint(url);
        expect(res.valid).toBe(false);
        expect(res.code).toBe('QUERY_SECRET_PROHIBITED');
      }
    });

    it('in staging environment, rejects operational Apps Script deployment IDs with OPERATIONAL_DESTINATION_REJECTED', () => {
      const operationalDeploymentId = OPERATIONAL_APPS_SCRIPT_DEPLOYMENT_IDS[0];
      const operationalUrl = `https://script.google.com/macros/s/${operationalDeploymentId}/exec`;

      const res = validateUpstreamEndpoint(operationalUrl, 'staging');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('OPERATIONAL_DESTINATION_REJECTED');
      expect(res.error).toContain('Staging environment rejected targeting operational Apps Script deployment ID');
    });

    it('in staging environment, permits valid isolated non-operational deployment ID', () => {
      const stagingUrl = 'https://script.google.com/macros/s/AKfycbx_staging_isolated_deploy_99999/exec';
      const res = validateUpstreamEndpoint(stagingUrl, 'staging');
      expect(res.valid).toBe(true);
      expect(res.deploymentId).toBe('AKfycbx_staging_isolated_deploy_99999');
    });

    it('in production environment, permits operational deployment ID without unconditional deny', () => {
      const operationalDeploymentId = OPERATIONAL_APPS_SCRIPT_DEPLOYMENT_IDS[0];
      const operationalUrl = `https://script.google.com/macros/s/${operationalDeploymentId}/exec`;

      const res = validateUpstreamEndpoint(operationalUrl, 'production');
      expect(res.valid).toBe(true);
      expect(res.deploymentId).toBe(operationalDeploymentId);
    });
  });

  describe('CanonicalSubmissionAdapterService Staging Guard', () => {
    it('fails closed with OPERATIONAL_DESTINATION_REJECTED when staging targets operational deployment', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.APP_ENV = 'staging';
      delete process.env.E2E_ALLOW_LOCAL_MOCK;
      process.env.APPS_SCRIPT_URL = `https://script.google.com/macros/s/${OPERATIONAL_APPS_SCRIPT_DEPLOYMENT_IDS[0]}/exec`;
      process.env.WEBHOOK_SECRET = 'valid-staging-secret';

      const configCheck = canonicalSubmissionAdapter.checkConfiguration('write');
      expect(configCheck.valid).toBe(false);
      expect(configCheck.errorResponse?.code).toBe('OPERATIONAL_DESTINATION_REJECTED');
      expect(configCheck.errorResponse?.statusCode).toBe(503);

      // Verify createSubmission fails closed before network fetch
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const createRes = await canonicalSubmissionAdapter.createSubmission({
        payload: {
          uniqueId: 'BEN-STAGING-001',
          demographics: {
            childName: 'Staging Child',
            dob: '2016-01-01',
            gender: 'Male',
            caregiverName: 'Caregiver',
            caregiverRelationship: 'Mother',
            caregiverPhone: '9876543210',
            district: 'District 1',
            state: 'State 1',
          },
        } as any,
        idempotencyKey: 'idemp-staging-001',
        requestId: 'req-staging-001',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(createRes.status).toBe('error');
      expect(createRes.statusCode).toBe(503);
      expect(createRes.code).toBe('OPERATIONAL_DESTINATION_REJECTED');
    });

    it('passes checkConfiguration in staging when explicit isolated endpoint and secret are provided', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.APP_ENV = 'staging';
      delete process.env.E2E_ALLOW_LOCAL_MOCK;
      process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_staging_isolated_deploy_12345/exec';
      process.env.WEBHOOK_SECRET = 'valid-staging-secret';

      const configCheck = canonicalSubmissionAdapter.checkConfiguration('write');
      expect(configCheck.valid).toBe(true);
    });

    it('passes checkConfiguration in production when operational endpoint and secret are provided', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.APP_ENV = 'production';
      delete process.env.E2E_ALLOW_LOCAL_MOCK;
      process.env.APPS_SCRIPT_URL = `https://script.google.com/macros/s/${OPERATIONAL_APPS_SCRIPT_DEPLOYMENT_IDS[0]}/exec`;
      process.env.WEBHOOK_SECRET = 'valid-production-secret';

      const configCheck = canonicalSubmissionAdapter.checkConfiguration('write');
      expect(configCheck.valid).toBe(true);
    });

    it('fails closed with CONFIGURATION_ERROR when WEBHOOK_SECRET is missing in staging', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.APP_ENV = 'staging';
      delete process.env.E2E_ALLOW_LOCAL_MOCK;
      process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_staging_isolated_deploy_12345/exec';
      delete process.env.WEBHOOK_SECRET;
      delete process.env.APPS_SCRIPT_WEBHOOK_SECRET;
      delete process.env.WEBHOOK_SHARED_SECRET;

      const configCheck = canonicalSubmissionAdapter.checkConfiguration('write');
      expect(configCheck.valid).toBe(false);
      expect(configCheck.errorResponse?.code).toBe('CONFIGURATION_ERROR');
      expect(configCheck.errorResponse?.statusCode).toBe(503);
    });

    it('fails closed when APPS_SCRIPT_URL contains query parameters with secrets', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.APP_ENV = 'staging';
      delete process.env.E2E_ALLOW_LOCAL_MOCK;
      process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_staging_isolated_deploy_12345/exec?secret=leaked';
      process.env.WEBHOOK_SECRET = 'valid-staging-secret';

      const configCheck = canonicalSubmissionAdapter.checkConfiguration('write');
      expect(configCheck.valid).toBe(false);
      expect(configCheck.errorResponse?.code).toBe('QUERY_SECRET_PROHIBITED');
      expect(configCheck.errorResponse?.statusCode).toBe(503);
    });
  });
});
