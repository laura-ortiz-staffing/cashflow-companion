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
import { Cloud, Plus, Pencil, Trash2, Loader2, Eye } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

export const Route = createFileRoute("/stack-management/cloud")({
  component: CloudServices,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type CloudService = {
  id: string;
  provider: string;
  service_name: string;
  environment: "production" | "staging" | "development" | "other" | null;
  project_account: string | null;
  owner: string | null;
  billing_model: string | null;
  current_cost: number | null;
  currency: string;
  billing_period: string | null;
  next_billing_date: string | null;
  status: "active" | "paused" | "cancelled";
  notes: string | null;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ENVIRONMENTS = [
  { value: "production",   label: "Production" },
  { value: "staging",      label: "Staging" },
  { value: "development",  label: "Development" },
  { value: "other",        label: "Other" },
];

const BILLING_MODELS = [
  { value: "pay_as_you_go", label: "Pay as you go" },
  { value: "monthly",       label: "Monthly" },
  { value: "quarterly",     label: "Quarterly" },
  { value: "annual",        label: "Annual" },
  { value: "custom",        label: "Custom" },
];

const ENV_COLORS: Record<string, string> = {
  production:  "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  staging:     "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  development: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  other:       "bg-muted text-muted-foreground",
};

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  paused:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const fmtCost = (n: number | null, currency: string) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n);

// ── Service form ──────────────────────────────────────────────────────────────

type FormState = {
  provider: string;
  service_name: string;
  environment: string;
  project_account: string;
  owner: string;
  billing_model: string;
  current_cost: string;
  currency: string;
  billing_period: string;
  next_billing_date: string | null;
  status: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  provider: "",
  service_name: "",
  environment: "_none",
  project_account: "",
  owner: "",
  billing_model: "_none",
  current_cost: "",
  currency: "USD",
  billing_period: "",
  next_billing_date: null,
  status: "active",
  notes: "",
});

function serviceToForm(s: CloudService): FormState {
  return {
    provider: s.provider,
    service_name: s.service_name,
    environment: s.environment ?? "_none",
    project_account: s.project_account ?? "",
    owner: s.owner ?? "",
    billing_model: s.billing_model ?? "_none",
    current_cost: s.current_cost != null ? String(s.current_cost) : "",
    currency: s.currency,
    billing_period: s.billing_period ?? "",
    next_billing_date: s.next_billing_date,
    status: s.status,
    notes: s.notes ?? "",
  };
}

function ServiceDialog({
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
              <Label htmlFor="cs-provider">Provider *</Label>
              <Input
                id="cs-provider"
                value={form.provider}
                onChange={(e) => set("provider", e.target.value)}
                required
                maxLength={80}
                placeholder="AWS, GCP, Azure…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-service">Service *</Label>
              <Input
                id="cs-service"
                value={form.service_name}
                onChange={(e) => set("service_name", e.target.value)}
                required
                maxLength={120}
                placeholder="EC2, Cloud Run, Blob Storage…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Select value={form.environment} onValueChange={(v) => set("environment", v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {ENVIRONMENTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cs-account">Account / project</Label>
              <Input
                id="cs-account"
                value={form.project_account}
                onChange={(e) => set("project_account", e.target.value)}
                maxLength={120}
                placeholder="Account ID, project name…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-owner">Owner</Label>
              <Input
                id="cs-owner"
                value={form.owner}
                onChange={(e) => set("owner", e.target.value)}
                maxLength={120}
                placeholder="Team or person responsible"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Billing model</Label>
              <Select value={form.billing_model} onValueChange={(v) => set("billing_model", v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {BILLING_MODELS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-period">Billing period</Label>
              <Input
                id="cs-period"
                value={form.billing_period}
                onChange={(e) => set("billing_period", e.target.value)}
                maxLength={80}
                placeholder="e.g. July 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cs-cost">Current cost</Label>
              <Input
                id="cs-cost"
                type="number"
                step="0.01"
                min="0"
                value={form.current_cost}
                onChange={(e) => set("current_cost", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-currency">Currency</Label>
              <Input
                id="cs-currency"
                value={form.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Next billing date</Label>
              <DatePicker
                value={form.next_billing_date}
                onChange={(v) => set("next_billing_date", v)}
                placeholder="No date"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="cs-notes">Notes</Label>
              <Textarea
                id="cs-notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                maxLength={500}
                placeholder="No secrets or credentials — use your cloud provider's secrets manager."
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

function CloudServices() {
  const { smRole, user } = useAuth();
  const isSuperAdmin = smRole === "super_admin";

  const [items, setItems] = useState<CloudService[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CloudService | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CloudService | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("sm_cloud_services")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as CloudService[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const formToInsert = (form: FormState, userId: string) => ({
    provider: form.provider.trim(),
    service_name: form.service_name.trim(),
    environment: form.environment === "_none" ? null : form.environment,
    project_account: form.project_account.trim() || null,
    owner: form.owner.trim() || null,
    billing_model: form.billing_model === "_none" ? null : form.billing_model,
    current_cost: form.current_cost ? Number(form.current_cost) : null,
    currency: form.currency || "USD",
    billing_period: form.billing_period.trim() || null,
    next_billing_date: form.next_billing_date || null,
    status: form.status,
    notes: form.notes.trim() || null,
    recorded_by: userId,
  });

  const handleCreate = async (form: FormState) => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("sm_cloud_services")
      .insert(formToInsert(form, user.id));
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "sm_cloud.created", entity_type: "sm_cloud_service", entity_id: "" });
    toast.success("Service added");
    setCreateOpen(false);
    load();
  };

  const handleEdit = async (form: FormState) => {
    if (!editing || !user) return;
    const { recorded_by: _, ...updatePayload } = formToInsert(form, user.id);
    void _;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("sm_cloud_services")
      .update(updatePayload)
      .eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "sm_cloud.updated", entity_type: "sm_cloud_service", entity_id: editing.id });
    toast.success("Service updated");
    setEditing(null);
    load();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDelBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("sm_cloud_services")
        .delete()
        .eq("id", confirmDelete.id);
      if (error) throw error;
      await logAction({ action: "sm_cloud.deleted", entity_type: "sm_cloud_service", entity_id: confirmDelete.id });
      toast.success("Service deleted");
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDelBusy(false);
    }
  };

  const totalCost = items.filter((s) => s.status === "active").reduce((sum, s) => sum + (s.current_cost ?? 0), 0);
  const active = items.filter((s) => s.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Stack Management
          </div>
          <h1 className="font-display text-3xl tracking-tight">Cloud</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cloud infrastructure inventory and cost tracking.
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
              <Plus className="h-4 w-4" /> Add service
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Active monthly cost</div>
          <div className="mt-1 font-display text-2xl">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalCost)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Active services</div>
          <div className="mt-1 font-display text-2xl">{active}</div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Total services</div>
          <div className="mt-1 font-display text-2xl">{items.length}</div>
        </Card>
      </div>

      {/* Services list */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Services ({items.length})
        </div>
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Cloud className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No cloud services tracked yet.</p>
            {isSuperAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add first service
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1fr,auto] sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.provider}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-sm">{s.service_name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_COLORS[s.status]}`}
                    >
                      {s.status}
                    </span>
                    {s.environment && (
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${ENV_COLORS[s.environment]}`}
                      >
                        {s.environment}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 font-mono text-xs text-muted-foreground">
                    {s.project_account && <span>{s.project_account}</span>}
                    {s.owner && <span>Owner: {s.owner}</span>}
                    {s.billing_model && <span>{s.billing_model.replace(/_/g, " ")}</span>}
                    {s.next_billing_date && (
                      <span>
                        Next: {format(new Date(s.next_billing_date + "T12:00:00"), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                  {s.notes && <p className="mt-0.5 text-xs text-muted-foreground">{s.notes}</p>}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-num text-sm font-semibold">
                      {fmtCost(s.current_cost, s.currency)}
                    </div>
                    {s.billing_period && (
                      <div className="font-mono text-[10px] text-muted-foreground">{s.billing_period}</div>
                    )}
                  </div>
                  {isSuperAdmin && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(s)}
                        className="text-muted-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(s)}
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
          <ServiceDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            initial={emptyForm()}
            title="Add cloud service"
            onSave={handleCreate}
          />
          {editing && (
            <ServiceDialog
              open={true}
              onOpenChange={(o) => !o && setEditing(null)}
              initial={serviceToForm(editing)}
              title="Edit cloud service"
              onSave={handleEdit}
            />
          )}
          <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Delete service</DialogTitle>
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
