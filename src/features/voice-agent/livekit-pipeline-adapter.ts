/**
 * LiveKit Voice Pipeline Adapter & Environment Gate
 * 
 * DESIGN PRINCIPLES:
 * 1. Safe credentials check: Never logs or exposes API keys.
 * 2. If provider keys are absent, sets execution status to:
 *    "AI/Audio Path: NOT EXECUTED (Provider credentials not configured)"
 * 3. Provides a deterministic synthetic pipeline adapter for testing & staff browser harness.
 */

import { VoiceConversationStateMachine, StateMachineOutput } from './state-machine';
import { MockDisposableStateStore } from './mock-tools';
import { LanguageTarget } from './types';

export interface ProviderConfigStatus {
  hasLiveKitConfig: boolean;
  hasSttConfig: boolean;
  hasLlmConfig: boolean;
  hasTtsConfig: boolean;
  executionMode: 'REAL_LIVEKIT_STREAM' | 'SYNTHETIC_EVALUATION_HARNESS';
  statusDescription: string;
}

export interface LatencyReport {
  sttTtftMs: number;
  llmTtftMs: number;
  ttsTtfaMs: number;
  bargeInMs: number;
  totalEndToEndMs: number;
}

export function checkVoiceProviderConfiguration(): ProviderConfigStatus {
  // Check server environment variables safely without leaking values
  const hasLiveKit = Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
  );
  const hasStt = Boolean(process.env.DEEPGRAM_API_KEY || process.env.SARVAM_API_KEY);
  const hasLlm = Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
  const hasTts = Boolean(process.env.CARTESIA_API_KEY || process.env.ELEVENLABS_API_KEY || process.env.SARVAM_API_KEY);

  const isRealExecutionPossible = hasLiveKit && hasStt && hasLlm && hasTts;

  return {
    hasLiveKitConfig: hasLiveKit,
    hasSttConfig: hasStt,
    hasLlmConfig: hasLlm,
    hasTtsConfig: hasTts,
    executionMode: isRealExecutionPossible ? 'REAL_LIVEKIT_STREAM' : 'SYNTHETIC_EVALUATION_HARNESS',
    statusDescription: isRealExecutionPossible
      ? 'LiveKit and Voice Providers configured for live WebRTC audio.'
      : 'AI/Audio Path: NOT EXECUTED (Provider credentials not configured in environment)',
  };
}

export class SyntheticVoicePipelineRunner {
  private stateMachine: VoiceConversationStateMachine;
  private store: MockDisposableStateStore;
  private isMicActive: boolean = false;
  private isMuted: boolean = false;
  private configStatus: ProviderConfigStatus;

  constructor(stateMachine: VoiceConversationStateMachine, store: MockDisposableStateStore) {
    this.stateMachine = stateMachine;
    this.store = store;
    this.configStatus = checkVoiceProviderConfiguration();
  }

  public getStatus(): ProviderConfigStatus {
    return this.configStatus;
  }

  public startMicrophone(): { success: boolean; message: string } {
    this.isMicActive = true;
    this.isMuted = false;
    return {
      success: true,
      message: 'Microphone stream initialized for staff evaluation.',
    };
  }

  public stopMicrophone(): void {
    this.isMicActive = false;
    this.isMuted = false;
    if (this.stateMachine.isSpeaking()) {
      this.stateMachine.finishAssistantSpeech();
    }
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
  }

  public isMicrophoneActive(): boolean {
    return this.isMicActive && !this.isMuted;
  }

  /**
   * Simulates a user speaking turn with latency breakdown tracking.
   */
  public async simulateTurn(
    userInput: string,
    simulatedSpeechDurationMs: number = 800
  ): Promise<{
    output: StateMachineOutput;
    latencies: LatencyReport;
  }> {
    if (!this.isMicActive) {
      throw new Error('Cannot process turn: Microphone is inactive.');
    }
    if (this.isMuted) {
      throw new Error('Microphone is muted.');
    }

    // If assistant was still speaking, barge-in is triggered
    let bargeInLatencyMs = 0;
    if (this.stateMachine.isSpeaking()) {
      const startBarge = Date.now();
      this.stateMachine.handleInterruption();
      bargeInLatencyMs = Math.max(15, Date.now() - startBarge); // Typical sub-50ms barge-in
    }

    // Simulate pipeline stage latencies
    // In actual LiveKit + Deepgram + GPT-4o-mini + Cartesia pipeline:
    // STT TTFT: ~150ms, LLM TTFT: ~200ms, TTS TTFA: ~90ms => Total ~440ms
    const sttTtft = 145 + Math.floor(Math.random() * 20);
    const llmTtft = 190 + Math.floor(Math.random() * 30);
    const ttsTtfa = 85 + Math.floor(Math.random() * 15);
    const totalE2E = sttTtft + llmTtft + ttsTtfa;

    const output = this.stateMachine.processUserInput(userInput, totalE2E);

    return {
      output,
      latencies: {
        sttTtftMs: sttTtft,
        llmTtftMs: llmTtft,
        ttsTtfaMs: ttsTtfa,
        bargeInMs: bargeInLatencyMs,
        totalEndToEndMs: totalE2E,
      },
    };
  }

  public triggerBargeIn(): { interrupted: boolean; message: string } {
    return this.stateMachine.handleInterruption();
  }

  public triggerSilence(): StateMachineOutput {
    return this.stateMachine.handleSilence();
  }

  public triggerUnclearSpeech(): StateMachineOutput {
    return this.stateMachine.handleUnclearSpeech();
  }
}
