import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { parseBeneficiaryRecord } from '@/lib/read-model/supervisorReadModel';
import * as singleSubmissionRoute from '@/app/api/submissions/[submissionId]/route';
import * as assetSubmissionRoute from '@/app/api/submissions/[submissionId]/asset/route';
import * as exportSubmissionRoute from '@/app/api/submissions/[submissionId]/export/route';
import * as syncBatchRoute from '@/app/api/sync/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

describe('Edit Page Snapshot Consistency, Sync View Hydration, and Route Cache Guards', () => {
  beforeEach(() => {
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
  });

  describe('1. Edit Page Initial Form Data vs Original Snapshot Consistency', () => {
    it('derives originalSnapshot directly from loadedFormData and preserves zero numeric values without false diffs', () => {
      const editPagePath = path.resolve(
        process.cwd(),
        'src/app/assessment/record/[submissionId]/edit/page.tsx'
      );
      const editPageSource = fs.readFileSync(editPagePath, 'utf8');

      // Must NOT have divergent monthlyIncomeRs fallbacks (5000 in formData vs 0 in originalSnapshot)
      expect(editPageSource).not.toContain(
        "monthlyIncomeRs: Number(hf.monthlyIncomeRs || foundRecord['30\\nMonthly Income'] || 0)"
      );

      // Must derive setOriginalSnapshot from the exact same loadedFormData object
      expect(editPageSource).toContain('const loadedFormData = {');
      expect(editPageSource).toContain('setFormData(loadedFormData);');
      expect(editPageSource).toContain('monthlyIncomeRs: loadedFormData.monthlyIncomeRs');
      expect(editPageSource).toContain('schoolFees: loadedFormData.schoolFees');
      expect(editPageSource).toContain('approvedAllianceIndia: loadedFormData.approvedAllianceIndia');
      expect(editPageSource).toContain('remarks: loadedFormData.remarks');
    });
  });

  describe('2. Supervisor Read Model & Sync Centre Server Record Hydration', () => {
    it('preserves caregiverName, createdAt, editReason, and rawRecord in parseBeneficiaryRecord for Sync Centre and SubmissionViewModal', () => {
      const sheetRowRecord = {
        '1\nUnique ID': 'DL-SOU-111409-01',
        '2\nRevision Number': 2,
        '3\nSubmission Time': '2026-04-12T11:14:09.000Z',
        '7\nVisit Date': '2026-04-12',
        '9\nChild Name': 'Aarav Sharma',
        '11\nAge': 8,
        '12\nGender': 'Male',
        '13\nOrphan Status': 'Both parents alive',
        '14\nCaregiver Full Name': 'Sunita Sharma',
        '16\nCaregiver Contact': '9876543210',
        '18\nState': 'Delhi',
        '19\nDistrict': 'South Delhi',
        '32\nCurrent Weight (kg)': 24.5,
        '33\nCurrent Height (cm)': 126,
        '34\nBMI': 15.4,
        '35\nBMI Category': 'Normal',
        '36\nHemoglobin (g/dL)': '11.8',
        '37\nHb Category': 'Normal',
        '45\nViral Load': '< 50',
        '46\nVL Category': 'Undetectable (<50 copies/mL)',
        '48\nEdit Reason': 'Updated weight and height after clinic visit',
        '51\nSchool Name': 'Delhi Public Primary School',
        '53\nSchool Type': 'Government school',
        '67\nApproved Alliance India': 'Approved',
        sheetRow: 2,
      };

      const parsed = parseBeneficiaryRecord(sheetRowRecord);

      expect(parsed.id).toBe('DL-SOU-111409-01');
      expect(parsed.state).toBe('Delhi');
      expect(parsed.district).toBe('South Delhi');
      expect(parsed.caregiverName).toBe('Sunita Sharma');
      expect(parsed.caregiverPhone).toBe('9876543210');
      expect(parsed.createdAt).toBe('2026-04-12T11:14:09.000Z');
      expect(parsed.editReason).toBe('Updated weight and height after clinic visit');
      expect(parsed.sheetRow).toBe(2);
      expect(parsed.rawRecord).toBeDefined();
      expect(parsed.rawRecord['32\nCurrent Weight (kg)']).toBe(24.5);
      expect(parsed.rawRecord['51\nSchool Name']).toBe('Delhi Public Primary School');
    });

    it('renders SubmissionViewModal only once in src/app/assessment/sync/page.tsx', () => {
      const syncPagePath = path.resolve(process.cwd(), 'src/app/assessment/sync/page.tsx');
      const syncPageSource = fs.readFileSync(syncPagePath, 'utf8');

      const modalMatches = syncPageSource.match(/<SubmissionViewModal\b/g) || [];
      expect(modalMatches.length).toBe(1);
    });
  });

  describe('3. Submissions Detail, Asset, Export, and Sync API Route Cache-Busting', () => {
    it('exports dynamic = force-dynamic, fetchCache = force-no-store, and revalidate = 0 across all submission API routes', () => {
      expect((singleSubmissionRoute as any).dynamic).toBe('force-dynamic');
      expect((singleSubmissionRoute as any).fetchCache).toBe('force-no-store');
      expect((singleSubmissionRoute as any).revalidate).toBe(0);

      expect((assetSubmissionRoute as any).dynamic).toBe('force-dynamic');
      expect((assetSubmissionRoute as any).fetchCache).toBe('force-no-store');
      expect((assetSubmissionRoute as any).revalidate).toBe(0);

      expect((exportSubmissionRoute as any).dynamic).toBe('force-dynamic');
      expect((exportSubmissionRoute as any).fetchCache).toBe('force-no-store');
      expect((exportSubmissionRoute as any).revalidate).toBe(0);

      expect((syncBatchRoute as any).dynamic).toBe('force-dynamic');
      expect((syncBatchRoute as any).fetchCache).toBe('force-no-store');
      expect((syncBatchRoute as any).revalidate).toBe(0);
    });

    it('includes Cache-Control: no-store on GET /api/submissions/[submissionId]', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions/MH-PUN-081200-02', {
        method: 'GET',
      });
      const res = await singleSubmissionRoute.GET(req, {
        params: { submissionId: 'MH-PUN-081200-02' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toContain('no-store');

      const notFoundReq = new NextRequest('http://localhost:3000/api/submissions/NON-EXISTENT-ID', {
        method: 'GET',
      });
      const notFoundRes = await singleSubmissionRoute.GET(notFoundReq, {
        params: { submissionId: 'NON-EXISTENT-ID' },
      });

      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.headers.get('Cache-Control')).toContain('no-store');
    });
  });
});
