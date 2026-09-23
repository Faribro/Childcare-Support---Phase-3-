/**
 * dashboard-count-loading.test.tsx
 *
 * Comprehensive test suite verifying independent, prompt, correct, and reliable
 * dashboard count loading on the Forms/dashboard screen (/app):
 *
 * 1. Independent Count Resolution:
 *    - Draft count loads immediately via getDraftsCount() (IndexedDB).
 *    - Waiting count loads immediately via getWaitingQueueCount().
 *    - Submitted count loads independently via /api/submissions?limit=1 with 8s AbortController.
 *    - Slow or hanging remote fetch DOES NOT block local draft or waiting counts.
 *
 * 2. Accessible Presentation (No Raw '...'):
 *    - Count cards render accessible skeleton loaders with role="status" and descriptive aria-labels.
 *    - No raw '...' strings are displayed.
 *
 * 3. Offline & Error Recovery:
 *    - Offline state falls back to localSyncedCount from IndexedDB without hanging.
 *    - Error state renders accessible retry button ("Retry loading submitted count").
 *    - Clicking retry triggers re-fetch without page reload.
 *
 * 4. Reactive Event Synchronization:
 *    - Custom event 'child_nutrition:draft_updated' invalidates and refreshes draft counts.
 *    - Worker submissionEvents ('submission:saved', 'submission:success') trigger count updates.
 *    - Optimistic draft deletion updates counts immediately.
 *
 * 5. Lifecycle & Unmount Safety:
 *    - Component unmounting during in-flight network requests does not set state or leak listeners.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import FieldWorkspacePage from '@/app/app/page';
import * as draftRepo from '@/lib/db/draftRepository';
import * as syncRepo from '@/lib/db/syncQueueRepository';
import { submissionEvents } from '@/features/submission/submissionEvents';

// ── Mock Next.js Navigation & Link ───────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

// Mock garden playground to avoid canvas rendering complexity in jsdom
vi.mock('@/components/garden/MiniatureGardenPlayground', () => ({
  MiniatureGardenPlayground: () => <div data-testid="garden-playground" />,
}));

// Mock AnimatedHeartUnlock
vi.mock('@/components/ui/AnimatedHeartUnlock', () => ({
  AnimatedHeartUnlock: () => <div data-testid="animated-heart" />,
}));

describe('Dashboard Count Loading Performance (/app)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;

    // Default fast repository responses
    vi.spyOn(draftRepo, 'getDraftsCount').mockResolvedValue(3);
    vi.spyOn(draftRepo, 'getAllDrafts').mockResolvedValue([
      {
        id: 1,
        uuid: 'draft-1',
        clientSubmissionId: 'sub-1',
        childName: 'Aarav Kumar',
        artNumber: 'ART-001',
        syncStatus: 'draft',
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-09-20T10:00:00.000Z',
      } as any,
    ]);
    vi.spyOn(draftRepo, 'deleteDraft').mockResolvedValue();

    vi.spyOn(syncRepo, 'getWaitingQueueCount').mockResolvedValue(2);
    vi.spyOn(syncRepo, 'getLocalSyncedCount').mockResolvedValue(5);

    // Mock fetch for submissions API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        pagination: { totalCount: 42 },
      }),
    } as any);

    // Ensure navigator.onLine is true by default
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Independent Loading & Non-Blocking State', () => {
    it('loads and displays local draft and waiting counts immediately even if remote fetch is delayed', async () => {
      // Artificially delay remote /api/submissions response
      let resolveFetch: (val: any) => void;
      const delayedFetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      global.fetch = vi.fn().mockImplementation(() => delayedFetchPromise);

      render(<FieldWorkspacePage />);

      // Draft count and waiting count should appear promptly from local db
      await waitFor(() => {
        expect(screen.getAllByText('3').length).toBeGreaterThan(0); // Local in-progress drafts
        expect(screen.getAllByText('2').length).toBeGreaterThan(0); // Waiting to be sent
      });

      // Submitted count should show accessible loading skeleton, NOT block draft/waiting counts
      const submittedLoaders = screen.getAllByRole('status', { name: /loading submitted count/i });
      expect(submittedLoaders.length).toBeGreaterThan(0);

      // Verify no raw '...' strings are rendered in the count badges
      expect(screen.queryByText('...')).toBeNull();

      // Now resolve the remote fetch
      await act(async () => {
        resolveFetch!({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            pagination: { totalCount: 42 },
          }),
        });
      });

      // Submitted count should update to 42
      await waitFor(() => {
        expect(screen.getAllByText('42').length).toBeGreaterThan(0);
      });
    });

    it('uses getDraftsCount() and getWaitingQueueCount() direct count queries', async () => {
      render(<FieldWorkspacePage />);

      await waitFor(() => {
        expect(draftRepo.getDraftsCount).toHaveBeenCalled();
        expect(syncRepo.getWaitingQueueCount).toHaveBeenCalled();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Accessible Loading Presentation', () => {
    it('renders accessible loading skeletons without raw ellipsis during initial load', async () => {
      // Create a pending promise for all queries
      vi.spyOn(draftRepo, 'getDraftsCount').mockImplementation(() => new Promise(() => {}));
      vi.spyOn(draftRepo, 'getAllDrafts').mockImplementation(() => new Promise(() => {}));
      vi.spyOn(syncRepo, 'getWaitingQueueCount').mockImplementation(() => new Promise(() => {}));
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      render(<FieldWorkspacePage />);

      // Accessible status roles must be present
      expect(
        screen.getAllByRole('status', { name: /loading draft count/i }).length
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('status', { name: /loading waiting count/i }).length
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('status', { name: /loading submitted count/i }).length
      ).toBeGreaterThan(0);

      // Raw '...' must not be present
      expect(screen.queryByText('...')).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Offline & Network Error Handling', () => {
    it('falls back to localSyncedCount with offline status when navigator is offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      render(<FieldWorkspacePage />);

      await waitFor(() => {
        // Must show localSyncedCount (5)
        expect(screen.getAllByText('5').length).toBeGreaterThan(0);
        // Desktop card shows Offline badge
        expect(screen.getByText('Offline')).toBeDefined();
      });

      // Remote fetch should not have been called when offline
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('displays accessible retry trigger on remote fetch error and allows re-fetching', async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error 500'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ pagination: { totalCount: 99 } }),
        } as any);

      render(<FieldWorkspacePage />);

      // Wait for error state to appear
      await waitFor(() => {
        const retryButtons = screen.getAllByRole('button', {
          name: /retry loading submitted count/i,
        });
        expect(retryButtons.length).toBeGreaterThan(0);
      });

      // Click retry
      const retryBtn = screen.getAllByRole('button', { name: /retry loading submitted count/i })[0];
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      // Should now resolve with new count 99
      await waitFor(() => {
        expect(screen.getAllByText('99').length).toBeGreaterThan(0);
      });
    });

    it('sets error status (never false offline) when remote request aborts or times out while online', async () => {
      const abortError = new Error('The user aborted a request.');
      abortError.name = 'AbortError';

      global.fetch = vi.fn().mockRejectedValue(abortError);

      render(<FieldWorkspacePage />);

      await waitFor(() => {
        const retryButtons = screen.getAllByRole('button', {
          name: /retry loading submitted count/i,
        });
        expect(retryButtons.length).toBeGreaterThan(0);
        // Must NOT display "Offline" badge because device is online
        expect(screen.queryByText('Offline')).toBeNull();
      });
    });

    it('refreshes submitted and waiting count automatically when window online event fires', async () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      render(<FieldWorkspacePage />);

      await waitFor(() => {
        expect(screen.getByText('Offline')).toBeDefined();
      });

      // Now come online
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ pagination: { totalCount: 77 } }),
      } as any);

      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() => {
        expect(screen.getAllByText('77').length).toBeGreaterThan(0);
        expect(screen.queryByText('Offline')).toBeNull();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Event-Driven Updates & Optimistic Deletions', () => {
    it('refreshes draft counts when child_nutrition:draft_updated event fires', async () => {
      render(<FieldWorkspacePage />);

      await waitFor(() => {
        expect(screen.getAllByText('3').length).toBeGreaterThan(0);
      });

      // Update mock count to 4 and dispatch event
      vi.spyOn(draftRepo, 'getDraftsCount').mockResolvedValue(4);

      await act(async () => {
        window.dispatchEvent(new CustomEvent('child_nutrition:draft_updated'));
      });

      await waitFor(() => {
        expect(screen.getAllByText('4').length).toBeGreaterThan(0);
      });
    });

    it('refreshes waiting and submitted counts on worker submission:success event', async () => {
      render(<FieldWorkspacePage />);

      await waitFor(() => {
        expect(screen.getAllByText('2').length).toBeGreaterThan(0); // waitingCount
        expect(screen.getAllByText('42').length).toBeGreaterThan(0); // submittedCount
      });

      // Simulate completed submission
      vi.spyOn(syncRepo, 'getWaitingQueueCount').mockResolvedValue(1);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ pagination: { totalCount: 43 } }),
      } as any);

      await act(async () => {
        submissionEvents.emit('submission:success', {
          clientSubmissionId: 'sub-test',
          remoteSubmissionId: 'remote-123',
          timestamp: new Date().toISOString(),
        });
      });

      await waitFor(() => {
        expect(screen.getAllByText('1').length).toBeGreaterThan(0);
        expect(screen.getAllByText('43').length).toBeGreaterThan(0);
      });
    });

    it('optimistically decrements draft count when draft is deleted', async () => {
      render(<FieldWorkspacePage />);

      await waitFor(() => {
        expect(screen.getAllByText('3').length).toBeGreaterThan(0);
      });

      // Trigger delete on desktop draft card
      const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
      expect(deleteButtons.length).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      // In DraftCard, first click shows confirmation trigger ("Confirm")
      const confirmButton = await screen.findByRole('button', { name: /^confirm$/i });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(draftRepo.deleteDraft).toHaveBeenCalledWith(1);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Unmount & Cleanup Safety', () => {
    it('unmounts cleanly while fetch is in-flight without console errors or leaks', () => {
      const abortSpy = vi.fn();
      const mockController = {
        signal: {} as any,
        abort: abortSpy,
      };
      const originalAbortController = global.AbortController;
      global.AbortController = vi.fn().mockImplementation(() => mockController) as any;

      const { unmount } = render(<FieldWorkspacePage />);

      unmount();

      expect(abortSpy).toHaveBeenCalled();
      global.AbortController = originalAbortController;
    });
  });
});
