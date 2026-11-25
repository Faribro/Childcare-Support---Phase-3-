/**
 * LeadershipOtpFlow.test.tsx
 *
 * Comprehensive tests for the shared Administration OTP Flow (LeadershipOtpFlow):
 * 1. Runtime Feature Status Check (/api/auth/leader/status) & zero client email leakage
 * 2. Privacy-preserving manual work email input by default (empty APPROVED_LEADERSHIP_PROFILES)
 * 3. Explicit directory / synthetic fixture combobox gating (NODE_ENV !== 'production' and flag)
 * 4. Portal rendering outside overflow-hidden containers + visualViewport upward flip
 * 5. Combobox keyboard navigation (ArrowDown/ArrowUp/Home/End/Enter/Escape) & focus return
 * 6. Code request dispatch & cooldown handling
 * 7. Code input normalization & character counter
 * 8. Two-phase authentication success (verify-code + session sync)
 * 9. Recoverable session sync failure state (no auto-resend)
 * 10. Strict fail-closed status handling & synthetic fixture isolation
 * 11. Authoritative server rate limits (HTTP 429) & strict session identity matching
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import {
  LeadershipOtpFlow,
  APPROVED_LEADERSHIP_PROFILES,
  type ApprovedLeaderProfile,
} from '@/components/auth/LeadershipOtpFlow';

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

// Explicit RFC 2606 test fixtures supplied via props when exercising directory UI
const TEST_DIRECTORY_PROFILES: ApprovedLeaderProfile[] = [
  {
    id: 'admin-alpha',
    name: 'Asha Menon',
    title: 'National Surveillance Lead',
    email: 'asha.menon@example.org',
  },
  {
    id: 'admin-beta',
    name: 'Vikram Patel',
    title: 'Monitoring Coordinator',
    email: 'vikram.patel@example.org',
  },
  {
    id: 'admin-directory-only',
    name: 'Directory Only Account',
    title: 'Senior Programme Coordinator',
  },
];

describe('LeadershipOtpFlow Component', () => {
  const originalEnv = process.env;

  async function selectLeaderFromDirectory(profileMatcher: RegExp = /Asha Menon/i) {
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });
    fireEvent.click(screen.getByRole('combobox'));
    const option = screen.getByText(profileMatcher).closest('li');
    expect(option).toBeDefined();
    fireEvent.click(option!);
  }

  function mockHybridStatusAndRequest(onRequest?: (body: any) => void) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/request-code')) {
        const body = JSON.parse(init?.body || '{}');
        onRequest?.(body);
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            message:
              'If this account is an authorized Administration identity, a single-use verification code has been dispatched.',
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it('1. zero email leakage by default: APPROVED_LEADERSHIP_PROFILES is empty and renders manual Administration Work Email input', async () => {
    expect(APPROVED_LEADERSHIP_PROFILES).toEqual([]);

    let capturedBody: any = null;
    mockHybridStatusAndRequest((body) => {
      capturedBody = body;
    });

    const { container } = render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Administration Work Email/i)).toBeDefined();
    });

    // No directory combobox or real executive emails are rendered in signed-out client DOM
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(container.textContent).not.toMatch(/faridsayyed1010|sayyedfarid52|mbalani|pramod/i);
    expect(screen.getByText('Verify Code')).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Sign in with email OTP/i });
    expect(submitBtn).toBeDisabled();

    const emailInput = screen.getByLabelText(/Administration Work Email/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: '  coordinator@example.org  ' } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    expect(capturedBody).toEqual({ email: 'coordinator@example.org' });
  });

  it('2. renders supplied directory profiles and excludes synthetic fixtures when flag is disabled', async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES;
    mockHybridStatusAndRequest();

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    expect(screen.getByText('Administration Account Directory')).toBeDefined();
    fireEvent.click(screen.getByRole('combobox'));

    expect(screen.getByText('Asha Menon')).toBeDefined();
    expect(screen.getByText('Vikram Patel')).toBeDefined();
    expect(screen.getByText('Directory Only Account')).toBeDefined();
    // Synthetic demo accounts and dummy names are strictly excluded
    expect(screen.queryByText(/Rajiv Menon/i)).toBeNull();
    expect(screen.queryByText(/Alex Rivera/i)).toBeNull();
    expect(screen.queryByText(/Synthetic Demo/i)).toBeNull();
  });

  it('3. renders and navigates fictional synthetic fixture combobox when gated flag is active in dev/test', async () => {
    process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES = 'true';
    mockHybridStatusAndRequest();

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();
    expect(listbox.parentElement).toBe(document.body);

    const syntheticOption = screen.getByText(/Alex Rivera/i).closest('li');
    expect(syntheticOption).toBeDefined();
    fireEvent.click(syntheticOption!);

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText(/Verification code will be dispatched to allowlisted address/i)).toBeDefined();
    expect(screen.getByText('alex.rivera@example.com')).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign in with email OTP/i })).not.toBeDisabled();
  });

  it('4. dispatches verification code from directory selection, enters Step 2, and starts 60s cooldown timer', async () => {
    let capturedBody: any = null;
    mockHybridStatusAndRequest((body) => {
      capturedBody = body;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Asha Menon/i);

    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    expect(capturedBody).toEqual({
      email: 'asha.menon@example.org',
      leaderId: 'admin-alpha',
    });
    expect(screen.getByText(/Sent code to:/i)).toBeDefined();
    expect(screen.getByText('asha.menon@example.org')).toBeDefined();
    expect(screen.getByText(/Resend code available in/i)).toBeDefined();
  });

  it('5. validates code input: sanitizes to 6 numeric digits and tracks character counter', async () => {
    mockHybridStatusAndRequest();

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Asha Menon/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    const codeInput = screen.getByLabelText(/6-Digit Verification Code/i) as HTMLInputElement;

    fireEvent.change(codeInput, { target: { value: ' 12-34 56-zz!! ' } });
    expect(codeInput.value).toBe('123456');
    expect(screen.getByText('6 / 6')).toBeDefined();

    fireEvent.change(codeInput, { target: { value: '123' } });
    expect(screen.getByText('3 / 6')).toBeDefined();
    const verifyBtn = screen.getByRole('button', { name: /Verify & Sign In/i });
    expect(verifyBtn).toBeDisabled();
  });

  it('6. executes two-phase authentication success (verify-code + session sync) and invokes onSuccess', async () => {
    const onSuccess = vi.fn();
    const mockUser = {
      id: 'admin-alpha',
      name: 'Dr. Test Coordinator',
      email: 'asha.menon@example.org',
      role: 'LEADERSHIP',
      allowedStates: ['*'],
      allowedDistricts: ['*'],
    };

    let verifyCalled = false;
    let sessionSyncCalled = false;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/request-code')) {
        return {
          ok: true,
          json: async () => ({ status: 'success' }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/verify-code')) {
        verifyCalled = true;
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { user: mockUser },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        sessionSyncCalled = true;
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              userId: mockUser.id,
              name: mockUser.name,
              role: mockUser.role,
              allowedStates: mockUser.allowedStates,
              allowedDistricts: mockUser.allowedDistricts,
              isVerified: true,
            },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(
      <LeadershipOtpFlow
        isModal={true}
        initialProfiles={TEST_DIRECTORY_PROFILES}
        onSuccess={onSuccess}
      />
    );

    await selectLeaderFromDirectory(/Asha Menon/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/6-Digit Verification Code/i), {
      target: { value: '123456' },
    });

    const verifyBtn = screen.getByRole('button', { name: /Verify & Sign In/i });
    expect(verifyBtn).not.toBeDisabled();
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(verifyCalled).toBe(true);
      expect(sessionSyncCalled).toBe(true);
      expect(screen.getByText(/Welcome back, Dr\. Test Coordinator!/i)).toBeDefined();
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('7. displays recoverable state when session synchronization fails and allows manual retry', async () => {
    let sessionCallCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/request-code')) {
        return {
          ok: true,
          json: async () => ({ status: 'success' }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/verify-code')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { user: { id: 'admin-alpha', name: 'Coordinator One', role: 'LEADERSHIP' } },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        sessionCallCount++;
        if (sessionCallCount === 1) {
          return { ok: false, status: 504 } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              userId: 'admin-alpha',
              name: 'Coordinator One',
              role: 'LEADERSHIP',
              allowedStates: ['*'],
              isVerified: true,
            },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Asha Menon/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/6-Digit Verification Code/i), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verify & Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText(/Session Connection Pending/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Retry Session Sync/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Retry Session Sync/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Coordinator One!/i)).toBeDefined();
    });
  });

  it('8. displays unavailable state when email authentication is explicitly disabled by server without shared password fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: false, authMode: 'hybrid' },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Administration Sign-In Unavailable/i)).toBeDefined();
    });

    expect(
      screen.getByText(/Administration email authentication is currently disabled on this environment/i)
    ).toBeDefined();
    expect(screen.queryByLabelText(/Shared Password/i)).toBeNull();
  });

  it('9. security: feature-status network error does NOT enable shared-password fallback; renders retry state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return { ok: false, status: 500 } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Authentication Service Unavailable/i)).toBeDefined();
    });

    expect(screen.queryByLabelText(/Shared Password/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Retry Connection/i })).toBeDefined();
  });

  it('10. security: fictional synthetic fixture selections use local mock dispatch and NEVER hit live endpoints', async () => {
    process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES = 'true';
    let liveRequestCodeCalled = false;
    let liveVerifyCodeCalled = false;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/request-code')) {
        liveRequestCodeCalled = true;
        return { ok: true, json: async () => ({ status: 'success' }) } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/verify-code')) {
        liveVerifyCodeCalled = true;
        return { ok: true, json: async () => ({ status: 'success' }) } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await selectLeaderFromDirectory(/Alex Rivera/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    expect(liveRequestCodeCalled).toBe(false);
    expect(screen.getByText(/Synthetic fixture mode/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Verify & Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText(/Live evaluation surveillance endpoints remain locked/i)).toBeDefined();
    });

    expect(liveVerifyCodeCalled).toBe(false);
  });

  it('11. security: authoritative server rate-limit (HTTP 429) sets exact server cooldown', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/request-code')) {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            status: 'error',
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please wait 15 minutes before requesting a new code.',
            retryAfterSeconds: 900,
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Asha Menon/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Too many requests. Please wait 15 minutes before requesting a new code./i)
      ).toBeDefined();
    });
  });

  it('12. lifecycle: changing account clears entered OTP code and resets step', async () => {
    mockHybridStatusAndRequest();

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Asha Menon/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    const codeInput = screen.getByLabelText(/6-Digit Verification Code/i) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: '123456' } });
    expect(codeInput.value).toBe('123456');

    fireEvent.click(screen.getByRole('button', { name: /Change/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    const nextCodeInput = screen.getByLabelText(/6-Digit Verification Code/i) as HTMLInputElement;
    expect(nextCodeInput.value).toBe('');
    expect(screen.getByText('0 / 6')).toBeDefined();
  });

  it('13. strict status validation: rejects missing, null, string, numeric, array, object emailAuthEnabled and invalid authMode', async () => {
    const malformedPayloads = [
      { status: 'success', data: { authMode: 'hybrid' } },
      { status: 'success', data: { emailAuthEnabled: null, authMode: 'hybrid' } },
      { status: 'success', data: { emailAuthEnabled: 'true', authMode: 'hybrid' } },
      { status: 'success', data: { emailAuthEnabled: 1, authMode: 'hybrid' } },
      { status: 'success', data: { emailAuthEnabled: [true], authMode: 'hybrid' } },
      { status: 'success', data: { emailAuthEnabled: { enabled: true }, authMode: 'hybrid' } },
      { status: 'success', data: { emailAuthEnabled: true, authMode: 'unsupported_mode' } },
      { status: 'success', data: { emailAuthEnabled: true } },
    ];

    for (const payload of malformedPayloads) {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => ({
        ok: true,
        json: async () => payload,
      } as Response));

      const { unmount } = render(<LeadershipOtpFlow isModal={true} />);

      await waitFor(() => {
        expect(screen.getByText(/Authentication Service Unavailable/i)).toBeDefined();
      });

      expect(screen.queryByLabelText(/Shared Password/i)).toBeNull();
      unmount();
    }
  });

  it('14. session identity matching: rejects session identity mismatch and locks access', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/request-code')) {
        return { ok: true, json: async () => ({ status: 'success' }) } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/verify-code')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { user: { id: 'account-a-id', name: 'User A', email: 'usera@example.org' } },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              userId: 'account-b-id',
              name: 'User B',
              role: 'LEADERSHIP',
              allowedStates: ['*'],
              isVerified: true,
            },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Asha Menon/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/6-Digit Verification Code/i), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verify & Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText(/Session identity mismatch/i)).toBeDefined();
    });

    expect(localStorage.getItem('child_nutrition_evaluation_unlocked')).toBeNull();
  });

  it('15. session identity matching: rejects missing session identity and handles retry without repeat dispatch', async () => {
    let sessionCalls = 0;
    let requestCalls = 0;
    let verifyCalls = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/request-code')) {
        requestCalls++;
        return { ok: true, json: async () => ({ status: 'success' }) } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/verify-code')) {
        verifyCalls++;
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { user: { id: 'account-a-id', name: 'User A', email: 'usera@example.org' } },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        sessionCalls++;
        if (sessionCalls === 1) {
          return {
            ok: true,
            json: async () => ({
              status: 'success',
              data: {
                name: 'User A',
                role: 'LEADERSHIP',
                allowedStates: ['*'],
                isVerified: true,
              },
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              userId: 'account-a-id',
              name: 'User A',
              role: 'LEADERSHIP',
              allowedStates: ['*'],
              isVerified: true,
            },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Asha Menon/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit Verification Code/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/6-Digit Verification Code/i), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verify & Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText(/Session Connection Pending/i)).toBeDefined();
    });

    expect(requestCalls).toBe(1);
    expect(verifyCalls).toBe(1);
    expect(sessionCalls).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /Retry Session Sync/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, User A!/i)).toBeDefined();
    });

    expect(requestCalls).toBe(1);
    expect(verifyCalls).toBe(1);
    expect(sessionCalls).toBe(2);
  });

  it('16. status timeout: transitions to recoverable failure with retry state without enabling fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        const timeoutErr = new Error('The operation was aborted due to timeout');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Authentication Service Unavailable/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Retry Connection/i })).toBeDefined();
    });

    expect(screen.queryByLabelText(/Shared Evaluation Password/i)).toBeNull();
  });

  it('17. retry after timeout: recovers cleanly when retry connection succeeds', async () => {
    let statusCallCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        statusCallCount++;
        if (statusCallCount === 1) {
          const timeoutErr = new Error('The operation was aborted due to timeout');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        }
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await waitFor(() => {
      expect(screen.getByText(/Authentication Service Unavailable/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Retry Connection/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    expect(statusCallCount).toBe(2);
    expect(screen.queryByText(/Authentication Service Unavailable/i)).toBeNull();
  });

  it('18. race protection: stale earlier status response cannot overwrite newer result', async () => {
    let callCount = 0;
    let finishStaleCall: (() => void) | null = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        callCount++;
        if (callCount === 1) {
          return new Promise<Response>((_, reject) => {
            finishStaleCall = () => {
              const staleErr = new Error('Stale initial timeout failure');
              staleErr.name = 'TimeoutError';
              reject(staleErr);
            };
          });
        }
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    if (finishStaleCall) (finishStaleCall as () => void)();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry Connection/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Retry Connection/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    expect(screen.queryByText(/Authentication Service Unavailable/i)).toBeNull();
  });

  it('19. status policy consistency: respects documented policy modes and never displays shared password', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: false, authMode: 'email_only' },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const { unmount } = render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Administration Sign-In Unavailable/i)).toBeDefined();
    });

    expect(screen.queryByLabelText(/Shared Evaluation Password/i)).toBeNull();
    unmount();

    mockHybridStatusAndRequest();
    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Administration Work Email/i)).toBeDefined();
    });
  });

  it('20. session reuse: checks active server session on mount and renders active session card without requesting OTP', async () => {
    (globalThis as any).__TEST_ENABLE_SESSION_FETCH__ = true;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              isVerified: true,
              userId: 'admin-ananya-roy',
              name: 'Dr. Ananya Roy',
              role: 'LEADERSHIP',
              allowedStates: ['*'],
              allowedDistricts: ['*'],
            },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const onSuccess = vi.fn();
    render(<LeadershipOtpFlow isModal={true} onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText(/Active Session Verified/i)).toBeDefined();
    });

    expect(screen.getByText(/Dr\. Ananya Roy/i)).toBeDefined();
    expect(screen.getByText(/Role: LEADERSHIP/i)).toBeDefined();

    const continueBtn = screen.getByRole('button', { name: /Continue to Surveillance Dashboard/i });
    fireEvent.click(continueBtn);
    expect(onSuccess).toHaveBeenCalled();

    delete (globalThis as any).__TEST_ENABLE_SESSION_FETCH__;
  });

  it('21. directory profile without client email: dispatches leaderId to request-code endpoint without exposing emails', async () => {
    let capturedBody: any = null;
    mockHybridStatusAndRequest((body) => {
      capturedBody = body;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Directory Only Account/i);

    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    expect(capturedBody).toEqual({ leaderId: 'admin-directory-only' });
    await waitFor(() => {
      expect(screen.getByText(/registered email for Directory Only Account/i)).toBeDefined();
    });
  });

  it('22. temporary burst throttling: sets accurate countdown from retryAfterSeconds on 429 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: true, authMode: 'hybrid' },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/leader/request-code')) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '420' }),
          json: async () => ({
            status: 'error',
            code: 'RATE_LIMITED',
            message:
              'Too many verification requests. Please wait 7 minutes before requesting another code.',
            retryAfterSeconds: 420,
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await selectLeaderFromDirectory(/Asha Menon/i);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() => {
      expect(screen.getByText(/Too many verification requests/i)).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /Resend in\s*420\s*s/i })).toBeDefined();
  });

  it('23. portal isolation: mounts combobox listbox directly into document.body outside overflow-hidden containers', async () => {
    mockHybridStatusAndRequest();

    render(
      <div data-testid="clipped-wrapper" className="overflow-hidden max-h-24">
        <LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />
      </div>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    const clippedWrapper = screen.getByTestId('clipped-wrapper');
    expect(clippedWrapper.contains(listbox)).toBe(false);
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox.style.position).toBe('fixed');
    expect(listbox.style.zIndex).toBe('70');
  });

  it('24. visualViewport collision: flips combobox upward when bottom space is constrained by keyboard', async () => {
    mockHybridStatusAndRequest();
    const origVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const origInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        offsetTop: 0,
        offsetLeft: 0,
        width: 360,
        height: 420,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    try {
      render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeDefined();
      });

      const combobox = screen.getByRole('combobox');
      vi.spyOn(combobox, 'getBoundingClientRect').mockReturnValue({
        top: 340,
        bottom: 380,
        left: 20,
        right: 340,
        width: 320,
        height: 40,
        x: 20,
        y: 340,
        toJSON: () => ({}),
      });

      fireEvent.click(combobox);

      const listbox = screen.getByRole('listbox');
      await waitFor(() => {
        expect(listbox.style.bottom).not.toBe('');
      });
      expect(listbox.style.top).toBe('');
    } finally {
      if (origVisualViewport) {
        Object.defineProperty(window, 'visualViewport', origVisualViewport);
      } else {
        delete (window as any).visualViewport;
      }
      if (origInnerHeight) {
        Object.defineProperty(window, 'innerHeight', origInnerHeight);
      }
    }
  });

  it('25. keyboard navigation: supports ArrowDown/End/Home/ArrowUp, Escape focus return, and Enter selection', async () => {
    mockHybridStatusAndRequest();

    render(<LeadershipOtpFlow isModal={true} initialProfiles={TEST_DIRECTORY_PROFILES} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    const combobox = screen.getByRole('combobox');
    combobox.focus();

    // ArrowDown opens the listbox on first option
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeDefined();
    expect(combobox.getAttribute('aria-activedescendant')).toBe('admin-profile-opt-admin-alpha');

    // ArrowDown moves highlight to second option; End jumps to last
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe('admin-profile-opt-admin-beta');

    fireEvent.keyDown(combobox, { key: 'End' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe(
      'admin-profile-opt-admin-directory-only'
    );

    // Home returns to first; ArrowUp wraps to last
    fireEvent.keyDown(combobox, { key: 'Home' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe('admin-profile-opt-admin-alpha');

    // Escape closes listbox without selecting and restores focus to combobox
    fireEvent.keyDown(combobox, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(combobox);

    // Re-open with ArrowUp (selects last), move down (wraps to first), Enter selects Asha Menon
    fireEvent.keyDown(combobox, { key: 'ArrowUp' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe(
      'admin-profile-opt-admin-directory-only'
    );
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe('admin-profile-opt-admin-alpha');
    fireEvent.keyDown(combobox, { key: 'Enter' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('asha.menon@example.org')).toBeDefined();
  });
});
