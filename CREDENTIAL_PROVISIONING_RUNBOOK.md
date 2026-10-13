# Credential Provisioning & Rotation Runbook

## 1. Overview & Operational Principles

This runbook defines the controlled procedure for provisioning, rotating, and deactivating shared evaluation credentials for the **Child Nutrition & Caregiver Support PWA (Phase 3)**.

### Mandatory Security Constraints
1. **Never commit plaintext credentials** or salts to source control, git branches, PR descriptions, or chat.
2. **Never print plaintext passwords to build outputs or public CI logs**.
3. **Entropy requirement**: Passwords must be generated with cryptographically secure randomness (`crypto.randomBytes`) with at least 24 characters (exceeding the 16-character minimum).
4. **Argon2id Hashing**: Password hashes must be created with OWASP-recommended parameters:
   - Algorithm: Argon2id (RFC 9106 PHC string `$argon2id$...`)
   - Memory cost: 65,536 KiB (64 MiB)
   - Iterations (Time cost): 3
   - Parallelism: 4 threads
   - Salt: 16 cryptographically random bytes per credential
5. **Secure Delivery Destination Required**: Plaintext credentials must only be exported directly to an approved password manager (e.g. Bitwarden/1Password team vault) via `--delivery-vault`. If no approved vault is available, **stop provisioning immediately**.

---

## 2. Pre-Provisioning Checklist

Before executing any provisioning command:
- [ ] Explicit Owner Approval obtained for credential provisioning.
- [ ] Supabase database migration `20261013170000_evaluation_credential_registry.sql` has been applied and verified in Supabase.
- [ ] Secure delivery destination designated (e.g., `vault://alliance-pm/childcare-pwa/`).
- [ ] Service role credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) securely available in server environment.

---

## 3. Step-by-Step Provisioning Procedure

### Step 3.1: Dry-Run Inspection
Execute a dry-run to inspect the planned credentials and verify that the generator operates without exposing secrets:

```bash
npx ts-node scripts/admin/provision-evaluation-credentials.ts --dry-run
```

**Expected Output**:
- Displays the list of canonical state credentials (`STATE-MH`, `STATE-WB`, `STATE-DL`, `STATE-KA`, `STATE-TN`, `STATE-GJ`, `STATE-TG`, `STATE-UP`).
- Displays the leadership credential (`LEADERSHIP-ALL`).
- Confirms password entropy and Argon2id parameters.
- Outputs **zero** plaintext passwords or hashes to terminal stdout.

### Step 3.2: Live Provisioning with Secure Vault Export
When approved, run the provisioning utility with the designated secure vault path:

```bash
npx ts-node scripts/admin/provision-evaluation-credentials.ts \
  --delivery-vault="vault://alliance-pm/childcare-pwa/"
```

The utility:
1. Generates 24-character random passwords in memory.
2. Computes OWASP Argon2id hashes.
3. Inserts credential records into Supabase `public.evaluation_credential_registry`.
4. Exports the plaintext passwords directly to the encrypted vault destination.
5. Zero plaintext credentials remain on the local filesystem or terminal screen.

---

## 4. Credential Rotation Procedure

When a state team changes, a credential reaches its scheduled expiry, or suspected unauthorized disclosure occurs:

### Step 4.1: Rotate Single Credential
To rotate a specific state credential (e.g. Maharashtra):

```bash
npx ts-node scripts/admin/provision-evaluation-credentials.ts \
  --rotate="STATE-MH" \
  --delivery-vault="vault://alliance-pm/childcare-pwa/"
```

### Step 4.2: Invalidation Verification
Rotating the credential:
1. Increments `credential_version` from `N` to `N + 1`.
2. Sets `rotated_at = NOW()`.
3. Replaces `password_hash` with the newly generated hash.
4. **Instantly invalidates all existing sessions**: Tokens bearing version `N` are rejected on their next API request with HTTP 401.

---

## 5. Credential Deactivation Procedure

To immediately revoke access for an inactive state without generating a replacement password:

```bash
npx ts-node scripts/admin/provision-evaluation-credentials.ts \
  --deactivate="STATE-XX"
```

The database updates `is_active = FALSE`. The session service immediately terminates all active sessions associated with that access identifier.

---

## 6. Metadata Reconciliation with Google Sheets

After provisioning or rotating credentials, update the Google Sheets metadata mirror:

```bash
npx ts-node scripts/admin/setup-passwords-sheet-tab.ts --reconcile-mirror
```

This updates the `Credential Version`, `Last Rotated At`, and `Provisioning Status` columns on the `passwords` tab **without writing any secrets or hashes**.
