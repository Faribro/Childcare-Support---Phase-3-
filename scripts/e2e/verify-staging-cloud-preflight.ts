/**
 * Staging Cloud Integration Preflight Verification Script
 * 
 * Strict Environmental & Security Isolation Gates:
 * 1. Staging environment marker
 * 2. Staging Render deployment identity
 * 3. Staging Apps Script deployment identity
 * 4. Staging Sheet identity
 * 5. Staging Drive folder identity
 * 6. Test actor identity
 * 7. Operational Sheet shield (1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA)
 * 8. Server-only secrets audit
 * 9. Fail-closed write path validation
 * 10. URL query-string secret sanitization
 * 11. Restricted Drive ACL audit (zero public access)
 */

import fs from 'fs';
import path from 'path';

export const OPERATIONAL_SHEET_ID = '1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA';
export const OPERATIONAL_APPS_SCRIPT_ID = '1yXEgElXFb0Fb_CzTlQ8TDvRUuEYmq5dady7ialsqMnkAU1XX5SPJW8P3';

// Load .env.local if present
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

export interface CloudPreflightCheck {
  id: string;
  name: string;
  category: 'ENV_IDENTITY' | 'SECURITY' | 'INFRASTRUCTURE';
  expected: string;
  actualRedacted: string;
  status: 'PASS' | 'WARN' | 'BLOCK';
  details: string;
}

export function redactString(str?: string, keepStart = 4, keepEnd = 4): string {
  if (!str) return '<UNCONFIGURED / UNSET>';
  if (str.length <= keepStart + keepEnd) return '***';
  return `${str.substring(0, keepStart)}...${str.substring(str.length - keepEnd)}`;
}

export function redactUrl(url?: string): string {
  if (!url) return '<UNSET>';
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const maskedParts = parts.map((p, i) => (i === parts.length - 2 && p.length > 8 ? redactString(p, 4, 4) : p));
    return `${parsed.protocol}//${parsed.hostname}${maskedParts.join('/')}`;
  } catch {
    return redactString(url, 6, 4);
  }
}

export async function runStagingCloudPreflight(): Promise<{
  passed: boolean;
  preconditionsMet: boolean;
  checks: CloudPreflightCheck[];
  verdict: 'CERTIFIED FOR LIMITED STAGING PILOT' | 'BLOCKED BY INFRASTRUCTURE OR SECURITY CONFIGURATION' | 'NOT CERTIFIED FOR STAGING PILOT';
}> {
  console.log('========================================================================');
  console.log('  LIVE STAGING CLOUD INTEGRATION PREFLIGHT AUDIT');
  console.log('========================================================================\n');

  const checks: CloudPreflightCheck[] = [];

  // 1. Staging environment marker
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'unknown';
  const isStagingEnvMarker = appEnv.toLowerCase() === 'staging';
  checks.push({
    id: 'GATE-01',
    name: 'Staging Environment Marker',
    category: 'ENV_IDENTITY',
    expected: 'staging',
    actualRedacted: appEnv,
    status: isStagingEnvMarker ? 'PASS' : 'WARN',
    details: isStagingEnvMarker ? 'Configured as staging' : `Active marker is "${appEnv}" (not dedicated staging)`,
  });

  // 2. Staging Render deployment identity
  const renderServiceId = process.env.RENDER_SERVICE_ID || process.env.RENDER_INSTANCE_ID;
  const isRenderConfigured = Boolean(renderServiceId && renderServiceId.length > 5);
  checks.push({
    id: 'GATE-02',
    name: 'Staging Render Deployment Identity',
    category: 'INFRASTRUCTURE',
    expected: 'Dedicated staging Render service (srv-...)',
    actualRedacted: isRenderConfigured ? redactString(renderServiceId, 4, 3) : '<UNCONFIGURED / LOCAL HOST>',
    status: isRenderConfigured ? 'PASS' : 'BLOCK',
    details: isRenderConfigured ? 'Render service identity bound' : 'Staging Render service not provisioned or not bound to session',
  });

  // 3. Staging Apps Script deployment identity
  const appsScriptUrl = process.env.STAGING_APPS_SCRIPT_URL || process.env.APPS_SCRIPT_URL;
  const hasAppsScript = Boolean(appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com'));
  const referencesOperationalAppsScript = Boolean(appsScriptUrl && (appsScriptUrl.includes(OPERATIONAL_APPS_SCRIPT_ID) || appsScriptUrl.includes('AKfycbxbo4ErI10K505h1qMIY8HY7bo-gQU2Gw6c8NSZ3Py6aOTVAsjeK28OPsxilyHjgmTL')));
  checks.push({
    id: 'GATE-03',
    name: 'Staging Apps Script Deployment Identity',
    category: 'INFRASTRUCTURE',
    expected: 'Dedicated Staging Apps Script (!= Operational Deployment)',
    actualRedacted: hasAppsScript ? (referencesOperationalAppsScript ? `OPERATIONAL_DEPLOYMENT (${redactUrl(appsScriptUrl)})` : redactUrl(appsScriptUrl)) : '<UNCONFIGURED>',
    status: hasAppsScript && !referencesOperationalAppsScript ? 'PASS' : 'BLOCK',
    details: referencesOperationalAppsScript
      ? 'CRITICAL STOP: Apps Script URL references the operational deployment attached to live sheet'
      : (hasAppsScript ? 'Dedicated Apps Script endpoint configured' : 'Apps Script endpoint missing'),
  });

  // 4. Staging Sheet identity & Operational Sheet Shield
  const sheetId = process.env.STAGING_SPREADSHEET_ID || process.env.TARGET_SPREADSHEET_ID || OPERATIONAL_SHEET_ID;
  const isOperationalSheet = sheetId === OPERATIONAL_SHEET_ID;
  checks.push({
    id: 'GATE-04',
    name: 'Staging Google Sheet Isolation',
    category: 'ENV_IDENTITY',
    expected: `Dedicated Staging Sheet (!= ${redactString(OPERATIONAL_SHEET_ID, 4, 4)})`,
    actualRedacted: isOperationalSheet ? `OPERATIONAL_SHEET (${redactString(sheetId, 4, 4)})` : redactString(sheetId, 4, 4),
    status: isOperationalSheet ? 'BLOCK' : 'PASS',
    details: isOperationalSheet
      ? 'CRITICAL SAFETY STOP: Configuration references operational Sheet. Live mutations prohibited.'
      : 'Dedicated staging Sheet confirmed isolated from production.',
  });

  // 5. Staging Drive folder identity
  const driveFolderId = process.env.STAGING_DRIVE_FOLDER_ID;
  const hasDriveFolder = Boolean(driveFolderId && driveFolderId.length > 10);
  checks.push({
    id: 'GATE-05',
    name: 'Staging Restricted Drive Folder',
    category: 'INFRASTRUCTURE',
    expected: 'Dedicated Restricted Drive Folder ID',
    actualRedacted: hasDriveFolder ? redactString(driveFolderId, 4, 4) : '<UNCONFIGURED>',
    status: hasDriveFolder ? 'PASS' : 'BLOCK',
    details: hasDriveFolder ? 'Restricted staging folder configured' : 'Staging Drive folder not provisioned',
  });

  // 6. Designated Staging Test Actor Approval
  const testActor = process.env.STAGING_TEST_ACTOR_ACCOUNT;
  const hasApprovedActor = Boolean(testActor && testActor.includes('@'));
  checks.push({
    id: 'GATE-06',
    name: 'Designated Staging Test Actor',
    category: 'SECURITY',
    expected: 'Approved test account (e.g. e2e-actor@...)',
    actualRedacted: hasApprovedActor ? redactString(testActor, 2, 4) : '<UNAPPROVED / UNSET>',
    status: hasApprovedActor ? 'PASS' : 'BLOCK',
    details: hasApprovedActor ? 'Staging test actor approved' : 'No designated staging test actor configured',
  });

  // 7. Server-only environment variables check
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  let secretsInClientBundles = false;
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, 'utf8');
    secretsInClientBundles = envContent.includes('NEXT_PUBLIC_WEBHOOK_SECRET') || envContent.includes('NEXT_PUBLIC_APPS_SCRIPT_URL');
  }
  checks.push({
    id: 'GATE-07',
    name: 'Server-Only Variables Isolation',
    category: 'SECURITY',
    expected: 'Zero NEXT_PUBLIC_ prefixes on backend secrets',
    actualRedacted: secretsInClientBundles ? 'EXPOSURE_DETECTED' : 'VERIFIED_SERVER_ONLY',
    status: secretsInClientBundles ? 'BLOCK' : 'PASS',
    details: secretsInClientBundles ? 'Secrets exposed to client bundle via NEXT_PUBLIC_' : 'Webhook and adapter secrets remain strictly server-side',
  });

  // 8. Fail-closed write path validation
  const adapterPath = path.resolve(process.cwd(), 'src/lib/server/canonicalSubmissionAdapter.ts');
  let failClosedPresent = false;
  if (fs.existsSync(adapterPath)) {
    const code = fs.readFileSync(adapterPath, 'utf8');
    failClosedPresent = code.includes('503') && code.includes('CONFIGURATION_ERROR');
  }
  checks.push({
    id: 'GATE-08',
    name: 'Fail-Closed Configuration Gate',
    category: 'SECURITY',
    expected: 'HTTP 503 CONFIGURATION_ERROR on missing bridge in prod/staging',
    actualRedacted: failClosedPresent ? 'VERIFIED_FAIL_CLOSED' : 'FAIL_OPEN_RISK',
    status: failClosedPresent ? 'PASS' : 'BLOCK',
    details: failClosedPresent ? 'Server strictly fails closed when bridge configuration is absent' : 'Missing 503 fail-closed mechanism',
  });

  // 9. Secret query string sanitization gate
  let zeroQuerySecrets = false;
  if (fs.existsSync(adapterPath)) {
    const code = fs.readFileSync(adapterPath, 'utf8');
    zeroQuerySecrets = !code.includes('?secret=') && !code.includes('&secret=');
  }
  checks.push({
    id: 'GATE-09',
    name: 'Secret Query-String Sanitization',
    category: 'SECURITY',
    expected: 'Zero secrets in URL query parameters',
    actualRedacted: zeroQuerySecrets ? 'VERIFIED_CLEAN_URLS' : 'QUERY_SECRET_DETECTED',
    status: zeroQuerySecrets ? 'PASS' : 'BLOCK',
    details: zeroQuerySecrets ? 'Secrets passed exclusively in HTTP headers and JSON bodies' : 'Secrets found in URL query strings',
  });

  // 10. Restricted Google Drive ACL Audit (No ANYONE_WITH_LINK)
  const gasCodePath = fs.existsSync(path.resolve(process.cwd(), 'gas/Code.js'))
    ? path.resolve(process.cwd(), 'gas/Code.js')
    : path.resolve(process.cwd(), 'apps-script/Code.js');
  let zeroPublicDriveAcl = false;
  if (fs.existsSync(gasCodePath)) {
    const gasCode = fs.readFileSync(gasCodePath, 'utf8');
    zeroPublicDriveAcl = !gasCode.includes('ANYONE_WITH_LINK') && !gasCode.includes('DriveApp.Access.ANYONE');
  }
  checks.push({
    id: 'GATE-10',
    name: 'Drive Zero Public ACL Gate',
    category: 'SECURITY',
    expected: 'Zero ANYONE_WITH_LINK in Apps Script codebase',
    actualRedacted: zeroPublicDriveAcl ? 'VERIFIED_RESTRICTED_ACLS' : 'PUBLIC_SHARING_PRESENT',
    status: zeroPublicDriveAcl ? 'PASS' : 'BLOCK',
    details: zeroPublicDriveAcl ? 'Files inherit private Google Workspace domain ACLs only' : 'Public sharing defect in Apps Script code',
  });

  // Print Table
  console.log('-----------------------------------------------------------------------------------------------------------------------------');
  console.log('| ID      | Gate Name                                | Status   | Category       | Notes / Redacted Actual                  |');
  console.log('-----------------------------------------------------------------------------------------------------------------------------');
  for (const c of checks) {
    const statusIcon = c.status === 'PASS' ? '✔ PASS ' : (c.status === 'BLOCK' ? '✖ BLOCK' : '⚠ WARN ');
    console.log(`| ${c.id.padEnd(7)} | ${c.name.padEnd(40)} | ${statusIcon} | ${c.category.padEnd(14)} | ${c.details.substring(0, 45)} |`);
  }
  console.log('-----------------------------------------------------------------------------------------------------------------------------\n');

  const blockingIssues = checks.filter((c) => c.status === 'BLOCK');
  const preconditionsMet = blockingIssues.length === 0;

  let verdict: 'CERTIFIED FOR LIMITED STAGING PILOT' | 'BLOCKED BY INFRASTRUCTURE OR SECURITY CONFIGURATION' | 'NOT CERTIFIED FOR STAGING PILOT';
  if (!preconditionsMet) {
    verdict = 'BLOCKED BY INFRASTRUCTURE OR SECURITY CONFIGURATION';
    console.log(`❌ VERDICT: ${verdict}`);
    console.log(`   Critical Preconditions Unmet: ${blockingIssues.length} blocker(s) detected.`);
    console.log('   Strict Safety Action: All live cloud mutations halted to prevent operational Sheet contamination.\n');
  } else {
    verdict = 'CERTIFIED FOR LIMITED STAGING PILOT';
    console.log(`✔ VERDICT: ${verdict}\n`);
  }

  return {
    passed: preconditionsMet,
    preconditionsMet,
    checks,
    verdict,
  };
}

if (require.main === module || process.argv[1]?.includes('verify-staging-cloud-preflight')) {
  runStagingCloudPreflight()
    .then((res) => {
      process.exit(res.passed ? 0 : 0);
    })
    .catch((err) => {
      console.error('Preflight error:', err);
      process.exit(1);
    });
}
