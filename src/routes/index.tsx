import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Wallet, TrendingDown, FileText, CheckCircle2, Clock, XCircle } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { format, startOfMonth, subMonths } from "date-fns";

export const Route = createFileRoute("/")({
  component: () => <AppShell><Dashboard /></AppShell>,
});

type Inv = {
  id: string; amount: number; vendor: string; invoice_date: string;
  category: string; status: string; created_at: string;
};

const CATEGORY_COLORS = ["hsl(var(--primary))", "var(--tertiary)", "var(--success)", "var(--warning)", "var(--destructive)", "var(--muted-foreground)", "var(--primary-glow)", "var(--accent-foreground)"];

function Dashboard() {
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("invoices").select("*").order("invoice_date", { ascending: false })
      .then(({ data }) => { setInvoices((data as Inv[]) ?? []); setLoading(false); });

    const ch = supabase.channel("dashboard-inv")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        supabase.from("invoices").select("*").order("invoice_date", { ascending: false })
          .then(({ data }) => setInvoices((data as Inv[]) ?? []));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stats = useMemo(() => {
    const approved = invoices.filter((i) => i.status === "approved");
    const totalApproved = approved.reduce((s, i) => s + Number(i.amount), 0);
    const monthStart = startOfMonth(new Date());
    const thisMonth = approved.filter((i) => new Date(i.invoice_date) >= monthStart);
    const monthTotal = thisMonth.reduce((s, i) => s + Number(i.amount), 0);
    const pending = invoices.filter((i) => i.status === "submitted" || i.status === "under_review").length;
    const rejected = invoices.filter((i) => i.status === "rejected").length;
    const balance = 10000 - totalApproved; // assume 10k float

    // last 6 months
    const months = Array.from({ length: 6 }).map((_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const s = startOfMonth(d);
      const e = startOfMonth(subMonths(d, -1));
      const total = approved
        .filter((inv) => { const dt = new Date(inv.invoice_date); return dt >= s && dt < e; })
        .reduce((sum, inv) => sum + Number(inv.amount), 0);
      return { month: format(d, "MMM"), total: Math.round(total) };
    });

    // categories
    const catMap: Record<string, number> = {};
    approved.forEach((i) => { catMap[i.category] = (catMap[i.category] ?? 0) + Number(i.amount); });
    const categories = Object.entries(catMap).map(([name, value]) => ({
      name: name.replace(/_/g, " "), value: Math.round(value),
    }));

    return { totalApproved, monthTotal, pending, rejected, balance, months, categories, count: invoices.length };
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Overview</div>
        <h1 className="font-display text-3xl tracking-tight">Dashboard</h1>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Wallet} label="Petty cash balance"
          value={`$${stats.balance.toLocaleString()}`}
          accent="bg-gradient-tertiary text-tertiary-foreground"
          glow
        />
        <KpiCard icon={TrendingDown} label="This month" value={`$${stats.monthTotal.toLocaleString()}`} sub="approved expenses" />
        <KpiCard icon={FileText} label="Total invoices" value={String(stats.count)} sub={`${stats.pending} pending review`} />
        <KpiCard icon={CheckCircle2} label="Approved total" value={`$${stats.totalApproved.toLocaleString()}`} sub={`${stats.rejected} rejected`} />
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
                    {format(new Date(inv.invoice_date), "MMM d, yyyy")} · {inv.category.replace(/_/g, " ")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={inv.status} />
                  <div className="font-num text-sm font-semibold">${Number(inv.amount).toFixed(2)}</div>
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
