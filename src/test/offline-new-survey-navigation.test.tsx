/**
 * offline-new-survey-navigation.test.tsx
 *
 * Verifies true offline PWA navigation and client-side survey initialization:
 * 1. Offline hard-navigation fallback:
 *    - When offline (navigator.onLine === false), clicking "Start New Survey" on both mobile
 *      and desktop triggers window.location.assign('/assessment/new') to bypass failed RSC
 *      fetches and let the Service Worker serve the cached HTML shell.
 *    - When offline, clicking "Drafts" on mobile triggers window.location.assign('/assessment/drafts').
 *    - When online, normal link behavior occurs without forcing window.location.assign.
 * 2. MobileKoboHomeScreen 4-state subtitle feedback:
 *    - 'loading' -> "Checking server..."
 *    - 'success' -> "Confirmed on central server"
 *    - 'offline' -> "Showing locally confirmed (offline)"
 *    - 'error'   -> "Server unreachable (tap Retry)"
 * 3. Client-side autonomous ID creation:
 *    - generateAssessmentId creates valid regional/district IDs without network access.
 *    - Local randomUUID generation operates fully offline.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';
import FieldWorkspacePage from '@/app/app/page';
import * as draftRepo from '@/lib/db/draftRepository';
import * as syncRepo from '@/lib/db/syncQueueRepository';
import { generateAssessmentId } from '@/lib/utils/idGenerator';

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/garden/MiniatureGardenPlayground', () => ({
  MiniatureGardenPlayground: () => <div data-testid="garden-playground" />,
}));

vi.mock('@/components/ui/AnimatedHeartUnlock', () => ({
  AnimatedHeartUnlock: () => <div data-testid="animated-heart" />,
}));

describe('Offline New Survey & PWA Navigation', () => {
  let assignSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default fast repository responses
    vi.spyOn(draftRepo, 'getDraftsCount').mockResolvedValue(1);
    vi.spyOn(draftRepo, 'getAllDrafts').mockResolvedValue([]);
    vi.spyOn(syncRepo, 'getWaitingQueueCount').mockResolvedValue(0);
    vi.spyOn(syncRepo, 'getLocalSyncedCount').mockResolvedValue(10);

    // Mock window.location.assign
    assignSpy = vi.fn();
    delete (window as any).location;
    window.location = {
      assign: assignSpy,
      href: 'http://localhost/app',
      pathname: '/app',
      origin: 'http://localhost',
    } as any;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pagination: { totalCount: 10 } }),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Mobile Offline Navigation Fallbacks', () => {
    it('forces window.location.assign("/assessment/new") when clicking Start New Survey while offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      render(
        <MobileKoboHomeScreen
          draftsCount={1}
          waitingCount={0}
          submittedCount={10}
          submittedStatus="offline"
        />
      );

      const startButtons = screen.getAllByRole('button', { name: /start new survey/i });
      expect(startButtons.length).toBeGreaterThan(0);

      fireEvent.click(startButtons[0]);

      expect(assignSpy).toHaveBeenCalledWith('/assessment/new');
    });

    it('forces window.location.assign("/assessment/drafts") when clicking Drafts while offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      render(
        <MobileKoboHomeScreen
          draftsCount={2}
          waitingCount={0}
          submittedCount={10}
          submittedStatus="offline"
        />
      );

      const draftsLink = screen.getByText('Drafts').closest('a');
      expect(draftsLink).not.toBeNull();

      fireEvent.click(draftsLink!);

      expect(assignSpy).toHaveBeenCalledWith('/assessment/drafts');
    });

    it('does NOT force window.location.assign when online', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });

      render(
        <MobileKoboHomeScreen
          draftsCount={1}
          waitingCount={0}
          submittedCount={10}
          submittedStatus="success"
        />
      );

      const startButtons = screen.getAllByRole('button', { name: /start new survey/i });
      fireEvent.click(startButtons[0]);

      expect(assignSpy).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('2. MobileKoboHomeScreen 4-State Subtitle Presentation', () => {
    it('displays "Checking server..." when loading', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={0}
          submittedCount={null}
          isSubmittedLoading={true}
          submittedStatus="loading"
        />
      );

      expect(screen.getByText('Checking server...')).toBeDefined();
    });

    it('displays "Confirmed on central server" when successful', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={0}
          submittedCount={25}
          isSubmittedLoading={false}
          submittedStatus="success"
        />
      );

      expect(screen.getByText('Confirmed on central server')).toBeDefined();
    });

    it('displays "Showing locally confirmed (offline)" when offline', () => {
      render(
        <MobileKoboHomeScreen
          draftsCount={0}
          submittedCount={5}
          isSubmittedLoading={false}
          submittedStatus="offline"
        />
      );

      expect(screen.getByText('Showing locally confirmed (offline)')).toBeDefined();
    });

    it('displays "Server unreachable (tap Retry)" and shows Retry trigger when in error state', () => {
      const retryMock = vi.fn();
      render(
        <MobileKoboHomeScreen
          draftsCount={0}
          submittedCount={5}
          isSubmittedLoading={false}
          submittedStatus="error"
          onRetrySubmitted={retryMock}
        />
      );

      expect(screen.getByText('Server unreachable (tap Retry)')).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /retry loading submitted count/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(retryMock).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Desktop Workspace Offline Fallbacks', () => {
    it('forces window.location.assign("/assessment/new") on desktop button when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      await act(async () => {
        render(<FieldWorkspacePage />);
      });

      const desktopButton = screen.getAllByRole('button', { name: /start new survey/i });
      expect(desktopButton.length).toBeGreaterThan(0);

      // Trigger click on Start New Survey button
      await act(async () => {
        fireEvent.click(desktopButton[0]);
      });

      expect(assignSpy).toHaveBeenCalledWith('/assessment/new');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Autonomous Client-Side ID & Record Generation', () => {
    it('generates state/district IDs locally with correct prefixes without network', () => {
      const maharashtraId = generateAssessmentId('Maharashtra', 'Pune');
      expect(maharashtraId).toMatch(/^MH-PUN-\d{6}-\d{2}$/);

      const delhiId = generateAssessmentId('Delhi', 'Delhi');
      expect(delhiId).toMatch(/^DL-DEL-\d{6}-\d{2}$/);

      const defaultId = generateAssessmentId('', '');
      expect(defaultId).toMatch(/^IN-GEN-\d{6}-\d{2}$/);
    });

    it('generates clientUuid via standard crypto.randomUUID() without network', () => {
      const uuid = crypto.randomUUID();
      expect(uuid).toBeDefined();
      expect(uuid.length).toBe(36);
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });
});
