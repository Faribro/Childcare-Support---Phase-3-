import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { AccessToken, RoomConfiguration, RoomAgentDispatch } from 'livekit-server-sdk';
import { authorizeVoiceStaffAccess } from '@/lib/server/voiceStaffAuth';
import { logSecurityEvent } from '@/lib/server/authorisation';
import {
  MAX_CONCURRENT_EVALUATION_SESSIONS,
  getActiveSessionsCount,
  isSessionSlotAvailable,
  reserveEvaluationSession,
  releaseEvaluationSession,
} from '@/lib/server/voiceSessionRegistry';

export const dynamic = 'force-dynamic';

/**
 * GET: Read-only configuration and readiness check.
 * 
 * CRITICAL LIFECYCLE SEPARATION:
 * Calling GET checks readiness and active session count.
 * It DOES NOT issue a room token and DOES NOT reserve a session slot.
 * Page mount or status poll does not consume session capacity.
 */
export async function GET(req: NextRequest) {
  const auth =  authorizeVoiceStaffAccess(req);
  if (!auth.authorized) {
    logSecurityEvent({
      actor: 'anonymous',
      actorRole: 'UNVERIFIED',
      eventType: 'ACCESS_DENIED',
      outcome: 'DENY',
      targetResource: '/api/staff/voice/token',
      details: auth.reason,
    });
    return NextResponse.json({ error: auth.reason }, { status: auth.statusCode });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;
  const sarvamKey = process.env.SARVAM_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const browserConnectionConfigured = Boolean(apiKey && apiSecret && serverUrl);
  const providerPipelineAvailable = Boolean(sarvamKey && openaiKey);
  const workerReady = browserConnectionConfigured && providerPipelineAvailable;
  const actualAudioSessionExecuted = false;

  const statusTiers = {
    browserConnectionConfigured,
    workerReady,
    providerPipelineAvailable,
    actualAudioSessionExecuted,
  };

  const activeCount = getActiveSessionsCount();

  return NextResponse.json({
    configured: browserConnectionConfigured,
    status: browserConnectionConfigured ? 'READY' : 'NOT_CONFIGURED',
    statusTiers,
    activeSessions: activeCount,
    maxConcurrentSessions: MAX_CONCURRENT_EVALUATION_SESSIONS,
    concurrencyAvailable: isSessionSlotAvailable(),
    message: browserConnectionConfigured
      ? 'LiveKit server configured and ready for evaluation session reservation.'
      : 'AI/Audio Path: NOT EXECUTED (LiveKit server credentials not configured in environment)',
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

/**
 * POST: Reserve an evaluation session and issue a short-lived LiveKit room token.
 * 
 * DISPATCH CONTRACT:
 * Uses explicit `RoomConfiguration.agents` with `RoomAgentDispatch`.
 * Token claims embed top-level `roomConfig.agents[0].agentName = 'childcare-voice-evaluator'`.
 * Plain participant/room metadata containing agentName is NOT used for dispatch.
 * Every session uses a fresh, uniquely generated room name.
 */
export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: auth.reason }, { status: auth.statusCode });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;
  const sarvamKey = process.env.SARVAM_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const browserConnectionConfigured = Boolean(apiKey && apiSecret && serverUrl);
  const providerPipelineAvailable = Boolean(sarvamKey && openaiKey);
  const workerReady = browserConnectionConfigured && providerPipelineAvailable;
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

  // Generate fresh room name per evaluation session
  const uniqueSuffix = crypto.randomBytes(4).toString('hex');
  const roomName = `synth-eval-room-${uniqueSuffix}`;
  const identity = `staff-${auth.user?.userId || 'evaluator'}-${uniqueSuffix}`;
  const maxDurationSeconds = 180;

  // Enforce single-process concurrency reservation
  const reservation = reserveEvaluationSession(
    roomName,
    auth.user?.userId || 'unknown',
    maxDurationSeconds
  );

  if (!reservation.success) {
    return NextResponse.json(
      {
        error: reservation.error,
        activeSessions: getActiveSessionsCount(),
      },
      { status: 429 }
    );
  }

  try {
    const at = new AccessToken(apiKey!, apiSecret!, {
      identity,
      name: auth.user?.name || 'Staff Voice Evaluator',
      ttl: '10m',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    // Exact token configuration using RoomConfiguration.agents with RoomAgentDispatch
    // Matches worker registration name: 'childcare-voice-evaluator'
    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: 'childcare-voice-evaluator',
        }),
      ],
    });

    const token = await at.toJwt();

    logSecurityEvent({
      actor: auth.user?.userId || 'unknown',
      actorRole: auth.user?.role || 'UNKNOWN',
      eventType: 'AUTH_SUCCESS',
      outcome: 'ALLOW',
      targetResource: `/api/staff/voice/token:${roomName}`,
      details: 'Issued short-lived LiveKit token with RoomAgentDispatch for staff evaluation harness',
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
    // If token generation throws, release the reserved slot immediately
    releaseEvaluationSession(roomName);
    console.error('[Voice Token Error] Token issuance failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate voice token' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Explicitly release an active session reservation.
 * 
 * Called when an evaluation session disconnects, cancels, fails on startup, or unmounts.
 */
export async function DELETE(req: NextRequest) {
  const auth = authorizeVoiceStaffAccess(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: auth.statusCode });
  }

  let roomName: string | null = req.nextUrl.searchParams.get('roomName');
  if (!roomName) {
    try {
      const body = await req.json();
      roomName = body?.roomName || null;
    } catch {
      // Body not present or invalid JSON
    }
  }

  if (roomName) {
    const released = releaseEvaluationSession(roomName);

    if (released) {
      logSecurityEvent({
        actor: auth.user?.userId || 'unknown',
        actorRole: auth.user?.role || 'UNKNOWN',
        eventType: 'AUTH_SUCCESS',
        outcome: 'ALLOW',
        targetResource: `/api/staff/voice/token:${roomName}`,
        details: 'Explicitly released evaluation session reservation',
      });
    }

    return NextResponse.json({
      released,
      roomName,
      activeSessions: getActiveSessionsCount(),
    });
  }

  return NextResponse.json({
    released: false,
    message: 'Missing roomName parameter',
    activeSessions: getActiveSessionsCount(),
  });
}
