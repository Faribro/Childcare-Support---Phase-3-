import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockPathname, mockEvalUser, mockPlayEvaluationUnlock } = vi.hoisted(() => ({
  mockPathname: vi.fn<() => string>(() => '/supervisor/assessments'),
  mockEvalUser: vi.fn(() => ({
    userId: 'lead-1',
    name: 'National Lead',
    email: 'lead@allianceindia.org',
    role: 'LEADERSHIP',
    allowedStates: ['*'],
    allowedDistricts: ['*'],
    isVerified: true,
    verifiedAt: new Date().toISOString(),
  })),
  mockPlayEvaluationUnlock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/auth/evaluationAccess', () => ({
  useEvaluationAccess: () => ({
    isUnlocked: true,
    isLoaded: true,
    isLoading: false,
    user: mockEvalUser(),
    lock: vi.fn(),
    toggle: vi.fn(),
  }),
}));

vi.mock('@/lib/audio/cosmicSoundEngine', () => ({
  cosmicSound: {
    playEvaluationUnlock: mockPlayEvaluationUnlock,
  },
}));

vi.mock('@/hooks/useMobileTouch', () => ({
  triggerHaptic: vi.fn(),
}));

import { SupervisorTabNav } from '@/components/supervisor/SupervisorTabNav';
import {
  EvaluationLinelistTable,
  type EvaluationBeneficiaryRow,
} from '@/components/evaluation/EvaluationLinelistTable';
import { ChildApprovalDrawer } from '@/components/evaluation/ChildApprovalDrawer';
import { CaseStatusSummaryDashboard } from '@/components/supervisor/CaseStatusSummaryDashboard';
import type { SupervisorBeneficiaryRow } from '@/hooks/useSupervisorData';

const sampleEvalRows: EvaluationBeneficiaryRow[] = [
  {
    id: '71fffad6-759c-4012-9012-abcdef123456',
    displayCode: 'MH-PUN-009',
    childName: 'Aarav Sharma',
    workerName: 'Anita Deshmukh',
    ageText: '11 yrs',
    sexText: 'Male',
    district: 'Pune',
    state: 'Maharashtra',
    schoolType: 'Government School',
    orphanStatus: 'Single Orphan',
    grantAmountInr: 2500,
    docsStatus: 'intake_pending',
    missingDocs: ['Aadhaar Card', 'Bank Passbook'],
    approvalStatus: 'pending',
    viralLoadText: '<50',
    vlCategory: 'Undetectable (<50 c/mL)',
    hbText: '11.4',
    hbCategory: 'Normal',
    bmiCategory: 'Normal',
  },
];

describe('Workstream C: Evaluation Portal Redesign, 8-Column Linelist & Approval Drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/supervisor/assessments');
  });

  it('1. SupervisorTabNav uses sticky pill dock, 44px mobile touch targets, and hides Registrations Review for STATE_REVIEWER', () => {
    mockEvalUser.mockReturnValueOnce({
      userId: 'sr-1',
      name: 'State Reviewer',
      email: 'state@allianceindia.org',
      role: 'STATE_REVIEWER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['Pune'],
      isVerified: true,
      verifiedAt: new Date().toISOString(),
    });

    const { unmount } = render(<SupervisorTabNav />);
    const nav = screen.getByRole('navigation', { name: /Evaluation Workspace Navigation/i });
    expect(nav.className).toContain('sticky');
    expect(screen.queryByText(/Registrations Review/i)).toBeNull();
    const linelistTab = screen.getByRole('link', { name: /Beneficiary Linelist/i });
    expect(linelistTab.className).toContain('min-h-[44px]');
    expect(linelistTab.getAttribute('aria-current')).toBe('page');
    unmount();
  });

  it('2. EvaluationLinelistTable renders 8 columns without Viral Load/Hb clutter and enforces RBAC on Approve CTA', () => {
    const onApprove = vi.fn();
    const onDossier = vi.fn();

    const { rerender } = render(
      <EvaluationLinelistTable
        rows={sampleEvalRows}
        canApprove={true}
        onOpenApprovalModal={onApprove}
        onViewDossier={onDossier}
      />
    );

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual([
      'Ref ID',
      'Child & Worker',
      'Age / Sex',
      'Location',
      'School & Orphan',
      'Grant',
      'Docs Status',
      'Approval',
    ]);
    expect(screen.queryByText(/^Viral Load$/i)).toBeNull();
    expect(screen.queryByText(/^Hb$/i)).toBeNull();

    const approveBtns = screen.getAllByRole('button', { name: /Approve/i });
    expect(approveBtns.length).toBeGreaterThan(0);
    fireEvent.click(approveBtns[0]);
    expect(onApprove).toHaveBeenCalledWith(sampleEvalRows[0]);

    rerender(
      <EvaluationLinelistTable
        rows={sampleEvalRows}
        canApprove={false}
        onOpenApprovalModal={onApprove}
        onViewDossier={onDossier}
      />
    );
    expect(screen.queryAllByRole('button', { name: /^Approve$/i })).toHaveLength(0);
    expect(screen.getAllByText(/Pending Review/i).length).toBeGreaterThan(0);
  });

  it('3. EvaluationLinelistTable renders stable skeleton during load instead of empty-state flash', () => {
    render(
      <EvaluationLinelistTable
        rows={[]}
        isLoading={true}
        onOpenApprovalModal={vi.fn()}
        onViewDossier={vi.fn()}
      />
    );
    expect(screen.getByText(/Loading Beneficiary Records/i)).toBeTruthy();
    expect(screen.queryByText(/No children match the current filters/i)).toBeNull();
  });

  it('4. ChildApprovalDrawer surfaces KYC checklist + clinical context and fires unlock sound on confirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ChildApprovalDrawer
        isOpen={true}
        row={sampleEvalRows[0]}
        onClose={onClose}
        onConfirmApproval={onConfirm}
        onViewDossier={vi.fn()}
      />
    );

    expect(screen.getByText('Aarav Sharma')).toBeTruthy();
    expect(screen.getByText('Aadhaar Card')).toBeTruthy();
    expect(screen.getByText('11.4 g/dL')).toBeTruthy();
    expect(screen.getByText('Undetectable (<50 c/mL)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Confirm Child Approval/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(sampleEvalRows[0]);
      expect(mockPlayEvaluationUnlock).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('5. CaseStatusSummaryDashboard makes Missing KYC Bottlenecks clickable filter shortcuts', () => {
    const onShortcut = vi.fn();
    const records = [
      {
        id: 'rec-1',
        artNumber: 'ART-01',
        childName: 'Child One',
        age: 10,
        gender: 'Female',
        district: 'Pune',
        state: 'Maharashtra',
        schoolType: 'Government',
        schoolEnrolled: true,
        orphanStatus: 'Single Orphan',
        bmi: 16,
        bmiCategory: 'Normal',
        viralLoad: '40',
        vlCategory: 'Undetectable (<50 c/mL)',
        hemoglobin: '11.5',
        hbCategory: 'Normal',
        grantAmount: 2500,
        syncState: 'SYNCED',
        lastVisit: '2026-11-20',
        version: 1,
        isApproved: false,
        approvedStatus: 'Pending',
        documentStatus: {
          isComplete: false,
          uploadedCount: 2,
          totalRequired: 5,
          uploadedDocs: ['Passport Size Photo', 'Caregiver Signature'],
          pendingDocs: ['Aadhaar Card', 'Bank Passbook'],
        },
        readiness: {
          childKey: 'rec-1',
          isApproved: false,
          approvalStatus: 'Pending',
          isComplete: false,
          missingDocs: ['Aadhaar Card', 'Bank Passbook'],
          uploadedDocs: ['Passport Size Photo', 'Caregiver Signature'],
          totalRequired: 5,
          uploadedCount: 2,
          missingAadhaar: true,
          missingPassbook: true,
          missingPhoto: false,
          missingSignature: false,
          missingSchoolDoc: false,
          clinicalAlert: false,
          orphanCategory: 'single',
          isSchoolEnrolled: true,
        },
      } as unknown as SupervisorBeneficiaryRow,
    ];

    render(<CaseStatusSummaryDashboard records={records} onFilterShortcut={onShortcut} />);
    const aadhaarLink = screen.getByRole('link', { name: /Aadhaar Card/i });
    expect(aadhaarLink.getAttribute('href')).toBe('/supervisor/assessments?missingDoc=aadhaar');
    fireEvent.click(aadhaarLink);
    expect(onShortcut).toHaveBeenCalledWith('missingDoc', 'aadhaar');
  });
});
