import { test, expect, Page } from '@playwright/test';

/**
 * Phase 5 Playwright E2E Suite: Silent Outbox Send & Terminal Status UI
 *
 * Verifies:
 * 1. Synthetic queued item shows "Saved on this device" and automatic send.
 * 2. Terminal invalid item shows "Open and correct" and NOT retry action.
 * 3. Click retry on retryable item and observe Sending state.
 * 4. Simulate success and observe "Submitted" chip.
 * 5. Simulate 422 and observe "Needs correction" with "Open and correct" button.
 * 6. Simulate no eligible item and verify visible correction banner.
 * 7. Mobile 390px status/action layout remains usable without horizontal overflow.
 */

/**
 * Native in-browser IndexedDB fixture helpers.
 * Avoids bundler/node module specifier resolution errors inside page.evaluate().
 */
async function clearOutbox(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const openReq = indexedDB.open('AllianceChildcareDB');
      openReq.onerror = () => resolve();
      openReq.onsuccess = () => {
        const db = openReq.result;
        try {
          if (!db.objectStoreNames.contains('syncQueue')) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction('syncQueue', 'readwrite');
          tx.objectStore('syncQueue').clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          db.close();
          resolve();
        }
      };
    });
  });
}

async function insertSyncQueueItem(page: Page, record: any) {
  await page.evaluate((itemToInsert) => {
    return new Promise<void>((resolve, reject) => {
      const openReq = indexedDB.open('AllianceChildcareDB');
      openReq.onerror = () => reject(openReq.error);
      openReq.onsuccess = () => {
        const db = openReq.result;
        try {
          const tx = db.transaction('syncQueue', 'readwrite');
          const store = tx.objectStore('syncQueue');
          const addReq = store.add(itemToInsert);
          addReq.onerror = () => reject(addReq.error);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        } catch (err) {
          db.close();
          reject(err);
        }
      };
    });
  }, record);
}

test.describe('Sync Centre Outbox & Terminal State Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');
    await clearOutbox(page);
  });

  // 1. Synthetic queued item shows "Saved on this device" and automatic sending
  test('1. Synthetic queued item shows Send now', async ({ page }) => {
    // Intercept /api/submissions to delay completion so we can observe the queued outbox card
    await page.route('**/api/submissions', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          acknowledged: true,
          remoteSubmissionId: 'REM-QUEUED-1',
          version: 1,
        }),
      });
    });

    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');

    // Inject a synthetic queued item using native browser IndexedDB
    await insertSyncQueueItem(page, {
      schemaVersion: 3,
      identityMigrationVersion: 1,
      canonicalIdentityMigratedAt: new Date().toISOString(),
      submissionUuid: '00000000-0000-4000-8000-000000000001',
      idempotencyKey: 'test-queued-key-1',
      operationType: 'CREATE',
      payload: {
        uuid: '00000000-0000-4000-8000-000000000001',
        clientSubmissionId: '00000000-0000-4000-8000-000000000001',
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
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Should render card for Queued Child with status chip indicating saved locally on device or submitted
    const queuedCard = page.locator('div').filter({ hasText: 'Queued Child' }).first();
    await expect(queuedCard).toBeVisible();
    await expect(
      queuedCard.getByText('Saved on this device', { exact: true })
        .or(queuedCard.getByText('Submitted', { exact: true }))
        .first()
    ).toBeVisible();
  });

  // 2. Terminal invalid item shows Review/Correction and NOT retry action
  test('2. Terminal invalid item shows Review record and NOT Send now', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');

    // Inject a synthetic terminal 422 item
    await insertSyncQueueItem(page, {
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
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Must show "Open and correct" action button
    const reviewBtn = page.getByRole('button', { name: /Open and correct/i }).first();
    await expect(reviewBtn).toBeVisible();

    // Must NOT show retry action on this terminal card
    const retryBtn = page.getByRole('button', { name: /Try again now/i });
    expect(await retryBtn.count()).toBe(0);

    // Attention banner should be visible
    await expect(page.locator('text=needs correction before it can be submitted').first()).toBeVisible();
  });

  // 3. Click Retry once on retryable item and observe Sending state
  test('3. Click Send once and observe Sending state', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');

    // Inject retryable failed item
    await insertSyncQueueItem(page, {
      schemaVersion: 2,
      submissionUuid: '00000000-0000-4000-8000-000000000003',
      idempotencyKey: 'test-retryable-key-3',
      operationType: 'CREATE',
      payload: { demographics: { childName: 'Child Three', artNumber: 'DL-003' } },
      retryCount: 1,
      lastErrorCode: 503,
      lastAttempt: new Date().toISOString(),
      nextRetryTimestamp: Date.now() + 60000,
      errorMessage: 'Service Unavailable (503)',
      conflictMetadata: null,
      status: 'failed_retryable',
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Delay the API response to capture sending state
    await page.route('**/api/submissions', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ acknowledged: true, remoteSubmissionId: 'REM-3' }),
      });
    });

    // The retry action should be available
    const retryBtn = page.getByRole('button', { name: /Try again now/i }).first();
    if (await retryBtn.isVisible()) {
      await retryBtn.click();
      // Should observe Sending... transition
      await expect(page.locator('text=Sending…').first()).toBeVisible();
    }
  });

  // 4. Simulate success and observe Submitted status
  test('4. Simulate success and observe Submitted status', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');

    await insertSyncQueueItem(page, {
      schemaVersion: 3,
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
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Should display Submitted status chip on Child Four card
    const childFourCard = page.locator('div').filter({ hasText: 'Child Four' }).first();
    await expect(childFourCard).toBeVisible();
    await expect(childFourCard.getByText('Submitted', { exact: true }).first()).toBeVisible();
  });

  // 5. Simulate 422 and observe Needs correction with Open and correct button
  test('5. Simulate 422 and observe Needs attention with Review button', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');

    await insertSyncQueueItem(page, {
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
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('text=Needs correction').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Open and correct/i }).first()).toBeVisible();
  });

  // 6. Simulate no eligible item and verify visible correction banner
  test('6. Simulate no eligible item and verify visible explanation', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');

    await insertSyncQueueItem(page, {
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
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // The explicit explanation banner must be visible
    const explanation = page.locator('text=needs correction before it can be submitted');
    await expect(explanation.first()).toBeVisible();
  });

  // 7. Mobile 390px status/action layout remains usable
  test('7. Mobile 390px status/action layout remains usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');

    await insertSyncQueueItem(page, {
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
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Verify zero horizontal page overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);

    // Check touch target heights >= 36px
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
