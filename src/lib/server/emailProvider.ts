/**
 * Email Provider Abstraction for Leadership Authentication
 * 
 * Guarantees:
 * - Direct ESM/CJS import of nodemailer without eval/hacks
 * - Strict production safety: FORCE_MOCK_EMAIL is rejected in production
 * - Fail closed if email provider unconfigured in production (zero mock fallback)
 * - Zero OTP exposure in email subjects or logs
 * - Standardized env vars: EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, RESEND_API_KEY
 * - Sanitized provider error messages to prevent credential/internal leaks
 */

import nodemailer from 'nodemailer';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  otp?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: 'smtp' | 'resend' | 'mock_logger' | 'apps_script';
}

export interface DispatchedEmailRecord extends SendEmailParams {
  timestamp: string;
  messageId: string;
}

export interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
}

/**
 * Sanitizes provider error messages to prevent leakage of credentials, tokens, or raw bodies.
 */
function sanitizeEmailProviderError(raw: any): string {
  if (!raw) return 'Email delivery service failure';
  const msg = typeof raw === 'string' ? raw : raw?.message || '';
  return msg
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/re_[a-z0-9_-]+/gi, '[REDACTED_API_KEY]')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[REDACTED_EMAIL]')
    .substring(0, 180);
}

// In-memory test store to inspect emails dispatched in tests
class InMemoryEmailStore {
  private emails: DispatchedEmailRecord[] = [];

  record(email: DispatchedEmailRecord): void {
    this.emails.push(email);
  }

  getAll(): DispatchedEmailRecord[] {
    return [...this.emails];
  }

  getLastFor(to: string): DispatchedEmailRecord | undefined {
    const norm = to.trim().toLowerCase();
    for (let i = this.emails.length - 1; i >= 0; i--) {
      if (this.emails[i].to.trim().toLowerCase() === norm) {
        return this.emails[i];
      }
    }
    return undefined;
  }

  clear(): void {
    this.emails = [];
  }
}

export const MockEmailStore = new InMemoryEmailStore();

/**
 * Dev / Test Mock Logger Provider
 */
export class MockEmailProvider implements EmailProvider {
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const messageId = `mock-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    MockEmailStore.record({
      ...params,
      timestamp: new Date().toISOString(),
      messageId,
    });

    console.info(`[EMAIL_DISPATCH:MOCK] To: ${params.to} | Subject: "${params.subject}"`);
    return {
      success: true,
      messageId,
      provider: 'mock_logger',
    };
  }
}

/**
 * Failing Email Provider for Unconfigured / Forbidden Environments
 */
export class FailingEmailProvider implements EmailProvider {
  private reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }

  async sendEmail(_params: SendEmailParams): Promise<SendEmailResult> {
    const sanitized = sanitizeEmailProviderError(this.reason);
    console.error(`[EMAIL_DISPATCH:ERROR] ${sanitized}`);
    return {
      success: false,
      error: sanitized,
      provider: 'mock_logger',
    };
  }
}

/**
 * SMTP Provider (nodemailer)
 */
export class SmtpEmailProvider implements EmailProvider {
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Alliance India Childcare" <auth@allianceindia.org>',
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });

      return {
        success: true,
        messageId: info.messageId,
        provider: 'smtp',
      };
    } catch (err: any) {
      const sanitized = sanitizeEmailProviderError(err);
      console.error('[EMAIL_DISPATCH:SMTP_ERROR]', sanitized);
      return {
        success: false,
        error: sanitized,
        provider: 'smtp',
      };
    }
  }
}

/**
 * Resend Provider
 */
export class ResendEmailProvider implements EmailProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Alliance India <onboarding@resend.dev>',
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        const sanitized = sanitizeEmailProviderError(`Resend HTTP status ${res.status}: ${body}`);
        console.error('[EMAIL_DISPATCH:RESEND_ERROR]', sanitized);
        return {
          success: false,
          error: sanitized,
          provider: 'resend',
        };
      }

      const data = await res.json();
      return {
        success: true,
        messageId: data.id,
        provider: 'resend',
      };
    } catch (err: any) {
      const sanitized = sanitizeEmailProviderError(err);
      console.error('[EMAIL_DISPATCH:RESEND_NETWORK_ERROR]', sanitized);
      return {
        success: false,
        error: sanitized,
        provider: 'resend',
      };
    }
  }
}

/**
 * Google Apps Script Transactional Email Gateway Provider
 * 
 * Used for isolated, high-deliverability transactional OTP dispatch via deployed Google Apps Script.
 * Security & Reliability Guarantees:
 * - Server-side only: Reads APPS_SCRIPT_WEBAPP_URL and APPS_SCRIPT_DISPATCH_SECRET
 * - POSTs JSON with action 'send_leadership_otp', secret, recipient, and otp
 * - Zero logging of dispatch secret, OTP code, or recipient address
 * - Sanitized non-secret error return values
 * - Fails closed if configuration is missing or invalid
 */
export class AppsScriptEmailProvider implements EmailProvider {
  private webappUrl: string;
  private dispatchSecret: string;

  constructor(webappUrl?: string, dispatchSecret?: string) {
    this.webappUrl = (webappUrl || process.env.APPS_SCRIPT_WEBAPP_URL || '').trim();
    this.dispatchSecret = (dispatchSecret || process.env.APPS_SCRIPT_DISPATCH_SECRET || '').trim();
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.webappUrl) {
      const err = 'Apps Script web app URL is not configured.';
      console.error('[EMAIL_DISPATCH:APPS_SCRIPT_CONFIG_ERROR] Missing APPS_SCRIPT_WEBAPP_URL');
      return {
        success: false,
        error: err,
        provider: 'apps_script',
      };
    }

    if (!this.dispatchSecret) {
      const err = 'Apps Script dispatch secret is not configured.';
      console.error('[EMAIL_DISPATCH:APPS_SCRIPT_CONFIG_ERROR] Missing APPS_SCRIPT_DISPATCH_SECRET');
      return {
        success: false,
        error: err,
        provider: 'apps_script',
      };
    }

    const otp = (params.otp || params.text.match(/[0-9a-f]{32}/i)?.[0] || '').trim();
    if (!otp) {
      const err = 'OTP verification code is missing from dispatch payload.';
      console.error('[EMAIL_DISPATCH:APPS_SCRIPT_VALIDATION_ERROR] Missing OTP');
      return {
        success: false,
        error: err,
        provider: 'apps_script',
      };
    }

    try {
      const res = await fetch(this.webappUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_leadership_otp',
          secret: this.dispatchSecret,
          recipient: params.to.trim().toLowerCase(),
          otp,
        }),
      });

      if (!res.ok) {
        console.error('[EMAIL_DISPATCH:APPS_SCRIPT_HTTP_ERROR]', `HTTP status ${res.status}`);
        return {
          success: false,
          error: `Apps Script gateway HTTP error ${res.status}`,
          provider: 'apps_script',
        };
      }

      const data = await res.json().catch(() => null);
      if (!data || data.success !== true) {
        const errorReason = data?.error ? String(data.error) : 'Gateway rejected dispatch request';
        console.error('[EMAIL_DISPATCH:APPS_SCRIPT_GATEWAY_ERROR]', errorReason);
        return {
          success: false,
          error: errorReason,
          provider: 'apps_script',
        };
      }

      return {
        success: true,
        messageId: `gas-otp-${Date.now()}`,
        provider: 'apps_script',
      };
    } catch (err: any) {
      const sanitized = sanitizeEmailProviderError(err);
      console.error('[EMAIL_DISPATCH:APPS_SCRIPT_NETWORK_ERROR]', sanitized);
      return {
        success: false,
        error: sanitized,
        provider: 'apps_script',
      };
    }
  }
}

/**
 * Resolves active email provider.
 * Enforces production security:
 * - Reject FORCE_MOCK_EMAIL in production
 * - Fail closed if no real provider configured in production (strictly NO mock fallback in production)
 */
export function getEmailProvider(): EmailProvider {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.APP_ENV === 'production';

  const providerType = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

  // Explicit Apps Script Gateway selection (supported across production, staging/preview, and local/test)
  if (providerType === 'apps_script') {
    const webappUrl = process.env.APPS_SCRIPT_WEBAPP_URL?.trim();
    const dispatchSecret = process.env.APPS_SCRIPT_DISPATCH_SECRET?.trim();

    if (!webappUrl || !dispatchSecret) {
      return new FailingEmailProvider('Apps Script email gateway is not fully configured (missing URL or dispatch secret).');
    }
    return new AppsScriptEmailProvider(webappUrl, dispatchSecret);
  }

  if (isProduction) {
    if (process.env.FORCE_MOCK_EMAIL === 'true') {
      return new FailingEmailProvider('FORCE_MOCK_EMAIL is strictly forbidden in production.');
    }

    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      return new SmtpEmailProvider();
    }

    if (process.env.RESEND_API_KEY) {
      return new ResendEmailProvider(process.env.RESEND_API_KEY);
    }

    return new FailingEmailProvider('No valid email provider configured in production.');
  }

  // Development / Test resolution
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.FORCE_MOCK_EMAIL !== 'true') {
    return new SmtpEmailProvider();
  }

  if (process.env.RESEND_API_KEY && process.env.FORCE_MOCK_EMAIL !== 'true') {
    return new ResendEmailProvider(process.env.RESEND_API_KEY);
  }

  return new MockEmailProvider();
}

/**
 * Dispatches a Leadership OTP email with security advisory.
 * Guarantees zero OTP plaintext in email subject.
 */
export async function sendLeadershipOtpEmail({
  to,
  name,
  code,
  expiryMinutes = 10,
}: {
  to: string;
  name: string;
  code: string;
  expiryMinutes?: number;
}): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  const subject = 'Your Leadership sign-in code';

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 20px; font-weight: bold; margin: 0;">India HIV/AIDS Alliance</h1>
            <p style="color: #0d9488; font-size: 13px; font-weight: 600; margin: 4px 0 0 0;">Childcare Support Programme — Leadership Access</p>
          </div>

          <p style="color: #334155; font-size: 15px; margin-bottom: 16px;">Hello <strong>${name}</strong>,</p>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            Your sign-in code is:
          </p>

          <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
            <code style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 18px; font-weight: bold; letter-spacing: 0.1em; color: #0f172a; word-break: break-all; display: block;">
              ${code}
            </code>
          </div>

          <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; margin-bottom: 24px;">
            <p style="color: #92400e; font-size: 12px; line-height: 1.5; margin: 0;">
              This code expires in <strong>${expiryMinutes} minutes</strong>. Do not share it. Alliance India staff will never ask for your verification code.
            </p>
          </div>

          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
            If you did not initiate this request, you can safely ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
Your sign-in code is: ${code}

This code expires in ${expiryMinutes} minutes. Do not share it.
  `.trim();

  return provider.sendEmail({
    to,
    subject,
    html,
    text,
    otp: code,
  });
}

