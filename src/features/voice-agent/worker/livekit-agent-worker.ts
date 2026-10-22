/**
 * LiveKit Real-Audio Calling-Agent Worker
 * 
 * INSTALLED DEPENDENCIES (Pinned & Synchronized):
 * - @livekit/agents: 1.9.3
 * - @livekit/agents-plugin-sarvam: 1.9.3 (STT model: 'saaras:v3', TTS model: 'bulbul:v2')
 * - @livekit/agents-plugin-openai: 1.9.3 (LLM model: 'gpt-4o-mini')
 * - @livekit/agents-plugin-silero: 1.9.3 (VAD: Silero)
 */

import { fileURLToPath } from 'node:url';
import { defineAgent, JobContext, ServerOptions, cli, voice } from '@livekit/agents';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import {
  FIXED_SYNTHETIC_TASK,
  FIXED_DOCUMENT_FOLLOWUP_TASK,
  MockDisposableStateStore,
} from '../mock-tools';
import { VoiceConversationStateMachine } from '../state-machine';

export const SYNTHETIC_SYSTEM_PROMPT = `
You are an automated programme assistant conducting a synthetic staff-only evaluation call.
Scenario: A staff-created follow-up task needs assistance (Task ID: ${FIXED_SYNTHETIC_TASK.taskId}).

MANDATORY BEHAVIORAL PROTOCOLS:
1. ALWAYS identify yourself as an "automated programme assistant". NEVER claim or imply you are a human staff member, doctor, or nurse.
2. In the first turn, verify if this is a convenient and private time to speak.
3. If the user indicates "stop", "wrong number", "not a good time", or "call later", acknowledge politely, respect their preference immediately, and end the call.
4. Support English, Hindi, and natural Hinglish switching according to the user's spoken language.
5. If the user asks for a human staff member, record a mock callback and gracefully conclude.
6. Whenever confirming an action, you MUST state: "This is a test; no real callback or staff notification was created."

CRITICAL CONFIDENTIALITY & SAFETY PROHIBITIONS:
- NEVER mention HIV status, clinical results, antiretroviral therapy (ART), or any sensitive medical diagnosis.
- NEVER request Aadhaar numbers, bank account numbers, UPI IDs, credit/debit card numbers, OTPs, or payments of any kind.
- NEVER offer medical advice or diagnosis.
- Keep responses short, concise, and conversational (under 2 sentences per turn).
`.trim();

export interface MissingCredentialsCheckResult {
  isConfigured: boolean;
  isOfflineSimulation?: boolean;
  missingVariables: string[];
}

/**
 * Checks whether offline worker simulation mode is enabled.
 * 
 * SAFETY GATING:
 * - Strictly disabled in production (NODE_ENV === 'production').
 * - Requires explicit environment flag: VOICE_WORKER_OFFLINE_MODE === 'true'.
 */
export function isOfflineWorkerModeEnabled(): boolean {
  const isNonProduction = process.env.NODE_ENV !== 'production';
  return isNonProduction && process.env.VOICE_WORKER_OFFLINE_MODE === 'true';
}

export function checkWorkerCredentials(): MissingCredentialsCheckResult {
  if (isOfflineWorkerModeEnabled()) {
    return {
      isConfigured: true,
      isOfflineSimulation: true,
      missingVariables: [],
    };
  }

  const required = [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'SARVAM_API_KEY',
    'OPENAI_API_KEY',
  ];
  const missing = required.filter((v) => !process.env[v] || process.env[v]!.trim() === '');
  return {
    isConfigured: missing.length === 0,
    isOfflineSimulation: false,
    missingVariables: missing,
  };
}

export interface WorkerAcknowledgmentPayload {
  serverBaseUrl?: string;
  roomName: string;
  workerSessionId: string;
  reservationSecret: string;
  status: 'STARTED' | 'CLEANUP_REQUESTED' | 'CLEANUP_COMPLETED' | 'CLEANUP_FAILED_OR_UNCERTAIN';
  details?: string;
}

export async function postWorkerAcknowledgment(
  params: WorkerAcknowledgmentPayload
): Promise<boolean> {
  const url = `${params.serverBaseUrl || 'http://127.0.0.1:3000'}/api/staff/voice/worker-acknowledgment`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Agent Worker] Failed to post worker acknowledgment to server:', err);
    return false;
  }
}

export interface OfflineJobSimulationOptions {
  roomName: string;
  workerSessionId: string;
  reservationSecret: string;
  durationSeconds?: number;
  serverBaseUrl?: string;
  simulateFailure?: boolean;
}

export interface OfflineJobSimulationResult {
  success: boolean;
  status: 'COMPLETED' | 'FAILED';
  turnsSimulated: number;
  acknowledged: boolean;
}

/**
 * Runs an in-process offline synthetic worker job simulation without external networks or providers.
 * Non-production gated.
 */
export async function runOfflineWorkerJobSimulation(
  options: OfflineJobSimulationOptions
): Promise<OfflineJobSimulationResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Offline worker simulation is strictly prohibited in production environment.');
  }

  const { roomName, workerSessionId, reservationSecret, serverBaseUrl, simulateFailure } = options;

  console.info(`[Offline Worker] Starting offline job simulation for room: ${roomName} (session: ${workerSessionId})`);

  // 1. Report connection acknowledgment to server
  let ackStarted = false;
  if (reservationSecret) {
    ackStarted = await postWorkerAcknowledgment({
      serverBaseUrl,
      roomName,
      workerSessionId,
      reservationSecret,
      status: 'STARTED',
    });
  }

  // 2. Simulate conversation lifecycle with mock tools
  const store = new MockDisposableStateStore();
  const sm = new VoiceConversationStateMachine(
    store,
    {},
    FIXED_DOCUMENT_FOLLOWUP_TASK
  );

  sm.startSession('en');
  let turnsCount = 1;

  // Turn 1: User provides consent
  sm.processUserInput('Yes, go ahead.');
  turnsCount++;

  // Turn 2: User agrees to WhatsApp upload link
  sm.processUserInput('Yes, please send the link on WhatsApp.');
  turnsCount++;

  // 3. Handle simulated teardown
  if (simulateFailure) {
    console.warn('[Offline Worker] Simulating teardown failure for test verification.');
    const ackFailed = await postWorkerAcknowledgment({
      serverBaseUrl,
      roomName,
      workerSessionId,
      reservationSecret,
      status: 'CLEANUP_FAILED_OR_UNCERTAIN',
      details: 'Simulated worker audio stream failure during offline test',
    });
    return {
      success: false,
      status: 'FAILED',
      turnsSimulated: turnsCount,
      acknowledged: ackFailed,
    };
  }

  // Normal successful cleanup
  const ackCompleted = await postWorkerAcknowledgment({
    serverBaseUrl,
    roomName,
    workerSessionId,
    reservationSecret,
    status: 'CLEANUP_COMPLETED',
    details: 'Offline synthetic session completed and cleaned up cleanly',
  });

  console.info(`[Offline Worker] Successfully cleaned up offline job for room: ${roomName}`);
  return {
    success: true,
    status: 'COMPLETED',
    turnsSimulated: turnsCount,
    acknowledged: ackCompleted,
  };
}

/**
 * Defines the real LiveKit Voice Agent entrypoint.
 */
import { RoomEvent } from '@livekit/rtc-node';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // 1. Enforce worker-level credential validation
    const creds = checkWorkerCredentials();
    if (!creds.isConfigured) {
      console.error(
        `[Agent Worker Error] Missing required provider credentials: ${creds.missingVariables.join(', ')}`
      );
      throw new Error(
        `Worker cannot start voice pipeline: Missing credentials: ${creds.missingVariables.join(', ')}`
      );
    }

    // Parse dispatch metadata if present
    let workerSessionId = `worker-${ctx.room.name}`;
    let reservationSecret = '';
    try {
      if (ctx.job && ctx.job.metadata) {
        const parsed = JSON.parse(ctx.job.metadata);
        if (parsed.workerSessionId) workerSessionId = parsed.workerSessionId;
        if (parsed.reservationSecret) reservationSecret = parsed.reservationSecret;
      }
    } catch {
      // Non-JSON or missing metadata
    }

    // Offline simulation branch: bypasses live Sarvam/OpenAI providers while preserving room/job lifecycle
    if (creds.isOfflineSimulation) {
      console.info(`[Agent Worker - Offline Mode] Accepting dispatched job without external providers for room: ${ctx.room.name}`);
      await ctx.connect();

      if (reservationSecret) {
        await postWorkerAcknowledgment({
          roomName: ctx.room.name || 'unnamed-room',
          workerSessionId,
          reservationSecret,
          status: 'STARTED',
        });
      }

      const reportTeardown = async (status: 'CLEANUP_COMPLETED' | 'CLEANUP_FAILED_OR_UNCERTAIN', details?: string) => {
        if (!reservationSecret) return;
        await postWorkerAcknowledgment({
          roomName: ctx.room.name || 'unnamed-room',
          workerSessionId,
          reservationSecret,
          status,
          details,
        });
      };

      ctx.room.on(RoomEvent.Disconnected, async () => {
        console.info('[Agent Worker - Offline Mode] Room disconnected. Reporting teardown acknowledgment.');
        await reportTeardown('CLEANUP_COMPLETED', 'Offline room disconnected cleanly');
      });

      return;
    }

    console.info(`[Agent Worker] Connecting to room: ${ctx.room.name} (workerSessionId: ${workerSessionId})`);
    await ctx.connect();

    // Report connection acknowledgment
    if (reservationSecret) {
      await postWorkerAcknowledgment({
        roomName: ctx.room.name || 'unnamed-room',
        workerSessionId,
        reservationSecret,
        status: 'STARTED',
      });
    }

    // 2. Initialize exact selected models
    const stt = new sarvam.STT({
      model: 'saaras:v3',
      languageCode: 'hi-IN',
      mode: 'codemix',
    });

    const llm = new openai.LLM({
      model: 'gpt-4o-mini',
      temperature: 0.3,
    });

    const tts = new sarvam.TTS({
      model: 'bulbul:v2',
      speaker: 'anushka',
      targetLanguageCode: 'hi-IN',
    });

    const vad = await silero.VAD.load();

    // 3. Construct AgentSession and Voice Agent
    const session = new voice.AgentSession({
      stt,
      llm,
      tts,
      vad,
      maxToolSteps: 3,
    });

    const agent = new voice.Agent({
      instructions: SYNTHETIC_SYSTEM_PROMPT,
    });

    // 4. Set up server-enforced session duration timeout (180 seconds hard ceiling)
    // Token expiry (e.g. 10m) does NOT sever an active WebRTC session; explicit cutoff is required.
    const maxDurationSeconds = 180;
    const sessionTimer = setTimeout(async () => {
      console.info(
        `[Agent Worker] Session duration ceiling reached (${maxDurationSeconds}s). Closing provider session.`
      );
      try {
        // Explicitly close provider sessions (Sarvam STT/TTS streams, OpenAI LLM, Silero VAD)
        await session.close();
      } catch (err) {
        console.warn('[Agent Worker] Error during session.close():', err);
      }
      // Disconnect agent participant from room.
      // NOTE: In LiveKit, ctx.room.disconnect() disconnects ONLY this agent participant.
      // It does NOT forcibly disconnect browser participants or delete the room unless
      // RoomServiceClient.deleteRoom() is executed by a server administrative API.
      ctx.room.disconnect();
    }, maxDurationSeconds * 1000);

    let teardownAcknowledged = false;
    const reportTeardown = async (status: 'CLEANUP_COMPLETED' | 'CLEANUP_FAILED_OR_UNCERTAIN', details?: string) => {
      if (teardownAcknowledged || !reservationSecret) return;
      teardownAcknowledged = true;
      await postWorkerAcknowledgment({
        roomName: ctx.room.name || 'unnamed-room',
        workerSessionId,
        reservationSecret,
        status,
        details,
      });
    };

    // Clean up timer when session closes
    session.on(voice.AgentSessionEventTypes.Close, async () => {
      clearTimeout(sessionTimer);
      console.info('[Agent Worker] Session closed. Cleaned up duration timers.');
      await reportTeardown('CLEANUP_COMPLETED', 'Session closed normally');
    });

    // Ensure session teardown when room disconnects
    ctx.room.on(RoomEvent.Disconnected, async () => {
      clearTimeout(sessionTimer);
      console.info('[Agent Worker] Room disconnected. Ensuring provider session is closed.');
      try {
        await session.close();
        await reportTeardown('CLEANUP_COMPLETED', 'Room disconnected; session closed');
      } catch (err: any) {
        await reportTeardown('CLEANUP_FAILED_OR_UNCERTAIN', err?.message || 'Error during room disconnect teardown');
      }
    });

    // 5. Start session bound to room
    await session.start({
      agent,
      room: ctx.room,
    });

    // 6. Trigger initial assistant greeting
    session.say(
      'Namaste, I am an automated programme assistant calling regarding a pending follow-up task. Is this a convenient and private time to speak?'
    );
  },
  onSessionEnd: () => {
    console.info('[Agent Worker] Lifecycle onSessionEnd: Completed room evaluation.');
  },
});

/**
 * Worker CLI entry point.
 * 
 * Execution Modes:
 * - Development:   `npx tsx src/features/voice-agent/worker/livekit-agent-worker.ts dev`
 * - Production:    `npx tsx src/features/voice-agent/worker/livekit-agent-worker.ts start`
 * - Startup Check: `npx tsx src/features/voice-agent/worker/livekit-agent-worker.ts check`
 * - Offline Sim:   `npx tsx src/features/voice-agent/worker/livekit-agent-worker.ts simulate`
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2];

  if (command === 'check' || command === '--check') {
    const check = checkWorkerCredentials();
    console.log(JSON.stringify({
      status: check.isOfflineSimulation
        ? 'READY_OFFLINE_SIMULATION'
        : check.isConfigured
          ? 'READY'
          : 'CREDENTIALS_MISSING',
      isConfigured: check.isConfigured,
      isOfflineSimulation: check.isOfflineSimulation,
      missingVariables: check.missingVariables,
      installedVersions: {
        '@livekit/agents': '1.9.3',
        '@livekit/agents-plugin-sarvam': '1.9.3',
        '@livekit/agents-plugin-openai': '1.9.3',
        '@livekit/agents-plugin-silero': '1.9.3',
      },
      selectedModels: {
        stt: 'saaras:v3 (hi-IN, codemix)',
        llm: 'gpt-4o-mini',
        tts: 'bulbul:v2 (anushka, hi-IN)',
        vad: 'silero',
      },
    }, null, 2));
    process.exit(check.isConfigured ? 0 : 2);
  }

  if (command === 'simulate' || command === 'offline') {
    const roomName = process.env.VOICE_ROOM_NAME || 'sim-room-offline';
    const workerSessionId = process.env.VOICE_WORKER_SESSION_ID || `offline-${Date.now()}`;
    const reservationSecret = process.env.VOICE_RESERVATION_SECRET || 'offline-secret';
    const simulateFailure = process.argv.includes('--fail') || process.argv.includes('--simulate-failure');

    console.log(`[Agent Worker CLI] Initiating offline synthetic audio simulation...`);
    runOfflineWorkerJobSimulation({
      roomName,
      workerSessionId,
      reservationSecret,
      simulateFailure,
    })
      .then((res) => {
        console.log(JSON.stringify(res, null, 2));
        process.exit(res.success ? 0 : 1);
      })
      .catch((err) => {
        console.error('[Agent Worker CLI] Simulation error:', err);
        process.exit(1);
      });
  } else {
    cli.runApp(
      new ServerOptions({
        agent: fileURLToPath(import.meta.url),
        agentName: 'childcare-voice-evaluator',
      })
    );
  }
}

