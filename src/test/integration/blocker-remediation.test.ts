import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as syncBatch } from '@/app/api/sync/route';
import { POST as createSubmission, GET as listSubmissions } from '@/app/api/submissions/route';
import { GET as getSubmission, PATCH as patchSubmission, PUT as putSubmission } from '@/app/api/submissions/[submissionId]/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { canonicalSubmissionAdapter } from '@/lib/server/canonicalSubmissionAdapter';
import fs from 'fs';
import path from 'path';

describe('Blocker & Critical Remediation Integration Test Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APPS_SCRIPT_URL;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.RENDER;
    (process.env as any).NODE_ENV = 'test';
    MockSheetStore.resetStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const baseSamplePayload = {
    uuid: '11111111-2222-4333-8444-555555555555',
    clientSubmissionId: '11111111-2222-4333-8444-555555555555',
    interviewerName: 'Sunita Sharma',
    demographics: {
      artNumber: 'MH-PUN-3001',
      childName: 'Aarav Rajesh Patel',
      dob: '2020-01-10',
      gender: 'Male',
      caregiverName: 'Rajesh Patel',
      caregiverRelationship: 'Father',
      caregiverPhone: '9822001122',
      district: 'Pune',
    },
    household: {
      orphanStatus: 'None',
      primaryCaregiverOccupation: 'Daily wage labour',
      monthlyHouseholdIncome: 5000,
      rationCardType: 'BPL',
      numberOfSiblings: 1,
    },
    nutrition: {
      heightCm: 98,
      weightKg: 13.5,
      muacMm: 125,
      bilateralPittingOedema: false,
      clinicalNotes: 'Baseline clinic visit',
    },
    education: {
      schoolEnrolled: true,
      schoolType: 'Government',
      schoolGrade: 'Standard 1',
      attendancePercentage: 90,
      supportMaterialsNeeded: ['Notebooks'],
    },
    bankDetails: {
      accountHolderName: 'Rajesh Patel',
      accountNumber: '123456789012',
      ifscCode: 'SBIN0000001',
      bankName: 'SBI Pune',
      branchName: 'Pune Central',
      passbookPhotoCaptured: true,
    },
    declaration: {
      consentAcknowledged: true,
      caseworkerName: 'Sunita Sharma',
      declarationDate: '2026-09-09',
    },
  };

  // ==========================================================================
  // BLOCKER A: Offline UPDATE operations must NOT be treated as duplicate CREATEs
  // ==========================================================================
  describe('BLOCKER A: Offline UPDATE vs CREATE Handling', () => {
    it('creates a record via POST /api/submissions with idempotency key', async () => {
      const createReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-create-001',
        },
        body: JSON.stringify(baseSamplePayload),
      });

      const res = await createSubmission(createReq);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.acknowledged).toBe(true);
      expect(body.remoteSubmissionId).toBeDefined();
      expect(body.version).toBe(1);
    });

    it('processes UPDATE in POST /api/sync without discarding amended fields', async () => {
      // 1. Initial creation in store
      MockSheetStore.createRecord(baseSamplePayload as any, 'seed-create-001', 'req-seed');

      // 2. Dispatch batch with operationType: 'UPDATE'
      const syncReq = new NextRequest('http://localhost:3000/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              submissionUuid: baseSamplePayload.uuid,
              operationType: 'UPDATE',
              idempotencyKey: 'update-amend-001',
              expectedVersion: 1,
              payload: {
                expectedVersion: 1,
                childName: 'Aarav Rajesh Patel (Amended)',
                weightKg: 14.1,
                editReason: 'Weight measurement recalibrated with digital scale',
              },
            },
          ],
        }),
      });

      const syncRes = await syncBatch(syncReq);
      expect(syncRes.status).toBe(200);
      const syncBody = await syncRes.json();
      expect(syncBody.processedCount).toBe(1);
      expect(syncBody.results[0].status).toBe('synced');
      expect(syncBody.results[0].version).toBe(2);

      // 3. Verify record in store actually contains amended data
      const stored = MockSheetStore.findRecord(baseSamplePayload.uuid);
      expect(stored).toBeDefined();
      expect(stored?.version).toBe(2);
      expect(stored?.child_name).toBe('Aarav Rajesh Patel (Amended)');
      expect(stored?.weight_kg).toBe(14.1);
    });

    it('rejects stale UPDATE with 409 conflict during OCC mismatch', async () => {
      // Seed record at version 1
      MockSheetStore.createRecord(baseSamplePayload as any, 'seed-create-002', 'req-seed-2');
      // Advance to version 2
      MockSheetStore.updateRecord(baseSamplePayload.uuid, { childName: 'Version 2 Name', expectedVersion: 1 }, 'Supervisor', 'req-v2');

      // Attempt update with stale expectedVersion: 1
      const syncReq = new NextRequest('http://localhost:3000/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              submissionUuid: baseSamplePayload.uuid,
              operationType: 'UPDATE',
              idempotencyKey: 'stale-update-001',
              expectedVersion: 1,
              payload: {
                expectedVersion: 1,
                childName: 'Stale Attempt',
              },
            },
          ],
        }),
      });

      const syncRes = await syncBatch(syncReq);
      const syncBody = await syncRes.json();
      expect(syncBody.results[0].status).toBe('conflict');
      expect(syncBody.results[0].statusCode).toBe(409);
      expect(syncBody.results[0].currentVersion).toBe(2);
      expect(syncBody.results[0].expectedVersion).toBe(1);
    });

    it('supports PATCH and PUT /api/submissions/[submissionId] with If-Match header', async () => {
      MockSheetStore.createRecord(baseSamplePayload as any, 'seed-create-003', 'req-seed-3');

      const patchReq = new NextRequest(`http://localhost:3000/api/submissions/${baseSamplePayload.uuid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"1"',
        },
        body: JSON.stringify({
          childName: 'Aarav Updated via Direct Route',
        }),
      });

      const res = await patchSubmission(patchReq, { params: { submissionId: baseSamplePayload.uuid } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.acknowledged).toBe(true);
      expect(body.version).toBe(2);

      // Verify PUT alias
      const putReq = new NextRequest(`http://localhost:3000/api/submissions/${baseSamplePayload.uuid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"2"',
        },
        body: JSON.stringify({
          childName: 'Aarav Updated via PUT Alias',
        }),
      });

      const putRes = await putSubmission(putReq, { params: { submissionId: baseSamplePayload.uuid } });
      expect(putRes.status).toBe(200);
      const putBody = await putRes.json();
      expect(putBody.version).toBe(3);
    });
  });

  // ==========================================================================
  // BLOCKER B: Drive ACL Hardening & gas/Code.js Safety
  // ==========================================================================
  describe('BLOCKER B: Google Drive ACL & gas/Code.js Safety Invariants', () => {
    it('verifies gas/Code.js contains ZERO public ANYONE_WITH_LINK sharing calls', () => {
      const gasCodePath = path.join(process.cwd(), 'gas', 'Code.js');
      const gasContent = fs.readFileSync(gasCodePath, 'utf8');

      // Must NOT contain ANYONE_WITH_LINK
      expect(gasContent).not.toContain('ANYONE_WITH_LINK');
      expect(gasContent).not.toContain('DriveApp.Access.ANYONE');
      expect(gasContent).not.toContain('setSharing(DriveApp.Access.ANYONE_WITH_LINK');
    });

    it('verifies gas/Code.js generates restricted authenticated Google Drive URLs', () => {
      const gasCodePath = path.join(process.cwd(), 'gas', 'Code.js');
      const gasContent = fs.readFileSync(gasCodePath, 'utf8');

      // Document uploads must return restricted file view links
      expect(gasContent).toContain('https://drive.google.com/file/d/');
      expect(gasContent).toContain('/view');
    });

    it('verifies gas/Code.js enforces fail-closed webhook secret verification on doGet and doPost', () => {
      const gasCodePath = path.join(process.cwd(), 'gas', 'Code.js');
      const gasContent = fs.readFileSync(gasCodePath, 'utf8');

      expect(gasContent).toContain("PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET')");
      expect(gasContent).toContain('Unauthorized: Invalid webhook secret');
    });
  });

  // ==========================================================================
  // CRITICAL C: Canonical Adapter & Fail-Closed Production Behavior
  // ==========================================================================
  describe('CRITICAL C: Canonical Adapter & Fail-Closed Production Gate', () => {
    it('fails closed with 503 CONFIGURATION_ERROR in production when APPS_SCRIPT_URL is missing', async () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.APPS_SCRIPT_URL;
      delete process.env.WEBHOOK_SECRET;

      const createReq = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-prod-failclosed-1',
        },
        body: JSON.stringify(baseSamplePayload),
      });

      const res = await createSubmission(createReq);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('CONFIGURATION_ERROR');
      expect(body.status).toBe('error');
    });

    it('fails closed with 503 CONFIGURATION_ERROR in production for batch sync', async () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.APPS_SCRIPT_URL;

      const syncReq = new NextRequest('http://localhost:3000/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              submissionUuid: baseSamplePayload.uuid,
              operationType: 'CREATE',
              idempotencyKey: 'idem-sync-prod-1',
              payload: baseSamplePayload,
            },
          ],
        }),
      });

      const res = await syncBatch(syncReq);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('CONFIGURATION_ERROR');
    });

    it('never includes secrets in URL query strings in canonicalSubmissionAdapter', async () => {
      const adapterCodePath = path.join(process.cwd(), 'src', 'lib', 'server', 'canonicalSubmissionAdapter.ts');
      const adapterContent = fs.readFileSync(adapterCodePath, 'utf8');

      // Adapter must never append ?secret= to fetch URLs
      expect(adapterContent).not.toContain("searchParams.set('secret'");
      expect(adapterContent).not.toContain('?secret=');
      expect(adapterContent).not.toContain('&secret=');
    });

    it('resolves canonical Google Apps Script bridge on Render deployment', () => {
      const origRender = process.env.RENDER;
      const origUrl = process.env.APPS_SCRIPT_URL;
      const origSecret = process.env.WEBHOOK_SECRET;

      try {
        process.env.RENDER = 'true';
        delete process.env.APPS_SCRIPT_URL;
        delete process.env.WEBHOOK_SECRET;

        expect(canonicalSubmissionAdapter.getAppsScriptUrl()).toBe(
          'https://script.google.com/macros/s/AKfycbxbo4ErI10K505h1qMIY8HY7bo-gQU2Gw6c8NSZ3Py6aOTVAsjeK28OPsxilyHjgmTL/exec'
        );
        // Fail-closed invariant: Never fallback to hardcoded secrets, even on Render
        expect(canonicalSubmissionAdapter.getWebhookSecret()).toBeUndefined();
      } finally {
        if (origRender !== undefined) process.env.RENDER = origRender;
        else delete process.env.RENDER;
        if (origUrl !== undefined) process.env.APPS_SCRIPT_URL = origUrl;
        else delete process.env.APPS_SCRIPT_URL;
        if (origSecret !== undefined) process.env.WEBHOOK_SECRET = origSecret;
        else delete process.env.WEBHOOK_SECRET;
      }
    });
  });
});
