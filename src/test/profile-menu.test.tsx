/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProfileMenu } from '@/components/layout/ProfileMenu';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const mockSummary = {
  localPendingSyncCount: 0,
};

vi.mock('@/hooks/useSubmissionSummary', () => ({
  useSubmissionSummary: () => mockSummary,
}));

let mockEvaluationUser: any = null;
let mockIsUnlocked = false;

vi.mock('@/lib/auth/evaluationAccess', () => ({
  useEvaluationAccess: () => ({
    user: mockEvaluationUser,
    isUnlocked: mockIsUnlocked,
    logout: vi.fn(),
  }),
}));

describe('ProfileMenu Component', () => {
  beforeEach(() => {
    localStorage.clear();
    mockEvaluationUser = null;
    mockIsUnlocked = false;
    mockSummary.localPendingSyncCount = 0;
  });

  it('renders trigger button properly', () => {
    render(<ProfileMenu />);
    const trigger = screen.getByRole('button');
    expect(trigger).toBeInTheDocument();
  });

  it('displays field caseworker details from localStorage', () => {
    localStorage.setItem(
      'field_user_profile',
      JSON.stringify({
        id: 'fw-123',
        name: 'Sunita Patil',
        assignedState: 'Maharashtra',
        assignedDistrict: 'Pune',
        maskedMobile: '+91 ******3210',
        srName: 'Alliance India SR',
        ssrName: 'Pune SSR Unit',
      })
    );

    render(<ProfileMenu />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    expect(screen.getAllByText('Sunita Patil').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Field Caseworker/i)).toBeInTheDocument();
    expect(screen.getByText(/Maharashtra/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Pune/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('+91 ******3210')).toBeInTheDocument();
  });

  it('displays supervisor evaluator details when unlocked', () => {
    mockIsUnlocked = true;
    mockEvaluationUser = {
      userId: 'rev-456',
      name: 'Dr. Ramesh Gupta',
      role: 'STATE_REVIEWER',
      allowedStates: ['Maharashtra'],
      allowedDistricts: ['*'],
      isVerified: true,
      canEdit: true,
    };

    render(<ProfileMenu />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    expect(screen.getAllByText('Dr. Ramesh Gupta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('State Reviewer')).toBeInTheDocument();
    expect(screen.getByText(/Maharashtra/i)).toBeInTheDocument();
  });

  it('shows unsynced drafts warning modal when signing out with pending syncs', () => {
    localStorage.setItem(
      'field_user_profile',
      JSON.stringify({ id: 'CW-001', name: 'Ramesh Field', assignedState: 'Maharashtra' })
    );
    mockSummary.localPendingSyncCount = 2;

    render(<ProfileMenu />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const signOutBtn = screen.getByRole('menuitem', { name: /Sign Out/i });
    fireEvent.click(signOutBtn);

    // Warning modal should appear
    expect(screen.getByText('Unsynced Surveys On This Device')).toBeInTheDocument();
    expect(screen.getByText(/You have 2 survey\(s\) waiting to sync/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review & Sync Now/i })).toBeInTheDocument();
  });
});
