/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['argon2', 'hash-wasm', 'nodemailer'],
    outputFileTracingIncludes: {
      '/api/geocode/reverse': ['./public/data/india-pincodes.json.gz'],
    },
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
