# GCP Migration: Workload Analysis & Monthly Cost Estimate

**Target Region**: `asia-south1` (Mumbai, India)  
**Target User Base**: 50 active field workers, supervisors, and state leadership users per day  
**Currency**: Indian Rupees (INR) (approx exchange rate: 1 USD = 84.50 INR)

---

## 1. Hot-Path Read & Write Pattern Analysis

| Hot Path | Operations & Query Strategy | Daily Volume (50 users) | Monthly Volume (30 days) | Firestore Operation Type |
|---|---|---|---|---|
| **Evaluation Login** | 1 read to `evaluation_credentials` + 1 write to `auth_attempts` | ~55 logins/day | ~1,650 / month | 55 reads, 55 writes / day |
| **Leadership OTP Login** | 1 read to `leader_identities`, 1 write to `leader_otp_challenges`, 1 read to verify, 1 write to `leadership_sessions` | ~10 logins/day | ~300 / month | 20 reads, 20 writes / day |
| **Assessments Linelist** | `GET /api/submissions` with `limit=50`, filtered by `state` and ordered by `submissionTime desc` | ~50 queries/day (avg 30 docs/query) | ~1,500 queries / month | ~1,500 reads / day |
| **Dashboard Summary** | `GET /api/submissions/summary` using Firestore `count()` aggregation (1 read per 1,000 index entries) | ~60 queries/day | ~1,800 queries / month | ~120 reads / day |
| **Record View** | `GET /api/submissions/[submissionId]` reading submission document + attachment metadata | ~150 views/day | ~4,500 views / month | ~300 reads / day |
| **New Assessment / Sync** | `POST /api/submissions` or `/api/sync`: 1 submission write, 1 mirror queue write, 1-2 attachment records | ~200 submissions/day | ~6,000 records / month | ~600 writes / day |
| **Background Cron Worker** | `POST /api/workers/cron` every 15 min: drains `sheets_mirror_retry_queue` | 96 calls/day | ~2,880 calls / month | ~300 reads, ~100 writes / day |

### Aggregated Monthly Firestore Totals
- **Total Monthly Reads**: ~69,000 reads / month
- **Total Monthly Writes**: ~23,100 writes / month
- **Total Monthly Deletes (TTL cleanup)**: ~15,000 deletes / month
- **Database Size**: ~50 MB after 6 months of assessments

---

## 2. Google Cloud Service-by-Service Cost Breakdown

### A. Cloud Firestore (Native Mode, `asia-south1`)
- **Always-Free Tier**: 50,000 reads/day (1,500,000/mo), 20,000 writes/day (600,000/mo), 20,000 deletes/day, 1 GiB storage.
- **Project Usage**: 2,300 reads/day, 770 writes/day, 0.05 GiB storage.
- **Net Billable Usage**: **0 reads, 0 writes** (100% covered by Always-Free Tier).
- **Conservative Monthly Cost**: **₹0.00** (Free Tier) — Max ₹50.00 under burst.

### B. Google Cloud Run (`csc-staging` and `csc-production`)
- **Configuration**: 1 vCPU, 1 GiB RAM, scale-to-zero (`min-instances: 0`, `max-instances: 3`), CPU throttling enabled (CPU billed only while actively servicing requests).
- **Always-Free Tier**: 2,000,000 requests/mo, 360,000 vCPU-seconds/mo, 180,000 GiB-seconds/mo.
- **Project Usage**:
  - ~60,000 user requests + 2,880 cron calls = ~63,000 requests/month.
  - Average request latency: 150 ms (0.15s).
  - vCPU-seconds consumed: 63,000 * 0.15s = ~9,450 vCPU-seconds (Free Tier allowance: 360,000).
  - GiB-seconds consumed: 63,000 * 0.15s = ~9,450 GiB-seconds (Free Tier allowance: 180,000).
- **Conservative Monthly Cost**: **₹0.00** (Free Tier) — ₹150.00 if scale-out occurs during intensive review windows.

### C. Google Cloud Storage (`cs-p3-childcare-production`)
- **Usage**: 200 submissions/day * 2 photos * 1.5 MB = ~600 MB/day = ~18 GB new binary data/month.
- **Storage Cost**: Standard Regional Storage in Mumbai is ₹1.95 / GB-month.
  - Month 1 (18 GB): ~₹35.00
  - Month 3 (54 GB): ~₹105.00
- **Operations Cost**:
  - Class A Operations (PUT/signed uploads): ~12,000 calls = ₹5.00
  - Class B Operations (GET/downloads): ~15,000 calls = ₹1.00
- **Conservative Monthly Cost**: **~₹110.00 / month**.

### D. Google Secret Manager
- **Usage**: 6 secret containers (`SESSION_SECRET`, `INTERNAL_AUTH_SECRET`, `CRON_SECRET`, `WEBHOOK_SECRET`, `GOOGLE_CLIENT_SECRET`, `LEADERSHIP_ALLOWLIST_JSON`).
- **Always-Free Tier**: 6 active secret versions are free. 10,000 API access operations/month free.
- **Conservative Monthly Cost**: **₹0.00** (100% covered by Free Tier).

### E. Google Cloud Scheduler
- **Usage**: 1 scheduled recurring cron job (`csc-staging-worker`).
- **Always-Free Tier**: 3 scheduled jobs per billing account per month are completely free.
- **Conservative Monthly Cost**: **₹0.00** (100% covered by Free Tier).

### F. Network Data Egress
- **Usage**: Total outbound bandwidth for Next.js JSON API responses and PWA application bundles is ~15 GB/month.
- **Always-Free Tier**: 100 GiB/month of internet egress worldwide is free from Google Cloud.
- **Conservative Monthly Cost**: **₹0.00** (100% covered by Free Tier).

### G. Firebase Hosting
- **Usage**: Edge SSL termination, static PWA asset caching, edge rewrites to Cloud Run.
- **Pricing**: Spark Free Tier covers 10 GB storage and 360 MB/day data transfer. Blaze Pay-as-you-go costs \$0.15/GB above free limits.
- **Conservative Monthly Cost**: **₹0.00 to ₹40.00 / month**.

---

## 3. Total Monthly Cost Summary

| Cloud Component | Always-Free Tier Coverage | Expected Monthly Cost (INR) | Conservative Upper Bound (INR) |
|---|---|---|---|
| **Cloud Firestore** | 100% Covered (< 5% of quota) | ₹0.00 | ₹50.00 |
| **Cloud Run** | 100% Covered (< 3% of quota) | ₹0.00 | ₹150.00 |
| **Cloud Storage (GCS)** | Partially Covered (5 GB free) | ~₹75.00 | ~₹120.00 |
| **Secret Manager** | 100% Covered (6 secrets free) | ₹0.00 | ₹0.00 |
| **Cloud Scheduler** | 100% Covered (3 jobs free) | ₹0.00 | ₹0.00 |
| **Network Egress** | 100% Covered (100 GB free) | ₹0.00 | ₹40.00 |
| **Firebase Hosting** | 100% Covered | ₹0.00 | ₹40.00 |
| **TOTAL** | — | **~₹75.00 / month** | **~₹400.00 / month** |

### Comparison to Legacy Architecture
- **Legacy Architecture**:
  - Vercel Pro Team: \$20.00 / member / month (~₹1,700 - ₹5,000 / month)
  - Supabase Pro Project: \$25.00 / month (~₹2,100 / month)
  - Tigris S3 Storage: \$5.00 / month (~₹420 / month)
  - **Legacy Total**: **~₹4,200 to ₹7,500 / month**
- **Google Cloud Platform Architecture**:
  - Consolidated into a single Indian enterprise billing invoice in `asia-south1`.
  - **Projected Savings**: **> 90% reduction in operating infrastructure cost**, while gaining enterprise-grade DPDP Act compliance, local Mumbai data residency, and SLA guarantees.
