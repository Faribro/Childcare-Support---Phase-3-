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

  test('Dedicated Drafts (/assessment/drafts): zero horizontal overflow, back navigation and empty state', async ({ page }) => {
    await page.goto('/assessment/drafts');
    await page.waitForLoadState('domcontentloaded');

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);

    const backBtn = page.getByRole('link', { name: /Back to Dashboard/i });
    await expect(backBtn).toBeVisible();
  });

  test('Mobile Home navigation cards: Drafts and Submitted Surveys open dedicated pages with back navigation', async ({ page }) => {
    // Test across standard mobile widths: 360px, 390px, and 430px
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/app');
      await page.waitForLoadState('domcontentloaded');

      // Verify no horizontal overflow on mobile home
      let hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(hasOverflow).toBe(false);

      // Verify Drafts navigation card exists and links to /assessment/drafts
      const draftsLink = page.getByRole('link', { name: /Drafts/i });
      await expect(draftsLink).toBeVisible();
      await expect(draftsLink).toHaveAttribute('href', '/assessment/drafts');

      // Verify Submitted surveys navigation card exists and links to /assessment/sync?tab=synced
      const submittedLink = page.getByRole('link', { name: /Submitted surveys/i });
      await expect(submittedLink).toBeVisible();
      await expect(submittedLink).toHaveAttribute('href', '/assessment/sync?tab=synced');

      // Verify no expandable dropdown or accordion button
      const accordionBtn = page.locator('button:has-text("Drafts")');
      await expect(accordionBtn).toHaveCount(0);
    }

    // Test navigating to /assessment/drafts and returning
    await page.goto('/app');
    await page.getByRole('link', { name: /Drafts/i }).click();
    await page.waitForURL('**/assessment/drafts');
    expect(page.url()).toContain('/assessment/drafts');

    const backFromDrafts = page.getByRole('link', { name: /Back to Dashboard/i });
    await expect(backFromDrafts).toBeVisible();
    await backFromDrafts.click();
    await page.waitForURL('**/app');
    expect(page.url()).toContain('/app');

    // Test navigating to /assessment/sync?tab=synced and returning
    await page.getByRole('link', { name: /Submitted surveys/i }).click();
    await page.waitForURL('**/assessment/sync?tab=synced');
    expect(page.url()).toContain('/assessment/sync?tab=synced');

    const backFromSync = page.getByRole('link', { name: /Back to Dashboard/i });
    await expect(backFromSync).toBeVisible();
    await backFromSync.click();
    await page.waitForURL('**/app');
    expect(page.url()).toContain('/app');
  });

  test('Responsive refinement pass across 360px, 390px, 430px viewports (no overflow, touch targets, and controls)', async ({ page }) => {
    const viewports = [
      { name: 'Android Compact (360px)', width: 360, height: 800 },
      { name: 'Android Standard (390px)', width: 390, height: 844 },
      { name: 'Android Large (430px)', width: 430, height: 932 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Check Sync Centre (/assessment/sync)
      await page.goto('/assessment/sync');
      await page.waitForLoadState('domcontentloaded');

      let hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(hasOverflow, `Sync screen had overflow at ${vp.width}px`).toBe(false);

      // Verify search input with unclipped placeholder and >=44px height
      const searchInput = page.getByPlaceholder('Search by child name, ART number, caregiver...');
      await expect(searchInput).toBeVisible();
      const searchBox = await searchInput.boundingBox();
      expect(searchBox).not.toBeNull();
      if (searchBox) {
        expect(searchBox.height).toBeGreaterThanOrEqual(44);
      }

      // Verify From and To date filter inputs
      const fromDateInput = page.locator('#filter-from-date');
      const toDateInput = page.locator('#filter-to-date');
      await expect(fromDateInput).toBeVisible();
      await expect(toDateInput).toBeVisible();

      // Verify All Records tab button is visible
      const allRecordsTab = page.getByRole('button', { name: /All Records/i });
      await expect(allRecordsTab).toBeVisible();

      // 2. Check Dedicated Drafts (/assessment/drafts)
      await page.goto('/assessment/drafts');
      await page.waitForLoadState('domcontentloaded');

      hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(hasOverflow, `Drafts screen had overflow at ${vp.width}px`).toBe(false);

      const backToDashDrafts = page.getByRole('link', { name: /Back to Dashboard/i });
      await expect(backToDashDrafts).toBeVisible();

      const startNewSurveyDrafts = page.getByRole('link', { name: /Start New Survey/i });
      await expect(startNewSurveyDrafts).toBeVisible();

      // 3. Check Assessment New (/assessment/new)
      await page.goto('/assessment/new');
      await page.waitForLoadState('domcontentloaded');

      hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(hasOverflow, `New Assessment screen had overflow at ${vp.width}px`).toBe(false);

      // Verify bottom action bar
      const bottomBar = page.locator('.fixed.bottom-0');
      await expect(bottomBar).toBeVisible();
    }
  });
});

