// graph-pull — SharePoint Excel → DB.
//
// Two responsibilities, on a single endpoint:
//   1. Subscription validation: when Graph creates the subscription it pings
//      this URL with ?validationToken=xxx. We must echo it as text/plain within
//      10 seconds (Graph rule).
//   2. Change notifications: Graph POSTs { value: [{ resource, clientState... }] }
//      whenever the workbook changes. We re-read the three Excel Tables and
//      upsert/delete in Postgres based on the keyed match.
//
// Auth: Graph cannot send a JWT. This function MUST be deployed with
// verify_jwt = false (see supabase/config.toml). We authenticate by checking
// clientState equals graph_sync_state.client_state.
//
// Loop avoidance: the DB trigger notify_graph_push() skips the outbound push
// when the only change is `synced_at`. Combined with the synced_at column being
// updated by graph_mark_synced after a pull, we avoid the BD → Excel echo.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { listTableColumns, listTableRows } from "../_shared/graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIES = [
  "office_supplies", "travel", "meals", "transport",
  "utilities", "maintenance", "marketing", "other",
];

function tableNames() {
  return {
    invoices: Deno.env.get("MS_TABLE_INVOICES") ?? "tblInvoices",
    inflows: Deno.env.get("MS_TABLE_INFLOWS") ?? "tblCashInflows",
    requests: Deno.env.get("MS_TABLE_REQUESTS") ?? "tblRequests",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // -------- subscription validation (handshake) -----------------------------
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: state } = await admin
    .from("graph_sync_state")
    .select("drive_id, item_id, client_state, status")
    .eq("id", true).maybeSingle();

  if (!state || state.status !== "connected" || !state.drive_id || !state.item_id) {
    // Always 202 so Graph doesn't retry forever / disable the subscription.
    return new Response("not connected", { status: 202, headers: corsHeaders });
  }

  let body: { value?: Array<{ clientState?: string; resource?: string }> };
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400, headers: corsHeaders });
  }

  // Validate clientState — Graph echoes the value we passed at subscription
  // creation. Reject any notification that doesn't match.
  const notifications = body.value ?? [];
  const ok = notifications.every((n) => n.clientState === state.client_state);
  if (!ok) {
    console.warn("graph-pull: clientState mismatch, ignoring");
    return new Response("ok", { status: 202, headers: corsHeaders });
  }
  if (!notifications.length) {
    return new Response("ok", { status: 202, headers: corsHeaders });
  }

  // We do not trust the resource path inside the notification — we always
  // re-read the configured workbook and reconcile.
  try {
    await reconcileAll(admin, state.drive_id, state.item_id);
    await admin.from("graph_sync_state").update({
      last_pull_at: new Date().toISOString(), last_error: null,
    }).eq("id", true);
    return new Response("ok", { status: 202, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("graph-pull error:", msg);
    await admin.from("graph_sync_state").update({
      last_error: msg.slice(0, 1000), updated_at: new Date().toISOString(),
    }).eq("id", true);
    // Still 202: keep the subscription alive even when reconcile fails.
    return new Response("error logged", { status: 202, headers: corsHeaders });
  }
});

async function reconcileAll(admin: SupabaseClient, driveId: string, itemId: string) {
  const t = tableNames();
  await reconcileInvoices(admin, driveId, itemId, t.invoices);
  await reconcileInflows(admin, driveId, itemId, t.inflows);
  await reconcileRequests(admin, driveId, itemId, t.requests);
}

function colMap(headers: string[]) {
  const m = new Map<string, number>();
  headers.forEach((h, i) => m.set(h.trim().toLowerCase(), i));
  return (k: string) => m.get(k.toLowerCase()) ?? -1;
}

function asString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function asNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function asDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  // Excel may return a date as serial number, ISO string, or formatted text.
  if (typeof v === "number") {
    // Excel serial: days since 1899-12-30 (Lotus 1-2-3 leap-year quirk)
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// ---------- invoices --------------------------------------------------------
async function reconcileInvoices(
  admin: SupabaseClient, driveId: string, itemId: string, tableName: string,
) {
  const headers = await listTableColumns(driveId, itemId, tableName);
  const rows = await listTableRows(driveId, itemId, tableName);
  const col = colMap(headers);

  const cInv = col("invoice number");
  const cVendor = col("vendor");
  const cDate = col("date");
  const cAmount = col("amount");
  const cCategory = col("category");
  const cStatus = col("status");
  const cNotes = col("notes");
  if (cInv < 0 || cVendor < 0 || cDate < 0 || cAmount < 0) {
    throw new Error(`Invoices table missing required columns. Got: ${headers.join(", ")}`);
  }

  const { data: existing } = await admin.from("invoices")
    .select("id, invoice_number, external_row_id");
  const byInv = new Map<string, { id: string; external_row_id: string | null }>();
  (existing ?? []).forEach((r) =>
    byInv.set(String(r.invoice_number).trim().toLowerCase(), {
      id: r.id, external_row_id: r.external_row_id,
    }),
  );

  const seen = new Set<string>();
  for (const r of rows) {
    const num = asString(r.values[cInv]);
    if (!num) continue;
    const key = num.toLowerCase();
    seen.add(key);

    const cat = asString(r.values[cCategory]) || "other";
    const status = asString(r.values[cStatus]) || "submitted";
    const fields = {
      invoice_number: num,
      vendor: asString(r.values[cVendor]),
      invoice_date: asDate(r.values[cDate]),
      amount: asNumber(r.values[cAmount]),
      category: CATEGORIES.includes(cat) ? cat : "other",
      status: ["draft", "submitted", "under_review", "approved", "rejected"].includes(status)
        ? status : "submitted",
      notes: asString(r.values[cNotes]) || null,
      external_row_id: String(r.index),
      synced_at: new Date().toISOString(),
    };
    if (!fields.invoice_date || !fields.vendor || fields.amount <= 0) continue;

    const match = byInv.get(key);
    if (match) {
      await admin.from("invoices").update(fields).eq("id", match.id);
    }
    // We don't INSERT new invoices from Excel — uploaded_by is required and
    // the Excel has no notion of who created them. Excel-side row adds are a
    // future enhancement (would need an "uploaded by email" column).
  }
}

// ---------- petty_cash_balance ---------------------------------------------
async function reconcileInflows(
  admin: SupabaseClient, driveId: string, itemId: string, tableName: string,
) {
  const headers = await listTableColumns(driveId, itemId, tableName);
  const rows = await listTableRows(driveId, itemId, tableName);
  const col = colMap(headers);
  const cId = col("id");
  const cAmount = col("amount");
  const cType = col("type");
  const cDesc = col("description");
  if (cId < 0 || cAmount < 0) {
    throw new Error(`Inflows table missing required columns. Got: ${headers.join(", ")}`);
  }

  for (const r of rows) {
    const id = asString(r.values[cId]);
    if (!id) continue;
    const fields = {
      amount: asNumber(r.values[cAmount]),
      type: ["deposit", "adjustment", "expense", "inflow"].includes(asString(r.values[cType]))
        ? asString(r.values[cType]) : "deposit",
      description: asString(r.values[cDesc]) || null,
      external_row_id: String(r.index),
      synced_at: new Date().toISOString(),
    };
    await admin.from("petty_cash_balance").update(fields).eq("id", id);
  }
}

// ---------- requests --------------------------------------------------------
async function reconcileRequests(
  admin: SupabaseClient, driveId: string, itemId: string, tableName: string,
) {
  const headers = await listTableColumns(driveId, itemId, tableName);
  const rows = await listTableRows(driveId, itemId, tableName);
  const col = colMap(headers);
  const cId = col("id");
  const cTitle = col("title");
  const cAmount = col("amount");
  const cStatus = col("status");
  const cDesc = col("description");
  if (cId < 0 || cTitle < 0 || cAmount < 0) {
    throw new Error(`Requests table missing required columns. Got: ${headers.join(", ")}`);
  }

  for (const r of rows) {
    const id = asString(r.values[cId]);
    if (!id) continue;
    const status = asString(r.values[cStatus]) || "pending";
    const fields = {
      title: asString(r.values[cTitle]),
      amount: asNumber(r.values[cAmount]),
      status: ["pending", "approved", "rejected", "cancelled"].includes(status)
        ? status : "pending",
      description: asString(r.values[cDesc]) || null,
      external_row_id: String(r.index),
      synced_at: new Date().toISOString(),
    };
    await admin.from("requests").update(fields).eq("id", id);
  }
}
