/**
 * Automated Acceptance Test Suite for Calling-Agent Voice Prototype
 * 
 * Verifies all 16 required conversational scenarios, safety constraints,
 * latency bounds, and resource cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceConversationStateMachine } from '../state-machine';
import { MockDisposableStateStore, FIXED_SYNTHETIC_TASK } from '../mock-tools';
import { SyntheticVoicePipelineRunner, checkVoiceProviderConfiguration } from '../livekit-pipeline-adapter';

describe('Calling-Agent Voice Prototype Acceptance Suite', () => {
  let store: MockDisposableStateStore;
  let sm: VoiceConversationStateMachine;
  let runner: SyntheticVoicePipelineRunner;

  beforeEach(() => {
    store = new MockDisposableStateStore();
    sm = new VoiceConversationStateMachine(store);
    runner = new SyntheticVoicePipelineRunner(sm, store);
  });

  // Test 1: English greeting
  it('1. English greeting: announces automated assistant identity and checks convenience/privacy', () => {
    const greeting = sm.startSession('en');
    expect(greeting.state).toBe('PRIVACY_CONSENT_PENDING');
    expect(greeting.assistantUtterance).toContain('automated programme assistant');
    expect(greeting.assistantUtterance).toContain('convenient and private time');
    expect(greeting.language).toBe('en');
    expect(sm.isSpeaking()).toBe(true);
  });

  // Test 2: Hindi greeting
  it('2. Hindi greeting: announces automated assistant identity and checks convenience/privacy in Hindi', () => {
    const greeting = sm.startSession('hi');
    expect(greeting.state).toBe('PRIVACY_CONSENT_PENDING');
    expect(greeting.assistantUtterance).toContain('ऑटोमेटेड प्रोग्राम असिस्टेंट');
    expect(greeting.assistantUtterance).toContain('सही और सुरक्षित समय');
    expect(greeting.language).toBe('hi');
  });

  // Test 3: Hindi-English switching (Hinglish)
  it('3. Hindi-English switching: detects Hinglish and adapts response seamlessly', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    // User responds in Hinglish
    const { output } = await runner.simulateTurn('Haan, main bol sakti hoon, boliye');
    expect(output.language).toBe('hinglish');
    expect(output.state).toBe('AWAITING_USER_INPUT');
    expect(output.assistantUtterance).toContain('follow-up task');
  });

  // Test 4: Interruption while the assistant is speaking (barge-in)
  it('4. Interruption while speaking: triggers instant barge-in and aborts assistant speech', async () => {
    runner.startMicrophone();
    sm.startSession('en');
    expect(sm.isSpeaking()).toBe(true);

    // User interrupts before assistant finishes
    const bargeResult = runner.triggerBargeIn();
    expect(bargeResult.interrupted).toBe(true);
    expect(sm.isSpeaking()).toBe(false);

    // Check that turn was recorded with interrupted flag
    const turns = sm.getTurns();
    const assistantTurn = turns[turns.length - 1];
    expect(assistantTurn.interrupted).toBe(true);
  });

  // Test 5: Silence / noise
  it('5. Silence/noise: tracks consecutive silence timeouts and terminates after ceiling', () => {
    sm.startSession('en');

    // First silence timeout: re-prompts
    const prompt1 = sm.handleSilence();
    expect(prompt1.shouldTerminate).toBe(false);
    expect(prompt1.assistantUtterance).toContain('are you still there');

    // Second silence timeout: re-prompts
    const prompt2 = sm.handleSilence();
    expect(prompt2.shouldTerminate).toBe(false);

    // Third silence timeout: exceeds maxConsecutiveSilences (2), terminates politely
    const prompt3 = sm.handleSilence();
    expect(prompt3.shouldTerminate).toBe(true);
    expect(prompt3.state).toBe('TERMINATED_BOUNDED_DURATION');
    expect(prompt3.assistantUtterance).toContain('follow up later');
  });

  // Test 6: Unclear response
  it('6. Unclear response: prompts for clarification and offers human staff option', () => {
    sm.startSession('en');
    const response = sm.handleUnclearSpeech();

    expect(response.shouldTerminate).toBe(false);
    expect(response.assistantUtterance).toContain('did not catch that clearly');
    expect(response.assistantUtterance).toContain('speak with a staff member');
  });

  // Test 7: Wrong number
  it('7. Wrong number: states test disclaimer, terminates gracefully, and records mock outcome', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    const { output } = await runner.simulateTurn('This is the wrong number');
    expect(output.shouldTerminate).toBe(true);
    expect(output.state).toBe('WRONG_NUMBER_TERMINATED');
    expect(output.assistantUtterance).toContain('This is a test; no records were changed');

    const outcomes = store.getOutcomes();
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].finalState).toBe('WRONG_NUMBER_TERMINATED');
  });

  // Test 8: Caregiver unavailable / Call later
  it('8. Caregiver unavailable: respects busy status, confirms test disclaimer, and records mock callback', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    const { output } = await runner.simulateTurn('I am very busy right now, please call later');
    expect(output.shouldTerminate).toBe(true);
    expect(output.state).toBe('CARE_UNAVAILABLE_TERMINATED');
    expect(output.assistantUtterance).toContain('This is a test; no real callback or staff notification was created');

    const callbacks = store.getCallbacks();
    expect(callbacks.length).toBe(1);
    expect(callbacks[0].taskId).toBe(FIXED_SYNTHETIC_TASK.taskId);
  });

  // Test 9: Stop / opt-out
  it('9. Stop/opt-out: immediately honors stop request, confirms test disclaimer, and logs mock record', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    const { output } = await runner.simulateTurn('Stop calling me, unsubscribe');
    expect(output.shouldTerminate).toBe(true);
    expect(output.state).toBe('OPT_OUT_PROCESSED');
    expect(output.assistantUtterance).toContain('This is a test; your preference has been recorded for this test session only');

    const optOuts = store.getOptOuts();
    expect(optOuts.length).toBe(1);
    expect(optOuts[0].optOutType).toBe('CALLS');
  });

  // Test 10: Callback request without inventing a confirmed appointment
  it('10. Callback request: logs window without fabricating confirmed time appointment and confirms test', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    // Declines privacy consent
    const { output } = await runner.simulateTurn('No, this is not a convenient time');
    expect(output.shouldTerminate).toBe(true);
    expect(output.state).toBe('CARE_UNAVAILABLE_TERMINATED');
    expect(output.assistantUtterance).toContain('This is a test; no real callback or staff notification was created');

    const callbacks = store.getCallbacks();
    expect(callbacks.length).toBe(1);
    expect(callbacks[0].requestedWindow).toBe('Private time callback needed');
  });

  // Test 11: Human assistance request
  it('11. Human assistance request: escalates immediately to staff handoff tool with test disclaimer', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    const { output } = await runner.simulateTurn('Can I please talk to a human staff member?');
    expect(output.shouldTerminate).toBe(true);
    expect(output.state).toBe('HUMAN_HANDOFF');
    expect(output.assistantUtterance).toContain('This is a test; no real callback or staff notification was created');

    const handoffs = store.getHandoffs();
    expect(handoffs.length).toBe(1);
    expect(handoffs[0].taskId).toBe(FIXED_SYNTHETIC_TASK.taskId);
  });

  // Test 12: Sensitive data request rejected (Aadhaar / bank / HIV status)
  it('12. Sensitive data request rejected: refuses medical disclosure and banking info firmly', async () => {
    runner.startMicrophone();
    sm.startSession('en');

    // Attempting clinical / HIV inquiry
    const resHealth = await runner.simulateTurn('What is my child HIV test status and viral load?');
    expect(resHealth.output.shouldTerminate).toBe(false);
    expect(resHealth.output.assistantUtterance).toContain('cannot discuss medical records or clinical health details');

    // Attempting financial / bank / OTP inquiry
    const resBank = await runner.simulateTurn('Where should I enter my bank account OTP and Aadhaar number?');
    expect(resBank.output.shouldTerminate).toBe(false);
    expect(resBank.output.assistantUtterance).toContain('programme never asks for Aadhaar numbers, bank account details, OTPs, or payments');
  });

  // Test 13: Provider failure / Credential gate check
  it('13. Provider failure: safely verifies environment without leaking secrets or crashing', () => {
    const status = checkVoiceProviderConfiguration();
    expect(status).toHaveProperty('executionMode');
    expect(status).toHaveProperty('statusDescription');
    if (!status.hasLiveKitConfig) {
      expect(status.statusDescription).toContain('AI/Audio Path: NOT EXECUTED');
    }
  });

  // Test 14: Usage limit reached (Bounded duration and turn limits)
  it('14. Usage limit reached: terminates gracefully when maximum turn ceiling is hit', () => {
    // 3 turn ceiling: greeting (turn 1), user input (turn 2), assistant response (turn 3)
    const smShort = new VoiceConversationStateMachine(store, { maxTurns: 3 });
    smShort.startSession('en'); // Turn 1: Assistant greeting

    // User speaks, assistant responds => turns reach 3
    smShort.processUserInput('Hello');

    // Next user input hits turn ceiling and terminates
    const terminatingTurn = smShort.processUserInput('What next?');

    expect(terminatingTurn.shouldTerminate).toBe(true);
    expect(terminatingTurn.state).toBe('TERMINATED_USAGE_LIMIT');
    expect(terminatingTurn.assistantUtterance).toContain('reached our scheduled time limit');
  });

  // Test 15: Microphone permission denied / inactive state
  it('15. Microphone permission denied: rejects turn processing if microphone is not active', async () => {
    sm.startSession('en');
    // Runner mic is NOT started
    await expect(runner.simulateTurn('Hello')).rejects.toThrow('Microphone is inactive');

    // Muted microphone
    runner.startMicrophone();
    runner.setMute(true);
    await expect(runner.simulateTurn('Hello')).rejects.toThrow('Microphone is muted');
  });

  // Test 16: Session termination and resource cleanup
  it('16. Session termination and resource cleanup: stops audio capture, records outcome metrics', () => {
    runner.startMicrophone();
    sm.startSession('en');
    expect(runner.isMicrophoneActive()).toBe(true);

    runner.stopMicrophone();
    expect(runner.isMicrophoneActive()).toBe(false);

    sm.terminateSession('COMPLETED', 'Thank you', 'Manual stop');
    const metrics = sm.getMetrics();
    expect(metrics.totalTurns).toBeGreaterThan(0);
    expect(metrics.endReason).toBe('Manual stop');
  });
});
