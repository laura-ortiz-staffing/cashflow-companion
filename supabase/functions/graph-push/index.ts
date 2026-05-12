// graph-push — DB → SharePoint Excel.
//
// Invoked by the Postgres trigger notify_graph_push() (see migration
// 20260508120000_graph_sync.sql). Payload shape:
//   { table: 'invoices' | 'petty_cash_balance' | 'requests',
//     op: 'INSERT' | 'UPDATE' | 'DELETE',
//     record: <full row>,
//     old_record: <previous row | null> }
//
// Auth: trigger calls with the service-role JWT, so verify_jwt = true is fine.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  addRow,
  deleteRowByIndex,
  findRowIndex,
  patchRowByIndex,
} from "../_shared/graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TABLE_MAP = {
  invoices: {
    excel: () => Deno.env.get("MS_TABLE_INVOICES") ?? "tblInvoices",
    keyColumn: "Invoice Number",
    toRow: (r: Record<string, unknown>) => [
      r.invoice_number ?? "",
      r.vendor ?? "",
      r.invoice_date ?? "",
      Number(r.amount ?? 0),
      r.category ?? "",
      r.status ?? "",
      r.notes ?? "",
    ],
    keyValue: (r: Record<string, unknown>) => String(r.invoice_number ?? ""),
  },
  petty_cash_balance: {
    excel: () => Deno.env.get("MS_TABLE_INFLOWS") ?? "tblCashInflows",
    keyColumn: "ID",
    toRow: (r: Record<string, unknown>) => [
      r.id ?? "",
      typeof r.created_at === "string" ? r.created_at.slice(0, 10) : "",
      r.type ?? "",
      Number(r.amount ?? 0),
      r.description ?? "",
    ],
    keyValue: (r: Record<string, unknown>) => String(r.id ?? ""),
  },
  requests: {
    excel: () => Deno.env.get("MS_TABLE_REQUESTS") ?? "tblRequests",
    keyColumn: "ID",
    toRow: (r: Record<string, unknown>) => [
      r.id ?? "",
      r.title ?? "",
      Number(r.amount ?? 0),
      r.currency ?? "",
      r.category ?? "",
      r.status ?? "",
      r.description ?? "",
      typeof r.created_at === "string" ? r.created_at.slice(0, 10) : "",
    ],
    keyValue: (r: Record<string, unknown>) => String(r.id ?? ""),
  },
} as const;

type TableKey = keyof typeof TABLE_MAP;

interface Payload {
  table: TableKey;
  op: "INSERT" | "UPDATE" | "DELETE";
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let payload: Payload;
  try {
    payload = await req.json() as Payload;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const cfg = TABLE_MAP[payload.table];
  if (!cfg) {
    return new Response(JSON.stringify({ skipped: "unknown table" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: state, error: stateErr } = await admin
    .from("graph_sync_state")
    .select("drive_id, item_id, status")
    .eq("id", true).maybeSingle();

  if (stateErr || !state || state.status !== "connected" || !state.drive_id || !state.item_id) {
    return new Response(JSON.stringify({ skipped: "graph not connected" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { drive_id, item_id } = state;
  const tableName = cfg.excel();

  try {
    if (payload.op === "INSERT") {
      const row = cfg.toRow(payload.record);
      const r = await addRow(drive_id, item_id, tableName, row);
      // mark synced (avoids the round-trip via graph-pull triggering another push)
      const id = payload.record.id as string | undefined;
      if (id) {
        await admin.rpc("graph_mark_synced", {
          _table: payload.table,
          _id: id,
          _external_row_id: String(r.index),
        });
      }
    } else if (payload.op === "UPDATE") {
      const key = cfg.keyValue(payload.record);
      let idx: number | null = null;
      const externalId = payload.record.external_row_id as string | undefined;
      if (externalId && /^\d+$/.test(externalId)) idx = Number(externalId);
      if (idx === null) {
        idx = await findRowIndex(drive_id, item_id, tableName, cfg.keyColumn, key);
      }
      const row = cfg.toRow(payload.record);
      if (idx !== null) {
        await patchRowByIndex(drive_id, item_id, tableName, idx, row);
      } else {
        const r = await addRow(drive_id, item_id, tableName, row);
        const id = payload.record.id as string | undefined;
        if (id) {
          await admin.rpc("graph_mark_synced", {
            _table: payload.table, _id: id, _external_row_id: String(r.index),
          });
        }
      }
    } else if (payload.op === "DELETE") {
      const key = cfg.keyValue(payload.old_record ?? payload.record);
      const externalId = (payload.old_record ?? payload.record).external_row_id as
        | string | undefined;
      let idx: number | null = null;
      if (externalId && /^\d+$/.test(externalId)) idx = Number(externalId);
      if (idx === null) {
        idx = await findRowIndex(drive_id, item_id, tableName, cfg.keyColumn, key);
      }
      if (idx !== null) {
        await deleteRowByIndex(drive_id, item_id, tableName, idx);
      }
    }

    await admin.from("graph_sync_state").update({
      last_push_at: new Date().toISOString(), last_error: null,
    }).eq("id", true);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("graph-push error:", msg);
    await admin.from("graph_sync_state").update({
      last_error: msg.slice(0, 1000), updated_at: new Date().toISOString(),
    }).eq("id", true);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
