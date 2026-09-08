import { NextRequest, NextResponse } from 'next/server';
import { patchSubmissionSchema } from '@/lib/validations/submissionSchema';
import { MockSheetStore } from '@/lib/server/mockSheetStore';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com')) {
      try {
        const gasUrl = new URL(appsScriptUrl);
        gasUrl.searchParams.set('action', 'read');
        gasUrl.searchParams.set('submissionId', submissionId);
        if (webhookSecret) gasUrl.searchParams.set('secret', webhookSecret);

        const gasRes = await fetch(gasUrl.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
        });

        if (gasRes.ok) {
          const data = await gasRes.json();
          if (data.status === 'success' && data.data) {
            const raw = data.data;
            const enriched = {
              ...raw,
              _uuid: raw['1\nUnique ID'] || data.uniqueId || submissionId,
              client_submission_id: raw['1\nUnique ID'] || data.uniqueId || submissionId,
              remote_submission_id: raw['1\nUnique ID'] || data.uniqueId || submissionId,
              uniqueId: raw['1\nUnique ID'] || data.uniqueId || submissionId,
              art_number: raw['1\nUnique ID'] || raw['42\nART ID Number'] || data.uniqueId || submissionId,
              child_name: raw['9\nChild Name'] || '',
              dob: raw['10\nDate of Birth'] || '',
              calculated_age: Number(raw['11\nAge'] || 0),
              gender: raw['12\nGender'] || '',
              caregiver_name: raw['14\nCaregiver Full Name'] || '',
              caregiver_relationship: raw['15\nCaregiver Relation'] || '',
              caregiverPhone: raw['16\nCaregiver Contact'] ? String(raw['16\nCaregiver Contact']) : '',
              caregiver_phone: raw['16\nCaregiver Contact'] ? String(raw['16\nCaregiver Contact']) : '',
              address: raw['17\nAddress'] || '',
              state: raw['18\nState'] || '',
              district: raw['19\nDistrict'] || '',
              account_holder_name: raw['20\nBank Account Holder Name'] || '',
              bank_account_number: raw['21\nBank Account Number'] ? String(raw['21\nBank Account Number']) : '',
              ifsc_code: raw['22\nBank IFSC Code'] || '',
              monthly_household_income: Number(raw['30\nMonthly Income'] || 0),
              primary_caregiver_occupation: raw['31\nIncome Source'] || '',
              weight_kg: Number(raw['32\nCurrent Weight (kg)'] || 0),
              height_cm: Number(raw['33\nCurrent Height (cm)'] || 0),
              bmi: Number(raw['34\nBMI'] || 0),
              nutrition_status: raw['35\nBMI Category'] || '',
              clinical_notes: raw['38\nComorbidities'] || raw['66\nRemarks (If Any)'] || '',
              school_enrolled: raw['49\nEducation Status'] !== 'Not In School',
              school_type: raw['53\nSchool Type'] || '',
              school_grade: raw['54\nCurrent Class'] || '',
              attendance_percentage: raw['55\nAttendance Status'] === 'Regular' ? 90 : 60,
              school_fees: Number(raw['56\nSchool Fees'] || 0),
              tuition_fees: Number(raw['57\nPrivate Tuition Fee'] || 0),
              books: Number(raw['58\nSchool Books'] || 0),
              stationery: Number(raw['59\nSchool Stationery'] || 0),
              uniform: Number(raw['60\nSchool Uniform'] || 0),
              transport: Number(raw['61\nSchool Transport'] || 0),
              other_expenses: Number(raw['62\nSchool Other Expenses'] || 0),
              version: Number(raw['2\nRevision Number'] || data.revisionNumber || 1),
              revision: Number(raw['2\nRevision Number'] || data.revisionNumber || 1),
              created_at: raw['3\nSubmission Time'] || new Date().toISOString(),
              updated_at: raw['73\nLast Updated'] || raw['3\nSubmission Time'] || new Date().toISOString(),
              interviewer_name: raw['4\nSubmitted By'] || raw['8\nInterviewer Name'] || '',
              grant_recommended: true,
              recommended_grant_amount: Number(raw['63\nTotal Annual Education Cost'] || 0),
            };
            return NextResponse.json({ ...data, data: enriched }, { status: 200 });
          }
          return NextResponse.json(data, { status: 200 });
        }
      } catch (gasErr) {
        console.error('Apps Script read error:', gasErr);
        return NextResponse.json(
          { status: 'error', code: 'UPSTREAM_GATEWAY_ERROR', message: 'Central Sheets bridge unreachable' },
          { status: 502 }
        );
      }
    }

    const record = MockSheetStore.findRecord(submissionId);
    if (!record) {
      return NextResponse.json(
        { status: 'error', code: 'NOT_FOUND', message: `Submission ${submissionId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: record,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('GET /api/submissions/[submissionId] error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  try {
    const submissionId = params.submissionId;
    if (!submissionId) {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_ID', message: 'Missing submissionId parameter' },
        { status: 400 }
      );
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_JSON', message: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    // Support If-Match header fallback for expectedVersion
    const ifMatchHeader = req.headers.get('If-Match') || req.headers.get('if-match');
    if (ifMatchHeader && rawBody.expectedVersion === undefined) {
      const parsedHeaderVersion = parseInt(ifMatchHeader.replace(/"/g, ''), 10);
      if (!isNaN(parsedHeaderVersion)) {
        rawBody.expectedVersion = parsedHeaderVersion;
      }
    }

    const validation = patchSubmissionSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Patch failed allowlisted field validation or missing expectedVersion',
          issues: validation.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 422 }
      );
    }

    const patchPayload = validation.data;
    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com')) {
      try {
        const gasRes = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            action: 'update',
            submissionId,
            patch: patchPayload,
            secret: webhookSecret,
            requestId,
          }),
        });

        const gasData = await gasRes.json();
        return NextResponse.json(gasData, { status: gasRes.status });
      } catch (gasErr) {
        console.error('Apps Script update forwarding error:', gasErr);
        return NextResponse.json(
          { status: 'error', code: 'GATEWAY_TIMEOUT', message: 'Failed to reach Google Sheets bridge for update' },
          { status: 504 }
        );
      }
    }

    // Local / Staging OCC Store Update
    const result = MockSheetStore.updateRecord(submissionId, patchPayload, 'Caseworker', requestId);

    if ('notFound' in result) {
      return NextResponse.json(
        { status: 'error', code: 'NOT_FOUND', message: `Record ${submissionId} not found` },
        { status: 404 }
      );
    }

    if ('conflict' in result) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'CONCURRENCY_CONFLICT',
          message: 'The record has been updated by another caseworker. Please refresh before saving.',
          currentVersion: result.currentVersion,
          expectedVersion: result.expectedVersion,
          resolutionPath: 'REFRESH_AND_MERGE',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        acknowledged: true,
        remoteSubmissionId: result.record.remote_submission_id,
        version: result.version,
        updatedAt: result.record.updated_at,
        requestId,
        data: result.record,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('PATCH /api/submissions/[submissionId] error:', err);
    return NextResponse.json(
      { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error processing patch' },
      { status: 500 }
    );
  }
}
