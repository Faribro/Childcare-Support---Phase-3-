import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppWebhookConfig } from '@/lib/server/whatsappWebhookConfig';
import { verifyWebhookHandshake, verifyWebhookSignature } from '@/lib/server/whatsappWebhookVerifier';
import { redactWhatsAppPayload, MetaWhatsAppWebhookPayload } from '@/lib/server/whatsappWebhookParser';
import { recordWebhookEvent } from '@/lib/server/whatsappEventSink';

export const dynamic = 'force-dynamic';

const MAX_PAYLOAD_SIZE = 512 * 1024; // 512 KB

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};

/**
 * GET /api/integrations/whatsapp/webhook
 *
 * Meta Webhook verification handshake.
 * Meta calls this endpoint when configuring or updating the webhook URL in the App Dashboard.
 */
export async function GET(req: NextRequest) {
  const config = getWhatsAppWebhookConfig();

  if (!config.isEnabled) {
    return NextResponse.json(
      { status: 'error', code: 'FEATURE_DISABLED', message: 'WhatsApp webhook integration is disabled.' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const verifyToken = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verification = verifyWebhookHandshake(mode, verifyToken, challenge, config.verifyToken);

  if (!verification.isValid) {
    return NextResponse.json(
      { status: 'error', code: 'VERIFICATION_FAILED', message: verification.error },
      { status: verification.statusCode, headers: NO_CACHE_HEADERS }
    );
  }

  // Meta requires returning hub.challenge directly as text/plain with HTTP 200 OK
  return new Response(verification.challenge, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...NO_CACHE_HEADERS,
    },
  });
}

/**
 * POST /api/integrations/whatsapp/webhook
 *
 * Receive-only test sink for incoming Meta WhatsApp Cloud API webhooks.
 *
 * Security & Data Privacy Guarantees:
 * - Rejects unverified payloads with 401 Unauthorized before JSON parsing.
 * - Enforces HMAC-SHA256 signature verification using timing-safe comparison.
 * - Strips all personally identifiable information (PII) before recording.
 * - Does NOT perform outbound calls, database mutations, or beneficiary outreach.
 * - Returns HTTP 200 OK immediately to satisfy Meta's delivery window (<3s).
 */
export async function POST(req: NextRequest) {
  const config = getWhatsAppWebhookConfig();

  if (!config.isEnabled) {
    return NextResponse.json(
      { status: 'error', code: 'FEATURE_DISABLED', message: 'WhatsApp webhook integration is disabled.' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  if (!config.appSecret) {
    console.error('[WHATSAPP_WEBHOOK] Server misconfiguration: META_APP_SECRET is not configured.');
    return NextResponse.json(
      { status: 'error', code: 'SERVER_MISCONFIGURED', message: 'Webhook receiver is improperly configured.' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }

  // 1. Read raw request bytes for exact HMAC calculation
  let rawBuffer: Buffer;
  try {
    const arrayBuffer = await req.arrayBuffer();
    rawBuffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { status: 'error', code: 'BODY_READ_ERROR', message: 'Failed to read request body.' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // 2. Reject payloads exceeding reasonable limits
  if (rawBuffer.length > MAX_PAYLOAD_SIZE) {
    return NextResponse.json(
      { status: 'error', code: 'PAYLOAD_TOO_LARGE', message: 'Request payload exceeds maximum allowed size.' },
      { status: 413, headers: NO_CACHE_HEADERS }
    );
  }

  // 3. Cryptographic signature verification BEFORE parsing JSON
  const signatureHeader = req.headers.get('x-hub-signature-256');
  const signatureVerification = verifyWebhookSignature(rawBuffer, signatureHeader, config.appSecret);

  if (!signatureVerification.isValid) {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_SIGNATURE', message: signatureVerification.error },
      { status: signatureVerification.statusCode, headers: NO_CACHE_HEADERS }
    );
  }

  // 4. Safe JSON parsing after signature authentication
  let payload: MetaWhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBuffer.toString('utf-8'));
  } catch {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_JSON', message: 'Request body is not valid JSON.' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // 5. Structure validation against WhatsApp Business API schema
  if (!payload || typeof payload !== 'object' || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return NextResponse.json(
      { status: 'error', code: 'UNSUPPORTED_OBJECT', message: "Expected object 'whatsapp_business_account'." },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // 6. Redaction and in-memory test sink recording
  const redactedEvents = redactWhatsAppPayload(payload);
  for (const event of redactedEvents) {
    recordWebhookEvent(event);
  }

  let totalMessages = 0;
  let totalStatuses = 0;
  for (const ev of redactedEvents) {
    totalMessages += ev.messages.length;
    totalStatuses += ev.statuses.length;
  }

  console.info(`[WHATSAPP_WEBHOOK] Received event: entries=${payload.entry.length}, messages=${totalMessages}, statuses=${totalStatuses}`);

  // 7. Prompt HTTP 200 OK response
  return NextResponse.json(
    {
      status: 'ok',
      received: true,
      entriesProcessed: payload.entry.length,
      messagesProcessed: totalMessages,
      statusesProcessed: totalStatuses,
    },
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
}
