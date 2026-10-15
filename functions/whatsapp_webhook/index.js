"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalystWebhookHandler = exports.NO_CACHE_HEADERS = void 0;
exports.readBoundedStream = readBoundedStream;
exports.createCatalystWebhookHandler = createCatalystWebhookHandler;
const url_1 = require("url");
const whatsappWebhookConfig_1 = require("./whatsappWebhookConfig");
const whatsappWebhookVerifier_1 = require("./whatsappWebhookVerifier");
const whatsappWebhookParser_1 = require("./whatsappWebhookParser");
const whatsappEventSink_1 = require("./whatsappEventSink");
exports.NO_CACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
};
function sendJson(res, statusCode, data, extraHeaders, req) {
    if (res.writableEnded || res.destroyed)
        return;
    const body = JSON.stringify(data);
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body).toString(),
        ...exports.NO_CACHE_HEADERS,
        ...extraHeaders,
    };
    if (statusCode === 413) {
        headers['Connection'] = 'close';
        if (req) {
            res.on('finish', () => {
                setImmediate(() => {
                    if (req.socket && !req.socket.destroyed) {
                        req.socket.destroy();
                    }
                });
            });
        }
    }
    res.writeHead(statusCode, headers);
    res.end(body);
}
function sendText(res, statusCode, text, extraHeaders) {
    if (res.writableEnded || res.destroyed)
        return;
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(text).toString(),
        ...exports.NO_CACHE_HEADERS,
        ...extraHeaders,
    });
    res.end(text);
}
/**
 * Reads request body stream with a hard byte-count ceiling for Node.js IncomingMessage.
 *
 * Connection and stream lifecycle:
 * - Rejects immediately on Content-Length > MAX_RAW_BODY_SIZE (256 KB).
 * - During streaming, when bytes exceed limit, detaches standard listener and drains
 *   up to a bounded 64 KB ceiling to prevent immediate socket reset (ECONNRESET)
 *   while the HTTP 413 response is in flight.
 * - Destroys socket only after response is finished (via Connection: close + finish listener).
 * - Does not perform unbounded buffering or unbounded draining.
 */
function readBoundedStream(req, maxBytes = whatsappWebhookParser_1.MAX_RAW_BODY_SIZE) {
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
        const anyReq = req;
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
        const chunks = [];
        let totalBytes = 0;
        let completed = false;
        function cleanup() {
            req.removeListener('data', onData);
            req.removeListener('end', onEnd);
            req.removeListener('error', onError);
            req.removeListener('close', onClose);
        }
        function onData(chunk) {
            if (completed)
                return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            totalBytes += buf.length;
            if (totalBytes > maxBytes) {
                completed = true;
                cleanup();
                req.pause();
                // Bounded drain: consume and discard up to 64KB so in-flight chunks do not reset TCP before 413 is sent
                let drained = 0;
                const MAX_DRAIN = 64 * 1024;
                const drainListener = (drainChunk) => {
                    drained += Buffer.byteLength(drainChunk);
                    if (drained > MAX_DRAIN) {
                        req.removeListener('data', drainListener);
                        req.pause();
                    }
                };
                req.on('data', drainListener);
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
            if (completed)
                return;
            completed = true;
            cleanup();
            resolve({ success: true, buffer: Buffer.concat(chunks) });
        }
        function onError() {
            if (completed)
                return;
            completed = true;
            cleanup();
            resolve({
                success: false,
                statusCode: 400,
                code: 'BODY_READ_ERROR',
                message: 'Failed to read request body stream.',
            });
        }
        function onClose() {
            if (completed)
                return;
            completed = true;
            cleanup();
            resolve({
                success: false,
                statusCode: 400,
                code: 'CLIENT_ABORTED',
                message: 'Client closed request prematurely.',
            });
        }
        req.on('data', onData);
        req.on('end', onEnd);
        req.on('error', onError);
        req.on('close', onClose);
    });
}
function handleGet(req, res, config) {
    if (!config.isEnabled) {
        return sendJson(res, 404, {
            status: 'error',
            code: 'FEATURE_DISABLED',
            message: 'WhatsApp webhook integration is disabled.',
        });
    }
    const parsedUrl = new url_1.URL(req.url || '/', 'http://localhost');
    const mode = parsedUrl.searchParams.get('hub.mode');
    const verifyToken = parsedUrl.searchParams.get('hub.verify_token');
    const challenge = parsedUrl.searchParams.get('hub.challenge');
    const verification = (0, whatsappWebhookVerifier_1.verifyWebhookHandshake)(mode, verifyToken, challenge, config.verifyToken);
    if (!verification.isValid) {
        return sendJson(res, verification.statusCode, {
            status: 'error',
            code: 'VERIFICATION_FAILED',
            message: verification.error,
        });
    }
    return sendText(res, 200, verification.challenge || '');
}
async function handlePost(req, res, config) {
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
    const bodyReadResult = await readBoundedStream(req, whatsappWebhookParser_1.MAX_RAW_BODY_SIZE);
    if (!bodyReadResult.success) {
        return sendJson(res, bodyReadResult.statusCode, {
            status: 'error',
            code: bodyReadResult.code,
            message: bodyReadResult.message,
        }, undefined, req);
    }
    const rawBuffer = bodyReadResult.buffer;
    // 2. Cryptographic signature verification BEFORE parsing JSON
    const signatureHeaderRaw = req.headers['x-hub-signature-256'];
    const signatureHeader = Array.isArray(signatureHeaderRaw)
        ? signatureHeaderRaw[0]
        : signatureHeaderRaw || null;
    const signatureVerification = (0, whatsappWebhookVerifier_1.verifyWebhookSignature)(rawBuffer, signatureHeader, config.appSecret);
    if (!signatureVerification.isValid) {
        return sendJson(res, signatureVerification.statusCode, {
            status: 'error',
            code: 'INVALID_SIGNATURE',
            message: signatureVerification.error,
        });
    }
    // 3. Safe JSON parsing after signature authentication
    let payload;
    try {
        payload = JSON.parse(rawBuffer.toString('utf-8'));
    }
    catch {
        return sendJson(res, 400, {
            status: 'error',
            code: 'INVALID_JSON',
            message: 'Request body is not valid JSON.',
        });
    }
    // 4. Structure validation against WhatsApp Business API schema
    if (!payload ||
        typeof payload !== 'object' ||
        payload.object !== 'whatsapp_business_account' ||
        !Array.isArray(payload.entry)) {
        return sendJson(res, 400, {
            status: 'error',
            code: 'UNSUPPORTED_OBJECT',
            message: "Expected object 'whatsapp_business_account'.",
        });
    }
    // 5. Minimal privacy-safe diagnostics extraction (NO PII, NO message bodies, NO phone fragments)
    const diagnostics = (0, whatsappWebhookParser_1.extractMinimalDiagnostics)(payload);
    (0, whatsappEventSink_1.recordDiagnosticEvent)(diagnostics);
    console.info(`[WHATSAPP_WEBHOOK] Received event [correlationId=${diagnostics.correlationId}]: class=${diagnostics.eventClass}, entries=${diagnostics.entryCount}, messages=${diagnostics.messageCount}, statuses=${diagnostics.statusCount}`);
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
/**
 * Factory for Catalyst Advanced I/O HTTP request listener.
 * Compatible with vanilla Node.js HTTP server, Express, and Catalyst Advanced I/O function runtime.
 */
function createCatalystWebhookHandler(options) {
    const getConfig = options?.configProvider || whatsappWebhookConfig_1.getWhatsAppWebhookConfig;
    return async function catalystWebhookHandler(req, res, next) {
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
        return sendJson(res, 405, {
            status: 'error',
            code: 'METHOD_NOT_ALLOWED',
            message: 'Only GET and POST methods are supported.',
        }, { Allow: 'GET, POST' });
    };
}
exports.catalystWebhookHandler = createCatalystWebhookHandler();


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
