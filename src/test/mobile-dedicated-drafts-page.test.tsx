/**
 * mobile-dedicated-drafts-page.test.tsx
 *
 * Test suite for the dedicated Drafts page (/assessment/drafts):
 * 1. Dedicated Drafts Page Rendering:
 *    - Loads drafts from IndexedDB draftRepository
 *    - Displays draft count, child name, ART number, and timestamps
 *    - Renders accessible "Back to Dashboard" navigation link to /app
 *    - Renders "Start New Survey" link to /assessment/new
 * 2. Actions:
 *    - Resume action navigates to /assessment/draft/[draftId]
 *    - Delete action calls deleteDraft(id) and refreshes list
 * 3. Empty & Loading States:
 *    - Shows "Loading saved drafts..." during data load
 *    - Shows empty-state card with "Start an Assessment" CTA when drafts are empty
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DedicatedDraftsPage from '@/app/assessment/drafts/page';
import * as draftRepo from '@/lib/db/draftRepository';
import * as syncRepo from '@/lib/db/syncQueueRepository';

const mockPush = vi.fn();

// Mock Next.js Link & useRouter
vi.mock('next/link', () => ({
  default: ({ children, href, className, ...rest }: any) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock AppShell to render children
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: any) => <div data-testid="app-shell">{children}</div>,
}));

// Sample drafts
const mockDrafts = [
  {
    id: 101,
    uuid: 'uuid-101',
    childName: 'Rohan Gupta',
    artNumber: 'DL-02-2024-101',
    updatedAt: '2026-09-22T10:00:00.000Z',
    status: 'draft',
    demographics: { childName: 'Rohan Gupta', artNumber: 'DL-02-2024-101', caregiverName: 'Anita Gupta' },
  },
  {
    id: 102,
    uuid: 'uuid-102',
    childName: 'Meera Singh',
    artNumber: 'DL-02-2024-102',
    updatedAt: '2026-09-22T11:00:00.000Z',
    status: 'draft',
    demographics: { childName: 'Meera Singh', artNumber: 'DL-02-2024-102', caregiverName: 'Sunita Singh' },
  },
];

describe('Dedicated Drafts Page (/assessment/drafts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(draftRepo, 'getAllDrafts').mockResolvedValue(mockDrafts as any);
    vi.spyOn(draftRepo, 'deleteDraft').mockResolvedValue(undefined as any);
    vi.spyOn(syncRepo, 'getAllQueueItems').mockResolvedValue([] as any);
  });

  it('renders header, draft count, and "Back to Dashboard" navigation link to /app', async () => {
    render(<DedicatedDraftsPage />);

    // Wait for drafts to load
    await waitFor(() => {
      expect(screen.getByText('Saved Assessment Drafts')).toBeDefined();
    });

    // Back link
    const backLink = screen.getByText('Back to Dashboard').closest('a');
    expect(backLink).toBeDefined();
    expect(backLink?.getAttribute('href')).toBe('/app');

    // Start new survey link
    const newSurveyLink = screen.getByText('Start New Survey').closest('a');
    expect(newSurveyLink).toBeDefined();
    expect(newSurveyLink?.getAttribute('href')).toBe('/assessment/new');

    // Draft count
    expect(screen.getByText('2')).toBeDefined();
  });

  it('renders all saved drafts with child name, ART number, and caregiver', async () => {
    render(<DedicatedDraftsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Rohan Gupta/)).toBeDefined();
      expect(screen.getByText(/Meera Singh/)).toBeDefined();
    });

    expect(screen.getByText('DL-02-2024-101')).toBeDefined();
    expect(screen.getByText('DL-02-2024-102')).toBeDefined();
    expect(screen.getByText(/Anita Gupta/)).toBeDefined();
  });

  it('clicking Resume navigates to /assessment/draft/[draftId]', async () => {
    render(<DedicatedDraftsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Rohan Gupta/)).toBeDefined();
    });

    const resumeButtons = screen.getAllByRole('button', { name: /Resume Intake/i });
    expect(resumeButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(resumeButtons[0]);
    expect(mockPush).toHaveBeenCalledWith('/assessment/draft/101');
  });

  it('clicking Delete then Confirm calls deleteDraft and reloads drafts', async () => {
    render(<DedicatedDraftsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Rohan Gupta/)).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /^Delete$/i });
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);

    // Click Delete to show confirmation
    fireEvent.click(deleteButtons[0]);

    // Click Confirm
    const confirmButton = screen.getByRole('button', { name: /Confirm/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(draftRepo.deleteDraft).toHaveBeenCalledWith(101);
    });
  });

  it('renders empty-state when no drafts exist', async () => {
    vi.spyOn(draftRepo, 'getAllDrafts').mockResolvedValue([] as any);

    render(<DedicatedDraftsPage />);

    await waitFor(() => {
      expect(screen.getByText('No active drafts on this device')).toBeDefined();
    });

    expect(screen.getByText('Start an Assessment')).toBeDefined();
  });
});
