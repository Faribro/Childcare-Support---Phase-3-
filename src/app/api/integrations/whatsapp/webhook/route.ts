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
  getCaregiverSubscriptionStateMachine,
  getDocumentLoopService,
  getWhatsAppOutboundSender,
} from '@/lib/server/whatsappPipelineFactory';
import { SenderIdentityResolver, WhatsAppReportingPipeline } from '@/features/leadership-reporting';
import { IInboundPersistence, InboundClaimResult } from '@/features/whatsapp-document-loop/persistence';
import { CaregiverSubscriptionStateMachine } from '@/features/caregiver-subscription';
import { WhatsAppDocumentLoopService } from '@/features/whatsapp-document-loop';
import { WhatsAppOutboundSender } from '@/lib/server/whatsappOutboundSender';

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
 * Ingress receiver for incoming Meta WhatsApp Cloud API webhooks.
 * Implements:
 * 1. Immediate stream cancellation if Content-Length exceeds bounded limit (256 KB).
 * 2. Strict HMAC-SHA256 signature verification BEFORE JSON parsing.
 * 3. Schema validation against WhatsApp Business API payloads.
 * 4. Atomic durable event claim preventing race conditions on duplicate deliveries.
 * 5. Delivery status receipt correlation (sent/delivered/read/failed).
 * 6. Caller-role routing:
 *    - Authorized leadership staff -> WhatsAppReportingPipeline (strictly read-only surveillance).
 *    - Caregivers & beneficiaries -> CaregiverSubscriptionStateMachine & WhatsAppDocumentLoopService.
 * 7. Privacy preservation: Zero PII in diagnostic logs or response bodies.
 * 8. Fail-closed error handling: returns 503 if persistence is unconfigured in production.
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

  // 6. Durable Inbound Ingestion & Subsystem Factories
  let inboundPersistence: IInboundPersistence;
  let pipeline: WhatsAppReportingPipeline;
  let caregiverStateMachine: CaregiverSubscriptionStateMachine;
  let documentLoopService: WhatsAppDocumentLoopService;
  let outboundSender: WhatsAppOutboundSender;

  try {
    inboundPersistence = getInboundPersistence();
    pipeline = getWhatsAppReportingPipeline();
    caregiverStateMachine = getCaregiverSubscriptionStateMachine();
    documentLoopService = getDocumentLoopService();
    outboundSender = getWhatsAppOutboundSender();
  } catch (initErr: any) {
    console.error('[WHATSAPP_WEBHOOK] Failed to initialize durable persistence:', initErr?.message || initErr);
    return NextResponse.json(
      { status: 'error', code: 'PERSISTENCE_UNAVAILABLE', message: 'Durable event storage is unconfigured.' },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  let duplicateCount = 0;
  let pipelineExecutions = 0;

  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      // 6A. Handle Delivery Status Receipts (change.value.statuses)
      if (Array.isArray(change.value?.statuses)) {
        for (const statusItem of change.value.statuses) {
          const wamid = String(statusItem.id || '');
          const statusType = String(statusItem.status || '').toLowerCase() as 'sent' | 'delivered' | 'read' | 'failed';
          if (wamid && statusType) {
            try {
              await outboundSender.correlateDeliveryReceipt({
                wamid,
                recipientId: String(statusItem.recipient_id || ''),
                status: statusType,
                timestamp: String(statusItem.timestamp || Date.now()),
                error: statusItem.errors?.[0]
                  ? {
                      code: Number(statusItem.errors[0].code) || 0,
                      title: String(statusItem.errors[0].title || ''),
                      message: String(statusItem.errors[0].message || ''),
                    }
                  : undefined,
              });
            } catch (err: any) {
              console.warn(`[WHATSAPP_WEBHOOK] Receipt correlation ignored: ${err?.message || err}`);
            }
          }
        }
      }

      // 6B. Handle Inbound Messages (change.value.messages)
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

        // Atomic claim in durable store
        let claimResult: InboundClaimResult;
        try {
          claimResult = await inboundPersistence.claimInboundEvent({
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
            processingStatus: 'CLAIMED',
          });
        } catch (claimErr: any) {
          console.error(`[WHATSAPP_WEBHOOK] Failed to claim event ${messageId}:`, claimErr?.message || claimErr);
          return NextResponse.json(
            { status: 'error', code: 'PERSISTENCE_UNAVAILABLE', message: 'Durable event storage failed.' },
            { status: 503, headers: NO_CACHE_HEADERS }
          );
        }

        if (
          claimResult.status === 'DUPLICATE_ALREADY_PROCESSED' ||
          claimResult.status === 'DUPLICATE_IN_PROGRESS'
        ) {
          duplicateCount++;
          console.info(`[WHATSAPP_WEBHOOK] Skipping duplicate message ${messageId} (${claimResult.status})`);
          continue;
        }

        // 6C. Caller Role & Intent Routing
        const emailMatch = (msg.text?.body || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const claimedEmail = emailMatch ? emailMatch[0] : undefined;
        const senderIdentity = senderResolver.resolveSender(fromRaw, claimedEmail);

        if (senderIdentity.authorized && senderIdentity.callerScope) {
          // LEADERSHIP ROUTE
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

              const isLiveAllowed = process.env.ALLOW_LIVE_WHATSAPP_SEND === 'true';
              if (isLiveAllowed) {
                console.info(`[WHATSAPP_WEBHOOK] Live send enabled for ${senderMasked}`);
              } else {
                console.info(`[WHATSAPP_WEBHOOK] Outbound response prepared (live sends disabled): intent=${pipelineResult.diagnosticRecord?.intent || 'unknown'}`);
              }
            } catch (err: any) {
              const errMsg = err instanceof Error ? err.message : 'Unknown pipeline error';
              console.error(`[WHATSAPP_WEBHOOK] Pipeline processing failed for ${messageId}:`, errMsg);
              await inboundPersistence.updateEventStatus(messageId, 'FAILED', errMsg);
            }
          }
        } else {
          // CAREGIVER & BENEFICIARY ROUTE
          if (msgType === 'text' && msg.text?.body) {
            try {
              const caregiverResult = await caregiverStateMachine.handleInboundMessage({
                fromPhone: fromRaw,
                messageId,
                textBody: msg.text.body,
                timestamp: String(msg.timestamp || Date.now()),
              });

              pipelineExecutions++;

              await inboundPersistence.updateEventStatus(messageId, 'PROCESSED');

              console.info(`[WHATSAPP_WEBHOOK] Caregiver state transitioned: state=${caregiverResult.record.state}, recipient=${senderMasked}`);
            } catch (cgErr: any) {
              const errMsg = cgErr instanceof Error ? cgErr.message : 'Caregiver processing error';
              console.error(`[WHATSAPP_WEBHOOK] Caregiver handling failed for ${messageId}:`, errMsg);
              await inboundPersistence.updateEventStatus(messageId, 'FAILED', errMsg);
            }
          } else if (msgType === 'image' || msgType === 'document') {
            try {
              const mediaItem = msg.image || msg.document;
              const mediaId = String(mediaItem?.id || '');
              const mimeType = String(mediaItem?.mime_type || (msgType === 'image' ? 'image/jpeg' : 'application/pdf'));

              pipelineExecutions++;
              await inboundPersistence.updateEventStatus(messageId, 'PROCESSED');
              console.info(`[WHATSAPP_WEBHOOK] Media document received [id=${mediaId}, mime=${mimeType}] from ${senderMasked}`);
            } catch (medErr: any) {
              const errMsg = medErr instanceof Error ? medErr.message : 'Media upload error';
              console.error(`[WHATSAPP_WEBHOOK] Media handling failed for ${messageId}:`, errMsg);
              await inboundPersistence.updateEventStatus(messageId, 'FAILED', errMsg);
            }
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
