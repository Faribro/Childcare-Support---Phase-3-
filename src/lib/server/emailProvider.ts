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
  action?: string;
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

    const recipient = params.to.trim().toLowerCase();
    const action = params.action || (
      params.subject?.includes('State Team')
        ? 'send_state_team_otp'
        : params.subject?.includes('Invitation')
          ? 'send_state_team_invitation'
          : 'send_leadership_otp'
    );

    try {
      let res = await fetch(this.webappUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          secret: this.dispatchSecret,
          webhookSecret: process.env.WEBHOOK_SECRET || '',
          dispatchSecret: this.dispatchSecret,
          recipient,
          otp,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      let data = await res.json().catch(() => null);

      // If remote deployment is an older version that only recognizes 'send_leadership_otp', retry with legacy action
      if ((!res.ok || data?.error === 'AUTH_INVALID_ACTION') && action !== 'send_leadership_otp') {
        res = await fetch(this.webappUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_leadership_otp',
            secret: this.dispatchSecret,
            recipient,
            otp,
          }),
        });
        data = await res.json().catch(() => null);
      }

      if (!res.ok) {
        console.error('[EMAIL_DISPATCH:APPS_SCRIPT_HTTP_ERROR]', `HTTP status ${res.status}`);
        return {
          success: false,
          error: `Apps Script gateway HTTP error ${res.status}`,
          provider: 'apps_script',
        };
      }

      // data was already parsed above
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



/**
 * Dispatches a State Team OTP email for email verification.
 * Zero OTP plaintext in email subject.
 */
export async function sendStateTeamOtpEmail({
  to,
  name,
  state,
  code,
  expiryMinutes = 10,
  invitationCode,
  invitationExpiryDays = 30,
  maxRedemptions = 50,
  isPreApproved = false,
}: {
  to: string;
  name: string;
  state: string;
  code: string;
  expiryMinutes?: number;
  invitationCode?: string;
  invitationExpiryDays?: number;
  maxRedemptions?: number;
  isPreApproved?: boolean;
}): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  const subject = invitationCode
    ? `Your State Team Verification & Field Invitation Code — ${state}`
    : `Your State Team Verification Code — ${state}`;

  const invitationSectionHtml = invitationCode
    ? `
      <div style="margin-top: 28px; padding-top: 24px; border-top: 2px dashed #cbd5e1;">
        <span style="font-size: 11px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">SECTION B</span>
        <h2 style="color: #0f172a; font-size: 17px; font-weight: 700; margin: 0 0 8px 0;">Your field-team invitation code</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.5; margin-bottom: 14px;">
          Share this invitation code privately with authorized field caseworkers conducting surveys in <strong>${state}</strong>.
        </p>

        <div style="background-color: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 14px;">
          <span style="font-size: 11px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 4px;">Field Team Invitation Code</span>
          <code style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 22px; font-weight: 800; letter-spacing: 0.12em; color: #064e3b; word-break: break-all; display: block;">
            ${invitationCode}
          </code>
        </div>

        <div style="background-color: ${isPreApproved ? '#f0fdf4' : '#fffbeb'}; border: 1px solid ${isPreApproved ? '#bbf7d0' : '#fde68a'}; border-radius: 10px; padding: 12px; margin-bottom: 16px;">
          <strong style="color: ${isPreApproved ? '#166534' : '#92400e'}; font-size: 12px; display: block; margin-bottom: 3px;">Activation Status:</strong>
          <p style="color: ${isPreApproved ? '#166534' : '#92400e'}; font-size: 12px; line-height: 1.5; margin: 0;">
            ${isPreApproved
              ? 'Pre-approved applicant: This invitation code activates immediately once you verify your email with the personal code above.'
              : 'Your invitation code has been generated. It becomes usable after email verification and programme approval.'}
          </p>
        </div>

        <div style="font-size: 13px; color: #334155; line-height: 1.6; margin-bottom: 16px;">
          <p style="margin: 0 0 4px 0;"><strong>State Scope:</strong> ${state}</p>
          <p style="margin: 0 0 4px 0;"><strong>Validity:</strong> ${invitationExpiryDays} days</p>
          <p style="margin: 0 0 4px 0;"><strong>Maximum Capacity:</strong> Up to ${maxRedemptions} authorized caseworkers</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 14px;">
          <strong style="color: #0f172a; font-size: 13px; display: block; margin-bottom: 8px;">Instructions for authorized caseworkers:</strong>
          <ol style="margin: 0; padding-left: 20px; font-size: 12px; color: #475569; line-height: 1.6;">
            <li>Open the Childcare Support App and tap <strong>Start New Survey</strong>.</li>
            <li>Sign in using their authorized Google account.</li>
            <li>Complete their field caseworker profile.</li>
            <li>Enter this invitation code to activate field survey access for <strong>${state}</strong>.</li>
          </ol>
        </div>

        <p style="color: #047857; font-size: 12px; font-weight: 600; margin: 0;">
          🔒 Share PRIVATELY with authorized field caseworkers only. Do not publish publicly.
        </p>
      </div>
    `
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 20px; font-weight: bold; margin: 0;">India HIV/AIDS Alliance</h1>
            <p style="color: #0d9488; font-size: 13px; font-weight: 600; margin: 4px 0 0 0;">Childcare Support Programme — State Team Access (${state})</p>
          </div>

          <p style="color: #334155; font-size: 15px; margin-bottom: 16px;">Hello <strong>${name}</strong>,</p>

          <div style="margin-bottom: 24px;">
            <span style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">SECTION A</span>
            <h2 style="color: #0f172a; font-size: 17px; font-weight: 700; margin: 0 0 8px 0;">Your personal email verification code</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 14px;">
              Your one-time verification code for state-team staff registration (${state}) is:
            </p>

            <div style="background-color: #f1f5f9; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 14px;">
              <code style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 26px; font-weight: bold; letter-spacing: 0.2em; color: #0f172a; word-break: break-all; display: block;">
                ${code}
              </code>
            </div>

            <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px;">
              <p style="color: #b91c1c; font-size: 12px; font-weight: 600; line-height: 1.5; margin: 0;">
                ⚠️ For your email verification only. Do NOT share this code with field users or caseworkers.
              </p>
            </div>

            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
              This code expires in <strong>${expiryMinutes} minutes</strong>. Verifying your email confirms ownership of your address. State-level administrative authority is granted upon programme approval.
            </p>
          </div>

          ${invitationSectionHtml}

          <p style="color: #94a3b8; font-size: 11px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            If you did not register for State Team access, please disregard this notice.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = invitationCode
    ? `India HIV/AIDS Alliance — Childcare Support Programme
State Team Access (${state})

SECTION A: Your personal email verification code
------------------------------------------------
Your verification code is: ${code}
Expires in: ${expiryMinutes} minutes
IMPORTANT: For your email verification only. Do not share with field users or caseworkers.

SECTION B: Your field-team invitation code
-----------------------------------------
Field Team Invitation Code: ${invitationCode}
State Scope: ${state}
Validity: ${invitationExpiryDays} days
Maximum Capacity: Up to ${maxRedemptions} authorized caseworkers
Activation Status: ${
        isPreApproved
          ? 'Pre-approved applicant (activates immediately upon email verification)'
          : 'Your invitation code has been generated. It becomes usable after email verification and programme approval.'
      }

Instructions for authorized caseworkers:
1. Open Childcare Support App -> tap Start New Survey
2. Sign in with authorized Google account
3. Complete field caseworker profile
4. Enter invitation code (${invitationCode}) to activate access for ${state}

Share privately with authorized field caseworkers only.`.trim()
    : `Your State Team verification code for ${state} is: ${code}

This code expires in ${expiryMinutes} minutes.
For your email verification only. Do not share.`.trim();

  return provider.sendEmail({
    to,
    subject,
    html,
    text,
    otp: code,
  });
}

export async function sendStateTeamInvitationEmail({
  to,
  name,
  state,
  plainCode,
  maxRedemptions,
  expiryDays = 30,
}: {
  to: string;
  name: string;
  state: string;
  plainCode: string;
  maxRedemptions: number;
  expiryDays?: number;
}): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  const subject = `Your Field Team Invitation Code — ${state} Programme`;

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 20px; font-weight: bold; margin: 0;">India HIV/AIDS Alliance</h1>
            <p style="color: #0d9488; font-size: 13px; font-weight: 600; margin: 4px 0 0 0;">Childcare Support Programme — Field Team Invitation (${state})</p>
          </div>

          <p style="color: #334155; font-size: 15px; margin-bottom: 16px;">Dear <strong>${name}</strong>,</p>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            An approved invitation code has been generated for your field team in <strong>${state}</strong>. Share this code privately with authorized caseworkers participating in field assessments.
          </p>

          <div style="background-color: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 11px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Field Team Invitation Code</span>
            <code style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 22px; font-weight: 800; letter-spacing: 0.12em; color: #064e3b; word-break: break-all; display: block;">
              ${plainCode}
            </code>
          </div>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 24px; font-size: 12px; color: #475569; line-height: 1.6;">
            <ul style="margin: 0; padding-left: 18px;">
              <li><strong>Authorized Scope:</strong> Valid only for field users registering under <strong>${state}</strong>.</li>
              <li><strong>Validity:</strong> Expires in <strong>${expiryDays} days</strong>.</li>
              <li><strong>Redemption Capacity:</strong> Up to <strong>${maxRedemptions} field caseworkers</strong>.</li>
              <li><strong>Security Note:</strong> Distribute this code directly to your caseworkers via private channels. Do not publish it publicly.</li>
            </ul>
          </div>

          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
            If you need to rotate or revoke this code at any time, log in to the State Evaluation portal.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
Field Team Invitation Code for ${state}:
Code: ${plainCode}

Valid for ${state} caseworkers.
Expires in ${expiryDays} days (maximum ${maxRedemptions} redemptions).
Distribute privately.
  `.trim();

  return provider.sendEmail({
    to,
    subject,
    html,
    text,
    otp: plainCode,
  });
}


/**
 * Dispatches an internal notification to the designated administrator when a
 * state team applicant completes email verification and requires review.
 * 
 * Strict Privacy & Security Guarantees:
 * - Zero OTP codes included.
 * - Zero invitation codes included.
 * - Zero beneficiary PII included.
 */
export async function sendAdminPendingRegistrationEmail({
  adminEmail,
  applicantName,
  applicantEmail,
  organization,
  requestedState,
  verifiedAtIso,
  reviewUrl,
  registrationId,
}: {
  adminEmail: string;
  applicantName: string;
  applicantEmail: string;
  organization: string;
  requestedState: string;
  verifiedAtIso: string;
  reviewUrl: string;
  registrationId?: string;
}): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  const subject = `[Action Required] New State Coordinator Registration Pending Review — ${requestedState}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 20px; font-weight: bold; margin: 0;">India HIV/AIDS Alliance</h1>
            <p style="color: #0d9488; font-size: 13px; font-weight: 600; margin: 4px 0 0 0;">Childcare Support Programme — Administrator Review Required</p>
          </div>

          <p style="color: #334155; font-size: 15px; margin-bottom: 16px;">Dear Programme Administrator,</p>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            A new state-team coordinator applicant has completed email verification and is pending administrative approval before their field-team invitation can be activated:
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
              <tr>
                <td style="padding: 6px 0; font-weight: 600; width: 140px; color: #64748b;">Applicant Name:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${applicantName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600; color: #64748b;">Work Email:</td>
                <td style="padding: 6px 0;">${applicantEmail}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600; color: #64748b;">Organisation:</td>
                <td style="padding: 6px 0;">${organization}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600; color: #64748b;">Requested State:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #0d9488;">${requestedState}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600; color: #64748b;">Verified Timestamp:</td>
                <td style="padding: 6px 0; color: #64748b;">${verifiedAtIso}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${reviewUrl}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
              Review application
            </a>
          </div>

          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            Security Notice: Review and approval actions require an authenticated Administrator or Leadership session. This email does not grant automatic access.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
[Action Required] New State Coordinator Registration Pending Review:

Applicant Name: ${applicantName}
Work Email: ${applicantEmail}
Organisation: ${organization}
Requested State: ${requestedState}
Verified Timestamp: ${verifiedAtIso}

Review URL: ${reviewUrl}

Security Notice: Approvals require an authenticated Administrator or Leadership session.
  `.trim();

  return provider.sendEmail({
    to: adminEmail,
    subject,
    html,
    text,
    otp: `tx-${Date.now()}`,
    action: 'send_transactional_email',
  });
}

/**
 * Notifies a state-team coordinator when their registration has been approved.
 */
export async function sendCoordinatorApprovalNotificationEmail({
  coordinatorEmail,
  coordinatorName,
  state,
  portalUrl,
}: {
  coordinatorEmail: string;
  coordinatorName: string;
  state: string;
  portalUrl: string;
}): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  const subject = `State Team Coordinator Registration Approved — ${state}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 20px; font-weight: bold; margin: 0;">India HIV/AIDS Alliance</h1>
            <p style="color: #0d9488; font-size: 13px; font-weight: 600; margin: 4px 0 0 0;">Childcare Support Programme — Registration Approved</p>
          </div>

          <p style="color: #334155; font-size: 15px; margin-bottom: 16px;">Dear <strong>${coordinatorName}</strong>,</p>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            Your registration as State Coordinator for <strong>${state}</strong> has been approved by the Programme Administrator.
          </p>

          <div style="background-color: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 12px; padding: 18px; margin-bottom: 24px; font-size: 13px; color: #064e3b; line-height: 1.6;">
            <strong>Your Field Team Invitation Code is Now Active:</strong><br/>
            The field-team invitation code provided in your original registration email is now fully active and authorized for caseworker onboarding in ${state}.
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${portalUrl}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
              Sign In to State Evaluation Portal
            </a>
          </div>

          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
            To log in, simply enter your registered email at the portal to receive a 6-digit sign-in code.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
State Team Coordinator Registration Approved:

Dear ${coordinatorName},

Your registration for ${state} has been approved. Your field-team invitation code is now active.

You may sign in to the State Evaluation portal:
${portalUrl}
  `.trim();

  return provider.sendEmail({
    to: coordinatorEmail,
    subject,
    html,
    text,
    otp: `tx-${Date.now()}`,
    action: 'send_transactional_email',
  });
}
