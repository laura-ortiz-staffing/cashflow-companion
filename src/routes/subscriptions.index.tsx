import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Repeat2, Plus, Search, Loader2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

export const Route = createFileRoute("/subscriptions/")({
  component: () => (
    <AppShell>
      <SubscriptionsGuard />
    </AppShell>
  ),
});

function SubscriptionsGuard() {
  const { role, permissions } = useAuth();
  const hasAccess =
    role === "super_admin" ||
    role === "admin" ||
    (role === "viewer" &&
      (permissions.includes("subscriptions") ||
        permissions.includes("subscriptions_write")));
  if (!hasAccess) return <AccessDenied icon={Repeat2} />;
  return <Subscriptions />;
}

// ── Types ────────────────────────────────────────────────────────────────────

type Sub = {
  id: string;
  name: string;
  vendor: string | null;
  amount: number;
  currency: string;
  exchange_rate: number | null;
  billing_cycle: string;
  billing_interval_days: number | null;
  payment_method: "petty_cash" | "corporate_card";
  auto_renewal: boolean;
  next_billing_date: string | null;
  renewal_date: string | null;
  expiry_date: string | null;
  last_paid_at: string | null;
  status: "draft" | "active" | "paused" | "cancelled" | "expired";
  category: string | null;
  notes: string | null;
  created_at: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom" },
  { value: "pay_as_you_go", label: "Pay as you go" },
];

const PAYMENT_METHODS = [
  { value: "petty_cash", label: "Petty cash" },
  { value: "corporate_card", label: "Corporate card" },
];

const CATEGORIES = [
  "Software",
  "SaaS",
  "Cloud Services",
  "Hosting",
  "Domains",
  "Productivity Tools",
  "Communication Tools",
  "Security",
  "Development Tools",
  "AI Tools",
  "Other Technology",
];

const REMINDER_OPTIONS = [1, 3, 7, 14];

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

const fmtAmount = (n: number, currency: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(n);

function fmtCycle(cycle: string, days?: number | null) {
  const map: Record<string, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    semiannual: "Semi-annual",
    annual: "Annual",
    custom: `Every ${days ?? "?"} days`,
    pay_as_you_go: "Pay as you go",
  };
  return map[cycle] ?? cycle;
}

function daysUntilBilling(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr + "T12:00:00").getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function monthlyEquivalent(sub: Sub): number {
  const multipliers: Record<string, number> = {
    monthly: 1,
    quarterly: 1 / 3,
    semiannual: 1 / 6,
    annual: 1 / 12,
    custom: 30 / (sub.billing_interval_days ?? 30),
    pay_as_you_go: 0,
  };
  return sub.amount * (multipliers[sub.billing_cycle] ?? 1);
}

const STATUS_CLASSES: Record<string, string> = {
  active:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  paused:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const PM: Record<"petty_cash" | "corporate_card", { bar: string; label: string; pill: string }> = {
  petty_cash: {
    bar: "bg-primary",
    label: "Petty cash",
    pill: "text-primary bg-primary/10",
  },
  corporate_card: {
    bar: "bg-violet-500",
    label: "Corporate card",
    pill: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/30",
  },
};

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub: string;
  accent: "blue" | "green" | "amber" | "red" | "none";
}) {
  const border =
    accent === "blue"
      ? "border-l-primary"
      : accent === "green"
        ? "border-l-emerald-500"
        : accent === "amber"
          ? "border-l-amber-500"
          : accent === "red"
            ? "border-l-destructive"
            : "";
  return (
    <Card className={`p-4 ${accent !== "none" ? "border-l-4 " + border : ""}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 font-num text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

const makeEmpty = () => ({
  name: "",
  vendor: "",
  amount: "",
  exchange_rate: "",
  billing_cycle: "monthly",
  billing_interval_days: "",
  payment_method: "petty_cash" as "petty_cash" | "corporate_card",
  auto_renewal: true,
  next_billing_date: new Date().toISOString().slice(0, 10),
  category: "",
  renewal_date: "",
  expiry_date: "",
  service_url: "",
  notes: "",
  reminder_days_before: [3, 7] as number[],
});

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(makeEmpty());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(makeEmpty());
  }, [open]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handlePaymentMethodChange = (v: "petty_cash" | "corporate_card") => {
    set("payment_method", v);
    if (v === "corporate_card" && !form.exchange_rate) {
      setForm((f) => ({ ...f, payment_method: v, exchange_rate: "4200" }));
    }
  };

  const toggleReminder = (day: number) =>
    set(
      "reminder_days_before",
      form.reminder_days_before.includes(day)
        ? form.reminder_days_before.filter((d) => d !== day)
        : [...form.reminder_days_before, day].sort((a, b) => a - b),
    );

  const copReference =
    form.payment_method === "corporate_card" && form.amount && form.exchange_rate
      ? Number(form.amount) * Number(form.exchange_rate)
      : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (form.billing_cycle !== "pay_as_you_go" && !form.next_billing_date) {
      toast.error("Next billing date is required");
      return;
    }
    setBusy(true);
    try {
      const currency = form.payment_method === "corporate_card" ? "USD" : "COP";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("subscriptions")
        .insert({
          name: form.name.trim(),
          vendor: form.vendor.trim() || null,
          amount: Number(form.amount),
          currency,
          exchange_rate:
            form.payment_method === "corporate_card" && form.exchange_rate
              ? Number(form.exchange_rate)
              : null,
          billing_cycle: form.billing_cycle,
          billing_interval_days:
            form.billing_cycle === "custom"
              ? Number(form.billing_interval_days)
              : null,
          payment_method: form.payment_method,
          auto_renewal: form.auto_renewal,
          next_billing_date:
            form.billing_cycle === "pay_as_you_go" ? null : form.next_billing_date,
          renewal_date: form.renewal_date || null,
          expiry_date: form.expiry_date || null,
          status: "active",
          category: form.category || null,
          service_url: form.service_url.trim() || null,
          notes: form.notes.trim() || null,
          reminder_days_before: form.reminder_days_before,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      await logAction({
        action: "subscription.created",
        entity_type: "subscription",
        entity_id: data.id,
        new_state: {
          name: form.name,
          payment_method: form.payment_method,
          amount: Number(form.amount),
          currency,
          billing_cycle: form.billing_cycle,
        },
      });
      toast.success("Subscription created");
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create subscription",
      );
    } finally {
      setBusy(false);
    }
  };

  const isCorporate = form.payment_method === "corporate_card";
  const isPayg = form.billing_cycle === "pay_as_you_go";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New subscription</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">

            {/* Service name */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="s-name">Service name *</Label>
              <Input
                id="s-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                maxLength={100}
                placeholder="e.g. Google Workspace"
              />
            </div>

            {/* Vendor */}
            <div className="space-y-1.5">
              <Label htmlFor="s-vendor">Vendor</Label>
              <Input
                id="s-vendor"
                value={form.vendor}
                onChange={(e) => set("vendor", e.target.value)}
                maxLength={100}
                placeholder="e.g. Google LLC"
              />
            </div>

            {/* Billing cycle */}
            <div className="space-y-1.5">
              <Label>Billing cycle *</Label>
              <Select
                value={form.billing_cycle}
                onValueChange={(v) => set("billing_cycle", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label>Payment method *</Label>
              <Select
                value={form.payment_method}
                onValueChange={handlePaymentMethodChange}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom interval */}
            {form.billing_cycle === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="s-interval">Every N days *</Label>
                <Input
                  id="s-interval"
                  type="number"
                  min="1"
                  value={form.billing_interval_days}
                  onChange={(e) => set("billing_interval_days", e.target.value)}
                  required
                />
              </div>
            )}

            {/* Amount — varies by payment method */}
            {isCorporate ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="s-amount">Amount (USD) *</Label>
                  <Input
                    id="s-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => set("amount", e.target.value)}
                    required
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-rate">Rate (COP/$)</Label>
                  <Input
                    id="s-rate"
                    type="number"
                    step="1"
                    min="1"
                    value={form.exchange_rate}
                    onChange={(e) => set("exchange_rate", e.target.value)}
                    placeholder="4200"
                  />
                </div>
                {copReference !== null && (
                  <div className="col-span-2 flex items-center gap-2.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-800/50 dark:bg-violet-900/20">
                    <span className="font-mono text-sm font-semibold text-violet-700 dark:text-violet-300">
                      ≈ {fmtCOP(copReference)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Reference only · not deducted from petty cash
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="s-amount">Amount (COP) *</Label>
                <Input
                  id="s-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  required
                />
              </div>
            )}

            {/* Auto-renewal toggle */}
            <div className="col-span-2 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Auto-renewal</div>
                <div className="text-xs text-muted-foreground">
                  Subscription renews automatically each period
                </div>
              </div>
              <Switch
                checked={form.auto_renewal}
                onCheckedChange={(v) => set("auto_renewal", v)}
              />
            </div>

            {/* Dates */}
            {!isPayg ? (
              <>
                <div className="space-y-1.5">
                  <Label>Next billing date *</Label>
                  <DatePicker
                    value={form.next_billing_date}
                    onChange={(v) => set("next_billing_date", v ?? "")}
                    placeholder="Pick a date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Expiry date
                    {!form.auto_renewal && (
                      <span className="ml-1 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                        · recommended
                      </span>
                    )}
                  </Label>
                  <DatePicker
                    value={form.expiry_date}
                    onChange={(v) => set("expiry_date", v ?? "")}
                    placeholder="No expiry"
                  />
                </div>
              </>
            ) : (
              <div className="col-span-2 space-y-1.5">
                <Label>
                  Expiry date
                  {!form.auto_renewal && (
                    <span className="ml-1 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                      · recommended
                    </span>
                  )}
                </Label>
                <DatePicker
                  value={form.expiry_date}
                  onChange={(v) => set("expiry_date", v ?? "")}
                  placeholder="No expiry"
                />
              </div>
            )}

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category || "_none"}
                onValueChange={(v) => set("category", v === "_none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Renewal date */}
            <div className="space-y-1.5">
              <Label>Renewal date</Label>
              <DatePicker
                value={form.renewal_date}
                onChange={(v) => set("renewal_date", v ?? "")}
                placeholder="No date"
              />
            </div>

            {/* Service URL */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="s-url">Service URL</Label>
              <Input
                id="s-url"
                type="url"
                value={form.service_url}
                onChange={(e) => set("service_url", e.target.value)}
                placeholder="https://admin.example.com"
              />
            </div>

            {/* Reminders */}
            <div className="col-span-2 space-y-2">
              <Label>Remind me (days before billing)</Label>
              <div className="flex gap-2">
                {REMINDER_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleReminder(d)}
                    className={`rounded-full px-3 py-1 font-mono text-xs font-semibold transition-colors ${
                      form.reminder_days_before.includes(d)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="s-notes">Notes</Label>
              <Textarea
                id="s-notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                maxLength={500}
                placeholder="Optional context…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="bg-gradient-primary text-primary-foreground"
            >
              {busy ? "Creating…" : "Create subscription"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main list ─────────────────────────────────────────────────────────────────

function Subscriptions() {
  const { role, permissions } = useAuth();
  const canWrite =
    role === "super_admin" || permissions.includes("subscriptions_write");

  const [items, setItems] = useState<Sub[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [q, setQ] = useState("");
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("*")
        .order("next_billing_date");
      setItems((data as Sub[]) ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ── KPIs ──
  const active = useMemo(() => items.filter((s) => s.status === "active"), [items]);

  const billingIn30 = useMemo(
    () =>
      active.filter((s) => {
        const d = daysUntilBilling(s.next_billing_date);
        return d !== null && d >= 0 && d <= 30;
      }).length,
    [active],
  );

  const dueThisWeek = useMemo(
    () =>
      active.filter((s) => {
        const d = daysUntilBilling(s.next_billing_date);
        return d !== null && d >= 0 && d <= 7;
      }).length,
    [active],
  );

  const pettyCashMonthly = useMemo(
    () =>
      active
        .filter((s) => s.payment_method === "petty_cash")
        .reduce((sum, s) => sum + monthlyEquivalent(s), 0),
    [active],
  );

  // ── Filters ──
  const filtered = useMemo(
    () =>
      items.filter(
        (s) =>
          (filterMethod === "all" || s.payment_method === filterMethod) &&
          (filterStatus === "all" || s.status === filterStatus) &&
          (q === "" ||
            s.name.toLowerCase().includes(q.toLowerCase()) ||
            (s.vendor ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [items, filterMethod, filterStatus, q],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Recurring
          </div>
          <h1 className="font-display text-3xl tracking-tight">Subscriptions</h1>
        </div>
        {canWrite && (
          <Button
            className="bg-gradient-primary text-primary-foreground"
            onClick={() => setCreating(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" /> New subscription
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Active"
          value={active.length}
          sub={`${active.filter((s) => s.payment_method === "petty_cash").length} petty cash`}
          accent="blue"
        />
        <KpiCard
          label="Due this month"
          value={billingIn30}
          sub="Next 30 days"
          accent={billingIn30 > 0 ? "amber" : "none"}
        />
        <KpiCard
          label="Monthly petty cash"
          value={fmtCOP(pettyCashMonthly)}
          sub="Estimated"
          accent="green"
        />
        <KpiCard
          label="Due this week"
          value={dueThisWeek}
          sub="Next 7 days"
          accent={dueThisWeek > 0 ? "red" : "none"}
        />
      </div>

      {/* Filters */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sub-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="sub-search"
                placeholder="Name or vendor"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="petty_cash">Petty cash</SelectItem>
                <SelectItem value="corporate_card">Corporate card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* List */}
      <Card className="overflow-hidden">
        {loadingItems ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Repeat2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {items.length === 0
                ? "No subscriptions yet."
                : "No subscriptions match your filters."}
            </p>
            {canWrite && items.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setCreating(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add first subscription
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((sub) => {
              const pm = PM[sub.payment_method];
              const days = daysUntilBilling(sub.next_billing_date);
              const dateColor =
                days === null
                  ? "text-muted-foreground"
                  : days < 0
                    ? "text-destructive"
                    : days <= 7
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground";
              const dueLabel =
                days === null
                  ? "Variable"
                  : days < 0
                    ? `${Math.abs(days)}d overdue`
                    : days === 0
                      ? "Due today"
                      : `Due in ${days}d`;
              return (
                <Link
                  key={sub.id}
                  to="/subscriptions/$id"
                  params={{ id: sub.id }}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
                >
                  <div className={`h-9 w-1 shrink-0 rounded-full ${pm.bar}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{sub.name}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[sub.status]}`}
                      >
                        {sub.status}
                      </span>
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${pm.pill}`}
                      >
                        {pm.label}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {fmtCycle(sub.billing_cycle, sub.billing_interval_days)}
                      {sub.vendor ? ` · ${sub.vendor}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-num text-base font-semibold">
                      {fmtAmount(Number(sub.amount), sub.currency ?? "COP")}
                    </div>
                    {sub.currency === "USD" && sub.exchange_rate && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        ≈ {fmtCOP(Number(sub.amount) * Number(sub.exchange_rate))}
                      </div>
                    )}
                    <div className={`font-mono text-xs ${dateColor}`}>
                      {dueLabel}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {canWrite && (
        <CreateDialog
          open={creating}
          onOpenChange={setCreating}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}
