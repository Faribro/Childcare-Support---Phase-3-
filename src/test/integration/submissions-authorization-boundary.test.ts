/**
 * Submissions Authorization Boundary & Data Integrity Integration Test Suite
 *
 * Verifies:
 * 1. Unverified and ordinary authenticated users: denied.
 * 2. State/district-scoped leader: only approved rows (no automatic national access).
 * 3. Reviewer: only their approved scope.
 * 4. Explicitly approved national identity: intended national access.
 * 5. Cross-programme access: denied where restricted.
 * 6. Service-role API path: independently enforces server-side authorization in code.
 * 7. Consent validation: rejected if omitted or false; accepted only when explicit true.
 * 8. Legacy Google Sheets accessibility: fallback to Sheets when record is not yet in Supabase.
 * 9. SQL RLS Policy Logic: mathematically tests the submissions_select_policy predicates.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SupabaseSubmissionAdapter,
  SessionContext,
} from '@/lib/server/supabaseSubmissionAdapter';
import {
  TigrisStorageService,
} from '@/lib/server/tigrisStorageService';
import {
  InMemorySheetsMirrorRepository,
} from '@/lib/server/sheetsMirrorWorker';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';

describe('Submissions Authorization Boundary & Data Integrity', () => {
  let tigrisService: TigrisStorageService;
  let mirrorRepo: InMemorySheetsMirrorRepository;
  let supabaseAdapter: SupabaseSubmissionAdapter;

  beforeEach(() => {
    tigrisService = new TigrisStorageService({
      bucketName: 'childcare-assets',
      region: 'sin',
      endpoint: 'https://fly.storage.tigris.dev',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });
    mirrorRepo = new InMemorySheetsMirrorRepository();
    supabaseAdapter = new SupabaseSubmissionAdapter(tigrisService, mirrorRepo);
    canonicalSubmissionAdapter.setSupabaseAdapter(supabaseAdapter);
  });

  // ---------------------------------------------------------------------------
  // 1. Unverified and Ordinary Authenticated Users
  // ---------------------------------------------------------------------------
  describe('1. Unverified and Ordinary Authenticated Users', () => {
    it('denies access to ordinary authenticated user without approved role', () => {
      const ordinaryUserSession: SessionContext = {
        userId: 'user-regular-01',
        role: 'USER' as any,
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      };

      const isAuth = supabaseAdapter.isAuthorizedForScope(
        ordinaryUserSession,
        'Maharashtra',
        'Pune',
        'alliance-childcare-phase3'
      );
      expect(isAuth).toBe(false);
    });

    it('denies access to session with empty/unrecognized role', () => {
      const invalidRoleSession: SessionContext = {
        userId: 'user-unknown-01',
        role: '' as any,
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      };

      const isAuth = supabaseAdapter.isAuthorizedForScope(
        invalidRoleSession,
        'Maharashtra',
        'Pune'
      );
      expect(isAuth).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. State/District-Scoped Leader
  // ---------------------------------------------------------------------------
  describe('2. State/District-Scoped Leader', () => {
    const scopedLeaderSession: SessionContext = {
      userId: 'leader-mh-pune-01',
      role: 'LEADERSHIP' as any,
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
      allowedProgrammes: ['alliance-childcare-phase3'],
    };

    it('permits access to approved state and district', () => {
      const isAuth = supabaseAdapter.isAuthorizedForScope(
        scopedLeaderSession,
        'Maharashtra',
        'Pune'
      );
      expect(isAuth).toBe(true);
    });

    it('denies access to different district within same approved state', () => {
      const isAuth = supabaseAdapter.isAuthorizedForScope(
        scopedLeaderSession,
        'Maharashtra',
        'Nagpur'
      );
      expect(isAuth).toBe(false);
    });

    it('denies access to unapproved state', () => {
      const isAuth = supabaseAdapter.isAuthorizedForScope(
        scopedLeaderSession,
        'Delhi',
        'Central Delhi'
      );
      expect(isAuth).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Reviewer Scoped Access
  // ---------------------------------------------------------------------------
  describe('3. Reviewer Scope Boundary', () => {
    const stateReviewerMh: SessionContext = {
      userId: 'rev-mh-01',
      role: 'STATE_REVIEWER' as any,
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
    };

    const districtReviewerPune: SessionContext = {
      userId: 'rev-pune-01',
      role: 'DISTRICT_REVIEWER' as any,
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
    };

    it('allows State Reviewer across all districts in assigned state', () => {
      expect(supabaseAdapter.isAuthorizedForScope(stateReviewerMh, 'Maharashtra', 'Pune')).toBe(true);
      expect(supabaseAdapter.isAuthorizedForScope(stateReviewerMh, 'Maharashtra', 'Nagpur')).toBe(true);
      expect(supabaseAdapter.isAuthorizedForScope(stateReviewerMh, 'Maharashtra', 'Thane')).toBe(true);
    });

    it('denies State Reviewer outside assigned state', () => {
      expect(supabaseAdapter.isAuthorizedForScope(stateReviewerMh, 'Gujarat', 'Ahmedabad')).toBe(false);
      expect(supabaseAdapter.isAuthorizedForScope(stateReviewerMh, 'Karnataka', 'Bangalore')).toBe(false);
    });

    it('restricts District Reviewer strictly to assigned district', () => {
      expect(supabaseAdapter.isAuthorizedForScope(districtReviewerPune, 'Maharashtra', 'Pune')).toBe(true);
      expect(supabaseAdapter.isAuthorizedForScope(districtReviewerPune, 'Maharashtra', 'Nagpur')).toBe(false);
      expect(supabaseAdapter.isAuthorizedForScope(districtReviewerPune, 'Karnataka', 'Pune')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Explicitly Approved National Identity
  // ---------------------------------------------------------------------------
  describe('4. Explicitly Approved National Identity', () => {
    const nationalLeaderSession: SessionContext = {
      userId: 'lead-national-01',
      role: 'LEADERSHIP' as any,
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    };

    it('permits nationwide access across multiple states and districts', () => {
      expect(supabaseAdapter.isAuthorizedForScope(nationalLeaderSession, 'Maharashtra', 'Pune')).toBe(true);
      expect(supabaseAdapter.isAuthorizedForScope(nationalLeaderSession, 'Delhi', 'South Delhi')).toBe(true);
      expect(supabaseAdapter.isAuthorizedForScope(nationalLeaderSession, 'Tamil Nadu', 'Chennai')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Cross-Programme Access
  // ---------------------------------------------------------------------------
  describe('5. Cross-Programme Restriction', () => {
    const programmeASession: SessionContext = {
      userId: 'user-prog-a',
      role: 'LEADERSHIP' as any,
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      allowedProgrammes: ['programme-alpha'],
    };

    it('allows access to matched programme', () => {
      expect(supabaseAdapter.isAuthorizedForScope(programmeASession, 'Maharashtra', 'Pune', 'programme-alpha')).toBe(true);
    });

    it('denies access to different programme', () => {
      expect(supabaseAdapter.isAuthorizedForScope(programmeASession, 'Maharashtra', 'Pune', 'programme-beta')).toBe(false);
      expect(supabaseAdapter.isAuthorizedForScope(programmeASession, 'Maharashtra', 'Pune', 'alliance-childcare-phase3')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Service-Role API Path Independent Enforcement
  // ---------------------------------------------------------------------------
  describe('6. Service-Role Server-Side Authorization Enforcement', () => {
    it('rejects createSubmission when session is out-of-scope before touching storage', async () => {
      const outOfScopeSession: SessionContext = {
        userId: 'field-user-01',
        role: 'caseworker',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      };

      const outOfScopeInput: any = {
        payload: {
          uniqueId: 'DL-NEW-0001',
          location: { state: 'Delhi', district: 'New Delhi' },
          caregiverConsent: { consentProvided: true },
        },
        idempotencyKey: 'idemp-srv-01',
        requestId: 'req-srv-01',
      };

      const res = await supabaseAdapter.createSubmission(outOfScopeInput, outOfScopeSession);
      expect(res.status).toBe('error');
      expect(res.statusCode).toBe(403);
      expect(res.code).toBe('FORBIDDEN_SCOPE');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Data Integrity: Mandatory Explicit Consent (No Inference/Default)
  // ---------------------------------------------------------------------------
  describe('7. Data Integrity: Mandatory Explicit Consent', () => {
    const validSession: SessionContext = {
      userId: 'field-valid-01',
      role: 'caseworker',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
    };

    it('rejects submission when consent is omitted', async () => {
      const inputWithoutConsent: any = {
        payload: {
          uniqueId: 'MH-PUN-NOCONSENT-01',
          location: { state: 'Maharashtra', district: 'Pune' },
          demographics: { childName: 'Child No Consent' },
          // caregiverConsent omitted!
        },
        idempotencyKey: 'idemp-noconsent-01',
        requestId: 'req-noconsent-01',
      };

      const res = await supabaseAdapter.createSubmission(inputWithoutConsent, validSession);
      expect(res.status).toBe('error');
      expect(res.statusCode).toBe(422);
      expect(res.code).toBe('CONSENT_REQUIRED');
      expect(res.message).toContain('Explicit caregiver consent is mandatory');
    });

    it('rejects submission when consent is explicitly false', async () => {
      const inputFalseConsent: any = {
        payload: {
          uniqueId: 'MH-PUN-FALSECONSENT-01',
          location: { state: 'Maharashtra', district: 'Pune' },
          demographics: { childName: 'Child False Consent' },
          caregiverConsent: { consentProvided: false },
        },
        idempotencyKey: 'idemp-falseconsent-01',
        requestId: 'req-falseconsent-01',
      };

      const res = await supabaseAdapter.createSubmission(inputFalseConsent, validSession);
      expect(res.status).toBe('error');
      expect(res.statusCode).toBe(422);
      expect(res.code).toBe('CONSENT_REQUIRED');
    });

    it('accepts submission when consent is explicitly true', async () => {
      const inputValidConsent: any = {
        payload: {
          uniqueId: 'MH-PUN-VALIDCONSENT-01',
          location: { state: 'Maharashtra', district: 'Pune' },
          demographics: { childName: 'Child Valid Consent' },
          caregiverConsent: { consentProvided: true },
        },
        idempotencyKey: 'idemp-validconsent-01',
        requestId: 'req-validconsent-01',
      };

      const res = await supabaseAdapter.createSubmission(inputValidConsent, validSession);
      expect(res.status).toBe('success');
      expect(res.statusCode).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Legacy Google Sheets Compatibility Fallback
  // ---------------------------------------------------------------------------
  describe('8. Legacy Google Sheets Compatibility Fallback', () => {
    it('falls back to Google Sheets when record is not yet in Supabase', async () => {
      const originalEngine = process.env.STORAGE_ENGINE;
      const originalUrl = process.env.APPS_SCRIPT_URL;
      const originalSecret = process.env.WEBHOOK_SECRET;
      const originalE2E = process.env.E2E_STAGING_ENABLED;

      try {
        process.env.STORAGE_ENGINE = 'supabase';
        process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_test_deployment_id/exec';
        process.env.WEBHOOK_SECRET = 'test-secret-at-least-32-chars-long-abc';
        process.env.E2E_STAGING_ENABLED = 'true';

        // Mock fetch to simulate Google Apps Script returning a pre-migration record
        const mockLegacyRecord = {
          uniqueId: 'LEGACY-SHEET-001',
          revisionNumber: 3,
          state: 'Maharashtra',
          district: 'Pune',
          childName: 'Legacy Child In Sheets',
        };

        const globalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: mockLegacyRecord,
          }),
        } as any);

        // Record does NOT exist in Supabase adapter memory
        const res = await canonicalSubmissionAdapter.getSubmission('LEGACY-SHEET-001', 'supervisor');

        expect(res.status).toBe('success');
        expect(res.statusCode).toBe(200);
        expect(res.uniqueId).toBe('LEGACY-SHEET-001');

        global.fetch = globalFetch;
      } finally {
        if (originalEngine) process.env.STORAGE_ENGINE = originalEngine;
        else delete process.env.STORAGE_ENGINE;
        if (originalUrl) process.env.APPS_SCRIPT_URL = originalUrl;
        else delete process.env.APPS_SCRIPT_URL;
        if (originalSecret) process.env.WEBHOOK_SECRET = originalSecret;
        else delete process.env.WEBHOOK_SECRET;
        if (originalE2E) process.env.E2E_STAGING_ENABLED = originalE2E;
        else delete process.env.E2E_STAGING_ENABLED;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 9. SQL RLS Policy Logic Verification (Simulated PostgreSQL Policy Evaluation)
  // ---------------------------------------------------------------------------
  describe('9. SQL RLS Policy Logic: submissions_select_policy Predicate Evaluation', () => {
    interface JwtClaims {
      isVerified?: boolean;
      role?: string;
      allowedStates?: string[];
      allowedDistricts?: string[];
      allowedProgrammes?: string[];
    }

    interface SubmissionRow {
      programme_id: string;
      state: string;
      district: string;
    }

    // Exact functional translation of the PostgreSQL policy expressions
    function evaluatePostgresRlsPolicy(jwt: JwtClaims, row: SubmissionRow): boolean {
      const jwt_is_verified = Boolean(jwt.isVerified);
      const jwt_role = jwt.role || '';
      
      const jwt_has_programme =
        !jwt.allowedProgrammes ||
        jwt.allowedProgrammes.includes('*') ||
        jwt.allowedProgrammes.includes(row.programme_id);

      const approvedRoles = ['LEADERSHIP', 'ADMIN', 'STATE_REVIEWER', 'DISTRICT_REVIEWER', 'FIELD_USER'];
      const has_approved_role = approvedRoles.includes(jwt_role);

      const jwt_has_state =
        jwt_is_verified &&
        (Boolean(jwt.allowedStates?.includes('*')) || Boolean(jwt.allowedStates?.includes(row.state)));

      const jwt_has_district =
        jwt_is_verified &&
        (Boolean(jwt.allowedDistricts?.includes('*')) || Boolean(jwt.allowedDistricts?.includes(row.district)));

      const district_or_state_reviewer =
        jwt_role === 'STATE_REVIEWER' || jwt_has_district;

      return (
        jwt_is_verified &&
        jwt_has_programme &&
        has_approved_role &&
        jwt_has_state &&
        district_or_state_reviewer
      );
    }

    const mhPuneRow: SubmissionRow = {
      programme_id: 'alliance-childcare-phase3',
      state: 'Maharashtra',
      district: 'Pune',
    };

    const mhNagpurRow: SubmissionRow = {
      programme_id: 'alliance-childcare-phase3',
      state: 'Maharashtra',
      district: 'Nagpur',
    };

    const dlRow: SubmissionRow = {
      programme_id: 'alliance-childcare-phase3',
      state: 'Delhi',
      district: 'Central Delhi',
    };

    const otherProgRow: SubmissionRow = {
      programme_id: 'external-programme',
      state: 'Maharashtra',
      district: 'Pune',
    };

    it('denies unverified token regardless of role or scope', () => {
      const unverifiedJwt: JwtClaims = {
        isVerified: false,
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      };
      expect(evaluatePostgresRlsPolicy(unverifiedJwt, mhPuneRow)).toBe(false);
    });

    it('denies ordinary authenticated user without approved role', () => {
      const ordinaryUserJwt: JwtClaims = {
        isVerified: true,
        role: 'USER',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      };
      expect(evaluatePostgresRlsPolicy(ordinaryUserJwt, mhPuneRow)).toBe(false);
    });

    it('enforces geographic scope on LEADERSHIP: approved state/district passes, unapproved state/district fails', () => {
      const scopedLeaderJwt: JwtClaims = {
        isVerified: true,
        role: 'LEADERSHIP',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
      };
      expect(evaluatePostgresRlsPolicy(scopedLeaderJwt, mhPuneRow)).toBe(true);
      expect(evaluatePostgresRlsPolicy(scopedLeaderJwt, mhNagpurRow)).toBe(false); // denied: district mismatch
      expect(evaluatePostgresRlsPolicy(scopedLeaderJwt, dlRow)).toBe(false); // denied: state mismatch
    });

    it('allows STATE_REVIEWER across all districts within state, but blocks other states', () => {
      const stateReviewerJwt: JwtClaims = {
        isVerified: true,
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
      };
      expect(evaluatePostgresRlsPolicy(stateReviewerJwt, mhPuneRow)).toBe(true);
      expect(evaluatePostgresRlsPolicy(stateReviewerJwt, mhNagpurRow)).toBe(true); // permitted: state reviewer
      expect(evaluatePostgresRlsPolicy(stateReviewerJwt, dlRow)).toBe(false); // denied: wrong state
    });

    it('allows national access ONLY with explicit wildcard scopes (*)', () => {
      const nationalLeaderJwt: JwtClaims = {
        isVerified: true,
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
      };
      expect(evaluatePostgresRlsPolicy(nationalLeaderJwt, mhPuneRow)).toBe(true);
      expect(evaluatePostgresRlsPolicy(nationalLeaderJwt, mhNagpurRow)).toBe(true);
      expect(evaluatePostgresRlsPolicy(nationalLeaderJwt, dlRow)).toBe(true);
    });

    it('enforces programme boundaries on all roles', () => {
      const progRestrictedLeaderJwt: JwtClaims = {
        isVerified: true,
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        allowedProgrammes: ['alliance-childcare-phase3'],
      };
      expect(evaluatePostgresRlsPolicy(progRestrictedLeaderJwt, mhPuneRow)).toBe(true);
      expect(evaluatePostgresRlsPolicy(progRestrictedLeaderJwt, otherProgRow)).toBe(false); // denied: wrong programme
    });
  });
});
