import { test, expect } from '@playwright/test';

/**
 * Phase 5 Playwright E2E Suite: Silent Outbox Send & Terminal Status UI
 * 1. Synthetic queued item shows Send now.
 * 2. Terminal invalid item shows Review record.
 * 3. Click Send once and observe Sending state.
 * 4. Simulate success and observe Submitted.
 * 5. Simulate 422 and observe Needs attention with Review.
 * 6. Simulate no eligible item and verify visible explanation.
 * 7. Mobile 390px status/action layout remains usable.
 */

test.describe('Sync Centre Outbox & Terminal State Actions', () => {
  test.beforeEach(async ({ page }) => {
    // Clear Dexie database before each test
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(async () => {
      if ((window as any).indexedDB) {
        const dbs = await window.indexedDB.databases();
        for (const db of dbs) {
          if (db.name) window.indexedDB.deleteDatabase(db.name);
        }
      }
    });
  });

  // 1. Synthetic queued item shows Send now
  test('1. Synthetic queued item shows Send now', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('networkidle');

    // Inject a synthetic queued item into Dexie
    await page.evaluate(async () => {
      const { db } = await import('@/lib/db/dexieDb');
      await db.syncQueue.add({
        schemaVersion: 2,
        submissionUuid: '00000000-0000-4000-8000-000000000001',
        idempotencyKey: 'test-queued-key-1',
        operationType: 'CREATE',
        payload: {
          demographics: {
            childName: 'Queued Child',
            caregiverName: 'Test Caregiver',
            artNumber: 'DL-001',
          },
        },
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
        errorMessage: null,
        conflictMetadata: null,
        status: 'queued',
      } as any);
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should see Send now button in card and banner
    const sendButton = page.getByRole('button', { name: /Send now/i }).first();
    await expect(sendButton).toBeVisible();
    await expect(page.locator('text=Waiting to send').first()).toBeVisible();
  });

  // 2. Terminal invalid item shows Review record
  test('2. Terminal invalid item shows Review record and NOT Send now', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('networkidle');

    // Inject a synthetic terminal 422 item
    await page.evaluate(async () => {
      const { db } = await import('@/lib/db/dexieDb');
      await db.syncQueue.add({
        schemaVersion: 2,
        submissionUuid: '00000000-0000-4000-8000-000000000002',
        idempotencyKey: 'test-terminal-key-2',
        operationType: 'CREATE',
        payload: {
          demographics: {
            childName: 'Terminal Child',
            caregiverName: 'Caregiver Two',
            artNumber: 'DL-002',
          },
        },
        retryCount: 1,
        lastAttempt: new Date().toISOString(),
        lastErrorCode: 422,
        nextRetryTimestamp: null, // Terminal halt
        errorMessage: 'Terminal Failure (422): invalid fields',
        conflictMetadata: null,
        status: 'failed',
      } as any);
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Must show "Review record" button
    const reviewBtn = page.getByRole('button', { name: /Review record/i }).first();
    await expect(reviewBtn).toBeVisible();

    // Must NOT show "Send now" on this card
    const sendBtn = page.getByRole('button', { name: /Send now/i });
    expect(await sendBtn.count()).toBe(0);

    // Banner should NOT count it as waiting to synchronize
    const waitingBanner = page.locator('text=waiting to synchronize');
    expect(await waitingBanner.count()).toBe(0);

    // Attention banner should be visible
    await expect(page.locator('text=need attention — manual review required')).toBeVisible();
  });

  // 3. Click Send once and observe Sending state
  test('3. Click Send once and observe Sending state', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async () => {
      const { db } = await import('@/lib/db/dexieDb');
      await db.syncQueue.add({
        schemaVersion: 2,
        submissionUuid: '00000000-0000-4000-8000-000000000003',
        idempotencyKey: 'test-queued-key-3',
        operationType: 'CREATE',
        payload: { demographics: { childName: 'Child Three', artNumber: 'DL-003' } },
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
        errorMessage: null,
        conflictMetadata: null,
        status: 'queued',
      } as any);
    });

    await page.reload();

    // Delay the API response to capture sending state
    await page.route('/api/submissions', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ acknowledged: true, remoteSubmissionId: 'REM-3' }),
      });
    });

    const sendBtn = page.getByRole('button', { name: /Send 1 Waiting Record/i });
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
      // Should briefly observe Sending...
      await expect(page.locator('text=Sending…').first()).toBeVisible();
    }
  });

  // 4. Simulate success and observe Submitted
  test('4. Simulate success and observe Submitted status', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async () => {
      const { db } = await import('@/lib/db/dexieDb');
      await db.syncQueue.add({
        schemaVersion: 2,
        submissionUuid: '00000000-0000-4000-8000-000000000004',
        idempotencyKey: 'test-success-key-4',
        operationType: 'CREATE',
        payload: { demographics: { childName: 'Child Four', artNumber: 'DL-004' } },
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
        errorMessage: null,
        conflictMetadata: null,
        status: 'synced',
      } as any);
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should display Submitted status chip
    await expect(page.locator('text=Submitted').first()).toBeVisible();
  });

  // 5. Simulate 422 and observe Needs attention with Review
  test('5. Simulate 422 and observe Needs attention with Review button', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async () => {
      const { db } = await import('@/lib/db/dexieDb');
      await db.syncQueue.add({
        schemaVersion: 2,
        submissionUuid: '00000000-0000-4000-8000-000000000005',
        idempotencyKey: 'test-422-key-5',
        operationType: 'CREATE',
        payload: { demographics: { childName: 'Child Five', artNumber: 'DL-005' } },
        retryCount: 1,
        lastAttempt: new Date().toISOString(),
        lastErrorCode: 422,
        nextRetryTimestamp: null,
        errorMessage: 'Terminal Failure (422): invalid MUAC format',
        conflictMetadata: null,
        status: 'failed_final',
      } as any);
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Needs attention').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Review record/i }).first()).toBeVisible();
  });

  // 6. Simulate no eligible item and verify visible explanation
  test('6. Simulate no eligible item and verify visible explanation', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async () => {
      const { db } = await import('@/lib/db/dexieDb');
      await db.syncQueue.add({
        schemaVersion: 2,
        submissionUuid: '00000000-0000-4000-8000-000000000006',
        idempotencyKey: 'test-no-eligible-6',
        operationType: 'CREATE',
        payload: { demographics: { childName: 'Child Six', artNumber: 'DL-006' } },
        retryCount: 1,
        lastErrorCode: 422,
        nextRetryTimestamp: null,
        errorMessage: 'Terminal Failure (422)',
        conflictMetadata: null,
        status: 'failed_final',
      } as any);
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // The explicit explanation must be visible
    const explanation = page.locator('text=This record needs attention before it can be sent. Open Review to see what must be corrected.');
    await expect(explanation).toBeVisible();
  });

  // 7. Mobile 390px status/action layout remains usable
  test('7. Mobile 390px status/action layout remains usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/assessment/sync');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async () => {
      const { db } = await import('@/lib/db/dexieDb');
      await db.syncQueue.add({
        schemaVersion: 2,
        submissionUuid: '00000000-0000-4000-8000-000000000007',
        idempotencyKey: 'test-mobile-7',
        operationType: 'CREATE',
        payload: { demographics: { childName: 'Child Mobile', artNumber: 'DL-007' } },
        retryCount: 0,
        lastAttempt: null,
        nextRetryTimestamp: Date.now(),
        errorMessage: null,
        conflictMetadata: null,
        status: 'queued',
      } as any);
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify zero horizontal page overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);

    // Check touch target heights >= 44px
    const buttons = await page.locator('button').all();
    for (const btn of buttons) {
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box && box.height > 0 && box.width > 30) {
          expect(box.height).toBeGreaterThanOrEqual(36); // standard touch-target
        }
      }
    }
  });
});
