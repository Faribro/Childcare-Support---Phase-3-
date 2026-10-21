# Decision Ledger: Child Nutrition PWA (Phase 3)

Last Updated: 2026-10-15 (Overnight Cycle 1)

---

## 1. Architectural & Integration Decisions

| ID | Topic | Decision | Justification | Evidence / File | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEC-01** | Landing Motion Scope | Implement multi-phase entrance and Whole-Child 5-domain terrain path drawing; explicitly **defer** *Record → Save offline → Sync* travelling-record animation. | The travelling-record animation requires an agreed storyboard with visual review before implementation; domain path provides immediate spatial grounding without risking unapproved motion changes. | PR #85; `NotebookHero.tsx`, `WholeChildSnapshot.tsx` | **Approved & In PR #85** |
| **DEC-02** | Zero-JS Fallback | Native HTML `<details>` and `<summary>` elements for FAQs; CSS `@media (prefers-reduced-motion)` and conditional motion arming for reveals. | Ensures full content accessibility, search indexing, and disclosure interactivity when JavaScript is disabled or crashes. | `FieldFaq.tsx`, `Reveal.tsx`, `landing-no-js-actual.png` | **Approved & In PR #85** |
| **DEC-03** | Stage Readiness & Bank Queue | Decouple bank account information from intake completeness; enforce string preservation for account numbers with leading zeros; OCC modal for updates. | Field officers collect demographic and clinical data without delaying initial submission for bank passbooks; accounting staff update records subsequently. | PR #82; `submissionStages.ts`, `BankDetailsEntryModal.tsx` | **Approved & In PR #82** |
| **DEC-04** | Leadership Auth & PostgREST | PostgreSQL 15 RLS policies, advisory locks for single active session constraint, fail-closed `LEADERSHIP_EMAIL_AUTH_ENABLED=false` default. | Provides defense-in-depth isolation for sensitive supervisory records with zero secret exposure in logs or responses. | PR #83; `003_leadership_email_auth.sql`, `leaderAuthStore.ts` | **Approved & In PR #83** |
| **DEC-05** | WhatsApp Integration Model | Isolated receive-only webhook endpoint (`/api/integrations/whatsapp/webhook`). Constant-time HMAC-SHA256 signature verification before JSON parsing. | Prohibits untracked outbound messaging or graph mutations while providing a verified receiver for Meta App Dashboard test events. | PR #84; `whatsappWebhookVerifier.ts`, `whatsappWebhookParser.ts` | **Approved & In PR #84** |
| **DEC-06** | Reporting Email Delivery Contract | Client-provided idempotency keys with 24-hour TTL in `CacheService` / memory store. Domain-restricted recipient allowlist (`@allianceindia.org`). Max attachment size 10MB (CSV/PDF only). | Protects against duplicate email dispatch on network retries; enforces DPDP Act data minimization; respects MailApp daily quota limits. | `reportingEmailContract.ts`, `reportingEmailDelivery.ts`, `ReportingEmailService.js` | **Implemented & Tested (90/90 tests)** |
| **DEC-07** | Provenance Honesty & Delivery Claim Guard | Never replace failed live queries with synthetic data while presenting them as live. Report upstream acceptance status (`ACCEPTED_FOR_DELIVERY` or `DRY_RUN_ACCEPTED`) only; strictly prohibit claiming `DELIVERED_TO_INBOX`. | Protects executive trust; prevents misleading claims about mailbox receipt when SMTP/Apps Script transport only knows transmission acceptance. | `reportingEmailContract.ts`, `reportingEmailDelivery.ts`, `REPORTING_DATA_EMAIL_HANDOFF.md` | **Approved & Enforced in Pipeline** |
| **DEC-08** | Staging Linelist Fixtures & Offline Simulation Bridge | Provide 50 diverse synthetic records adhering to 73-column schema tagged `isSynthetic: true`. Fails closed if caller requires live data (`liveOnly: true`). | Enables full end-to-end simulation of leadership surveillance queries and CSV/PDF export workflows offline without contacting live Google Apps Script. | `fixtures/staging-linelist-synthetic.json`, `reportingEmailDelivery.ts` (`loadStagingLinelistFixtures`, `executeStagingReportingQuery`) | **Implemented & Tested** |
| **DEC-09** | WhatsApp Document Media Retrieval Worker | Secure retrieval of incoming media bytes from WhatsApp Graph API, validating 10MB limit, MIME type allowlist (`image/jpeg`, `image/png`, `application/pdf`), SHA-256 byte integrity, path traversal sanitization, and structured storage under `<ChildName> - <SubmissionId>`. | Closes architectural gap between incoming WhatsApp media webhooks and cloud drive storage; eliminates unauthenticated file storage risks. | `src/lib/server/whatsappMediaWorker.ts`, `src/test/whatsapp-media-worker.test.ts` | **Implemented & Tested (15/15 tests)** |
| **DEC-10** | Document Storage vs. Verification Separation & Rollback Compensation | Storing valid media bytes transitions status to `UPLOADED` (not `VERIFIED`); only authorized supervisor review marks `VERIFIED`. Magic bytes inspection enforced. Storage automatically deletes uploaded file if DB linkage fails. Restart durability enforced via `IDurableDocumentLoopStore`. | Eliminates false verification from arbitrary valid bytes; prevents orphaned cloud storage; guarantees exactly-once event processing surviving server restarts. | `whatsapp-document-loop-service.ts`, `media-validator.ts`, `persistence.ts`, `document-loop.test.ts` | **Implemented & Tested (72/72 tests)** |
| **DEC-11** | Leadership Phone-to-Identity Cryptographic Binding & Excel Linelist Export | WhatsApp number must match pre-verified leadership binding in `leadership_whatsapp_bindings`. Text-based email claims in chat fail closed. Linelist export generated as valid OpenXML `.xlsx` with Google Drive document hyperlinks (`Col 6, 25, 26, 27, 64, 65`). Two-phase export confirmation with 5-minute TTL, SHA-256 parameter integrity hash, single-use replay protection (`isConsumed: true`), OWASP formula injection sanitization (`sanitizeCellValue`), and execution-time authorization enforcement. | Prevents caller impersonation / privilege escalation; protects spreadsheet clients from formula injection (CWE-1236); delivers formatted Excel files directly to registered executive email without exposing beneficiary PII or raw documents over chat. | `leadership-whatsapp-binding.ts`, `linelist-excel-generator.ts`, `meta-whatsapp-client.ts`, `export-contract-service.ts`, `reporting-email-dispatcher.ts` | **Implemented & Tested (82/82 tests)** |

---

## 2. Data Value Provenance Policy

Every data value shown, stored, computed, or sent in the platform must have an identifiable source:

| Data Value Category | Permitted Sources | Prohibited Sources | Verification Mechanism |
| :--- | :--- | :--- | :--- |
| **Linelists & Cohort Records** | Authoritative canonical spreadsheet headers / SQLite / Supabase read models. | Ad-hoc unvalidated JSON; scraped data; production beneficiary PII. | Schema validators (`canonicalSubmissionSchema.ts`, `reportingEmailContract.ts`). All test records tagged `isSynthetic: true`. |
| **Beneficiary Identifiers** | Form intake generation via UUIDv4 / canonical sequential ID. | Hardcoded real names or phone numbers. | DPDP Act masking transforms (`maskReportRowPII_`, `maskPhoneNumber`). |
| **Financial / Bank Values** | User-submitted string representation preserving leading zeros. | JavaScript `Number` conversion (which strips leading zeros). | Unit tests verifying string typing (`typeof account === 'string'`). |
| **Audit & Security Metadata** | Request IP header, user session context, ISO 8601 UTC timestamp. | Client-supplied timestamps for server verification. | Server-generated timestamps (`new Date().toISOString()`). |

4. **DEC-004: Storage vs Verification Separation & Tigris Reconciliation**:
   - *Status*: Approved & Implemented.
   - *Details*: Ingesting and storing media bytes (whether in Tigris S3 or Google Drive) transitions document status to `UPLOADED` / `DOCUMENTS_RECEIVED` (`isVerified: false`). It does NOT equal verification. Only authorized caseworker/supervisor review sets `VERIFIED` (`isVerified: true`). Linelist cells store sanitized proxy URLs (`/api/submissions/[id]/asset?docType=...`) preventing leakage of private storage keys or presigned tokens.
5. **DEC-005: Outbound WhatsApp Sender & E.164 Resolution**:
   - *Status*: Approved & Implemented.
   - *Details*: Outbound sender adapter strictly requires valid international E.164 format (`^\+[1-9]\d{7,14}$`). Masked strings (`******0170`, `XXXXXX0170`) are rejected fail-closed. Outcomes explicitly categorize `ACCEPTED_BY_GATEWAY` (2xx), `FAILED` (4xx), and `UNCERTAIN` (5xx/timeouts), preventing false claims of delivery across distributed boundaries.
6. **DEC-006: Local Persistence Fail-Closed in Production**:
   - *Status*: Approved & Implemented.
   - *Details*: File-based stores (`PersistentWebhookHandoffQueue`, `PersistentFileIdempotencyStore`, `PersistentFileOutboundRegistry`) persist to `.cache/` and are labeled `LOCAL_DEVELOPMENT_ONLY`. If initialized in `NODE_ENV === 'production'` without explicit test flag, they throw `STORAGE_UNCONFIGURED`. Cloud-durable schema is codified in migration `004_durable_integration_queues.sql`.

---

## 3. Open Decisions & Blockers

1. **Meta Developer App & Webhook Verification**:
   - *Status*: Pending administrative action.
   - *Requirement*: Meta App in Development Mode requires test phone numbers explicitly registered as testers.
2. **Cloud Infrastructure Provisioning**:
   - *Status*: Pending infrastructure deployment.
   - *Requirement*: Staging PostgreSQL 15 / Supabase instance for migration 004, Tigris S3 bucket provisioning, and Zoho Catalyst CLI credentials.
3. **Travelling-Record Animation Specification**:
   - *Status*: Open / Deferred.
   - *Requirement*: Detailed visual brief / storyboard for the *Record → Save offline → Sync* travelling-record animation sequence.
