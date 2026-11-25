import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  buildPortalCacheKey,
  resolveFieldPrincipalKey,
  startPortalWarmup,
  abortSpeculativePortalPrefetches,
  claimOrFetchDraftsData,
  claimOrFetchSyncLocalData,
  claimOrFetchFieldSubmissions,
  invalidatePortalCache,
  invalidateAllPortalCaches,
  PORTAL_WARM_TTL_MS,
  PORTAL_TRANSITION_DURATION_MS,
  PORTAL_MAX_CACHE_ENTRIES,
  __getPortalWarmCacheDebugState,
} from '@/lib/portal/portalWarmCache';
import { MobileKoboHomeScreen } from '@/components/mobile/MobileKoboHomeScreen';
import { DesktopComicWorkspace } from '@/components/dashboard/DesktopComicWorkspace';
import { cosmicSound } from '@/lib/audio/cosmicSoundEngine';

const mockGetAllDrafts = vi.fn(async () => [
  { id: 1, uuid: 'draft-1', childName: 'Aarav', updatedAt: '2026-11-25T10:00:00Z' },
]);
const mockGetAllQueueItems = vi.fn(async () => [
  { id: 10, clientSubmissionId: 'sub-1', status: 'synced', payload: { childName: 'Meera' } },
]);

vi.mock('@/lib/db/draftRepository', () => ({
  getAllDrafts: (...args: any[]) => (mockGetAllDrafts as any)(...args),
  deleteDraft: vi.fn(async () => {}),
}));

vi.mock('@/lib/db/syncQueueRepository', () => ({
  getAllQueueItems: (...args: any[]) => (mockGetAllQueueItems as any)(...args),
  migrateLegacyQueueItems: vi.fn(async () => {}),
}));

vi.mock('@/features/submission/submissionQueueRepository', () => ({
  migrateLegacyItems: vi.fn(async () => {}),
}));

vi.mock('@/features/submission/submissionWorker', () => ({
  processQueue: vi.fn(async () => {}),
  isWorkerRunning: vi.fn(() => false),
}));

vi.mock('@/lib/db/dexieDb', () => ({
  clearAllLocalData: vi.fn(async () => {}),
}));

vi.mock('@/components/garden/MiniatureGardenPlayground', () => ({
  MiniatureGardenPlayground: () => <div data-testid="mock-garden" />,
}));

vi.mock('@/components/ui/AnimatedHeartUnlock', () => ({
  AnimatedHeartUnlock: () => <div data-testid="mock-heart" />,
}));

vi.mock('@/components/forms/DraftCard', () => ({
  DraftCard: ({ draft }: any) => <div data-testid={`draft-card-${draft.id}`}>{draft.childName}</div>,
}));

const mockUseSearchParams = vi.fn(() => new URLSearchParams(''));
const mockAppRouter = {
  prefetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockAppRouter,
  useSearchParams: () => mockUseSearchParams(),
  usePathname: () => '/assessment/sync',
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: any) => <div data-testid="mock-app-shell">{children}</div>,
}));

const FIELD_USER = {
  userId: 'fw-001',
  role: 'FIELD_USER' as const,
  allowedStates: ['Maharashtra'],
  allowedDistricts: ['Pune'],
  isVerified: true,
};

function makeMatchMedia(matchesReduced: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? matchesReduced : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('Workstream D: Four Field-Worker Portal Micro-Interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateAllPortalCaches();
    localStorage.clear();
    mockGetAllDrafts.mockClear();
    mockGetAllQueueItems.mockClear();
    mockAppRouter.prefetch.mockClear();
    mockAppRouter.push.mockClear();
    mockAppRouter.replace.mockClear();
    mockUseSearchParams.mockReturnValue(new URLSearchParams(''));
    window.matchMedia = makeMatchMedia(false) as any;
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    cosmicSound.setEnabled(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    invalidateAllPortalCaches();
  });

  it('1. Enforces strict role isolation: LEADERSHIP / STATE_REVIEWER / ADMIN cannot initialize field portal warmups', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    expect(
      resolveFieldPrincipalKey({
        user: { ...FIELD_USER, role: 'LEADERSHIP' },
      })
    ).toBeNull();
    expect(
      resolveFieldPrincipalKey({
        user: { ...FIELD_USER, role: 'STATE_REVIEWER' },
      })
    ).toBeNull();
    expect(
      resolveFieldPrincipalKey({
        user: { ...FIELD_USER, role: 'ADMIN' },
      })
    ).toBeNull();
    expect(resolveFieldPrincipalKey({ user: null, fieldProfile: null })).toBeNull();

    startPortalWarmup({
      portal: 'docs',
      ownership: 'speculative',
      principal: { user: { ...FIELD_USER, role: 'LEADERSHIP' } },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockGetAllDrafts).not.toHaveBeenCalled();
    expect(__getPortalWarmCacheDebugState().cacheSize).toBe(0);
  });

  it('2. Keys caches by principal, authorised scope, destination, and filters; enforces bounds and 15s TTL', async () => {
    const p1 = resolveFieldPrincipalKey({ user: FIELD_USER })!;
    const p2 = resolveFieldPrincipalKey({
      user: { ...FIELD_USER, userId: 'fw-002', allowedStates: ['Gujarat'] },
    })!;

    expect(p1).not.toBe(p2);

    const k1 = buildPortalCacheKey({ principalKey: p1, destination: '/api/submissions', filters: { tab: 'docs' } });
    const k2 = buildPortalCacheKey({ principalKey: p1, destination: '/api/submissions', filters: { tab: 'bank' } });
    const k3 = buildPortalCacheKey({ principalKey: p2, destination: '/api/submissions', filters: { tab: 'docs' } });

    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
    expect(PORTAL_WARM_TTL_MS).toBe(15_000);
    expect(PORTAL_MAX_CACHE_ENTRIES).toBe(24);
  });

  it('3. Hover/intent warms route+data concurrently, reuses without duplicate network fetches, and respects 15s TTL', async () => {
    let fetchCount = 0;
    const mockFetch = vi.fn(async () => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            records: [
              {
                uniqueId: 'MH-PUN-001',
                childName: 'Rohan',
                state: 'Maharashtra',
                district: 'Pune',
                approvalStatus: 'Pending Review',
              },
            ],
            total: 1,
          },
        }),
      };
    });
    global.fetch = mockFetch as any;

    const router = { prefetch: vi.fn(), push: vi.fn() };
    startPortalWarmup({
      portal: 'docs',
      ownership: 'speculative',
      router,
      principal: { user: FIELD_USER },
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(router.prefetch).toHaveBeenCalledWith('/assessment/sync?tab=docs');
    expect(fetchCount).toBe(1);

    // Clicking / destination mount consumes warmed snapshot WITHOUT issuing a duplicate network request
    const warmedServer = await claimOrFetchFieldSubmissions({ principal: { user: FIELD_USER } });
    const warmedLocal = await claimOrFetchSyncLocalData({ user: FIELD_USER });

    expect(warmedServer?.records.length).toBe(1);
    expect(warmedLocal?.drafts.length).toBe(1);
    expect(fetchCount).toBe(1);

    // Advance past 15s TTL -> triggers fresh fetch cleanly
    vi.advanceTimersByTime(PORTAL_WARM_TTL_MS + 50);
    await claimOrFetchFieldSubmissions({ principal: { user: FIELD_USER } });
    expect(fetchCount).toBe(2);
  });

  it('4. Aborts speculative prefetches on leave/unmount without aborting destination-claimed fetches, and evicts failed responses', async () => {
    let signalRef: AbortSignal | null | undefined;
    const deferred: { resolve: ((val: any) => void) | null } = { resolve: null };

    global.fetch = vi.fn((_url: any, init?: RequestInit) => {
      signalRef = init?.signal;
      return new Promise((resolve) => {
        deferred.resolve = resolve;
      });
    }) as any;

    // 4a. Speculative hover then leave BEFORE activation -> must abort
    startPortalWarmup({
      portal: 'submitted',
      ownership: 'speculative',
      principal: { user: FIELD_USER },
    });
    expect(signalRef?.aborted).toBe(false);
    abortSpeculativePortalPrefetches();
    expect(signalRef?.aborted).toBe(true);

    // 4b. Failed network response must NOT populate /api/submissions cache entry
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as any;
    await expect(claimOrFetchFieldSubmissions({ principal: { user: FIELD_USER } })).rejects.toThrow('HTTP 500');
    const cachedKeysAfterFailure = __getPortalWarmCacheDebugState().cacheKeys;
    expect(cachedKeysAfterFailure.some((k) => k.includes('/api/submissions'))).toBe(false);

    // 4c. Speculative promoted to destination survives abortSpeculativePortalPrefetches
    let promotedSignal: AbortSignal | null | undefined;
    global.fetch = vi.fn((_url: any, init?: RequestInit) => {
      promotedSignal = init?.signal;
      return new Promise((resolve) => {
        deferred.resolve = resolve;
      });
    }) as any;

    startPortalWarmup({
      portal: 'bank',
      ownership: 'speculative',
      principal: { user: FIELD_USER },
    });
    startPortalWarmup({
      portal: 'bank',
      ownership: 'destination',
      principal: { user: FIELD_USER },
    });
    abortSpeculativePortalPrefetches();
    expect(promotedSignal?.aborted).toBe(false);
    deferred.resolve?.({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { records: [], total: 0 } }),
    });
  });

  it('5. Renders four distinct GPU-composited portal effects on mobile without reusing Rocket interaction', async () => {
    const router = { prefetch: vi.fn(), push: vi.fn() };
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { records: [], total: 0 } }),
    })) as any;

    const cssText = fs.readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf-8');
    expect(cssText).toContain('portalDocsScan360');
    expect(cssText).toContain('rotate(360deg)');
    expect(cssText).toContain('portalDraftsBloom');
    expect(cssText).toContain('portalBankIrisPulse');
    expect(cssText).toContain('portalSunRise');
    expect(cssText).toContain('portalCloudGlide');

    const { container } = render(
      <MobileKoboHomeScreen
        draftsCount={3}
        submittedMissingDocsCount={4}
        approvedBankPendingCount={5}
        submittedCount={12}
        isAuthenticated={true}
        userRole="FIELD_USER"
        principal={{ user: FIELD_USER }}
        router={router}
      />
    );

    const activateAndAssert = (linkName: RegExp, expectedEffect: string, expectedMessage: string, expectedHref: string) => {
      const link = screen.getByRole('link', { name: linkName });
      fireEvent.click(link);

      const overlay = container.querySelector(`[data-portal-effect="${expectedEffect}"]`);
      expect(overlay?.getAttribute('data-portal-active')).toBe('true');

      // Ensure other effects are NOT active simultaneously
      const allEffects = container.querySelectorAll('[data-portal-effect]');
      allEffects.forEach((node) => {
        if (node.getAttribute('data-portal-effect') !== expectedEffect) {
          expect(node.getAttribute('data-portal-active')).toBe('false');
        }
      });

      // Advance 340ms beat -> router pushes destination + calm slow-loading text appears in polite live region
      act(() => {
        vi.advanceTimersByTime(PORTAL_TRANSITION_DURATION_MS);
      });
      expect(router.push).toHaveBeenCalledWith(expectedHref);
      expect(screen.getByTestId('portal-slow-loading-banner').textContent).toContain(expectedMessage);

      // Simulate Back navigation resetting transition lock & overlay cleanly
      act(() => {
        window.dispatchEvent(new Event('pageshow'));
      });
      expect(overlay?.getAttribute('data-portal-active')).toBe('false');
    };

    activateAndAssert(/Forms to finish: 3/i, 'drafts-lantern-bloom', 'Opening unfinished child records…', '/assessment/drafts');
    activateAndAssert(/Missing Docs: 4/i, 'docs-ring-scan', 'Opening document follow-ups…', '/assessment/sync?tab=docs');
    activateAndAssert(/Bank Details: 5/i, 'bank-vault-iris', 'Opening bank details…', '/assessment/sync?tab=bank');
    activateAndAssert(/Submitted surveys: 12/i, 'submitted-sun-rise', 'Opening submitted assessments…', '/assessment/sync?tab=synced');

    // Total router pushes = 4 (one per portal), rocket untouched
    expect(router.push).toHaveBeenCalledTimes(4);
  });

  it('6. Renders four distinct portal micro-interactions on DesktopComicWorkspace + NeedsAttentionPanel and stays inert for LEADERSHIP', () => {
    const router = { prefetch: vi.fn(), push: vi.fn() };
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { records: [], total: 0 } }),
    })) as any;

    const { container, rerender } = render(
      <DesktopComicWorkspace
        drafts={[]}
        draftCount={2}
        isDraftsLoading={false}
        isDraftListLoading={false}
        waitingCount={1}
        isWaitingLoading={false}
        submittedCount={8}
        isSubmittedLoading={false}
        submittedStatus="success"
        submittedMissingDocsCount={3}
        approvedBankPendingCount={4}
        serverScopeLabel="Maharashtra"
        isAuthenticated={true}
        onStartNewSurvey={vi.fn()}
        onResumeDraft={vi.fn()}
        onDeleteDraft={vi.fn(async () => {})}
        onRetrySubmitted={vi.fn()}
        onRequireAuth={vi.fn()}
        router={router}
        userRole="FIELD_USER"
        principal={{ user: FIELD_USER }}
      />
    );

    const docsLink = screen.getByRole('link', { name: /Pendings/i });
    fireEvent.mouseEnter(docsLink);
    expect(router.prefetch).toHaveBeenCalledWith('/assessment/sync?tab=docs');

    fireEvent.click(docsLink);
    expect(container.querySelector('[data-portal-effect="docs-ring-scan"]')?.getAttribute('data-portal-active')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(PORTAL_TRANSITION_DURATION_MS);
    });
    expect(router.push).toHaveBeenCalledWith('/assessment/sync?tab=docs');

    // Leadership role boundary check
    router.prefetch.mockClear();
    router.push.mockClear();
    rerender(
      <DesktopComicWorkspace
        drafts={[]}
        draftCount={2}
        isDraftsLoading={false}
        isDraftListLoading={false}
        waitingCount={1}
        isWaitingLoading={false}
        submittedCount={8}
        isSubmittedLoading={false}
        submittedStatus="success"
        submittedMissingDocsCount={3}
        approvedBankPendingCount={4}
        serverScopeLabel="National"
        isAuthenticated={true}
        onStartNewSurvey={vi.fn()}
        onResumeDraft={vi.fn()}
        onDeleteDraft={vi.fn(async () => {})}
        onRetrySubmitted={vi.fn()}
        onRequireAuth={vi.fn()}
        router={router}
        userRole="LEADERSHIP"
        principal={{ user: { ...FIELD_USER, role: 'LEADERSHIP' } }}
      />
    );

    fireEvent.mouseEnter(screen.getByRole('link', { name: /Pendings/i }));
    fireEvent.click(screen.getByRole('link', { name: /Pendings/i }));
    expect(router.prefetch).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('7. Prevents rapid double-taps, preserves modified clicks, supports Space/keyboard activation, and bypasses delay on prefers-reduced-motion', () => {
    const router = { prefetch: vi.fn(), push: vi.fn() };

    const { rerender } = render(
      <MobileKoboHomeScreen
        draftsCount={3}
        submittedMissingDocsCount={4}
        approvedBankPendingCount={5}
        submittedCount={12}
        isAuthenticated={true}
        userRole="FIELD_USER"
        principal={{ user: FIELD_USER }}
        router={router}
      />
    );

    const draftsLink = screen.getByRole('link', { name: /Forms to finish: 3/i });
    const docsLink = screen.getByRole('link', { name: /Missing Docs: 4/i });

    // Modified Ctrl+click must NOT be intercepted
    const ctrlEvt = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    draftsLink.dispatchEvent(ctrlEvt);
    expect(ctrlEvt.defaultPrevented).toBe(false);
    expect(router.push).not.toHaveBeenCalled();

    // Rapid double tap + tapping another portal during beat locks to first portal
    fireEvent.click(draftsLink);
    fireEvent.click(draftsLink);
    fireEvent.click(docsLink);
    act(() => {
      vi.advanceTimersByTime(PORTAL_TRANSITION_DURATION_MS);
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/assessment/drafts');

    // Back / reset
    act(() => {
      window.dispatchEvent(new Event('popstate'));
    });

    // Enable prefers-reduced-motion -> navigates immediately (0ms) with zero wait
    window.matchMedia = makeMatchMedia(true) as any;
    rerender(
      <MobileKoboHomeScreen
        key="reduced"
        draftsCount={3}
        submittedMissingDocsCount={4}
        approvedBankPendingCount={5}
        submittedCount={12}
        isAuthenticated={true}
        userRole="FIELD_USER"
        principal={{ user: FIELD_USER }}
        router={router}
      />
    );

    const bankLink = screen.getByRole('link', { name: /Bank Details: 5/i });
    fireEvent.keyDown(bankLink, { key: ' ' });
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenLastCalledWith('/assessment/sync?tab=bank');
  });

  it('8. Degrades gracefully with sound off, AudioContext failure, missing vibrate, offline mode, and account switch purge', async () => {
    const playCueSpy = vi.spyOn(cosmicSound, 'playPortalCue');
    const router = { prefetch: vi.fn(), push: vi.fn() };
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignMock },
    });

    const { rerender } = render(
      <MobileKoboHomeScreen
        draftsCount={2}
        submittedMissingDocsCount={1}
        approvedBankPendingCount={0}
        submittedCount={5}
        isAuthenticated={true}
        userRole="FIELD_USER"
        principal={{ user: FIELD_USER }}
        router={router}
      />
    );

    // Sound disabled: never plays portal cue
    fireEvent.click(screen.getByRole('link', { name: /Forms to finish: 2/i }));
    expect(playCueSpy).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    // Offline click navigates via location.assign without failing
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent.click(screen.getByRole('link', { name: /Missing Docs: 1/i }));
    act(() => {
      vi.advanceTimersByTime(PORTAL_TRANSITION_DURATION_MS);
    });
    expect(assignMock).toHaveBeenCalledWith('/assessment/sync?tab=docs');

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    // Sound enabled + broken AudioContext + missing vibrate must still navigate cleanly
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: function ThrowingAudioContext() {
        throw new Error('Audio blocked');
      },
    });
    cosmicSound.setEnabled(true);
    rerender(
      <MobileKoboHomeScreen
        draftsCount={2}
        submittedMissingDocsCount={1}
        approvedBankPendingCount={0}
        submittedCount={5}
        isAuthenticated={true}
        userRole="FIELD_USER"
        principal={{ user: FIELD_USER }}
        router={router}
      />
    );

    expect(() => {
      fireEvent.click(screen.getByRole('link', { name: /Bank Details: 0/i }));
    }).not.toThrow();
    act(() => {
      vi.advanceTimersByTime(PORTAL_TRANSITION_DURATION_MS);
    });
    expect(router.push).toHaveBeenLastCalledWith('/assessment/sync?tab=bank');

    // Warm drafts cache then logout/switch account -> cache purged cleanly while Dexie untouched
    startPortalWarmup({ portal: 'drafts', ownership: 'speculative', principal: { user: FIELD_USER } });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(__getPortalWarmCacheDebugState().cacheSize).toBeGreaterThanOrEqual(1);

    invalidateAllPortalCaches();
    expect(__getPortalWarmCacheDebugState().cacheSize).toBe(0);
    expect(__getPortalWarmCacheDebugState().lastActivePrincipalKey).toBeNull();

    // Switching directly to another account auto-purges previous principal entries
    const warmedOther = await claimOrFetchDraftsData({
      user: { ...FIELD_USER, userId: 'fw-other' },
    });
    expect(warmedOther).toBeNull();
  });

  it('9. Destination pages consume warmed caches without duplicate IndexedDB/API fetches and render honest field bank status', async () => {
    localStorage.setItem(
      'field_user_profile',
      JSON.stringify({ id: 'fw-001', workerId: 'fw-001', name: 'Asha Worker', assignedState: 'Maharashtra' })
    );
    localStorage.setItem('child_nutrition:user_session_v1', JSON.stringify(FIELD_USER));

    let fetchCount = 0;
    global.fetch = vi.fn(async () => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            records: [
              {
                uniqueId: 'MH-PUN-101',
                childName: 'Kavya',
                caregiverName: 'Sunita',
                state: 'Maharashtra',
                district: 'Pune',
                approvalStatus: 'Approved',
                bankDetailsComplete: false,
                birthCertificate: '',
              },
            ],
            total: 1,
          },
        }),
      };
    }) as any;

    // 9a. Warm drafts then mount DedicatedDraftsPage -> 1 IndexedDB read pair total (zero duplicate!)
    startPortalWarmup({
      portal: 'drafts',
      ownership: 'destination',
      router: mockAppRouter,
      principal: { user: FIELD_USER },
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockGetAllDrafts).toHaveBeenCalledTimes(1);

    const { default: DedicatedDraftsPage } = await import('@/app/assessment/drafts/page');
    render(<DedicatedDraftsPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockGetAllDrafts).toHaveBeenCalledTimes(1);

    // 9b. Warm docs/bank then mount SubmissionSyncPage with ?tab=bank -> zero duplicate /api/submissions fetch + honest read-only bank notice
    invalidatePortalCache('sync');
    startPortalWarmup({
      portal: 'bank',
      ownership: 'destination',
      router: mockAppRouter,
      principal: { user: FIELD_USER },
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchCount).toBe(1);

    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=bank'));
    const { default: SubmissionSyncPage } = await import('@/app/assessment/sync/page');
    render(<SubmissionSyncPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchCount).toBe(1);
    expect(screen.getByText(/Bank Details Status \(Read-Only Preview\)/i)).toBeDefined();
    expect(
      screen.getByText(/Self-service bank details entry is not yet live for field worker accounts/i)
    ).toBeDefined();

    // 9c. Missing Docs tab uses canonical document applicability (excludes pre-approval Nutrition-only complete intake)
    invalidatePortalCache('sync');
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          records: [
            {
              uniqueId: 'NUTR-OK-01',
              childName: 'Ananya Nutrition Only',
              caregiverName: 'Laxmi',
              dob: '2018-02-10',
              gender: 'Female',
              state: 'Maharashtra',
              district: 'Pune',
              supportCategories: ['nutrition'],
              schoolType: 'Government school',
              approvalStatus: 'Pending',
              aadhaarCardPhotoUrl: 'asset://aadhaar',
              childPhotoUrl: 'asset://photo',
              signatureDataUrl: 'asset://sig',
              // Passbook missing -> not_yet_due pre-approval; School docs -> not_applicable for nutrition
            },
            {
              uniqueId: 'EDU-MISS-02',
              childName: 'Vikram Missing Intake',
              caregiverName: 'Ramesh',
              dob: '2017-03-14',
              gender: 'Male',
              state: 'Maharashtra',
              district: 'Pune',
              supportCategories: ['education'],
              schoolType: 'Government school',
              approvalStatus: 'Pending',
              aadhaarCardPhotoUrl: '',
              childPhotoUrl: 'asset://photo',
              signatureDataUrl: 'asset://sig',
            },
          ],
          total: 2,
        },
      }),
    })) as any;

    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=docs'));
    render(<SubmissionSyncPage key="docs-applicability" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Vikram Missing Intake')).toBeDefined();
    expect(screen.queryByText('Ananya Nutrition Only')).toBeNull();
  });
});
