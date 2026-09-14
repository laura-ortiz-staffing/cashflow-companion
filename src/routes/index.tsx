import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Wallet, TrendingDown, CheckCircle2, Clock, XCircle, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { format, subMonths } from "date-fns";

export const Route = createFileRoute("/")({
  component: IndexGate,
});

// IndexGate decides where to go before mounting the heavy AppShell.
// Priority:
//   1. Not loaded yet → wait
//   2. Not authenticated → /apps (which redirects to /login if needed)
//   3. Admin role → /cash
//   4. Haven't come through the app selector this session → /apps
//   5. Everything ok → render Petty Cash dashboard
function IndexGate() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/apps" }); return; }
    if (role === "admin") { navigate({ to: "/cash" }); return; }
    if (!sessionStorage.getItem("app_entry")) { navigate({ to: "/apps" }); return; }
  }, [loading, user, role, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="font-display text-sm text-muted-foreground tracking-widest">LOADING…</div>
      </div>
    );
  }
  if (!user || !sessionStorage.getItem("app_entry") || role === "admin") return null;

  return <AppShell><Dashboard /></AppShell>;
}

type Inv = {
  id: string; amount: number; vendor: string; invoice_date: string;
  category: string; status: string; created_at: string;
};

const CATEGORY_COLORS = ["hsl(var(--primary))", "var(--tertiary)", "var(--success)", "var(--warning)", "var(--destructive)", "var(--muted-foreground)", "var(--primary-glow)", "var(--accent-foreground)"];

function Dashboard() {
  const { role } = useAuth();
  const today = new Date();
  const currentYear  = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const [viewYear,  setViewYear]  = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(0);
  const [inflowsTotal, setInflowsTotal] = useState(0);
  const [currency, setCurrency] = useState("COP");

  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
  const viewLabel = new Date(viewYear, viewMonth - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const navigateMonth = (dir: -1 | 1) => {
    const d = new Date(viewYear, viewMonth - 1 + dir, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  const refreshAll = async () => {
    try {
      const monthStart = `${viewYear}-${String(viewMonth).padStart(2, "0")}-01`;
      const nextY = viewMonth === 12 ? viewYear + 1 : viewYear;
      const nextM = viewMonth === 12 ? 1 : viewMonth + 1;
      const monthEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

      const [invRes, cashRes, inflowRes, periodRes] = await Promise.all([
        supabase.from("invoices").select("*").order("invoice_date", { ascending: false }),
        (supabase as any).from("cash_settings").select("opening_balance,monthly_fund,currency").eq("id", true).maybeSingle(),
        supabase.from("petty_cash_balance").select("amount").eq("type", "inflow")
          .gte("transaction_date", monthStart)
          .lt("transaction_date",  monthEnd),
        (supabase as any).from("cash_periods").select("opening_balance")
          .eq("year", viewYear).eq("month", viewMonth).maybeSingle(),
      ]);

      if (cashRes.data) {
        const s = cashRes.data as { opening_balance: number; monthly_fund: number | null; currency: string };
        setCurrency(s.currency);

        let periodOpening = 0;
        if (periodRes.data) {
          periodOpening = Number(periodRes.data.opening_balance);
        } else if (isCurrentMonth && role === "super_admin") {
          // Only auto-create period for the current month
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await (supabase as any).from("cash_periods")
              .insert({ year: viewYear, month: viewMonth, opening_balance: 0, created_by: user.id });
            const { data: re } = await (supabase as any).from("cash_periods")
              .select("opening_balance").eq("year", viewYear).eq("month", viewMonth).maybeSingle();
            if (re) periodOpening = Number(re.opening_balance);
          }
        }
        setOpening(periodOpening);
      }

      if (inflowRes.data) {
        setInflowsTotal(((inflowRes.data as { amount: number }[]) ?? []).reduce((s, i) => s + Number(i.amount), 0));
      }
      if (invRes.data) {
        setInvoices(invRes.data as Inv[]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    refreshAll();
  }, [viewYear, viewMonth]);

  useEffect(() => {
    const ch = supabase.channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_settings" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_periods" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "petty_cash_balance" }, refreshAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const stats = useMemo(() => {
    const approved = invoices.filter((i) => i.status === "approved");
    const totalApproved = approved.reduce((s, i) => s + Number(i.amount), 0);
    const mStart = new Date(viewYear, viewMonth - 1, 1);
    const mEnd   = new Date(viewYear, viewMonth, 1);
    const thisMonth = approved.filter((i) => {
      const dt = new Date(i.invoice_date + "T12:00:00");
      return dt >= mStart && dt < mEnd;
    });
    const monthTotal = thisMonth.reduce((s, i) => s + Number(i.amount), 0);
    const pending = invoices.filter((i) => i.status === "submitted" || i.status === "under_review").length;
    const rejected = invoices.filter((i) => i.status === "rejected").length;
    const balance = opening + inflowsTotal - monthTotal;

    // last 6 months
    const months = Array.from({ length: 6 }).map((_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const s = new Date(d.getFullYear(), d.getMonth(), 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const total = approved
        .filter((inv) => { const dt = new Date(inv.invoice_date + "T12:00:00"); return dt >= s && dt < e; })
        .reduce((sum, inv) => sum + Number(inv.amount), 0);
      return { month: format(d, "MMM"), total: Math.round(total) };
    });

    // categories
    const catMap: Record<string, number> = {};
    approved.forEach((i) => { catMap[i.category] = (catMap[i.category] ?? 0) + Number(i.amount); });
    const categories = Object.entries(catMap).map(([name, value]) => ({
      name: name.replace(/_/g, " "), value: Math.round(value),
    }));

    return { totalApproved, monthTotal, pending, rejected, balance, months, categories, count: invoices.length, inflowsTotal };
  }, [invoices, opening, inflowsTotal, viewYear, viewMonth]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Overview</div>
          <h1 className="font-display text-3xl tracking-tight">Dashboard</h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 shrink-0">
          <button onClick={() => navigateMonth(-1)} className="rounded p-1 hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-mono text-sm min-w-[140px] text-center">{viewLabel}</span>
          <button
            onClick={() => navigateMonth(1)}
            disabled={isCurrentMonth}
            className="rounded p-1 hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Wallet} label="Current balance"
          value={fmt(stats.balance)}
          sub={`opening ${fmt(opening)}`}
          accent="bg-gradient-tertiary text-tertiary-foreground"
          glow
        />
        <KpiCard icon={TrendingUp} label="Cash inflows" value={fmt(stats.inflowsTotal)} sub={viewLabel} />
        <KpiCard icon={TrendingDown} label="Expenses" value={fmt(stats.monthTotal)} sub={viewLabel} />
        <KpiCard icon={CheckCircle2} label="Approved total" value={fmt(stats.totalApproved)} sub={`${stats.count} invoices · ${stats.pending} pending`} />
      </div>

      {/* Status pills */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusPill icon={Clock} label="Submitted" count={invoices.filter(i => i.status === "submitted").length} color="text-warning" />
        <StatusPill icon={Clock} label="Under review" count={invoices.filter(i => i.status === "under_review").length} color="text-primary" />
        <StatusPill icon={CheckCircle2} label="Approved" count={invoices.filter(i => i.status === "approved").length} color="text-success" />
        <StatusPill icon={XCircle} label="Rejected" count={invoices.filter(i => i.status === "rejected").length} color="text-destructive" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-display text-lg">Monthly expenses</h3>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">last 6 months</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={stats.months}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}
                  cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                />
                <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4">
            <h3 className="font-display text-lg">By category</h3>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">approved</span>
          </div>
          <div className="h-72">
            {stats.categories.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data yet</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={stats.categories} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                    {stats.categories.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="p-5">
        <h3 className="mb-4 font-display text-lg">Recent invoices</h3>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No invoices yet. Upload your first one.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.slice(0, 6).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">{inv.vendor}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {format(new Date(inv.invoice_date + "T12:00:00"), "MMM d, yyyy")} · {inv.category.replace(/_/g, " ")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={inv.status} />
                  <div className="font-num text-sm font-semibold">{fmt(Number(inv.amount))}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent, glow }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; accent?: string; glow?: boolean;
}) {
  return (
    <Card className={`relative overflow-hidden p-5 ${accent ?? ""} ${glow ? "shadow-glow" : ""}`}>
      <div className="flex items-center justify-between">
        <div className={`font-mono text-[10px] uppercase tracking-widest ${accent ? "opacity-80" : "text-muted-foreground"}`}>{label}</div>
        <Icon className={`h-4 w-4 ${accent ? "opacity-80" : "text-muted-foreground"}`} />
      </div>
      <div className="mt-3 font-display text-3xl tracking-tight">{value}</div>
      {sub && <div className={`mt-1 text-xs ${accent ? "opacity-70" : "text-muted-foreground"}`}>{sub}</div>}
    </Card>
  );
}

function StatusPill({ icon: Icon, label, count, color }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 font-display text-2xl">{count}</div>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    submitted: "bg-warning/15 text-warning",
    under_review: "bg-primary/15 text-primary",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${map[status] ?? "bg-muted"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
