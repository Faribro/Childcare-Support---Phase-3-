import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\fsayyed\\.gemini\\antigravity\\brain\\9c2d5047-f28f-4940-8848-db2b8c2f41dd';

async function capture() {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: '360', width: 360, height: 800 },
    { name: '412', width: 412, height: 915 },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // Navigate to local dev server with domcontentloaded
    await page.goto('http://localhost:3088/app', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);

    // Dismiss any modal if open (like onboarding)
    const closeBtn = page.getByRole('button', { name: /close|dismiss|skip|continue/i }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Capture Zero State
    const zeroPath = path.join(ARTIFACT_DIR, `comic_space_dashboard_v5_${vp.name}_zero.png`);
    await page.screenshot({ path: zeroPath, fullPage: false });
    console.log(`Saved ${zeroPath}`);

    // Expand pendings breakdown to test interactive state
    const pendingsBtn = page.getByRole('button', { name: /Pendings/i }).first();
    if (await pendingsBtn.isVisible().catch(() => false)) {
      await pendingsBtn.click().catch(() => {});
      await page.waitForTimeout(600);

      const expandedPath = path.join(ARTIFACT_DIR, `comic_space_dashboard_v5_${vp.name}_expanded.png`);
      await page.screenshot({ path: expandedPath, fullPage: false });
      console.log(`Saved ${expandedPath}`);
    }

    await context.close();
  }

  await browser.close();
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
