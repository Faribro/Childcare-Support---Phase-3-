# Canonical Submission Pipeline — Test Evidence

## 1. Test Suite Summary

- **Total Test Files**: 18
- **Total Tests Passed**: 223
- **Total Tests Failed**: 0
- **Execution Date**: 2026-09-10

---

## 2. Integration Test Coverage (canonical-pipeline-integration.test.ts)

| Scenario | Description | Result |
|----------|-------------|--------|
| **Scenario A** | Standard new submission (CREATE -> immediate worker dispatch -> ack persistence -> read model update) | PASSED |
| **Scenario B** | Server acknowledgement truthfulness (remains unacknowledged locally until valid ack received) | PASSED |
| **Scenario C** | Temporary failure (network / 503 stays `failed_retryable` indefinitely, bounded backoff, high retryCount does not promote to action-required) | PASSED |
| **Scenario D** | Validation failure (422 immediately transitions to ACTION_REQUIRED, never retried) | PASSED |
| **Scenario E** | Confirmed UPDATE (valid UUID remote ID + version 1 -> gateway PATCH -> version 2) | PASSED |
| **Scenario F** | Invalid UPDATE identity guard (missing / ART ID -> never POST, never PATCH, quarantined to ACTION_REQUIRED) | PASSED |
| **Scenario G** | Mutex / single worker (concurrent calls yield, no double-dispatch) | PASSED |
| **Scenario H** | Lifecycle resume (`resumeOnHydration` drains queued items on app init) | PASSED |

---

## 3. Regression Guard Verification

- **T15 Business ID in PATCH URL**: `ART-TEST-0001`, `DL-SOU-101550-01`, `WB-KOL-081255-01`, `MH-PUN-050003-02` are rejected by `buildUpdateRequest` and `assertValidRemoteSubmissionId` before any HTTP call.
- **Zero Runtime UI SyncOrchestrator Calls**: Verified via comprehensive static analysis.
