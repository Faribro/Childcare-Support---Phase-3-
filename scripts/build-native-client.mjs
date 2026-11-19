#!/usr/bin/env node

/**
 * scripts/build-native-client.mjs
 *
 * Deterministic, cross-platform build script for Capacitor native Android client.
 *
 * Requirements & Invariants:
 * 1. ZERO hardcoded staging or production URLs inside client runtime source.
 * 2. Strict environment binding:
 *    - staging: https://csc-staging-963330210821.asia-south1.run.app
 *    - production: https://childcare.allianceindia.org
 *    - development / local: http://10.0.2.2:3000 (Android emulator host loopback)
 * 3. Fail closed if target environment or API base URL is missing.
 * 4. Build-time security guards:
 *    - Rejects production build if API base URL contains staging identifier.
 *    - Rejects staging build if API base URL points to production domain.
 * 5. Supports --sync to automatically run `npx cap sync android`.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
let targetEnv = '';
let shouldSync = false;
let customApiBase = '';

for (const arg of args) {
  if (arg.startsWith('--env=')) {
    targetEnv = arg.split('=')[1].trim().toLowerCase();
  } else if (arg === '--sync') {
    shouldSync = true;
  } else if (arg.startsWith('--api-base=')) {
    customApiBase = arg.split('=')[1].trim();
  }
}

// Fallback to ambient environment variables if not passed as CLI flags
if (!targetEnv) {
  targetEnv = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || '').trim().toLowerCase();
}

const CANONICAL_ENV_URLS = {
  staging: 'https://csc-staging-963330210821.asia-south1.run.app',
  production: 'https://childcare.allianceindia.org',
  development: 'http://10.0.2.2:3000',
  local: 'http://10.0.2.2:3000',
};

const resolvedApiBase =
  customApiBase ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  CANONICAL_ENV_URLS[targetEnv] ||
  '';

console.log('================================================================');
console.log('CAPACITOR NATIVE CLIENT BUILD & VERIFICATION');
console.log(`Target Environment: ${targetEnv || '(UNSET)'}`);
console.log(`API Base URL:       ${resolvedApiBase || '(UNSET - FAIL CLOSED)'}`);
console.log(`Capacitor Sync:     ${shouldSync ? 'ENABLED' : 'DISABLED'}`);
console.log('================================================================');

// 1. Fail closed if API base URL is missing
if (!resolvedApiBase) {
  console.error('\n❌ ERROR [Build Guard:FAIL_CLOSED]');
  console.error('Native client build requires an explicit environment or API base URL.');
  console.error('Silent fallbacks are strictly prohibited.\n');
  console.error('Usage:');
  console.error('  node scripts/build-native-client.mjs --env=staging [--sync]');
  console.error('  node scripts/build-native-client.mjs --env=production [--sync]');
  console.error('  node scripts/build-native-client.mjs --env=development [--sync]');
  console.error('  NEXT_PUBLIC_API_BASE_URL=<url> node scripts/build-native-client.mjs [--sync]\n');
  process.exit(1);
}

// 2. Build-time security guards
if (targetEnv === 'production') {
  if (resolvedApiBase.includes('staging') || resolvedApiBase.includes('csc-staging')) {
    console.error('\n❌ SECURITY VIOLATION [Build Guard:PROD_STAGING_LEAK]');
    console.error(`Production native build cannot point to a staging URL: "${resolvedApiBase}"\n`);
    process.exit(1);
  }
}

if (targetEnv === 'staging') {
  if (resolvedApiBase.includes('childcare.allianceindia.org')) {
    console.error('\n❌ SECURITY VIOLATION [Build Guard:STAGING_PROD_LEAK]');
    console.error(`Staging native build cannot point to production domain: "${resolvedApiBase}"\n`);
    process.exit(1);
  }
}

// 3. Set environment variables for Vite
const env = {
  ...process.env,
  APP_ENV: targetEnv || 'staging',
  NEXT_PUBLIC_APP_ENV: targetEnv || 'staging',
  NEXT_PUBLIC_API_BASE_URL: resolvedApiBase,
  NODE_ENV: 'production',
};

// 4. Run Vite Build
console.log('\n[1/2] Compiling native client assets with Vite...');
const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const viteResult = spawnSync(npxCmd, ['vite', 'build', '--config', 'vite.native.config.ts'], {
  cwd: rootDir,
  env,
  stdio: 'inherit',
  shell: isWindows,
});

if (viteResult.status !== 0) {
  console.error('\n❌ Vite native build failed with status code:', viteResult.status);
  process.exit(viteResult.status || 1);
}

console.log('✓ Vite native compilation completed successfully.');

// 5. Capacitor Android Sync (if requested)
if (shouldSync) {
  console.log('\n[2/2] Synchronizing assets to Android project (npx cap sync android)...');
  const capResult = spawnSync(npxCmd, ['cap', 'sync', 'android'], {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    shell: isWindows,
  });

  if (capResult.status !== 0) {
    console.error('\n❌ Capacitor Android sync failed with status code:', capResult.status);
    process.exit(capResult.status || 1);
  }
  console.log('✓ Capacitor Android sync completed successfully.');
}

console.log('\n================================================================');
console.log('NATIVE CLIENT BUILD COMPLETED SUCCESSFULLY');
console.log(`Environment: ${targetEnv} | Base URL: ${resolvedApiBase}`);
console.log('================================================================\n');
