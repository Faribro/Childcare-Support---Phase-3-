import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
    'process.env.NEXT_PUBLIC_APP_ENV': JSON.stringify('production'),
    'process.env.NEXT_PUBLIC_API_BASE_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_API_BASE_URL || 'https://childcare-support-phase-3-peqat23bz-hashcode1.vercel.app'
    ),
    'process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS': JSON.stringify(
      process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS || ''
    ),
  },
});
