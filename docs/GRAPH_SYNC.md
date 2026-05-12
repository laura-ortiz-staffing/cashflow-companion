# Microsoft Graph (SharePoint Excel) two-way sync

Production runbook for the integration between Cashflow Companion and a SharePoint-hosted Excel workbook.

## How it works (short version)

```
┌─ Postgres ──────────────────────────┐         ┌─ SharePoint Excel ─────┐
│ AFTER triggers on invoices /        │         │ User edits workbook    │
│ petty_cash_balance / requests       │         │                        │
│        │                            │         │ MS Graph emits         │
│        ▼ pg_net.http_post           │         │ change notification    │
│  edge fn  graph-push  ─── POST ───→ │ ─────→  │                        │
│                                     │         │                        │
│  edge fn  graph-pull  ←── POST ──── │ ←─────  │                        │
│        │ reconcile by key column    │         │                        │
│        ▼                            │         │                        │
│  UPDATE Postgres + synced_at        │         │                        │
└─────────────────────────────────────┘         └────────────────────────┘
```

- DB → Excel: AFTER triggers on three tables call `graph-push` via `pg_net`. Latency ~2–5 s.
- Excel → DB: `graph-pull` is the public webhook Graph calls when the workbook changes. We re-read the three Excel Tables and reconcile by key column.
- Loop avoidance: `synced_at` tracking + the trigger filters out updates that only touched `synced_at`.

## Prerequisites

1. **Azure AD app registration** with admin consent. See [`AZURE_AD_SETUP.md`](AZURE_AD_SETUP.md). You need:
   - `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`
   - `MS_WORKBOOK_URL` (the SharePoint sharing link)
2. **Excel workbook** with three formal Tables (Insert → Table). Default expected names — override with env vars if your workbook differs:
   - `tblInvoices` → `MS_TABLE_INVOICES`
   - `tblCashInflows` → `MS_TABLE_INFLOWS`
   - `tblRequests` → `MS_TABLE_REQUESTS`
3. **Required Excel columns** (case-insensitive):
   - **Invoices:** `Invoice Number`, `Vendor`, `Date`, `Amount`, `Category`, `Status`, `Notes`
   - **Cash Inflows:** `ID`, `Date`, `Type`, `Amount`, `Description`
   - **Requests:** `ID`, `Title`, `Amount`, `Currency`, `Category`, `Status`, `Description`, `Date`
   - The `ID` column on Cash Inflows / Requests is the database UUID — keep it as a hidden column or just don't edit it manually.
4. **Supabase Vault** entry for the service-role key, used by the DB trigger:
   ```sql
   select vault.create_secret('<service_role_jwt_here>', 'graph_service_role_key');
   ```
   Get the JWT from Supabase Dashboard → Project Settings → API → `service_role`.
5. **`app.settings.graph_push_url`** Postgres setting:
   ```sql
   alter database postgres set app.settings.graph_push_url
     = 'https://<your-project-ref>.supabase.co/functions/v1/graph-push';
   ```
   (Run as a one-off in the SQL editor. Restart the database connection or open a new SQL tab to pick it up.)

## Deploy

```powershell
# 1. Apply schema
supabase db push

# 2. Set secrets (one-time)
supabase secrets set `
  MS_TENANT_ID=<tenant_id> `
  MS_CLIENT_ID=<client_id> `
  MS_CLIENT_SECRET=<client_secret> `
  MS_WORKBOOK_URL='https://staffingglobalorg.sharepoint.com/:x:/g/IQBase7E4...'

# 3. (Optional) Override table names if the workbook uses different names
supabase secrets set `
  MS_TABLE_INVOICES=tblInvoices `
  MS_TABLE_INFLOWS=tblCashInflows `
  MS_TABLE_REQUESTS=tblRequests

# 4. Deploy the three functions
supabase functions deploy graph-bootstrap
supabase functions deploy graph-push
supabase functions deploy graph-pull
```

## Connect (one-click from the UI)

1. Sign in as a Super Admin.
2. Go to **Excel Sync → Microsoft Graph** tab.
3. Click **Connect Microsoft Graph**. The bootstrap function will:
   - Resolve the workbook drive/item from `MS_WORKBOOK_URL`.
   - Verify the three Excel Tables exist.
   - Create a Graph change-notification subscription pointing at `graph-pull`.
   - Persist everything into `graph_sync_state` (status → `connected`).
4. Verify: edit a row in Excel → within ~5 s the DB updates and the dashboard refreshes (realtime).

## Subscription renewal

Microsoft Graph subscriptions on driveItems expire in **at most ~3 days**. The bootstrap creates a 2.5-day subscription. Click **Reconnect / renew subscription** before it expires, or set up a cron:

```powershell
supabase functions deploy graph-bootstrap
# In Supabase Dashboard → Edge Functions → Schedules, add:
#   Function: graph-bootstrap
#   Cron: "0 3 */2 * *"   (every 2 days at 03:00 UTC)
```

> Note: the cron job runs without a user JWT — if you adopt this you'll need a parallel admin entrypoint that bypasses the super_admin check. Easiest is a separate `graph-bootstrap-cron` function gated by a shared secret. Skip this for v1 and renew manually.

## Conflict policy

**Last-write-wins.** If the same row is edited in the app and the workbook within ~5 s, the most recent write at the database level survives. There is no merge logic. Operationally:

- The app should be the primary write surface for invoices, since approvals and audit logs only flow through the UI.
- The workbook is fine for ad-hoc edits to status, amount, notes, etc.

## Operational checks

| Symptom | Where to look |
|---|---|
| Status is `error` | Open the Microsoft Graph card — `last_error` is shown in the UI. Mirrors `graph_sync_state.last_error`. |
| Push works, pull doesn't | Subscription expired (`subscription_expires_at` is in the past). Click reconnect. |
| Pull works, push doesn't | The Postgres setting `app.settings.graph_push_url` is missing, or the Vault secret `graph_service_role_key` is missing/expired. |
| Endless echo | A migration changed the trigger logic. Re-apply `20260508120000_graph_sync.sql`. |
| `clientState mismatch` in logs | Subscription was recreated. Run reconnect. |

## Disconnecting

```sql
update public.graph_sync_state
   set status = 'disconnected', subscription_id = null
 where id = true;
```

This stops the DB trigger from firing pushes (the trigger checks the status). The Graph subscription will eventually expire on its own; if you want to delete it immediately, call DELETE `/subscriptions/{id}` from a temp script with the same client credentials.
