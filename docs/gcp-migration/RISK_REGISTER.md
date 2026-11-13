# Childcare Support Phase 3: GCP Migration Risk Register

**Project**: Childcare Support Phase 3 (`cs-p3-production`)  
**Region**: `asia-south1` (Mumbai)  
**Target Cutover Stack**: Cloud Run (Container), Cloud Firestore Native, Cloud Storage V4 Signed URLs  
**Fallback Stack**: Vercel (`520f1a4`), Supabase (`rjrctsxdvkfkssqvmhbz`), Tigris S3, Apps Script Version 35  

---

## Executive Risk Matrix

| Risk ID | Risk Category | Severity | Likelihood | Impact Area | Mitigation Status |
|---|---|---|---|---|---|
| **RSK-01** | Upstream Mirror Limits (Apps Script) | HIGH | MEDIUM | Secondary Sheets Mirror | MITIGATED (Durable Retry Queue & Dead-Letter) |
| **RSK-02** | Geocoding Rate Limits (Nominatim) | MEDIUM | HIGH | Assessment Address Autocomplete | MITIGATED (Local Pincode Directory & Caching) |
| **RSK-03** | Missing Taluk Data in India Post | MEDIUM | HIGH | Geographic Aggregations & Filters | MITIGATED (Editable UI with "Verify" Flag) |
| **RSK-04** | Missing Firestore Composite Indexes | MEDIUM | LOW | Filtered Supervisor Queries | MITIGATED (Explicit Index Definitions & Tests) |
| **RSK-05** | Cloud Run Cold Starts & Latency | LOW | MEDIUM | Mobile Assessment Submissions | MITIGATED (Lazy Asset Loading, Concurrency 40) |
| **RSK-06** | Firestore Read Costs & Hot Paths | MEDIUM | LOW | Operating Costs & Budget | MITIGATED (100-Cap Pagination, Batching) |
| **RSK-07** | GCP Credit Expiration (Apr–Oct 2027) | HIGH | HIGH | Long-Term Infrastructure Billing | DOCUMENTED (Cost Estimation ₹75–400/mo) |
| **RSK-08** | Cloud Billing Account Verification | HIGH | MEDIUM | GCP Resource Provisioning | ACTION REQUIRED BY OWNER |
| **RSK-09** | Single-Owner Administrative Dependency | HIGH | HIGH | Deployment & Disaster Recovery | ACTION REQUIRED (Emergency Runbooks) |

---

## Detailed Risk Assessments & Action Plans

### RSK-01: Google Apps Script Concurrency & Execution Limits
- **Nature of Risk**: Google Workspace and Apps Script impose hard limits: ~30 concurrent execution threads and a 6-minute maximum execution timeout per trigger. Under sudden burst traffic (e.g., 50 field workers submitting surveys simultaneously after network recovery), direct calls to Apps Script will reject with HTTP 429 or 503.
- **Impact**: Without decoupling, primary survey submissions would fail for end users, or data would be lost.
- **Mitigation Implemented**:
  1. Cloud Firestore is the **primary authoritative datastore**. Write confirmation to the user happens immediately upon Firestore persistence.
  2. The Google Sheets mirror is **strictly asynchronous and non-blocking**.
  3. If Apps Script times out or fails, the submission is enqueued into `sheets_mirror_retry_queue` with an exponential backoff schedule (30s, 60s, 120s...).
  4. Cloud Scheduler executes `/api/workers/cron` every 15 minutes to drain pending retries in bounded batches of 25.
  5. Exhausted retries (>5 attempts) transition to `DEAD_LETTER` status with full diagnostic logging for supervisor review.
- **Residual Risk**: Low. Google Sheet mirror may lag by 15–30 minutes during upstream Google outages, but zero data is lost.

---

### RSK-02: OpenStreetMap Nominatim Rate Limits at Scale
- **Nature of Risk**: The Nominatim public geocoding API enforces a strict policy of **maximum 1 request per second** and prohibits bulk geocoding. High-frequency client requests will result in HTTP 429 blocking.
- **Impact**: Beneficiary registration address autocomplete could fail, blocking intake forms.
- **Mitigation Implemented**:
  1. The application bundles an offline, pre-compressed India Post static pincode directory (`public/data/india-pincodes.json.gz`) covering all 19,152 Indian PIN codes.
  2. Pincode lookup is resolved locally in-memory on the client and server without making external HTTP calls.
  3. Reverse geocoding via `/api/geocode/reverse` applies a 60-second in-memory LRU cache and throttles outbound Nominatim queries.
  4. All address fields (State, District, Taluk, Village) remain completely editable manually if GPS or geocoding fails.
- **Residual Risk**: Low. Field workers can complete offline surveys with manual entry.

---

### RSK-03: Taluk Mapping Gaps in Official India Post Data
- **Nature of Risk**: The official open-data India Post dataset (`data.gov.in`) contains State, District, and Post Office names, but **lacks a standardized Taluk / Block column**.
- **Impact**: District-level reports and sub-district filtering could encounter inconsistent or missing taluk values.
- **Mitigation Implemented**:
  1. The static directory merges LGD-aligned State/District/Block mappings with community postal records.
  2. UI forms flag auto-populated Taluk names with a prominent `"Please verify"` tag.
  3. Field workers and supervisors have full permission to correct and save the authoritative Taluk name.
  4. Firestore indexes support queries with or without Taluk filters.
- **Residual Risk**: Medium. Ongoing field validation is required to ensure sub-district data hygiene.

---

### RSK-04: Missing Firestore Composite Indexes
- **Nature of Risk**: Cloud Firestore requires composite indexes for any query combining equality filters on one field, inequality filters on another, or multi-field sorting. Missing indexes cause queries to reject with `FAILED_PRECONDITION`.
- **Impact**: Supervisor analytics, state linelists, or filtered record views would throw errors in production.
- **Mitigation Implemented**:
  1. All composite query patterns are documented and declared in `firestore.indexes.json`.
  2. Indexes cover: `submissions` (scoped by state, district, status, and createdAt), `export_delivery_jobs`, and `sheets_mirror_retry_queue`.
  3. Vitest test suite `src/test/firestore-indexes.test.ts` validates that all production query shapes match registered indexes.
  4. Deployment command `firebase deploy --only firestore:indexes` is documented for both `staging` and `(default)`.
- **Residual Risk**: Low. Pre-deployment index generation prevents runtime failures.

---

### RSK-05: Cloud Run Cold Starts & Mobile Latency
- **Nature of Risk**: When Cloud Run instances scale down to zero (`min-instances=0`), an inbound request incurs container startup latency (typically 1.5–3.5 seconds).
- **Impact**: First-time page loads on 3G/4G field mobile connections may feel sluggish.
- **Mitigation Implemented**:
  1. Next.js standalone container packaging reduces the image footprint to ~180 MB.
  2. Large static assets (e.g. `india-pincodes.json.gz`) are strictly lazy-loaded on demand and never loaded at module boot.
  3. Container concurrency is configured to 40 requests per instance, allowing active instances to serve parallel traffic without spinning up new containers.
  4. Production can optionally set `--min-instances=1` during business hours (9 AM – 6 PM IST) to eliminate cold starts entirely.
- **Residual Risk**: Low. PWA service worker caches core UI assets on client devices.

---

### RSK-06: Firestore Read Amplification & Operating Costs
- **Nature of Risk**: Firestore charges $0.06 per 100,000 document reads. Unbounded dashboard queries or N+1 fetch loops could inflate monthly bills.
- **Impact**: Operational cost overruns.
- **Mitigation Implemented**:
  1. All supervisor linelist and record endpoints are paginated and hard-capped at **maximum 100 records per page**.
  2. Summary endpoints (`/api/submissions/summary`) utilize projection queries (`select('status', 'state')`) to minimize egress payload.
  3. Full cost analysis (`docs/gcp-migration/COST_ESTIMATE.md`) demonstrates that typical 50-user workloads consume ~2,300 reads/day, remaining well within the Firestore Free Tier (50,000 reads/day).
- **Residual Risk**: Low. Monthly cost remains between ₹75 and ₹400 ($1–$5).

---

### RSK-07: Google Cloud Credits Expiration (April – October 2027)
- **Nature of Risk**: Promotional Google Cloud credits will expire between April and October 2027.
- **Impact**: Project expenses will revert to standard credit card billing.
- **Mitigation Implemented**:
  1. The target architecture is designed to operate primarily within Google Cloud Free Tier quotas (2M Cloud Run requests/month free, 50K Firestore reads/day free, 5 GB Cloud Storage free).
  2. Anticipated net monthly cost after credit expiry is under ₹500/month.
  3. Budget alerts must be configured at ₹1,000 and ₹2,500 thresholds to prevent unexpected charges.
- **Residual Risk**: Low. Architected for ultra-low baseline operating cost.

---

### RSK-08: Cloud Billing Account Verification Pending
- **Nature of Risk**: GCP project `cs-p3-production` must have an active, verified billing account to enable Artifact Registry, Cloud Run custom domains, and Cloud Build.
- **Impact**: Cloud Build or container deployment will fail if the billing account is in trial or unlinked.
- **Action Required**: Project Owner must link an active payment profile in the Google Cloud Console prior to executing cutover.
- **Residual Risk**: Medium until verified by owner.

---

### RSK-09: Single-Owner Administrative Dependency
- **Nature of Risk**: All GCP IAM permissions, Firebase Project ownership, Domain DNS records (`allianceindia.org`), and Secret Manager values are controlled by a single project owner.
- **Impact**: In the event of owner unavailability, operational changes or emergency rollbacks could be blocked.
- **Mitigation Implemented**:
  1. Complete, self-contained runbooks written in standard PowerShell syntax (`OWNER_CHECKLIST.md`, `MIGRATION.md`).
  2. Zero secrets stored in repository; all environment variables cataloged in `.env.example`.
  3. Step-by-step rollback procedure to Vercel deployment `520f1a4` requiring no code changes.
  4. Recommendation: Add a secondary administrator service account or co-admin in GCP IAM.
- **Residual Risk**: Medium. Managed through comprehensive documentation.
