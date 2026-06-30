import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "./index";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Download, Lock, CheckCircle2, XCircle, ClipboardList, Trash2, FileText, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/invoices/$id")({
  component: () => <AppShell><InvoiceDetail /></AppShell>,
});

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

type Inv = {
  id: string; invoice_number: string; amount: number; vendor: string;
  invoice_date: string; category: string; status: string; notes: string | null;
  file_url: string | null; file_name: string | null; uploaded_by: string;
  note_file_url: string | null; note_file_name: string | null;
  reviewed_by: string | null; reviewed_at: string | null; rejection_reason: string | null;
  locked: boolean; created_at: string;
};
type Log = { id: string; previous_status: string | null; new_status: string; comment: string | null; changed_by: string; created_at: string; };

function InvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [inv, setInv] = useState<Inv | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [noteSignedUrl, setNoteSignedUrl] = useState<string | null>(null);
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [noteUploading, setNoteUploading] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const { data: raw, error } = await supabase.from("invoices").select("*").eq("id", id).single();
      if (error) throw error;
      const data = raw as unknown as Inv;
      setInv(data);

      const { data: l } = await supabase.from("invoice_status_logs")
        .select("*").eq("invoice_id", id).order("created_at", { ascending: true });
      setLogs((l as Log[]) ?? []);

      if (data.file_url) {
        const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(data.file_url, 3600);
        setSignedUrl(signed?.signedUrl ?? null);
      }
      if (data.note_file_url) {
        const { data: noteSigned } = await supabase.storage.from("invoices").createSignedUrl(data.note_file_url, 3600);
        setNoteSignedUrl(noteSigned?.signedUrl ?? null);
      } else {
        setNoteSignedUrl(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load invoice");
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

  const uploadNote = async () => {
    if (!inv || !noteFile) return;
    setNoteUploading(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      const ext = noteFile.name.split(".").pop();
      const path = `${u?.id}/notes/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: storErr } = await supabase.storage.from("invoices").upload(path, noteFile);
      if (storErr) throw storErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("invoices") as any).update({
        note_file_url: path,
        note_file_name: noteFile.name,
      }).eq("id", inv.id);
      if (error) throw error;
      await logAction({
        action: "invoice.note_uploaded",
        entity_type: "invoice", entity_id: inv.id,
        metadata: { note_file_name: noteFile.name },
      });
      toast.success("Note attachment saved");
      setNoteFile(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setNoteUploading(false);
    }
  };

  const deleteInvoice = async () => {
    if (!inv) return;
    setDelBusy(true);
    try {
      await logAction({
        action: "invoice.deleted",
        entity_type: "invoice",
        entity_id: inv.id,
        previous_state: {
          invoice_number: inv.invoice_number,
          vendor: inv.vendor,
          amount: inv.amount,
          status: inv.status,
          category: inv.category,
          invoice_date: inv.invoice_date,
        },
      });
      const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
      if (error) throw error;
      toast.success("Invoice deleted");
      navigate({ to: "/invoices" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDelBusy(false);
    }
  };

  if (errorMsg) return <div className="p-12 text-center text-destructive">Error: {errorMsg}</div>;
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
              <div className="flex flex-col items-end gap-3">
                <div className="text-right">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Amount</div>
                  <div className="font-display text-3xl">{fmtCOP(Number(inv.amount))}</div>
                </div>
                {role === "super_admin" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete invoice
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Date" value={format(new Date(inv.invoice_date + "T12:00:00"), "MMM d, yyyy")} />
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

            {/* Note attachment */}
            <div className="mt-6 border-t pt-5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Note attachment</div>
              {noteSignedUrl && inv.note_file_name ? (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{inv.note_file_name}</span>
                  <a href={noteSignedUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" />Open</Button>
                  </a>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No note attachment yet.</p>
              )}

              {(role === "super_admin" || (!inv.locked && inv.uploaded_by === user?.id)) && (
                <div className="mt-3">
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-5 py-4 transition-colors ${noteFile ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-primary hover:bg-muted/40"}`}>
                    {noteFile ? (
                      <>
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="flex-1 truncate text-sm font-medium">{noteFile.name}</span>
                        <Button
                          type="button"
                          size="sm"
                          disabled={noteUploading}
                          onClick={(e) => { e.preventDefault(); uploadNote(); }}
                          className="shrink-0"
                        >
                          {noteUploading ? "Saving…" : "Save"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">
                          {inv.note_file_url ? "Replace note attachment" : "Add note attachment"} — photo, image or document
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.xlsx,.csv"
                      className="hidden"
                      onChange={(e) => setNoteFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              )}
            </div>
          </Card>

          {(!inv.locked && inv.status !== "approved") && role === "super_admin" && (
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
      <Dialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This invoice will be permanently deleted. The action will be recorded in the audit log.
            </p>
            <div className="rounded-lg border p-3 space-y-1">
              <div className="font-medium">{inv.vendor} · {inv.invoice_number}</div>
              <div className="font-mono text-sm text-muted-foreground">
                {fmtCOP(Number(inv.amount))} · {inv.invoice_date}
              </div>
              <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider">{inv.status}</div>
            </div>
            <p className="text-xs text-destructive">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteInvoice} disabled={delBusy}>
              {delBusy ? "Deleting…" : "Delete invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
