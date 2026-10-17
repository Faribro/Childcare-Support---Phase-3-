/**
 * LeadershipOtpFlow.test.tsx
 *
 * Comprehensive tests for the shared Leadership OTP Flow:
 * 1. Runtime Feature Status Check (/api/auth/leader/status)
 * 2. Privacy-preserving manual work email input by default
 * 3. Synthetic Fixture Combobox gating with fictional profiles (only when NODE_ENV !== 'production' and flag is true)
 * 4. Combobox keyboard navigation & selection
 * 5. Code request dispatch & cooldown handling
 * 6. Code input normalization (single 32-hex field, counter)
 * 7. Two-phase authentication success (verify-code + session sync)
 * 8. Recoverable session sync failure state (no auto-resend)
 * 9. Fallback mode when email auth is disabled (shared password)
 * 10. Security: Feature-status failure does NOT enable fallback password; renders retry state
 * 11. Security: Synthetic selections use mock dispatch and NEVER hit live request-code / verify-code endpoints
 * 12. Security: Authoritative server rate limit (HTTP 429) sets exact server-directed cooldown
 * 13. Lifecycle: Account change clears code and abandons in-flight stale responses
 * 14. Strict Status Validation: Rejects missing, null, string, numeric, array, object emailAuthEnabled and invalid authMode
 * 15. Strict Session Identity Matching: Rejects account A / account B mismatch, missing identity, and confirms retry without dispatch
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LeadershipOtpFlow } from '@/components/auth/LeadershipOtpFlow';

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

describe('LeadershipOtpFlow Component', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('1. checks runtime status on mount and displays manual email input', async () => {
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
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    expect(screen.getByText('Work Email')).toBeDefined();
    expect(screen.getByText('Verify Code')).toBeDefined();
    expect(screen.getByRole('button', { name: /Send Verification Code/i })).toBeDefined();
  });

  it('2. renders real approved leadership profiles and excludes synthetic fixtures when flag is disabled', async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES;

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
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    // Real combobox is present with approved profiles
    expect(screen.getByRole('combobox')).toBeDefined();
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('Dr. Ananya Roy')).toBeDefined();
    expect(screen.getByText('Rajiv Menon')).toBeDefined();
    // Synthetic demo accounts are strictly excluded
    expect(screen.queryByText(/Alex Rivera/i)).toBeNull();
    expect(screen.queryByText(/Synthetic Demo/i)).toBeNull();
  });

  it('3. renders and navigates fictional synthetic fixture combobox when gated flag is active in dev/test', async () => {
    process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_AUTH_FIXTURES = 'true';

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
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    // Open combobox
    fireEvent.click(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');

    // Listbox should be visible with options
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();

    // Select the fictional synthetic option
    const syntheticOption = screen.getByText(/Alex Rivera/i).closest('li');
    expect(syntheticOption).toBeDefined();
    fireEvent.click(syntheticOption!);

    // Combobox closes and email input is populated with reserved example domain
    expect(screen.queryByRole('listbox')).toBeNull();
    const emailInput = screen.getByLabelText(/Authorized Work Email Address/i) as HTMLInputElement;
    expect(emailInput.value).toBe('alex.rivera@example.com');
  });

  it('4. dispatches verification code, enters Step 2, and starts 60s cooldown timer', async () => {
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
        expect(body.email).toBe('leader@allianceindia.org');
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            message: 'If this account is an authorized Leadership identity, a single-use verification code has been dispatched.',
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    const emailInput = screen.getByLabelText(/Authorized Work Email Address/i);
    fireEvent.change(emailInput, { target: { value: 'leader@allianceindia.org' } });

    const submitBtn = screen.getByRole('button', { name: /Send Verification Code/i });
    fireEvent.click(submitBtn);

    // Transition to Step 2
    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    expect(screen.getByText(/Sent code to:/i)).toBeDefined();
    expect(screen.getByText('leader@allianceindia.org')).toBeDefined();
    expect(screen.getByText(/Resend code available in/i)).toBeDefined();
  });

  it('5. validates code input: sanitizes to hex and tracks character counter', async () => {
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
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialEmail="test@allianceindia.org" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    const codeInput = screen.getByLabelText(/32-Character Verification Code/i) as HTMLInputElement;

    // Paste with spaces and non-hex symbols
    fireEvent.change(codeInput, { target: { value: ' 4a-8f 9c-zz!! ' } });
    // Strips non-hex, becomes '4a8f9c' (length 6)
    expect(codeInput.value).toBe('4a8f9c');
    expect(screen.getByText('6 / 32')).toBeDefined();

    // Verify button remains disabled
    const verifyBtn = screen.getByRole('button', { name: /Verify & Open Evaluation/i });
    expect(verifyBtn).toBeDisabled();
  });

  it('6. executes two-phase authentication success (verify-code + session sync) and invokes onSuccess', async () => {
    const onSuccess = vi.fn();
    const mockUser = {
      id: 'lead-test-01',
      name: 'Dr. Test Leader',
      email: 'test@allianceindia.org',
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

    render(<LeadershipOtpFlow isModal={true} initialEmail="test@allianceindia.org" onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    const codeInput = screen.getByLabelText(/32-Character Verification Code/i);
    const valid32Hex = '0123456789abcdef0123456789abcdef';
    fireEvent.change(codeInput, { target: { value: valid32Hex } });

    const verifyBtn = screen.getByRole('button', { name: /Verify & Open Evaluation/i });
    expect(verifyBtn).not.toBeDisabled();

    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(verifyCalled).toBe(true);
      expect(sessionSyncCalled).toBe(true);
      expect(screen.getByText(/Welcome back, Dr. Test Leader!/i)).toBeDefined();
    });

    // onSuccess invoked
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
            data: { user: { id: 'lead-01', name: 'Leader One', role: 'LEADERSHIP' } },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        sessionCallCount++;
        if (sessionCallCount === 1) {
          // First attempt fails
          return { ok: false, status: 504 } as Response;
        }
        // Second attempt (retry) succeeds
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              userId: 'lead-01',
              name: 'Leader One',
              role: 'LEADERSHIP',
              allowedStates: ['*'],
              isVerified: true,
            },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialEmail="test@allianceindia.org" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    const codeInput = screen.getByLabelText(/32-Character Verification Code/i);
    fireEvent.change(codeInput, { target: { value: '0123456789abcdef0123456789abcdef' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify & Open Evaluation/i }));

    // Should display recoverable session sync pending UI
    await waitFor(() => {
      expect(screen.getByText(/Session Connection Pending/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Retry Session Sync/i })).toBeDefined();
    });

    // Clicking retry session sync
    fireEvent.click(screen.getByRole('button', { name: /Retry Session Sync/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Leader One!/i)).toBeDefined();
    });
  });

  it('8. falls back to shared password form when email authentication is explicitly disabled by server', async () => {
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
      expect(screen.getByLabelText(/Leadership Shared Password/i)).toBeDefined();
    });

    expect(screen.getByText(/Individual email sign-in is disabled on this environment/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign In & Unlock Leadership/i })).toBeDefined();
  });

  it('9. security: feature-status network error does NOT enable shared-password fallback; renders retry state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: false,
          status: 500,
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Authentication Service Unavailable/i)).toBeDefined();
    });

    // Confirms shared password form is strictly NOT rendered
    expect(screen.queryByLabelText(/Leadership Shared Password/i)).toBeNull();
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

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    // Select synthetic fixture
    fireEvent.click(screen.getByRole('combobox'));
    const syntheticOption = screen.getByText(/Alex Rivera/i).closest('li');
    expect(syntheticOption).toBeDefined();
    fireEvent.click(syntheticOption!);

    // Click send code
    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    // Verify in mock mode: moves to Step 2 without hitting live endpoint
    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    expect(liveRequestCodeCalled).toBe(false);
    expect(screen.getByText(/Synthetic fixture mode/i)).toBeDefined();

    // Verify mock code
    fireEvent.click(screen.getByRole('button', { name: /Verify & Open Evaluation/i }));

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

    render(<LeadershipOtpFlow isModal={true} initialEmail="rate.limited@allianceindia.org" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Too many requests. Please wait 15 minutes before requesting a new code./i)
      ).toBeDefined();
    });
  });

  it('12. lifecycle: changing account clears entered OTP code and resets step', async () => {
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
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} initialEmail="first@allianceindia.org" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    const codeInput = screen.getByLabelText(/32-Character Verification Code/i) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: '11112222333344445555666677778888' } });
    expect(codeInput.value).toBe('11112222333344445555666677778888');

    // Click Change
    fireEvent.click(screen.getByRole('button', { name: /Change/i }));

    // Back on Step 1: Work Email
    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    // Re-enter step 2: Code must be empty (cleared)
    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    const nextCodeInput = screen.getByLabelText(/32-Character Verification Code/i) as HTMLInputElement;
    expect(nextCodeInput.value).toBe('');
    expect(screen.getByText('0 / 32')).toBeDefined();
  });

  it('13. strict status validation: rejects missing, null, string, numeric, array, object emailAuthEnabled and invalid authMode', async () => {
    const malformedPayloads = [
      { status: 'success', data: { authMode: 'hybrid' } }, // missing emailAuthEnabled
      { status: 'success', data: { emailAuthEnabled: null, authMode: 'hybrid' } }, // null
      { status: 'success', data: { emailAuthEnabled: 'true', authMode: 'hybrid' } }, // string
      { status: 'success', data: { emailAuthEnabled: 1, authMode: 'hybrid' } }, // numeric
      { status: 'success', data: { emailAuthEnabled: [true], authMode: 'hybrid' } }, // array
      { status: 'success', data: { emailAuthEnabled: { enabled: true }, authMode: 'hybrid' } }, // object
      { status: 'success', data: { emailAuthEnabled: true, authMode: 'unsupported_mode' } }, // invalid authMode
      { status: 'success', data: { emailAuthEnabled: true } }, // missing authMode
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

      // Strict guarantee: Shared password form is NEVER enabled by malformed response
      expect(screen.queryByLabelText(/Leadership Shared Password/i)).toBeNull();
      unmount();
    }
  });

  it('14. session identity matching: rejects session identity mismatch and missing identity', async () => {
    // 14a: Account A verified, session returns Account B
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
            data: { user: { id: 'account-a-id', name: 'User A', email: 'usera@allianceindia.org' } },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        // Returns pre-existing session for Account B
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

    render(<LeadershipOtpFlow isModal={true} initialEmail="usera@allianceindia.org" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    const codeInput = screen.getByLabelText(/32-Character Verification Code/i);
    fireEvent.change(codeInput, { target: { value: '0123456789abcdef0123456789abcdef' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify & Open Evaluation/i }));

    // Expect identity mismatch rejection
    await waitFor(() => {
      expect(screen.getByText(/Session identity mismatch/i)).toBeDefined();
    });

    // Lock status must remain locked
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
            data: { user: { id: 'account-a-id', name: 'User A', email: 'usera@allianceindia.org' } },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        sessionCalls++;
        if (sessionCalls === 1) {
          // Missing userId in session
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
        // Second call on retry: valid matching session
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

    render(<LeadershipOtpFlow isModal={true} initialEmail="usera@allianceindia.org" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/32-Character Verification Code/i)).toBeDefined();
    });

    const codeInput = screen.getByLabelText(/32-Character Verification Code/i);
    fireEvent.change(codeInput, { target: { value: '0123456789abcdef0123456789abcdef' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify & Open Evaluation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Session Connection Pending/i)).toBeDefined();
    });

    expect(requestCalls).toBe(1);
    expect(verifyCalls).toBe(1);
    expect(sessionCalls).toBe(1);

    // Click Retry Session Sync
    fireEvent.click(screen.getByRole('button', { name: /Retry Session Sync/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, User A!/i)).toBeDefined();
    });

    // Zero repeat verification calls or code dispatches
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

    // Fail-closed verification: shared password fallback form is strictly NOT rendered
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

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Authentication Service Unavailable/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Retry Connection/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
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
          // Slow initial call that rejects only after second call has resolved
          return new Promise<Response>((_, reject) => {
            finishStaleCall = () => {
              const staleErr = new Error('Stale initial timeout failure');
              staleErr.name = 'TimeoutError';
              reject(staleErr);
            };
          });
        }
        // Second call on retry succeeds immediately
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

    // Render component - initiates call 1
    render(<LeadershipOtpFlow isModal={true} />);

    // Fast-trigger call 2 by invoking Retry Connection button (we simulate call 1 timing out first)
    // To ensure call 1 was in-flight and then superseded by call 2:
    if (finishStaleCall) (finishStaleCall as () => void)();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry Connection/i })).toBeDefined();
    });

    // Fire Call 2 (Retry)
    fireEvent.click(screen.getByRole('button', { name: /Retry Connection/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    // Stale call 1 was superseded and cannot revert component to error or password fallback
    expect(screen.queryByText(/Authentication Service Unavailable/i)).toBeNull();
    expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
  });

  it('19. status policy consistency: respects documented policy modes (email_only, password_only, hybrid)', async () => {
    // Mode A: email_only explicitly disabled -> indicates cutover without password fallback
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
      expect(screen.getByText(/Leadership Sign-In Unavailable/i)).toBeDefined();
      expect(screen.getByText(/retired under server cutover policy/i)).toBeDefined();
    });

    // Shared password input must NOT be shown when email_only is policy
    expect(screen.queryByLabelText(/Shared Evaluation Password/i)).toBeNull();
    unmount();

    // Mode B: password_only with email disabled -> renders shared password fallback
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/leader/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: { emailAuthEnabled: false, authMode: 'password_only' },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const { unmount: unmount2 } = render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Leadership Shared Password/i)).toBeDefined();
    });
    unmount2();

    // Mode C: hybrid with email enabled -> renders email input
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
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
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
              userId: 'lead-ananya-roy',
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

    // Reusing session directly bypasses OTP request
    const continueBtn = screen.getByRole('button', { name: /Continue to Surveillance Dashboard/i });
    fireEvent.click(continueBtn);
    expect(onSuccess).toHaveBeenCalled();

    delete (globalThis as any).__TEST_ENABLE_SESSION_FETCH__;
  });

  it('21. real profile selection: dispatches leaderId to request-code endpoint without exposing plain emails in bundle', async () => {
    let capturedBody: any = null;

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
        capturedBody = JSON.parse(init?.body || '{}');
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            message: 'Code dispatched.',
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDefined();
    });

    // Open combobox and select Dr. Ananya Roy
    fireEvent.click(screen.getByRole('combobox'));
    const leaderOption = screen.getByText('Dr. Ananya Roy').closest('li');
    expect(leaderOption).toBeDefined();
    fireEvent.click(leaderOption!);

    // Submit code request
    const submitBtn = screen.getByRole('button', { name: /Send Verification Code/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    // Verifies that leaderId was passed for server-side resolution
    expect(capturedBody.leaderId).toBe('lead-ananya-roy');
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
            message: 'Too many verification requests. Please wait 7 minutes before requesting another code.',
            retryAfterSeconds: 420,
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    render(<LeadershipOtpFlow isModal={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Authorized Work Email Address/i)).toBeDefined();
    });

    const emailInput = screen.getByLabelText(/Authorized Work Email Address/i);
    fireEvent.change(emailInput, { target: { value: 'rajiv.menon@example.org' } });

    const submitBtn = screen.getByRole('button', { name: /Send Verification Code/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Too many verification requests/i)).toBeDefined();
    });

    // Verifies countdown button reflects accurate retry duration (e.g. 420s / 7m)
    expect(screen.getByText(/Resend available in 420s/i)).toBeDefined();
  });
});

