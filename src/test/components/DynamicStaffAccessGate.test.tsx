/**
 * DynamicStaffAccessGate.test.tsx
 *
 * UI tests verifying:
 * 1. AnimatedHeartUnlock ignores double-clicks (2 taps + stale gap > 900ms) and always requires 3 consecutive taps even when isUnlocked=true
 * 2. EvaluationLoginModal with requireAccessCodeGate=true shows dynamic header & state-scoped auth on 3-digit LGD PIN
 * 3. EvaluationLoginModal redirects to /leadership/login?gate=1 when Administration access code succeeds
 * 4. LeadershipOtpFlow with gateUnlocked=true populates Administration dropdown via /api/auth/leader/gate with { id, name, email } and NO titles
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AnimatedHeartUnlock } from '@/components/ui/AnimatedHeartUnlock';
import { EvaluationLoginModal } from '@/components/auth/EvaluationLoginModal';
import { LeadershipOtpFlow } from '@/components/auth/LeadershipOtpFlow';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Dynamic Staff Access Gate UI Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('AnimatedHeartUnlock rejects double-clicks and stale inter-tap delays (>900ms), requiring 3 rapid taps even when unlocked', () => {
    vi.useFakeTimers();
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('child_nutrition:open_login_modal', listener);

    render(<AnimatedHeartUnlock />);
    const heart = screen.getByRole('button', { name: /Staff Access/i });

    // Single stray click, wait >900ms, then double-click -> must NOT trigger
    fireEvent.click(heart, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(950);
    });
    fireEvent.click(heart, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(heart, { button: 0 });
    expect(events).toHaveLength(0);

    // Wait >900ms for reset, then perform 3 rapid consecutive clicks
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(heart, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    fireEvent.click(heart, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    fireEvent.click(heart, { button: 0 });
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ source: 'heart', requireAccessCodeGate: true });

    // Immediate 4th stray click must NOT fire another open event
    fireEvent.click(heart, { button: 0 });
    expect(events).toHaveLength(1);

    window.removeEventListener('child_nutrition:open_login_modal', listener);
  });

  it('AnimatedHeartUnlock still requires 3 taps even when evaluation session is already unlocked', () => {
    localStorage.setItem('child_nutrition_evaluation_unlocked', 'true');
    localStorage.setItem(
      'child_nutrition:user_session_v1',
      JSON.stringify({
        userId: 'coord-1',
        name: 'Meera',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: [],
        isVerified: true,
      })
    );

    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('child_nutrition:open_login_modal', listener);

    render(<AnimatedHeartUnlock />);
    const heart = screen.getByRole('button', { name: /Staff Access/i });

    // 1st and 2nd click (double click) must NOT open modal even when unlocked
    fireEvent.click(heart, { button: 0 });
    fireEvent.click(heart, { button: 0 });
    expect(events).toHaveLength(0);

    // 3rd tap opens it with requireAccessCodeGate=false
    fireEvent.click(heart, { button: 0 });
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ source: 'heart', requireAccessCodeGate: false });

    window.removeEventListener('child_nutrition:open_login_modal', listener);
  });

  it('EvaluationLoginModal with requireAccessCodeGate shows dynamic State header and locks State Team UI on PIN 027', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/staff-access/gate')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            mode: 'state_team',
            data: {
              state: 'Maharashtra',
              lgdNumericCode: '027',
              isoCode: 'IN-MH',
            },
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({ status: 'error' }) } as Response;
    });

    render(<EvaluationLoginModal isOpen={true} onClose={vi.fn()} requireAccessCodeGate={true} />);

    expect(screen.getByText('Staff Access')).toBeDefined();
    expect(screen.getByText(/Enter State Code or Administration Code/i)).toBeDefined();
    expect(screen.queryByRole('tab', { name: /Administration/i })).toBeNull();

    const codeInput = screen.getByLabelText(/State PIN or Administration Access Code/i);
    fireEvent.change(codeInput, { target: { value: '027' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock Staff Access/i }));

    await waitFor(() => {
      expect(screen.getByText('Staff Access — Maharashtra')).toBeDefined();
    });

    expect(screen.getByText(/Maharashtra State Team • PIN 027/i)).toBeDefined();
    expect(screen.queryByRole('tab', { name: /Administration/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /Sign in with email OTP/i })).toBeDefined();

    // Switch to Request access and confirm state selector is locked to Maharashtra (no dropdown)
    fireEvent.click(screen.getByRole('tab', { name: /Request access/i }));
    expect(screen.getByText(/State Scope \(Locked by PIN\)/i)).toBeDefined();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('EvaluationLoginModal redirects to /leadership/login?gate=1 on Administration gate code', async () => {
    const onClose = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/staff-access/gate')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            mode: 'administration',
            data: {
              redirectUrl: '/leadership/login?gate=1',
              leaders: [
                { id: 'lead-1', name: 'Rajiv Menon', email: 'rajiv.menon@example.org' },
              ],
            },
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({ status: 'error' }) } as Response;
    });

    render(<EvaluationLoginModal isOpen={true} onClose={onClose} requireAccessCodeGate={true} />);

    fireEvent.change(screen.getByLabelText(/State PIN or Administration Access Code/i), {
      target: { value: 'ADMIN-CODE-SECRET' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Unlock Staff Access/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/leadership/login?gate=1');
    });
  });

  it('LeadershipOtpFlow with gateUnlocked=true populates Administration dropdown via /api/auth/leader/gate with name & email only (no titles)', async () => {
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
      if (typeof url === 'string' && url.includes('/api/auth/leader/gate')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              leaders: [
                { id: 'lead-rajiv', name: 'Rajiv Menon', email: 'rajiv.menon@example.org' },
                { id: 'lead-ananya', name: 'Dr. Ananya Roy', email: 'ananya.roy@example.org' },
              ],
            },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={false} gateUnlocked={true} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText('rajiv.menon@example.org')).toBeDefined();
      expect(screen.getByText('ananya.roy@example.org')).toBeDefined();
    });
    expect(screen.queryByText(/Senior Technical Lead/i)).toBeNull();
    expect(screen.queryByText(/National Programme Director/i)).toBeNull();

    // Clicking an entry selects that admin's email cleanly
    fireEvent.click(screen.getByText('Rajiv Menon'));
    expect(screen.getByText('rajiv.menon@example.org')).toBeDefined();
  });
});
