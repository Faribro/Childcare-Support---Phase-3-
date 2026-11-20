/**
 * Persistent Storage Layer for State Teams, Invitations, and Field Users
 *
 * Implements:
 * - OnboardingStore interface
 * - MemoryOnboardingStore for unit tests and local isolation
 * - SupabaseOnboardingStore for PostgreSQL persistence
 * - Atomic invitation redemption counters
 * - Rate-limiting primitives
 */

import crypto from 'crypto';
import type {
  StateTeamRegistration,
  StateTeamInvitation,
  FieldUserProfile,
  StateTeamRegistrationStatus,
} from '@/lib/types/onboarding';
import {
  verifyInvitationCode,
  DEFAULT_INVITATION_EXPIRY_MS,
  DEFAULT_MAX_REDEMPTIONS,
} from './invitationCrypto';
import { validateFirestoreDatabaseEnvironment } from './firestoreSubmissionAdapter';
import { getFirestoreDb, sanitizeIpForDocId } from './credentialRegistry';
import { canonicalizeStateName, getStateQueryVariants } from '@/lib/constants/stateNormalization';

export const STATE_TEAM_REGISTRATIONS_COLLECTION = 'state_team_registrations';
export const STATE_TEAM_INVITATIONS_COLLECTION = 'state_team_invitations';
export const STATE_TEAM_CHALLENGES_COLLECTION = 'state_team_challenges';
export const FIELD_USER_PROFILES_COLLECTION = 'field_user_profiles';

export interface RateLimitStatus {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface OnboardingStore {
  // Rate Limiting
  checkRateLimit(key: string, now: number, maxAttempts: number, windowMs: number): Promise<RateLimitStatus>;

  // Durable OTP Challenges
  saveStateTeamChallenge(challenge: any): Promise<void>;
  getStateTeamChallenge(workEmail: string): Promise<any | null>;
  recordStateTeamChallengeAttempt(workEmail: string, failedAttempts: number, isLocked: boolean): Promise<void>;
  deleteStateTeamChallenge(workEmail: string): Promise<void>;

  // State Team Registrations
  createStateTeamRegistration(data: {
    firstName: string;
    lastName: string;
    workEmail: string;
    requestedState: string;
    organization: string;
    autoApprove?: boolean;
    notes?: string;
  }): Promise<StateTeamRegistration>;
  getStateTeamRegistrationById(id: string): Promise<StateTeamRegistration | null>;
  getStateTeamRegistrationByEmail(email: string): Promise<StateTeamRegistration | null>;
  verifyStateTeamEmail(email: string): Promise<boolean>;
  approveStateTeamRegistration(id: string, approvedBy: string): Promise<boolean>;
  rejectStateTeamRegistration(id: string, rejectedBy: string, reason?: string): Promise<boolean>;
  updateRegistrationNotes(id: string, notes: string): Promise<boolean>;
  listStateTeamRegistrations(): Promise<StateTeamRegistration[]>;

  // State Team Invitations
  createInvitation(params: {
    stateTeamId: string;
    state: string;
    salt: string;
    verifier: string;
    maxRedemptions?: number;
    expiresAt?: number;
  }): Promise<StateTeamInvitation>;
  getInvitationById(id: string): Promise<StateTeamInvitation | null>;
  getActiveInvitationForState(state: string): Promise<StateTeamInvitation | null>;
  getActiveInvitationForCoordinator(stateTeamId: string): Promise<StateTeamInvitation | null>;
  listInvitationsForState(state: string): Promise<StateTeamInvitation[]>;
  rotateInvitation(currentInvitationId: string, newSalt: string, newVerifier: string): Promise<StateTeamInvitation>;
  revokeInvitation(invitationId: string): Promise<boolean>;
  findAndValidateInvitation(
    plainCode: string,
    state: string,
    now?: number
  ): Promise<{
    valid: boolean;
    error?: string;
    statusCode: number;
    invitation?: StateTeamInvitation;
  }>;
  atomicRedeemInvitation(invitationId: string): Promise<{ success: boolean; error?: string }>;
  redeemInvitation(invitationId: string, plainCode: string): Promise<{
    success: boolean;
    error?: string;
    statusCode: number;
    invitation?: StateTeamInvitation;
  }>;

  // Field User Profiles
  createFieldUserProfile(data: {
    googleSub: string;
    googleEmail: string;
    mobileNumber?: string;
    isMobileVerified?: boolean;
    firstName: string;
    lastName: string;
    assignedState: string;
    assignedDistrict: string;
    invitationId: string;
    srName?: string;
    ssrName?: string;
  }): Promise<FieldUserProfile>;
  getFieldUserProfileByGoogleSub(googleSub: string): Promise<FieldUserProfile | null>;
  getFieldUserProfileByEmail(googleEmail: string): Promise<FieldUserProfile | null>;
  getFieldUserProfileByMobile(canonicalMobile: string): Promise<FieldUserProfile | null>;
  getFieldUserProfileById(id: string): Promise<FieldUserProfile | null>;
  listFieldUserProfiles(state?: string): Promise<FieldUserProfile[]>;
  updateFieldUserProfile(
    id: string,
    updates: Partial<Omit<FieldUserProfile, 'id' | 'googleSub' | 'createdAt'>>
  ): Promise<FieldUserProfile | null>;
}

// -------------------------------------------------------------
// In-Memory Implementation
// -------------------------------------------------------------

export class MemoryOnboardingStore implements OnboardingStore {
  private registrations: Map<string, StateTeamRegistration> = new Map();
  private invitations: Map<string, StateTeamInvitation> = new Map();
  private fieldProfiles: Map<string, FieldUserProfile> = new Map();
  private rateLimitEvents: Map<string, number[]> = new Map();

  private stateTeamChallenges = new Map<string, any>();

  async saveStateTeamChallenge(challenge: any): Promise<void> {
    this.stateTeamChallenges.set(challenge.workEmail.toLowerCase().trim(), { ...challenge });
  }

  async getStateTeamChallenge(workEmail: string): Promise<any | null> {
    const c = this.stateTeamChallenges.get(workEmail.toLowerCase().trim());
    return c ? { ...c } : null;
  }

  async recordStateTeamChallengeAttempt(workEmail: string, failedAttempts: number, isLocked: boolean): Promise<void> {
    const c = this.stateTeamChallenges.get(workEmail.toLowerCase().trim());
    if (c) {
      c.failedAttempts = failedAttempts;
      c.isLocked = isLocked;
    }
  }

  async deleteStateTeamChallenge(workEmail: string): Promise<void> {
    this.stateTeamChallenges.delete(workEmail.toLowerCase().trim());
  }

  async checkRateLimit(key: string, now: number, maxAttempts: number, windowMs: number): Promise<RateLimitStatus> {
    const timestamps = (this.rateLimitEvents.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxAttempts) {
      const oldest = timestamps[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return { allowed: false, retryAfterSeconds: retryAfter };
    }
    timestamps.push(now);
    this.rateLimitEvents.set(key, timestamps);
    return { allowed: true };
  }

  async createStateTeamRegistration(data: {
    firstName: string;
    lastName: string;
    workEmail: string;
    requestedState: string;
    organization: string;
    autoApprove?: boolean;
    notes?: string;
  }): Promise<StateTeamRegistration> {
    const normEmail = data.workEmail.trim().toLowerCase();
    const existing = await this.getStateTeamRegistrationByEmail(normEmail);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const reg: StateTeamRegistration = {
      id: crypto.randomUUID(),
      firstName: data.firstName.trim(),
      lastName: (data.lastName || '').trim(),
      workEmail: normEmail,
      requestedState: data.requestedState.trim(),
      organization: data.organization.trim(),
      status: data.autoApprove ? 'APPROVED' : 'PENDING_APPROVAL',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
      approvedBy: data.autoApprove ? 'SYSTEM_ALLOWLIST' : null,
      approvedAt: data.autoApprove ? now : null,
      notes: data.notes,
    };
    this.registrations.set(reg.id, reg);
    return reg;
  }

  async getStateTeamRegistrationById(id: string): Promise<StateTeamRegistration | null> {
    return this.registrations.get(id) || null;
  }

  async getStateTeamRegistrationByEmail(email: string): Promise<StateTeamRegistration | null> {
    const norm = email.trim().toLowerCase();
    for (const reg of this.registrations.values()) {
      if (reg.workEmail === norm) {
        return reg;
      }
    }
    return null;
  }

  async verifyStateTeamEmail(email: string): Promise<boolean> {
    const reg = await this.getStateTeamRegistrationByEmail(email);
    if (!reg) return false;
    reg.emailVerified = true;
    reg.updatedAt = Date.now();
    this.registrations.set(reg.id, reg);
    return true;
  }

  async approveStateTeamRegistration(id: string, approvedBy: string): Promise<boolean> {
    const reg = this.registrations.get(id);
    if (!reg) return false;
    reg.status = 'APPROVED';
    reg.approvedBy = approvedBy;
    reg.approvedAt = Date.now();
    reg.updatedAt = Date.now();
    this.registrations.set(reg.id, reg);
    return true;
  }

  async rejectStateTeamRegistration(id: string, rejectedBy: string, reason?: string): Promise<boolean> {
    const reg = this.registrations.get(id);
    if (!reg) return false;
    reg.status = 'REJECTED';
    let notesObj: any = {};
    try {
      if (reg.notes) notesObj = JSON.parse(reg.notes);
    } catch {
      notesObj = { text: reg.notes };
    }
    notesObj.rejection = { rejectedBy, reason: reason || 'Registration rejected by administrator', rejectedAt: Date.now() };
    reg.notes = JSON.stringify(notesObj);
    reg.updatedAt = Date.now();
    this.registrations.set(reg.id, reg);
    return true;
  }

  async updateRegistrationNotes(id: string, notes: string): Promise<boolean> {
    const reg = this.registrations.get(id);
    if (!reg) return false;
    reg.notes = notes;
    reg.updatedAt = Date.now();
    this.registrations.set(reg.id, reg);
    return true;
  }

  async listStateTeamRegistrations(): Promise<StateTeamRegistration[]> {
    return Array.from(this.registrations.values());
  }

  async createInvitation(params: {
    stateTeamId: string;
    state: string;
    salt: string;
    verifier: string;
    maxRedemptions?: number;
    expiresAt?: number;
  }): Promise<StateTeamInvitation> {
    const now = Date.now();
    const inv: StateTeamInvitation = {
      id: crypto.randomUUID(),
      stateTeamId: params.stateTeamId,
      state: params.state.trim(),
      codeVerifier: params.verifier,
      codeSalt: params.salt,
      status: 'ACTIVE',
      maxRedemptions: params.maxRedemptions ?? DEFAULT_MAX_REDEMPTIONS,
      redemptionCount: 0,
      expiresAt: params.expiresAt ?? now + DEFAULT_INVITATION_EXPIRY_MS,
      createdAt: now,
    };
    this.invitations.set(inv.id, inv);
    return inv;
  }

  async getInvitationById(id: string): Promise<StateTeamInvitation | null> {
    return this.invitations.get(id) || null;
  }

  async getActiveInvitationForCoordinator(stateTeamId: string): Promise<StateTeamInvitation | null> {
    const now = Date.now();
    for (const inv of this.invitations.values()) {
      if (
        inv.stateTeamId === stateTeamId &&
        inv.status === 'ACTIVE' &&
        inv.expiresAt > now
      ) {
        return { ...inv };
      }
    }
    return null;
  }

  async getActiveInvitationForState(state: string): Promise<StateTeamInvitation | null> {
    const norm = state.trim().toLowerCase();
    const now = Date.now();
    for (const inv of this.invitations.values()) {
      if (
        inv.state.trim().toLowerCase() === norm &&
        inv.status === 'ACTIVE' &&
        inv.expiresAt > now &&
        inv.redemptionCount < inv.maxRedemptions
      ) {
        return inv;
      }
    }
    return null;
  }

  async listInvitationsForState(state: string): Promise<StateTeamInvitation[]> {
    const norm = state.trim().toLowerCase();
    return Array.from(this.invitations.values()).filter(
      (inv) => inv.state.trim().toLowerCase() === norm
    );
  }

  async rotateInvitation(currentInvitationId: string, newSalt: string, newVerifier: string): Promise<StateTeamInvitation> {
    const oldInv = this.invitations.get(currentInvitationId);
    if (!oldInv) {
      throw new Error(`Invitation ${currentInvitationId} not found.`);
    }

    const now = Date.now();
    oldInv.status = 'ROTATED';
    oldInv.rotatedAt = now;
    this.invitations.set(oldInv.id, oldInv);

    const newInv: StateTeamInvitation = {
      id: crypto.randomUUID(),
      stateTeamId: oldInv.stateTeamId,
      state: oldInv.state,
      codeVerifier: newVerifier,
      codeSalt: newSalt,
      status: 'ACTIVE',
      maxRedemptions: oldInv.maxRedemptions,
      redemptionCount: 0,
      expiresAt: now + DEFAULT_INVITATION_EXPIRY_MS,
      createdAt: now,
    };
    this.invitations.set(newInv.id, newInv);
    return newInv;
  }

  async revokeInvitation(invitationId: string): Promise<boolean> {
    const inv = this.invitations.get(invitationId);
    if (!inv) return false;
    inv.status = 'REVOKED';
    inv.revokedAt = Date.now();
    this.invitations.set(inv.id, inv);
    return true;
  }

  async findAndValidateInvitation(
    plainCode: string,
    state: string,
    now: number = Date.now()
  ): Promise<{
    valid: boolean;
    error?: string;
    statusCode: number;
    invitation?: StateTeamInvitation;
  }> {
    const normState = state.trim().toLowerCase();
    let matchingCandidate: StateTeamInvitation | null = null;

    for (const inv of this.invitations.values()) {
      if (inv.state.trim().toLowerCase() === normState) {
        if (verifyInvitationCode(plainCode, inv.codeSalt, inv.codeVerifier)) {
          matchingCandidate = inv;
          break;
        }
      }
    }

    if (!matchingCandidate) {
      const matchPrefix = plainCode.toUpperCase().match(/^ALN-([A-Z]{2})-/);
      return {
        valid: false,
        error: matchPrefix
          ? `This invitation code prefix (${matchPrefix[1]}) does not match the selected state (${state}). Please select the correct state.`
          : 'Invalid invitation code or state mismatch. Please verify code.',
        statusCode: 400,
      };
    }

    if (matchingCandidate.status === 'REVOKED') {
      return {
        valid: false,
        error: 'This invitation code has been revoked by the state administrator.',
        statusCode: 403,
      };
    }

    if (matchingCandidate.status === 'ROTATED') {
      return {
        valid: false,
        error: 'This invitation code has been rotated. Please obtain the new code from your state coordinator.',
        statusCode: 403,
      };
    }

    if (matchingCandidate.expiresAt <= now) {
      return {
        valid: false,
        error: 'This invitation code has expired. Please request a new invitation from your state team.',
        statusCode: 410,
      };
    }

    if (matchingCandidate.redemptionCount >= matchingCandidate.maxRedemptions) {
      return {
        valid: false,
        error: 'This invitation code has reached its maximum authorized redemption limit.',
        statusCode: 429,
      };
    }

    const coordinator = await this.getStateTeamRegistrationById(matchingCandidate.stateTeamId);
    if (coordinator) {
      if (!coordinator.emailVerified) {
        return {
          valid: false,
          error: 'This invitation code is not yet active. State coordinator email verification is pending.',
          statusCode: 403,
        };
      }
      if (coordinator.status === 'PENDING_APPROVAL' || coordinator.status === 'PENDING') {
        return {
          valid: false,
          error: 'This invitation code is pending programme approval of the state coordinator.',
          statusCode: 403,
        };
      }
      if (coordinator.status === 'REJECTED') {
        return {
          valid: false,
          error: 'This invitation code is associated with a rejected coordinator registration.',
          statusCode: 403,
        };
      }
      if (coordinator.status === 'SUSPENDED') {
        return {
          valid: false,
          error: 'This invitation code is associated with a suspended coordinator account.',
          statusCode: 403,
        };
      }
      if (coordinator.status !== 'APPROVED') {
        return {
          valid: false,
          error: 'This invitation code is not active.',
          statusCode: 403,
        };
      }
    }

    return {
      valid: true,
      statusCode: 200,
      invitation: matchingCandidate,
    };
  }

  async atomicRedeemInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    const inv = this.invitations.get(invitationId);
    if (!inv) return { success: false, error: 'Invitation not found' };
    if (inv.status !== 'ACTIVE') return { success: false, error: `Invitation is ${inv.status}` };
    if (inv.redemptionCount >= inv.maxRedemptions) {
      return { success: false, error: 'Maximum redemptions exceeded' };
    }

    inv.redemptionCount += 1;
    this.invitations.set(inv.id, inv);
    return { success: true };
  }

  async redeemInvitation(invitationId: string, plainCode: string): Promise<{
    success: boolean;
    error?: string;
    statusCode: number;
    invitation?: StateTeamInvitation;
  }> {
    const inv = this.invitations.get(invitationId);
    if (!inv) return { success: false, error: 'Invitation not found.', statusCode: 404 };

    const check = await this.findAndValidateInvitation(plainCode, inv.state);
    if (!check.valid || !check.invitation) {
      return { success: false, error: check.error || 'Invalid code.', statusCode: check.statusCode };
    }

    if (inv.redemptionCount >= inv.maxRedemptions) {
      return { success: false, error: 'This invitation code has reached its maximum authorized redemption limit.', statusCode: 429 };
    }

    inv.redemptionCount += 1;
    this.invitations.set(inv.id, inv);
    return {
      success: true,
      statusCode: 200,
      invitation: { ...inv },
    };
  }

  async createFieldUserProfile(data: {
    googleSub: string;
    googleEmail: string;
    mobileNumber?: string;
    isMobileVerified?: boolean;
    firstName: string;
    lastName: string;
    assignedState: string;
    assignedDistrict: string;
    invitationId: string;
    srName?: string;
    ssrName?: string;
  }): Promise<FieldUserProfile> {
    const existing = await this.getFieldUserProfileByGoogleSub(data.googleSub);
    if (existing) {
      if (data.srName !== undefined || data.ssrName !== undefined || data.mobileNumber !== undefined) {
        const updated = await this.updateFieldUserProfile(existing.id, {
          srName: data.srName ?? existing.srName,
          ssrName: data.ssrName ?? existing.ssrName,
          mobileNumber: data.mobileNumber ?? existing.mobileNumber,
          isMobileVerified: data.isMobileVerified ?? existing.isMobileVerified,
        });
        if (updated) return updated;
      }
      return existing;
    }

    const now = Date.now();
    const profile: FieldUserProfile = {
      id: crypto.randomUUID(),
      googleSub: data.googleSub,
      googleEmail: data.googleEmail.trim().toLowerCase(),
      mobileNumber: data.mobileNumber ? data.mobileNumber.trim() : undefined,
      isMobileVerified: Boolean(data.isMobileVerified),
      firstName: data.firstName.trim(),
      lastName: (data.lastName || '').trim(),
      assignedState: data.assignedState.trim(),
      assignedDistrict: data.assignedDistrict.trim(),
      invitationId: data.invitationId,
      status: 'ACTIVE',
      srName: (data.srName || '').trim(),
      ssrName: (data.ssrName || '').trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.fieldProfiles.set(profile.id, profile);
    return profile;
  }

  async getFieldUserProfileByGoogleSub(googleSub: string): Promise<FieldUserProfile | null> {
    for (const p of this.fieldProfiles.values()) {
      if (p.googleSub === googleSub) return p;
    }
    return null;
  }

  async getFieldUserProfileByEmail(googleEmail: string): Promise<FieldUserProfile | null> {
    const norm = googleEmail.trim().toLowerCase();
    for (const p of this.fieldProfiles.values()) {
      if (p.googleEmail?.trim().toLowerCase() === norm) return p;
      if ((p as any).email?.trim().toLowerCase() === norm) return p;
      if ((p as any).workEmail?.trim().toLowerCase() === norm) return p;
    }
    return null;
  }

  async getFieldUserProfileByMobile(canonicalMobile: string): Promise<FieldUserProfile | null> {
    const norm = canonicalMobile.trim();
    for (const p of this.fieldProfiles.values()) {
      if (p.mobileNumber === norm) return p;
    }
    return null;
  }

  async getFieldUserProfileById(id: string): Promise<FieldUserProfile | null> {
    return this.fieldProfiles.get(id) || null;
  }

  async listFieldUserProfiles(state?: string): Promise<FieldUserProfile[]> {
    const list = Array.from(this.fieldProfiles.values());
    if (!state || state === '*' || state.toUpperCase() === 'ALL') return list;
    const variants = getStateQueryVariants(state);
    return list.filter((p) =>
      variants.some((v) => v.toLowerCase() === (p.assignedState || '').toLowerCase())
    );
  }

  async updateFieldUserProfile(
    id: string,
    updates: Partial<Omit<FieldUserProfile, 'id' | 'googleSub' | 'createdAt'>>
  ): Promise<FieldUserProfile | null> {
    const profile = this.fieldProfiles.get(id);
    if (!profile) return null;
    const updated: FieldUserProfile = {
      ...profile,
      ...updates,
      updatedAt: Date.now(),
    };
    this.fieldProfiles.set(id, updated);
    return updated;
  }

  clear(): void {
    this.registrations.clear();
    this.invitations.clear();
    this.fieldProfiles.clear();
    this.rateLimitEvents.clear();
  }
}

// -------------------------------------------------------------
// Singleton Instance Resolver & Distributed Store Adapters
// -------------------------------------------------------------

function sanitizeDatabaseError(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'Unknown database error';
  return raw
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/apikey=[a-z0-9._-]+/gi, 'apikey=[REDACTED]')
    .substring(0, 300);
}

export class UnavailableOnboardingStore implements OnboardingStore {
  private reason: string;

  constructor(reason: string = 'Distributed onboarding store is unconfigured or unavailable.') {
    this.reason = reason;
  }

  async saveStateTeamChallenge(): Promise<void> {
    throw new Error('Onboarding store is currently unavailable.');
  }

  async getStateTeamChallenge(): Promise<any | null> {
    throw new Error('Onboarding store is currently unavailable.');
  }

  async recordStateTeamChallengeAttempt(): Promise<void> {
    throw new Error('Onboarding store is currently unavailable.');
  }

  async deleteStateTeamChallenge(): Promise<void> {
    throw new Error('Onboarding store is currently unavailable.');
  }

  async checkRateLimit(): Promise<RateLimitStatus> { throw new Error(this.reason); }
  async createStateTeamRegistration(): Promise<StateTeamRegistration> { throw new Error(this.reason); }
  async getStateTeamRegistrationById(): Promise<StateTeamRegistration | null> { throw new Error(this.reason); }
  async getStateTeamRegistrationByEmail(): Promise<StateTeamRegistration | null> { throw new Error(this.reason); }
  async verifyStateTeamEmail(): Promise<boolean> { throw new Error(this.reason); }
  async approveStateTeamRegistration(): Promise<boolean> { throw new Error(this.reason); }
  async rejectStateTeamRegistration(): Promise<boolean> { throw new Error(this.reason); }
  async updateRegistrationNotes(): Promise<boolean> { throw new Error(this.reason); }
  async listStateTeamRegistrations(): Promise<StateTeamRegistration[]> { throw new Error(this.reason); }
  async createInvitation(): Promise<StateTeamInvitation> { throw new Error(this.reason); }
  async getInvitationById(): Promise<StateTeamInvitation | null> { throw new Error(this.reason); }
  async getActiveInvitationForState(): Promise<StateTeamInvitation | null> { throw new Error(this.reason); }
  async getActiveInvitationForCoordinator(): Promise<StateTeamInvitation | null> { throw new Error(this.reason); }
  async listInvitationsForState(): Promise<StateTeamInvitation[]> { throw new Error(this.reason); }
  async rotateInvitation(): Promise<StateTeamInvitation> { throw new Error(this.reason); }
  async revokeInvitation(): Promise<boolean> { throw new Error(this.reason); }
  async findAndValidateInvitation(): Promise<{ valid: boolean; error?: string; statusCode: number; invitation?: StateTeamInvitation }> { throw new Error(this.reason); }
  async atomicRedeemInvitation(): Promise<{ success: boolean; error?: string }> { throw new Error(this.reason); }
  async redeemInvitation(): Promise<{ success: boolean; error?: string; statusCode: number; invitation?: StateTeamInvitation }> { throw new Error(this.reason); }
  async createFieldUserProfile(): Promise<FieldUserProfile> { throw new Error(this.reason); }
  async getFieldUserProfileByGoogleSub(): Promise<FieldUserProfile | null> { throw new Error(this.reason); }
  async getFieldUserProfileByEmail(): Promise<FieldUserProfile | null> { throw new Error(this.reason); }
  async getFieldUserProfileByMobile(): Promise<FieldUserProfile | null> { throw new Error(this.reason); }
  async getFieldUserProfileById(): Promise<FieldUserProfile | null> { throw new Error(this.reason); }
  async listFieldUserProfiles(): Promise<FieldUserProfile[]> { throw new Error(this.reason); }
  async updateFieldUserProfile(): Promise<FieldUserProfile | null> { throw new Error(this.reason); }
}

export class SupabaseOnboardingStore implements OnboardingStore {
  private baseUrl: string;
  private apiKey: string;
  private memoryFallback: MemoryOnboardingStore;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SupabaseOnboardingStore requires non-empty supabaseUrl and serviceRoleKey.');
    }
    this.baseUrl = supabaseUrl.replace(/\/+$/, '');
    this.apiKey = serviceRoleKey;
    this.memoryFallback = new MemoryOnboardingStore();
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
  }

  async checkRateLimit(key: string, now: number, maxAttempts: number, windowMs: number): Promise<RateLimitStatus> {
    // In-memory bucket is lightning-fast and distributed per worker
    return this.memoryFallback.checkRateLimit(key, now, maxAttempts, windowMs);
  }

  async saveStateTeamChallenge(challenge: any): Promise<void> {
    const normEmail = challenge.workEmail.toLowerCase().trim();
    const existing = await this.getStateTeamRegistrationByEmail(normEmail);
    if (!existing) return;

    let parsedNotes: any = {};
    try {
      if (existing.notes) parsedNotes = JSON.parse(existing.notes);
    } catch (_) {
      parsedNotes = { textNotes: existing.notes };
    }

    parsedNotes.otpChallenge = { ...challenge };

    const updateUrl = `${this.baseUrl}/rest/v1/state_team_registrations?id=eq.${existing.id}`;
    await fetch(updateUrl, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({
        notes: JSON.stringify(parsedNotes),
        updated_at: new Date().toISOString(),
      }),
    });
  }

  async getStateTeamChallenge(workEmail: string): Promise<any | null> {
    const normEmail = workEmail.toLowerCase().trim();
    const existing = await this.getStateTeamRegistrationByEmail(normEmail);
    if (!existing || !existing.notes) return null;

    try {
      const parsedNotes = JSON.parse(existing.notes);
      return parsedNotes?.otpChallenge || null;
    } catch (_) {
      return null;
    }
  }

  async recordStateTeamChallengeAttempt(workEmail: string, failedAttempts: number, isLocked: boolean): Promise<void> {
    const challenge = await this.getStateTeamChallenge(workEmail);
    if (challenge) {
      challenge.failedAttempts = failedAttempts;
      challenge.isLocked = isLocked;
      await this.saveStateTeamChallenge(challenge);
    }
  }

  async deleteStateTeamChallenge(workEmail: string): Promise<void> {
    const normEmail = workEmail.toLowerCase().trim();
    const existing = await this.getStateTeamRegistrationByEmail(normEmail);
    if (!existing || !existing.notes) return;

    try {
      const parsedNotes = JSON.parse(existing.notes);
      delete parsedNotes.otpChallenge;
      const updateUrl = `${this.baseUrl}/rest/v1/state_team_registrations?id=eq.${existing.id}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({
          notes: Object.keys(parsedNotes).length > 0 ? JSON.stringify(parsedNotes) : null,
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (_) {}
  }

  async createStateTeamRegistration(data: {
    firstName: string;
    lastName: string;
    workEmail: string;
    requestedState: string;
    organization: string;
    autoApprove?: boolean;
    notes?: string;
  }): Promise<StateTeamRegistration> {
    // Prevent 409 duplicate key errors: return and update existing registration
    const existing = await this.getStateTeamRegistrationByEmail(data.workEmail);
    if (existing) {
      const updateUrl = `${this.baseUrl}/rest/v1/state_team_registrations?id=eq.${existing.id}`;
      const updateBody: any = {
        first_name: data.firstName.trim(),
        last_name: (data.lastName || '').trim(),
        requested_state: data.requestedState.trim(),
        organization: data.organization.trim(),
        updated_at: new Date().toISOString(),
      };
      if (data.notes !== undefined) {
        updateBody.notes = data.notes;
      }
      if (data.autoApprove && (existing.status === 'PENDING_APPROVAL' || existing.status === 'PENDING')) {
        updateBody.status = 'APPROVED';
      }
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(updateBody),
      });
      return {
        ...existing,
        firstName: data.firstName.trim(),
        lastName: (data.lastName || '').trim(),
        requestedState: data.requestedState.trim(),
        organization: data.organization.trim(),
        notes: data.notes !== undefined ? data.notes : existing.notes,
        status: data.autoApprove && (existing.status === 'PENDING_APPROVAL' || existing.status === 'PENDING') ? 'APPROVED' : existing.status,
      };
    }

    const url = `${this.baseUrl}/rest/v1/state_team_registrations`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        first_name: data.firstName.trim(),
        last_name: (data.lastName || '').trim(),
        work_email: data.workEmail.trim().toLowerCase(),
        requested_state: data.requestedState.trim(),
        organization: data.organization.trim(),
        status: data.autoApprove ? 'APPROVED' : 'PENDING_APPROVAL',
        notes: data.notes,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database createStateTeamRegistration failed (${res.status}): ${sanitizeDatabaseError(errText)}`);
    }

    const rows = await res.json();
    const row = rows[0];
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name || '',
      workEmail: row.work_email,
      requestedState: row.requested_state,
      organization: row.organization,
      status: row.status === 'PENDING' ? 'PENDING_APPROVAL' : row.status,
      emailVerified: Boolean(row.email_verified_at),
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : null,
      notes: row.notes,
    };
  }

  async getStateTeamRegistrationById(id: string): Promise<StateTeamRegistration | null> {
    const url = `${this.baseUrl}/rest/v1/state_team_registrations?id=eq.${encodeURIComponent(id)}&select=*`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name || '',
      workEmail: row.work_email,
      requestedState: row.requested_state,
      organization: row.organization,
      status: row.status === 'PENDING' ? 'PENDING_APPROVAL' : row.status,
      emailVerified: Boolean(row.email_verified_at),
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : null,
      notes: row.notes,
    };
  }

  async getStateTeamRegistrationByEmail(email: string): Promise<StateTeamRegistration | null> {
    const norm = encodeURIComponent(email.trim().toLowerCase());
    const url = `${this.baseUrl}/rest/v1/state_team_registrations?work_email=eq.${norm}&select=*`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name || '',
      workEmail: row.work_email,
      requestedState: row.requested_state,
      organization: row.organization,
      status: row.status === 'PENDING' ? 'PENDING_APPROVAL' : row.status,
      emailVerified: Boolean(row.email_verified_at),
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : null,
      notes: row.notes,
    };
  }

  async verifyStateTeamEmail(email: string): Promise<boolean> {
    const norm = encodeURIComponent(email.trim().toLowerCase());
    const url = `${this.baseUrl}/rest/v1/state_team_registrations?work_email=eq.${norm}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ email_verified_at: new Date().toISOString() }),
    });
    return res.ok;
  }

  async approveStateTeamRegistration(id: string, approvedBy: string): Promise<boolean> {
    const url = `${this.baseUrl}/rest/v1/state_team_registrations?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({
        status: 'APPROVED',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  }

  async rejectStateTeamRegistration(id: string, rejectedBy: string, reason?: string): Promise<boolean> {
    const existing = await this.getStateTeamRegistrationById(id);
    let notesObj: any = {};
    if (existing?.notes) {
      try { notesObj = JSON.parse(existing.notes); } catch { notesObj = { text: existing.notes }; }
    }
    notesObj.rejection = { rejectedBy, reason: reason || 'Registration rejected by administrator', rejectedAt: new Date().toISOString() };
    const url = `${this.baseUrl}/rest/v1/state_team_registrations?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({
        status: 'REJECTED',
        notes: JSON.stringify(notesObj),
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  }

  async updateRegistrationNotes(id: string, notes: string): Promise<boolean> {
    const url = `${this.baseUrl}/rest/v1/state_team_registrations?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({
        notes,
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  }

  async listStateTeamRegistrations(): Promise<StateTeamRegistration[]> {
    const url = `${this.baseUrl}/rest/v1/state_team_registrations?select=*&order=created_at.desc`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((row: any) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name || '',
      workEmail: row.work_email,
      requestedState: row.requested_state,
      organization: row.organization,
      status: row.status === 'PENDING' ? 'PENDING_APPROVAL' : row.status,
      emailVerified: Boolean(row.email_verified_at),
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : null,
      notes: row.notes,
    }));
  }

  async createInvitation(params: {
    stateTeamId: string;
    state: string;
    salt: string;
    verifier: string;
    maxRedemptions?: number;
    expiresAt?: number;
  }): Promise<StateTeamInvitation> {
    const url = `${this.baseUrl}/rest/v1/state_team_invitations`;
    const expiresAtIso = new Date(params.expiresAt ?? Date.now() + DEFAULT_INVITATION_EXPIRY_MS).toISOString();
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        state_team_id: params.stateTeamId,
        state: params.state.trim(),
        salt: params.salt,
        verifier: params.verifier,
        max_redemptions: params.maxRedemptions ?? DEFAULT_MAX_REDEMPTIONS,
        expires_at: expiresAtIso,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database createInvitation failed (${res.status}): ${sanitizeDatabaseError(errText)}`);
    }

    const rows = await res.json();
    const row = rows[0];
    return {
      id: row.id,
      stateTeamId: row.state_team_id,
      state: row.state,
      codeVerifier: row.verifier,
      codeSalt: row.salt,
      status: row.status,
      maxRedemptions: Number(row.max_redemptions),
      redemptionCount: Number(row.redemption_count),
      expiresAt: new Date(row.expires_at).getTime(),
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  async getInvitationById(id: string): Promise<StateTeamInvitation | null> {
    const url = `${this.baseUrl}/rest/v1/state_team_invitations?id=eq.${encodeURIComponent(id)}&select=*`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      stateTeamId: row.state_team_id,
      state: row.state,
      codeVerifier: row.verifier,
      codeSalt: row.salt,
      status: row.status,
      maxRedemptions: Number(row.max_redemptions),
      redemptionCount: Number(row.redemption_count),
      expiresAt: new Date(row.expires_at).getTime(),
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  async getActiveInvitationForCoordinator(stateTeamId: string): Promise<StateTeamInvitation | null> {
    const norm = encodeURIComponent(stateTeamId.trim());
    const nowIso = new Date().toISOString();
    const url = `${this.baseUrl}/rest/v1/state_team_invitations?state_team_id=eq.${norm}&status=eq.ACTIVE&expires_at=gt.${nowIso}&select=*&order=created_at.desc&limit=1`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      stateTeamId: row.state_team_id,
      state: row.state,
      codeVerifier: row.verifier,
      codeSalt: row.salt,
      status: row.status,
      maxRedemptions: Number(row.max_redemptions),
      redemptionCount: Number(row.redemption_count),
      expiresAt: new Date(row.expires_at).getTime(),
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  async getActiveInvitationForState(state: string): Promise<StateTeamInvitation | null> {
    const norm = encodeURIComponent(state.trim());
    const nowIso = new Date().toISOString();
    const url = `${this.baseUrl}/rest/v1/state_team_invitations?state=ilike.${norm}&status=eq.ACTIVE&expires_at=gt.${nowIso}&select=*&order=created_at.desc&limit=1`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      stateTeamId: row.state_team_id,
      state: row.state,
      codeVerifier: row.verifier,
      codeSalt: row.salt,
      status: row.status,
      maxRedemptions: Number(row.max_redemptions),
      redemptionCount: Number(row.redemption_count),
      expiresAt: new Date(row.expires_at).getTime(),
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  async listInvitationsForState(state: string): Promise<StateTeamInvitation[]> {
    const norm = encodeURIComponent(state.trim());
    const url = `${this.baseUrl}/rest/v1/state_team_invitations?state=ilike.${norm}&select=*&order=created_at.desc`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((row: any) => ({
      id: row.id,
      stateTeamId: row.state_team_id,
      state: row.state,
      codeVerifier: row.verifier,
      codeSalt: row.salt,
      status: row.status,
      maxRedemptions: Number(row.max_redemptions),
      redemptionCount: Number(row.redemption_count),
      expiresAt: new Date(row.expires_at).getTime(),
      createdAt: new Date(row.created_at).getTime(),
    }));
  }

  async rotateInvitation(currentInvitationId: string, newSalt: string, newVerifier: string): Promise<StateTeamInvitation> {
    const current = await this.getInvitationById(currentInvitationId);
    if (!current) throw new Error(`Invitation ${currentInvitationId} not found.`);

    // 1. Mark existing as ROTATED
    await fetch(`${this.baseUrl}/rest/v1/state_team_invitations?id=eq.${encodeURIComponent(currentInvitationId)}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ status: 'ROTATED' }),
    });

    // 2. Insert new invitation
    return this.createInvitation({
      stateTeamId: current.stateTeamId,
      state: current.state,
      salt: newSalt,
      verifier: newVerifier,
      maxRedemptions: current.maxRedemptions,
    });
  }

  async revokeInvitation(invitationId: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/rest/v1/state_team_invitations?id=eq.${encodeURIComponent(invitationId)}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ status: 'REVOKED' }),
    });
    return res.ok;
  }

  async findAndValidateInvitation(plainCode: string, state: string, now: number = Date.now()): Promise<{
    valid: boolean;
    error?: string;
    statusCode: number;
    invitation?: StateTeamInvitation;
  }> {
    const invitations = await this.listInvitationsForState(state);
    let match: StateTeamInvitation | null = null;
    for (const inv of invitations) {
      if (verifyInvitationCode(plainCode, inv.codeSalt, inv.codeVerifier)) {
        match = inv;
        break;
      }
    }

    if (!match) {
      const matchPrefix = plainCode.toUpperCase().match(/^ALN-([A-Z]{2})-/);
      console.warn(`[AUTH_INVITATION:NOT_FOUND] Invitation code ${plainCode.substring(0, 7)}*** not found for state: ${state}`);
      return {
        valid: false,
        error: matchPrefix
          ? `This invitation code prefix (${matchPrefix[1]}) does not match the selected state (${state}). Please select the correct state.`
          : 'Invalid invitation code or state mismatch. Please verify code.',
        statusCode: 400,
      };
    }
    if (match.status === 'REVOKED') {
      console.warn(`[AUTH_INVITATION:REVOKED] Invitation ${match.id} is revoked.`);
      return { valid: false, error: 'This invitation code has been revoked by the state administrator.', statusCode: 403 };
    }
    if (match.status === 'ROTATED') {
      console.warn(`[AUTH_INVITATION:ROTATED] Invitation ${match.id} is rotated.`);
      return { valid: false, error: 'This invitation code has been rotated. Please obtain the new code from your state coordinator.', statusCode: 403 };
    }
    if (match.status === 'EXPIRED' || match.expiresAt <= now) {
      console.warn(`[AUTH_INVITATION:EXPIRED] Invitation ${match.id} is expired.`);
      return { valid: false, error: 'This invitation code has expired. Please request a new code from your state coordinator.', statusCode: 410 };
    }
    if (match.redemptionCount >= match.maxRedemptions) {
      console.warn(`[AUTH_INVITATION:EXHAUSTED] Invitation ${match.id} reached maximum redemptions.`);
      return { valid: false, error: 'This invitation code has reached its maximum authorized redemption limit.', statusCode: 429 };
    }

    const coordinator = await this.getStateTeamRegistrationById(match.stateTeamId);
    if (coordinator) {
      if (!coordinator.emailVerified) {
        console.warn(`[AUTH_INVITATION:COORDINATOR_PENDING_EMAIL] Coordinator ${coordinator.id} email verification pending.`);
        return { valid: false, error: 'This invitation code is not yet active. State coordinator email verification is pending.', statusCode: 403 };
      }
      if (coordinator.status === 'PENDING_APPROVAL' || coordinator.status === 'PENDING') {
        console.warn(`[AUTH_INVITATION:COORDINATOR_PENDING_APPROVAL] Coordinator ${coordinator.id} approval pending.`);
        return { valid: false, error: 'This invitation code is pending programme approval of the state coordinator.', statusCode: 403 };
      }
      if (coordinator.status === 'REJECTED') {
        console.warn(`[AUTH_INVITATION:COORDINATOR_REJECTED] Coordinator ${coordinator.id} rejected.`);
        return { valid: false, error: 'This invitation code is associated with a rejected coordinator registration.', statusCode: 403 };
      }
      if (coordinator.status === 'SUSPENDED') {
        console.warn(`[AUTH_INVITATION:COORDINATOR_SUSPENDED] Coordinator ${coordinator.id} suspended.`);
        return { valid: false, error: 'This invitation code is associated with a suspended coordinator account.', statusCode: 403 };
      }
      if (coordinator.status !== 'APPROVED') {
        console.warn(`[AUTH_INVITATION:INACTIVE] Coordinator ${coordinator.id} inactive status: ${coordinator.status}`);
        return { valid: false, error: 'This invitation code is not active.', statusCode: 403 };
      }
    }

    return { valid: true, statusCode: 200, invitation: match };
  }

  async redeemInvitation(invitationId: string, plainCode: string): Promise<{
    success: boolean;
    error?: string;
    statusCode: number;
    invitation?: StateTeamInvitation;
  }> {
    const inv = await this.getInvitationById(invitationId);
    if (!inv) return { success: false, error: 'Invitation not found.', statusCode: 404 };

    const check = await this.findAndValidateInvitation(plainCode, inv.state);
    if (!check.valid || !check.invitation) {
      return { success: false, error: check.error || 'Invalid code.', statusCode: check.statusCode };
    }

    // Call stored procedure for atomic concurrency-safe increment
    const rpcRes = await fetch(`${this.baseUrl}/rest/v1/rpc/redeem_state_team_invitation`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ p_invitation_id: invitationId }),
    });

    if (rpcRes.ok) {
      const data = await rpcRes.json();
      const firstResult = Array.isArray(data) ? data[0] : data;
      if (firstResult && firstResult.success) {
        return {
          success: true,
          statusCode: 200,
          invitation: { ...inv, redemptionCount: firstResult.new_count },
        };
      }
    }

    // Fallback: update directly if RPC not yet deployed
    const patchRes = await fetch(`${this.baseUrl}/rest/v1/state_team_invitations?id=eq.${encodeURIComponent(invitationId)}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ redemption_count: inv.redemptionCount + 1 }),
    });
    if (!patchRes.ok) {
      return { success: false, error: 'Failed to record invitation redemption.', statusCode: 500 };
    }
    return {
      success: true,
      statusCode: 200,
      invitation: { ...inv, redemptionCount: inv.redemptionCount + 1 },
    };
  }

  async atomicRedeemInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/redeem_state_team_invitation`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ p_invitation_id: invitationId }),
    });
    if (res.ok) {
      const data = await res.json();
      const first = Array.isArray(data) ? data[0] : data;
      return { success: Boolean(first?.success), error: first?.reason };
    }
    return { success: false, error: 'Database RPC failed' };
  }

  async createFieldUserProfile(data: {
    googleSub: string;
    googleEmail: string;
    mobileNumber?: string;
    isMobileVerified?: boolean;
    firstName: string;
    lastName: string;
    assignedState: string;
    assignedDistrict: string;
    invitationId: string;
    srName?: string;
    ssrName?: string;
  }): Promise<FieldUserProfile> {
    const url = `${this.baseUrl}/rest/v1/field_user_profiles`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        google_sub: data.googleSub.trim(),
        google_email: data.googleEmail.trim().toLowerCase(),
        mobile_number: data.mobileNumber ? data.mobileNumber.trim() : null,
        is_mobile_verified: Boolean(data.isMobileVerified),
        first_name: data.firstName.trim(),
        last_name: (data.lastName || '').trim(),
        assigned_state: data.assignedState.trim(),
        assigned_district: data.assignedDistrict.trim(),
        invitation_id: data.invitationId,
        sr_name: (data.srName || '').trim(),
        ssr_name: (data.ssrName || '').trim(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database createFieldUserProfile failed (${res.status}): ${sanitizeDatabaseError(errText)}`);
    }

    const rows = await res.json();
    const row = rows[0];
    return {
      id: row.id,
      googleSub: row.google_sub,
      googleEmail: row.google_email,
      firstName: row.first_name,
      lastName: row.last_name || '',
      assignedState: row.assigned_state,
      assignedDistrict: row.assigned_district,
      invitationId: row.invitation_id,
      status: row.status,
      srName: row.sr_name || row.srName || '',
      ssrName: row.ssr_name || row.ssrName || '',
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  async getFieldUserProfileByGoogleSub(googleSub: string): Promise<FieldUserProfile | null> {
    const url = `${this.baseUrl}/rest/v1/field_user_profiles?google_sub=eq.${encodeURIComponent(googleSub.trim())}&select=*`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      googleSub: row.google_sub,
      googleEmail: row.google_email,
      firstName: row.first_name,
      lastName: row.last_name || '',
      assignedState: row.assigned_state,
      assignedDistrict: row.assigned_district,
      invitationId: row.invitation_id,
      status: row.status,
      srName: row.sr_name || row.srName || '',
      ssrName: row.ssr_name || row.ssrName || '',
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  async getFieldUserProfileByEmail(googleEmail: string): Promise<FieldUserProfile | null> {
    const url = `${this.baseUrl}/rest/v1/field_user_profiles?google_email=eq.${encodeURIComponent(googleEmail.trim().toLowerCase())}&select=*`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      googleSub: row.google_sub,
      googleEmail: row.google_email,
      firstName: row.first_name,
      lastName: row.last_name || '',
      assignedState: row.assigned_state,
      assignedDistrict: row.assigned_district,
      invitationId: row.invitation_id,
      status: row.status,
      srName: row.sr_name || row.srName || '',
      ssrName: row.ssr_name || row.ssrName || '',
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  async getFieldUserProfileByMobile(canonicalMobile: string): Promise<FieldUserProfile | null> {
    const url = `${this.baseUrl}/rest/v1/field_user_profiles?mobile_number=eq.${encodeURIComponent(canonicalMobile.trim())}&select=*`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      googleSub: row.google_sub,
      googleEmail: row.google_email,
      mobileNumber: row.mobile_number,
      isMobileVerified: row.is_mobile_verified,
      firstName: row.first_name,
      lastName: row.last_name || '',
      assignedState: row.assigned_state,
      assignedDistrict: row.assigned_district,
      invitationId: row.invitation_id,
      status: row.status,
      srName: row.sr_name || row.srName || '',
      ssrName: row.ssr_name || row.ssrName || '',
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  async getFieldUserProfileById(id: string): Promise<FieldUserProfile | null> {
    const url = `${this.baseUrl}/rest/v1/field_user_profiles?id=eq.${encodeURIComponent(id)}&select=*`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      googleSub: row.google_sub,
      googleEmail: row.google_email,
      firstName: row.first_name,
      lastName: row.last_name || '',
      assignedState: row.assigned_state,
      assignedDistrict: row.assigned_district,
      invitationId: row.invitation_id,
      status: row.status,
      srName: row.sr_name || row.srName || '',
      ssrName: row.ssr_name || row.ssrName || '',
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  async listFieldUserProfiles(state?: string): Promise<FieldUserProfile[]> {
    let url = `${this.baseUrl}/rest/v1/field_user_profiles?select=*`;
    if (state && state !== '*' && state.toUpperCase() !== 'ALL') {
      const canon = canonicalizeStateName(state);
      url += `&assigned_state=ilike.${encodeURIComponent(canon)}`;
    }
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return [];
    const rows = await res.json();
    return (rows || []).map((row: any) => ({
      id: row.id,
      googleSub: row.google_sub,
      googleEmail: row.google_email,
      firstName: row.first_name,
      lastName: row.last_name || '',
      assignedState: row.assigned_state,
      assignedDistrict: row.assigned_district,
      invitationId: row.invitation_id,
      status: row.status,
      srName: row.sr_name || row.srName || '',
      ssrName: row.ssr_name || row.ssrName || '',
      createdAt: typeof row.created_at === 'string' ? new Date(row.created_at).getTime() : row.created_at,
      updatedAt: typeof row.updated_at === 'string' ? new Date(row.updated_at).getTime() : row.updated_at,
    }));
  }

  async updateFieldUserProfile(
    id: string,
    updates: Partial<Omit<FieldUserProfile, 'id' | 'googleSub' | 'createdAt'>>
  ): Promise<FieldUserProfile | null> {
    const body: Record<string, any> = {};
    if (updates.firstName !== undefined) body.first_name = updates.firstName;
    if (updates.lastName !== undefined) body.last_name = updates.lastName;
    if (updates.assignedState !== undefined) body.assigned_state = updates.assignedState;
    if (updates.assignedDistrict !== undefined) body.assigned_district = updates.assignedDistrict;
    if (updates.status !== undefined) body.status = updates.status;
    if (updates.srName !== undefined) body.sr_name = updates.srName;
    if (updates.ssrName !== undefined) body.ssr_name = updates.ssrName;

    const url = `${this.baseUrl}/rest/v1/field_user_profiles?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      googleSub: row.google_sub,
      googleEmail: row.google_email,
      firstName: row.first_name,
      lastName: row.last_name || '',
      assignedState: row.assigned_state,
      assignedDistrict: row.assigned_district,
      invitationId: row.invitation_id,
      status: row.status,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }
}

// -------------------------------------------------------------
// Firestore Onboarding Adapter (Phase B)
// -------------------------------------------------------------

function parseTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val === 'string') return new Date(val).getTime();
  return 0;
}

export class FirestoreOnboardingStore implements OnboardingStore {
  private customDb?: any;

  constructor(customDb?: any) {
    this.customDb = customDb;
  }

  private async getDb() {
    const appEnv = process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development';
    const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    validateFirestoreDatabaseEnvironment(appEnv, databaseId);

    const isProductionOrStaging =
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL_ENV === 'production' ||
      process.env.APP_ENV === 'production' ||
      (process.env.NODE_ENV as string) === 'staging' ||
      process.env.APP_ENV === 'staging';

    try {
      return await getFirestoreDb(this.customDb);
    } catch (err: any) {
      if (isProductionOrStaging) {
        throw new Error(`[ONBOARDING_STORE_UNAVAILABLE] Cloud Firestore unreachable in ${appEnv}: ${err?.message || err}`);
      }
      throw err;
    }
  }

  // Rate Limiting
  async checkRateLimit(key: string, now: number, maxAttempts: number, windowMs: number): Promise<RateLimitStatus> {
    const db = await this.getDb();
    const docId = `onboard_rl_${sanitizeIpForDocId(key)}`;
    const docRef = db.collection('auth_attempts').doc(docId);

    return await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      const data = snap.exists ? snap.data() : null;
      const windowStart = now - windowMs;

      const rawAttempts = Array.isArray(data?.attempts) ? data.attempts : [];
      const attempts = rawAttempts.filter((t: number) => typeof t === 'number' && t > windowStart);

      if (attempts.length >= maxAttempts) {
        const oldest = attempts[0];
        const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
      }

      attempts.push(now);
      await transaction.set(docRef, {
        key,
        attempts,
        expiresAt: new Date(now + windowMs),
        updatedAt: new Date(now),
      });

      return { allowed: true };
    });
  }

  // Durable OTP Challenges
  async saveStateTeamChallenge(challenge: any): Promise<void> {
    const db = await this.getDb();
    const norm = challenge.workEmail.toLowerCase().trim();
    const docId = sanitizeIpForDocId(norm);
    const expiresAtMs = typeof challenge.expiresAt === 'number' ? challenge.expiresAt : Date.now() + 10 * 60 * 1000;

    await db.collection(STATE_TEAM_CHALLENGES_COLLECTION).doc(docId).set({
      ...challenge,
      workEmail: norm,
      expiresAt: new Date(expiresAtMs),
      expiresAtMs,
      updatedAt: Date.now(),
    });
  }

  async getStateTeamChallenge(workEmail: string): Promise<any | null> {
    const db = await this.getDb();
    const norm = workEmail.toLowerCase().trim();
    const docId = sanitizeIpForDocId(norm);
    const snap = await db.collection(STATE_TEAM_CHALLENGES_COLLECTION).doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (Date.now() > parseTimestamp(data.expiresAt)) {
      return null;
    }
    return {
      ...data,
      expiresAt: parseTimestamp(data.expiresAt),
    };
  }

  async recordStateTeamChallengeAttempt(workEmail: string, failedAttempts: number, isLocked: boolean): Promise<void> {
    const db = await this.getDb();
    const norm = workEmail.toLowerCase().trim();
    const docId = sanitizeIpForDocId(norm);
    const snap = await db.collection(STATE_TEAM_CHALLENGES_COLLECTION).doc(docId).get();
    if (snap.exists) {
      await db.collection(STATE_TEAM_CHALLENGES_COLLECTION).doc(docId).set({
        ...snap.data(),
        failedAttempts,
        isLocked,
        updatedAt: Date.now(),
      });
    }
  }

  async deleteStateTeamChallenge(workEmail: string): Promise<void> {
    const db = await this.getDb();
    const norm = workEmail.toLowerCase().trim();
    const docId = sanitizeIpForDocId(norm);
    await db.collection(STATE_TEAM_CHALLENGES_COLLECTION).doc(docId).delete();
  }

  // State Team Registrations
  async createStateTeamRegistration(data: {
    firstName: string;
    lastName: string;
    workEmail: string;
    requestedState: string;
    organization: string;
    autoApprove?: boolean;
    notes?: string;
  }): Promise<StateTeamRegistration> {
    const db = await this.getDb();
    const normEmail = data.workEmail.toLowerCase().trim();
    const existing = await this.getStateTeamRegistrationByEmail(normEmail);
    if (existing) {
      return existing;
    }

    const id = `reg_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const registration: StateTeamRegistration = {
      id,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      workEmail: data.workEmail.toLowerCase().trim(),
      requestedState: canonicalizeStateName(data.requestedState) || data.requestedState.trim(),
      organization: data.organization.trim(),
      status: data.autoApprove ? 'APPROVED' : 'PENDING_APPROVAL',
      emailVerified: Boolean(data.autoApprove),
      approvedAt: data.autoApprove ? now : undefined,
      approvedBy: data.autoApprove ? 'SYSTEM_AUTO' : undefined,
      notes: data.notes || '',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(id).set(registration);
    return registration;
  }

  async getStateTeamRegistrationById(id: string): Promise<StateTeamRegistration | null> {
    const db = await this.getDb();
    const snap = await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as StateTeamRegistration;
  }

  async getStateTeamRegistrationByEmail(email: string): Promise<StateTeamRegistration | null> {
    const db = await this.getDb();
    const norm = email.toLowerCase().trim();
    const snap = await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION)
      .where('workEmail', '==', norm)
      .get();
    if (!snap.docs || snap.docs.length === 0) return null;
    return snap.docs[0].data() as StateTeamRegistration;
  }

  async verifyStateTeamEmail(email: string): Promise<boolean> {
    const db = await this.getDb();
    const reg = await this.getStateTeamRegistrationByEmail(email);
    if (!reg) return false;
    await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(reg.id).set({
      ...reg,
      emailVerified: true,
      updatedAt: Date.now(),
    });
    return true;
  }

  async approveStateTeamRegistration(id: string, approvedBy: string): Promise<boolean> {
    const db = await this.getDb();
    const snap = await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(id).get();
    if (!snap.exists) return false;
    const now = Date.now();
    await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(id).set({
      ...snap.data(),
      status: 'APPROVED',
      approvedBy,
      approvedAt: now,
      reviewedBy: approvedBy,
      reviewedAt: now,
      updatedAt: now,
    });
    return true;
  }

  async rejectStateTeamRegistration(id: string, rejectedBy: string, reason?: string): Promise<boolean> {
    const db = await this.getDb();
    const snap = await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(id).get();
    if (!snap.exists) return false;
    const now = Date.now();
    await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(id).set({
      ...snap.data(),
      status: 'REJECTED',
      reviewedBy: rejectedBy,
      rejectionReason: reason || null,
      reviewedAt: now,
      notes: reason || snap.data().notes,
      updatedAt: now,
    });
    return true;
  }

  async updateRegistrationNotes(id: string, notes: string): Promise<boolean> {
    const db = await this.getDb();
    const snap = await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(id).get();
    if (!snap.exists) return false;
    await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).doc(id).set({
      ...snap.data(),
      notes,
      updatedAt: Date.now(),
    });
    return true;
  }

  async listStateTeamRegistrations(): Promise<StateTeamRegistration[]> {
    const db = await this.getDb();
    const snap = await db.collection(STATE_TEAM_REGISTRATIONS_COLLECTION).get();
    return (snap.docs || []).map((d: any) => d.data() as StateTeamRegistration);
  }

  // State Team Invitations
  async createInvitation(params: {
    stateTeamId: string;
    state: string;
    salt: string;
    verifier: string;
    maxRedemptions?: number;
    expiresAt?: number;
  }): Promise<StateTeamInvitation> {
    const db = await this.getDb();
    const id = `inv_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const expiresAt = params.expiresAt || now + DEFAULT_INVITATION_EXPIRY_MS;

    const invitation: StateTeamInvitation = {
      id,
      stateTeamId: params.stateTeamId,
      state: params.state.toUpperCase().trim(),
      codeSalt: params.salt,
      codeVerifier: params.verifier,
      redemptionCount: 0,
      maxRedemptions: params.maxRedemptions || DEFAULT_MAX_REDEMPTIONS,
      status: 'ACTIVE',
      expiresAt,
      createdAt: now,
    };

    await db.collection(STATE_TEAM_INVITATIONS_COLLECTION).doc(id).set({
      ...invitation,
      expiresAtDate: new Date(expiresAt), // Firestore TTL field
    });

    return invitation;
  }

  async getInvitationById(id: string): Promise<StateTeamInvitation | null> {
    const db = await this.getDb();
    const snap = await db.collection(STATE_TEAM_INVITATIONS_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as StateTeamInvitation;
  }

  async getActiveInvitationForState(state: string): Promise<StateTeamInvitation | null> {
    const db = await this.getDb();
    const norm = state.toUpperCase().trim();
    const snap = await db.collection(STATE_TEAM_INVITATIONS_COLLECTION)
      .where('state', '==', norm)
      .get();

    const active = (snap.docs || [])
      .map((d: any) => d.data() as StateTeamInvitation)
      .filter((inv: StateTeamInvitation) => inv.status === 'ACTIVE' && Date.now() <= inv.expiresAt);

    return active.length > 0 ? active[0] : null;
  }

  async getActiveInvitationForCoordinator(stateTeamId: string): Promise<StateTeamInvitation | null> {
    const db = await this.getDb();
    const snap = await db.collection(STATE_TEAM_INVITATIONS_COLLECTION)
      .where('stateTeamId', '==', stateTeamId)
      .get();

    const active = (snap.docs || [])
      .map((d: any) => d.data() as StateTeamInvitation)
      .filter((inv: StateTeamInvitation) => inv.status === 'ACTIVE' && Date.now() <= inv.expiresAt);

    return active.length > 0 ? active[0] : null;
  }

  async listInvitationsForState(state: string): Promise<StateTeamInvitation[]> {
    const db = await this.getDb();
    const norm = state.toUpperCase().trim();
    const snap = await db.collection(STATE_TEAM_INVITATIONS_COLLECTION)
      .where('state', '==', norm)
      .get();

    return (snap.docs || []).map((d: any) => d.data() as StateTeamInvitation);
  }

  async rotateInvitation(currentInvitationId: string, newSalt: string, newVerifier: string): Promise<StateTeamInvitation> {
    const db = await this.getDb();
    const current = await this.getInvitationById(currentInvitationId);
    if (!current) throw new Error('Current invitation not found');

    await this.revokeInvitation(currentInvitationId);
    return await this.createInvitation({
      stateTeamId: current.stateTeamId,
      state: current.state,
      salt: newSalt,
      verifier: newVerifier,
      maxRedemptions: current.maxRedemptions,
      expiresAt: current.expiresAt,
    });
  }

  async revokeInvitation(invitationId: string): Promise<boolean> {
    const db = await this.getDb();
    const snap = await db.collection(STATE_TEAM_INVITATIONS_COLLECTION).doc(invitationId).get();
    if (!snap.exists) return false;
    await db.collection(STATE_TEAM_INVITATIONS_COLLECTION).doc(invitationId).set({
      ...snap.data(),
      status: 'REVOKED',
      updatedAt: Date.now(),
    });
    return true;
  }

  async findAndValidateInvitation(
    plainCode: string,
    state: string,
    now: number = Date.now()
  ): Promise<{
    valid: boolean;
    error?: string;
    statusCode: number;
    invitation?: StateTeamInvitation;
  }> {
    const db = await this.getDb();
    const normState = state.toUpperCase().trim();
    const snap = await db.collection(STATE_TEAM_INVITATIONS_COLLECTION)
      .where('state', '==', normState)
      .get();

    for (const d of snap.docs || []) {
      const inv = d.data() as StateTeamInvitation;
      if (inv.status !== 'ACTIVE') continue;

      if (now > inv.expiresAt) {
        await db.collection(STATE_TEAM_INVITATIONS_COLLECTION).doc(inv.id).set({
          ...inv,
          status: 'EXPIRED',
          updatedAt: now,
        });
        continue;
      }

      if (verifyInvitationCode(plainCode, inv.codeSalt, inv.codeVerifier)) {
        if (inv.redemptionCount >= inv.maxRedemptions) {
          return {
            valid: false,
            error: 'This invitation code has reached its maximum redemptions.',
            statusCode: 409,
          };
        }
        return {
          valid: true,
          statusCode: 200,
          invitation: inv,
        };
      }
    }

    return {
      valid: false,
      error: 'Invalid invitation code for this state.',
      statusCode: 401,
    };
  }

  async atomicRedeemInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    const db = await this.getDb();
    const docRef = db.collection(STATE_TEAM_INVITATIONS_COLLECTION).doc(invitationId);

    return await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) return { success: false, error: 'Invitation not found' };

      const inv = snap.data() as StateTeamInvitation;
      if (Date.now() > inv.expiresAt || inv.status === 'EXPIRED') {
        if (inv.status !== 'EXPIRED') {
          await transaction.set(docRef, { ...inv, status: 'EXPIRED', updatedAt: Date.now() });
        }
        return { success: false, error: 'Invitation has expired' };
      }
      if (inv.redemptionCount !== undefined && inv.maxRedemptions !== undefined && inv.redemptionCount >= inv.maxRedemptions) {
        return { success: false, error: 'This invitation code has been fully redeemed (maximum redemptions reached).' };
      }
      if (inv.status !== 'ACTIVE') return { success: false, error: 'Invitation is not active' };

      const nextRedemptions = (inv.redemptionCount || 0) + 1;

      await transaction.set(docRef, {
        ...inv,
        redemptionCount: nextRedemptions,
        updatedAt: Date.now(),
      });

      return { success: true };
    });
  }

  async redeemInvitation(invitationId: string, plainCode: string): Promise<{
    success: boolean;
    error?: string;
    statusCode: number;
    invitation?: StateTeamInvitation;
  }> {
    const db = await this.getDb();
    const docRef = db.collection(STATE_TEAM_INVITATIONS_COLLECTION).doc(invitationId);

    return await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        return { success: false, error: 'Invitation not found', statusCode: 404 };
      }

      const inv = snap.data() as StateTeamInvitation;
      if (Date.now() > inv.expiresAt || inv.status === 'EXPIRED') {
        if (inv.status !== 'EXPIRED') {
          await transaction.set(docRef, { ...inv, status: 'EXPIRED', updatedAt: Date.now() });
        }
        return { success: false, error: 'Invitation has expired', statusCode: 400 };
      }
      if (inv.status !== 'ACTIVE') {
        return { success: false, error: 'Invitation is not active', statusCode: 400 };
      }

      if (!verifyInvitationCode(plainCode, inv.codeSalt, inv.codeVerifier)) {
        return { success: false, error: 'Invalid invitation code', statusCode: 401 };
      }

      if (inv.redemptionCount >= inv.maxRedemptions) {
        return { success: false, error: 'Maximum redemptions exceeded', statusCode: 409 };
      }

      const nextRedemptions = (inv.redemptionCount || 0) + 1;
      const updatedInv: StateTeamInvitation = {
        ...inv,
        redemptionCount: nextRedemptions,
      };

      await transaction.set(docRef, {
        ...updatedInv,
        expiresAtDate: new Date(updatedInv.expiresAt),
      });

      return { success: true, statusCode: 200, invitation: updatedInv };
    });
  }

  // Field User Profiles
  async createFieldUserProfile(data: {
    googleSub: string;
    googleEmail: string;
    mobileNumber?: string;
    isMobileVerified?: boolean;
    firstName: string;
    lastName: string;
    assignedState: string;
    assignedDistrict: string;
    invitationId: string;
    srName?: string;
    ssrName?: string;
  }): Promise<FieldUserProfile> {
    const db = await this.getDb();
    const id = `fld_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const profile: FieldUserProfile = {
      id,
      googleSub: data.googleSub,
      googleEmail: data.googleEmail.toLowerCase().trim(),
      mobileNumber: data.mobileNumber ? data.mobileNumber.trim() : undefined,
      isMobileVerified: Boolean(data.isMobileVerified),
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      assignedState: canonicalizeStateName(data.assignedState) || data.assignedState.trim(),
      assignedDistrict: data.assignedDistrict.trim(),
      invitationId: data.invitationId,
      status: 'ACTIVE',
      srName: (data.srName || '').trim(),
      ssrName: (data.ssrName || '').trim(),
      createdAt: now,
      updatedAt: now,
    };

    const cleanProfile: Record<string, any> = { ...profile };
    Object.keys(cleanProfile).forEach((k) => {
      if (cleanProfile[k] === undefined) {
        delete cleanProfile[k];
      }
    });

    await db.collection(FIELD_USER_PROFILES_COLLECTION).doc(id).set(cleanProfile);
    return profile;
  }

  async listFieldUserProfiles(state?: string): Promise<FieldUserProfile[]> {
    const db = await this.getDb();
    if (!state || state === '*' || state.toUpperCase() === 'ALL') {
      const snap = await db.collection(FIELD_USER_PROFILES_COLLECTION).get();
      return snap.docs.map((d: any) => d.data() as FieldUserProfile);
    }
    const variants = getStateQueryVariants(state);
    try {
      const snap = await db.collection(FIELD_USER_PROFILES_COLLECTION)
        .where('assignedState', 'in', variants)
        .get();
      return snap.docs.map((d: any) => d.data() as FieldUserProfile);
    } catch {
      const snap = await db.collection(FIELD_USER_PROFILES_COLLECTION).get();
      return snap.docs
        .map((d: any) => d.data() as FieldUserProfile)
        .filter((p: FieldUserProfile) =>
          variants.some((v) => v.toLowerCase() === (p.assignedState || '').toLowerCase())
        );
    }
  }

  async getFieldUserProfileByGoogleSub(googleSub: string): Promise<FieldUserProfile | null> {
    const db = await this.getDb();
    const snap = await db.collection(FIELD_USER_PROFILES_COLLECTION)
      .where('googleSub', '==', googleSub)
      .get();
    if (!snap.docs || snap.docs.length === 0) return null;
    return snap.docs[0].data() as FieldUserProfile;
  }

  async getFieldUserProfileByEmail(googleEmail: string): Promise<FieldUserProfile | null> {
    const db = await this.getDb();
    const norm = googleEmail.toLowerCase().trim();
    // 1. Primary match: googleEmail
    let snap = await db.collection(FIELD_USER_PROFILES_COLLECTION)
      .where('googleEmail', '==', norm)
      .limit(1)
      .get();
    if (snap.docs && snap.docs.length > 0) {
      return snap.docs[0].data() as FieldUserProfile;
    }
    // 2. Secondary match: email
    snap = await db.collection(FIELD_USER_PROFILES_COLLECTION)
      .where('email', '==', norm)
      .limit(1)
      .get();
    if (snap.docs && snap.docs.length > 0) {
      return snap.docs[0].data() as FieldUserProfile;
    }
    // 3. Tertiary match: workEmail
    snap = await db.collection(FIELD_USER_PROFILES_COLLECTION)
      .where('workEmail', '==', norm)
      .limit(1)
      .get();
    if (snap.docs && snap.docs.length > 0) {
      return snap.docs[0].data() as FieldUserProfile;
    }
    return null;
  }

  async getFieldUserProfileByMobile(canonicalMobile: string): Promise<FieldUserProfile | null> {
    const db = await this.getDb();
    const norm = canonicalMobile.trim();
    const snap = await db.collection(FIELD_USER_PROFILES_COLLECTION)
      .where('mobileNumber', '==', norm)
      .limit(1)
      .get();
    if (!snap.docs || snap.docs.length === 0) return null;
    return snap.docs[0].data() as FieldUserProfile;
  }

  async getFieldUserProfileById(id: string): Promise<FieldUserProfile | null> {
    const db = await this.getDb();
    const snap = await db.collection(FIELD_USER_PROFILES_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as FieldUserProfile;
  }

  async updateFieldUserProfile(
    id: string,
    updates: Partial<Omit<FieldUserProfile, 'id' | 'googleSub' | 'createdAt'>>
  ): Promise<FieldUserProfile | null> {
    const db = await this.getDb();
    const snap = await db.collection(FIELD_USER_PROFILES_COLLECTION).doc(id).get();
    if (!snap.exists) return null;

    const current = snap.data() as FieldUserProfile;
    const updated: FieldUserProfile = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    };

    const cleanUpdated: Record<string, any> = { ...updated };
    Object.keys(cleanUpdated).forEach((k) => {
      if (cleanUpdated[k] === undefined) {
        delete cleanUpdated[k];
      }
    });

    await db.collection(FIELD_USER_PROFILES_COLLECTION).doc(id).set(cleanUpdated);
    return updated;
  }
}

let globalOnboardingStore: OnboardingStore | null = null;

export function getOnboardingStore(): OnboardingStore {
  if (globalOnboardingStore) {
    return globalOnboardingStore;
  }

  const isProductionOrStaging =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.APP_ENV === 'production' ||
    (process.env.NODE_ENV as string) === 'staging' ||
    process.env.APP_ENV === 'staging';

  if (isProductionOrStaging && process.env.FORCE_MEMORY_STORE) {
    throw new Error('[ONBOARDING_STORE:FATAL] FORCE_MEMORY_STORE is strictly forbidden in production and staging environments.');
  }

  const dataEngine = (process.env.DATA_ENGINE || 'sheets').toLowerCase().trim();
  if (dataEngine === 'firestore' || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT) {
    const store = new FirestoreOnboardingStore();
    globalOnboardingStore = store;
    return store;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const store = new SupabaseOnboardingStore(supabaseUrl, serviceRoleKey);
    globalOnboardingStore = store;
    return store;
  }

  if (isProductionOrStaging) {
    return new UnavailableOnboardingStore('Database credentials missing in production/staging. Onboarding store disabled.');
  }

  const mem = new MemoryOnboardingStore();
  globalOnboardingStore = mem;
  return mem;
}

export function setOnboardingStoreForTesting(store: OnboardingStore | null): void {
  globalOnboardingStore = store;
}

