/**
 * LiveKit Voice Pipeline Adapter & Synthetic Evaluation Harness
 * 
 * DESIGN PRINCIPLES:
 * 1. Server-Only Secret Boundary: Client bundle NEVER reads or verifies server-side
 *    API keys directly. Credentials status is supplied via `/api/staff/voice/token`.
 * 2. Unconfigured Fail-Safe: If provider credentials are unconfigured, status is:
 *    "AI/Audio Path: NOT EXECUTED (Provider credentials not configured in environment)"
 * 3. Provides a deterministic synthetic pipeline runner for staff testing & edge case verification.
 * 4. Simulated latencies are explicitly labeled as hypothetical/simulated.
 */

import { VoiceConversationStateMachine, StateMachineOutput } from './state-machine';
import { MockDisposableStateStore } from './mock-tools';

export interface ProviderConfigStatus {
  configured: boolean;
  hasLiveKitConfig?: boolean;
  executionMode?: 'REAL_LIVEKIT_STREAM' | 'SYNTHETIC_EVALUATION_HARNESS';
  status: 'READY' | 'NOT_CONFIGURED';
  statusDescription: string;
  requiredVariables?: string[];
  serverUrl?: string;
  token?: string;
  roomName?: string;
  identity?: string;
  maxDurationSeconds?: number;
}

export interface LatencyReport {
  sttTtftMs: number;
  llmTtftMs: number;
  ttsTtfaMs: number;
  bargeInMs: number;
  totalEndToEndMs: number;
  isSimulated: boolean;
}

/**
 * Checks server/runtime environment variables without leaking credential values.
 */
export function checkVoiceProviderConfiguration(): ProviderConfigStatus {
  const hasLiveKit = Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
  );
  const hasStt = Boolean(process.env.SARVAM_API_KEY || process.env.DEEPGRAM_API_KEY);
  const hasLlm = Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
  const hasTts = Boolean(process.env.SARVAM_API_KEY || process.env.CARTESIA_API_KEY);
  const isRealExecutionPossible = hasLiveKit && hasStt && hasLlm && hasTts;

  return {
    configured: isRealExecutionPossible,
    hasLiveKitConfig: hasLiveKit,
    executionMode: isRealExecutionPossible ? 'REAL_LIVEKIT_STREAM' : 'SYNTHETIC_EVALUATION_HARNESS',
    status: isRealExecutionPossible ? 'READY' : 'NOT_CONFIGURED',
    statusDescription: isRealExecutionPossible
      ? 'LiveKit and Voice Providers configured for live WebRTC audio.'
      : 'AI/Audio Path: NOT EXECUTED (Provider credentials not configured in environment)',
    requiredVariables: [
      'LIVEKIT_URL',
      'LIVEKIT_API_KEY',
      'LIVEKIT_API_SECRET',
      'SARVAM_API_KEY',
      'OPENAI_API_KEY',
    ],
  };
}

export interface VoiceSessionReservation {
  success: boolean;
  configured: boolean;
  serverUrl?: string;
  token?: string;
  roomName?: string;
  identity?: string;
  agentName?: string;
  maxDurationSeconds?: number;
  error?: string;
  statusCode?: number;
}

/**
 * Fetches token and configuration status from the authorized server-side endpoint.
 * Zero secrets or API keys are exposed to the browser.
 * Calling GET does NOT reserve a session and does NOT consume concurrency capacity.
 */
export async function fetchVoiceTokenStatus(): Promise<ProviderConfigStatus> {
  try {
    const res = await fetch('/api/staff/voice/token', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        configured: false,
        status: 'NOT_CONFIGURED',
        statusDescription: err.error || `HTTP ${res.status}: Access unauthorized`,
      };
    }

    const data = await res.json();
    return {
      configured: Boolean(data.configured),
      hasLiveKitConfig: Boolean(data.configured),
      executionMode: data.configured ? 'REAL_LIVEKIT_STREAM' : 'SYNTHETIC_EVALUATION_HARNESS',
      status: data.status || (data.configured ? 'READY' : 'NOT_CONFIGURED'),
      statusDescription: data.message || (data.configured ? 'LiveKit Server Ready' : 'AI/Audio Path: NOT EXECUTED'),
      requiredVariables: data.requiredVariables,
    };
  } catch (e: any) {
    return {
      configured: false,
      hasLiveKitConfig: false,
      executionMode: 'SYNTHETIC_EVALUATION_HARNESS',
      status: 'NOT_CONFIGURED',
      statusDescription: `Connection error: ${e?.message || 'Failed to reach token endpoint'}`,
    };
  }
}

/**
 * Explicitly reserves an evaluation session and requests a short-lived token via POST.
 */
export async function requestVoiceSessionToken(): Promise<VoiceSessionReservation> {
  try {
    const res = await fetch('/api/staff/voice/token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        configured: false,
        error: data.error || `HTTP ${res.status}: Request failed`,
        statusCode: res.status,
      };
    }

    return {
      success: Boolean(data.configured && data.token),
      configured: Boolean(data.configured),
      serverUrl: data.serverUrl,
      token: data.token,
      roomName: data.roomName,
      identity: data.identity,
      agentName: data.agentName,
      maxDurationSeconds: data.maxDurationSeconds || 180,
    };
  } catch (e: any) {
    return {
      success: false,
      configured: false,
      error: `Network error: ${e?.message || 'Failed to request token'}`,
      statusCode: 500,
    };
  }
}

/**
 * Explicitly releases an active evaluation session reservation via DELETE.
 */
export async function releaseVoiceSessionReservation(roomName: string): Promise<boolean> {
  if (!roomName) return false;
  try {
    const res = await fetch(`/api/staff/voice/token?roomName=${encodeURIComponent(roomName)}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
      },
    });
    return res.ok;
  } catch (e) {
    console.warn('[VoiceAdapter] Failed to release session reservation:', e);
    return false;
  }
}

export class SyntheticVoicePipelineRunner {
  private stateMachine: VoiceConversationStateMachine;
  private store: MockDisposableStateStore;
  private isMicActive: boolean = false;
  private isMuted: boolean = false;

  constructor(stateMachine: VoiceConversationStateMachine, store: MockDisposableStateStore) {
    this.stateMachine = stateMachine;
    this.store = store;
  }

  public startMicrophone(): { success: boolean; message: string } {
    this.isMicActive = true;
    this.isMuted = false;
    return {
      success: true,
      message: 'Synthetic evaluation microphone stream initialized for staff.',
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
   * Simulates a user speaking turn with hypothetical latency breakdown tracking.
   * NOTE: Latencies are synthetic/simulated estimates based on published provider benchmarks,
   * NOT measured hardware or network audio streams.
   */
  public async simulateTurn(
    userInput: string
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
      bargeInLatencyMs = Math.max(15, Date.now() - startBarge);
    }

    // Simulated benchmark targets (Hypothetical/Simulated):
    // Sarvam STT: ~180ms, GPT-4o-mini LLM TTFT: ~210ms, Sarvam TTS TTFA: ~190ms => Total ~580ms
    const sttTtft = 180 + Math.floor(Math.random() * 20);
    const llmTtft = 210 + Math.floor(Math.random() * 25);
    const ttsTtfa = 190 + Math.floor(Math.random() * 20);
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
        isSimulated: true,
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
