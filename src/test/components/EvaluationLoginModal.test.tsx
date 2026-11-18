/**
 * EvaluationLoginModal.test.tsx
 *
 * Tests verifying:
 * 1. Preservation of title, caseworker notice, and State Evaluation tab
 * 2. In-place tab switching to Leadership and rendering LeadershipOtpFlow
 * 3. Escape key closes modal
 * 4. Logged-in session display and sign-out
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EvaluationLoginModal } from '@/components/auth/EvaluationLoginModal';
import * as evalAccess from '@/lib/auth/evaluationAccess';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('EvaluationLoginModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('1. renders modal header, caseworker notice, and defaults to State Evaluation with StateTeamAuthFlow', async () => {
    render(<EvaluationLoginModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Evaluation Access Control')).toBeDefined();
    expect(
      screen.getByText(/Field Caseworkers:/i)
    ).toBeDefined();
    expect(
      screen.getByText(/Forms, local drafts, and survey submissions do not require an evaluation password/i)
    ).toBeDefined();

    // Tabs
    expect(screen.getByRole('tab', { name: /State Evaluation/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Leadership/i })).toBeDefined();

    // Defaults to StateTeamAuthFlow (Sign In tab active)
    expect(screen.getByRole('tab', { name: /Sign In/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /New Coordinator/i })).toBeDefined();
    expect(screen.getByLabelText(/Official Email Address/i)).toBeDefined();
  });

  it('1b. switches to New Coordinator registration in StateTeamAuthFlow', async () => {
    render(<EvaluationLoginModal isOpen={true} onClose={vi.fn()} />);

    const newCoordBtn = screen.getByRole('tab', { name: /New Coordinator/i });
    fireEvent.click(newCoordBtn);

    // Registration form inputs should now appear
    expect(screen.getByLabelText(/State Scope/i)).toBeDefined();
    expect(screen.getByLabelText(/First Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Email address/i)).toBeDefined();
  });

  it('2. switches to Leadership tab and mounts LeadershipOtpFlow in-place', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'email_only' },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<EvaluationLoginModal isOpen={true} onClose={vi.fn()} />);

    const leadershipTab = screen.getByRole('tab', { name: /Leadership/i });
    fireEvent.click(leadershipTab);

    // State Evaluation inputs should no longer be rendered
    expect(screen.queryByLabelText(/State Evaluation Password/i)).toBeNull();

    // Leadership OTP Flow inputs should appear in-place
    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /Send Verification Code/i })).toBeDefined();
  });

  it('3. closes modal when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(<EvaluationLoginModal isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('4. displays active session and sign-out button if user is already unlocked', async () => {
    localStorage.setItem('child_nutrition_evaluation_unlocked', 'true');
    localStorage.setItem(
      'child_nutrition:user_session_v1',
      JSON.stringify({
        userId: 'lead-01',
        name: 'Farhan Sayyed',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
      })
    );

    render(<EvaluationLoginModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/Currently Signed In: Farhan Sayyed/i)).toBeDefined();
    expect(screen.getByText(/Role:/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Continue to Supervisor Dashboard/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Switch Account \/ Sign Out/i })).toBeDefined();
  });
});
