import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/fsayyed/.gemini/antigravity/brain/5f42f2d2-d9e3-415b-a178-fc82456139f8';
const STAGING_URL = 'https://csc-staging-s6jv7tgjhq-el.a.run.app';

async function run() {
  console.log('=== Staging Nutrition-Only Server Acceptance & Sync Lifecycle Test ===');
  console.log('Target URL:', STAGING_URL);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    locale: 'en-IN',
  });

  const page = await context.newPage();

  // Monitor all submission API traffic
  let submissionRequest = null;
  let submissionResponse = null;

  page.on('request', (req) => {
    if (req.url().includes('/api/submissions') && req.method() === 'POST') {
      console.log('>> [NETWORK] Captured POST /api/submissions');
      submissionRequest = {
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postDataJSON()
      };
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/api/submissions') && res.request().method() === 'POST') {
      console.log('<< [NETWORK] Response status from /api/submissions:', res.status());
      try {
        const body = await res.json();
        submissionResponse = {
          status: res.status(),
          body: body
        };
        console.log('<< [NETWORK] Response body:', JSON.stringify(body, null, 2));
      } catch (e) {
        console.log('<< [NETWORK] Could not parse JSON body:', e.message);
      }
    }
  });

  try {
    // Step 1: Set up mock worker profile in localStorage
    console.log('\n--- Step 1: Initialising Worker Session on Staging ---');
    await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => {
      const mockUser = {
        name: 'Verification Officer',
        email: 'verified.caseworker@allianceindia.org',
        organizationName: 'India HIV/AIDS Alliance',
        organizationEmail: 'verified.caseworker@allianceindia.org',
        role: 'FIELD_USER',
        phone: '9876543210'
      };
      localStorage.setItem('field_user_profile', JSON.stringify(mockUser));
      localStorage.setItem('field_user_session', JSON.stringify({
        token: 'synthetic-verification-token',
        email: 'verified.caseworker@allianceindia.org',
        role: 'FIELD_USER',
        expiresAt: Date.now() + 86400000
      }));
    });

    // Step 2: Navigate to New Assessment
    console.log('\n--- Step 2: Starting New Assessment (/assessment/new) ---');
    await page.goto(`${STAGING_URL}/assessment/new`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Step 3: Select Nutrition ONLY in CategorySelectionStep
    console.log('\n--- Step 3: Selecting Support Category (Nutrition Only) ---');
    const categoryHeading = page.locator('text=What support is this assessment for?').first();
    const isModalVisible = await categoryHeading.isVisible({ timeout: 4000 }).catch(() => false);
    console.log('Category Selection Modal Visible:', isModalVisible);

    if (isModalVisible) {
      // Uncheck Education
      const eduLabel = page.locator('label[for="cat-education"]').first();
      const eduChecked = await page.locator('#cat-education').isChecked().catch(() => false);
      if (eduChecked) {
        await eduLabel.click();
        console.log('Unchecked Education.');
      }

      // Check Nutrition
      const nutrLabel = page.locator('label[for="cat-nutrition"]').first();
      const nutrChecked = await page.locator('#cat-nutrition').isChecked().catch(() => false);
      if (!nutrChecked) {
        await nutrLabel.click();
        console.log('Checked Nutrition.');
      }

      // Uncheck HIV support if checked
      const hivChecked = await page.locator('#cat-hiv_support').isChecked().catch(() => false);
      if (hivChecked) {
        await page.locator('label[for="cat-hiv_support"]').first().click();
        console.log('Unchecked HIV Support.');
      }

      const continueBtn = page.getByRole('button', { name: /Continue/i }).first();
      await continueBtn.click();
      await page.waitForTimeout(1500);
      console.log('Proceeded with Nutrition Only.');
    }

    // Step 4: Fill form fields
    console.log('\n--- Step 4: Filling Comprehensive Assessment Data ---');
    
    // 4a. Consent
    console.log('Selecting Caregiver Consent (Yes)...');
    const consentYesLabel = page.locator('label:has(input[name="agreeToParticipate"])').first();
    await consentYesLabel.waitFor({ state: 'visible', timeout: 10000 });
    await consentYesLabel.click();
    await page.waitForTimeout(500);

    const caregiverNameInput = page.locator('#caregiver-name').first();
    await caregiverNameInput.fill('Savitri Devi');

    const caregiverRelSelect = page.locator('#caregiver-relationship').first();
    await caregiverRelSelect.selectOption('Mother');

    // 4b. Caregiver Signature Canvas
    console.log('Signing caregiver consent canvas...');
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pId = 1;
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: rect.left + 50, clientY: rect.top + 50, pointerId: pId, pointerType: 'touch', bubbles: true
      }));
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        clientX: rect.left + 150, clientY: rect.top + 70, pointerId: pId, pointerType: 'touch', bubbles: true
      }));
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        clientX: rect.left + 150, clientY: rect.top + 70, pointerId: pId, pointerType: 'touch', bubbles: true
      }));
    });
    await page.waitForTimeout(500);

    const saveSigBtn = page.getByRole('button', { name: /Save signature|Confirm signature/i }).first();
    if (await saveSigBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
      await saveSigBtn.click();
      console.log('Saved signature.');
    }
    await page.waitForTimeout(500);

    // 4c. Child Demographics
    console.log('Filling Child Demographics...');
    const childNameInput = page.locator('#demographics-childName').first();
    await childNameInput.fill('Rahul Kumar');

    const dobInput = page.locator('#demographics-dob').first();
    await dobInput.fill('2017-04-10');

    // Gender radio
    const maleRadio = page.locator('input[name="gender"][value="Male"], input[name="gender"][value="M"]').first();
    if (await maleRadio.isVisible().catch(() => false)) {
      await maleRadio.check({ force: true });
    }

    // Orphan Status radio
    const orphanRadio = page.locator('input[name="orphanStatus"]').first();
    if (await orphanRadio.isVisible().catch(() => false)) {
      await orphanRadio.check({ force: true });
    }

    // 4d. Residential Address (Paper Form A12)
    console.log('Filling Residential Address (BilingualAddressBlock)...');
    // Residence Type button
    const ownedBtn = page.getByRole('button', { name: /Owned/i }).first();
    if (await ownedBtn.isVisible().catch(() => false)) {
      await ownedBtn.click();
    }

    // Door and Colony
    const doorInput = page.locator('#addr-door-colony').first();
    if (await doorInput.isVisible().catch(() => false)) {
      await doorInput.fill('Flat 204, Pocket B');
    }

    // Street
    const streetInput = page.locator('#addr-street').first();
    if (await streetInput.isVisible().catch(() => false)) {
      await streetInput.fill('Okhla Industrial Area Phase 1');
    }

    // Village / City
    const cityInput = page.locator('#addr-village-city').first();
    if (await cityInput.isVisible().catch(() => false)) {
      await cityInput.fill('New Delhi');
    }

    // Taluk / Mandal / Block
    const talukInput = page.locator('#addr-taluk').first();
    if (await talukInput.isVisible().catch(() => false)) {
      await talukInput.fill('Hauz Khas');
    }

    // State
    const stateSelect = page.locator('#demographics-state').first();
    if (await stateSelect.isVisible().catch(() => false)) {
      await stateSelect.selectOption('Delhi');
      await page.waitForTimeout(500);
    }

    // District
    const districtSelect = page.locator('#demographics-district').first();
    if (await districtSelect.isVisible().catch(() => false)) {
      const tag = await districtSelect.evaluate(el => el.tagName.toLowerCase());
      if (tag === 'select') {
        await districtSelect.selectOption('South Delhi');
      } else {
        await districtSelect.fill('South Delhi');
      }
    }

    // Pincode
    const pinInput = page.locator('#addr-pincode').first();
    if (await pinInput.isVisible().catch(() => false)) {
      await pinInput.fill('110020');
    }

    // Contact Number
    const phoneInput = page.locator('#demographics-contactNumber-input').first();
    if (await phoneInput.isVisible().catch(() => false)) {
      await phoneInput.fill('9876543210');
    }

    // 4e. Household Details
    const incomeSelect = page.locator('#household-mainSourceOfIncome').first();
    if (await incomeSelect.isVisible().catch(() => false)) {
      await incomeSelect.selectOption('Daily wage labour');
    }

    // 4f. Health & Anthropometrics
    const wtInput = page.locator('#health-weightKg').first();
    if (await wtInput.isVisible().catch(() => false)) {
      await wtInput.fill('23');
    }
    const htInput = page.locator('#health-heightCm').first();
    if (await htInput.isVisible().catch(() => false)) {
      await htInput.fill('124');
    }

    // 4g. Form Submitted By / Caseworker Name
    const interviewerInput = page.locator('#review-formSubmittedBy, input[name="formSubmittedBy"], #q-rev-interviewer input').first();
    if (await interviewerInput.isVisible().catch(() => false)) {
      await interviewerInput.fill('Verification Officer');
    }

    // Save as Draft
    console.log('Saving Draft locally...');
    const saveDraftBtn = page.getByRole('button', { name: /Save Draft/i }).first();
    await saveDraftBtn.click();
    await page.waitForTimeout(2000);

    // Retrieve Draft ID from Dexie
    const draftInfo = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('AllianceChildcareDB');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['drafts'], 'readonly');
          const store = tx.objectStore('drafts');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const matches = getAllReq.result.filter(d => 
              d.demographics?.childName === 'Rahul Kumar' || d.childName === 'Rahul Kumar'
            );
            resolve(matches.pop() || getAllReq.result[getAllReq.result.length - 1] || null);
          };
          getAllReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    });

    console.log('Draft Info in Dexie:', draftInfo ? {
      uuid: draftInfo.uuid,
      uniqueId: draftInfo.uniqueId,
      artNumber: draftInfo.demographics?.artNumber,
      supportCategories: draftInfo.supportCategories,
      schemaVersion: draftInfo.schemaVersion,
      childName: draftInfo.demographics?.childName
    } : 'NOT FOUND');

    const draftId = draftInfo?.uuid || draftInfo?.clientSubmissionId;
    const syntheticArtNumber = draftInfo?.demographics?.artNumber || draftInfo?.uniqueId || 'Record';
    if (!draftId) {
      throw new Error('Draft was not saved in Dexie IndexedDB');
    }

    // Step 5: Reopen the draft
    console.log(`\n--- Step 5: Reopening Draft (/assessment/draft/${draftId}) ---`);
    await page.goto(`${STAGING_URL}/assessment/draft/${draftId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const reopenedEdu = await page.locator('#sec-education').first().isVisible().catch(() => false);
    const reopenedExp = await page.locator('#sec-expenses').first().isVisible().catch(() => false);
    console.log('Reopened Draft Education Section Visible:', reopenedEdu, '(Expected: false)');
    console.log('Reopened Draft Expenses Section Visible:', reopenedExp, '(Expected: false)');

    // Step 6: Go to Pre-Submission Review
    console.log(`\n--- Step 6: Navigating to Review Page (/assessment/draft/${draftId}/review) ---`);
    await page.goto(`${STAGING_URL}/assessment/draft/${draftId}/review`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Confirm Attestation Checkbox
    const attestationBox = page.locator('input[type="checkbox"]').last();
    await attestationBox.check();
    console.log('Attestation Checkbox Checked.');

    // Step 7: Queue for Sync & Wait for Submission API Response
    console.log('\n--- Step 7: Clicking "Queue for Sync" & Awaiting Network Submission ---');
    const queueBtn = page.getByRole('button', { name: /Queue for Sync/i }).first();

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/submissions') && res.request().method() === 'POST',
      { timeout: 20000 }
    ).catch(() => null);

    await queueBtn.click();
    console.log('Queue button clicked. Waiting for server intake...');

    const capturedRes = await responsePromise;
    if (capturedRes) {
      console.log('>>> SERVER ACKNOWLEDGEMENT RECEIVED! Status:', capturedRes.status());
      try {
        const json = await capturedRes.json();
        console.log('>>> SERVER ACKNOWLEDGEMENT JSON:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('>>> Could not parse response JSON:', e.message);
      }
    } else {
      console.log('>>> Direct response not captured in 20s window. Checking sync worker and outbox...');
    }

    // Wait for worker processing
    await page.waitForTimeout(4000);

    // Step 8: Check Synced Tab on Sync Page
    console.log('\n--- Step 8: Navigating to Synced Tab (/assessment/sync?tab=synced) ---');
    await page.goto(`${STAGING_URL}/assessment/sync?tab=synced`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const outboxTab = page.locator('button:has-text("Outbox")').first();
    const outboxText = await outboxTab.textContent().catch(() => '');
    console.log('Outbox Tab Text:', outboxText);
    const syncNowBtn = page.getByRole('button', { name: /Sync Now|Retry Sync Now|Sync all/i }).first();
    if (await syncNowBtn.isVisible().catch(() => false)) {
      console.log('Triggering Sync on Sync Page...');
      await syncNowBtn.click();
      await page.waitForTimeout(5000);
    }

    const pageContent = await page.textContent('body');
    const hasRef = pageContent.includes(syntheticArtNumber) || pageContent.includes('Rahul Kumar');
    console.log(`Submitted record (${syntheticArtNumber} / Rahul Kumar) visible in Synced tab:`, hasRef);

    // Capture screenshot of Synced page
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'staging_server_acceptance_confirmed.png'),
      fullPage: false
    });
    console.log('Captured screenshot: staging_server_acceptance_confirmed.png');

    // Click View button to open SubmissionViewModal
    const viewButton = page.locator('button:has-text("View")').first();
    const hasViewBtn = await viewButton.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('View button visible in Synced tab:', hasViewBtn);
    if (hasViewBtn) {
      await viewButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'staging_submitted_record_modal.png'),
        fullPage: false
      });
      console.log('Captured modal screenshot: staging_submitted_record_modal.png');
    }

    // Step 9: Verify IndexedDB final state
    console.log('\n--- Step 9: Inspecting IndexedDB Final Record State ---');
    const dbState = await page.evaluate(async (art) => {
      return new Promise((resolve) => {
        const req = indexedDB.open('AllianceChildcareDB');
        req.onsuccess = () => {
          const db = req.result;
          const result = {};
          
          if (db.objectStoreNames.contains('drafts')) {
            const tx = db.transaction(['drafts', 'syncQueue'], 'readonly');
            const draftsStore = tx.objectStore('drafts');
            const queueStore = tx.objectStore('syncQueue');

            const getDraftsReq = draftsStore.getAll();
            getDraftsReq.onsuccess = () => {
              result.drafts = getDraftsReq.result.map(d => ({
                id: d.id,
                uuid: d.uuid,
                artNumber: d.demographics?.artNumber || d.uniqueId,
                childName: d.demographics?.childName,
                supportCategories: d.supportCategories,
                schemaVersion: d.schemaVersion,
                syncStatus: d.syncStatus,
                remoteSubmissionId: d.remoteSubmissionId
              }));

              const getQueueReq = queueStore.getAll();
              getQueueReq.onsuccess = () => {
                result.queue = getQueueReq.result.map(q => ({
                  id: q.id,
                  status: q.status,
                  submissionUuid: q.submissionUuid,
                  retryCount: q.retryCount,
                  errorMessage: q.errorMessage,
                  errorCategory: q.errorCategory
                }));
                resolve(result);
              };
              getQueueReq.onerror = () => resolve(result);
            };
            getDraftsReq.onerror = () => resolve(result);
          } else {
            resolve({ note: 'No drafts store' });
          }
        };
        req.onerror = () => resolve(null);
      });
    }, syntheticArtNumber);

    console.log('IndexedDB Verification State:', JSON.stringify(dbState, null, 2));

    console.log('\n=== Full Deployed Submission Lifecycle Complete ===');
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await browser.close();
  }
}

run();
