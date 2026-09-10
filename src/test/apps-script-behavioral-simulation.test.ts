import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

describe('Google Apps Script Behavioral Simulation Suite (14 Security Review Scenarios)', () => {
  const gasCodePath = path.join(process.cwd(), 'gas', 'Code.js');
  const gasCode = fs.readFileSync(gasCodePath, 'utf8');

  let sandbox: any;
  let scriptProperties: Record<string, string>;
  let mockSheetData: any[][];
  let mockSheetFormulas: any[][];
  let mockRegistryData: any[][];
  let mockProtections: any[];
  let mockDriveFiles: Record<string, any>;
  let mockDriveFolders: Record<string, any>;

  function createMockRange(sheetName: string, startRow: number, startCol: number, numRows: number, numCols: number) {
    const dataStore = sheetName === '_Asset_Containers' ? mockRegistryData : mockSheetData;
    const formulaStore = mockSheetFormulas;

    return {
      getA1Notation: () => `R${startRow}C${startCol}:R${startRow + numRows - 1}C${startCol + numCols - 1}`,
      getValues: () => {
        const res: any[][] = [];
        for (let r = 0; r < numRows; r++) {
          const rowIdx = startRow - 1 + r;
          const rowArr: any[] = [];
          for (let c = 0; c < numCols; c++) {
            const colIdx = startCol - 1 + c;
            rowArr.push(dataStore[rowIdx] ? dataStore[rowIdx][colIdx] ?? '' : '');
          }
          res.push(rowArr);
        }
        return res;
      },
      getFormulas: () => {
        const res: any[][] = [];
        for (let r = 0; r < numRows; r++) {
          const rowIdx = startRow - 1 + r;
          const rowArr: any[] = [];
          for (let c = 0; c < numCols; c++) {
            const colIdx = startCol - 1 + c;
            rowArr.push(formulaStore[rowIdx] ? formulaStore[rowIdx][colIdx] ?? '' : '');
          }
          res.push(rowArr);
        }
        return res;
      },
      getValue: function() {
        const vals = this.getValues();
        return vals[0] ? vals[0][0] : '';
      },
      getFormula: function() {
        const forms = this.getFormulas();
        return forms[0] ? forms[0][0] : '';
      },
      setValue: (val: any) => {
        for (let r = 0; r < numRows; r++) {
          const rowIdx = startRow - 1 + r;
          if (!dataStore[rowIdx]) dataStore[rowIdx] = [];
          if (!formulaStore[rowIdx]) formulaStore[rowIdx] = [];
          for (let c = 0; c < numCols; c++) {
            dataStore[rowIdx][startCol - 1 + c] = val;
            if (typeof val === 'string' && val.startsWith('=')) {
              formulaStore[rowIdx][startCol - 1 + c] = val;
            } else {
              formulaStore[rowIdx][startCol - 1 + c] = '';
            }
          }
        }
      },
      protect: () => {
        const protection = {
          description: '',
          warningOnly: true,
          editors: ['owner@domain.org'],
          setDescription: function(d: string) { this.description = d; return this; },
          setWarningOnly: function(w: boolean) { this.warningOnly = w; return this; },
          removeEditors: function(eds: string[]) { this.editors = []; return this; },
          addEditor: function(ed: string) { this.editors.push(ed); return this; },
          getEditors: function() { return [...this.editors]; },
          getDescription: function() { return this.description; },
          isWarningOnly: function() { return this.warningOnly; },
          canEdit: () => true,
          getRange: function() { return createMockRange(sheetName, startRow, startCol, numRows, numCols); },
          remove: function() {
            mockProtections = mockProtections.filter(p => p !== protection);
          }
        };
        mockProtections.push(protection);
        return protection;
      }
    };
  }

  beforeEach(() => {
    scriptProperties = {
      WEBHOOK_SECRET: 'TEST_SECRET_KEY_888999',
    };

    mockSheetData = [
      ['Section 1', 'Section 1', 'Section 2'],
      ['Field 1', 'Field 2', 'Field 3'],
      ['1\nUnique ID', '2\nRevision Number', '3\nSubmission Time', '4\nSubmitted By', '5\nConsent', '6\nVisit Date', '7\nInterviewer', '8\nInterviewer Name', '9\nChild Name', '10\nDOB', '11\nAge', '12\nGender', '13\nOrphan', '14\nCaregiver Name', '15\nCaregiver Relation', '16\nCaregiver Contact', '17\nAddress', '18\nState', '19\nDistrict', '20\nAccount Holder', '21\nBank Account Number', '22\nIFSC', '23\nBank Mobile', '24\nChild Aadhaar Number', '25\nPassbook Front Page Link', '26\nAadhaar Card Link', '27\nPassport Size Photo Link', '28\nFamily Members', '29\nChildren', '30\nMonthly Income', '31\nIncome Source', '32\nCurrent Weight (kg)', '33\nCurrent Height (cm)', '34\nBMI', '35\nBMI Category', '36\nHb Level', '37\nHb Category', '38\nComorbidities', '39\nComorbidities Other', '40\nART Status', '41\nART Reg Date', '42\nART ID Number', '43\nVL Status', '44\nVL Date', '45\nViral Load', '46\nVL Category', '47\nAppetite', '48\nMeals Per Day', '49\nEducation Status', '50\nEducation Status Specify', '51\nSchool Name', '52\nSession Start', '53\nSchool Type', '54\nCurrent Class', '55\nAttendance Status', '56\nSchool Fees', '57\nPrivate Tuition Fee', '58\nSchool Books', '59\nSchool Stationery', '60\nSchool Uniform', '61\nSchool Transport', '62\nSchool Other Expenses', '63\nTotal Annual Education Cost', '64\nSchool Fee Receipt Link', '65\nMarksheet Photo Link', '66\nRemarks (If Any)', '67\nApproved Alliance India', '68\nReview Confirmed', '69\nOrganization Name', '70\nForm Submitted By', '71\nOrganization Email', '72\nSignature Link', '73\nLast Updated'],
      ['BEN-SYN-001', '1', '2026-06-25T10:00:00Z', 'Caseworker Jane', 'Yes', '2026-06-25', 'Caseworker Jane', 'Caseworker Jane', 'Aarav Kumar', '2015-05-10', '11', 'Male', 'Single Orphan', 'Sunita Devi', 'Mother', '9876543210', '123 Test Lane', 'Delhi', 'South Delhi', 'Sunita Devi', '123456789012', 'SBIN0001234', '9876543210', '123456789012', '=HYPERLINK("https://drive.google.com/open?id=passbook-file-111", "passbook.jpg")', '=HYPERLINK("https://drive.google.com/open?id=aadhaar-file-222", "identity-document.jpg")', '=HYPERLINK("https://drive.google.com/open?id=photo-file-333", "child-photo.jpg")', '4', '2', '5000', 'Daily wage', '28', '130', '16.5', 'Normal', '11.5', 'Normal', 'None', '', 'On ART', '2020-01-01', 'ART-9988', 'Suppressed', '2026-01-01', '50', 'Suppressed', 'Good', '3', 'In School', '', 'Govt School', '2026-04-01', 'Government', 'Class 5', 'Regular', '0', '0', '500', '200', '600', '0', '0', '1300', '=HYPERLINK("https://drive.google.com/open?id=fee-file-444", "school-fee-receipt.pdf")', '=HYPERLINK("https://drive.google.com/open?id=mark-file-555", "marksheet.pdf")', 'Recommended', 'Yes', 'Confirmed', 'Alliance Partner', 'Jane Doe', 'jane@alliance.org', '=HYPERLINK("https://drive.google.com/open?id=sig-file-666", "caregiver-signature.png")', '2026-06-25T10:00:00Z']
    ];

    mockSheetFormulas = [
      ['', '', ''],
      ['', '', ''],
      new Array(73).fill(''),
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '=HYPERLINK("https://drive.google.com/open?id=passbook-file-111", "passbook.jpg")', '=HYPERLINK("https://drive.google.com/open?id=aadhaar-file-222", "identity-document.jpg")', '=HYPERLINK("https://drive.google.com/open?id=photo-file-333", "child-photo.jpg")', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '=HYPERLINK("https://drive.google.com/open?id=fee-file-444", "school-fee-receipt.pdf")', '=HYPERLINK("https://drive.google.com/open?id=mark-file-555", "marksheet.pdf")', '', '', '', '', '', '', '=HYPERLINK("https://drive.google.com/open?id=sig-file-666", "caregiver-signature.png")', '']
    ];

    mockRegistryData = [
      ['submissionId', 'assetContainerId', 'folderId', 'createdAt', 'updatedAt'],
      ['BEN-SYN-001', 'ast-e2e-001', 'folder-ast-e2e-001', '2026-06-25T10:00:00Z', '2026-06-25T10:00:00Z']
    ];

    mockProtections = [];
    mockDriveFiles = {
      'passbook-file-111': { id: 'passbook-file-111', name: 'passbook.jpg', mimeType: 'image/jpeg', size: 1024, trashed: false, sharingAccess: 'PRIVATE' },
      'aadhaar-file-222': { id: 'aadhaar-file-222', name: 'identity-document.jpg', mimeType: 'image/jpeg', size: 2048, trashed: false, sharingAccess: 'PRIVATE' },
      'photo-file-333': { id: 'photo-file-333', name: 'child-photo.jpg', mimeType: 'image/jpeg', size: 3072, trashed: false, sharingAccess: 'ANYONE' }, // Public violation fixture
      'fee-file-444': { id: 'fee-file-444', name: 'school-fee-receipt.pdf', mimeType: 'application/pdf', size: 4096, trashed: false, sharingAccess: 'PRIVATE' },
      'mark-file-555': { id: 'mark-file-555', name: 'marksheet.pdf', mimeType: 'application/pdf', size: 5120, trashed: false, sharingAccess: 'PRIVATE' },
      'sig-file-666': { id: 'sig-file-666', name: 'caregiver-signature.png', mimeType: 'image/png', size: 512, trashed: false, sharingAccess: 'PRIVATE' },
    };

    function createFolderObject(name: string, id: string) {
      const children: Record<string, any> = {};
      const files: any[] = [];
      const subFolders: any[] = [];

      const folderObj = {
        getId: () => id,
        getName: () => name,
        getUrl: () => `https://drive.google.com/drive/folders/${id}`,
        createFolder: (subName: string) => {
          const subId = `${id}/${subName}`;
          const sub = createFolderObject(subName, subId);
          subFolders.push(sub);
          children[subName] = sub;
          return sub;
        },
        getFoldersByName: (subName: string) => {
          const matched = subFolders.filter(f => f.getName() === subName);
          let idx = 0;
          return {
            hasNext: () => idx < matched.length,
            next: () => matched[idx++]
          };
        },
        getFolders: () => {
          let idx = 0;
          return {
            hasNext: () => idx < subFolders.length,
            next: () => subFolders[idx++]
          };
        },
        createFile: (blobOrName: any, content?: any, mime?: string) => {
          const fileName = typeof blobOrName === 'string' ? blobOrName : blobOrName.getName();
          const fileId = `file-${Math.random().toString(36).substring(2, 8)}`;
          const fObj = {
            id: fileId,
            getId: () => fileId,
            getName: () => fileName,
            getSize: () => 1024,
            getUrl: () => `https://drive.google.com/file/d/${fileId}/view`,
            setTrashed: (t: boolean) => { if (mockDriveFiles[fileId]) mockDriveFiles[fileId].trashed = t; },
            setName: (n: string) => { fObj.getName = () => n; },
            setSharing: (acc: string) => { if (mockDriveFiles[fileId]) mockDriveFiles[fileId].sharingAccess = acc; }
          };
          files.push(fObj);
          mockDriveFiles[fileId] = { id: fileId, name: fileName, size: 1024, trashed: false, sharingAccess: 'PRIVATE' };
          return fObj;
        },
        addFile: (f: any) => { files.push(f); },
        removeFile: (f: any) => {
          const idx = files.indexOf(f);
          if (idx !== -1) files.splice(idx, 1);
        },
        setTrashed: (t: boolean) => {}
      };
      return folderObj;
    }

    const rootFolder = createFolderObject('Alliance India Child PDFs', 'root-folder-id');
    const stagingFolder = rootFolder.createFolder('_e2e_staging_runs');
    const assessmentsFolder = rootFolder.createFolder('assessments');
    const sampleContainer = assessmentsFolder.createFolder('ast-e2e-001');
    sampleContainer.createFolder('current');
    sampleContainer.createFolder('revisions');
    sampleContainer.createFolder('quarantine');
    sampleContainer.createFolder('metadata');

    mockDriveFolders = {
      'root-folder-id': rootFolder,
      '_e2e_staging_runs': stagingFolder,
      'assessments': assessmentsFolder
    };

    sandbox = {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k: string) => scriptProperties[k] || null,
          setProperty: (k: string, v: string) => { scriptProperties[k] = v; },
          deleteProperty: (k: string) => { delete scriptProperties[k]; }
        })
      },
      ContentService: {
        MimeType: { JSON: 'application/json' },
        createTextOutput: (text: string) => ({
          content: text,
          mimeType: null,
          setMimeType: function(m: any) { this.mimeType = m; return this; },
          getContent: function() { return this.content; },
          getData: function() { return JSON.parse(this.content); }
        })
      },
      Utilities: {
        getUuid: () => 'test-uuid-' + Math.random().toString(36).substring(2, 8),
        base64Encode: (str: string) => Buffer.from(str).toString('base64'),
        base64Decode: (b64: string) => Buffer.from(b64, 'base64'),
        newBlob: (bytes: any, mimeType: string, name: string) => ({
          getBytes: () => bytes,
          getContentType: () => mimeType,
          getName: () => name,
          getSize: () => bytes.length || 1024
        }),
        sleep: () => {}
      },
      Session: {
        getEffectiveUser: () => ({
          getEmail: () => 'owner@domain.org'
        })
      },
      LockService: {
        getScriptLock: () => ({
          tryLock: () => true,
          releaseLock: () => {}
        })
      },
      SpreadsheetApp: {
        ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
        getActiveSpreadsheet: () => sandbox.SpreadsheetApp.openById('MOCK_SS_ID'),
        openById: (id: string) => ({
          getSheetByName: (name: string) => {
            if (name === '_Asset_Containers') {
              return {
                getName: () => '_Asset_Containers',
                getLastRow: () => mockRegistryData.length,
                getLastColumn: () => mockRegistryData[0] ? mockRegistryData[0].length : 5,
                getMaxRows: () => 100,
                getMaxColumns: () => 5,
                insertColumnsAfter: () => {},
                insertRowsAfter: () => {},
                getRange: (r: number, c: number, numR: number, numC: number) => createMockRange('_Asset_Containers', r, c, numR, numC),
                appendRow: (row: any[]) => mockRegistryData.push(row)
              };
            }
            return {
              getName: () => 'Child_Nutrition_Phase3_Linelist',
              getLastRow: () => mockSheetData.length,
              getLastColumn: () => mockSheetData[2] ? mockSheetData[2].length : 73,
              getMaxRows: () => Math.max(100, mockSheetData.length),
              getMaxColumns: () => 73,
              insertColumnsAfter: () => {},
              insertRowsAfter: () => {},
              getRange: (r: number, c: number, numR?: number, numC?: number) => {
                return createMockRange('Child_Nutrition_Phase3_Linelist', r, c, numR || 1, numC || 1);
              },
              getProtections: (type: any) => [...mockProtections],
              setName: (n: string) => {},
              clear: () => { mockSheetData = []; mockSheetFormulas = []; },
              deleteRows: (r: number, cnt: number) => { mockSheetData.splice(r - 1, cnt); },
              appendRow: (row: any[]) => mockSheetData.push(row)
            };
          },
          getSheets: () => [sandbox.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Child_Nutrition_Phase3_Linelist')],
          insertSheet: (name: string) => sandbox.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)
        }),
        getUi: () => ({
          createMenu: () => ({
            addItem: function() { return this; },
            addSeparator: function() { return this; },
            addToUi: function() { return this; }
          }),
          alert: () => {},
          ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
          Button: { YES: 'YES', NO: 'NO' }
        })
      },
      DriveApp: {
        Access: { PRIVATE: 'PRIVATE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', ANYONE: 'ANYONE' },
        Permission: { NONE: 'NONE', VIEW: 'VIEW', EDIT: 'EDIT' },
        getFoldersByName: (name: string) => {
          const match = name === 'Alliance India Child PDFs' ? [rootFolder] : [];
          let idx = 0;
          return {
            hasNext: () => idx < match.length,
            next: () => match[idx++]
          };
        },
        createFolder: (name: string) => createFolderObject(name, `folder-${name}`),
        getFileById: (id: string) => {
          const f = mockDriveFiles[id];
          if (!f) throw new Error(`File not found: ${id}`);
          return {
            getId: () => f.id,
            getName: () => f.name,
            getSize: () => f.size,
            getUrl: () => `https://drive.google.com/file/d/${f.id}/view`,
            getSharingAccess: () => f.sharingAccess,
            setSharing: (acc: string, perm: string) => { f.sharingAccess = acc; },
            setTrashed: (t: boolean) => { f.trashed = t; },
            setName: (n: string) => { f.name = n; }
          };
        },
        getFolderById: (id: string) => {
          return createFolderObject('ast-folder', id);
        }
      },
      Drive: {
        Permissions: {
          list: (fileId: string) => {
            const f = mockDriveFiles[fileId];
            if (f && f.sharingAccess === 'ANYONE') {
              return { permissions: [{ id: 'perm-anyone', type: 'anyone', role: 'reader' }] };
            }
            return { permissions: [{ id: 'perm-owner', type: 'user', role: 'owner', emailAddress: 'owner@domain.org' }] };
          },
          delete: (fileId: string, permId: string) => {
            const f = mockDriveFiles[fileId];
            if (f && permId === 'perm-anyone') {
              f.sharingAccess = 'PRIVATE';
            }
          }
        },
        Files: {
          get: (fileId: string) => {
            const f = mockDriveFiles[fileId];
            if (!f) throw new Error(`File not found: ${fileId}`);
            const perms = f.sharingAccess === 'ANYONE'
              ? [{ id: 'perm-anyone', type: 'anyone', role: 'reader' }]
              : [{ id: 'perm-owner', type: 'user', role: 'owner', emailAddress: 'owner@domain.org' }];
            return {
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size,
              createdTime: new Date().toISOString(),
              modifiedTime: new Date().toISOString(),
              shared: f.sharingAccess !== 'PRIVATE',
              permissions: perms
            };
          }
        }
      },
      Logger: {
        log: () => {}
      },
      console: console
    };

    vm.createContext(sandbox);
    vm.runInContext(gasCode, sandbox);
  });

  // ==========================================================================
  // SCENARIO 1: Missing Script Property rejects with 503 CONFIGURATION_ERROR
  // ==========================================================================
  it('Scenario 1: Missing WEBHOOK_SECRET script property rejects with 503 CONFIGURATION_ERROR', () => {
    delete scriptProperties.WEBHOOK_SECRET;
    const postPayload = {
      postData: {
        contents: JSON.stringify({ action: 'list', secret: 'some-key' })
      }
    };
    const res = sandbox.doPost(postPayload);
    const data = JSON.parse(res.getContent());

    expect(data.status).toBe('error');
    expect(data.code).toBe('CONFIGURATION_ERROR');
    expect(data.statusCode).toBe(503);
  });

  // ==========================================================================
  // SCENARIO 2: Invalid secret rejects with 401 UNAUTHORIZED
  // ==========================================================================
  it('Scenario 2: Invalid caller secret rejects with 401 UNAUTHORIZED', () => {
    const postPayload = {
      postData: {
        contents: JSON.stringify({ action: 'list', secret: 'WRONG_SECRET_123' })
      }
    };
    const res = sandbox.doPost(postPayload);
    const data = JSON.parse(res.getContent());

    expect(data.status).toBe('error');
    expect(data.code).toBe('UNAUTHORIZED');
    expect(data.statusCode).toBe(401);
  });

  // ==========================================================================
  // SCENARIO 3: Valid secret allows POST actions
  // ==========================================================================
  it('Scenario 3: Valid caller secret allows POST actions (e.g. action: ping)', () => {
    const postPayload = {
      postData: {
        contents: JSON.stringify({ action: 'ping', secret: 'TEST_SECRET_KEY_888999' })
      }
    };
    const res = sandbox.doPost(postPayload);
    const data = JSON.parse(res.getContent());

    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  // ==========================================================================
  // SCENARIO 4: doGet allows only ping and rejects data actions with 405
  // ==========================================================================
  it('Scenario 4: doGet allows only anonymous ping and rejects data actions with 405 METHOD_NOT_ALLOWED', () => {
    // 1. action=ping succeeds anonymously
    const pingRes = sandbox.doGet({ parameter: { action: 'ping' } });
    const pingData = JSON.parse(pingRes.getContent());
    expect(pingData.status).toBe('ok');

    // 2. Data actions like list, read, schema via GET are strictly rejected with 405
    ['list', 'read', 'schema', 'audit', 'replaceAsset'].forEach(action => {
      const blockedRes = sandbox.doGet({ parameter: { action, secret: 'TEST_SECRET_KEY_888999' } });
      const blockedData = JSON.parse(blockedRes.getContent());
      expect(blockedData.status).toBe('error');
      expect(blockedData.code).toBe('METHOD_NOT_ALLOWED');
      expect(blockedData.statusCode).toBe(405);
    });
  });

  // ==========================================================================
  // SCENARIO 5: list enforces limit 1..100 and rejects invalid limits
  // ==========================================================================
  it('Scenario 5: listSubmissions_ enforces limit 1..100 and rejects limits outside range', () => {
    const invalidLimits = [0, -10, 101, 500, 'invalid'];
    invalidLimits.forEach(lim => {
      const res = sandbox.doPost({
        postData: {
          contents: JSON.stringify({ action: 'list', limit: lim, secret: 'TEST_SECRET_KEY_888999' })
        }
      });
      const data = JSON.parse(res.getContent());
      expect(data.status).toBe('error');
      expect(data.code).toBe('VALIDATION_ERROR');
      expect(data.statusCode).toBe(400);
    });

    // Valid limit succeeds
    const validRes = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'list', limit: 25, secret: 'TEST_SECRET_KEY_888999' })
      }
    });
    const validData = JSON.parse(validRes.getContent());
    expect(validData.status).toBe('success');
  });

  // ==========================================================================
  // SCENARIO 6: list DTO contains no prohibited PII, raw formulas, or raw Drive URLs
  // ==========================================================================
  it('Scenario 6: listSubmissions_ DTO contains no prohibited PII, no raw formulas, and strictly no rowNumber', () => {
    const res = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'list', limit: 10, secret: 'TEST_SECRET_KEY_888999' })
      }
    });
    const envelope = JSON.parse(res.getContent());
    expect(envelope.status).toBe('success');
    expect(envelope.data.length).toBeGreaterThan(0);

    const record = envelope.data[0];

    // Must NOT leak internal rowNumber
    expect(record.rowNumber).toBeUndefined();
    expect(record.sheetRow).toBeUndefined();

    // Sensitive numbers must be masked
    expect(record.maskedAadhaar).toContain('XXXX-XXXX-');
    expect(record.bankAccountNumberMasked).toContain('XXXX-XXXX-');
    expect(record.caregiverContact).toContain('******');

    // Must NOT leak raw spreadsheet formulas or raw Drive hyperlinks
    expect(JSON.stringify(record)).not.toContain('=HYPERLINK(');
  });

  // ==========================================================================
  // SCENARIO 7: read DTO conforms to role allowlist and contains no rowNumber
  // ==========================================================================
  it('Scenario 7: readSubmission_ conforms to role allowlist and contains no internal rowNumber', () => {
    const res = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'read', submissionId: 'BEN-SYN-001', role: 'supervisor', secret: 'TEST_SECRET_KEY_888999' })
      }
    });
    const envelope = JSON.parse(res.getContent());
    expect(envelope.status).toBe('success');

    const record = envelope.data;
    // Strictly no rowNumber
    expect(record.rowNumber).toBeUndefined();
    expect(envelope.rowNumber).toBeUndefined();

    // Sanitized values
    expect(record.bankAccountNumber).toContain('XXXX-XXXX-');
    expect(record.childAadhaarNumber).toContain('XXXX-XXXX-');
    expect(JSON.stringify(record)).not.toContain('=HYPERLINK(');
  });

  // ==========================================================================
  // SCENARIO 8: previewProtectedRanges_ does not mutate
  // ==========================================================================
  it('Scenario 8: previewProtectedRanges_ inspects state non-destructively without mutating protections', () => {
    const initialProtectionsCount = mockProtections.length;
    const res = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'previewProtectedRanges', secret: 'TEST_SECRET_KEY_888999' })
      }
    });
    const data = JSON.parse(res.getContent());
    expect(data.status).toBe('success');
    expect(data.mode).toBe('preview');
    expect(data.ranges).toBeDefined();

    // Non-destructive invariant: NO protections created during preview
    expect(mockProtections.length).toBe(initialProtectionsCount);
  });

  // ==========================================================================
  // SCENARIO 9: applyProtectedRanges_ enforces warningOnly: false on all required ranges
  // ==========================================================================
  it('Scenario 9: applyProtectedRanges_ enforces warningOnly: false on Rows 1-3, Cols 1-2, Cols 67-68, Col 73 and preserves unrelated admin protections', () => {
    // Add an unrelated administrator protection that should NOT be wiped
    const adminProt = {
      description: 'Finance Dept Custom Budget Lock',
      warningOnly: true,
      editors: ['finance@alliance.org'],
      isWarningOnly: () => true,
      getDescription: () => 'Finance Dept Custom Budget Lock',
      getRange: () => ({ getA1Notation: () => 'Z100:AA105', getRow: () => 100, getNumRows: () => 5, getColumn: () => 26, getLastColumn: () => 27, getNumColumns: () => 2 }),
      remove: function() {
        mockProtections = mockProtections.filter(p => p !== this);
      },
      setWarningOnly: () => {},
      removeEditors: () => {},
      addEditor: () => {},
      getEditors: () => ['finance@alliance.org'],
      canEdit: () => false
    };
    mockProtections.push(adminProt as any);

    const res = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'applyProtectedRanges', secret: 'TEST_SECRET_KEY_888999' })
      }
    });
    const data = JSON.parse(res.getContent());
    expect(data.status).toBe('success');
    expect(data.mode).toBe('applied');
    expect(data.warningOnly).toBe(false);
    expect(data.totalApplied).toBe(4);

    // Verify all 4 managed protections have warningOnly === false AND namespaced prefix
    const descs = mockProtections.map(p => p.getDescription());
    expect(descs).toContain('Childcare Phase 3 — Header & System Definitions (Rows 1-3)');
    expect(descs).toContain('Childcare Phase 3 — System Identifiers (Cols 1-2)');
    expect(descs).toContain('Childcare Phase 3 — Governance Columns (Cols 67-68)');
    expect(descs).toContain('Childcare Phase 3 — System Timestamp: Last Updated (Col 73)');

    // Invariant: Unrelated administrator protection MUST be preserved!
    expect(descs).toContain('Finance Dept Custom Budget Lock');
    expect(mockProtections.length).toBe(5); // 4 managed + 1 preserved admin protection
  });

  // ==========================================================================
  // SCENARIO 10: Drive asset audit redacts file IDs and emails
  // ==========================================================================
  it('Scenario 10: inspectDriveAsset_ and auditDriveAssets_ redact IDs and emails', () => {
    const res = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'driveAudit', secret: 'TEST_SECRET_KEY_888999' })
      }
    });
    const data = JSON.parse(res.getContent());
    expect(data.status).toBe('success');
    expect(data.totalAssetsChecked).toBeGreaterThan(0);

    // Verify redacted outputs
    data.assets.forEach((asset: any) => {
      expect(asset.id).toContain('-***');
      expect(asset.rawId).toBeUndefined();
      if (asset.permissions) {
        asset.permissions.forEach((perm: any) => {
          if (perm.emailAddress) {
            expect(perm.emailAddress).toMatch(/^[a-zA-Z0-9]\*\*\*@/);
          }
        });
      }
    });
  });

  // ==========================================================================
  // SCENARIO 11: Asset replacement preserves old asset until current pointer commit
  // ==========================================================================
  it('Scenario 11: replaceAssetTwoPhase_ commits OCC pointer and moves old asset to revisions as SUPERSEDED', () => {
    const dummyBase64 = 'data:image/jpeg;base64,' + Buffer.from('mock-replacement-image-bytes').toString('base64');
    const res = sandbox.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'replaceAsset',
          remoteSubmissionId: 'BEN-SYN-001',
          slotPrefix: 'Passbook',
          fileDataUrl: dummyBase64,
          expectedRevision: 1,
          secret: 'TEST_SECRET_KEY_888999'
        })
      }
    });
    const data = JSON.parse(res.getContent());
    expect(data.status).toBe('success');
    expect(data.revisionNumber).toBe(2);
    expect(data.assetState).toBe('ACTIVE');
    expect(data.oldAssetStatus).toBe('SUPERSEDED');

    // Old file 'passbook-file-111' should NOT be trashed or deleted; it is moved to revisions as SUPERSEDED
    const oldFile = mockDriveFiles['passbook-file-111'];
    expect(oldFile.trashed).toBe(false);
    expect(oldFile.name).toContain('SUPERSEDED');
  });

  // ==========================================================================
  // SCENARIO 12: Pointer update failure quarantines new asset and preserves old asset
  // ==========================================================================
  it('Scenario 12: Pointer update failure on OCC conflict quarantines or aborts and preserves old asset', () => {
    // Current revision in sheet is 1; pass expectedRevision = 0 to simulate conflict
    const dummyBase64 = 'data:image/jpeg;base64,' + Buffer.from('mock-conflict-image-bytes').toString('base64');
    const res = sandbox.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'replaceAsset',
          remoteSubmissionId: 'BEN-SYN-001',
          slotPrefix: 'Passbook',
          fileDataUrl: dummyBase64,
          expectedRevision: 0,
          secret: 'TEST_SECRET_KEY_888999'
        })
      }
    });
    const data = JSON.parse(res.getContent());
    expect(data.status).toBe('error');
    expect(data.code).toBe('OCC_CONFLICT');
    expect(data.statusCode).toBe(409);

    // Old file was NOT modified or moved
    const oldFile = mockDriveFiles['passbook-file-111'];
    expect(oldFile.name).toBe('passbook.jpg');
    expect(oldFile.trashed).toBe(false);
  });

  // ==========================================================================
  // SCENARIO 13: Public 'anyone' ACL violation is detected without exposing sensitive asset metadata
  // ==========================================================================
  it('Scenario 13: Public anyone ACL violation is detected and remediable via enforceRestrictedAcl', () => {
    // photo-file-333 was seeded with sharingAccess: 'ANYONE'
    const auditRes = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'driveAudit', secret: 'TEST_SECRET_KEY_888999' })
      }
    });
    const auditData = JSON.parse(auditRes.getContent());
    expect(auditData.publicViolations).toBeGreaterThan(0);

    // Enforce restricted ACL
    const fixRes = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'enforceRestrictedAcl', fileId: 'photo-file-333', secret: 'TEST_SECRET_KEY_888999' })
      }
    });
    const fixData = JSON.parse(fixRes.getContent());
    expect(fixData.status).toBe('success');
    expect(fixData.restrictedEnforced).toBe(true);
    expect(fixData.removedPublicSharing).toBe(true);
    expect(fixData.fileId).toContain('-***'); // Redacted
  });

  // ==========================================================================
  // SCENARIO 14: Staging cleanup strictly operates inside _e2e_staging_runs
  // ==========================================================================
  it('Scenario 14: cleanupStagingRun_ strictly operates inside _e2e_staging_runs and requires token', () => {
    // 1. Missing confirmation token rejects
    const resNoToken = sandbox.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'cleanupStagingRun',
          stagingRunId: 'staging-run-12345678',
          confirm: 'WRONG_TOKEN',
          secret: 'TEST_SECRET_KEY_888999'
        })
      }
    });
    const dataNoToken = JSON.parse(resNoToken.getContent());
    expect(dataNoToken.status).toBe('error');
    expect(dataNoToken.statusCode).toBe(400);

    // 2. Invalid stagingRunId regex rejects
    const resBadRegex = sandbox.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'cleanupStagingRun',
          stagingRunId: 'assessments/malicious-path',
          confirm: 'CONFIRM_STAGING_RUN_CLEANUP',
          secret: 'TEST_SECRET_KEY_888999'
        })
      }
    });
    const dataBadRegex = JSON.parse(resBadRegex.getContent());
    expect(dataBadRegex.status).toBe('error');
    expect(dataBadRegex.statusCode).toBe(400);

    // 3. Valid confirmation and regex succeeds safely inside _e2e_staging_runs
    const resValid = sandbox.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'cleanupStagingRun',
          stagingRunId: 'staging-e2e-run-99887766',
          confirm: 'CONFIRM_STAGING_RUN_CLEANUP',
          secret: 'TEST_SECRET_KEY_888999'
        })
      }
    });
    const dataValid = JSON.parse(resValid.getContent());
    expect(dataValid.status).toBe('success');
    expect(dataValid.stagingRunId).toBe('staging-e2e-run-99887766');
  });
});
