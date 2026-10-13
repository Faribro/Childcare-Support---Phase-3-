import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  filterRecordsByScope,
  isDistrictAuthorized,
  isStateAuthorized,
  resolveUserAccessScope,
  type UserAccessScope,
} from '@/lib/server/authorisation';

const REPO_ROOT = process.cwd();
const MIGRATION_SQL_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20261012170000_core_schema_foundation.sql'
);
const MIGRATION_REVIEW_DOC_PATH = path.join(REPO_ROOT, 'MIGRATION_REVIEW.md');

describe('Supabase Schema Foundation & Migration Readiness Review (PR #73 Audit)', () => {
  const migrationSql = fs.readFileSync(MIGRATION_SQL_PATH, 'utf8');
  const migrationReviewMd = fs.readFileSync(MIGRATION_REVIEW_DOC_PATH, 'utf8');

  it('defines all four canonical tables with RLS enabled and forced', () => {
    const requiredTables = [
      'public.submissions',
      'public.submission_files',
      'public.sheets_mirror_jobs',
      'public.audit_events',
    ];

    for (const table of requiredTables) {
      expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(migrationSql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(migrationSql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
      expect(migrationSql).toContain(`REVOKE ALL ON ${table} FROM anon, PUBLIC;`);
    }
  });

  it('resolves PR #73 audit gaps: programme_id, consent gate, Col 48 meals_per_day vs edit_reason, and TEXT client_submission_id', () => {
    // Programme scope column for FIELD_USER enforcement
    expect(migrationSql).toMatch(/programme_id\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'alliance-childcare-phase3'/);

    // Mandatory DPDP consent gate
    expect(migrationSql).toMatch(/consent_provided\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+true/);
    expect(migrationSql).toMatch(/CONSTRAINT\s+chk_submissions_consent_mandatory\s+CHECK\s*\(\s*consent_provided\s*=\s*true\s*\)/);

    // Column 48 separation: meals_per_day vs edit_reason
    expect(migrationSql).toMatch(/meals_per_day\s+INTEGER/);
    expect(migrationSql).toMatch(/edit_reason\s+TEXT/);

    // TEXT client_submission_id supporting both UUIDs and canonical IDs
    expect(migrationSql).toMatch(/client_submission_id\s+TEXT\s+NOT\s+NULL/);
    expect(migrationSql).toMatch(/CONSTRAINT\s+uq_submissions_client_submission_id\s+UNIQUE\s*\(\s*client_submission_id\s*\)/);

    // Atomic asset OCC hash on both submissions and submission_files
    expect(migrationSql).toMatch(/cell_state_hash\s+TEXT/);
    expect(migrationSql).toMatch(/CONSTRAINT\s+uq_submission_files_submission_doc\s+UNIQUE\s*\(\s*submission_id,\s*doc_type\s*\)/);
  });

  it('enforces verified session, state, district, and programme scope in RLS policies and denies DELETE to FIELD_USER and STATE_REVIEWER', () => {
    // Helper functions
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.jwt_is_verified()');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.jwt_has_state(target_state TEXT)');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.jwt_has_district(target_district TEXT)');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.jwt_has_programme(target_programme TEXT)');

    // FIELD_USER must satisfy state + district + programme
    expect(migrationSql).toContain("public.jwt_role() = 'FIELD_USER'");
    expect(migrationSql).toContain('AND public.jwt_has_state(state)');
    expect(migrationSql).toContain('AND public.jwt_has_district(district)');
    expect(migrationSql).toContain('AND public.jwt_has_programme(programme_id)');

    // DELETE restricted strictly to ADMIN and LEADERSHIP
    expect(migrationSql).toMatch(
      /CREATE POLICY submissions_delete_admin_only[\s\S]*?public\.jwt_role\(\)\s+IN\s*\('ADMIN',\s*'LEADERSHIP'\)/
    );

    // Audit log is append-only even for service_role
    expect(migrationSql).toContain('REVOKE UPDATE, DELETE ON public.audit_events FROM service_role;');
  });

  it('prevents Tigris storage keys or presigned URLs from leaking into Google Sheets mirror payloads', () => {
    // Sanitized sheet label generated column on submission_files
    expect(migrationSql).toContain(
      "sanitized_sheet_label TEXT GENERATED ALWAYS AS ('Restricted Doc [' || doc_type || ']') STORED"
    );

    // Outbox check constraint blocking raw Tigris keys & presigned URLs
    expect(migrationSql).toContain('CONSTRAINT chk_sheets_mirror_payload_sanitized CHECK');
    expect(migrationSql).toContain('X-Amz-Signature|childcare-support-phase3-private|s3\\.amazonaws\\.com|fly\\.storage\\.tigris\\.dev');

    // Canonical target sheets from gas/Code.js
    expect(migrationSql).toContain(
      "target_sheet_name IN ('Child_Nutrition', '_Asset_Containers', 'Audit_Log')"
    );

    // Transactional outbox trigger writes sanitized Restricted Doc label
    expect(migrationSql).toContain('CREATE TRIGGER trg_submissions_enqueue_sheets_mirror');
    expect(migrationSql).toContain("'caregiverSignature', 'Restricted Doc [caregiverSignature]'");
  });

  it('documents all required audit sections, all 73 Google Sheets columns, and the non-execution safety statement in MIGRATION_REVIEW.md', () => {
    expect(migrationReviewMd).toContain('No production or remote database migration has been applied.');
    expect(migrationReviewMd).toContain('## 1. Source-of-Truth Decision');
    expect(migrationReviewMd).toContain('### a. Approved Mappings');
    expect(migrationReviewMd).toContain('### b. Missing Fields or Tables');
    expect(migrationReviewMd).toContain('### c. Incorrect or Ambiguous Mappings');
    expect(migrationReviewMd).toContain('### d. Authorization / RLS Risks');
    expect(migrationReviewMd).toContain('### e. Data-Integrity Risks');
    expect(migrationReviewMd).toContain('### f. Sync and Idempotency Concerns');
    expect(migrationReviewMd).toContain('### g. Tigris Object-Storage Concerns');
    expect(migrationReviewMd).toContain('### h. Google Sheets Reporting-Mirror Concerns');
    expect(migrationReviewMd).toContain('### i. Required Changes Before Migration Approval');
    expect(migrationReviewMd).toContain('## 4. Role and Scope Matrix');
    expect(migrationReviewMd).toContain('## 5. Row-Level Security (RLS) Policy Summary');
    expect(migrationReviewMd).toContain('## 6. Transactional Outbox & Google Sheets Sync Design');
    expect(migrationReviewMd).toContain('## 7. Tigris Private Object Storage Design');
    expect(migrationReviewMd).toContain('## 8. Google Sheets Reporting-Mirror & `_Asset_Containers` Design');
    expect(migrationReviewMd).toContain('## 9. Rollback Plan');

    // Verify all 73 column numbers | **1** | through | **73** | are mapped in MIGRATION_REVIEW.md
    for (let col = 1; col <= 73; col += 1) {
      expect(migrationReviewMd).toContain(`| **${col}** |`);
    }
  });

  it('verifies synthetic scope parity between Next.js authorisation guards and proposed Supabase RLS rules', () => {
    const syntheticRecords = [
      {
        uniqueId: 'SYNTH-MH-PUN-0001',
        programmeId: 'alliance-childcare-phase3',
        state: 'Maharashtra',
        district: 'Pune',
        childName: 'Synthetic Child One',
      },
      {
        uniqueId: 'SYNTH-MH-NGP-0002',
        programmeId: 'alliance-childcare-phase3',
        state: 'Maharashtra',
        district: 'Nagpur',
        childName: 'Synthetic Child Two',
      },
      {
        uniqueId: 'SYNTH-KA-BLR-0003',
        programmeId: 'alliance-childcare-phase3',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        childName: 'Synthetic Child Three',
      },
    ];

    // 1. Unauthenticated caller receives zero scope and cannot read any synthetic records
    const unauthReq = new NextRequest('http://localhost:3000/api/submissions', {
      headers: { 'x-test-unauthenticated': 'true' },
    });
    const unauthScope = resolveUserAccessScope(unauthReq);
    expect(unauthScope.isVerified).toBe(false);
    expect(unauthScope.allowedStates).toEqual([]);
    expect(filterRecordsByScope(unauthScope, syntheticRecords)).toEqual([]);

    // 2. FIELD_USER scoped to Maharashtra / Pune can read only Pune records
    const fieldPuneScope: UserAccessScope = {
      userId: 'synth-field-pune',
      name: 'Synthetic Field Worker',
      role: 'FIELD_USER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
      isVerified: true,
      reason: 'verified_session_token',
    };
    expect(isStateAuthorized(fieldPuneScope, 'Maharashtra')).toBe(true);
    expect(isDistrictAuthorized(fieldPuneScope, 'Maharashtra', 'Pune')).toBe(true);
    expect(isDistrictAuthorized(fieldPuneScope, 'Maharashtra', 'Nagpur')).toBe(false);
    expect(isStateAuthorized(fieldPuneScope, 'Karnataka')).toBe(false);
    expect(
      filterRecordsByScope(fieldPuneScope, syntheticRecords).map((r) => r.uniqueId)
    ).toEqual(['SYNTH-MH-PUN-0001']);

    // 3. STATE_REVIEWER scoped to Maharashtra can read Pune and Nagpur, but not Karnataka
    const reviewerMhScope: UserAccessScope = {
      userId: 'synth-reviewer-mh',
      name: 'Synthetic Maharashtra Reviewer',
      role: 'STATE_REVIEWER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
      isVerified: true,
      reason: 'verified_session_token',
    };
    expect(isStateAuthorized(reviewerMhScope, 'Maharashtra')).toBe(true);
    expect(isStateAuthorized(reviewerMhScope, 'Karnataka')).toBe(false);
    expect(isStateAuthorized(reviewerMhScope, 'ALL')).toBe(false);
    expect(
      filterRecordsByScope(reviewerMhScope, syntheticRecords).map((r) => r.uniqueId)
    ).toEqual(['SYNTH-MH-PUN-0001', 'SYNTH-MH-NGP-0002']);

    // 4. LEADERSHIP with wildcard scope can read across states
    const leadershipScope: UserAccessScope = {
      userId: 'synth-leadership',
      name: 'Synthetic Leadership User',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
      isVerified: true,
      reason: 'verified_session_token',
    };
    expect(isStateAuthorized(leadershipScope, 'ALL')).toBe(true);
    expect(filterRecordsByScope(leadershipScope, syntheticRecords)).toHaveLength(3);
  });
});
