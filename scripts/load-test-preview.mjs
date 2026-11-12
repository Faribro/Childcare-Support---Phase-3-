#!/usr/bin/env node
/**
 * 50-Concurrent-User Preview Load Test Script (Phase 3 Item 13)
 *
 * Simulates N concurrent users (default 50) submitting valid Childcare Support Phase 3
 * forms with small JPEG/PNG photo attachments against a PREVIEW deployment URL.
 *
 * Usage:
 *   node scripts/load-test-preview.mjs --url https://<preview>.vercel.app [--concurrency 50]
 *
 * Authentication / Protection Bypass:
 *   If Preview Deployment Protection is enabled, pass cookie via env VERCEL_COOKIE_HEADER
 *   or run inside an environment where --cookie-file / _vercel_jwt is supplied (never logged).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

// Small valid 1x1 PNG + padding chunk (70 bytes, valid PNG magic header \x89PNG...)
const SMALL_VALID_PNG_B64 =
  'data:image/png;base64,' +
  Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8cfc000000301010018dd8db00000000049454e44ae426082',
    'hex'
  ).toString('base64');

function parseArgs(argv) {
  const args = { url: process.env.PREVIEW_URL || '', concurrency: 50, cookieFile: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) args.url = argv[++i];
    else if (argv[i] === '--concurrency' && argv[i + 1]) args.concurrency = Number(argv[++i]) || 50;
    else if (argv[i] === '--cookie-file' && argv[i + 1]) args.cookieFile = argv[++i];
  }
  return args;
}

function buildLoadTestPayload(index) {
  const uuid = crypto.randomUUID();
  const suffix = String(index + 1).padStart(3, '0');
  return {
    idempotencyKey: `loadtest-${uuid}`,
    body: {
      uuid,
      clientSubmissionId: uuid,
      interviewerName: `TRAINING LoadTest User ${suffix}`,
      demographics: {
        artNumber: `TRN-LT-${suffix}`,
        childName: `TRAINING LoadTest Child ${suffix}`,
        dob: '2016-06-15',
        gender: index % 2 === 0 ? 'Female' : 'Male',
        orphanStatus: 'Single orphan (one parent deceased)',
        caregiverName: `TRAINING Caregiver ${suffix}`,
        caregiverRelationship: 'Mother',
        contactNumber: `987654${String(1000 + index).slice(-4)}`,
        residenceType: 'Rented',
        doorAndColony: `Plot ${suffix}, Training Nagar`,
        street: 'Test Cross Road',
        villageCity: 'Pune',
        talukMandalBlock: 'Pune City',
        district: 'Pune',
        state: 'Maharashtra',
        pinCode: '411001',
      },
      educationExpenses: {
        feeReceiptPhotoUrl: SMALL_VALID_PNG_B64,
        remarks: `TRAINING load test sample ${suffix}`,
      },
      caregiverConsent: {
        consentProvided: true,
        dateOfConsent: new Date().toISOString().slice(0, 10),
        signatureDataUrl: SMALL_VALID_PNG_B64,
      },
      finalReview: {
        allInfoCorrect: true,
        formSubmittedBy: `TRAINING LoadTest User ${suffix}`,
        organizationName: 'TRAINING Sample SSR',
      },
    },
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function loadCookieHeader(cookieFile) {
  if (process.env.VERCEL_COOKIE_HEADER) return process.env.VERCEL_COOKIE_HEADER;
  if (!cookieFile || !fs.existsSync(cookieFile)) return '';
  const raw = fs.readFileSync(cookieFile, 'utf8').trim();
  const pairs = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
    const cols = line.split('\t');
    if (cols.length >= 7) {
      pairs.push(`${cols[5]}=${cols[6]}`);
    }
  }
  return pairs.length ? pairs.join('; ') : raw;
}

async function main() {
  const { url, concurrency, cookieFile } = parseArgs(process.argv);
  if (!url) {
    console.error('Usage: node scripts/load-test-preview.mjs --url https://<preview>.vercel.app [--concurrency 50]');
    process.exit(1);
  }

  const cookieHeader = loadCookieHeader(cookieFile);

  const targetEndpoint = `${url.replace(/\/+$/, '')}/api/submissions`;
  const requests = Array.from({ length: concurrency }, (_, i) => buildLoadTestPayload(i));

  const tStart = performance.now();
  const results = await Promise.all(
    requests.map(async (item, idx) => {
      const reqStart = performance.now();
      try {
        const headers = {
          'Content-Type': 'application/json',
          'Idempotency-Key': item.idempotencyKey,
        };
        if (cookieHeader) headers['Cookie'] = cookieHeader;

        const res = await fetch(targetEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(item.body),
        });
        const elapsedMs = performance.now() - reqStart;
        const text = await res.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {}

        const ok = (res.status === 200 || res.status === 201) && parsed?.status === 'success';
        return {
          idx,
          status: res.status,
          ok,
          elapsedMs,
          code: parsed?.code || (!ok ? `HTTP_${res.status}` : 'OK'),
          message: !ok ? (parsed?.message || text.slice(0, 120)) : 'OK',
        };
      } catch (err) {
        return {
          idx,
          status: 0,
          ok: false,
          elapsedMs: performance.now() - reqStart,
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );
  const totalWallMs = Math.round(performance.now() - tStart);

  const latencies = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const failures = results.filter((r) => !r.ok);
  const statusHistogram = {};
  for (const r of results) {
    const key = String(r.status);
    statusHistogram[key] = (statusHistogram[key] || 0) + 1;
  }

  const summary = {
    targetEndpoint,
    concurrentUsers: concurrency,
    totalWallMs,
    successCount: results.length - failures.length,
    failureCount: failures.length,
    errorRatePercent: Number(((failures.length / results.length) * 100).toFixed(2)),
    minMs: Math.round(latencies[0] || 0),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    maxMs: Math.round(latencies[latencies.length - 1] || 0),
    statusHistogram,
    sampleFailures: failures.slice(0, 5),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
