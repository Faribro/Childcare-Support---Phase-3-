# Fail-Closed Webhook Authentication & Zero-Trust Access Architecture

## 1. Threat Model & Security Posture

In Phase 2 and early Phase 3 iterations, temporary fallback tokens (such as `childcare_phase3_secret_token_2026`) were introduced to bypass configuration hurdles. In an offline-first child healthcare and nutrition management platform, hardcoded fallbacks and permissive auth defaults introduce critical vulnerabilities:

1. **Credential Harvest Risk**: Committing secrets to git repositories exposes administrative sheet access to unauthorized parties.
2. **Impersonation Risk**: Anyone knowing the fallback token could submit spoofed records or modify existing child beneficiary data.
3. **Data Exfiltration Risk**: An unauthenticated or default-credentialed caller could invoke bulk export/list actions, compromising sensitive clinical and banking PII.

Under this security revision, the architecture operates under a **Zero-Trust, Fail-Closed Model**:
- **Zero Fallback Secrets**: All hardcoded tokens (`childcare_phase3_secret_token_2026`) have been deleted from `gas/Code.js`, `canonicalSubmissionAdapter.ts`, and environment presets.
- **Server Script Properties Sole Authority**: Apps Script reads the secret solely from `PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET')`.
- **Fail-Closed on Misconfiguration**: If `WEBHOOK_SECRET` is not configured in Apps Script Properties, Apps Script immediately rejects requests with `503 CONFIGURATION_ERROR`.
- **Fail-Closed on Bad Credentials**: If the caller's provided secret is missing, empty, or mismatched, Apps Script rejects the request with `401 UNAUTHORIZED`.
- **Restricted Anonymous Surface**: Anonymous requests are allowed exclusively on `doGet` where `action === 'ping'` (returning operational uptime only, with zero schema, sheet, or PII data).

---

## 2. Authentication Flow Diagram

```text
+------------------------+
| Next.js Server Gateway |
| process.env            |
| .WEBHOOK_SECRET        |
+-----------+------------+
            |
            | POST payload { action, secret: WEBHOOK_SECRET, ... }
            | Header: X-Webhook-Secret: WEBHOOK_SECRET
            v
+-------------------------------------------------------+
| Google Apps Script Web App (doPost / doGet)           |
|                                                       |
| 1. Read Script Properties:                            |
|    PropertiesService.getScriptProperties()            |
|      .getProperty('WEBHOOK_SECRET')                   |
|                                                       |
|    IF NOT CONFIGURED:                                 |
|      -> Return 503 CONFIGURATION_ERROR                |
|                                                       |
| 2. Compare caller secret vs configured secret:        |
|    IF MISMATCH / MISSING:                             |
|      -> Return 401 UNAUTHORIZED                       |
|                                                       |
| 3. IF VALID:                                          |
|      -> Grant dispatch to protected action            |
+-------------------------------------------------------+
```

---

## 3. Implementation Details

### A. Google Apps Script Side (`gas/Code.js`)

```javascript
function requireWebhookSecret_(payload, action, requestId) {
  var configuredSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!configuredSecret) {
    return {
      authorized: false,
      response: errorResponse_(
        'Server configuration error: Authentication secret not configured in Script Properties.',
        'CONFIGURATION_ERROR',
        503,
        requestId
      )
    };
  }

  var callerSecret = (payload && payload.secret) || '';
  if (!callerSecret || String(callerSecret) !== String(configuredSecret)) {
    return {
      authorized: false,
      response: errorResponse_(
        'Unauthorized: Invalid webhook secret or missing credentials.',
        'UNAUTHORIZED',
        401,
        requestId
      )
    };
  }

  return { authorized: true };
}
```

### B. Next.js Canonical Adapter (`src/lib/server/canonicalSubmissionAdapter.ts`)

```typescript
public getWebhookSecret(): string | undefined {
  return (
    process.env.WEBHOOK_SECRET ||
    process.env.APPS_SCRIPT_WEBHOOK_SECRET ||
    process.env.WEBHOOK_SHARED_SECRET ||
    undefined
  );
}
```

- When running on Render or any server environment, `WEBHOOK_SECRET` must be set via environment variable.
- In absence of `WEBHOOK_SECRET`, the adapter fails closed and returns `503 CONFIGURATION_ERROR` without leaking fallback credentials.
- URL query parameters are strictly forbidden from carrying secrets: `adapterContent` never contains `?secret=` or `searchParams.set('secret')`. Secrets travel strictly via HTTPS POST body and headers.

---

## 4. Operational Setup Runbook

To configure the fail-closed secret in the Google Apps Script container:

1. Open the Google Sheet linked to the application (`Child_Nutrition`).
2. Navigate to **Extensions → Apps Script**.
3. In the left navigation sidebar, click on **Project Settings** (gear icon ⚙️).
4. Scroll to **Script Properties** and click **Add script property**.
5. Set:
   - **Property**: `WEBHOOK_SECRET`
   - **Value**: Generate a high-entropy 32+ character random string (e.g. `openssl rand -hex 32`).
6. Click **Save script properties**.
7. In your Next.js server environment (e.g., Render dashboard):
   - Add environment variable `WEBHOOK_SECRET` with the exact same secret string.
8. Verify connectivity:
   - Run `GET https://script.google.com/.../exec?action=ping` -> Returns `200 { status: 'ok', service: 'Childcare Support Phase 3 Bridge' }`.
   - Run `GET https://script.google.com/.../exec?action=list` -> Returns `401 UNAUTHORIZED`.
   - Run authenticated call from Next.js server -> Returns `200 { status: 'success', data: [...] }`.
