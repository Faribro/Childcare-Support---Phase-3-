#!/usr/bin/env node
/**
 * Synthetic Test Script for WhatsApp Cloud API Webhook Endpoint.
 *
 * Demonstrates and verifies:
 * 1. GET Handshake with hub.mode, hub.verify_token, and hub.challenge
 * 2. POST Message Notification with valid X-Hub-Signature-256 HMAC-SHA256
 * 3. POST Status Update Notification with valid HMAC-SHA256
 * 4. POST with tampered signature (verifying 401 Unauthorized rejection)
 *
 * Usage:
 *   node scripts/test-whatsapp-webhook.mjs [baseUrl] [verifyToken] [appSecret]
 *
 * Default baseUrl: http://localhost:3000
 */

import crypto from 'crypto';

const BASE_URL = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const VERIFY_TOKEN = process.argv[3] || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'test_verify_token_123';
const APP_SECRET = process.argv[4] || process.env.META_APP_SECRET || 'test_meta_app_secret_abc123';

const WEBHOOK_URL = `${BASE_URL.replace(/\/$/, '')}/api/integrations/whatsapp/webhook`;

console.log('--- WhatsApp Webhook Synthetic Test Runner ---');
console.log(`Endpoint:     ${WEBHOOK_URL}`);
console.log(`Verify Token: [CONFIGURED: ${VERIFY_TOKEN.length} chars]`);
console.log(`App Secret:   [CONFIGURED: ${APP_SECRET.length} chars]`);
console.log('-----------------------------------------------\n');

function computeHmacSha256(secret, payloadString) {
  return crypto.createHmac('sha256', secret).update(Buffer.from(payloadString, 'utf-8')).digest('hex');
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: GET Handshake verification
  try {
    const testChallenge = `challenge_${Date.now()}`;
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': testChallenge,
    });

    const getRes = await fetch(`${WEBHOOK_URL}?${params.toString()}`);
    const getBody = await getRes.text();

    if (getRes.status === 200 && getBody === testChallenge) {
      console.log('✓ PASS: GET Handshake verification succeeded (Status 200, challenge echoed)');
      passed++;
    } else {
      console.error(`✗ FAIL: GET Handshake failed. Status: ${getRes.status}, Body: ${getBody}`);
      failed++;
    }
  } catch (err) {
    console.error(`✗ ERROR: GET Handshake encountered network error: ${err.message}`);
    failed++;
  }

  // Test 2: POST Valid Message Payload
  try {
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

    const signature = computeHmacSha256(APP_SECRET, messagePayload);

    const postRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`,
      },
      body: messagePayload,
    });

    const postData = await postRes.json().catch(() => ({}));

    if (postRes.status === 200 && postData.status === 'ok') {
      console.log('✓ PASS: POST Valid Message payload accepted (Status 200, sink recorded)');
      passed++;
    } else {
      console.error(`✗ FAIL: POST Message payload failed. Status: ${postRes.status}, Body:`, postData);
      failed++;
    }
  } catch (err) {
    console.error(`✗ ERROR: POST Message payload encountered network error: ${err.message}`);
    failed++;
  }

  // Test 3: POST Status Update Payload (Delivery Receipt)
  try {
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

    const statusSig = computeHmacSha256(APP_SECRET, statusPayload);

    const statusRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${statusSig}`,
      },
      body: statusPayload,
    });

    const statusData = await statusRes.json().catch(() => ({}));

    if (statusRes.status === 200 && statusData.status === 'ok') {
      console.log('✓ PASS: POST Status Update payload accepted (Status 200, delivery receipt recorded)');
      passed++;
    } else {
      console.error(`✗ FAIL: POST Status Update payload failed. Status: ${statusRes.status}, Body:`, statusData);
      failed++;
    }
  } catch (err) {
    console.error(`✗ ERROR: POST Status Update payload encountered network error: ${err.message}`);
    failed++;
  }

  // Test 4: POST Tampered Signature Rejection
  try {
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: '1670497521174128', changes: [] }],
    });

    // Deliberately incorrect signature
    const tamperedSig = 'a'.repeat(64);

    const rejectRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${tamperedSig}`,
      },
      body: payload,
    });

    if (rejectRes.status === 401) {
      console.log('✓ PASS: POST Tampered Signature rejected with HTTP 401 Unauthorized');
      passed++;
    } else {
      console.error(`✗ FAIL: POST Tampered Signature should return 401, got ${rejectRes.status}`);
      failed++;
    }
  } catch (err) {
    console.error(`✗ ERROR: POST Tampered Signature test encountered network error: ${err.message}`);
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
