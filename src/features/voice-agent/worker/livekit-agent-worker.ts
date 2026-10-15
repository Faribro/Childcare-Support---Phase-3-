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
import { FIXED_SYNTHETIC_TASK } from '../mock-tools';

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
  missingVariables: string[];
}

export function checkWorkerCredentials(): MissingCredentialsCheckResult {
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
    missingVariables: missing,
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

    console.info(`[Agent Worker] Connecting to room: ${ctx.room.name}`);
    await ctx.connect();

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

    // Clean up timer when session closes
    session.on(voice.AgentSessionEventTypes.Close, () => {
      clearTimeout(sessionTimer);
      console.info('[Agent Worker] Session closed. Cleaned up duration timers.');
    });

    // Ensure session teardown when room disconnects
    ctx.room.on(RoomEvent.Disconnected, async () => {
      clearTimeout(sessionTimer);
      console.info('[Agent Worker] Room disconnected. Ensuring provider session is closed.');
      try {
        await session.close();
      } catch {
        // Session already closed
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
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2];

  if (command === 'check' || command === '--check') {
    const check = checkWorkerCredentials();
    console.log(JSON.stringify({
      status: check.isConfigured ? 'READY' : 'CREDENTIALS_MISSING',
      isConfigured: check.isConfigured,
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

  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: 'childcare-voice-evaluator',
    })
  );
}
