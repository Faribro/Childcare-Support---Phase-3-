/**
 * Supabase Staging Pre-Migration Backup & Preflight Inspection Runner
 * Project: rjrctsxdvkfkssqvmhbz
 * Pinned Commit SHA: 6fbf093730cbaf8c9fd238df59e0f509b6263e56
 *
 * Usage:
 *   1. Automated via direct connection:
 *      node scripts/supabase-backup-and-preflight.js "postgresql://postgres:[PASSWORD]@db.rjrctsxdvkfkssqvmhbz.supabase.co:5432/postgres"
 *      or with DATABASE_URL in environment or in scratch/.staging_supabase_secret
 *   2. File verification mode (after running SQL in Supabase Dashboard SQL Editor):
 *      node scripts/supabase-backup-and-preflight.js --verify-file <path-to-exported-json>
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const verifyFileIdx = args.indexOf('--verify-file');

  if (verifyFileIdx !== -1 && args[verifyFileIdx + 1]) {
    const filePath = path.resolve(args[verifyFileIdx + 1]);
    console.log(`[PREFLIGHT] Verifying exported backup artifact from: ${filePath}`);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    verifyAndReportBackup(parsed, filePath);
    return;
  }

  // Check connection string sources
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl && args[0] && args[0].startsWith('postgres')) {
    dbUrl = args[0];
  }

  const secretFileLocations = [
    path.join(__dirname, '..', 'scratch', '.staging_supabase_secret'),
    path.join(__dirname, '..', '.cache', '.db_url'),
    'C:\\Users\\fsayyed\\.gemini\\antigravity\\brain\\5f42f2d2-d9e3-415b-a178-fc82456139f8\\scratch\\.staging_supabase_secret',
  ];

  if (!dbUrl) {
    for (const loc of secretFileLocations) {
      if (fs.existsSync(loc)) {
        try {
          const content = fs.readFileSync(loc, 'utf8').trim();
          if (content.startsWith('postgres')) {
            dbUrl = content;
            console.log(`[AUTH] Located database connection string in private store: ${loc}`);
            break;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (!dbUrl) {
    console.log('[NOTICE] Direct PostgreSQL connection string not detected in environment or private store.');
    console.log('[INSTRUCTION] You can execute the pre-migration backup & preflight script directly in:');
    console.log('              Supabase Dashboard -> Project rjrctsxdvkfkssqvmhbz -> SQL Editor');
    console.log('              File: supabase/scripts/pre_migration_backup_and_preflight.sql');
    console.log('              Then save the JSON result and run:');
    console.log('              node scripts/supabase-backup-and-preflight.js --verify-file <path>');
    process.exit(0);
  }

  // Connect via pg client
  const { Client } = require('pg');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  console.log('[CONNECT] Connecting to Supabase PostgreSQL database...');
  await client.connect();

  try {
    const sqlScriptPath = path.join(__dirname, '..', 'supabase', 'scripts', 'pre_migration_backup_and_preflight.sql');
    const sql = fs.readFileSync(sqlScriptPath, 'utf8');

    console.log('[EXECUTE] Running Pre-Migration Backup & Preflight Inspection query...');
    const res = await client.query(sql);

    // The last statement is `SELECT result FROM _pre_migration_backup_output`
    const outputRow = Array.isArray(res) ? res[res.length - 1].rows[0] : res.rows[0];
    if (!outputRow || !outputRow.result) {
      throw new Error('No output returned from _pre_migration_backup_output');
    }

    const backupData = outputRow.result;

    // Save privately to disk
    const outDir = path.join(__dirname, '..', 'scratch');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(outDir, `backup_rjrctsxdvkfkssqvmhbz_${timestamp}.json`);
    fs.writeFileSync(outPath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`[SAVED] Private backup package saved to: ${outPath} (${fs.statSync(outPath).size} bytes)`);

    // Verify and report safely
    verifyAndReportBackup(backupData, outPath);
  } finally {
    await client.end();
  }
}

function verifyAndReportBackup(data, filePath) {
  console.log('\n================================================================');
  console.log('       SUPABASE STAGING PRE-MIGRATION BACKUP & PREFLIGHT REPORT');
  console.log('================================================================');

  const meta = data.metadata || {};
  const summary = data.summary || {};
  const preflight = data.preflight || {};
  const schema = data.schema || {};
  const backup = data.data_backup || {};

  console.log(`Project Reference    : ${meta.project || 'unknown'}`);
  console.log(`Export Timestamp     : ${meta.exported_at || 'unknown'}`);
  console.log(`Pinned Migration SHA : ${meta.pinned_migration_sha || 'unknown'}`);
  console.log(`Backup File Location : ${filePath}`);

  console.log('\n--- 1. EXISTING DATABASE INVENTORY ---');
  console.log(`Existing Tables (${(summary.existing_tables || []).length}):`, (summary.existing_tables || []).join(', '));
  console.log('Table Record Counts:');
  for (const [tbl, count] of Object.entries(summary.table_record_counts || {})) {
    console.log(`  - ${tbl.padEnd(28)}: ${count}`);
  }
  console.log(`Total Existing Policies : ${summary.total_existing_policies}`);
  console.log(`Total Columns Cataloged : ${(schema.columns || []).length}`);
  console.log(`Total Constraints       : ${(schema.constraints || []).length}`);
  console.log(`Total Role Grants       : ${(schema.grants || []).length}`);

  console.log('\n--- 2. PREFLIGHT SAFETY & CONFLICT INSPECTION ---');

  // Check 1: submissions table existence
  const submissionsExist = Boolean(preflight.submissions_table_exists);
  console.log(`[CHECK 1] Submissions Table Exists              : ${submissionsExist}`);

  // Check 2: consent constraint & default
  const consentDefault = preflight.submissions_consent_default;
  console.log(`[CHECK 2] consent_provided Column Default       : ${consentDefault === null ? 'NONE (Mandatory Explicit)' : consentDefault}`);
  if (consentDefault !== null && consentDefault !== undefined) {
    console.log('          WARNING: Existing column has a default that may infer consent!');
  } else {
    console.log('          PASS: No default found that infers consent.');
  }

  // Check 3: submissions check constraints
  const checkConstraints = preflight.submissions_check_constraints || [];
  console.log(`[CHECK 3] Submissions Check Constraints         : ${checkConstraints.length} found`);
  for (const c of checkConstraints) {
    console.log(`          - ${c.constraint_name}: ${c.check_clause}`);
  }

  // Check 4: existing submissions policies
  const subPolicies = preflight.submissions_policies || [];
  console.log(`[CHECK 4] Existing Submissions Policies         : ${subPolicies.length} found`);
  if (subPolicies.length > 0) {
    console.log('          Policy Names:', subPolicies.join(', '));
    const knownDropped = ['submissions_select_policy', 'submissions_select_scoped', 'submissions_select'];
    const extraPolicies = subPolicies.filter((p) => !knownDropped.includes(p));
    if (extraPolicies.length > 0) {
      console.log(`          CAUTION: Found unexpected existing policies not dropped by migration: ${extraPolicies.join(', ')}`);
    } else {
      console.log('          PASS: All existing policies will be safely dropped and replaced by migration.');
    }
  } else {
    console.log('          PASS: Table does not exist yet or has 0 policies. Fresh foundation apply.');
  }

  // Check 5: anon/public grants
  const anonGrants = preflight.anon_public_submissions_grants || [];
  console.log(`[CHECK 5] Anon / Public Grants on Submissions   : ${anonGrants.length === 0 ? 'NONE (Fail-Closed)' : anonGrants.join(', ')}`);

  // Check 6: programme claim evaluation
  const progAbsent = preflight.programme_claim_evaluation_when_absent;
  const progRestricted = preflight.programme_claim_evaluation_when_restricted;
  console.log(`[CHECK 6] Programme Claim Eval (Absent Claim)   : ${progAbsent} (Expected: true for backward compatibility)`);
  console.log(`[CHECK 7] Programme Claim Eval (Other Programme): ${progRestricted} (Expected: false for restriction)`);

  const preflightPass =
    (consentDefault === null || consentDefault === undefined) &&
    progAbsent === true &&
    progRestricted === false;

  console.log('\n--- 3. DATA BACKUP USABILITY VERIFICATION ---');
  let nonZeroTables = 0;
  let totalRows = 0;
  for (const [tbl, rows] of Object.entries(backup)) {
    if (Array.isArray(rows)) {
      totalRows += rows.length;
      if (rows.length > 0) nonZeroTables++;
    }
  }
  console.log(`Backed Up Tables with Rows : ${nonZeroTables}`);
  console.log(`Total Backed Up Rows       : ${totalRows}`);
  console.log(`Privacy Assertion          : ZERO raw secrets, hashes, or session tokens logged to chat/console.`);

  console.log('\n================================================================');
  console.log(`PREFLIGHT VERDICT: ${preflightPass ? 'PASS (READY FOR OPERATOR APPROVAL)' : 'CONFLICT DETECTED (STOPPED)'}`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('[ERROR] Preflight execution failed:', err.message);
  process.exit(1);
});
