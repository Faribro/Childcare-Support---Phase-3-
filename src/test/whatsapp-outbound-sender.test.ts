import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  WhatsAppOutboundSender,
  MockWhatsAppHttpTransport,
  PersistentFileOutboundRegistry,
  validateE164Phone,
  maskRecipientPhone,
} from '@/lib/server/whatsappOutboundSender';
import type {
  CallerSecurityContext,
  OutboundDispatchParams,
} from '@/lib/server/whatsappOutboundSender';

describe('WhatsApp Outbound Sender Adapter Suite (Task 3)', () => {
  const testRegistryPath = path.join(process.cwd(), '.cache', 'test_outbound_registry.json');
  let mockTransport: MockWhatsAppHttpTransport;
  let registry: PersistentFileOutboundRegistry;
  let sender: WhatsAppOutboundSender;

  const validCaller: CallerSecurityContext = {
    userId: 'user-supervisor-01',
    role: 'SUPERVISOR',
    permittedStates: ['Maharashtra'],
  };

  beforeEach(async () => {
    if (fs.existsSync(testRegistryPath)) fs.unlinkSync(testRegistryPath);
    mockTransport = new MockWhatsAppHttpTransport();
    registry = new PersistentFileOutboundRegistry({ filePath: testRegistryPath });
    await registry.clear();

    sender = new WhatsAppOutboundSender(
      {
        accessToken: 'mock_meta_access_token_secret_123',
        phoneNumberId: '109876543210987',
        graphApiVersion: 'v19.0',
        graphBaseUrl: 'https://graph.facebook.com',
      },
      mockTransport,
      registry
    );
  });

  afterEach(async () => {
    if (fs.existsSync(testRegistryPath)) fs.unlinkSync(testRegistryPath);
  });

  describe('1. Trusted Recipient Resolution & Strict E.164 Validation', () => {
    it('accepts valid international E.164 phone numbers', () => {
      expect(validateE164Phone('+919820010170').valid).toBe(true);
      expect(validateE164Phone('+14155552671').valid).toBe(true);
      expect(validateE164Phone('+447911123456').valid).toBe(true);
    });

    it('rejects masked phone strings fail-closed', () => {
      const masked1 = validateE164Phone('******0170');
      expect(masked1.valid).toBe(false);
      expect(masked1.error).toContain('INVALID_E164_PHONE');
      expect(masked1.error).toContain('Masked phone number');

      const masked2 = validateE164Phone('+91 ******0170');
      expect(masked2.valid).toBe(false);
      expect(masked2.error).toContain('INVALID_E164_PHONE');

      const masked3 = validateE164Phone('XXXXXX0170');
      expect(masked3.valid).toBe(false);
      expect(masked3.error).toContain('INVALID_E164_PHONE');
    });

    it('rejects numbers missing "+" prefix or containing letters/spaces fail-closed', () => {
      expect(validateE164Phone('919820010170').valid).toBe(false);
      expect(validateE164Phone('+91 98200 10170').valid).toBe(false);
      expect(validateE164Phone('+91-98200-10170').valid).toBe(false);
      expect(validateE164Phone('').valid).toBe(false);
    });

    it('masks phone numbers safely for display and logging without PII leakage', () => {
      expect(maskRecipientPhone('+919820010170')).toBe('******0170');
      expect(maskRecipientPhone('123')).toBe('******');
    });

    it('fails closed when dispatch is attempted with a masked phone number', async () => {
      const dispatchParams: OutboundDispatchParams = {
        idempotencyKey: 'idemp-masked-attempt',
        correlationId: 'corr-masked',
        recipientPhoneE164: '******0170',
        messageType: 'TEXT',
        textBody: 'Hello caregiver',
      };

      const result = await sender.dispatch(dispatchParams, validCaller);
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('INVALID_E164_PHONE');
      expect(mockTransport.recordedRequests.length).toBe(0);
    });
  });

  describe('2. Endpoint Configuration, Secrets & Headers', () => {
    it('constructs correct Meta Graph API URL with configured version and phoneNumberId', async () => {
      const dispatchParams: OutboundDispatchParams = {
        idempotencyKey: 'idemp-endpoint-check',
        correlationId: 'corr-endpoint',
        recipientPhoneE164: '+919820010170',
        messageType: 'DOCUMENT_REQUEST',
        documentRequest: {
          childName: 'Aarav Kumar',
          docType: 'NUTRITION_CARD',
          uploadToken: 'UPLOAD_SYNTH_BEN-001_NUTRITION-CARD',
        },
      };

      const result = await sender.dispatch(dispatchParams, validCaller);
      expect(result.success).toBe(true);
      expect(result.status).toBe('ACCEPTED_BY_GATEWAY');

      expect(mockTransport.recordedRequests.length).toBe(1);
      const req = mockTransport.recordedRequests[0];
      expect(req.url).toBe('https://graph.facebook.com/v19.0/109876543210987/messages');
      expect(req.headers['Authorization']).toBe('Bearer mock_meta_access_token_secret_123');
      expect(req.headers['X-Correlation-Id']).toBe('corr-endpoint');
      expect(req.body.to).toBe('+919820010170');
    });
  });

  describe('3. Idempotency Protection', () => {
    it('returns cached acceptance without sending duplicate network requests', async () => {
      const dispatchParams: OutboundDispatchParams = {
        idempotencyKey: 'idemp-unique-key-999',
        correlationId: 'corr-idemp',
        recipientPhoneE164: '+919820010170',
        messageType: 'TEXT',
        textBody: 'Please upload the missing card.',
      };

      // First dispatch
      const firstResult = await sender.dispatch(dispatchParams, validCaller);
      expect(firstResult.success).toBe(true);
      expect(firstResult.status).toBe('ACCEPTED_BY_GATEWAY');
      expect(firstResult.isDuplicate).toBeFalsy();
      expect(mockTransport.recordedRequests.length).toBe(1);

      // Second dispatch with same idempotency key
      const secondResult = await sender.dispatch(dispatchParams, validCaller);
      expect(secondResult.success).toBe(true);
      expect(secondResult.status).toBe('ACCEPTED_BY_GATEWAY');
      expect(secondResult.isDuplicate).toBe(true);
      expect(secondResult.wamid).toBe(firstResult.wamid);

      // Zero additional HTTP calls made
      expect(mockTransport.recordedRequests.length).toBe(1);
    });
  });

  describe('4. Outcome Classification: ACCEPTED, FAILED, and UNCERTAIN', () => {
    it('marks result as ACCEPTED_BY_GATEWAY and records wamid on HTTP 200', async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        data: {
          messaging_product: 'whatsapp',
          messages: [{ id: 'wamid.HBgLMTIzNDU2' }],
        },
      });

      const result = await sender.dispatch(
        {
          idempotencyKey: 'idemp-success-200',
          correlationId: 'corr-200',
          recipientPhoneE164: '+919820010170',
          messageType: 'TEXT',
          textBody: 'Success message',
        },
        validCaller
      );

      expect(result.status).toBe('ACCEPTED_BY_GATEWAY');
      expect(result.wamid).toBe('wamid.HBgLMTIzNDU2');
      expect(result.gatewayStatusCode).toBe(200);
    });

    it('marks result as FAILED on HTTP 400 Client Error', async () => {
      mockTransport.setDefaultResponse({
        status: 400,
        data: {
          error: {
            message: 'Template does not exist in selected language.',
            code: 100,
          },
        },
      });

      const result = await sender.dispatch(
        {
          idempotencyKey: 'idemp-client-error-400',
          correlationId: 'corr-400',
          recipientPhoneE164: '+919820010170',
          messageType: 'TEMPLATE',
          templateName: 'non_existent_template',
        },
        validCaller
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.gatewayStatusCode).toBe(400);
      expect(result.error).toContain('Template does not exist');
    });

    it('marks result as UNCERTAIN on HTTP 500 or network timeout (at-least-once aware)', async () => {
      mockTransport.setDefaultResponse({
        status: 503,
        error: 'Upstream gateway temporarily unavailable.',
      });

      const result = await sender.dispatch(
        {
          idempotencyKey: 'idemp-timeout-503',
          correlationId: 'corr-503',
          recipientPhoneE164: '+919820010170',
          messageType: 'TEXT',
          textBody: 'Retryable message',
        },
        validCaller
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('UNCERTAIN');
      expect(result.gatewayStatusCode).toBe(503);
      expect(result.error).toContain('Upstream gateway temporarily unavailable');
    });
  });

  describe('5. Delivery Receipt Correlation', () => {
    it('correlates incoming delivery receipt with stored outbound record by wamid', async () => {
      const fixedWamid = 'wamid.HBgLTESTCORRELATION99';
      mockTransport.setDefaultResponse({
        status: 200,
        data: { messages: [{ id: fixedWamid }] },
      });

      const dispatchResult = await sender.dispatch(
        {
          idempotencyKey: 'idemp-correlate-test',
          correlationId: 'corr-receipt',
          recipientPhoneE164: '+919820010170',
          messageType: 'TEXT',
          textBody: 'Track delivery',
        },
        validCaller
      );

      expect(dispatchResult.wamid).toBe(fixedWamid);

      // Simulate incoming Meta delivery receipt: status 'delivered'
      const correlationResult = await sender.correlateDeliveryReceipt({
        wamid: fixedWamid,
        recipientId: '919820010170',
        status: 'delivered',
        timestamp: new Date().toISOString(),
      });

      expect(correlationResult.correlated).toBe(true);
      expect(correlationResult.previousStatus).toBe('ACCEPTED_BY_GATEWAY');
      expect(correlationResult.currentStatus).toBe('DELIVERED');

      // Subsequent read receipt
      const readResult = await sender.correlateDeliveryReceipt({
        wamid: fixedWamid,
        recipientId: '919820010170',
        status: 'read',
        timestamp: new Date().toISOString(),
      });

      expect(readResult.correlated).toBe(true);
      expect(readResult.currentStatus).toBe('READ');
    });

    it('returns correlated: false for unknown wamid', async () => {
      const result = await sender.correlateDeliveryReceipt({
        wamid: 'wamid.UNKNOWN_NON_EXISTENT',
        recipientId: '919820010170',
        status: 'delivered',
        timestamp: new Date().toISOString(),
      });

      expect(result.correlated).toBe(false);
      expect(result.error).toContain('No outbound message record found');
    });
  });
});
