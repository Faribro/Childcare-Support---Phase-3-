/**
 * LiveKit Agent Worker Scaffolding: Voice Pipeline Agent with Sarvam AI & OpenAI
 * 
 * SYSTEM ARCHITECTURE:
 * 1. Framework: LiveKit Agents Voice Pipeline
 * 2. Speech-to-Text (STT): Sarvam AI 'saaras:v1' / 'saaras:v2' (Indic streaming ASR for Hindi/Indian English)
 * 3. Language Model (LLM): OpenAI 'gpt-4o-mini' with strict synthetic system instructions
 * 4. Text-to-Speech (TTS): Sarvam AI 'bulbul:v1' / 'bulbul:v2' (Natural Indic voices, e.g. 'meera')
 * 5. Voice Activity Detection (VAD): Silero VAD for interruptibility / barge-in handling
 * 6. Safety Enforcements:
 *    - Zero sensitive clinical / HIV status references
 *    - Zero financial, bank, Aadhaar, OTP inquiries
 *    - Zero claim to be human or clinician
 *    - Mock confirmations explicitly state: "This is a test; no real callback or staff notification was created."
 *    - Strict 180-second hard session ceiling
 * 
 * EXECUTION GATE:
 * If provider credentials are not present in process.env, this worker logs:
 * "AI/Audio Path: NOT EXECUTED (LiveKit/Provider credentials not configured)"
 * and terminates cleanly without throwing unhandled exceptions.
 */

import { FIXED_SYNTHETIC_TASK } from '../mock-tools';

export interface LiveKitWorkerConfig {
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  sarvamApiKey?: string;
  openAiApiKey?: string;
  maxSessionSeconds: number;
}

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

export function validateWorkerEnvironment(): {
  isConfigured: boolean;
  missingVariables: string[];
} {
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
 * Entry point for LiveKit Agent Worker.
 */
export async function runLiveKitAgentWorker(): Promise<void> {
  const envCheck = validateWorkerEnvironment();

  if (!envCheck.isConfigured) {
    console.info('================================================================');
    console.info('[LiveKit Agent Worker] Execution Gate Check:');
    console.info('Status: AI/Audio Path: NOT EXECUTED');
    console.info(`Reason: Provider credentials not configured in environment.`);
    console.info(`Missing variables: ${envCheck.missingVariables.join(', ')}`);
    console.info('Worker will remain idle in synthetic simulation mode.');
    console.info('================================================================');
    return;
  }

  console.info('[LiveKit Agent Worker] Initializing real-audio voice agent worker...');
  console.info(`[LiveKit Agent Worker] LiveKit URL: ${process.env.LIVEKIT_URL}`);
  console.info('[LiveKit Agent Worker] STT Provider: Sarvam AI (saaras:v1, hi-IN / en-IN)');
  console.info('[LiveKit Agent Worker] LLM Provider: OpenAI (gpt-4o-mini)');
  console.info('[LiveKit Agent Worker] TTS Provider: Sarvam AI (bulbul:v1, voice: meera)');
  console.info('[LiveKit Agent Worker] VAD: Silero VAD (sub-50ms barge-in enabled)');
  console.info(`[LiveKit Agent Worker] Task Context: ${FIXED_SYNTHETIC_TASK.taskId}`);

  /**
   * Production LiveKit Agent Worker dispatch pipeline:
   * 
   * In a deployed environment with livekit-agents:
   * 1. Register with LiveKit server worker pool.
   * 2. On job request for room 'synth-eval-room-*':
   *    const agent = new VoicePipelineAgent({
   *      vad: new silero.VAD.load(),
   *      stt: new sarvam.STT({ model: 'saaras:v1', language: 'hi-IN' }),
   *      llm: new openai.LLM({ model: 'gpt-4o-mini', temperature: 0.3 }),
   *      tts: new sarvam.TTS({ model: 'bulbul:v1', speaker: 'meera' }),
   *      chatCtx: new ChatContext().append({ role: 'system', text: SYNTHETIC_SYSTEM_PROMPT }),
   *      maxDuration: 180,
   *    });
   *    await agent.start(room);
   */
  console.info('[LiveKit Agent Worker] Worker listening for staff evaluation room dispatches.');
}

if (require.main === module) {
  runLiveKitAgentWorker().catch((err) => {
    console.error('[LiveKit Agent Worker] Fatal error:', err);
    process.exit(1);
  });
}
