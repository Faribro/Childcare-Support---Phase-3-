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

export interface RateLimitStatus {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface OnboardingStore {
  // Rate Limiting
  checkRateLimit(key: string, now: number, maxAttempts: number, windowMs: number): Promise<RateLimitStatus>;

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
    firstName: string;
    lastName: string;
    assignedState: string;
    assignedDistrict: string;
    invitationId: string;
  }): Promise<FieldUserProfile>;
  getFieldUserProfileByGoogleSub(googleSub: string): Promise<FieldUserProfile | null>;
  getFieldUserProfileByEmail(googleEmail: string): Promise<FieldUserProfile | null>;
  getFieldUserProfileById(id: string): Promise<FieldUserProfile | null>;
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
      return {
        valid: false,
        error: 'Invalid invitation code or state mismatch. Please verify code.',
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
    firstName: string;
    lastName: string;
    assignedState: string;
    assignedDistrict: string;
    invitationId: string;
  }): Promise<FieldUserProfile> {
    const existing = await this.getFieldUserProfileByGoogleSub(data.googleSub);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const profile: FieldUserProfile = {
      id: crypto.randomUUID(),
      googleSub: data.googleSub,
      googleEmail: data.googleEmail.trim().toLowerCase(),
      firstName: data.firstName.trim(),
      lastName: (data.lastName || '').trim(),
      assignedState: data.assignedState.trim(),
      assignedDistrict: data.assignedDistrict.trim(),
      invitationId: data.invitationId,
      status: 'ACTIVE',
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
      if (p.googleEmail === norm) return p;
    }
    return null;
  }

  async getFieldUserProfileById(id: string): Promise<FieldUserProfile | null> {
    return this.fieldProfiles.get(id) || null;
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

  async checkRateLimit(): Promise<RateLimitStatus> { throw new Error(this.reason); }
  async createStateTeamRegistration(): Promise<StateTeamRegistration> { throw new Error(this.reason); }
  async getStateTeamRegistrationById(): Promise<StateTeamRegistration | null> { throw new Error(this.reason); }
  async getStateTeamRegistrationByEmail(): Promise<StateTeamRegistration | null> { throw new Error(this.reason); }
  async verifyStateTeamEmail(): Promise<boolean> { throw new Error(this.reason); }
  async approveStateTeamRegistration(): Promise<boolean> { throw new Error(this.reason); }
  async listStateTeamRegistrations(): Promise<StateTeamRegistration[]> { throw new Error(this.reason); }
  async createInvitation(): Promise<StateTeamInvitation> { throw new Error(this.reason); }
  async getInvitationById(): Promise<StateTeamInvitation | null> { throw new Error(this.reason); }
  async getActiveInvitationForState(): Promise<StateTeamInvitation | null> { throw new Error(this.reason); }
  async listInvitationsForState(): Promise<StateTeamInvitation[]> { throw new Error(this.reason); }
  async rotateInvitation(): Promise<StateTeamInvitation> { throw new Error(this.reason); }
  async revokeInvitation(): Promise<boolean> { throw new Error(this.reason); }
  async findAndValidateInvitation(): Promise<{ valid: boolean; error?: string; statusCode: number; invitation?: StateTeamInvitation }> { throw new Error(this.reason); }
  async atomicRedeemInvitation(): Promise<{ success: boolean; error?: string }> { throw new Error(this.reason); }
  async redeemInvitation(): Promise<{ success: boolean; error?: string; statusCode: number; invitation?: StateTeamInvitation }> { throw new Error(this.reason); }
  async createFieldUserProfile(): Promise<FieldUserProfile> { throw new Error(this.reason); }
  async getFieldUserProfileByGoogleSub(): Promise<FieldUserProfile | null> { throw new Error(this.reason); }
  async getFieldUserProfileByEmail(): Promise<FieldUserProfile | null> { throw new Error(this.reason); }
  async getFieldUserProfileById(): Promise<FieldUserProfile | null> { throw new Error(this.reason); }
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

  async createStateTeamRegistration(data: {
    firstName: string;
    lastName: string;
    workEmail: string;
    requestedState: string;
    organization: string;
    autoApprove?: boolean;
    notes?: string;
  }): Promise<StateTeamRegistration> {
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
        status: data.autoApprove ? 'APPROVED' : 'PENDING',
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
      status: row.status,
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
      status: row.status,
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
      status: row.status,
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
      status: row.status,
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
      return { valid: false, error: 'Invalid invitation code or state mismatch. Please verify code.', statusCode: 400 };
    }
    if (match.status === 'REVOKED') {
      return { valid: false, error: 'This invitation code has been revoked by the state administrator.', statusCode: 403 };
    }
    if (match.status === 'ROTATED') {
      return { valid: false, error: 'This invitation code has been rotated. Please obtain the new code from your state coordinator.', statusCode: 403 };
    }
    if (match.status === 'EXPIRED' || match.expiresAt <= now) {
      return { valid: false, error: 'This invitation code has expired. Please request a new code from your state coordinator.', statusCode: 403 };
    }
    if (match.redemptionCount >= match.maxRedemptions) {
      return { valid: false, error: 'This invitation code has reached its maximum authorized redemption limit.', statusCode: 429 };
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
    firstName: string;
    lastName: string;
    assignedState: string;
    assignedDistrict: string;
    invitationId: string;
  }): Promise<FieldUserProfile> {
    const url = `${this.baseUrl}/rest/v1/field_user_profiles`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        google_sub: data.googleSub.trim(),
        google_email: data.googleEmail.trim().toLowerCase(),
        first_name: data.firstName.trim(),
        last_name: (data.lastName || '').trim(),
        assigned_state: data.assignedState.trim(),
        assigned_district: data.assignedDistrict.trim(),
        invitation_id: data.invitationId,
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
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
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

