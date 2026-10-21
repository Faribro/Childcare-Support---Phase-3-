import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppWebhookConfig } from '@/lib/server/whatsappWebhookConfig';
import { verifyWebhookHandshake, verifyWebhookSignature } from '@/lib/server/whatsappWebhookVerifier';
import {
  extractMinimalDiagnostics,
  MetaWhatsAppWebhookPayload,
  readBoundedRawBody,
  MAX_RAW_BODY_SIZE,
} from '@/lib/server/whatsappWebhookParser';
import { recordDiagnosticEvent } from '@/lib/server/whatsappEventSink';

export const dynamic = 'force-dynamic';

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
 * - Enforces bounded streaming read (256 KB hard limit) with early cancellation.
 * - Rejects unverified payloads with 401 Unauthorized before JSON parsing.
 * - Enforces HMAC-SHA256 signature verification using timing-safe comparison.
 * - Strips all personally identifiable information (PII) before recording or logging.
 * - Retains only minimal diagnostics (event class, aggregate counts, random correlation ID).
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

  // 1. Read bounded raw request bytes with stream cancellation
  const bodyReadResult = await readBoundedRawBody(req, MAX_RAW_BODY_SIZE);
  if (!bodyReadResult.success) {
    return NextResponse.json(
      { status: 'error', code: bodyReadResult.code, message: bodyReadResult.message },
      { status: bodyReadResult.statusCode, headers: NO_CACHE_HEADERS }
    );
  }

  const rawBuffer = bodyReadResult.buffer;

  // 2. Cryptographic signature verification BEFORE parsing JSON
  const signatureHeader = req.headers.get('x-hub-signature-256');
  const signatureVerification = verifyWebhookSignature(rawBuffer, signatureHeader, config.appSecret);

  if (!signatureVerification.isValid) {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_SIGNATURE', message: signatureVerification.error },
      { status: signatureVerification.statusCode, headers: NO_CACHE_HEADERS }
    );
  }

  // 3. Safe JSON parsing after signature authentication
  let payload: MetaWhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBuffer.toString('utf-8'));
  } catch {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_JSON', message: 'Request body is not valid JSON.' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // 4. Structure validation against WhatsApp Business API schema
  if (!payload || typeof payload !== 'object' || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return NextResponse.json(
      { status: 'error', code: 'UNSUPPORTED_OBJECT', message: "Expected object 'whatsapp_business_account'." },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // 5. Minimal privacy-safe diagnostics extraction (NO PII, NO message bodies, NO phone fragments)
  const diagnostics = extractMinimalDiagnostics(payload);
  recordDiagnosticEvent(diagnostics);

  console.info(
    `[WHATSAPP_WEBHOOK] Received event [correlationId=${diagnostics.correlationId}]: class=${diagnostics.eventClass}, entries=${diagnostics.entryCount}, messages=${diagnostics.messageCount}, statuses=${diagnostics.statusCount}`
  );

  // 6. Prompt HTTP 200 OK response
  return NextResponse.json(
    {
      status: 'ok',
      received: true,
      correlationId: diagnostics.correlationId,
      entriesProcessed: diagnostics.entryCount,
      messagesProcessed: diagnostics.messageCount,
      statusesProcessed: diagnostics.statusCount,
    },
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
}
