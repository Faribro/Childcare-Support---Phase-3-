/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import http from 'http';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
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
import {
  STATIC_SYNTHETIC_FIXTURES,
  createSignedWebhookPayload,
} from '@/test/fixtures/whatsappSyntheticFixtures';
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
    (this as any).socket = this;
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
      expect(req.paused).toBe(true);
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

  describe('9. Real HTTP Server & Client Overflow Tests (Ephemeral Port 127.0.0.1)', () => {
    let server: http.Server;
    let port: number;

    beforeEach(async () => {
      const packagedModulePath = path.resolve(
        __dirname,
        '../../functions/whatsapp_webhook/index.js'
      );
      delete require.cache[packagedModulePath];
      const packagedModule = require(packagedModulePath);
      const handler =
        typeof packagedModule === 'function'
          ? packagedModule
          : packagedModule.catalystWebhookHandler;

      server = http.createServer((req, res) => {
        handler(req, res);
      });

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          port = (server.address() as any).port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it('client observes HTTP 413 when Content-Length exceeds 256 KB', async () => {
      const response = await new Promise<{ statusCode: number; json?: any; error?: string }>((resolve) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/',
            headers: {
              'content-length': (MAX_RAW_BODY_SIZE + 100).toString(),
              'x-hub-signature-256': 'sha256=abcdef',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ statusCode: res.statusCode || 0, json: JSON.parse(data) });
              } catch {
                resolve({ statusCode: res.statusCode || 0 });
              }
            });
          }
        );
        req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
        req.write(Buffer.alloc(100, 'x'));
        req.end();
      });

      expect(response.statusCode).toBe(413);
      expect(response.json?.code).toBe('PAYLOAD_TOO_LARGE');
      expect(response.json?.message).toBe('Request payload exceeds maximum allowed size.');
    });

    it('client observes HTTP 413 when chunked body crosses 256 KB without premature ECONNRESET', async () => {
      const response = await new Promise<{ statusCode: number; json?: any; error?: string }>((resolve) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/',
            headers: {
              'transfer-encoding': 'chunked',
              'x-hub-signature-256': 'sha256=abcdef',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ statusCode: res.statusCode || 0, json: JSON.parse(data) });
              } catch {
                resolve({ statusCode: res.statusCode || 0 });
              }
            });
          }
        );
        req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));

        // Send two chunks: total 300 KB > 256 KB
        req.write(Buffer.alloc(150 * 1024, 'a'));
        setTimeout(() => {
          req.write(Buffer.alloc(150 * 1024, 'b'));
          req.end();
        }, 10);
      });

      expect(response.statusCode).toBe(413);
      expect(response.json?.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('accepts exactly-at-limit (262,144 bytes) payload and returns 200 with valid signature', async () => {
      const rawJson = JSON.stringify(SYNTHETIC_MESSAGE_PAYLOAD);
      const exactBuf = Buffer.alloc(MAX_RAW_BODY_SIZE);
      const rawBytes = Buffer.from(rawJson, 'utf-8');
      rawBytes.copy(exactBuf, 0);
      exactBuf.fill(0x20, rawBytes.length); // valid JSON trailing whitespace

      const sig = computeSignature(exactBuf, TEST_APP_SECRET);

      const response = await new Promise<{ statusCode: number; json?: any; error?: string }>((resolve) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/',
            headers: {
              'content-length': exactBuf.length.toString(),
              'x-hub-signature-256': sig,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ statusCode: res.statusCode || 0, json: JSON.parse(data) });
              } catch {
                resolve({ statusCode: res.statusCode || 0 });
              }
            });
          }
        );
        req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
        req.end(exactBuf);
      });

      expect(response.statusCode).toBe(200);
      expect(response.json?.status).toBe('ok');
    });

    it('rejects just-over-limit (262,145 bytes) payload with HTTP 413', async () => {
      const overLimitBuf = Buffer.alloc(MAX_RAW_BODY_SIZE + 1, 'a');
      const sig = computeSignature(overLimitBuf, TEST_APP_SECRET);

      const response = await new Promise<{ statusCode: number; json?: any; error?: string }>((resolve) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/',
            headers: {
              'content-length': overLimitBuf.length.toString(),
              'x-hub-signature-256': sig,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ statusCode: res.statusCode || 0, json: JSON.parse(data) });
              } catch {
                resolve({ statusCode: res.statusCode || 0 });
              }
            });
          }
        );
        req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
        req.end(overLimitBuf);
      });

      expect(response.statusCode).toBe(413);
      expect(response.json?.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('handles client abort during upload gracefully without crashing server', async () => {
      const abortPromise = new Promise<{ aborted: boolean }>((resolve) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/',
            headers: {
              'transfer-encoding': 'chunked',
            },
          },
          () => {}
        );
        req.on('error', () => {
          resolve({ aborted: true });
        });
        req.write(Buffer.alloc(1024, 'a'));
        setTimeout(() => {
          req.destroy();
        }, 10);
      });

      const abortResult = await abortPromise;
      expect(abortResult.aborted).toBe(true);

      // Verify server remains healthy and usable for subsequent requests
      const followUpResponse = await new Promise<{ statusCode: number; body: string }>((resolve) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            method: 'GET',
            path: `/?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=server_healthy`,
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
          }
        );
        req.end();
      });

      expect(followUpResponse.statusCode).toBe(200);
      expect(followUpResponse.body).toBe('server_healthy');
    });
  });

  describe('10. Packaging Reproducibility, Deterministic Hashes & Isolated Execution', () => {
    it('produces identical file lists and deterministic SHA256 hashes across consecutive packaging runs', () => {
      const scriptPath = path.resolve(__dirname, '../../scripts/package-catalyst-adapter.mjs');
      const functionDir = path.resolve(__dirname, '../../functions/whatsapp_webhook');

      // First run
      execSync(`node "${scriptPath}"`, { stdio: 'pipe' });
      const files1 = fs.readdirSync(functionDir).sort();
      const hashes1 = files1.map((f) => {
        const content = fs.readFileSync(path.join(functionDir, f));
        return { file: f, hash: crypto.createHash('sha256').update(content).digest('hex') };
      });

      // Second run
      execSync(`node "${scriptPath}"`, { stdio: 'pipe' });
      const files2 = fs.readdirSync(functionDir).sort();
      const hashes2 = files2.map((f) => {
        const content = fs.readFileSync(path.join(functionDir, f));
        return { file: f, hash: crypto.createHash('sha256').update(content).digest('hex') };
      });

      expect(files1).toEqual(files2);
      expect(hashes1).toEqual(hashes2);
    });

    it('loads and runs successfully from an isolated temporary directory without source-tree imports or symlinks', () => {
      const functionDir = path.resolve(__dirname, '../../functions/whatsapp_webhook');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalyst-isolated-test-'));

      try {
        // Copy only the functions/whatsapp_webhook directory into temp
        for (const file of fs.readdirSync(functionDir)) {
          fs.copyFileSync(path.join(functionDir, file), path.join(tempDir, file));
        }

        // Verify that requiring index.js in isolated temp directory works completely standalone
        const isolatedEntryPath = path.join(tempDir, 'index.js');
        const isolatedModule = require(isolatedEntryPath);
        const handler =
          typeof isolatedModule === 'function'
            ? isolatedModule
            : isolatedModule.catalystWebhookHandler;

        expect(typeof handler).toBe('function');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('preserves unrelated root catalyst.json configuration during packaging regeneration', () => {
      const catalystJsonPath = path.resolve(__dirname, '../../catalyst.json');
      const originalContent = JSON.parse(fs.readFileSync(catalystJsonPath, 'utf8'));

      // Inject custom unrelated key into catalyst.json
      const modifiedContent = {
        ...originalContent,
        customUnrelatedService: { enabled: true, endpoint: 'https://example.org' },
        functions: {
          ...originalContent.functions,
          targets: [...(originalContent.functions?.targets || []), 'existing_unrelated_function'],
        },
      };
      fs.writeFileSync(catalystJsonPath, JSON.stringify(modifiedContent, null, 2), 'utf8');

      // Run packaging script
      const scriptPath = path.resolve(__dirname, '../../scripts/package-catalyst-adapter.mjs');
      execSync(`node "${scriptPath}"`, { stdio: 'pipe' });

      // Verify that custom keys were preserved
      const regeneratedContent = JSON.parse(fs.readFileSync(catalystJsonPath, 'utf8'));
      expect(regeneratedContent.customUnrelatedService).toEqual({
        enabled: true,
        endpoint: 'https://example.org',
      });
      expect(regeneratedContent.functions.targets).toContain('existing_unrelated_function');
      expect(regeneratedContent.functions.targets).toContain('whatsapp_webhook');

      // Restore clean catalyst.json
      delete regeneratedContent.customUnrelatedService;
      regeneratedContent.functions.targets = ['whatsapp_webhook'];
      fs.writeFileSync(
        catalystJsonPath,
        JSON.stringify(regeneratedContent, null, 2) + '\n',
        'utf8'
      );
    });
  });

  describe('11. Synthetic Fixture Factory Integration Suite', () => {
    it('processes synthetic inbound text message fixture with full PII redaction', async () => {
      const signed = createSignedWebhookPayload(
        STATIC_SYNTHETIC_FIXTURES.inboundTextMessage,
        TEST_APP_SECRET
      );

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: signed.headers,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(
        catalystWebhookHandler,
        req,
        res,
        Buffer.from(signed.rawBody)
      );

      expect(response.statusCode).toBe(200);
      expect(response.json?.status).toBe('ok');
      expect(response.json?.entriesProcessed).toBe(1);
      expect(response.json?.messagesProcessed).toBe(1);
      expect(response.json?.statusesProcessed).toBe(0);

      // Verify PII redaction
      const responseStr = JSON.stringify(response.json);
      expect(responseStr).not.toContain('919876543210');
      expect(responseStr).not.toContain('Synthetic Mother');
      expect(responseStr).not.toContain('nutrition kit received');
      expect(responseStr).not.toContain('STATIC_MSG_001');

      // Verify diagnostic sink
      const recent = getRecentDiagnosticEvents(5);
      expect(recent.length).toBe(1);
      expect(recent[0].eventClass).toBe('message');
      expect(recent[0].hasErrors).toBe(false);
    });

    it('processes synthetic delivery delivered receipt fixture', async () => {
      const signed = createSignedWebhookPayload(
        STATIC_SYNTHETIC_FIXTURES.deliveryDeliveredReceipt,
        TEST_APP_SECRET
      );

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: signed.headers,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(
        catalystWebhookHandler,
        req,
        res,
        Buffer.from(signed.rawBody)
      );

      expect(response.statusCode).toBe(200);
      expect(response.json?.statusesProcessed).toBe(1);

      const recent = getRecentDiagnosticEvents(5);
      expect(recent[0].eventClass).toBe('status');
      expect(recent[0].statusCount).toBe(1);
      expect(recent[0].hasErrors).toBe(false);
    });

    it('processes synthetic delivery read receipt fixture', async () => {
      const signed = createSignedWebhookPayload(
        STATIC_SYNTHETIC_FIXTURES.deliveryReadReceipt,
        TEST_APP_SECRET
      );

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: signed.headers,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(
        catalystWebhookHandler,
        req,
        res,
        Buffer.from(signed.rawBody)
      );

      expect(response.statusCode).toBe(200);
      expect(response.json?.statusesProcessed).toBe(1);

      const recent = getRecentDiagnosticEvents(5);
      expect(recent[0].eventClass).toBe('status');
      expect(recent[0].hasErrors).toBe(false);
    });

    it('processes delivery window expired failure fixture and captures error code 131047 in sink', async () => {
      const signed = createSignedWebhookPayload(
        STATIC_SYNTHETIC_FIXTURES.deliveryWindowExpiredFailure,
        TEST_APP_SECRET
      );

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: signed.headers,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(
        catalystWebhookHandler,
        req,
        res,
        Buffer.from(signed.rawBody)
      );

      expect(response.statusCode).toBe(200);
      expect(response.json?.statusesProcessed).toBe(1);

      const recent = getRecentDiagnosticEvents(5);
      expect(recent[0].eventClass).toBe('status');
      expect(recent[0].hasErrors).toBe(true);
      expect(recent[0].errorCodes).toContain(131047);
    });

    it('processes undeliverable failure fixture and captures error code 131026 in sink', async () => {
      const signed = createSignedWebhookPayload(
        STATIC_SYNTHETIC_FIXTURES.deliveryUndeliverableFailure,
        TEST_APP_SECRET
      );

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: signed.headers,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(
        catalystWebhookHandler,
        req,
        res,
        Buffer.from(signed.rawBody)
      );

      expect(response.statusCode).toBe(200);
      expect(response.json?.statusesProcessed).toBe(1);

      const recent = getRecentDiagnosticEvents(5);
      expect(recent[0].hasErrors).toBe(true);
      expect(recent[0].errorCodes).toContain(131026);
    });

    it('processes non-message account alert fixture safely', async () => {
      const signed = createSignedWebhookPayload(
        STATIC_SYNTHETIC_FIXTURES.nonMessageTemplateUpdate,
        TEST_APP_SECRET
      );

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: signed.headers,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(
        catalystWebhookHandler,
        req,
        res,
        Buffer.from(signed.rawBody)
      );

      expect(response.statusCode).toBe(200);
      expect(response.json?.status).toBe('ok');
    });

    it('rejects unsupported object type fixture with HTTP 400 UNSUPPORTED_OBJECT', async () => {
      const signed = createSignedWebhookPayload(
        STATIC_SYNTHETIC_FIXTURES.unsupportedObjectType,
        TEST_APP_SECRET
      );

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: signed.headers,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(
        catalystWebhookHandler,
        req,
        res,
        Buffer.from(signed.rawBody)
      );

      expect(response.statusCode).toBe(400);
      expect(response.json?.code).toBe('UNSUPPORTED_OBJECT');
    });

    it('rejects malformed JSON string fixture with HTTP 400 INVALID_JSON', async () => {
      const signed = createSignedWebhookPayload(
        STATIC_SYNTHETIC_FIXTURES.malformedJsonString,
        TEST_APP_SECRET
      );

      const req = new MockIncomingMessage({
        method: 'POST',
        url: '/',
        headers: signed.headers,
      });
      const res = new MockServerResponse();

      const response = await invokeHandler(
        catalystWebhookHandler,
        req,
        res,
        Buffer.from(signed.rawBody)
      );

      expect(response.statusCode).toBe(400);
      expect(response.json?.code).toBe('INVALID_JSON');
    });
  });
});
