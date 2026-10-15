/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import path from 'path';
import { createRequire } from 'module';

import {
  createCatalystWebhookHandler,
  catalystWebhookHandler,
  NO_CACHE_HEADERS,
} from '@/lib/server/catalystWebhookAdapter';
import {
  clearDiagnosticEvents,
  getRecentDiagnosticEvents,
} from '@/lib/server/whatsappEventSink';
import { MAX_RAW_BODY_SIZE } from '@/lib/server/whatsappWebhookParser';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock HTTP primitives for isolated, deterministic in-memory testing
class MockIncomingMessage extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string>;
  destroyed: boolean = false;
  paused: boolean = false;
  body?: unknown;
  rawBody?: unknown;

  constructor(options: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  }) {
    super();
    this.method = options.method || 'GET';
    this.url = options.url || '/';
    this.headers = {};
    for (const [k, v] of Object.entries(options.headers || {})) {
      this.headers[k.toLowerCase()] = v;
    }
  }

  pause() {
    this.paused = true;
    return this;
  }

  resume() {
    this.paused = false;
    return this;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

class MockServerResponse extends EventEmitter {
  statusCode: number = 200;
  headers: Record<string, string> = {};
  body: string = '';
  finished: boolean = false;

  writeHead(statusCode: number, headers?: Record<string, string>) {
    this.statusCode = statusCode;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this.headers[k.toLowerCase()] = v;
      }
    }
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  end(chunk?: string | Buffer) {
    if (chunk) {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk;
    }
    this.finished = true;
    this.emit('finish');
    return this;
  }
}

async function invokeHandler(
  handler: (req: any, res: any) => Promise<void>,
  req: MockIncomingMessage,
  res: MockServerResponse,
  bodyChunks?: Buffer[] | Buffer | string
): Promise<{ statusCode: number; headers: Record<string, string>; body: string; json?: any }> {
  const handlerPromise = handler(req as any, res as any);

  if (bodyChunks !== undefined) {
    queueMicrotask(() => {
      if (Buffer.isBuffer(bodyChunks) || typeof bodyChunks === 'string') {
        req.emit('data', Buffer.from(bodyChunks));
      } else if (Array.isArray(bodyChunks)) {
        for (const chunk of bodyChunks) {
          if (req.destroyed) break;
          req.emit('data', chunk);
        }
      }
      if (!req.destroyed) {
        req.emit('end');
      }
    });
  } else if (req.method === 'POST') {
    queueMicrotask(() => {
      req.emit('end');
    });
  }

  await handlerPromise;

  let json: any = undefined;
  try {
    json = JSON.parse(res.body);
  } catch {
    // Plain text body
  }

  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body,
    json,
  };
}

function computeSignature(payload: Buffer | string, secret: string): string {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf-8');
  const hmac = crypto.createHmac('sha256', secret).update(buf).digest('hex');
  return `sha256=${hmac}`;
}

const TEST_VERIFY_TOKEN = 'test_verify_token_xyz_12345';
const TEST_APP_SECRET = '0123456789abcdef0123456789abcdef';

const SYNTHETIC_MESSAGE_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15551234567',
              phone_number_id: '1413691425156891',
            },
            contacts: [{ profile: { name: 'Synthetic Contact' }, wa_id: '919876543210' }],
            messages: [
              {
                from: '919876543210',
                id: 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhggM0E2QzYxQTE4Q0VGMzE2N0YwREQwNTk5',
                timestamp: '1729000000',
                type: 'text',
                text: { body: 'Hello Catalyst test message' },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

const SYNTHETIC_STATUS_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15551234567',
              phone_number_id: '1413691425156891',
            },
            statuses: [
              {
                id: 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhggM0E2QzYxQTE4Q0VGMzE2N0YwREQwNTk5',
                status: 'delivered',
                timestamp: '1729000001',
                recipient_id: '919876543210',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

describe('Zoho Catalyst Advanced I/O Webhook Adapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearDiagnosticEvents();
    process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    process.env.META_APP_SECRET = TEST_APP_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. GET Verification Handshake (Meta Webhook Onboarding)', () => {
    it('returns HTTP 404 when WHATSAPP_WEBHOOK_ENABLED is false (fail-closed default)', async () => {
      process.env.WHATSAPP_WEBHOOK_ENABLED = 'false';
      const req = new MockIncomingMessage({
        method: 'GET',
        url: `/?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=test_challenge`,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(404);
      expect(response.json?.code).toBe('FEATURE_DISABLED');
      expect(response.headers['cache-control']).toBe(NO_CACHE_HEADERS['Cache-Control']);
    });

    it('returns HTTP 500 when enabled but WHATSAPP_WEBHOOK_VERIFY_TOKEN is unset', async () => {
      delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      const req = new MockIncomingMessage({
        method: 'GET',
        url: `/?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=test_challenge`,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(500);
      expect(response.json?.code).toBe('VERIFICATION_FAILED');
      expect(response.json?.message).toContain('WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured');
    });

    it('returns HTTP 400 when handshake query parameters are missing', async () => {
      const req = new MockIncomingMessage({
        method: 'GET',
        url: '/?hub.mode=subscribe',
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(400);
      expect(response.json?.code).toBe('VERIFICATION_FAILED');
    });

    it('enforces parameter length limits (bounds checking)', async () => {
      const longMode = 'a'.repeat(65);
      const req = new MockIncomingMessage({
        method: 'GET',
        url: `/?hub.mode=${longMode}&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=123`,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);
      expect(response.statusCode).toBe(400);
      expect(response.json?.message).toContain('hub.mode parameter exceeds maximum allowed length');
    });

    it('returns HTTP 403 when hub.mode is not subscribe', async () => {
      const req = new MockIncomingMessage({
        method: 'GET',
        url: `/?hub.mode=publish&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=123`,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(403);
      expect(response.json?.message).toContain("expected 'subscribe'");
    });

    it('returns HTTP 403 on token mismatch using constant-time comparison', async () => {
      const req = new MockIncomingMessage({
        method: 'GET',
        url: '/?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=123',
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(403);
      expect(response.json?.message).toContain('Invalid hub.verify_token');
    });

    it('returns HTTP 200 with challenge in text/plain on successful handshake', async () => {
      const challengeStr = '1158201444';
      const req = new MockIncomingMessage({
        method: 'GET',
        url: `/?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=${challengeStr}`,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(challengeStr);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['cache-control']).toBe(NO_CACHE_HEADERS['Cache-Control']);
    });
  });

  describe('2. POST Bounded Body & Stream Limits (256 KB Hard Ceiling)', () => {
    it('rejects requests with Content-Length exceeding 256 KB with HTTP 413', async () => {
      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: {
          'content-length': (MAX_RAW_BODY_SIZE + 100).toString(),
          'x-hub-signature-256': 'sha256=abcdef',
        },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(413);
      expect(response.json?.code).toBe('PAYLOAD_TOO_LARGE');
      expect(response.json?.message).toBe('Request payload exceeds maximum allowed size.');
    });

    it('cancels stream early when incoming chunks exceed 256 KB', async () => {
      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: {
          'x-hub-signature-256': 'sha256=abcdef',
        },
      });
      const res = new MockServerResponse();

      const chunk1 = Buffer.alloc(150 * 1024, 'a');
      const chunk2 = Buffer.alloc(150 * 1024, 'b'); // Total 300 KB > 256 KB

      const response = await invokeHandler(catalystWebhookHandler, req, res, [chunk1, chunk2]);

      expect(response.statusCode).toBe(413);
      expect(response.json?.code).toBe('PAYLOAD_TOO_LARGE');
      expect(req.destroyed).toBe(true);
    });

    it('accepts body within 256 KB limit', async () => {
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD), 'utf-8');
      const sig = computeSignature(rawBody, TEST_APP_SECRET);

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: {
          'x-hub-signature-256': sig,
        },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, rawBody);

      expect(response.statusCode).toBe(200);
      expect(response.json?.status).toBe('ok');
    });
  });

  describe('3. POST Configuration & Fail-Closed Guardrails', () => {
    it('returns HTTP 404 on POST when WHATSAPP_WEBHOOK_ENABLED is false', async () => {
      process.env.WHATSAPP_WEBHOOK_ENABLED = 'false';
      const req = new MockIncomingMessage({ method: 'POST', url: '/' });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(404);
      expect(response.json?.code).toBe('FEATURE_DISABLED');
    });

    it('returns HTTP 500 on POST when enabled but META_APP_SECRET is missing', async () => {
      delete process.env.META_APP_SECRET;
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD));
      const req = new MockIncomingMessage({ method: 'POST', url: '/' });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, rawBody);

      expect(response.statusCode).toBe(500);
      expect(response.json?.code).toBe('SERVER_MISCONFIGURED');
    });
  });

  describe('4. POST Cryptographic Signature Verification', () => {
    it('returns HTTP 401 when X-Hub-Signature-256 header is missing', async () => {
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD));
      const req = new MockIncomingMessage({ method: 'POST', url: '/' });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, rawBody);

      expect(response.statusCode).toBe(401);
      expect(response.json?.code).toBe('INVALID_SIGNATURE');
      expect(response.json?.message).toContain('Missing X-Hub-Signature-256 header');
    });

    it('returns HTTP 401 when signature header format is malformed', async () => {
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD));
      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: { 'x-hub-signature-256': 'md5=invalid' },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, rawBody);

      expect(response.statusCode).toBe(401);
      expect(response.json?.message).toContain('must start with sha256=');
    });

    it('returns HTTP 401 when signature digest has wrong length', async () => {
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD));
      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: { 'x-hub-signature-256': 'sha256=short' },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, rawBody);

      expect(response.statusCode).toBe(401);
      expect(response.json?.message).toContain('64-character hexadecimal string');
    });

    it('returns HTTP 401 on tampered payload or secret mismatch', async () => {
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD));
      const wrongSignature = computeSignature(rawBody, 'wrong_secret_1234567890abcdef');
      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: { 'x-hub-signature-256': wrongSignature },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, rawBody);

      expect(response.statusCode).toBe(401);
      expect(response.json?.message).toBe('Invalid X-Hub-Signature-256 signature.');
    });
  });

  describe('5. POST Payload Parsing & Validation', () => {
    it('returns HTTP 400 when validly signed body is malformed JSON', async () => {
      const malformedBody = Buffer.from('{"object": "whatsapp_business_account", bad json');
      const sig = computeSignature(malformedBody, TEST_APP_SECRET);

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: { 'x-hub-signature-256': sig },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, malformedBody);

      expect(response.statusCode).toBe(400);
      expect(response.json?.code).toBe('INVALID_JSON');
    });

    it('returns HTTP 400 when object is not whatsapp_business_account', async () => {
      const invalidObjectBody = Buffer.from(JSON.stringify({ object: 'page', entry: [] }));
      const sig = computeSignature(invalidObjectBody, TEST_APP_SECRET);

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: { 'x-hub-signature-256': sig },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, invalidObjectBody);

      expect(response.statusCode).toBe(400);
      expect(response.json?.code).toBe('UNSUPPORTED_OBJECT');
    });
  });

  describe('6. Minimal Privacy-Safe Diagnostics & Zero PII Guarantee', () => {
    it('returns HTTP 200 with only non-sensitive aggregate counts and random correlation ID', async () => {
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD));
      const sig = computeSignature(rawBody, TEST_APP_SECRET);

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: { 'x-hub-signature-256': sig },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, rawBody);

      expect(response.statusCode).toBe(200);
      expect(response.json?.status).toBe('ok');
      expect(response.json?.received).toBe(true);
      expect(response.json?.entriesProcessed).toBe(1);
      expect(response.json?.messagesProcessed).toBe(1);
      expect(response.json?.statusesProcessed).toBe(0);

      // Verify UUID format for correlationId
      expect(response.json?.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Strict PII Absence: no phone numbers, names, or raw message text
      const rawResponseStr = JSON.stringify(response.json);
      expect(rawResponseStr).not.toContain('919876543210');
      expect(rawResponseStr).not.toContain('Synthetic Contact');
      expect(rawResponseStr).not.toContain('Hello Catalyst test message');
      expect(rawResponseStr).not.toContain('wamid');

      // Verify diagnostic sink record
      const recent = getRecentDiagnosticEvents(5);
      expect(recent.length).toBe(1);
      expect(recent[0].eventClass).toBe('message');
      expect(recent[0].messageCount).toBe(1);
      expect(recent[0].statusCount).toBe(0);
      expect(recent[0].hasErrors).toBe(false);

      const sinkStr = JSON.stringify(recent[0]);
      expect(sinkStr).not.toContain('919876543210');
      expect(sinkStr).not.toContain('Synthetic Contact');
      expect(sinkStr).not.toContain('Hello Catalyst test message');
    });

    it('processes status updates safely with zero PII', async () => {
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_STATUS_PAYLOAD));
      const sig = computeSignature(rawBody, TEST_APP_SECRET);

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: { 'x-hub-signature-256': sig },
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res, rawBody);

      expect(response.statusCode).toBe(200);
      expect(response.json?.entriesProcessed).toBe(1);
      expect(response.json?.messagesProcessed).toBe(0);
      expect(response.json?.statusesProcessed).toBe(1);

      const recent = getRecentDiagnosticEvents(5);
      expect(recent[0].eventClass).toBe('status');
      expect(recent[0].statusCount).toBe(1);
    });
  });

  describe('7. HTTP Method Handling & Path Resilience', () => {
    it('returns HTTP 405 Method Not Allowed for PUT, DELETE, PATCH', async () => {
      for (const badMethod of ['PUT', 'DELETE', 'PATCH']) {
        const req = new MockIncomingMessage({ method: badMethod, url: '/' });
        const res = new MockServerResponse();

        const response = await invokeHandler(catalystWebhookHandler, req, res);

        expect(response.statusCode).toBe(405);
        expect(response.json?.code).toBe('METHOD_NOT_ALLOWED');
        expect(response.headers['allow']).toBe('GET, POST');
      }
    });

    it('handles Catalyst function URL paths (/server/whatsapp_webhook/) seamlessly', async () => {
      const challengeStr = '987654321';
      const req = new MockIncomingMessage({
        method: 'GET',
        url: `/server/whatsapp_webhook/?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=${challengeStr}`,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(catalystWebhookHandler, req, res);

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(challengeStr);
    });
  });

  describe('8. Packaged CommonJS Artifact Verification', () => {
    it('verifies that the packaged functions/whatsapp_webhook/index.js runs identically', async () => {
      const packagedModulePath = path.resolve(
        __dirname,
        '../../functions/whatsapp_webhook/index.js'
      );
      const packagedModule = require(packagedModulePath);

      const handler =
        typeof packagedModule === 'function'
          ? packagedModule
          : packagedModule.catalystWebhookHandler;

      expect(typeof handler).toBe('function');

      // 1. Test GET handshake against packaged artifact
      const challengeStr = 'packaged_artifact_challenge_777';
      const reqGet = new MockIncomingMessage({
        method: 'GET',
        url: `/?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=${challengeStr}`,
      });
      const resGet = new MockServerResponse();

      const getResponse = await invokeHandler(handler, reqGet, resGet);
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.body).toBe(challengeStr);

      // 2. Test signed POST payload against packaged artifact
      const rawBody = Buffer.from(JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD));
      const sig = computeSignature(rawBody, TEST_APP_SECRET);

      const reqPost = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: { 'x-hub-signature-256': sig },
      });
      const resPost = new MockServerResponse();

      const postResponse = await invokeHandler(handler, reqPost, resPost, rawBody);
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.json?.status).toBe('ok');
      expect(postResponse.json?.messagesProcessed).toBe(1);
    });
  });
});
