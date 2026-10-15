import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { AccessToken } from 'livekit-server-sdk';
import { authorizeVoiceStaffAccess } from '@/lib/server/voiceStaffAuth';
import { logSecurityEvent } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

// Strict server-side concurrency enforcement: maximum 1 concurrent evaluation session
const MAX_CONCURRENT_EVALUATION_SESSIONS = 1;

interface ActiveEvaluationSession {
  roomName: string;
  userId: string;
  startedAt: number;
  expiresAt: number;
}

const activeSessionsMap = new Map<string, ActiveEvaluationSession>();

function pruneExpiredSessions(now: number): void {
  for (const [room, session] of activeSessionsMap.entries()) {
    if (now > session.expiresAt) {
      activeSessionsMap.delete(room);
    }
  }
}

export async function GET(req: NextRequest) {
  return handleTokenRequest(req);
}

export async function POST(req: NextRequest) {
  return handleTokenRequest(req);
}

async function handleTokenRequest(req: NextRequest) {
  const now = Date.now();
  pruneExpiredSessions(now);

  // 1. Authorize caller server-side
  const auth = authorizeVoiceStaffAccess(req);

  if (!auth.authorized) {
    logSecurityEvent({
      actor: 'anonymous',
      actorRole: 'UNVERIFIED',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      targetResource: '/api/staff/voice/token',
      details: auth.reason,
    });

    return NextResponse.json(
      { error: auth.reason },
      { status: auth.statusCode }
    );
  }

  // 2. Multi-tier Configuration & Readiness Breakdown
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;
  const sarvamKey = process.env.SARVAM_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const browserConnectionConfigured = Boolean(apiKey && apiSecret && serverUrl);
  const providerPipelineAvailable = Boolean(sarvamKey && openaiKey);
  const workerReady = browserConnectionConfigured && providerPipelineAvailable;
  // Actual audio execution requires a live WebRTC audio stream exchange; always false at token issuance
  const actualAudioSessionExecuted = false;

  const statusTiers = {
    browserConnectionConfigured,
    workerReady,
    providerPipelineAvailable,
    actualAudioSessionExecuted,
  };

  if (!browserConnectionConfigured) {
    return NextResponse.json({
      configured: false,
      status: 'NOT_CONFIGURED',
      statusTiers,
      message: 'AI/Audio Path: NOT EXECUTED (LiveKit server credentials not configured in environment)',
      requiredVariables: [
        'LIVEKIT_URL',
        'LIVEKIT_API_KEY',
        'LIVEKIT_API_SECRET',
        'SARVAM_API_KEY',
        'OPENAI_API_KEY',
      ],
      user: auth.user,
    });
  }

  // 3. Server-side Concurrency Check (Client UI button is not sufficient enforcement)
  if (activeSessionsMap.size >= MAX_CONCURRENT_EVALUATION_SESSIONS) {
    return NextResponse.json(
      {
        error: `Active evaluation session concurrency ceiling reached (${MAX_CONCURRENT_EVALUATION_SESSIONS} max). Please wait for active session to terminate.`,
        activeSessions: activeSessionsMap.size,
      },
      { status: 429 }
    );
  }

  try {
    // 4. Issue short-lived, narrowly scoped room token
    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    const roomName = `synth-eval-room-${uniqueSuffix}`;
    const identity = `staff-${auth.user?.userId || 'evaluator'}-${uniqueSuffix}`;

    // Token TTL is 10 minutes (for connection/reconnection handshake)
    // Active session duration is strictly bounded to 180 seconds in both client & worker
    const maxDurationSeconds = 180;

    const at = new AccessToken(apiKey!, apiSecret!, {
      identity,
      name: auth.user?.name || 'Staff Voice Evaluator',
      ttl: '10m',
      metadata: JSON.stringify({
        agentName: 'childcare-voice-evaluator',
        taskId: 'SYNTH-TASK-001',
        maxDurationSeconds,
      }),
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    // Register active session for concurrency ceiling enforcement
    activeSessionsMap.set(roomName, {
      roomName,
      userId: auth.user?.userId || 'unknown',
      startedAt: now,
      expiresAt: now + maxDurationSeconds * 1000,
    });

    logSecurityEvent({
      actor: auth.user?.userId || 'unknown',
      actorRole: auth.user?.role || 'UNKNOWN',
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      targetResource: `/api/staff/voice/token:${roomName}`,
      details: 'Issued short-lived LiveKit token for staff evaluation harness',
    });

    return NextResponse.json({
      configured: true,
      status: 'READY',
      statusTiers,
      serverUrl,
      roomName,
      token,
      identity,
      agentName: 'childcare-voice-evaluator',
      maxDurationSeconds,
      user: auth.user,
    });
  } catch (error: any) {
    console.error('[Voice Token Error] Token issuance failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate voice token' },
      { status: 500 }
    );
  }
}
