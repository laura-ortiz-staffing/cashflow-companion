import { createFileRoute } from "@tanstack/react-router";
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
import { Cpu, Plus, Pencil, Trash2, Loader2, Eye } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

export const Route = createFileRoute("/stack-management/ai")({
  component: AIUsage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type AIRecord = {
  id: string;
  provider: string;
  service_name: string;
  account_project: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  usage_amount: number | null;
  usage_unit: string;
  estimated_cost: number | null;
  currency: string;
  spending_limit: number | null;
  data_source: "manual" | "imported" | "api_sync";
  status: string;
  notes: string | null;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const USAGE_UNITS = [
  { value: "tokens",    label: "Tokens" },
  { value: "requests",  label: "Requests" },
  { value: "images",    label: "Images" },
  { value: "minutes",   label: "Minutes" },
  { value: "characters",label: "Characters" },
  { value: "credits",   label: "Credits" },
  { value: "custom",    label: "Custom" },
];

const DATA_SOURCES = [
  { value: "manual",   label: "Manual" },
  { value: "imported", label: "Imported" },
  { value: "api_sync", label: "API sync" },
];

const SOURCE_COLORS: Record<string, string> = {
  manual:   "bg-muted text-muted-foreground",
  imported: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  api_sync: "bg-[color-mix(in_oklab,var(--sm-primary)_12%,transparent)] text-[var(--sm-primary)]",
};

const fmtCost = (n: number | null, currency: string) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n);

const fmtUsage = (amount: number | null, unit: string) =>
  amount == null ? "—" : `${new Intl.NumberFormat("en-US").format(amount)} ${unit}`;

// ── Record form (shared by create + edit) ─────────────────────────────────────

type FormState = {
  provider: string;
  service_name: string;
  account_project: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  usage_amount: string;
  usage_unit: string;
  estimated_cost: string;
  currency: string;
  spending_limit: string;
  data_source: "manual" | "imported" | "api_sync";
  notes: string;
};

const emptyForm = (): FormState => ({
  provider: "",
  service_name: "",
  account_project: "",
  billing_period_start: null,
  billing_period_end: null,
  usage_amount: "",
  usage_unit: "tokens",
  estimated_cost: "",
  currency: "USD",
  spending_limit: "",
  data_source: "manual",
  notes: "",
});

function recordToForm(r: AIRecord): FormState {
  return {
    provider: r.provider,
    service_name: r.service_name,
    account_project: r.account_project ?? "",
    billing_period_start: r.billing_period_start,
    billing_period_end: r.billing_period_end,
    usage_amount: r.usage_amount != null ? String(r.usage_amount) : "",
    usage_unit: r.usage_unit,
    estimated_cost: r.estimated_cost != null ? String(r.estimated_cost) : "",
    currency: r.currency,
    spending_limit: r.spending_limit != null ? String(r.spending_limit) : "",
    data_source: r.data_source,
    notes: r.notes ?? "",
  };
}

function RecordDialog({
  open,
  onOpenChange,
  initial,
  title,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: FormState;
  title: string;
  onSave: (f: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ai-provider">Provider *</Label>
              <Input
                id="ai-provider"
                value={form.provider}
                onChange={(e) => set("provider", e.target.value)}
                required
                maxLength={80}
                placeholder="OpenAI, Anthropic, Google…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-service">Service / model *</Label>
              <Input
                id="ai-service"
                value={form.service_name}
                onChange={(e) => set("service_name", e.target.value)}
                required
                maxLength={120}
                placeholder="GPT-4o, Claude 3.5…"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ai-account">Account / project</Label>
              <Input
                id="ai-account"
                value={form.account_project}
                onChange={(e) => set("account_project", e.target.value)}
                maxLength={120}
                placeholder="Production API key, project name…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Billing period start</Label>
              <DatePicker
                value={form.billing_period_start}
                onChange={(v) => set("billing_period_start", v)}
                placeholder="Start date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing period end</Label>
              <DatePicker
                value={form.billing_period_end}
                onChange={(v) => set("billing_period_end", v)}
                placeholder="End date"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-usage">Usage amount</Label>
              <Input
                id="ai-usage"
                type="number"
                step="any"
                min="0"
                value={form.usage_amount}
                onChange={(e) => set("usage_amount", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Usage unit</Label>
              <Select value={form.usage_unit} onValueChange={(v) => set("usage_unit", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {USAGE_UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-cost">Estimated cost</Label>
              <Input
                id="ai-cost"
                type="number"
                step="0.01"
                min="0"
                value={form.estimated_cost}
                onChange={(e) => set("estimated_cost", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-currency">Currency</Label>
              <Input
                id="ai-currency"
                value={form.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-limit">Spending limit</Label>
              <Input
                id="ai-limit"
                type="number"
                step="0.01"
                min="0"
                value={form.spending_limit}
                onChange={(e) => set("spending_limit", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data source</Label>
              <Select value={form.data_source} onValueChange={(v) => set("data_source", v as FormState["data_source"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATA_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ai-notes">Notes</Label>
              <Textarea
                id="ai-notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                maxLength={500}
                placeholder="Optional…"
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
              style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function AIUsage() {
  const { smRole, user } = useAuth();
  const isSuperAdmin = smRole === "super_admin";

  const [items, setItems] = useState<AIRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AIRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AIRecord | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("sm_ai_usage")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as AIRecord[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (form: FormState) => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("sm_ai_usage").insert({
      provider: form.provider.trim(),
      service_name: form.service_name.trim(),
      account_project: form.account_project.trim() || null,
      billing_period_start: form.billing_period_start || null,
      billing_period_end: form.billing_period_end || null,
      usage_amount: form.usage_amount ? Number(form.usage_amount) : null,
      usage_unit: form.usage_unit,
      estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
      currency: form.currency || "USD",
      spending_limit: form.spending_limit ? Number(form.spending_limit) : null,
      data_source: form.data_source,
      notes: form.notes.trim() || null,
      recorded_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "sm_ai_usage.created", entity_type: "sm_ai_usage", entity_id: "" });
    toast.success("Record added");
    setCreateOpen(false);
    load();
  };

  const handleEdit = async (form: FormState) => {
    if (!editing) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("sm_ai_usage")
      .update({
        provider: form.provider.trim(),
        service_name: form.service_name.trim(),
        account_project: form.account_project.trim() || null,
        billing_period_start: form.billing_period_start || null,
        billing_period_end: form.billing_period_end || null,
        usage_amount: form.usage_amount ? Number(form.usage_amount) : null,
        usage_unit: form.usage_unit,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
        currency: form.currency || "USD",
        spending_limit: form.spending_limit ? Number(form.spending_limit) : null,
        data_source: form.data_source,
        notes: form.notes.trim() || null,
      })
      .eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "sm_ai_usage.updated", entity_type: "sm_ai_usage", entity_id: editing.id });
    toast.success("Record updated");
    setEditing(null);
    load();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDelBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("sm_ai_usage")
        .delete()
        .eq("id", confirmDelete.id);
      if (error) throw error;
      await logAction({ action: "sm_ai_usage.deleted", entity_type: "sm_ai_usage", entity_id: confirmDelete.id });
      toast.success("Record deleted");
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDelBusy(false);
    }
  };

  // Summary stats
  const totalCost = items.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0);
  const providers = [...new Set(items.map((r) => r.provider))].length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Stack Management
          </div>
          <h1 className="font-display text-3xl tracking-tight">AI Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pay-as-you-go AI spend tracking across providers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isSuperAdmin && (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
              <Eye className="h-3 w-3" /> View only
            </span>
          )}
          {isSuperAdmin && (
            <Button
              onClick={() => setCreateOpen(true)}
              style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Add record
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Total estimated cost</div>
          <div className="mt-1 font-display text-2xl">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalCost)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Records</div>
          <div className="mt-1 font-display text-2xl">{items.length}</div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Providers</div>
          <div className="mt-1 font-display text-2xl">{providers}</div>
        </Card>
      </div>

      {/* Records table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Records ({items.length})
        </div>
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Cpu className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No AI usage records yet.</p>
            {isSuperAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add first record
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1fr,auto] sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.provider}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-sm">{r.service_name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${SOURCE_COLORS[r.data_source]}`}
                    >
                      {r.data_source}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 font-mono text-xs text-muted-foreground">
                    {r.account_project && <span>{r.account_project}</span>}
                    {(r.billing_period_start || r.billing_period_end) && (
                      <span>
                        {r.billing_period_start
                          ? format(new Date(r.billing_period_start + "T12:00:00"), "MMM d")
                          : "?"}
                        {" – "}
                        {r.billing_period_end
                          ? format(new Date(r.billing_period_end + "T12:00:00"), "MMM d, yyyy")
                          : "?"}
                      </span>
                    )}
                    <span>{fmtUsage(r.usage_amount, r.usage_unit)}</span>
                  </div>
                  {r.notes && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-num text-sm font-semibold">
                      {fmtCost(r.estimated_cost, r.currency)}
                    </div>
                    {r.spending_limit != null && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        limit {fmtCost(r.spending_limit, r.currency)}
                      </div>
                    )}
                  </div>
                  {isSuperAdmin && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(r)}
                        className="text-muted-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(r)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Dialogs */}
      {isSuperAdmin && (
        <>
          <RecordDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            initial={emptyForm()}
            title="Add AI usage record"
            onSave={handleCreate}
          />
          {editing && (
            <RecordDialog
              open={true}
              onOpenChange={(o) => !o && setEditing(null)}
              initial={recordToForm(editing)}
              title="Edit AI usage record"
              onSave={handleEdit}
            />
          )}
          <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Delete record</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground py-1">
                Delete <strong>{confirmDelete?.service_name}</strong> ({confirmDelete?.provider})? This cannot be undone.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={delBusy}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={delBusy}>
                  {delBusy ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
