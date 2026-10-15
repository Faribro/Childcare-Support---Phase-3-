# Meta WhatsApp Cloud API Webhook: Receive-Only Runbook & Operator Guide

## 1. Architectural Scope & Operating Context

### Core Purpose
This integration establishes an isolated, receive-only test sink endpoint for Meta's WhatsApp Cloud API Webhooks within the Child Nutrition PWA (Phase 3).

### Operating Context
- **Staff-Only Application**: The application is designed strictly for staff data collection, monitoring, and evaluation. Beneficiaries **do not** log in or interact directly with the PWA.
- **Future Beneficiary Outreach**: Future beneficiary interaction will occur via WhatsApp and automated calling services, with authorized evaluation staff reviewing outcomes inside the application.
- **Receive-Only Test Sink**: The endpoint `/api/integrations/whatsapp/webhook` is **strictly receive-only**. It:
  - Validates Meta's GET challenge handshake.
  - Authenticates incoming POST webhook notifications using HMAC-SHA256 signatures (`X-Hub-Signature-256`).
  - Strips and redacts all Personally Identifiable Information (PII) before logging or buffering.
  - Does **NOT** execute outbound WhatsApp messages or Graph API calls.
  - Does **NOT** mutate database records or Google Sheets.
  - Does **NOT** initiate beneficiary communications.

---

## 2. Meta App Configuration Baseline

The Meta Developer App has been registered in the Meta Developer Portal with the following baseline assets:
- **App Name**: `Cp3 Field Workflow Assistant`
- **App ID**: `1121270543968588`
- **Test WhatsApp Business Account (WABA) ID**: `1670497521174128`
- **Test Phone Number ID**: `1413691425156891`

---

## 3. Unpublished Meta App Operating Limitations

> [!IMPORTANT]
> **Dashboard-Generated Test Webhook Limitation**
> While the Meta application is in **Development Mode** (unpublished):
> - The webhook endpoint receives **only dashboard-generated test events** triggered from the Meta App Dashboard.
> - Messages or replies sent from physical test phones or admin/developer accounts will **not** be delivered to the webhook endpoint until the app is formally reviewed and published.
> - **DO NOT publish the app** to bypass this limitation. All initial integration, schema validation, and handshake verification must be conducted using synthetic test payloads and dashboard-generated test triggers.

---

## 4. Outstanding Security Item: Access Token Invalidation

> [!WARNING]
> **Token Invalidation Verification Required**
> An access token was previously exposed in conversation. The administrator removed the app's business integration and regenerated credentials; however, invalidity of the old token has **not** been conclusively verified via Meta's token inspection tool (`GET /debug_token`).
>
> **Action Items for Administrators**:
> 1. Verify invalidation of the old token using Meta's Access Token Debugger tool in an isolated administrative session.
> 2. Ensure no exposed credentials reside in repository files, environment configs, or developer shells.
> 3. Note that this receive-only webhook endpoint requires **no WhatsApp sending access token** whatsoever; it only requires `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `META_APP_SECRET`.

---

## 5. Server Environment Configuration

Add the following environment variables to your deployment environment (e.g., Render, Vercel, or local `.env.local`):

| Variable Name | Required | Default | Description |
|---|---|---|---|
| `WHATSAPP_WEBHOOK_ENABLED` | Yes | `false` | Gatekeeper flag. Set to `'true'` to activate the webhook route. Fail-closed default. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Yes | - | Cryptographically random string shared with Meta for the GET handshake. |
| `META_APP_SECRET` | Yes | - | Meta App Secret from Meta Dashboard -> App settings -> Basic. Used for HMAC-SHA256 signature verification. |

> [!NOTE]
> Never commit actual secret values into git. Only the variable names are documented in `.env.example`.

---

## 6. Meta Dashboard Configuration Steps (Operator Runbook)

Once the application is deployed to an HTTPS-accessible host (or tunnel):

1. **Navigate to WhatsApp Configuration**:
   - In [developers.facebook.com](https://developers.facebook.com), open the **Cp3 Field Workflow Assistant** app.
   - In the left sidebar, click **WhatsApp** -> **Configuration**.
2. **Edit Webhook URL**:
   - Click **Edit** next to Webhook.
   - **Callback URL**: `https://<YOUR-DEPLOYED-DOMAIN>/api/integrations/whatsapp/webhook`
   - **Verify Token**: Enter the exact string configured in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   - Click **Verify and Save**. Meta will send a GET request with `hub.mode=subscribe`, `hub.challenge`, and `hub.verify_token`. The endpoint will respond with HTTP 200 and echo the challenge.
3. **Subscribe to Webhook Fields**:
   - In the Webhook fields table, locate `messages`.
   - Click **Subscribe**.
4. **Test with Dashboard Generator**:
   - Click **Test** next to `messages` in the Meta Dashboard.
   - Select a sample payload and send it.
   - Confirm your server logs display:
     `[WHATSAPP_WEBHOOK] Received event: entries=..., messages=..., statuses=...`

---

## 7. Local Synthetic Verification

A standalone test runner script is included in the repository to verify both GET handshake and signed POST events locally without needing a live Meta connection:

```bash
# Start your local development server
npm run dev

# In a separate terminal, run the synthetic test runner
node scripts/test-whatsapp-webhook.mjs http://localhost:3000 <VERIFY_TOKEN> <APP_SECRET>
```

The script runs four synthetic checks:
1. `GET` Handshake verification with challenge echoing.
2. `POST` Inbound text message with valid HMAC-SHA256 signature.
3. `POST` Delivery status update with valid HMAC-SHA256 signature.
4. `POST` Tampered signature rejection (verifies HTTP 401 Unauthorized).

---

## 8. Data Privacy & Security Hardening Guarantees

All incoming webhook payloads are immediately stripped of sensitive data:
- **Streaming Hard Size Limit**: Enforces a strict 256 KB limit on raw payloads (`MAX_RAW_BODY_SIZE`). Streaming requests exceeding this ceiling are cancelled immediately at the byte level before buffering or JSON parsing. Fast rejection is also applied if `Content-Length > 256 KB`.
- **Parameter Bounds**: Handshake GET query parameters are strictly bounded (mode ≤ 64, token ≤ 256, challenge ≤ 512).
- **Strict PII Elimination**:
  - NO phone numbers or phone fragments (masked or raw) are retained in logs or diagnostics.
  - NO contact profile names or user identifiers.
  - NO message content, raw text, captions, buttons, or media URLs.
  - NO raw WhatsApp message IDs (`wamid...`).
  - NO raw error strings that might echo payload fragments.
- **Minimal Diagnostic Record**: Retains ONLY aggregate counts (`entryCount`, `messageCount`, `statusCount`), event class (`message` | `status` | `general`), numeric error codes, and an ephemeral random correlation UUID (`crypto.randomUUID()`).
- **In-Memory Sink Boundary**: A private, non-durable in-memory ring-buffer stores up to 50 recent diagnostic records for local testing and inspection with FIFO eviction. No public API endpoint exposes the sink, and duplicate deliveries cause no business side effects.
- **Outbound Restraint**: Zero outbound network requests, zero document downloads, zero beneficiary lookups, and zero database mutations.
