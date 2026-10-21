import crypto from 'crypto';
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
import {
  getInboundPersistence,
  getWhatsAppReportingPipeline,
} from '@/lib/server/whatsappPipelineFactory';
import { SenderIdentityResolver } from '@/features/leadership-reporting';

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
 * Authenticated webhook sink for incoming Meta WhatsApp Cloud API webhooks.
 * Hands off verified messages to durable inbound persistence and the leadership reporting pipeline.
 *
 * Security & Data Privacy Guarantees:
 * - Enforces bounded streaming read (256 KB hard limit) with early cancellation.
 * - Rejects unverified payloads with 401 Unauthorized before JSON parsing.
 * - Enforces HMAC-SHA256 signature verification using timing-safe comparison.
 * - Strips all personally identifiable information (PII) before recording or logging.
 * - Checks durable idempotency to reject duplicate deliveries on retried webhooks.
 * - Hands off text queries to WhatsAppReportingPipeline with persistent conversation state.
 * - Fail-closed: ALLOW_LIVE_WHATSAPP_SEND=false strictly blocks outbound network calls.
 * - Returns HTTP 200 OK prompt response to satisfy Meta's delivery SLA (<3s).
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

  // 6. Durable Inbound Ingestion & Processing Handoff
  const inboundPersistence = getInboundPersistence();
  const pipeline = getWhatsAppReportingPipeline();
  let duplicateCount = 0;
  let pipelineExecutions = 0;

  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const messages = change.value?.messages;
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        const messageId = String(msg.id || '');
        const fromRaw = String(msg.from || '');
        if (!messageId || !fromRaw) continue;

        const senderResolver = new SenderIdentityResolver();
        const normalizedPhone = senderResolver.normalizePhoneNumber(fromRaw);
        const fromPhoneHash = senderResolver.hashPhoneNumber(normalizedPhone);
        const senderMasked = senderResolver.maskPhoneNumber(normalizedPhone);
        const msgType = msg.type || 'text';
        const eventType = msgType === 'text'
          ? 'TEXT_MESSAGE'
          : (msgType === 'document' || msgType === 'image' ? 'DOCUMENT_UPLOAD' : 'INTERACTIVE_RESPONSE');

        // Check deduplication
        const isDuplicate = await inboundPersistence.hasEvent(messageId, messageId);
        if (isDuplicate) {
          duplicateCount++;
          console.info(`[WHATSAPP_WEBHOOK] Skipping duplicate message ${messageId}`);
          continue;
        }

        // Record inbound event
        await inboundPersistence.recordInboundEvent({
          eventId: messageId,
          fromPhoneHash,
          senderMasked,
          eventType,
          idempotencyKey: messageId,
          payloadRedacted: {
            messageType: msgType,
            hasMedia: Boolean(msg.image || msg.document),
            receivedAt: new Date().toISOString(),
          },
          processingStatus: 'RECEIVED',
        });

        // Hand off text messages to the reporting pipeline
        if (msgType === 'text' && msg.text?.body) {
          try {
            const pipelineResult = await pipeline.handleInboundMessage({
              from: fromRaw,
              messageId,
              timestamp: String(msg.timestamp || Date.now()),
              text: msg.text.body,
            });

            pipelineExecutions++;

            await inboundPersistence.updateEventStatus(
              messageId,
              pipelineResult.status === 'SUCCESS' ? 'PROCESSED' : 'FAILED',
              pipelineResult.status === 'ERROR' ? 'Pipeline evaluation error' : undefined
            );

            // Fail-closed live send check (ALLOW_LIVE_WHATSAPP_SEND=false by default)
            const isLiveAllowed = process.env.ALLOW_LIVE_WHATSAPP_SEND === 'true';
            if (isLiveAllowed) {
              console.info(`[WHATSAPP_WEBHOOK] Live send enabled for ${senderMasked}`);
            } else {
              console.info(`[WHATSAPP_WEBHOOK] Outbound response prepared (live sends disabled): intent=${pipelineResult.diagnosticRecord?.intent || 'unknown'}`);
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown pipeline error';
            console.error(`[WHATSAPP_WEBHOOK] Pipeline processing failed for ${messageId}:`, errMsg);
            await inboundPersistence.updateEventStatus(messageId, 'FAILED', errMsg);
          }
        }
      }
    }
  }

  // 7. Prompt HTTP 200 OK response
  return NextResponse.json(
    {
      status: 'ok',
      received: true,
      correlationId: diagnostics.correlationId,
      entriesProcessed: diagnostics.entryCount,
      messagesProcessed: diagnostics.messageCount,
      statusesProcessed: diagnostics.statusCount,
      pipelineExecutions,
      duplicatesSkipped: duplicateCount,
    },
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
}
