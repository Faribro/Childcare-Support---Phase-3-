import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { platformRegistry } from '@/lib/platform/platformRegistry';

describe('Native API Configuration & Environment Boundary Security Guards', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    platformRegistry.reset();
  });

  afterEach(() => {
    process.env = originalEnv;
    platformRegistry.reset();
  });

  it('1. Web platform defaults to relative URLs when base URL is omitted (browser origin dispatch)', () => {
    platformRegistry.configure({ target: 'web', apiBaseUrl: '' });
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    const resolved = platformRegistry.resolveUrl('/api/auth/login');
    expect(resolved).toBe('/api/auth/login');
  });

  it('2. Web platform prepends base URL when explicitly configured', () => {
    platformRegistry.configure({ target: 'web', apiBaseUrl: 'https://custom-proxy.internal' });

    const resolved = platformRegistry.resolveUrl('/api/auth/login');
    expect(resolved).toBe('https://custom-proxy.internal/api/auth/login');
  });

  it('3. Native Android platform FAILS CLOSED if no API base URL is provided', () => {
    platformRegistry.configure({ target: 'android', apiBaseUrl: '' });
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(() => {
      platformRegistry.resolveUrl('/api/auth/field-user/complete-onboarding');
    }).toThrowError(/\[PlatformRegistry:CRITICAL\] Native API base URL is not configured/);
  });

  it('4. Native Android platform in staging resolves staging Cloud Run URL', () => {
    process.env.APP_ENV = 'staging';
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://csc-staging-963330210821.asia-south1.run.app';

    platformRegistry.configure({
      target: 'android',
      apiBaseUrl: 'https://csc-staging-963330210821.asia-south1.run.app',
    });

    const resolved = platformRegistry.resolveUrl('/api/auth/field-user/email-otp/verify');
    expect(resolved).toBe(
      'https://csc-staging-963330210821.asia-south1.run.app/api/auth/field-user/email-otp/verify'
    );
  });

  it('5. Native Android platform in production resolves production URL', () => {
    process.env.APP_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://childcare.allianceindia.org';

    platformRegistry.configure({
      target: 'android',
      apiBaseUrl: 'https://childcare.allianceindia.org',
    });

    const resolved = platformRegistry.resolveUrl('/api/auth/field-user/email-otp/verify');
    expect(resolved).toBe(
      'https://childcare.allianceindia.org/api/auth/field-user/email-otp/verify'
    );
  });

  it('6. Native Android platform in development resolves Android emulator host loopback (10.0.2.2:3000)', () => {
    process.env.APP_ENV = 'development';
    process.env.NEXT_PUBLIC_APP_ENV = 'development';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://10.0.2.2:3000';

    platformRegistry.configure({
      target: 'android',
      apiBaseUrl: 'http://10.0.2.2:3000',
    });

    const resolved = platformRegistry.resolveUrl('/api/submissions');
    expect(resolved).toBe('http://10.0.2.2:3000/api/submissions');
  });

  it('7. Production native build rejects staging Cloud Run URL (Boundary Guard)', () => {
    process.env.APP_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';

    platformRegistry.configure({
      target: 'android',
      apiBaseUrl: 'https://csc-staging-963330210821.asia-south1.run.app',
    });

    expect(() => {
      platformRegistry.resolveUrl('/api/submissions');
    }).toThrowError(/\[PlatformRegistry:SECURITY_VIOLATION\] Production native build rejected/);
  });

  it('8. Staging native build rejects production domain URL (Boundary Guard)', () => {
    process.env.APP_ENV = 'staging';
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';

    platformRegistry.configure({
      target: 'android',
      apiBaseUrl: 'https://childcare.allianceindia.org',
    });

    expect(() => {
      platformRegistry.resolveUrl('/api/submissions');
    }).toThrowError(/\[PlatformRegistry:SECURITY_VIOLATION\] Staging native build rejected/);
  });

  it('9. Resolves paths cleanly with or without leading slashes', () => {
    process.env.APP_ENV = 'staging';
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';

    platformRegistry.configure({
      target: 'android',
      apiBaseUrl: 'https://csc-staging-963330210821.asia-south1.run.app/',
    });

    const withSlash = platformRegistry.resolveUrl('/api/health');
    const withoutSlash = platformRegistry.resolveUrl('api/health');

    expect(withSlash).toBe('https://csc-staging-963330210821.asia-south1.run.app/api/health');
    expect(withoutSlash).toBe('https://csc-staging-963330210821.asia-south1.run.app/api/health');
  });
});
