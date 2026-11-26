import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { GET as reconcileSnapshotRoute } from '@/app/api/workers/reconcile-snapshot/route';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import { FirestoreSubmissionAdapter } from '@/lib/server/firestoreSubmissionAdapter';
import { computeSheetCellsRowHash, computeSubmissionRowHash } from '@/lib/server/submissionRowHash';

interface MockTrigger {
  id: string;
  handler: string;
  everyDaysVal?: number;
  atHourVal?: number;
  nearMinVal?: number;
  timezoneVal?: string;
  afterMsVal?: number;
}

class MockSheet {
  public name: string;
  public hidden = false;
  public rows: any[][] = [];
  public formulas: string[][] = [];

  constructor(name: string) {
    this.name = name;
  }

  getName() {
    return this.name;
  }

  setName(name: string) {
    this.name = name;
  }

  hideSheet() {
    this.hidden = true;
  }

  showSheet() {
    this.hidden = false;
  }

  getLastRow() {
    return this.rows.length;
  }

  getLastColumn() {
    let maxCol = 0;
    for (const r of this.rows) {
      if (r && r.length > maxCol) maxCol = r.length;
    }
    return Math.max(maxCol, 83);
  }

  getMaxColumns() {
    return 100;
  }

  getMaxRows() {
    return Math.max(this.rows.length, 100);
  }

  insertColumnsAfter() {}
  insertRowsAfter() {}
  setFrozenRows() {}
  setColumnWidth() {}

  getRange(startRow: number, startCol: number, numRows = 1, numCols = 1) {
    const self = this;
    const rangeObj: any = {
      getValue() {
        const row = self.rows[startRow - 1] || [];
        const v = row[startCol - 1];
        return v === undefined ? '' : v;
      },
      setValue(v: any) {
        const rowIdx = startRow - 1;
        while (self.rows.length <= rowIdx) self.rows.push([]);
        while (self.formulas.length <= rowIdx) self.formulas.push([]);
        self.rows[rowIdx][startCol - 1] = v;
        if (typeof v === 'string' && v.startsWith('=')) {
          self.formulas[rowIdx][startCol - 1] = v;
        }
        return rangeObj;
      },
      getValues() {
        const out: any[][] = [];
        for (let r = 0; r < numRows; r++) {
          const rowIdx = startRow - 1 + r;
          const row = self.rows[rowIdx] || [];
          const slice: any[] = [];
          for (let c = 0; c < numCols; c++) {
            const val = row[startCol - 1 + c];
            slice.push(val === undefined ? '' : val);
          }
          out.push(slice);
        }
        return out;
      },
      getFormulas() {
        const out: string[][] = [];
        for (let r = 0; r < numRows; r++) {
          const rowIdx = startRow - 1 + r;
          const row = self.rows[rowIdx] || [];
          const fRow = self.formulas[rowIdx] || [];
          const slice: string[] = [];
          for (let c = 0; c < numCols; c++) {
            const colIdx = startCol - 1 + c;
            const explicitF = fRow[colIdx];
            if (explicitF) {
              slice.push(explicitF);
            } else {
              const rawVal = row[colIdx];
              slice.push(typeof rawVal === 'string' && rawVal.startsWith('=') ? rawVal : '');
            }
          }
          out.push(slice);
        }
        return out;
      },
      setValues(vals: any[][]) {
        for (let r = 0; r < vals.length; r++) {
          const rowIdx = startRow - 1 + r;
          while (self.rows.length <= rowIdx) self.rows.push([]);
          while (self.formulas.length <= rowIdx) self.formulas.push([]);
          for (let c = 0; c < vals[r].length; c++) {
            const colIdx = startCol - 1 + c;
            const val = vals[r][c];
            self.rows[rowIdx][colIdx] = val;
            if (typeof val === 'string' && val.startsWith('=')) {
              self.formulas[rowIdx][colIdx] = val;
            } else {
              self.formulas[rowIdx][colIdx] = '';
            }
          }
        }
        return rangeObj;
      },
      merge() { return rangeObj; },
      setFontWeight() { return rangeObj; },
      setFontColor() { return rangeObj; },
      setFontSize() { return rangeObj; },
      setWrap() { return rangeObj; },
      setHorizontalAlignment() { return rangeObj; },
      setRowHeight() { return rangeObj; },
      setVerticalAlignment() { return rangeObj; },
      setBackground() { return rangeObj; },
      setBorder() { return rangeObj; },
    };
    return rangeObj;
  }

  deleteRow(rowIndex: number) {
    const idx = rowIndex - 1;
    if (idx >= 0 && idx < this.rows.length) {
      this.rows.splice(idx, 1);
      this.formulas.splice(idx, 1);
    }
  }

  deleteRows(rowIndex: number, count: number) {
    const idx = rowIndex - 1;
    if (idx >= 0 && idx < this.rows.length) {
      this.rows.splice(idx, count);
      this.formulas.splice(idx, count);
    }
  }

  setRowHeight() {}
}

function createGasHarness(options: {
  initialProps: Record<string, string>;
  routeHandler: (url: string, secret: string) => Promise<{ statusCode: number; body: any }>;
  lockShouldFail?: boolean;
}) {
  const propMap = new Map<string, string>(Object.entries(options.initialProps));
  const sheetsMap = new Map<string, MockSheet>();
  const primary = new MockSheet('Child_Nutrition');
  // Create 3-row header stub in primary sheet
  primary.rows = [['Banner'], ['Spacer'], ['1\nUnique ID']];
  sheetsMap.set('Child_Nutrition', primary);

  const registry = new MockSheet('_Asset_Containers');
  registry.rows = [['remoteSubmissionId', 'assetContainerId', 'folderId', 'createdAt', 'updatedAt']];
  registry.hidden = true;
  sheetsMap.set('_Asset_Containers', registry);

  const triggers: MockTrigger[] = [];
  const emailsSent: any[] = [];
  const driveFolders = new Map<string, { id: string; name: string; trashed: boolean; parentId: string | null }>();
  driveFolders.set('root-docs-001', { id: 'root-docs-001', name: 'Root Documents', trashed: false, parentId: null });

  function makeFolderHandle(entry: { id: string; name: string; trashed: boolean; parentId: string | null }): any {
    return {
      getId: () => entry.id,
      getName: () => entry.name,
      setName: (n: string) => {
        entry.name = n;
      },
      isTrashed: () => entry.trashed,
      setTrashed: (t: boolean) => {
        entry.trashed = t;
      },
      getParents: () => {
        const list = entry.parentId && driveFolders.has(entry.parentId) ? [makeFolderHandle(driveFolders.get(entry.parentId)!)] : [];
        let idx = 0;
        return {
          hasNext: () => idx < list.length,
          next: () => list[idx++],
        };
      },
      moveTo: (destParent: { getId: () => string }) => {
        entry.parentId = destParent.getId();
      },
      getFoldersByName: (targetName: string) => {
        const matches = Array.from(driveFolders.values())
          .filter((f) => f.parentId === entry.id && f.name === targetName)
          .map(makeFolderHandle);
        let idx = 0;
        return {
          hasNext: () => idx < matches.length,
          next: () => matches[idx++],
        };
      },
      createFolder: (newName: string) => {
        const fid = `fld-${newName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
        const created = { id: fid, name: newName, trashed: false, parentId: entry.id };
        driveFolders.set(fid, created);
        return makeFolderHandle(created);
      },
    };
  }

  const spreadsheet = {
    getId: () => '1FAKE_STAGING_SHEET_ID_DO_NOT_USE_IN_PROD',
    getName: () => 'Staging Reconcile Sheet',
    getSheets: () => Array.from(sheetsMap.values()),
    getSheetByName: (name: string) => sheetsMap.get(name) || null,
    insertSheet: (name: string) => {
      const s = new MockSheet(name);
      sheetsMap.set(name, s);
      return s;
    },
  };

  const sandbox: any = {
    Math,
    Date,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    encodeURIComponent,
    isNaN,
    isFinite,
    Logger: { log: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (propMap.has(k) ? propMap.get(k)! : null),
        setProperty: (k: string, v: string) => {
          propMap.set(k, String(v));
        },
        deleteProperty: (k: string) => {
          propMap.delete(k);
        },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => !options.lockShouldFail,
        releaseLock: () => {},
      }),
    },
    SpreadsheetApp: {
      BorderStyle: { SOLID: 'SOLID' },
      openById: () => spreadsheet,
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => ({ createMenu: () => ({ addItem: () => ({ addToUi: () => {} }), addToUi: () => {} }) }),
    },
    DriveApp: {
      getRootFolder: () => makeFolderHandle(driveFolders.get('root-docs-001')!),
      getFolderById: (id: string) => {
        const entry = driveFolders.get(id);
        if (!entry) throw new Error('Folder not found: ' + id);
        return makeFolderHandle(entry);
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      sleep: () => {},
      computeDigest: (_alg: string, input: string) => {
        const buf = crypto.createHash('sha256').update(input, 'utf8').digest();
        // Match GAS signed byte array [-128..127]
        return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
      },
    },
    ScriptApp: {
      getProjectTriggers: () =>
        triggers.map((t) => ({
          getUniqueId: () => t.id,
          getHandlerFunction: () => t.handler,
        })),
      deleteTrigger: (t: { getUniqueId: () => string }) => {
        const idx = triggers.findIndex((x) => x.id === t.getUniqueId());
        if (idx >= 0) triggers.splice(idx, 1);
      },
      newTrigger: (handler: string) => {
        const trig: MockTrigger = {
          id: `trig-${Math.random().toString(36).slice(2, 8)}`,
          handler,
        };
        const builder: any = {
          timeBased: () => builder,
          everyDays: (d: number) => {
            trig.everyDaysVal = d;
            return builder;
          },
          atHour: (h: number) => {
            trig.atHourVal = h;
            return builder;
          },
          nearMinute: (m: number) => {
            trig.nearMinVal = m;
            return builder;
          },
          inTimezone: (tz: string) => {
            trig.timezoneVal = tz;
            return builder;
          },
          after: (ms: number) => {
            trig.afterMsVal = ms;
            return builder;
          },
          create: () => {
            triggers.push(trig);
            return {
              getUniqueId: () => trig.id,
              getHandlerFunction: () => trig.handler,
            };
          },
        };
        return builder;
      },
    },
    MailApp: {
      getRemainingDailyQuota: () => 500,
      sendEmail: (msg: any) => {
        emailsSent.push(msg);
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt: string) => ({
        setMimeType: () => ({ content: txt }),
        content: txt,
      }),
    },
    UrlFetchApp: {
      fetch: (url: string, fetchOpts: any) => {
        const hdrs = (fetchOpts && fetchOpts.headers) || {};
        const sec = String(hdrs['X-Reconcile-Secret'] || '');
        // Synchronous bridge inside VM using pre-populated snapshot queue via deasync-free callback?
        // Instead we drive routeHandler synchronously via queued responses or custom helper!
        throw new Error('Must call initAsyncFetchStub before running async fetch');
      },
    },
  };

  // Load gas/Code.js then gas/NightlyReconciliation.js into VM
  const codeJs = fs.readFileSync(path.join(process.cwd(), 'gas', 'Code.js'), 'utf8');
  const reconcileJs = fs.readFileSync(path.join(process.cwd(), 'gas', 'NightlyReconciliation.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(codeJs, sandbox);
  vm.runInContext(reconcileJs, sandbox);

  // Override getTargetSpreadsheet_ so Code.js uses our isolated mock spreadsheet
  sandbox.getTargetSpreadsheet_ = () => spreadsheet;
  sandbox.getTargetSpreadsheetId_ = () => '1FAKE_STAGING_SHEET_ID_DO_NOT_USE_IN_PROD';

  return {
    sandbox,
    propMap,
    sheetsMap,
    primary,
    registry,
    triggers,
    emailsSent,
    driveFolders,
    async seedResponsesAndRun(fn: () => any) {
      // Pre-warm responses dynamically: not needed because we can make UrlFetchApp read from an array OR evaluate all Next.js requests first?
      // Even better: intercept UrlFetchApp using a pre-seeded request queue OR allow synchronous mock snapshot dispatch!
      return fn();
    },
  };
}

function wireSyncNextRouteFetch(
  sandbox: any,
  responses: Array<{ matchUrlContains?: string; statusCode: number; body: any }>
) {
  const queue = [...responses];
  const fetchedUrls: string[] = [];
  sandbox.UrlFetchApp = {
    fetch: (url: string, _opts: any) => {
      fetchedUrls.push(url);
      let idx = queue.findIndex((r) => !r.matchUrlContains || url.includes(r.matchUrlContains));
      if (idx === -1) idx = 0;
      const picked = queue.splice(idx, 1)[0];
      if (!picked) {
        return {
          getResponseCode: () => 500,
          getContentText: () => JSON.stringify({ status: 'error', message: 'No mocked response for ' + url }),
        };
      }
      return {
        getResponseCode: () => picked.statusCode,
        getContentText: () => JSON.stringify(picked.body),
      };
    },
  };
  return fetchedUrls;
}

describe('GAS Nightly Sheet Reconciliation & Safety Circuit Breakers Suite', () => {
  const savedFlag = process.env.RECONCILIATION_SNAPSHOT_ENABLED;
  const savedSecret = process.env.SHEET_RECONCILE_SECRET;
  const savedDataEngine = process.env.DATA_ENGINE;
  const reconcileSecret = 'reconcile_gas_vm_dedicated_secret_32_chars_ok';

  let fsAdapter: FirestoreSubmissionAdapter;

  beforeEach(async () => {
    process.env.DATA_ENGINE = 'firestore';
    process.env.RECONCILIATION_SNAPSHOT_ENABLED = 'true';
    process.env.SHEET_RECONCILE_SECRET = reconcileSecret;
    fsAdapter = new FirestoreSubmissionAdapter({
      appEnv: 'development',
      databaseId: '(default)',
    });
    canonicalSubmissionAdapter.setFirestoreAdapter(fsAdapter);
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.RECONCILIATION_SNAPSHOT_ENABLED;
    else process.env.RECONCILIATION_SNAPSHOT_ENABLED = savedFlag;
    if (savedSecret === undefined) delete process.env.SHEET_RECONCILE_SECRET;
    else process.env.SHEET_RECONCILE_SECRET = savedSecret;
    if (savedDataEngine === undefined) delete process.env.DATA_ENGINE;
    else process.env.DATA_ENGINE = savedDataEngine;
  });

  it('produces identical SHA-256 83-column row hashes between GAS and Node submissionRowHash.ts', () => {
    const h = createGasHarness({
      initialProps: {},
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });
    const cells = new Array(83).fill('');
    cells[0] = 'ID-PARITY-01';
    cells[1] = 2;
    cells[2] = '2026-11-26T00:00:00.000Z';
    cells[8] = 'Rohan Das';
    cells[17] = 'Maharashtra';
    cells[24] = 'Restricted Doc [Passbook]';
    cells[66] = 'Pending';

    const formulas = new Array(83).fill('');
    formulas[24] = '=HYPERLINK("https://drive.google.com/file/d/1DriveFileAbCdEf12/view", "Restricted Doc [Passbook]")';

    const gasHash = h.sandbox.computeGasSheetCellsRowHash_(cells, formulas, false, null);
    const nodeHash = computeSheetCellsRowHash(cells, formulas, false, null);
    expect(gasHash).toBe(nodeHash);
  });

  it('defaults OFF (DISABLED) and refuses secret reuse or cross-env operational spreadsheet targets', () => {
    const disabled = createGasHarness({
      initialProps: {
        APP_BASE_URL: 'https://staging.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });
    expect(disabled.sandbox.runNightlySheetReconciliation().status).toBe('DISABLED');
    expect(disabled.sandbox.installNightlyReconciliationTrigger().status).toBe('DISABLED');

    const secretReuse = createGasHarness({
      initialProps: {
        RECONCILE_ENABLED: 'true',
        APP_BASE_URL: 'https://staging.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
        WEBHOOK_SECRET: reconcileSecret,
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });
    const cfgErr = secretReuse.sandbox.runNightlySheetReconciliation();
    expect(cfgErr.status).toBe('CONFIGURATION_ERROR');
    expect(cfgErr.code).toBe('SECRET_REUSE_FORBIDDEN');

    const opGuard = createGasHarness({
      initialProps: {
        RECONCILE_ENABLED: 'true',
        APP_ENV: 'staging',
        APP_BASE_URL: 'https://staging-app.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });
    opGuard.sandbox.getTargetSpreadsheetId_ = () => '1tg1ROn5TbOumuCvpSlxG7OxhayYodnmoiA7qMPkbXfA';
    const isoErr = opGuard.sandbox.runNightlySheetReconciliation();
    expect(isoErr.status).toBe('CONFIGURATION_ERROR');
    expect(isoErr.code).toBe('CROSS_ENV_ISOLATION_VIOLATION');
  });

  it('installs a single daily 23:00 Asia/Kolkata trigger without exceeding GAS trigger limits and skips when LockService is busy', () => {
    const busy = createGasHarness({
      initialProps: {
        RECONCILE_ENABLED: 'true',
        APP_BASE_URL: 'https://staging.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
      lockShouldFail: true,
    });
    const r1 = busy.sandbox.installNightlyReconciliationTrigger();
    const r2 = busy.sandbox.installNightlyReconciliationTrigger();
    expect(r1.installed).toBe(true);
    expect(r2.installed).toBe(true);
    expect(busy.triggers).toHaveLength(1);
    expect(busy.triggers[0].atHourVal).toBe(23);
    expect(busy.triggers[0].timezoneVal).toBe('Asia/Kolkata');

    expect(busy.sandbox.runNightlySheetReconciliation().status).toBe('LOCKED_SKIP');
  });

  it('executes full reconciliation: inserts missing DB row, repairs drifted hash, moves soft-deleted to Trash + untrash restore, quarantines Sheet-only row, and converges on rerun', async () => {
    // 1. Seed Firestore source of truth:
    // rec-a-matched (already synced identically in Sheet)
    // rec-b-drifted (modified in Firestore, stale in Sheet -> update repair)
    // rec-c-missing (missed Sheet write -> insert repair)
    // rec-d-deleted (soft-deleted in Firestore -> move to Trash tab & trash Drive folder)
    for (const item of [
      { id: 'rec-a-matched', childName: 'Child A Match', state: 'Delhi', district: 'South Delhi' },
      { id: 'rec-b-drifted', childName: 'Child B Old', state: 'Maharashtra', district: 'Pune' },
      { id: 'rec-c-missing', childName: 'Child C Missed', state: 'Assam', district: 'Kamrup' },
      { id: 'rec-d-deleted', childName: 'Child D Deleted', state: 'West Bengal', district: 'Kolkata' },
    ]) {
      await fsAdapter.createSubmission({
        payload: {
          clientSubmissionId: item.id,
          uniqueId: item.id,
          demographics: { childName: item.childName, state: item.state, district: item.district },
          state: item.state,
          district: item.district,
        } as any,
        idempotencyKey: `idem-gas-${item.id}`,
        requestId: `req-gas-${item.id}`,
      });
    }
    await fsAdapter.updateSubmission({
      submissionId: 'rec-b-drifted',
      expectedVersion: 1,
      patch: { childName: 'Child B Repaired' } as any,
      idempotencyKey: 'idem-gas-patch-b',
      requestId: 'req-patch-b',
    });
    await fsAdapter.deleteSubmission('rec-d-deleted', {
      actorId: 'lead@allianceindia.org',
      actorName: 'National Lead',
      actorRole: 'LEADERSHIP',
      reason: 'Confirmed duplicate case',
    });

    const h = createGasHarness({
      initialProps: {
        RECONCILE_ENABLED: 'true',
        SHEET_TRASH_MIRROR_ENABLED: 'true',
        APP_BASE_URL: 'https://staging.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
        RECONCILE_ALERT_EMAILS: 'admin1@allianceindia.org',
        // Raise min count above 2 for this mixed small-table test
        RECONCILE_MIN_DESTRUCTIVE_COUNT: '5',
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });

    // Populate Drive folder & registry for rec-d-deleted under SSR parent
    h.propMap.set('ROOT_DOCUMENTS_FOLDER_ID', 'root-docs-001');
    h.driveFolders.set('ssr-wb-001', { id: 'ssr-wb-001', name: 'Alliance WB', trashed: false, parentId: 'root-docs-001' });
    h.driveFolders.set('folder-d-001', { id: 'folder-d-001', name: 'ast-d-001', trashed: false, parentId: 'ssr-wb-001' });
    h.registry.getRange(2, 1, 1, 5).setValues([['rec-d-deleted', 'ast-d-001', 'folder-d-001', '2026-11-25T00:00:00Z', '2026-11-25T00:00:00Z']]);

    // Pre-seed active Sheet rows (UNSORTED order + Sheet-only orphan 'rec-z-orphan')
    const recA = await fsAdapter.getReconcileSubmissionRecord('rec-a-matched');
    const rowA = h.sandbox.buildLinelistRowFromReconcileRecord_(recA);
    const staleRowB = new Array(83).fill('');
    staleRowB[0] = 'rec-b-drifted';
    staleRowB[8] = 'Child B Old Stale';
    staleRowB[17] = 'Maharashtra';
    const rowD = new Array(83).fill('');
    rowD[0] = 'rec-d-deleted';
    rowD[8] = 'Child D Deleted';
    rowD[17] = 'West Bengal';
    const orphanRow = new Array(83).fill('');
    orphanRow[0] = 'rec-z-orphan';
    orphanRow[8] = 'Unsaved Orphan Child';
    orphanRow[17] = 'Bihar';

    // Deliberately write out-of-order rows on Sheet: orphan, D, A, stale B
    h.primary.getRange(4, 1, 4, 83).setValues([orphanRow, rowD, rowA, staleRowB]);

    // Pre-fetch real API responses from Next.js route handler
    const snapPage1 = await (await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?limit=2', {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();
    const snapPage2 = await (await reconcileSnapshotRoute(
      new NextRequest(`http://localhost:3000/api/workers/reconcile-snapshot?limit=2&afterId=${encodeURIComponent(snapPage1.nextAfterId)}`, {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();
    const fullB = await (await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?mode=record&submissionId=rec-b-drifted', {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();
    const fullC = await (await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?mode=record&submissionId=rec-c-missing', {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();

    const fetched = wireSyncNextRouteFetch(h.sandbox, [
      { matchUrlContains: 'reconcile-snapshot?limit=2', statusCode: 200, body: snapPage1 },
      { matchUrlContains: 'afterId=', statusCode: 200, body: snapPage2 },
      { matchUrlContains: 'submissionId=rec-b-drifted', statusCode: 200, body: fullB },
      { matchUrlContains: 'submissionId=rec-c-missing', statusCode: 200, body: fullC },
    ]);

    const res = h.sandbox.runNightlySheetReconciliation({ pageSize: 2 });
    expect(res).toMatchObject({ status: 'COMPLETED' });
    expect(res.stats.matched).toBe(1);      // rec-a-matched (never fetched mode=record!)
    expect(res.stats.updated).toBe(1);      // rec-b-drifted
    expect(res.stats.inserted).toBe(1);     // rec-c-missing
    expect(res.stats.softDeleted).toBe(1);  // rec-d-deleted
    expect(res.stats.quarantined).toBe(1);  // rec-z-orphan
    expect(fetched.some((u) => u.includes('rec-a-matched'))).toBe(false);

    // Active Sheet should now contain ONLY rec-a-matched, rec-b-drifted (updated), rec-c-missing
    const liveIds = h.primary.rows.slice(3).map((r) => r[0]).sort();
    expect(liveIds).toEqual(['rec-a-matched', 'rec-b-drifted', 'rec-c-missing']);
    const liveRowB = h.primary.rows.slice(3).find((r) => r[0] === 'rec-b-drifted')!;
    expect(liveRowB[8]).toBe('Child B Repaired');

    // Hash convergence check: repaired Sheet rows hash IDENTICALLY to Firestore docs!
    const docB = await fsAdapter.getSubmission('rec-b-drifted', undefined, { includeDeleted: true });
    const docC = await fsAdapter.getSubmission('rec-c-missing', undefined, { includeDeleted: true });
    expect(h.sandbox.computeGasSheetCellsRowHash_(liveRowB, [], false, null)).toBe(computeSubmissionRowHash(docB));
    const liveRowC = h.primary.rows.slice(3).find((r) => r[0] === 'rec-c-missing')!;
    expect(h.sandbox.computeGasSheetCellsRowHash_(liveRowC, [], false, null)).toBe(computeSubmissionRowHash(docC));

    // Hidden Trash tab has rec-d-deleted minimal metadata, and Drive folder is moved to "Deleted" folder (NEVER Drive setTrashed auto-purge)
    const trashSheet = h.sheetsMap.get('Trash')!;
    expect(trashSheet.hidden).toBe(true);
    expect(trashSheet.rows[1][0]).toBe('rec-d-deleted');
    expect(trashSheet.rows[1][5]).toBe('folder-d-001');
    expect(trashSheet.rows[1][6]).toBe('ssr-wb-001');
    const deletedFolder = Array.from(h.driveFolders.values()).find((f) => f.name === 'Deleted');
    expect(deletedFolder).toBeDefined();
    expect(h.driveFolders.get('folder-d-001')!.parentId).toBe(deletedFolder!.id);
    expect(h.driveFolders.get('folder-d-001')!.trashed).toBe(false);

    // Quarantine tab preserves full snapshot JSON of rec-z-orphan
    const qSheet = h.sheetsMap.get('Quarantine')!;
    expect(qSheet.rows[1][0]).toBe('rec-z-orphan');
    expect(qSheet.rows[1][3]).toBe('MISSING_IN_FIRESTORE');
    expect(qSheet.rows[1][4]).toContain('Unsaved Orphan Child');

    // Run log + Admin email (zero PII check)
    const logSheet = h.sheetsMap.get('Reconcile Run Log')!;
    expect(logSheet.rows).toHaveLength(2);
    expect(logSheet.rows[1][3]).toBe('COMPLETED');
    expect(h.emailsSent).toHaveLength(1);
    expect(h.emailsSent[0].body).not.toContain('Child B Repaired');
    expect(h.emailsSent[0].body).not.toContain('Unsaved Orphan Child');

    // Re-running next night should match all 3 active rows with ZERO record fetches!
    const rerunSnap = await (await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?limit=20', {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();
    const rerunFetched = wireSyncNextRouteFetch(h.sandbox, [
      { matchUrlContains: 'reconcile-snapshot?limit=20', statusCode: 200, body: rerunSnap },
    ]);
    const res2 = h.sandbox.runNightlySheetReconciliation({ pageSize: 20 });
    expect(res2.status).toBe('COMPLETED');
    expect(res2.stats.matched).toBe(3);
    expect(res2.stats.updated).toBe(0);
    expect(res2.stats.inserted).toBe(0);
    expect(res2.stats.softDeleted).toBe(0);
    expect(res2.stats.quarantined).toBe(0);
    expect(rerunFetched).toHaveLength(1); // Only 1 snapshot call!

    // Restore via GAS handleRestore_ removes Trash entry, moves Drive folder BACK to original parent, and restores active Sheet row
    const restoreOut = h.sandbox.handleRestore_({
      uniqueId: 'rec-d-deleted',
      record: await fsAdapter.getReconcileSubmissionRecord('rec-d-deleted'),
    });
    const parsedRestore = JSON.parse(restoreOut.content);
    expect(parsedRestore.success).toBe(true);
    expect(parsedRestore.driveRestored).toBe(true);
    expect(parsedRestore.rowRestored).toBe(true);
    expect(h.driveFolders.get('folder-d-001')!.parentId).toBe('ssr-wb-001');
    expect(h.driveFolders.get('folder-d-001')!.name).toBe('ast-d-001');
    expect(h.driveFolders.get('folder-d-001')!.trashed).toBe(false);
    expect(h.sheetsMap.get('Trash')!.rows).toHaveLength(1); // Header only
  });

  it('preempts cleanly at 4.5-minute budget, schedules 1 continuation trigger without deleting daily trigger, and resumes to completion', async () => {
    for (const id of ['res-01', 'res-02', 'res-03']) {
      await fsAdapter.createSubmission({
        payload: {
          clientSubmissionId: id,
          uniqueId: id,
          demographics: { childName: `Child ${id}`, state: 'Delhi', district: 'North Delhi' },
          state: 'Delhi',
          district: 'North Delhi',
        } as any,
        idempotencyKey: `idem-${id}`,
        requestId: `req-${id}`,
      });
    }

    const h = createGasHarness({
      initialProps: {
        RECONCILE_ENABLED: 'true',
        APP_BASE_URL: 'https://staging.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });
    // Install daily trigger first
    h.sandbox.installNightlyReconciliationTrigger();
    expect(h.triggers).toHaveLength(1);

    const p1 = await (await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?limit=2', {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();
    const p2 = await (await reconcileSnapshotRoute(
      new NextRequest(`http://localhost:3000/api/workers/reconcile-snapshot?limit=2&afterId=${encodeURIComponent(p1.nextAfterId)}`, {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();
    const f1 = await (await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?mode=record&submissionId=res-01', {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();
    const f2 = await (await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?mode=record&submissionId=res-02', {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();
    const f3 = await (await reconcileSnapshotRoute(
      new NextRequest('http://localhost:3000/api/workers/reconcile-snapshot?mode=record&submissionId=res-03', {
        headers: { 'X-Reconcile-Secret': reconcileSecret },
      })
    )).json();

    wireSyncNextRouteFetch(h.sandbox, [
      { matchUrlContains: 'limit=2', statusCode: 200, body: p1 },
      { matchUrlContains: 'afterId=', statusCode: 200, body: p2 },
      { matchUrlContains: 'res-01', statusCode: 200, body: f1 },
      { matchUrlContains: 'res-02', statusCode: 200, body: f2 },
      { matchUrlContains: 'res-03', statusCode: 200, body: f3 },
    ]);

    // Simulate clock crossing 4.5-min budget after page 1 fetch
    let ticks = 0;
    const fakeClock = () => {
      ticks++;
      return ticks <= 2 ? 1000 : 1000 + 271000;
    };

    const slice1 = h.sandbox.runNightlySheetReconciliation({ pageSize: 2, nowMs: fakeClock, budgetMs: 270000 });
    expect(slice1).toMatchObject({ status: 'YIELDED_RESUMABLE' });
    expect(slice1.afterId).toBe('res-02');
    // Daily trigger preserved + exactly 1 continuation trigger created
    expect(h.triggers).toHaveLength(2);
    expect(h.primary.rows).toHaveLength(3); // Header only — no premature destructive writes!

    // Slice 2 completes under normal clock and deletes only the continuation trigger
    const slice2 = h.sandbox.runNightlySheetReconciliation({ pageSize: 2 });
    expect(slice2.status).toBe('COMPLETED');
    expect(slice2.stats.inserted).toBe(3);
    expect(h.triggers).toHaveLength(1); // Only daily trigger remains!
    expect(h.propMap.has('RECONCILE_CURSOR_JSON')).toBe(false);
  });

  it('aborts via mass-deletion / empty-DB circuit breaker BEFORE any destructive Sheet writes or Trash/Quarantine moves', async () => {
    const h = createGasHarness({
      initialProps: {
        RECONCILE_ENABLED: 'true',
        APP_BASE_URL: 'https://staging.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
        RECONCILE_ALERT_EMAILS: 'lead@allianceindia.org',
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });

    // Seed 6 valid Sheet rows
    const rows: any[][] = [];
    for (let i = 1; i <= 6; i++) {
      const r = new Array(83).fill('');
      r[0] = `cb-row-${i}`;
      r[8] = `Child ${i}`;
      r[17] = 'Maharashtra';
      rows.push(r);
    }
    h.primary.getRange(4, 1, 6, 83).setValues(rows);

    // Simulate broken/truncated Firestore snapshot returning 0 rows
    wireSyncNextRouteFetch(h.sandbox, [
      {
        statusCode: 200,
        body: {
          status: 'success',
          mode: 'snapshot',
          items: [],
          hasMore: false,
          nextAfterId: null,
        },
      },
    ]);

    const abortRes = h.sandbox.runNightlySheetReconciliation();
    expect(abortRes).toMatchObject({ status: 'CIRCUIT_BREAKER_ABORT' });
    // ALL 6 Sheet rows preserved untouched! Zero quarantined or deleted!
    expect(h.primary.rows).toHaveLength(9); // 3 headers + 6 data rows
    expect(h.sheetsMap.get('Quarantine')).toBeUndefined();
    expect(h.sheetsMap.get('Trash')).toBeUndefined();
    expect(h.emailsSent).toHaveLength(1);
    expect(h.emailsSent[0].subject).toContain('CIRCUIT_BREAKER_ABORT');
  });

  it('does not trigger default ratio breaker below 5 rows, and honors configurable thresholds (<5 rows) fail-closed', () => {
    const baseSheetRows = () => {
      const out: any[][] = [];
      for (let i = 1; i <= 4; i++) {
        const r = new Array(83).fill('');
        r[0] = `sm-${i}`;
        r[8] = `Small ${i}`;
        r[17] = 'Maharashtra';
        out.push(r);
      }
      return out;
    };

    // 4 Sheet rows, 1 active in DB, 3 deleted -> default minDestructiveCount=5 does NOT abort
    const hDefault = createGasHarness({
      initialProps: {
        RECONCILE_ENABLED: 'true',
        APP_BASE_URL: 'https://staging.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });
    hDefault.primary.getRange(4, 1, 4, 83).setValues(baseSheetRows());
    wireSyncNextRouteFetch(hDefault.sandbox, [
      {
        statusCode: 200,
        body: {
          status: 'success',
          mode: 'snapshot',
          items: [{ id: 'sm-1', uniqueId: 'sm-1', rowHash: 'different', isDeleted: false }],
          hasMore: false,
          nextAfterId: null,
        },
      },
      {
        statusCode: 200,
        body: {
          status: 'success',
          mode: 'record',
          record: { id: 'sm-1', uniqueId: 'sm-1', doc: { demographics: { childName: 'Small 1', state: 'Maharashtra' } } },
        },
      },
    ]);
    const defaultSmallRes = hDefault.sandbox.runNightlySheetReconciliation();
    expect(defaultSmallRes.status).toBe('COMPLETED');
    expect(defaultSmallRes.stats.quarantined).toBe(3);

    // Configuring RECONCILE_MIN_DESTRUCTIVE_COUNT=2 and RECONCILE_MAX_DESTRUCTIVE_RATIO=0.40 protects small (<5 row) sheets!
    const hCustom = createGasHarness({
      initialProps: {
        RECONCILE_ENABLED: 'true',
        APP_BASE_URL: 'https://staging.example.org',
        SHEET_RECONCILE_SECRET: reconcileSecret,
        RECONCILE_MIN_DESTRUCTIVE_COUNT: '2',
        RECONCILE_MAX_DESTRUCTIVE_RATIO: '0.40',
      },
      routeHandler: async () => ({ statusCode: 200, body: {} }),
    });
    hCustom.primary.getRange(4, 1, 4, 83).setValues(baseSheetRows());
    wireSyncNextRouteFetch(hCustom.sandbox, [
      {
        statusCode: 200,
        body: {
          status: 'success',
          mode: 'snapshot',
          items: [{ id: 'sm-1', uniqueId: 'sm-1', rowHash: 'different', isDeleted: false }],
          hasMore: false,
          nextAfterId: null,
        },
      },
    ]);
    const customSmallAbort = hCustom.sandbox.runNightlySheetReconciliation();
    expect(customSmallAbort).toMatchObject({ status: 'CIRCUIT_BREAKER_ABORT' });
    expect(hCustom.primary.rows).toHaveLength(7); // 3 headers + all 4 rows untouched!
  });
});
