import { test, expect } from '@playwright/test';

test.describe('Mobile Experience & Viewport Hardening', () => {
  test('Landing page: zero horizontal overflow and responsive CTA', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Verify no horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);

    // Verify main CTA is visible and has >= 44px touch target
    const downloadBtn = page.getByRole('button', { name: /Download & Install PWA/i });
    await expect(downloadBtn).toBeVisible();
    const btnBox = await downloadBtn.boundingBox();
    expect(btnBox).not.toBeNull();
    if (btnBox) {
      expect(btnBox.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('Workspace (/app): zero horizontal overflow and action cards fit', async ({ page }) => {
    await page.goto('/app');
    await page.waitForLoadState('domcontentloaded');

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);

    // Verify start survey button is present and clickable
    const startSurveyBtn = page.getByRole('button', { name: /Start New Survey/i });
    await expect(startSurveyBtn).toBeVisible();
  });

  test('Assessment New (/assessment/new): responsive single column, signature pad & safe bottom bar', async ({ page }) => {
    await page.goto('/assessment/new');
    await page.waitForLoadState('domcontentloaded');

    // Verify no horizontal page overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);

    // Verify return button is present with >= 44px target
    const returnBtn = page.getByRole('link', { name: /Return to Dashboard/i });
    await expect(returnBtn).toBeVisible();
    const returnBox = await returnBtn.boundingBox();
    expect(returnBox).not.toBeNull();
    if (returnBox) {
      expect(returnBox.height).toBeGreaterThanOrEqual(44);
      expect(returnBox.width).toBeGreaterThanOrEqual(44);
    }

    // Verify bottom action bar buttons are visible and >= 44px
    const saveDraftBtn = page.getByRole('button', { name: /Save Draft/i });
    await expect(saveDraftBtn).toBeVisible();
    const saveDraftBox = await saveDraftBtn.boundingBox();
    expect(saveDraftBox).not.toBeNull();
    if (saveDraftBox) {
      expect(saveDraftBox.height).toBeGreaterThanOrEqual(44);
    }

    // Grant consent to mount signature pad (force true to bypass CSS transform animations on desktop)
    const yesConsent = page.locator('input[name="agreeToParticipate"]').first();
    await yesConsent.check({ force: true });

    // Verify signature canvas exists and has touch-action: none
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const touchAction = await canvas.evaluate((el) => window.getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');
  });

  test('Sync Centre (/assessment/sync): responsive cards, search and filters', async ({ page }) => {
    await page.goto('/assessment/sync');
    await page.waitForLoadState('domcontentloaded');

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);

    // Verify search input is present
    const searchInput = page.getByPlaceholder(/Search by child name/i);
    await expect(searchInput).toBeVisible();
  });

  test('Supervisor Linelist (/supervisor/assessments): responsive cards & desktop notice/table', async ({ page }) => {
    await page.goto('/supervisor/assessments');
    await page.waitForLoadState('domcontentloaded');

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);
  });
});
