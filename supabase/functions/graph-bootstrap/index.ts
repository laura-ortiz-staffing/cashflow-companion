// graph-bootstrap — one-time setup invoked by a Super Admin from the UI.
//
// Flow:
//   1. Read MS_WORKBOOK_URL secret, resolve drive/item via /shares.
//   2. List the workbook's Excel tables and verify the three expected tables exist.
//   3. Create a Graph change-notification subscription on the driveItem.
//   4. Persist drive_id, item_id, subscription_id, expiry, status into graph_sync_state.
//
// Auth: requires the caller to be a super_admin. JWT verified by the Supabase
// runtime (verify_jwt = true in config.toml).

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createSubscription,
  listTables,
  resolveSharedItem,
} from "../_shared/graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TABLES_DEFAULT = {
  invoices: "tblInvoices",
  inflows: "tblCashInflows",
  requests: "tblRequests",
};

function tableNames() {
  return {
    invoices: Deno.env.get("MS_TABLE_INVOICES") ?? TABLES_DEFAULT.invoices,
    inflows: Deno.env.get("MS_TABLE_INFLOWS") ?? TABLES_DEFAULT.inflows,
    requests: Deno.env.get("MS_TABLE_REQUESTS") ?? TABLES_DEFAULT.requests,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PULL_FN_URL = Deno.env.get("GRAPH_PULL_URL")
    ?? `${SUPABASE_URL}/functions/v1/graph-pull`;
  const WORKBOOK_URL = Deno.env.get("MS_WORKBOOK_URL");

  const auth = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isSuper } = await userClient.rpc("has_role", {
    _user_id: u.user.id, _role: "super_admin",
  });
  if (!isSuper) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!WORKBOOK_URL) {
    return new Response(JSON.stringify({ error: "MS_WORKBOOK_URL secret not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  await admin.from("graph_sync_state").update({
    status: "connecting",
    last_error: null,
    workbook_url: WORKBOOK_URL,
    updated_by: u.user.id,
    updated_at: new Date().toISOString(),
  }).eq("id", true);

  try {
    const item = await resolveSharedItem(WORKBOOK_URL);
    const tables = await listTables(item.driveId, item.itemId);
    const present = new Set(tables.map((t) => t.name.toLowerCase()));
    const expected = tableNames();
    const missing = Object.values(expected).filter(
      (n) => !present.has(n.toLowerCase()),
    );
    if (missing.length) {
      throw new Error(
        `Workbook is missing required Excel Tables: ${missing.join(", ")}. ` +
        `Found: ${tables.map((t) => t.name).join(", ") || "(none)"}. ` +
        `Set MS_TABLE_INVOICES / MS_TABLE_INFLOWS / MS_TABLE_REQUESTS env vars to override.`,
      );
    }

    const clientState = crypto.randomUUID();
    // Graph caps subscription lifetimes for driveItems at ~3 days; use 2.5d.
    const expirationDateTime = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();
    const sub = await createSubscription({
      changeType: "updated",
      notificationUrl: PULL_FN_URL,
      resource: `/drives/${item.driveId}/items/${item.itemId}`,
      expirationDateTime,
      clientState,
    });

    await admin.from("graph_sync_state").update({
      drive_id: item.driveId,
      item_id: item.itemId,
      subscription_id: sub.id,
      subscription_expires_at: sub.expirationDateTime,
      client_state: clientState,
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", true);

    return new Response(
      JSON.stringify({
        ok: true,
        driveId: item.driveId,
        itemId: item.itemId,
        webUrl: item.webUrl,
        subscriptionId: sub.id,
        subscriptionExpiresAt: sub.expirationDateTime,
        tables: expected,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("graph_sync_state").update({
      status: "error",
      last_error: msg.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
