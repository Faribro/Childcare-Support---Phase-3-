import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Environment resolution & build-time fail-closed validation
const appEnv = (
  process.env.APP_ENV ||
  process.env.NEXT_PUBLIC_APP_ENV ||
  ''
).trim().toLowerCase();

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  ''
).trim();

// 1. Fail-closed: NEXT_PUBLIC_API_BASE_URL is mandatory for building the native client
if (!apiBaseUrl) {
  throw new Error(
    `[Build Guard:CRITICAL] Native client build failed: NEXT_PUBLIC_API_BASE_URL is required. ` +
    'Silent fallbacks to staging, production, localhost, or third-party domains are strictly prohibited. ' +
    'Set NEXT_PUBLIC_API_BASE_URL explicitly or use "npm run build:native-client:staging" / "npm run build:native-client:prod".'
  );
}

// 2. Build-time security guard: Production native build cannot point to staging
if (appEnv === 'production') {
  if (apiBaseUrl.includes('staging') || apiBaseUrl.includes('csc-staging')) {
    throw new Error(
      `[Build Guard:SECURITY_VIOLATION] Production native build rejected: NEXT_PUBLIC_API_BASE_URL ("${apiBaseUrl}") contains staging identifier.`
    );
  }
}

// 3. Build-time security guard: Staging native build cannot point to production domain
if (appEnv === 'staging') {
  if (apiBaseUrl.includes('childcare.allianceindia.org')) {
    throw new Error(
      `[Build Guard:SECURITY_VIOLATION] Staging native build rejected: NEXT_PUBLIC_API_BASE_URL ("${apiBaseUrl}") points to production domain.`
    );
  }
}

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/native'),
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/navigation': path.resolve(__dirname, './src/native/shims/next-navigation.ts'),
      'next/link': path.resolve(__dirname, './src/native/shims/next-link.tsx'),
      'next/image': path.resolve(__dirname, './src/native/shims/next-image.tsx'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-client'),
    emptyOutDir: true,
    sourcemap: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env.NEXT_PUBLIC_BUILD_TARGET': JSON.stringify('native-client'),
    'process.env.NEXT_PUBLIC_APP_ENV': JSON.stringify(appEnv || 'staging'),
    'process.env.NEXT_PUBLIC_API_BASE_URL': JSON.stringify(apiBaseUrl),
    'process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS': JSON.stringify(
      process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS || ''
    ),
  },
});
