import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { AccessToken } from 'livekit-server-sdk';
import { authorizeVoiceStaffAccess } from '@/lib/server/voiceStaffAuth';
import { logSecurityEvent } from '@/lib/server/authorisation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleTokenRequest(req);
}

export async function POST(req: NextRequest) {
  return handleTokenRequest(req);
}

async function handleTokenRequest(req: NextRequest) {
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

  // 2. Check if LiveKit credentials are configured in server environment
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;

  const isLiveKitConfigured = Boolean(apiKey && apiSecret && serverUrl);

  if (!isLiveKitConfigured) {
    return NextResponse.json({
      configured: false,
      status: 'NOT_CONFIGURED',
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

  try {
    // 3. Issue short-lived, narrowly scoped room token
    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    const roomName = `synth-eval-room-${uniqueSuffix}`;
    const identity = `staff-${auth.user?.userId || 'evaluator'}-${uniqueSuffix}`;

    const at = new AccessToken(apiKey!, apiSecret!, {
      identity,
      name: auth.user?.name || 'Staff Voice Evaluator',
      ttl: '10m', // 10 minute ceiling for evaluation token
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

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
      serverUrl,
      roomName,
      token,
      identity,
      maxDurationSeconds: 180,
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
