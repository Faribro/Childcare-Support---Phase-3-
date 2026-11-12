import { sanitizeLogContext } from '@/lib/server/errorLogger';

export interface DeadLetterAlertSample {
  id: string | number;
  jobType: string;
  targetSheetName: string;
  attemptCount: number;
  lastError: string | null;
  updatedAt?: string;
}

export interface DeadLetterAlertInput {
  source: string;
  requestId: string;
  deadLetteredInBatch: number;
  totalDeadLetterCount: number;
  sampleJobs?: DeadLetterAlertSample[];
  webhookUrl?: string;
}

export interface DeadLetterAlertResult {
  triggered: boolean;
  webhookDispatched: boolean;
  webhookError?: string;
}

/**
 * Emits a structured, secret-free alert log when Sheets mirror jobs enter or remain
 * in DEAD_LETTER, and optionally forwards a summary payload to DEAD_LETTER_ALERT_WEBHOOK_URL.
 */
export async function notifyDeadLetterAlert(
  input: DeadLetterAlertInput
): Promise<DeadLetterAlertResult> {
  if (input.deadLetteredInBatch <= 0 && input.totalDeadLetterCount <= 0) {
    return { triggered: false, webhookDispatched: false };
  }

  const safeSamples = (input.sampleJobs || []).slice(0, 10).map((job) => ({
    id: String(job.id),
    jobType: job.jobType,
    targetSheetName: job.targetSheetName,
    attemptCount: job.attemptCount,
    lastError: job.lastError ? String(job.lastError).slice(0, 240) : null,
    updatedAt: job.updatedAt || null,
  }));

  const alertPayload = sanitizeLogContext({
    event: 'SHEETS_MIRROR_DEAD_LETTER_ALERT',
    severity: 'CRITICAL',
    source: input.source,
    requestId: input.requestId,
    deadLetteredInBatch: input.deadLetteredInBatch,
    totalDeadLetterCount: input.totalDeadLetterCount,
    sampleJobs: safeSamples,
    timestamp: new Date().toISOString(),
  });

  console.error('[DEAD_LETTER_ALERT]', JSON.stringify(alertPayload));

  const targetWebhook = (input.webhookUrl ?? process.env.DEAD_LETTER_ALERT_WEBHOOK_URL ?? '').trim();
  if (!targetWebhook) {
    return { triggered: true, webhookDispatched: false };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(targetWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertPayload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        triggered: true,
        webhookDispatched: false,
        webhookError: `Alert webhook returned HTTP ${res.status}`,
      };
    }
    return { triggered: true, webhookDispatched: true };
  } catch (err: any) {
    return {
      triggered: true,
      webhookDispatched: false,
      webhookError: err?.message || 'Alert webhook request failed',
    };
  }
}
