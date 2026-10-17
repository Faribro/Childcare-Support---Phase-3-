/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['argon2', 'hash-wasm', 'nodemailer'],
  },
};

export default nextConfig;
