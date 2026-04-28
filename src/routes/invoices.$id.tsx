import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "./index";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download, Lock, CheckCircle2, XCircle, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/invoices/$id")({
  component: () => <AppShell><InvoiceDetail /></AppShell>,
});

type Inv = {
  id: string; invoice_number: string; amount: number; vendor: string;
  invoice_date: string; category: string; status: string; notes: string | null;
  file_url: string | null; file_name: string | null; uploaded_by: string;
  reviewed_by: string | null; reviewed_at: string | null; rejection_reason: string | null;
  locked: boolean; created_at: string;
};
type Log = { id: string; previous_status: string | null; new_status: string; comment: string | null; changed_by: string; created_at: string; };

function InvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [inv, setInv] = useState<Inv | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("invoices").select("*").eq("id", id).single();
    setInv(data as Inv);
    const { data: l } = await supabase.from("invoice_status_logs")
      .select("*").eq("invoice_id", id).order("created_at", { ascending: true });
    setLogs((l as Log[]) ?? []);
    if (data?.file_url) {
      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(data.file_url, 3600);
      setSignedUrl(signed?.signedUrl ?? null);
    }
  };

  useEffect(() => { load(); }, [id]);

  const setStatus = async (newStatus: "approved" | "rejected" | "under_review", rejectionReason?: string) => {
    if (!inv) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("invoices").update({
        status: newStatus,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason ?? null,
      }).eq("id", inv.id);
      if (error) throw error;
      await logAction({
        action: `invoice.${newStatus}`,
        entity_type: "invoice", entity_id: inv.id,
        previous_state: { status: inv.status }, new_state: { status: newStatus },
        metadata: { reason: rejectionReason ?? null, vendor: inv.vendor, amount: inv.amount },
      });
      toast.success(`Invoice ${newStatus}`);
      setReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!inv) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <button onClick={() => navigate({ to: "/invoices" })} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to invoices
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{inv.invoice_number}</div>
                <h1 className="mt-1 font-display text-2xl">{inv.vendor}</h1>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={inv.status} />
                  {inv.locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-tertiary/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-tertiary">
                      <Lock className="h-3 w-3" /> locked
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Amount</div>
                <div className="font-display text-3xl">${Number(inv.amount).toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Date" value={format(new Date(inv.invoice_date), "MMM d, yyyy")} />
              <Field label="Category" value={inv.category.replace(/_/g, " ")} />
              <Field label="Submitted" value={format(new Date(inv.created_at), "MMM d")} />
              <Field label="File" value={inv.file_name ?? "—"} />
            </div>

            {inv.notes && (
              <div className="mt-6">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Notes</div>
                <p className="mt-1 text-sm">{inv.notes}</p>
              </div>
            )}

            {inv.rejection_reason && (
              <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-destructive">Rejection reason</div>
                <p className="mt-1 text-sm">{inv.rejection_reason}</p>
              </div>
            )}

            {signedUrl && (
              <div className="mt-6">
                <a href={signedUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />Open file</Button>
                </a>
              </div>
            )}
          </Card>

          {role === "super_admin" && !inv.locked && inv.status !== "approved" && (
            <Card className="p-6">
              <h3 className="font-display text-lg">Review actions</h3>
              <p className="mt-1 text-sm text-muted-foreground">Approve to lock this record permanently. Rejection sends it back with a comment.</p>
              <Textarea
                value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Comment (required to reject)…" className="mt-4"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => setStatus("approved")} disabled={busy} className="bg-success text-success-foreground hover:opacity-90">
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                </Button>
                <Button onClick={() => setStatus("rejected", reason)} disabled={busy || !reason} variant="destructive">
                  <XCircle className="mr-1.5 h-4 w-4" /> Reject
                </Button>
                {inv.status === "submitted" && (
                  <Button onClick={() => setStatus("under_review")} disabled={busy} variant="outline">
                    Mark under review
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-lg">Audit trail</h3>
          </div>
          <div className="mt-4 space-y-4">
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No status changes yet.</p>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="relative border-l border-border pl-4">
                  <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {format(new Date(l.created_at), "MMM d, HH:mm")}
                  </div>
                  <div className="text-sm">
                    {l.previous_status ? `${l.previous_status} → ` : ""}<strong>{l.new_status}</strong>
                  </div>
                  {l.comment && <div className="mt-0.5 text-xs text-muted-foreground">"{l.comment}"</div>}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
