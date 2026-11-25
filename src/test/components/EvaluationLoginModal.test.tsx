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

  it('1. renders modal header and defaults to State Team with StateTeamAuthFlow', async () => {
    render(<EvaluationLoginModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Staff Access')).toBeDefined();

    // Tabs
    expect(screen.getByRole('tab', { name: /State Team/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Administration/i })).toBeDefined();

    // Defaults to StateTeamAuthFlow (Sign in with email OTP vs Request access)
    expect(screen.getByRole('tab', { name: /Sign in with email OTP/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Request access/i })).toBeDefined();
    expect(screen.getByLabelText(/Official Email Address/i)).toBeDefined();
  });

  it('1b. switches to Request access form in StateTeamAuthFlow', async () => {
    render(<EvaluationLoginModal isOpen={true} onClose={vi.fn()} />);

    const requestAccessBtn = screen.getByRole('tab', { name: /Request access/i });
    fireEvent.click(requestAccessBtn);

    // Registration form inputs should now appear
    expect(screen.getByLabelText(/State Scope/i)).toBeDefined();
    expect(screen.getByLabelText(/First Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Email address/i)).toBeDefined();
    expect(screen.getByLabelText(/Administration Invitation Code/i)).toBeDefined();
  });

  it('2. switches to Administration tab and mounts Administration OTP login without exposing directory emails', async () => {
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

    const adminTab = screen.getByRole('tab', { name: /Administration/i });
    fireEvent.click(adminTab);

    // State Team password inputs should no longer be rendered
    expect(screen.queryByLabelText(/Staff Password/i)).toBeNull();

    // Manual Administration Work Email input appears with zero exposed executive emails
    await waitFor(() => {
      expect(screen.getByLabelText(/Administration Work Email/i)).toBeDefined();
    });

    expect(screen.queryByText(/faridsayyed1010@gmail\.com/i)).toBeNull();
    expect(screen.queryByText(/mbalani@allianceindia\.org/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Sign in with email OTP/i })).toBeDefined();
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
    expect(screen.getByRole('button', { name: /Continue to Administration Dashboard/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Switch Account \/ Sign Out/i })).toBeDefined();
  });
});
