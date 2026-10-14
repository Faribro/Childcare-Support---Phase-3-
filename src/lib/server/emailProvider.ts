/**
 * Email Provider Abstraction
 * 
 * Supports SMTP (nodemailer), Resend, and Dev/Test Mock Logger fallback.
 * Never leaks credentials, never fails closed in test environments without email credentials.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: 'smtp' | 'resend' | 'mock_logger';
}

export interface DispatchedEmailRecord extends SendEmailParams {
  timestamp: string;
  messageId: string;
}

export interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
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
 * SMTP Provider (nodemailer)
 */
export class SmtpEmailProvider implements EmailProvider {
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const nodeRequire = eval('require');
      const nodemailer: any = nodeRequire('nodemailer');
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
      console.error('[EMAIL_DISPATCH:SMTP_ERROR]', err?.message);
      return {
        success: false,
        error: err?.message || 'SMTP transmission failure',
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
          'Authorization': `Bearer ${this.apiKey}`,
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
        return {
          success: false,
          error: `Resend HTTP error ${res.status}: ${body}`,
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
      console.error('[EMAIL_DISPATCH:RESEND_ERROR]', err?.message);
      return {
        success: false,
        error: err?.message || 'Resend API network failure',
        provider: 'resend',
      };
    }
  }
}

/**
 * Factory resolving the active email provider.
 * Selection priority:
 * 1. Mock Logger if in test environment or mock forced
 * 2. SMTP if SMTP_HOST configured
 * 3. Resend if RESEND_API_KEY configured
 * 4. Fallback to Mock Logger
 */
export function getEmailProvider(): EmailProvider {
  if (process.env.NODE_ENV === 'test' || process.env.FORCE_MOCK_EMAIL === 'true') {
    return new MockEmailProvider();
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return new SmtpEmailProvider();
  }

  if (process.env.RESEND_API_KEY) {
    return new ResendEmailProvider(process.env.RESEND_API_KEY);
  }

  return new MockEmailProvider();
}

/**
 * Dispatches a Leadership OTP email with security advisory.
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
  const subject = `Your Alliance India Leadership Sign-In Code: ${code.substring(0, 8)}...`;

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
            A sign-in request was initiated for your individual Leadership account. Please use the verification code below to complete authentication:
          </p>

          <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">
              Your 128-Bit Verification Code
            </div>
            <code style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 18px; font-weight: bold; letter-spacing: 0.1em; color: #0f172a; word-break: break-all; display: block;">
              ${code}
            </code>
          </div>

          <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; margin-bottom: 24px;">
            <p style="color: #92400e; font-size: 12px; line-height: 1.5; margin: 0;">
              <strong>Security Notice:</strong> This single-use code expires in <strong>${expiryMinutes} minutes</strong>. Never share this code with anyone. Alliance India staff will never ask for your authentication challenge code.
            </p>
          </div>

          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
            If you did not initiate this request, your account may be under review or someone entered your email by mistake. You can safely ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
India HIV/AIDS Alliance — Leadership Access
------------------------------------------------
Hello ${name},

A sign-in request was initiated for your individual Leadership account.

Verification Code:
${code}

This single-use code expires in ${expiryMinutes} minutes.
Never share this code with anyone.

If you did not request this, you can safely ignore this email.
  `.trim();

  return provider.sendEmail({
    to,
    subject,
    html,
    text,
  });
}
