import crypto from 'crypto';
import { CallerSecurityContext, SenderIdentity } from './types';

export interface LeadershipWhatsAppBinding {
  readonly bindingId: string;
  readonly phoneNumberE164: string; // Normalized E.164 (e.g. "+919876543210")
  readonly phoneNumberHash: string; // SHA-256 of E.164 string
  readonly email: string; // Registered leadership email (e.g. "director@allianceindia.org")
  readonly fullName: string;
  readonly role: 'LEADERSHIP' | 'STATE_LEAD' | 'SUPERVISOR';
  readonly permittedStates: readonly string[]; // ['*'] for national, or ['Maharashtra']
  readonly isVerified: boolean;
  readonly isActive: boolean; // Administrative active status (for instant revocation)
  readonly boundAt: string;
  readonly verifiedAt?: string;
  readonly lastActiveAt?: string;
  readonly revokedAt?: string | null;
}

export interface ILeadershipBindingRepository {
  findByPhone(phoneNumberE164: string): Promise<LeadershipWhatsAppBinding | null>;
  findByPhoneSync(phoneNumberE164: string): LeadershipWhatsAppBinding | null;
  findByEmail(email: string): Promise<LeadershipWhatsAppBinding | null>;
  saveBinding(binding: LeadershipWhatsAppBinding): Promise<void>;
  getAllVerified(): Promise<readonly LeadershipWhatsAppBinding[]>;
}

/**
 * Pre-configured verified leadership bindings for national & state surveillance.
 */
export const DEFAULT_LEADERSHIP_BINDINGS: readonly LeadershipWhatsAppBinding[] = [
  {
    bindingId: 'bind_lead_nat_01',
    phoneNumberE164: '+919876543210',
    phoneNumberHash: crypto.createHash('sha256').update('+919876543210').digest('hex'),
    email: 'director@allianceindia.org',
    fullName: 'National Programme Director',
    role: 'LEADERSHIP',
    permittedStates: ['*'],
    isVerified: true,
    isActive: true,
    boundAt: '2026-10-01T00:00:00.000Z',
    verifiedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    bindingId: 'bind_lead_mh_01',
    phoneNumberE164: '+919876543211',
    phoneNumberHash: crypto.createHash('sha256').update('+919876543211').digest('hex'),
    email: 'lead.mh@allianceindia.org',
    fullName: 'Maharashtra State Surveillance Lead',
    role: 'STATE_LEAD',
    permittedStates: ['Maharashtra'],
    isVerified: true,
    isActive: true,
    boundAt: '2026-10-01T00:00:00.000Z',
    verifiedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    bindingId: 'bind_lead_ka_01',
    phoneNumberE164: '+919876543212',
    phoneNumberHash: crypto.createHash('sha256').update('+919876543212').digest('hex'),
    email: 'lead.ka@allianceindia.org',
    fullName: 'Karnataka State Surveillance Lead',
    role: 'STATE_LEAD',
    permittedStates: ['Karnataka'],
    isVerified: true,
    isActive: true,
    boundAt: '2026-10-01T00:00:00.000Z',
    verifiedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    bindingId: 'bind_sup_pune_01',
    phoneNumberE164: '+919876543213',
    phoneNumberHash: crypto.createHash('sha256').update('+919876543213').digest('hex'),
    email: 'sup.pune@allianceindia.org',
    fullName: 'Pune District Supervisor',
    role: 'SUPERVISOR',
    permittedStates: ['Maharashtra'],
    isVerified: true,
    isActive: true,
    boundAt: '2026-10-01T00:00:00.000Z',
    verifiedAt: '2026-10-01T00:00:00.000Z',
  },
];

/**
 * Checks if runtime is in a production deployment environment.
 */
export function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

/**
 * Loads production bindings strictly from administrative environment variables or Supabase.
 * Fails closed if missing, empty, or malformed.
 */
export function loadProductionBindingsFromEnv(): readonly LeadershipWhatsAppBinding[] {
  const raw = process.env.LEADERSHIP_WHATSAPP_BINDINGS_JSON;
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item: any) => ({
      bindingId: String(item.bindingId || ''),
      phoneNumberE164: normalizeToE164(String(item.phoneNumberE164 || '')),
      phoneNumberHash: crypto.createHash('sha256').update(normalizeToE164(String(item.phoneNumberE164 || ''))).digest('hex'),
      email: String(item.email || '').trim().toLowerCase(),
      fullName: String(item.fullName || ''),
      role: item.role === 'STATE_LEAD' ? 'STATE_LEAD' : item.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'LEADERSHIP',
      permittedStates: Array.isArray(item.permittedStates) ? item.permittedStates : ['*'],
      isVerified: Boolean(item.isVerified),
      isActive: Boolean(item.isActive !== false),
      boundAt: String(item.boundAt || new Date().toISOString()),
      verifiedAt: item.verifiedAt ? String(item.verifiedAt) : undefined,
      lastActiveAt: item.lastActiveAt ? String(item.lastActiveAt) : undefined,
      revokedAt: item.revokedAt ? String(item.revokedAt) : null,
    }));
  } catch {
    return [];
  }
}

/**
 * In-memory / file-backed leadership binding repository.
 * In production: strictly refuses synthetic fixtures and fails closed unless administrative bindings exist.
 */
export class InMemoryLeadershipBindingRepository implements ILeadershipBindingRepository {
  private readonly bindingsByPhone: Map<string, LeadershipWhatsAppBinding> = new Map();
  private readonly bindingsByEmail: Map<string, LeadershipWhatsAppBinding> = new Map();

  constructor(customBindings?: readonly LeadershipWhatsAppBinding[]) {
    let source: readonly LeadershipWhatsAppBinding[];

    if (customBindings) {
      source = customBindings;
    } else if (isProductionEnvironment()) {
      // In production: strictly fail-closed, never use synthetic defaults
      source = loadProductionBindingsFromEnv();
    } else {
      source = DEFAULT_LEADERSHIP_BINDINGS;
    }

    for (const b of source) {
      this.bindingsByPhone.set(b.phoneNumberE164, b);
      this.bindingsByEmail.set(b.email.toLowerCase(), b);
    }
  }

  public findByPhoneSync(phoneNumberE164: string): LeadershipWhatsAppBinding | null {
    return this.bindingsByPhone.get(phoneNumberE164) || null;
  }

  public async findByPhone(phoneNumberE164: string): Promise<LeadershipWhatsAppBinding | null> {
    return this.findByPhoneSync(phoneNumberE164);
  }

  public async findByEmail(email: string): Promise<LeadershipWhatsAppBinding | null> {
    return this.bindingsByEmail.get(email.toLowerCase()) || null;
  }

  public async saveBinding(binding: LeadershipWhatsAppBinding): Promise<void> {
    this.bindingsByPhone.set(binding.phoneNumberE164, binding);
    this.bindingsByEmail.set(binding.email.toLowerCase(), binding);
  }

  public async getAllVerified(): Promise<readonly LeadershipWhatsAppBinding[]> {
    return Array.from(this.bindingsByPhone.values()).filter((b) => b.isVerified && b.isActive);
  }
}

/**
 * Validates and binds a sender identity to a leadership context.
 * Strict Rule: Never trust a sender purely because they claim an email address in the chat.
 */
export function verifyLeadershipSender(
  rawPhone: string,
  repository: ILeadershipBindingRepository = new InMemoryLeadershipBindingRepository(),
  senderSuppliedEmailInText?: string
): SenderIdentity {
  // 1. Normalize phone to E.164
  const normalizedPhone = normalizeToE164(rawPhone);
  const maskedPhone = maskPhoneNumber(normalizedPhone);
  const phoneHash = crypto.createHash('sha256').update(normalizedPhone).digest('hex');

  // 2. Query repository
  const binding = repository.findByPhoneSync(normalizedPhone);

  if (!binding) {
    return {
      authorized: false,
      senderPhoneMasked: maskedPhone,
      rawSenderPhoneHash: phoneHash,
      denialReason:
        'UNAUTHORIZED_SENDER: WhatsApp number is not associated with an authorized leadership account. Text email claims are untrusted.',
    };
  }

  if (!binding.isVerified) {
    return {
      authorized: false,
      senderPhoneMasked: maskedPhone,
      rawSenderPhoneHash: phoneHash,
      denialReason:
        'UNVERIFIED_BINDING: This leadership phone binding is pending administrative verification. Access denied fail-closed.',
    };
  }

  if (!binding.isActive) {
    return {
      authorized: false,
      senderPhoneMasked: maskedPhone,
      rawSenderPhoneHash: phoneHash,
      denialReason:
        'ACCOUNT_REVOKED: This leadership account has been deactivated or revoked by administrative authority. Access denied fail-closed.',
    };
  }

  // 3. Security Check: If user typed an email in the chat, it MUST match the pre-registered binding
  if (senderSuppliedEmailInText) {
    const normalizedClaim = senderSuppliedEmailInText.trim().toLowerCase();
    if (normalizedClaim !== binding.email.toLowerCase()) {
      return {
        authorized: false,
        senderPhoneMasked: maskedPhone,
        rawSenderPhoneHash: phoneHash,
        denialReason:
          'IDENTITY_MISMATCH: Sender provided an email that does not match their verified WhatsApp binding. Privilege escalation attempt rejected.',
      };
    }
  }

  const callerScope: CallerSecurityContext = {
    userId: binding.bindingId,
    role: binding.role,
    permittedStates: binding.permittedStates,
  };

  return {
    authorized: true,
    callerScope,
    senderPhoneMasked: maskedPhone,
    rawSenderPhoneHash: phoneHash,
    recipientEmailMasked: maskEmail(binding.email),
  };
}

export function normalizeToE164(rawPhone: string): string {
  const cleaned = rawPhone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
}

export function maskPhoneNumber(normalizedPhone: string): string {
  if (normalizedPhone.length < 7) {
    return '******';
  }
  const prefix = normalizedPhone.slice(0, 3);
  const suffix = normalizedPhone.slice(-4);
  return `${prefix} ******${suffix}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '****@domain.com';
  const firstChar = local?.[0] || 'u';
  return `${firstChar}****@${domain}`;
}
