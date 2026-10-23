import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessScope, validateMutationOrigin, logSecurityEvent } from '@/lib/server/authorisation';
import { getOnboardingStore } from '@/lib/server/onboardingStore';
import { sendAdminPendingRegistrationEmail } from '@/lib/server/emailProvider';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

  // 1. Authorize: Either authenticated admin/leadership session or authorized dispatch secret
  let isAuthorized = false;
  let actor = 'unknown';
  let actorRole = 'UNKNOWN';

  const dispatchSecretHeader = req.headers.get('x-dispatch-secret');
  const validSecret = process.env.APPS_SCRIPT_DISPATCH_SECRET || process.env.WEBHOOK_SECRET;

  if (dispatchSecretHeader && validSecret && dispatchSecretHeader === validSecret) {
    isAuthorized = true;
    actor = 'service-dispatch';
    actorRole = 'ADMIN';
  } else {
    // Check user session and CSRF
    const originCheck = validateMutationOrigin(req);
    if (!originCheck.valid) {
      logSecurityEvent({
        actor: 'unknown',
        actorRole: 'UNKNOWN',
        eventType: 'ACCESS_DENIED',
        outcome: 'DENY',
        ip: clientIp,
        details: `CSRF check failed: ${originCheck.reason}`,
      });
      return NextResponse.json(
        { status: 'error', error: 'Forbidden request origin.' },
        { status: 403 }
      );
    }

    const scope = await resolveUserAccessScope(req);
    if (scope.isVerified && (scope.role === 'ADMIN' || scope.role === 'LEADERSHIP')) {
      isAuthorized = true;
      actor = scope.userId || 'admin-user';
      actorRole = scope.role;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { status: 'error', error: 'Forbidden: Administrator privileges required.' },
      { status: 403 }
    );
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ status: 'error', error: 'Registration ID is required.' }, { status: 400 });
  }

  const store = getOnboardingStore();
  const registration = await store.getStateTeamRegistrationById(id);

  if (!registration) {
    return NextResponse.json({ status: 'error', error: 'Registration record not found.' }, { status: 404 });
  }

  let notesObj: any = {};
  try {
    if (registration.notes) notesObj = JSON.parse(registration.notes);
  } catch {
    notesObj = { text: registration.notes };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://childcare-support-phase-3.vercel.app';
  const reviewUrl = `${appUrl}/supervisor/registrations?id=${registration.id}`;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'fsayyed@allianceindia.org';
  const applicantName = `${registration.firstName} ${registration.lastName}`.trim();
  const verifiedAtIso = registration.emailVerified
    ? new Date(registration.updatedAt || registration.createdAt).toISOString()
    : new Date().toISOString();

  const notifyRes = await sendAdminPendingRegistrationEmail({
    adminEmail,
    applicantName,
    applicantEmail: registration.workEmail,
    organization: registration.organization,
    requestedState: registration.requestedState,
    verifiedAtIso,
    reviewUrl,
    registrationId: registration.id,
  });

  const sendTimestamp = new Date().toISOString();

  if (notifyRes.success) {
    notesObj.adminNotifiedAt = sendTimestamp;
    notesObj.adminNotificationRecipient = adminEmail;
    notesObj.adminNotificationProvider = notifyRes.provider;
    notesObj.adminNotificationMessageId = notifyRes.messageId || null;
    notesObj.adminNotificationStatus = 'ACCEPTED';
    delete notesObj.adminNotificationError;
    await store.updateRegistrationNotes(registration.id, JSON.stringify(notesObj));

    logSecurityEvent({
      actor,
      actorRole,
      eventType: 'RECORD_MODIFIED',
      outcome: 'ALLOW',
      ip: clientIp,
      scope: registration.requestedState,
      details: `Dispatched admin pending approval email to ${adminEmail} for applicant ${registration.workEmail}`,
    });

    return NextResponse.json({
      status: 'success',
      data: {
        providerAccepted: true,
        sendTimestamp,
        recipient: adminEmail,
        reviewUrl,
        provider: notifyRes.provider,
        messageId: notifyRes.messageId || null,
        registrationId: registration.id,
        applicant: {
          name: applicantName,
          email: registration.workEmail,
          state: registration.requestedState,
          organization: registration.organization,
        },
      },
    });
  } else {
    notesObj.adminNotificationError = notifyRes.error || 'Provider rejected notification dispatch';
    notesObj.adminNotificationLastAttemptAt = sendTimestamp;
    notesObj.adminNotificationStatus = 'FAILED';
    await store.updateRegistrationNotes(registration.id, JSON.stringify(notesObj));

    return NextResponse.json(
      {
        status: 'error',
        error: notifyRes.error || 'Failed to dispatch notification via email provider.',
        data: {
          providerAccepted: false,
          lastAttemptAt: sendTimestamp,
          registrationId: registration.id,
        },
      },
      { status: 502 }
    );
  }
}
