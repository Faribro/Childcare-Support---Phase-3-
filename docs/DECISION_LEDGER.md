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

---

## 2. Data Value Provenance Policy

Every data value shown, stored, computed, or sent in the platform must have an identifiable source:

| Data Value Category | Permitted Sources | Prohibited Sources | Verification Mechanism |
| :--- | :--- | :--- | :--- |
| **Linelists & Cohort Records** | Authoritative canonical spreadsheet headers / SQLite / Supabase read models. | Ad-hoc unvalidated JSON; scraped data; production beneficiary PII. | Schema validators (`canonicalSubmissionSchema.ts`, `reportingEmailContract.ts`). All test records tagged `isSynthetic: true`. |
| **Beneficiary Identifiers** | Form intake generation via UUIDv4 / canonical sequential ID. | Hardcoded real names or phone numbers. | DPDP Act masking transforms (`maskReportRowPII_`, `maskPhoneNumber`). |
| **Financial / Bank Values** | User-submitted string representation preserving leading zeros. | JavaScript `Number` conversion (which strips leading zeros). | Unit tests verifying string typing (`typeof account === 'string'`). |
| **Audit & Security Metadata** | Request IP header, user session context, ISO 8601 UTC timestamp. | Client-supplied timestamps for server verification. | Server-generated timestamps (`new Date().toISOString()`). |

---

## 3. Open Decisions & Blockers

1. **Travelling-Record Animation Specification**:
   - *Status*: Open / Deferred.
   - *Requirement*: Detailed visual brief / storyboard for the *Record → Save offline → Sync* travelling-record animation sequence before resumption.
2. **Meta Developer App Publication**:
   - *Status*: Pending administrative action.
   - *Requirement*: The Meta App is currently unpublished (Development Mode), which restricts live message delivery from external test numbers.
3. **PR Merge Sequence**:
   - *Status*: Awaiting Maintainer Approval.
   - *Sequence*: PR #82 (Bank Queue) and PR #83 (Leadership Auth) are validated jointly in `Childcare-Combined`. PR #85 (Landing) is isolated. Maintainer merge order to be confirmed.
