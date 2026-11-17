import { parsePhoneNumberFromString, PhoneNumber } from 'libphonenumber-js';
import crypto from 'crypto';

export interface PhoneValidationResult {
  valid: boolean;
  isValid: boolean;
  canonical?: string;
  canonicalE164?: string;
  masked?: string;
  nationalNumber?: string;
  error?: string;
  reason?: string;
}

const TICKET_SECRET = process.env.SESSION_SECRET || 'dev-mobile-otp-ticket-secret-32-chars-long';

/**
 * Validates and canonically formats an Indian mobile phone number using libphonenumber-js.
 * Enforces:
 * - Proper E.164 representation (+91XXXXXXXXXX)
 * - Country allocation strictly 'IN'
 * - Cellular starting digit (6, 7, 8, or 9)
 * - Exactly 10 national digits
 */
export function validateAndFormatIndianMobile(rawPhone: string): PhoneValidationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { valid: false, isValid: false, error: 'Mobile number is required.', reason: 'Mobile number is required.' };
  }

  const trimmed = rawPhone.trim();
  if (trimmed.length < 10) {
    return { valid: false, isValid: false, error: 'Mobile number must be at least 10 digits.', reason: 'Mobile number must be at least 10 digits.' };
  }

  try {
    const phoneNumber: PhoneNumber | undefined = parsePhoneNumberFromString(trimmed, 'IN');

    if (!phoneNumber || !phoneNumber.isValid()) {
      return {
        valid: false,
        isValid: false,
        error: 'Please enter a valid 10-digit Indian mobile number.',
        reason: 'Please enter a valid 10-digit Indian mobile number.',
      };
    }

    if (phoneNumber.country !== 'IN') {
      return {
        valid: false,
        isValid: false,
        error: 'Only Indian mobile numbers (+91) are supported.',
        reason: 'Only Indian mobile numbers (+91) are supported.',
      };
    }

    const national = phoneNumber.nationalNumber;
    // Indian mobile numbers must start with 6, 7, 8, or 9 and be exactly 10 digits
    if (!/^[6-9]\d{9}$/.test(national)) {
      return {
        valid: false,
        isValid: false,
        error: 'Indian mobile numbers must be 10 digits starting with 6, 7, 8, or 9.',
        reason: 'Indian mobile numbers must be 10 digits starting with 6, 7, 8, or 9.',
      };
    }

    const canonicalE164 = phoneNumber.format('E.164');
    const last4 = national.slice(-4);
    const masked = `+91 ******${last4}`;

    return {
      valid: true,
      isValid: true,
      canonical: canonicalE164,
      canonicalE164,
      masked,
      nationalNumber: national,
    };
  } catch (err: any) {
    const msg = 'Failed to parse mobile number: ' + (err?.message || 'Invalid format');
    return {
      valid: false,
      isValid: false,
      error: msg,
      reason: msg,
    };
  }
}

/**
 * Creates a cryptographically signed mobile ticket after successful OTP verification.
 * Valid for 15 minutes.
 */
export function createMobileTicket(canonicalMobile: string, ttlMs: number = 15 * 60 * 1000): string {
  const expiresAt = Date.now() + ttlMs;
  const ticketPayload = `${canonicalMobile}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', TICKET_SECRET).update(ticketPayload).digest('hex');
  return Buffer.from(`${ticketPayload}:${signature}`).toString('base64url');
}

/**
 * Verifies a signed mobile ticket and extracts the verified canonical mobile number.
 */
export function verifyMobileTicket(ticket: string | undefined): { valid: boolean; mobile?: string; error?: string } {
  if (!ticket || typeof ticket !== 'string') {
    return { valid: false, error: 'Mobile ticket is missing.' };
  }
  try {
    const decoded = Buffer.from(ticket, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) {
      return { valid: false, error: 'Malformed mobile ticket structure.' };
    }
    const [mobile, expiresAtStr, sig] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, error: 'Mobile verification ticket has expired.' };
    }
    const expectedSig = crypto.createHmac('sha256', TICKET_SECRET).update(`${mobile}:${expiresAtStr}`).digest('hex');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, error: 'Invalid mobile ticket signature.' };
    }
    return { valid: true, mobile };
  } catch {
    return { valid: false, error: 'Failed to decode mobile ticket.' };
  }
}
