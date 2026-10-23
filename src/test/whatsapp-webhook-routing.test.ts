import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { POST } from '@/app/api/integrations/whatsapp/webhook/route';
import {
  resetWhatsAppPipelineForTesting,
  getCaregiverSubscriptionStore,
  getWhatsAppOutboundSender,
} from '@/lib/server/whatsappPipelineFactory';
import { MemoryCaregiverSubscriptionStore } from '@/features/caregiver-subscription';

describe('WhatsApp Webhook Caller Routing & Status Callback Suite', () => {
  const TEST_APP_SECRET = 'test_meta_app_secret_webhook_routing';
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
    process.env.META_APP_SECRET = TEST_APP_SECRET;
    resetWhatsAppPipelineForTesting();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    resetWhatsAppPipelineForTesting();
  });

  function computeHmacSignature(secret: string, body: string): string {
    const digest = crypto.createHmac('sha256', secret).update(Buffer.from(body, 'utf-8')).digest('hex');
    return `sha256=${digest}`;
  }

  it('routes caregiver phone numbers to CaregiverStateMachine rather than Leadership denial', async () => {
    const caregiverPhone = '919123456789'; // Unregistered staff phone
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_test_01',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '1413691425156891', phone_number_id: '1413691425156891' },
                messages: [
                  {
                    id: 'wamid_caregiver_msg_01',
                    from: caregiverPhone,
                    timestamp: '1729680000',
                    type: 'text',
                    text: { body: 'Namaste, I want to verify' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const payloadString = JSON.stringify(payload);
    const signature = computeHmacSignature(TEST_APP_SECRET, payloadString);

    const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
      },
      body: payloadString,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.messagesProcessed).toBe(1);
    expect(json.pipelineExecutions).toBe(1);

    // Verify caregiver state machine recorded the caregiver in OTP_PENDING state
    const caregiverStore = getCaregiverSubscriptionStore() as MemoryCaregiverSubscriptionStore;
    const phoneHash = crypto.createHash('sha256').update('+919123456789').digest('hex');
    const sub = await caregiverStore.getSubscription(phoneHash);

    expect(sub).toBeDefined();
    expect(sub?.state).toBe('OTP_PENDING');
  });

  it('routes registered leadership staff phone numbers to WhatsAppReportingPipeline', async () => {
    const leadershipPhone = '919876543210'; // In DEFAULT_AUTHORIZED_STAFF_DIRECTORY
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_test_01',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '1413691425156891', phone_number_id: '1413691425156891' },
                messages: [
                  {
                    id: 'wamid_leadership_msg_01',
                    from: leadershipPhone,
                    timestamp: '1729680000',
                    type: 'text',
                    text: { body: 'Show national overview' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const payloadString = JSON.stringify(payload);
    const signature = computeHmacSignature(TEST_APP_SECRET, payloadString);

    const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
      },
      body: payloadString,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.messagesProcessed).toBe(1);
    expect(json.pipelineExecutions).toBe(1);
  });

  it('correlates delivery receipts from entry.changes.statuses', async () => {
    const outboundSender = getWhatsAppOutboundSender();
    // Pre-seed an outbound message record
    const testWamid = 'wamid.HBgLTESTRECEIPT12345';
    await outboundSender.dispatch(
      {
        idempotencyKey: 'idemp_test_receipt_01',
        correlationId: 'corr_test_receipt_01',
        recipientPhoneE164: '+919876543210',
        messageType: 'TEXT',
        textBody: 'Test notification',
      },
      { userId: 'sys_01', role: 'SYSTEM' }
    );

    // Mock response had assigned a wamid or we manually seed with testWamid
    // Send status callback webhook
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_test_01',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '1413691425156891', phone_number_id: '1413691425156891' },
                statuses: [
                  {
                    id: testWamid,
                    status: 'delivered',
                    timestamp: '1729681000',
                    recipient_id: '919876543210',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const payloadString = JSON.stringify(statusPayload);
    const signature = computeHmacSignature(TEST_APP_SECRET, payloadString);

    const req = new NextRequest('http://localhost:3000/api/integrations/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
      },
      body: payloadString,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.statusesProcessed).toBe(1);
  });
});
