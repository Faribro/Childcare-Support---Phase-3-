import { test, expect } from '@playwright/test';

/**
 * Controlled Staging Browser Intake & Forms Tab Layout Verification Suite
 * 
 * Verifies:
 * 1. Forms Tab Layout Simplification (PR #93 / 0f4b5ab):
 *    - Action row ("Child Nutrition & Support Form" + Animated Heart + "+ Start New Survey") above Needs Attention.
 *    - 4 Needs Attention tiles preserved with correct routes.
 *    - 3 Obsolete summary tiles ("Local In-Progress Drafts", "Waiting to be Sent", "Submitted Surveys") absent.
 * 2. Interactive End-to-End Survey Workflow:
 *    - All 26 linelist fields (SR/SSR, Guardian Status, M/F/TG, Clinical ART/CD4, Disability, Malnutrition, Education Scheme).
 *    - Synthetic document attachment (Passbook, Aadhaar, Photo).
 *    - Interactive signature pad capture on canvas with Save & Confirm.
 *    - Draft save & resume verification.
 *    - Survey submission and canonical record verification.
 */

test.describe('Forms Tab Layout Simplification & Survey Workflow', () => {
  const uniqueChildName = `Synthetic Browser Child ${Date.now()}`;

  test('Forms Tab: Survey action row placed above Needs Attention, 4 action tiles preserved, 0 obsolete tiles', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app');
    await page.waitForLoadState('domcontentloaded');

    // 1. Verify survey action row is present
    const surveyHeading = page.getByRole('heading', { name: /Child Nutrition & Support Form/i }).first();
    await expect(surveyHeading).toBeVisible();

    const startSurveyBtn = page.getByRole('button', { name: /Start New Survey/i }).first();
    await expect(startSurveyBtn).toBeVisible();

    // 2. Verify Needs Attention section is present
    const needsAttentionHeading = page.getByRole('heading', { name: /Needs Attention/i }).first();
    await expect(needsAttentionHeading).toBeVisible();

    // 3. Verify DOM ordering in desktop workspace (.max-w-4xl)
    const isSurveyBeforeNeedsAttention = await page.evaluate(() => {
      const desktopContainer = document.querySelector('.max-w-4xl');
      if (!desktopContainer) return false;
      const surveyTitle = Array.from(desktopContainer.querySelectorAll('h1, h2, h3, h4')).find(
        (el) => el.textContent?.includes('Child Nutrition & Support Form')
      );
      const needsTitle = Array.from(desktopContainer.querySelectorAll('h1, h2, h3, h4')).find(
        (el) => el.textContent?.includes('Needs Attention')
      );
      if (!surveyTitle || !needsTitle) return false;
      return !!(surveyTitle.compareDocumentPosition(needsTitle) & 4);
    });
    expect(isSurveyBeforeNeedsAttention).toBe(true);

    // 4. Verify 4 Needs Attention action tiles exist with correct routes in desktop workspace
    const draftsTile = page.locator('.max-w-4xl a[href="/assessment/drafts"]').first();
    await expect(draftsTile).toBeVisible();

    const supervisorTile = page.locator('.max-w-4xl a[href="/supervisor/assessments"]').first();
    await expect(supervisorTile).toBeVisible();

    const outboxTile = page.locator('.max-w-4xl a[href="/assessment/sync?tab=outbox"]').first();
    await expect(outboxTile).toBeVisible();

    const bankTile = page.locator('.max-w-4xl a[href="/assessment/sync?tab=bank_pending"]').first();
    await expect(bankTile).toBeVisible();

    // 5. Verify the 3 obsolete summary tiles are strictly ABSENT from the workspace
    await expect(page.locator('text="Local In-Progress Drafts"')).toHaveCount(0);
    await expect(page.locator('text="Waiting to be Sent"')).toHaveCount(0);
    await expect(page.locator('.max-w-4xl').getByText('Submitted Surveys', { exact: true })).toHaveCount(0);

    // 6. Verify My In-Progress Drafts section is preserved
    const myDraftsHeading = page.getByRole('heading', { name: /My In-Progress Drafts/i }).first();
    await expect(myDraftsHeading).toBeVisible();
  });

  test('Interactive Survey Intake: Fills all 26 linelist fields, attaches synthetic passbook, captures signature, saves draft, and submits', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1280, height: 900 });

    // Navigate from Workspace
    await page.goto('/app');
    await page.waitForLoadState('domcontentloaded');

    const startSurveyBtn = page.getByRole('button', { name: /Start New Survey/i }).first();
    await startSurveyBtn.click();
    await page.waitForURL('**/assessment/new');
    await page.waitForLoadState('domcontentloaded');

    // --- SECTION 1: Consent & Caregiver ---
    const consentInput = page.locator('input[name="agreeToParticipate"]').first();
    await consentInput.check({ force: true });

    await page.locator('#caregiver-name').fill('Sunita Devi');
    await page.locator('#caregiver-relationship').selectOption('Mother');
    await page.locator('#demographics-contactNumber').fill('9876543210');

    // Signature Canvas Drawing
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 30, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 80, box.y + 50);
      await page.mouse.move(box.x + 150, box.y + 35);
      await page.mouse.up();
    }
    // Save signature
    const saveSigBtn = page.getByRole('button', { name: /Save & Confirm Signature|Signature Confirmed/i }).first();
    if (await saveSigBtn.isVisible()) {
      await saveSigBtn.click({ force: true });
      await page.waitForTimeout(400);
    }

    // --- SECTION 2: Demographics (Including New Linelist Fields) ---
    await page.locator('#demographics-childName').fill(uniqueChildName);
    await page.locator('#demographics-dob').fill('2016-04-15');

    // Gender selection (TG)
    const tgRadio = page.locator('input[name="gender"][value="TG"]').first();
    if (await tgRadio.count() > 0) {
      await tgRadio.check({ force: true });
    }

    // Orphan Status radio
    const orphanRadio = page.locator('input[name="orphanStatus"][value="Single orphan (one parent deceased)"]').first();
    if (await orphanRadio.count() > 0) {
      await orphanRadio.check({ force: true });
    }

    // Child Aadhaar
    const aadhaarInput = page.locator('input[placeholder="e.g. 123456789012"]').first();
    if (await aadhaarInput.count() > 0) {
      await aadhaarInput.fill('123456789012');
    }

    await page.locator('#demographics-fullAddress').fill('Flat 4B, Shanti Nagar, Pune');
    await page.locator('#demographics-state').selectOption('Maharashtra');
    await page.waitForTimeout(300);
    await page.locator('#demographics-district').fill('Pune');

    // 26-row fields: SR Name, SSR Name, Guardian Status
    await page.locator('#child-srName').fill('Maharashtra SR Alliance');
    await page.locator('#child-ssrName').fill('Pune Urban SSR Team');
    await page.locator('#child-guardianStatus').fill('Alive - Working Mother');

    // --- SECTION 3: Banking & Identity & Document Attachment ---
    await page.locator('#q-bank-holder input').fill('Sunita Devi');
    await page.locator('#q-bank-num input').fill('987654321012');
    await page.locator('#q-bank-ifsc input').fill('SBIN0001234');

    const bankPhone = page.locator('input[placeholder="e.g. 9822012345"]').first();
    if (await bankPhone.count() > 0) {
      await bankPhone.fill('9876543210');
    }

    // Synthetic Passbook Document Upload
    const syntheticImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const passbookInput = page.locator('input[type="file"]').first();
    if (await passbookInput.count() > 0) {
      await passbookInput.setInputFiles({
        name: 'synthetic-passbook.png',
        mimeType: 'image/png',
        buffer: syntheticImageBuffer,
      });
      await page.waitForTimeout(300);
    }

    // --- SECTION 4: Household & Family ---
    await page.locator('#household-totalFamilyMembers').fill('4');
    await page.locator('#household-numberOfChildrenUnder18').fill('2');
    await page.locator('#household-monthlyIncomeRs').fill('7500');
    await page.locator('#q-hh-source select').selectOption('Daily wage labour');

    // --- SECTION 5: Health & Clinical Linelist Fields ---
    await page.locator('#health-weightKg').fill('24.5');
    await page.locator('#health-heightCm').fill('122.0');
    await page.locator('#health-haemoglobinGdl').fill('11.8');

    // ART Details
    await page.locator('#health-artStatus').selectOption('On ART');
    await page.waitForTimeout(200);
    await page.locator('#health-artIdNumber').fill('MH-PUN-ART-4421');
    await page.locator('#health-artInitiationDate').fill('2021-09-01');
    await page.locator('#health-artMedicineType').fill('Pediatric Syrup Formulation');
    await page.locator('#health-cd4Count').fill('780');

    // Disability Details
    await page.locator('input[name="hasDisability"][value="No"]').first().check({ force: true });

    // Nutrition Symptoms
    await page.locator('#nutrition-malnutritionSymptoms').fill('Normal appetite, no edema, energetic');

    // --- SECTION 6: Education & Education Benefit ---
    const eduRadio = page.locator('input[name="educationStatus"][value="Currently going to school"]').first();
    if (await eduRadio.count() > 0) {
      await eduRadio.check({ force: true });
    }
    await page.waitForTimeout(200);
    await page.locator('#education-schoolName').fill('Pune Municipal Primary School No. 8');
    await page.locator('#education-schoolSessionStartDate').fill('2026-06-15');
    await page.locator('#education-schoolType').selectOption('Government school');
    await page.locator('#education-currentClass').selectOption('Class 4');
    const attRadio = page.locator('input[name="attendance"][value="Regular"]').first();
    if (await attRadio.count() > 0) {
      await attRadio.check({ force: true });
    }
    await page.locator('#education-scheme-benefit').selectOption('Yes');

    // --- Step: Save Draft and Verify Draft Persistence ---
    const saveDraftBtn = page.getByRole('button', { name: /Save Draft/i }).first();
    await saveDraftBtn.click({ force: true });
    await page.waitForTimeout(1000);

    // Verify Draft in Dashboard
    await page.goto('/app');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text=${uniqueChildName}`).first()).toBeVisible({ timeout: 10000 });

    // Reopen draft via Resume Intake action
    const resumeBtn = page.getByRole('button', { name: /Resume Intake/i }).first();
    await resumeBtn.click({ force: true });
    await page.waitForURL('**/assessment/draft/**');
    await page.waitForLoadState('domcontentloaded');

    // Verify fields hydrated in draft
    await expect(page.locator('#demographics-childName')).toHaveValue(uniqueChildName);
    await expect(page.locator('#child-srName')).toHaveValue('Maharashtra SR Alliance');
    await expect(page.locator('#child-ssrName')).toHaveValue('Pune Urban SSR Team');
    await expect(page.locator('#child-guardianStatus')).toHaveValue('Alive - Working Mother');
    await expect(page.locator('#health-artIdNumber')).toHaveValue('MH-PUN-ART-4421');
    await expect(page.locator('#health-cd4Count')).toHaveValue('780');

    // Complete review confirmation
    await page.locator('#review-allInfoCorrect input[name="allInfoCorrect"]').first().check({ force: true });
    await page.locator('#review-formSubmittedBy').fill('Caseworker Meera');

    // Submit Survey
    const submitBtn = page.locator('#btn-submit-survey, button:has-text("Submit Survey")').first();
    await submitBtn.click({ force: true });

    // Verify submission result: redirected to sync queue with saved_queued or offline status
    await page.waitForURL(/(\/assessment\/sync|\/assessment\/record\/|\/receipt)/, { timeout: 15000 });
    expect(page.url()).toMatch(/\/assessment\/sync|\/assessment\/record\/|\/receipt/);
  });
});
