/**
 * @vitest-environment node
 * 
 * Automated Simulation Test Suite: Missing-Document Follow-Up Voice Flow
 * 
 * Demonstrates:
 * missing-document event -> call session -> user conversation ->
 * WhatsApp upload handoff -> call ends cleanly.
 * 
 * Tests:
 * - Interruption (barge-in)
 * - Consecutive silences & recovery
 * - Disconnect & cleanup
 * - Strict enforcement: Verbal claim alone cannot complete document; stored status required
 * - Multi-lingual switching (English, Hindi, Hinglish)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceConversationStateMachine } from '../state-machine';
import {
  MockDisposableStateStore,
  FIXED_DOCUMENT_FOLLOWUP_TASK,
  createSyntheticMissingDocumentEvent,
} from '../mock-tools';
import { SyntheticVoicePipelineRunner } from '../livekit-pipeline-adapter';

describe('Document-Follow-Up Call Flow Simulation Suite', () => {
  let store: MockDisposableStateStore;
  let sm: VoiceConversationStateMachine;
  let runner: SyntheticVoicePipelineRunner;

  beforeEach(() => {
    store = new MockDisposableStateStore();
    sm = new VoiceConversationStateMachine(store, {}, FIXED_DOCUMENT_FOLLOWUP_TASK);
    runner = new SyntheticVoicePipelineRunner(sm, store);
  });

  // Test 1: Event triggers call session with automated identity and privacy consent
  it('1. missing-document event triggers call session with automated identity and privacy consent', () => {
    const event = createSyntheticMissingDocumentEvent();
    expect(event.document.documentType).toBe('NUTRITION_CARD');
    expect(event.document.status).toBe('MISSING');
    expect(event.document.childName).toBe('Baby Ananya');

    const greeting = sm.startSession('en');
    expect(greeting.state).toBe('PRIVACY_CONSENT_PENDING');
    expect(greeting.assistantUtterance).toContain('automated programme assistant');
    expect(greeting.assistantUtterance).toContain('missing document for child nutrition support');
    expect(greeting.assistantUtterance).toContain('convenient and private time');
    expect(sm.isSpeaking()).toBe(true);
  });

  // Test 2: Complete Happy Path: Event -> Call -> Consent -> Document Explanation -> WhatsApp Handoff -> Clean End
  it('2. complete happy path: missing-document event -> call session -> conversation -> WhatsApp handoff -> clean call end', async () => {
    runner.startMicrophone();

    // 1. Assistant Greeting
    const greeting = sm.startSession('en');
    expect(greeting.state).toBe('PRIVACY_CONSENT_PENDING');

    // 2. User confirms convenient and private time
    const turn1 = await runner.simulateTurn('Yes, this is a convenient and private time to speak.');
    expect(turn1.output.state).toBe('WHATSAPP_HANDOFF_OFFERED');
    expect(turn1.output.assistantUtterance).toContain('Child Nutrition & Growth Card');
    expect(turn1.output.assistantUtterance).toContain('Baby Ananya');
    expect(turn1.output.assistantUtterance).toContain('send a secure upload link to this WhatsApp number');
    expect(turn1.output.shouldTerminate).toBe(false);

    // 3. User agrees to WhatsApp photo upload link
    const turn2 = await runner.simulateTurn('Yes, please send the link on WhatsApp.');
    expect(turn2.output.shouldTerminate).toBe(true);
    expect(turn2.output.state).toBe('WHATSAPP_HANDOFF_DISPATCHED');
    expect(turn2.output.assistantUtterance).toContain('This is a test');
    expect(turn2.output.assistantUtterance).toContain('mock WhatsApp upload link has been sent');
    expect(turn2.output.assistantUtterance).toContain('ending in 123');

    // 4. Verify state in store: WhatsApp handoff record dispatched and status changed
    const handoffs = store.getWhatsAppHandoffs();
    expect(handoffs.length).toBe(1);
    expect(handoffs[0].taskId).toBe(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId);
    expect(handoffs[0].phoneMasked).toBe('+91 98XXX-XX123');
    expect(handoffs[0].uploadLinkToken).toMatch(/^upload-synth-/);
    expect(handoffs[0].deliveryStatus).toBe('SIMULATED_DISPATCHED');

    // Stored document status transitioned to PENDING_UPLOAD
    const doc = store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId);
    expect(doc?.status).toBe('PENDING_UPLOAD');

    // Outcome logged
    const outcomes = store.getOutcomes();
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].finalState).toBe('COMPLETED');
    expect(outcomes[0].notes).toContain('WhatsApp photo upload link dispatched');
  });

  // Test 3: STRICT GUARD: Verbal claim alone CANNOT mark document complete when stored status is pending
  it('3. strict guard: user claiming "I already sent it" does not complete task if stored status is pending', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    // User gives privacy consent
    await runner.simulateTurn('Yes, go ahead.');
    expect(sm.getState()).toBe('WHATSAPP_HANDOFF_OFFERED');

    // Ensure document status in store is still MISSING
    const docBefore = store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId);
    expect(docBefore?.status).toBe('MISSING');

    // User claims verbal completion: "I already sent it yesterday"
    const turn = await runner.simulateTurn('I already sent it yesterday, why are you calling?');

    // MUST NOT complete task
    expect(turn.output.shouldTerminate).toBe(false);
    expect(turn.output.state).toBe('DOCUMENT_STATUS_CHECKED');
    expect(turn.output.assistantUtterance).toContain('not yet been received in our records');
    expect(turn.output.assistantUtterance).toContain('still marked as pending');
    expect(turn.output.assistantUtterance).toContain('send a WhatsApp upload link');

    // No completion outcome was logged in store
    const outcomes = store.getOutcomes();
    expect(outcomes.length).toBe(0);

    // Document status remains unchanged
    expect(store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId)?.status).toBe('MISSING');
  });

  // Test 4: Genuine completion when stored document status is confirmed verified
  it('4. genuine completion: user claiming "I sent it" completes call when stored document status is verified', async () => {
    runner.startMicrophone();
    sm.startSession('en');
    await runner.simulateTurn('Yes, go ahead.');

    // Simulate that the document was verified in the system database
    store.setDocumentStatus(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId, 'VERIFIED');
    expect(store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId)?.status).toBe('VERIFIED');

    // User states they sent it
    const turn = await runner.simulateTurn('I already uploaded and submitted the document.');

    // Assistant queries stored status, sees VERIFIED, and completes call with approved wording
    expect(turn.output.shouldTerminate).toBe(true);
    expect(turn.output.state).toBe('COMPLETED');
    expect(turn.output.assistantUtterance).toContain('approved and verified in our records');
    expect(turn.output.assistantUtterance).toContain('follow-up task is complete');

    // Outcome is logged in store as completed with approved notes
    const outcomes = store.getOutcomes();
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].finalState).toBe('COMPLETED');
    expect(outcomes[0].notes).toContain('confirmed by stored VERIFIED status (approved and verified)');
  });

  // Test 4b: Stored status UPLOADED indicates received/under review, not approved or submission complete
  it('4b. uploaded distinction: stored status UPLOADED confirms received pending review, not approved/complete', async () => {
    runner.startMicrophone();
    sm.startSession('en');
    await runner.simulateTurn('Yes, go ahead.');

    // Simulate document was uploaded (e.g. via WhatsApp) but NOT yet verified by staff
    store.setDocumentStatus(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId, 'UPLOADED');
    expect(store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId)?.status).toBe('UPLOADED');

    // User states they already sent it
    const turn = await runner.simulateTurn('I already sent the photo earlier today.');

    // Assistant confirms photo received under review, explicitly stating NOT yet approved or complete
    expect(turn.output.shouldTerminate).toBe(true);
    expect(turn.output.state).toBe('COMPLETED');
    expect(turn.output.assistantUtterance).toContain('document photo was received');
    expect(turn.output.assistantUtterance).toContain('currently under review by our verification team');
    expect(turn.output.assistantUtterance).toContain('not yet approved or complete');
    expect(turn.output.assistantUtterance).toContain('do not need to upload it again');

    // Outcome notes record UPLOADED status received and pending review
    const outcomes = store.getOutcomes();
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].finalState).toBe('COMPLETED');
    expect(outcomes[0].notes).toContain('stored status is UPLOADED (received and pending review, not yet approved or complete)');
  });

  // Test 5: Interruption (Barge-in) during document explanation
  it('5. interruption (barge-in): user talks over assistant during document explanation, speech aborts immediately', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    // User gives privacy consent
    await runner.simulateTurn('Yes, I am free to speak.');
    expect(sm.isSpeaking()).toBe(true);

    // Assistant is explaining document requirement. User interrupts mid-speech
    const bargeIn = runner.triggerBargeIn();
    expect(bargeIn.interrupted).toBe(true);
    expect(sm.isSpeaking()).toBe(false);

    // Verify last turn is marked as interrupted
    const turns = sm.getTurns();
    const lastTurn = turns[turns.length - 1];
    expect(lastTurn.speaker).toBe('assistant');
    expect(lastTurn.interrupted).toBe(true);

    // User then asks for WhatsApp link
    const followUpTurn = await runner.simulateTurn('Wait, can you just send it on WhatsApp?');
    expect(followUpTurn.output.state).toBe('WHATSAPP_HANDOFF_DISPATCHED');
    expect(followUpTurn.output.shouldTerminate).toBe(true);
  });

  // Test 6: Silence timeouts and recovery during document follow-up
  it('6. silence recovery: prompts caregiver on silence and terminates gracefully after max consecutive silences', () => {
    sm.startSession('en');

    // Silence 1: prompt
    const silence1 = sm.handleSilence();
    expect(silence1.shouldTerminate).toBe(false);
    expect(silence1.assistantUtterance).toContain('are you still there');

    // Silence 2: prompt
    const silence2 = sm.handleSilence();
    expect(silence2.shouldTerminate).toBe(false);

    // Silence 3: exceeds max consecutive silences (2), terminates gracefully
    const silence3 = sm.handleSilence();
    expect(silence3.shouldTerminate).toBe(true);
    expect(silence3.state).toBe('TERMINATED_BOUNDED_DURATION');
    expect(silence3.assistantUtterance).toContain('follow up later');
  });

  // Test 7: Disconnect and cleanup during document conversation
  it('7. disconnect & cleanup: handles disconnect cleanly, stops microphone, and captures session metrics', () => {
    runner.startMicrophone();
    sm.startSession('en');
    expect(runner.isMicrophoneActive()).toBe(true);

    // Simulating disconnect event
    runner.stopMicrophone();
    expect(runner.isMicrophoneActive()).toBe(false);

    sm.terminateSession('COMPLETED', 'Session ended due to client disconnect.', 'Client disconnected');
    const metrics = sm.getMetrics();
    expect(metrics.totalTurns).toBeGreaterThan(0);
    expect(metrics.endReason).toBe('Client disconnected');
  });

  // Test 8: Hindi Document Follow-Up Flow with WhatsApp Handoff
  it('8. Hindi document follow-up flow: handles greeting, explanation, and WhatsApp handoff in Hindi', async () => {
    runner.startMicrophone();

    // Greeting in Hindi
    const greeting = sm.startSession('hi');
    expect(greeting.language).toBe('hi');
    expect(greeting.assistantUtterance).toContain('आवश्यक दस्तावेज़');

    // User consents in Hindi
    const turn1 = await runner.simulateTurn('हाँ, मैं बात कर सकती हूँ');
    expect(turn1.output.language).toBe('hi');
    expect(turn1.output.assistantUtterance).toContain('व्हाट्सएप लिंक भेज दूँ');

    // User agrees to WhatsApp link in Hindi
    const turn2 = await runner.simulateTurn('हाँ व्हाट्सएप पर भेज दीजिये');
    expect(turn2.output.shouldTerminate).toBe(true);
    expect(turn2.output.state).toBe('WHATSAPP_HANDOFF_DISPATCHED');
    expect(turn2.output.assistantUtterance).toContain('व्हाट्सएप अपलोड लिंक भेज दिया गया है');

    expect(store.getWhatsAppHandoffs().length).toBe(1);
  });

  // Test 9: Hinglish Document Follow-Up Flow with WhatsApp Handoff
  it('9. Hinglish document follow-up flow: seamlessly handles natural Hinglish switches', async () => {
    runner.startMicrophone();

    const greeting = sm.startSession('hinglish');
    expect(greeting.language).toBe('hinglish');
    expect(greeting.assistantUtterance).toContain('missing document');

    const turn1 = await runner.simulateTurn('Haan boliye, main free hoon');
    expect(turn1.output.language).toBe('hinglish');
    expect(turn1.output.assistantUtterance).toContain('WhatsApp link bhej doon');

    const turn2 = await runner.simulateTurn('Haan link bhej do, main upload kar dungi');
    expect(turn2.output.shouldTerminate).toBe(true);
    expect(turn2.output.state).toBe('WHATSAPP_HANDOFF_DISPATCHED');
    expect(turn2.output.assistantUtterance).toContain('WhatsApp upload link bhej diya gaya hai');

    expect(store.getWhatsAppHandoffs().length).toBe(1);
  });

  // Test 10: Caregiver declines WhatsApp upload link, escalating to physical staff handoff
  it('10. caregiver declining WhatsApp link routes gracefully to human staff handoff without broken state', async () => {
    runner.startMicrophone();
    sm.startSession('en');
    await runner.simulateTurn('Yes, go ahead.');

    // User says No to WhatsApp link
    const turn = await runner.simulateTurn('No, I do not use WhatsApp or have a smartphone.');
    expect(turn.output.shouldTerminate).toBe(true);
    expect(turn.output.state).toBe('HUMAN_HANDOFF');
    expect(turn.output.assistantUtterance).toContain('physical submission details');

    const handoffs = store.getHandoffs();
    expect(handoffs.length).toBe(1);
    expect(handoffs[0].reason).toContain('declined WhatsApp photo-upload handoff');
  });
});
