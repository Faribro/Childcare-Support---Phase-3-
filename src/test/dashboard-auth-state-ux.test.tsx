import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { supervisorReadModel } from '@/lib/read-model/supervisorReadModel';
import { useSupervisorData } from '@/hooks/useSupervisorData';
import { useEvaluationAccess, setEvaluationUnlocked } from '@/lib/auth/evaluationAccess';
import { useSubmissionSummary } from '@/hooks/useSubmissionSummary';
import SupervisorDashboardPage from '@/app/supervisor/page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/supervisor',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Test harness component for useSupervisorData
function SupervisorDataTestConsumer({ enabled }: { enabled?: boolean }) {
  const data = useSupervisorData({ enabled });
  return (
    <div>
      <span data-testid="status">{data.status}</span>
      <span data-testid="is-loading">{String(data.isLoading)}</span>
      <span data-testid="is-error">{String(data.isError)}</span>
      <span data-testid="is-unauthorized">{String(data.isUnauthorized)}</span>
      <span data-testid="is-forbidden">{String(data.isForbidden)}</span>
      <span data-testid="records-count">{data.records.length}</span>
    </div>
  );
}

// Test harness component for useSubmissionSummary
function SubmissionSummaryTestConsumer() {
  const summary = useSubmissionSummary();
  return (
    <div>
      <span data-testid="summary-source">{summary.source}</span>
      <span data-testid="summary-loading">{String(summary.isLoading)}</span>
      <span data-testid="summary-error">{String(summary.isError)}</span>
      <span data-testid="summary-count">{summary.submittedCount}</span>
    </div>
  );
}

describe('Evaluation & Surveillance Dashboard Authentication State & UX Error Handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    supervisorReadModel.purgeSession();
    (globalThis as any).__TEST_ENABLE_SESSION_FETCH__ = false;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    supervisorReadModel.purgeSession();
    delete (globalThis as any).__TEST_ENABLE_SESSION_FETCH__;
  });

  describe('1. Read Model & Hook Gating', () => {
    it('does NOT trigger fetchSubmissions when enabled is false', async () => {
      let fetchCalled = false;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCalled = true;
        return {
          ok: false,
          status: 401,
          json: async () => ({ status: 'error', code: 'UNAUTHORIZED' }),
        };
      });

      render(<SupervisorDataTestConsumer enabled={false} />);

      expect(fetchCalled).toBe(false);
      expect(screen.getByTestId('status').textContent).toBe('idle');
      expect(screen.getByTestId('is-loading').textContent).toBe('false');
      expect(screen.getByTestId('records-count').textContent).toBe('0');
    });

    it('transitions to unauthorized status and halts polling on 401 response', async () => {
      let fetchCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/submissions')) {
          fetchCount++;
          return {
            ok: false,
            status: 401,
            json: async () => ({
              status: 'error',
              code: 'UNAUTHORIZED',
              message: 'Authentication required to read beneficiary submissions.',
              retryable: false,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      render(<SupervisorDataTestConsumer enabled={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('unauthorized');
      });

      expect(screen.getByTestId('is-unauthorized').textContent).toBe('true');
      expect(screen.getByTestId('is-forbidden').textContent).toBe('false');
      expect(screen.getByTestId('is-error').textContent).toBe('true');
      expect(screen.getByTestId('records-count').textContent).toBe('0');
      expect(fetchCount).toBe(1);
    });

    it('transitions to forbidden status on 403 response without retrying', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/submissions')) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              status: 'error',
              code: 'FORBIDDEN_SCOPE',
              message: 'User does not have access to requested state.',
              retryable: false,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      render(<SupervisorDataTestConsumer enabled={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('forbidden');
      });

      expect(screen.getByTestId('is-forbidden').textContent).toBe('true');
      expect(screen.getByTestId('is-unauthorized').textContent).toBe('false');
      expect(screen.getByTestId('is-error').textContent).toBe('true');
    });
  });

  describe('2. Client Session Synchronization in evaluationAccess', () => {
    it('clears unauthenticated local cache when server reports isVerified: false', async () => {
      (globalThis as any).__TEST_ENABLE_SESSION_FETCH__ = true;
      localStorage.setItem('child_nutrition_evaluation_unlocked', 'true');
      localStorage.setItem(
        'child_nutrition:user_session_v1',
        JSON.stringify({ userId: 'stale-user', isVerified: false })
      );

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            userId: 'anonymous-field',
            name: 'Field Worker (Unauthenticated)',
            role: 'FIELD_USER',
            allowedStates: [],
            allowedDistricts: [],
            isVerified: false,
          },
        }),
      });

      function TestAccessConsumer() {
        const { isUnlocked, isLoaded, user } = useEvaluationAccess();
        return (
          <div>
            <span data-testid="is-loaded">{String(isLoaded)}</span>
            <span data-testid="is-unlocked">{String(isUnlocked)}</span>
            <span data-testid="user">{user ? user.userId : 'none'}</span>
          </div>
        );
      }

      render(<TestAccessConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId('is-loaded').textContent).toBe('true');
      });

      expect(screen.getByTestId('is-unlocked').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('none');
      expect(localStorage.getItem('child_nutrition_evaluation_unlocked')).toBeNull();
    });
  });

  describe('3. Submission Summary Graceful Fallback', () => {
    it('falls back smoothly to local storage on 401 without firing secondary fallback or marking error', async () => {
      let summaryCalls = 0;
      let submissionsCalls = 0;

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/submissions/summary')) {
          summaryCalls++;
          return {
            ok: false,
            status: 401,
            json: async () => ({ status: 'error', code: 'UNAUTHORIZED' }),
          };
        }
        if (url.includes('/api/submissions')) {
          submissionsCalls++;
          return {
            ok: false,
            status: 401,
            json: async () => ({ status: 'error', code: 'UNAUTHORIZED' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      render(<SubmissionSummaryTestConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId('summary-loading').textContent).toBe('false');
      });

      expect(summaryCalls).toBe(1);
      // Secondary fallback endpoint should NOT be called on 401
      expect(submissionsCalls).toBe(0);
      expect(screen.getByTestId('summary-error').textContent).toBe('false');
      expect(screen.getByTestId('summary-source').textContent).toBe('local');
    });
  });

  describe('4. Dashboard UI Presentation & Error Separation', () => {
    it('renders Authentication Required card with Sign In to Access button when session is not unlocked', async () => {
      render(<SupervisorDashboardPage />);

      expect(screen.getByText('Authentication Required')).toBeDefined();
      expect(screen.getByText('Sign In to Access')).toBeDefined();
      expect(screen.queryByText('Failed to Load Surveillance Metrics')).toBeNull();
      expect(screen.queryByText('Retry Connection')).toBeNull();
    });

    it('renders truthful Session Authentication Required banner when session expires with 401', async () => {
      // Simulate verified session unlock
      setEvaluationUnlocked(true, {
        userId: 'rev-mh-01',
        name: 'Maharashtra Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
      });

      // API responds with 401 (e.g. cookie expired)
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/submissions')) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              status: 'error',
              code: 'UNAUTHORIZED',
              message: 'Authentication required to read beneficiary submissions.',
              retryable: false,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      render(<SupervisorDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Session Authentication Required')).toBeDefined();
      });

      expect(
        screen.getByText(
          'Your session has expired or requires authentication. Please sign in to read beneficiary surveillance records.'
        )
      ).toBeDefined();

      // Primary action must be Sign In Again, NOT misleading Retry Connection
      expect(screen.getByText('Sign In Again')).toBeDefined();
      expect(screen.queryByText('Failed to Load Surveillance Metrics')).toBeNull();
      expect(screen.queryByText('Retry Connection')).toBeNull();
      expect(screen.queryByText('Connection error')).toBeNull();
    });

    it('renders Geographic Scope Restricted banner when session encounters 403', async () => {
      setEvaluationUnlocked(true, {
        userId: 'rev-mh-01',
        name: 'Maharashtra Reviewer',
        role: 'STATE_REVIEWER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['*'],
        isVerified: true,
      });

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/submissions')) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              status: 'error',
              code: 'FORBIDDEN_SCOPE',
              message: 'User scope [Maharashtra] rejected for state Delhi',
              retryable: false,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      render(<SupervisorDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Geographic Scope Restricted')).toBeDefined();
      });

      expect(screen.getByText('User scope [Maharashtra] rejected for state Delhi')).toBeDefined();
      expect(screen.queryByText('Failed to Load Surveillance Metrics')).toBeNull();
      expect(screen.queryByText('Retry Connection')).toBeNull();
    });
  });
});
