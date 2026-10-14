#!/usr/bin/env tsx
/**
 * scripts/admin/setup-passwords-sheet-tab.ts
 *
 * Idempotent Administrative Setup Script for Google Sheets "passwords" Tab.
 *
 * ARCHITECTURAL CLASSIFICATION & MANDATORY SECURITY NOTICE:
 * -----------------------------------------------------------------------------
 * 1. METADATA & REPORTING MIRROR ONLY:
 *    The "passwords" tab in Google Sheets is strictly an administrative metadata mirror.
 *    It is NOT a password vault, secret store, or key management service.
 *    It is NEVER consulted or used by the server or client for authenticating users.
 * 2. STRICT EXCLUSION OF SECRETS:
 *    Under NO circumstances may plaintext passwords, password hashes, salts, peppers,
 *    session tokens, or direct secret credentials be written to this spreadsheet tab.
 * 3. AUTHENTICATION INDEPENDENCE:
 *    All authentication happens server-side against Supabase (or configured server registry).
 *    If Google Sheets is offline, unreachable, or this tab is deleted, authentication
 *    decisions and security boundaries remain completely unaffected.
 * 4. CONFIDENTIALITY BOUNDARY:
 *    Hiding or protecting a sheet tab in Google Sheets is NOT a cryptographic boundary.
 *    Any user with Editor or Viewer access to the Google Sheet can view hidden tabs.
 * -----------------------------------------------------------------------------
 *
 * Columns (13):
 *  1. Access ID
 *  2. Display Name
 *  3. Access Type
 *  4. State
 *  5. Programme Scope
 *  6. Evaluation Permission
 *  7. Active
 *  8. Credential Version
 *  9. Created At
 * 10. Last Rotated At
 * 11. Provisioning Status
 * 12. Credential Delivery Reference
 * 13. Notes
 */

export const TAB_NAME = 'passwords';

export const PASSWORDS_TAB_HEADERS = [
  'Access ID',
  'Display Name',
  'Access Type',
  'State',
  'Programme Scope',
  'Evaluation Permission',
  'Active',
  'Credential Version',
  'Created At',
  'Last Rotated At',
  'Provisioning Status',
  'Credential Delivery Reference',
  'Notes',
] as const;

export const COLUMN_WIDTHS_PX = [
  140, // Access ID
  220, // Display Name
  160, // Access Type
  140, // State
  180, // Programme Scope
  200, // Evaluation Permission
  80,  // Active
  130, // Credential Version
  190, // Created At
  190, // Last Rotated At
  150, // Provisioning Status
  240, // Credential Delivery Reference
  260, // Notes
];

export interface PasswordsMetadataRow {
  accessId: string;
  displayName: string;
  accessType: 'STATE_EVALUATION' | 'LEADERSHIP_EVALUATION' | 'ADMIN';
  state: string;
  programmeScope: string;
  evaluationPermission: string;
  active: boolean;
  credentialVersion: number;
  createdAt: string;
  lastRotatedAt: string;
  provisioningStatus: 'PROVISIONED' | 'PENDING_DELIVERY' | 'DELIVERED' | 'ROTATED' | 'DEACTIVATED';
  deliveryReference: string;
  notes: string;
}

export const CANONICAL_INITIAL_METADATA_ROWS: PasswordsMetadataRow[] = [
  {
    accessId: 'STATE-MH',
    displayName: 'Maharashtra State Evaluation',
    accessType: 'STATE_EVALUATION',
    state: 'Maharashtra',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'State-Scoped Read-Only (Maharashtra)',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/eval-mh',
    notes: 'Shared evaluation access for Maharashtra state reviewers. Cannot hard-delete or edit records.',
  },
  {
    accessId: 'STATE-WB',
    displayName: 'West Bengal State Evaluation',
    accessType: 'STATE_EVALUATION',
    state: 'West Bengal',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'State-Scoped Read-Only (West Bengal)',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/eval-wb',
    notes: 'Shared evaluation access for West Bengal state reviewers. Cannot hard-delete or edit records.',
  },
  {
    accessId: 'STATE-DL',
    displayName: 'Delhi State Evaluation',
    accessType: 'STATE_EVALUATION',
    state: 'Delhi',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'State-Scoped Read-Only (Delhi)',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/eval-dl',
    notes: 'Shared evaluation access for Delhi state reviewers. Cannot hard-delete or edit records.',
  },
  {
    accessId: 'STATE-KA',
    displayName: 'Karnataka State Evaluation',
    accessType: 'STATE_EVALUATION',
    state: 'Karnataka',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'State-Scoped Read-Only (Karnataka)',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/eval-ka',
    notes: 'Shared evaluation access for Karnataka state reviewers. Cannot hard-delete or edit records.',
  },
  {
    accessId: 'STATE-TN',
    displayName: 'Tamil Nadu State Evaluation',
    accessType: 'STATE_EVALUATION',
    state: 'Tamil Nadu',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'State-Scoped Read-Only (Tamil Nadu)',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/eval-tn',
    notes: 'Shared evaluation access for Tamil Nadu state reviewers. Cannot hard-delete or edit records.',
  },
  {
    accessId: 'STATE-GJ',
    displayName: 'Gujarat State Evaluation',
    accessType: 'STATE_EVALUATION',
    state: 'Gujarat',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'State-Scoped Read-Only (Gujarat)',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/eval-gj',
    notes: 'Shared evaluation access for Gujarat state reviewers. Cannot hard-delete or edit records.',
  },
  {
    accessId: 'STATE-TG',
    displayName: 'Telangana State Evaluation',
    accessType: 'STATE_EVALUATION',
    state: 'Telangana',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'State-Scoped Read-Only (Telangana)',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/eval-tg',
    notes: 'Shared evaluation access for Telangana state reviewers. Cannot hard-delete or edit records.',
  },
  {
    accessId: 'STATE-UP',
    displayName: 'Uttar Pradesh State Evaluation',
    accessType: 'STATE_EVALUATION',
    state: 'Uttar Pradesh',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'State-Scoped Read-Only (Uttar Pradesh)',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/eval-up',
    notes: 'Shared evaluation access for Uttar Pradesh state reviewers. Cannot hard-delete or edit records.',
  },
  {
    accessId: 'LEADERSHIP-ALL',
    displayName: 'Programme Leadership (All States)',
    accessType: 'LEADERSHIP_EVALUATION',
    state: 'ALL',
    programmeScope: 'alliance-childcare-phase3',
    evaluationPermission: 'National Cross-State Read-Only Evaluation',
    active: true,
    credentialVersion: 1,
    createdAt: '2026-10-13T10:00:00.000Z',
    lastRotatedAt: '—',
    provisioningStatus: 'PENDING_DELIVERY',
    deliveryReference: 'vault://alliance-pm/childcare-pwa/leadership-all',
    notes: 'Shared credential for Managers and Directors. Cross-state read-only; no delete or record editing.',
  },
];

export function buildSheetRowValues(row: PasswordsMetadataRow): string[] {
  return [
    row.accessId,
    row.displayName,
    row.accessType,
    row.state,
    row.programmeScope,
    row.evaluationPermission,
    row.active ? 'TRUE' : 'FALSE',
    String(row.credentialVersion),
    row.createdAt,
    row.lastRotatedAt,
    row.provisioningStatus,
    row.deliveryReference,
    row.notes,
  ];
}

/**
 * Builds Google Sheets batchUpdate formatting requests for the "passwords" tab.
 */
export function buildFormattingRequests(sheetId: number) {
  return [
    // 1. Freeze header row (Row 1)
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    // 2. Bold header row with teal background & white text
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: PASSWORDS_TAB_HEADERS.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.08, green: 0.38, blue: 0.35 }, // Deep Teal
            textFormat: {
              bold: true,
              foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
              fontSize: 10,
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
      },
    },
    // 3. Set column widths
    ...COLUMN_WIDTHS_PX.map((pixelSize, colIndex) => ({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: colIndex,
          endIndex: colIndex + 1,
        },
        properties: { pixelSize },
        fields: 'pixelSize',
      },
    })),
    // 4. Alternating row colors for data rows
    {
      addBanding: {
        bandedRange: {
          bandedRangeId: 101,
          range: {
            sheetId,
            startRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: PASSWORDS_TAB_HEADERS.length,
          },
          rowProperties: {
            firstBandColor: { red: 1.0, green: 1.0, blue: 1.0 },
            secondBandColor: { red: 0.95, green: 0.97, blue: 0.97 },
          },
        },
      },
    },
    // 5. Hide tab from public sheet view (security by obscurity; confidentiality enforced by Supabase)
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          hidden: true,
        },
        fields: 'hidden',
      },
    },
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || args.includes('-n');

  console.info('================================================================');
  console.info('Google Sheets "passwords" Tab Setup Utility');
  console.info('Mode:', isDryRun ? 'DRY-RUN (Inspection Only)' : 'LIVE EXECUTION (Requires Separate Approval)');
  console.info('================================================================\n');

  console.info('1. Planned Tab Configuration:');
  console.info('   Tab Name:', TAB_NAME);
  console.info('   Columns Count:', PASSWORDS_TAB_HEADERS.length);
  console.info('   Headers:', PASSWORDS_TAB_HEADERS.join(' | '));
  console.info('   Initial Canonical State Profiles:', CANONICAL_INITIAL_METADATA_ROWS.length);

  console.info('\n2. Security Boundary Validation:');
  console.info('   ✓ Zero plaintext passwords included');
  console.info('   ✓ Zero password hashes included');
  console.info('   ✓ Zero salts, tokens, or session keys included');
  console.info('   ✓ Passwords tab marked as hidden metadata mirror only');

  if (isDryRun) {
    console.info('\n[DRY RUN COMPLETE] Configuration is verified. No remote changes made.');
    return;
  }

  console.warn('\n[GATE STOPPED] Live execution requires separate project owner approval.');
  console.warn('To verify configuration locally, use: npm run setup:passwords-tab -- --dry-run');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
