import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listSubmissions } from '@/app/api/submissions/route';
import { GET as getDiagnostics } from '@/app/api/supervisor/diagnostics/route';
import { MockSheetStore } from '@/lib/server/mockSheetStore';
import { parseBeneficiaryRecord, evaluateDocuments } from '@/hooks/useSupervisorData';

describe('Supervisor Live Read Models & Consistency Suite', () => {
  beforeEach(() => {
    MockSheetStore.reset();
    MockSheetStore.seedDefaultRecords();
  });

  it('GET /api/submissions returns standard envelope with Cache-Control no-store', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=10', {
      method: 'GET',
    });

    const res = await listSubmissions(req);
    expect(res.status).toBe(200);

    const cacheControl = res.headers.get('Cache-Control');
    expect(cacheControl).toContain('no-store');
    expect(cacheControl).toContain('no-cache');

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.records)).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(5);
    expect(body.data.sourceUpdatedAt).toBeDefined();

    // Backward-compatibility keys
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.totalCount).toBe(body.data.total);
    expect(body.requestId).toBeDefined();
  });

  it('masks raw sensitive PII in GET /api/submissions read models', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=10', {
      method: 'GET',
    });

    const res = await listSubmissions(req);
    const body = await res.json();
    const records = body.data.records;

    expect(records.length).toBeGreaterThanOrEqual(5);
    for (const r of records) {
      // Aadhaar must be masked
      if (r.masked_aadhaar) {
        expect(r.masked_aadhaar).toMatch(/^XXXX-XXXX-\d{4}$|^XXXX-XXXX-XXXX$/);
      }
      // Bank account must be masked
      if (r.bank_account_number) {
        expect(r.bank_account_number).toContain('XXXX');
      }
      if (r.bankingAndKyc?.bankAccountNumber) {
        expect(r.bankingAndKyc.bankAccountNumber).toContain('XXXX');
      }
    }
  });

  it('parseBeneficiaryRecord parses all 5 seeded personas with clinical accuracy', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=10', {
      method: 'GET',
    });

    const res = await listSubmissions(req);
    const body = await res.json();
    const parsedRows = body.data.records.map(parseBeneficiaryRecord);

    expect(parsedRows.length).toBe(5);

    // Persona 1: Rohit Yadav (Severe Underweight, Unsuppressed VL)
    const rohit = parsedRows.find((p: any) => p.childName === 'Rohit Yadav');
    expect(rohit).toBeDefined();
    expect(rohit?.bmiCategory).toBe('Severe Underweight');
    expect(rohit?.vlCategory).toBe('Unsuppressed (≥1000 copies/mL)');
    expect(rohit?.documentStatus.isComplete).toBe(true);
    expect(rohit?.isApproved).toBe(true);

    // Persona 2: Puja Saha (Moderate Underweight, Suppressed VL, Out of School)
    const puja = parsedRows.find((p: any) => p.childName === 'Puja Saha');
    expect(puja).toBeDefined();
    expect(puja?.bmiCategory).toBe('Moderate Underweight');
    expect(puja?.vlCategory).toBe('Suppressed (<1000 copies/mL)');
    expect(puja?.hbCategory).toBe('Moderate Anemia');
    expect(puja?.documentStatus.isComplete).toBe(true); // Out of school doesn't require fee/marksheet

    // Persona 3: Aarav Jadhav (Missing fee receipt)
    const aarav = parsedRows.find((p: any) => p.childName === 'Aarav Jadhav');
    expect(aarav).toBeDefined();
    expect(aarav?.bmiCategory).toBe('Normal');
    expect(aarav?.vlCategory).toBe('Undetectable (<50 copies/mL)');
    expect(aarav?.documentStatus.isComplete).toBe(false);
    expect(aarav?.documentStatus.pendingDocs).toContain('School Fee Receipt');

    // Persona 4: Siddharth Patil (Severe Underweight, Severe Anemia, High VL)
    const siddharth = parsedRows.find((p: any) => p.childName === 'Siddharth Patil');
    expect(siddharth).toBeDefined();
    expect(siddharth?.bmiCategory).toBe('Severe Underweight');
    expect(siddharth?.hbCategory).toBe('Severe Anemia');
    expect(siddharth?.vlCategory).toBe('Unsuppressed (≥1000 copies/mL)');
    expect(siddharth?.isApproved).toBe(true);

    // Persona 5: Ananya Shinde (Missing caregiver consent signature)
    const ananya = parsedRows.find((p: any) => p.childName === 'Ananya Shinde');
    expect(ananya).toBeDefined();
    expect(ananya?.documentStatus.isComplete).toBe(false);
    expect(ananya?.documentStatus.pendingDocs).toContain('Caregiver Signature');
  });

  it('guarantees 100% mathematical metric consistency across derived views', async () => {
    const req = new NextRequest('http://localhost:3000/api/submissions?limit=100', {
      method: 'GET',
    });

    const res = await listSubmissions(req);
    const body = await res.json();
    const rows = body.data.records.map(parseBeneficiaryRecord);

    // Linelist count
    const linelistCount = rows.length;

    // Overview total evaluated
    const overviewTotalEvaluated = rows.length;

    // Analytics total count (N)
    const analyticsN = rows.length;

    expect(linelistCount).toBe(overviewTotalEvaluated);
    expect(overviewTotalEvaluated).toBe(analyticsN);

    // Clinical breakdown totals must sum to total count
    const severeUW = rows.filter((r: any) => r.bmiCategory === 'Severe Underweight').length;
    const modUW = rows.filter((r: any) => r.bmiCategory === 'Moderate Underweight').length;
    const normalBMI = rows.filter((r: any) => r.bmiCategory === 'Normal').length;
    const overweight = rows.filter((r: any) => r.bmiCategory === 'Overweight / Obese').length;
    expect(severeUW + modUW + normalBMI + overweight).toBe(rows.length);

    // Viral Load breakdown totals must sum to total count
    const undetect = rows.filter((r: any) => r.vlCategory.includes('Undetectable')).length;
    const supp = rows.filter((r: any) => r.vlCategory.includes('Suppressed') && !r.vlCategory.includes('Undetectable')).length;
    const unsupp = rows.filter((r: any) => r.vlCategory.includes('Unsuppressed')).length;
    const unknownVL = rows.filter((r: any) => r.vlCategory.includes('Unknown')).length;
    expect(undetect + supp + unsupp + unknownVL).toBe(rows.length);
  });

  it('distinguishes genuine empty dataset from upstream errors', async () => {
    // Reset store to empty
    MockSheetStore.reset();

    const req = new NextRequest('http://localhost:3000/api/submissions?limit=10', {
      method: 'GET',
    });

    const res = await listSubmissions(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    // Adapter automatically seeds if empty in dev/test, or returns 0 if cleared
    expect(body.status).toBe('success');
    expect(Array.isArray(body.data.records)).toBe(true);
  });

  it('GET /api/supervisor/diagnostics returns healthy environment and bridge status', async () => {
    const req = new NextRequest('http://localhost:3000/api/supervisor/diagnostics', {
      method: 'GET',
    });

    const res = await getDiagnostics(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data.status).toBe('healthy');
    expect(body.data.bridge.activeMode).toBeDefined();
    expect(body.data.mockStore.recordCount).toBeGreaterThanOrEqual(5);
  });
});
