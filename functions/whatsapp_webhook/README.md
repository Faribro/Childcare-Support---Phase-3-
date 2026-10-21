# Zoho Catalyst Advanced I/O Webhook Adapter

## Overview
This package is an isolated, receive-only Meta WhatsApp Cloud API webhook receiver implemented as a Zoho Catalyst **Advanced I/O** function.

It reuses the exact cryptographic verification, streaming bounds, and privacy redaction rules from PR #84 without maintaining divergent security implementations or using deployment-dependent symlinks.

## Runtime Architecture
- **Runtime Stack**: Node.js 18 (`node18` in `catalyst-config.json`)
- **Execution Model**: Advanced I/O (native HTTP request listener / Express-compatible)
- **Dependencies**: Zero runtime dependencies (uses native Node.js `crypto` and `http`)
- **Streaming Limit**: 256 KB hard ceiling with early stream cancellation and HTTP 413
- **HMAC Verification**: Timing-safe `crypto.timingSafeEqual` against raw payload bytes before JSON parsing
- **Privacy**: Strict zero-PII sanitization (no phone numbers, names, message text, or raw message IDs)

## Required Environment Variables
Configure these in the Catalyst Web Console under **Serverless > Functions > whatsapp_webhook > Configuration > Environment Variables**:
- `WHATSAPP_WEBHOOK_ENABLED`: `true` to activate; fail-closed default (`false`) returns HTTP 404.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: Shared secret for Meta GET handshake verification.
- `META_APP_SECRET`: Meta App Secret used for HMAC-SHA256 signature verification.

## Deployment Prerequisites
1. Zoho Catalyst CLI: `npm install -g zcatalyst-cli`
2. Authenticate CLI: `catalyst login`
3. Associate Project: `catalyst project:use Project-Rainfall`
4. Deploy Function: `catalyst deploy --only functions:whatsapp_webhook`
