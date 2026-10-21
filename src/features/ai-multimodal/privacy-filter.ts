import crypto from 'crypto';

/**
 * Privacy Gate & PII Sanitizer for AI Multimodal Inference
 *
 * Enforces:
 * 1. Pre-inference PII scrubbing: Strips or masks 12-digit Aadhaar patterns,
 *    9-18 digit bank account numbers, unmasked phone numbers, and emails.
 * 2. SHA-256 phone hashing & masking (+91 ******3210) for all audit logs.
 * 3. Provider Data Retention Enforcement:
 *    - OpenRouter: `data_collection: 'deny'` parameter to prevent model training & retention.
 *    - NVIDIA NIM: Cloud APIs bound by zero-training customer privacy terms.
 * 4. Strictly blocks fallback to unapproved providers if privacy constraints are violated.
 */

export class PrivacyFilter {
  // Regex patterns for sensitive identifiers
  private static readonly AADHAAR_SPACED_REGEX = /\b[2-9]\d{3}\s\d{4}\s\d{4}\b/g;
  private static readonly AADHAAR_CONTEXT_REGEX = /(?:aadhaar|uidai)[^\d]{0,10}\b([2-9]\d{11})\b/gi;
  private static readonly BANK_ACCOUNT_CONTEXT_REGEX = /(?:account|a\/c|passbook|khata)[^\d]{0,10}\b(\d{9,18})\b/gi;
  private static readonly GENERIC_LONG_NUMBER_REGEX = /\b\d{9,18}\b/g;
  private static readonly PHONE_REGEX = /(\+?91[\-\s]?)?[6-9]\d{9}\b/g;
  private static readonly EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  /**
   * Scrubs raw text before sending to any external AI provider.
   * Replaces identifiable numbers with structural tokens.
   */
  public static scrubTextForInference(rawText: string): string {
    if (!rawText) return '';

    let scrubbed = rawText;

    // 1. Spaced Aadhaar numbers: e.g. 5482 1928 3841
    scrubbed = scrubbed.replace(this.AADHAAR_SPACED_REGEX, (match) => {
      const clean = match.replace(/\s+/g, '');
      return `[AADHAAR_MASKED_XXXX_XXXX_${clean.slice(-4)}]`;
    });

    // 2. Aadhaar with preceding keyword: e.g. "Aadhaar 548219283841"
    scrubbed = scrubbed.replace(this.AADHAAR_CONTEXT_REGEX, (match, digits) => {
      return match.replace(digits, `[AADHAAR_MASKED_XXXX_XXXX_${digits.slice(-4)}]`);
    });

    // 3. Bank Account numbers with preceding context: e.g. "account number 918273645123"
    scrubbed = scrubbed.replace(this.BANK_ACCOUNT_CONTEXT_REGEX, (match, digits) => {
      return match.replace(digits, `[BANK_ACCOUNT_MASKED_${digits.slice(-4)}]`);
    });

    // 4. Any remaining standalone 9 to 18 digit numbers (treated as bank accounts / IDs)
    scrubbed = scrubbed.replace(this.GENERIC_LONG_NUMBER_REGEX, (match) => {
      if (match.startsWith('[') || match.endsWith(']')) return match;
      return `[BANK_ACCOUNT_MASKED_${match.slice(-4)}]`;
    });

    // 5. Mask phone numbers
    scrubbed = scrubbed.replace(this.PHONE_REGEX, (match) => {
      if (match.includes('MASKED')) return match;
      const digits = match.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `[PHONE_MASKED_******${last4}]`;
    });

    // 6. Redact emails
    scrubbed = scrubbed.replace(this.EMAIL_REGEX, '[EMAIL_REDACTED]');

    return scrubbed;
  }

  /**
   * Generates display-masked phone number: +91 ******3210
   */
  public static maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return '+91 **********';
    const last4 = digits.slice(-4);
    return `+91 ******${last4}`;
  }

  /**
   * Deterministic SHA-256 hash for audit logs (zero raw phone in storage)
   */
  public static hashPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return crypto.createHash('sha256').update(digits).digest('hex');
  }

  /**
   * OpenRouter Privacy Payload Decorator:
   * Sets `data_collection: 'deny'` to guarantee zero data retention and prevent training on user prompts.
   */
  public static decorateOpenRouterPayload<T extends Record<string, any>>(payload: T): T & { data_collection: 'deny' } {
    return {
      ...payload,
      data_collection: 'deny',
    };
  }

  /**
   * Verifies that the requested provider adheres to the project's zero-retention privacy policy.
   * Fails closed if an unapproved provider is requested.
   */
  public static validateProviderCompliance(provider: string): { isApproved: boolean; policy: string } {
    const normalized = provider.toUpperCase();

    if (normalized === 'NVIDIA' || normalized === 'NVIDIA_NIM') {
      return {
        isApproved: true,
        policy: 'NVIDIA Cloud Functions API: Customer data is processed in-memory and not stored or used for model training.',
      };
    }

    if (normalized === 'OPENROUTER') {
      return {
        isApproved: true,
        policy: 'OpenRouter Data Privacy: Enforced with data_collection=deny to prohibit prompt logging and model training.',
      };
    }

    if (normalized === 'DETERMINISTIC_FALLBACK') {
      return {
        isApproved: true,
        policy: 'Local In-Process Deterministic Rules: Zero network egress, 100% privacy-compliant.',
      };
    }

    return {
      isApproved: false,
      policy: `UNAPPROVED_PROVIDER: Provider '${provider}' has not undergone security review. Egress blocked.`,
    };
  }
}
