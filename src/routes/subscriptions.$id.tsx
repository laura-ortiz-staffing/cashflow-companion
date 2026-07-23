import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ArrowLeft,
  Repeat2,
  CircleDollarSign,
  Pencil,
  Pause,
  Play,
  Trash2,
  ExternalLink,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/subscriptions/$id")({
  component: () => (
    <AppShell>
      <SubscriptionDetail />
    </AppShell>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Sub = {
  id: string;
  name: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  currency: string;
  billing_cycle: string;
  billing_interval_days: number | null;
  payment_method: "petty_cash" | "corporate_card";
  next_billing_date: string;
  renewal_date: string | null;
  expiry_date: string | null;
  last_paid_at: string | null;
  status: "draft" | "active" | "paused" | "cancelled" | "expired";
  category: string | null;
  reminder_days_before: number[];
  service_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
};

type PaymentLog = {
  id: string;
  subscription_id: string;
  amount: number;
  payment_date: string;
  payment_method: "petty_cash" | "corporate_card";
  invoice_id: string | null;
  reference: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom" },
];

const PAYMENT_METHODS = [
  { value: "petty_cash", label: "Petty cash" },
  { value: "corporate_card", label: "Corporate card" },
];

const CATEGORIES = [
  "office_supplies",
  "travel",
  "meals",
  "transport",
  "utilities",
  "maintenance",
  "marketing",
  "other",
];

const REMINDER_OPTIONS = [1, 3, 7, 14];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

function fmtCycle(cycle: string, days?: number | null) {
  const map: Record<string, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    semiannual: "Semi-annual",
    annual: "Annual",
    custom: `Every ${days ?? "?"} days`,
  };
  return map[cycle] ?? cycle;
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

const PM_LABEL: Record<string, string> = {
  petty_cash: "Petty cash",
  corporate_card: "Corporate card",
};
const PM_PILL: Record<string, string> = {
  petty_cash: "text-primary bg-primary/10",
  corporate_card:
    "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/30",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

// ── Register payment dialog ───────────────────────────────────────────────────

function RegisterPaymentDialog({
  sub,
  open,
  onOpenChange,
  onRegistered,
}: {
  sub: Sub;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRegistered: () => void;
}) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(String(sub.amount));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"petty_cash" | "corporate_card">(
    sub.payment_method,
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(sub.amount));
      setDate(new Date().toISOString().slice(0, 10));
      setMethod(sub.payment_method);
      setReference("");
      setNotes("");
    }
  }, [open, sub]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      // Advance next_billing_date based on billing cycle
      const advance: Record<string, number> = {
        monthly: 30,
        quarterly: 91,
        semiannual: 182,
        annual: 365,
        custom: sub.billing_interval_days ?? 30,
      };
      const nextDate = new Date(sub.next_billing_date + "T12:00:00");
      nextDate.setDate(nextDate.getDate() + advance[sub.billing_cycle]);
      const nextBilling = nextDate.toISOString().slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: logErr } = await (supabase as any)
        .from("subscription_payment_logs")
        .insert({
          subscription_id: sub.id,
          amount: Number(amount),
          payment_date: date,
          payment_method: method,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          recorded_by: user.id,
        });
      if (logErr) throw logErr;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await (supabase as any)
        .from("subscriptions")
        .update({
          last_paid_at: date,
          next_billing_date: nextBilling,
        })
        .eq("id", sub.id);
      if (upErr) throw upErr;

      await logAction({
        action: "subscription.payment_recorded",
        entity_type: "subscription",
        entity_id: sub.id,
        metadata: {
          amount: Number(amount),
          payment_date: date,
          payment_method: method,
          next_billing_date: nextBilling,
        },
      });

      toast.success("Payment recorded");
      onRegistered();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to record payment",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register payment — {sub.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount (COP) *</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Payment date *</Label>
              <Input
                id="pay-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Payment method *</Label>
              <Select
                value={method}
                onValueChange={(v) =>
                  setMethod(v as "petty_cash" | "corporate_card")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="pay-ref">Reference</Label>
              <Input
                id="pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Transaction ID, receipt #, etc."
                maxLength={120}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="pay-notes">Notes</Label>
              <Textarea
                id="pay-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                placeholder="Optional…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="bg-gradient-primary text-primary-foreground"
            >
              {busy ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog (super_admin only) ────────────────────────────────────────────

function EditDialog({
  sub,
  open,
  onOpenChange,
  onSaved,
}: {
  sub: Sub;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ ...sub, amount: String(sub.amount) });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...sub, amount: String(sub.amount) });
  }, [open, sub]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleReminder = (day: number) =>
    set(
      "reminder_days_before",
      form.reminder_days_before.includes(day)
        ? form.reminder_days_before.filter((d) => d !== day)
        : [...form.reminder_days_before, day].sort((a, b) => a - b),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("subscriptions")
        .update({
          name: form.name.trim(),
          vendor: form.vendor?.trim() || null,
          amount: Number(form.amount),
          billing_cycle: form.billing_cycle,
          billing_interval_days:
            form.billing_cycle === "custom"
              ? Number(form.billing_interval_days)
              : null,
          payment_method: form.payment_method,
          next_billing_date: form.next_billing_date,
          renewal_date: form.renewal_date || null,
          expiry_date: form.expiry_date || null,
          category: form.category || null,
          service_url: form.service_url?.trim() || null,
          notes: form.notes?.trim() || null,
          reminder_days_before: form.reminder_days_before,
        })
        .eq("id", sub.id);
      if (error) throw error;
      await logAction({
        action: "subscription.updated",
        entity_type: "subscription",
        entity_id: sub.id,
        previous_state: { name: sub.name, amount: sub.amount, payment_method: sub.payment_method },
        new_state: { name: form.name, amount: Number(form.amount), payment_method: form.payment_method },
      });
      toast.success("Subscription updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit subscription</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="e-name">Service name *</Label>
              <Input
                id="e-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-vendor">Vendor</Label>
              <Input
                id="e-vendor"
                value={form.vendor ?? ""}
                onChange={(e) => set("vendor", e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Amount (COP) *</Label>
              <Input
                id="e-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing cycle *</Label>
              <Select
                value={form.billing_cycle}
                onValueChange={(v) => set("billing_cycle", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.billing_cycle === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="e-interval">Every N days *</Label>
                <Input
                  id="e-interval"
                  type="number"
                  min="1"
                  value={form.billing_interval_days ?? ""}
                  onChange={(e) =>
                    set("billing_interval_days", Number(e.target.value))
                  }
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Payment method *</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) =>
                  set("payment_method", v as "petty_cash" | "corporate_card")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-next">Next billing date *</Label>
              <Input
                id="e-next"
                type="date"
                value={form.next_billing_date}
                onChange={(e) => set("next_billing_date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category ?? "_none"}
                onValueChange={(v) =>
                  set("category", v === "_none" ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-renewal">Renewal date</Label>
              <Input
                id="e-renewal"
                type="date"
                value={form.renewal_date ?? ""}
                onChange={(e) => set("renewal_date", e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-expiry">Expiry date</Label>
              <Input
                id="e-expiry"
                type="date"
                value={form.expiry_date ?? ""}
                onChange={(e) => set("expiry_date", e.target.value || null)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="e-url">Service URL</Label>
              <Input
                id="e-url"
                type="url"
                value={form.service_url ?? ""}
                onChange={(e) => set("service_url", e.target.value)}
                placeholder="https://admin.example.com"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Reminders (days before billing)</Label>
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
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="e-notes">Notes</Label>
              <Textarea
                id="e-notes"
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="bg-gradient-primary text-primary-foreground"
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main detail ───────────────────────────────────────────────────────────────

function SubscriptionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role, permissions } = useAuth();

  const canWrite =
    role === "super_admin" || permissions.includes("subscriptions_write");
  const isSuperAdmin = role === "super_admin";

  const [sub, setSub] = useState<Sub | null>(null);
  const [payments, setPayments] = useState<PaymentLog[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "pause" | "resume" | "cancel" | "delete" | null
  >(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: raw, error } = await (supabase as any)
        .from("subscriptions")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      setSub(raw as Sub);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: logs } = await (supabase as any)
        .from("subscription_payment_logs")
        .select("*")
        .eq("subscription_id", id)
        .order("payment_date", { ascending: false });
      setPayments((logs as PaymentLog[]) ?? []);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load subscription",
      );
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const runStatusAction = async () => {
    if (!sub || !confirmAction) return;
    setActionBusy(true);
    try {
      const statusMap = {
        pause: "paused",
        resume: "active",
        cancel: "cancelled",
      } as const;

      if (confirmAction === "delete") {
        await logAction({
          action: "subscription.deleted",
          entity_type: "subscription",
          entity_id: sub.id,
          previous_state: { name: sub.name, status: sub.status, amount: sub.amount },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("subscriptions")
          .delete()
          .eq("id", sub.id);
        if (error) throw error;
        toast.success("Subscription deleted");
        navigate({ to: "/subscriptions" });
        return;
      }

      const newStatus = statusMap[confirmAction];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("subscriptions")
        .update({
          status: newStatus,
          ...(confirmAction === "cancel"
            ? { cancelled_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", sub.id);
      if (error) throw error;
      await logAction({
        action: `subscription.${confirmAction}d`,
        entity_type: "subscription",
        entity_id: sub.id,
        previous_state: { status: sub.status },
        new_state: { status: newStatus },
      });
      toast.success(
        confirmAction === "pause"
          ? "Subscription paused"
          : confirmAction === "resume"
            ? "Subscription resumed"
            : "Subscription cancelled",
      );
      setConfirmAction(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  };

  if (errorMsg)
    return (
      <div className="p-12 text-center text-destructive">
        Error: {errorMsg}
      </div>
    );
  if (!sub)
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  const pmPill = PM_PILL[sub.payment_method];
  const pmLabel = PM_LABEL[sub.payment_method];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate({ to: "/subscriptions" })}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to subscriptions
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left column ── */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {sub.vendor ?? "Subscription"}
                </div>
                <h1 className="mt-1 font-display text-2xl">{sub.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[sub.status]}`}
                  >
                    {sub.status}
                  </span>
                  <span
                    className={`inline-flex items-center rounded px-2.5 py-0.5 font-mono text-xs font-semibold ${pmPill}`}
                  >
                    {pmLabel}
                  </span>
                  {sub.category && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {sub.category.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Amount
                </div>
                <div className="font-display text-3xl">
                  {fmtCOP(Number(sub.amount))}
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {fmtCycle(sub.billing_cycle, sub.billing_interval_days)}
                </div>
              </div>
            </div>

            {/* Details grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field
                label="Next billing"
                value={format(
                  new Date(sub.next_billing_date + "T12:00:00"),
                  "MMM d, yyyy",
                )}
              />
              <Field
                label="Last paid"
                value={
                  sub.last_paid_at
                    ? format(
                        new Date(sub.last_paid_at + "T12:00:00"),
                        "MMM d, yyyy",
                      )
                    : "—"
                }
              />
              <Field
                label="Created"
                value={format(new Date(sub.created_at), "MMM d, yyyy")}
              />
              {sub.renewal_date && (
                <Field
                  label="Renewal"
                  value={format(
                    new Date(sub.renewal_date + "T12:00:00"),
                    "MMM d, yyyy",
                  )}
                />
              )}
              {sub.expiry_date && (
                <Field
                  label="Expires"
                  value={format(
                    new Date(sub.expiry_date + "T12:00:00"),
                    "MMM d, yyyy",
                  )}
                />
              )}
              {sub.reminder_days_before.length > 0 && (
                <Field
                  label="Reminders"
                  value={sub.reminder_days_before
                    .map((d) => `${d}d before`)
                    .join(", ")}
                />
              )}
            </div>

            {sub.notes && (
              <div className="mt-6">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Notes
                </div>
                <p className="mt-1 text-sm">{sub.notes}</p>
              </div>
            )}

            {sub.service_url && (
              <div className="mt-4">
                <a
                  href={sub.service_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open service portal
                </a>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-5">
              {canWrite && sub.status === "active" && (
                <Button
                  className="bg-gradient-primary text-primary-foreground"
                  onClick={() => setRegisterOpen(true)}
                >
                  <CircleDollarSign className="mr-1.5 h-4 w-4" />
                  Register payment
                </Button>
              )}
              {isSuperAdmin && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" /> Edit
                  </Button>
                  {sub.status === "active" && (
                    <Button
                      variant="outline"
                      onClick={() => setConfirmAction("pause")}
                    >
                      <Pause className="mr-1.5 h-4 w-4" /> Pause
                    </Button>
                  )}
                  {sub.status === "paused" && (
                    <Button
                      variant="outline"
                      onClick={() => setConfirmAction("resume")}
                    >
                      <Play className="mr-1.5 h-4 w-4" /> Resume
                    </Button>
                  )}
                  {sub.status !== "cancelled" && sub.status !== "expired" && (
                    <Button
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmAction("cancel")}
                    >
                      Cancel subscription
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmAction("delete")}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                </>
              )}
            </div>
          </Card>

          {/* Payment history */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Repeat2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-display text-lg">Payment history</h3>
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {format(
                          new Date(p.payment_date + "T12:00:00"),
                          "MMM d, yyyy",
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {PM_LABEL[p.payment_method]}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </div>
                      {p.notes && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {p.notes}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-num text-sm font-semibold">
                        {fmtCOP(Number(p.amount))}
                      </div>
                      {p.invoice_id && (
                        <div className="font-mono text-[10px] text-primary">
                          linked to invoice
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── Right column — audit trail ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-lg">Audit trail</h3>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Full action history is available in the{" "}
            <span className="font-medium text-primary">Audit log</span> page.
          </p>
          <div className="mt-4 space-y-3 text-xs text-muted-foreground border-l border-border pl-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider">
                Created
              </div>
              <div className="mt-0.5">
                {format(new Date(sub.created_at), "MMM d, yyyy HH:mm")}
              </div>
            </div>
            {sub.last_paid_at && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider">
                  Last payment
                </div>
                <div className="mt-0.5">
                  {format(
                    new Date(sub.last_paid_at + "T12:00:00"),
                    "MMM d, yyyy",
                  )}
                </div>
              </div>
            )}
            {sub.cancelled_at && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-destructive">
                  Cancelled
                </div>
                <div className="mt-0.5">
                  {format(new Date(sub.cancelled_at), "MMM d, yyyy HH:mm")}
                </div>
              </div>
            )}
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider">
                Last updated
              </div>
              <div className="mt-0.5">
                {format(new Date(sub.updated_at), "MMM d, yyyy HH:mm")}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Dialogs ── */}
      {canWrite && sub && (
        <RegisterPaymentDialog
          sub={sub}
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          onRegistered={() => {
            setRegisterOpen(false);
            load();
          }}
        />
      )}

      {isSuperAdmin && sub && (
        <EditDialog
          sub={sub}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      )}

      {/* Confirm action dialog */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "pause"
                ? "Pause subscription"
                : confirmAction === "resume"
                  ? "Resume subscription"
                  : confirmAction === "cancel"
                    ? "Cancel subscription"
                    : "Delete subscription"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              {confirmAction === "pause" &&
                "Payments will not be tracked while paused. You can resume at any time."}
              {confirmAction === "resume" &&
                "The subscription will become active again."}
              {confirmAction === "cancel" &&
                "The subscription will be marked as cancelled. The full history is preserved."}
              {confirmAction === "delete" &&
                "The subscription record will be permanently deleted. Payment history will also be removed. This action cannot be undone."}
            </p>
            {confirmAction === "delete" && (
              <p className="text-xs text-destructive">
                The action will be recorded in the audit log.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={actionBusy}
            >
              Go back
            </Button>
            <Button
              variant={
                confirmAction === "delete" || confirmAction === "cancel"
                  ? "destructive"
                  : "default"
              }
              onClick={runStatusAction}
              disabled={actionBusy}
            >
              {actionBusy
                ? "Processing…"
                : confirmAction === "pause"
                  ? "Pause"
                  : confirmAction === "resume"
                    ? "Resume"
                    : confirmAction === "cancel"
                      ? "Cancel subscription"
                      : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

