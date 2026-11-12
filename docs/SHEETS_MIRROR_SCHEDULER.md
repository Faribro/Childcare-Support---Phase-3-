# Sheets Mirror Outbox Scheduler Guide

## Overview
Due to Vercel Hobby plan limitations where cron triggers cannot be scheduled sub-daily, `vercel.json` includes a once-daily cron (`0 2 * * *`) as a safety net.

For active sub-hourly draining of the `sheets_mirror_jobs` queue, an external trigger calls the authenticated endpoint `POST /api/workers/sheets-mirror`.

## 1. Authenticated Endpoint Details
- **Endpoint:** `POST https://<your-domain>/api/workers/sheets-mirror`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <WEBHOOK_SECRET>`
    *(or header `X-Webhook-Secret: <WEBHOOK_SECRET>`)*
- **Body:**
  ```json
  { "batchSize": 10 }
  ```
- **Response (HTTP 200):**
  ```json
  {
    "status": "success",
    "summary": {
      "processed": 2,
      "completed": 2,
      "failed": 0,
      "deadLettered": 0,
      "superseded": 0
    },
    "queue": {
      "pendingRemaining": 0,
      "deadLetterCount": 0
    }
  }
  ```

## 2. GitHub Actions Workflow (Recommended)
Add `.github/workflows/sheets-sync-drain.yml` to trigger the drain every 5 minutes:

```yaml
name: Sheets Mirror Outbox Drain

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

jobs:
  drain-outbox:
    runs-on: ubuntu-latest
    steps:
      - name: Call Sheets Mirror Worker
        run: |
          curl -s -X POST "https://childcare-support-phase-3.vercel.app/api/workers/sheets-mirror" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.WEBHOOK_SECRET }}" \
            -d '{"batchSize": 20}'
```

## 3. Alternative External Cron Services
You can also configure any external uptime or cron service (e.g., cron-job.org, BetterStack, or EasyCron):
- **Schedule:** Every 2 to 5 minutes
- **HTTP Method:** `POST`
- **URL:** `https://<domain>/api/workers/sheets-mirror`
- **Header:** `Authorization: Bearer <WEBHOOK_SECRET>`
