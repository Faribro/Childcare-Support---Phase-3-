import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnimatedHeartUnlock } from '@/components/ui/AnimatedHeartUnlock';
import { StateTeamAuthFlow } from '@/components/auth/StateTeamAuthFlow';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app',
}));

describe('Safe 3-Tap Heart Entry & State Team Staff Access UI', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('requires 3 heart taps to open Staff Access and NEVER sets auth state or contains secrets', () => {
    const openedEvents: Event[] = [];
    const listener = (e: Event) => openedEvents.push(e);
    window.addEventListener('child_nutrition:open_login_modal', listener);

    const { container } = render(<AnimatedHeartUnlock />);
    const heartBtn = screen.getByRole('button', { name: /Staff Access/i });

    expect(container.innerHTML).not.toContain('132');

    fireEvent.click(heartBtn);
    expect(openedEvents.length).toBe(0);
    expect(localStorage.getItem('child_nutrition_evaluation_unlocked')).toBeNull();

    fireEvent.click(heartBtn);
    expect(openedEvents.length).toBe(0);

    fireEvent.click(heartBtn);
    expect(openedEvents.length).toBe(1);

    // Clicking the heart NEVER grants authentication or elevates roles locally
    expect(localStorage.getItem('child_nutrition_evaluation_unlocked')).toBeNull();
    expect(localStorage.getItem('child_nutrition:user_session_v1')).toBeNull();

    window.removeEventListener('child_nutrition:open_login_modal', listener);
  });

  it('supports keyboard Enter / Space 3 times on heart trigger to open Staff Access', () => {
    const openedEvents: Event[] = [];
    const listener = (e: Event) => openedEvents.push(e);
    window.addEventListener('child_nutrition:open_login_modal', listener);

    render(<AnimatedHeartUnlock />);
    const heartBtn = screen.getByRole('button', { name: /Staff Access/i });

    fireEvent.keyDown(heartBtn, { key: 'Enter' });
    fireEvent.keyDown(heartBtn, { key: ' ' });
    expect(openedEvents.length).toBe(0);

    fireEvent.keyDown(heartBtn, { key: 'Enter' });
    expect(openedEvents.length).toBe(1);

    window.removeEventListener('child_nutrition:open_login_modal', listener);
  });

  it('keeps verified uninvited State Team applicant at Pending Approval without unlocking dashboard', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/state-team/register')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            message: 'Verification code sent.',
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/state-team/verify-otp')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            registrationStatus: 'PENDING_APPROVAL',
            sessionActive: false,
            data: {
              registration: { id: 'reg-1', status: 'PENDING_APPROVAL' },
              session: null,
            },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<StateTeamAuthFlow />);

    fireEvent.click(screen.getByRole('tab', { name: /Request access/i }));
    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: 'staff@allianceindia.org' } });
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Rohan' } });
    fireEvent.change(screen.getByLabelText(/Organization/i), { target: { value: 'Partner' } });
    fireEvent.click(screen.getByRole('button', { name: /Request access/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Code/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/6-Digit Code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify & Unlock/i }));

    await waitFor(() => {
      expect(screen.getByText(/Request Submitted — Pending Administration Approval/i)).toBeDefined();
    });

    expect(localStorage.getItem('child_nutrition_evaluation_unlocked')).toBeNull();
    expect(screen.queryByText(/Continue to State Team Workspace/i)).toBeNull();
  });
});
