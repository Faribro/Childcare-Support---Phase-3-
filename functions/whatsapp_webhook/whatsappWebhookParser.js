"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RAW_BODY_SIZE = void 0;
exports.extractMinimalDiagnostics = extractMinimalDiagnostics;
exports.readBoundedRawBody = readBoundedRawBody;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Hard limit on raw request body size: 256 KB.
 * Official Meta WhatsApp webhook batches are typically < 10 KB.
 * Streaming requests exceeding this limit are terminated early to prevent DoS.
 */
exports.MAX_RAW_BODY_SIZE = 256 * 1024; // 256 KB
/**
 * Derives a minimal privacy-safe diagnostic record from an incoming payload.
 * Completely strips all PII and sensitive fields.
 */
function extractMinimalDiagnostics(payload, correlationId = crypto_1.default.randomUUID()) {
    const now = new Date().toISOString();
    if (!payload || !Array.isArray(payload.entry)) {
        return {
            correlationId,
            receivedAt: now,
            eventClass: 'unknown',
            entryCount: 0,
            messageCount: 0,
            statusCount: 0,
            hasErrors: false,
            errorCodes: [],
        };
    }
    let totalMessages = 0;
    let totalStatuses = 0;
    const errorCodes = [];
    for (const entry of payload.entry) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
            const val = change?.value;
            if (Array.isArray(val?.messages)) {
                totalMessages += val.messages.length;
            }
            if (Array.isArray(val?.statuses)) {
                totalStatuses += val.statuses.length;
                for (const st of val.statuses) {
                    if (Array.isArray(st.errors)) {
                        for (const err of st.errors) {
                            if (typeof err.code === 'number') {
                                errorCodes.push(err.code);
                            }
                        }
                    }
                }
            }
            if (Array.isArray(val?.errors)) {
                for (const err of val.errors) {
                    if (typeof err.code === 'number') {
                        errorCodes.push(err.code);
                    }
                }
            }
        }
    }
    let eventClass = 'general';
    if (totalMessages > 0 && totalStatuses === 0) {
        eventClass = 'message';
    }
    else if (totalStatuses > 0 && totalMessages === 0) {
        eventClass = 'status';
    }
    else if (totalMessages > 0 && totalStatuses > 0) {
        eventClass = 'general';
    }
    return {
        correlationId,
        receivedAt: now,
        eventClass,
        entryCount: payload.entry.length,
        messageCount: totalMessages,
        statusCount: totalStatuses,
        hasErrors: errorCodes.length > 0,
        errorCodes,
    };
}
/**
 * Reads request body stream with a hard byte-count ceiling.
 * If the byte limit is exceeded at any point during streaming, the stream
 * reader is immediately cancelled to prevent unbounded memory allocation.
 */
async function readBoundedRawBody(req, maxBytes = exports.MAX_RAW_BODY_SIZE) {
    // 1. Fast pre-check: Content-Length header
    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > maxBytes) {
            return {
                success: false,
                statusCode: 413,
                code: 'PAYLOAD_TOO_LARGE',
                message: 'Request payload exceeds maximum allowed size.',
            };
        }
    }
    // 2. Stream consumption with byte ceiling & early cancellation
    if (!req.body) {
        try {
            const arrayBuf = await req.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            if (buf.length > maxBytes) {
                return {
                    success: false,
                    statusCode: 413,
                    code: 'PAYLOAD_TOO_LARGE',
                    message: 'Request payload exceeds maximum allowed size.',
                };
            }
            return { success: true, buffer: buf };
        }
        catch {
            return { success: true, buffer: Buffer.alloc(0) };
        }
    }
    const reader = req.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (value) {
                totalBytes += value.length;
                if (totalBytes > maxBytes) {
                    // Immediately terminate the underlying stream
                    await reader.cancel('Payload exceeded maximum byte limit');
                    return {
                        success: false,
                        statusCode: 413,
                        code: 'PAYLOAD_TOO_LARGE',
                        message: 'Request payload exceeds maximum allowed size.',
                    };
                }
                chunks.push(value);
            }
        }
    }
    catch {
        return {
            success: false,
            statusCode: 400,
            code: 'BODY_READ_ERROR',
            message: 'Failed to read request body stream.',
        };
    }
    return {
        success: true,
        buffer: Buffer.concat(chunks),
    };
}
