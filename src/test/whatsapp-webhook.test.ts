import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { GET, POST } from '@/app/api/integrations/whatsapp/webhook/route';
import {
  clearDiagnosticEvents,
  getRecentDiagnosticEvents,
  getDiagnosticSinkStats,
  recordDiagnosticEvent,
} from '@/lib/server/whatsappEventSink';
import {
  extractMinimalDiagnostics,
  MAX_RAW_BODY_SIZE,
  readBoundedRawBody,
} from '@/lib/server/whatsappWebhookParser';
import { verifyWebhookHandshake, verifyWebhookSignature } from '@/lib/server/whatsappWebhookVerifier';

describe('Meta WhatsApp Cloud API Webhook Integration (Pre-Deployment Hardening)', () => {
  const TEST_VERIFY_TOKEN = 'synthetic_verify_token_secure_xyz_789';
  const TEST_APP_SECRET = 'synthetic_meta_app_secret_1234567890abcdef';

  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    process.env.META_APP_SECRET = TEST_APP_SECRET;
    clearDiagnosticEvents();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    clearDiagnosticEvents();
    vi.restoreAllMocks();
  });

  function computeHmacSignature(secret: string, body: string | Buffer): string {
    const raw = typeof body === 'string' ? Buffer.from(body, 'utf-8') : body;
    const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return `sha256=${digest}`;
  }

  // =========================================================================
  // 1. Request Size Limits & Stream Cancellation
  // =========================================================================
  describe('1. Request Size Limits & Stream Cancellation', () => {
    it('documents MAX_RAW_BODY_SIZE as 256 KB', () => {
      expect(MAX_RAW_BODY_SIZE).toBe(256 * 1024);
    });

    it('fast-rejects requests with oversized Content-Length header with HTTP 413 before reading body', async () => {
      const oversizedLength = (MAX_RAW_BODY_SIZE + 1024).toString();
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': oversizedLength,
          'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64),
        },
        body: 'small-body',
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects streamed requests exceeding 256 KB when Content-Length is missing', async () => {
      const oversizedBuffer = Buffer.alloc(MAX_RAW_BODY_SIZE + 1024, 65); // 257 KB of 'A'

      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64),
        },
        body: oversizedBuffer,
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects streamed requests where Content-Length is falsified/smaller than actual streamed bytes', async () => {
      const oversizedBuffer = Buffer.alloc(MAX_RAW_BODY_SIZE + 500, 66); // 256.5 KB

      // Falsified Content-Length says 100 bytes, but body sends >256 KB
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '100',
          'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64),
        },
        body: oversizedBuffer,
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('readBoundedRawBody terminates stream early on exceeding limit', async () => {
      const oversizedBuffer = Buffer.alloc(MAX_RAW_BODY_SIZE + 2048, 67);
      const req = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        body: oversizedBuffer,
      });

      const result = await readBoundedRawBody(req, MAX_RAW_BODY_SIZE);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(413);
        expect(result.code).toBe('PAYLOAD_TOO_LARGE');
      }
    });
  });

  // =========================================================================
  // 2. Configuration & Fail-Closed Guardrails
  // =========================================================================
  describe('2. Configuration & Fail-Closed Guardrails', () => {
    it('returns HTTP 404 on GET when WHATSAPP_WEBHOOK_ENABLED is false', async () => {
      process.env.WHATSAPP_WEBHOOK_ENABLED = 'false';
      const req = new NextRequest(
        `http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=test_123`
      );
      const res = await GET(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe('FEATURE_DISABLED');
    });

    it('returns HTTP 404 on GET when WHATSAPP_WEBHOOK_ENABLED is unset', async () => {
      delete process.env.WHATSAPP_WEBHOOK_ENABLED;
      const req = new NextRequest(
        `http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=test_123`
      );
      const res = await GET(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe('FEATURE_DISABLED');
    });

    it('returns HTTP 404 on POST when WHATSAPP_WEBHOOK_ENABLED is false', async () => {
      process.env.WHATSAPP_WEBHOOK_ENABLED = 'false';
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const signature = computeHmacSignature(TEST_APP_SECRET, payload);
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });
      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe('FEATURE_DISABLED');
    });

    it('returns HTTP 500 on GET when enabled but WHATSAPP_WEBHOOK_VERIFY_TOKEN is missing', async () => {
      delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      const req = new NextRequest(
        'http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=any&hub.challenge=test_123'
      );
      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.code).toBe('VERIFICATION_FAILED');
    });

    it('returns HTTP 500 on POST when enabled but META_APP_SECRET is missing', async () => {
      delete process.env.META_APP_SECRET;
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=' + 'a'.repeat(64),
        },
        body: payload,
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.code).toBe('SERVER_MISCONFIGURED');
    });
  });

  // =========================================================================
  // 3. GET Webhook Handshake Verification & Parameter Bounds
  // =========================================================================
  describe('3. GET Webhook Handshake Verification & Parameter Bounds', () => {
    it('returns HTTP 200 with raw challenge as plain text and non-cacheable headers on valid handshake', async () => {
      const challengeStr = '1158201444_meta_challenge';
      const req = new NextRequest(
        `http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=${challengeStr}`
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('cache-control')).toContain('no-cache');
      expect(res.headers.get('pragma')).toBe('no-cache');
      const text = await res.text();
      expect(text).toBe(challengeStr);
    });

    it('rejects handshake with HTTP 403 when verify_token does not match', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_123'
      );
      const res = await GET(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('VERIFICATION_FAILED');
      expect(json.message).toContain('Invalid hub.verify_token');
    });

    it('rejects handshake with HTTP 403 when hub.mode is not "subscribe"', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=unsubscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=test_123`
      );
      const res = await GET(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('VERIFICATION_FAILED');
    });

    it('bounds GET hub.mode length to max 64 characters', () => {
      const longMode = 'subscribe' + 'x'.repeat(60);
      const res = verifyWebhookHandshake(longMode, TEST_VERIFY_TOKEN, 'chal', TEST_VERIFY_TOKEN);
      expect(res.isValid).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toContain('hub.mode parameter exceeds maximum allowed length');
    });

    it('bounds GET hub.verify_token length to max 256 characters', () => {
      const longToken = 'x'.repeat(257);
      const res = verifyWebhookHandshake('subscribe', longToken, 'chal', TEST_VERIFY_TOKEN);
      expect(res.isValid).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toContain('hub.verify_token parameter exceeds maximum allowed length');
    });

    it('bounds GET hub.challenge length to max 512 characters', () => {
      const longChallenge = 'x'.repeat(513);
      const res = verifyWebhookHandshake('subscribe', TEST_VERIFY_TOKEN, longChallenge, TEST_VERIFY_TOKEN);
      expect(res.isValid).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toContain('hub.challenge parameter exceeds maximum allowed length');
    });
  });

  // =========================================================================
  // 4. POST Signature Verification & Malformed Inputs
  // =========================================================================
  describe('4. POST Signature Verification & Malformed Inputs', () => {
    it('rejects POST with HTTP 401 when X-Hub-Signature-256 header is missing', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('INVALID_SIGNATURE');
      expect(json.message).toContain('Missing X-Hub-Signature-256 header');
    });

    it('rejects POST with HTTP 401 when signature header format lacks sha256= prefix', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'a'.repeat(64),
        },
        body: payload,
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toContain('must start with sha256=');
    });

    it('rejects POST with HTTP 401 when signature hex digest length is not exactly 64 chars', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=bad_hex_length',
        },
        body: payload,
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toContain('64-character hexadecimal string');
    });

    it('rejects POST with HTTP 401 when signature does not match payload (tampered body)', async () => {
      const originalPayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const signature = computeHmacSignature(TEST_APP_SECRET, originalPayload);
      const tamperedPayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'tampered' }] });

      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
        },
        body: tamperedPayload,
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('INVALID_SIGNATURE');
    });

    it('rejects POST with HTTP 400 when body is signed but malformed JSON', async () => {
      const invalidJson = 'Not Valid JSON { [ missing bracket';
      const signature = computeHmacSignature(TEST_APP_SECRET, invalidJson);

      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
        },
        body: invalidJson,
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe('INVALID_JSON');
    });
  });

  // =========================================================================
  // 5. Minimal Diagnostics & Strict Absence of Sensitive Values / PII
  // =========================================================================
  describe('5. Minimal Diagnostics & Strict Absence of Sensitive Values / PII', () => {
    const REALISTIC_BENEFICIARY_PAYLOAD = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_1670497521174128',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '919876543210',
                  phone_number_id: 'phone_1413691425156891',
                },
                contacts: [
                  {
                    profile: { name: 'Sunita Sharma (Beneficiary Caregiver)' },
                    wa_id: '919876543210',
                  },
                ],
                messages: [
                  {
                    from: '919876543210',
                    id: 'wamid.HBgLMjU1NTk4NzY1NDM0FQIAEhggM0E2NTM4REI4',
                    timestamp: '1720000000',
                    type: 'text',
                    text: { body: 'Inquiring about ART nutritional food basket dispatch for child Rohan' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    it('extractMinimalDiagnostics completely excludes all phone numbers, names, message text, and IDs', () => {
      const correlationId = 'test-corr-id-12345';
      const diag = extractMinimalDiagnostics(REALISTIC_BENEFICIARY_PAYLOAD, correlationId);

      expect(diag.correlationId).toBe(correlationId);
      expect(diag.eventClass).toBe('message');
      expect(diag.entryCount).toBe(1);
      expect(diag.messageCount).toBe(1);
      expect(diag.statusCount).toBe(0);
      expect(diag.hasErrors).toBe(false);

      const serialized = JSON.stringify(diag);

      // Assert ABSOLUTE ABSENCE of phone numbers and fragments
      expect(serialized).not.toContain('9876543210');
      expect(serialized).not.toContain('3210');
      expect(serialized).not.toContain('91987654');

      // Assert ABSOLUTE ABSENCE of beneficiary names
      expect(serialized).not.toContain('Sunita');
      expect(serialized).not.toContain('Sharma');
      expect(serialized).not.toContain('Rohan');

      // Assert ABSOLUTE ABSENCE of message text and clinical terms
      expect(serialized).not.toContain('nutritional');
      expect(serialized).not.toContain('basket');
      expect(serialized).not.toContain('ART');

      // Assert ABSOLUTE ABSENCE of raw WhatsApp message ID
      expect(serialized).not.toContain('wamid');
      expect(serialized).not.toContain('HBgLMjU1');

      // Assert ABSOLUTE ABSENCE of account and phone identifiers
      expect(serialized).not.toContain('waba_1670497521174128');
      expect(serialized).not.toContain('phone_1413691425156891');
    });

    it('POST response body contains only random correlation ID and aggregate counts, with zero PII', async () => {
      const payloadString = JSON.stringify(REALISTIC_BENEFICIARY_PAYLOAD);
      const signature = computeHmacSignature(TEST_APP_SECRET, payloadString);

      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
        },
        body: payloadString,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.received).toBe(true);
      expect(json.correlationId).toBeDefined();
      expect(json.entriesProcessed).toBe(1);
      expect(json.messagesProcessed).toBe(1);
      expect(json.statusesProcessed).toBe(0);

      const resString = JSON.stringify(json);
      expect(resString).not.toContain('9876543210');
      expect(resString).not.toContain('Sunita');
      expect(resString).not.toContain('Rohan');
      expect(resString).not.toContain('nutritional');
      expect(resString).not.toContain('wamid');

      // Verify in-memory sink also contains zero sensitive strings
      const recent = getRecentDiagnosticEvents(1);
      expect(recent).toHaveLength(1);
      const sinkString = JSON.stringify(recent[0]);
      expect(sinkString).not.toContain('9876543210');
      expect(sinkString).not.toContain('Sunita');
      expect(sinkString).not.toContain('Rohan');
      expect(sinkString).not.toContain('nutritional');
      expect(sinkString).not.toContain('wamid');
    });

    it('retains numeric error codes on delivery failures without recording error messages', async () => {
      const failurePayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    {
                      id: 'wamid.STATUS_FAIL',
                      status: 'failed',
                      recipient_id: '919876543210',
                      errors: [
                        {
                          code: 131026,
                          title: 'Message Undeliverable',
                          message: 'Detailed recipient account suspension notice with confidential payload excerpt',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const diag = extractMinimalDiagnostics(failurePayload);
      expect(diag.eventClass).toBe('status');
      expect(diag.statusCount).toBe(1);
      expect(diag.hasErrors).toBe(true);
      expect(diag.errorCodes).toEqual([131026]);

      const serialized = JSON.stringify(diag);
      // Ensures raw error message string is NOT retained
      expect(serialized).not.toContain('suspension');
      expect(serialized).not.toContain('confidential');
      expect(serialized).not.toContain('excerpt');
    });
  });

  // =========================================================================
  // 6. In-Memory Sink Boundedness & Idempotence
  // =========================================================================
  describe('6. In-Memory Sink Boundedness & Idempotence', () => {
    it('caps event buffer to 50 items using FIFO eviction', () => {
      clearDiagnosticEvents();

      for (let i = 0; i < 60; i++) {
        recordDiagnosticEvent({
          correlationId: `corr-${i}`,
          receivedAt: new Date().toISOString(),
          eventClass: 'message',
          entryCount: 1,
          messageCount: 1,
          statusCount: 0,
          hasErrors: false,
          errorCodes: [],
        });
      }

      const stats = getDiagnosticSinkStats();
      expect(stats.totalEventsReceived).toBe(60);
      expect(stats.currentBufferSize).toBe(50);

      const recent = getRecentDiagnosticEvents(50);
      expect(recent).toHaveLength(50);
      expect(recent[0].correlationId).toBe('corr-59'); // newest
      expect(recent[49].correlationId).toBe('corr-10'); // oldest retained (0-9 evicted)
    });

    it('safely handles duplicate deliveries without throwing or creating side effects', async () => {
      const payloadString = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ field: 'messages', value: { messages: [{ type: 'text' }] } }] }],
      });
      const signature = computeHmacSignature(TEST_APP_SECRET, payloadString);

      const req1 = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
        body: payloadString,
      });
      const res1 = await POST(req1);
      expect(res1.status).toBe(200);

      // Send exact duplicate
      const req2 = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
        body: payloadString,
      });
      const res2 = await POST(req2);
      expect(res2.status).toBe(200);

      const stats = getDiagnosticSinkStats();
      expect(stats.totalEventsReceived).toBe(2);
    });

    it('tolerates unknown optional fields and non-message event fields safely', async () => {
      const payloadString = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba_test',
            changes: [
              {
                field: 'account_update',
                value: {
                  ban_info: { waba_ban_state: 'SCHEDULE_FOR_DISABLE' },
                  unknown_custom_field: { test: true },
                },
              },
            ],
            unknown_root_property: 'ignored_gracefully',
          },
        ],
      });
      const signature = computeHmacSignature(TEST_APP_SECRET, payloadString);

      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
        body: payloadString,
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.entriesProcessed).toBe(1);
    });
  });
});
