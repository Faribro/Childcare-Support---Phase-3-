#!/usr/bin/env node
/**
 * scripts/test-whatsapp-webhook.mjs
 *
 * Synthetic Test Script for WhatsApp Cloud API Webhook Receiver.
 *
 * Supports both Next.js App Router route and Zoho Catalyst Advanced I/O adapter.
 *
 * Usage:
 *   node scripts/test-whatsapp-webhook.mjs [options] [positionalUrl] [verifyToken] [appSecret]
 *
 * Options:
 *   --url=<fullUrl>        Full target URL (e.g. http://127.0.0.1:3000/api/integrations/whatsapp/webhook)
 *   --base=<baseUrl>      Base host/port (defaults to http://localhost:3000)
 *   --path=<path>         Path suffix (defaults to /api/integrations/whatsapp/webhook)
 *   --verify-token=<tok>  Verify token (defaults to WHATSAPP_WEBHOOK_VERIFY_TOKEN env or synthetic)
 *   --secret=<appSecret>  Meta App Secret (defaults to META_APP_SECRET env or synthetic)
 *   --scenario=<type>     Test scenario: all | handshake | message | status | failure | tampered | overflow
 *   --help                Show usage instructions
 */

import crypto from 'crypto';

// Parse command line arguments
const args = process.argv.slice(2);

let fullUrlArg = null;
let baseUrlArg = 'http://localhost:3000';
let pathArg = '/api/integrations/whatsapp/webhook';
let verifyTokenArg = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'test_verify_token_123';
let appSecretArg = process.env.META_APP_SECRET || 'test_meta_app_secret_abc123';
let scenarioArg = 'all';

const positionalArgs = [];

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    console.log(`
WhatsApp Webhook Synthetic Test Runner
---------------------------------------
Options:
  --url=<fullUrl>        Target exact URL (e.g. http://127.0.0.1:5000/server/whatsapp_webhook/)
  --base=<baseUrl>      Base server URL (default: http://localhost:3000)
  --path=<path>         Webhook path (default: /api/integrations/whatsapp/webhook)
  --verify-token=<tok>  Verify token (env: WHATSAPP_WEBHOOK_VERIFY_TOKEN)
  --secret=<appSecret>  Meta App Secret (env: META_APP_SECRET)
  --scenario=<type>     Scenario: all | handshake | message | status | failure | tampered | overflow
    `);
    process.exit(0);
  } else if (arg.startsWith('--url=')) {
    fullUrlArg = arg.slice(6);
  } else if (arg.startsWith('--base=')) {
    baseUrlArg = arg.slice(7);
  } else if (arg.startsWith('--path=')) {
    pathArg = arg.slice(7);
  } else if (arg.startsWith('--verify-token=')) {
    verifyTokenArg = arg.slice(15);
  } else if (arg.startsWith('--secret=')) {
    appSecretArg = arg.slice(9);
  } else if (arg.startsWith('--scenario=')) {
    scenarioArg = arg.slice(11).toLowerCase();
  } else if (!arg.startsWith('--')) {
    positionalArgs.push(arg);
  }
}

// Backward compatibility with positional arguments
if (positionalArgs.length > 0 && !fullUrlArg) {
  const first = positionalArgs[0];
  try {
    const parsed = new URL(first);
    if (parsed.pathname && parsed.pathname !== '/') {
      fullUrlArg = first;
    } else {
      baseUrlArg = first;
    }
  } catch {
    baseUrlArg = first;
  }
}
if (positionalArgs.length > 1) {
  verifyTokenArg = positionalArgs[1];
}
if (positionalArgs.length > 2) {
  appSecretArg = positionalArgs[2];
}

const TARGET_URL = fullUrlArg || `${baseUrlArg.replace(/\/$/, '')}${pathArg.startsWith('/') ? pathArg : `/${pathArg}`}`;

console.log('--- WhatsApp Webhook Synthetic Test Runner ---');
console.log(`Target URL:   ${TARGET_URL}`);
console.log(`Scenario:     ${scenarioArg.toUpperCase()}`);
console.log(`Verify Token: [CONFIGURED: ${verifyTokenArg.length} chars]`);
console.log(`App Secret:   [CONFIGURED: ${appSecretArg.length} chars]`);
console.log('-----------------------------------------------\n');

function computeHmacSha256(secret, payloadString) {
  return crypto.createHmac('sha256', secret).update(Buffer.from(payloadString, 'utf-8')).digest('hex');
}

// Scenarios definition
async function runHandshakeTest() {
  const testChallenge = `synth_challenge_${Date.now()}`;
  const params = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': verifyTokenArg,
    'hub.challenge': testChallenge,
  });

  const getRes = await fetch(`${TARGET_URL}${TARGET_URL.includes('?') ? '&' : '?'}${params.toString()}`);
  const getBody = await getRes.text();

  if (getRes.status === 200 && getBody === testChallenge) {
    console.log('✓ PASS: GET Handshake verification succeeded (Status 200, challenge echoed)');
    return true;
  } else {
    console.error(`✗ FAIL: GET Handshake failed. Status: ${getRes.status}, Body: ${getBody}`);
    return false;
  }
}

async function runMessageTest() {
  const messagePayload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1670497521174128',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: '1413691425156891',
              },
              contacts: [
                {
                  profile: { name: 'Synthetic Test User' },
                  wa_id: '919876543210',
                },
              ],
              messages: [
                {
                  from: '919876543210',
                  id: `wamid.TEST_${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: { body: 'Synthetic test inbound message' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const signature = computeHmacSha256(appSecretArg, messagePayload);
  const postRes = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${signature}`,
    },
    body: messagePayload,
  });

  const postData = await postRes.json().catch(() => ({}));
  if (postRes.status === 200 && postData.status === 'ok') {
    console.log('✓ PASS: POST Inbound Message payload accepted (Status 200, diagnostic sink recorded)');
    return true;
  } else {
    console.error(`✗ FAIL: POST Message payload failed. Status: ${postRes.status}, Body:`, postData);
    return false;
  }
}

async function runStatusTest() {
  const statusPayload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1670497521174128',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: '1413691425156891',
              },
              statuses: [
                {
                  id: `wamid.TEST_${Date.now()}`,
                  status: 'delivered',
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  recipient_id: '919876543210',
                  conversation: { id: 'conv-test-01', origin: { type: 'user_initiated' } },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const statusSig = computeHmacSha256(appSecretArg, statusPayload);
  const statusRes = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${statusSig}`,
    },
    body: statusPayload,
  });

  const statusData = await statusRes.json().catch(() => ({}));
  if (statusRes.status === 200 && statusData.status === 'ok') {
    console.log('✓ PASS: POST Status Update (Delivered) payload accepted (Status 200)');
    return true;
  } else {
    console.error(`✗ FAIL: POST Status Update payload failed. Status: ${statusRes.status}, Body:`, statusData);
    return false;
  }
}

async function runFailureTest() {
  const failurePayload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1670497521174128',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: '1413691425156891',
              },
              statuses: [
                {
                  id: `wamid.TEST_${Date.now()}`,
                  status: 'failed',
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  recipient_id: '919876543210',
                  errors: [
                    {
                      code: 131047,
                      title: 'Re-engagement message',
                      message: 'More than 24 hours have passed since the customer last replied to this number.',
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const failSig = computeHmacSha256(appSecretArg, failurePayload);
  const failRes = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${failSig}`,
    },
    body: failurePayload,
  });

  const failData = await failRes.json().catch(() => ({}));
  if (failRes.status === 200 && failData.status === 'ok') {
    console.log('✓ PASS: POST Status Failure (Error Code 131047) accepted and safely recorded (Status 200)');
    return true;
  } else {
    console.error(`✗ FAIL: POST Status Failure payload failed. Status: ${failRes.status}, Body:`, failData);
    return false;
  }
}

async function runTamperedSignatureTest() {
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '1670497521174128', changes: [] }],
  });

  const tamperedSig = 'a'.repeat(64);
  const rejectRes = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${tamperedSig}`,
    },
    body: payload,
  });

  if (rejectRes.status === 401) {
    console.log('✓ PASS: POST Tampered Signature rejected with HTTP 401 Unauthorized');
    return true;
  } else {
    console.error(`✗ FAIL: POST Tampered Signature should return 401, got ${rejectRes.status}`);
    return false;
  }
}

async function runOverflowTest() {
  // 257 KB buffer (> 256 KB MAX_RAW_BODY_SIZE)
  const oversizedBuffer = Buffer.alloc(257 * 1024, 0x20); // 257 KB spaces
  const sig = computeHmacSha256(appSecretArg, oversizedBuffer);

  const overflowRes = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': oversizedBuffer.length.toString(),
      'X-Hub-Signature-256': `sha256=${sig}`,
    },
    body: oversizedBuffer,
  });

  if (overflowRes.status === 413) {
    console.log('✓ PASS: POST Oversized Payload (>256 KB) rejected with HTTP 413 Payload Too Large');
    return true;
  } else {
    console.error(`✗ FAIL: POST Oversized Payload should return 413, got ${overflowRes.status}`);
    return false;
  }
}

async function run() {
  let passed = 0;
  let failed = 0;

  const scenariosToRun = [];

  if (scenarioArg === 'all') {
    scenariosToRun.push(
      { name: 'GET Handshake', fn: runHandshakeTest },
      { name: 'POST Inbound Message', fn: runMessageTest },
      { name: 'POST Status Delivered', fn: runStatusTest },
      { name: 'POST Status Failure', fn: runFailureTest },
      { name: 'POST Tampered Signature', fn: runTamperedSignatureTest },
      { name: 'POST Overflow >256KB', fn: runOverflowTest }
    );
  } else if (scenarioArg === 'handshake') {
    scenariosToRun.push({ name: 'GET Handshake', fn: runHandshakeTest });
  } else if (scenarioArg === 'message') {
    scenariosToRun.push({ name: 'POST Inbound Message', fn: runMessageTest });
  } else if (scenarioArg === 'status') {
    scenariosToRun.push({ name: 'POST Status Delivered', fn: runStatusTest });
  } else if (scenarioArg === 'failure') {
    scenariosToRun.push({ name: 'POST Status Failure', fn: runFailureTest });
  } else if (scenarioArg === 'tampered') {
    scenariosToRun.push({ name: 'POST Tampered Signature', fn: runTamperedSignatureTest });
  } else if (scenarioArg === 'overflow') {
    scenariosToRun.push({ name: 'POST Overflow >256KB', fn: runOverflowTest });
  } else {
    console.error(`Unknown scenario: ${scenarioArg}`);
    process.exit(1);
  }

  for (const scenario of scenariosToRun) {
    try {
      const ok = await scenario.fn();
      if (ok) passed++;
      else failed++;
    } catch (err) {
      console.error(`✗ ERROR in ${scenario.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run();
