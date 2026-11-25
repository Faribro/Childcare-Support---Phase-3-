/**
 * Domain types for State Team Registration, Team Invitations, and Field User Onboarding
 */

export type StateTeamRegistrationStatus = 'PENDING_APPROVAL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'REVOKED';

export interface StateTeamRegistration {
  id: string;
  firstName: string;
  lastName: string; // Supports empty/single-name handling
  workEmail: string;
  requestedState: string;
  organization: string;
  status: StateTeamRegistrationStatus;
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
  approvedBy?: string | null;
  approvedAt?: number | null;
  assignedState?: string | null;
  revokedBy?: string | null;
  revokedAt?: number | null;
  revocationReason?: string | null;
  authVersion?: number;
  invitationId?: string | null;
  notes?: string;
}

export type InvitationStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ROTATED';

export interface StateTeamInvitation {
  id: string;
  stateTeamId: string;
  state: string;
  codeVerifier: string; // SHA-256 verifier hex (NEVER store plaintext)
  codeSalt: string;     // Cryptographic salt
  status: InvitationStatus;
  maxRedemptions: number; // Multi-user redemption limit (default 50)
  redemptionCount: number; // Atomic redemption counter
  expiresAt: number;    // Absolute expiration timestamp (default 30 days)
  createdAt: number;
  rotatedAt?: number | null;
  revokedAt?: number | null;
}

export type FieldUserStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface FieldUserProfile {
  id: string;
  googleSub: string;    // Stable Google account identifier
  googleEmail: string;  // Verified Google email
  mobileNumber?: string; // Canonical E.164 verified mobile (+91XXXXXXXXXX)
  isMobileVerified?: boolean;
  firstName: string;
  lastName: string;     // Supports single-name handling
  assignedState: string; // Strict server-derived state from invitation
  assignedDistrict: string;
  invitationId: string; // Associated invitation reference
  status: FieldUserStatus;
  srName?: string;      // State Sub-Recipient (SR) Name collected at onboarding
  ssrName?: string;     // Sub-Sub-Recipient (SSR) Name collected at onboarding
  createdAt: number;
  updatedAt: number;
}

export interface InvitationRedemptionResult {
  success: boolean;
  error?: string;
  statusCode: number;
  invitation?: StateTeamInvitation;
  fieldProfile?: FieldUserProfile;
}


export type StateTeamAccessInvitationStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';

export interface StateTeamAccessInvitation {
  id: string;
  invitedEmail: string;
  assignedState: string;
  codeSalt: string;
  codeVerifier: string;
  status: StateTeamAccessInvitationStatus;
  issuedBy: string;
  issuedAt: number;
  expiresAt: number;
  redeemedAt?: number | null;
  redeemedByRegistrationId?: string | null;
  revokedBy?: string | null;
  revokedAt?: number | null;
  note?: string;
}

export class DuplicateRegistrationError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string = 'A registration or account for this email already exists.') {
    super(message);
    this.name = 'DuplicateRegistrationError';
    this.statusCode = 409;
    this.code = 'EMAIL_ALREADY_REGISTERED';
  }
}
