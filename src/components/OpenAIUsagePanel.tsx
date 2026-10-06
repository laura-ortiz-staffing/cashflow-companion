import { Fragment, useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const FUNCTION_NAME = "sm-openai-usage";

type KeyRow = {
  api_key_id: string;
  api_key_name: string;
  input_tokens: number;
  output_tokens: number;
  requests: number;
};
type ProjectRow = {
  project_id: string;
  project_name: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  requests: number;
  keys: KeyRow[];
};
type DayRow = { date: string; cost_usd: number; tokens: number; requests: number };
type Usage = {
  days: number;
  projects: ProjectRow[];
  daily: DayRow[];
  warnings: string[];
  costs_available: boolean;
};

const RANGES = [7, 30] as const;
const full = (n: number) => new Intl.NumberFormat("en-US").format(n);
const short = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const usd = (n: number) =>
  n > 0 && n < 0.01
    ? "<$0.01"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
const cleanKeyName = (name: string) => {
  const n = name.replace(/\s*\(.*$/, "").trim();
  return !n || /sk-|\*/.test(n) ? "Unnamed key" : n;
};
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

export function OpenAIUsagePanel() {
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<"cost" | "tokens">("cost");
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { days },
      });
      if (err) {
        const ctx = (err as { context?: Response }).context;
        const detail = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(detail?.error ?? detail?.message ?? err.message);
      }
      if ((res as { error?: string })?.error) throw new Error((res as { error: string }).error);
      setData(res as Usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load OpenAI usage");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.projects.reduce(
    (s, p) => ({
      cost: s.cost + p.cost_usd,
      requests: s.requests + p.requests,
      tokens: s.tokens + p.input_tokens + p.output_tokens,
    }),
    { cost: 0, requests: 0, tokens: 0 },
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            OpenAI usage (live)
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pulled directly from OpenAI, nothing to enter by hand. <strong>Spend</strong> is what
            OpenAI charges. <strong>Tokens</strong> are the pieces of text processed: input is what
            we send, output is what the model writes back.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                days === r ? "font-medium" : "text-muted-foreground hover:bg-muted",
              )}
              style={
                days === r
                  ? {
                      background: "var(--sm-primary)",
                      color: "var(--sm-primary-fg)",
                      borderColor: "transparent",
                    }
                  : undefined
              }
            >
              Last {r} days
            </button>
          ))}
          <Button
            size="icon"
            variant="ghost"
            onClick={load}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-destructive">{error}</div>
      ) : !data || !totals || data.projects.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No OpenAI usage in the last {days} days.
        </div>
      ) : (
        <div className="space-y-5 p-5">
          {data.warnings.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                {data.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Total spend"
              value={data.costs_available ? usd(totals.cost) : "—"}
              hint={`Last ${data.days} days`}
            />
            <Stat label="Requests" value={short(totals.requests)} hint="Times the AI was called" />
            <Stat label="Tokens" value={short(totals.tokens)} hint="Input + output combined" />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">
                {metric === "cost" ? "Spend per day" : "Tokens per day"}
              </div>
              <div className="flex gap-1">
                {(["cost", "tokens"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs",
                      metric === m
                        ? "bg-muted font-medium"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    {m === "cost" ? "Spend" : "Tokens"}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={dayLabel}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tickFormatter={(v: number) => (metric === "cost" ? `$${v}` : short(v))}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    labelFormatter={(l: string) => dayLabel(l)}
                    formatter={(v: number) =>
                      metric === "cost" ? [usd(v), "Spend"] : [full(v), "Tokens"]
                    }
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey={metric === "cost" ? "cost_usd" : "tokens"}
                    stroke="var(--sm-primary)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-2">Project (click to see its keys)</th>
                  <th className="w-20 px-2 py-2 text-right">Requests</th>
                  <th className="w-20 px-2 py-2 text-right">Input tokens</th>
                  <th className="w-20 px-2 py-2 text-right">Output tokens</th>
                  <th className="w-24 px-4 py-2 text-right">Spend</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.projects.map((p) => {
                  const isOpen = open[p.project_id];
                  return (
                    <Fragment key={p.project_id}>
                      <tr
                        className="cursor-pointer border-b border-border hover:bg-muted/40"
                        onClick={() => setOpen((o) => ({ ...o, [p.project_id]: !o[p.project_id] }))}
                      >
                        <td className="px-4 py-2.5 font-medium">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="truncate" title={p.project_name}>
                              {p.project_name}
                            </span>
                            <span className="shrink-0 text-xs font-normal text-muted-foreground">
                              ({p.keys.length} {p.keys.length === 1 ? "key" : "keys"})
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right" title={full(p.requests)}>
                          {short(p.requests)}
                        </td>
                        <td className="px-3 py-2.5 text-right" title={full(p.input_tokens)}>
                          {short(p.input_tokens)}
                        </td>
                        <td className="px-3 py-2.5 text-right" title={full(p.output_tokens)}>
                          {short(p.output_tokens)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {data.costs_available ? usd(p.cost_usd) : "—"}
                        </td>
                      </tr>
                      {isOpen &&
                        p.keys.map((k) => (
                          <tr
                            key={k.api_key_id}
                            className="border-b border-border bg-muted/20 text-muted-foreground"
                          >
                            <td
                              className="truncate py-2 pl-10 pr-4"
                              title={cleanKeyName(k.api_key_name)}
                            >
                              {cleanKeyName(k.api_key_name)}
                            </td>
                            <td className="px-3 py-2 text-right" title={full(k.requests)}>
                              {short(k.requests)}
                            </td>
                            <td className="px-3 py-2 text-right" title={full(k.input_tokens)}>
                              {short(k.input_tokens)}
                            </td>
                            <td className="px-3 py-2 text-right" title={full(k.output_tokens)}>
                              {short(k.output_tokens)}
                            </td>
                            <td className="px-4 py-2 text-right">—</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            OpenAI reports spend per project only, so individual keys show requests and tokens.
            Hover a number to see the exact value.
          </p>
        </div>
      )}
    </Card>
  );
}
