/**
 * READ-ONLY Submission Ownership Audit & Dry-Run Linking Tool
 *
 * PURPOSE:
 * Analyzes existing records in the submissions store to identify:
 * 1. Records with canonical immutable authorId (Compliant)
 * 2. Records with legacy authenticated email (Linkable via registered profile)
 * 3. Records with only ambiguous display names (FLAGGED - MUST NOT AUTO-ASSIGN)
 * 4. Orphaned/unattributed records
 *
 * SAFETY GUARD:
 * This script is STRICTLY READ-ONLY. It executes zero write, update, or delete operations.
 * Live data backfills require explicit leadership authorization.
 *
 * USAGE:
 * npx tsx scripts/audit-submission-ownership.ts [--env=staging|local]
 */

import { Firestore } from '@google-cloud/firestore';
import * as fs from 'fs';
import * as path from 'path';

export interface AuditRecordSummary {
  submissionId: string;
  artNumber?: string;
  state?: string;
  district?: string;
  authorId?: string;
  submittedByWorkerId?: string;
  authorName?: string;
  interviewerName?: string;
  email?: string;
  status?: string;
  classification: 'EXPLICIT_IMMUTABLE_OWNER' | 'LEGACY_EMAIL_LINKABLE' | 'AMBIGUOUS_NAME_ONLY' | 'ORPHAN_UNATTRIBUTED';
  flagReason?: string;
  recommendedAction: string;
}

export interface AuditReport {
  timestamp: string;
  environment: string;
  databaseId: string;
  totalRecordsScanned: number;
  breakdown: {
    explicitImmutableOwnerCount: number;
    legacyEmailLinkableCount: number;
    ambiguousNameOnlyCount: number;
    orphanUnattributedCount: number;
  };
  flaggedRecords: AuditRecordSummary[];
  complianceRate: string;
}

export async function runSubmissionOwnershipAudit(options?: {
  env?: string;
  databaseId?: string;
  projectId?: string;
  inMemoryRecords?: any[];
  inMemoryProfiles?: any[];
}): Promise<AuditReport> {
  const env = options?.env || process.env.APP_ENV || 'local';
  const databaseId = options?.databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)';
  const projectId = options?.projectId || process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production';

  console.log(`\n======================================================`);
  console.log(`SUBMISSION OWNERSHIP AUDIT (READ-ONLY)`);
  console.log(`Environment: ${env} | Database: ${databaseId} | Project: ${projectId}`);
  console.log(`======================================================\n`);

  let submissions: any[] = [];
  let registeredProfiles: any[] = [];

  if (options?.inMemoryRecords) {
    submissions = options.inMemoryRecords;
    registeredProfiles = options.inMemoryProfiles || [];
  } else if (env === 'staging' || env === 'production') {
    const db = new Firestore({ projectId, databaseId });
    console.log(`Fetching submissions from Firestore collection: submissions...`);
    const subSnapshot = await db.collection('submissions').get();
    submissions = subSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`Fetching field user profiles from Firestore collection: fieldUserProfiles...`);
    const profileSnapshot = await db.collection('fieldUserProfiles').get();
    registeredProfiles = profileSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } else {
    // Local fallback: use canonicalSubmissionAdapter or seed fixtures
    console.log(`Running in local/offline mode with mock data store.`);
    const { canonicalSubmissionAdapter } = await import('../src/lib/server/canonicalSubmissionAdapter');
    const result = await canonicalSubmissionAdapter.listSubmissions({ limit: 1000 });
    submissions = Array.isArray(result.data) ? result.data : (result.data?.records || []);
    registeredProfiles = [
      { id: 'worker-juli', firstName: 'Juli', lastName: 'Das', assignedState: 'West Bengal' },
      { id: 'worker-anil', firstName: 'Anil', lastName: 'Kumar', assignedState: 'Maharashtra' },
      { id: 'worker-pooja', firstName: 'Pooja', lastName: 'M', assignedState: 'Delhi' },
      { id: 'worker-suresh', firstName: 'Suresh', lastName: 'G', assignedState: 'Karnataka' },
      { id: 'worker-lakshmi', firstName: 'Lakshmi', lastName: 'R', assignedState: 'Tamil Nadu' },
    ];
  }

  console.log(`Scanned ${submissions.length} submissions against ${registeredProfiles.length} registered profiles.\n`);

  // Build name lookup map to detect ambiguous duplicates
  const nameToProfilesMap = new Map<string, any[]>();
  const emailToProfileMap = new Map<string, any>();

  for (const p of registeredProfiles) {
    const fullName = `${p.firstName || ''} ${p.lastName || ''}`.trim().toLowerCase();
    if (fullName) {
      const list = nameToProfilesMap.get(fullName) || [];
      list.push(p);
      nameToProfilesMap.set(fullName, list);
    }
    const email = (p.googleEmail || p.email || '').trim().toLowerCase();
    if (email) {
      emailToProfileMap.set(email, p);
    }
  }

  const summaries: AuditRecordSummary[] = [];

  for (const s of submissions) {
    const subId = s.id || s.submissionId || s.clientSubmissionId || 'UNKNOWN';
    const artNumber = s.artNumber || s.demographics?.artNumber || s.uniqueId;
    const state = s.state || s.demographics?.state;
    const district = s.district || s.demographics?.district;
    const authorId = s.authorId || s.submittedByWorkerId || s.authorIdentifier;
    const authorName = s.authorName || s.interviewerName || s.declaration?.caseworkerName;
    const email = s.userEmail || s.googleEmail || s.submittedByEmail;
    const status = s.approvedAllianceIndia || s.status || 'Pending';

    let classification: AuditRecordSummary['classification'];
    let flagReason: string | undefined;
    let recommendedAction: string;

    if (authorId && typeof authorId === 'string' && authorId.trim().length > 0) {
      classification = 'EXPLICIT_IMMUTABLE_OWNER';
      recommendedAction = 'Compliant: Immutable owner ID confirmed. No modification needed.';
    } else if (email && emailToProfileMap.has(email.trim().toLowerCase())) {
      classification = 'LEGACY_EMAIL_LINKABLE';
      const matchedProfile = emailToProfileMap.get(email.trim().toLowerCase());
      recommendedAction = `Linkable: Authenticated email '${email}' matches registered profile '${matchedProfile.id}'. Candidate for approved backfill.`;
    } else if (authorName && authorName.trim().length > 0) {
      classification = 'AMBIGUOUS_NAME_ONLY';
      const normName = authorName.trim().toLowerCase();
      const candidates = nameToProfilesMap.get(normName) || [];
      if (candidates.length > 1) {
        flagReason = `Ambiguous: Multiple profiles (${candidates.length}) match name '${authorName}'. Collision risk.`;
      } else if (candidates.length === 1) {
        flagReason = `Unverified Name: Name matches single profile '${candidates[0].id}', but missing cryptographic or session attribution.`;
      } else {
        flagReason = `Unknown Name: Display name '${authorName}' does not match any registered field profile.`;
      }
      recommendedAction = 'FLAGGED: Display-name matching strictly prohibited. Manual administrative review required.';
    } else {
      classification = 'ORPHAN_UNATTRIBUTED';
      flagReason = 'Record has no author ID, authenticated email, or interviewer name.';
      recommendedAction = 'FLAGGED: Unattributed submission. Retain in state-wide pool under State Reviewer access.';
    }

    summaries.push({
      submissionId: subId,
      artNumber,
      state,
      district,
      authorId,
      submittedByWorkerId: s.submittedByWorkerId,
      authorName,
      interviewerName: s.interviewerName,
      email,
      status,
      classification,
      flagReason,
      recommendedAction,
    });
  }

  const explicitCount = summaries.filter(s => s.classification === 'EXPLICIT_IMMUTABLE_OWNER').length;
  const legacyEmailCount = summaries.filter(s => s.classification === 'LEGACY_EMAIL_LINKABLE').length;
  const ambiguousCount = summaries.filter(s => s.classification === 'AMBIGUOUS_NAME_ONLY').length;
  const orphanCount = summaries.filter(s => s.classification === 'ORPHAN_UNATTRIBUTED').length;

  const flagged = summaries.filter(s => s.classification === 'AMBIGUOUS_NAME_ONLY' || s.classification === 'ORPHAN_UNATTRIBUTED');
  const complianceRate = summaries.length > 0
    ? `${((explicitCount / summaries.length) * 100).toFixed(1)}%`
    : '100%';

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    environment: env,
    databaseId,
    totalRecordsScanned: summaries.length,
    breakdown: {
      explicitImmutableOwnerCount: explicitCount,
      legacyEmailLinkableCount: legacyEmailCount,
      ambiguousNameOnlyCount: ambiguousCount,
      orphanUnattributedCount: orphanCount,
    },
    flaggedRecords: flagged,
    complianceRate,
  };

  console.log('--- AUDIT SUMMARY REPORT ---');
  console.log(`Total Records Scanned:         ${report.totalRecordsScanned}`);
  console.log(`1. Explicit Immutable Owners:  ${explicitCount} (${complianceRate})`);
  console.log(`2. Legacy Email Linkable:      ${legacyEmailCount}`);
  console.log(`3. Ambiguous (Name Only):      ${ambiguousCount} [FLAGGED]`);
  console.log(`4. Orphan / Unattributed:      ${orphanCount} [FLAGGED]`);
  console.log('----------------------------\n');

  if (flagged.length > 0) {
    console.log(`WARNING: ${flagged.length} record(s) flagged for manual review:`);
    for (const f of flagged) {
      console.log(`- [${f.submissionId}] (${f.artNumber || 'No ART'}): ${f.flagReason} -> ${f.recommendedAction}`);
    }
    console.log('');
  } else {
    console.log('✓ All records possess unambiguous or immutable author attribution.\n');
  }

  return report;
}

// Direct execution entrypoint
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.endsWith('audit-submission-ownership.ts'))) {
  runSubmissionOwnershipAudit()
    .then((report) => {
      const outputPath = path.join(process.cwd(), 'ownership-audit-report.json');
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`✓ Audit report successfully written to: ${outputPath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('✗ Audit execution failed:', err);
      process.exit(1);
    });
}
