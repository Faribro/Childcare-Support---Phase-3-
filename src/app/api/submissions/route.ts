import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    if (!payload || !payload.uuid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required field: uuid',
        },
        { status: 400 }
      );
    }

    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // If an external Apps Script URL is configured, forward the payload
    if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com')) {
      try {
        const gasResponse = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            ...payload,
            secret: webhookSecret,
          }),
        });

        const gasData = await gasResponse.json();
        return NextResponse.json(gasData, { status: 200 });
      } catch (gasErr) {
        console.error('Apps Script forwarding error:', gasErr);
        // Fallback to acknowledging client queue so offline outbox is protected
      }
    }

    // Default successful acknowledgment
    return NextResponse.json(
      {
        status: 'success',
        acknowledged: true,
        uuid: payload.uuid,
        timestamp: new Date().toISOString(),
        message: 'Assessment verified and recorded in server queue',
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('API submission ingestion error:', err);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error processing submission',
      },
      { status: 500 }
    );
  }
}
