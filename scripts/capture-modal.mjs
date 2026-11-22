import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\fsayyed\\.gemini\\antigravity\\brain\\5f42f2d2-d9e3-415b-a178-fc82456139f8';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();

  // Load app without seeded profile so the WelcomeKiteOnboardingModal opens
  await page.goto('https://csc-staging-963330210821.asia-south1.run.app/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Open modal via Start New Survey or custom event
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('child_nutrition:open_welcome_kite'));
  });
  await page.waitForTimeout(1000);

  // Click "Existing Field User" tab
  const existingTab = page.getByRole('button', { name: /Existing Field User/i }).first();
  const hasTab = await existingTab.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Existing Field User Tab visible:', hasTab);

  if (hasTab) {
    await existingTab.click();
    await page.waitForTimeout(800);
  }

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'staging_existing_field_user_modal_412.png'),
    fullPage: false,
  });
  console.log('Captured: staging_existing_field_user_modal_412.png');

  await browser.close();
}

main();
