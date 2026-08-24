import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePicker } from "@/components/ui/date-picker";
import { logAction } from "@/lib/audit";
import { toast } from "sonner";
import { Search, ChevronRight, Info, Plus, Sparkles, Layers } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/stack-management/create")({
  validateSearch: z.object({ catalog: z.string().optional() }),
  component: CreateGuard,
});

function CreateGuard() {
  const { smRole } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (smRole !== null && smRole !== "super_admin") {
      navigate({ to: "/stack-management/subscriptions" });
    }
  }, [smRole, navigate]);
  if (smRole !== "super_admin") return null;
  return <CreatePage />;
}

// ─── Types ───────────────────────────────────────────────────────────────────
type CatalogEntry = {
  id: string; name: string; slug: string; provider: string | null;
  description: string | null; category: string; website: string | null;
  billing_models: string[]; is_custom: boolean;
};

const SM_CATEGORIES = [
  "AI", "Cloud", "Development", "Design", "Productivity",
  "Communication", "Education", "Security", "Analytics",
  "Finance", "HR", "Marketing", "Operations", "Other",
];

const BILLING_CYCLES = [
  { value: "monthly",       label: "Monthly" },
  { value: "quarterly",     label: "Quarterly" },
  { value: "semiannual",    label: "Semi-annual" },
  { value: "annual",        label: "Annual" },
  { value: "custom",        label: "Custom" },
  { value: "pay_as_you_go", label: "Pay as you go" },
];

const PAYMENT_METHODS = [
  { value: "petty_cash",     label: "Petty cash (COP)" },
  { value: "corporate_card", label: "Corporate card (USD)" },
];

const makeForm = (entry?: CatalogEntry) => ({
  name:                  entry?.name ?? "",
  vendor:                entry?.provider ?? "",
  billing_cycle:         "monthly",
  billing_interval_days: "",
  payment_method:        "petty_cash" as "petty_cash" | "corporate_card",
  amount:                "",
  auto_renewal:          true,
  next_billing_date:     new Date().toISOString().slice(0, 10),
  expiry_date:           "",
  renewal_date:          "",
  category:              entry?.category ?? "",
  service_url:           entry?.website ?? "",
  notes:                 "",
  license_count:         "",
  reminder_days_before:  [3, 7] as number[],
});

// ─── Category colors ──────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  AI:            "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  Cloud:         "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  Development:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Design:        "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  Productivity:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Communication: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Education:     "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Security:      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Analytics:     "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  Finance:       "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
  HR:            "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  Marketing:     "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400",
  Operations:    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  Other:         "bg-muted text-muted-foreground",
};

function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function AppLogo({ name, website }: { name: string; website: string | null }) {
  const [failed, setFailed] = useState(false);
  const domain = extractDomain(website);

  const words = name.split(/[\s-]/);
  const initials = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();

  // Google favicon service: reliable, always returns 200, no API key needed
  const src = domain && !failed
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    : null;

  if (src) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl overflow-hidden border border-border/40 bg-white dark:bg-neutral-800">
        <img
          src={src}
          alt={name}
          loading="lazy"
          className="h-8 w-8 object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold tracking-tight"
      style={{
        background: "color-mix(in oklab, var(--sm-primary) 15%, transparent)",
        color: "var(--sm-primary)",
      }}
    >
      {initials}
    </div>
  );
}

// ─── Custom catalog dialog ────────────────────────────────────────────────────
function CustomCatalogDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (entry: CatalogEntry) => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", provider: "", category: "Other", description: "", website: "" });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("sm_app_catalog").insert({
        name: form.name.trim(), slug,
        provider: form.provider.trim() || null,
        category: form.category,
        description: form.description.trim() || null,
        website: form.website.trim() || null,
        billing_models: [], is_custom: true, source: "user", created_by: user.id,
      }).select().single();
      if (error) throw error;
      toast.success("Custom app created");
      onCreated(data as CatalogEntry);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create custom app");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Custom application</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="ca-name">Application name *</Label>
            <Input id="ca-name" required value={form.name} onChange={e => set("name", e.target.value)} placeholder="My Custom App" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ca-provider">Provider / vendor</Label>
            <Input id="ca-provider" value={form.provider} onChange={e => set("provider", e.target.value)} placeholder="Company name" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={v => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SM_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ca-desc">Description</Label>
            <Textarea id="ca-desc" value={form.description} onChange={e => set("description", e.target.value)} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ca-url">Website</Label>
            <Input id="ca-url" type="url" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Subscription form ────────────────────────────────────────────────────────
function SubscriptionForm({
  entry, catalogId, onCreated,
}: {
  entry: CatalogEntry;
  catalogId: string;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(() => makeForm(entry));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));

  // Reset when entry changes
  useEffect(() => { setForm(makeForm(entry)); }, [entry.id]);

  const isCorporate = form.payment_method === "corporate_card";
  const isPayg = form.billing_cycle === "pay_as_you_go";

  const toggleReminder = (day: number) =>
    set("reminder_days_before", form.reminder_days_before.includes(day)
      ? form.reminder_days_before.filter(d => d !== day)
      : [...form.reminder_days_before, day].sort((a, b) => a - b));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!isPayg && !form.next_billing_date) { toast.error("Next billing date is required"); return; }
    setBusy(true);
    try {
      const currency = isCorporate ? "USD" : "COP";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("subscriptions").insert({
        name: form.name.trim(),
        vendor: form.vendor.trim() || null,
        amount: Number(form.amount),
        currency,
        billing_cycle: form.billing_cycle,
        billing_interval_days: form.billing_cycle === "custom" ? Number(form.billing_interval_days) : null,
        payment_method: form.payment_method,
        auto_renewal: form.auto_renewal,
        next_billing_date: isPayg ? null : form.next_billing_date,
        renewal_date: form.renewal_date || null,
        expiry_date: form.expiry_date || null,
        status: "active",
        category: form.category || null,
        service_url: form.service_url.trim() || null,
        notes: form.notes.trim() || null,
        reminder_days_before: form.reminder_days_before,
        license_count: form.license_count ? Number(form.license_count) : null,
        catalog_id: catalogId,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      await logAction({
        action: "subscription.created",
        entity_type: "subscription",
        entity_id: data.id,
        new_state: { name: form.name, catalog_id: catalogId, billing_cycle: form.billing_cycle },
      });
      toast.success("Subscription created");
      onCreated(data.id as string);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create subscription");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* App header */}
      <div className="flex items-center gap-3 pb-2">
        <AppLogo name={entry.name} website={entry.website} />
        <div className="min-w-0">
          <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${CAT_COLORS[entry.category] ?? CAT_COLORS.Other}`}>
            {entry.category}
          </span>
          <div className="mt-0.5 truncate font-display text-base font-semibold leading-tight">{entry.name}</div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-name">Service name *</Label>
        <Input id="sf-name" required value={form.name} onChange={e => set("name", e.target.value)} maxLength={100} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-vendor">Vendor</Label>
        <Input id="sf-vendor" value={form.vendor} onChange={e => set("vendor", e.target.value)} maxLength={100} />
      </div>

      <div className="space-y-1.5">
        <Label>Payment method *</Label>
        <Select value={form.payment_method} onValueChange={v => set("payment_method", v as "petty_cash" | "corporate_card")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Billing cycle *</Label>
        <Select value={form.billing_cycle} onValueChange={v => set("billing_cycle", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{BILLING_CYCLES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {form.billing_cycle === "custom" && (
        <div className="space-y-1.5">
          <Label htmlFor="sf-interval">Every N days *</Label>
          <Input id="sf-interval" type="number" min="1" value={form.billing_interval_days} onChange={e => set("billing_interval_days", e.target.value)} required />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="sf-amount">Amount ({isCorporate ? "USD" : "COP"}) *</Label>
          {isCorporate && (
            <TooltipProvider><Tooltip>
              <TooltipTrigger asChild><Info className="h-3.5 w-3.5 cursor-default text-muted-foreground" /></TooltipTrigger>
              <TooltipContent><p>Not deducted from petty cash</p></TooltipContent>
            </Tooltip></TooltipProvider>
          )}
        </div>
        <Input id="sf-amount" type="number" step="0.01" min="0" required value={form.amount} onChange={e => set("amount", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-licenses">Total licenses / seats</Label>
        <Input id="sf-licenses" type="number" min="1" value={form.license_count} onChange={e => set("license_count", e.target.value)} placeholder="Optional" />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div>
          <div className="text-sm font-medium">Auto-renewal</div>
          <div className="text-xs text-muted-foreground">Renews automatically each period</div>
        </div>
        <Switch checked={form.auto_renewal} onCheckedChange={v => set("auto_renewal", v)} />
      </div>

      {!isPayg && (
        <div className="space-y-1.5">
          <Label>Next billing date *</Label>
          <DatePicker value={form.next_billing_date} onChange={v => set("next_billing_date", v ?? "")} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Expiry date</Label>
        <DatePicker value={form.expiry_date} onChange={v => set("expiry_date", v ?? "")} placeholder="No expiry" />
      </div>

      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={form.category || "_none"} onValueChange={v => set("category", v === "_none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">None</SelectItem>
            {SM_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-url">Service URL</Label>
        <Input id="sf-url" type="url" value={form.service_url} onChange={e => set("service_url", e.target.value)} placeholder="https://" />
      </div>

      <div className="space-y-2">
        <Label>Reminders (days before billing)</Label>
        <div className="flex gap-2">
          {[1, 3, 7, 14].map(d => (
            <button key={d} type="button" onClick={() => toggleReminder(d)}
              className={`rounded-full px-3 py-1 font-mono text-xs font-semibold transition-colors ${
                form.reminder_days_before.includes(d)
                  ? "bg-[var(--sm-primary)] text-[var(--sm-primary-fg)]"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-notes">Notes</Label>
        <Textarea id="sf-notes" value={form.notes} onChange={e => set("notes", e.target.value)} maxLength={500} />
      </div>

      <Button
        type="submit"
        disabled={busy}
        className="w-full"
        style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
      >
        {busy ? "Creating…" : "Create subscription"}
      </Button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function CreatePage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("sm_app_catalog").select("*").eq("is_active", true).order("name");
      setCatalog((data as CatalogEntry[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = catalog.filter(e =>
    (catFilter === "All" || e.category === catFilter) &&
    (q === "" || e.name.toLowerCase().includes(q.toLowerCase()) || (e.provider ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  const selectEntry = (entry: CatalogEntry) => {
    setSelected(entry);
    setSelectedCatalogId(entry.id);
  };

  return (
    // Escape shell padding to fill the full content area
    <div className="flex -mx-4 -my-6 sm:-mx-6 lg:-mx-8 h-[calc(100vh-64px)] overflow-hidden">

      {/* ── LEFT: Form panel ── */}
      <div className="w-[400px] shrink-0 flex flex-col border-r border-border overflow-y-auto bg-background">
        {selected && selectedCatalogId ? (
          <div className="p-6">
            <SubscriptionForm
              entry={selected}
              catalogId={selectedCatalogId}
              onCreated={(id) => navigate({ to: "/stack-management/subscriptions/$id", params: { id } })}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl sm-icon-bg">
              <Layers className="h-7 w-7 sm-icon-fg" />
            </div>
            <div className="space-y-1">
              <p className="font-display text-lg">Select an application</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Click any app in the directory to configure its subscription details.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Or add a custom app
            </Button>
          </div>
        )}
      </div>

      {/* ── RIGHT: Directory panel ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* Sticky header: title + search + pills */}
        <div className="shrink-0 border-b border-border bg-background px-6 pt-5 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Directory</p>
              <h1 className="font-display text-2xl tracking-tight">Create Subscription</h1>
            </div>
            <Button variant="outline" onClick={() => setCustomOpen(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> Other / Custom
            </Button>
          </div>

          {/* Search bar — full width */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search applications…"
              className="pl-9"
            />
          </div>

          {/* Category pills — wrap, no horizontal scroll */}
          <div className="flex flex-wrap gap-1.5">
            {["All", ...SM_CATEGORIES].map(cat => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`rounded-full px-3 py-1 font-mono text-xs font-semibold transition-colors ${
                  catFilter === cat
                    ? "bg-[var(--sm-primary)] text-[var(--sm-primary-fg)]"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-[88px] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No applications match your search.</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => setCustomOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add custom application
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(entry => {
                const isActive = selected?.id === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectEntry(entry)}
                    className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive
                        ? "border-[var(--sm-primary)] shadow-sm"
                        : "border-border bg-card hover:border-[var(--sm-primary)]/40 hover:shadow-md hover:-translate-y-0.5"
                    }`}
                    style={isActive ? {
                      background: "color-mix(in oklab, var(--sm-primary) 6%, var(--background))",
                    } : undefined}
                  >
                    <AppLogo name={entry.name} website={entry.website} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <div className="truncate font-medium text-sm leading-tight">{entry.name}</div>
                        {isActive ? (
                          <div
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full"
                            style={{ background: "var(--sm-primary)" }}
                          />
                        ) : (
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </div>
                      {entry.provider && (
                        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground truncate">{entry.provider}</div>
                      )}
                      <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${CAT_COLORS[entry.category] ?? CAT_COLORS.Other}`}>
                        {entry.category}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CustomCatalogDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        onCreated={(entry) => {
          setCatalog(c => [...c, entry]);
          selectEntry(entry);
        }}
      />
    </div>
  );
}
