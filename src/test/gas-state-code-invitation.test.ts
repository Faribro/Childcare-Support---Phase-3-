import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { STATE_CATALOG } from '@/lib/constants/stateCatalog';

const require = createRequire(import.meta.url);
// Load jsdom via typed require because @types/jsdom is not installed in devDependencies
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, opts?: Record<string, unknown>) => { window: Window & typeof globalThis };
};

describe('Google Apps Script Staff Access -> State Code Invitation Menu, Modal, & Security Controls', () => {
  const codeJsPath = path.join(process.cwd(), 'gas', 'Code.js');
  const inviteJsPath = path.join(process.cwd(), 'gas', 'StateCodeInvitation.js');
  const dialogHtmlPath = path.join(process.cwd(), 'gas', 'StateInvitationDialog.html');
  const adminDialogHtmlPath = path.join(process.cwd(), 'gas', 'AdminAccessDialog.html');

  const codeJs = fs.readFileSync(codeJsPath, 'utf8');
  const inviteJs = fs.readFileSync(inviteJsPath, 'utf8');
  const dialogHtmlRaw = fs.readFileSync(dialogHtmlPath, 'utf8');
  const adminDialogHtmlRaw = fs.readFileSync(adminDialogHtmlPath, 'utf8');

  let sandbox: any;
  let scriptProperties: Record<string, string>;
  let menusCreated: Array<{ title: string; items: Array<{ label: string; fn: string }> }>;
  let toastsShown: Array<{ message: string; title: string }>;
  let shownDialogs: Array<{ title: string; html: string }>;
  let sheetTabs: Record<string, any[][]>;
  let activeUserEmail: string;
  let effectiveUserEmail: string;
  let fetchCalls: Array<{ url: string; options: any }>;
  let nextFetchResponse: { statusCode: number; body: Record<string, any> };

  function makeSheetMock(tabName: string) {
    return {
      getName: () => tabName,
      getLastRow: () => (sheetTabs[tabName] ? sheetTabs[tabName].length : 0),
      setFrozenRows: () => {},
      getRange: (row: number, col: number, numRows: number, numCols: number) => ({
        setValues: (vals: any[][]) => {
          if (!sheetTabs[tabName]) sheetTabs[tabName] = [];
          for (let r = 0; r < numRows; r++) {
            const idx = row - 1 + r;
            if (!sheetTabs[tabName][idx]) sheetTabs[tabName][idx] = [];
            for (let c = 0; c < numCols; c++) {
              sheetTabs[tabName][idx][col - 1 + c] = vals[r][c];
            }
          }
        },
      }),
      appendRow: (rowVals: any[]) => {
        if (!sheetTabs[tabName]) sheetTabs[tabName] = [];
        sheetTabs[tabName].push(rowVals);
      },
    };
  }

  beforeEach(() => {
    scriptProperties = {
      APP_ENV: 'staging',
      APP_BASE_URL: 'https://csc-staging.example.run.app',
      SHEET_INVITATION_BRIDGE_SECRET: 'bridge-secret-value-min-32-chars!!',
      WEBHOOK_SECRET: 'other-webhook-secret-must-never-leak!!',
    };
    menusCreated = [];
    toastsShown = [];
    shownDialogs = [];
    sheetTabs = {};
    activeUserEmail = 'rajiv.menon@example.org';
    effectiveUserEmail = 'sheet.owner@example.org';
    fetchCalls = [];
    nextFetchResponse = {
      statusCode: 201,
      body: {
        status: 'success',
        invitation: {
          id: 'st_acc_123',
          invitedEmail: 'invitee@example.org',
          assignedState: 'Maharashtra',
        },
        emailDispatched: true,
        remainingDailyQuota: 1492,
        adminNotifiedCount: 4,
      },
    };

    const spreadsheetMock = {
      getSheetByName: (name: string) => (sheetTabs[name] ? makeSheetMock(name) : null),
      insertSheet: (name: string) => {
        sheetTabs[name] = [];
        return makeSheetMock(name);
      },
      toast: (message: string, title: string) => {
        toastsShown.push({ message, title });
      },
    };

    const menuBuilder = (title: string) => {
      const entry = { title, items: [] as Array<{ label: string; fn: string }> };
      const builder: any = {
        addItem: (label: string, fn: string) => {
          entry.items.push({ label, fn });
          return builder;
        },
        addSeparator: () => builder,
        addToUi: () => {
          menusCreated.push(entry);
        },
      };
      return builder;
    };

    sandbox = {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k: string) => scriptProperties[k] || null,
          getProperties: () => ({ ...scriptProperties }),
          setProperty: (k: string, v: string) => {
            scriptProperties[k] = v;
          },
        }),
      },
      Session: {
        getActiveUser: () => ({ getEmail: () => activeUserEmail }),
        getEffectiveUser: () => ({ getEmail: () => effectiveUserEmail }),
      },
      LockService: {
        getScriptLock: () => ({
          tryLock: () => true,
          releaseLock: () => {},
        }),
      },
      Utilities: {
        formatDate: () => '2026-11-26 11:30:00',
        getUuid: () => 'uuid-test-123',
      },
      SpreadsheetApp: {
        getActiveSpreadsheet: () => spreadsheetMock,
        getUi: () => ({
          createMenu: menuBuilder,
          showModalDialog: (htmlOutput: any, title: string) => {
            shownDialogs.push({ title, html: htmlOutput.getContent() });
          },
        }),
      },
      HtmlService: {
        createTemplateFromFile: (file: string) => {
          expect(['StateInvitationDialog', 'AdminAccessDialog']).toContain(file);
          const tpl: any = {
            stateCatalogJson: '[]',
            adminContactsJson: '[]',
            initialLoadErrorJson: '""',
            activeSenderHint: '',
            evaluate: () => {
              const rendered =
                file === 'AdminAccessDialog'
                  ? adminDialogHtmlRaw
                      .replace('<?!= adminContactsJson ?>', tpl.adminContactsJson)
                      .replace('<?!= initialLoadErrorJson ?>', tpl.initialLoadErrorJson)
                      .replace("<?= activeSenderHint || 'Google Workspace Admin' ?>", tpl.activeSenderHint || 'Google Workspace Admin')
                  : dialogHtmlRaw.replace('<?!= stateCatalogJson ?>', tpl.stateCatalogJson);
              const out: any = {
                _width: 0,
                _height: 0,
                setWidth: (w: number) => {
                  out._width = w;
                  return out;
                },
                setHeight: (h: number) => {
                  out._height = h;
                  return out;
                },
                getContent: () => rendered,
              };
              return out;
            },
          };
          return tpl;
        },
      },
      UrlFetchApp: {
        fetch: (url: string, options: any) => {
          fetchCalls.push({ url, options });
          return {
            getResponseCode: () => nextFetchResponse.statusCode,
            getContentText: () => JSON.stringify(nextFetchResponse.body),
          };
        },
      },
      Logger: { log: () => {} },
      console,
      Date,
      JSON,
      RegExp,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Math,
    };

    vm.createContext(sandbox);
    vm.runInContext(codeJs, sandbox);
    vm.runInContext(inviteJs, sandbox);
  });

  it('keeps GAS state catalog in 1:1 parity with canonical TypeScript 36-State/UT LGD catalog', () => {
    const gasCatalog = Array.from(sandbox.getStateCodeInvitationCatalog_()) as Array<{
      canonicalName: string;
      lgdCode: string;
      lgdNumericCode: string;
      isoCode: string;
    }>;

    expect(gasCatalog).toHaveLength(36);
    expect(gasCatalog.map((s) => s.canonicalName)).toEqual(STATE_CATALOG.map((s) => s.canonicalName));
    expect(gasCatalog.map((s) => s.lgdNumericCode)).toEqual(STATE_CATALOG.map((s) => s.lgdNumericCode));
    expect(gasCatalog.map((s) => s.isoCode)).toEqual(STATE_CATALOG.map((s) => s.isoCode));
  });

  it('adds onOpen Staff Access -> State Code Invitation and Send Administration Access Code menu items without leaks', () => {
    sandbox.onOpen({});
    expect(menusCreated.map((m) => m.title)).toContain('Childcare Phase 3 Admin');
    const staffMenu = menusCreated.find((m) => m.title === 'Staff Access');
    expect(staffMenu).toBeDefined();
    expect(staffMenu?.items).toEqual([
      { label: 'State Code Invitation', fn: 'menuOpenStateCodeInvitation' },
      { label: 'Send Administration Access Code', fn: 'menuOpenAdminAccessModal' },
    ]);
  });

  it('renders modal UI cleanly in correct field order, updates informational LGD numeric panel, and exposes zero secrets/codes', () => {
    sandbox.menuOpenStateCodeInvitation();
    expect(shownDialogs).toHaveLength(1);
    expect(shownDialogs[0].title).toBe('State Code Invitation');

    const renderedHtml = shownDialogs[0].html;
    expect(renderedHtml).not.toContain(scriptProperties.SHEET_INVITATION_BRIDGE_SECRET);
    expect(renderedHtml).not.toContain(scriptProperties.WEBHOOK_SECRET);
    expect(renderedHtml).not.toMatch(/ALN-/);

    const dom = new JSDOM(renderedHtml, { runScripts: 'dangerously' });
    const doc = dom.window.document;

    const nameEl = doc.getElementById('recipientName') as HTMLInputElement;
    const emailEl = doc.getElementById('recipientEmail') as HTMLInputElement;
    const stateEl = doc.getElementById('stateSelect') as HTMLSelectElement;
    const numericEl = doc.getElementById('numericCodeValue')!;
    const statusEl = doc.getElementById('statusBox')!;
    const sendBtn = doc.getElementById('sendBtn') as HTMLButtonElement;

    expect(nameEl).not.toBeNull();
    expect(emailEl).not.toBeNull();
    expect(stateEl).not.toBeNull();
    expect(sendBtn).not.toBeNull();

    // Verify visual DOM ordering: Name -> Email -> State Dropdown -> Numeric Panel -> Status -> Send
    expect(nameEl.compareDocumentPosition(emailEl) & 4).toBeTruthy();
    expect(emailEl.compareDocumentPosition(stateEl) & 4).toBeTruthy();
    expect(stateEl.compareDocumentPosition(numericEl) & 4).toBeTruthy();
    expect(numericEl.compareDocumentPosition(sendBtn) & 4).toBeTruthy();

    // Dropdown has blank option + all 36 States/UTs
    expect(stateEl.options).toHaveLength(37);

    // Selecting Maharashtra shows LGD 027; selecting Ladakh shows 037; selecting Lakshadweep shows 031
    expect(numericEl.textContent?.trim()).toBe('---');
    stateEl.value = 'Maharashtra';
    stateEl.dispatchEvent(new dom.window.Event('change'));
    expect(numericEl.textContent?.trim()).toBe('027');

    stateEl.value = 'Ladakh';
    stateEl.dispatchEvent(new dom.window.Event('change'));
    expect(numericEl.textContent?.trim()).toBe('037');

    stateEl.value = 'Lakshadweep';
    stateEl.dispatchEvent(new dom.window.Event('change'));
    expect(numericEl.textContent?.trim()).toBe('031');

    // Mock google.script.run in modal DOM & verify client validation + submit + success status update
    const serverCalls: any[] = [];
    (dom.window as any).google = {
      script: {
        run: {
          withSuccessHandler(cb: (res: any) => void) {
            return {
              withFailureHandler() {
                return {
                  submitStateCodeInvitation(payload: any) {
                    serverCalls.push(payload);
                    const gasResult = sandbox.submitStateCodeInvitation(payload);
                    cb(gasResult);
                  },
                };
              },
            };
          },
        },
      },
    };

    // Validation error when submitting empty form
    dom.window.document.getElementById('invitationForm')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    expect(statusEl.className).toContain('error');
    expect(serverCalls).toHaveLength(0);

    // Valid submit passes clean payload, shows success message & quota, and never reveals invite code
    nameEl.value = 'Priya Nair';
    emailEl.value = 'priya.nair@example.org';
    stateEl.value = 'Maharashtra';
    stateEl.dispatchEvent(new dom.window.Event('change'));
    dom.window.document.getElementById('invitationForm')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));

    expect(serverCalls).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://csc-staging.example.run.app/api/admin/state-team-invitations/sheet-bridge');
    expect(fetchCalls[0].options.headers['X-Invitation-Bridge-Secret']).toBe(scriptProperties.SHEET_INVITATION_BRIDGE_SECRET);
    expect(fetchCalls[0].options.headers['X-Invitation-Bridge-Secret']).not.toBe(scriptProperties.WEBHOOK_SECRET);
    const postedBody = JSON.parse(fetchCalls[0].options.payload);
    expect(postedBody.actorEmail).toBe('rajiv.menon@example.org');
    expect(postedBody.recipientEmail).toBe('priya.nair@example.org');
    expect(postedBody.assignedState).toBe('Maharashtra');
    expect(statusEl.className).toContain('success');
    expect(statusEl.textContent).toContain('Remaining MailApp daily quota: 1492');
    expect(statusEl.textContent).not.toMatch(/ALN-/);
    expect(toastsShown[0].message).toContain('priya.nair@example.org');
  });

  it('rejects empty active user without falling back to Session.getEffectiveUser() and logs non-secret failure', () => {
    activeUserEmail = '';
    effectiveUserEmail = 'sheet.owner@example.org';

    const result = sandbox.submitStateCodeInvitation({
      recipientName: 'Priya Nair',
      recipientEmail: 'priya.nair@example.org',
      assignedState: 'Maharashtra',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('DENIED_UNIDENTIFIED_SENDER');
    expect(fetchCalls).toHaveLength(0);
    expect(toastsShown).toHaveLength(1);
    expect(sheetTabs['Invitation Log']).toHaveLength(2);
    expect(sheetTabs['Invitation Log'][1][1]).toBe('UNIDENTIFIED');
    expect(sheetTabs['Invitation Log'][1][5]).toBe('DENIED_UNIDENTIFIED_SENDER');
  });

  it('handles unauthorized sender (403) and duplicate email (409) from server without writing codes or secrets', () => {
    nextFetchResponse = {
      statusCode: 403,
      body: {
        status: 'error',
        code: 'FORBIDDEN_SENDER',
        error: 'Only authorised programme administrators can send State Code Invitations.',
      },
    };

    const unauthRes = sandbox.submitStateCodeInvitation({
      recipientName: 'Priya Nair',
      recipientEmail: 'priya.nair@example.org',
      assignedState: 'Delhi',
    });
    expect(unauthRes.ok).toBe(false);
    expect(unauthRes.status).toBe('FORBIDDEN_SENDER');
    expect(toastsShown[0].message).toContain('Only authorised programme administrators');

    nextFetchResponse = {
      statusCode: 409,
      body: {
        status: 'error',
        code: 'DUPLICATE_OR_EXISTING_ACCOUNT',
        error: 'Unable to send invitation: an active account, existing registration, or pending invitation is already registered for this email.',
      },
    };

    const dupRes = sandbox.submitStateCodeInvitation({
      recipientName: '=HYPERLINK("http://evil")',
      recipientEmail: 'dup@example.org',
      assignedState: 'Tamil Nadu',
    });
    expect(dupRes.ok).toBe(false);
    expect(dupRes.status).toBe('DUPLICATE_OR_EXISTING_ACCOUNT');

    // Formula neutralization in Invitation Log + zero invite code or secret anywhere in sheet cells
    const logRows = sheetTabs['Invitation Log'];
    const dump = JSON.stringify(logRows);
    expect(dump).not.toContain(scriptProperties.SHEET_INVITATION_BRIDGE_SECRET);
    expect(dump).not.toMatch(/ALN-/);
    expect(logRows[2][2]).toBe("'=HYPERLINK(\"http://evil\")");
  });

  it('blocks staging script from calling production APP_BASE_URL', () => {
    scriptProperties.APP_ENV = 'staging';
    scriptProperties.APP_BASE_URL = 'https://childcare.allianceindia.org';

    const res = sandbox.submitStateCodeInvitation({
      recipientName: 'Test Admin',
      recipientEmail: 'test@example.org',
      assignedState: 'Goa',
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe('CONFIG_ERROR');
    expect(fetchCalls).toHaveLength(0);
  });

  it('populates AdminAccessDialog dropdown via sheet-bridge action=list without job titles and dispatches action=send cleanly', () => {
    let callIndex = 0;
    sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
      fetchCalls.push({ url, options });
      callIndex++;
      if (callIndex === 1) {
        return {
          getResponseCode: () => 200,
          getContentText: () =>
            JSON.stringify({
              status: 'success',
              administrators: [
                { id: 'lead-rajiv-menon', name: 'Rajiv Menon', email: 'rajiv.menon@example.org' },
                { id: 'lead-ananya-roy', name: 'Dr. Ananya Roy', email: 'ananya.roy@example.org' },
              ],
            }),
        };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            status: 'success',
            recipientId: 'lead-ananya-roy',
            recipientName: 'Dr. Ananya Roy',
            deliveredTo: 'ananya.roy@example.org',
            emailDispatched: true,
          }),
      };
    };

    sandbox.menuOpenAdminAccessModal();
    expect(shownDialogs).toHaveLength(1);
    expect(shownDialogs[0].title).toBe('Send Administration Access Code');
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://csc-staging.example.run.app/api/admin/leader-access/sheet-bridge');
    expect(JSON.parse(fetchCalls[0].options.payload)).toEqual({
      actorEmail: 'rajiv.menon@example.org',
      action: 'list',
    });

    const renderedHtml = shownDialogs[0].html;
    expect(renderedHtml).not.toContain(scriptProperties.SHEET_INVITATION_BRIDGE_SECRET);
    expect(renderedHtml).not.toContain(scriptProperties.WEBHOOK_SECRET);

    const dom = new JSDOM(renderedHtml, { runScripts: 'dangerously' });
    const doc = dom.window.document;
    const selectEl = doc.getElementById('adminSelect') as HTMLSelectElement;
    expect(selectEl.disabled).toBe(false);
    expect(selectEl.options).toHaveLength(2);
    expect(selectEl.options[0].textContent).toBe('Rajiv Menon (rajiv.menon@example.org)');
    expect(selectEl.options[1].textContent).toBe('Dr. Ananya Roy (ananya.roy@example.org)');

    const serverCalls: any[] = [];
    (dom.window as any).google = {
      script: {
        run: {
          withSuccessHandler(cb: (res: any) => void) {
            return {
              withFailureHandler() {
                return {
                  submitAdminAccessDispatch(payload: any) {
                    serverCalls.push(payload);
                    const gasResult = sandbox.submitAdminAccessDispatch(payload);
                    cb(gasResult);
                  },
                };
              },
            };
          },
        },
      },
    };

    selectEl.value = 'ananya.roy@example.org';
    doc.getElementById('adminAccessForm')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));

    expect(serverCalls).toHaveLength(1);
    expect(fetchCalls).toHaveLength(2);
    expect(JSON.parse(fetchCalls[1].options.payload)).toEqual({
      actorEmail: 'rajiv.menon@example.org',
      action: 'send',
      targetEmail: 'ananya.roy@example.org',
      targetId: 'lead-ananya-roy',
    });

    const statusEl = doc.getElementById('statusBox')!;
    expect(statusEl.className).toContain('ok');
    expect(statusEl.textContent).toContain('ananya.roy@example.org');
  });
});
