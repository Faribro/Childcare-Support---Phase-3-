# knadh/otpgateway Architecture Audit & Mobile Authentication Integration Plan

**Document Version:** 1.0.0  
**Target Branch:** `gcp-migration`  
**Security Classification:** Highly Confidential (Authentication & Authorisation Architecture)  
**Author:** Senior Systems Architect & Full-Stack Security Engineering  

---

## 1. Requirement Traceability Matrix

The following table demonstrates the precise status of all authentication and onboarding requirements, clearly separating implemented code from architectural dependencies and owner decisions:

| Requirement | Implemented Code | Automated Tests | Remaining Dependency | Owner Decision Required |
| :--- | :--- | :--- | :--- | :--- |
| **Field Worker Mobile Number Collection** | `src/components/auth/WelcomeKiteOnboardingModal.tsx` (L145–160), `src/lib/server/onboardingStore.ts` (L78–92) | `src/test/welcome-kite-onboarding.test.tsx`, `src/test/state-evaluation-access.test.ts` | None (Local schema & UI collect 10-digit mobile) | Formalize whether mobile is unique per worker or shared devices permitted |
| **Field Worker Direct Setup via Invitation Code** | `src/components/auth/WelcomeKiteOnboardingModal.tsx`, `src/app/api/auth/field-user/complete-onboarding/route.ts` | `src/test/assessment-category-selection.test.tsx`, `src/test/district-combobox.test.tsx` | None (Google OAuth removed from field worker journey; State invitation code enforced) | State Team policy on invitation code expiration & regeneration |
| **Field Worker Mobile OTP Verification at Registration** | *Specification drafted in Section 4 below.* Local prototype uses server challenge model (`stateTeamAuthChallenge.ts`). | Unit test stubs for challenge issuance | Server-side `knadh/otpgateway` adapter & delivery transport | Approve provider (WhatsApp Business API vs India DLT SMS) |
| **Returning Field Worker Sign-In via Mobile OTP** | *Architecture detailed in Section 5 below.* Profile lookup by verified mobile / worker ID. | Mock recovery flow tests | Deployment of `knadh/otpgateway` microservice | Confirm session duration (default: 30-day sliding refresh vs 8-hour shift) |
| **No Field Worker Password or Email Requirement** | Enforced across `WelcomeKiteOnboardingModal.tsx` and `ProfileMenu.tsx`. Field worker profiles store `mobile`, `name`, `state`, `district`, `srName`, `ssrName`, `workerId`. Zero password/email fields. | Verified via TypeScript schema and build assertions | None (Complete) | None |
| **State Team & Leadership Email OTP** | Production-verified: `src/lib/server/stateTeamAuthChallenge.ts`, `src/app/api/auth/state-team/verify-otp/route.ts`, `src/features/leadership-reporting/leaderAuthStore.ts` | `src/test/state-evaluation-access.test.ts`, `src/test/unified-session-cookie.test.ts` (100% passing) | None (Unchanged and operational) | None |
| **knadh/otpgateway Server-Side Adapter** | Specifications in Section 3; adapter scaffold ready in `src/lib/server/otpgatewayAdapter.ts` | Unit mocks for HTTP contract | Provisioning of Cloud Run instance or sidecar container | Select deployment topology (Cloud Run microservice vs container sidecar) |
| **Real Approved Delivery Provider** | Integration contracts documented for Meta Cloud API (WhatsApp) and Infobip / Exotel | Mock transports | Provider account signup, API tokens, TRAI DLT template registration | Selection of vendor & payment account authorization |
| **Assisted State-Assisted Account Recovery for Lost/Replaced Phone** | Protocol documented in Section 6; API endpoints specified for State Coordinator review | Stub tests for state-scoped recovery requests | Approval of State Coordinator operational SOP | Authorize State Reviewer identity re-verification authority |

---

## 2. Technical Audit of `knadh/otpgateway`

### 2.1 Overview & Provenance
- **Repository:** `https://github.com/knadh/otpgateway`
- **Author:** Kailash Nadh (CTO, Zerodha)
- **License:** Apache 2.0 / MIT
- **Language:** Go (Golang)
- **Design Philosophy:** Self-hosted, lightweight, high-throughput microservice for generating, storing, verifying, and dispatching one-time passwords via pluggable HTTP and SMS/email providers.

### 2.2 Core Architectural Capabilities
1. **Separation of Concerns:**
   - Central application handles business logic; `otpgateway` handles OTP generation, cryptographic hashing, TTL expiration, retry counting, and transport dispatch.
   - Applications communicate with `otpgateway` over an internal REST API authenticated via an API secret token (`Header: Authorization: Bearer <SECRET>`).
2. **Pluggable Storage Engines:**
   - **In-Memory:** Embedded store (suitable for single-instance local testing).
   - **Redis / KeyDB:** Highly recommended for distributed Cloud Run deployments. Supports atomic TTL expiration, zero database locks, and rapid key deletion upon successful verification.
   - **PostgreSQL / MySQL:** Relational persistence with transaction boundaries.
3. **Pluggable Message Transports:**
   - Native support for generic HTTP webhooks, allowing seamless connection to:
     - Meta Cloud API (WhatsApp Business Platform)
     - Infobip HTTP API
     - Gupshup / Exotel / Kaleyra (India DLT-compliant SMS)
     - AWS SNS
4. **Security & Cryptographic Guarantees:**
   - **Cryptographic Randomness:** Tokens generated using Go's `crypto/rand` (PRNG), avoiding predictable sequences.
   - **Hashing at Rest:** OTP values can be stored as HMAC-SHA256 digests; plaintext tokens are never written to disk or database logs.
   - **Single-Use Consumption:** Successful verification immediately purges the OTP record (`DELETE` or Redis `DEL`), preventing replay attacks.
   - **Max Attempts & Lockout:** Automatically invalidates the challenge if incorrect codes exceed the threshold (default: 3 attempts).
   - **Rate Limiting:** Inherent rate limits per recipient namespace (e.g., maximum 1 OTP per 60 seconds per phone number, maximum 5 OTPs per day).

---

## 3. Deployment Topologies for Google Cloud Platform

We evaluate two production-ready deployment topologies on GCP (Project `cs-p3-production`):

```
TOPOLOGY A: DEDICATED PRIVATE CLOUD RUN MICROSERVICE (RECOMMENDED)

[ Next.js PWA ] 
      │ (HTTPS via VPC Connector)
      ▼
[ otpgateway Microservice ] ──(Private IP)──► [ Cloud Memorystore Redis ]
      │
      ├──► [ WhatsApp Business API (Meta) ]
      └──► [ India SMS DLT Gateway (Exotel/Gupshup) ]
```

### Topology Comparison

| Factor | Topology A: Dedicated Cloud Run Microservice | Topology B: Sidecar Container in App Pod |
| :--- | :--- | :--- |
| **Architecture** | Independent Cloud Run service (`csc-otp-gateway`) on private VPC | Multi-container Cloud Run deployment sharing localhost network |
| **Scalability** | Scales independently based on authentication load | Scales with the main Next.js web application |
| **Isolation** | OTP secrets and Redis connection strings completely isolated from main web container | Shared container execution environment |
| **Operational Overhead** | Requires separate Cloud Run deployment pipeline | Single unified deployment pipeline |
| **Recommendation** | **STRONGLY RECOMMENDED for Production** | Suitable for low-traffic staging |

---

## 4. Server-Side Adapter Architecture (`otpgatewayAdapter.ts`)

To strictly prevent any client-side OTP bypass or token leakage, the Next.js frontend NEVER communicates directly with `otpgateway`. All calls route through an authenticated Next.js Server Route.

```
Client Browser ────────► /api/auth/field-user/request-otp ────────► otpgateway Adapter ────────► knadh/otpgateway
(Phone Number)                 (Server-side Rate Limit)             (Internal Secret)              (Generates & Sends)
```

### 4.1 Internal API Contract

#### 1. Request OTP (`POST /api/otp/generate`)
- **Request from Next.js Adapter:**
  ```json
  {
    "namespace": "field_worker_auth",
    "id": "+919822019283",
    "channel": "whatsapp",
    "template": "childcare_login_otp",
    "params": {
      "app_name": "Alliance Childcare PWA"
    }
  }
  ```
- **Response from `otpgateway`:**
  ```json
  {
    "status": "success",
    "data": {
      "id": "+919822019283",
      "expires_at": "2026-11-17T17:45:00Z"
    }
  }
  ```
- **Response to Browser:**
  ```json
  {
    "status": "success",
    "message": "Verification code sent to registered number",
    "cooldownSeconds": 60,
    "maskedRecipient": "+91 ******9283"
  }
  ```
  *(Notice: The actual OTP is NEVER exposed to the browser or logged).*

#### 2. Verify OTP (`POST /api/otp/verify`)
- **Request from Next.js Adapter:**
  ```json
  {
    "namespace": "field_worker_auth",
    "id": "+919822019283",
    "otp": "749201"
  }
  ```
- **Response from `otpgateway`:**
  ```json
  {
    "status": "success",
    "data": {
      "verified": true
    }
  }
  ```
- **Action on Verification:**
  - Mark mobile number as verified in Firestore `field_worker_profiles`.
  - Issue cryptographically signed, HTTP-only session cookie (`csc_field_session`).
  - Return worker profile details to client.

---

## 5. Returning Worker Sign-In & Phone Recovery Journey

### 5.1 Returning Worker Journey (Same Mobile Number)
1. Worker clicks **"Already registered? Sign In"**.
2. Worker enters 10-digit mobile number.
3. Server validates mobile format, checks Firestore registry, and calls `otpgateway` to dispatch a 6-digit OTP via WhatsApp.
4. Worker enters 6-digit OTP.
5. Server verifies OTP via `otpgateway`.
6. Server restores the worker's existing `workerId`, assigned state, district, SR, and SSR.
7. Existing drafts and local outbox items belonging to that `workerId` remain accessible.

### 5.2 Lost / Replaced Phone Journey (Assisted Recovery)
If a field worker loses their phone or changes their SIM card:
1. The worker contacts their assigned State Team Coordinator.
2. The State Coordinator opens **Supervisor Portal → Field Workers Directory → Worker Profile**.
3. State Coordinator verifies identity via organizational credentials and clicks **"Initiate Phone Number Reassignment"**.
4. State Coordinator enters the new mobile number and a justification note.
5. The system dispatches an authorization challenge to the State Coordinator's authenticated session AND a verification OTP to the worker's NEW phone number.
6. Once both are confirmed, Firestore updates the mobile binding under an immutable audit log (`AUDIT_RECOVERY_MOBILE_REASSIGNED`).
7. All historical assessments, author identifiers, and submissions are preserved with zero data loss.

---

## 6. Provider Selection & Regulatory Compliance

### 6.1 WhatsApp Business Platform (Meta Cloud API)
- **Pros:** 98%+ delivery success in rural/semi-urban India; bypasses telecom DLT SMS filters; end-to-end encrypted; familiar UI for caseworkers.
- **Cost:** ~₹0.30 - ₹0.40 per authentication conversation (Meta utility pricing for India).
- **Prerequisites:** Meta Business Manager verification, approved WhatsApp Template (`authentication` category with OTP button).

### 6.2 India Telecom DLT (SMS Fallback)
- **Pros:** Reaches basic feature phones without smartphone internet.
- **Cons:** TRAI DLT regulations require extensive registration (Entity ID, Sender Header e.g. `ALNCIN`, Registered Template with variable markers `{#var#}`).
- **Cost:** ~₹0.12 - ₹0.18 per SMS.

---

## 7. Owner Decisions Required Before Provisioning

Before activating real message delivery in staging or production, the project owner must provide decisions on the following four items:

1. **Primary Delivery Channel:**  
   *Option A:* WhatsApp Business API only (Recommended for smartphone-based PWA).  
   *Option B:* Dual-channel: WhatsApp primary with SMS fallback.
2. **Provider Selection:**  
   *Option A:* Direct Meta Cloud API (lowest per-message cost, requires direct Meta billing setup).  
   *Option B:* Infobip / Exotel (unified API for WhatsApp + SMS, simplified enterprise invoicing).
3. **Session Expiry Duration:**  
   *Option A:* 30-day sliding window (matches field realities in low-connectivity areas).  
   *Option B:* 7-day hard expiry with re-authentication requirement.
4. **Shared Device Policy:**  
   *Policy:* Should multiple caseworkers be permitted to register with the same phone number (e.g. shared NGO tablet), or must each phone number uniquely bind to exactly one `workerId`?  
   *Recommendation:* Unique phone binding per worker for cryptographic non-repudiation.
