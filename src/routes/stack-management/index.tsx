import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, memo } from "react";
import { fetchWithCache, invalidate as invalidateCache } from "@/lib/queryCache";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Repeat2, TrendingUp, AlertCircle, Loader2, ArrowRight,
  Layers, CreditCard, Clock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/stack-management/")({
  component: StackManagementDashboard,
});

// ── Types ────────────────────────────────────────────────────────────────────

type Sub = {
  id: string;
  name: string;
  vendor: string | null;
  service_url: string | null;
  amount: number;
  currency: string;
  billing_cycle: string;
  billing_interval_days: number | null;
  next_billing_date: string | null;
  status: string;
  payment_method: "petty_cash" | "corporate_card";
  category: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const fmtAmount = (n: number, currency: string) =>
  currency === "USD" ? fmtUSD(n) : fmtCOP(n);

function monthlyEquivalent(s: Sub): number {
  const m: Record<string, number> = {
    monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, annual: 1 / 12,
    custom: 30 / (s.billing_interval_days ?? 30), pay_as_you_go: 0,
  };
  return Number(s.amount) * (m[s.billing_cycle] ?? 1);
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr + "T12:00:00").getTime() - Date.now()) / 86400000);
}

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

const AppLogo = memo(function AppLogo({ name, website, size = 9 }: { name: string; website: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = extractDomain(website);
  const src = domain && !failed ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;
  const dim = `h-${size} w-${size}`;
  if (src) {
    return (
      <div className={`flex ${dim} shrink-0 items-center justify-center rounded-lg overflow-hidden border border-border/40 bg-white dark:bg-neutral-800`}>
        <img src={src} alt={name} loading="lazy" className="h-5 w-5 object-contain" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className={`flex ${dim} shrink-0 items-center justify-center rounded-lg font-display text-[11px] font-bold text-white sm-avatar`}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
});

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; accent?: "amber" | "red" | "teal" | "violet";
}) {
  const borders: Record<string, string> = {
    teal:   "border-l-4 border-l-[var(--sm-primary)]",
    violet: "border-l-4 border-l-violet-500",
    amber:  "border-l-4 border-l-amber-500",
    red:    "border-l-4 border-l-destructive",
  };
  return (
    <Card className={`p-4 sm-lift sm-animate-in ${accent ? borders[accent] : ""}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="mt-1 font-num text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function TopSpendersCard({ items }: { items: Sub[] }) {
  const active = items.filter((s) => s.status === "active" && s.billing_cycle !== "pay_as_you_go");

  // Separate by currency, sort and take top 5 from combined list by monthly equiv
  const withMonthly = active.map((s) => ({ ...s, monthly: monthlyEquivalent(s) }));
  const top5 = [...withMonthly].sort((a, b) => {
    // Convert to a common unit for sorting: USD as-is, COP divide by ~4000 (rough)
    const normalize = (s: typeof a) => s.currency === "USD" ? s.monthly * 4000 : s.monthly;
    return normalize(b) - normalize(a);
  }).slice(0, 5);

  if (top5.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-10 sm-lift sm-animate-in sm-delay-2">
        <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No active subscriptions yet.</p>
      </Card>
    );
  }

  const maxNorm = Math.max(...top5.map((s) =>
    s.currency === "USD" ? s.monthly * 4000 : s.monthly,
  ));

  return (
    <Card className="overflow-hidden sm-lift sm-animate-in sm-delay-2">
      <div className="border-b border-border px-5 py-3.5 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="font-display text-sm">Top spenders</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase tracking-widest">monthly equiv.</span>
      </div>
      <div className="divide-y divide-border">
        {top5.map((s, i) => {
          const norm = s.currency === "USD" ? s.monthly * 4000 : s.monthly;
          const pct = maxNorm > 0 ? (norm / maxNorm) * 100 : 0;
          const isCorp = s.payment_method === "corporate_card";
          return (
            <Link
              key={s.id}
              to="/stack-management/subscriptions/$id"
              params={{ id: s.id }}
              className="sm-row flex items-center gap-3 px-5 py-3"
            >
              <span className="font-mono text-[10px] text-muted-foreground/50 w-4 shrink-0 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <AppLogo name={s.name} website={s.service_url} size={8} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  {isCorp && (
                    <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/30">
                      CORP
                    </span>
                  )}
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full sm-bar-animate ${isCorp ? "bg-violet-500" : "bg-[var(--sm-primary)]"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-num text-sm font-semibold tabular-nums">
                  {fmtAmount(s.monthly, s.currency)}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">/ mo</div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function BillingAlertsCard({ items }: { items: Sub[] }) {
  const active = items.filter((s) => s.status === "active");
  const withDays = active
    .map((s) => ({ ...s, days: daysUntil(s.next_billing_date) }))
    .filter((s) => s.days !== null && s.days <= 30)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  const urgency = (days: number | null) => {
    if (days === null) return "none";
    if (days < 0) return "overdue";
    if (days <= 3) return "critical";
    if (days <= 7) return "warning";
    return "info";
  };

  const urgencyStyles: Record<string, { bar: string; label: string; badge: string }> = {
    overdue:  { bar: "bg-destructive", label: "Overdue",        badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    critical: { bar: "bg-destructive", label: "Due very soon",  badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    warning:  { bar: "bg-amber-500",   label: "Due this week",  badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    info:     { bar: "bg-[var(--sm-primary)]", label: "Due this month", badge: "bg-muted text-muted-foreground" },
  };

  const dueLabel = (days: number | null) => {
    if (days === null) return "—";
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return `Due in ${days}d`;
  };

  return (
    <Card className="overflow-hidden sm-lift sm-animate-in sm-delay-3">
      <div className="border-b border-border px-5 py-3.5 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        <span className="font-display text-sm">Billing alerts</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase tracking-widest">next 30 days</span>
      </div>

      {withDays.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-10">
          <CheckCircle2 className="h-7 w-7 text-emerald-500/60" />
          <p className="text-sm text-muted-foreground">No billing due in the next 30 days.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {withDays.map((s) => {
            const u = urgency(s.days);
            const st = urgencyStyles[u];
            const currency = s.payment_method === "corporate_card" ? "USD" : s.currency ?? "COP";
            return (
              <Link
                key={s.id}
                to="/stack-management/subscriptions/$id"
                params={{ id: s.id }}
                className="sm-row flex items-center gap-3 px-5 py-3"
              >
                <div className={`h-8 w-1 shrink-0 rounded-full ${st.bar}`} />
                <AppLogo name={s.name} website={s.service_url} size={8} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${st.badge}`}>
                      {dueLabel(s.days)}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {s.next_billing_date
                      ? format(new Date(s.next_billing_date + "T12:00:00"), "MMM d, yyyy")
                      : ""}
                    {s.vendor ? ` · ${s.vendor}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-num text-sm font-semibold tabular-nums">
                    {fmtAmount(Number(s.amount), currency)}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground capitalize">
                    {s.billing_cycle.replace(/_/g, " ")}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function StackManagementDashboard() {
  const [items, setItems] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const fetcher = async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from("subscriptions")
            .select("id, name, vendor, service_url, amount, currency, billing_cycle, billing_interval_days, next_billing_date, status, payment_method, category")
            .eq("status", "active");
          return (data ?? []) as Sub[];
        };
        const data = await fetchWithCache("sm:dashboard:subs", fetcher, setItems);
        setItems(data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);
  // Export invalidation helper so other pages can bust this cache after mutations
  void invalidateCache; // ensure import is used

  const active = items.filter((s) => s.status === "active");

  const dueIn7 = active.filter((s) => {
    const d = daysUntil(s.next_billing_date);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  const dueIn30 = active.filter((s) => {
    const d = daysUntil(s.next_billing_date);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  const monthlyPettyCash = active
    .filter((s) => s.payment_method === "petty_cash")
    .reduce((sum, s) => sum + monthlyEquivalent(s), 0);

  const monthlyUSD = active
    .filter((s) => s.payment_method === "corporate_card")
    .reduce((sum, s) => sum + monthlyEquivalent(s), 0);

  return (
    <div className="space-y-6 sm-animate-in">
      {/* Header */}
      <div className="sm-animate-in sm-delay-0">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Overview</div>
        <h1 className="font-display text-3xl tracking-tight">Stack Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading ? "Loading…" : `${active.length} active subscription${active.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm-animate-in sm-delay-1">
          <KpiCard
            icon={Layers}
            label="Active"
            value={String(active.length)}
            sub={`${active.filter(s => s.payment_method === "petty_cash").length} petty cash`}
            accent="teal"
          />
          <KpiCard
            icon={TrendingUp}
            label="Monthly petty cash"
            value={fmtCOP(monthlyPettyCash)}
            sub="Estimated"
          />
          <KpiCard
            icon={CreditCard}
            label="Monthly corporate"
            value={fmtUSD(monthlyUSD)}
            sub="USD · corporate card"
            accent="violet"
          />
          <KpiCard
            icon={dueIn7 > 0 ? AlertTriangle : Clock}
            label="Due this week"
            value={String(dueIn7)}
            sub={`${dueIn30} due this month`}
            accent={dueIn7 > 0 ? "red" : undefined}
          />
        </div>
      )}

      {/* Analytics grid */}
      {!loading && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TopSpendersCard items={items} />
          <BillingAlertsCard items={items} />
        </div>
      )}

      {/* Quick access */}
      <div className="sm-animate-in sm-delay-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Applications
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            to="/stack-management/subscriptions"
            className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg sm-icon-bg">
                <Repeat2 className="h-5 w-5 sm-icon-fg" />
              </div>
              <div>
                <div className="font-medium">Subscriptions</div>
                <div className="text-xs text-muted-foreground">Track recurring software & SaaS</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </div>
      </div>
    </div>
  );
}
