import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Inbox, Plus, CheckCircle2, XCircle, Clock, Ban, Upload as UploadIcon, FileText } from "lucide-react";
import { AccessDenied } from "@/components/AccessDenied";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";
import { format } from "date-fns";

export const Route = createFileRoute("/requests")({
  component: () => <AppShell><RequestsGuard /></AppShell>,
});

function RequestsGuard() {
  const { role, permissions } = useAuth();
  if (role !== "super_admin" && !permissions.includes("requests")) return <AccessDenied icon={Inbox} />;
  return <Requests />;
}

const CATEGORIES = ["office_supplies", "travel", "meals", "transport", "utilities", "maintenance", "marketing", "other"];

type Req = {
  id: string; title: string; amount: number; currency: string;
  description: string | null; category: string; status: string;
  requested_by: string; reviewed_by: string | null; reviewed_at: string | null;
  review_comment: string | null; file_url: string | null; file_name: string | null;
  created_at: string;
};

type Inv = {
  id: string; invoice_number: string; vendor: string; amount: number;
  invoice_date: string; category: string; status: string; notes: string | null;
  file_url: string | null; file_name: string | null; uploaded_by: string;
  reviewed_by: string | null; reviewed_at: string | null; rejection_reason: string | null;
  locked: boolean; created_at: string;
};

type Item =
  | ({ _type: "request" } & Req)
  | ({ _type: "invoice" } & Inv);

// Normalize statuses for unified filtering
function displayStatus(item: Item): string {
  if (item._type === "request") return item.status;
  if (item.status === "submitted" || item.status === "under_review") return "pending";
  return item.status;
}

function StatusPill({ item }: { item: Item }) {
  const ds = displayStatus(item);
  const rawStatus = item._type === "invoice" ? item.status : item.status;
  const label = item._type === "invoice" && item.status === "under_review" ? "reviewing" : ds;
  const map: Record<string, { cls: string; icon: typeof Clock }> = {
    pending:   { cls: "bg-warning/15 text-warning",        icon: Clock },
    reviewing: { cls: "bg-primary/15 text-primary",        icon: Clock },
    approved:  { cls: "bg-success/15 text-success",        icon: CheckCircle2 },
    rejected:  { cls: "bg-destructive/15 text-destructive", icon: XCircle },
    cancelled: { cls: "bg-muted text-muted-foreground",    icon: Ban },
  };
  const { cls, icon: Icon } = map[label] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}>
      <Icon className="h-3 w-3" />{label}
    </span>
  );
}

function TypeBadge({ type }: { type: "request" | "invoice" }) {
  return type === "invoice"
    ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary"><FileText className="h-3 w-3" />invoice</span>
    : <span className="inline-flex items-center gap-1 rounded-full border border-tertiary/30 bg-tertiary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-tertiary"><Inbox className="h-3 w-3" />request</span>;
}

function Requests() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<Item | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");
  const [reviewComment, setReviewComment] = useState("");
  const [busy, setBusy] = useState(false);

  const canCreate = role === "admin";
  const canReview = role === "super_admin";

  const load = async () => {
    const [{ data: reqs }, { data: invs }] = await Promise.all([
      supabase.from("requests").select("*").order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
    ]);
    const combined: Item[] = [
      ...((reqs ?? []) as Req[]).map((r) => ({ ...r, _type: "request" as const })),
      ...((invs ?? []) as Inv[]).map((i) => ({ ...i, _type: "invoice" as const })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setItems(combined);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("requests-unified-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => displayStatus(i) === filter);
  }, [items, filter]);

  const submitReview = async () => {
    if (!reviewing || !user) return;
    setBusy(true);
    try {
      if (reviewing._type === "request") {
        const { error } = await supabase.from("requests").update({
          status: reviewDecision,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_comment: reviewComment || null,
        }).eq("id", reviewing.id);
        if (error) throw error;
        await logAction({
          action: `request.${reviewDecision}`,
          entity_type: "request", entity_id: reviewing.id,
          previous_state: { status: reviewing.status },
          new_state: { status: reviewDecision, comment: reviewComment },
        });
      } else {
        const { error } = await supabase.from("invoices").update({
          status: reviewDecision,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reviewDecision === "rejected" ? (reviewComment || null) : null,
          ...(reviewDecision === "approved" ? { locked: true } : {}),
        }).eq("id", reviewing.id);
        if (error) throw error;
        await logAction({
          action: `invoice.${reviewDecision}`,
          entity_type: "invoice", entity_id: reviewing.id,
          previous_state: { status: reviewing.status },
          new_state: { status: reviewDecision },
          metadata: { reason: reviewComment || null },
        });
      }
      toast.success(`${reviewing._type === "invoice" ? "Invoice" : "Request"} ${reviewDecision}`);
      setReviewing(null); setReviewComment("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const markUnderReview = async (inv: Inv & { _type: "invoice" }) => {
    const { data: { user: u } } = await supabase.auth.getUser();
    const { error } = await supabase.from("invoices").update({
      status: "under_review",
      reviewed_by: u?.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked under review");
    load();
  };

  const cancelRequest = async (r: Req & { _type: "request" }) => {
    if (!user || !confirm("Cancel this request?")) return;
    const { error } = await supabase.from("requests").update({ status: "cancelled" }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "request.cancelled", entity_type: "request", entity_id: r.id });
    toast.success("Request cancelled");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Approvals</div>
          <h1 className="font-display text-3xl tracking-tight">Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pending invoices and pre-spend requests awaiting approval.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating(true)} className="bg-gradient-primary text-primary-foreground">
            <Plus className="mr-1.5 h-4 w-4" /> New request
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "pending", "approved", "rejected", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
              filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No items {filter !== "all" ? `with status "${filter}"` : "yet"}.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((item) => {
              const title = item._type === "invoice"
                ? `${item.vendor} · ${item.invoice_number}`
                : item.title;
              const amount = item._type === "invoice"
                ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(item.amount))
                : `${Number(item.amount).toLocaleString()} ${item.currency}`;
              const ds = displayStatus(item);
              const isPending = ds === "pending";
              const isOwnRequest = item._type === "request" && item.requested_by === user?.id;

              return (
                <div key={`${item._type}-${item.id}`} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeBadge type={item._type} />
                        <span className="font-medium">{title}</span>
                        <StatusPill item={item} />
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {format(new Date(item.created_at), "MMM d, yyyy HH:mm")} · {item.category.replace(/_/g, " ")}
                      </div>
                      {item._type === "request" && item.description && (
                        <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                      )}
                      {item._type === "invoice" && item.notes && (
                        <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p>
                      )}
                      {item._type === "request" && item.review_comment && (
                        <p className="mt-2 rounded border-l-2 border-border pl-3 text-sm">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Decision note · </span>
                          {item.review_comment}
                        </p>
                      )}
                      {item._type === "invoice" && item.rejection_reason && (
                        <p className="mt-2 rounded border-l-2 border-destructive/50 pl-3 text-sm text-destructive">
                          {item.rejection_reason}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-num text-lg font-semibold">{amount}</div>
                      <div className="mt-2 flex justify-end gap-2">
                        {canReview && isPending && (
                          <>
                            {item._type === "invoice" && item.status === "submitted" && (
                              <Button size="sm" variant="outline" onClick={() => markUnderReview(item as Inv & { _type: "invoice" })}>
                                Under review
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReviewing(item);
                                setReviewDecision("approved");
                                setReviewComment("");
                              }}
                            >
                              Review
                            </Button>
                          </>
                        )}
                        {item._type === "invoice" && (
                          <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/invoices/$id", params: { id: item.id } })}>
                            Detail
                          </Button>
                        )}
                        {!canReview && item._type === "request" && isPending && isOwnRequest && (
                          <Button size="sm" variant="ghost" onClick={() => cancelRequest(item as Req & { _type: "request" })}>Cancel</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={load} />}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Review {reviewing?._type === "invoice" ? "invoice" : "request"}
            </DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TypeBadge type={reviewing._type} />
                </div>
                <div className="font-medium">
                  {reviewing._type === "invoice"
                    ? `${reviewing.vendor} · ${reviewing.invoice_number}`
                    : reviewing.title}
                </div>
                <div className="font-num text-2xl mt-1">
                  {reviewing._type === "invoice"
                    ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(reviewing.amount))
                    : `${Number(reviewing.amount).toLocaleString()} ${reviewing.currency}`}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Decision</Label>
                <Select value={reviewDecision} onValueChange={(v) => setReviewDecision(v as "approved" | "rejected")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approve</SelectItem>
                    <SelectItem value="rejected">Reject</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {reviewDecision === "rejected" ? "Rejection reason *" : "Comment (optional)"}
                </Label>
                <Textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  maxLength={500}
                  placeholder={reviewDecision === "rejected" ? "Explain why…" : "Additional context…"}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button
              onClick={submitReview}
              disabled={busy || (reviewDecision === "rejected" && !reviewComment)}
              className={reviewDecision === "approved" ? "bg-success text-success-foreground hover:opacity-90" : ""}
              variant={reviewDecision === "rejected" ? "destructive" : "default"}
            >
              {busy ? "Saving…" : reviewDecision === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("COP");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      let file_url: string | null = null;
      let file_name: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("requests").upload(path, file);
        if (upErr) throw upErr;
        file_url = path;
        file_name = file.name;
      }
      const { data, error } = await supabase.from("requests").insert({
        title: title.trim(),
        amount: Number(amount),
        currency,
        description: description || null,
        category: category as "office_supplies",
        file_url, file_name,
        requested_by: user.id,
        status: "pending",
      }).select().single();
      if (error) throw error;
      await logAction({
        action: "request.created",
        entity_type: "request", entity_id: data.id,
        new_state: { title, amount, currency, category },
      });
      toast.success("Request submitted for approval");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New pre-spend request</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120}
              placeholder="e.g. Buy office supplies from Éxito" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input id="amount" type="number" step="0.01" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Currency *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500}
              placeholder="Why is this needed? Vendor, links, context…" />
          </div>
          <div className="space-y-1.5">
            <Label>Supporting file (optional)</Label>
            <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-6 hover:border-primary">
              <UploadIcon className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : "Click to attach quote, screenshot or document"}
              </span>
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-gradient-primary text-primary-foreground">
              {busy ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
