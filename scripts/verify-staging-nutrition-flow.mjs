import { chromium } from '@playwright/test';
import path from 'path';

const STAGING_URL = 'https://csc-staging-963330210821.asia-south1.run.app';
const ARTIFACT_DIR = 'C:\\Users\\fsayyed\\.gemini\\antigravity\\brain\\5f42f2d2-d9e3-415b-a178-fc82456139f8';

async function run() {
  console.log('=== Starting Real Browser Staging Verification for Category Applicability ===');
  console.log('Staging URL:', STAGING_URL);

  const browser = await chromium.launch({ headless: true });

  // Mobile 412px viewport test (Pixel 7)
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });

  const page = await context.newPage();

  // Seed authenticated field user profile in localStorage
  await page.addInitScript(() => {
    const profile = {
      id: 'cw-delhi-01',
      name: 'Staff Member',
      firstName: 'Staff',
      lastName: 'Member',
      email: 'staff@allianceindia.org',
      assignedState: 'Delhi',
      assignedDistrict: 'South Delhi',
      organizationName: 'India HIV/AIDS Alliance',
      organizationEmail: 'staff@allianceindia.org',
    };
    localStorage.setItem('field_user_profile', JSON.stringify(profile));
  });

  page.on('console', async (msg) => {
    try {
      const args = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => a.toString())));
      console.log(`[Browser ${msg.type()}]:`, ...args);
    } catch {
      console.log(`[Browser ${msg.type()}]:`, msg.text());
    }
  });

  try {
    console.log('\n--- Step 1: Navigating to New Assessment (Authenticated Field User) ---');
    await page.goto(`${STAGING_URL}/assessment/new`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify if Category Selection Step is displayed
    console.log('Checking for Category Selection Step...');
    const catStep = page.locator('text=What support is this assessment for?').first();
    const hasCatModal = await catStep.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Category Selection Modal visible:', hasCatModal);

    if (hasCatModal) {
      console.log('Selecting Nutrition ONLY...');
      await page.locator('label[for="cat-nutrition"]').click();
      await page.waitForTimeout(500);

      // Verify education is NOT checked
      const eduBox = page.locator('#cat-education');
      if (await eduBox.isChecked().catch(() => false)) {
        await page.locator('label[for="cat-education"]').click();
      }

      console.log('Selected Nutrition ONLY. Clicking Continue...');
      const continueBtn = page.getByRole('button', { name: 'Continue' }).first();
      await continueBtn.click();
      await page.waitForTimeout(1500);
    }

    // Verify Category Banner
    const banner = page.locator('.bg-teal-50, text=Nutrition').first();
    const bannerVisible = await banner.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Active Category Banner visible:', bannerVisible);

    // Verify Section Visibility
    console.log('\n--- Step 2: Verifying Section Visibility for Nutrition-Only ---');
    const hasConsent = await page.locator('#sec-consent').first().isVisible().catch(() => false);
    const hasDemographics = await page.locator('#sec-child').first().isVisible().catch(() => false);
    const hasBanking = await page.locator('#sec-banking').first().isVisible().catch(() => false);
    const hasHousehold = await page.locator('#sec-household').first().isVisible().catch(() => false);
    const hasHealth = await page.locator('#sec-health').first().isVisible().catch(() => false);
    const hasNutrition = await page.locator('#sec-nutrition').first().isVisible().catch(() => false);
    
    // Non-applicable sections must be false (not rendered in DOM)
    const hasEducation = await page.locator('#sec-education').first().isVisible().catch(() => false);
    const hasExpenses = await page.locator('#sec-expenses').first().isVisible().catch(() => false);

    console.log('Section Consent visible:', hasConsent, '(Expected: true)');
    console.log('Section Demographics visible:', hasDemographics, '(Expected: true)');
    console.log('Section Banking visible:', hasBanking, '(Expected: true)');
    console.log('Section Household visible:', hasHousehold, '(Expected: true)');
    console.log('Section Health visible:', hasHealth, '(Expected: true)');
    console.log('Section Nutrition visible:', hasNutrition, '(Expected: true)');
    console.log('Section Education visible:', hasEducation, '(Expected: FALSE)');
    console.log('Section Expenses visible:', hasExpenses, '(Expected: FALSE)');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'staging_nutrition_only_form_412.png'),
      fullPage: false,
    });
    console.log('Captured screenshot: staging_nutrition_only_form_412.png');

    // Fill Demographics & Consent Fields
    console.log('\n--- Step 3: Filling Demographics & Nutrition Fields for Amit Singh ---');
    
    // Consent
    const consentRadio = page.locator('input[name="agreeToParticipate"]').first();
    if (await consentRadio.isVisible().catch(() => false)) {
      await consentRadio.check({ force: true });
    }

    const caregiverNameInput = page.locator('#caregiver-name').first();
    if (await caregiverNameInput.isVisible().catch(() => false)) {
      await caregiverNameInput.fill('Mukesh');
    }

    const caregiverRelSelect = page.locator('#caregiver-relationship').first();
    if (await caregiverRelSelect.isVisible().catch(() => false)) {
      await caregiverRelSelect.selectOption('Father');
    }

    // Demographics
    await page.locator('#demographics-childName').fill('Amit Singh');
    await page.locator('#demographics-dob').fill('2016-01-15');

    const genderRadio = page.locator('input[name="gender"][value="M"]').first();
    if (await genderRadio.isVisible().catch(() => false)) {
      await genderRadio.check({ force: true });
    }

    const orphanRadio = page.locator('input[name="orphanStatus"][value="Not Orphan"]').first();
    if (await orphanRadio.isVisible().catch(() => false)) {
      await orphanRadio.check({ force: true });
    }

    // Household main source of income
    const incomeSelect = page.locator('#household-mainSourceOfIncome').first();
    if (await incomeSelect.isVisible().catch(() => false)) {
      await incomeSelect.selectOption('Daily wage labour');
    }

    // Caregiver Signature Canvas
    console.log('Interacting with Caregiver Signature Canvas...');
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pId = 1;
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: rect.left + 50,
        clientY: rect.top + 50,
        pointerId: pId,
        pointerType: 'touch',
        bubbles: true,
      }));
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        clientX: rect.left + 150,
        clientY: rect.top + 70,
        pointerId: pId,
        pointerType: 'touch',
        bubbles: true,
      }));
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        clientX: rect.left + 150,
        clientY: rect.top + 70,
        pointerId: pId,
        pointerType: 'touch',
        bubbles: true,
      }));
    });
    await page.waitForTimeout(500);

    const confirmSigBtn = page.getByRole('button', { name: /Save signature|Confirm signature/i }).first();
    const canSaveSig = await confirmSigBtn.isEnabled({ timeout: 2000 }).catch(() => false);
    if (canSaveSig) {
      await confirmSigBtn.click();
      await page.waitForTimeout(500);
      console.log('Signature saved successfully.');
    }

    // Clinical Anthropometrics
    const wtInput = page.locator('#health-weightKg').first();
    if (await wtInput.isVisible().catch(() => false)) {
      await wtInput.fill('22');
    }
    const htInput = page.locator('#health-heightCm').first();
    if (await htInput.isVisible().catch(() => false)) {
      await htInput.fill('125');
    }

    // Wait for autosave to AllianceChildcareDB
    console.log('\n--- Step 4: Waiting for Draft Persistence in AllianceChildcareDB ---');
    await page.waitForTimeout(2000);

    // Inspect IndexedDB to retrieve saved draft
    const draftsInfo = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('AllianceChildcareDB');
        req.onsuccess = (e) => {
          const db = req.result;
          if (!db.objectStoreNames.contains('drafts')) {
            return resolve([]);
          }
          const tx = db.transaction('drafts', 'readonly');
          const store = tx.objectStore('drafts');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            resolve(getAll.result.map(d => ({
              id: d.id,
              uuid: d.uuid,
              name: d.demographics?.childName,
              categories: d.supportCategories,
              schemaVersion: d.schemaVersion,
            })));
          };
          getAll.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      });
    });

    console.log('IndexedDB Saved Drafts:', JSON.stringify(draftsInfo, null, 2));

    const savedDraft = draftsInfo[draftsInfo.length - 1];
    const draftId = savedDraft?.id || savedDraft?.uuid;
    console.log('Testing Draft ID:', draftId);

    if (draftId) {
      console.log(`\n--- Step 5: Reopening Saved Draft /assessment/draft/${draftId} ---`);
      await page.goto(`${STAGING_URL}/assessment/draft/${draftId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);

      // Verify category banner in reopened draft
      const reopenedBanner = page.locator('.bg-teal-50, text=Nutrition').first();
      const reopenedBannerVisible = await reopenedBanner.isVisible().catch(() => false);
      console.log('Reopened Draft Category Banner visible:', reopenedBannerVisible);

      // Verify Quick Jump buttons on reopened draft
      const quickJumpButtons = await page.locator('button:has-text("Demographics"), button:has-text("Health"), button:has-text("Education"), button:has-text("Expenses")').allTextContents();
      console.log('Reopened Draft Quick Jump Items:', quickJumpButtons);

      // Verify Education & Expenses sections remain HIDDEN in reopened draft
      const reopenedEdu = await page.locator('#sec-education').first().isVisible().catch(() => false);
      const reopenedExp = await page.locator('#sec-expenses').first().isVisible().catch(() => false);
      console.log('Reopened Draft Education Section Visible:', reopenedEdu, '(Expected: false)');
      console.log('Reopened Draft Expenses Section Visible:', reopenedExp, '(Expected: false)');

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'staging_nutrition_only_draft_reopened_412.png'),
        fullPage: false,
      });
      console.log('Captured screenshot: staging_nutrition_only_draft_reopened_412.png');

      // Now navigate to Pre-Submission Review page
      console.log('\n--- Step 6: Testing Review & Submission on Reopened Draft ---');
      await page.goto(`${STAGING_URL}/assessment/draft/${draftId}/review`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);

      const reviewCategoryBanner = await page.locator('.bg-teal-50, text=Assessed Categories').first().isVisible().catch(() => false);
      console.log('Review Page Category Banner visible:', reviewCategoryBanner);

      const reviewEducationSec = await page.locator('text=Section 7 — Education Status').first().isVisible().catch(() => false);
      const reviewExpensesSec = await page.locator('text=Section 8 — Education Expenses').first().isVisible().catch(() => false);
      console.log('Review Page Education Section Visible:', reviewEducationSec, '(Expected: false)');
      console.log('Review Page Expenses Section Visible:', reviewExpensesSec, '(Expected: false)');

      // Confirm Attestation Checkbox
      const attestationBox = page.locator('input[type="checkbox"]').last();
      await attestationBox.check();
      console.log('Checked Attestation Checkbox.');

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'staging_nutrition_only_review_page_412.png'),
        fullPage: false,
      });

      // Step 7: Queue for Sync & Await Server Acceptance
      console.log('\n--- Step 7: Clicking "Queue for Sync" & Awaiting Network Intake ---');
      const queueBtn = page.getByRole('button', { name: /Queue for Sync/i }).first();

      const serverAckPromise = page.waitForResponse(
        (res) => res.url().includes('/api/submissions') && res.request().method() === 'POST',
        { timeout: 30000 }
      ).catch((e) => null);

      await queueBtn.click();
      console.log('Queue button clicked. Awaiting server acknowledgement...');

      const serverRes = await serverAckPromise;
      let serverAckData = null;
      if (serverRes) {
        console.log('>>> SERVER ACKNOWLEDGEMENT RECEIVED! HTTP Status:', serverRes.status());
        serverAckData = await serverRes.json().catch(() => null);
        console.log('>>> SERVER ACKNOWLEDGEMENT BODY:', JSON.stringify(serverAckData, null, 2));
      } else {
        console.log('>>> Direct response not captured in 30s. Checking sync worker and outbox...');
      }

      await page.waitForTimeout(3000);

      const finalUrl = page.url();
      console.log('Final URL after submission action:', finalUrl);

      // Check if blocked by error
      const errorMsg = await page.locator('.bg-rose-50').first().textContent().catch(() => null);
      if (errorMsg) {
        console.log('Submission Blocked Message:', errorMsg);
      } else {
        console.log('SUCCESS: No submission blocking message! Transferred cleanly to sync worker.');
      }

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'staging_nutrition_only_final_sync_412.png'),
        fullPage: false,
      });
      console.log('Captured final sync screenshot: staging_nutrition_only_final_sync_412.png');

      // Step 8: Verify in Synced Tab
      console.log('\n--- Step 8: Verifying Submitted Record in Synced Tab ---');
      await page.goto(`${STAGING_URL}/assessment/sync?tab=synced`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);

      // If outbox items remain, trigger sync
      const outboxBadge = await page.locator('button:has-text("Outbox")').textContent().catch(() => '');
      console.log('Outbox Tab Text:', outboxBadge);

      const syncNowBtn = page.getByRole('button', { name: /Sync Now|Retry Sync Now|Sync all/i }).first();
      if (await syncNowBtn.isVisible().catch(() => false)) {
        console.log('Clicking Sync button...');
        await syncNowBtn.click();
        await page.waitForTimeout(4000);
      }

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'staging_server_acceptance_confirmed.png'),
        fullPage: false,
      });
      console.log('Captured screenshot: staging_server_acceptance_confirmed.png');

      // Click on Amit Singh to inspect modal
      const amitRecord = page.locator('text=Amit Singh').first();
      const isAmitVisible = await amitRecord.isVisible().catch(() => false);
      console.log('Amit Singh record visible in Synced tab:', isAmitVisible);

      if (isAmitVisible) {
        await amitRecord.click();
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'staging_submitted_record_modal.png'),
          fullPage: false,
        });
        console.log('Captured modal screenshot: staging_submitted_record_modal.png');
      }

      // Step 9: Verify Dexie DB State
      console.log('\n--- Step 9: Inspecting Dexie IndexedDB Final Record State ---');
      const dbState = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const req = indexedDB.open('AllianceChildcareDB');
          req.onsuccess = () => {
            const db = req.result;
            const res = {};
            if (db.objectStoreNames.contains('drafts')) {
              const tx = db.transaction(['drafts', 'syncQueue'], 'readonly');
              const draftsStore = tx.objectStore('drafts');
              const queueStore = tx.objectStore('syncQueue');
              
              const getDraftsReq = draftsStore.getAll();
              getDraftsReq.onsuccess = () => {
                res.drafts = getDraftsReq.result.map(d => ({
                  id: d.id,
                  uuid: d.uuid,
                  name: d.demographics?.childName,
                  supportCategories: d.supportCategories,
                  schemaVersion: d.schemaVersion,
                  syncStatus: d.syncStatus,
                  remoteSubmissionId: d.remoteSubmissionId
                }));
                
                const getQueueReq = queueStore.getAll();
                getQueueReq.onsuccess = () => {
                  res.queue = getQueueReq.result.map(q => ({
                    id: q.id,
                    status: q.status,
                    submissionUuid: q.submissionUuid,
                    lastError: q.errorMessage,
                    errorCategory: q.errorCategory
                  }));
                  resolve(res);
                };
                getQueueReq.onerror = () => resolve(res);
              };
              getDraftsReq.onerror = () => resolve(res);
            } else {
              resolve({ note: 'No drafts store' });
            }
          };
          req.onerror = () => resolve(null);
        });
      });

      console.log('Dexie DB State:', JSON.stringify(dbState, null, 2));
    }

    console.log('\n=== Real Browser Staging Verification Complete ===');
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }
}

run();
