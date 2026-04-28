import { createFileRoute } from "@tanstack/react-router";
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
import { Inbox, Plus, CheckCircle2, XCircle, Clock, Ban, Upload as UploadIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";
import { format } from "date-fns";

export const Route = createFileRoute("/requests")({
  component: () => <AppShell><Requests /></AppShell>,
});

const CATEGORIES = ["office_supplies", "travel", "meals", "transport", "utilities", "maintenance", "marketing", "other"];

type Req = {
  id: string; title: string; amount: number; currency: string;
  description: string | null; category: string; status: string;
  requested_by: string; reviewed_by: string | null; reviewed_at: string | null;
  review_comment: string | null; file_url: string | null; file_name: string | null;
  created_at: string;
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: typeof Clock }> = {
    pending: { cls: "bg-warning/15 text-warning", icon: Clock },
    approved: { cls: "bg-success/15 text-success", icon: CheckCircle2 },
    rejected: { cls: "bg-destructive/15 text-destructive", icon: XCircle },
    cancelled: { cls: "bg-muted text-muted-foreground", icon: Ban },
  };
  const { cls, icon: Icon } = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function Requests() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<Req[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<Req | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");
  const [reviewComment, setReviewComment] = useState("");

  const canCreate = role === "super_admin" || role === "admin_uploader";
  const canReview = role === "super_admin";

  const load = () => {
    supabase.from("requests").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setItems((data as Req[]) ?? []));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("requests-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(
    () => filter === "all" ? items : items.filter((r) => r.status === filter),
    [items, filter]
  );

  const submitReview = async () => {
    if (!reviewing || !user) return;
    try {
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
      toast.success(`Request ${reviewDecision}`);
      setReviewing(null); setReviewComment("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const cancelOwn = async (r: Req) => {
    if (!user) return;
    if (!confirm("Cancel this request?")) return;
    const { error } = await supabase.from("requests").update({ status: "cancelled" }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "request.cancelled", entity_type: "request", entity_id: r.id });
    toast.success("Request cancelled");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Pre-spend</div>
          <h1 className="font-display text-3xl tracking-tight">Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit purchase or spending requests for approval before the expense occurs.
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
            <p className="mt-3 text-sm text-muted-foreground">No requests {filter !== "all" ? `with status ${filter}` : "yet"}.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "MMM d, yyyy HH:mm")} · {r.category.replace(/_/g, " ")}
                    </div>
                    {r.description && <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>}
                    {r.review_comment && (
                      <p className="mt-2 rounded border-l-2 border-border pl-3 text-sm">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Decision note · </span>
                        {r.review_comment}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-num text-lg font-semibold">{Number(r.amount).toLocaleString()} {r.currency}</div>
                    <div className="mt-2 flex justify-end gap-2">
                      {canReview && r.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => { setReviewing(r); setReviewDecision("approved"); setReviewComment(""); }}>
                          Review
                        </Button>
                      )}
                      {!canReview && r.status === "pending" && r.requested_by === user?.id && (
                        <Button size="sm" variant="ghost" onClick={() => cancelOwn(r)}>Cancel</Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={load} />}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review request</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4">
              <div>
                <div className="font-medium">{reviewing.title}</div>
                <div className="font-num text-2xl">{Number(reviewing.amount).toLocaleString()} {reviewing.currency}</div>
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
                <Label>Comment</Label>
                <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} maxLength={500} placeholder="Reason or context…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button onClick={submitReview} className="bg-gradient-primary text-primary-foreground">Submit decision</Button>
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
          <DialogTitle>New request</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120}
              placeholder="e.g. Buy 100 USD in Claude credits" />
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
