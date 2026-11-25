import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { CompactMasthead } from '@/components/layout/CompactMasthead';
import * as evalAccess from '@/lib/auth/evaluationAccess';

// Mock useRouter and usePathname
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = '/app';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useSubmissionSummary', () => ({
  useSubmissionSummary: () => ({
    submittedCount: 5,
    localPendingSyncCount: 2,
    isLocalOnlyCount: false,
    refresh: vi.fn(),
  }),
}));

describe('Workstream A: Role-Aware Workspace Routing & Navigation Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/app';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders Evaluation Navigation Pill Dock when authenticated as LEADERSHIP', () => {
    vi.spyOn(evalAccess, 'useEvaluationAccess').mockReturnValue({
      isUnlocked: true,
      isAuthenticated: true,
      isLoading: false,
      isLoaded: true,
      user: {
        userId: 'lead-001',
        name: 'National Director',
        role: 'LEADERSHIP',
        allowedStates: ['*'],
        allowedDistricts: ['*'],
        isVerified: true,
      },
      login: vi.fn(),
      logout: vi.fn(),
      unlock: vi.fn(),
      lock: vi.fn() as any,
      toggle: vi.fn(),
    });

    render(<CompactMasthead />);

    // Brand logo should link to /supervisor
    const brandLogoLinks = screen.getAllByRole('link', { name: /Alliance India Home/i });
    expect(brandLogoLinks.length).toBeGreaterThanOrEqual(1);
    expect(brandLogoLinks[0].getAttribute('href')).toBe('/supervisor');

    // Desktop & mobile nav items for Evaluation Workspace
    expect(screen.getByRole('link', { name: /Overview/i })).toBeDefined();
    const linelistLinks = screen.getAllByRole('link', { name: /Beneficiary Linelist/i });
    expect(linelistLinks.length).toBeGreaterThanOrEqual(1);
    expect(linelistLinks[0].getAttribute('href')).toBe('/supervisor/assessments');
    expect(screen.getByRole('link', { name: /Analytics/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /Field Workers/i })).toBeDefined();

    // Field-worker Forms tab and Outbox badge MUST NOT be displayed
    expect(screen.queryByRole('link', { name: /^Forms$/i })).toBeNull();
    expect(screen.queryByTestId('waiting-to-send-badge')).toBeNull();
  });

  it('2. Renders Field-Worker Forms & Outbox navigation when user is FIELD_USER', () => {
    vi.spyOn(evalAccess, 'useEvaluationAccess').mockReturnValue({
      isUnlocked: false,
      isAuthenticated: true,
      isLoading: false,
      isLoaded: true,
      user: {
        userId: 'field-001',
        name: 'Caseworker Anita',
        role: 'FIELD_USER',
        allowedStates: ['Maharashtra'],
        allowedDistricts: ['Pune'],
        isVerified: true,
      },
      login: vi.fn(),
      logout: vi.fn(),
      unlock: vi.fn(),
      lock: vi.fn() as any,
      toggle: vi.fn(),
    });

    render(<CompactMasthead pendingSyncCount={3} submittedCount={5} />);

    // Brand logo should link to /app
    const brandLogoLinks = screen.getAllByRole('link', { name: /Alliance India Home/i });
    expect(brandLogoLinks[0].getAttribute('href')).toBe('/app');

    // Center dock has Forms and Submitted Surveys
    expect(screen.getByRole('link', { name: /^Forms$/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /Submitted Surveys/i })).toBeDefined();

    // Outbox badge is displayed for field worker with pending surveys
    expect(screen.queryByTestId('waiting-to-send-badge')).not.toBeNull();
  });

  it('3. Renders public/locked navigation for signed-out visitors', () => {
    vi.spyOn(evalAccess, 'useEvaluationAccess').mockReturnValue({
      isUnlocked: false,
      isAuthenticated: false,
      isLoading: false,
      isLoaded: true,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      unlock: vi.fn(),
      lock: vi.fn() as any,
      toggle: vi.fn(),
    });

    render(<CompactMasthead />);

    // Forms tab is available for field workers/guests
    expect(screen.getByRole('link', { name: /^Forms$/i })).toBeDefined();
    // Evaluation portal is shown locked
    expect(screen.getByRole('button', { name: /Evaluation Portal Locked/i })).toBeDefined();
  });
});
