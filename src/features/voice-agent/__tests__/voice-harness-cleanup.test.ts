/**
 * Automated Test Suite for Voice Harness Media Lifecycle & Cleanup
 * 
 * Verifies microphone permission rejection, track cleanup, and session duration ceilings.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceConversationStateMachine } from '../state-machine';
import { MockDisposableStateStore } from '../mock-tools';
import { SyntheticVoicePipelineRunner } from '../livekit-pipeline-adapter';

describe('Voice Harness Media Lifecycle & Resource Cleanup Suite', () => {
  let store: MockDisposableStateStore;
  let sm: VoiceConversationStateMachine;
  let runner: SyntheticVoicePipelineRunner;

  beforeEach(() => {
    store = new MockDisposableStateStore();
    sm = new VoiceConversationStateMachine(store);
    runner = new SyntheticVoicePipelineRunner(sm, store);
  });

  describe('Microphone Permission Denial & Active Checks', () => {
    it('initializes with microphone inactive and unmuted', () => {
      expect(runner.isMicrophoneActive()).toBe(false);
    });

    it('rejects turn processing when microphone permission is denied or inactive', async () => {
      sm.startSession('en');
      // When mic is inactive (denied by user/browser)
      await expect(runner.simulateTurn('Hello')).rejects.toThrow('Cannot process turn: Microphone is inactive');
    });

    it('rejects turn processing when microphone is muted', async () => {
      sm.startSession('en');
      runner.startMicrophone();
      expect(runner.isMicrophoneActive()).toBe(true);

      runner.setMute(true);
      expect(runner.isMicrophoneActive()).toBe(false);
      await expect(runner.simulateTurn('Hello')).rejects.toThrow('Microphone is muted');
    });

    it('resumes processing when microphone is unmuted', async () => {
      sm.startSession('en');
      runner.startMicrophone();
      runner.setMute(true);
      runner.setMute(false);
      expect(runner.isMicrophoneActive()).toBe(true);

      const res = await runner.simulateTurn('Yes, this is convenient');
      expect(res.output.state).toBe('AWAITING_USER_INPUT');
    });
  });

  describe('Session Duration & Resource Release', () => {
    it('enforces duration tracking and stops speech upon microphone stop', () => {
      sm.startSession('en');
      runner.startMicrophone();
      expect(sm.isSpeaking()).toBe(true);

      runner.stopMicrophone();
      expect(runner.isMicrophoneActive()).toBe(false);
      // Stopping microphone marks assistant speech finished
      expect(sm.isSpeaking()).toBe(false);
    });

    it('cleans up resources and records termination reason on emergency hangup', () => {
      sm.startSession('en');
      runner.startMicrophone();

      sm.terminateSession('COMPLETED', 'Call finished.', 'Staff operator initiated hangup');
      runner.stopMicrophone();

      expect(sm.getState()).toBe('COMPLETED');
      expect(runner.isMicrophoneActive()).toBe(false);

      const metrics = sm.getMetrics();
      expect(metrics.endReason).toBe('Staff operator initiated hangup');
      expect(metrics.durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it('simulates barge-in interruption cleanly without crashing state machine', () => {
      sm.startSession('en');
      runner.startMicrophone();

      expect(sm.isSpeaking()).toBe(true);
      const barge = runner.triggerBargeIn();

      expect(barge.interrupted).toBe(true);
      expect(sm.isSpeaking()).toBe(false);
      expect(barge.message).toContain('Barge-in handled');
    });

    it('handles multiple silence timeouts up to termination limit', () => {
      sm.startSession('en');
      runner.startMicrophone();

      // Turn 1 user input to move past greeting
      sm.processUserInput('Yes');

      // Silence 1: prompts user
      const silence1 = runner.triggerSilence();
      expect(silence1.shouldTerminate).toBe(false);
      expect(silence1.assistantUtterance).toContain('are you still there');

      // Silence 2: prompts user again
      const silence2 = runner.triggerSilence();
      expect(silence2.shouldTerminate).toBe(false);

      // Silence 3: terminates session
      const silence3 = runner.triggerSilence();
      expect(silence3.shouldTerminate).toBe(true);
      expect(silence3.state).toBe('TERMINATED_BOUNDED_DURATION');
    });
  });
});
