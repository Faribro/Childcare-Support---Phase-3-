/**
 * Domain types for State Team Registration, Team Invitations, and Field User Onboarding
 */

export type StateTeamRegistrationStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

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
  firstName: string;
  lastName: string;     // Supports single-name handling
  assignedState: string; // Strict server-derived state from invitation
  assignedDistrict: string;
  invitationId: string; // Associated invitation reference
  status: FieldUserStatus;
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
