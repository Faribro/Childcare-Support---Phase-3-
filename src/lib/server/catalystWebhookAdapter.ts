import http from 'http';
import { URL } from 'url';
import { getWhatsAppWebhookConfig, WhatsAppWebhookConfig } from './whatsappWebhookConfig';
import { verifyWebhookHandshake, verifyWebhookSignature } from './whatsappWebhookVerifier';
import {
  extractMinimalDiagnostics,
  MAX_RAW_BODY_SIZE,
  MetaWhatsAppWebhookPayload,
} from './whatsappWebhookParser';
import { recordDiagnosticEvent } from './whatsappEventSink';

export const NO_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body).toString(),
    ...NO_CACHE_HEADERS,
    ...extraHeaders,
  });
  res.end(body);
}

function sendText(
  res: http.ServerResponse,
  statusCode: number,
  text: string,
  extraHeaders?: Record<string, string>
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text).toString(),
    ...NO_CACHE_HEADERS,
    ...extraHeaders,
  });
  res.end(text);
}

/**
 * Reads request body stream with a hard byte-count ceiling for Node.js IncomingMessage.
 * If the byte limit is exceeded at any point during streaming, the stream
 * is paused and destroyed to prevent unbounded memory allocation.
 */
export function readBoundedStream(
  req: http.IncomingMessage,
  maxBytes: number = MAX_RAW_BODY_SIZE
): Promise<
  | { success: true; buffer: Buffer }
  | { success: false; statusCode: number; code: string; message: string }
> {
  return new Promise((resolve) => {
    // 1. Content-Length header fast path check
    const contentLengthHeader = req.headers['content-length'];
    if (contentLengthHeader) {
      const rawHeader = Array.isArray(contentLengthHeader)
        ? contentLengthHeader[0]
        : contentLengthHeader;
      const contentLength = parseInt(rawHeader, 10);
      if (!isNaN(contentLength) && contentLength > maxBytes) {
        return resolve({
          success: false,
          statusCode: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds maximum allowed size.',
        });
      }
    }

    // 2. Pre-buffered body check (if middleware like express.raw already ran)
    const anyReq = req as unknown as { body?: unknown; rawBody?: unknown };
    const prebuffered = anyReq.rawBody || anyReq.body;
    if (Buffer.isBuffer(prebuffered)) {
      if (prebuffered.length > maxBytes) {
        return resolve({
          success: false,
          statusCode: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds maximum allowed size.',
        });
      }
      return resolve({ success: true, buffer: prebuffered });
    }

    // 3. Stream consumption with byte ceiling & early cancellation
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let completed = false;

    function cleanup() {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
    }

    function onData(chunk: Buffer | string) {
      if (completed) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        completed = true;
        cleanup();
        req.pause();
        if (typeof req.destroy === 'function') {
          req.destroy();
        }
        return resolve({
          success: false,
          statusCode: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds maximum allowed size.',
        });
      }
      chunks.push(buf);
    }

    function onEnd() {
      if (completed) return;
      completed = true;
      cleanup();
      resolve({ success: true, buffer: Buffer.concat(chunks) });
    }

    function onError() {
      if (completed) return;
      completed = true;
      cleanup();
      resolve({
        success: false,
        statusCode: 400,
        code: 'BODY_READ_ERROR',
        message: 'Failed to read request body stream.',
      });
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

function handleGet(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: WhatsAppWebhookConfig
): void {
  if (!config.isEnabled) {
    return sendJson(res, 404, {
      status: 'error',
      code: 'FEATURE_DISABLED',
      message: 'WhatsApp webhook integration is disabled.',
    });
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const mode = parsedUrl.searchParams.get('hub.mode');
  const verifyToken = parsedUrl.searchParams.get('hub.verify_token');
  const challenge = parsedUrl.searchParams.get('hub.challenge');

  const verification = verifyWebhookHandshake(mode, verifyToken, challenge, config.verifyToken);

  if (!verification.isValid) {
    return sendJson(res, verification.statusCode, {
      status: 'error',
      code: 'VERIFICATION_FAILED',
      message: verification.error,
    });
  }

  return sendText(res, 200, verification.challenge || '');
}

async function handlePost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: WhatsAppWebhookConfig
): Promise<void> {
  if (!config.isEnabled) {
    return sendJson(res, 404, {
      status: 'error',
      code: 'FEATURE_DISABLED',
      message: 'WhatsApp webhook integration is disabled.',
    });
  }

  if (!config.appSecret) {
    console.error('[WHATSAPP_WEBHOOK] Server misconfiguration: META_APP_SECRET is not configured.');
    return sendJson(res, 500, {
      status: 'error',
      code: 'SERVER_MISCONFIGURED',
      message: 'Webhook receiver is improperly configured.',
    });
  }

  // 1. Read bounded raw request bytes
  const bodyReadResult = await readBoundedStream(req, MAX_RAW_BODY_SIZE);
  if (!bodyReadResult.success) {
    return sendJson(res, bodyReadResult.statusCode, {
      status: 'error',
      code: bodyReadResult.code,
      message: bodyReadResult.message,
    });
  }

  const rawBuffer = bodyReadResult.buffer;

  // 2. Cryptographic signature verification BEFORE parsing JSON
  const signatureHeaderRaw = req.headers['x-hub-signature-256'];
  const signatureHeader = Array.isArray(signatureHeaderRaw)
    ? signatureHeaderRaw[0]
    : signatureHeaderRaw || null;
  const signatureVerification = verifyWebhookSignature(rawBuffer, signatureHeader, config.appSecret);

  if (!signatureVerification.isValid) {
    return sendJson(res, signatureVerification.statusCode, {
      status: 'error',
      code: 'INVALID_SIGNATURE',
      message: signatureVerification.error,
    });
  }

  // 3. Safe JSON parsing after signature authentication
  let payload: MetaWhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBuffer.toString('utf-8'));
  } catch {
    return sendJson(res, 400, {
      status: 'error',
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON.',
    });
  }

  // 4. Structure validation against WhatsApp Business API schema
  if (
    !payload ||
    typeof payload !== 'object' ||
    payload.object !== 'whatsapp_business_account' ||
    !Array.isArray(payload.entry)
  ) {
    return sendJson(res, 400, {
      status: 'error',
      code: 'UNSUPPORTED_OBJECT',
      message: "Expected object 'whatsapp_business_account'.",
    });
  }

  // 5. Minimal privacy-safe diagnostics extraction (NO PII, NO message bodies, NO phone fragments)
  const diagnostics = extractMinimalDiagnostics(payload);
  recordDiagnosticEvent(diagnostics);

  console.info(
    `[WHATSAPP_WEBHOOK] Received event [correlationId=${diagnostics.correlationId}]: class=${diagnostics.eventClass}, entries=${diagnostics.entryCount}, messages=${diagnostics.messageCount}, statuses=${diagnostics.statusCount}`
  );

  // 6. Prompt HTTP 200 OK response
  return sendJson(res, 200, {
    status: 'ok',
    received: true,
    correlationId: diagnostics.correlationId,
    entriesProcessed: diagnostics.entryCount,
    messagesProcessed: diagnostics.messageCount,
    statusesProcessed: diagnostics.statusCount,
  });
}

export interface CatalystAdapterOptions {
  configProvider?: () => WhatsAppWebhookConfig;
}

/**
 * Factory for Catalyst Advanced I/O HTTP request listener.
 * Compatible with vanilla Node.js HTTP server, Express, and Catalyst Advanced I/O function runtime.
 */
export function createCatalystWebhookHandler(options?: CatalystAdapterOptions) {
  const getConfig = options?.configProvider || getWhatsAppWebhookConfig;

  return async function catalystWebhookHandler(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next?: (err?: unknown) => void
  ): Promise<void> {
    const method = (req.method || '').toUpperCase();

    if (method === 'GET') {
      return handleGet(req, res, getConfig());
    }

    if (method === 'POST') {
      return handlePost(req, res, getConfig());
    }

    if (typeof next === 'function') {
      return next();
    }

    return sendJson(
      res,
      405,
      {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET and POST methods are supported.',
      },
      { Allow: 'GET, POST' }
    );
  };
}

export const catalystWebhookHandler = createCatalystWebhookHandler();
