# User-Facing Submission State Model

## 1. Allowed States & State Transitions

Technical queue and HTTP status codes are translated into 7 human-centered, worker-friendly states:

| User-Facing State | Meaning | Trigger / Condition |
|-------------------|---------|---------------------|
| `DRAFT` | Survey in progress | Active drafting |
| `SAVING` | Persisting snapshot to IndexedDB | Form finalisation submit |
| `SENDING` | Transmitting via gateway to API | Active HTTP in-flight |
| `SUBMITTED` | Confirmed remote acknowledgement | Server write confirmed |
| `WAITING_FOR_CONNECTION` | Stored locally, waiting for internet | Offline on device |
| `RETRYING` | Transient error, backoff active | Network drop, 503, 429 |
| `ACTION_REQUIRED` | User correction needed | Validation (422), auth (401), conflict (409) |

---

## 2. Field-Worker Vocabulary Dictionary

### Strict Allowed Phrases:
- **Online Submit**: *"Saving your assessment…"* -> *"Sending your assessment…"* -> *"Submitted successfully."*
- **Offline Save**: *"Saved on this device. It will send automatically when you reconnect."*
- **Temporary Failure**: *"Your assessment is safe on this device. We will try again automatically."*
- **Correction Needed**: *"One item needs correction before it can be submitted."*
- **Primary Action Button**: *"Open and correct"*
- **Secondary Retry Button**: *"Try again now"*
- **Device Storage Tab**: *"On Device"* / *"Saved on this device"*

### Strictly Prohibited Jargon in Worker UI:
- "Outbox"
- "Flush queue"
- "Manual sync required"
- "Needs attention"
- "Review record"
- "failed_final"
- "failed_retryable"
- "terminal"
- "HTTP 4xx / 5xx"
- "422"
- "OCC"
- "Idempotency"
- "Schema validation"
