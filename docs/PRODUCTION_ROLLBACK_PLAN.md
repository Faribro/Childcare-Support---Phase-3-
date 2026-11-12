# Production Rollback Plan — Childcare Support Phase 3

> **Strict Rule:** Production is frozen at commit `520f1a4` until explicit written user approval is given. Keep these exact rollback commands ready in case any regression occurs after a future approved release.

---

## 1. Vercel Production Rollback

| Item | Value |
|---|---|
| **Rollback Target Deployment ID** | `dpl_6Xv8Cq9MyUiQBcBH7Q8zLig8S9zU` |
| **Pinned Production Commit** | `520f1a4` (and prior verified baseline `5730702` referenced with `dpl_6Xv8Cq9MyUiQBcBH7Q8zLig8S9zU`) |
| **Vercel Project / Team** | `hashcode1/childcare-support-phase-3` |

### Command-Line Rollback (Fastest — < 30 seconds)
If logged in via `npx vercel login` (ensure stale `VERCEL_TOKEN` env var is unset in PowerShell if needed):
```powershell
$env:VERCEL_TOKEN = $null
npx vercel rollback dpl_6Xv8Cq9MyUiQBcBH7Q8zLig8S9zU --yes
```

### Verification After Vercel Rollback
1. Run `npx vercel ls --prod` to confirm `dpl_6Xv8Cq9MyUiQBcBH7Q8zLig8S9zU` (or promoted target `520f1a4`) is `Ready` as current Production.
2. Hit `/api/health` on the production domain and confirm HTTP `200` and `"status": "ok"`.
3. Confirm dashboard renders cleanly at desktop (`1440px`) and mobile (`390px`) and test a read-only login check.

---

## 2. Google Apps Script Rollback

| Item | Value |
|---|---|
| **Target Stable Production Script Version** | **Version `35`** |
| **Action Scope** | Only needed if an approved Apps Script change was deployed beyond Version 35 |

### Google Apps Script UI Rollback Steps
1. Open the production Apps Script project in Google Apps Script Editor.
2. Click **Deploy** -> **Manage deployments**.
3. Select the active **Web app** production deployment and click the **Edit** (pencil) icon.
4. Change **Version** back to **`Version 35`**.
5. Click **Deploy** (this preserves the same `/macros/s/.../exec` URL so no Vercel env var update is needed).

### Verification After Apps Script Rollback
1. Verify Vercel production env `APPS_SCRIPT_URL` still points to the same active deployment ID.
2. Check `/api/workers/sheets-mirror` (GET with admin/worker auth) to confirm pending mirror queue drains cleanly with no `4xx`/`5xx` schema errors.

---

## 3. Supabase Migration Safety
- Do **not** drop tables or run destructive resets during incident response.
- The new SR migration `supabase/migrations/20261112140000_state_sub_recipients_registry.sql` is additive (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) with service-role-only RLS and an idempotent seed function; rolling back app code alone leaves existing rows intact.
- If rolling back schema manually were ever required after an approved migration, first take a snapshot with `scripts/supabase-backup-and-preflight.js` before touching columns.
