import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\fsayyed\\.gemini\\antigravity\\brain\\9c2d5047-f28f-4940-8848-db2b8c2f41dd';
const STAGING_URL = 'https://csc-staging-s6jv7tgjhq-el.a.run.app/app';

async function capture() {
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop Dashboard Viewport (1440 x 900)
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    console.log('Navigating to desktop staging:', STAGING_URL);
    await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const desktopPath = path.join(ARTIFACT_DIR, 'staging_desktop_comic_dashboard.png');
    await page.screenshot({ path: desktopPath });
    console.log(`Saved desktop screenshot: ${desktopPath}`);

    // Miniature garden detail clip
    const gardenCanvas = page.locator('canvas').first();
    if (await gardenCanvas.isVisible()) {
      const gardenPath = path.join(ARTIFACT_DIR, 'staging_miniature_garden_detail.png');
      await gardenCanvas.screenshot({ path: gardenPath });
      console.log(`Saved garden detail: ${gardenPath}`);
    }

    await context.close();
  }

  // 2. Mobile Dashboard Viewport (412 x 915 Pixel 7)
  {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    console.log('Navigating to mobile staging:', STAGING_URL);
    await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const mobilePath = path.join(ARTIFACT_DIR, 'staging_mobile_comic_dashboard.png');
    await page.screenshot({ path: mobilePath });
    console.log(`Saved mobile screenshot: ${mobilePath}`);

    await context.close();
  }

  await browser.close();
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
