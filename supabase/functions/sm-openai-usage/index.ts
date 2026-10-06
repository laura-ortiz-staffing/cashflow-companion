import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI = "https://api.openai.com/v1/organization";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function oa(path: string, key: string, params: Record<string, string | string[]> = {}) {
  const url = new URL(`${OPENAI}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`OpenAI ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Follows next_page cursors (max 5 pages) and returns all buckets.
async function buckets(path: string, key: string, params: Record<string, string | string[]>) {
  const out: any[] = [];
  let page: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await oa(path, key, page ? { ...params, page } : params);
    out.push(...(res.data ?? []));
    if (!res.has_more || !res.next_page) break;
    page = res.next_page;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) return json({ error: "Unauthorized" }, 401);

    const ADMIN_KEY = Deno.env.get("OPENAI_ADMIN_KEY");
    if (!ADMIN_KEY) return json({ error: "OPENAI_ADMIN_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body?.days) || 30, 1), 31);
    const start = Math.floor(Date.now() / 1000) - days * 86400;

    const [projectsRes, usageRes, costsRes] = await Promise.allSettled([
      oa("/projects", ADMIN_KEY, { limit: "100", include_archived: "false" }),
      buckets("/usage/completions", ADMIN_KEY, {
        start_time: String(start),
        bucket_width: "1d",
        limit: String(days),
        "group_by": ["project_id", "api_key_id"],
      }),
      buckets("/costs", ADMIN_KEY, {
        start_time: String(start),
        bucket_width: "1d",
        limit: String(days),
        "group_by": ["project_id"],
      }),
    ]);

    if (usageRes.status === "rejected") throw usageRes.reason;

    const warnings: string[] = [];
    const projectNames: Record<string, string> = {};
    if (projectsRes.status === "fulfilled") {
      for (const p of projectsRes.value.data ?? []) projectNames[p.id] = p.name;
    } else {
      warnings.push(`Project names unavailable: ${String(projectsRes.reason?.message ?? projectsRes.reason)}`);
    }

    const dayKey = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
    const daily: Record<string, { date: string; cost_usd: number; tokens: number; requests: number }> = {};
    for (let t = start; t <= Date.now() / 1000; t += 86400) {
      const d = dayKey(t);
      daily[d] = { date: d, cost_usd: 0, tokens: 0, requests: 0 };
    }
    const dayRow = (unix: number) => {
      const d = dayKey(unix);
      return (daily[d] ??= { date: d, cost_usd: 0, tokens: 0, requests: 0 });
    };

    // Resolve api key ids to their names (one call per project that had usage).
    type Row = { input_tokens: number; output_tokens: number; requests: number };
    const projects: Record<string, { cost: number; totals: Row; keys: Record<string, Row> }> = {};
    const blank = (): Row => ({ input_tokens: 0, output_tokens: 0, requests: 0 });
    const proj = (id: string) =>
      (projects[id] ??= { cost: 0, totals: blank(), keys: {} });

    for (const b of usageRes.value) {
      for (const r of b.results ?? []) {
        const day = dayRow(b.start_time);
        day.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
        day.requests += r.num_model_requests ?? 0;
        const p = proj(r.project_id ?? "unknown");
        const k = (p.keys[r.api_key_id ?? "unknown"] ??= blank());
        for (const t of [p.totals, k]) {
          t.input_tokens += r.input_tokens ?? 0;
          t.output_tokens += r.output_tokens ?? 0;
          t.requests += r.num_model_requests ?? 0;
        }
      }
    }
    if (costsRes.status === "fulfilled") {
      for (const b of costsRes.value) {
        for (const r of b.results ?? []) {
          const amount = r.amount?.value ?? 0;
          proj(r.project_id ?? "unknown").cost += amount;
          dayRow(b.start_time).cost_usd += amount;
        }
      }
    } else {
      warnings.push(`Costs unavailable: ${String(costsRes.reason?.message ?? costsRes.reason)}`);
    }

    const keyNames: Record<string, string> = {};
    const keyResults = await Promise.allSettled(
      Object.keys(projects)
        .filter((id) => id !== "unknown")
        .map(async (id) => {
          const res = await oa(`/projects/${id}/api_keys`, ADMIN_KEY, { limit: "100" });
          for (const k of res.data ?? []) {
            keyNames[k.id] = String(k.name ?? "").trim() || "Unnamed key";
          }
        }),
    );
    const failedKey = keyResults.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failedKey) warnings.push(`Key names unavailable: ${String(failedKey.reason?.message ?? failedKey.reason)}`);

    const result = Object.entries(projects)
      .map(([id, p]) => ({
        project_id: id,
        project_name: projectNames[id] ?? id,
        cost_usd: Math.round(p.cost * 10000) / 10000,
        ...p.totals,
        keys: Object.entries(p.keys)
          .map(([kid, t]) => ({ api_key_id: kid, api_key_name: keyNames[kid] ?? kid, ...t }))
          .sort((a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens)),
      }))
      .sort((a, b) => b.cost_usd - a.cost_usd || b.input_tokens - a.input_tokens);

    return json({
      days,
      projects: result,
      daily: Object.values(daily)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ ...d, cost_usd: Math.round(d.cost_usd * 100) / 100 })),
      warnings,
      costs_available: costsRes.status === "fulfilled",
    });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 502);
  }
});
