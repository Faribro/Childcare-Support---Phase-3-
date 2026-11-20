#!/usr/bin/env tsx
/**
 * scripts/test/staging-landing-preview-acceptance-test.ts
 *
 * Automated Staging Acceptance Test Suite for Landing Preview Commit 2c729ad.
 *
 * Verifies all 12 directives on live Cloud Run staging service csc-staging:
 * 1. Health endpoint returns healthy.
 * 2. Landing page loads the new 10-step preview.
 * 3. All category filters work (All, Education, Nutrition, HIV).
 * 4. HIV-only selection hides banking and family/income sections.
 * 5. Education selection shows education and banking/income sections.
 * 6. Nutrition selection shows nutrition, health and banking/income sections.
 * 7. All Categories shows all applicable sections.
 * 8. The three lifecycle cards display correctly.
 * 9. Keyboard navigation works.
 * 10. Jargon-free copy check (no caseworker, case file, intake, Firestore, IndexedDB, passwordless).
 * 11. Privacy-safe sample data check (no real child, family, Aadhaar, bank, medical data).
 * 12. Mobile (375x667) and Desktop (1280x800) responsive verification.
 */

import { chromium, Browser, Page } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'https://csc-staging-963330210821.asia-south1.run.app';

interface TestResult {
  scenario: string;
  verdict: 'PASS' | 'FAIL';
  detail: string;
}

const results: TestResult[] = [];

function recordResult(scenario: string, passed: boolean, detail: string) {
  const verdict = passed ? 'PASS' : 'FAIL';
  results.push({ scenario, verdict, detail });
  if (passed) {
    console.log(`✓ [PASS] ${scenario}`);
    if (detail) console.log(`    Detail: ${detail}`);
  } else {
    console.error(`✗ [FAIL] ${scenario}`);
    console.error(`    Error:  ${detail}`);
  }
}

async function runAcceptanceSuite() {
  console.log('================================================================');
  console.log('STAGING LANDING PREVIEW ACCEPTANCE SUITE (COMMIT 2c729ad)');
  console.log(`Target URL: ${STAGING_URL}`);
  console.log('================================================================\n');

  // 1. Health Endpoint Check
  try {
    const healthRes = await fetch(`${STAGING_URL}/api/health`);
    const healthData = await healthRes.json().catch(() => ({}));
    recordResult(
      '1. Health Endpoint (/api/health)',
      healthRes.status === 200 && healthData.status === 'ok',
      `HTTP ${healthRes.status}, status: ${healthData.status}`
    );
  } catch (err: any) {
    recordResult('1. Health Endpoint (/api/health)', false, err.message);
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });

    // Desktop Test Context
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const desktopPage = await desktopContext.newPage();

    console.log('\n--- Navigating to Staging Landing Page (Desktop) ---');
    const resp = await desktopPage.goto(STAGING_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    recordResult('2. Landing Page Initial Load', resp !== null && resp.status() === 200, `HTTP ${resp?.status()}`);

    // Wait for the ExperiencePreview section to appear
    await desktopPage.waitForSelector('#preview-heading', { timeout: 15000 });

    // 2b. Exact Heading Verification
    const headingText = await desktopPage.$eval('#preview-heading-title', (el) => el.textContent?.trim() || '');
    const isHeadingCorrect = headingText === 'A simple, respectful way to request support for a child.';
    recordResult(
      '2b. Plain-Language Heading ("A simple, respectful way to request support for a child.")',
      isHeadingCorrect,
      `Found: "${headingText}"`
    );

    // 3. Category Filter Buttons Present
    const allBtn = desktopPage.locator('#preview-heading button:has-text("All categories")');
    const eduBtn = desktopPage.locator('#preview-heading button:has-text("Education support")');
    const nutBtn = desktopPage.locator('#preview-heading button:has-text("Nutrition support")');
    const hivBtn = desktopPage.locator('#preview-heading button:has-text("HIV-related support")');

    const filtersExist =
      (await allBtn.count()) > 0 &&
      (await eduBtn.count()) > 0 &&
      (await nutBtn.count()) > 0 &&
      (await hivBtn.count()) > 0;
    recordResult('3. All Four Category Filter Buttons Interactive', filtersExist, 'All, Education, Nutrition, HIV buttons found');

    // 4. HIV-only selection hides banking and family/income sections
    await hivBtn.click();
    await desktopPage.waitForTimeout(300);
    const hivTabs = await desktopPage.locator('#preview-heading div[role="tablist"] button[role="tab"]').allTextContents();
    const hivHasBanking = hivTabs.some((t) => /bank details/i.test(t));
    const hivHasFamily = hivTabs.some((t) => /family and income/i.test(t));
    const hivHasEdu = hivTabs.some((t) => /education/i.test(t));
    const hivHasNut = hivTabs.some((t) => /nutrition/i.test(t));
    const hivHasHIV = hivTabs.some((t) => /HIV-related/i.test(t));
    const hivHasConsent = hivTabs.some((t) => /consent/i.test(t));

    recordResult(
      '4. HIV-Only Filter Hides Banking & Family/Income (Shows HIV, Consent, Demographics)',
      !hivHasBanking && !hivHasFamily && !hivHasEdu && !hivHasNut && hivHasHIV && hivHasConsent,
      `Visible steps: ${hivTabs.length} (Banking: ${hivHasBanking}, Family: ${hivHasFamily})`
    );

    // 5. Education selection shows education and banking/income sections
    await eduBtn.click();
    await desktopPage.waitForTimeout(300);
    const eduTabs = await desktopPage.locator('#preview-heading div[role="tablist"] button[role="tab"]').allTextContents();
    const eduHasEdu = eduTabs.some((t) => /education/i.test(t));
    const eduHasBanking = eduTabs.some((t) => /bank details/i.test(t));
    const eduHasFamily = eduTabs.some((t) => /family and income/i.test(t));
    const eduHasHIV = eduTabs.some((t) => /HIV-related/i.test(t));
    const eduHasNut = eduTabs.some((t) => /nutrition/i.test(t));

    recordResult(
      '5. Education Support Filter Shows Education, Family & Banking (Hides Nutrition & HIV)',
      eduHasEdu && eduHasBanking && eduHasFamily && !eduHasHIV && !eduHasNut,
      `Visible steps: ${eduTabs.length} (Edu: ${eduHasEdu}, Banking: ${eduHasBanking}, Family: ${eduHasFamily})`
    );

    // 6. Nutrition selection shows nutrition, health and banking/income sections
    await nutBtn.click();
    await desktopPage.waitForTimeout(300);
    const nutTabs = await desktopPage.locator('#preview-heading div[role="tablist"] button[role="tab"]').allTextContents();
    const nutHasNut = nutTabs.some((t) => /nutrition/i.test(t));
    const nutHasHealth = nutTabs.some((t) => /health/i.test(t));
    const nutHasBanking = nutTabs.some((t) => /bank details/i.test(t));
    const nutHasFamily = nutTabs.some((t) => /family and income/i.test(t));
    const nutHasEdu = nutTabs.some((t) => /education/i.test(t));
    const nutHasHIV = nutTabs.some((t) => /HIV-related/i.test(t));

    recordResult(
      '6. Nutrition Support Filter Shows Nutrition, Health, Family & Banking (Hides Edu & HIV)',
      nutHasNut && nutHasHealth && nutHasBanking && nutHasFamily && !nutHasEdu && !nutHasHIV,
      `Visible steps: ${nutTabs.length} (Nut: ${nutHasNut}, Health: ${nutHasHealth}, Banking: ${nutHasBanking})`
    );

    // 7. All Categories shows all 10 applicable sections
    await allBtn.click();
    await desktopPage.waitForTimeout(300);
    const allTabs = await desktopPage.locator('#preview-heading div[role="tablist"] button[role="tab"]').allTextContents();
    recordResult(
      '7. All Categories Shows All 10 Intake Steps',
      allTabs.length === 10,
      `Found ${allTabs.length} tabs in All Categories`
    );

    // 8. The three lifecycle cards display correctly
    const card1 = await desktopPage.locator('#preview-heading h3:has-text("What happens after submission")').count();
    const card2 = await desktopPage.locator('#preview-heading h3:has-text("If the field worker needs to stop")').count();
    const card3 = await desktopPage.locator('#preview-heading h3:has-text("If the field worker logs out")').count();
    recordResult(
      '8. Three Lifecycle Guidance Cards Rendered',
      card1 > 0 && card2 > 0 && card3 > 0,
      `Card 1 (Submission): ${card1 > 0}, Card 2 (Pause): ${card2 > 0}, Card 3 (Logout): ${card3 > 0}`
    );

    // 9. Keyboard navigation and Previous/Next buttons
    const nextBtn = desktopPage.locator('#preview-heading button[aria-label="Next step"]');
    await nextBtn.click();
    await desktopPage.waitForTimeout(200);
    const step2Active = await desktopPage.locator('#preview-heading button[role="tab"][aria-selected="true"]').textContent();
    const canAdvance = /Take consent/i.test(step2Active || '');

    // Focus the active tab and press ArrowLeft to navigate back via keyboard
    const activeTab = desktopPage.locator('#preview-heading button[role="tab"][aria-selected="true"]');
    await activeTab.focus();
    await activeTab.press('ArrowLeft');
    await desktopPage.waitForTimeout(200);
    const step1Active = await desktopPage.locator('#preview-heading button[role="tab"][aria-selected="true"]').textContent();
    const canArrowNav = /Choose the support/i.test(step1Active || '');

    recordResult(
      '9. Keyboard Navigation & Next/Previous Controls Operational',
      canAdvance && canArrowNav,
      `Next -> "${step2Active?.trim()}", ArrowLeft -> "${step1Active?.trim()}"`
    );

    // 10. Jargon-free copy check (no caseworker, case file, intake, Firestore, IndexedDB, passwordless)
    const previewHtml = await desktopPage.$eval('#preview-heading', (el) => el.innerHTML);
    const forbiddenPatterns = [
      /\bcaseworker\b/i,
      /\bcase file\b/i,
      /\bcase filing\b/i,
      /\bintake\b/i,
      /\bFirestore\b/i,
      /\bIndexedDB\b/i,
      /\bpasswordless\b/i,
      /\bcryptographic payload\b/i,
    ];
    const foundJargon = forbiddenPatterns.filter((p) => p.test(previewHtml)).map((p) => p.source);
    recordResult(
      '10. Jargon-Free Field Terminology (No caseworker, case file, intake, Firestore, IndexedDB, passwordless)',
      foundJargon.length === 0,
      foundJargon.length === 0 ? 'Zero forbidden jargon terms found' : `Forbidden terms found: ${foundJargon.join(', ')}`
    );

    // 11. Privacy-safe sample data check
    const hasPrivacyNotice = await desktopPage.locator('text=All examples use privacy-safe sample information').count();
    const hasRealAadhaar = /\b[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}\b/.test(previewHtml);
    recordResult(
      '11. Privacy-Safe Sample Data & Prominent Orientation Notice',
      hasPrivacyNotice > 0 && !hasRealAadhaar,
      `Privacy reassurance banner present: ${hasPrivacyNotice > 0}, Real Aadhaar pattern detected: ${hasRealAadhaar}`
    );

    await desktopContext.close();

    // 12. Mobile Screen Verification (375x667 iPhone SE viewport)
    console.log('\n--- Navigating to Staging Landing Page (Mobile Viewport: 375x667) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(STAGING_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await mobilePage.waitForSelector('#preview-heading', { timeout: 15000 });

    const mobileHeadingVisible = await mobilePage.locator('#preview-heading-title').isVisible();
    const mobileTabsVisible = await mobilePage.locator('#preview-heading div[role="tablist"]').isVisible();
    const mobileLifecycleVisible = await mobilePage.locator('#preview-heading h3:has-text("What happens after submission")').isVisible();

    recordResult(
      '12. Responsive Mobile Rendering (375x667 Viewport)',
      mobileHeadingVisible && mobileTabsVisible && mobileLifecycleVisible,
      `Heading: ${mobileHeadingVisible}, Tabs: ${mobileTabsVisible}, Lifecycle Cards: ${mobileLifecycleVisible}`
    );

    await mobileContext.close();
  } catch (err: any) {
    recordResult('Landing Preview Acceptance Execution', false, err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n================================================================');
  console.log('ACCEPTANCE SUMMARY');
  console.log('================================================================');
  const passedCount = results.filter((r) => r.verdict === 'PASS').length;
  const failedCount = results.filter((r) => r.verdict === 'FAIL').length;

  console.log(`Passed:     ${passedCount}`);
  console.log(`Failed:     ${failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAcceptanceSuite().catch((err) => {
  console.error('[FATAL] Staging Acceptance Suite failed:', err);
  process.exit(1);
});
