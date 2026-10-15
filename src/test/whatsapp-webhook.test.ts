import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { GET, POST } from '@/app/api/integrations/whatsapp/webhook/route';
import {
  clearWebhookEvents,
  getRecentWebhookEvents,
  getWebhookSinkStats,
  recordWebhookEvent,
} from '@/lib/server/whatsappEventSink';
import { maskPhoneNumber, redactWhatsAppPayload } from '@/lib/server/whatsappWebhookParser';
import { verifyWebhookHandshake, verifyWebhookSignature } from '@/lib/server/whatsappWebhookVerifier';

describe('Meta WhatsApp Cloud API Webhook Integration (Receive-Only)', () => {
  const TEST_VERIFY_TOKEN = 'synthetic_verify_token_secure_xyz_789';
  const TEST_APP_SECRET = 'synthetic_meta_app_secret_1234567890abcdef';

  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    process.env.META_APP_SECRET = TEST_APP_SECRET;
    clearWebhookEvents();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    clearWebhookEvents();
    vi.restoreAllMocks();
  });

  function computeHmacSignature(secret: string, body: string | Buffer): string {
    const raw = typeof body === 'string' ? Buffer.from(body, 'utf-8') : body;
    const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return `sha256=${digest}`;
  }

  // =========================================================================
  // 1. Feature Flag & Fail-Closed Guardrails
  // =========================================================================
  describe('1. Feature Flag & Fail-Closed Guardrails', () => {
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

    it('returns HTTP 500 on GET when WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured', async () => {
      delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      const req = new NextRequest(
        'http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=any&hub.challenge=test_123'
      );
      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.code).toBe('VERIFICATION_FAILED');
    });

    it('returns HTTP 500 on POST when META_APP_SECRET is not configured', async () => {
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
  // 2. GET Webhook Handshake Verification
  // =========================================================================
  describe('2. GET Webhook Handshake Verification', () => {
    it('returns HTTP 200 with raw challenge on valid handshake parameters', async () => {
      const challengeStr = '1158201444_meta_challenge';
      const req = new NextRequest(
        `http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=${challengeStr}`
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      expect(res.headers.get('cache-control')).toContain('no-store');
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
      expect(json.message).toContain("expected 'subscribe'");
    });

    it('rejects handshake with HTTP 400 when query parameters are missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook');
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe('VERIFICATION_FAILED');
      expect(json.message).toContain('Missing required handshake parameters');
    });

    it('rejects handshake with HTTP 400 when challenge exceeds 512 characters', async () => {
      const longChallenge = 'x'.repeat(513);
      const req = new NextRequest(
        `http://localhost:3000/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=${longChallenge}`
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe('VERIFICATION_FAILED');
      expect(json.message).toContain('exceeds maximum allowed length');
    });
  });

  // =========================================================================
  // 3. POST HMAC-SHA256 Signature Authentication
  // =========================================================================
  describe('3. POST HMAC-SHA256 Signature Authentication', () => {
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

    it('rejects POST with HTTP 401 when signature header format is malformed (no prefix)', async () => {
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

    it('rejects POST with HTTP 401 when signature hex digest length is invalid', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=abc123short',
        },
        body: payload,
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toContain('64-character hexadecimal string');
    });

    it('rejects POST with HTTP 401 when signature does not match payload', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const bogusSignature = 'sha256=' + '0'.repeat(64);
      const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': bogusSignature,
        },
        body: payload,
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toContain('Invalid X-Hub-Signature-256 signature');
    });

    it('rejects POST with HTTP 401 when payload was tampered after signature generation', async () => {
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
  });

  // =========================================================================
  // 4. POST Payload Parsing, Redaction & In-Memory Sink Recording
  // =========================================================================
  describe('4. POST Payload Parsing, Redaction & In-Memory Sink Recording', () => {
    it('rejects POST with HTTP 400 when body is not valid JSON despite valid HMAC', async () => {
      const invalidJson = 'Not Valid JSON { [';
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

    it('rejects POST with HTTP 400 when object is not "whatsapp_business_account"', async () => {
      const payload = JSON.stringify({ object: 'instagram', entry: [] });
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

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe('UNSUPPORTED_OBJECT');
    });

    it('accepts and records incoming text message payload while redacting PII', async () => {
      const payload = JSON.stringify({
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
                      profile: { name: 'Aarav Kumar' },
                      wa_id: '919876543210',
                    },
                  ],
                  messages: [
                    {
                      from: '919876543210',
                      id: 'wamid.HBgLM...',
                      timestamp: '1720000000',
                      text: { body: 'Confidential clinical inquiry regarding nutrition' },
                      type: 'text',
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

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

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.received).toBe(true);
      expect(json.messagesProcessed).toBe(1);
      expect(json.statusesProcessed).toBe(0);

      // Verify in-memory sink contents
      const stats = getWebhookSinkStats();
      expect(stats.totalEventsReceived).toBe(1);
      expect(stats.currentBufferSize).toBe(1);

      const recent = getRecentWebhookEvents(10);
      expect(recent).toHaveLength(1);
      const ev = recent[0];

      expect(ev.wabaId).toBe('1670497521174128');
      expect(ev.phoneNumberId).toBe('1413691425156891');
      // Verify phone masking: display phone should be masked
      expect(ev.maskedDisplayPhone).toBe('******4567');
      expect(ev.maskedDisplayPhone).not.toContain('1555123');

      // Verify message PII redaction:
      expect(ev.messages).toHaveLength(1);
      const msg = ev.messages[0];
      expect(msg.id).toBe('wamid.HBgLM...');
      expect(msg.type).toBe('text');
      expect(msg.maskedSender).toBe('******3210');
      expect(msg.maskedSender).not.toContain('987654');
      expect(msg.contentRedacted).toBe(true);
      // Ensure raw message body is NOT stored in the sink
      expect((msg as any).text).toBeUndefined();
      expect((msg as any).body).toBeUndefined();
    });

    it('accepts and records message delivery status update payload', async () => {
      const payload = JSON.stringify({
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
                      id: 'wamid.HBgLM_STATUS_01',
                      status: 'delivered',
                      timestamp: '1720000010',
                      recipient_id: '919876543210',
                      conversation: {
                        id: 'conv-abc-123',
                        origin: { type: 'user_initiated' },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

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

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.statusesProcessed).toBe(1);

      const recent = getRecentWebhookEvents(1);
      expect(recent[0].statuses).toHaveLength(1);
      const status = recent[0].statuses[0];
      expect(status.id).toBe('wamid.HBgLM_STATUS_01');
      expect(status.status).toBe('delivered');
      expect(status.maskedRecipient).toBe('******3210');
    });

    it('processes batched entries and changes in a single webhook request', async () => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1670497521174128',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    { from: '911111111111', id: 'm1', timestamp: '1', type: 'text', text: { body: 'msg 1' } },
                    { from: '912222222222', id: 'm2', timestamp: '2', type: 'text', text: { body: 'msg 2' } },
                  ],
                },
              },
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    { id: 's1', status: 'read', timestamp: '3', recipient_id: '913333333333' },
                  ],
                },
              },
            ],
          },
          {
            id: 'waba_secondary_02',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    { id: 's2', status: 'failed', timestamp: '4', recipient_id: '914444444444', errors: [{ code: 131026, title: 'Message Undeliverable' }] },
                  ],
                },
              },
            ],
          },
        ],
      });

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

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.entriesProcessed).toBe(2);
      expect(json.messagesProcessed).toBe(2);
      expect(json.statusesProcessed).toBe(2);

      const recent = getRecentWebhookEvents(10);
      expect(recent).toHaveLength(3); // 2 changes in entry 0 + 1 change in entry 1 = 3 events
    });

    it('enforces in-memory sink maximum capacity with FIFO eviction', () => {
      clearWebhookEvents();
      const payloadTemplate = (id: number) => ({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: `waba_${id}`,
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  messages: [{ from: '919999999999', id: `msg_${id}`, timestamp: `${id}`, type: 'text' }],
                },
              },
            ],
          },
        ],
      });

      // Insert 60 events (capacity is 50)
      for (let i = 0; i < 60; i++) {
        const events = redactWhatsAppPayload(payloadTemplate(i));
        for (const ev of events) {
          recordWebhookEvent(ev);
        }
      }

      const stats = getWebhookSinkStats();
      expect(stats.totalEventsReceived).toBe(60);
      expect(stats.currentBufferSize).toBe(50); // capped at 50

      const recent = getRecentWebhookEvents(50);
      expect(recent).toHaveLength(50);
      // Newest event should be index 59
      expect(recent[0].wabaId).toBe('waba_59');
      // Oldest retained event should be index 10 (0-9 were evicted)
      expect(recent[49].wabaId).toBe('waba_10');
    });
  });

  // =========================================================================
  // 5. Unit Verification Helpers
  // =========================================================================
  describe('5. Unit Verification Helpers', () => {
    it('maskPhoneNumber correctly masks various formats', () => {
      expect(maskPhoneNumber('919876543210')).toBe('******3210');
      expect(maskPhoneNumber('+919876543210')).toBe('+******3210');
      expect(maskPhoneNumber('1234')).toBe('****');
      expect(maskPhoneNumber('12')).toBe('****');
      expect(maskPhoneNumber(null)).toBe('[UNKNOWN]');
      expect(maskPhoneNumber(undefined)).toBe('[UNKNOWN]');
    });

    it('verifyWebhookHandshake rejects non-string or mismatched tokens', () => {
      const res = verifyWebhookHandshake('subscribe', 'tokenA', 'chal', 'tokenB');
      expect(res.isValid).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    it('verifyWebhookSignature handles case-insensitivity of hex hash', () => {
      const body = Buffer.from('test_body_content', 'utf-8');
      const hash = crypto.createHmac('sha256', TEST_APP_SECRET).update(body).digest('hex');
      const uppercaseSig = `sha256=${hash.toUpperCase()}`;

      const res = verifyWebhookSignature(body, uppercaseSig, TEST_APP_SECRET);
      expect(res.isValid).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });
});
