# Integration Board & Decision Ledger: WhatsApp Receive-Only Webhook & Catalyst Adapter

**Branch**: `feat/catalyst-whatsapp-adapter`  
**Latest Baseline Commit**: `51d52b04d12ddc5b36125a1d5288b894d93ac04d`  
**Repository**: `Faribro/Childcare-Support---Phase-3-`  
**Date**: October 15, 2026  
**Status**: Local Implementation & Verification Complete — Awaiting Deployment Authorization Gate

---

## 1. Executive Summary & Boundaries

This document records the architecture, data flow, verified outcomes, decision ledger, and open deployment gates for the receive-only Meta WhatsApp Cloud API webhook receiver and its Zoho Catalyst Advanced I/O adapter.

### Strict Safety & Governance Boundaries
- **No Cloud Deployment**: No resources deployed to Zoho Catalyst or Render.
- **No Provider Configuration**: No changes made to Meta App Dashboard or WhatsApp Business Account.
- **No Operational/Beneficiary Data**: Zero access to real beneficiary PII, health records, or live phone numbers.
- **No Outbound Actions**: No sending WhatsApp messages, emails, files, or placing calls.
- **No Auto-Merge**: PR #82, PR #83, and PR #84 remain separate reviewable pull requests; no branch is merged to `main`.
- **Evidence-Based Claims Only**: Capabilities are reported strictly based on observed automated test executions.

---

## 2. Integration Board

| Track / Component | Current Branch / PR | Status | Tested Capabilities | Deployment Prerequisites / Gates |
| :--- | :--- | :--- | :--- | :--- |
| **PR #82**: Staged Readiness & Approved Bank Queue | `feat/staged-readiness-bank-queue` (PR #82) | Green CI / Ready for merge | 5 orthogonal stage dimensions; 7 bank-stage scenarios; reduced motion; OCC checks | Awaiting manual review & merge authorization |
| **PR #83**: Leadership Email Auth | `feat/leadership-email-auth` (PR #83) | Green CI / Ready for merge | Allowlisted email OTP; Postgres integration test; idle/session timeouts; fail-closed | Awaiting manual review & merge authorization |
| **PR #84**: Next.js WhatsApp Webhook Route | `feat/whatsapp-test-webhook` (PR #84) | Green CI / Ready for review | Streaming hard limit (256 KB); constant-time HMAC-SHA256; GET challenge bounds; PII elimination | Production deployment decision; secret provisioning |
| **Catalyst Advanced I/O Adapter** | `feat/catalyst-whatsapp-adapter` (Local) | Local verification complete | Standalone CJS packaging; zero symlinks; client-visible 413 with bounded drain; real HTTP server/client tests; packaging reproducibility | Catalyst CLI login; unauthenticated invocation check; billing/credit verification |

---

## 3. Decision Ledger

| Decision ID | Domain | Decision Made | Rationale & Trade-offs | Source of Authority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DL-001** | Hosting | Implement Zoho Catalyst Advanced I/O adapter locally first | Avoids Render Free tier sleep/cold-start loading page risk while keeping deployment deferred until account billing/credits are verified | User Directive (Step 5) | **VERIFIED LOCAL** |
| **DL-002** | Packaging | Zero-symlink packaging via TypeScript compiler API | Windows symlinks require elevated permissions and break during zip/tar packaging in Catalyst CLI; deterministic compilation from canonical sources prevents code divergence | User Directive / Packaging Safety | **VERIFIED LOCAL** |
| **DL-003** | Runtime | Express + Vanilla Node.js dual compatibility | Express might not be pre-installed in all local environments; exported handler functions natively in both vanilla Node `(req, res)` and Express | Zoho Catalyst Advanced I/O Docs | **VERIFIED LOCAL** |
| **DL-004** | Security | Constant-time HMAC-SHA256 before JSON parse | Reject unauthenticated or tampered payloads prior to allocating memory for JSON parsing to mitigate DoS and timing attacks | Meta Webhook Security Spec / CWE-208 | **VERIFIED LOCAL** |
| **DL-005** | Streaming | 256 KB raw body ceiling with bounded 64 KB drain | Prevents unbounded memory exhaustion while avoiding premature socket destruction (`req.destroy()`) that causes client `ECONNRESET` | User Directive / RFC 7230 / RFC 9110 | **VERIFIED LOCAL** |
| **DL-006** | Privacy | Explicit PII stripping at ingestion | Beneficiary phone numbers, contact names, raw message text, and `wamid` IDs must never be logged or returned in responses | Data Protection Principle / Project Scope | **VERIFIED LOCAL** |
| **DL-007** | Manifest | Non-destructive update of root `catalyst.json` | Packaging script merges `whatsapp_webhook` into `functions.targets` without overwriting other services or configuration keys | Configuration Safety | **VERIFIED LOCAL** |
| **DL-008** | Runtime Stack | Target `node18` in `catalyst-config.json` | Aligns with project engines constraint (`>=18.18.0`) and Catalyst's supported LTS stack; code compiles to ES2022 CommonJS compatible with Node 18 & 20 | Project `package.json` / Catalyst Docs | **VERIFIED LOCAL** |

---

## 4. Source-of-Truth & Data Flow Matrix

For every value shown, stored, computed, or sent in the WhatsApp Webhook pipeline, the exact source of truth, transformation, and destination are defined:

| Field / Value | Origin / Source | Validation / Transformation Rule | Storage / Persistence | Egress Destination |
| :--- | :--- | :--- | :--- | :--- |
| `hub.mode` | Meta GET query param | Must equal `'subscribe'` exactly; max length 64 chars | None (ephemeral query check) | None (consumed in memory) |
| `hub.verify_token` | Meta GET query param | Compared against `WHATSAPP_WEBHOOK_VERIFY_TOKEN` via `crypto.timingSafeEqual`; max length 256 chars | None (ephemeral) | None (never echoed) |
| `hub.challenge` | Meta GET query param | Sanitized string; max length 512 chars | None (ephemeral) | Echoed verbatim as `text/plain; charset=utf-8` with HTTP 200 |
| `x-hub-signature-256` | Meta POST HTTP header | Must start with `sha256=` followed by 64 hex characters | None (ephemeral) | None (never echoed) |
| Raw Request Body | Incoming HTTP socket stream | Streamed up to 256 KB; verified against `META_APP_SECRET` | In-memory Buffer during request lifecycle | None (never logged raw) |
| `correlationId` | Server-generated | Generated via `crypto.randomUUID()` upon verified receipt | In-memory diagnostic record (FIFO max 50) | Returned in HTTP 200 response; included in stdout log |
| `eventClass` | Derived from verified payload | Derived as `'message'`, `'status'`, `'general'`, or `'unknown'` | In-memory diagnostic record | Returned in HTTP 200 response; included in stdout log |
| `entryCount` | Derived from verified payload | `payload.entry.length` | In-memory diagnostic record | Returned in HTTP 200 response; included in stdout log |
| `messageCount` | Derived from verified payload | Total count of objects in `entry[].changes[].value.messages[]` | In-memory diagnostic record | Returned in HTTP 200 response; included in stdout log |
| `statusCount` | Derived from verified payload | Total count of objects in `entry[].changes[].value.statuses[]` | In-memory diagnostic record | Returned in HTTP 200 response; included in stdout log |
| `errorCodes` | Derived from verified payload | Array of numeric error codes from `statuses[].errors[].code` | In-memory diagnostic record | Retained in internal diagnostic buffer only |
| **Phone Numbers / Names** | Meta payload input | **STRIPPED**: `from`, `recipient_id`, `display_phone_number`, `profile.name` | **NOT STORED** | **NEVER SENT** |
| **Message Text / Media** | Meta payload input | **STRIPPED**: `text.body`, `caption`, `filename`, media URLs | **NOT STORED** | **NEVER SENT** |
| **WhatsApp Message IDs** | Meta payload input | **STRIPPED**: raw `wamid...` strings | **NOT STORED** | **NEVER SENT** |

---

## 5. Verified versus Assumed Matrix

| Item | Local Status | Remote Deployment Status | Evidence & Verification Notes |
| :--- | :--- | :--- | :--- |
| **Timing-safe HMAC** | **Verified** | **Assumed** | Verified locally with synthetic secrets and payload tampering. Remote execution depends on exact raw byte fidelity through Catalyst gateway. |
| **Streaming Hard Limit** | **Verified** | **Assumed** | Verified locally on real HTTP server on 127.0.0.1 (Content-Length overflow, chunked overflow, 256 KB limit, client abort). Remote gateway buffering behavior is unverified. |
| **Graceful 413 Delivery** | **Verified** | **Assumed** | Verified that client observes HTTP 413 without socket reset via bounded 64 KB drain. Remote reverse proxy response handling is unverified. |
| **Packaging Reproducibility** | **Verified** | **Verified** | Dual packaging runs produce identical SHA256 hashes; artifact loads and executes cleanly in isolated temporary directory. |
| **Public Unauthenticated Access** | **N/A** | **UNVERIFIED** | Whether Catalyst Advanced I/O function URL permits unauthenticated public invocations without Zoho user login redirects remains unverified. |
| **Catalyst Account Billing / Credits** | **N/A** | **UNVERIFIED** | Project-Rainfall account conditions, credit expiration, and tier limits remain unverified in the production environment. |
| **Execution Latency & Cold Starts** | **N/A** | **UNVERIFIED** | Local response time is < 5ms. Remote micro-VM initialization and cold-start latency on Catalyst infrastructure remain unmeasured. |
| **Idempotence Scope** | **Verified** | **Verified** | Duplicate deliveries have zero business side effects, but will append diagnostic records to the 50-item in-memory buffer and emit stdout logs. |

---

## 6. Open Decisions & Remaining Deployment Gates

1. **Authorization Gate**: No deployment commands (`catalyst deploy`) may be executed until explicitly authorized.
2. **Access Rules Verification**: Confirm in Zoho Catalyst Web Console whether the function URL access rule allows unauthenticated public access.
3. **Environment Selection**: Confirm whether `Project-Rainfall` target environment should be `Development` or `Production`.
4. **Secret Provisioning**: Prepare secret values for `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `META_APP_SECRET` to be provisioned in Catalyst console environment variables.
