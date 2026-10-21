#!/usr/bin/env node

/**
 * scripts/package-catalyst-adapter.mjs
 *
 * Reproducible Packaging Script for Zoho Catalyst Advanced I/O Webhook Adapter.
 *
 * Requirements & Invariants:
 * 1. ZERO deployment-dependent symlinks: compiled standalone CommonJS modules.
 * 2. Reuses canonical PR #84 security logic directly from src/lib/server/ without drift.
 * 3. Compiles via TypeScript compiler API (ts.transpileModule) deterministically.
 * 4. Generates Catalyst project manifest (catalyst.json) and function manifest (catalyst-config.json).
 * 5. Supports both Express (if available) and vanilla Node.js HTTP request listener runtimes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const serverLibDir = path.join(rootDir, 'src', 'lib', 'server');
const functionDir = path.join(rootDir, 'functions', 'whatsapp_webhook');
const catalystJsonPath = path.join(rootDir, 'catalyst.json');
const catalystConfigPath = path.join(functionDir, 'catalyst-config.json');
const packageJsonPath = path.join(functionDir, 'package.json');
const readmePath = path.join(functionDir, 'README.md');

console.log('[PACKAGE-CATALYST] Starting reproducible packaging for Catalyst Advanced I/O adapter...');

// 1. Ensure target directory structure exists
fs.mkdirSync(functionDir, { recursive: true });

// 2. TypeScript compilation settings
const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  removeComments: false,
  esModuleInterop: true,
};

function transpileFile(srcRelativePath, destFileName, postProcess = null) {
  const fullSrcPath = path.join(serverLibDir, srcRelativePath);
  if (!fs.existsSync(fullSrcPath)) {
    throw new Error(`Source file missing: ${fullSrcPath}`);
  }

  const sourceContent = fs.readFileSync(fullSrcPath, 'utf8');
  const result = ts.transpileModule(sourceContent, {
    compilerOptions,
    fileName: srcRelativePath,
  });

  let outputText = result.outputText;
  if (typeof postProcess === 'function') {
    outputText = postProcess(outputText);
  }

  const destPath = path.join(functionDir, destFileName);
  fs.writeFileSync(destPath, outputText, 'utf8');
  console.log(`[PACKAGE-CATALYST] Compiled ${srcRelativePath} -> functions/whatsapp_webhook/${destFileName} (${Buffer.byteLength(outputText)} bytes)`);
}

// 3. Transpile shared security & parsing modules from PR #84
transpileFile('envConfig.ts', 'envConfig.js');
transpileFile('whatsappWebhookConfig.ts', 'whatsappWebhookConfig.js');
transpileFile('whatsappWebhookVerifier.ts', 'whatsappWebhookVerifier.js');
transpileFile('whatsappWebhookParser.ts', 'whatsappWebhookParser.js');
transpileFile('whatsappEventSink.ts', 'whatsappEventSink.js');

// 4. Transpile the Catalyst adapter and append the runtime wrapper
const runtimeWrapper = `
// --- Catalyst Advanced I/O Runtime Export ---
let exportedHandler = exports.catalystWebhookHandler;
try {
  // If Express is provided or installed, mount on Express router
  const express = require('express');
  const app = express();
  app.all('*', (req, res, next) => exports.catalystWebhookHandler(req, res, next));
  exportedHandler = app;
} catch {
  // Fall back to vanilla Node.js HTTP request listener
  exportedHandler = exports.catalystWebhookHandler;
}

module.exports = exportedHandler;
module.exports.default = exportedHandler;
module.exports.catalystWebhookHandler = exports.catalystWebhookHandler;
module.exports.createCatalystWebhookHandler = exports.createCatalystWebhookHandler;
`;

transpileFile('catalystWebhookAdapter.ts', 'index.js', (code) => code + '\n' + runtimeWrapper);

// 5. Non-destructive update of root catalyst.json (preserves unrelated configuration)
let catalystJsonContent = {};
if (fs.existsSync(catalystJsonPath)) {
  try {
    catalystJsonContent = JSON.parse(fs.readFileSync(catalystJsonPath, 'utf8'));
  } catch {
    catalystJsonContent = {};
  }
}

catalystJsonContent.functions = catalystJsonContent.functions || {};
catalystJsonContent.functions.source = catalystJsonContent.functions.source || 'functions';
const existingTargets = Array.isArray(catalystJsonContent.functions.targets)
  ? catalystJsonContent.functions.targets
  : [];
if (!existingTargets.includes('whatsapp_webhook')) {
  catalystJsonContent.functions.targets = [...existingTargets, 'whatsapp_webhook'];
}
catalystJsonContent.functions.ignore = catalystJsonContent.functions.ignore || [
  'node_modules',
  '.git',
  '*.log',
  '.next',
  'dist',
  'coverage',
];
fs.writeFileSync(catalystJsonPath, JSON.stringify(catalystJsonContent, null, 2) + '\n', 'utf8');
console.log('[PACKAGE-CATALYST] Updated catalyst.json at repo root (preserved unrelated configuration)');

// 6. Generate function catalyst-config.json
const catalystConfigContent = {
  deployment: {
    name: 'whatsapp_webhook',
    stack: 'node18',
    type: 'advancedio',
    env_variables: {},
  },
  execution: {
    main: 'index.js',
  },
};
fs.writeFileSync(catalystConfigPath, JSON.stringify(catalystConfigContent, null, 2) + '\n', 'utf8');
console.log('[PACKAGE-CATALYST] Generated functions/whatsapp_webhook/catalyst-config.json');

// 7. Generate function package.json
const functionPackageJsonContent = {
  name: 'whatsapp_webhook',
  version: '1.0.0',
  description: 'Zoho Catalyst Advanced I/O adapter for Meta WhatsApp receive-only webhook',
  main: 'index.js',
  private: true,
  scripts: {
    test: 'node -e "const h = require(\'./index.js\'); console.log(\'Loaded handler successfully\');"',
  },
  dependencies: {},
  engines: {
    node: '>=18.0.0',
  },
};
fs.writeFileSync(packageJsonPath, JSON.stringify(functionPackageJsonContent, null, 2) + '\n', 'utf8');
console.log('[PACKAGE-CATALYST] Generated functions/whatsapp_webhook/package.json');

// 8. Generate documentation README.md inside function package
const readmeContent = `# Zoho Catalyst Advanced I/O Webhook Adapter

## Overview
This package is an isolated, receive-only Meta WhatsApp Cloud API webhook receiver implemented as a Zoho Catalyst **Advanced I/O** function.

It reuses the exact cryptographic verification, streaming bounds, and privacy redaction rules from PR #84 without maintaining divergent security implementations or using deployment-dependent symlinks.

## Runtime Architecture
- **Runtime Stack**: Node.js 18 (\`node18\` in \`catalyst-config.json\`)
- **Execution Model**: Advanced I/O (native HTTP request listener / Express-compatible)
- **Dependencies**: Zero runtime dependencies (uses native Node.js \`crypto\` and \`http\`)
- **Streaming Limit**: 256 KB hard ceiling with early stream cancellation and HTTP 413
- **HMAC Verification**: Timing-safe \`crypto.timingSafeEqual\` against raw payload bytes before JSON parsing
- **Privacy**: Strict zero-PII sanitization (no phone numbers, names, message text, or raw message IDs)

## Required Environment Variables
Configure these in the Catalyst Web Console under **Serverless > Functions > whatsapp_webhook > Configuration > Environment Variables**:
- \`WHATSAPP_WEBHOOK_ENABLED\`: \`true\` to activate; fail-closed default (\`false\`) returns HTTP 404.
- \`WHATSAPP_WEBHOOK_VERIFY_TOKEN\`: Shared secret for Meta GET handshake verification.
- \`META_APP_SECRET\`: Meta App Secret used for HMAC-SHA256 signature verification.

## Deployment Prerequisites
1. Zoho Catalyst CLI: \`npm install -g zcatalyst-cli\`
2. Authenticate CLI: \`catalyst login\`
3. Associate Project: \`catalyst project:use Project-Rainfall\`
4. Deploy Function: \`catalyst deploy --only functions:whatsapp_webhook\`
`;
fs.writeFileSync(readmePath, readmeContent, 'utf8');
console.log('[PACKAGE-CATALYST] Generated functions/whatsapp_webhook/README.md');

// 9. Self-test: Verify that packaged artifact can be imported cleanly
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

try {
  const packagedModule = require(path.join(functionDir, 'index.js'));
  if (typeof packagedModule.catalystWebhookHandler !== 'function') {
    throw new Error('Exported catalystWebhookHandler is not a function');
  }
  console.log('[PACKAGE-CATALYST] Verification passed: Packaged index.js loaded and verified successfully.');
} catch (err) {
  console.error('[PACKAGE-CATALYST] Verification failed:', err);
  process.exit(1);
}

console.log('[PACKAGE-CATALYST] Packaging complete. Artifact is self-contained and ready for local testing.');
