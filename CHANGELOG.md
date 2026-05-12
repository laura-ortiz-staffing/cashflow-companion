# Changelog

All notable changes to **Cashflow Companion** are documented here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dates use `YYYY-MM-DD`.

## [Unreleased] — 2026-05-08

### Added — Microsoft Graph two-way sync (foundation)
- **Migration** `supabase/migrations/20260508120000_graph_sync.sql`
  - New columns: `external_row_id`, `synced_at` on `invoices`, `petty_cash_balance`, `requests`.
  - New singleton table `graph_sync_state` (drive/item ids, subscription, status, errors, timestamps) with RLS.
  - `pg_net`-based trigger `notify_graph_push()` on the three tables (no-op while status ≠ `connected`).
  - `graph_mark_synced()` helper used by the pull function.
- **Shared helper** `supabase/functions/_shared/graph.ts` — token caching, `/shares` resolution, Excel Table CRUD, subscriptions.
- **Edge functions:**
  - `graph-bootstrap` — Super-Admin one-click: resolves the workbook from `MS_WORKBOOK_URL`, verifies tables, creates the Graph subscription, persists state.
  - `graph-push` — DB → Excel: receives webhook payload from the Postgres trigger and INSERT/UPDATE/DELETEs by key column.
  - `graph-pull` — Excel → DB: handles Graph subscription validation (`?validationToken=`), authenticates via `clientState`, and reconciles all three Excel Tables on every notification.
- **UI** [`src/routes/sync.tsx`](src/routes/sync.tsx) — replaced the placeholder "Microsoft Graph" tab with a live status panel (`GraphSyncPanel`) that streams `graph_sync_state` via Realtime and has a Connect / Reconnect button (super_admin only).
- **Config** `supabase/config.toml` — registered the three new functions; `graph-pull` runs with `verify_jwt = false` (Graph cannot present a Supabase JWT).
- **Docs** [`docs/AZURE_AD_SETUP.md`](docs/AZURE_AD_SETUP.md) (instructions for IT/Azure admin) and [`docs/GRAPH_SYNC.md`](docs/GRAPH_SYNC.md) (deploy / runbook / conflict policy).

### Security
- **Replaced `xlsx` (SheetJS `^0.18.5`) with `exceljs` (`^4.4.0`).**
  Resolves two unpatched CVEs in the npm distribution of SheetJS — Prototype Pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9). `npm audit` now reports **0 vulnerabilities**.

### Added
- New helper `src/lib/excel.ts` exposing:
  - `downloadWorkbook(wb, filename)` — browser-side workbook download via `Blob` + temporary `<a>` (ExcelJS has no `writeFile` in the browser).
  - `sheetToObjects(ws)` — converts an ExcelJS worksheet to an array of plain objects using row 1 as headers; transparently unwraps formula `.result` and rich-text `.text` cells.

### Changed
- `src/routes/sync.tsx`
  - Export of Invoices / Cash Inflows / Requests sheets now uses `ExcelJS.Workbook` + `worksheet.columns` + `addRows`.
  - Template download now uses ExcelJS.
  - Workbook import uses `wb.xlsx.load(buffer)` and the new `sheetToObjects` helper.
  - Date parsing simplified: ExcelJS returns native `Date` objects, removing the need for `XLSX.SSF.parse_date_code`.
  - Preview table now formats `Date` values as `YYYY-MM-DD` via `date-fns/format`.
- `src/routes/reports.tsx`
  - XLSX export migrated to ExcelJS columns + `addRows` + `downloadWorkbook`.

### Notes
- Bundle: ExcelJS adds ~2 MB to the `sync` chunk. If load time becomes an issue, switch to dynamic `await import("exceljs")` inside the export/import handlers.
- Behaviour: imported date cells now arrive as `Date` rather than Excel serial numbers; tested via fallback `String(dateRaw).slice(0, 10)` for plain text dates.

---

## Earlier history

The repository did not maintain a versioned changelog before this entry. Highlights derived from `git log` (in chronological order, oldest first):

- **Foundation** — initial scaffold with TanStack Start, React 19, Tailwind v4, shadcn/ui, Supabase auth, role model (`super_admin` / `admin_uploader` / `viewer`).
- **OCR auto-fill to inflows** — invoice upload pipeline added with the `extract-invoice` Supabase Edge Function (AI-driven invoice parsing).
- **Requests module & audit** — internal cash-request workflow plus `audit_logs` and `logAction` helper.
- **Super Admin request flow** — approval/rejection wiring for requests.
- **Excel Sync & WhatsApp** — multi-tab Excel import/export route and the WhatsApp bubble linking to a configured bot phone.
- **Multi-sheet import & PDF** — recognises `Invoices`, `Cash Inflows`, `Requests` sheets in one workbook; PDF export of reports via `jspdf` + `jspdf-autotable`.
- **Q&A tab & invite flow** — FAQ + AI-backed Q&A page (`qa-chat` Edge Function) and token-based invitations.
- **IVA FAQ entry** — added Colombian IVA explanation to the Q&A FAQ list.

> Tip: Going forward, prefer descriptive commit messages (`feat:`, `fix:`, `chore:` …) so this changelog can be regenerated mechanically.
