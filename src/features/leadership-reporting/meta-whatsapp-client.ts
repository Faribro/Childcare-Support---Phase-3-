import { maskPhoneNumber, normalizeToE164 } from './leadership-whatsapp-binding';

export interface MetaOutboundTextMessageRequest {
  readonly to: string; // E.164 format (e.g. "+919876543210")
  readonly body: string;
  readonly correlationId?: string;
  readonly previewUrl?: boolean;
}

export interface MetaOutboundMessageResult {
  readonly success: boolean;
  readonly messageId?: string; // Meta message ID (wamid)
  readonly status: 'ACCEPTED_BY_GATEWAY' | 'FAILED' | 'DRY_RUN_ACCEPTED' | 'SKIPPED_UNAUTHORIZED';
  readonly recipientMasked: string;
  readonly timestamp: string;
  readonly error?: string;
}

export interface IMetaWhatsAppTransport {
  sendMessage(request: MetaOutboundTextMessageRequest): Promise<MetaOutboundMessageResult>;
}

/**
 * Mock WhatsApp transport for safe, local simulation and test suites.
 * Never executes live network requests.
 */
export class MockMetaWhatsAppTransport implements IMetaWhatsAppTransport {
  public readonly dispatchedMessages: MetaOutboundTextMessageRequest[] = [];
  public failNext: boolean = false;

  public async sendMessage(request: MetaOutboundTextMessageRequest): Promise<MetaOutboundMessageResult> {
    const normalizedPhone = normalizeToE164(request.to);
    const masked = maskPhoneNumber(normalizedPhone);
    const timestamp = new Date().toISOString();

    if (this.failNext) {
      this.failNext = false;
      return {
        success: false,
        status: 'FAILED',
        recipientMasked: masked,
        timestamp,
        error: 'SIMULATED_TRANSPORT_FAILURE: Downstream gateway error',
      };
    }

    this.dispatchedMessages.push({
      ...request,
      to: normalizedPhone,
    });

    return {
      success: true,
      messageId: `wamid.synth.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`,
      status: 'DRY_RUN_ACCEPTED',
      recipientMasked: masked,
      timestamp,
    };
  }

  public clear(): void {
    this.dispatchedMessages.length = 0;
    this.failNext = false;
  }
}

/**
 * Live Meta Cloud API Transport
 * Requires explicit environment configuration and user approval before activation.
 */
export class LiveMetaWhatsAppTransport implements IMetaWhatsAppTransport {
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly apiVersion: string;

  constructor(
    phoneNumberId: string = process.env.META_PHONE_NUMBER_ID || '',
    accessToken: string = process.env.META_ACCESS_TOKEN || '',
    apiVersion: string = 'v20.0'
  ) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
  }

  public async sendMessage(request: MetaOutboundTextMessageRequest): Promise<MetaOutboundMessageResult> {
    const normalizedPhone = normalizeToE164(request.to);
    const masked = maskPhoneNumber(normalizedPhone);
    const timestamp = new Date().toISOString();

    if (!this.phoneNumberId || !this.accessToken) {
      return {
        success: false,
        status: 'FAILED',
        recipientMasked: masked,
        timestamp,
        error: 'CONFIG_ERROR: META_PHONE_NUMBER_ID or META_ACCESS_TOKEN is missing. Live dispatch rejected.',
      };
    }

    // Safety constraint: Never send live without approved live flag
    if (process.env.ALLOW_LIVE_WHATSAPP_SEND !== 'true') {
      return {
        success: false,
        status: 'SKIPPED_UNAUTHORIZED',
        recipientMasked: masked,
        timestamp,
        error: 'SAFETY_LATCH: Live WhatsApp delivery disabled. Set ALLOW_LIVE_WHATSAPP_SEND=true to enable.',
      };
    }

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone.replace('+', ''),
        type: 'text',
        text: {
          preview_url: Boolean(request.previewUrl),
          body: request.body,
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return {
          success: false,
          status: 'FAILED',
          recipientMasked: masked,
          timestamp,
          error: `HTTP_${res.status}: ${(errJson as any)?.error?.message || res.statusText}`,
        };
      }

      const data = await res.json() as any;
      const wamid = data?.messages?.[0]?.id || `wamid.live.${Date.now()}`;

      return {
        success: true,
        messageId: wamid,
        status: 'ACCEPTED_BY_GATEWAY',
        recipientMasked: masked,
        timestamp,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        recipientMasked: masked,
        timestamp,
        error: `NETWORK_ERROR: ${err.message}`,
      };
    }
  }
}
