/**
 * Next.js Configuration
 *
 * BUILD-TIME ENVIRONMENT VALIDATION:
 * Next.js statically inlines `NEXT_PUBLIC_*` environment variables into client bundles at build time.
 * Staging and production MUST be built separately; promoting a compiled staging container image
 * directly to production would leak staging configurations into client-side code.
 */

const targetEnv = (
  process.env.APP_ENV ||
  process.env.TARGET_ENV ||
  process.env.BUILD_TARGET_ENV ||
  ''
).toLowerCase().trim();

const publicAppEnv = (
  process.env.NEXT_PUBLIC_APP_ENV ||
  ''
).toLowerCase().trim();

// When target environment is explicitly specified, enforce exact alignment with NEXT_PUBLIC_APP_ENV
if (targetEnv === 'staging' && publicAppEnv && publicAppEnv !== 'staging') {
  throw new Error(
    `[BUILD GUARD] Environment mismatch: target environment is "staging" but NEXT_PUBLIC_APP_ENV is "${publicAppEnv}". ` +
    `In Next.js, NEXT_PUBLIC_* variables are inlined at compile time. Staging and production images must be built separately.`
  );
}

if (targetEnv === 'production' && publicAppEnv && publicAppEnv !== 'production') {
  throw new Error(
    `[BUILD GUARD] Environment mismatch: target environment is "production" but NEXT_PUBLIC_APP_ENV is "${publicAppEnv}". ` +
    `In Next.js, NEXT_PUBLIC_* variables are inlined at compile time. Staging and production images must be built separately.`
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['argon2', 'hash-wasm', 'nodemailer'],
    outputFileTracingIncludes: {
      '/api/geocode/reverse': ['./public/data/india-pincodes.json.gz'],
    },
  },
  async headers() {
    return [
      {
        // Enforce anti-caching headers on all API and auth routes so Firebase Hosting passes Set-Cookie through
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, no-cache, max-age=0, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/assessment/unfinished',
        destination: '/assessment/drafts',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
