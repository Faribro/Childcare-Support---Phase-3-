import crypto from 'crypto';
import { CallerSecurityContext, SenderIdentity } from './types';
import {
  ILeadershipBindingRepository,
  InMemoryLeadershipBindingRepository,
  verifyLeadershipSender,
} from './leadership-whatsapp-binding';

export interface AuthorizedStaffEntry {
  readonly phoneNumber: string; // E.164 format e.g. "+919876543210"
  readonly userId: string;
  readonly name: string;
  readonly role: 'LEADERSHIP' | 'STATE_LEAD' | 'SUPERVISOR';
  readonly permittedStates: readonly string[];
  readonly email: string;
}

/**
 * Pre-configured test allowlist directory for leadership and surveillance evaluation.
 * In production, this can be sourced from verified database or vault secrets.
 */
export const DEFAULT_AUTHORIZED_STAFF_DIRECTORY: readonly AuthorizedStaffEntry[] = [
  {
    phoneNumber: '+919876543210',
    userId: 'usr_lead_national_01',
    name: 'National Programme Director',
    role: 'LEADERSHIP',
    permittedStates: ['*'],
    email: 'director@allianceindia.org',
  },
  {
    phoneNumber: '+919876543211',
    userId: 'usr_lead_mh_01',
    name: 'Maharashtra State Surveillance Lead',
    role: 'STATE_LEAD',
    permittedStates: ['Maharashtra'],
    email: 'lead.mh@allianceindia.org',
  },
  {
    phoneNumber: '+919876543212',
    userId: 'usr_lead_ka_01',
    name: 'Karnataka State Surveillance Lead',
    role: 'STATE_LEAD',
    permittedStates: ['Karnataka'],
    email: 'lead.ka@allianceindia.org',
  },
  {
    phoneNumber: '+919876543213',
    userId: 'usr_sup_pune_01',
    name: 'Pune District Supervisor',
    role: 'SUPERVISOR',
    permittedStates: ['Maharashtra'],
    email: 'sup.pune@allianceindia.org',
  },
];

export class SenderIdentityResolver {
  private readonly repository?: ILeadershipBindingRepository;
  private readonly directory: Map<string, AuthorizedStaffEntry>;

  constructor(
    customDirectoryOrRepo?: readonly AuthorizedStaffEntry[] | ILeadershipBindingRepository
  ) {
    this.directory = new Map();
    if (customDirectoryOrRepo && 'findByPhoneSync' in customDirectoryOrRepo) {
      this.repository = customDirectoryOrRepo;
    } else {
      const dir = (customDirectoryOrRepo as readonly AuthorizedStaffEntry[]) || DEFAULT_AUTHORIZED_STAFF_DIRECTORY;
      for (const entry of dir) {
        const normalized = this.normalizePhoneNumber(entry.phoneNumber);
        this.directory.set(normalized, entry);
      }
    }
  }

  /**
   * Normalizes phone number into standard E.164 (+<country><digits>)
   */
  public normalizePhoneNumber(rawPhone: string): string {
    const cleaned = rawPhone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    // Assume India +91 if 10-digit number
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    return `+${cleaned}`;
  }

  /**
   * Masks phone number preserving country prefix and last 4 digits: +91 ******3210
   */
  public maskPhoneNumber(normalizedPhone: string): string {
    if (normalizedPhone.length < 7) {
      return '******';
    }
    const prefix = normalizedPhone.slice(0, 3);
    const suffix = normalizedPhone.slice(-4);
    return `${prefix} ******${suffix}`;
  }

  /**
   * Masks email address: d****@allianceindia.org
   */
  public maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '****@domain.com';
    const firstChar = local?.[0] || 'u';
    return `${firstChar}****@${domain}`;
  }

  /**
   * Generates a deterministic SHA-256 hash of the phone number for audit logs.
   * Eliminates raw phone numbers from audit storage.
   */
  public hashPhoneNumber(normalizedPhone: string): string {
    return crypto.createHash('sha256').update(normalizedPhone).digest('hex');
  }

  /**
   * Resolves incoming sender phone number to a trusted CallerSecurityContext.
   * Fails closed: unlisted numbers receive authorized: false.
   * Rejects spoofing attempts where an unverified sender supplies an arbitrary leadership email.
   */
  public resolveSender(rawPhone: string, senderSuppliedEmailInText?: string): SenderIdentity {
    if (this.repository) {
      return verifyLeadershipSender(rawPhone, this.repository, senderSuppliedEmailInText);
    }

    const normalized = this.normalizePhoneNumber(rawPhone);
    const masked = this.maskPhoneNumber(normalized);
    const hash = this.hashPhoneNumber(normalized);

    const match = this.directory.get(normalized);
    if (!match) {
      return {
        authorized: false,
        senderPhoneMasked: masked,
        rawSenderPhoneHash: hash,
        denialReason:
          'UNAUTHORIZED_SENDER: This phone number is not registered for Leadership Surveillance access. Claims of leadership identity in message text are strictly untrusted.',
      };
    }

    // Security Guardrail: If sender typed an email in message text, it MUST match the pre-registered binding
    if (senderSuppliedEmailInText && senderSuppliedEmailInText.trim().length > 0) {
      const claimed = senderSuppliedEmailInText.trim().toLowerCase();
      if (claimed !== match.email.toLowerCase()) {
        return {
          authorized: false,
          senderPhoneMasked: masked,
          rawSenderPhoneHash: hash,
          denialReason:
            'IDENTITY_MISMATCH: Sender provided an email that does not match the verified phone binding. Privilege escalation attempt rejected.',
        };
      }
    }

    const callerScope: CallerSecurityContext = {
      userId: match.userId,
      role: match.role,
      permittedStates: match.permittedStates,
    };

    return {
      authorized: true,
      callerScope,
      senderPhoneMasked: masked,
      rawSenderPhoneHash: hash,
      recipientEmailMasked: this.maskEmail(match.email),
    };
  }
}
